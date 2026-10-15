import { Scene } from '@babylonjs/core/scene.js';

export type Ease = (t: number) => number;

export const ease = {
  linear: (t: number) => t,
  outCubic: (t: number) => 1 - Math.pow(1 - t, 3),
  inCubic: (t: number) => t * t * t,
  inOutSine: (t: number) => -(Math.cos(Math.PI * t) - 1) / 2,
  outBack: (t: number) => {
    const c1 = 1.9, c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  },
  inBack: (t: number) => {
    const c1 = 1.7, c3 = c1 + 1;
    return c3 * t * t * t - c1 * t * t;
  },
  outElastic: (t: number) => {
    if (t === 0 || t === 1) return t;
    return Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1;
  },
};

interface Tween {
  elapsed: number;
  delay: number;
  duration: number;
  ease: Ease;
  update: (k: number) => void;
  done?: () => void;
}

/** Minimal frame-driven tween runner (transform animations for procedural meshes). */
export class Tweens {
  private list: Tween[] = [];

  constructor(scene: Scene) {
    scene.onBeforeRenderObservable.add(() => {
      const dt = Math.min(scene.getEngine().getDeltaTime() / 1000, 0.1);
      this.step(dt);
    });
  }

  add(duration: number, update: (k: number) => void, opts: { ease?: Ease; delay?: number; done?: () => void } = {}) {
    const tw: Tween = { elapsed: 0, delay: opts.delay ?? 0, duration, ease: opts.ease ?? ease.outCubic, update, done: opts.done };
    this.list.push(tw);
    return tw;
  }

  wait(seconds: number, fn: () => void) {
    return this.add(seconds, () => {}, { done: fn, ease: ease.linear });
  }

  cancel(tw: Tween | null | undefined) {
    if (!tw) return;
    const i = this.list.indexOf(tw);
    if (i >= 0) this.list.splice(i, 1);
  }

  private step(dt: number) {
    const finished: Tween[] = [];
    for (const tw of this.list) {
      if (tw.delay > 0) {
        tw.delay -= dt;
        continue;
      }
      tw.elapsed += dt;
      const t = Math.min(1, tw.elapsed / tw.duration);
      tw.update(tw.ease(t));
      if (t >= 1) finished.push(tw);
    }
    for (const tw of finished) {
      this.cancel(tw);
      tw.done?.();
    }
  }
}
