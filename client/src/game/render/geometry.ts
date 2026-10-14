import {
  Color3,
  CreateIcoSphereVertexData,
  Material,
  Matrix,
  Mesh,
  Quaternion,
  Scene,
  Vector3,
  VertexData,
} from '@babylonjs/core';

// ---------------------------------------------------------------- noise / rng

export function mulberry(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash3(x: number, y: number, z: number) {
  let h = Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(z, 2147483647);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

const fade = (t: number) => t * t * (3 - 2 * t);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Smooth value noise in [0,1]. */
export function noise3(x: number, y: number, z: number) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const xf = fade(x - xi), yf = fade(y - yi), zf = fade(z - zi);
  const c = (dx: number, dy: number, dz: number) => hash3(xi + dx, yi + dy, zi + dz);
  return lerp(
    lerp(lerp(c(0, 0, 0), c(1, 0, 0), xf), lerp(c(0, 1, 0), c(1, 1, 0), xf), yf),
    lerp(lerp(c(0, 0, 1), c(1, 0, 1), xf), lerp(c(0, 1, 1), c(1, 1, 1), xf), yf),
    zf,
  );
}

export function fbm2(x: number, z: number, oct = 3) {
  let v = 0, amp = 0.5, f = 1;
  for (let i = 0; i < oct; i++) {
    v += noise3(x * f, 0.5, z * f) * amp;
    f *= 2.03;
    amp *= 0.5;
  }
  return v / (1 - Math.pow(0.5, oct));
}

// ---------------------------------------------------------------- colours

export const hex = (h: string) => Color3.FromHexString(h);

export function jitter(c: Color3, amt: number, r: () => number) {
  const k = 1 + (r() - 0.5) * 2 * amt;
  return new Color3(Math.min(1, c.r * k), Math.min(1, c.g * k), Math.min(1, c.b * k));
}

export function mix(a: Color3, b: Color3, t: number) {
  return Color3.Lerp(a, b, Math.max(0, Math.min(1, t)));
}

// ---------------------------------------------------------------- transforms

type V3 = Vector3 | [number, number, number];
const v3 = (v: V3) => (Array.isArray(v) ? new Vector3(v[0], v[1], v[2]) : v);

/** Compose a transform: scale -> rotate (yaw/pitch/roll) -> translate. */
export function tf(pos: V3, rotY = 0, scale: number | V3 = 1, rotX = 0, rotZ = 0) {
  const s = typeof scale === 'number' ? new Vector3(scale, scale, scale) : v3(scale);
  return Matrix.Compose(s, Quaternion.RotationYawPitchRoll(rotY, rotX, rotZ), v3(pos));
}

// ---------------------------------------------------------------- builder

export type ColorFn = (local: Vector3, world: Vector3) => Color3;

/**
 * Accumulates many small primitives into one vertex-coloured mesh, so a whole
 * plant patch / prop costs a single draw call.
 */
export class GeoBuilder {
  positions: number[] = [];
  colors: number[] = [];
  uvs: number[] = [];
  indices: number[] = [];

  add(vd: VertexData, m: Matrix, color?: Color3 | ColorFn) {
    const base = this.positions.length / 3;
    const p = vd.positions!;
    const uv = vd.uvs;
    const vc = vd.colors;
    const w = new Vector3();
    const local = new Vector3();
    for (let i = 0; i < p.length / 3; i++) {
      local.set(p[i * 3], p[i * 3 + 1], p[i * 3 + 2]);
      Vector3.TransformCoordinatesToRef(local, m, w);
      this.positions.push(w.x, w.y, w.z);
      let c: Color3;
      if (typeof color === 'function') c = color(local, w);
      else if (color) c = color;
      else if (vc) c = new Color3(vc[i * 4], vc[i * 4 + 1], vc[i * 4 + 2]);
      else c = Color3.White();
      // authored in sRGB; PBR expects linear vertex colours
      const lin = c.toLinearSpace();
      this.colors.push(lin.r, lin.g, lin.b, 1);
      this.uvs.push(uv ? uv[i * 2] : 0, uv ? uv[i * 2 + 1] : 0);
    }
    for (const idx of vd.indices!) this.indices.push(base + idx);
    return this;
  }

  get vertexCount() {
    return this.positions.length / 3;
  }

  toVertexData() {
    const vd = new VertexData();
    vd.positions = this.positions;
    vd.indices = this.indices;
    vd.colors = this.colors;
    vd.uvs = this.uvs;
    const normals: number[] = [];
    VertexData.ComputeNormals(this.positions, this.indices, normals);
    vd.normals = normals;
    return vd;
  }

  build(name: string, scene: Scene, material: Material | null) {
    const mesh = new Mesh(name, scene);
    this.toVertexData().applyToMesh(mesh, false);
    mesh.material = material;
    return mesh;
  }
}

// ---------------------------------------------------------------- primitives

export type BladeShape = 'taper' | 'leaf' | 'round' | 'strap';

export interface BladeOpts {
  length: number;
  width: number;
  /** total curvature (radians) applied along the blade, positive arcs toward +z */
  bend: number;
  /** initial angle from vertical toward +z */
  lean?: number;
  segments?: number;
  shape?: BladeShape;
  /** V-fold depth relative to width (gives a midrib crease) */
  fold?: number;
  base: Color3;
  tip: Color3;
}

/** Point on a constant-curvature spine (same curve `blade` follows), t in [0,1]. */
export function spine(length: number, lean: number, bend: number, t: number) {
  const theta = lean + bend * t;
  if (Math.abs(bend) < 1e-4) return { y: length * t * Math.cos(lean), z: length * t * Math.sin(lean), theta };
  const k = length / bend;
  return { y: k * (Math.sin(theta) - Math.sin(lean)), z: k * (Math.cos(lean) - Math.cos(theta)), theta };
}

/** Multiply transforms left-to-right (first applied first). */
export function chain(...ms: Matrix[]) {
  return ms.reduce((a, b) => a.multiply(b));
}

/** A curved, tapered leaf/blade strip with a midrib, base at origin, growing up. */
export function blade(o: BladeOpts): VertexData {
  const n = o.segments ?? 6;
  const positions: number[] = [];
  const colors: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const fold = o.fold ?? 0.18;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const { y: py, z: pz, theta } = spine(o.length, o.lean ?? 0, o.bend, t);
    let w: number;
    switch (o.shape ?? 'taper') {
      case 'leaf': w = o.width * Math.pow(Math.sin(Math.PI * Math.min(t, 0.999)), 0.7) * (t < 0.02 ? 0.25 : 1); break;
      case 'round': w = o.width * Math.sqrt(Math.max(0, Math.sin(Math.PI * Math.min(0.12 + t * 0.88, 1)))); break;
      case 'strap': w = o.width * (t > 0.85 ? (1 - t) / 0.15 : 1); break;
      default: w = o.width * Math.pow(1 - t, 0.85) * (0.55 + 0.45 * Math.min(1, t * 5));
    }
    const s = Math.sin(theta), c = Math.cos(theta);
    // normal of the strip (width axis = x, spine dir = (0,c,s)) => (0,-s,c)
    const fy = -s * fold * w, fz = c * fold * w;
    positions.push(-w / 2, py, pz, 0, py + fy, pz + fz, w / 2, py, pz);
    const col = mix(o.base, o.tip, t);
    const mid = mix(col, Color3.White(), 0.12);
    colors.push(col.r, col.g, col.b, 1, mid.r, mid.g, mid.b, 1, col.r, col.g, col.b, 1);
    uvs.push(0, t, 0.5, t, 1, t);
  }
  for (let i = 0; i < n; i++) {
    const a = i * 3, b = (i + 1) * 3;
    indices.push(a, b, a + 1, a + 1, b, b + 1, a + 1, b + 1, a + 2, a + 2, b + 1, b + 2);
  }
  const vd = new VertexData();
  vd.positions = positions;
  vd.colors = colors;
  vd.uvs = uvs;
  vd.indices = indices;
  return vd;
}

