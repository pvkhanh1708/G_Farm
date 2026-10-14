import {
  Color3,
  CreateBoxVertexData,
  CreatePlane,
  Matrix,
  Mesh,
  Quaternion,
  Scene,
  ShadowGenerator,
  StandardMaterial,
  TransformNode,
  Vector3,
  VertexData,
} from '@babylonjs/core';
import { PLOT_SPACING, PLOT_SIZE, QualityPreset, tileId } from '../config';
import { blade, blob, chain, GeoBuilder, hex, jitter, lathe, mix, mulberry, tf } from './geometry';
import { MaterialLibrary } from './materials';
import { BARN_POS, pathDist, pondNorm, terrainHeight, WINDMILL_POS } from './terrain';
import { butterflyWingTexture } from './textures';

type Placement = { x: number; z: number; s: number; yaw: number };

/** Static obstacles only; farm tiles clear props dynamically (see applyClearing). */
function isFree(x: number, z: number, margin: number) {
  if (pathDist(x, z) < 1.0 + margin) return false;
  if (pondNorm(x, z) < 1.12 + margin * 0.3) return false;
  if (Math.hypot(x - BARN_POS.x, z - BARN_POS.z) < 4.2 + margin) return false;
  if (Math.hypot(x - WINDMILL_POS.x, z - WINDMILL_POS.z) < 2.4 + margin) return false;
  return true;
}

function thin(mesh: Mesh, items: Placement[], yOffset = 0) {
  const buf = new Float32Array(items.length * 16);
  const m = new Matrix();
  items.forEach((it, i) => {
    Matrix.ComposeToRef(
      new Vector3(it.s, it.s, it.s),
      Quaternion.RotationYawPitchRoll(it.yaw, 0, 0),
      new Vector3(it.x, terrainHeight(it.x, it.z) + yOffset, it.z),
      m,
    );
    m.copyToArray(buf, i * 16);
  });
  mesh.thinInstanceSetBuffer('matrix', buf, 16, true);
  mesh.thinInstanceRefreshBoundingInfo(false);
  mesh.isPickable = false;
  mesh.receiveShadows = true;
  mesh.alwaysSelectAsActiveMesh = false;
  return mesh;
}

// ------------------------------------------------------------------ trees

interface TreeKit {
  trunk: GeoBuilder;
  canopy: GeoBuilder;
}

function roundTree(seed: number, leafDark: Color3, leafLight: Color3, accent?: Color3): TreeKit {
  const r = mulberry(seed);
  const trunk = new GeoBuilder();
  const bark = hex('#7d5136'), barkLight = hex('#a7764e');
  const lean = (r() - 0.5) * 0.12;
  trunk.add(lathe([[0.26, -0.1], [0.19, 0.5], [0.15, 1.3], [0.12, 2.0]], 7, true), tf([0, 0, 0], 0, 1, lean, 0), (l) => mix(bark, barkLight, l.y / 2));
  trunk.add(lathe([[0.08, 0], [0.05, 0.6]], 5, true), tf([0, 1.2, 0], r() * 6, 1, 0.9, 0), bark);
  const canopy = new GeoBuilder();
  const blobs: Array<[number, number, number, number]> = [[0, 2.55, 0, 1.15]];
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + r();
    blobs.push([Math.cos(a) * 0.75, 2.05 + r() * 0.5, Math.sin(a) * 0.75, 0.68 + r() * 0.2]);
  }
  blobs.push([0.1, 3.25, -0.1, 0.65]);
  blobs.forEach(([x, y, z, rad], i) => {
    canopy.add(blob(rad, 0.22, seed + i * 3, 2), tf([x, y, z], r() * 6), (_l, w) => {
      const t = (w.y - 1.5) / 2.1 + (w.x - w.z) * 0.08;
      return mix(leafDark, leafLight, t);
    });
  });
  if (accent) {
    for (let i = 0; i < 14; i++) {
      const [bx, by, bz, br] = blobs[Math.floor(r() * blobs.length)];
      const u = r() * 2 - 1, a = r() * 6.28;
      const s = Math.sqrt(1 - u * u);
      canopy.add(blob(0.08, 0.1, i, 1), tf([bx + Math.cos(a) * s * br, by + u * br, bz + Math.sin(a) * s * br]), accent);
    }
  }
  return { trunk, canopy };
}

