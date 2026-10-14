import {
  Color3,
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
import { CropId, SOIL_TOP, TILE_SIZE } from '../config';
import { TileState, growthStage } from '../state/store';
import { CropLibrary } from './crops';
import { Fx } from './fx';
import { blade, blob, GeoBuilder, hex, mix, mulberry, noise3, tf } from './geometry';
import { MaterialLibrary } from './materials';
import { ease, Tweens } from './tween';

const CORNER = 0.22;

// ------------------------------------------------------------------ templates

/**
 * A soft raised square: flat plateau with a rounded bevel down to the island
 * grass, rounded corners. Heights/colours come from the callbacks.
 */
function slab(height: number, bevel: number, colour: (k: number, x: number, z: number) => Color3, wobble = 0.01) {
  const vd = CreateGroundVertexData({ width: TILE_SIZE, height: TILE_SIZE, subdivisions: 26 });
  const p = vd.positions as number[];
  const colors: number[] = [];
  const half = TILE_SIZE / 2;
  for (let i = 0; i < p.length; i += 3) {
    let x = p[i], z = p[i + 2];
    // pull the square's corners onto rounded arcs
    const cx = Math.abs(x) - (half - CORNER), cz = Math.abs(z) - (half - CORNER);
    if (cx > 0 && cz > 0) {
      const d = Math.hypot(cx, cz);
      if (d > CORNER) {
        x = Math.sign(x) * (half - CORNER + (cx / d) * CORNER);
        z = Math.sign(z) * (half - CORNER + (cz / d) * CORNER);
      }
    }
    const ex = Math.abs(x) - (half - CORNER), ez = Math.abs(z) - (half - CORNER);
    const outside = Math.hypot(Math.max(ex, 0), Math.max(ez, 0)) + Math.min(Math.max(ex, ez), 0);
    const edge = CORNER - outside; // distance from the rim, inward
    const k = Math.min(1, Math.max(0, edge / bevel));
    const shoulder = Math.sin((k * Math.PI) / 2);
    p[i] = x;
    p[i + 2] = z;
    p[i + 1] = 0.006 + height * shoulder + (noise3(x * 6, 2, z * 6) - 0.5) * wobble * shoulder;
    const c = colour(shoulder, x, z);
    colors.push(c.r, c.g, c.b, 1);
  }
  vd.colors = colors;
  const normals: number[] = [];
  VertexData.ComputeNormals(p, vd.indices!, normals);
  vd.normals = normals;
  return vd;
}

function buildSoil(scene: Scene, mats: MaterialLibrary) {
  const rim = hex('#8a5a3a'), top = hex('#ffffff');
  const g = new GeoBuilder();
  g.add(slab(SOIL_TOP, 0.2, (k, x, z) => mix(rim, top, k).scale(0.92 + noise3(x * 4, 5, z * 4) * 0.16), 0.02), tf([0, 0, 0]));
  const m = g.build('tile-soil', scene, mats.soil);
  m.isVisible = false;
  return m;
}

function buildGrass(scene: Scene, mats: MaterialLibrary, variant: number) {
  const g = new GeoBuilder();
  const r = mulberry(700 + variant * 53);
  const rim = hex('#78bf45'), top = hex('#a8dc62'), topHi = hex('#b8e66e');
  g.add(slab(SOIL_TOP * 0.55, 0.22, (k, x, z) => mix(rim, mix(top, topHi, noise3(x * 2 + variant, 1, z * 2)), k)), tf([0, 0, 0]));
  // a few tufts and the odd flower so locked tiles read as wild meadow
  const tufts = 1 + (variant % 2);
  for (let t = 0; t < tufts; t++) {
    const x = (r() - 0.5) * 1.0, z = (r() - 0.5) * 1.0;
    for (let k = 0; k < 5; k++)
      g.add(
        blade({ length: 0.08 + r() * 0.06, width: 0.035, bend: 0.8, lean: 0.2 + r() * 0.3, shape: 'taper', segments: 3, fold: 0.2, base: hex('#5aa83a'), tip: hex('#c8ee7c') }),
        tf([x, SOIL_TOP * 0.5, z], r() * 6.28),
      );
  }
  if (variant !== 1) {
    const x = (r() - 0.5) * 0.9, z = (r() - 0.5) * 0.9;
    const petal = variant === 0 ? hex('#ffffff') : hex('#ffd84a');
    for (let k = 0; k < 5; k++) g.add(blob(0.035, 0.05, k, 1), tf([x + Math.cos(k * 1.26) * 0.04, SOIL_TOP * 0.55 + 0.05, z + Math.sin(k * 1.26) * 0.04]), petal);
    g.add(blob(0.025, 0.05, 9, 1), tf([x, SOIL_TOP * 0.55 + 0.06, z]), hex('#f0a020'));
  }
  // vertex colours only (no grain texture) so locked tiles read as smooth, soft grass
  const m = g.build(`tile-grass-${variant}`, scene, mats.grass);
  m.isVisible = false;
  return m;
}

function buildRing(scene: Scene) {
  const pts: Vector3[] = [];
  const h = TILE_SIZE / 2 + 0.05, rr = CORNER + 0.05, seg = 6;
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
  const w = 0.055;
  pts.forEach((pt) => {
    const len = Math.hypot(pt.x, pt.z);
    const nx = pt.x / len, nz = pt.z / len;
    positions.push(pt.x - nx * w, 0, pt.z - nz * w, pt.x + nx * w, 0, pt.z + nz * w);
  });
  for (let i = 0; i < pts.length; i++) {
    const a = i * 2, b = ((i + 1) % pts.length) * 2;
    indices.push(a, b, a + 1, a + 1, b, b + 1);
  }
  const vd = new VertexData();
  vd.positions = positions;
  vd.indices = indices;
  const m = new Mesh('tile-ring', scene);
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

export interface TileTemplates {
  soil: Mesh;
  grass: Mesh[];
  ring: Mesh;
}

export function buildTileTemplates(scene: Scene, mats: MaterialLibrary): TileTemplates {
  const t = { soil: buildSoil(scene, mats), grass: [0, 1, 2].map((v) => buildGrass(scene, mats, v)), ring: buildRing(scene) };
  for (const m of [t.soil, ...t.grass]) m.receiveShadows = true;
  return t;
}

// ------------------------------------------------------------------ view

export interface TileContext {
  scene: Scene;
  templates: TileTemplates;
  crops: CropLibrary;
  fx: Fx;
  tweens: Tweens;
  shadows: () => ShadowGenerator | null;
}

/** Visual state of one tile; diffed against TileState every tick. */
export class TileView {
  readonly root: TransformNode;
  readonly center: Vector3;
  private bed: TransformNode;
  private soil: InstancedMesh | null = null;
  private grass: InstancedMesh | null = null;
  private cropRoot: TransformNode;
  private crop: InstancedMesh | null = null;
  private cropKey: string | null = null;
  private unlocked: boolean | null = null;
  private ready: ParticleSystem | null = null;
  private busy = false;
  private time = Math.random() * 10;
  private hold = 0;
  private idleObs: ReturnType<Scene['onBeforeRenderObservable']['add']>;

  constructor(private ctx: TileContext, readonly g: number, x: number, z: number) {
    this.center = new Vector3(x, SOIL_TOP, z);
    this.root = new TransformNode(`tile-${g}`, ctx.scene);
    this.root.position.set(x, 0, z);
    this.bed = new TransformNode(`tile-bed-${g}`, ctx.scene);
    this.bed.parent = this.root;
    this.cropRoot = new TransformNode(`tile-crop-${g}`, ctx.scene);
    this.cropRoot.parent = this.root;
    this.cropRoot.position.y = SOIL_TOP;
    this.idleObs = ctx.scene.onBeforeRenderObservable.add(() => this.idle());
  }

  private instance(src: Mesh, parent: TransformNode, castShadow = true) {
    const inst = src.createInstance(`${src.name}-${this.g}`);
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
    for (const m of [this.soil, this.grass, this.crop]) this.drop(m);
    this.ready?.dispose();
    this.root.dispose();
  }

  /** Re-register shadow casters after the shadow generator is rebuilt. */
  reattachShadows(sg: ShadowGenerator) {
    for (const m of [this.soil, this.grass, this.crop]) if (m) sg.addShadowCaster(m, false);
  }

  /** Show a fixed crop/stage regardless of game state (art review). */
  forceStage(crop: CropId, stage: number) {
    this.setUnlocked(true);
    this.setCrop(crop, stage);
  }

  get isBusy() {
    return this.busy;
  }

  sync(state: TileState, now: number, animate: boolean) {
    if (this.busy) return;
    if (state.unlocked !== this.unlocked) {
      if (state.unlocked && this.unlocked === false && animate) return this.playUnlock();
      this.setUnlocked(state.unlocked);
    }
    const key = state.crop ? `${state.crop}:${growthStage(state, now)}` : null;
    if (key === this.cropKey) return;
    if (!key) return this.setCrop(null, 0);
    const [crop, stageStr] = key.split(':') as [CropId, string];
    const fresh = this.cropKey === null;
    this.setCrop(crop, Number(stageStr));
    if (animate) this.popIn(fresh);
  }

  private setUnlocked(unlocked: boolean) {
    this.unlocked = unlocked;
    const t = this.ctx.templates;
    if (unlocked) {
      this.drop(this.grass);
      this.grass = null;
      this.soil ??= this.instance(t.soil, this.bed);
    } else {
      this.drop(this.soil);
      this.soil = null;
      this.grass ??= this.instance(t.grass[this.g % t.grass.length], this.bed, false);
    }
  }

  private setCrop(crop: CropId | null, stage: number) {
    this.drop(this.crop);
    this.crop = null;
    this.cropKey = crop ? `${crop}:${stage}` : null;
    if (crop) this.crop = this.instance(this.ctx.crops.template(crop, stage), this.cropRoot);
    this.cropRoot.scaling.setAll(1);
    this.cropRoot.position.set(0, SOIL_TOP, 0);
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
    tw.add(0.55, (k) => this.cropRoot.scaling.set(0.4 + 0.6 * k, 0.2 + 0.8 * k, 0.4 + 0.6 * k), { ease: ease.outBack });
    const p = this.center.add(new Vector3(0, 0.12, 0));
    if (fresh) fx.dustPuff(p, 10);
    else fx.leafBurst(p, 6);
    if (this.cropKey?.endsWith(':4')) fx.sparkleBurst(p.add(new Vector3(0, 0.3, 0)), 16);
  }

  /** Jump, squash and vanish, then settle the soil. */
  playHarvest(onPeak: () => void) {
    if (!this.crop) return;
    this.busy = true;
    const tw = this.ctx.tweens;
    const fx = this.ctx.fx;
    const cr = this.cropRoot;
    tw.add(0.16, (k) => {
      cr.position.y = SOIL_TOP + 0.4 * k;
      cr.scaling.set(1 + 0.18 * k, 1 + 0.25 * k, 1 + 0.18 * k);
    }, {
      ease: ease.outCubic,
      done: () => {
        onPeak();
        fx.sparkleBurst(this.center.add(new Vector3(0, 0.6, 0)), 24);
        fx.leafBurst(this.center.add(new Vector3(0, 0.35, 0)), 10);
      },
    });
    tw.add(0.3, (k) => {
      cr.position.y = SOIL_TOP + 0.4 + 0.15 * k;
      const s = 1.18 * (1 - k);
      cr.scaling.set(s, 1.25 * (1 - k), s);
    }, {
      delay: 0.16,
      ease: ease.inBack,
      done: () => {
        this.setCrop(null, 0);
        this.busy = false;
      },
    });
    tw.add(0.4, (k) => (this.bed.scaling.y = 1 - 0.15 * Math.sin(k * Math.PI)), { delay: 0.35, ease: ease.linear });
    tw.wait(0.4, () => fx.dustPuff(this.center.add(new Vector3(0, 0.05, 0)), 8));
  }

  private playUnlock() {
    this.busy = true;
    const tw = this.ctx.tweens;
    const fx = this.ctx.fx;
    const grass = this.grass;
    fx.leafBurst(this.center.add(new Vector3(0, 0.25, 0)), 16);
    if (grass) tw.add(0.3, (k) => grass.scaling.set(1 - 0.3 * k, 1 - k, 1 - 0.3 * k), { ease: ease.inBack });
    tw.wait(0.32, () => {
      this.setUnlocked(true);
      this.bed.position.y = -0.2;
      this.bed.scaling.set(0.7, 0.4, 0.7);
      tw.add(0.7, (k) => {
        this.bed.position.y = -0.2 * (1 - k);
        this.bed.scaling.set(0.7 + 0.3 * k, 0.4 + 0.6 * k, 0.7 + 0.3 * k);
      }, { ease: ease.outElastic, done: () => (this.busy = false) });
      fx.sparkleRing(this.center.add(new Vector3(0, 0.05, 0)), 0.8);
      fx.dustPuff(this.center.add(new Vector3(0, 0.1, 0)), 14);
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
