import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial.js';
import { Color3 } from '@babylonjs/core/Maths/math.color.js';
import { Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import { CreateBox } from '@babylonjs/core/Meshes/Builders/boxBuilder.js';
import { CreateGround } from '@babylonjs/core/Meshes/Builders/groundBuilder.js';
import { Mesh } from '@babylonjs/core/Meshes/mesh.js';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData.js';
import { Scene } from '@babylonjs/core/scene.js';
import { ANIMALS, PEN } from '../config';
import type { Animal } from '../state/store';
import { Billboards } from './billboards';
import { mulberry } from './geometry';

/**
 * The fenced pen on the right of the farm block. Each owned animal is a
 * camera-facing picture that wanders inside; a bubble with its product floats
 * above it while one is ready to collect.
 */

const SIZE = { chicken: 1.1, cow: 1.75 };
/**
 * Poses on an animal sheet (see scripts/art.mjs): 0 standing, 1-2 walking, 3 pecking /
 * grazing, 4 seen from behind, 5 walking away three-quarters. All face right; mirrored for left.
 */
const POSE = { stand: 0, walk: [1, 2], eat: 3, back: 4, away: 5 };
/** Walk-cycle frames per second. */
const STEP_RATE = { chicken: 7, cow: 4 };
const SPEED = { chicken: 0.55, cow: 0.3 };
const BUBBLE = 0.55;

interface Walker {
  /** One mesh per pose (and mirror), made on first use; only `shown` is visible. */
  poses: Map<string, Mesh>;
  shown: Mesh | null;
  bubble: Mesh;
  /** What it does while standing still: look around or peck / graze. */
  idle: 'stand' | 'eat';
  type: Animal['type'];
  pos: Vector3;
  goal: Vector3;
  wait: number;
  phase: number;
  facing: 1 | -1;
}

function fence(scene: Scene) {
  const mat = new StandardMaterial('fence-mat', scene);
  mat.diffuseColor = Color3.FromHexString('#b07a45');
  mat.emissiveColor = Color3.FromHexString('#4a2f18');
  mat.specularColor = Color3.Black();
  const parts: Mesh[] = [];
  const { x0, x1, z0, z1 } = PEN;
  const post = (x: number, z: number) => {
    const p = CreateBox('post', { width: 0.12, depth: 0.12, height: 0.62 }, scene);
    p.position.set(x, 0.31, z);
    parts.push(p);
  };
  const rail = (ax: number, az: number, bx: number, bz: number, y: number) => {
    const len = Math.hypot(bx - ax, bz - az);
    const r = CreateBox('rail', { width: len, depth: 0.06, height: 0.08 }, scene);
    r.position.set((ax + bx) / 2, y, (az + bz) / 2);
    r.rotation.y = -Math.atan2(bz - az, bx - ax);
    parts.push(r);
  };
  const side = (ax: number, az: number, bx: number, bz: number) => {
    const n = Math.max(1, Math.round(Math.hypot(bx - ax, bz - az) / 1.2));
    for (let i = 0; i < n; i++) post(ax + ((bx - ax) * i) / n, az + ((bz - az) * i) / n);
    rail(ax, az, bx, bz, 0.25);
    rail(ax, az, bx, bz, 0.48);
  };
  side(x0, z0, x1, z0);
  side(x1, z0, x1, z1);
  side(x1, z1, x0, z1);
  side(x0, z1, x0, z0);
  const m = Mesh.MergeMeshes(parts, true)!;
  m.name = 'pen-fence';
  m.material = mat;
  m.isPickable = false;
  return m;
}

function floor(scene: Scene) {
  const w = PEN.x1 - PEN.x0, d = PEN.z1 - PEN.z0;
  const g = CreateGround('pen-floor', { width: w, height: d }, scene);
  g.position.set((PEN.x0 + PEN.x1) / 2, 0.004, (PEN.z0 + PEN.z1) / 2);
  const mat = new StandardMaterial('pen-floor-mat', scene);
  mat.disableLighting = true;
  mat.emissiveColor = Color3.FromHexString('#cfae63');
  mat.disableDepthWrite = true;
  g.material = mat;
  g.isPickable = false;
  // a few straw tufts
  const r = mulberry(77);
  const pos: number[] = [], idx: number[] = [];
  for (let i = 0; i < 70; i++) {
    const x = (r() - 0.5) * (w - 0.3), z = (r() - 0.5) * (d - 0.3), a = r() * Math.PI, l = 0.12 + r() * 0.12;
    const b = pos.length / 3;
    const dx = Math.cos(a) * l, dz = Math.sin(a) * l;
    pos.push(x - dx, 0.01, z - dz, x + dx, 0.01, z + dz, x + dx + 0.02, 0.01, z + dz + 0.03, x - dx + 0.02, 0.01, z - dz + 0.03);
    idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
  }
  const straw = new Mesh('pen-straw', scene);
  const vd = new VertexData();
  vd.positions = pos;
  vd.indices = idx;
  vd.applyToMesh(straw);
  straw.parent = g;
  const sm = new StandardMaterial('straw-mat', scene);
  sm.disableLighting = true;
  sm.emissiveColor = Color3.FromHexString('#b8973e');
  sm.backFaceCulling = false;
  straw.material = sm;
  straw.isPickable = false;
  return g;
}

export class AnimalPen {
  private walkers: Walker[] = [];
  private time = 0;
  private rand = mulberry(4242);

  constructor(scene: Scene, private boards: Billboards) {
    fence(scene);
    floor(scene);
  }

  private spot() {
    const m = 0.5;
    return new Vector3(PEN.x0 + m + this.rand() * (PEN.x1 - PEN.x0 - 2 * m), 0, PEN.z0 + m + this.rand() * (PEN.z1 - PEN.z0 - 2 * m));
  }

  /** Match the walkers to the owned animals (same order as the state). */
  sync(animals: Animal[], now: number) {
    const drop = (w: Walker) => [...w.poses.values(), w.bubble].forEach((m) => m.dispose());
    while (this.walkers.length > animals.length) drop(this.walkers.pop()!);
    animals.forEach((a, i) => {
      let w = this.walkers[i];
      if (w && w.type !== a.type) {
        drop(w);
        w = undefined as unknown as Walker;
      }
      if (!w) {
        const bubble = this.boards.quad(ANIMALS[a.type].product, BUBBLE, { onTop: true }).clone(`animal-bubble-${i}`);
        const pos = this.spot();
        w = { poses: new Map(), shown: null, idle: 'stand', bubble, type: a.type, pos, goal: pos.clone(), wait: this.rand() * 2, phase: this.rand() * 6, facing: 1 };
        this.walkers[i] = w;
      }
      const ready = now >= a.lastCollect + ANIMALS[a.type].period * 1000;
      w.bubble.isVisible = ready;
    });
  }

  /** Show pose `frame` (mirrored when facing left), hiding the previous one. */
  private show(w: Walker, frame: number) {
    const flip = w.facing === -1;
    const key = `${frame}:${flip ? 1 : 0}`;
    let mesh = w.poses.get(key);
    if (!mesh) {
      mesh = this.boards.quad(`${w.type}:${frame}`, SIZE[w.type], { bottom: true, flip }).clone(`animal-${w.type}-${key}`);
      w.poses.set(key, mesh);
    }
    if (w.shown !== mesh) {
      if (w.shown) w.shown.isVisible = false;
      mesh.isVisible = true;
      w.shown = mesh;
    }
    return mesh;
  }

  update(dt: number) {
    this.time += dt;
    for (const w of this.walkers) {
      const to = w.goal.subtract(w.pos);
      const d = to.length();
      let frame: number;
      if (d < 0.05) {
        w.wait -= dt;
        if (w.wait <= 0) {
          w.goal = this.spot();
          w.wait = 1 + this.rand() * 4;
          w.idle = this.rand() < 0.55 ? 'eat' : 'stand';
        }
        // pecking chickens bob their head down and up; grazing cows keep it down
        const peck = w.type === 'chicken' ? Math.sin(this.time * 5 + w.phase) > -0.2 : true;
        frame = w.idle === 'eat' && peck ? POSE.eat : POSE.stand;
      } else {
        const step = Math.min(d, SPEED[w.type] * dt);
        w.pos.addInPlace(to.scale(step / d));
        // screen-right is (+x, -z) and screen-up (away from the camera) is (+x, +z)
        const right = to.x - to.z, away = to.x + to.z;
        if (Math.abs(right) > 0.01) w.facing = right > 0 ? 1 : -1;
        if (away > 2.5 * Math.abs(right)) frame = POSE.back;
        else if (away > 0.8 * Math.abs(right)) frame = POSE.away;
        else frame = POSE.walk[Math.floor(this.time * STEP_RATE[w.type] + w.phase) % POSE.walk.length];
      }
      const walking = d >= 0.05;
      // back views have no walk cycle, so they waddle a little instead
      const hop = walking && (frame === POSE.back || frame === POSE.away) ? Math.abs(Math.sin(this.time * STEP_RATE[w.type] * 1.6 + w.phase)) * 0.04 : 0;
      this.show(w, frame).position.set(w.pos.x, hop, w.pos.z);
      if (w.bubble.isVisible) w.bubble.position.set(w.pos.x, SIZE[w.type] * 0.95 + 0.35 + Math.abs(Math.sin(this.time * 2.6 + w.phase)) * 0.14, w.pos.z);
    }
  }

  /** Ground position (for screen picking) of each animal, in state order. */
  positions() {
    return this.walkers.map((w) => ({ pos: w.pos, size: SIZE[w.type] }));
  }
}
