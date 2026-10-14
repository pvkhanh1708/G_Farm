import { Color3, CreateIcoSphereVertexData, Material, Matrix, Mesh, Scene, Vector3, VertexData } from '@babylonjs/core';
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

const SEED_COLOR: Record<CropId, Color3> = {
  carrot: hex('#e8c48c'), wheat: hex('#f5cf5a'), tomato: hex('#fff0b8'), strawberry: hex('#ffe9a8'), cabbage: hex('#c9a46a'),
  corn: hex('#ffd23a'), eggplant: hex('#f2e2b0'), pumpkin: hex('#fff3d0'), sunflower: hex('#4a3a2a'),
};

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

function flower(g: GeoBuilder, x: number, y: number, z: number, r: () => number, petal = hex('#ffc21a'), tip = PAL.flower, heart = hex('#e09a0e'), size = 1) {
  const yaw = r() * 6;
  for (let i = 0; i < 5; i++) g.add(puffLeaf(0.05 * size, 0.04 * size, 0.1, petal, tip), aim(x, y, z, yaw + (i / 5) * Math.PI * 2, 0.35));
  g.add(ico(1), tf([x, y + 0.01 * size, z], 0, 0.017 * size), heart);
}

function tomatoBush(g: GeoBuilder, h: number, tiers: number, perTier: number, leafLen: number, r: () => number, deep = PAL.leafDeep, light = PAL.leafLight, stemBase = PAL.leafDeep) {
  g.add(lathe([[0.035, 0], [0.026, h * 0.6], [0.016, h]], 7, true), tf([0, 0, 0]), (l) => mix(stemBase, PAL.stem, l.y / h));
  for (let t = 0; t < tiers; t++) {
    const y = h * (0.25 + 0.75 * (t / Math.max(1, tiers - 1)));
    const len = leafLen * (1 - t * 0.18);
    for (let i = 0; i < perTier; i++) {
      const yaw = (i / perTier) * Math.PI * 2 + t * 0.6 + (r() - 0.5) * 0.3;
      const base = mix(deep, PAL.leaf, 0.2 + t * 0.15);
      g.add(puffLeaf(len, len * 0.62, 0.22, base, jitter(light, 0.06, r)), aim(Math.sin(yaw) * 0.03, y, Math.cos(yaw) * 0.03, yaw, 0.15 + t * 0.12));
    }
  }
  g.add(puffLeaf(leafLen * 0.6, leafLen * 0.45, 0.4, PAL.leaf, light), aim(0, h, 0, r() * 6, 1.2));
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

// ------------------------------------------------------------------ shared early stages

/** Stages 0-1 look alike for every crop: seed mounds, then sprouts. Returns true when handled. */
function early(g: GeoBuilder, stage: number, crop: CropId, spots: Array<[number, number, number]>, seed: number) {
  if (stage > 1) return false;
  spots.forEach(([x, z, k], i) => {
    const r = mulberry(seed + i * 17);
    if (stage === 0) mound(g, x, z, 0.15 * k, crop, r);
    else sprout(g, x, z, 1.2 * k, r);
  });
  return true;
}

/** Glossy-fruit colouring shared by berries/eggplants: deep underside, base body, specular top-left. */
const glossy = (deep: Color3, base: Color3, hi: Color3, gain = 2.4) => (l: Vector3) => {
  const c = mix(deep, base, l.y * 0.7 + 0.7);
  const spec = Math.max(0, l.y * 0.7 - l.x * 0.5 - 0.35);
  return mix(c, hi, Math.min(1, spec * gain));
};

// ------------------------------------------------------------------ strawberry

const STRAW_SPOTS: Array<[number, number]> = [[-0.26, -0.18], [0.28, -0.1], [0, 0.3]];

function strawPlant(g: GeoBuilder, x: number, z: number, stems: number, len: number, leaf: number, r: () => number) {
  const yaw0 = r() * 6.28;
  for (let i = 0; i < stems; i++) {
    const yaw = yaw0 + (i / stems) * Math.PI * 2 + (r() - 0.5) * 0.4;
    const tip = stem(g, x, z, yaw, len * (0.85 + r() * 0.3), 0.55 + r() * 0.35);
    for (let k = -1; k <= 1; k++)
      g.add(puffLeaf(leaf * (k === 0 ? 1 : 0.85), leaf * 0.95, 0.12, PAL.leafDeep, jitter(PAL.leafLight, 0.05, r)), aim(tip.x, tip.y - 0.01, tip.z, yaw + k * 0.95, 0.2));
  }
}

function strawberry(g: GeoBuilder, x: number, y: number, z: number, rad: number, ripe: number, r: () => number) {
  const vd = ico(2);
  const p = vd.positions as number[];
  for (let i = 0; i < p.length; i += 3) {
    const t = (p[i + 1] + 1) / 2; // 0 tip, 1 shoulder
    const k = 0.45 + 0.7 * t;
    p[i] *= k;
    p[i + 2] *= k;
    p[i + 1] *= 1.2;
  }
  const deep = mix(hex('#7fb04a'), hex('#b0102a'), ripe), base = mix(hex('#c4e88a'), hex('#ff2d4a'), ripe), hi = mix(hex('#eaffc8'), hex('#ffb3be'), ripe);
  const shade = glossy(deep, base, hi);
  const seedCol = mix(hex('#f2f7d0'), hex('#ffe066'), ripe);
  const tilt = (r() - 0.5) * 0.7;
  g.add(vd, tf([x, y, z], r() * 6, rad, tilt, (r() - 0.5) * 0.5), (l) => {
    const a = Math.atan2(l.z, l.x);
    const dot = Math.sin(a * 7 + l.y * 3) * Math.sin(l.y * 13) > 0.72;
    return dot ? seedCol : shade(l);
  });
  for (let i = 0; i < 5; i++) g.add(puffLeaf(rad * 0.7, rad * 0.35, -0.1, PAL.leafDeep, PAL.leaf), aim(x, y + rad * 1.1, z, (i / 5) * Math.PI * 2, -0.15));
  g.add(lathe([[rad * 0.08, 0], [rad * 0.05, rad * 0.5]], 5, true), tf([x, y + rad * 1.05, z], 0, 1, 0.4), PAL.stem);
}

function buildStrawberry(g: GeoBuilder, stage: number) {
  if (early(g, stage, 'strawberry', STRAW_SPOTS.map(([x, z]) => [x, z, 1]), 400)) return;
  STRAW_SPOTS.forEach(([x, z], i) => {
    const r = mulberry(410 + i * 23);
    if (stage === 2) return strawPlant(g, x, z, 3, 0.1, 0.09, r);
    strawPlant(g, x, z, 5, 0.13, 0.1, r);
    const a = r() * 6.28;
    if (stage === 3) {
      flower(g, x + Math.cos(a) * 0.12, 0.16, z + Math.sin(a) * 0.12, r, hex('#ffffff'), hex('#fff6f0'), hex('#ffd23a'), 1.1);
      strawberry(g, x + Math.cos(a + 2.5) * 0.14, 0.06, z + Math.sin(a + 2.5) * 0.14, 0.045, 0, r);
      return;
    }
    for (let k = 0; k < 2; k++) {
      const b = a + k * 2.6;
      strawberry(g, x + Math.cos(b) * 0.2, 0.1, z + Math.sin(b) * 0.2, 0.1, k === 1 && i === 2 ? 0.75 : 1, r);
    }
  });
}

// ------------------------------------------------------------------ cabbage

const CAB = { outer: hex('#3f8a52'), outerTip: hex('#9cd98a'), head: hex('#a8dc84'), headTop: hex('#e2f8bc'), vein: hex('#f2ffd8') };

function cabbageHead(g: GeoBuilder, rad: number, r: () => number) {
  const vd = blob(1, 0.06, r() * 40, 3);
  g.add(vd, tf([0, rad * 0.82, 0], r() * 6, [rad, rad * 0.9, rad]), (l) => {
    const a = Math.atan2(l.z, l.x);
    const vein = Math.abs(Math.sin(a * 5 + l.y * 4)) < 0.09 && l.y < 0.8;
    const c = mix(CAB.head, CAB.headTop, Math.max(0, l.y) * 0.9);
    return vein ? mix(c, CAB.vein, 0.7) : l.x - l.y < -0.6 ? mix(c, Color3.White(), 0.15) : c;
  });
}

function buildCabbage(g: GeoBuilder, stage: number) {
  if (early(g, stage, 'cabbage', [[0, 0, 1.3]], 500)) return;
  const r = mulberry(520 + stage);
  const n = stage === 2 ? 5 : 8;
  const len = stage === 2 ? 0.2 : stage === 3 ? 0.3 : 0.36;
  for (let i = 0; i < n; i++) {
    const yaw = (i / n) * Math.PI * 2 + (r() - 0.5) * 0.25;
    g.add(puffLeaf(len * (0.9 + r() * 0.2), len * 0.95, 0.45, CAB.outer, jitter(CAB.outerTip, 0.05, r)), aim(Math.sin(yaw) * 0.03, 0.01, Math.cos(yaw) * 0.03, yaw, 0.22));
  }
  if (stage === 2) return;
  const rad = stage === 3 ? 0.12 : 0.22;
  cabbageHead(g, rad, r);
  // inner leaves cupping the head
  const m = stage === 3 ? 4 : 6;
  for (let i = 0; i < m; i++) {
    const yaw = (i / m) * Math.PI * 2 + 0.3;
    g.add(puffLeaf(rad * 1.5, rad * 1.5, 0.7, hex('#6fbf6a'), CAB.headTop), aim(Math.sin(yaw) * rad * 0.35, 0.02, Math.cos(yaw) * rad * 0.35, yaw, 0.75));
  }
}

// ------------------------------------------------------------------ corn

const CORN_SPOTS: Array<[number, number]> = [[-0.26, -0.16], [0.26, -0.2], [0.02, 0.26]];

function cornCob(g: GeoBuilder, x: number, y: number, z: number, yaw: number, r: () => number) {
  const len = 0.15, rad = 0.07;
  const frame = chain(Matrix.Translation(0, len * 0.85, 0), Matrix.RotationX(0.45), Matrix.RotationY(yaw), Matrix.Translation(x, y, z));
  const vd = ico(2);
  g.add(vd, chain(Matrix.Scaling(rad, len, rad), frame), (l) => {
    const a = Math.atan2(l.z, l.x);
    const fy = ((l.y + 1) * 7) % 1, fa = ((a / (Math.PI * 2)) * 11 + 11) % 1;
    const groove = fy < 0.18 || fa < 0.18;
    const c = groove ? hex('#e09a10') : mix(hex('#ffd23a'), hex('#fff0a0'), Math.max(0, -l.x * 0.6 + l.y * 0.3));
    return c;
  });
  for (let k = 0; k < 3; k++)
    g.add(puffLeaf(len * 1.35, rad * 2.1, 0.05, PAL.leaf, PAL.leafLight), chain(Matrix.RotationX(-Math.PI / 2 + 0.3), Matrix.RotationY(k * 2.1 + r()), Matrix.Translation(0, -len * 0.95, 0), frame));
}

function cornPlant(g: GeoBuilder, x: number, z: number, stage: number, r: () => number) {
  const h = stage === 2 ? 0.2 : stage === 3 ? 0.5 : 0.6;
  g.add(lathe([[0.034, 0], [0.028, h * 0.5], [0.018, h]], 7, true), tf([x, 0, z]), (l) => mix(PAL.leafDeep, PAL.stem, l.y / h));
  const count = stage === 2 ? 3 : 5;
  const yaw0 = r() * 6.28;
  for (let j = 0; j < count; j++) {
    const y = h * (0.06 + 0.72 * (j / count));
    const yaw = yaw0 + j * 2.4;
    const L = (stage === 2 ? 0.22 : 0.36) * (1 - j * 0.07);
    g.add(blade({ length: L, width: 0.075, bend: 1.5, lean: 0.35, shape: 'leaf', segments: 6, fold: 0.35, base: PAL.leafDeep, tip: jitter(PAL.leafLight, 0.04, r) }), tf([x, y, z], yaw));
  }
  if (stage < 3) return;
  const tassel = stage === 4 ? PAL.straw : hex('#cfe08a');
  for (let k = 0; k < 5; k++)
    g.add(blade({ length: 0.13, width: 0.014, bend: 0.9, lean: 0.25, shape: 'strap', segments: 3, fold: 0, base: tassel, tip: PAL.wheatHi }), tf([x, h - 0.01, z], k * 1.26 + r()));
  if (stage === 4) cornCob(g, x + Math.sin(yaw0 + 1.2) * 0.03, h * 0.42, z + Math.cos(yaw0 + 1.2) * 0.03, yaw0 + 1.2, r);
  else g.add(puffLeaf(0.1, 0.06, 0.05, PAL.leaf, PAL.leafLight), chain(Matrix.RotationX(-Math.PI / 2 + 0.45), Matrix.RotationY(yaw0 + 1.2), Matrix.Translation(x, h * 0.4, z)));
}

function buildCorn(g: GeoBuilder, stage: number) {
  if (early(g, stage, 'corn', CORN_SPOTS.map(([x, z]) => [x, z, 1]), 600)) return;
  CORN_SPOTS.forEach(([x, z], i) => cornPlant(g, x, z, stage, mulberry(610 + i * 29)));
}

// ------------------------------------------------------------------ eggplant

const EGG = { deep: hex('#2e0e45'), base: hex('#6b2a8f'), hi: hex('#e2b8ff'), leafDeep: hex('#356b3a'), leafLight: hex('#93cf72'), stem: hex('#5a3570') };

function eggFruit(g: GeoBuilder, x: number, y: number, z: number, len: number, rad: number, ripe: number, r: () => number) {
  const vd = ico(2);
  const p = vd.positions as number[];
  for (let i = 0; i < p.length; i += 3) {
    const t = (p[i + 1] + 1) / 2;
    const k = 0.62 + 0.45 * (1 - t);
    p[i] *= k;
    p[i + 2] *= k;
  }
  const deep = mix(hex('#4f7a3a'), EGG.deep, ripe), base = mix(hex('#a8d47a'), EGG.base, ripe), hi = mix(hex('#eaffd0'), EGG.hi, ripe);
  g.add(vd, tf([x, y - len, z], r() * 6, [rad, len, rad], (r() - 0.5) * 0.35, (r() - 0.5) * 0.35), glossy(deep, base, hi, 3));
  for (let i = 0; i < 5; i++) g.add(puffLeaf(rad * 0.9, rad * 0.5, 0.15, PAL.leafDeep, PAL.leaf), aim(x, y - rad * 0.15, z, (i / 5) * Math.PI * 2, -0.75));
  g.add(lathe([[rad * 0.12, 0], [rad * 0.08, rad * 0.7]], 5, true), tf([x, y - rad * 0.1, z], 0, 1, 0.3), PAL.stem);
}

function buildEggplant(g: GeoBuilder, stage: number) {
  const r = mulberry(700);
  if (early(g, stage, 'eggplant', [[-0.16, -0.1, 1.15], [0.18, 0.14, 1]], 700)) return;
  if (stage === 2) return tomatoBush(g, 0.2, 2, 4, 0.22, r, EGG.leafDeep, EGG.leafLight, EGG.stem);
  tomatoBush(g, stage === 4 ? 0.56 : 0.5, 3, 5, stage === 4 ? 0.34 : 0.31, r, EGG.leafDeep, EGG.leafLight, EGG.stem);
  if (stage === 3) {
    for (let i = 0; i < 3; i++) {
      const a = i * 2.1 + 0.9;
      flower(g, Math.cos(a) * 0.25, 0.3 + i * 0.07, Math.sin(a) * 0.25, r, hex('#a35ad6'), hex('#d8a8ff'), hex('#ffd23a'), 1.15);
    }
    eggFruit(g, 0.24, 0.3, -0.1, 0.06, 0.035, 0.3, r);
    return;
  }
  const fruits: Array<[number, number, number, number]> = [[0.32, 0.38, -0.1, 0.13], [-0.3, 0.42, 0.16, 0.12], [0.04, 0.36, 0.36, 0.12], [-0.14, 0.44, -0.33, 0.11]];
  fruits.forEach(([x, y, z, len]) => eggFruit(g, x, y, z, len * 1.25, 0.095, 1, r));
}

// ------------------------------------------------------------------ pumpkin

function pumpkinFruit(g: GeoBuilder, x: number, z: number, rad: number, ripe: number, r: () => number) {
  const vd = ico(3);
  const p = vd.positions as number[];
  for (let i = 0; i < p.length; i += 3) {
    const a = Math.atan2(p[i + 2], p[i]);
    const lobe = 1 - 0.11 * Math.pow(1 - Math.abs(Math.sin(a * 4)), 4);
    const y = p[i + 1];
    p[i] *= lobe;
    p[i + 2] *= lobe;
    // squash and dimple the poles
    p[i + 1] = y * 0.72 - (Math.abs(y) > 0.82 ? (Math.abs(y) - 0.82) * 0.9 * Math.sign(y) : 0);
  }
  const deep = mix(hex('#3f7f2a'), hex('#c4500a'), ripe), base = mix(hex('#7cc04a'), hex('#ff8a1c'), ripe), hi = mix(hex('#c8f08a'), hex('#ffc46a'), ripe);
  g.add(vd, tf([x, rad * 0.62, z], r() * 6, rad), (l) => {
    const a = Math.atan2(l.z, l.x);
    const groove = Math.pow(1 - Math.abs(Math.sin(a * 4)), 6);
    const c = mix(mix(base, hi, Math.max(0, l.y * 0.5 - l.x * 0.4)), deep, Math.min(1, groove * 1.4 + Math.max(0, -l.y) * 0.4));
    return c;
  });
  g.add(lathe([[rad * 0.14, 0], [rad * 0.11, rad * 0.25], [rad * 0.08, rad * 0.4]], 6, true), tf([x, rad * 1.18, z], 0, 1, 0.35, 0.2), (l) => mix(hex('#5a7a2a'), hex('#a8c060'), l.y / (rad * 0.4)));
}

function pumpkinVines(g: GeoBuilder, leaves: number, len: number, r: () => number) {
  for (let i = 0; i < 4; i++)
    g.add(blade({ length: 0.42, width: 0.022, bend: 0.5, lean: 1.38, shape: 'strap', segments: 5, fold: 0, base: PAL.stem, tip: PAL.leaf }), tf([0, 0.01, 0], i * 1.57 + 0.4));
  for (let i = 0; i < leaves; i++) {
    const yaw = (i / leaves) * Math.PI * 2 + r() * 0.4;
    const d = 0.12 + (i % 2) * 0.16;
    const tip = stem(g, Math.sin(yaw) * d, Math.cos(yaw) * d, yaw, 0.1, 0.9);
    g.add(puffLeaf(len, len * 1.15, 0.18, PAL.leafDeep, jitter(PAL.leafLight, 0.05, r)), aim(tip.x, tip.y - 0.01, tip.z, yaw, 0.12));
  }
}

function buildPumpkin(g: GeoBuilder, stage: number) {
  if (early(g, stage, 'pumpkin', [[0, 0, 1.35]], 800)) return;
  const r = mulberry(810);
  if (stage === 2) return pumpkinVines(g, 4, 0.17, r);
  pumpkinVines(g, 7, 0.22, r);
  if (stage === 3) {
    flower(g, -0.22, 0.12, 0.18, r, hex('#ff9f1a'), hex('#ffe04a'), hex('#e07a0a'), 1.5);
    flower(g, 0.25, 0.1, -0.2, r, hex('#ff9f1a'), hex('#ffe04a'), hex('#e07a0a'), 1.4);
    pumpkinFruit(g, 0.04, -0.02, 0.11, 0.15, r);
    return;
  }
  pumpkinFruit(g, 0.02, -0.04, 0.29, 1, r);
}

// ------------------------------------------------------------------ sunflower

const SUN_SPOTS: Array<[number, number, number]> = [[-0.2, 0.16, 0.72], [0.22, -0.14, 0.56]];
/** Heads turn toward the default camera (it sits at -x,-z). */
const SUN_FACE = Math.PI / 4;

function sunHead(g: GeoBuilder, H: Matrix, R: number) {
  g.add(ico(2), chain(Matrix.Scaling(R * 0.98, R * 0.32, R * 0.98), Matrix.Translation(0, R * 0.05, 0), H), (l) => {
    const rr = Math.min(1, Math.hypot(l.x, l.z));
    const a = Math.atan2(l.z, l.x);
    const seeds = Math.sin(a * 13 + rr * 28) * Math.sin(-a * 8 + rr * 28) > 0.25;
    if (l.y < -0.2) return hex('#5f8a2a');
    const c = mix(hex('#3a1f0c'), hex('#8a5220'), rr * rr);
    return seeds ? c.scale(0.7) : c;
  });
  for (let layer = 0; layer < 2; layer++) {
    const n = 14;
    for (let i = 0; i < n; i++) {
      const th = ((i + layer * 0.5) / n) * Math.PI * 2;
      const L = R * (layer ? 0.9 : 1.05);
      const leaf = puffLeaf(L, R * 0.44, 0.12, layer ? hex('#f59e0b') : hex('#ffb81c'), layer ? hex('#ffcf3a') : hex('#ffe85a'));
      g.add(leaf, chain(aim(Math.sin(th) * R * 0.78, -layer * 0.012, Math.cos(th) * R * 0.78, th, 0.1 - layer * 0.12), H));
    }
  }
  for (let i = 0; i < 8; i++) {
    const th = (i / 8) * Math.PI * 2;
    g.add(puffLeaf(R * 0.45, R * 0.3, 0.1, PAL.leafDeep, PAL.leaf), chain(aim(Math.sin(th) * R * 0.5, -R * 0.15, Math.cos(th) * R * 0.5, th, -0.25), H));
  }
}

function sunPlant(g: GeoBuilder, x: number, z: number, hMax: number, stage: number, r: () => number) {
  const h = hMax * (stage === 2 ? 0.3 : stage === 3 ? 0.82 : 1);
  g.add(lathe([[0.03, 0], [0.026, h * 0.6], [0.02, h]], 7, true), tf([x, 0, z]), (l) => mix(PAL.leafDeep, PAL.stem, l.y / h));
  const n = stage === 2 ? 3 : 5;
  for (let j = 0; j < n; j++) {
    const y = h * (stage === 2 ? 0.75 : 0.12 + 0.58 * (j / n));
    const yaw = j * 2.4 + r();
    const L = (stage === 2 ? 0.15 : 0.21) * (1 - j * 0.08);
    g.add(puffLeaf(L, L * 0.85, -0.12, PAL.leafDeep, jitter(PAL.leaf, 0.04, r)), aim(x + Math.sin(yaw) * 0.02, y, z + Math.cos(yaw) * 0.02, yaw, stage === 2 ? 0.55 : 0.3));
  }
  if (stage === 2) return;
  const H = chain(Matrix.RotationX(stage === 4 ? -1.05 : -0.35), Matrix.RotationY(SUN_FACE + (r() - 0.5) * 0.4), Matrix.Translation(x, h, z));
  if (stage === 4) return sunHead(g, H, 0.15);
  // closed bud
  g.add(ico(2), chain(Matrix.Scaling(0.06, 0.05, 0.06), Matrix.Translation(0, 0.035, 0), H), hex('#6fb83a'));
  for (let i = 0; i < 7; i++) g.add(puffLeaf(0.085, 0.05, 0.4, PAL.leafDeep, PAL.leafLight), chain(aim(0, 0, 0, (i / 7) * Math.PI * 2, 0.9), H));
}

function buildSunflower(g: GeoBuilder, stage: number) {
  if (early(g, stage, 'sunflower', SUN_SPOTS.map(([x, z]) => [x, z, 1.1]), 900)) return;
  SUN_SPOTS.forEach(([x, z, h], i) => sunPlant(g, x, z, h, stage, mulberry(910 + i * 31)));
}

// ------------------------------------------------------------------ library

/** Oversized on purpose: each tile should read as one chunky, juicy crop. */
const CROP_SCALE: Record<CropId, number> = { carrot: 1.5, wheat: 1.35, tomato: 1.5, strawberry: 1.5, cabbage: 1.45, corn: 1.3, eggplant: 1.45, pumpkin: 1.4, sunflower: 1.3 };

const BUILDERS: Record<CropId, (g: GeoBuilder, stage: number) => void> = {
  carrot: buildCarrot,
  wheat: buildWheat,
  tomato: buildTomato,
  strawberry: buildStrawberry,
  cabbage: buildCabbage,
  corn: buildCorn,
  eggplant: buildEggplant,
  pumpkin: buildPumpkin,
  sunflower: buildSunflower,
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
