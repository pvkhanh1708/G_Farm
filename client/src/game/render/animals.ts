import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial.js';
import { DynamicTexture } from '@babylonjs/core/Materials/Textures/dynamicTexture.js';
import { Texture } from '@babylonjs/core/Materials/Textures/texture.js';
import { Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import { CreateGround } from '@babylonjs/core/Meshes/Builders/groundBuilder.js';
import { Mesh } from '@babylonjs/core/Meshes/mesh.js';
import { Scene } from '@babylonjs/core/scene.js';
import { AnimalId, ANIMALS, ECONOMY, PENS } from '../config';

const WATER_MS = ECONOMY.water.minutes * 60_000;
import type { Animal } from '../state/store';
import { BillboardKey, Billboards } from './billboards';
import { mulberry } from './geometry';
import { artUrl, loadImage } from '../art';

/**
 * Pens (open ground, no fence) on the right of the farm block, one for chickens and one for cows.
 * Each owned animal is a camera-facing picture that wanders inside its own pen. Products wait at a
 * fixed spot of the pen (egg nest, milk can) until collected.
 */

const SIZE = { chicken: 1.1, cow: 1.75 };
/**
 * Poses on an animal sheet (6 x 2, see scripts/art.mjs), facing right (mirrored for left):
 * 0 standing, 1 happy, 2-5 walk cycle, 6 pecking / grazing, 7 calling (cluck, moo),
 * 8 three-quarters toward the viewer, 9 from behind. 10-11 are not used.
 */
const POSE = { stand: 0, happy: 1, walk: [2, 3, 4, 5], eat: 6, call: 7, front: 8, back: 9 };
type Idle = 'stand' | 'happy' | 'eat' | 'call';
/** Walk-cycle frames per second. */
const STEP_RATE = { chicken: 7, cow: 4 };
const SPEED = { chicken: 0.55, cow: 0.3 };
const BUBBLE = 0.55;

interface Walker {
  /** One mesh per pose (and mirror), made on first use; only `shown` is visible. */
  poses: Map<string, Mesh>;
  shown: Mesh | null;
  /** A feed bowl floating above the animal while it is hungry. */
  hungry: Mesh;
  /** What it does while standing still. */
  idle: Idle;
  type: Animal['type'];
  pos: Vector3;
  goal: Vector3;
  wait: number;
  phase: number;
  facing: 1 | -1;
}

type Rect = { x0: number; x1: number; z0: number; z1: number };

/** The floor reaches this far past the fence, fading into the meadow. */
const FLOOR_BLEED = 0.45;
/** Texture pixels per world unit. */
const FLOOR_PPU = 96;

type Ctx = CanvasRenderingContext2D;

function blotches(c: Ctx, r: () => number, W: number, H: number, n: number, colours: string[], min: number, max: number) {
  for (let i = 0; i < n; i++) {
    c.fillStyle = colours[Math.floor(r() * colours.length)];
    c.beginPath();
    c.ellipse(r() * W, r() * H, min + r() * (max - min), (min + r() * (max - min)) * (0.5 + r() * 0.5), r() * Math.PI, 0, Math.PI * 2);
    c.fill();
  }
}

function strands(c: Ctx, r: () => number, W: number, H: number, n: number, colours: string[], len: number, width: number) {
  c.lineCap = 'round';
  for (let i = 0; i < n; i++) {
    const x = r() * W, y = r() * H, a = r() * Math.PI, l = len * (0.5 + r());
    const bend = (r() - 0.5) * l * 0.6;
    c.strokeStyle = colours[Math.floor(r() * colours.length)];
    c.lineWidth = width * (0.6 + r() * 0.8);
    c.beginPath();
    c.moveTo(x - Math.cos(a) * l, y - Math.sin(a) * l);
    c.quadraticCurveTo(x - Math.sin(a) * bend, y + Math.cos(a) * bend, x + Math.cos(a) * l, y + Math.sin(a) * l);
    c.stroke();
  }
}

/** Chicken run: packed earth strewn with straw, grain and a few pebbles. */
function paintCoopFloor(c: Ctx, r: () => number, W: number, H: number) {
  c.fillStyle = '#c9a466';
  c.fillRect(0, 0, W, H);
  blotches(c, r, W, H, 90, ['rgba(160,118,62,.35)', 'rgba(226,196,130,.4)', 'rgba(140,100,52,.25)'], 14, 60);
  strands(c, r, W, H, 520, ['#f0d27a', '#e2bb55', '#d1a544', '#fbe7a6'], 9, 2.4);
  blotches(c, r, W, H, 60, ['#8f8578', '#a89f92', '#7a6f62'], 2, 5);
  // scattered grain
  blotches(c, r, W, H, 140, ['#f6d55c', '#e8b93a'], 1.2, 2.4);
}

/** Cow pen: trampled grass with bare earth along the walking tracks and a muddy puddle. */
function paintPastureFloor(c: Ctx, r: () => number, W: number, H: number) {
  c.fillStyle = '#93b850';
  c.fillRect(0, 0, W, H);
  blotches(c, r, W, H, 70, ['rgba(120,160,60,.5)', 'rgba(170,200,90,.45)', 'rgba(110,140,50,.35)'], 20, 70);
  blotches(c, r, W, H, 16, ['rgba(176,140,86,.45)', 'rgba(160,124,74,.35)'], 16, 40);
  strands(c, r, W, H, 700, ['#6f9a36', '#a6cc5c', '#7fae3e', '#c3df7a'], 6, 2);
  // muddy puddle with a bright rim of wet earth
  const px = W * 0.3, py = H * 0.68;
  c.fillStyle = '#a8865a';
  c.beginPath();
  c.ellipse(px, py, W * 0.11, H * 0.065, -0.3, 0, Math.PI * 2);
  c.fill();
  c.fillStyle = '#8c7458';
  c.beginPath();
  c.ellipse(px, py, W * 0.085, H * 0.047, -0.3, 0, Math.PI * 2);
  c.fill();
  // a film of water reflecting the sky
  c.fillStyle = 'rgba(170,205,235,.55)';
  c.beginPath();
  c.ellipse(px - W * 0.01, py - H * 0.006, W * 0.06, H * 0.03, -0.3, 0, Math.PI * 2);
  c.fill();
  c.fillStyle = 'rgba(255,255,255,.6)';
  c.beginPath();
  c.ellipse(px - W * 0.03, py - H * 0.015, W * 0.025, H * 0.007, -0.3, 0, Math.PI * 2);
  c.fill();
  blotches(c, r, W, H, 40, ['#8f8578', '#a89f92'], 2, 5);
}

/**
 * Pen floor painted on a canvas: its own texture per pen, slightly larger than the fence,
 * with a ragged edge that fades into the meadow instead of a hard rectangle.
 */
function floor(scene: Scene, id: AnimalId, pen: Rect) {
  const w = pen.x1 - pen.x0 + FLOOR_BLEED * 2, d = pen.z1 - pen.z0 + FLOOR_BLEED * 2;
  const W = Math.round(w * FLOOR_PPU), H = Math.round(d * FLOOR_PPU);
  const tex = new DynamicTexture(`pen-floor-tex-${id}`, { width: W, height: H }, scene, true);
  tex.hasAlpha = true;
  tex.wrapU = tex.wrapV = Texture.CLAMP_ADDRESSMODE;
  const c = tex.getContext() as unknown as Ctx;
  const r = mulberry(id === 'cow' ? 78 : 77);
  (id === 'cow' ? paintPastureFloor : paintCoopFloor)(c, r, W, H);
  // ragged, soft edge: opaque inside the pen, fading out over the bleed margin
  const fadeEdge = () => {
    const img = c.getImageData(0, 0, W, H);
    const fade = FLOOR_BLEED * FLOOR_PPU;
    const wobble = (t: number, seed: number) => Math.sin(t * 0.045 + seed) * 6 + Math.sin(t * 0.13 + seed * 2) * 3;
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const edge = Math.min(x + wobble(y, 1), W - x + wobble(y, 4), y + wobble(x, 7), H - y + wobble(x, 9));
        const k = Math.max(0, Math.min(1, (edge - fade * 0.25) / (fade * 0.75)));
        img.data[(y * W + x) * 4 + 3] = Math.round(255 * k * k * (3 - 2 * k));
      }
    c.putImageData(img, 0, 0);
    tex.update(true);
  };
  fadeEdge();
  // the hand-drawn ground (assets/sprites/ground/pen-<id>.png) replaces the painted one, tiled at ~4 units
  const url = artUrl(`ground/pen-${id}.png`);
  if (url)
    void loadImage(url).then((img) => {
      if (!img) return;
      const tile = 4 * FLOOR_PPU;
      for (let y = 0; y < H; y += tile) for (let x = 0; x < W; x += tile) c.drawImage(img, x, y, tile, tile);
      fadeEdge();
    });
  const g = CreateGround(`pen-floor-${id}`, { width: w, height: d }, scene);
  g.position.set((pen.x0 + pen.x1) / 2, 0.004, (pen.z0 + pen.z1) / 2);
  const mat = new StandardMaterial(`pen-floor-mat-${id}`, scene);
  mat.diffuseTexture = tex;
  mat.emissiveTexture = tex;
  mat.useAlphaFromDiffuseTexture = true;
  mat.disableLighting = true;
  mat.emissiveColor.set(1, 1, 1);
  mat.disableDepthWrite = true;
  g.material = mat;
  g.isPickable = false;
  return g;
}

