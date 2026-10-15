import {
  Color3,
  Color4,
  ColorCurves,
  DirectionalLight,
  Engine,
  HemisphericLight,
  ImageProcessingConfiguration,
  Matrix,
  Scene,
  SceneInstrumentation,
  ShadowGenerator,
  StandardMaterial,
  Vector3,
} from '@babylonjs/core';
import { sfx } from './audio/sfx';
import { preloadAssets } from './assets/registry';
import { CROP_ORDER, CropId, ISLAND_SIZE, parcelCenter, Quality, QUALITY_PRESETS, SOIL_TOP, STAGE_COUNT, TILE_SIZE, TILES_PER_PARCEL, tileWorldPos } from './config';
import { CameraRig } from './render/camera';
import { CropLibrary } from './render/crops';
import { Fx } from './render/fx';
import { hex } from './render/geometry';
import { MaterialLibrary, toonMaterial, WindPlugin } from './render/materials';
import { buildTileTemplates, TileContext, TileTemplates, TileView } from './render/tiles';
import { grainTexture, grassTexture, soilTexture } from './render/textures';
import { Tweens } from './render/tween';
import { World } from './render/world';
import { serverNow } from './net/clock';
import { TileBatches } from './render/batch';
import type { SparkleField } from './render/fx';
import { growthProgress, store } from './state/store';

export type TileKind = 'locked' | 'next' | 'empty' | 'growing';

export type GameEvent =
  | { type: 'tileTap'; g: number; kind: TileKind }
  | { type: 'harvested'; g: number; crop: CropId; amount: number; xp: number; x: number; y: number; bulk: boolean }
  | { type: 'ready'; g: number }
  /** The camera crossed between the close farm view and the zoomed-out overview. */
  | { type: 'view'; overview: boolean };

export interface ScreenPoint {
  x: number;
  y: number;
  visible: boolean;
}

const tick = () => new Promise<void>((r) => requestAnimationFrame(() => r()));

export class Game {
  readonly engine: Engine;
  readonly scene: Scene;
  private rig!: CameraRig;
  private sun!: DirectionalLight;
  private shadowGen: ShadowGenerator | null = null;
  private mats!: MaterialLibrary;
  private fx!: Fx;
  private tweens!: Tweens;
  private crops!: CropLibrary;
  private templates!: TileTemplates;
  private world!: World;
  private tiles = new Map<number, TileView>();
  private tileCtx!: TileContext;
  private parcels = 0;
  private listeners = new Set<(e: GameEvent) => void>();
  private frameListeners = new Set<() => void>();
  private unsubStore: (() => void) | null = null;
  private time = 0;
  private syncTimer = 0;
  private readySet = new Set<number>();
  private hovered: number | null = null;
  private overview = false;
  private batches!: TileBatches;
  private sparkles!: SparkleField;
  private bobbing = new Set<TileView>();
  /** Zoomed out past one parcel: overview look (simple crops, no shadows), taps pick a parcel. */
  private far = false;
  private sparkleTimer = 0;
  quality: Quality;

  private constructor(private canvas: HTMLCanvasElement, quality: Quality, private showcase: boolean) {
    this.quality = quality;
    const preset = QUALITY_PRESETS[quality];
    this.engine = new Engine(canvas, preset.antialias, { stencil: true, powerPreference: 'high-performance', preserveDrawingBuffer: false }, false);
    this.engine.setHardwareScalingLevel(1 / Math.min(window.devicePixelRatio || 1, preset.maxPixelRatio));
    this.scene = new Scene(this.engine);
  }

  static async create(canvas: HTMLCanvasElement, quality: Quality, onProgress: (k: number, label: string) => void, opts: { showcase?: boolean } = {}) {
    const g = new Game(canvas, quality, !!opts.showcase);
    await g.build(onProgress);
    return g;
  }

  // ---------------------------------------------------------------- setup

