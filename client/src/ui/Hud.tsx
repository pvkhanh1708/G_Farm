import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { CROPS, CropId } from '../game/config';
import type { Game } from '../game/Game';
import { store } from '../game/state/store';
import { BarnIcon, CloseIcon, CoinIcon, CropIcon, GearIcon, SeedBagIcon, SproutIcon } from './icons';

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
  return <span className="num">{shown.toLocaleString('vi-VN')}</span>;
}

export function TopBar({ onSettings }: { onSettings: () => void }) {
  const s = useGameState();
  return (
    <div className="topbar">
      <div className="badge-farm">
        <div className="badge-farm-icon">
          <SproutIcon size={38} />
        </div>
        <div className="badge-farm-text">
          <b>Farm Empire</b>
          <small>Nông trại của bạn</small>
        </div>
      </div>
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

export function BottomBar({ onShop, onInventory }: { onShop: () => void; onInventory: () => void }) {
  const s = useGameState();
  const total = Object.values(s.inventory).reduce((a, b) => a + b, 0);
  return (
    <div className="bottombar">
      <button className="round-btn big shop" onClick={onShop}>
        <SeedBagIcon size={50} />
        <span className="round-btn-label">Hạt giống</span>
      </button>
      <button className="round-btn big barn" onClick={onInventory} data-fx-target="inventory">
        <BarnIcon size={50} />
        <span className="round-btn-label">Kho</span>
        {total > 0 && <span className="count-badge">{total}</span>}
      </button>
    </div>
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
          Chạm ô đất trống · <CoinIcon size={14} /> {def.seedPrice}/ô
        </small>
      </div>
      <button className="close-chip" onClick={onCancel} aria-label="Thoát gieo nhanh">
        <CloseIcon size={18} />
      </button>
    </div>
  );
}

export function Hint({ text }: { text: string | null }) {
  const [shown, setShown] = useState(text);
  useEffect(() => {
    const t = setTimeout(() => setShown(text), 250);
    return () => clearTimeout(t);
  }, [text]);
  if (!shown) return null;
  return (
    <div className="hint" key={shown}>
      <div className="hint-avatar">
        <SproutIcon size={30} />
      </div>
      <span>{shown}</span>
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
