import { Color3, CreateIcoSphereVertexData, Material, Matrix, Mesh, Scene, VertexData } from '@babylonjs/core';
import { CROP_ORDER, CropId, STAGE_COUNT } from '../config';
import { loadedAsset } from '../assets/registry';
import { blade, blob, chain, GeoBuilder, hex, jitter, lathe, mix, mulberry, tf, weld } from './geometry';

/**
 * Procedural stand-in crop models (see ASSETS.md: crop.*), chunky cartoon
 * style: volumetric "puff" leaves, oversized glossy fruit, saturated gradients.
 * Each (crop, stage) is one merged template mesh; tiles render it via instances.
 * Local space: tile centre at origin, y=0 on the soil surface.
 */

const PAL = {
  mound: hex('#5b341d'),
  moundTop: hex('#8a5532'),
  sprout: hex('#b6ef62'),
  sproutBase: hex('#5fb93a'),
  leafDeep: hex('#2f8a2a'),
  leaf: hex('#52b83a'),
  leafLight: hex('#a8e65c'),
  stem: hex('#4a9a2f'),
  carrot: hex('#ff8a1a'),
  carrotDeep: hex('#e2550c'),
  carrotHi: hex('#ffc070'),
  tomato: hex('#ff3b2b'),
  tomatoDeep: hex('#c21c14'),
  tomatoHi: hex('#ffa28c'),
  tomatoGreen: hex('#9ad64e'),
  flower: hex('#ffd83a'),
  wheatGreen: hex('#9ccf4e'),
  wheat: hex('#f5c542'),
  wheatDeep: hex('#d9a022'),
  wheatHi: hex('#fff0a8'),
  straw: hex('#e3b552'),
};

const SEED_COLOR: Record<CropId, Color3> = { carrot: hex('#e8c48c'), wheat: hex('#f5cf5a'), tomato: hex('#fff0b8') };

const ico = (sub: number) => weld(CreateIcoSphereVertexData({ radius: 1, subdivisions: sub }));

// ------------------------------------------------------------------ primitives

/**
 * A volumetric leaf: flattened ellipsoid running along +z from the origin,
 * curled upward toward the tip. Lighter on top, base->tip gradient.
 */
function puffLeaf(len: number, width: number, curl: number, base: Color3, tip: Color3) {
  const vd = ico(2);
  const p = vd.positions as number[];
  const colors: number[] = [];
  for (let i = 0; i < p.length; i += 3) {
    const t = (p[i + 2] + 1) / 2; // 0 at base, 1 at tip
    const taper = Math.sin(Math.PI * Math.min(1, 0.08 + t * 0.92)) ** 0.6;
    const top = p[i + 1];
    p[i] *= (width / 2) * taper;
    p[i + 1] = top * 0.22 * width * taper + curl * len * t * t;
    p[i + 2] = t * len;
    const c = mix(base, tip, t * 0.9 + 0.05);
    const lit = top > 0 ? mix(c, Color3.White(), 0.12 * top) : c.scale(0.85);
    colors.push(lit.r, lit.g, lit.b, 1);
  }
  vd.colors = colors;
  return vd;
}

/** Orient a +z-pointing part: tilt up by `rise` radians, then yaw, then move. */
const aim = (x: number, y: number, z: number, yaw: number, rise: number, s = 1) =>
  chain(Matrix.Scaling(s, s, s), Matrix.RotationX(-rise), Matrix.RotationY(yaw), Matrix.Translation(x, y, z));

function mound(g: GeoBuilder, x: number, z: number, size: number, crop: CropId, r: () => number) {
  g.add(blob(1, 0.22, r() * 50, 2), tf([x, -0.02, z], r() * 6, [size, size * 0.42, size]), (l) => mix(PAL.mound, PAL.moundTop, l.y * 0.6 + 0.45));
  for (let i = 0; i < 3; i++) {
    const a = r() * 6.28;
    g.add(ico(1), tf([x + Math.cos(a) * size * 0.4, size * 0.36, z + Math.sin(a) * size * 0.4], r() * 6, [0.035, 0.022, 0.026], 0, (r() - 0.5) * 0.6), jitter(SEED_COLOR[crop], 0.06, r));
  }
}

