import { Camera, Scene, TargetCamera, Vector3 } from '@babylonjs/core';

const MIN_R = 8;
/** The orthographic camera sits this far from its target; zoom only changes the view size. */
const CAMERA_DISTANCE = 90;

/**
 * Fixed top-down camera: drag to pan in 4 directions, wheel / pinch to zoom.
 * Orthographic, so the farm is seen from exactly the same angle wherever you pan or
 * zoom (a perspective camera skews tiles near the screen edges). Rotation is never
 * exposed. "Radius" stays the zoom unit: the view shows what a perspective camera
 * at that distance would, so framing maths elsewhere is unchanged.
 */
export class CameraRig {
  readonly camera: TargetCamera;
  /** Ground point at the centre of the view. */
  readonly target = new Vector3(0.6, 0, 1.6);
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
    // looking straight down (pitch 90deg): +x is screen right, +z is screen up
    this.camera = new TargetCamera('cam', new Vector3(this.target.x, CAMERA_DISTANCE, this.target.z), scene);
    this.camera.rotation.set(Math.PI / 2, 0, 0);
    this.camera.fov = 0.6;
    this.camera.mode = Camera.ORTHOGRAPHIC_CAMERA;
    this.camera.minZ = 1;
    this.camera.maxZ = CAMERA_DISTANCE * 3;
    this.adaptToAspect();
    this.zoom = this.goalRadius;
    this.applyZoom();
    this.bind();
    scene.onBeforeRenderObservable.add(() => this.update(scene.getEngine().getDeltaTime() / 1000));
  }

  /** Current zoom (in radius units), easing toward goalRadius. */
  private zoom = 24;
  private maxR = 40;
  private fitWidth = 7;
  private bounds = { minX: -9, maxX: 9, minZ: -9, maxZ: 9 };

  /** Distance at which a ground span of `width` fills the screen. */
  fitRadius(width: number) {
    this.fitWidth = width;
    const aspect = this.canvas.clientWidth / Math.max(1, this.canvas.clientHeight);
    const r = width / 2 / (Math.tan(this.camera.fov / 2) * Math.min(aspect, 1.15));
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
    return (2 * this.zoom * Math.tan(this.camera.fov / 2)) / h;
  }

  private applyZoom() {
    const halfH = this.zoom * Math.tan(this.camera.fov / 2);
    const halfW = halfH * (this.canvas.clientWidth / Math.max(1, this.canvas.clientHeight));
    this.camera.orthoTop = halfH;
    this.camera.orthoBottom = -halfH;
    this.camera.orthoLeft = -halfW;
    this.camera.orthoRight = halfW;
  }

  /** Current zoom in radius units (what a perspective camera's distance would be). */
  get radius() {
    return this.zoom;
  }

  private panBy(dx: number, dy: number) {
    const k = this.worldPerPixel();
    // screen right = +x, screen up = +z; the ground follows the finger
    const delta = new Vector3(-dx * k, 0, dy * k);
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
    this.target.addInPlace(this.goalTarget.subtract(this.target).scaleInPlace(k));
    this.place();
    this.zoom += (this.goalRadius - this.zoom) * k;
    this.applyZoom();
  }

  private place() {
    this.camera.position.set(this.target.x, CAMERA_DISTANCE, this.target.z);
  }

  /** How far above the ground the camera sits (fog is measured from it). */
  get distance() {
    return CAMERA_DISTANCE;
  }

  focus(target: Vector3, radius: number, immediate = false) {
    this.goalTarget.copyFrom(target);
    this.goalRadius = radius;
    if (immediate) {
      this.target.copyFrom(target);
      this.place();
      this.zoom = radius;
      this.applyZoom();
    }
  }
}
