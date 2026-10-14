import {
  Color3,
  CreateBoxVertexData,
  CreateGroundVertexData,
  InstancedMesh,
  Mesh,
  ParticleSystem,
  Scene,
  ShadowGenerator,
  StandardMaterial,
  TransformNode,
  Vector3,
  VertexData,
} from '@babylonjs/core';
import { CropId, PLOT_SIZE, SOIL_TOP } from '../config';
import { PlotState, growthStage } from '../state/store';
import { CropLibrary, ridgeY } from './crops';
import { Fx } from './fx';
import { blade, blob, GeoBuilder, hex, jitter, mix, mulberry, noise3, tf } from './geometry';
import { MaterialLibrary } from './materials';
import { terrainHeight } from './terrain';
import { ease, Tweens } from './tween';

const FRAME_H = 0.3;
/** Crop templates have y=0 at the soil base. */
const CROP_BASE = SOIL_TOP - 0.02;
const INNER = PLOT_SIZE - 0.2;

// ------------------------------------------------------------------ templates

function buildFrame(scene: Scene, mats: MaterialLibrary) {
  const g = new GeoBuilder();
  const r = mulberry(42);
  const wood = hex('#a86b3d');
  const half = PLOT_SIZE / 2;
  const t = 0.11;
  // four planks, slightly irregular so it reads hand-built
  const planks: Array<[number, number, number, number]> = [
    [0, -half + t / 2, PLOT_SIZE - 0.04, t],
    [0, half - t / 2, PLOT_SIZE - 0.04, t],
    [-half + t / 2, 0, t, PLOT_SIZE - 0.04],
    [half - t / 2, 0, t, PLOT_SIZE - 0.04],
  ];
  for (const [x, z, w, d] of planks) {
    const vd = CreateBoxVertexData({ width: w, height: FRAME_H + 0.15, depth: d });
    g.add(vd, tf([x, (FRAME_H - 0.15) / 2, z], (r() - 0.5) * 0.02, 1, 0, (r() - 0.5) * 0.02), (l) =>
      mix(jitter(wood, 0.06, r), hex('#d39a63'), l.y > FRAME_H / 2 - 0.01 ? 0.6 : 0),
    );
  }
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) {
      const vd = CreateBoxVertexData({ width: 0.17, height: FRAME_H + 0.08, depth: 0.17 });
      g.add(vd, tf([sx * (half - 0.07), (FRAME_H + 0.08) / 2, sz * (half - 0.07)], r() * 0.2), (l) =>
        l.y > 0.17 ? hex('#d6a06a') : hex('#94603a'),
      );
    }
  const m = g.build('plot-frame', scene, mats.wood);
  m.isVisible = false;
  return m;
}

function buildSoil(scene: Scene, mats: MaterialLibrary) {
  const vd = CreateGroundVertexData({ width: INNER, height: INNER, subdivisions: 40 });
  const p = vd.positions as number[];
  const colors: number[] = [];
  const dark = hex('#6d4329');
  const light = hex('#b07b4e');
  for (let i = 0; i < p.length; i += 3) {
    const x = p[i], z = p[i + 2];
    const edge = Math.min(INNER / 2 - Math.abs(x), INNER / 2 - Math.abs(z));
    const fall = Math.min(1, edge / 0.12);
    const n = noise3(x * 9, 3, z * 9) - 0.5;
    const h = ridgeY(z) * fall + n * 0.012;
    p[i + 1] = SOIL_TOP - 0.02 + h;
    const c = mix(dark, light, (h / (2 * 0.035)) * 0.8 + n * 0.5 + 0.1);
    colors.push(c.r, c.g, c.b, 1);
  }
  vd.colors = colors;
  const normals: number[] = [];
  VertexData.ComputeNormals(p, vd.indices!, normals);
  vd.normals = normals;
  // under-fill so no gap shows between soil and frame
  const g = new GeoBuilder();
  g.add(vd, tf([0, 0, 0]));
  g.add(CreateBoxVertexData({ width: INNER, height: SOIL_TOP - 0.03, depth: INNER }), tf([0, (SOIL_TOP - 0.03) / 2, 0]), dark);
  const m = g.build('plot-soil', scene, mats.soil);
  m.isVisible = false;
  return m;
}

