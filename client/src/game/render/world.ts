import { ShadowGenerator } from '@babylonjs/core/Lights/Shadows/shadowGenerator.js';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial.js';
import { DynamicTexture } from '@babylonjs/core/Materials/Textures/dynamicTexture.js';
import { Texture } from '@babylonjs/core/Materials/Textures/texture.js';
import { Matrix, Quaternion, Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import { CreateGroundVertexData } from '@babylonjs/core/Meshes/Builders/groundBuilder.js';
import { Mesh } from '@babylonjs/core/Meshes/mesh.js';
import { Scene } from '@babylonjs/core/scene.js';
import { COLUMN_LENGTH, ISLAND_SIZE, PENS_X1, QualityPreset, TILE_PITCH } from '../config';
import { hex, mulberry } from './geometry';
import { bushKit, buildButterflies, flowerKit, grassKit, rockKit, roundTree, pineTree } from './kits';
import { MaterialLibrary } from './materials';
import { artUrl } from '../art';

/**
 * The farm lies on one endless meadow: a block of tiles growing column by
 * column toward -x. Grass tufts, flowers and rocks (and optionally trees and
 * bushes) are scattered around the block, never on it.
 */

/** Size of the meadow mesh; it follows the camera, snapped to the texture period. */
const GROUND_SIZE = 1200;
/** How far around the farm block the meadow decor reaches. */
const DECOR_MARGIN = 28;
/** Light-earth pad under the farm block (off: tiles sit straight on the meadow). */
const SHOW_PLOT_PAD = false;
/** Trees and bushes around the farm (off: open meadow). */
const SHOW_TREES = false;

type Placement = { x: number; y: number; z: number; s: number; yaw: number };

function thin(mesh: Mesh, items: Placement[]) {
  const list = items.length ? items : [{ x: 0, y: -500, z: 0, s: 0.001, yaw: 0 }];
  const buf = new Float32Array(list.length * 16);
  const m = new Matrix();
  list.forEach((it, i) => {
    Matrix.ComposeToRef(new Vector3(it.s, it.s, it.s), Quaternion.RotationYawPitchRoll(it.yaw, 0, 0), new Vector3(it.x, it.y, it.z), m);
    m.copyToArray(buf, i * 16);
  });
  mesh.thinInstanceSetBuffer('matrix', buf, 16, false);
  mesh.thinInstanceRefreshBoundingInfo(false);
  mesh.isPickable = false;
  mesh.receiveShadows = true;
}

/** Map a point of the unit square [-1,1]^2 onto a rounded rectangle outline/area. */
function roundCorner(x: number, z: number, half: number, R: number) {
  const cx = Math.abs(x) - (half - R), cz = Math.abs(z) - (half - R);
  if (cx > 0 && cz > 0) {
    const d = Math.hypot(cx, cz);
    if (d > R) return [Math.sign(x) * (half - R + (cx / d) * R), Math.sign(z) * (half - R + (cz / d) * R)];
  }
  return [x, z];
}

/** Endless meadow: one big flat quad whose UVs follow world space (same grass density as before). */
function buildGround(scene: Scene, mats: MaterialLibrary) {
  const vd = CreateGroundVertexData({ width: GROUND_SIZE, height: GROUND_SIZE, subdivisions: 1 });
  const p = vd.positions as number[];
  const uvs: number[] = [];
  for (let i = 0; i < p.length; i += 3) uvs.push(p[i] / ISLAND_SIZE, p[i + 2] / ISLAND_SIZE);
  vd.uvs = uvs;
  const m = new Mesh('meadow', scene);
  vd.applyToMesh(m);
  const url = artUrl('ground/meadow.png');
  if (url) {
    // hand-made tileable meadow: one repeat per 4 world units
    const mat = new StandardMaterial('meadow-art', scene);
    const tex = new Texture(url, scene);
    tex.uScale = tex.vScale = ISLAND_SIZE / 4;
    mat.diffuseTexture = tex;
    mat.disableLighting = true;
    mat.emissiveColor.set(1, 1, 1);
    m.material = mat;
  } else m.material = mats.grassGround;
  // the meadow is the bottom layer: it must not hide crop sprites whose base dips below y = 0
  m.material!.disableDepthWrite = true;
  m.position.y = -0.01;
  m.receiveShadows = true;
  m.isPickable = false;
  return m;
}

/** Light tilled earth covering an opened parcel (the tiles on it are darker soil). */
function buildPad(scene: Scene) {
  const half = ISLAND_SIZE / 2;
  const vd = CreateGroundVertexData({ width: ISLAND_SIZE, height: ISLAND_SIZE, subdivisions: 24 });
  const p = vd.positions as number[];
  const uvs: number[] = [];
  for (let i = 0; i < p.length; i += 3) {
    const [x, z] = roundCorner(p[i], p[i + 2], half, 0.5);
    p[i] = x;
    p[i + 2] = z;
    uvs.push(x / 3, z / 3);
  }
  vd.uvs = uvs;
  const m = new Mesh('parcel-pad', scene);
  vd.applyToMesh(m);
  const url = artUrl('ground/plot.png');
  const mat = new StandardMaterial('pad-mat', scene);
  mat.disableLighting = true;
  mat.emissiveColor.set(1, 1, 1);
  mat.backFaceCulling = false;
  m.material = mat;
  m.position.y = 0.002;
  m.isPickable = false;
  if (url) {
    // hand-made tileable earth: one repeat per 3 world units (the pad UVs are world / 3)
    mat.diffuseTexture = new Texture(url, scene);
    return m;
  }
  // speckled light earth, painted once and tiled
  const tex = new DynamicTexture('pad-tex', { width: 256, height: 256 }, scene, true);
  const ctx = tex.getContext() as unknown as CanvasRenderingContext2D;
  ctx.fillStyle = '#d6b483';
  ctx.fillRect(0, 0, 256, 256);
  const r = mulberry(17);
  for (let i = 0; i < 260; i++) {
    ctx.beginPath();
    ctx.ellipse(r() * 256, r() * 256, 2 + r() * 9, 1.5 + r() * 5, r() * 3, 0, Math.PI * 2);
    ctx.fillStyle = r() < 0.55 ? 'rgba(150,104,60,.18)' : 'rgba(255,236,200,.22)';
    ctx.fill();
  }
  for (let i = 0; i < 30; i++) {
    ctx.beginPath();
    ctx.arc(r() * 256, r() * 256, 1 + r() * 2, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(120,110,95,.45)';
    ctx.fill();
  }
  tex.update(true);
  tex.wrapU = tex.wrapV = Texture.WRAP_ADDRESSMODE;
  // unlit: shows the texture as painted (same set-up as the tile sprites)
  mat.diffuseTexture = tex;
  return m;
}

export class World {
  private active = -1;
  private scatter: Array<{ mesh: Mesh; items: Placement[]; limit: () => number }> = [];
  private ground: Mesh;
  private pad: Mesh;
  private flies;
  private casters: Mesh[] = [];
  private quality: QualityPreset;
  private focus = new Vector3();
  private grassMeshes: Mesh[];
  private flowerMeshes: Mesh[];
  private bushMeshes: Mesh[];
  private rockMesh: Mesh;
  private treeMeshes: Mesh[];

  constructor(scene: Scene, mats: MaterialLibrary, quality: QualityPreset) {
    this.quality = quality;
    this.ground = buildGround(scene, mats);
    this.pad = buildPad(scene);
    this.grassMeshes = [grassKit(80), grassKit(81)].map((g, i) => g.build(`grass-${i}`, scene, mats.grass));
    const flowerColours: Array<[string, string]> = [['#ff6fa3', '#ffe27a'], ['#ffd84a', '#e08a1e'], ['#ffffff', '#ffd23f'], ['#b98cff', '#fff3a0'], ['#ff7a45', '#7a3d1a']];
    this.flowerMeshes = flowerColours.map(([p, c], i) => flowerKit(60 + i, hex(p), hex(c)).build(`flowers-${i}`, scene, mats.grass));
    this.bushMeshes = [bushKit(10), bushKit(11, hex('#ffffff')), bushKit(12, hex('#ffd23f')), bushKit(13, hex('#ff7fa8'))].map((k, i) => k.canopy.build(`bush-${i}`, scene, mats.foliage));
    this.rockMesh = rockKit(5).build('rock', scene, mats.props);
    const tree = roundTree(1, hex('#3d8c33'), hex('#b2e466'));
    const blossom = roundTree(3, hex('#e57fa8'), hex('#ffe0ee'));
    const pine = pineTree(4);
    this.treeMeshes = [
      tree.trunk.build('tree-trunk', scene, mats.props), tree.canopy.build('tree-canopy', scene, mats.foliage),
      blossom.trunk.build('blossom-trunk', scene, mats.props), blossom.canopy.build('blossom-canopy', scene, mats.foliage),
      pine.trunk.build('pine-trunk', scene, mats.props), pine.canopy.build('pine-canopy', scene, mats.foliage),
    ];
    this.casters.push(...this.bushMeshes, this.rockMesh, ...this.treeMeshes);
    this.flies = buildButterflies(scene, 5);
  }

  /** Columns 0..active-1 hold tiles (the last one being filled). */
  setParcels(active: number) {
    if (active === this.active) return;
    this.active = active;
    this.rebuildScatter();
  }

  private rebuildScatter() {
    const grass: Placement[][] = [[], []];
    const flowers: Placement[][] = this.flowerMeshes.map(() => []);
    const bushes: Placement[][] = this.bushMeshes.map(() => []);
    const trees: Placement[][] = [[], [], []];
    const rocks: Placement[] = [];
    const pads: Placement[] = [];
    const cols = Math.max(1, this.active);
    // the farm block (columns 0..cols-1, growing toward -x) stays clear of decor
    const half = TILE_PITCH / 2 + 0.25;
    // the animal pen on the right is kept clear too
    const farm = { x0: -(cols - 1) * TILE_PITCH - half, x1: PENS_X1 + 1.4, z0: -(COLUMN_LENGTH - TILE_PITCH) - half, z1: half };
    if (SHOW_PLOT_PAD) pads.push({ x: (farm.x0 + farm.x1) / 2, y: 0, z: (farm.z0 + farm.z1) / 2, s: 1, yaw: 0 });
    const M = DECOR_MARGIN;
    const cell = ISLAND_SIZE;
    for (let cx = Math.floor((farm.x0 - M) / cell); cx <= Math.ceil((farm.x1 + M) / cell); cx++)
      for (let cz = Math.floor((farm.z0 - M) / cell); cz <= Math.ceil((farm.z1 + M) / cell); cz++) {
        // seeded per meadow cell, so decor stays put as the farm grows
        const r = mulberry(1000 + cx * 7919 + cz * 104729);
        const spot = () => {
          for (let t = 0; t < 20; t++) {
            const x = (cx + r()) * cell, z = (cz + r()) * cell;
            if (x > farm.x0 && x < farm.x1 && z > farm.z0 && z < farm.z1) continue;
            return [x, z] as const;
          }
          return null;
        };
        const put = (list: Placement[], y: number, s: number) => {
          const p = spot();
          if (p) list.push({ x: p[0], y, z: p[1], s, yaw: r() * 6.28 });
        };
        for (let i = 0; i < 40; i++) put(grass[i % 2], 0, 0.5 + r() * 0.35);
        for (let i = 0; i < 12; i++) put(flowers[Math.floor(r() * flowers.length)], 0, 0.9 + r() * 0.5);
        for (let i = 0; i < 2; i++) put(rocks, -0.04, 0.2 + r() * 0.25);
        if (SHOW_TREES) {
          for (let i = 0; i < 3; i++) put(bushes[Math.floor(r() * bushes.length)], 0, 0.7 + r() * 0.5);
          for (let i = 0; i < 2; i++) put(trees[Math.floor(r() * trees.length)], 0, 0.8 + r() * 0.5);
        }
      }
    this.scatter = [
      ...this.grassMeshes.map((mesh, i) => ({ mesh, items: grass[i], limit: () => Math.floor(this.quality.grassCount / 2) })),
      ...this.flowerMeshes.map((mesh, i) => ({ mesh, items: flowers[i], limit: () => Math.floor(this.quality.flowerCount / this.flowerMeshes.length) })),
      ...this.bushMeshes.map((mesh, i) => ({ mesh, items: bushes[i], limit: () => Infinity })),
      ...trees.flatMap((list, i) => [this.treeMeshes[i * 2], this.treeMeshes[i * 2 + 1]].map((mesh) => ({ mesh, items: list, limit: () => Infinity }))),
      { mesh: this.rockMesh, items: rocks, limit: () => Infinity },
      { mesh: this.pad, items: pads, limit: () => Infinity },
    ];
    this.applyScatter();
  }

  private applyScatter() {
    for (const s of this.scatter) {
      thin(s.mesh, s.items);
      s.mesh.thinInstanceCount = Math.max(1, Math.min(s.items.length, s.limit()));
    }
    this.pad.receiveShadows = false;
  }

  // ---------------------------------------------------------------- frame

  setFocus(p: Vector3) {
    this.focus.copyFrom(p);
    // keep the meadow under the camera; snapping to the texture period hides the move
    this.ground.position.x = Math.round(p.x / ISLAND_SIZE) * ISLAND_SIZE;
    this.ground.position.z = Math.round(p.z / ISLAND_SIZE) * ISLAND_SIZE;
  }

  applyQuality(q: QualityPreset) {
    this.quality = q;
    this.applyScatter();
    this.flies.forEach((b, i) => b.root.setEnabled(i < q.butterflies));
  }

  attachShadows(sg: ShadowGenerator) {
    for (const c of this.casters) sg.addShadowCaster(c, false);
  }

  update(t: number, _dt: number) {
    for (const b of this.flies) {
      if (!b.root.isEnabled()) continue;
      const tt = t * b.speed + b.phase;
      const x = this.focus.x + b.home.x * 0.6 + Math.sin(tt * 0.7) * 2.2 + Math.sin(tt * 1.9) * 0.4;
      const z = this.focus.z + b.home.z * 0.6 + Math.cos(tt * 0.5) * 1.8 + Math.cos(tt * 2.3) * 0.3;
      const y = 0.9 + Math.sin(tt * 2.1) * 0.3;
      const prev = b.root.position.clone();
      b.root.position.set(x, y, z);
      const vx = x - prev.x, vz = z - prev.z;
      if (Math.abs(vx) + Math.abs(vz) > 1e-5) b.root.rotation.y = Math.atan2(vx, vz) - Math.PI / 2;
      const flap = Math.sin(t * 22 + b.phase) * 1.05;
      b.wl.rotation.z = flap;
      b.wr.rotation.z = -flap;
    }
  }
}

