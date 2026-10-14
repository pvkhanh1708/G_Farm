import { useEffect, useMemo, useRef, useState } from 'react';
import { CROPS } from '../game/config';
import type { Game } from '../game/Game';
import { growthProgress, PlotState, secondsLeft, store } from '../game/state/store';
import { useGameState } from './Hud';
import { CoinIcon, CropIcon, LockIcon, SickleIcon } from './icons';

function useNow(ms: number) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}

function Bubble({ plot, now, coins, cost }: { plot: PlotState; now: number; coins: number; cost: number }) {
  if (!plot.unlocked) {
    // every frontier tile costs the same; show the price only once it is affordable
    if (coins < cost)
      return (
        <div className="tag-lock minor">
          <LockIcon size={20} />
        </div>
      );
    return (
      <div className="tag-lock affordable">
        <LockIcon size={22} />
        <CoinIcon size={18} />
        <b>{cost}</b>
      </div>
    );
  }
  if (!plot.crop) return null;
  const p = growthProgress(plot, now);
  if (p >= 1) {
    return (
      <div className="tag-ready">
        <SickleIcon size={30} />
      </div>
    );
  }
  const left = secondsLeft(plot, now);
  return (
    <div className="tag-grow">
      <CropIcon crop={plot.crop} size={26} />
      <div className="tag-grow-body">
        <div className="bar">
          <div className="bar-fill" style={{ width: `${Math.max(4, p * 100)}%` }} />
        </div>
        <small>
          {CROPS[plot.crop].name} · {left}s
        </small>
      </div>
    </div>
  );
}

export function PlotOverlays({ game }: { game: Game }) {
  const s = useGameState();
  const now = useNow(250);
  const refs = useRef(new Map<string, HTMLDivElement>());
  // s changes whenever the store does, so the derived tile list stays current
  const tiles = useMemo(() => store.tiles(), [s]);
  useEffect(() => {
    const byId = new Map(tiles.map((t) => [t.id, t]));
    return game.onFrame(() => {
      refs.current.forEach((el, id) => {
        const st = byId.get(id);
        if (!st) return;
        const p = game.plotAnchor(id, st.unlocked ? (st.crop ? 1.25 : 0.6) : 0.45);
        el.style.transform = `translate(${p.x}px, ${p.y}px)`;
        el.style.visibility = p.visible ? 'visible' : 'hidden';
      });
    });
  }, [game, tiles]);
  const cost = store.nextUnlockCost();
  return (
    // big farms: compact tags so the crops stay visible
    <div className={`plot-overlays ${s.plots.length > 12 ? 'dense' : ''}`}>
      {tiles.map((p) => (
        <div
          key={p.id}
          className="plot-anchor"
          ref={(el) => {
            if (el) refs.current.set(p.id, el);
            else refs.current.delete(p.id);
          }}
        >
          <Bubble plot={p} now={now} coins={s.coins} cost={cost} />
        </div>
      ))}
    </div>
  );
}
