import { CreateGroundVertexData, DynamicTexture, Matrix, Mesh, Quaternion, Scene, ShadowGenerator, StandardMaterial, Texture, Vector3, VertexData } from '@babylonjs/core';
import { ISLAND_SIZE, PARCEL_DIM, parcelCenter, QualityPreset, TILE_PITCH, TILE_SIZE } from '../config';
import { hex, mulberry } from './geometry';
import { bushKit, buildButterflies, flowerKit, grassKit, rockKit, roundTree, pineTree } from './kits';
import { MaterialLibrary } from './materials';
import { artUrl } from '../art';

/**
 * The farm lies on one endless meadow. Parcels (4x4 tiles each) sit edge to
 * edge on the parcel grid, each opened parcel framed by a narrow dirt path so
 * the 4x4 groups still read; the parcel to come is overgrown with bushes and
 * the wild land around the farm carries trees, bushes, flowers and rocks.
 */

const ISLAND_CORNER = 1.1;
const TILES_HALF = (PARCEL_DIM * TILE_PITCH - (TILE_PITCH - TILE_SIZE)) / 2;
/** Size of the meadow mesh; it follows the camera, snapped to the texture period. */
const GROUND_SIZE = 1200;
/** Wild parcels beyond the one to come that get scenery. */
const WILD_RING = 16;
const PATH_WIDTH = 0.16;

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

/** Thin dirt path around a parcel: a rounded-rectangle ribbon (drawn as thin instances, one per parcel). */
function buildPath(scene: Scene) {
  const half = ISLAND_SIZE / 2 - PATH_WIDTH / 2;
  const R = 0.5, seg = 6;
  const pts: Vector3[] = [];
  const corners: Array<[number, number, number]> = [[half - R, half - R, 0], [-half + R, half - R, Math.PI / 2], [-half + R, -half + R, Math.PI], [half - R, -half + R, Math.PI * 1.5]];
  for (const [cx, cz, a0] of corners)
    for (let i = 0; i <= seg; i++) {
      const a = a0 + (i / seg) * (Math.PI / 2);
      pts.push(new Vector3(cx + Math.cos(a) * R, 0, cz + Math.sin(a) * R));
    }
  const positions: number[] = [];
  const indices: number[] = [];
  const w = PATH_WIDTH / 2;
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
  const m = new Mesh('parcel-path', scene);
  vd.applyToMesh(m);
  const mat = new StandardMaterial('path-mat', scene);
  mat.disableLighting = true;
  mat.emissiveColor = hex('#a8814e');
  mat.backFaceCulling = false;
  m.material = mat;
  m.position.y = 0.005;
  m.isPickable = false;
  return m;
}

export class World {
  private active = -1;
  private scatter: Array<{ mesh: Mesh; items: Placement[]; limit: () => number }> = [];
  private ground: Mesh;
  private path: Mesh;
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
    this.path = buildPath(scene);
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

  /** Parcels 0..active-1 hold tiles; parcel `active` is the overgrown one to come. */
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
    const paths: Placement[] = [];
    const pads: Placement[] = [];
    const half = ISLAND_SIZE / 2 - 0.3;
    const active = this.active;
    for (let k = 0; k <= active + WILD_RING; k++) {
      const { x: ox, z: oz } = parcelCenter(k);
      const r = mulberry(1000 + k * 77);
      const opened = k < active, next = k === active, wild = k > active;
      if (opened) {
        paths.push({ x: ox, y: 0.005, z: oz, s: 1, yaw: 0 });
        pads.push({ x: ox, y: 0, z: oz, s: 1, yaw: 0 });
      }
      const inBorder = (x: number, z: number) => Math.max(Math.abs(x), Math.abs(z)) > TILES_HALF + 0.12;
      const inside = (x: number, z: number) => {
        const [rx, rz] = roundCorner(x, z, half, ISLAND_CORNER - 0.3);
        return Math.abs(rx - x) < 1e-6 && Math.abs(rz - z) < 1e-6;
      };
      // opened parcels keep their tiles clear: decor only on the grass border
      const spot = () => {
        for (let t = 0; t < 30; t++) {
          const x = (r() * 2 - 1) * half, z = (r() * 2 - 1) * half;
          if (!inside(x, z)) continue;
          if (opened && !inBorder(x, z)) continue;
          return [x, z] as const;
        }
        return null;
      };
      const put = (list: Placement[], y: number, s: number, p = spot()) => p && list.push({ x: ox + p[0], y, z: oz + p[1], s, yaw: r() * 6.28 });
      if (!opened) {
        for (let i = 0; i < 60; i++) put(grass[i % 2], 0, 0.5 + r() * 0.35);
        for (let i = 0; i < 20; i++) put(flowers[Math.floor(r() * flowers.length)], 0, 0.9 + r() * 0.5);
      }
      for (let i = 0; i < (opened ? 2 : 3); i++) put(rocks, -0.04, (opened ? 0.18 : 0.25) + r() * 0.2);
      if (next) {
        const bushSpots: Array<[number, number]> = [[half - 0.4, half - 0.4], [half - 0.3, 0.6], [-1.2, half - 0.3], [half - 0.5, -half + 0.6]];
        for (let i = 0; i < 6; i++) bushSpots.push([(r() * 2 - 1) * (TILES_HALF - 0.4), (r() * 2 - 1) * (TILES_HALF - 0.4)]);
        bushSpots.forEach(([bx, bz], i) => bushes[(i + k) % bushes.length].push({ x: ox + bx, y: 0, z: oz + bz, s: 0.75 + r() * 0.4, yaw: r() * 6.28 }));
      }
      if (wild) {
        for (let i = 0; i < 4; i++) put(bushes[Math.floor(r() * bushes.length)], 0, 0.7 + r() * 0.5);
        for (let i = 0; i < 2 + Math.floor(r() * 3); i++) put(trees[Math.floor(r() * trees.length)], 0, 0.8 + r() * 0.5);
      }
    }
    this.scatter = [
      ...this.grassMeshes.map((mesh, i) => ({ mesh, items: grass[i], limit: () => Math.floor(this.quality.grassCount / 2) })),
      ...this.flowerMeshes.map((mesh, i) => ({ mesh, items: flowers[i], limit: () => Math.floor(this.quality.flowerCount / this.flowerMeshes.length) })),
      ...this.bushMeshes.map((mesh, i) => ({ mesh, items: bushes[i], limit: () => Infinity })),
      ...trees.flatMap((list, i) => [this.treeMeshes[i * 2], this.treeMeshes[i * 2 + 1]].map((mesh) => ({ mesh, items: list, limit: () => Infinity }))),
      { mesh: this.rockMesh, items: rocks, limit: () => Infinity },
      { mesh: this.path, items: paths, limit: () => Infinity },
      { mesh: this.pad, items: pads, limit: () => Infinity },
    ];
    this.applyScatter();
  }

  private applyScatter() {
    for (const s of this.scatter) {
      thin(s.mesh, s.items);
      s.mesh.thinInstanceCount = Math.max(1, Math.min(s.items.length, s.limit()));
    }
    this.path.receiveShadows = false;
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