function sprout(g: GeoBuilder, x: number, z: number, size: number, r: () => number) {
  const yaw = r() * Math.PI;
  const h = 0.06 * size;
  g.add(lathe([[0.012 * size, 0], [0.01 * size, h]], 5, true), tf([x, 0, z]), PAL.sproutBase);
  for (const side of [0, Math.PI]) g.add(puffLeaf(0.13 * size, 0.09 * size, 0.25, PAL.sproutBase, PAL.sprout), aim(x, h, z, yaw + side, 0.55));
}

/** Thin curved stem (flat strap) from (x,0,z); returns where it ends. */
function stem(g: GeoBuilder, x: number, z: number, yaw: number, len: number, lean: number, y0 = 0, color = PAL.stem) {
  const bend = lean * 0.6, start = lean * 0.6;
  g.add(blade({ length: len, width: 0.026, bend, lean: start, shape: 'strap', segments: 4, fold: 0, base: color, tip: mix(color, PAL.leafLight, 0.3) }), tf([x, y0, z], yaw));
  const k = len / bend;
  const y = k * (Math.sin(start + bend) - Math.sin(start));
  const d = k * (Math.cos(start) - Math.cos(start + bend));
  return { x: x + Math.sin(yaw) * d, y, z: z + Math.cos(yaw) * d };
}

// ------------------------------------------------------------------ carrot

const CARROT_SPOTS: Array<[number, number]> = [[-0.28, -0.2], [0.3, -0.12], [-0.02, 0.32]];

function carrotTop(g: GeoBuilder, x: number, z: number, y0: number, stems: number, len: number, leaf: number, r: () => number) {
  const yaw0 = r() * 6.28;
  for (let i = 0; i < stems; i++) {
    const yaw = yaw0 + (i / stems) * Math.PI * 2 + (r() - 0.5) * 0.4;
    const L = len * (0.8 + r() * 0.35);
    const tip = stem(g, x, z, yaw, L, 0.35 + r() * 0.35, y0);
    // trefoil of puffy leaflets at the tip
    for (let k = -1; k <= 1; k++) {
      g.add(puffLeaf(leaf * (k === 0 ? 1.1 : 0.85), leaf * 0.75, 0.3, PAL.leaf, jitter(PAL.leafLight, 0.05, r)), aim(tip.x, y0 + tip.y - 0.01, tip.z, yaw + k * 0.75, 0.5 + (k === 0 ? 0.25 : 0)));
    }
  }
}

function carrotRoot(g: GeoBuilder, x: number, z: number, r: () => number) {
  const prof: Array<[number, number]> = [[0.01, -0.34], [0.05, -0.26], [0.09, -0.14], [0.115, -0.02], [0.122, 0.06], [0.112, 0.12], [0.08, 0.16], [0.03, 0.18]];
  g.add(lathe(prof, 14, true), tf([x, 0, z], r() * 6, 1, (r() - 0.5) * 0.25, (r() - 0.5) * 0.25), (l) => {
    const t = (l.y + 0.34) / 0.52;
    const groove = Math.abs(Math.sin(l.y * 70)) > 0.92 ? 0.82 : 1;
    let c = mix(PAL.carrotDeep, PAL.carrot, t);
    if (l.y > 0.08 && l.x < 0) c = mix(c, PAL.carrotHi, (l.y - 0.08) * 6);
    return c.scale(groove);
  });
}

function buildCarrot(g: GeoBuilder, stage: number) {
  CARROT_SPOTS.forEach(([x, z], i) => {
    const r = mulberry(100 + i * 31);
    if (stage === 0) return mound(g, x, z, 0.15, 'carrot', r);
    if (stage === 1) return sprout(g, x, z, 1, r);
    if (stage === 2) return carrotTop(g, x, z, 0, 3, 0.13, 0.09, r);
    if (stage === 3) {
      g.add(blob(1, 0.05, i, 2), tf([x, 0, z], 0, [0.07, 0.035, 0.07]), PAL.carrot);
      return carrotTop(g, x, z, 0, 5, 0.22, 0.11, r);
    }
    carrotRoot(g, x, z, r);
    carrotTop(g, x, z, 0.14, 6, 0.24, 0.13, r);
  });
}

