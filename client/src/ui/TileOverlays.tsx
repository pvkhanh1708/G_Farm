import { useEffect, useMemo, useRef, useState } from 'react';
import { TILES_PER_PARCEL, tileWorldPos } from '../game/config';
import type { Game } from '../game/Game';
import { serverNow } from '../game/net/clock';
import { growthProgress, store, TileState } from '../game/state/store';
import { useGameState } from './Hud';
import { CoinIcon, CropIcon, LockIcon, XpIcon } from './icons';
import { formatNum } from './format';

function useNow(ms: number) {
  const [now, setNow] = useState(serverNow);
  useEffect(() => {
    const t = setInterval(() => setNow(serverNow()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}

function Tag({ tile, now, coins, cost, needLevel, onUnlock }: { tile: TileState; now: number; coins: number; cost: number; needLevel: number | null; onUnlock: () => void }) {
  if (tile.next && needLevel) {
    return (
      <div className="sign level clickable" onClick={onUnlock}>
        <span className="sign-title">
          <LockIcon size={16} /> Cần cấp
        </span>
        <span className="sign-price">
          <XpIcon size={16} /> {needLevel}
        </span>
      </div>
    );
  }
  if (tile.next) {
    return (
      <div className={`sign clickable ${coins >= cost ? 'affordable' : ''}`} onClick={onUnlock}>
        <span className="sign-title">
          <LockIcon size={16} /> Mở khóa
        </span>
        <span className="sign-price">
          <CoinIcon size={16} /> {formatNum(cost)}
        </span>
      </div>
    );
  }
  if (!tile.crop) return null;
  const p = growthProgress(tile, now);
  if (p >= 1) return null;
  return (
    <div className="tag-mini">
      <CropIcon crop={tile.crop} size={18} />
      <div className="bar">
        <div className="bar-fill" style={{ width: `${Math.max(6, p * 100)}%` }} />
      </div>
    </div>
  );
}

/**
 * DOM labels pinned to the 3D farm. Only tiles that need one get an element: the
 * next tile's sign, plus progress bars for growing crops near the middle of the
 * view while zoomed in. A big farm would otherwise project hundreds of labels
 * every frame.
 */
export function TileOverlays({ game, onUnlock }: { game: Game; onUnlock: () => void }) {
  const s = useGameState();
  const now = useNow(250);
  const refs = useRef(new Map<string, HTMLDivElement>());
  const allTiles = useMemo(() => store.tiles(), [s]);
  const preview = store.parcelCount();
  // re-picked on every 250 ms tick, so the set follows the camera
  const far = game.isFar;
  const center = game.viewTarget;
  const reach = game.cameraRadius * 0.75;
  const tiles = allTiles.filter((t) => {
    if (t.next) return true;
    if (far || !t.crop || growthProgress(t, now) >= 1) return false;
    const p = tileWorldPos(t.g);
    return Math.abs(p.x - center.x) < reach && Math.abs(p.z - center.z) < reach;
  });
  useEffect(() => {
    return game.onFrame(() => {
      refs.current.forEach((el, key) => {
        const p = key === 'parcel' ? game.parcelAnchor(preview) : game.tileAnchor(Number(key), key === String(s.unlocked) ? 0.35 : 0.75);
        el.style.transform = `translate(${p.x}px, ${p.y}px)`;
        // keep world labels out of the HUD strip at the top
        el.style.visibility = p.visible && p.y > 120 && p.x > 70 && p.x < window.innerWidth - 70 ? 'visible' : 'hidden';
      });
    });
  }, [game, preview, s.unlocked]);
  const cost = store.nextUnlockCost();
  const needLevel = store.canUnlockByLevel() ? null : store.nextUnlockLevel();
  const bind = (key: string) => (el: HTMLDivElement | null) => {
    if (el) refs.current.set(key, el);
    else refs.current.delete(key);
  };
  return (
    <div className="plot-overlays">
      {tiles.map((t) => (
        <div key={t.g} className="plot-anchor" ref={bind(String(t.g))}>
          <Tag tile={t} now={now} coins={s.coins} cost={cost} needLevel={needLevel} onUnlock={onUnlock} />
        </div>
      ))}
      <div className="plot-anchor" ref={bind('parcel')}>
        <div className="parcel-tag">
          <b>Mảnh đất {preview + 1}</b>
          <small>Mở hết {TILES_PER_PARCEL} ô của mảnh {preview} để khai hoang</small>
        </div>
      </div>
    </div>
  );
}
