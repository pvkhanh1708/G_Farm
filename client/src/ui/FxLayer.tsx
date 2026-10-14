import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { CropId } from '../game/config';
import { CoinIcon, CropIcon } from './icons';

/** Imperative bus so game events can trigger DOM effects without prop drilling. */
type FlyKind = { type: 'crop'; crop: CropId } | { type: 'coin' };

interface FlyItem {
  id: number;
  kind: FlyKind;
  from: { x: number; y: number };
  target: string;
  delay: number;
  onArrive?: () => void;
}
interface FloatItem {
  id: number;
  x: number;
  y: number;
  text: string;
  kind: FlyKind | null;
}
export interface Toast {
  id: number;
  text: string;
  tone: 'info' | 'good' | 'bad';
}

let nextId = 1;
const listeners = new Set<() => void>();
const state = { fly: [] as FlyItem[], float: [] as FloatItem[], toasts: [] as Toast[] };
const notify = () => listeners.forEach((l) => l());

export const fxBus = {
  /** Send `count` icons from a screen point to the element tagged data-fx-target={target}. */
  fly(kind: FlyKind, from: { x: number; y: number }, target: string, count: number, onArrive?: (i: number) => void) {
    for (let i = 0; i < count; i++) {
      state.fly.push({
        id: nextId++,
        kind,
        from: { x: from.x + (Math.random() - 0.5) * 40, y: from.y + (Math.random() - 0.5) * 24 },
        target,
        delay: i * 70,
        onArrive: () => onArrive?.(i),
      });
    }
    notify();
  },
  float(x: number, y: number, text: string, kind: FlyKind | null = null) {
    state.float.push({ id: nextId++, x, y, text, kind });
    notify();
  },
  toast(text: string, tone: Toast['tone'] = 'info') {
    const t = { id: nextId++, text, tone };
    state.toasts = [...state.toasts.slice(-2), t];
    notify();
    setTimeout(() => {
      state.toasts = state.toasts.filter((x) => x !== t);
      notify();
    }, 1900);
  },
};

export function bump(target: string) {
  const el = document.querySelector<HTMLElement>(`[data-fx-target="${target}"]`);
  if (!el) return;
  el.classList.remove('bump');
  void el.offsetWidth;
  el.classList.add('bump');
}

function targetPoint(target: string) {
  const el = document.querySelector(`[data-fx-target="${target}"]`);
  if (!el) return { x: window.innerWidth - 60, y: window.innerHeight - 60 };
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}

function Flyer({ item, done }: { item: FlyItem; done: (id: number) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = ref.current!;
    const to = targetPoint(item.target);
    const { x: x0, y: y0 } = item.from;
    // pop out, then arc into the target along a quadratic curve
    const popX = x0 + (Math.random() - 0.5) * 70;
    const popY = y0 - 40 - Math.random() * 40;
    const ctrl = { x: (popX + to.x) / 2 + (Math.random() - 0.5) * 120, y: Math.min(popY, to.y) - 80 };
    const frames: Keyframe[] = [{ transform: `translate(${x0}px, ${y0}px) scale(0.2)`, opacity: 0, offset: 0 }];
    frames.push({ transform: `translate(${popX}px, ${popY}px) scale(1.15)`, opacity: 1, offset: 0.22 });
    frames.push({ transform: `translate(${popX}px, ${popY + 6}px) scale(1)`, opacity: 1, offset: 0.32 });
    for (let i = 1; i <= 8; i++) {
      const t = i / 8;
      const k = t * t; // accelerate into the target
      const x = (1 - k) * (1 - k) * popX + 2 * (1 - k) * k * ctrl.x + k * k * to.x;
      const y = (1 - k) * (1 - k) * popY + 2 * (1 - k) * k * ctrl.y + k * k * to.y;
      frames.push({ transform: `translate(${x}px, ${y}px) scale(${1 - t * 0.45})`, opacity: 1, offset: 0.32 + t * 0.68 });
    }
    const anim = el.animate(frames, { duration: 900, delay: item.delay, easing: 'linear', fill: 'both' });
    anim.onfinish = () => {
      item.onArrive?.();
      done(item.id);
    };
    return () => anim.cancel();
  }, [item, done]);
  return (
    <div ref={ref} className="fx-flyer">
      {item.kind.type === 'coin' ? <CoinIcon size={34} /> : <CropIcon crop={item.kind.crop} size={40} />}
    </div>
  );
}

function Floater({ item, done }: { item: FloatItem; done: (id: number) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = ref.current!;
    const anim = el.animate(
      [
        { transform: `translate(${item.x}px, ${item.y}px) translate(-50%, -50%) scale(0.4)`, opacity: 0 },
        { transform: `translate(${item.x}px, ${item.y - 30}px) translate(-50%, -50%) scale(1.2)`, opacity: 1, offset: 0.2 },
        { transform: `translate(${item.x}px, ${item.y - 50}px) translate(-50%, -50%) scale(1)`, opacity: 1, offset: 0.7 },
        { transform: `translate(${item.x}px, ${item.y - 80}px) translate(-50%, -50%) scale(0.9)`, opacity: 0 },
      ],
      { duration: 1400, easing: 'ease-out', fill: 'both' },
    );
    anim.onfinish = () => done(item.id);
    return () => anim.cancel();
  }, [item, done]);
  return (
    <div ref={ref} className="fx-float">
      {item.kind?.type === 'coin' && <CoinIcon size={28} />}
      {item.kind?.type === 'crop' && <CropIcon crop={item.kind.crop} size={30} />}
      <span>{item.text}</span>
    </div>
  );
}

export function FxLayer() {
  const [, force] = useState(0);
  useEffect(() => {
    const l = () => force((n) => n + 1);
    listeners.add(l);
    return () => void listeners.delete(l);
  }, []);
  const doneFly = useRef((id: number) => {
    state.fly = state.fly.filter((f) => f.id !== id);
    notify();
  }).current;
  const doneFloat = useRef((id: number) => {
    state.float = state.float.filter((f) => f.id !== id);
    notify();
  }).current;
  return (
    <div className="fx-layer">
      {state.float.map((f) => (
        <Floater key={f.id} item={f} done={doneFloat} />
      ))}
      {state.fly.map((f) => (
        <Flyer key={f.id} item={f} done={doneFly} />
      ))}
      <div className="toasts">
        {state.toasts.map((t) => (
          <div key={t.id} className={`toast toast-${t.tone}`}>
            {t.text}
          </div>
        ))}
      </div>
    </div>
  );
}
