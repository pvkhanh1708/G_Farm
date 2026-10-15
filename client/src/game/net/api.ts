import type { GameState } from '../state/store';

/** API root, no trailing slash. Dev: /api (Vite proxies it to Laravel); production: https://api.nongtrai.io.vn */
const BASE = (import.meta.env.VITE_API_URL as string | undefined) ?? '/api';
const TOKEN_KEY = 'farm-empire:token';

export interface ApiUser {
  id: number;
  name: string;
  email: string | null;
  isGuest: boolean;
}

export interface FarmResponse<R = unknown> {
  ok: boolean;
  message: string | null;
  result: R;
  state: GameState;
  serverTime: number;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    public body: { message?: string; state?: GameState; serverTime?: number; errors?: Record<string, string[]> } | null,
  ) {
    super(body?.message || `HTTP ${status}`);
  }

  /** First validation message, for forms. */
  get firstError(): string {
    const errs = this.body?.errors;
    return (errs && Object.values(errs)[0]?.[0]) || this.message;
  }
}

export const token = {
  get(): string | null {
    try {
      return localStorage.getItem(TOKEN_KEY);
    } catch {
      return null;
    }
  },
  set(t: string | null) {
    try {
      if (t) localStorage.setItem(TOKEN_KEY, t);
      else localStorage.removeItem(TOKEN_KEY);
    } catch {
      /* storage unavailable: the session still works until reload */
    }
  },
};

/** Throws ApiError for HTTP errors and TypeError/AbortError for network failures. */
export async function api<T>(method: 'GET' | 'POST', path: string, body?: unknown, timeoutMs = 10000): Promise<T> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const t = token.get();
    const res = await fetch(BASE + path, {
      method,
      signal: ctl.signal,
      headers: {
        Accept: 'application/json',
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(t ? { Authorization: `Bearer ${t}` } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const json = await res.json().catch(() => null);
    if (!res.ok) throw new ApiError(res.status, json);
    return json as T;
  } finally {
    clearTimeout(timer);
  }
}
