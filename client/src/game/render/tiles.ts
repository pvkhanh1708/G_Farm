import { Color3, Matrix, Mesh, Quaternion, Scene, StandardMaterial, Vector3, VertexData } from '@babylonjs/core';
import { CropId, SOIL_TOP, TILE_SIZE } from '../config';
import { TileState, growthStage } from '../state/store';
import { Handle, ThinBatch, TileBatches } from './batch';
import { Fx, SparkleField } from './fx';
import { SpriteLibrary } from './sprites';
import { ease, Tweens } from './tween';

const CORNER = 0.22;
/** Heights of the flat layers: wild grass / soil, then the crop sprite above it. */
const BED_Y = 0.02;
const CROP_Y = 0.05;

// ------------------------------------------------------------------ templates

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

export function buildTileTemplates(scene: Scene, sprites: SpriteLibrary): TileTemplates {
  return { soil: sprites.soil(TILE_SIZE), grass: [0, 1, 2].map((v) => sprites.grass(v, TILE_SIZE)), ring: buildRing(scene) };
}

// ------------------------------------------------------------------ view

export interface TileContext {
  scene: Scene;
  templates: TileTemplates;
  sprites: SpriteLibrary;
  fx: Fx;
  tweens: Tweens;
  batches: TileBatches;
  sparkles: SparkleField;
  /** Ripe tiles that bob gently; ticked by the Game while zoomed in. */
  bobbing: Set<TileView>;
}

const NO_ROTATION = Quaternion.Identity();
const tmpMatrix = new Matrix();
const tmpPos = new Vector3();

/**
 * Visual state of one tile; diffed against TileState every tick. Owns no scene
 * nodes: its bed (soil or grass) and crop are slots in per-parcel thin-instance
 * batches, re-composed from a few animatable numbers whenever they change.
 */
export class TileView {
  readonly center: Vector3;
  private bedBatch: ThinBatch | null = null;
  private cropBatch: ThinBatch | null = null;
  private readonly bedHandle: Handle;
  private readonly cropHandle: Handle;
  // animatable transform parts (the tile sits at x/z on the island)
  private bedY = BED_Y;
  private bedScale = new Vector3(1, 1, 1);
  private cropY = CROP_Y;
  private cropScale = new Vector3(1, 1, 1);
  private cropKey: string | null = null;
  private unlocked: boolean | null = null;
  private busy = false;
  private time = Math.random() * 10;
  private hold = 0;

  constructor(private ctx: TileContext, readonly g: number, private x: number, private z: number) {
    this.center = new Vector3(x, SOIL_TOP, z);
    this.bedHandle = ctx.batches.handle();
    this.cropHandle = ctx.batches.handle();
  }

  private compose(scale: Vector3, y: number) {
    tmpPos.set(this.x, y, this.z);
    return Matrix.ComposeToRef(scale, NO_ROTATION, tmpPos, tmpMatrix);
  }

  private applyBed() {
    this.bedBatch?.set(this.bedHandle, this.compose(this.bedScale, this.bedY));
  }

  private applyCrop() {
    this.cropBatch?.set(this.cropHandle, this.compose(this.cropScale, this.cropY));
  }

  dispose() {
    this.bedBatch?.remove(this.bedHandle);
    this.cropBatch?.remove(this.cropHandle);
    this.ctx.sparkles.set(this.g, null);
    this.ctx.bobbing.delete(this);
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
    this.bedBatch?.remove(this.bedHandle);
    const variant = this.g % t.grass.length;
    this.bedBatch = unlocked
      ? this.ctx.batches.get('soil', this.x, this.z, () => ({ detailed: t.soil, simple: t.soil }), false)
      : this.ctx.batches.get(`grass${variant}`, this.x, this.z, () => ({ detailed: t.grass[variant], simple: t.grass[variant] }), false);
    this.bedScale.setAll(1);
    this.bedY = BED_Y;
    this.bedBatch.add(this.bedHandle, this.compose(this.bedScale, this.bedY));
  }

  private setCrop(crop: CropId | null, stage: number) {
    this.cropBatch?.remove(this.cropHandle);
    this.cropBatch = null;
    this.cropKey = crop ? `${crop}:${stage}` : null;
    this.cropScale.setAll(1);
    this.cropY = CROP_Y;
    if (crop) {
      const sprite = () => this.ctx.sprites.crop(crop, stage, TILE_SIZE);
      this.cropBatch = this.ctx.batches.get(`crop:${crop}:${stage}`, this.x, this.z, () => ({ detailed: sprite(), simple: sprite() }), false);
      this.cropBatch.add(this.cropHandle, this.compose(this.cropScale, this.cropY));
    }
    const ripe = stage === 4 && crop !== null;
    this.ctx.sparkles.set(this.g, ripe ? this.center : null);
    if (ripe) this.ctx.bobbing.add(this);
    else this.ctx.bobbing.delete(this);
  }