// ------------------------------------------------------------------ tomato

function tomatoFruit(g: GeoBuilder, x: number, y: number, z: number, rad: number, ripe: number, r: () => number) {
  const vd = ico(2);
  const p = vd.positions as number[];
  for (let i = 0; i < p.length; i += 3) {
    const a = Math.atan2(p[i + 2], p[i]);
    const k = 1 + 0.06 * Math.cos(a * 5) * (1 - Math.abs(p[i + 1]));
    p[i] *= k;
    p[i + 2] *= k;
    p[i + 1] *= p[i + 1] > 0 ? 0.8 : 0.9;
  }
  const base = mix(PAL.tomatoGreen, PAL.tomato, ripe);
  const deep = mix(hex('#5ea832'), PAL.tomatoDeep, ripe);
  const hi = mix(hex('#d6f59a'), PAL.tomatoHi, ripe);
  g.add(vd, tf([x, y, z], r() * 6, rad), (l) => {
    const c = mix(deep, base, l.y * 0.7 + 0.7);
    const spec = Math.max(0, l.y * 0.7 - l.x * 0.5 - 0.35);
    return mix(c, hi, Math.min(1, spec * 2.4));
  });
  for (let i = 0; i < 5; i++) g.add(puffLeaf(rad * 0.65, rad * 0.32, -0.2, PAL.leafDeep, PAL.leaf), aim(x, y + rad * 0.72, z, (i / 5) * Math.PI * 2, -0.25));
  g.add(lathe([[rad * 0.09, 0], [rad * 0.06, rad * 0.3]], 5, true), tf([x, y + rad * 0.7, z], 0, 1, 0.3), PAL.stem);
}

function flower(g: GeoBuilder, x: number, y: number, z: number, r: () => number) {
  const yaw = r() * 6;
  for (let i = 0; i < 5; i++) g.add(puffLeaf(0.05, 0.04, 0.1, hex('#ffc21a'), PAL.flower), aim(x, y, z, yaw + (i / 5) * Math.PI * 2, 0.35));
  g.add(ico(1), tf([x, y + 0.01, z], 0, 0.017), hex('#e09a0e'));
}

function tomatoBush(g: GeoBuilder, h: number, tiers: number, perTier: number, leafLen: number, r: () => number) {
  g.add(lathe([[0.035, 0], [0.026, h * 0.6], [0.016, h]], 7, true), tf([0, 0, 0]), (l) => mix(PAL.leafDeep, PAL.stem, l.y / h));
  for (let t = 0; t < tiers; t++) {
    const y = h * (0.25 + 0.75 * (t / Math.max(1, tiers - 1)));
    const len = leafLen * (1 - t * 0.18);
    for (let i = 0; i < perTier; i++) {
      const yaw = (i / perTier) * Math.PI * 2 + t * 0.6 + (r() - 0.5) * 0.3;
      const base = mix(PAL.leafDeep, PAL.leaf, 0.2 + t * 0.15);
      g.add(puffLeaf(len, len * 0.62, 0.22, base, jitter(PAL.leafLight, 0.06, r)), aim(Math.sin(yaw) * 0.03, y, Math.cos(yaw) * 0.03, yaw, 0.15 + t * 0.12));
    }
  }
  g.add(puffLeaf(leafLen * 0.6, leafLen * 0.45, 0.4, PAL.leaf, PAL.leafLight), aim(0, h, 0, r() * 6, 1.2));
}

