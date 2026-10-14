import { useEffect, useRef, useState } from 'react';
import { CROPS, UNLOCK_COSTS } from '../game/config';
import type { Game } from '../game/Game';
import { growthProgress, PlotState, secondsLeft } from '../game/state/store';
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

function Bubble({ plot, now, coins, cheapestLocked }: { plot: PlotState; now: number; coins: number; cheapestLocked: number }) {
  if (!plot.unlocked) {
    const cost = UNLOCK_COSTS[plot.index];
    const affordable = coins >= cost;
    return (
      <div className={`tag-lock ${affordable ? 'affordable' : ''} ${cost === cheapestLocked ? 'next' : 'minor'}`}>
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
  const refs = useRef<Array<HTMLDivElement | null>>([]);
  useEffect(() => {
    return game.onFrame(() => {
      refs.current.forEach((el, i) => {
        if (!el) return;
        const st = s.plots[i];
        const p = game.plotAnchor(i, st.unlocked ? (st.crop ? 1.25 : 0.6) : 0.75);
        el.style.transform = `translate(${p.x}px, ${p.y}px)`;
        el.style.visibility = p.visible ? 'visible' : 'hidden';
      });
    });
  }, [game, s.plots]);
  const lockedCosts = s.plots.filter((p) => !p.unlocked).map((p) => UNLOCK_COSTS[p.index]);
  const cheapest = lockedCosts.length ? Math.min(...lockedCosts) : -1;
  return (
    <div className="plot-overlays">
      {s.plots.map((p, i) => (
        <div key={i} className="plot-anchor" ref={(el) => (refs.current[i] = el)}>
          <Bubble plot={p} now={now} coins={s.coins} cheapestLocked={cheapest} />
        </div>
      ))}
    </div>
  );
}