  private async build(progress: (k: number, label: string) => void) {
    const scene = this.scene;
    const preset = QUALITY_PRESETS[this.quality];
    progress(0.05, 'Chuẩn bị ánh sáng…');
    const sky = '#a9daf3';
    scene.clearColor = Color4.FromHexString(`${sky}ff`);
    scene.fogMode = Scene.FOGMODE_LINEAR;
    scene.fogColor = hex(sky);
    scene.skipPointerMovePicking = true;

    const ip = scene.imageProcessingConfiguration;
    ip.toneMappingEnabled = false;
    ip.contrast = 1.15;
    ip.exposure = 1.0;
    ip.colorCurvesEnabled = true;
    ip.colorCurves = new ColorCurves();
    ip.colorCurves.globalSaturation = 8;
    ip.vignetteEnabled = true;
    ip.vignetteWeight = 0.9;
    ip.vignetteStretch = 0.5;
    ip.vignetteColor = new Color4(0.2, 0.32, 0.45, 0);
    ip.vignetteBlendMode = ImageProcessingConfiguration.VIGNETTEMODE_MULTIPLY;

    const hemi = new HemisphericLight('hemi', new Vector3(0.15, 1, -0.1), scene);
    hemi.intensity = 0.7;
    hemi.diffuse = hex('#e8f4ff');
    hemi.groundColor = hex('#a8c48c');
    hemi.specular = Color3.Black();

    this.sun = new DirectionalLight('sun', new Vector3(-0.62, -1, 0.42).normalize(), scene);
    this.sun.intensity = 2.2;
    this.sun.diffuse = hex('#fff0d2');
    this.sun.specular = hex('#fff6e0');
    this.sun.autoUpdateExtends = false;
    this.sun.shadowFrustumSize = 40;
    this.sun.shadowMinZ = 1;
    this.sun.shadowMaxZ = 120;

    this.rig = new CameraRig(scene, this.canvas);
    this.rig.onTap = (x, y) => this.handleTap(x, y);
    this.rig.onHover = (x, y) => this.handleHover(x, y);
    this.tweens = new Tweens(scene);
    this.fx = new Fx(scene);
    this.fx.scale = preset.particleScale;
    await tick();

    progress(0.15, 'Vẽ chất liệu…');
    const grain = grainTexture(scene);
    const grassTex = grassTexture(scene);
    grassTex.uScale = grassTex.vScale = 3;
    const soilTex = soilTexture(scene);
    soilTex.uScale = soilTex.vScale = 1.2;
    const crops = toonMaterial(scene, 'crops', { doubleSided: true, wind: 0.16, roughness: 0.5 });
    crops.specularIntensity = 0.45;
    this.mats = {
      props: toonMaterial(scene, 'props', { texture: grain }),
      soil: toonMaterial(scene, 'soil', { texture: soilTex, roughness: 0.95 }),
      grassGround: toonMaterial(scene, 'ground', { texture: grassTex, roughness: 0.95 }),
      crops,
      foliage: toonMaterial(scene, 'foliage', { wind: 0.0045, roughness: 0.85 }),
      grass: toonMaterial(scene, 'grass', { doubleSided: true, wind: 0.5, roughness: 0.85 }),
      cover: toonMaterial(scene, 'cover', { doubleSided: true, wind: 0.25, texture: grain }),
    };
    await tick();

    progress(0.25, 'Nạp mô hình…');
    await preloadAssets(scene);

    progress(0.4, 'Dựng đảo nông trại…');
    this.world = new World(scene, this.mats, preset);
    await tick();

    progress(0.65, 'Ươm cây trồng…');
    this.crops = new CropLibrary(scene, this.mats.crops);
    this.crops.warm();
    this.templates = buildTileTemplates(scene, this.mats);
    this.templates.ring.setEnabled(false);
    this.batches = new TileBatches(scene);
    this.sparkles = this.fx.sparkleField();
    await tick();

    progress(0.85, 'Dọn ô đất…');
    this.rebuildShadows(preset.shadowMapSize, preset.shadowPcfQuality);
    this.tileCtx = { scene, templates: this.templates, crops: this.crops, fx: this.fx, tweens: this.tweens, batches: this.batches, sparkles: this.sparkles, bobbing: this.bobbing };
    if (this.showcase) this.buildShowcase();
    else {
      this.syncTiles(false);
      this.focusCurrent(true);
      this.unsubStore = store.subscribe(() => this.syncTiles(true));
      this.fx.ambientMotes(new Vector3(0, 0, 0));
    }

    scene.onBeforeRenderObservable.add(() => this.beforeRender());
    scene.onAfterRenderObservable.add(() => this.frameListeners.forEach((f) => f()));
    await scene.whenReadyAsync();
    progress(1, 'Sẵn sàng!');
    this.engine.runRenderLoop(() => scene.render());
    window.addEventListener('resize', this.onResize);
  }