function buildTomato(g: GeoBuilder, stage: number) {
  const r = mulberry(300);
  if (stage === 0) {
    mound(g, -0.18, -0.1, 0.17, 'tomato', r);
    mound(g, 0.2, 0.14, 0.15, 'tomato', r);
    return;
  }
  if (stage === 1) {
    sprout(g, -0.15, -0.08, 1.35, r);
    sprout(g, 0.18, 0.15, 1.2, r);
    return;
  }
  if (stage === 2) return tomatoBush(g, 0.2, 2, 4, 0.2, r);
  const big = stage === 4;
  tomatoBush(g, big ? 0.55 : 0.48, 3, 6, big ? 0.32 : 0.29, r);
  if (stage === 3) {
    for (let i = 0; i < 3; i++) {
      const a = i * 2.1 + 0.4;
      flower(g, Math.cos(a) * 0.24, 0.32 + i * 0.06, Math.sin(a) * 0.24, r);
    }
    tomatoFruit(g, 0.22, 0.24, -0.12, 0.07, 0, r);
    tomatoFruit(g, -0.2, 0.3, 0.14, 0.06, 0, r);
    return;
  }
  const fruits: Array<[number, number, number, number]> = [
    [0.28, 0.2, -0.14, 0.13], [-0.27, 0.24, 0.12, 0.125], [0.05, 0.16, 0.32, 0.12],
    [-0.12, 0.38, -0.27, 0.11], [0.24, 0.42, 0.2, 0.105], [-0.3, 0.12, -0.22, 0.12],
  ];
  fruits.forEach(([x, y, z, rad], i) => tomatoFruit(g, x, y, z, rad, i === 5 ? 0.8 : 1, r));
}

// ------------------------------------------------------------------ wheat

const WHEAT_SPOTS: Array<[number, number]> = [[0, 0], ...[0, 1, 2, 3, 4, 5].map((i): [number, number] => [Math.cos(i * 1.047 + 0.3) * 0.4, Math.sin(i * 1.047 + 0.3) * 0.4])];

/** Chunky ear: elongated ellipsoid along +y with spiral grain ridges. */
function wheatEar(len: number, rad: number, ripe: number): VertexData {
  const vd = ico(2);
  const p = vd.positions as number[];
  const colors: number[] = [];
  const base = mix(PAL.wheatGreen, PAL.wheat, ripe), deep = mix(hex('#6aa83a'), PAL.wheatDeep, ripe), hi = mix(hex('#d4f08a'), PAL.wheatHi, ripe);
  for (let i = 0; i < p.length; i += 3) {
    const t = (p[i + 1] + 1) / 2;
    const a = Math.atan2(p[i + 2], p[i]);
    const ridge = 1 + 0.16 * Math.max(0, Math.sin(t * Math.PI * 9 + a * 2));
    const taper = Math.sin(Math.PI * Math.min(1, 0.12 + t * 0.88)) ** 0.5;
    p[i] *= rad * ridge * taper;
    p[i + 2] *= rad * ridge * taper;
    p[i + 1] = t * len;
    let c = mix(deep, base, ridge > 1.08 ? 1 : 0.55);
    if (p[i] < 0) c = mix(c, hi, 0.35 * t);
    colors.push(c.r, c.g, c.b, 1);
  }
  vd.colors = colors;
  return vd;
}

