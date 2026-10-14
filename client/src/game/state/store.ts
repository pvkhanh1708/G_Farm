import { CROPS, CropId, START_TILES, STARTING_COINS, STAGE_COUNT, tileId, unlockCost } from '../config';

/**
 * Pure game state + rules. No rendering here, so the same rules can later be
 * mirrored by the Laravel API (server becomes the authority, this becomes a cache).
 *
 * The farm is unbounded: only owned plots are stored; the ring of purchasable
 * tiles around them (the frontier) is derived.
 */
export interface PlotState {
  id: string;
  col: number;
  row: number;
  unlocked: boolean;
  crop: CropId | null;
  plantedAt: number | null;
}

export interface GameState {
  coins: number;
  inventory: Record<CropId, number>;
  /** Owned (unlocked) plots only. */
  plots: PlotState[];
}

export type ActionResult<T = void> = { ok: true; value: T } | { ok: false; reason: string };

const SAVE_KEY = 'farm-empire:vs2';
const LEGACY_KEY = 'farm-empire:vs1';

const makePlot = (col: number, row: number, unlocked = true): PlotState => ({ id: tileId(col, row), col, row, unlocked, crop: null, plantedAt: null });

function initialState(): GameState {
  return {
    coins: STARTING_COINS,
    inventory: { carrot: 0, wheat: 0, tomato: 0 },
    plots: START_TILES.map(([c, r]) => makePlot(c, r)),
  };
}

/** The first prototype stored a fixed 3x3 array indexed 0..8. */
function migrateLegacy(raw: string): GameState | null {
  const old = JSON.parse(raw) as { coins: number; inventory: GameState['inventory']; plots: Array<{ index: number; unlocked: boolean; crop: CropId | null; plantedAt: number | null }> };
  if (!Array.isArray(old.plots)) return null;
  const plots = old.plots
    .filter((p) => p.unlocked)
    .map((p) => ({ ...makePlot((p.index % 3) - 1, Math.floor(p.index / 3) - 1), crop: p.crop, plantedAt: p.plantedAt }));
  return { coins: old.coins, inventory: old.inventory, plots };
}

function load(): GameState {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as GameState;
      if (Array.isArray(parsed.plots) && parsed.plots.length) return parsed;
    }
    const legacy = localStorage.getItem(LEGACY_KEY);
    if (legacy) return migrateLegacy(legacy) ?? initialState();
  } catch {
    /* corrupted save: start fresh */
  }
  return initialState();
}

type Listener = () => void;

/** Tiles that can never become plots (buildings, pond, paths); supplied by the world layout. */
export type TileBlocker = (col: number, row: number) => boolean;

const NEIGHBOURS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

class Store {
  private state: GameState = load();
  private listeners = new Set<Listener>();
  private blocked: TileBlocker = () => false;
  private frontierCache: { state: GameState | null; tiles: PlotState[] } = { state: null, tiles: [] };

  getState = (): GameState => this.state;

  subscribe = (fn: Listener): (() => void) => {
    this.listeners.add(fn);
    return () => void this.listeners.delete(fn);
  };

  setBlocker(fn: TileBlocker) {
    this.blocked = fn;
    this.frontierCache.state = null;
  }

  /** Locked tiles adjacent to owned plots, i.e. what the player can buy next. */
  frontier(): PlotState[] {
    if (this.frontierCache.state === this.state) return this.frontierCache.tiles;
    const owned = new Set(this.state.plots.map((p) => p.id));
    const out = new Map<string, PlotState>();
    for (const p of this.state.plots)
      for (const [dc, dr] of NEIGHBOURS) {
        const c = p.col + dc, r = p.row + dr, id = tileId(c, r);
        if (owned.has(id) || out.has(id) || this.blocked(c, r)) continue;
        out.set(id, makePlot(c, r, false));
      }
    const tiles = [...out.values()];
    this.frontierCache = { state: this.state, tiles };
    return tiles;
  }

  /** Owned plots + frontier: everything the world should show as farmland. */
  tiles(): PlotState[] {
    return [...this.state.plots, ...this.frontier()];
  }

  plot(id: string): PlotState | undefined {
    return this.state.plots.find((p) => p.id === id) ?? this.frontier().find((p) => p.id === id);
  }

  nextUnlockCost() {
    return unlockCost(this.state.plots.length);
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

  private updatePlot(id: string, patch: Partial<PlotState>) {
    return this.state.plots.map((p) => (p.id === id ? { ...p, ...patch } : p));
  }

  plant(id: string, crop: CropId, now = Date.now()): ActionResult {
    const plot = this.state.plots.find((p) => p.id === id);
    const def = CROPS[crop];
    if (!plot) return { ok: false, reason: 'Ô đất chưa mở khóa' };
    if (plot.crop) return { ok: false, reason: 'Ô đất đã có cây' };
    if (this.state.coins < def.seedPrice) return { ok: false, reason: 'Không đủ xu!' };
    this.set({ ...this.state, coins: this.state.coins - def.seedPrice, plots: this.updatePlot(id, { crop, plantedAt: now }) });
    return { ok: true, value: undefined };
  }

  harvest(id: string, now = Date.now()): ActionResult<{ crop: CropId; amount: number }> {
    const plot = this.state.plots.find((p) => p.id === id);
    if (!plot?.crop || plot.plantedAt == null) return { ok: false, reason: 'Không có cây để thu hoạch' };
    if (growthProgress(plot, now) < 1) return { ok: false, reason: 'Cây chưa chín' };
    const crop = plot.crop;
    const amount = CROPS[crop].yield;
    this.set({
      ...this.state,
      inventory: { ...this.state.inventory, [crop]: this.state.inventory[crop] + amount },
      plots: this.updatePlot(id, { crop: null, plantedAt: null }),
    });
    return { ok: true, value: { crop, amount } };
  }

  sell(crop: CropId, qty: number): ActionResult<number> {
    const have = this.state.inventory[crop];
    const n = Math.min(qty, have);
    if (n <= 0) return { ok: false, reason: 'Kho không còn nông sản này' };
    const earned = n * CROPS[crop].sellPrice;
    this.set({ ...this.state, coins: this.state.coins + earned, inventory: { ...this.state.inventory, [crop]: have - n } });
    return { ok: true, value: earned };
  }

  unlock(id: string): ActionResult {
    const tile = this.frontier().find((p) => p.id === id);
    if (!tile) return { ok: false, reason: 'Chỉ mở được ô sát đất đã có' };
    const cost = this.nextUnlockCost();
    if (this.state.coins < cost) return { ok: false, reason: 'Không đủ xu!' };
    this.set({ ...this.state, coins: this.state.coins - cost, plots: [...this.state.plots, makePlot(tile.col, tile.row)] });
    return { ok: true, value: undefined };
  }

  reset() {
    this.set(initialState());
  }
}

export function growthProgress(plot: PlotState, now = Date.now()): number {
  if (!plot.crop || plot.plantedAt == null) return 0;
  return Math.min(1, (now - plot.plantedAt) / (CROPS[plot.crop].growSeconds * 1000));
}

export function growthStage(plot: PlotState, now = Date.now()): number {
  const p = growthProgress(plot, now);
  if (p >= 1) return STAGE_COUNT - 1;
  return Math.min(STAGE_COUNT - 2, Math.floor(p * (STAGE_COUNT - 1)));
}

export function secondsLeft(plot: PlotState, now = Date.now()): number {
  if (!plot.crop || plot.plantedAt == null) return 0;
  return Math.max(0, Math.ceil(CROPS[plot.crop].growSeconds - (now - plot.plantedAt) / 1000));
}

export const store = new Store();
