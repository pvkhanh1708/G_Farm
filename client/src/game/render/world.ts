import { Color3, CreateGroundVertexData, Matrix, Mesh, Quaternion, Scene, ShadowGenerator, Vector3, VertexData } from '@babylonjs/core';
import { ISLAND_SIZE, PARCEL_DIM, parcelCenter, QualityPreset, TILE_PITCH, TILE_SIZE } from '../config';
import { blob, GeoBuilder, hex, lathe, mix, mulberry, noise3, tf } from './geometry';
import { bushKit, buildButterflies, flowerKit, grassKit, rockKit, roundTree, pineTree } from './kits';
import { MaterialLibrary, toonMaterial } from './materials';

/**
 * Floating-island world: one grassy island per parcel, the next parcel shown as
 * a wild island, drifting clouds and a few distant islands for depth.
 */

const ISLAND_CORNER = 1.1;
const TILES_HALF = (PARCEL_DIM * TILE_PITCH - (TILE_PITCH - TILE_SIZE)) / 2;

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

/** Rounded-rectangle outline, counter-clockwise. */
function outline(half: number, R: number, perSide = 10, perArc = 8) {
  const pts: Array<[number, number]> = [];
  const corners: Array<[number, number, number]> = [[half - R, -half + R, -Math.PI / 2], [half - R, half - R, 0], [-half + R, half - R, Math.PI / 2], [-half + R, -half + R, Math.PI]];
  corners.forEach(([cx, cz, a0], i) => {
    for (let k = 0; k < perArc; k++) {
      const a = a0 + (k / perArc) * (Math.PI / 2);
      pts.push([cx + Math.cos(a) * R, cz + Math.sin(a) * R]);
    }
    const [nx, nz] = corners[(i + 1) % 4];
    const a1 = a0 + Math.PI / 2;
    const sx = cx + Math.cos(a1) * R, sz = cz + Math.sin(a1) * R;
    const ex = nx + Math.cos(a1) * R, ez = nz + Math.sin(a1) * R;
    for (let k = 0; k < perSide; k++) pts.push([sx + ((ex - sx) * k) / perSide, sz + ((ez - sz) * k) / perSide]);
  });
  return pts;
}

/** Earthy cliff hanging under an island outline: grassy lip, layered soil, rocky tip. */
function cliff(half: number, R: number, depth: number, seed: number) {
  const ring = outline(half, R);
  const n = ring.length;
  const bands: Array<[number, number, string]> = [
    [1.0, -0.02, '#5fae3c'], [1.01, -0.16, '#4f9c34'], [0.99, -0.24, '#c9884c'],
    [0.93, -0.55 * depth, '#b0703e'], [0.78, -1.0 * depth, '#93582f'], [0.55, -1.45 * depth, '#7a4627'], [0.28, -1.85 * depth, '#6a5a4c'],
  ];
  const positions: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];
  bands.forEach(([scale, y, col], b) => {
    const c = hex(col);
    ring.forEach(([x, z], i) => {
      const a = i / n;
      const wob = b < 3 ? 0 : (noise3(a * 14 + seed, b * 1.7, seed) - 0.5) * 0.35;
      const s = scale * (1 + wob * 0.25);
      positions.push(x * s, y + (b >= 3 ? wob * 0.5 : 0), z * s);
      const shade = 0.88 + noise3(a * 30, b, seed) * 0.24;
      colors.push(c.r * shade, c.g * shade, c.b * shade, 1);
    });
  });
  for (let b = 0; b < bands.length - 1; b++)
    for (let i = 0; i < n; i++) {
      const a = b * n + i, bb = b * n + ((i + 1) % n), c = a + n, d = bb + n;
      indices.push(a, bb, c, bb, d, c);
    }
  const tip = positions.length / 3;
  positions.push(0, -2.25 * depth, 0);
  const tc = hex('#5a4b40');
  colors.push(tc.r, tc.g, tc.b, 1);
  const last = (bands.length - 1) * n;
  for (let i = 0; i < n; i++) indices.push(last + i, last + ((i + 1) % n), tip);
  const vd = new VertexData();
  vd.positions = positions;
  vd.colors = colors;
  vd.indices = indices;
  vd.uvs = positions.flatMap((_, i) => (i % 3 === 0 ? [positions[i] * 0.3, positions[i + 1] * 0.3] : []));
  return vd;
}

