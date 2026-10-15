import { useEffect, useMemo, useRef, useState } from 'react';
import { CROPS } from '../game/config';
import type { Game } from '../game/Game';
import { serverNow } from '../game/net/clock';
import { growthProgress, secondsLeft, store, TileState } from '../game/state/store';
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

/** Natural width of the unlock sign in CSS px (see .sign); it is scaled to 82% of a tile. */
const SIGN_WIDTH = 96;

function formatLeft(sec: number) {
  if (sec < 60) return `${sec}s`;
  const m = Math.floor(sec / 60), s = sec % 60;
  if (m < 60) return s ? `${m}p ${s}s` : `${m} phút`;
  return `${Math.floor(m / 60)}g ${m % 60}p`;
}

/** Shown after tapping a growing crop: progress, time left, and dig buttons. */
function GrowCard({ tile, now, onDig }: { tile: TileState; now: number; onDig: (tiles: number[], label: string) => void }) {
  const crop = tile.crop!;
  const def = CROPS[crop];
  const p = growthProgress(tile, now);
  const same = store
    .tiles()
    .filter((t) => t.crop === crop && growthProgress(t, now) < 1)
    .map((t) => t.g);
  return (
    <div className="grow-card" onPointerDown={(e) => e.stopPropagation()}>
      <div className="grow-card-head">
        <CropIcon crop={crop} size={22} />
        <b>{def.name}</b>
        <span className="grow-left">còn {formatLeft(secondsLeft(tile, now))}</span>
      </div>
      <div className="bar">
        <div className="bar-fill" style={{ width: `${Math.max(6, p * 100)}%` }} />
      </div>
      <div className="grow-actions">
        <button className="btn btn-orange small" onClick={() => onDig([tile.g], def.name.toLowerCase())}>
          Đào ô này
        </button>
        {same.length > 1 && (
          <button className="btn btn-red small" onClick={() => onDig(same, def.name.toLowerCase())}>
            Đào tất cả ({same.length})
          </button>
        )}
      </div>
    </div>
  );
}

function Tag({ tile, coins, cost, needLevel, onUnlock }: { tile: TileState; coins: number; cost: number; needLevel: number | null; onUnlock: () => void }) {
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
  return null;
}

/**
 * DOM labels pinned to the 3D farm. Only tiles that need one get an element: the
 * next tile's sign, plus progress bars for growing crops near the middle of the
 * view while zoomed in. A big farm would otherwise project hundreds of labels
 * every frame.
 */
export function TileOverlays({ game, revealed, onUnlock, onDig }: { game: Game; revealed: number | null; onUnlock: () => void; onDig: (tiles: number[], label: string) => void }) {
  const s = useGameState();
  const now = useNow(250);
  const refs = useRef(new Map<string, HTMLDivElement>());
  const allTiles = useMemo(() => store.tiles(), [s]);
  // progress stays hidden until the player taps a growing crop
  const tiles = allTiles.filter((t) => t.next || (t.g === revealed && t.crop && growthProgress(t, now) < 1));
  useEffect(() => {
    return game.onFrame(() => {
      // the unlock sign keeps a fixed size relative to its tile, whatever the zoom
      const signScale = (game.tilePixels * 0.82) / SIGN_WIDTH;
      refs.current.forEach((el, key) => {
        const isSign = key === String(s.unlocked);
        const p = game.tileAnchor(Number(key), isSign ? 0.35 : 0.75);
        if (isSign) el.style.setProperty('--s', signScale.toFixed(3));
        el.style.transform = `translate(${p.x}px, ${p.y}px)`;
        // keep world labels out of the HUD strip at the top
        el.style.visibility = p.visible && p.y > 120 && p.x > 70 && p.x < window.innerWidth - 70 ? 'visible' : 'hidden';
      });
    });
  }, [game, s.unlocked]);
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
          {t.g === revealed && t.crop ? <GrowCard tile={t} now={now} onDig={onDig} /> : <Tag tile={t} coins={s.coins} cost={cost} needLevel={needLevel} onUnlock={onUnlock} />}
        </div>
      ))}
    </div>
  );
}