function buildCover(scene: Scene, mats: MaterialLibrary, variant: number) {
  const g = new GeoBuilder();
  const r = mulberry(500 + variant * 97);
  const grass = hex('#5aa83a');
  const grassLight = hex('#97d85c');
  // grassy mound
  const mound = CreateGroundVertexData({ width: PLOT_SIZE, height: PLOT_SIZE, subdivisions: 14 });
  const p = mound.positions as number[];
  const half = PLOT_SIZE / 2, rr = 0.45;
  for (let i = 0; i < p.length; i += 3) {
    let x = p[i], z = p[i + 2];
    // round the corners so the patch reads as natural overgrowth, not a tile
    const cx = Math.abs(x) - (half - rr), cz = Math.abs(z) - (half - rr);
    if (cx > 0 && cz > 0) {
      const d = Math.hypot(cx, cz);
      if (d > rr) {
        x = Math.sign(x) * (half - rr + (cx / d) * rr);
        z = Math.sign(z) * (half - rr + (cz / d) * rr);
      }
    }
    const wob = 1 + (noise3(x * 2 + variant, 4, z * 2) - 0.5) * 0.12;
    p[i] = x * wob;
    p[i + 2] = z * wob;
    const edge = Math.min(half - Math.abs(x), half - Math.abs(z), cx > 0 && cz > 0 ? rr - Math.hypot(cx, cz) : 9);
    p[i + 1] = 0.015 + 0.12 * Math.pow(Math.min(1, Math.max(0, edge) / 0.6), 0.7) + (noise3(x * 3 + variant, 1, z * 3) - 0.5) * 0.06;
  }
  g.add(mound, tf([0, 0, 0]), (_, w) => mix(grass, grassLight, noise3(w.x * 2.5 + variant, 2, w.z * 2.5)));
  // bushes
  const bushes = 2 + (variant % 2);
  for (let b = 0; b < bushes; b++) {
    const bx = (r() - 0.5) * 1.2, bz = (r() - 0.5) * 1.2;
    const s = 0.24 + r() * 0.12;
    const dark = hex('#3f8f2c'), lite = hex('#a2dc62');
    for (let k = 0; k < 3; k++) {
      const ox = (r() - 0.5) * s, oz = (r() - 0.5) * s;
      g.add(blob(s * (0.8 + r() * 0.3), 0.32, r() * 50, 2, true), tf([bx + ox, s * 0.55, bz + oz], r() * 6), (l) => mix(dark, lite, l.y / s * 0.6 + 0.45));
    }
    if (r() > 0.4) {
      const berry = r() > 0.5 ? hex('#ff6b8a') : hex('#ffffff');
      for (let k = 0; k < 5; k++) {
        const a = r() * 6.28, rad = s * 0.9;
        g.add(blob(0.035, 0.1, k, 1), tf([bx + Math.cos(a) * rad, s * (0.75 + r() * 0.5), bz + Math.sin(a) * rad]), berry);
      }
    }
  }
  // tall grass tufts
  for (let t = 0; t < 12; t++) {
    const tx = (r() - 0.5) * 1.6, tz = (r() - 0.5) * 1.6;
    for (let k = 0; k < 6; k++) {
      g.add(
        blade({ length: 0.22 + r() * 0.22, width: 0.045, bend: 0.8 + r() * 0.5, lean: 0.15 + r() * 0.3, shape: 'taper', segments: 4, fold: 0.2, base: hex('#4a9d30'), tip: hex('#c0ea74') }),
        tf([tx, 0.08, tz], r() * 6.28),
      );
    }
  }
  // a mossy rock
  const rx = (r() - 0.5) * 1.2, rz = (r() - 0.5) * 1.2;
  g.add(blob(0.16, 0.35, variant * 3, 2, true), tf([rx, 0.08, rz], r() * 6, [1.2, 0.8, 1]), (l) =>
    l.y > 0.08 ? hex('#a9b7a0') : hex('#8d968a'),
  );
  const m = g.build(`plot-cover-${variant}`, scene, mats.cover);
  m.isVisible = false;
  return m;
}

