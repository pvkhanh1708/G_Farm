import { useEffect, useState } from 'react';

/**
 * Time of day from the player's clock, as a tint over the scene (multiply).
 */
const KEYS: Array<[number, string, number]> = [
  // hour, colour, strength
  [0, '#28306e', 0.5],
  [4.5, '#28306e', 0.5],
  [6, '#ff9a6a', 0.28],
  [7.5, '#ffffff', 0],
  [16.5, '#ffffff', 0],
  [18, '#ff8a4a', 0.3],
  [19.5, '#4a3a8a', 0.42],
  [21, '#28306e', 0.5],
  [24, '#28306e', 0.5],
];

const rgb = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));

function tint(hour: number) {
  let i = 0;
  while (KEYS[i + 1][0] < hour) i++;
  const [h0, c0, a0] = KEYS[i], [h1, c1, a1] = KEYS[i + 1];
  const k = (hour - h0) / Math.max(0.001, h1 - h0);
  const a = rgb(c0), b = rgb(c1);
  const c = a.map((v, j) => Math.round(v + (b[j] - v) * k));
  return { color: `rgb(${c.join(',')})`, alpha: a0 + (a1 - a0) * k };
}

function hourNow() {
  const d = new Date();
  return d.getHours() + d.getMinutes() / 60;
}

export function SkyOverlay() {
  const [hour, setHour] = useState(hourNow);
  useEffect(() => {
    const t = setInterval(() => setHour(hourNow()), 60_000);
    return () => clearInterval(t);
  }, []);
  // ?hour=21 previews another time of day
  const forced = Number(new URLSearchParams(location.search).get('hour'));
  const { color, alpha } = tint(forced > 0 && forced < 24 ? forced : hour);
  return (
    <div className="sky-tint" style={{ background: color, opacity: alpha }} />
  );
}