function pineTree(seed: number): TreeKit {
  const r = mulberry(seed);
  const trunk = new GeoBuilder();
  trunk.add(lathe([[0.2, -0.1], [0.14, 0.9]], 6, true), tf([0, 0, 0]), hex('#7a4f34'));
  const canopy = new GeoBuilder();
  const dark = hex('#2f7a55'), light = hex('#8fdc84');
  const tiers: Array<[number, number, number]> = [[0.6, 1.25, 1.5], [1.4, 1.0, 1.3], [2.15, 0.75, 1.15]];
  tiers.forEach(([y, rad, h], i) => {
    const vd = lathe([[rad * 0.55, -0.05], [rad, 0.08], [rad * 0.55, h * 0.45], [0, h]], 9, false, true);
    const p = vd.positions as number[];
    for (let k = 0; k < p.length; k += 3) {
      const a = Math.atan2(p[k + 2], p[k]);
      const j = 1 + 0.12 * Math.sin(a * 9 + i);
      p[k] *= j;
      p[k + 2] *= j;
    }
    canopy.add(vd, tf([0, y, 0], r() * 6), (_l, w) => mix(dark, light, (w.y - 0.5) / 3 + 0.15));
  });
  return { trunk, canopy };
}

function bushKit(seed: number, flowers?: Color3): TreeKit {
  const r = mulberry(seed);
  const canopy = new GeoBuilder();
  const dark = hex('#3c8a2f'), light = hex('#a6e063');
  const pts: Array<[number, number, number, number]> = [];
  for (let i = 0; i < 4; i++) {
    const p: [number, number, number, number] = [(r() - 0.5) * 0.7, 0.32 + r() * 0.15, (r() - 0.5) * 0.7, 0.36 + r() * 0.16];
    pts.push(p);
    canopy.add(blob(p[3], 0.28, seed + i, 2, true), tf([p[0], p[1], p[2]], r() * 6), (_l, w) => mix(dark, light, w.y * 0.9 + 0.1));
  }
  if (flowers)
    for (let i = 0; i < 10; i++) {
      const [bx, by, bz, br] = pts[i % pts.length];
      const a = r() * 6.28, u = r() * 0.8;
      canopy.add(blob(0.05, 0.1, i, 1), tf([bx + Math.cos(a) * br * Math.sqrt(1 - u * u), by + u * br, bz + Math.sin(a) * br * Math.sqrt(1 - u * u)]), flowers);
    }
  return { trunk: new GeoBuilder(), canopy };
}

// ------------------------------------------------------------------ small props

function flowerKit(seed: number, petal: Color3, centre: Color3) {
  const r = mulberry(seed);
  const g = new GeoBuilder();
  for (let f = 0; f < 3; f++) {
    const x = (r() - 0.5) * 0.3, z = (r() - 0.5) * 0.3;
    const h = 0.16 + r() * 0.14;
    g.add(blade({ length: h, width: 0.012, bend: 0.2, lean: (r() - 0.5) * 0.3, shape: 'strap', segments: 3, fold: 0, base: hex('#3f8f2c'), tip: hex('#6fbf45') }), tf([x, 0, z], r() * 6));
    g.add(blade({ length: 0.09, width: 0.04, bend: 0.8, lean: 0.9, shape: 'leaf', segments: 3, fold: 0.2, base: hex('#3f8f2c'), tip: hex('#8ed060') }), tf([x, 0.02, z], r() * 6));
    for (let p = 0; p < 5; p++)
      g.add(
        blade({ length: 0.075, width: 0.06, bend: 0.5, lean: 1.25, shape: 'round', segments: 3, fold: 0.15, base: mix(petal, Color3.White(), 0.25), tip: petal }),
        tf([x, h, z], (p / 5) * Math.PI * 2 + f),
      );
    g.add(blob(0.028, 0.1, f, 1), tf([x, h + 0.01, z]), centre);
  }
  return g;
}

function grassKit(seed: number) {
  const r = mulberry(seed);
  const g = new GeoBuilder();
  for (let i = 0; i < 9; i++) {
    g.add(
      blade({ length: 0.18 + r() * 0.2, width: 0.04, bend: 0.6 + r() * 0.7, lean: 0.1 + r() * 0.35, shape: 'taper', segments: 4, fold: 0.2, base: hex('#4f9d31'), tip: jitter(hex('#b6e66c'), 0.08, r) }),
      tf([(r() - 0.5) * 0.18, 0, (r() - 0.5) * 0.18], r() * 6.28),
    );
  }
  return g;
}