/** Grassy top of an island: flat with a softly rounded rim. */
function islandTop(half: number, R: number, seed: number) {
  const vd = CreateGroundVertexData({ width: half * 2, height: half * 2, subdivisions: 36 });
  const p = vd.positions as number[];
  const colors: number[] = [];
  const base = hex('#ffffff'), warm = hex('#f2f7c8'), edge = hex('#c8e0b0');
  for (let i = 0; i < p.length; i += 3) {
    const [x, z] = roundCorner(p[i], p[i + 2], half, R);
    const ex = Math.abs(x) - (half - R), ez = Math.abs(z) - (half - R);
    const out = Math.hypot(Math.max(ex, 0), Math.max(ez, 0)) + Math.min(Math.max(ex, ez), 0);
    const k = Math.min(1, Math.max(0, (R - out) / 0.4));
    p[i] = x;
    p[i + 2] = z;
    p[i + 1] = -0.12 * (1 - Math.sin((k * Math.PI) / 2)) + (noise3(x * 0.8 + seed, 3, z * 0.8) - 0.5) * 0.03;
    const n = noise3(x * 0.35 + seed, 1, z * 0.35);
    const c = mix(mix(base, warm, n), edge, 1 - k);
    colors.push(c.r, c.g, c.b, 1);
  }
  vd.colors = colors;
  const normals: number[] = [];
  VertexData.ComputeNormals(p, vd.indices!, normals);
  vd.normals = normals;
  return vd;
}

interface Island {
  top: Mesh;
  cliff: Mesh;
  wild: boolean;
}

export class World {
  private islands = new Map<number, Island>();
  private scatter: Array<{ mesh: Mesh; items: Placement[]; limit: () => number }> = [];
  private clouds: Array<{ mesh: Mesh; speed: number }> = [];
  private far: Mesh[] = [];
  private flies;
  private casters: Mesh[] = [];
  private shadowGen: ShadowGenerator | null = null;
  private quality: QualityPreset;
  private focus = new Vector3();
  private grassMeshes: Mesh[];
  private flowerMeshes: Mesh[];
  private bushMeshes: Mesh[];
  private rockMesh: Mesh;
  private treeMeshes: Mesh[];

  constructor(private scene: Scene, private mats: MaterialLibrary, quality: QualityPreset) {
    this.quality = quality;
    this.grassMeshes = [grassKit(80), grassKit(81)].map((g, i) => g.build(`grass-${i}`, scene, mats.grass));
    const flowerColours: Array<[string, string]> = [['#ff6fa3', '#ffe27a'], ['#ffd84a', '#e08a1e'], ['#ffffff', '#ffd23f'], ['#b98cff', '#fff3a0'], ['#ff7a45', '#7a3d1a']];
    this.flowerMeshes = flowerColours.map(([p, c], i) => flowerKit(60 + i, hex(p), hex(c)).build(`flowers-${i}`, scene, mats.grass));
    this.bushMeshes = [bushKit(10), bushKit(11, hex('#ffffff')), bushKit(12, hex('#ffd23f')), bushKit(13, hex('#ff7fa8'))].map((k, i) => k.canopy.build(`bush-${i}`, scene, mats.foliage));
    this.rockMesh = rockKit(5).build('rock', scene, mats.props);
    const tree = roundTree(1, hex('#3d8c33'), hex('#b2e466'));
    const blossom = roundTree(3, hex('#e57fa8'), hex('#ffe0ee'));
    const pine = pineTree(4);
    this.treeMeshes = [tree.trunk.build('tree-trunk', scene, mats.props), tree.canopy.build('tree-canopy', scene, mats.foliage), blossom.trunk.build('blossom-trunk', scene, mats.props), blossom.canopy.build('blossom-canopy', scene, mats.foliage), pine.trunk.build('pine-trunk', scene, mats.props), pine.canopy.build('pine-canopy', scene, mats.foliage)];
    this.casters.push(...this.bushMeshes, this.rockMesh, ...this.treeMeshes);
    this.buildClouds();
    this.buildFarIslands();
    this.flies = buildButterflies(scene, 5);
  }

  // ---------------------------------------------------------------- islands

