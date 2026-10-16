import type { AnimalId, CropId, GoodId, ItemId, MachineId, UpgradeKind } from '../config';
import { api, ApiError, FarmResponse } from './api';
import { sync } from './sync';

/**
 * Server-only farm features (upgrades, fertilizer, orders, quests, login
 * reward, animals). They are not predicted locally: each waits for the action
 * queue to drain, asks the server, then adopts the state it returns.
 */

export class FarmError extends Error {}

async function call<R>(path: string, body: unknown = {}, method: 'GET' | 'POST' = 'POST'): Promise<R> {
  if (sync.status === 'offline') throw new FarmError('Cần kết nối máy chủ để dùng tính năng này');
  await sync.idle();
  try {
    const res = await api<FarmResponse<R>>(method, path, method === 'POST' ? body : undefined);
    sync.adopt(res);
    return res.result;
  } catch (e) {
    if (e instanceof ApiError) {
      if (e.body?.state) sync.adopt(e.body);
      throw new FarmError(e.firstError);
    }
    throw new FarmError('Không kết nối được máy chủ');
  }
}

type Reward = { coins: number; xp: number; levelUps: number[] };

export const farmApi = {
  upgrade: (kind: UpgradeKind) => call<{ level: number }>('/farm/upgrade', { kind }),
  fertilize: (tiles: number[]) => call<{ fertilized: number[] }>('/farm/fertilize', { tiles }),
  deliver: (id: string) => call<Reward>('/farm/orders/deliver', { id }),
  skip: (id: string) => call<null>('/farm/orders/skip', { id }),
  claimQuest: (index: number) => call<Reward>('/farm/quests/claim', { index }),
  claimLogin: () => call<{ coins: number; streak: number }>('/farm/login-reward'),
  buyAnimal: (type: AnimalId) => call<{ count: number }>('/farm/animals/buy', { type }),
  collect: (which?: number[]) => call<{ collected: number; xp: number; levelUps: number[] }>('/farm/animals/collect', which ? { which } : {}),
  water: (type: AnimalId) => call<null>('/farm/animals/water', { type }),
  feed: (which?: number[]) => call<{ fed: number }>('/farm/animals/feed', which ? { which } : {}),
  expandPen: (type: AnimalId) => call<{ slots: number }>('/farm/pens/expand', { type }),
  expandMachine: (machine: MachineId) => call<{ slots: number }>('/farm/machines/expand', { machine }),
  buyDog: () => call<null>('/farm/dog'),
  buyMachine: (machine: MachineId) => call<null>('/farm/machines/buy', { machine }),
  startJob: (machine: MachineId, output: GoodId) => call<{ output: GoodId; readyAt: number }>('/farm/machines/start', { machine, output }),
  collectGoods: (machine?: MachineId) => call<{ goods: Partial<Record<ItemId, number>>; xp: number; levelUps: number[] }>('/farm/machines/collect', machine ? { machine } : {}),
  news: () => call<NewsItem[]>('/farm/news', undefined, 'GET'),
  neighbours: () => call<Neighbour[]>('/neighbors', undefined, 'GET'),
  visit: (id: number) => call<NeighbourFarm>(`/neighbors/${id}`, undefined, 'GET'),
  steal: (id: number, tile: number) => call<{ caught: boolean; crop: CropId; qty: number; fine: number; farm: NeighbourFarm }>(`/neighbors/${id}/steal`, { tile }),
  help: (id: number, tile: number) => call<{ coins: number; xp: number; levelUps: number[]; farm: NeighbourFarm }>(`/neighbors/${id}/help`, { tile }),
};

export interface Neighbour {
  id: number;
  name: string;
  avatar: string | null;
  level: number;
  /** Ripe tiles this visitor could still take from. */
  ripe: number;
  dog: boolean;
}

export interface NeighbourFarm {
  id: number;
  name: string;
  avatar: string | null;
  level: number;
  unlocked: number;
  dog: boolean;
  plantings: Array<{ tile: number; crop: CropId; plantedAt: number; growMs: number; steal: number; helped: boolean }>;
}

export interface NewsItem {
  id: number;
  type: 'steal' | 'caught' | 'help';
  actor: { id: number; name: string | null; avatar: string | null };
  crop: CropId | null;
  qty: number;
  coins: number;
  seen: boolean;
  at: number;
}

export type Board = 'coins' | 'level' | 'tiles' | 'wins' | 'winnings';
export interface BoardRow {
  rank: number;
  id: number;
  name: string;
  avatar: string | null;
  level: number;
  value: number;
}

export async function leaderboard(board: Board) {
  return api<{ board: Board; rows: BoardRow[]; me: { rank: number; value: number; level: number } | null }>('GET', `/leaderboard/${board}`);
}
