import { useCallback, useEffect, useRef, useState } from 'react';
import { sfx } from './game/audio/sfx';
import { CROP_ORDER, CROPS, CropId, Quality } from './game/config';
import { Game } from './game/Game';
import { GameState, growthProgress, store } from './game/state/store';
import { bump, FxLayer, fxBus } from './ui/FxLayer';
import { BottomBar, FpsMeter, Hint, ToolBanner, TopBar, useGameState } from './ui/Hud';
import { SproutIcon } from './ui/icons';
import { PlotOverlays } from './ui/PlotOverlays';
import { Inventory, SeedShop, Settings, UnlockPopup } from './ui/Popups';

type Popup = { type: 'shop'; plot: string | null } | { type: 'inventory' } | { type: 'unlock'; plot: string } | { type: 'settings' } | null;

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

function hintFor(s: GameState, tool: CropId | null): string | null {
  const now = Date.now();
  if (s.plots.some((p) => p.crop && growthProgress(p, now) >= 1)) return 'Cây đã chín! Chạm vào cây để thu hoạch.';
  if (tool) return null;
  const inv = Object.values(s.inventory).reduce((a, b) => a + b, 0);
  const growing = s.plots.some((p) => p.crop);
  const emptyPlots = s.plots.some((p) => !p.crop);
  if (store.frontier().length && s.coins >= store.nextUnlockCost() && !growing) return 'Bạn đủ xu để mở rộng đất — chạm vào ô cỏ bên cạnh nông trại!';
  if (emptyPlots && s.coins >= CROPS.carrot.seedPrice) return 'Chạm vào ô đất trống để gieo hạt.';
  if (inv > 0) return 'Mở Kho để bán nông sản lấy xu.';
  if (growing) return 'Cây đang lớn… chờ một chút nhé!';
  return null;
}

export function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [game, setGame] = useState<Game | null>(null);
  const [progress, setProgress] = useState({ k: 0, label: 'Đang tải…' });
  const [popup, setPopup] = useState<Popup>(null);
  const [tool, setTool] = useState<CropId | null>(null);
  const [prefs, setPrefs] = useState(loadPrefs);
  const toolRef = useRef(tool);
  toolRef.current = tool;
  const s = useGameState();
  const showcase = new URLSearchParams(location.search).has('showcase');

  useEffect(() => {
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
    } catch {
      /* ignore */
    }
    sfx.setEnabled(prefs.sound);
  }, [prefs]);

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
    (plot: string, crop: CropId) => {
      if (!game) return false;
      const res = game.plant(plot, crop);
      if (!res.ok) {
        fxBus.toast(res.reason, 'bad');
        return false;
      }
      const p = game.plotAnchor(plot, 0.6);
      fxBus.float(p.x, p.y, `-${CROPS[crop].seedPrice}`, { type: 'coin' });
      return true;
    },
    [game],
  );

  useEffect(() => {
    if (!game) return;
    return game.on((e) => {
      if (e.type === 'plotTap') {
        if (e.kind === 'locked') {
          sfx.open();
          setPopup({ type: 'unlock', plot: e.id });
        } else if (e.kind === 'empty') {
          const t = toolRef.current;
          if (t) {
            if (!plantAt(e.id, t) && store.getState().coins < CROPS[t].seedPrice) setTool(null);
          } else {
            sfx.open();
            setPopup({ type: 'shop', plot: e.id });
          }
        } else {
          const st = store.plot(e.id);
          if (st?.crop) fxBus.toast(`${CROPS[st.crop].name}: còn ${Math.max(1, Math.ceil(CROPS[st.crop].growSeconds * (1 - growthProgress(st))))} giây`, 'info');
        }
      } else if (e.type === 'barnTap') {
        sfx.open();
        setPopup({ type: 'inventory' });
      } else if (e.type === 'harvested') {
        fxBus.float(e.x, e.y - 20, `+${e.amount}`, { type: 'crop', crop: e.crop });
        fxBus.fly({ type: 'crop', crop: e.crop }, { x: e.x, y: e.y }, 'inventory', Math.min(e.amount, 6), () => {
          sfx.collect();
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
    fxBus.float(origin.x, origin.y - 30, `+${res.value}`, { type: 'coin' });
    fxBus.toast(`Đã bán ${qty} ${CROPS[crop].name.toLowerCase()} · +${res.value} xu`, 'good');
  };

  const close = () => {
    sfx.close();
    setPopup(null);
  };

  const loading = progress.k < 1 || !game;

  return (
    <div className="app" onPointerDown={() => sfx.resume()}>
      <canvas ref={canvasRef} className="scene" />
      {game && !showcase && (
        <>
          <PlotOverlays game={game} />
          <TopBar onSettings={() => (sfx.open(), setPopup({ type: 'settings' }))} />
          <BottomBar onShop={() => (sfx.open(), setPopup({ type: 'shop', plot: null }))} onInventory={() => (sfx.open(), setPopup({ type: 'inventory' }))} />
          {tool ? <ToolBanner seed={tool} onCancel={() => (sfx.tap(), setTool(null))} /> : null}
          <Hint text={popup ? null : hintFor(s, tool)} />
          {prefs.fps && <FpsMeter game={game} />}
          <div className="build-tag">Vertical Slice · đồ họa tạm</div>
        </>
      )}
      {game && showcase && <div className="showcase-legend">{CROP_ORDER.map((c) => CROPS[c].name).join(' / ')} · giai đoạn 0 → 4</div>}
      <FxLayer />

      {popup?.type === 'shop' && (
        <SeedShop
          plot={popup.plot}
          onClose={close}
          onPick={(crop) => {
            if (popup.plot !== null) {
              if (plantAt(popup.plot, crop)) setTool(crop);
            } else {
              sfx.tap();
              setTool(crop);
            }
            setPopup(null);
          }}
        />
      )}
      {popup?.type === 'inventory' && <Inventory onClose={close} onSell={sell} />}
      {popup?.type === 'unlock' && (
        <UnlockPopup
          onClose={close}
          onConfirm={() => {
            const res = game!.unlock(popup.plot);
            if (!res.ok) fxBus.toast(res.reason, 'bad');
            else fxBus.toast('Đã mở rộng đất mới!', 'good');
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
          onReset={() => {
            store.reset();
            setTool(null);
            setPopup(null);
          }}
          onClose={close}
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
          <p>{progress.label}</p>
        </div>
      )}
    </div>
  );
}
