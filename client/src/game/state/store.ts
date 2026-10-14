import { CROPS, CropId, STARTING_COINS, UNLOCK_COSTS, STAGE_COUNT } from '../config';

/**
 * Pure game state + rules. No rendering here, so the same rules can later be
 * mirrored by the Laravel API (server becomes the authority, this becomes a cache).
 */
export interface PlotState {
  index: number;
  unlocked: boolean;
  crop: CropId | null;
  plantedAt: number | null;
}

export interface GameState {
  coins: number;
  inventory: Record<CropId, number>;
  plots: PlotState[];
}

export type ActionResult<T = void> = { ok: true; value: T } | { ok: false; reason: string };

const SAVE_KEY = 'farm-empire:vs1';

function initialState(): GameState {
  return {
    coins: STARTING_COINS,
    inventory: { carrot: 0, wheat: 0, tomato: 0 },
    plots: UNLOCK_COSTS.map((cost, index) => ({ index, unlocked: cost === 0, crop: null, plantedAt: null })),
  };
}

function load(): GameState {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return initialState();
    const parsed = JSON.parse(raw) as GameState;
    if (!Array.isArray(parsed.plots) || parsed.plots.length !== UNLOCK_COSTS.length) return initialState();
    return parsed;
  } catch {
    return initialState();
  }
}

type Listener = () => void;

class Store {
  private state: GameState = load();
  private listeners = new Set<Listener>();

  getState = (): GameState => this.state;

  subscribe = (fn: Listener): (() => void) => {
    this.listeners.add(fn);
    return () => void this.listeners.delete(fn);
  };

  private set(next: GameState) {
    this.state = next;
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(next));
    } catch {
      /* storage unavailable: progress is session-only */
    }
    this.listeners.forEach((l) => l());
  }

  private updatePlot(index: number, patch: Partial<PlotState>) {
    const plots = this.state.plots.map((p) => (p.index === index ? { ...p, ...patch } : p));
    return plots;
  }

  plant(index: number, crop: CropId, now = Date.now()): ActionResult {
    const plot = this.state.plots[index];
    const def = CROPS[crop];
    if (!plot?.unlocked) return { ok: false, reason: 'Ô đất chưa mở khóa' };
    if (plot.crop) return { ok: false, reason: 'Ô đất đã có cây' };
    if (this.state.coins < def.seedPrice) return { ok: false, reason: 'Không đủ xu!' };
    this.set({
      ...this.state,
      coins: this.state.coins - def.seedPrice,
      plots: this.updatePlot(index, { crop, plantedAt: now }),
    });
    return { ok: true, value: undefined };
  }

  harvest(index: number, now = Date.now()): ActionResult<{ crop: CropId; amount: number }> {
    const plot = this.state.plots[index];
    if (!plot?.crop || plot.plantedAt == null) return { ok: false, reason: 'Không có cây để thu hoạch' };
    if (growthProgress(plot, now) < 1) return { ok: false, reason: 'Cây chưa chín' };
    const crop = plot.crop;
    const amount = CROPS[crop].yield;
    this.set({
      ...this.state,
      inventory: { ...this.state.inventory, [crop]: this.state.inventory[crop] + amount },
      plots: this.updatePlot(index, { crop: null, plantedAt: null }),
    });
    return { ok: true, value: { crop, amount } };
  }

  sell(crop: CropId, qty: number): ActionResult<number> {
    const have = this.state.inventory[crop];
    const n = Math.min(qty, have);
    if (n <= 0) return { ok: false, reason: 'Kho không còn nông sản này' };
    const earned = n * CROPS[crop].sellPrice;
    this.set({
      ...this.state,
      coins: this.state.coins + earned,
      inventory: { ...this.state.inventory, [crop]: have - n },
    });
    return { ok: true, value: earned };
  }

  unlock(index: number): ActionResult {
    const plot = this.state.plots[index];
    if (!plot || plot.unlocked) return { ok: false, reason: 'Ô đất đã mở' };
    const cost = UNLOCK_COSTS[index];
    if (this.state.coins < cost) return { ok: false, reason: 'Không đủ xu!' };
    this.set({ ...this.state, coins: this.state.coins - cost, plots: this.updatePlot(index, { unlocked: true }) });
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
