import { CROP_ORDER, CROPS, CropId, levelForTiles, levelReward, START_UNLOCKED, STARTING_COINS, STAGE_COUNT, tileCap, TILES_PER_PARCEL, unlockCost, xpToNext } from '../config';
import { serverNow } from '../net/clock';

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
  level: number;
  /** XP collected toward the next level. */
  xp: number;
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

/** Successful local actions, replayed to the server by game/net/sync.ts. */
export type GameAction =
  | { type: 'plant'; tiles: number[]; crop: CropId }
  | { type: 'harvest'; tiles: number[] }
  | { type: 'sell'; crop: CropId; qty: number }
  | { type: 'unlock' }
  | { type: 'reset' };

const SAVE_KEY = 'farm-empire:vs3';

function emptyInventory() {
  return Object.fromEntries(CROP_ORDER.map((c) => [c, 0])) as Record<CropId, number>;
}

function initialState(): GameState {
  return { coins: STARTING_COINS, level: 1, xp: 0, inventory: emptyInventory(), unlocked: START_UNLOCKED, plantings: {} };
}

function load(): GameState {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (raw) {
      const s = JSON.parse(raw) as GameState;
      // older saves lack newer crops' inventory slots and the level fields
      if (typeof s.unlocked === 'number' && s.plantings) return { ...s, level: s.level ?? levelForTiles(s.unlocked), xp: s.xp ?? 0, inventory: { ...emptyInventory(), ...s.inventory } };
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
  private actionListeners = new Set<(a: GameAction) => void>();
  /** What produced the current state: a player action, or a snapshot from the server. */
  lastChange: 'action' | 'hydrate' = 'action';
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

  /** Level needed to buy the next tile (<= current level when it is allowed now). */
  nextUnlockLevel() {
    return levelForTiles(this.state.unlocked + 1);
  }

  canUnlockByLevel() {
    return this.state.unlocked < tileCap(this.state.level);
  }

  /** Add XP, rolling over into as many level-ups as it pays for; each level-up grants coins. */
  private withXp(s: GameState, gain: number): GameState {
    let { level, xp, coins } = s;
    xp += gain;
    while (xp >= xpToNext(level)) {
      xp -= xpToNext(level);
      level++;
      coins += levelReward(level);
    }
    return { ...s, level, xp, coins };
  }

  onAction(fn: (a: GameAction) => void): () => void {
    this.actionListeners.add(fn);
    return () => void this.actionListeners.delete(fn);
  }

  /** Replace the whole state with the server's authoritative copy. */
  hydrate(next: GameState) {
    this.set({ ...next, inventory: { ...emptyInventory(), ...next.inventory }, plantings: { ...next.plantings } }, 'hydrate');
  }

  private emit(a: GameAction) {
    this.actionListeners.forEach((l) => l(a));
  }

  private set(next: GameState, change: 'action' | 'hydrate' = 'action') {
    this.lastChange = change;
    this.state = next;
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(next));
    } catch {
      /* storage unavailable: progress is session-only */
    }
    this.listeners.forEach((l) => l());
  }

  plant(g: number, crop: CropId, now = serverNow()): ActionResult {
    const def = CROPS[crop];
    if (g >= this.state.unlocked) return { ok: false, reason: 'Ô đất chưa mở khóa' };
    if (def.unlockLevel > this.state.level) return { ok: false, reason: `${def.name} mở ở cấp ${def.unlockLevel}` };
    if (this.state.plantings[g]) return { ok: false, reason: 'Ô đất đã có cây' };
    if (this.state.coins < def.seedPrice) return { ok: false, reason: 'Không đủ xu!' };
    this.set({ ...this.state, coins: this.state.coins - def.seedPrice, plantings: { ...this.state.plantings, [g]: { crop, plantedAt: now } } });
    this.emit({ type: 'plant', tiles: [g], crop });
    return { ok: true, value: undefined };
  }

  /** Sow one crop on every empty owned tile the wallet can pay for. Returns the tiles planted. */
  plantAll(crop: CropId, now = serverNow()): ActionResult<number[]> {
    const price = CROPS[crop].seedPrice;
    if (CROPS[crop].unlockLevel > this.state.level) return { ok: false, reason: `${CROPS[crop].name} mở ở cấp ${CROPS[crop].unlockLevel}` };
    const empty = [...Array(this.state.unlocked).keys()].filter((g) => !this.state.plantings[g]);
    if (!empty.length) return { ok: false, reason: 'Không còn ô đất trống' };
    const n = Math.min(empty.length, Math.floor(this.state.coins / price));
    if (n <= 0) return { ok: false, reason: 'Không đủ xu!' };
    const sown = empty.slice(0, n);
    const plantings = { ...this.state.plantings };
    sown.forEach((g, i) => (plantings[g] = { crop, plantedAt: now + i * 40 }));
    this.set({ ...this.state, coins: this.state.coins - n * price, plantings });
    this.emit({ type: 'plant', tiles: sown, crop });
    return { ok: true, value: sown };
  }

  harvest(g: number, now = serverNow()): ActionResult<{ crop: CropId; amount: number; xp: number; levelUp: number | null }> {
    const p = this.state.plantings[g];
    if (!p) return { ok: false, reason: 'Không có cây để thu hoạch' };
    if (growthProgress(p, now) < 1) return { ok: false, reason: 'Cây chưa chín' };
    const { yield: amount, xp } = CROPS[p.crop];
    const plantings = { ...this.state.plantings };
    delete plantings[g];
    const before = this.state.level;
    this.set(this.withXp({ ...this.state, inventory: { ...this.state.inventory, [p.crop]: this.state.inventory[p.crop] + amount }, plantings }, xp));
    this.emit({ type: 'harvest', tiles: [g] });
    return { ok: true, value: { crop: p.crop, amount, xp, levelUp: this.state.level > before ? this.state.level : null } };
  }

  sell(crop: CropId, qty: number): ActionResult<number> {
    const have = this.state.inventory[crop];
    const n = Math.min(qty, have);
    if (n <= 0) return { ok: false, reason: 'Kho không còn nông sản này' };
    const earned = n * CROPS[crop].sellPrice;
    this.set({ ...this.state, coins: this.state.coins + earned, inventory: { ...this.state.inventory, [crop]: have - n } });
    this.emit({ type: 'sell', crop, qty: n });
    return { ok: true, value: earned };
  }

  /** Buy the next tile in order. */
  unlockNext(): ActionResult<number> {
    const cost = this.nextUnlockCost();
    if (!this.canUnlockByLevel()) return { ok: false, reason: `Cần đạt cấp ${this.nextUnlockLevel()} để mở thêm đất` };
    if (this.state.coins < cost) return { ok: false, reason: 'Không đủ xu!' };
    const g = this.state.unlocked;
    this.set({ ...this.state, coins: this.state.coins - cost, unlocked: g + 1 });
    this.emit({ type: 'unlock' });
    return { ok: true, value: g };
  }

  reset() {
    this.set(initialState());
    this.emit({ type: 'reset' });
  }
}

export function growthProgress(p: { crop: CropId | null; plantedAt: number | null }, now = serverNow()): number {
  if (!p.crop || p.plantedAt == null) return 0;
  return Math.max(0, Math.min(1, (now - p.plantedAt) / (CROPS[p.crop].growSeconds * 1000)));
}

export function growthStage(p: { crop: CropId | null; plantedAt: number | null }, now = serverNow()): number {
  const k = growthProgress(p, now);
  if (k >= 1) return STAGE_COUNT - 1;
  return Math.min(STAGE_COUNT - 2, Math.floor(k * (STAGE_COUNT - 1)));
}

export function secondsLeft(p: { crop: CropId | null; plantedAt: number | null }, now = serverNow()): number {
  if (!p.crop || p.plantedAt == null) return 0;
  return Math.max(0, Math.ceil(CROPS[p.crop].growSeconds - (now - p.plantedAt) / 1000));
}

export const store = new Store();
