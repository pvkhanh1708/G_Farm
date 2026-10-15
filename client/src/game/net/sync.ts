import { GameAction, store } from '../state/store';
import { api, ApiError, ApiUser, FarmResponse, token } from './api';
import { syncClock } from './clock';

/**
 * Online play: the local store applies every action instantly (so taps feel
 * immediate), then this module replays the action to the Laravel API in order.
 * The server re-validates and answers with the authoritative state, which
 * replaces the local copy once no more local actions are waiting. A rejected
 * action drops the queue and snaps back to the server's state.
 *
 * Without a reachable server (or with VITE_OFFLINE=1) the game stays local.
 */

export type NetStatus = 'connecting' | 'online' | 'retrying' | 'offline';

type Listener = () => void;

const RETRY_MS = [1000, 2000, 4000, 8000, 15000];

class Sync {
  status: NetStatus = 'connecting';
  user: ApiUser | null = null;
  private queue: GameAction[] = [];
  private busy = false;
  private listeners = new Set<Listener>();
  private unsubscribe: (() => void) | null = null;
  /** Shown to the player when the server rejects an action. */
  onReject: (message: string) => void = () => {};

  subscribe = (fn: Listener) => {
    this.listeners.add(fn);
    return () => void this.listeners.delete(fn);
  };

  private setStatus(s: NetStatus) {
    this.status = s;
    this.listeners.forEach((l) => l());
  }

  /** Connect (creating a guest account on first run) and load the farm. Resolves to false when playing offline. */
  async boot(): Promise<boolean> {
    // ?offline keeps a session local (screenshot/flow scripts seed their own saves)
    if (import.meta.env.VITE_OFFLINE === '1' || new URLSearchParams(location.search).has('offline')) {
      this.setStatus('offline');
      return false;
    }
    try {
      await this.ensureAccount();
      await this.loadFarm();
      this.unsubscribe ??= store.onAction((a) => this.enqueue(a));
      this.setStatus('online');
      return true;
    } catch (e) {
      console.warn('[sync] server unreachable, playing offline', e);
      this.setStatus('offline');
      return false;
    }
  }

  private async ensureAccount() {
    if (token.get()) {
      try {
        // the farm is fetched alongside (see loadFarm) instead of after this answer
        this.farmRequest = this.fetchFarm();
        this.farmRequest.catch(() => {});
        this.user = (await api<{ user: ApiUser }>('GET', '/me', undefined, 8000)).user;
        return;
      } catch (e) {
        this.farmRequest = null;
        if (!(e instanceof ApiError && e.status === 401)) throw e;
        token.set(null); // revoked or from another database: start a new guest
      }
    }
    const res = await api<{ token: string; user: ApiUser }>('POST', '/auth/guest', undefined, 6000);
    token.set(res.token);
    this.user = res.user;
  }

  private farmRequest: Promise<{ res: FarmResponse; rtt: number }> | null = null;

  private async fetchFarm() {
    const t0 = performance.now();
    const res = await api<FarmResponse>('GET', '/farm', undefined, 8000);
    return { res, rtt: performance.now() - t0 };
  }

  private async loadFarm() {
    const pending = this.farmRequest;
    this.farmRequest = null;
    const { res, rtt } = await (pending ?? this.fetchFarm());
    this.apply(res, rtt);
  }

  /**
   * Adopt the farm state that another API (e.g. the game room, which moves coins)
   * returned, unless local actions are still on their way to the server.
   */
  adopt(res: { state?: FarmResponse['state']; serverTime?: number }) {
    if (!this.queue.length && !this.busy) this.apply(res, 0);
  }

  private apply(res: { state?: FarmResponse['state']; serverTime?: number }, rtt: number) {
    if (res.serverTime) syncClock(res.serverTime, rtt);
    if (res.state) store.hydrate(res.state);
  }

  /** Resolves once every queued action has reached the server. */
  async idle() {
    while (this.queue.length || this.busy) await new Promise((r) => setTimeout(r, 60));
  }

