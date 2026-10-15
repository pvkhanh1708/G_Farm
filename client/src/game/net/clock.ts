/**
 * Growth timers use the server's clock (plantings carry server timestamps),
 * so the client tracks its offset from the server instead of trusting
 * Date.now() directly. Offline play keeps the offset at 0.
 */
let offset = 0;

export function serverNow(): number {
  return Date.now() + offset;
}

/** `serverTime` was stamped somewhere during a request that took `rtt` ms. */
export function syncClock(serverTime: number, rtt: number) {
  offset = serverTime + rtt / 2 - Date.now();
}
