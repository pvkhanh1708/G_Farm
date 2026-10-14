import { Color3, CreateBoxVertexData, CreateIcoSphereVertexData, Material, Matrix, Mesh, Scene } from '@babylonjs/core';
import { CROP_ORDER, CropId, STAGE_COUNT } from '../config';
import { loadedAsset } from '../assets/registry';
import { blade, blob, chain, GeoBuilder, hex, jitter, lathe, mix, mulberry, spine, tf, weld } from './geometry';

/**
 * Procedural stand-in crop models (see ASSETS.md: crop.*). Each (crop, stage)
 * becomes one merged template mesh; plots render it via instances.
 * Local space: plot centre at origin, y=0 at the soil base (SOIL_TOP).
 */

export const RIDGE_PERIOD = 0.55;
export const RIDGE_HEIGHT = 0.035;
/** Soil surface height above SOIL_TOP (furrow ridges run along x). */
export const ridgeY = (z: number) => RIDGE_HEIGHT + RIDGE_HEIGHT * Math.cos((2 * Math.PI * z) / RIDGE_PERIOD);

const PAL = {
  mound: hex('#4a2a17'),
  moundTop: hex('#6e4127'),
  sproutBase: hex('#4e9f2c'),
  sprout: hex('#a8e55e'),
  leafDeep: hex('#2c7a22'),
  leaf: hex('#4caf2f'),
  leafLight: hex('#93d64f'),
  carrot: hex('#ff7a12'),
  carrotDeep: hex('#d9530a'),
  wheatGreen: hex('#86c34a'),
  wheatGold: hex('#e3a012'),
  wheatGoldLight: hex('#f6c94a'),
  wheatStraw: hex('#c98f22'),
  tomato: hex('#f2382b'),
  tomatoDeep: hex('#b81d17'),
  tomatoHi: hex('#ff8f6e'),
  tomatoGreen: hex('#8fcf4a'),
  flower: hex('#ffd52e'),
  stake: hex('#b88654'),
  twine: hex('#e8d3a0'),
};

const SEED_COLOR: Record<CropId, Color3> = {
  carrot: hex('#c9a26b'),
  wheat: hex('#e8c25a'),
  tomato: hex('#f1e2a6'),
};

/** Plant size multiplier per crop (from stage 2), so each plot reads as a full, lush patch. */
const PLANT_SCALE: Record<CropId, number> = { carrot: 1.7, wheat: 1.45, tomato: 1.6 };
const SEEDLING_SCALE = 1.35;

function plantPositions(crop: CropId): Array<[number, number]> {
  const rows = [-RIDGE_PERIOD, 0, RIDGE_PERIOD];
  const cols = crop === 'wheat' ? [-0.66, -0.22, 0.22, 0.66] : crop === 'tomato' ? [-0.42, 0.42] : [-0.55, 0, 0.55];
  const out: Array<[number, number]> = [];
  rows.forEach((z, ri) => cols.forEach((x, ci) => {
    const r = mulberry(ri * 31 + ci * 7 + 1);
    out.push([x + (r() - 0.5) * 0.06, z + (r() - 0.5) * 0.04]);
  }));
  return out;
}

const ico1 = () => weld(CreateIcoSphereVertexData({ radius: 1, subdivisions: 1 }));
const ico2 = () => weld(CreateIcoSphereVertexData({ radius: 1, subdivisions: 2 }));

// ------------------------------------------------------------------ shared bits
// Every plant builder below works at the origin with its base at y=0.

function seedMound(g: GeoBuilder, crop: CropId, r: () => number) {
  g.add(blob(1, 0.25, r() * 100, 2), tf([0, -0.005, 0], r() * 6, [0.11, 0.05, 0.11]), (l) => mix(PAL.mound, PAL.moundTop, l.y * 0.6 + 0.5));
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + r();
    g.add(ico1(), tf([Math.cos(a) * 0.035, 0.04, Math.sin(a) * 0.035], r() * 6, [0.024, 0.014, 0.017], 0, (r() - 0.5) * 0.6), jitter(SEED_COLOR[crop], 0.08, r));
  }
}

