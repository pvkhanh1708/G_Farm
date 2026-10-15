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

// ---------------------------------------------------------------- tiến lên

export interface TLSeat {
  name: string | null;
  bot: boolean;
  empty: boolean;
  cards: number;
  passed: boolean;
}

export interface TLCombo {
  type: 'single' | 'pair' | 'triple' | 'four' | 'straight' | 'pairs';
  len: number;
  top: number;
  cards: number[];
}

export interface TLView {
  id: number;
  game: 'tienlen';
  stake: number;
  status: 'waiting' | 'playing' | 'finished' | 'cancelled';
  host: boolean;
  you: number | null;
  seats: TLSeat[];
  hand: number[];
  turn: number | null;
  combo: TLCombo | null;
  leader: number | null;
  firstTrick: boolean;
  lastAction: { seat: number; kind: 'play' | 'pass'; cards: number[] } | null;
  winner: number | null;
  payout: number;
  turnDeadline: number | null;
  version: number;
}

export interface TLLobby {
  tables: Array<{ id: number; stake: number; host: string; players: number }>;
  mine: TLView | null;
}

export const tienlen = {
  lobby: () => call<TLLobby>('GET', '/games/tienlen'),
  create: (stake: number) => call<TLView>('POST', '/games/tienlen', { stake }),
  table: (id: number) => call<TLView>('GET', `/games/tienlen/${id}`),
  join: (id: number) => call<TLView>('POST', `/games/tienlen/${id}/join`, {}),
  leave: (id: number) => call<TLView>('POST', `/games/tienlen/${id}/leave`, {}),
  start: (id: number) => call<TLView>('POST', `/games/tienlen/${id}/start`, {}),
  play: (id: number, cards: number[]) => call<TLView>('POST', `/games/tienlen/${id}/play`, { cards }),
  pass: (id: number) => call<TLView>('POST', `/games/tienlen/${id}/pass`, {}),
};

// rules mirror (server/app/Game/TienLen.php), only to enable the play button
const rank = (c: number) => Math.floor(c / 4);
export function tlCombo(cards: number[]): Omit<TLCombo, 'cards'> | null {
  const cs = [...new Set(cards)].sort((a, b) => a - b);
  const n = cs.length;
  if (!n) return null;
  const r = cs.map(rank);
  const top = cs[n - 1];
  const same = new Set(r).size === 1;
  if (n === 1) return { type: 'single', len: 1, top };
  if (same) return n === 2 ? { type: 'pair', len: 2, top } : n === 3 ? { type: 'triple', len: 3, top } : n === 4 ? { type: 'four', len: 4, top } : null;
  if (r.includes(12)) return null;
  if (n >= 3 && new Set(r).size === n && r[n - 1] - r[0] === n - 1) return { type: 'straight', len: n, top };
  if (n >= 6 && n % 2 === 0) {
    for (let i = 0; i < n; i += 2) if (r[i] !== r[i + 1] || (i > 0 && r[i] !== r[i - 2] + 1)) return null;
    return { type: 'pairs', len: n / 2, top };
  }
  return null;
}
export function tlBeats(a: Omit<TLCombo, 'cards'>, prev: Omit<TLCombo, 'cards'> | null): boolean {
  if (!prev) return true;
  if (a.type === prev.type && a.len === prev.len) return a.top > prev.top;
  const two = rank(prev.top) === 12, p4 = a.type === 'pairs' && a.len >= 4, p3 = a.type === 'pairs' && a.len === 3;
  if (prev.type === 'single' && two) return p3 || p4 || a.type === 'four';
  if (prev.type === 'pair' && two) return p4 || a.type === 'four';
  if (prev.type === 'four') return p4;
  if (prev.type === 'pairs' && prev.len === 3) return p4 || a.type === 'four';
  return false;
}
