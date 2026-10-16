import { useEffect, useLayoutEffect, useRef, useState } from 'react';

const MIN = 1, MAX = 3.5;
const clamp = (z: number) => Math.max(MIN, Math.min(MAX, z));

/**
 * A square board that can be zoomed (buttons, pinch, ctrl/mouse wheel) and panned (scroll / drag) when
 * zoomed in. The point under the fingers (or the centre, for the buttons) stays put while zooming.
 */
export function ZoomBoard({ children }: { children: React.ReactNode }) {
  const view = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);
  /** Where to keep fixed while the zoom changes: a point of the viewport, in board fractions. */
  const anchor = useRef<{ fx: number; fy: number; vx: number; vy: number } | null>(null);

  const zoomAt = (next: number, vx?: number, vy?: number) => {
    const el = view.current;
    if (!el) return;
    const z = clamp(next);
    const x = vx ?? el.clientWidth / 2, y = vy ?? el.clientHeight / 2;
    const size = el.clientWidth * zoom;
    anchor.current = { fx: (el.scrollLeft + x) / size, fy: (el.scrollTop + y) / size, vx: x, vy: y };
    setZoom(z);
  };

  useLayoutEffect(() => {
    const el = view.current, a = anchor.current;
    if (!el || !a) return;
    const size = el.clientWidth * zoom;
    el.scrollLeft = a.fx * size - a.vx;
    el.scrollTop = a.fy * size - a.vy;
    anchor.current = null;
  }, [zoom]);

  // pinch with two fingers, wheel with ctrl (trackpad pinch) or plain wheel on desktop
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;
  useEffect(() => {
    const el = view.current!;
    const pts = new Map<number, { x: number; y: number }>();
    let start: { d: number; z: number } | null = null;
    const local = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };
    const down = (e: PointerEvent) => {
      if (e.pointerType !== 'touch') return;
      pts.set(e.pointerId, local(e));
      if (pts.size === 2) {
        const [a, b] = [...pts.values()];
        start = { d: Math.hypot(a.x - b.x, a.y - b.y), z: zoomRef.current };
      }
    };
    const move = (e: PointerEvent) => {
      if (!pts.has(e.pointerId)) return;
      pts.set(e.pointerId, local(e));
      if (pts.size === 2 && start) {
        e.preventDefault();
        const [a, b] = [...pts.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        zoomAt(start.z * (d / start.d), (a.x + b.x) / 2, (a.y + b.y) / 2);
      }
    };
    const up = (e: PointerEvent) => {
      pts.delete(e.pointerId);
      if (pts.size < 2) start = null;
    };
    const wheel = (e: WheelEvent) => {
      if (!e.ctrlKey && zoomRef.current === 1 && e.deltaY > 0) return;
      e.preventDefault();
      const r = el.getBoundingClientRect();
      zoomAt(zoomRef.current * Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015)), e.clientX - r.left, e.clientY - r.top);
    };
    el.addEventListener('pointerdown', down);
    el.addEventListener('pointermove', move, { passive: false });
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    el.addEventListener('wheel', wheel, { passive: false });
    return () => {
      el.removeEventListener('pointerdown', down);
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
      el.removeEventListener('wheel', wheel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="zoom-board">
      <div className={`zoom-view ${zoom > 1 ? 'zoomed' : ''}`} ref={view}>
        <div className="zoom-content" style={{ width: `${zoom * 100}%`, ['--zoom' as string]: zoom }}>
          {children}
        </div>
      </div>
      <div className="zoom-buttons">
        <button className="round-btn small" onClick={() => zoomAt(zoom * 1.4)} disabled={zoom >= MAX} aria-label="Phóng to">
          +
        </button>
        <button className="round-btn small" onClick={() => zoomAt(zoom / 1.4)} disabled={zoom <= MIN} aria-label="Thu nhỏ">
          −
        </button>
      </div>
    </div>
  );
}