function buildRing(scene: Scene) {
  // rounded-square outline ribbon
  const pts: Vector3[] = [];
  const h = PLOT_SIZE / 2 + 0.06, rr = 0.22, seg = 6;
  const corners: Array<[number, number, number]> = [
    [h - rr, h - rr, 0], [-h + rr, h - rr, Math.PI / 2], [-h + rr, -h + rr, Math.PI], [h - rr, -h + rr, Math.PI * 1.5],
  ];
  for (const [cx, cz, a0] of corners)
    for (let i = 0; i <= seg; i++) {
      const a = a0 + (i / seg) * (Math.PI / 2);
      pts.push(new Vector3(cx + Math.cos(a) * rr, 0, cz + Math.sin(a) * rr));
    }
  const positions: number[] = [];
  const indices: number[] = [];
  const w = 0.07;
  pts.forEach((pt) => {
    const len = Math.hypot(pt.x, pt.z);
    const nx = pt.x / len, nz = pt.z / len;
    positions.push(pt.x - nx * w, 0, pt.z - nz * w, pt.x + nx * w, 0, pt.z + nz * w);
  });
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const a = i * 2, b = ((i + 1) % n) * 2;
    indices.push(a, b, a + 1, a + 1, b, b + 1);
  }
  const vd = new VertexData();
  vd.positions = positions;
  vd.indices = indices;
  const m = new Mesh('plot-ring', scene);
  vd.applyToMesh(m);
  const mat = new StandardMaterial('ring-mat', scene);
  mat.disableLighting = true;
  mat.emissiveColor = new Color3(1, 0.96, 0.7);
  mat.alpha = 0.85;
  mat.backFaceCulling = false;
  m.material = mat;
  m.isPickable = false;
  m.renderingGroupId = 1;
  return m;
}

export interface PlotTemplates {
  frame: Mesh;
  soil: Mesh;
  covers: Mesh[];
  ring: Mesh;
}

export function buildPlotTemplates(scene: Scene, mats: MaterialLibrary): PlotTemplates {
  const t = { frame: buildFrame(scene, mats), soil: buildSoil(scene, mats), covers: [0, 1, 2].map((v) => buildCover(scene, mats, v)), ring: buildRing(scene) };
  for (const m of [t.frame, t.soil, ...t.covers]) m.receiveShadows = true;
  return t;
}

// ------------------------------------------------------------------ view

export interface PlotContext {
  scene: Scene;
  templates: PlotTemplates;
  crops: CropLibrary;
  fx: Fx;
  tweens: Tweens;
  shadows: () => ShadowGenerator | null;
}

/** Visual state of one plot; diffed against PlotState every tick. */
export class PlotView {
  readonly root: TransformNode;
  readonly center: Vector3;
  private bed: TransformNode;
  private frame: InstancedMesh | null = null;
  private soil: InstancedMesh | null = null;
  private cover: InstancedMesh | null = null;
  private cropRoot: TransformNode;
  private crop: InstancedMesh | null = null;
  private cropKey: string | null = null;
  private unlocked: boolean | null = null;
  private ready: ParticleSystem | null = null;
  private busy = false;
  private time = Math.random() * 10;
  private hold = 0;
  private idleObs: ReturnType<Scene['onBeforeRenderObservable']['add']>;

  private readonly variant: number;

  constructor(private ctx: PlotContext, readonly id: string, x: number, z: number) {
    const y = terrainHeight(x, z);
    this.center = new Vector3(x, y + SOIL_TOP, z);
    this.variant = Math.abs(Math.round(x * 7 + z * 13)) % 3;
    this.root = new TransformNode(`plot-${id}`, ctx.scene);
    this.root.position.set(x, y, z);
    this.bed = new TransformNode(`plot-bed-${id}`, ctx.scene);
    this.bed.parent = this.root;
    this.cropRoot = new TransformNode(`plot-crop-${id}`, ctx.scene);
    this.cropRoot.parent = this.root;
    this.cropRoot.position.y = CROP_BASE;
    this.idleObs = ctx.scene.onBeforeRenderObservable.add(() => this.idle());
  }

