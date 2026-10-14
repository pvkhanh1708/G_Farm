import {
  CreateGroundVertexData,
  Mesh,
  PBRMaterial,
  Scene,
  Texture,
  Vector3,
  VertexData,
} from '@babylonjs/core';
import { PLOT_SIZE, PLOT_SPACING } from '../config';
import { blade, blob, GeoBuilder, fbm2, hex, mix, mulberry, noise3, tf } from './geometry';
import { MaterialLibrary, toonMaterial } from './materials';
import { waterTexture } from './textures';

// ------------------------------------------------------------------ layout

export const BARN_POS = new Vector3(1.2, 0, 11.4);
export const WINDMILL_POS = new Vector3(11.5, 0, 5.2);
export const POND_POS = new Vector3(-9.5, 0, 6.5);
export const WATER_Y = -0.14;

/** Path centre-lines (smoothed later). */
export const PATHS: Vector3[][] = [
  [new Vector3(-30, 0, -9), new Vector3(-18, 0, -6), new Vector3(-10, 0, -1.2), new Vector3(-6.4, 0, 0), new Vector3(-4.2, 0, 0)],
  [new Vector3(0, 0, 4.2), new Vector3(0.2, 0, 6.8), new Vector3(1.0, 0, 8.6), new Vector3(1.2, 0, 9.6)],
  [new Vector3(0.6, 0, 7.8), new Vector3(4.5, 0, 8.6), new Vector3(8.5, 0, 7.2), new Vector3(10.4, 0, 5.8)],
];

const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** Normalised pond distance: <1 inside water, 1 at the shoreline. */
export function pondNorm(x: number, z: number) {
  const dx = x - POND_POS.x, dz = z - POND_POS.z;
  const a = Math.atan2(dz, dx);
  const R = 3.1 + 0.5 * Math.sin(3 * a + 1) + 0.25 * Math.sin(5 * a + 2);
  return Math.hypot(dx, dz) / R;
}

/** Props that farm tiles must grow around (centre x/z, radius). */
export const BLOCKERS: Array<[number, number, number]> = [
  [BARN_POS.x, BARN_POS.z, 3.0],
  [BARN_POS.x + 3.1, BARN_POS.z - 0.6, 1.1], // hay bales
  [BARN_POS.x - 2.5, BARN_POS.z - 1.7, 0.7], // crates
  [WINDMILL_POS.x, WINDMILL_POS.z, 1.9],
  [-6.4, -1.4, 0.5], // signpost
  [6.2, -2.0, 0.9], // trough
];

/** True when a farm tile at (col,row) would overlap a building, the pond or a path. */
export function tileBlocked(col: number, row: number) {
  const cx = col * PLOT_SPACING, cz = row * PLOT_SPACING;
  const h = PLOT_SIZE / 2;
  const pts = [[0, 0], [-h, -h], [h, -h], [-h, h], [h, h], [0, -h], [0, h], [-h, 0], [h, 0]];
  for (const [dx, dz] of pts) {
    const x = cx + dx, z = cz + dz;
    if (pondNorm(x, z) < 1.08) return true;
    if (pathDist(x, z) < 0.7) return true;
    for (const [bx, bz, br] of BLOCKERS) if (Math.hypot(x - bx, z - bz) < br) return true;
  }
  return Math.hypot(cx, cz) > MEADOW_RADIUS;
}

let pathSamples: Vector3[] | null = null;
export function pathPoints(): Vector3[][] {
  return PATHS.map((pts) => {
    const out: Vector3[] = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
      const steps = Math.max(2, Math.ceil(Vector3.Distance(p1, p2) / 0.4));
      for (let s = 0; s < steps; s++) out.push(Vector3.CatmullRom(p0, p1, p2, p3, s / steps));
    }
    out.push(pts[pts.length - 1].clone());
    return out;
  });
}

