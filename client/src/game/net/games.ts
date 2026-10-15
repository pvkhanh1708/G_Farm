import { api, ApiError, FarmResponse } from './api';
import { sync } from './sync';

/** One betting table as the server shows it to this player. */
export interface TableView {
  id: number;
  game: 'caro';
  stake: number;
  status: 'waiting' | 'playing' | 'finished' | 'cancelled';
  vsBot: boolean;
  /** 1 = host (X), 2 = guest (O), null = not seated */
  you: 1 | 2 | null;
  players: { 1: string; 2: string | null };
  board: number[];
  size: number;
  turn: 1 | 2;
  moves: number;
  lastMove: [number, number, number] | null;
  /** 1 / 2 = that side won, 0 = draw */
  winner: 0 | 1 | 2 | null;
  endReason: 'line' | 'resign' | 'timeout' | 'draw' | null;
  winLine: Array<[number, number]> | null;
  turnDeadline: number | null;
  payout: number;
  version: number;
}

export interface Lobby {
  tables: Array<{ id: number; stake: number; host: string }>;
  mine: TableView | null;
}

/** Calls a game-room endpoint; the reply also carries the player's farm (coins moved). */
async function call<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
  try {
    const res = await api<FarmResponse<T>>(method, path, body);
    sync.adopt(res);
    return res.result;
  } catch (e) {
    if (e instanceof ApiError && e.body?.state) sync.adopt(e.body);
    throw e;
  }
}

export const games = {
  lobby: () => call<Lobby>('GET', '/games/tables?game=caro'),
  create: (stake: number) => call<TableView>('POST', '/games/tables', { game: 'caro', stake }),
  table: (id: number) => call<TableView>('GET', `/games/tables/${id}`),
  join: (id: number) => call<TableView>('POST', `/games/tables/${id}/join`, {}),
  bot: (id: number) => call<TableView>('POST', `/games/tables/${id}/bot`, {}),
  cancel: (id: number) => call<TableView>('POST', `/games/tables/${id}/cancel`, {}),
  move: (id: number, x: number, y: number) => call<TableView>('POST', `/games/tables/${id}/move`, { x, y }),
  resign: (id: number) => call<TableView>('POST', `/games/tables/${id}/resign`, {}),
};

export const MIN_STAKE = 100;