function cotyledons(g: GeoBuilder, size: number, r: () => number) {
  const yaw = r() * Math.PI;
  const stemH = 0.04 * size;
  g.add(blade({ length: stemH, width: 0.012, bend: 0, shape: 'strap', segments: 2, fold: 0, base: PAL.sproutBase, tip: PAL.sprout }), tf([0, 0, 0], yaw));
  for (const side of [0, Math.PI]) {
    g.add(
      blade({ length: 0.08 * size, width: 0.055 * size, bend: 0.9, lean: 0.75, shape: 'round', segments: 4, fold: 0.3, base: PAL.sproutBase, tip: PAL.sprout }),
      tf([0, stemH, 0], yaw + side),
    );
  }
}

// ------------------------------------------------------------------ carrot

function carrotFrond(g: GeoBuilder, F: Matrix, len: number, r: () => number, lush: number) {
  const lean = 0.2 + r() * 0.35;
  const bend = 0.45 + r() * 0.45;
  const stemBase = mix(PAL.leafDeep, PAL.leaf, 0.3);
  g.add(blade({ length: len, width: 0.016, bend, lean, shape: 'strap', segments: 6, fold: 0, base: stemBase, tip: PAL.leaf }), F);
  const pairs = 3 + Math.round(lush * 2);
  const leafA = mix(PAL.leaf, PAL.leafDeep, 0.25);
  for (let k = 0; k < pairs; k++) {
    const t = 0.3 + (k / pairs) * 0.62;
    const sp = spine(len, lean, bend, t);
    const L = len * (0.34 - k * 0.025);
    for (const side of [-1, 1]) {
      const leaf = blade({ length: L, width: L * 0.62, bend: 0.7, lean: 0.85, shape: 'leaf', segments: 4, fold: 0.3, base: leafA, tip: jitter(PAL.leafLight, 0.06, r) });
      g.add(leaf, chain(tf([0, 0, 0], side * 1.35, 1), Matrix.RotationX(sp.theta * 0.75), Matrix.Translation(0, sp.y, sp.z), F));
    }
  }
  const tip = spine(len, lean, bend, 1);
  const L = len * 0.26;
  g.add(
    blade({ length: L, width: L * 0.62, bend: 0.5, lean: 0, shape: 'leaf', segments: 4, fold: 0.3, base: leafA, tip: PAL.leafLight }),
    chain(Matrix.RotationX(tip.theta), Matrix.Translation(0, tip.y, tip.z), F),
  );
}

function carrotRoot(g: GeoBuilder, r: () => number) {
  const prof: Array<[number, number]> = [
    [0.004, -0.2], [0.02, -0.15], [0.036, -0.09], [0.05, -0.03], [0.056, 0.02], [0.052, 0.05], [0.038, 0.068], [0.016, 0.076],
  ];
  g.add(lathe(prof, 12, true), tf([0, 0.045, 0], r() * 6, 1.25, (r() - 0.5) * 0.15, (r() - 0.5) * 0.15), (l) => {
    const band = 0.93 + 0.07 * Math.sin(l.y * 140);
    return mix(PAL.carrotDeep, PAL.carrot, (l.y + 0.05) / 0.12).scale(band);
  });
}

function carrotPlant(g: GeoBuilder, stage: number, r: () => number) {
  if (stage === 0) return seedMound(g, 'carrot', r);
  if (stage === 1) return cotyledons(g, 1, r);
  const fronds = stage === 2 ? 4 : stage === 3 ? 6 : 8;
  const baseLen = stage === 2 ? 0.17 : stage === 3 ? 0.3 : 0.36;
  const yaw0 = r() * Math.PI * 2;
  for (let f = 0; f < fronds; f++) {
    const F = tf([0, stage === 4 ? 0.13 : 0, 0], yaw0 + (f / fronds) * Math.PI * 2 + (r() - 0.5) * 0.4);
    carrotFrond(g, F, baseLen * (0.8 + r() * 0.3), r, stage >= 3 ? 1 : 0);
  }
  if (stage === 4) carrotRoot(g, r);
}

// ------------------------------------------------------------------ wheat