  private buildIsland(k: number, wild: boolean): Island {
    const { x, z } = parcelCenter(k);
    const half = ISLAND_SIZE / 2;
    const tg = new GeoBuilder();
    tg.add(islandTop(half, ISLAND_CORNER, k * 7.1), tf([0, 0, 0]));
    const top = tg.build(`island-top-${k}`, this.scene, this.mats.grassGround);
    const cg = new GeoBuilder();
    cg.add(cliff(half, ISLAND_CORNER, 1 + (k % 3) * 0.12, k * 3.3), tf([0, 0, 0]));
    const cl = cg.build(`island-cliff-${k}`, this.scene, this.mats.props);
    for (const m of [top, cl]) {
      m.position.set(x, 0, z);
      m.receiveShadows = true;
      m.isPickable = false;
      m.freezeWorldMatrix();
    }
    return { top, cliff: cl, wild };
  }

  /** Parcels 0..active-1 hold tiles; parcel `active` is shown as a wild island to come. */
  setParcels(active: number) {
    // a reset or switching account can shrink the farm
    for (const [k, isl] of this.islands)
      if (k > active) {
        isl.top.dispose();
        isl.cliff.dispose();
        this.islands.delete(k);
      }
    for (let k = 0; k <= active; k++) {
      const wild = k === active;
      const cur = this.islands.get(k);
      if (cur && cur.wild === wild) continue;
      if (cur) {
        cur.top.dispose();
        cur.cliff.dispose();
      }
      const isl = this.buildIsland(k, wild);
      this.islands.set(k, isl);
      this.shadowGen?.addShadowCaster(isl.cliff, false);
    }
    this.rebuildScatter();
  }

  /** Decor along each island's border strip; wild islands are overgrown everywhere. */
  private rebuildScatter() {
    const grass: Placement[][] = [[], []];
    const flowers: Placement[][] = this.flowerMeshes.map(() => []);
    const bushes: Placement[][] = this.bushMeshes.map(() => []);
    const rocks: Placement[] = [];
    const half = ISLAND_SIZE / 2 - 0.3;
    for (const [k, isl] of this.islands) {
      const { x: ox, z: oz } = parcelCenter(k);
      const r = mulberry(1000 + k * 77);
      const inBorder = (x: number, z: number) => Math.max(Math.abs(x), Math.abs(z)) > TILES_HALF + 0.12;
      const inside = (x: number, z: number) => {
        const [rx, rz] = roundCorner(x, z, half, ISLAND_CORNER - 0.3);
        return Math.abs(rx - x) < 1e-6 && Math.abs(rz - z) < 1e-6;
      };
      const spot = (needBorder: boolean) => {
        for (let t = 0; t < 30; t++) {
          const x = (r() * 2 - 1) * half, z = (r() * 2 - 1) * half;
          if (!inside(x, z)) continue;
          if (needBorder && !inBorder(x, z)) continue;
          return [x, z] as const;
        }
        return null;
      };
      const border = !isl.wild;
      for (let i = 0; i < (isl.wild ? 70 : 34); i++) {
        const p = spot(border);
        if (p) grass[i % 2].push({ x: ox + p[0], y: 0, z: oz + p[1], s: 0.5 + r() * 0.35, yaw: r() * 6.28 });
      }
      for (let i = 0; i < (isl.wild ? 26 : 16); i++) {
        const p = spot(border);
        if (p) flowers[Math.floor(r() * flowers.length)].push({ x: ox + p[0], y: 0, z: oz + p[1], s: 0.9 + r() * 0.5, yaw: r() * 6.28 });
      }
      // bushes only overgrow the wild island to come; opened parcels are kept clear around the tiles
      if (isl.wild) {
        const bushSpots: Array<[number, number]> = [[half - 0.4, half - 0.4], [half - 0.3, 0.6], [-1.2, half - 0.3], [half - 0.5, -half + 0.6]];
        for (let i = 0; i < 6; i++) bushSpots.push([(r() * 2 - 1) * (TILES_HALF - 0.4), (r() * 2 - 1) * (TILES_HALF - 0.4)]);
        bushSpots.forEach(([bx, bz], i) => bushes[(i + k) % bushes.length].push({ x: ox + bx, y: 0, z: oz + bz, s: 0.75 + r() * 0.4, yaw: r() * 6.28 }));
      }
      for (let i = 0; i < 3; i++) {
        const p = spot(true);
        if (p) rocks.push({ x: ox + p[0], y: -0.04, z: oz + p[1], s: 0.25 + r() * 0.25, yaw: r() * 6.28 });
      }
    }
    this.scatter = [
      ...this.grassMeshes.map((mesh, i) => ({ mesh, items: grass[i], limit: () => Math.floor(this.quality.grassCount / 2) })),
      ...this.flowerMeshes.map((mesh, i) => ({ mesh, items: flowers[i], limit: () => Math.floor(this.quality.flowerCount / this.flowerMeshes.length) })),
      ...this.bushMeshes.map((mesh, i) => ({ mesh, items: bushes[i], limit: () => Infinity })),
      { mesh: this.rockMesh, items: rocks, limit: () => Infinity },
    ];
    this.applyScatter();
  }