/** Distance from (x,z) to the nearest path centre-line. */
export function pathDist(x: number, z: number) {
  pathSamples ??= pathPoints().flat();
  let best = Infinity;
  for (const p of pathSamples) {
    const d = (p.x - x) * (p.x - x) + (p.z - z) * (p.z - z);
    if (d < best) best = d;
  }
  return Math.sqrt(best);
}

/** Radius of the flat meadow the farm can expand into; hills start beyond it. */
export const MEADOW_RADIUS = 30;

export function terrainHeight(x: number, z: number) {
  const rd = Math.hypot(x, z);
  let h = (fbm2(x * 0.05 + 3, z * 0.05 + 7) - 0.45) * 3.4 * smoothstep(MEADOW_RADIUS, MEADOW_RADIUS + 12, rd);
  h += (noise3(x * 0.45, 7, z * 0.45) - 0.5) * 0.08;
  h += smoothstep(MEADOW_RADIUS + 10, MEADOW_RADIUS + 40, rd) * 3.5;
  // keep building pads flat
  for (const [p, r] of [[BARN_POS, 4.2], [WINDMILL_POS, 2.6]] as const) {
    const k = smoothstep(r + 2, r, Math.hypot(x - p.x, z - p.z));
    h = h * (1 - k);
  }
  const pn = pondNorm(x, z);
  if (pn < 1.5) {
    const bowl = -0.75 * (1 - Math.min(1, pn) ** 2) - 0.06;
    h = mix1(bowl, h, smoothstep(0.92, 1.5, pn));
  }
  return h;
}
const mix1 = (a: number, b: number, t: number) => a + (b - a) * t;

// ------------------------------------------------------------------ ground

export function buildTerrain(scene: Scene, mats: MaterialLibrary) {
  const SIZE = 180;
  const vd = CreateGroundVertexData({ width: SIZE, height: SIZE, subdivisions: 150 });
  const p = vd.positions as number[];
  const colors: number[] = [];
  const base = hex('#ffffff');
  const warm = hex('#fff2c2');
  const cool = hex('#c4dcc0');
  const bank = hex('#c9b48a');
  for (let i = 0; i < p.length; i += 3) {
    const x = p[i], z = p[i + 2];
    const h = terrainHeight(x, z);
    p[i + 1] = h;
    const n = fbm2(x * 0.09, z * 0.09, 3);
    let c = n > 0.5 ? mix(base, warm, (n - 0.5) * 2.2) : mix(cool, base, n * 2);
    const pn = pondNorm(x, z);
    if (pn < 1.25) c = mix(bank, c, smoothstep(1.0, 1.25, pn));
    c = c.toLinearSpace();
    colors.push(c.r, c.g, c.b, 1);
  }
  vd.colors = colors;
  const normals: number[] = [];
  VertexData.ComputeNormals(p, vd.indices!, normals);
  vd.normals = normals;
  const ground = new Mesh('terrain', scene);
  vd.applyToMesh(ground);
  ground.material = mats.grassGround;
  ground.receiveShadows = true;
  ground.isPickable = false;
  const tex = mats.grassGround.albedoTexture as Texture;
  tex.uScale = tex.vScale = SIZE / 3.2;
  ground.freezeWorldMatrix();
  return ground;
}