function rockKit(seed: number) {
  const r = mulberry(seed);
  const g = new GeoBuilder();
  const grey = hex('#8f9aa3'), light = hex('#d3d9dd'), moss = hex('#86b85a');
  g.add(blob(0.5, 0.38, seed, 2, true), tf([0, 0.12, 0], 0, [1.2, 0.75, 1]), (l) => (l.y > 0.32 ? mix(light, moss, 0.55) : mix(grey, light, l.y + 0.4)));
  g.add(blob(0.25, 0.35, seed + 1, 1, true), tf([0.55, 0.05, 0.2], r() * 6, [1, 0.7, 1]), (l) => mix(grey, light, l.y * 2 + 0.5));
  return g;
}

// ------------------------------------------------------------------ buildings

function prism(profile: Array<[number, number]>, depth: number): VertexData {
  // extrude a convex XY polygon along Z, flat-shaded (duplicated verts per face)
  const positions: number[] = [];
  const indices: number[] = [];
  const uvs: number[] = [];
  const n = profile.length;
  const z0 = -depth / 2, z1 = depth / 2;
  for (let i = 0; i < n; i++) {
    const [ax, ay] = profile[i], [bx, by] = profile[(i + 1) % n];
    const b = positions.length / 3;
    positions.push(ax, ay, z0, bx, by, z0, bx, by, z1, ax, ay, z1);
    uvs.push(0, 0, 1, 0, 1, 1, 0, 1);
    indices.push(b, b + 2, b + 1, b, b + 3, b + 2);
  }
  for (const [z, flip] of [[z0, false], [z1, true]] as const) {
    const b = positions.length / 3;
    profile.forEach(([x, y]) => {
      positions.push(x, y, z);
      uvs.push(x, y);
    });
    for (let i = 1; i < n - 1; i++) flip ? indices.push(b, b + i, b + i + 1) : indices.push(b, b + i + 1, b + i);
  }
  const vd = new VertexData();
  vd.positions = positions;
  vd.indices = indices;
  vd.uvs = uvs;
  return vd;
}

function box(w: number, h: number, d: number) {
  return CreateBoxVertexData({ width: w, height: h, depth: d });
}