  private buildShowcase() {
    // all crops x all stages side by side, for art review (?showcase, or ?showcase=corn,pumpkin)
    this.world.setParcels(1);
    const pick = new URLSearchParams(location.search).get('showcase')?.split(',') ?? [];
    const crops = CROP_ORDER.filter((c) => !pick[0] || pick.includes(c));
    crops.forEach((crop, row) => {
      for (let s = 0; s < STAGE_COUNT; s++) {
        const v = new TileView(this.tileCtx, 1000 + row * 10 + s, (s - 2) * 1.55, ((crops.length - 1) / 2 - row) * 1.75);
        v.forceStage(crop, s);
      }
    });
    this.rig.focus(new Vector3(0, 0, 0), 7 + crops.length * 1.7, true);
  }

  private rebuildShadows(size: number, q: 'low' | 'medium' | 'high') {
    this.shadowGen?.dispose();
    const sg = new ShadowGenerator(size, this.sun);
    sg.usePercentageCloserFiltering = true;
    sg.filteringQuality = q === 'high' ? ShadowGenerator.QUALITY_HIGH : q === 'medium' ? ShadowGenerator.QUALITY_MEDIUM : ShadowGenerator.QUALITY_LOW;
    sg.bias = 0.0015;
    sg.normalBias = 0.015;
    sg.setDarkness(0.15);
    this.shadowGen = sg;
    this.world?.attachShadows(sg);
    this.batches?.attachShadows(sg);
  }

  // ---------------------------------------------------------------- loop

  private beforeRender() {
    const dt = Math.min(this.engine.getDeltaTime() / 1000, 0.1);
    this.time += dt;
    WindPlugin.time = this.time;
    const target = this.rig.target;
    const r = this.rig.radius;
    this.world.setFocus(target);
    this.world.update(this.time, dt);
    // shadows and haze follow the camera so zooming out to the overview still works
    this.sun.position.copyFrom(target.subtract(this.sun.direction.scale(50)));
    const frustum = Math.round(Math.max(26, Math.min(90, r * 1.5)) / 4) * 4;
    if (this.sun.shadowFrustumSize !== frustum) this.sun.shadowFrustumSize = frustum;
    // fog is measured from the (orthographic) camera, which always sits a fixed distance away
    this.scene.fogStart = this.rig.camera.radius + r * 0.6 + 14;
    this.scene.fogEnd = this.rig.camera.radius + r * 0.6 + 100;
    this.updateFar();
    if (!this.far) for (const v of this.bobbing) v.bob(dt);
    this.sparkleTimer += dt;
    if (this.sparkleTimer > 0.25) {
      this.sparkleTimer = 0;
      // sparkles only around what is on screen, and none in the far overview
      this.sparkles.focus(target, this.far ? 0 : r * 0.75);
    }
    this.syncTimer += dt;
    if (this.syncTimer > 0.2 && !this.showcase) {
      this.syncTimer = 0;
      this.syncTiles(true);
    }
    const ring = this.templates.ring;
    if (ring.isEnabled()) (ring.material as StandardMaterial).alpha = 0.55 + Math.sin(this.time * 6) * 0.3;
  }

  /** Camera distance that frames one whole parcel. */
  private get parcelRadius() {
    return this.rig.fitRadius(ISLAND_SIZE * 1.45);
  }

