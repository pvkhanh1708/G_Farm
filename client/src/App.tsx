import { useCallback, useEffect, useRef, useState } from 'react';
import { sfx } from './game/audio/sfx';
import { CROP_ORDER, CROPS, CropId, ItemId, itemDef, Quality } from './game/config';
import { Game } from './game/Game';
import { serverNow } from './game/net/clock';
import { sync } from './game/net/sync';
import { pwa } from './game/pwa';
import { growthProgress, store, TileState } from './game/state/store';
import { bump, FxLayer, fxBus } from './ui/FxLayer';
import { BottomBar, FpsMeter, ToolBanner, TopBar, useGameState } from './ui/Hud';
import { SproutIcon } from './ui/icons';
import { AccountPopup, InstallPopup, Inventory, LevelsPopup, LevelUpPopup, SeedShop, Settings, UnlockPopup } from './ui/Popups';
import { NetBadge } from './ui/NetBadge';
import { GameRoom } from './ui/GameRoom';
import { AnimalsPopup, animalReady, claimableCount, LeaderboardPopup, LoginRewardPopup, OrdersPopup, QuestsPopup, UpgradesPopup, animalHungry, useNow } from './ui/Progress';
import { MoreMenu, SideButtons } from './ui/SideButtons';
import { VisitBar } from './ui/VisitBar';
import type { NeighbourFarm } from './game/net/farm';
import { finishedJobs, WorkshopPopup } from './ui/Workshop';
import { NeighborsPopup } from './ui/Neighbors';
import { music } from './game/audio/music';
import { farmApi, FarmError } from './game/net/farm';
import { TileOverlays } from './ui/TileOverlays';
import { formatNum } from './ui/format';

type Popup = { type: 'shop'; tile: number | null; bulk?: boolean } | { type: 'inventory' } | { type: 'unlock' } | { type: 'settings' } | { type: 'levels' } | { type: 'account' } | { type: 'install' } | { type: 'room' } | { type: 'upgrades' } | { type: 'orders' } | { type: 'quests' } | { type: 'login' } | { type: 'animals' } | { type: 'ranks' } | { type: 'workshop' } | { type: 'neighbors' } | { type: 'more' } | null;

const PREFS_KEY = 'farm-empire:prefs';
function loadPrefs(): { quality: Quality; sound: boolean; music: boolean; fps: boolean } {
  const mobile = matchMedia('(pointer: coarse)').matches || Math.min(screen.width, screen.height) < 700;
  const def = { quality: (mobile ? 'medium' : 'high') as Quality, sound: true, music: true, fps: false };
  try {
    return { ...def, ...JSON.parse(localStorage.getItem(PREFS_KEY) || '{}') };
  } catch {
    return def;
  }
}

function counts(tiles: TileState[]) {
  const now = serverNow();
  let ready = 0, empty = 0, growing = 0;
  for (const t of tiles) {
    if (!t.unlocked) continue;
    if (!t.crop) empty++;
    else if (growthProgress(t, now) >= 1) ready++;
    else growing++;
  }
  return { ready, empty, growing };
}