function buildBarn(scene: Scene, mats: MaterialLibrary) {
  const g = new GeoBuilder();
  const red = hex('#d9473a'), redDark = hex('#b8372d'), white = hex('#fbf3e4'), roof = hex('#566c8c'), roofLight = hex('#7189ab');
  const stone = hex('#a5a29a');
  const W = 1.9, D = 3.4;
  g.add(box(2 * W + 0.4, 0.3, D + 0.4), tf([0, 0.1, 0]), stone);
  const body: Array<[number, number]> = [[-W, 0], [W, 0], [W, 1.9], [1.2, 2.75], [0, 3.05], [-1.2, 2.75], [-W, 1.9]];
  g.add(prism(body, D), tf([0, 0.25, 0]), (l) => mix(redDark, red, Math.min(1, l.y / 1.5)));
  // white trims
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(box(0.14, 1.95, 0.14), tf([sx * W, 1.22, sz * D / 2]), white);
  for (const sz of [-1, 1]) g.add(box(2 * W + 0.1, 0.12, 0.08), tf([0, 2.15, sz * (D / 2 + 0.01)]), white);
  // roof panels (gambrel)
  const panels: Array<[[number, number], [number, number]]> = [[[W, 1.9 + 0.25], [1.2, 2.75 + 0.25]], [[1.2, 2.75 + 0.25], [0, 3.05 + 0.25]]];
  for (const side of [1, -1])
    for (const [[ax, ay], [bx, by]] of panels) {
      const dx = (bx - ax) * side, dy = by - ay;
      const L = Math.hypot(dx, dy);
      const ang = Math.atan2(dy, dx);
      const nx = (side * dy) / L, ny = (-side * dx) / L; // outward normal
      const cx = ((ax + bx) / 2) * side + nx * 0.08, cy = (ay + by) / 2 + ny * 0.08;
      g.add(box(L + 0.22, 0.13, D + 0.5), tf([cx, cy, 0], 0, 1, 0, ang), (l) => (l.y > 0 ? mix(roof, roofLight, 0.5 + l.x * 0.2) : roof));
    }
  g.add(box(0.22, 0.16, D + 0.55), tf([0, 3.4, 0]), white);
  // front: big door with X braces + hayloft
  const fz = -D / 2 - 0.04;
  g.add(box(1.7, 1.75, 0.08), tf([0, 1.12, fz]), white);
  g.add(box(1.45, 1.55, 0.06), tf([0, 1.05, fz - 0.03]), hex('#8e3b29'));
  for (const s of [-1, 1]) g.add(box(0.11, 2.05, 0.05), tf([0, 1.05, fz - 0.07], 0, 1, 0, s * 0.82), white);
  g.add(box(0.06, 1.55, 0.05), tf([0, 1.05, fz - 0.06]), white);
  g.add(box(0.85, 0.75, 0.08), tf([0, 2.55, fz]), white);
  g.add(box(0.65, 0.58, 0.06), tf([0, 2.55, fz - 0.03]), hex('#4a2a1d'));
  // side windows
  for (const sx of [-1, 1]) {
    g.add(box(0.08, 0.6, 0.75), tf([sx * (W + 0.03), 1.35, 0.4]), white);
    g.add(box(0.06, 0.45, 0.6), tf([sx * (W + 0.06), 1.35, 0.4]), hex('#ffe9a8'));
  }
  // little cupola
  g.add(box(0.55, 0.45, 0.55), tf([0, 3.6, 0.6]), white);
  g.add(lathe([[0.48, 0], [0.0, 0.42]], 4, false, true), tf([0, 3.82, 0.6], Math.PI / 4), roof);
  const m = g.build('barn', scene, mats.props);
  m.position.set(BARN_POS.x, terrainHeight(BARN_POS.x, BARN_POS.z), BARN_POS.z);
  m.rotation.y = -0.12;
  m.receiveShadows = true;
  return m;
}

function buildWindmill(scene: Scene, mats: MaterialLibrary) {
  const g = new GeoBuilder();
  const cream = hex('#f6e8c8'), creamDark = hex('#dccaa4'), stone = hex('#9d9b94'), roof = hex('#d1493b');
  g.add(lathe([[1.3, 0], [1.3, 0.38], [1.1, 0.42]], 8, true), tf([0, 0, 0], Math.PI / 8), stone);
  g.add(lathe([[1.08, 0.38], [0.95, 1.6], [0.78, 3.6]], 8, false), tf([0, 0, 0], Math.PI / 8), (l) => mix(creamDark, cream, l.y / 3));
  g.add(lathe([[0.9, 3.55], [0.98, 3.72], [0.55, 4.3], [0.0, 4.8]], 8, false, true), tf([0, 0, 0], Math.PI / 8), (l) => mix(roof, hex('#e86a52'), (l.y - 3.5)));
  const face = new Vector3(-Math.SQRT1_2, 0, -Math.SQRT1_2);
  const yaw = Math.atan2(face.x, face.z);
  g.add(box(0.6, 0.95, 0.12), tf([face.x * 1.06, 0.85, face.z * 1.06], yaw), hex('#8e5a36'));
  for (const h of [1.8, 2.8]) g.add(box(0.36, 0.42, 0.1), tf([face.x * (1.02 - h * 0.075), h, face.z * (1.02 - h * 0.075)], yaw), hex('#5a3a28'));
  const tower = g.build('windmill', scene, mats.props);
  const base = new Vector3(WINDMILL_POS.x, terrainHeight(WINDMILL_POS.x, WINDMILL_POS.z), WINDMILL_POS.z);
  tower.position.copyFrom(base);
  tower.receiveShadows = true;

  const bg = new GeoBuilder();
  const wood = hex('#9a6a44'), sail = hex('#fff7e6');
  bg.add(blob(0.2, 0.05, 1, 1), tf([0, 0, 0], 0, [1, 1, 1.4]), wood);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    const arm = Matrix.RotationZ(a);
    bg.add(box(0.09, 2.3, 0.09), chain(Matrix.Translation(0, 1.2, -0.05), arm), wood);
    bg.add(box(0.6, 1.75, 0.04), chain(Matrix.Translation(0.34, 1.35, -0.02), arm), (l) => mix(sail, hex('#efe0c0'), l.y + 0.5));
    for (let k = 0; k < 4; k++) bg.add(box(0.64, 0.035, 0.05), chain(Matrix.Translation(0.34, 0.6 + k * 0.5, -0.05), arm), wood);
  }
  const blades = bg.build('windmill-blades', scene, mats.props);
  const hub = new TransformNode('windmill-hub', scene);
  hub.position = base.add(new Vector3(face.x * 0.98, 4.0, face.z * 0.98));
  hub.rotation.y = yaw + Math.PI;
  blades.parent = hub;
  return { tower, blades, hub };
}