function wheatEar(g: GeoBuilder, E: Matrix, ripe: number) {
  const grain = mix(PAL.wheatGreen, PAL.wheatGold, ripe);
  const grainHi = mix(hex('#c4ec7c'), PAL.wheatGoldLight, ripe);
  const n = 12;
  for (let i = 0; i < n; i++) {
    const a = (i % 4) * (Math.PI / 2) + (i % 8 >= 4 ? Math.PI / 4 : 0);
    const h = 0.014 + i * 0.0145;
    const rad = 0.014 * (1 - i / (n * 1.6));
    const M = chain(Matrix.Scaling(0.021, 0.034, 0.021), Matrix.RotationX(0.38), Matrix.RotationY(a), Matrix.Translation(Math.sin(a) * rad, h, Math.cos(a) * rad), E);
    g.add(ico1(), M, (l) => mix(grain, grainHi, l.y * 0.5 + 0.5));
    if (i >= n - 7 && ripe > 0.5) {
      const awn = blade({ length: 0.075, width: 0.006, bend: 0.2, lean: 0.25, shape: 'strap', segments: 2, fold: 0, base: grainHi, tip: PAL.wheatGoldLight });
      g.add(awn, chain(Matrix.RotationY(a), Matrix.Translation(Math.sin(a) * rad, h + 0.02, Math.cos(a) * rad), E));
    }
  }
}

function wheatTuft(g: GeoBuilder, stage: number, r: () => number) {
  if (stage === 0) return seedMound(g, 'wheat', r);
  const yaw0 = r() * Math.PI * 2;
  const ripe = stage === 4 ? 1 : 0;
  const leafCount = stage === 1 ? 3 : 5;
  const leafLen = stage === 1 ? 0.11 : stage === 2 ? 0.24 : stage === 3 ? 0.34 : 0.28;
  const leafBase = mix(PAL.leaf, PAL.wheatStraw, ripe * 0.6);
  const leafTip = mix(PAL.leafLight, hex('#e6d77a'), ripe);
  for (let i = 0; i < leafCount; i++) {
    const yaw = yaw0 + (i / leafCount) * Math.PI * 2 + (r() - 0.5) * 0.5;
    g.add(
      blade({ length: leafLen * (0.75 + r() * 0.35), width: stage === 1 ? 0.018 : 0.032, bend: 0.6 + r() * 0.6, lean: 0.12 + r() * 0.3, shape: 'taper', segments: 6, fold: 0.25, base: leafBase, tip: leafTip }),
      tf([0, 0, 0], yaw),
    );
  }
  if (stage < 3) return;
  const stalks = stage === 3 ? 4 : 7;
  for (let s = 0; s < stalks; s++) {
    const yaw = yaw0 + (s / stalks) * Math.PI * 2 + r();
    const len = (stage === 3 ? 0.42 : 0.6) * (0.85 + r() * 0.25);
    const lean = 0.08 + r() * 0.22;
    const bend = stage === 4 ? 0.3 + r() * 0.3 : 0.1;
    const P = tf([(r() - 0.5) * 0.04, 0, (r() - 0.5) * 0.04], yaw);
    const sc = mix(PAL.wheatGreen, PAL.wheatStraw, ripe);
    g.add(blade({ length: len, width: 0.02, bend, lean, shape: 'strap', segments: 6, fold: 0, base: sc, tip: mix(sc, PAL.wheatGoldLight, 0.4) }), P);
    const tip = spine(len, lean, bend, 1);
    const k = stage === 3 ? 0.7 : 1;
    wheatEar(g, chain(Matrix.Scaling(k, k, k), Matrix.RotationX(tip.theta), Matrix.Translation(0, tip.y, tip.z), P), ripe);
  }
}

// ------------------------------------------------------------------ tomato