  private instance(src: Mesh, parent: TransformNode, castShadow = true) {
    const inst = src.createInstance(`${src.name}-${this.id}`);
    inst.parent = parent;
    inst.isPickable = false;
    if (castShadow) this.ctx.shadows()?.addShadowCaster(inst, false);
    return inst;
  }

  private drop(inst: InstancedMesh | null) {
    if (!inst) return;
    this.ctx.shadows()?.removeShadowCaster(inst, false);
    inst.dispose();
  }

  dispose() {
    this.ctx.scene.onBeforeRenderObservable.remove(this.idleObs);
    for (const m of [this.frame, this.soil, this.cover, this.crop]) this.drop(m);
    this.ready?.dispose();
    this.root.dispose();
  }

  /** Re-register shadow casters after the shadow generator is rebuilt. */
  reattachShadows(sg: ShadowGenerator) {
    for (const m of [this.frame, this.soil, this.cover, this.crop]) if (m) sg.addShadowCaster(m, false);
  }

  /** Show a fixed crop/stage regardless of game state (art review). */
  forceStage(crop: CropId, stage: number) {
    this.setUnlocked(true);
    this.setCrop(crop, stage);
  }

  get isBusy() {
    return this.busy;
  }

  sync(state: PlotState, now: number, animate: boolean) {
    if (this.busy) return;
    if (state.unlocked !== this.unlocked) {
      if (state.unlocked && this.unlocked === false && animate) return this.playUnlock();
      this.setUnlocked(state.unlocked);
    }
    const key = state.crop ? `${state.crop}:${growthStage(state, now)}` : null;
    if (key === this.cropKey) return;
    if (!key) {
      // crop removed without harvest animation (e.g. reset)
      this.setCrop(null, 0);
      return;
    }
    const [crop, stageStr] = key.split(':') as [CropId, string];
    const stage = Number(stageStr);
    const fresh = this.cropKey === null;
    this.setCrop(crop, stage);
    if (animate) this.popIn(fresh);
  }

  private setUnlocked(unlocked: boolean) {
    this.unlocked = unlocked;
    const t = this.ctx.templates;
    if (unlocked) {
      this.drop(this.cover);
      this.cover = null;
      this.frame ??= this.instance(t.frame, this.bed);
      this.soil ??= this.instance(t.soil, this.bed);
    } else {
      this.drop(this.frame);
      this.drop(this.soil);
      this.frame = this.soil = null;
      this.cover ??= this.instance(t.covers[this.variant % t.covers.length], this.bed);
    }
  }

  private setCrop(crop: CropId | null, stage: number) {
    this.drop(this.crop);
    this.crop = null;
    this.cropKey = crop ? `${crop}:${stage}` : null;
    if (crop) this.crop = this.instance(this.ctx.crops.template(crop, stage), this.cropRoot);
    this.cropRoot.scaling.setAll(1);
    this.cropRoot.position.set(0, CROP_BASE, 0);
    const isReady = stage === 4 && crop !== null;
    if (isReady && !this.ready) {
      this.ready = this.ctx.fx.readyEmitter(this.center);
      this.ready.start();
    } else if (!isReady && this.ready) {
      this.ready.stop();
      const ps = this.ready;
      this.ctx.tweens.wait(1.5, () => ps.dispose());
      this.ready = null;
    }
  }

  private popIn(fresh: boolean) {
    const tw = this.ctx.tweens;
    const fx = this.ctx.fx;
    this.hold = 0.6;
    this.cropRoot.scaling.set(0.4, 0.2, 0.4);
    tw.add(0.55, (k) => {
      this.cropRoot.scaling.set(0.4 + 0.6 * k, 0.2 + 0.8 * k, 0.4 + 0.6 * k);
    }, { ease: ease.outBack });
    const p = this.center.add(new Vector3(0, 0.15, 0));
    if (fresh) fx.dustPuff(p, 14);
    else fx.leafBurst(p, 8);
    if (this.cropKey?.endsWith(':4')) fx.sparkleBurst(p.add(new Vector3(0, 0.3, 0)), 22);
  }