export function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [game, setGame] = useState<Game | null>(null);
  const [progress, setProgress] = useState({ k: 0, label: 'Đang tải…' });
  const [popup, setPopup] = useState<Popup>(null);
  const [tool, setTool] = useState<CropId | null>(null);
  const [overview, setOverview] = useState(false);
  const [prefs, setPrefs] = useState(loadPrefs);
  /** The neighbour's farm being visited (shown in place of ours). */
  const [visiting, setVisiting] = useState<NeighbourFarm | null>(null);
  /** The visit tool picked in the top bar: a swipe steals / waters every crop it crosses. */
  const [visitTool, setVisitTool] = useState<'steal' | 'help' | null>(null);
  /** Neighbour actions go to the server one at a time (a swipe fires many). */
  const visitQueue = useRef(Promise.resolve());
  const toolRef = useRef(tool);
  toolRef.current = tool;
  useEffect(() => {
    if (game) game.sowTool = tool;
  }, [game, tool]);
  const s = useGameState();
  /** Server clock, ticking every few seconds for the badges. */
  const clock = useNow(3000);
  const tiles = store.tiles();
  const showcase = new URLSearchParams(location.search).has('showcase');
  const [levelUp, setLevelUp] = useState<number | null>(null);
  /** Growing tile whose progress + dig actions are shown (hidden by default). */
  const [revealed, setRevealed] = useState<number | null>(null);
  useEffect(() => {
    if (revealed === null) return;
    const t = setTimeout(() => setRevealed(null), 6000);
    return () => clearTimeout(t);
  }, [revealed]);
  const [netReady, setNetReady] = useState(false);
  const seenLevel = useRef(s.level);
  useEffect(() => {
    // celebrate once per new level reached by playing (several at once show the highest);
    // server snapshots and resets move the level silently
    if (s.level > seenLevel.current && store.lastChange === 'action') {
      sfx.unlock();
      setLevelUp(s.level);
    }
    seenLevel.current = s.level;
  }, [s.level]);

  useEffect(() => {
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
    } catch {
      /* ignore */
    }
    sfx.setEnabled(prefs.sound);
    music.setEnabled(prefs.music);
  }, [prefs]);

  // today's login gift pops up once per session, after loading
  const loginShown = useRef(false);
  useEffect(() => {
    if (loginShown.current || !netReady || !game || showcase || !s.daily || s.daily.loginClaimed) return;
    loginShown.current = true;
    const t = setTimeout(() => setPopup((p) => p ?? { type: 'login' }), 900);
    return () => clearTimeout(t);
  }, [netReady, game, s.daily, showcase]);

  useEffect(() => {
    sync.onReject = (msg) => fxBus.toast(msg, 'bad');
    if (showcase) setNetReady(true);
    else void sync.boot().then(() => setNetReady(true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    let g: Game | null = null;
    let cancelled = false;
    Game.create(canvasRef.current!, prefs.quality, (k, label) => setProgress({ k, label }), { showcase }).then((created) => {
      if (cancelled) return created.dispose();
      g = created;
      // debug handles for the screenshot/flow scripts
      Object.assign(window, import.meta.env.DEV ? { __game: created, __store: store } : { __game: created });
      setGame(created);
    });
    return () => {
      cancelled = true;
      g?.dispose();
    };
    // quality changes are applied live via setQuality
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const plantAt = useCallback(
    (g: number, crop: CropId) => {
      if (!game) return false;
      const res = game.plant(g, crop);
      if (!res.ok) {
        fxBus.toast(res.reason, 'bad');
        return false;
      }
      const p = game.tileAnchor(g, 0.5);
      fxBus.float(p.x, p.y, `-${formatNum(CROPS[crop].seedPrice)}`, { type: 'coin' });
      return true;
    },
    [game],
  );

  const plantAll = useCallback(
    (crop: CropId) => {
      if (!game) return;
      const res = game.plantAll(crop);
      if (!res.ok) return fxBus.toast(res.reason, 'bad');
      const n = res.value.length;
      fxBus.toast(`Đã gieo ${CROPS[crop].name.toLowerCase()} cho ${n} ô · -${formatNum(n * CROPS[crop].seedPrice)} xu`, 'good');
    },
    [game],
  );

  const visitRef = useRef(visiting);
  visitRef.current = visiting;
  /** One steal / water on the visited farm; resolves when the server answered. */
  const visitAct = (e: { g: number; action: 'steal' | 'help'; x: number; y: number }): Promise<void> => {
    const farm = visitRef.current;
    if (!farm) return Promise.resolve();
    if (e.action === 'steal') {
      return farmApi.steal(farm.id, e.g).then(
        (res) => {
          setVisiting(res.farm);
          visitRef.current = res.farm;
          if (res.caught) {
            sfx.error();
            fxBus.toast(`Gâu gâu! Bị chó bắt, nộp phạt ${formatNum(res.fine)} xu`, 'bad');
          } else if (res.qty === 0) {
            // a miss: the tile is closed all the same
            sfx.tap();
            fxBus.float(e.x, e.y - 20, 'Trộm hụt!', { type: 'xp' });
          } else {
            sfx.harvest();
            game?.stolen(e.g);
            fxBus.float(e.x, e.y - 20, `+${formatNum(res.qty)}`, { type: 'crop', crop: res.crop });
            fxBus.fly({ type: 'crop', crop: res.crop }, { x: e.x, y: e.y }, 'inventory', Math.min(res.qty, 4), () => bump('inventory'));
          }
        },
        (err) => fxBus.toast(err instanceof FarmError ? err.message : 'Có lỗi xảy ra', 'bad'),
      );
    }
    return farmApi.help(farm.id, e.g).then(
      (res) => {
        setVisiting(res.farm);
        visitRef.current = res.farm;
        sfx.plant();
        game?.puff([e.g]);
        fxBus.float(e.x, e.y - 20, `+${res.xp} XP`, { type: 'xp' });
        fxBus.fly({ type: 'coin' }, { x: e.x, y: e.y }, 'coins', 3, () => bump('coins'));
      },
      (err) => fxBus.toast(err instanceof FarmError ? err.message : 'Có lỗi xảy ra', 'bad'),
    );
  };

  useEffect(() => {
    if (!game) return;
    return game.on((e) => {
      if (e.type === 'tileTap') setRevealed(null);
      if (e.type === 'tileTap') {
        // any wild tile buys the next one in order (tiles open strictly in sequence)
        if (e.kind === 'next' || e.kind === 'locked') {
          sfx.open();
          setPopup({ type: 'unlock' });
        } else if (e.kind === 'empty') {
          const t = toolRef.current;
          if (t) {
            if (!plantAt(e.g, t) && store.getState().coins < CROPS[t].seedPrice) setTool(null);
          } else {
            sfx.open();
            setPopup({ type: 'shop', tile: e.g });
          }
        } else {
          // growing: show this tile's progress and dig actions (tap again to hide)
          setRevealed((r) => (r === e.g ? null : e.g));
          return;
        }
      } else if (e.type === 'buildingTap') {
        sfx.open();
        setPopup({ type: e.kind === 'pens' ? 'animals' : e.kind });
      } else if (e.type === 'visitTap') {
        visitQueue.current = visitQueue.current.then(() => visitAct(e));
      } else if (e.type === 'stationTap') {
        if (e.kind === 'product') {
          // the egg nest / milk can collects every ready product of that pen
          const which = store.getState().animals.flatMap((a, i) => (a.type === e.pen && animalReady(a) ? [i] : []));
          farmApi.collect(which).then(
            (res) => {
              sfx.collect();
              fxBus.float(e.x, e.y - 20, `+${res.collected} · +${res.xp} XP`, { type: 'xp' });
              fxBus.fly({ type: 'xp' }, { x: e.x, y: e.y }, 'level', 2, () => bump('level'));
              fxBus.fly({ type: 'coin' }, { x: e.x, y: e.y }, 'inventory', Math.min(res.collected, 4), () => bump('inventory'));
            },
            (err) => fxBus.toast(err instanceof FarmError ? err.message : 'Có lỗi xảy ra', 'bad'),
          );
        } else if (e.kind === 'water') {
          farmApi.water(e.pen).then(
            () => {
              sfx.plant();
              fxBus.float(e.x, e.y - 20, 'Đầy nước!', { type: 'xp' });
            },
            (err) => fxBus.toast(err instanceof FarmError ? err.message : 'Có lỗi xảy ra', 'bad'),
          );
        } else {
          const which = store.getState().animals.flatMap((a, i) => (a.type === e.pen && animalHungry(a) ? [i] : []));
          if (!which.length) return fxBus.toast('Không con nào đói', 'info');
          farmApi.feed(which).then(
            (res) => {
              sfx.plant();
              fxBus.float(e.x, e.y - 20, `Cho ${res.fed} con ăn`, { type: 'xp' });
            },
            (err) => fxBus.toast(err instanceof FarmError ? err.message : 'Có lỗi xảy ra', 'bad'),
          );
        }
      } else if (e.type === 'animalTap') {
        const a = store.getState().animals[e.index];
        if (a && animalHungry(a)) {
          // a hungry animal eats from the barn
          farmApi.feed([e.index]).then(
            () => {
              sfx.plant();
              fxBus.float(e.x, e.y - 20, 'Măm măm!', { type: 'xp' });
            },
            (err) => fxBus.toast(err instanceof FarmError ? err.message : 'Có lỗi xảy ra', 'bad'),
          );
          return;
        }
        sfx.tap();
        setPopup({ type: 'animals' });
      } else if (e.type === 'view') {
        setOverview(e.overview);
      } else if (e.type === 'harvested') {
        fxBus.float(e.x, e.y - 20, `+${formatNum(e.amount)}`, { type: 'crop', crop: e.crop });
        fxBus.float(e.x + 46, e.y + 14, `+${formatNum(e.xp)} XP`, { type: 'xp' });
        if (!e.bulk) fxBus.fly({ type: 'xp' }, { x: e.x, y: e.y }, 'level', 2, () => bump('level'));
        fxBus.fly({ type: 'crop', crop: e.crop }, { x: e.x, y: e.y }, 'inventory', e.bulk ? 2 : Math.min(e.amount, 6), () => {
          if (!e.bulk) sfx.collect();
          bump('inventory');
        });
      }
    });
  }, [game, plantAt]);

  const sell = (crop: ItemId, qty: number, from: DOMRect) => {
    const res = store.sell(crop, qty);
    if (!res.ok) return fxBus.toast(res.reason, 'bad');
    sfx.coin();
    const origin = { x: from.left + from.width / 2, y: from.top + from.height / 2 };
    fxBus.fly({ type: 'coin' }, origin, 'coins', Math.min(10, Math.max(3, Math.ceil(res.value / 6))), () => {
      sfx.coinTick();
      bump('coins');
    });
    fxBus.float(origin.x, origin.y - 30, `+${formatNum(res.value)}`, { type: 'coin' });
    fxBus.toast(`Đã bán ${formatNum(qty)} ${itemDef(crop).name.toLowerCase()} · +${formatNum(res.value)} xu`, 'good');
  };

  useEffect(() => {
    game?.setVisit(visiting);
  }, [game, visiting]);
  useEffect(() => {
    if (game) game.visitTool = visiting ? visitTool : null;
    if (!visiting) setVisitTool(null);
  }, [game, visiting, visitTool]);
  /** Go to a neighbour's farm (from the neighbours list, the news log or the leaderboard). */
  const goVisit = (id: number) => {
    setPopup(null);
    setTool(null);
    setRevealed(null);
    farmApi.visit(id).then(
      (f) => (sfx.open(), setVisiting(f)),
      (err) => fxBus.toast(err instanceof FarmError ? err.message : 'Không mở được nông trại', 'bad'),
    );
  };

  const close = () => {
    sfx.close();
    setPopup(null);
  };

  const loading = progress.k < 1 || !game || !netReady;
  const c = counts(tiles);

  return (
    <div className="app" onPointerDown={() => (sfx.resume(), music.resume())}>
      <canvas ref={canvasRef} className="scene" />
      {game && !showcase && visiting && <VisitBar farm={visiting} tool={visitTool} onTool={(t) => (sfx.tap(), setVisitTool((cur) => (cur === t ? null : t)))} onHome={() => (sfx.close(), setVisiting(null))} />}
      {game && !showcase && !visiting && (
        <>
          <TileOverlays
            game={game}
            revealed={revealed}
            onUnlock={() => (sfx.open(), setPopup({ type: 'unlock' }))}
            onDig={(tiles, label) => {
              setRevealed(null);
              const res = game.dig(tiles);
              if (!res.ok) fxBus.toast(res.reason, 'bad');
              else fxBus.toast(res.value.length > 1 ? `Đã đào ${res.value.length} ô ${label}` : `Đã đào ${label}`, 'info');
            }}
            onFertilize={(tiles) => {
              setRevealed(null);
              farmApi.fertilize(tiles).then(
                (res) => {
                  sfx.plant();
                  game.puff(res.fertilized);
                  fxBus.toast(`Đã bón phân ${res.fertilized.length} ô · cây lớn nhanh gấp đôi`, 'good');
                },
                (err) => fxBus.toast(err instanceof FarmError ? err.message : 'Có lỗi xảy ra', 'bad'),
              );
            }}
          />
          <TopBar onSettings={() => (sfx.open(), setPopup({ type: 'settings' }))} onLevel={() => (sfx.open(), setPopup({ type: 'levels' }))} />
          <BottomBar
            readyCount={c.ready}
            emptyCount={c.empty}
            overview={overview}
            onShop={() => (sfx.open(), setPopup({ type: 'shop', tile: null }))}
            onInventory={() => (sfx.open(), setPopup({ type: 'inventory' }))}
            onHarvestAll={() => {
              if (!game.harvestAll()) fxBus.toast('Chưa có cây nào chín', 'info');
            }}
            onPlantAll={() => {
              if (!c.empty) return fxBus.toast('Không còn ô đất trống', 'info');
              if (tool) plantAll(tool);
              else (sfx.open(), setPopup({ type: 'shop', tile: null, bulk: true }));
            }}
            onOverview={() => (sfx.tap(), setOverview(game.toggleOverview()))}
          />
          <SideButtons
            quests={claimableCount(s.daily)}
            orders={s.orders.filter((o) => Object.entries(o.items).every(([id, n]) => (s.inventory[id as ItemId] ?? 0) >= (n ?? 0))).length}
            more={s.news}
            onOpen={(type) => (sfx.open(), setPopup({ type }))}
            onMore={() => (sfx.open(), setPopup({ type: 'more' }))}
          />
          {tool ? <ToolBanner seed={tool} onCancel={() => (sfx.tap(), setTool(null))} /> : null}
          {prefs.fps && <FpsMeter game={game} />}
          <NetBadge />
        </>
      )}
      {game && showcase && <div className="showcase-legend">{CROP_ORDER.filter((k) => !location.search.includes('showcase=') || location.search.includes(k)).map((k) => CROPS[k].name).join(' / ')} · giai đoạn 0 → 4</div>}
      <FxLayer />

      {popup?.type === 'shop' && (
        <SeedShop
          tile={popup.tile}
          bulkCount={popup.bulk ? c.empty : 0}
          onClose={close}
          onPick={(crop) => {
            if (popup.bulk) plantAll(crop);
            else if (popup.tile !== null) {
              if (plantAt(popup.tile, crop)) setTool(crop);
            } else {
              sfx.tap();
              setTool(crop);
            }
            setPopup(null);
          }}
        />
      )}
      {popup?.type === 'inventory' && <Inventory onClose={close} onSell={sell} />}
      {popup?.type === 'levels' && <LevelsPopup onClose={close} />}
      {popup?.type === 'room' && <GameRoom onClose={close} />}
      {popup?.type === 'upgrades' && <UpgradesPopup onClose={close} />}
      {popup?.type === 'orders' && <OrdersPopup onClose={close} />}
      {popup?.type === 'quests' && <QuestsPopup onClose={close} />}
      {popup?.type === 'login' && <LoginRewardPopup onClose={close} />}
      {popup?.type === 'animals' && <AnimalsPopup onClose={close} />}
      {popup?.type === 'ranks' && <LeaderboardPopup onClose={close} onVisit={goVisit} />}
      {popup?.type === 'more' && (
        <MoreMenu
          badges={{ neighbors: s.news, animals: s.animals.filter((a) => animalReady(a, clock) || animalHungry(a)).length, workshop: finishedJobs(s, clock) }}
          onOpen={(type) => setPopup({ type })}
          onClose={close}
        />
      )}
      {popup?.type === 'workshop' && <WorkshopPopup onClose={close} />}
      {popup?.type === 'neighbors' && <NeighborsPopup onVisit={goVisit} onClose={close} />}
      {popup?.type === 'install' && <InstallPopup onClose={close} />}
      {popup?.type === 'account' && (
        <AccountPopup
          onClose={close}
          onSwitched={() => {
            setTool(null);
            setPopup(null);
            game?.focusCurrent();
          }}
        />
      )}
      {popup?.type === 'unlock' && (
        <UnlockPopup
          onClose={close}
          onConfirm={() => {
            const res = game!.unlockNext();
            if (!res.ok) fxBus.toast(res.reason, 'bad');
            else fxBus.toast('Đã mở ô đất mới!', 'good');
            setPopup(null);
          }}
        />
      )}
      {popup?.type === 'settings' && game && (
        <Settings
          quality={prefs.quality}
          onQuality={(q) => {
            game.setQuality(q);
            setPrefs({ ...prefs, quality: q });
          }}
          sound={prefs.sound}
          onSound={(on) => setPrefs({ ...prefs, sound: on })}
          music={prefs.music}
          onMusic={(on) => {
            sfx.resume();
            setPrefs({ ...prefs, music: on });
          }}
          fps={prefs.fps}
          onFps={(on) => setPrefs({ ...prefs, fps: on })}
          onAccount={() => setPopup({ type: 'account' })}
          onInstall={() => {
            // Android/Chrome: open the real install dialog; otherwise show the manual steps
            if (pwa.canPrompt) void pwa.prompt().then((ok) => ok && setPopup(null));
            else setPopup({ type: 'install' });
          }}
          onClose={close}
        />
      )}

      {levelUp !== null && !showcase && (
        <LevelUpPopup
          level={levelUp}
          onClose={() => {
            sfx.close();
            setLevelUp(null);
          }}
        />
      )}

      {loading && (
        <div className={`loading ${progress.k >= 1 ? 'done' : ''}`}>
          <div className="loading-logo">
            <SproutIcon size={84} />
            <h1>
              Nông Trại
              <br />
              Vui Vẻ
            </h1>
          </div>
          <div className="loading-bar">
            <div className="loading-fill" style={{ width: `${Math.round(progress.k * 100)}%` }} />
          </div>
          <p>{progress.k >= 1 && !netReady ? 'Đang kết nối máy chủ…' : progress.label}</p>
        </div>
      )}
    </div>
  );
}