function tomatoLeaf(g: GeoBuilder, M: Matrix, len: number, r: () => number) {
  const lean = 0.95 + r() * 0.35;
  const bend = 0.9 + r() * 0.4;
  g.add(blade({ length: len, width: 0.013, bend, lean, shape: 'strap', segments: 5, fold: 0, base: PAL.leafDeep, tip: PAL.leaf }), M);
  const leafBase = mix(PAL.leafDeep, PAL.leaf, 0.5);
  const leafTip = jitter(mix(PAL.leaf, PAL.leafLight, 0.5), 0.08, r);
  const L = len * 0.44;
  for (const t of [0.45, 0.75]) {
    const sp = spine(len, lean, bend, t);
    for (const side of [-1, 1]) {
      g.add(
        blade({ length: L * (t < 0.6 ? 0.85 : 1), width: L * 0.78, bend: 0.5, lean: 0.9, shape: 'leaf', segments: 4, fold: 0.32, base: leafBase, tip: leafTip }),
        chain(Matrix.RotationY(side * 1.3), Matrix.RotationX(sp.theta * 0.7), Matrix.Translation(0, sp.y, sp.z), M),
      );
    }
  }
  const tip = spine(len, lean, bend, 1);
  g.add(
    blade({ length: L * 1.1, width: L * 0.82, bend: 0.4, lean: 0, shape: 'leaf', segments: 4, fold: 0.32, base: leafBase, tip: leafTip }),
    chain(Matrix.RotationX(tip.theta), Matrix.Translation(0, tip.y, tip.z), M),
  );
}

function tomatoFruit(g: GeoBuilder, x: number, y: number, z: number, radius: number, ripe: number, r: () => number) {
  const vd = ico2();
  const p = vd.positions as number[];
  for (let i = 0; i < p.length; i += 3) {
    const a = Math.atan2(p[i + 2], p[i]);
    const k = 1 + 0.05 * Math.cos(a * 5) * (1 - Math.abs(p[i + 1]));
    p[i] *= k;
    p[i + 2] *= k;
    p[i + 1] *= p[i + 1] > 0 ? 0.78 : 0.88;
  }
  const base = mix(PAL.tomatoGreen, PAL.tomato, ripe);
  const deep = mix(hex('#5fa834'), PAL.tomatoDeep, ripe);
  const hi = mix(hex('#c9ef8c'), PAL.tomatoHi, ripe);
  g.add(vd, tf([x, y, z], r() * 6, radius), (l) => {
    const c = mix(deep, base, l.y * 0.7 + 0.65);
    return l.y > 0.45 && l.x < 0 ? mix(c, hi, (l.y - 0.45) * 1.6) : c;
  });
  for (let i = 0; i < 5; i++) {
    g.add(
      blade({ length: radius * 0.75, width: radius * 0.28, bend: 0.6, lean: 1.25, shape: 'taper', segments: 3, fold: 0.1, base: PAL.leafDeep, tip: PAL.leaf }),
      tf([x, y + radius * 0.74, z], (i / 5) * Math.PI * 2),
    );
  }
}

function tomatoFlower(g: GeoBuilder, x: number, y: number, z: number, r: () => number) {
  const yaw = r() * 6;
  for (let i = 0; i < 5; i++) {
    g.add(
      blade({ length: 0.032, width: 0.018, bend: 0.4, lean: 1.9, shape: 'leaf', segments: 3, fold: 0.05, base: hex('#ffc21a'), tip: PAL.flower }),
      tf([x, y, z], yaw + (i / 5) * Math.PI * 2),
    );
  }
  g.add(ico1(), tf([x, y - 0.004, z], 0, 0.01), hex('#e0a10e'));
}