  private updateFar() {
    const far = this.rig.radius > this.parcelRadius * 1.6;
    if (far === this.far) return;
    this.far = far;
    this.batches.setFar(far);
    // shadows cost a second pass over every tile; the overview is too small to need them
    this.sun.shadowEnabled = !far;
    if (!far) for (const v of this.bobbing) v.bob(0);
    this.overview = far;
    this.emit({ type: 'view', overview: far });
  }

  /** Frame one parcel (from the overview, tapping a parcel zooms into it). */
  focusParcel(k: number) {
    const c = parcelCenter(k);
    this.overview = false;
    this.rig.focus(new Vector3(c.x, 0, c.z - 0.6), this.parcelRadius, false);
  }

  /** Parcel under a screen point, if any (only those with tiles, plus the wild one to come). */
  private parcelAt(x: number, y: number): number | null {
    const ray = this.scene.createPickingRay(x, y, Matrix.Identity(), this.rig.camera);
    if (Math.abs(ray.direction.y) < 1e-4) return null;
    const p = ray.origin.add(ray.direction.scale(-ray.origin.y / ray.direction.y));
    const half = ISLAND_SIZE / 2 + 0.3;
    for (let k = 0; k <= this.parcels; k++) {
      const c = parcelCenter(k);
      if (Math.abs(p.x - c.x) <= half && Math.abs(p.z - c.z) <= half) return k;
    }
    return null;
  }

  private syncTiles(animate: boolean) {
    const tiles = store.tiles();
    const parcels = store.parcelCount();
    if (parcels !== this.parcels) {
      this.parcels = parcels;
      this.world.setParcels(parcels);
      this.updateBounds();
    }
    // drop views beyond the current tile set (e.g. after a reset)
    for (const [g, v] of this.tiles)
      if (g >= tiles.length) {
        v.dispose();
        this.tiles.delete(g);
      }
    const now = serverNow();
    for (const t of tiles) {
      let v = this.tiles.get(t.g);
      if (!v) {
        const { x, z } = tileWorldPos(t.g);
        v = new TileView(this.tileCtx, t.g, x, z);
        this.tiles.set(t.g, v);
      }
      v.sync(t, now, animate);
      const ready = !!t.crop && growthProgress(t, now) >= 1;
      if (ready && !this.readySet.has(t.g)) {
        this.readySet.add(t.g);
        if (animate) {
          sfx.grow();
          this.emit({ type: 'ready', g: t.g });
        }
      } else if (!ready) this.readySet.delete(t.g);
    }
  }

  private updateBounds() {
    const centers = Array.from({ length: this.parcels + 1 }, (_, k) => parcelCenter(k));
    const xs = centers.map((c) => c.x), zs = centers.map((c) => c.z);
    const h = ISLAND_SIZE / 2;
    this.rig.setBounds(Math.min(...xs) - h, Math.max(...xs) + h, Math.min(...zs) - h, Math.max(...zs) + h);
  }

  /** Centre on the parcel being filled. */
  focusCurrent(immediate = false) {
    const k = Math.min(this.parcels - 1, Math.floor(store.getState().unlocked / TILES_PER_PARCEL));
    const c = parcelCenter(Math.max(0, k));
    this.overview = false;
    this.rig.focus(new Vector3(c.x, 0, c.z - 0.6), this.rig.fitRadius(ISLAND_SIZE * 1.45), immediate);
  }