  /** Queue an action; consecutive harvests (and plantings of one crop) merge into one request. */
  private enqueue(a: GameAction) {
    const last = this.queue[this.queue.length - 1];
    const mergeable = last && (this.queue.length > 1 || !this.busy);
    if (mergeable && last.type === 'harvest' && a.type === 'harvest') last.tiles.push(...a.tiles);
    else if (mergeable && last.type === 'plant' && a.type === 'plant' && last.crop === a.crop) last.tiles.push(...a.tiles);
    else if (mergeable && last.type === 'dig' && a.type === 'dig') last.tiles.push(...a.tiles);
    else this.queue.push(a.type === 'harvest' || a.type === 'plant' || a.type === 'dig' ? { ...a, tiles: [...a.tiles] } : a);
    // let a burst of taps (harvest-all ripple, quick sowing) collect before sending
    setTimeout(() => void this.pump(), 120);
  }

  private request(a: GameAction): Promise<FarmResponse> {
    switch (a.type) {
      case 'plant':
        return api('POST', '/farm/plant', { tiles: a.tiles, crop: a.crop });
      case 'harvest':
        return api('POST', '/farm/harvest', { tiles: a.tiles });
      case 'dig':
        return api('POST', '/farm/dig', { tiles: a.tiles });
      case 'sell':
        return api('POST', '/farm/sell', { crop: a.crop, qty: a.qty });
      case 'unlock':
        return api('POST', '/farm/unlock', {});
      case 'reset':
        return api('POST', '/farm/reset', {});
    }
  }

  private async pump() {
    if (this.busy) return;
    this.busy = true;
    let attempt = 0;
    while (this.queue.length) {
      const a = this.queue[0];
      const t0 = performance.now();
      try {
        const res = await this.request(a);
        this.queue.shift();
        attempt = 0;
        if (this.status !== 'online') this.setStatus('online');
        // only adopt the server's copy when it already includes every local action
        if (!this.queue.length) this.apply(res, performance.now() - t0);
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) {
          this.queue = [];
          token.set(null);
          this.onReject('Phiên đăng nhập đã hết hạn');
          await this.boot();
          break;
        }
        if (e instanceof ApiError && e.status >= 400 && e.status < 500 && e.status !== 429) {
          // rejected: later local actions were built on a wrong assumption, so drop them all
          this.queue = [];
          this.onReject(e.body?.message || 'Máy chủ từ chối thao tác');
          if (e.body?.state) this.apply(e.body, performance.now() - t0);
          else await this.loadFarm().catch(() => {});
          break;
        }
        // network/server trouble: keep the queue and retry with backoff
        this.setStatus('retrying');
        await new Promise((r) => setTimeout(r, RETRY_MS[Math.min(attempt++, RETRY_MS.length - 1)]));
      }
    }
    this.busy = false;
  }

  // ---------------------------------------------------------------- account

  async register(name: string, email: string, password: string) {
    this.user = (await api<{ user: ApiUser }>('POST', '/auth/register', { name, email, password })).user;
    this.listeners.forEach((l) => l());
  }

  /** Switch this device to another account and load its farm. */
  async login(email: string, password: string) {
    const res = await api<{ token: string; user: ApiUser }>('POST', '/auth/login', { email, password });
    this.queue = [];
    token.set(res.token);
    this.user = res.user;
    await this.loadFarm();
    this.listeners.forEach((l) => l());
  }

  /** Sign in with a Google ID token; a guest keeps the current farm, a linked account loads its own. */
  async loginWithGoogle(credential: string) {
    const res = await api<{ token: string; user: ApiUser }>('POST', '/auth/google', { credential });
    this.queue = [];
    token.set(res.token);
    this.user = res.user;
    await this.loadFarm();
    this.listeners.forEach((l) => l());
  }

  /** Sign out and continue as a fresh guest. */
  async logout() {
    await api('POST', '/auth/logout', {}).catch(() => {});
    this.queue = [];
    token.set(null);
    this.user = null;
    await this.ensureAccount();
    await this.loadFarm();
    this.listeners.forEach((l) => l());
  }
}

export const sync = new Sync();
