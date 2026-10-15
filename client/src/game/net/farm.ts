import type { AnimalId, UpgradeKind } from '../config';
import { api, ApiError, FarmResponse } from './api';
import { sync } from './sync';

/**
 * Server-only farm features (upgrades, fertilizer, orders, quests, login
 * reward, animals). They are not predicted locally: each waits for the action
 * queue to drain, asks the server, then adopts the state it returns.
 */

export class FarmError extends Error {}

async function call<R>(path: string, body: unknown = {}): Promise<R> {
  if (sync.status === 'offline') throw new FarmError('Cần kết nối máy chủ để dùng tính năng này');
  await sync.idle();
  try {
    const res = await api<FarmResponse<R>>('POST', path, body);
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
};

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
