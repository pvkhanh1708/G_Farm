import { useCallback, useEffect, useRef, useState } from 'react';
import { sfx } from './game/audio/sfx';
import { CROP_ORDER, CROPS, CropId, Quality } from './game/config';
import { Game } from './game/Game';
import { serverNow } from './game/net/clock';
import { sync } from './game/net/sync';
import { pwa } from './game/pwa';
import { growthProgress, store, TileState } from './game/state/store';
import { bump, FxLayer, fxBus } from './ui/FxLayer';
import { BottomBar, FpsMeter, Hint, ToolBanner, TopBar, useGameState } from './ui/Hud';
import { SproutIcon } from './ui/icons';
import { AccountPopup, InstallPopup, Inventory, LevelsPopup, LevelUpPopup, SeedShop, Settings, UnlockPopup } from './ui/Popups';
import { NetBadge } from './ui/NetBadge';
import { TileOverlays } from './ui/TileOverlays';
import { formatNum } from './ui/format';

type Popup = { type: 'shop'; tile: number | null; bulk?: boolean } | { type: 'inventory' } | { type: 'unlock' } | { type: 'settings' } | { type: 'levels' } | { type: 'account' } | { type: 'install' } | null;

const PREFS_KEY = 'farm-empire:prefs';
function loadPrefs(): { quality: Quality; sound: boolean; fps: boolean } {
  const mobile = matchMedia('(pointer: coarse)').matches || Math.min(screen.width, screen.height) < 700;
  const def = { quality: (mobile ? 'medium' : 'high') as Quality, sound: true, fps: false };
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

function hintFor(tiles: TileState[], coins: number, inv: number, tool: CropId | null): string | null {
  const c = counts(tiles);
  if (c.ready) return c.ready > 1 ? `${c.ready} ô đã chín — bấm “Thu tất cả” hoặc chạm từng cây.` : 'Cây đã chín! Chạm vào cây để thu hoạch.';
  if (tool) return null;
  if (!c.growing && store.canUnlockByLevel() && coins >= store.nextUnlockCost()) return 'Bạn đủ xu để mở ô đất mới — chạm vào ô có biển “Mở khóa”.';
  if (c.empty && coins >= CROPS.carrot.seedPrice) return c.empty > 1 ? 'Chạm ô đất trống để gieo, hoặc bấm “Trồng tất cả”.' : 'Chạm vào ô đất trống để gieo hạt.';
  if (inv > 0) return 'Mở Kho để bán nông sản lấy xu.';
  if (c.growing) return 'Cây đang lớn… chờ một chút nhé!';
  return null;
}

export function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [game, setGame] = useState<Game | null>(null);
  const [progress, setProgress] = useState({ k: 0, label: 'Đang tải…' });
  const [popup, setPopup] = useState<Popup>(null);
  const [tool, setTool] = useState<CropId | null>(null);
  const [overview, setOverview] = useState(false);
  const [prefs, setPrefs] = useState(loadPrefs);
  const toolRef = useRef(tool);
  toolRef.current = tool;
  const s = useGameState();
  const tiles = store.tiles();
  const showcase = new URLSearchParams(location.search).has('showcase');
  const [levelUp, setLevelUp] = useState<number | null>(null);
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
  }, [prefs]);

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

  useEffect(() => {
    if (!game) return;
    return game.on((e) => {
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
          const st = store.tile(e.g);
          if (st?.crop) fxBus.toast(`${CROPS[st.crop].name}: còn ${Math.max(1, Math.ceil(CROPS[st.crop].growSeconds * (1 - growthProgress(st))))} giây`, 'info');
        }
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

  const sell = (crop: CropId, qty: number, from: DOMRect) => {
    const res = store.sell(crop, qty);
    if (!res.ok) return fxBus.toast(res.reason, 'bad');
    sfx.coin();
    const origin = { x: from.left + from.width / 2, y: from.top + from.height / 2 };
    fxBus.fly({ type: 'coin' }, origin, 'coins', Math.min(10, Math.max(3, Math.ceil(res.value / 6))), () => {
      sfx.coinTick();
      bump('coins');
    });
    fxBus.float(origin.x, origin.y - 30, `+${formatNum(res.value)}`, { type: 'coin' });
    fxBus.toast(`Đã bán ${formatNum(qty)} ${CROPS[crop].name.toLowerCase()} · +${formatNum(res.value)} xu`, 'good');
  };

  const close = () => {
    sfx.close();
    setPopup(null);
  };

  const loading = progress.k < 1 || !game || !netReady;
  const c = counts(tiles);
  const inv = Object.values(s.inventory).reduce((a, b) => a + b, 0);

  return (
    <div className="app" onPointerDown={() => sfx.resume()}>
      <canvas ref={canvasRef} className="scene" />
      {game && !showcase && (
        <>
          <TileOverlays game={game} onUnlock={() => (sfx.open(), setPopup({ type: 'unlock' }))} />
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
          {tool ? <ToolBanner seed={tool} onCancel={() => (sfx.tap(), setTool(null))} /> : null}
          <Hint text={popup || levelUp !== null ? null : hintFor(tiles, s.coins, inv, tool)} />
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
          fps={prefs.fps}
          onFps={(on) => setPrefs({ ...prefs, fps: on })}
          onAccount={() => setPopup({ type: 'account' })}
          onInstall={() => {
            // Android/Chrome: open the real install dialog; otherwise show the manual steps
            if (pwa.canPrompt) void pwa.prompt().then((ok) => ok && setPopup(null));
            else setPopup({ type: 'install' });
          }}
          onReset={() => {
            store.reset();
            setTool(null);
            setPopup(null);
            game.focusCurrent();
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
            <h1>Farm Empire</h1>
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