function wheatClump(g: GeoBuilder, x: number, z: number, stage: number, r: () => number) {
  const ripe = stage === 4 ? 1 : 0;
  const yaw0 = r() * 6.28;
  const blades = stage === 1 ? 3 : 4;
  const len = stage === 1 ? 0.14 : stage === 2 ? 0.28 : 0.3;
  const width = stage === 1 ? 0.045 : 0.065;
  const lb = mix(PAL.leaf, PAL.straw, ripe * 0.7), lt = mix(PAL.leafLight, PAL.wheatHi, ripe * 0.8);
  for (let i = 0; i < blades; i++)
    g.add(blade({ length: len * (0.8 + r() * 0.35), width, bend: 0.9 + r() * 0.5, lean: 0.2 + r() * 0.3, shape: 'taper', segments: 5, fold: 0.35, base: lb, tip: lt }), tf([x, 0, z], yaw0 + (i / blades) * 6.28));
  if (stage < 3) return;
  const stalks = stage === 3 ? 2 : 3;
  for (let s = 0; s < stalks; s++) {
    const yaw = yaw0 + (s / stalks) * 6.28 + r() * 0.5;
    const L = (stage === 3 ? 0.4 : 0.52) * (0.88 + r() * 0.22);
    const lean = 0.03 + r() * 0.12;
    const bend = 0.12;
    const sc = mix(PAL.wheatGreen, PAL.straw, ripe);
    g.add(blade({ length: L, width: 0.032, bend, lean, shape: 'strap', segments: 5, fold: 0, base: sc, tip: mix(sc, PAL.wheatHi, 0.3) }), tf([x, 0, z], yaw));
    // the ear continues the stalk's direction, nodding a little more when ripe
    const k = L / bend;
    const ty = k * (Math.sin(lean + bend) - Math.sin(lean)), td = k * (Math.cos(lean) - Math.cos(lean + bend));
    const E = chain(Matrix.RotationX(lean + bend + (ripe ? 0.12 : 0)), Matrix.RotationY(yaw), Matrix.Translation(x + Math.sin(yaw) * td, ty - 0.01, z + Math.cos(yaw) * td));
    const earLen = stage === 3 ? 0.16 : 0.21;
    g.add(wheatEar(earLen, stage === 3 ? 0.042 : 0.058, ripe), E);
    if (ripe)
      for (let a = 0; a < 4; a++)
        g.add(blade({ length: 0.09, width: 0.008, bend: 0.2, lean: 0.35, shape: 'strap', segments: 2, fold: 0, base: PAL.wheatHi, tip: PAL.wheatHi }), chain(Matrix.RotationY(a * 1.57), Matrix.Translation(0, earLen * 0.85, 0), E));
  }
}

function buildWheat(g: GeoBuilder, stage: number) {
  WHEAT_SPOTS.forEach(([x, z], i) => {
    const r = mulberry(200 + i * 13);
    if (stage === 0) {
      if (i < 5) mound(g, x * 0.9, z * 0.9, 0.11, 'wheat', r);
      return;
    }
    wheatClump(g, x, z, stage, r);
  });
}

// ------------------------------------------------------------------ library

/** Oversized on purpose: each tile should read as one chunky, juicy crop. */
const CROP_SCALE: Record<CropId, number> = { carrot: 1.5, wheat: 1.35, tomato: 1.5 };

const BUILDERS: Record<CropId, (g: GeoBuilder, stage: number) => void> = {
  carrot: buildCarrot,
  wheat: buildWheat,
  tomato: buildTomato,
};

export class CropLibrary {
  private cache = new Map<string, Mesh>();

  constructor(private scene: Scene, private material: Material) {}

  /** Hidden source mesh for (crop, stage); tiles create instances from it. */
  template(crop: CropId, stage: number): Mesh {
    const key = `${crop}:${stage}`;
    let mesh = this.cache.get(key);
    if (!mesh) {
      const replacement = loadedAsset(`crop.${crop}.s${stage}`);
      if (replacement) mesh = replacement;
      else {
        const g = new GeoBuilder();
        BUILDERS[crop](g, Math.max(0, Math.min(STAGE_COUNT - 1, stage)));
        mesh = g.build(`crop-${key}`, this.scene, this.material);
        const k = stage <= 1 ? 1.25 : CROP_SCALE[crop];
        mesh.bakeTransformIntoVertices(Matrix.Scaling(k, k, k));
      }
      mesh.isVisible = false;
      mesh.isPickable = false;
      mesh.receiveShadows = true;
      this.cache.set(key, mesh);
    }
    return mesh;
  }

  /** Pre-build every template up front to avoid hitches mid-game. */
  warm() {
    for (const crop of CROP_ORDER) for (let s = 0; s < STAGE_COUNT; s++) this.template(crop, s);
  }

  stats() {
    return [...this.cache.entries()].map(([k, m]) => ({ key: k, vertices: m.getTotalVertices() }));
  }
}