export function buildPaths(scene: Scene, mats: MaterialLibrary) {
  const width = 1.25;
  const g = new GeoBuilder();
  const color = hex('#ffffff');
  for (const pts of pathPoints()) {
    const positions: number[] = [];
    const uvs: number[] = [];
    const indices: number[] = [];
    let dist = 0;
    pts.forEach((pt, i) => {
      const prev = pts[Math.max(0, i - 1)], next = pts[Math.min(pts.length - 1, i + 1)];
      const dir = next.subtract(prev).normalize();
      const side = new Vector3(dir.z, 0, -dir.x);
      const wob = 1 + (noise3(pt.x * 0.7, 1, pt.z * 0.7) - 0.5) * 0.35;
      if (i > 0) dist += Vector3.Distance(pts[i - 1], pt);
      for (const s of [-1, 1]) {
        const q = pt.add(side.scale(s * width * 0.5 * wob));
        positions.push(q.x, terrainHeight(q.x, q.z) + 0.03, q.z);
        uvs.push(dist / width, s < 0 ? 0 : 1);
      }
      if (i > 0) {
        const a = (i - 1) * 2, b = i * 2;
        indices.push(a, a + 1, b, a + 1, b + 1, b);
      }
    });
    const vd = new VertexData();
    vd.positions = positions;
    vd.uvs = uvs;
    vd.indices = indices;
    g.add(vd, tf([0, 0, 0]), color);
  }
  const mesh = g.build('paths', scene, mats.path);
  mesh.receiveShadows = true;
  mesh.isPickable = false;
  mesh.freezeWorldMatrix();
  // stepping stones along the paths
  const stones = new GeoBuilder();
  const r = mulberry(77);
  for (const pts of pathPoints())
    for (let i = 2; i < pts.length; i += 3) {
      if (r() < 0.35) continue;
      const pt = pts[i];
      const off = (r() - 0.5) * 0.6;
      const x = pt.x + off, z = pt.z + (r() - 0.5) * 0.4;
      stones.add(blob(0.2 + r() * 0.08, 0.25, r() * 40, 1, true), tf([x, terrainHeight(x, z) + 0.02, z], r() * 6, [1, 0.25, 0.8]), (l) =>
        mix(hex('#9aa0a6'), hex('#d5d9dc'), l.y * 2 + 0.6),
      );
    }
  const stoneMesh = stones.build('path-stones', scene, mats.props);
  stoneMesh.receiveShadows = true;
  stoneMesh.isPickable = false;
  stoneMesh.freezeWorldMatrix();
  return [mesh, stoneMesh];
}

// ------------------------------------------------------------------ pond

export interface Pond {
  water: Mesh;
  update(t: number): void;
}

