import {
  Color3,
  Color4,
  ColorCurves,
  DirectionalLight,
  Engine,
  HemisphericLight,
  ImageProcessingConfiguration,
  Matrix,
  PBRMaterial,
  Scene,
  SceneInstrumentation,
  ShadowGenerator,
  StandardMaterial,
  Vector3,
} from '@babylonjs/core';
import { sfx } from './audio/sfx';
import { preloadAssets } from './assets/registry';
import { CROP_ORDER, CropId, GRID_SIZE, PLOT_SIZE, PLOT_SPACING, Quality, QUALITY_PRESETS, SOIL_TOP, STAGE_COUNT, UNLOCK_COSTS } from './config';
import { CameraRig } from './render/camera';
import { CropLibrary } from './render/crops';
import { buildEnvironment, Environment } from './render/environment';
import { Fx } from './render/fx';
import { hex } from './render/geometry';
import { MaterialLibrary, toonMaterial, WindPlugin } from './render/materials';
import { buildPlotTemplates, PlotTemplates, PlotView } from './render/plots';
import { buildPaths, buildPond, buildTerrain, Pond } from './render/terrain';
import { grainTexture, grassTexture, pathTexture, soilTexture, woodTexture } from './render/textures';
import { Tweens } from './render/tween';
import { growthProgress, store } from './state/store';

export type PlotKind = 'locked' | 'empty' | 'growing';

