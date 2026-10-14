import { ArcRotateCamera, Scene, Vector3 } from '@babylonjs/core';

const ELEVATION_DEG = 40;
const MIN_R = 8;

/**
 * Fixed-angle isometric-style camera: drag to pan, wheel / pinch to zoom.
 * Rotation is never exposed so the composition always stays readable.
 */
export class CameraRig {
  readonly camera: ArcRotateCamera;
  private goalTarget = new Vector3(0.6, 0, 1.6);
  private goalRadius = 24;
  private velocity = new Vector3();
  private pointers = new Map<number, { x: number; y: number }>();
  private downAt = { x: 0, y: 0, t: 0 };
  private dragging = false;
  private pinchDist = 0;

  onTap: (x: number, y: number) => void = () => {};
  onHover: (x: number, y: number) => void = () => {};

  constructor(private scene: Scene, private canvas: HTMLCanvasElement) {
    const beta = ((90 - ELEVATION_DEG) * Math.PI) / 180;
    this.camera = new ArcRotateCamera('cam', (-3 * Math.PI) / 4, beta, this.goalRadius, this.goalTarget.clone(), scene);
    this.camera.fov = 0.6;
    this.camera.minZ = 0.5;
    this.camera.maxZ = 160;
    this.camera.inputs.clear();
    this.adaptToAspect();
    this.camera.radius = this.goalRadius;
    this.bind();
    scene.onBeforeRenderObservable.add(() => this.update(scene.getEngine().getDeltaTime() / 1000));
  }

  private maxR = 40;
  private fitWidth = 7;
  private bounds = { minX: -9, maxX: 9, minZ: -9, maxZ: 9 };

  /** Distance at which a ground span of `width` fills the screen. */
  fitRadius(width: number) {
    this.fitWidth = width;
    const aspect = this.canvas.clientWidth / Math.max(1, this.canvas.clientHeight);
    // portrait: the island diamond is narrower than its fit width, so allow a tighter frame
    const w = aspect < 1 ? width * 0.74 : width;
    const r = w / 2 / (Math.tan(this.camera.fov / 2) * Math.min(aspect, 1.15));
    return Math.max(MIN_R, Math.min(this.maxR, r));
  }

  adaptToAspect() {
    this.goalRadius = this.fitRadius(this.fitWidth);
  }

  /** Let the camera roam over the whole farm (and zoom out far enough to see it all). */
  setBounds(minX: number, maxX: number, minZ: number, maxZ: number) {
    this.bounds = { minX: minX - 2, maxX: maxX + 2, minZ: minZ - 2, maxZ: maxZ + 2 };
    const span = Math.max(maxX - minX, maxZ - minZ);
    const aspect = this.canvas.clientWidth / Math.max(1, this.canvas.clientHeight);
    this.maxR = Math.max(30, (span * 1.5) / 2 / (Math.tan(this.camera.fov / 2) * Math.min(aspect, 1.15)) + 4);
    this.clampGoal();
  }

  private bind() {
    const c = this.canvas;
    c.addEventListener('pointerdown', this.down);
    c.addEventListener('pointermove', this.move);
    window.addEventListener('pointerup', this.up);
    window.addEventListener('pointercancel', this.up);
    c.addEventListener('wheel', this.wheel, { passive: false });
    c.style.touchAction = 'none';
  }

  dispose() {
    const c = this.canvas;
    c.removeEventListener('pointerdown', this.down);
    c.removeEventListener('pointermove', this.move);
    window.removeEventListener('pointerup', this.up);
    window.removeEventListener('pointercancel', this.up);
    c.removeEventListener('wheel', this.wheel);
  }

  private local(e: PointerEvent | WheelEvent) {
    const r = this.canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  private down = (e: PointerEvent) => {
    const p = this.local(e);
    this.pointers.set(e.pointerId, p);
    this.canvas.setPointerCapture?.(e.pointerId);
    if (this.pointers.size === 1) {
      this.downAt = { ...p, t: performance.now() };
      this.dragging = false;
      this.velocity.setAll(0);
    } else if (this.pointers.size === 2) {
      this.dragging = true;
      this.pinchDist = this.spread();
    }
  };

  private spread() {
    const [a, b] = [...this.pointers.values()];
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  private move = (e: PointerEvent) => {
    const p = this.local(e);
    const prev = this.pointers.get(e.pointerId);
    if (!prev) {
      if (e.pointerType === 'mouse') this.onHover(p.x, p.y);
      return;
    }
    this.pointers.set(e.pointerId, p);
    if (this.pointers.size === 2) {
      const d = this.spread();
      if (this.pinchDist > 0) this.zoomBy(this.pinchDist / d);
      this.pinchDist = d;
      return;
    }
    if (!this.dragging && Math.hypot(p.x - this.downAt.x, p.y - this.downAt.y) > 8) this.dragging = true;
    if (this.dragging) this.panBy(p.x - prev.x, p.y - prev.y);
  };

  private up = (e: PointerEvent) => {
    if (!this.pointers.has(e.pointerId)) return;
    const p = this.local(e);
    const wasSingle = this.pointers.size === 1;
    this.pointers.delete(e.pointerId);
    if (wasSingle && !this.dragging && performance.now() - this.downAt.t < 600) this.onTap(p.x, p.y);
    if (this.pointers.size === 0) this.dragging = false;
  };

  private wheel = (e: WheelEvent) => {
    e.preventDefault();
    this.zoomBy(Math.exp(e.deltaY * 0.0012));
  };

  private zoomBy(factor: number) {
    this.goalRadius = Math.max(MIN_R, Math.min(this.maxR, this.goalRadius * factor));
  }

  private worldPerPixel() {
    const h = Math.max(1, this.canvas.clientHeight);
    return (2 * this.camera.radius * Math.tan(this.camera.fov / 2)) / h;
  }

  private panBy(dx: number, dy: number) {
    const k = this.worldPerPixel();
    const a = this.camera.alpha;
    // camera right / forward projected onto the ground plane
    const right = new Vector3(-Math.sin(a), 0, Math.cos(a));
    const fwd = new Vector3(-Math.cos(a), 0, -Math.sin(a));
    const sinE = Math.cos(this.camera.beta);
    const delta = right.scale(-dx * k).add(fwd.scale((dy * k) / Math.max(0.3, sinE)));
    this.goalTarget.addInPlace(delta);
    this.clampGoal();
    const dt = Math.max(1 / 120, this.scene.getEngine().getDeltaTime() / 1000);
    this.velocity = delta.scale(1 / dt);
  }

  private clampGoal() {
    const b = this.bounds;
    this.goalTarget.x = Math.max(b.minX, Math.min(b.maxX, this.goalTarget.x));
    this.goalTarget.z = Math.max(b.minZ, Math.min(b.maxZ, this.goalTarget.z));
  }

  private update(dt: number) {
    dt = Math.min(dt, 0.05);
    if (this.pointers.size === 0 && this.velocity.lengthSquared() > 1e-4) {
      this.goalTarget.addInPlace(this.velocity.scale(dt));
      this.velocity.scaleInPlace(Math.pow(0.02, dt));
      this.clampGoal();
    }
    const k = 1 - Math.pow(0.0005, dt);
    this.camera.target = Vector3.Lerp(this.camera.target, this.goalTarget, k);
    this.camera.radius += (this.goalRadius - this.camera.radius) * k;
  }

  focus(target: Vector3, radius: number, immediate = false) {
    this.goalTarget.copyFrom(target);
    this.goalRadius = radius;
    if (immediate) {
      this.camera.target = target.clone();
      this.camera.radius = radius;
    }
  }

  get target() {
    return this.camera.target;
  }
}
