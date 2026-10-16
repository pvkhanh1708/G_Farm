// Babylon is imported per module (tree-shaken); these add the scene features the game uses.
import '@babylonjs/core/Culling/ray.js';
import '@babylonjs/core/Meshes/thinInstanceMesh.js';
import '@babylonjs/core/Lights/Shadows/shadowGeneratorSceneComponent.js';
import '@babylonjs/core/Engines/Extensions/engine.dynamicTexture.js';
import '@babylonjs/core/Particles/particleSystemComponent.js';
import { Engine } from '@babylonjs/core/Engines/engine.js';
import { SceneInstrumentation } from '@babylonjs/core/Instrumentation/sceneInstrumentation.js';
import { DirectionalLight } from '@babylonjs/core/Lights/directionalLight.js';
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight.js';
import { ShadowGenerator } from '@babylonjs/core/Lights/Shadows/shadowGenerator.js';
import { ColorCurves } from '@babylonjs/core/Materials/colorCurves.js';
import { ImageProcessingConfiguration } from '@babylonjs/core/Materials/imageProcessingConfiguration.js';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial.js';
import { Color3, Color4 } from '@babylonjs/core/Maths/math.color.js';
import { Matrix, Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import { Scene } from '@babylonjs/core/scene.js';
import { Mesh } from '@babylonjs/core/Meshes/mesh.js';
import { sfx } from './audio/sfx';
import { artUrl } from './art';
import { preloadAssets } from './assets/registry';
import { AnimalId, CROP_ORDER, CropId, ISLAND_SIZE, PENS, PENS_X1, TILE_PITCH, parcelCenter, Quality, QUALITY_PRESETS, SOIL_TOP, STAGE_COUNT, TILE_SIZE, TILES_PER_PARCEL, tileWorldPos } from './config';
import { CameraRig } from './render/camera';
import { SpriteLibrary } from './render/sprites';
import { Fx } from './render/fx';
import { hex } from './render/geometry';
import { MaterialLibrary, toonMaterial, WindPlugin } from './render/materials';
import { buildTileTemplates, TileContext, TileTemplates, TileView } from './render/tiles';
import { grainTexture, grassTexture, soilTexture } from './render/textures';
import { Tweens } from './render/tween';
import { World } from './render/world';
import { serverNow } from './net/clock';
import { TileBatches } from './render/batch';
import { Billboards } from './render/billboards';
import { AnimalPen } from './render/animals';
import type { SparkleField } from './render/fx';
import { growthProgress, store, TileState } from './state/store';

export type TileKind = 'locked' | 'next' | 'empty' | 'growing';

export type GameEvent =
  | { type: 'tileTap'; g: number; kind: TileKind }
  | { type: 'harvested'; g: number; crop: CropId; amount: number; xp: number; x: number; y: number; bulk: boolean }
  | { type: 'ready'; g: number }
  /** An animal in the pen was tapped (index into state.animals; x/y on screen). */
  | { type: 'animalTap'; index: number; x: number; y: number }
  /** A building in the scene was tapped. */
  | { type: 'buildingTap'; kind: Building['kind'] }
  /** While visiting a neighbour: a ripe tile (take some) or a growing one (water it). */
  | { type: 'visitTap'; g: number; action: 'steal' | 'help'; x: number; y: number }
  /** A pen's feeder or water was tapped. */
  | { type: 'stationTap'; pen: AnimalId; kind: 'feeder' | 'water' | 'product'; x: number; y: number }
  /** The camera crossed between the close farm view and the zoomed-out overview. */
  | { type: 'view'; overview: boolean };

/** A neighbour's farm shown in place of the player's own. */
export interface VisitFarm {
  unlocked: number;
  plantings: Array<{ tile: number; crop: CropId; plantedAt: number; growMs: number; steal: number; helped: boolean }>;
}

/** Things standing on the farm that open a window when tapped. */
interface Building {
  kind: 'workshop' | 'upgrades' | 'pens';
  at: Vector3;
  size: number;
  mesh: Mesh | null;
}

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
  private sprites!: SpriteLibrary;
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
  private pen: AnimalPen | null = null;
  /** Seed of the quick-sow tool (set by the UI): dragging over empty tiles sows it. */
  sowTool: CropId | null = null;
  private paintMode: 'harvest' | 'sow' | 'visit' | null = null;
  /** While visiting: what a tap or a swipe over the crops does (null: steal ripe ones, water the others). */
  visitTool: 'steal' | 'help' | null = null;
  /** A neighbour's farm on show instead of ours (null = at home). */
  private visit: { tiles: TileState[]; unlocked: number; plantings: VisitFarm['plantings'] } | null = null;
  private buildings: Building[] = [];
  private goodsBubble: Mesh | null = null;
  private painted = new Set<number>();
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
    this.rig.onPaintStart = (x, y) => this.paintStart(x, y);
    this.rig.onPaint = (x, y) => this.paint(x, y);
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
    this.mats = {
      props: toonMaterial(scene, 'props', { texture: grain }),
      soil: toonMaterial(scene, 'soil', { texture: soilTex, roughness: 0.95 }),
      grassGround: toonMaterial(scene, 'ground', { texture: grassTex, roughness: 0.95 }),
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
    this.sprites = new SpriteLibrary(scene);
    // art for the ground and the crops already planted now; the other crops after loading
    const planted = new Set(Object.values(store.getState().plantings).map((p) => p.crop));
    const firstArt = (key: string) => !key.startsWith('crop:') || planted.has(key.split(':')[1] as CropId);
    await Promise.race([this.sprites.loadArt(firstArt, true), new Promise((r) => setTimeout(r, 4000))]);
    this.templates = buildTileTemplates(scene, this.sprites);
    this.templates.ring.setEnabled(false);
    this.batches = new TileBatches(scene);
    this.sparkles = this.fx.sparkleField();
    const billboards = new Billboards(scene);
    await tick();

    progress(0.85, 'Dọn ô đất…');
    this.rebuildShadows(preset.shadowMapSize, preset.shadowPcfQuality);
    this.tileCtx = { scene, templates: this.templates, sprites: this.sprites, fx: this.fx, tweens: this.tweens, batches: this.batches, sparkles: this.sparkles, billboards, bobbing: this.bobbing };
    if (this.showcase) this.buildShowcase();
    else {
      this.pen = new AnimalPen(scene, billboards);
      this.buildBuildings(billboards);
      this.syncTiles(false);
      this.focusCurrent(true);
      this.unsubStore = store.subscribe(() => this.syncTiles(true));
      this.fx.ambientMotes(new Vector3(0, 0, 0));
    }

    scene.onBeforeRenderObservable.add(() => this.beforeRender());
    scene.onAfterRenderObservable.add(() => this.frameListeners.forEach((f) => f()));
    // never hang on the loading screen because one texture did not arrive
    await Promise.race([scene.whenReadyAsync(), new Promise((r) => setTimeout(r, 6000))]);
    void this.sprites.loadArt(firstArt, false);
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
        const v = new TileView(this.tileCtx, 1000 + row * 10 + s, (s - 2) * TILE_PITCH, ((crops.length - 1) / 2 - row) * TILE_PITCH);
        v.forceStage(crop, s);
      }
    });
    this.rig.focus(new Vector3(0, 0, 0), this.rig.fitRadius(Math.max(5, crops.length) * TILE_PITCH * 1.2), true);
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
    this.scene.fogStart = this.rig.distance + r * 0.6 + 14;
    this.scene.fogEnd = this.rig.distance + r * 0.6 + 100;
    this.updateFar();
    if (!this.far) for (const v of this.bobbing) v.bob(dt);
    this.pen?.update(dt);
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
    return this.rig.fitRadius(ISLAND_SIZE * 1.12);
  }

  private updateFar() {
    // the camera no longer zooms, so the far overview never applies
    const far = false;
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
    this.rig.focus(new Vector3(c.x, 0, c.z), this.parcelRadius, false);
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

  /** Tiles on show: ours, or the neighbour's we are visiting. */
  private get shownTiles() {
    return this.visit?.tiles ?? store.tiles();
  }

  private syncTiles(animate: boolean) {
    const tiles = this.shownTiles;
    const parcels = this.visit ? Math.floor(this.visit.unlocked / TILES_PER_PARCEL) + 1 : store.parcelCount();
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
    const home = !this.visit;
    // a visit shows the neighbour's fields; their pens stay empty
    this.pen?.sync(home ? store.getState().animals : [], home ? store.getState().water : {}, now);
    this.pen?.setDog(home && store.getState().dog);
    this.syncBuildings(now);
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
    // the animal pen sits right of the farm block
    this.rig.setBounds(Math.min(...xs) - h, Math.max(PENS_X1 + 1.2, Math.max(...xs) + h), Math.min(...zs) - h, Math.max(...zs) + h);
  }

  /** Centre on the parcel being filled. */
  focusCurrent(immediate = false) {
    const k = Math.min(this.parcels - 1, Math.floor((this.visit?.unlocked ?? store.getState().unlocked) / TILES_PER_PARCEL));
    const c = parcelCenter(Math.max(0, k));
    this.overview = false;
    this.rig.focus(new Vector3(c.x, 0, c.z), this.parcelRadius, immediate);
  }

  /** Zoom out to see every parcel at once. */
  focusOverview() {
    const centers = Array.from({ length: this.parcels + 1 }, (_, k) => parcelCenter(k));
    const xs = centers.map((c) => c.x), zs = centers.map((c) => c.z);
    const cx = (Math.min(...xs) + Math.max(...xs)) / 2, cz = (Math.min(...zs) + Math.max(...zs)) / 2;
    const span = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...zs) - Math.min(...zs)) + ISLAND_SIZE;
    this.overview = true;
    this.rig.focus(new Vector3(cx, 0, cz), this.rig.fitRadius(span * 1.1), false);
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
    // just above the flat tile sprite (tiles lie at y 0.02), not at the old raised soil height
    ring.position.set(v.center.x, 0.03, v.center.z);
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
    if (this.visit) return this.visitTap(x, y);
    const a = this.animalAt(x, y);
    if (a) return this.emit({ type: 'animalTap', index: a.index, x: a.x, y: a.y });
    const station = this.stationAt(x, y);
    if (station) return this.emit({ type: 'stationTap', pen: station.type, kind: station.kind, x: station.x, y: station.y });
    const b = this.buildingAt(x, y);
    if (b) {
      sfx.tap();
      return this.emit({ type: 'buildingTap', kind: b.kind });
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

  /** Animal under a screen point (the picture is about as wide as it is tall). */
  private animalAt(x: number, y: number): { index: number; x: number; y: number } | null {
    if (!this.pen) return null;
    const ppu = this.rig.pixelsPerUnit;
    let best: { index: number; x: number; y: number; d: number } | null = null;
    this.pen.positions().forEach(({ pos, size }, index) => {
      const p = this.project(pos.add(new Vector3(0, size * 0.45, 0)));
      const d = Math.hypot(p.x - x, p.y - y);
      if (d < size * 0.55 * ppu && (!best || d < best.d)) best = { index, x: p.x, y: p.y, d };
    });
    return best;
  }

  // ---------------------------------------------------------------- buildings

  private buildBuildings(boards: Billboards) {
    const spot = (kind: Building['kind'], key: 'workshop' | 'sprinkler' | null, x: number, z: number, size: number) => {
      let mesh: Mesh | null = null;
      // only with a picture drawn for the scene (props/<key>.png, isometric); a shop icon looks wrong there
      if (key && !artUrl(`props/${key}.png`)) return;
      if (key) {
        mesh = boards.quad(key, size, { bottom: true }).clone(`building-${kind}`);
        mesh.isVisible = true;
        mesh.position.set(x, 0, z);
      }
      this.buildings.push({ kind, at: new Vector3(x, 0, z), size, mesh });
    };
    // the workshop beside the chicken coop, the sprinkler (upgrades) in front of the first field
    spot('workshop', 'workshop', PENS_X1 + 2.1, -1.9, 2.6);
    spot('upgrades', 'sprinkler', 0, 1.9, 1.1);
    // the coop itself opens the pens window (it is drawn by the pen)
    spot('pens', null, PENS.chicken.x0 + 0.74 * (PENS.chicken.x1 - PENS.chicken.x0), PENS.chicken.z0 + 0.82 * (PENS.chicken.z1 - PENS.chicken.z0), 2.1);
    if (!this.buildings.some((b) => b.kind === 'workshop')) return;
    this.goodsBubble = boards.quad('goods', 0.62, { onTop: true }).clone('workshop-bubble');
    this.goodsBubble.position.set(PENS_X1 + 2.1, 2.9, -1.9);
  }

  /** Buildings hide while visiting; the workshop shows a bubble when batches are done. */
  private syncBuildings(now: number) {
    for (const b of this.buildings) b.mesh?.setEnabled(!this.visit);
    if (!this.goodsBubble) return;
    const machines = store.getState().machines;
    const done = Object.values(machines).some((m) => m?.queue.some((j) => j.readyAt <= now));
    this.goodsBubble.isVisible = !this.visit && done;
    if (this.goodsBubble.isVisible) this.goodsBubble.position.y = 2.9 + Math.abs(Math.sin(this.time * 2.6)) * 0.15;
  }

  private buildingAt(x: number, y: number) {
    const ppu = this.rig.pixelsPerUnit;
    for (const b of this.buildings) {
      const p = this.project(b.at.add(new Vector3(0, b.size * 0.4, 0)));
      if (Math.abs(p.x - x) < b.size * 0.45 * ppu && Math.abs(p.y - y) < b.size * 0.45 * ppu) return b;
    }
    return null;
  }

  // ---------------------------------------------------------------- visiting a neighbour

  /** Show a neighbour's farm in place of ours (null: back home). */
  setVisit(farm: VisitFarm | null) {
    const fresh = !this.visit !== !farm || (farm && this.visit && farm.unlocked !== this.visit.unlocked);
    if (!farm) this.visit = null;
    else {
      const now = serverNow();
      const at = new Map(farm.plantings.map((p) => [p.tile, p]));
      const tiles: TileState[] = [];
      const parcels = Math.floor(farm.unlocked / TILES_PER_PARCEL) + 1;
      for (let g = 0; g < parcels * TILES_PER_PARCEL; g++) {
        const p = at.get(g);
        tiles.push({
          g, parcel: Math.floor(g / TILES_PER_PARCEL), unlocked: g < farm.unlocked, next: false,
          crop: p?.crop ?? null, plantedAt: p?.plantedAt ?? null, growMs: p?.growMs,
          // ripe already and nothing left for us: no bubble
          noBadge: !!p && p.steal === 0 && p.plantedAt + p.growMs <= now,
        });
      }
      this.visit = { tiles, unlocked: farm.unlocked, plantings: farm.plantings };
    }
    if (fresh) {
      // a different farm: rebuild every tile view without the pop-in animations
      for (const v of this.tiles.values()) v.dispose();
      this.tiles.clear();
      this.readySet.clear();
      this.parcels = 0;
    }
    this.syncTiles(!fresh);
    if (fresh) this.focusCurrent(true);
  }

  get visiting() {
    return this.visit !== null;
  }

  private visitTap(x: number, y: number) {
    const g = this.tileAt(x, y);
    if (g !== null) this.visitAct(g);
  }

  /** Steal from / water one tile of the visited farm, as the picked tool (or the tile's state) says. */
  private visitAct(g: number) {
    const v = this.visit!;
    const t = v.tiles[g];
    const p = v.plantings.find((q) => q.tile === g);
    const view = this.tiles.get(g);
    if (!t?.crop || !p || !view) return;
    const pt = this.tileAnchor(g, 0.8);
    const ripe = growthProgress(t) >= 1;
    const action = this.visitTool ?? (ripe ? 'steal' : 'help');
    if (action === 'steal' && ripe && !t.noBadge) this.emit({ type: 'visitTap', g, action, x: pt.x, y: pt.y });
    else if (action === 'help' && !ripe && !p.helped) {
      view.wiggle();
      this.emit({ type: 'visitTap', g, action, x: pt.x, y: pt.y });
    } else if (!this.visitTool) {
      view.wiggle();
      sfx.tap();
    }
  }

  /** The visitor took crops from a tile: the same burst as a harvest. */
  stolen(g: number) {
    const v = this.tiles.get(g);
    if (!v) return;
    this.fx.sparkleBurst(v.center.add(new Vector3(0, 0.6, 0)), 20);
    this.fx.leafBurst(v.center.add(new Vector3(0, 0.35, 0)), 10);
  }

  /** Feeder or water trough under a screen point. */
  private stationAt(x: number, y: number) {
    if (!this.pen) return null;
    const ppu = this.rig.pixelsPerUnit;
    for (const s of this.pen.pickable) {
      const p = this.project(s.at.add(new Vector3(0, s.size * 0.3, 0)));
      if (Math.abs(p.x - x) < s.size * 0.5 * ppu && Math.abs(p.y - y) < s.size * 0.4 * ppu) return { ...s, x: p.x, y: p.y };
    }
    return null;
  }

  /** Drag starting on a ripe crop harvests along the way; with the sow tool, on an empty tile it sows. */
  private paintStart(x: number, y: number) {
    if (this.showcase || this.far) return false;
    if (this.visit) {
      // with a tool picked, a swipe that starts on a crop steals / waters each one it crosses;
      // starting anywhere else pans the view as usual
      const start = this.tileAt(x, y);
      if (!this.visitTool || start === null || !this.visit.tiles[start]?.crop) return false;
      this.painted.clear();
      this.paintMode = 'visit';
      this.paint(x, y);
      return true;
    }
    const g = this.tileAt(x, y);
    const st = g === null ? undefined : store.tile(g);
    this.painted.clear();
    this.paintMode = null;
    if (!st?.unlocked) return false;
    if (st.crop && growthProgress(st) >= 1) this.paintMode = 'harvest';
    else if (!st.crop && this.sowTool) this.paintMode = 'sow';
    if (this.paintMode) this.paint(x, y);
    return this.paintMode !== null;
  }

  private paint(x: number, y: number) {
    const g = this.tileAt(x, y);
    if (g === null || this.painted.has(g)) return;
    if (this.paintMode === 'visit') {
      this.painted.add(g);
      return this.visitAct(g);
    }
    const st = store.tile(g);
    if (!st?.unlocked) return;
    this.painted.add(g);
    if (this.paintMode === 'harvest' && st.crop && growthProgress(st) >= 1) this.harvest(g, this.painted.size > 1);
    else if (this.paintMode === 'sow' && !st.crop) this.emit({ type: 'tileTap', g, kind: 'empty' });
  }

  /** Puff of soil + sparkles on tiles that were just fertilized. */
  puff(tiles: number[]) {
    for (const g of tiles) {
      const v = this.tiles.get(g);
      if (!v) continue;
      this.fx.dustPuff(v.center.add(new Vector3(0, 0.2, 0)), 8);
      this.fx.sparkleBurst(v.center.add(new Vector3(0, 0.5, 0)), 10);
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

  /** Dig up crops (no refund): a puff of soil on each tile, then the tiles are empty. */
  dig(tiles: number[]) {
    const res = store.dig(tiles);
    if (!res.ok) {
      sfx.error();
      return res;
    }
    sfx.plant();
    for (const g of res.value) {
      const v = this.tiles.get(g);
      if (v) this.fx.dustPuff(v.center.add(new Vector3(0, 0.1, 0)), 10);
    }
    return res;
  }

  unlockNext() {
    const res = store.unlockNext();
    if (res.ok) {
      sfx.unlock();
      // the parcel is full: after the unlock animation, move on to the next one
      if (store.getState().unlocked % TILES_PER_PARCEL === 0) this.tweens.wait(1.1, () => this.focusCurrent());
    } else sfx.error();
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

  /** On-screen width of one tile in CSS pixels (labels scale with it). */
  get tilePixels() {
    return this.rig.pixelsPerUnit * TILE_SIZE;
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