function tomatoPlant(g: GeoBuilder, stage: number, r: () => number) {
  if (stage === 0) return seedMound(g, 'tomato', r);
  if (stage === 1) return cotyledons(g, 1.2, r);
  const h = stage === 2 ? 0.14 : stage === 3 ? 0.4 : 0.48;
  g.add(lathe([[0.016, 0], [0.013, h * 0.5], [0.008, h]], 6, true), tf([0, 0, 0], 0, 1, (r() - 0.5) * 0.12, (r() - 0.5) * 0.12), (l) => mix(PAL.leafDeep, PAL.leaf, l.y / h));
  const leaves = stage === 2 ? 4 : stage === 3 ? 8 : 9;
  const yaw0 = r() * 6;
  for (let k = 0; k < leaves; k++) {
    const ly = h * (0.12 + 0.86 * (k / leaves));
    const len = (stage === 2 ? 0.12 : 0.2) * (1 - (k / leaves) * 0.35) * (0.9 + r() * 0.2);
    tomatoLeaf(g, tf([0, ly, 0], yaw0 + k * 2.4), len, r);
  }
  if (stage >= 3) {
    // bamboo stake with a twine tie
    const sx = 0.07, sz = -0.05;
    g.add(lathe([[0.013, -0.05], [0.011, 0.6], [0.0, 0.64]], 6, false), tf([sx, 0, sz], 0, 1, 0.04, -0.05), (l) =>
      mix(PAL.stake, hex('#d6a874'), (l.y * 3) % 1 > 0.92 ? 1 : 0),
    );
    g.add(lathe([[0.017, 0.3], [0.018, 0.315], [0.017, 0.33]], 8, false), tf([sx, 0, sz], 0), PAL.twine);
  }
  if (stage === 3) {
    for (let i = 0; i < 3; i++) {
      const a = yaw0 + i * 2.1;
      tomatoFlower(g, Math.cos(a) * 0.1, h * (0.55 + i * 0.12), Math.sin(a) * 0.1, r);
    }
    tomatoFruit(g, -0.06, h * 0.4, 0.07, 0.03, 0, r);
  }
  if (stage === 4) {
    const fruits = 4 + Math.floor(r() * 2);
    for (let i = 0; i < fruits; i++) {
      const a = yaw0 + i * ((Math.PI * 2) / fruits) + r() * 0.4;
      const rad = 0.09 + r() * 0.04;
      tomatoFruit(g, Math.cos(a) * rad, 0.12 + r() * 0.22, Math.sin(a) * rad, 0.05 + r() * 0.01, i === fruits - 1 ? 0.75 : 1, r);
    }
    tomatoFlower(g, 0.05, h * 0.9, -0.08, r);
  }
}

// ------------------------------------------------------------------ per-plot assembly

const PLANT_BUILDERS: Record<CropId, (g: GeoBuilder, stage: number, r: () => number) => void> = {
  carrot: carrotPlant,
  wheat: wheatTuft,
  tomato: tomatoPlant,
};

const CARD_COLOR: Record<CropId, Color3> = { carrot: PAL.carrot, wheat: PAL.wheatGold, tomato: PAL.tomato };

/** Little seed-packet marker so a freshly sown plot reads at a glance. */
function seedMarker(g: GeoBuilder, crop: CropId) {
  const x = 0.7, z = 0.78, y = ridgeY(z);
  g.add(lathe([[0.016, -0.05], [0.014, 0.42], [0, 0.45]], 4, false), tf([x, y, z], Math.PI / 4), PAL.stake);
  g.add(CreateBoxVertexData({ width: 0.24, height: 0.2, depth: 0.02 }), tf([x, y + 0.36, z - 0.02], -0.6), hex('#fff6dc'));
  g.add(blob(1, 0.02, 3, 1), tf([x - 0.012, y + 0.37, z - 0.037], -0.6, [0.06, 0.06, 0.012]), CARD_COLOR[crop]);
}

function buildPlot(g: GeoBuilder, crop: CropId, stage: number) {
  if (stage === 0) seedMarker(g, crop);
  const scale = stage <= 1 ? SEEDLING_SCALE : PLANT_SCALE[crop];
  plantPositions(crop).forEach(([x, z], i) => {
    // same seed for every stage so a plant keeps its orientation as it grows
    const r = mulberry(1000 * (CROP_ORDER.indexOf(crop) + 1) + i * 17);
    const yaw = r() * Math.PI * 2;
    const pg = new GeoBuilder();
    PLANT_BUILDERS[crop](pg, stage, r);
    if (pg.vertexCount) g.add(pg.toVertexData(), tf([x, ridgeY(z), z], yaw, scale));
  });
}

// ------------------------------------------------------------------ library

export class CropLibrary {
  private cache = new Map<string, Mesh>();

  constructor(private scene: Scene, private material: Material) {}

  /** Hidden source mesh for (crop, stage); plots create instances from it. */
  template(crop: CropId, stage: number): Mesh {
    const key = `${crop}:${stage}`;
    let mesh = this.cache.get(key);
    if (!mesh) {
      const replacement = loadedAsset(`crop.${crop}.s${stage}`);
      if (replacement) mesh = replacement;
      else {
        const g = new GeoBuilder();
        buildPlot(g, crop, Math.max(0, Math.min(STAGE_COUNT - 1, stage)));
        mesh = g.build(`crop-${key}`, this.scene, this.material);
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