  private applyScatter() {
    for (const s of this.scatter) {
      thin(s.mesh, s.items);
      s.mesh.thinInstanceCount = Math.max(1, Math.min(s.items.length, s.limit()));
    }
  }

  // ---------------------------------------------------------------- sky

  private buildClouds() {
    const mat = toonMaterial(this.scene, 'cloud', { emissive: new Color3(0.42, 0.46, 0.5), roughness: 1 });
    mat.specularIntensity = 0;
    const r = mulberry(55);
    for (let c = 0; c < 3; c++) {
      const g = new GeoBuilder();
      const n = 5 + c;
      for (let i = 0; i < n; i++) {
        const s = 1.2 + r() * 1.4;
        g.add(blob(s, 0.12, c * 10 + i, 2), tf([(i - n / 2) * 1.5 + r(), r() * 0.6, (r() - 0.5) * 1.6], 0, [1, 0.7, 1]), (l) => mix(hex('#c9dcef'), hex('#ffffff'), l.y * 0.6 + 0.6));
      }
      const proto = g.build(`cloud-${c}`, this.scene, mat);
      proto.isPickable = false;
      for (let i = 0; i < 5; i++) {
        const inst = i === 0 ? proto : (proto.createInstance(`cloud-${c}-${i}`) as unknown as Mesh);
        inst.position.set((r() - 0.5) * 140, -7 - r() * 7, (r() - 0.5) * 140);
        inst.scaling.setAll(0.9 + r() * 0.8);
        this.clouds.push({ mesh: inst, speed: 0.4 + r() * 0.5 });
      }
    }
  }

  private buildFarIslands() {
    const r = mulberry(91);
    const trees: Placement[][] = [[], [], []];
    const spots: Array<[number, number, number]> = [[-34, 20, -7], [38, -16, -9], [-24, -38, -8], [30, 36, -6], [56, 10, -10]];
    spots.forEach(([x, z, y], i) => {
      const g = new GeoBuilder();
      const rad = 1.6 + r() * 0.9;
      g.add(lathe([[rad * 0.25, -rad * 1.6], [rad * 0.8, -rad * 0.7], [rad * 1.02, -0.25], [rad, 0]], 14, true, false), tf([0, 0, 0]), (l) =>
        l.y > -0.2 ? hex('#5fae3c') : mix(hex('#6a4a35'), hex('#b0703e'), (l.y + rad * 1.6) / (rad * 1.6)),
      );
      const m = g.build(`far-island-${i}`, this.scene, this.mats.props);
      m.position.set(x, y, z);
      m.isPickable = false;
      this.far.push(m);
      for (let t = 0; t < 2; t++) trees[(i + t) % 3].push({ x: x + (r() - 0.5) * rad, y, z: z + (r() - 0.5) * rad, s: 0.8 + r() * 0.4, yaw: r() * 6 });
    });
    trees.forEach((list, i) => {
      thin(this.treeMeshes[i * 2], list);
      thin(this.treeMeshes[i * 2 + 1], list);
    });
  }

  // ---------------------------------------------------------------- frame

  setFocus(p: Vector3) {
    this.focus.copyFrom(p);
  }

  applyQuality(q: QualityPreset) {
    this.quality = q;
    this.applyScatter();
    this.flies.forEach((b, i) => b.root.setEnabled(i < q.butterflies));
  }

  attachShadows(sg: ShadowGenerator) {
    this.shadowGen = sg;
    for (const c of this.casters) sg.addShadowCaster(c, false);
    for (const isl of this.islands.values()) sg.addShadowCaster(isl.cliff, false);
  }

  update(t: number, dt: number) {
    for (const c of this.clouds) {
      c.mesh.position.x += c.speed * dt;
      if (c.mesh.position.x > 80) c.mesh.position.x -= 160;
    }
    this.far.forEach((m, i) => (m.position.y += Math.sin(t * 0.4 + i) * 0.0015));
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