export function buildPond(scene: Scene, mats: MaterialLibrary): Pond {
  // water surface: radial disc following the shoreline
  const segs = 64, rings = 6;
  const positions: number[] = [];
  const uvs: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];
  const deep = hex('#2b9fc4');
  const shallow = hex('#7fe0e6');
  positions.push(POND_POS.x, WATER_Y, POND_POS.z);
  uvs.push(POND_POS.x * 0.25, POND_POS.z * 0.25);
  const deepLin = deep.toLinearSpace();
  colors.push(deepLin.r, deepLin.g, deepLin.b, 1);
  for (let r = 1; r <= rings; r++) {
    const f = r / rings;
    for (let s = 0; s < segs; s++) {
      const a = (s / segs) * Math.PI * 2;
      const R = 3.1 + 0.5 * Math.sin(3 * a + 1) + 0.25 * Math.sin(5 * a + 2);
      const x = POND_POS.x + Math.cos(a) * R * f * 1.04, z = POND_POS.z + Math.sin(a) * R * f * 1.04;
      positions.push(x, WATER_Y, z);
      uvs.push(x * 0.25, z * 0.25);
      const c = mix(deep, shallow, Math.pow(f, 2.2)).toLinearSpace();
      colors.push(c.r, c.g, c.b, 1);
    }
  }
  for (let s = 0; s < segs; s++) indices.push(0, 1 + s, 1 + ((s + 1) % segs));
  for (let r = 1; r < rings; r++)
    for (let s = 0; s < segs; s++) {
      const a = 1 + (r - 1) * segs + s, b = 1 + (r - 1) * segs + ((s + 1) % segs);
      const c = a + segs, d = b + segs;
      indices.push(a, c, b, b, c, d);
    }
  const vd = new VertexData();
  vd.positions = positions;
  vd.uvs = uvs;
  vd.colors = colors;
  vd.indices = indices;
  const normals: number[] = [];
  VertexData.ComputeNormals(positions, indices, normals);
  vd.normals = normals;
  const water = new Mesh('pond-water', scene);
  vd.applyToMesh(water);
  const ripples = waterTexture(scene);
  const wm: PBRMaterial = toonMaterial(scene, 'water-mat', { texture: ripples, roughness: 0.12, alpha: 0.9 });
  wm.specularIntensity = 1.2;
  water.material = wm;
  water.isPickable = false;
  water.receiveShadows = true;

  // pads, reeds, a flower
  const g = new GeoBuilder();
  const r = mulberry(303);
  const pad = hex('#5cb84a');
  for (let i = 0; i < 7; i++) {
    const a = r() * 6.28, d = 0.5 + r() * 1.7;
    const x = POND_POS.x + Math.cos(a) * d, z = POND_POS.z + Math.sin(a) * d;
    const s = 0.28 + r() * 0.16;
    const disc = blob(1, 0.04, i, 1);
    const pp = disc.positions as number[];
    for (let k = 0; k < pp.length; k += 3) {
      const ang = Math.atan2(pp[k + 2], pp[k]);
      if (Math.abs(ang) < 0.32) { pp[k] *= 0.25; pp[k + 2] *= 0.25; }
    }
    g.add(disc, tf([x, WATER_Y + 0.02, z], r() * 6, [s, 0.03, s]), (l) => mix(pad, hex('#8ed866'), l.x * 0.5 + 0.5));
    if (i % 3 === 0) {
      for (let k = 0; k < 8; k++)
        g.add(
          blade({ length: 0.12, width: 0.07, bend: 0.5, lean: 0.6 + (k % 2) * 0.4, shape: 'leaf', segments: 3, fold: 0.2, base: hex('#ff9ec4'), tip: hex('#fff0f6') }),
          tf([x, WATER_Y + 0.04, z], (k / 8) * 6.28, 1),
        );
      g.add(blob(0.04, 0.1, 1, 1), tf([x, WATER_Y + 0.07, z]), hex('#ffd84a'));
    }
  }
  const reedBase = hex('#4c8f34'), reedTip = hex('#a8d66a');
  for (let i = 0; i < 22; i++) {
    const a = r() * 6.28;
    const R = 3.1 + 0.5 * Math.sin(3 * a + 1) + 0.25 * Math.sin(5 * a + 2);
    if (Math.cos(a + 0.8) < -0.3) continue; // keep the camera-facing shore open
    const x = POND_POS.x + Math.cos(a) * (R - 0.1), z = POND_POS.z + Math.sin(a) * (R - 0.1);
    const y = Math.max(WATER_Y, terrainHeight(x, z));
    for (let k = 0; k < 4; k++) {
      const len = 0.6 + r() * 0.5;
      g.add(blade({ length: len, width: 0.04, bend: 0.4 + r() * 0.4, lean: r() * 0.25, shape: 'taper', segments: 5, fold: 0.15, base: reedBase, tip: reedTip }), tf([x, y, z], r() * 6.28));
    }
    if (r() > 0.4) {
      g.add(blade({ length: 0.75, width: 0.015, bend: 0.1, lean: 0.05, shape: 'strap', segments: 3, fold: 0, base: reedBase, tip: reedBase }), tf([x, y, z], 0));
      g.add(blob(1, 0.05, 2, 1), tf([x + 0.006, y + 0.68, z + 0.035], 0, [0.035, 0.11, 0.035]), hex('#7a4a2a'));
    }
  }
  const deco = g.build('pond-deco', scene, mats.grass);
  deco.isPickable = false;
  deco.receiveShadows = true;

  return {
    water,
    update(t: number) {
      ripples.uOffset = t * 0.02;
      ripples.vOffset = Math.sin(t * 0.3) * 0.05;
      wm.albedoColor.set(1, 1, 1);
    },
  };
}