function buildFarmProps(scene: Scene, mats: MaterialLibrary) {
  const g = new GeoBuilder();
  const r = mulberry(99);
  const hay = hex('#f0c75e'), hayDark = hex('#c99a38'), band = hex('#8a5a32');
  const bale = (x: number, z: number, yaw: number, stackY = 0) => {
    const y = terrainHeight(x, z) + 0.42 + stackY;
    const M = chain(Matrix.Translation(0, -0.45, 0), Matrix.RotationZ(Math.PI / 2), Matrix.RotationY(yaw), Matrix.Translation(x, y, z));
    g.add(lathe([[0.36, 0], [0.42, 0.06], [0.42, 0.84], [0.36, 0.9]], 12, true, true), M, (l) => (Math.abs(l.y - 0.3) < 0.03 || Math.abs(l.y - 0.6) < 0.03 ? band : mix(hayDark, hay, 0.6 + Math.sin(l.x * 20) * 0.2)));
  };
  bale(BARN_POS.x + 2.9, BARN_POS.z - 1.2, 0.3);
  bale(BARN_POS.x + 3.3, BARN_POS.z + 0.0, 1.4);
  bale(BARN_POS.x + 3.0, BARN_POS.z - 0.6, 0.8, 0.8);
  const crate = (x: number, z: number, s: number) => {
    const y = terrainHeight(x, z);
    g.add(box(s, s, s), tf([x, y + s / 2, z], r()), hex('#c08a55'));
    for (const dy of [-0.38, 0.38]) g.add(box(s + 0.02, s * 0.12, s + 0.02), tf([x, y + s / 2 + dy * s, z], 0), hex('#8c5a34'));
  };
  crate(BARN_POS.x - 2.7, BARN_POS.z - 1.4, 0.55);
  crate(BARN_POS.x - 2.3, BARN_POS.z - 2.0, 0.42);
  // signpost by the west gate
  const sx = -6.4, sz = -1.4;
  const sy = terrainHeight(sx, sz);
  g.add(box(0.1, 1.1, 0.1), tf([sx, sy + 0.55, sz]), hex('#9a6a44'));
  g.add(box(0.9, 0.32, 0.06), tf([sx, sy + 0.95, sz], 0.9), hex('#d9a56b'));
  // water trough
  const tx = 6.2, tz = -2.0, ty = terrainHeight(tx, tz);
  g.add(box(1.2, 0.4, 0.55), tf([tx, ty + 0.2, tz], 0.4), hex('#9a6a44'));
  g.add(box(1.05, 0.05, 0.4), tf([tx, ty + 0.37, tz], 0.4), hex('#5fc6e0'));
  const m = g.build('farm-props', scene, mats.props);
  m.receiveShadows = true;
  m.isPickable = false;
  m.freezeWorldMatrix();
  return m;
}

// ------------------------------------------------------------------ butterflies

interface Butterfly {
  root: TransformNode;
  wl: Mesh;
  wr: Mesh;
  home: Vector3;
  phase: number;
  speed: number;
}

