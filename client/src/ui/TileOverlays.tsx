import { useEffect, useMemo, useRef, useState } from 'react';
import { TILES_PER_PARCEL } from '../game/config';
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

/** Progress bars only make sense when zoomed in; hide them in the overview. */
const CLOSE_RADIUS = 20;

function Tag({ tile, now, coins, cost, close, needLevel }: { tile: TileState; now: number; coins: number; cost: number; close: boolean; needLevel: number | null }) {
  if (tile.next && needLevel) {
    return (
      <div className="sign level">
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
      <div className={`sign ${coins >= cost ? 'affordable' : ''}`}>
        <span className="sign-title">
          <LockIcon size={16} /> Mở khóa
        </span>
        <span className="sign-price">
          <CoinIcon size={16} /> {formatNum(cost)}
        </span>
      </div>
    );
  }
  if (!close || !tile.crop) return null;
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

export function TileOverlays({ game }: { game: Game }) {
  const s = useGameState();
  const now = useNow(250);
  const [close, setClose] = useState(true);
  const refs = useRef(new Map<string, HTMLDivElement>());
  const tiles = useMemo(() => store.tiles(), [s]);
  const preview = store.parcelCount();
  useEffect(() => {
    return game.onFrame(() => {
      const isClose = game.cameraRadius < CLOSE_RADIUS;
      setClose((c) => (c === isClose ? c : isClose));
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
          <Tag tile={t} now={now} coins={s.coins} cost={cost} close={close} needLevel={needLevel} />
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
