import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { CROPS, CropId, xpToNext } from '../game/config';
import type { Game } from '../game/Game';
import { store } from '../game/state/store';
import { BarnIcon, CloseIcon, CoinIcon, CropIcon, GearIcon, LevelStar, SeedBagIcon, SickleIcon, SproutIcon } from './icons';
import { formatNum } from './format';

export function useGameState() {
  return useSyncExternalStore(store.subscribe, store.getState);
}

/** Counts toward the real value; increases wait for flying coins to land first. */
function AnimatedNumber({ value }: { value: number }) {
  const [shown, setShown] = useState(value);
  const shownRef = useRef(value);
  useEffect(() => {
    const from = shownRef.current;
    if (from === value) return;
    const up = value > from;
    const delay = up ? 650 : 0;
    const dur = up ? 750 : 350;
    let raf = 0;
    const start = performance.now() + delay;
    const step = (now: number) => {
      const t = Math.max(0, Math.min(1, (now - start) / dur));
      const k = 1 - Math.pow(1 - t, 3);
      const v = Math.round(from + (value - from) * k);
      shownRef.current = v;
      setShown(v);
      if (t < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return <span className="num">{formatNum(shown)}</span>;
}

export function TopBar({ onSettings, onLevel }: { onSettings: () => void; onLevel: () => void }) {
  const s = useGameState();
  const need = xpToNext(s.level);
  return (
    <div className="topbar">
      <button className="level-badge" onClick={onLevel} data-fx-target="level" aria-label={`Cấp ${s.level}`}>
        <LevelStar level={s.level} size={58} />
        <div className="level-info">
          <b>Cấp {s.level}</b>
          <div className="xp-bar">
            <div className="xp-fill" style={{ width: `${Math.min(100, (s.xp / need) * 100)}%` }} />
            <span>
              {formatNum(s.xp)} / {formatNum(need)} XP
            </span>
          </div>
        </div>
      </button>
      <div className="topbar-right">
        <div className="coinbar" data-fx-target="coins">
          <CoinIcon size={48} className="coinbar-icon" />
          <AnimatedNumber value={s.coins} />
        </div>
        <button className="round-btn small" onClick={onSettings} aria-label="Cài đặt">
          <GearIcon size={30} />
        </button>
      </div>
    </div>
  );
}

interface BottomBarProps {
  readyCount: number;
  emptyCount: number;
  overview: boolean;
  onShop: () => void;
  onInventory: () => void;
  onHarvestAll: () => void;
  onPlantAll: () => void;
  onOverview: () => void;
}

export function BottomBar(p: BottomBarProps) {
  const s = useGameState();
  const total = Object.values(s.inventory).reduce((a, b) => a + b, 0);
  return (
    <>
      <div className="bottombar">
        {/* left: storage + shop */}
        <div className="dock">
          <button className="round-btn dock-btn barn" onClick={p.onInventory} data-fx-target="inventory">
            <BarnIcon size={44} />
            <span className="round-btn-label">Kho</span>
            {total > 0 && <span className="count-badge">{formatNum(total, 1000)}</span>}
          </button>
          <button className="round-btn dock-btn shop" onClick={p.onShop}>
            <SeedBagIcon size={44} />
            <span className="round-btn-label">Hạt giống</span>
          </button>
        </div>
        {/* right: bulk helpers, harvest nearest the thumb */}
        <div className="dock">
          <button className="round-btn dock-btn plant" onClick={p.onPlantAll}>
            <SproutIcon size={44} />
            <span className="round-btn-label">Trồng tất cả</span>
            {p.emptyCount > 0 && <span className="count-badge green">{p.emptyCount}</span>}
          </button>
          <button className={`round-btn dock-btn harvest ${p.readyCount ? 'glow' : ''}`} onClick={p.onHarvestAll}>
            <SickleIcon size={44} />
            <span className="round-btn-label">Thu tất cả</span>
            {p.readyCount > 0 && <span className="count-badge">{p.readyCount}</span>}
          </button>
        </div>
      </div>
    </>
  );
}

export function ToolBanner({ seed, onCancel }: { seed: CropId; onCancel: () => void }) {
  const def = CROPS[seed];
  return (
    <div className="tool-banner">
      <CropIcon crop={seed} size={36} />
      <div>
        <b>Gieo nhanh: {def.name}</b>
        <small>
          Chạm hoặc kéo qua ô trống · <CoinIcon size={14} /> {formatNum(def.seedPrice)}/ô
        </small>
      </div>
      <button className="close-chip" onClick={onCancel} aria-label="Thoát gieo nhanh">
        <CloseIcon size={18} />
      </button>
    </div>
  );
}

export function FpsMeter({ game }: { game: Game }) {
  const [fps, setFps] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setFps(Math.round(game.fps)), 500);
    return () => clearInterval(t);
  }, [game]);
  return <div className="fps">{fps} FPS</div>;
}