  private popIn(fresh: boolean) {
    const tw = this.ctx.tweens;
    const fx = this.ctx.fx;
    this.hold = 0.6;
    this.cropScale.set(0.4, 1, 0.4);
    this.applyCrop();
    tw.add(0.55, (k) => {
      this.cropScale.set(0.4 + 0.6 * k, 1, 0.4 + 0.6 * k);
      this.applyCrop();
    }, { ease: ease.outBack });
    const p = this.center.add(new Vector3(0, 0.12, 0));
    if (fresh) fx.dustPuff(p, 10);
    else fx.leafBurst(p, 6);
    if (this.cropKey?.endsWith(':4')) fx.sparkleBurst(p.add(new Vector3(0, 0.3, 0)), 16);
  }

  /** Jump, squash and vanish, then settle the soil. */
  playHarvest(onPeak: () => void) {
    if (!this.cropBatch) return;
    this.busy = true;
    const tw = this.ctx.tweens;
    const fx = this.ctx.fx;
    tw.add(0.16, (k) => {
      // seen from above a hop is invisible, so it swells instead
      this.cropY = CROP_Y + 0.2 * k;
      this.cropScale.set(1 + 0.3 * k, 1, 1 + 0.3 * k);
      this.applyCrop();
    }, {
      ease: ease.outCubic,
      done: () => {
        onPeak();
        fx.sparkleBurst(this.center.add(new Vector3(0, 0.6, 0)), 24);
        fx.leafBurst(this.center.add(new Vector3(0, 0.35, 0)), 10);
      },
    });
    tw.add(0.3, (k) => {
      this.cropY = CROP_Y + 0.2;
      const s = 1.3 * (1 - k);
      this.cropScale.set(s, 1, s);
      this.applyCrop();
    }, {
      delay: 0.16,
      ease: ease.inBack,
      done: () => {
        this.setCrop(null, 0);
        this.busy = false;
      },
    });
    tw.add(0.4, (k) => {
      const d = 1 - 0.06 * Math.sin(k * Math.PI);
      this.bedScale.set(d, 1, d);
      this.applyBed();
    }, { delay: 0.35, ease: ease.linear });
    tw.wait(0.4, () => fx.dustPuff(this.center.add(new Vector3(0, 0.05, 0)), 8));
  }

  private playUnlock() {
    this.busy = true;
    const tw = this.ctx.tweens;
    const fx = this.ctx.fx;
    fx.leafBurst(this.center.add(new Vector3(0, 0.25, 0)), 16);
    tw.add(0.3, (k) => {
      this.bedScale.set(1 - 0.6 * k, 1, 1 - 0.6 * k);
      this.applyBed();
    }, { ease: ease.inBack });
    tw.wait(0.32, () => {
      this.setUnlocked(true);
      tw.add(0.7, (k) => {
        this.bedScale.set(0.4 + 0.6 * k, 1, 0.4 + 0.6 * k);
        this.applyBed();
      }, { ease: ease.outElastic, done: () => (this.busy = false) });
      fx.sparkleRing(this.center.add(new Vector3(0, 0.05, 0)), 0.8);
      fx.dustPuff(this.center.add(new Vector3(0, 0.1, 0)), 14);
    });
  }

  /** Tap feedback on a growing plant. */
  wiggle() {
    if (this.busy || !this.cropBatch) return;
    this.ctx.tweens.add(0.5, (k) => {
      const s = Math.sin(k * Math.PI * 4) * (1 - k) * 0.12;
      this.cropScale.set(1 + s, 1, 1 - s);
      this.applyCrop();
    }, { ease: ease.linear });
  }

  /** Ripe crops breathe a little; the Game calls this only while zoomed in. */
  bob(dt: number) {
    if (this.hold > 0) {
      this.hold -= dt;
      return;
    }
    if (this.busy) return;
    this.time += dt;
    const s = 1 + Math.sin(this.time * 3.2) * 0.03;
    this.cropScale.set(s, 1, s);
    this.applyCrop();
  }
}