export type GameEvent =
  | { type: 'plotTap'; index: number; kind: PlotKind }
  | { type: 'barnTap' }
  | { type: 'harvested'; index: number; crop: CropId; amount: number; x: number; y: number }
  | { type: 'ready'; index: number };

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
  private templates!: PlotTemplates;
  private env!: Environment;
  private pond!: Pond;
  private plots: PlotView[] = [];
  private listeners = new Set<(e: GameEvent) => void>();
  private frameListeners = new Set<() => void>();
  private unsubStore: (() => void) | null = null;
  private time = 0;
  private syncTimer = 0;
  private readySet = new Set<number>();
  private hovered: number | null = null;
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
    scene.clearColor = Color4.FromHexString('#cdebc9ff');
    scene.fogMode = Scene.FOGMODE_LINEAR;
    scene.fogStart = 42;
    scene.fogEnd = 95;
    scene.fogColor = hex('#cdebc9');
    scene.skipPointerMovePicking = true;
    scene.skipFrustumClipping = false;

    const ip = scene.imageProcessingConfiguration;
    ip.toneMappingEnabled = false;
    ip.contrast = 1.18;
    ip.exposure = 0.95;
    ip.colorCurvesEnabled = true;
    ip.colorCurves = new ColorCurves();
    ip.colorCurves.globalSaturation = 6;
    ip.vignetteEnabled = true;
    ip.vignetteWeight = 1.3;
    ip.vignetteStretch = 0.4;
    ip.vignetteColor = new Color4(0.22, 0.3, 0.12, 0);
    ip.vignetteBlendMode = ImageProcessingConfiguration.VIGNETTEMODE_MULTIPLY;

    const hemi = new HemisphericLight('hemi', new Vector3(0.15, 1, -0.1), scene);
    hemi.intensity = 0.62;
    hemi.diffuse = hex('#e4f1ff');
    hemi.groundColor = hex('#8fae6a');
    hemi.specular = Color3.Black();

    this.sun = new DirectionalLight('sun', new Vector3(-0.62, -1, 0.42).normalize(), scene);
    this.sun.intensity = 2.25;
    this.sun.diffuse = hex('#fff0d2');
    this.sun.specular = hex('#fff6e0');
    this.sun.autoUpdateExtends = false;
    this.sun.shadowFrustumSize = 40;
    this.sun.shadowMinZ = 1;
    this.sun.shadowMaxZ = 90;

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
    const soilTex = soilTexture(scene);
    soilTex.uScale = soilTex.vScale = 1.6;
    const pathTex = pathTexture(scene);
    const path = toonMaterial(scene, 'path', { texture: pathTex, roughness: 0.95 });
    path.useAlphaFromAlbedoTexture = true;
    path.transparencyMode = PBRMaterial.PBRMATERIAL_ALPHABLEND;
    path.zOffset = -2;
    this.mats = {
      props: toonMaterial(scene, 'props', { texture: grain }),
      wood: toonMaterial(scene, 'wood', { texture: woodTexture(scene) }),
      soil: toonMaterial(scene, 'soil', { texture: soilTex, roughness: 0.95 }),
      grassGround: toonMaterial(scene, 'ground', { texture: grassTex, roughness: 0.95 }),
      path,
      crops: toonMaterial(scene, 'crops', { doubleSided: true, wind: 0.16, roughness: 0.7 }),
      foliage: toonMaterial(scene, 'foliage', { wind: 0.0045, roughness: 0.85 }),
      grass: toonMaterial(scene, 'grass', { doubleSided: true, wind: 0.5, roughness: 0.85 }),
      cover: toonMaterial(scene, 'cover', { doubleSided: true, wind: 0.25, texture: grain }),
    };
    await tick();

    progress(0.25, 'Nạp mô hình…');
    await preloadAssets(scene);

    progress(0.35, 'Tạo địa hình…');
    buildTerrain(scene, this.mats);
    buildPaths(scene, this.mats);
    this.pond = buildPond(scene, this.mats);
    await tick();

    progress(0.5, 'Trồng cây xanh…');
    this.env = buildEnvironment(scene, this.mats, preset);
    await tick();

    progress(0.7, 'Ươm cây trồng…');
    this.crops = new CropLibrary(scene, this.mats.crops);
    this.crops.warm();
    this.templates = buildPlotTemplates(scene, this.mats);
    this.templates.ring.setEnabled(false);
    await tick();

    progress(0.85, 'Dọn ô đất…');
    this.rebuildShadows(preset.shadowMapSize, preset.shadowPcfQuality);
    const ctx = { scene, templates: this.templates, crops: this.crops, fx: this.fx, tweens: this.tweens, shadows: () => this.shadowGen };
    if (this.showcase) this.buildShowcase();
    else {
      this.plots = UNLOCK_COSTS.map((_, i) => new PlotView(ctx, i));
      this.syncPlots(false);
      this.unsubStore = store.subscribe(() => this.syncPlots(true));
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
    // all crops x all stages side by side, for art review (?showcase)
    const ctx = { scene: this.scene, templates: this.templates, crops: this.crops, fx: this.fx, tweens: this.tweens, shadows: () => this.shadowGen };
    CROP_ORDER.forEach((crop, row) => {
      for (let s = 0; s < STAGE_COUNT; s++) {
        const v = new PlotView(ctx, 0, { x: (s - 2) * PLOT_SPACING, z: (1 - row) * PLOT_SPACING });
        v.forceStage(crop, s);
      }
    });
    this.rig.focus(new Vector3(0, 0, 0), 14, true);
  }

  private rebuildShadows(size: number, q: 'low' | 'medium' | 'high') {
    this.shadowGen?.dispose();
    const sg = new ShadowGenerator(size, this.sun);
    sg.usePercentageCloserFiltering = true;
    sg.filteringQuality = q === 'high' ? ShadowGenerator.QUALITY_HIGH : q === 'medium' ? ShadowGenerator.QUALITY_MEDIUM : ShadowGenerator.QUALITY_LOW;
    sg.bias = 0.0015;
    sg.normalBias = 0.015;
    sg.setDarkness(0.1);
    this.shadowGen = sg;
    this.env?.attachShadows(sg);
    this.plots.forEach((p) => p.reattachShadows(sg));
  }

  // ---------------------------------------------------------------- loop

  private beforeRender() {
    const dt = Math.min(this.engine.getDeltaTime() / 1000, 0.1);
    this.time += dt;
    WindPlugin.time = this.time;
    this.env.update(this.time, dt);
    this.pond.update(this.time);
    // shadow frustum follows the camera target
    const t = this.rig.target;
    this.sun.position.copyFrom(t.subtract(this.sun.direction.scale(40)));
    // keep the haze beyond the farm whatever the zoom level
    const r = this.rig.camera.radius;
    this.scene.fogStart = r + 18;
    this.scene.fogEnd = r + 70;
    this.syncTimer += dt;
    if (this.syncTimer > 0.2 && !this.showcase) {
      this.syncTimer = 0;
      this.syncPlots(true);
    }
    const ring = this.templates.ring;
    if (ring.isEnabled()) {
      (ring.material as StandardMaterial).alpha = 0.55 + Math.sin(this.time * 6) * 0.3;
    }
  }

  private syncPlots(animate: boolean) {
    const s = store.getState();
    const now = Date.now();
    s.plots.forEach((p, i) => {
      this.plots[i]?.sync(p, now, animate);
      const ready = !!p.crop && growthProgress(p, now) >= 1;
      if (ready && !this.readySet.has(i)) {
        this.readySet.add(i);
        if (animate) {
          sfx.grow();
          this.emit({ type: 'ready', index: i });
        }
      } else if (!ready) this.readySet.delete(i);
    });
  }

  private onResize = () => {
    this.engine.resize();
    this.rig.adaptToAspect();
  };

  // ---------------------------------------------------------------- input

  private rayToGround(x: number, y: number) {
    const ray = this.scene.createPickingRay(x, y, Matrix.Identity(), this.rig.camera);
    if (Math.abs(ray.direction.y) < 1e-4) return { ray, point: null };
    const t = (SOIL_TOP - ray.origin.y) / ray.direction.y;
    return { ray, point: ray.origin.add(ray.direction.scale(t)) };
  }

  plotAt(x: number, y: number): number | null {
    const { point } = this.rayToGround(x, y);
    if (!point) return null;
    const off = (GRID_SIZE - 1) / 2;
    const col = Math.round(point.x / PLOT_SPACING + off);
    const row = Math.round(point.z / PLOT_SPACING + off);
    if (col < 0 || row < 0 || col >= GRID_SIZE || row >= GRID_SIZE) return null;
    const cx = (col - off) * PLOT_SPACING, cz = (row - off) * PLOT_SPACING;
    if (Math.abs(point.x - cx) > PLOT_SIZE / 2 + 0.08 || Math.abs(point.z - cz) > PLOT_SIZE / 2 + 0.08) return null;
    return row * GRID_SIZE + col;
  }

  private handleHover(x: number, y: number) {
    const idx = this.showcase ? null : this.plotAt(x, y);
    if (idx === this.hovered) return;
    this.hovered = idx;
    this.canvas.style.cursor = idx !== null ? 'pointer' : 'grab';
    this.showRing(idx);
  }

  private showRing(idx: number | null) {
    const ring = this.templates.ring;
    if (idx === null) return ring.setEnabled(false);
    const c = this.plots[idx].center;
    ring.position.set(c.x, 0.32, c.z);
    ring.setEnabled(true);
  }

  private handleTap(x: number, y: number) {
    sfx.resume();
    if (this.showcase) return;
    const idx = this.plotAt(x, y);
    if (idx === null) {
      const { ray } = this.rayToGround(x, y);
      const hit = this.scene.pickWithRay(ray, (m) => m === this.env.barn);
      if (hit?.hit) {
        sfx.tap();
        this.emit({ type: 'barnTap' });
      }
      return;
    }
    const view = this.plots[idx];
    if (view.isBusy) return;
    this.showRing(idx);
    if (this.hovered === null) this.tweens.wait(0.6, () => this.hovered === null && this.showRing(null));
    const st = store.getState().plots[idx];
    if (!st.unlocked) this.emit({ type: 'plotTap', index: idx, kind: 'locked' });
    else if (!st.crop) this.emit({ type: 'plotTap', index: idx, kind: 'empty' });
    else if (growthProgress(st) >= 1) this.harvest(idx);
    else {
      view.wiggle();
      sfx.tap();
      this.emit({ type: 'plotTap', index: idx, kind: 'growing' });
    }
  }

  // ---------------------------------------------------------------- actions

  plant(index: number, crop: CropId) {
    const res = store.plant(index, crop);
    if (res.ok) sfx.plant();
    else sfx.error();
    return res;
  }

  harvest(index: number) {
    const view = this.plots[index];
    if (view.isBusy) return;
    const st = store.getState().plots[index];
    if (!st.crop || growthProgress(st) < 1) return;
    sfx.harvest();
    view.playHarvest(() => {
      const res = store.harvest(index);
      if (!res.ok) return;
      const p = this.project(view.center.add(new Vector3(0, 0.8, 0)));
      this.emit({ type: 'harvested', index, crop: res.value.crop, amount: res.value.amount, x: p.x, y: p.y });
    });
  }

  unlock(index: number) {
    const res = store.unlock(index);
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

  plotAnchor(index: number, height = 1.05) {
    const v = this.plots[index];
    return this.project(v.center.add(new Vector3(0, height, 0)));
  }

  get fps() {
    return this.engine.getFps();
  }

  setQuality(q: Quality) {
    const p = QUALITY_PRESETS[q];
    this.quality = q;
    this.engine.setHardwareScalingLevel(1 / Math.min(window.devicePixelRatio || 1, p.maxPixelRatio));
    this.fx.scale = p.particleScale;
    this.env.applyQuality(p);
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
    };
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