/**
 * Furniture in each pen: [kind, size, x, z] with x/z as fractions of the pen (0 = x0/z0; the
 * far corner (x1, z1) is the top of the screen). The feeder and the water show full or empty.
 */
type PropKind = 'coop' | 'hay' | 'feeder' | 'water' | 'product';
const PROPS: Record<AnimalId, Array<[PropKind, number, number, number]>> = {
  // the product spot (egg nest, milk can) only shows while something is ready to collect
  // coop in the far corner with the nest at its door; feeder and water side by side along the right fence
  chicken: [['coop', 2.1, 0.74, 0.82], ['product', 0.75, 0.4, 0.8], ['feeder', 1.1, 0.84, 0.42], ['water', 0.8, 0.84, 0.2]],
  // hay stacked in the far corner, the milk can beside it; feeder and water along the right fence
  cow: [['hay', 1.15, 0.8, 0.9], ['hay', 0.95, 0.55, 0.92], ['product', 0.8, 0.3, 0.88], ['feeder', 1.6, 0.82, 0.58], ['water', 1.6, 0.82, 0.3]],
};
const PRODUCT_KEY: Record<AnimalId, BillboardKey> = { chicken: 'egg-nest', cow: 'milk-can' };
const PROP_KEY = (type: AnimalId, kind: PropKind, full: boolean): BillboardKey =>
  kind === 'coop' || kind === 'hay' ? kind : kind === 'product' ? PRODUCT_KEY[type] : (`${type}-${kind}${full ? '' : '-empty'}` as BillboardKey);