/** Surface of revolution around Y from a [radius, y] profile (bottom -> top). */
export function lathe(profile: Array<[number, number]>, segments = 12, capTop = true, capBottom = false): VertexData {
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const rows = profile.length;
  for (let r = 0; r < rows; r++) {
    const [rad, y] = profile[r];
    for (let s = 0; s <= segments; s++) {
      const a = (s / segments) * Math.PI * 2;
      positions.push(Math.cos(a) * rad, y, Math.sin(a) * rad);
      uvs.push(s / segments, r / (rows - 1));
    }
  }
  const ring = segments + 1;
  for (let r = 0; r < rows - 1; r++)
    for (let s = 0; s < segments; s++) {
      const a = r * ring + s, b = a + ring;
      indices.push(a, a + 1, b, a + 1, b + 1, b);
    }
  const cap = (row: number, up: boolean) => {
    const [, y] = profile[row];
    const centre = positions.length / 3;
    positions.push(0, y, 0);
    uvs.push(0.5, up ? 1 : 0);
    for (let s = 0; s < segments; s++) {
      const a = row * ring + s;
      if (up) indices.push(centre, a + 1, a);
      else indices.push(centre, a, a + 1);
    }
  };
  if (capTop && profile[rows - 1][0] > 0) cap(rows - 1, true);
  if (capBottom && profile[0][0] > 0) cap(0, false);
  const vd = new VertexData();
  vd.positions = positions;
  vd.uvs = uvs;
  vd.indices = indices;
  return vd;
}

