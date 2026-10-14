import { Color3, CreatePlane, Matrix, Mesh, Scene, StandardMaterial, TransformNode, Vector3 } from '@babylonjs/core';
import { blade, blob, chain, GeoBuilder, hex, jitter, lathe, mix, mulberry, tf } from './geometry';
import { butterflyWingTexture } from './textures';

/** Reusable procedural scenery kits (stand-ins, see ASSETS.md). */
// ------------------------------------------------------------------ trees

export interface TreeKit {
  trunk: GeoBuilder;
  canopy: GeoBuilder;
}

export function roundTree(seed: number, leafDark: Color3, leafLight: Color3, accent?: Color3): TreeKit {
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

export function pineTree(seed: number): TreeKit {
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

export function bushKit(seed: number, flowers?: Color3): TreeKit {
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

export function flowerKit(seed: number, petal: Color3, centre: Color3) {
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

export function grassKit(seed: number) {
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

export function rockKit(seed: number) {
  const r = mulberry(seed);
  const g = new GeoBuilder();
  const grey = hex('#8f9aa3'), light = hex('#d3d9dd'), moss = hex('#86b85a');
  g.add(blob(0.5, 0.38, seed, 2, true), tf([0, 0.12, 0], 0, [1.2, 0.75, 1]), (l) => (l.y > 0.32 ? mix(light, moss, 0.55) : mix(grey, light, l.y + 0.4)));
  g.add(blob(0.25, 0.35, seed + 1, 1, true), tf([0.55, 0.05, 0.2], r() * 6, [1, 0.7, 1]), (l) => mix(grey, light, l.y * 2 + 0.5));
  return g;
}

// ------------------------------------------------------------------ butterflies

export interface Butterfly {
  root: TransformNode;
  wl: Mesh;
  wr: Mesh;
  home: Vector3;
  phase: number;
  speed: number;
}

export function buildButterflies(scene: Scene, count: number): Butterfly[] {
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