function buildButterflies(scene: Scene, count: number): Butterfly[] {
  const palette: Array<[string, string]> = [['#ffb347', '#e0662a'], ['#9ad7ff', '#3d7fd9'], ['#ffe066', '#e0a020'], ['#ff9ecf', '#d0508f'], ['#ffffff', '#c9b6ff']];
  const homes = [new Vector3(-6.5, 0, -3), new Vector3(6.8, 0, 2), new Vector3(-7.5, 0, 4), new Vector3(3, 0, -7), new Vector3(-3, 0, 7.5)];
  const wing = CreatePlane('wing', { width: 0.2, height: 0.2 }, scene);
  wing.bakeTransformIntoVertices(chain(Matrix.Translation(0.1, 0, 0), Matrix.RotationX(Math.PI / 2)));
  wing.isVisible = false;
  const out: Butterfly[] = [];
  for (let i = 0; i < Math.min(count, homes.length); i++) {
    const [a, b] = palette[i % palette.length];
    const mat = new StandardMaterial(`wing-${i}`, scene);
    mat.diffuseTexture = butterflyWingTexture(scene, a, b);
    mat.diffuseTexture.hasAlpha = true;
    mat.useAlphaFromDiffuseTexture = true;
    mat.backFaceCulling = false;
    mat.emissiveColor = new Color3(0.35, 0.35, 0.35);
    mat.specularColor = Color3.Black();
    const root = new TransformNode(`butterfly-${i}`, scene);
    const wl = wing.clone(`wl-${i}`)!;
    const wr = wing.clone(`wr-${i}`)!;
    for (const w of [wl, wr]) {
      w.isVisible = true;
      w.material = mat;
      w.parent = root;
      w.isPickable = false;
    }
    wr.scaling.x = -1;
    out.push({ root, wl, wr, home: homes[i], phase: i * 1.7, speed: 0.6 + i * 0.08 });
  }
  return out;
}

// ------------------------------------------------------------------ assembly

export interface Environment {
  barn: Mesh;
  update(t: number, dt: number): void;
  applyQuality(q: QualityPreset): void;
  shadowCasters: Mesh[];
  attachShadows(sg: ShadowGenerator): void;
  /** Hide scattered props that overlap (or would block the view of) these farm tiles. */
  applyClearing(tiles: Array<{ col: number; row: number }>): void;
}