  /** Jump, squash and vanish, then settle the soil. Resolves when the crop is gone. */
  playHarvest(onPeak: () => void) {
    if (!this.crop) return;
    this.busy = true;
    const tw = this.ctx.tweens;
    const fx = this.ctx.fx;
    const cr = this.cropRoot;
    tw.add(0.16, (k) => {
      cr.position.y = CROP_BASE + 0.45 * k;
      cr.scaling.set(1 + 0.18 * k, 1 + 0.25 * k, 1 + 0.18 * k);
    }, { ease: ease.outCubic, done: () => {
      onPeak();
      fx.sparkleBurst(this.center.add(new Vector3(0, 0.7, 0)), 30);
      fx.leafBurst(this.center.add(new Vector3(0, 0.4, 0)), 14);
    } });
    tw.add(0.3, (k) => {
      cr.position.y = CROP_BASE + 0.45 + 0.15 * k;
      const s = 1.18 * (1 - k);
      cr.scaling.set(s, (1.25) * (1 - k), s);
    }, { delay: 0.16, ease: ease.inBack, done: () => {
      this.setCrop(null, 0);
      this.busy = false;
    } });
    // soil settles: tiny squash + dust
    tw.add(0.4, (k) => {
      this.bed.scaling.y = 1 - 0.12 * Math.sin(k * Math.PI);
    }, { delay: 0.35, ease: ease.linear });
    tw.wait(0.4, () => fx.dustPuff(this.center.add(new Vector3(0, 0.1, 0)), 10));
  }

  private playUnlock() {
    this.busy = true;
    const tw = this.ctx.tweens;
    const fx = this.ctx.fx;
    const cover = this.cover;
    fx.leafBurst(this.center.add(new Vector3(0, 0.35, 0)), 22);
    fx.dustPuff(this.center.add(new Vector3(0, 0.1, 0)), 20);
    if (cover) {
      tw.add(0.35, (k) => {
        cover.scaling.set(1 + 0.1 * k, 1 - k, 1 + 0.1 * k);
        cover.position.y = -0.1 * k;
      }, { ease: ease.inBack });
    }
    tw.wait(0.38, () => {
      this.setUnlocked(true);
      this.bed.position.y = -0.35;
      this.bed.scaling.set(0.85, 0.6, 0.85);
      tw.add(0.7, (k) => {
        this.bed.position.y = -0.35 * (1 - k);
        this.bed.scaling.set(0.85 + 0.15 * k, 0.6 + 0.4 * k, 0.85 + 0.15 * k);
      }, { ease: ease.outElastic, done: () => (this.busy = false) });
      fx.sparkleRing(this.center.add(new Vector3(0, 0.1, 0)), 1.1);
      fx.dustPuff(this.center.add(new Vector3(0, 0.15, 0)), 18);
    });
  }

  /** Tap feedback on a growing plant. */
  wiggle() {
    if (this.busy || !this.crop) return;
    this.ctx.tweens.add(0.5, (k) => {
      const s = Math.sin(k * Math.PI * 4) * (1 - k) * 0.12;
      this.cropRoot.scaling.set(1 - s * 0.5, 1 + s, 1 - s * 0.5);
    }, { ease: ease.linear });
  }

  private idle() {
    const dt = this.ctx.scene.getEngine().getDeltaTime() / 1000;
    if (this.hold > 0) {
      this.hold -= dt;
      return;
    }
    if (this.busy || !this.cropKey?.endsWith(':4')) return;
    this.time += dt;
    const s = 1 + Math.sin(this.time * 3.2) * 0.025;
    this.cropRoot.scaling.set(1 + (1 - s) * 0.5, s, 1 + (1 - s) * 0.5);
  }
}
