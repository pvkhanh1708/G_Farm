import { CROPS, CropId, START_UNLOCKED, STARTING_COINS, STAGE_COUNT, TILES_PER_PARCEL, unlockCost } from '../config';

/**
 * Pure game state + rules. No rendering here, so the same rules can later be
 * mirrored by the Laravel API (server becomes the authority, this becomes a cache).
 *
 * Tiles are numbered globally and unlocked strictly in order, so the save only
 * needs how many are unlocked plus what grows on each.
 */
export interface Planting {
  crop: CropId;
  plantedAt: number;
}

export interface GameState {
  coins: number;
  inventory: Record<CropId, number>;
  /** Tiles 0..unlocked-1 are owned. */
  unlocked: number;
  plantings: Record<number, Planting>;
}

/** View of one tile, derived from GameState. */
export interface TileState {
  g: number;
  parcel: number;
  unlocked: boolean;
  /** The single locked tile that can be bought next. */
  next: boolean;
  crop: CropId | null;
  plantedAt: number | null;
}

export type ActionResult<T = void> = { ok: true; value: T } | { ok: false; reason: string };

const SAVE_KEY = 'farm-empire:vs3';

function initialState(): GameState {
  return { coins: STARTING_COINS, inventory: { carrot: 0, wheat: 0, tomato: 0 }, unlocked: START_UNLOCKED, plantings: {} };
}

function load(): GameState {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (raw) {
      const s = JSON.parse(raw) as GameState;
      if (typeof s.unlocked === 'number' && s.plantings) return s;
    }
  } catch {
    /* corrupted save: start fresh */
  }
  return initialState();
}

type Listener = () => void;

class Store {
  private state: GameState = load();
  private listeners = new Set<Listener>();
  private tilesCache: { state: GameState | null; tiles: TileState[] } = { state: null, tiles: [] };

  getState = (): GameState => this.state;

  subscribe = (fn: Listener): (() => void) => {
    this.listeners.add(fn);
    return () => void this.listeners.delete(fn);
  };

  /** Parcels with tiles on show: all touched ones plus the one being filled. */
  parcelCount() {
    return Math.floor(this.state.unlocked / TILES_PER_PARCEL) + 1;
  }

  tiles(): TileState[] {
    if (this.tilesCache.state === this.state) return this.tilesCache.tiles;
    const s = this.state;
    const tiles: TileState[] = [];
    for (let g = 0; g < this.parcelCount() * TILES_PER_PARCEL; g++) {
      const p = s.plantings[g];
      tiles.push({ g, parcel: Math.floor(g / TILES_PER_PARCEL), unlocked: g < s.unlocked, next: g === s.unlocked, crop: p?.crop ?? null, plantedAt: p?.plantedAt ?? null });
    }
    this.tilesCache = { state: s, tiles };
    return tiles;
  }

  tile(g: number): TileState | undefined {
    return this.tiles()[g];
  }

  nextUnlockCost() {
    return unlockCost(this.state.unlocked);
  }

  private set(next: GameState) {
    this.state = next;
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(next));
    } catch {
      /* storage unavailable: progress is session-only */
    }
    this.listeners.forEach((l) => l());
  }

  plant(g: number, crop: CropId, now = Date.now()): ActionResult {
    const def = CROPS[crop];
    if (g >= this.state.unlocked) return { ok: false, reason: 'Ô đất chưa mở khóa' };
    if (this.state.plantings[g]) return { ok: false, reason: 'Ô đất đã có cây' };
    if (this.state.coins < def.seedPrice) return { ok: false, reason: 'Không đủ xu!' };
    this.set({ ...this.state, coins: this.state.coins - def.seedPrice, plantings: { ...this.state.plantings, [g]: { crop, plantedAt: now } } });
    return { ok: true, value: undefined };
  }

  /** Sow one crop on every empty owned tile the wallet can pay for. Returns the tiles planted. */
  plantAll(crop: CropId, now = Date.now()): ActionResult<number[]> {
    const price = CROPS[crop].seedPrice;
    const empty = [...Array(this.state.unlocked).keys()].filter((g) => !this.state.plantings[g]);
    if (!empty.length) return { ok: false, reason: 'Không còn ô đất trống' };
    const n = Math.min(empty.length, Math.floor(this.state.coins / price));
    if (n <= 0) return { ok: false, reason: 'Không đủ xu!' };
    const sown = empty.slice(0, n);
    const plantings = { ...this.state.plantings };
    sown.forEach((g, i) => (plantings[g] = { crop, plantedAt: now + i * 40 }));
    this.set({ ...this.state, coins: this.state.coins - n * price, plantings });
    return { ok: true, value: sown };
  }

  harvest(g: number, now = Date.now()): ActionResult<{ crop: CropId; amount: number }> {
    const p = this.state.plantings[g];
    if (!p) return { ok: false, reason: 'Không có cây để thu hoạch' };
    if (growthProgress(p, now) < 1) return { ok: false, reason: 'Cây chưa chín' };
    const amount = CROPS[p.crop].yield;
    const plantings = { ...this.state.plantings };
    delete plantings[g];
    this.set({ ...this.state, inventory: { ...this.state.inventory, [p.crop]: this.state.inventory[p.crop] + amount }, plantings });
    return { ok: true, value: { crop: p.crop, amount } };
  }

  sell(crop: CropId, qty: number): ActionResult<number> {
    const have = this.state.inventory[crop];
    const n = Math.min(qty, have);
    if (n <= 0) return { ok: false, reason: 'Kho không còn nông sản này' };
    const earned = n * CROPS[crop].sellPrice;
    this.set({ ...this.state, coins: this.state.coins + earned, inventory: { ...this.state.inventory, [crop]: have - n } });
    return { ok: true, value: earned };
  }

  /** Buy the next tile in order. */
  unlockNext(): ActionResult<number> {
    const cost = this.nextUnlockCost();
    if (this.state.coins < cost) return { ok: false, reason: 'Không đủ xu!' };
    const g = this.state.unlocked;
    this.set({ ...this.state, coins: this.state.coins - cost, unlocked: g + 1 });
    return { ok: true, value: g };
  }

  reset() {
    this.set(initialState());
  }
}

export function growthProgress(p: { crop: CropId | null; plantedAt: number | null }, now = Date.now()): number {
  if (!p.crop || p.plantedAt == null) return 0;
  return Math.max(0, Math.min(1, (now - p.plantedAt) / (CROPS[p.crop].growSeconds * 1000)));
}

export function growthStage(p: { crop: CropId | null; plantedAt: number | null }, now = Date.now()): number {
  const k = growthProgress(p, now);
  if (k >= 1) return STAGE_COUNT - 1;
  return Math.min(STAGE_COUNT - 2, Math.floor(k * (STAGE_COUNT - 1)));
}

export function secondsLeft(p: { crop: CropId | null; plantedAt: number | null }, now = Date.now()): number {
  if (!p.crop || p.plantedAt == null) return 0;
  return Math.max(0, Math.ceil(CROPS[p.crop].growSeconds - (now - p.plantedAt) / 1000));
}

export const store = new Store();