/** A feeder, water trough or product spot the player can tap. */
export interface Station {
  type: AnimalId;
  kind: 'feeder' | 'water' | 'product';
  at: Vector3;
  size: number;
}

export class AnimalPen {
  private walkers: Walker[] = [];
  private time = 0;
  private rand = mulberry(4242);

  constructor(scene: Scene, private boards: Billboards) {
    for (const id of Object.keys(PENS) as AnimalId[]) {
      const pen = PENS[id];
      floor(scene, id, pen);
      PROPS[id].forEach(([kind, size, fx, fz], n) => {
        const at = new Vector3(pen.x0 + fx * (pen.x1 - pen.x0), 0, pen.z0 + fz * (pen.z1 - pen.z0));
        const make = (full: boolean) => {
          const m = boards.quad(PROP_KEY(id, kind, full), size, { bottom: true }).clone(`pen-${id}-${kind}-${n}-${full}`);
          m.position.copyFrom(at);
          m.isVisible = full;
          return m;
        };
        const full = make(true);
        if (kind === 'feeder' || kind === 'water') {
          this.stations.push({ type: id, kind, at, size, full, empty: make(false) });
        } else if (kind === 'product') {
          // nothing to show while empty
          const bubble = boards.quad(ANIMALS[id].product, BUBBLE, { onTop: true }).clone(`pen-${id}-product-bubble`);
          bubble.position.set(at.x, size + 0.3, at.z);
          this.stations.push({ type: id, kind, at, size, full, empty: bubble });
        }
        this.obstacles.push({ type: id, at, radius: size * 0.42 });
      });
    }
  }

  /** Footprints of the props, kept clear when animals pick where to walk. */
  private obstacles: Array<{ type: AnimalId; at: Vector3; radius: number }> = [];
  private stations: Array<Station & { full: Mesh; empty: Mesh }> = [];

  /** Feeders, water troughs and the products waiting to be collected, for picking taps. */
  get pickable(): Station[] {
    return this.stations.filter((s) => s.kind !== 'product' || s.full.isVisible);
  }

  /** Feeder full while any animal of the pen has eaten; water full until it runs dry. */
  private showStations(animals: Animal[], water: Partial<Record<AnimalId, number>>, now: number) {
    for (const s of this.stations) {
      if (s.kind === 'product') {
        // the nest / can appears with a bubble above it while any animal of the pen has a product
        const ready = animals.some((a) => a.type === s.type && a.fedAt !== null && now >= a.fedAt + ANIMALS[a.type].period * 1000);
        s.full.isVisible = ready;
        s.empty.isVisible = ready;
        continue;
      }
      const full = s.kind === 'water' ? (water[s.type] ?? 0) + WATER_MS > now : animals.some((a) => a.type === s.type && a.fedAt !== null);
      s.full.isVisible = full;
      s.empty.isVisible = !full;
    }
  }