  /** Zoom out to see every parcel at once. */
  focusOverview() {
    const centers = Array.from({ length: this.parcels + 1 }, (_, k) => parcelCenter(k));
    const xs = centers.map((c) => c.x), zs = centers.map((c) => c.z);
    const cx = (Math.min(...xs) + Math.max(...xs)) / 2, cz = (Math.min(...zs) + Math.max(...zs)) / 2;
    const span = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...zs) - Math.min(...zs)) + ISLAND_SIZE;
    this.overview = true;
    this.rig.focus(new Vector3(cx, 0, cz), this.rig.fitRadius(span * 1.45), false);
  }

  toggleOverview() {
    if (this.overview) this.focusCurrent();
    else this.focusOverview();
    return this.overview;
  }

  private onResize = () => {
    this.engine.resize();
    this.rig.adaptToAspect();
  };

  // ---------------------------------------------------------------- input

  tileAt(x: number, y: number): number | null {
    const ray = this.scene.createPickingRay(x, y, Matrix.Identity(), this.rig.camera);
    if (Math.abs(ray.direction.y) < 1e-4) return null;
    const t = (SOIL_TOP * 0.5 - ray.origin.y) / ray.direction.y;
    const p = ray.origin.add(ray.direction.scale(t));
    const h = TILE_SIZE / 2 + 0.04;
    for (const [g, v] of this.tiles) if (Math.abs(p.x - v.center.x) <= h && Math.abs(p.z - v.center.z) <= h) return g;
    return null;
  }

  private handleHover(x: number, y: number) {
    if (this.far) {
      this.canvas.style.cursor = this.parcelAt(x, y) !== null ? 'zoom-in' : 'grab';
      return this.showRing(null);
    }
    const g = this.showcase ? null : this.tileAt(x, y);
    if (g === this.hovered) return;
    this.hovered = g;
    this.canvas.style.cursor = g !== null ? 'pointer' : 'grab';
    this.showRing(g);
  }

  private showRing(g: number | null) {
    const ring = this.templates.ring;
    const v = g === null ? undefined : this.tiles.get(g);
    if (!v) return ring.setEnabled(false);
    ring.position.set(v.center.x, v.center.y + 0.04, v.center.z);
    ring.setEnabled(true);
  }

  private handleTap(x: number, y: number) {
    sfx.resume();
    if (this.showcase) return;
    if (this.far) {
      const k = this.parcelAt(x, y);
      if (k !== null) {
        sfx.tap();
        this.focusParcel(k);
      }
      return;
    }
    const g = this.tileAt(x, y);
    if (g === null) return;
    const view = this.tiles.get(g)!;
    const st = store.tile(g);
    if (view.isBusy || !st) return;
    this.showRing(g);
    if (this.hovered === null) this.tweens.wait(0.6, () => this.hovered === null && this.showRing(null));
    if (!st.unlocked) this.emit({ type: 'tileTap', g, kind: st.next ? 'next' : 'locked' });
    else if (!st.crop) this.emit({ type: 'tileTap', g, kind: 'empty' });
    else if (growthProgress(st) >= 1) this.harvest(g);
    else {
      view.wiggle();
      sfx.tap();
      this.emit({ type: 'tileTap', g, kind: 'growing' });
    }
  }

  // ---------------------------------------------------------------- actions

  plant(g: number, crop: CropId) {
    const res = store.plant(g, crop);
    if (res.ok) sfx.plant();
    else sfx.error();
    return res;
  }

  /** Sow one crop on every empty tile the player can afford. */
  plantAll(crop: CropId) {
    const res = store.plantAll(crop);
    if (res.ok) sfx.plant();
    else sfx.error();
    return res;
  }

  harvest(g: number, bulk = false) {
    const view = this.tiles.get(g);
    const st = store.tile(g);
    if (!view || view.isBusy || !st?.crop || growthProgress(st) < 1) return false;
    if (!bulk) sfx.harvest();
    view.playHarvest(() => {
      const res = store.harvest(g);
      if (!res.ok) return;
      if (bulk) sfx.collect();
      const p = this.project(view.center.add(new Vector3(0, 0.8, 0)));
      this.emit({ type: 'harvested', g, crop: res.value.crop, amount: res.value.amount, xp: res.value.xp, x: p.x, y: p.y, bulk });
    });
    return true;
  }

  /** Harvest every ripe tile in a quick ripple. Returns how many were started. */
  harvestAll() {
    const now = serverNow();
    const ready = store.tiles().filter((t) => t.crop && growthProgress(t, now) >= 1).map((t) => t.g);
    if (!ready.length) return 0;
    sfx.harvest();
    ready.forEach((g, i) => this.tweens.wait(i * 0.07, () => this.harvest(g, true)));
    return ready.length;
  }

  unlockNext() {
    const res = store.unlockNext();
    if (res.ok) sfx.unlock();
    else sfx.error();
    return res;
  }

  // ---------------------------------------------------------------- UI bridge

  on(fn: (e: GameEvent) => void) {
    this.listeners.add(fn);
    return () => void this.listeners.delete(fn);
  }

  private emit(e: GameEvent) {
    this.listeners.forEach((l) => l(e));
  }

  onFrame(fn: () => void) {
    this.frameListeners.add(fn);
    return () => void this.frameListeners.delete(fn);
  }

  /** World -> CSS pixel coordinates relative to the canvas. */
  project(world: Vector3): ScreenPoint {
    const w = this.canvas.clientWidth, h = this.canvas.clientHeight;
    const p = Vector3.Project(world, Matrix.IdentityReadOnly, this.scene.getTransformMatrix(), this.rig.camera.viewport.toGlobal(w, h));
    return { x: p.x, y: p.y, visible: p.z > 0 && p.z < 1 };
  }

  tileAnchor(g: number, height = 1.05): ScreenPoint {
    const v = this.tiles.get(g);
    if (!v) return { x: 0, y: 0, visible: false };
    return this.project(v.center.add(new Vector3(0, height, 0)));
  }

  parcelAnchor(k: number, height = 0.6): ScreenPoint {
    const c = parcelCenter(k);
    return this.project(new Vector3(c.x, height, c.z));
  }

  get cameraRadius() {
    return this.rig.radius;
  }

  /** Zoomed out to the overview (taps pick a parcel, tile labels hidden). */
  get isFar() {
    return this.far;
  }

  /** Ground point at the centre of the view. */
  get viewTarget() {
    return this.rig.target;
  }

  get fps() {
    return this.engine.getFps();
  }

  setQuality(q: Quality) {
    const p = QUALITY_PRESETS[q];
    this.quality = q;
    this.engine.setHardwareScalingLevel(1 / Math.min(window.devicePixelRatio || 1, p.maxPixelRatio));
    this.fx.scale = p.particleScale;
    this.world.applyQuality(p);
    this.rebuildShadows(p.shadowMapSize, p.shadowPcfQuality);
  }

  private instrumentation: SceneInstrumentation | null = null;

  /** Debug numbers for profiling; draw calls are valid from the frame after the first call. */
  stats() {
    this.instrumentation ??= new SceneInstrumentation(this.scene);
    return {
      drawCalls: this.instrumentation.drawCallsCounter.current,
      activeMeshes: this.scene.getActiveMeshes().length,
      vertices: this.scene.getTotalVertices(),
      crops: this.crops.stats(),
      ...this.batches.stats(),
    };
  }

  /** Average per-frame timings (ms) over `ms`, for the benchmark script. */
  async profile(ms = 3000) {
    const si = new SceneInstrumentation(this.scene);
    si.captureFrameTime = si.captureRenderTime = si.captureActiveMeshesEvaluationTime = true;
    si.captureParticlesRenderTime = si.captureRenderTargetsRenderTime = si.captureInterFrameTime = true;
    await new Promise((r) => setTimeout(r, ms));
    const f = (c: { average: number }) => Math.round(c.average * 10) / 10;
    const out = {
      frame: f(si.frameTimeCounter),
      activeMeshes: f(si.activeMeshesEvaluationTimeCounter),
      render: f(si.renderTimeCounter),
      particles: f(si.particlesRenderTimeCounter),
      shadowMap: f(si.renderTargetsRenderTimeCounter),
      outsideBabylon: f(si.interFrameTimeCounter),
    };
    si.dispose();
    return out;
  }

  dispose() {
    window.removeEventListener('resize', this.onResize);
    this.unsubStore?.();
    this.rig.dispose();
    this.engine.stopRenderLoop();
    this.scene.dispose();
    this.engine.dispose();
  }
}