export function buildEnvironment(scene: Scene, mats: MaterialLibrary, q: QualityPreset): Environment {
  const casters: Mesh[] = [];
  const r = mulberry(2024);

  // trees -----------------------------------------------------------
  const kits = [
    { kit: roundTree(1, hex('#3d8c33'), hex('#b2e466')), weight: 4 },
    { kit: roundTree(2, hex('#4a9a3a'), hex('#cdea70'), hex('#ff5a3a')), weight: 2 },
    { kit: roundTree(3, hex('#e57fa8'), hex('#ffe0ee')), weight: 1.3 },
    { kit: pineTree(4), weight: 3 },
  ];
  const treeSpots: Placement[][] = kits.map(() => []);
  const totalW = kits.reduce((s, k) => s + k.weight, 0);
  let tries = 0;
  const placed: Placement[] = [];
  while (placed.length < 95 && tries++ < 4000) {
    const a = r() * Math.PI * 2;
    const d = 7 + Math.pow(r(), 0.7) * 34;
    const x = Math.cos(a) * d, z = Math.sin(a) * d;
    // keep the camera-facing foreground light so trees never hide the farm
    const toward = -(x + z) / Math.SQRT2;
    if (toward > 6 && d < 22 && r() < 0.8) continue;
    if (!isFree(x, z, 1.2)) continue;
    if (placed.some((p) => Math.hypot(p.x - x, p.z - z) < 2.3 * Math.max(p.s, 1))) continue;
    const s = 0.8 + r() * 0.55 + Math.min(0.5, (d - 7) / 40);
    const it = { x, z, s, yaw: r() * 6.28 };
    placed.push(it);
    let pick = r() * totalW;
    let k = 0;
    while ((pick -= kits[k].weight) > 0) k++;
    treeSpots[k].push(it);
  }
  kits.forEach(({ kit }, i) => {
    if (!treeSpots[i].length) return;
    if (kit.trunk.vertexCount) {
      const trunk = thin(kit.trunk.build(`tree-trunk-${i}`, scene, mats.props), treeSpots[i]);
      casters.push(trunk);
    }
    const canopy = thin(kit.canopy.build(`tree-canopy-${i}`, scene, mats.foliage), treeSpots[i]);
    casters.push(canopy);
  });

  // bushes ------------------------------------------------------------
  const bushKits = [bushKit(10), bushKit(11, hex('#ffffff')), bushKit(12, hex('#ffd23f')), bushKit(13, hex('#ff7fa8'))];
  const bushSpots: Placement[][] = bushKits.map(() => []);
  for (let i = 0, n = 0; i < 3000 && n < 90; i++) {
    const a = r() * Math.PI * 2;
    const d = 4 + r() * 26;
    const x = Math.cos(a) * d, z = Math.sin(a) * d;
    if (!isFree(x, z, 0.1)) continue;
    bushSpots[n % bushKits.length].push({ x, z, s: 0.75 + r() * 0.6, yaw: r() * 6.28 });
    n++;
  }
  bushKits.forEach((kit, i) => {
    if (bushSpots[i].length) casters.push(thin(kit.canopy.build(`bush-${i}`, scene, mats.foliage), bushSpots[i]));
  });

  // rocks ------------------------------------------------------------
  const rockMesh = rockKit(5).build('rock', scene, mats.props);
  const rockSpots: Placement[] = [];
  for (let i = 0, n = 0; i < 1500 && n < 34; i++) {
    const a = r() * Math.PI * 2;
    const d = 4 + r() * 28;
    const x = Math.cos(a) * d, z = Math.sin(a) * d;
    if (!isFree(x, z, 0) && !(pondNorm(x, z) > 1.0 && pondNorm(x, z) < 1.25)) continue;
    rockSpots.push({ x, z, s: 0.35 + r() * 0.7, yaw: r() * 6.28 });
    n++;
  }
  casters.push(thin(rockMesh, rockSpots, -0.05));

  // flowers & grass (density follows quality) -----------------------------
  const flowerColours: Array<[string, string]> = [['#ff6fa3', '#ffe27a'], ['#ffd84a', '#e08a1e'], ['#ffffff', '#ffd23f'], ['#b98cff', '#fff3a0'], ['#ff7a45', '#7a3d1a']];
  const flowerMeshes = flowerColours.map(([p, c], i) => flowerKit(60 + i, hex(p), hex(c)).build(`flowers-${i}`, scene, mats.grass));
  const flowerSpots: Placement[][] = flowerMeshes.map(() => []);
  const maxFlowers = 360;
  for (let i = 0, n = 0; i < 9000 && n < maxFlowers; i++) {
    // clustered: pick a cluster centre then scatter around it
    const ca = r() * Math.PI * 2, cd = 3.5 + Math.pow(r(), 1.2) * 24;
    const cx = Math.cos(ca) * cd, cz = Math.sin(ca) * cd;
    const kind = Math.floor(r() * flowerMeshes.length);
    for (let k = 0; k < 6 && n < maxFlowers; k++) {
      const x = cx + (r() - 0.5) * 2.2, z = cz + (r() - 0.5) * 2.2;
      if (!isFree(x, z, -0.45)) continue;
      flowerSpots[kind].push({ x, z, s: 0.85 + r() * 0.5, yaw: r() * 6.28 });
      n++;
    }
  }
  flowerMeshes.forEach((m, i) => thin(m, flowerSpots[i].length ? flowerSpots[i] : [{ x: 0, z: -40, s: 0.001, yaw: 0 }]));

  const grassMeshes = [grassKit(80), grassKit(81)].map((g, i) => g.build(`grass-${i}`, scene, mats.grass));
  const grassSpots: Placement[][] = [[], []];
  const maxGrass = 5000;
  for (let i = 0, n = 0; i < 40000 && n < maxGrass; i++) {
    const x = (r() - 0.5) * 60, z = (r() - 0.5) * 60;
    if (!isFree(x, z, -0.5)) continue;
    grassSpots[n % 2].push({ x, z, s: 0.8 + r() * 0.7, yaw: r() * 6.28 });
    n++;
  }
  grassMeshes.forEach((m, i) => thin(m, grassSpots[i]));

  // structures -----------------------------------------------------------
  const barn = buildBarn(scene, mats);
  casters.push(barn);
  const mill = buildWindmill(scene, mats);
  casters.push(mill.tower, mill.blades);
  casters.push(buildFarmProps(scene, mats));

  const flies = buildButterflies(scene, 5);

  // props hidden under / in front of farm tiles; rebuilt whenever the farm grows
  type Kind = 'tree' | 'bush' | 'small';
  const sets: Array<{ mesh: Mesh; all: Placement[]; kind: Kind; y: number; limit: () => number }> = [];
  let quality = q;
  const meshFor = (name: string) => scene.getMeshByName(name) as Mesh;
  kits.forEach((_, i) => {
    if (!treeSpots[i].length) return;
    const trunk = scene.getMeshByName(`tree-trunk-${i}`) as Mesh | null;
    if (trunk) sets.push({ mesh: trunk, all: treeSpots[i], kind: 'tree', y: 0, limit: () => Infinity });
    sets.push({ mesh: meshFor(`tree-canopy-${i}`), all: treeSpots[i], kind: 'tree', y: 0, limit: () => Infinity });
  });
  bushKits.forEach((_, i) => bushSpots[i].length && sets.push({ mesh: meshFor(`bush-${i}`), all: bushSpots[i], kind: 'bush', y: 0, limit: () => Infinity }));
  sets.push({ mesh: rockMesh, all: rockSpots, kind: 'bush', y: -0.05, limit: () => Infinity });
  flowerMeshes.forEach((m, i) => sets.push({ mesh: m, all: flowerSpots[i], kind: 'small', y: 0, limit: () => Math.floor(quality.flowerCount / flowerMeshes.length) }));
  grassMeshes.forEach((m, i) => sets.push({ mesh: m, all: grassSpots[i], kind: 'small', y: 0, limit: () => Math.floor(quality.grassCount / 2) }));
  let farm = new Set<string>();
  const S = PLOT_SPACING;
  const onFarm = (x: number, z: number, r: number) => {
    const reach = PLOT_SIZE / 2 + r;
    for (let c = Math.ceil((x - reach) / S); c <= Math.floor((x + reach) / S); c++)
      for (let w = Math.ceil((z - reach) / S); w <= Math.floor((z + reach) / S); w++) if (farm.has(tileId(c, w))) return true;
    return false;
  };
  const hidden = (it: Placement, kind: Kind) => {
    if (kind === 'small') return onFarm(it.x, it.z, 0.2);
    if (kind === 'bush') return onFarm(it.x, it.z, 0.55 * it.s);
    // a tall tree also hides tiles behind it (the camera looks toward +x/+z)
    if (onFarm(it.x, it.z, 1.4 * it.s)) return true;
    for (const d of [1.6, 3.2, 4.8]) if (onFarm(it.x + d * Math.SQRT1_2, it.z + d * Math.SQRT1_2, 0.4)) return true;
    return false;
  };
  const rebuild = () => {
    for (const set of sets) {
      const kept = set.all.filter((it) => !hidden(it, set.kind));
      thin(set.mesh, kept.length ? kept : [{ x: 0, z: -400, s: 0.001, yaw: 0 }], set.y);
      set.mesh.thinInstanceCount = Math.max(1, Math.min(kept.length, set.limit()));
    }
  };

  const env: Environment = {
    barn,
    shadowCasters: casters,
    attachShadows(sg) {
      for (const c of casters) sg.addShadowCaster(c, false);
    },
    applyQuality(p) {
      quality = p;
      rebuild();
      flies.forEach((b, i) => b.root.setEnabled(i < p.butterflies));
    },
    applyClearing(tiles) {
      farm = new Set(tiles.map((t) => tileId(t.col, t.row)));
      rebuild();
    },
    update(t, dt) {
      mill.hub.rotation.z += dt * 0.7;
      for (const b of flies) {
        if (!b.root.isEnabled()) continue;
        const tt = t * b.speed + b.phase;
        const x = b.home.x + Math.sin(tt * 0.7) * 2.2 + Math.sin(tt * 1.9) * 0.4;
        const z = b.home.z + Math.cos(tt * 0.5) * 1.8 + Math.cos(tt * 2.3) * 0.3;
        const y = terrainHeight(x, z) + 0.7 + Math.sin(tt * 2.1) * 0.25;
        const prev = b.root.position.clone();
        b.root.position.set(x, y, z);
        const vx = x - prev.x, vz = z - prev.z;
        if (Math.abs(vx) + Math.abs(vz) > 1e-5) b.root.rotation.y = Math.atan2(vx, vz) - Math.PI / 2;
        const flap = Math.sin(t * 22 + b.phase) * 1.05;
        b.wl.rotation.z = flap;
        b.wr.rotation.z = -flap;
      }
    },
  };
  env.applyQuality(q);
  return env;
}