  /** A random point inside the pen of this kind of animal, off the props. */
  private spot(type: AnimalId) {
    const p = PENS[type], m = 0.5;
    let v = new Vector3();
    for (let tries = 0; tries < 12; tries++) {
      v = new Vector3(p.x0 + m + this.rand() * (p.x1 - p.x0 - 2 * m), 0, p.z0 + m + this.rand() * (p.z1 - p.z0 - 2 * m));
      if (!this.obstacles.some((o) => o.type === type && Vector3.Distance(o.at, v) < o.radius + 0.3)) break;
    }
    return v;
  }

  /** Match the walkers to the owned animals (same order as the state). */
  sync(animals: Animal[], water: Partial<Record<AnimalId, number>>, now: number) {
    this.showStations(animals, water, now);
    const drop = (w: Walker) => [...w.poses.values(), w.hungry].forEach((m) => m.dispose());
    while (this.walkers.length > animals.length) drop(this.walkers.pop()!);
    animals.forEach((a, i) => {
      let w = this.walkers[i];
      if (w && w.type !== a.type) {
        drop(w);
        w = undefined as unknown as Walker;
      }
      if (!w) {
        const hungry = this.boards.quad('hungry', BUBBLE, { onTop: true }).clone(`animal-hungry-${i}`);
        const pos = this.spot(a.type);
        w = { poses: new Map(), shown: null, idle: 'stand', hungry, type: a.type, pos, goal: pos.clone(), wait: this.rand() * 2, phase: this.rand() * 6, facing: 1 };
        this.walkers[i] = w;
      }
      w.hungry.isVisible = a.fedAt === null;
    });
  }

  /** The dog house appears once the farm has a guard dog. */
  setDog(on: boolean) {
    if (on && !this.dogHouse) {
      this.dogHouse = this.boards.quad('doghouse', 1.15, { bottom: true }).clone('dog-house');
      this.dogHouse.isVisible = true;
      // just outside the fence, between the two pens
      this.dogHouse.position.set(PENS.chicken.x1 + 0.75, 0, (PENS.chicken.z0 + PENS.cow.z1) / 2);
    }
    if (this.dogHouse) this.dogHouse.setEnabled(on);
  }

  private dogHouse: Mesh | null = null;

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
          w.goal = this.spot(w.type);
          w.wait = 1 + this.rand() * 4;
          const r = this.rand();
          w.idle = r < 0.45 ? 'eat' : r < 0.7 ? 'stand' : r < 0.85 ? 'happy' : 'call';
        }
        // pecking chickens bob their head down and up; grazing cows keep it down;
        // a happy or calling animal does it in short bursts
        const t = this.time + w.phase;
        if (w.idle === 'eat') frame = w.type === 'cow' || Math.sin(t * 5) > -0.2 ? POSE.eat : POSE.stand;
        else if (w.idle === 'stand') frame = POSE.stand;
        else frame = Math.sin(t * 2.2) > 0 ? POSE[w.idle] : POSE.stand;
      } else {
        const step = Math.min(d, SPEED[w.type] * dt);
        w.pos.addInPlace(to.scale(step / d));
        // screen-right is (+x, -z) and screen-up (away from the camera) is (+x, +z)
        const right = to.x - to.z, away = to.x + to.z;
        if (Math.abs(right) > 0.01) w.facing = right > 0 ? 1 : -1;
        if (away > 1.5 * Math.abs(right)) frame = POSE.back;
        else if (-away > 1.5 * Math.abs(right)) frame = POSE.front;
        else frame = POSE.walk[Math.floor(this.time * STEP_RATE[w.type] + w.phase) % POSE.walk.length];
      }
      const walking = d >= 0.05;
      // front and back views have no walk cycle, so they waddle a little instead
      const hop = walking && (frame === POSE.back || frame === POSE.front) ? Math.abs(Math.sin(this.time * STEP_RATE[w.type] * 1.6 + w.phase)) * 0.04 : 0;
      this.show(w, frame).position.set(w.pos.x, hop, w.pos.z);
      if (w.hungry.isVisible) w.hungry.position.set(w.pos.x, SIZE[w.type] * 0.95 + 0.35 + Math.abs(Math.sin(this.time * 2.6 + w.phase)) * 0.14, w.pos.z);
    }
  }

  /** Ground position (for screen picking) of each animal, in state order. */
  positions() {
    return this.walkers.map((w) => ({ pos: w.pos, size: SIZE[w.type] }));
  }
}