/** Organic lumpy blob (bushes, canopies, rocks). */
/** Merge vertices sharing a position so ComputeNormals produces smooth shading. */
export function weld(vd: VertexData): VertexData {
  const p = vd.positions as number[];
  const map = new Map<string, number>();
  const positions: number[] = [];
  const remap: number[] = [];
  for (let i = 0; i < p.length / 3; i++) {
    const key = `${Math.round(p[i * 3] * 1e4)},${Math.round(p[i * 3 + 1] * 1e4)},${Math.round(p[i * 3 + 2] * 1e4)}`;
    let idx = map.get(key);
    if (idx === undefined) {
      idx = positions.length / 3;
      map.set(key, idx);
      positions.push(p[i * 3], p[i * 3 + 1], p[i * 3 + 2]);
    }
    remap.push(idx);
  }
  const out = new VertexData();
  out.positions = positions;
  out.indices = Array.from(vd.indices!, (i) => remap[i]);
  out.uvs = positions.flatMap((_, i) => (i % 3 === 0 ? [0.5 + positions[i] * 0.5, 0.5 + positions[i + 2] * 0.5] : []));
  return out;
}

export function blob(radius: number, lumpiness: number, seed: number, subdivisions = 2, flatBottom = false): VertexData {
  const vd = weld(CreateIcoSphereVertexData({ radius: 1, subdivisions, flat: false }));
  const p = vd.positions as number[];
  const o = seed * 13.37;
  for (let i = 0; i < p.length; i += 3) {
    const x = p[i], y = p[i + 1], z = p[i + 2];
    const n = noise3(x * 1.7 + o, y * 1.7 + o, z * 1.7) - 0.5;
    let k = radius * (1 + n * 2 * lumpiness);
    p[i] = x * k;
    p[i + 1] = y * k;
    p[i + 2] = z * k;
    if (flatBottom && p[i + 1] < -radius * 0.35) p[i + 1] = -radius * 0.35 + (p[i + 1] + radius * 0.35) * 0.15;
  }
  return vd;
}
