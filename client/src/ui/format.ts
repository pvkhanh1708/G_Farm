const UNITS: Array<[number, string]> = [
  [1e9, 'B'],
  [1e6, 'M'],
  [1e3, 'K'],
];

/**
 * Compact game numbers: exact below `exactBelow` (9.999), then 12,3K / 1,25M / 2,4B.
 * Rounds down so a player never sees more than they have (999.999 -> 999K, not 1000K).
 * Vietnamese separators: "." for thousands, "," for decimals.
 */
export function formatNum(n: number, exactBelow = 10_000): string {
  const sign = n < 0 ? '-' : '';
  const a = Math.abs(n);
  if (a < exactBelow) return sign + Math.floor(a).toLocaleString('vi-VN');
  for (const [v, unit] of UNITS) {
    if (a < v) continue;
    const x = a / v;
    const digits = x < 10 ? 2 : x < 100 ? 1 : 0;
    const k = 10 ** digits;
    return sign + (Math.floor(x * k) / k).toLocaleString('vi-VN', { maximumFractionDigits: digits }) + unit;
  }
  return sign + Math.floor(a).toLocaleString('vi-VN');
}
