// Generates the crop table in shared/economy.json and simulates pacing.
// Usage: node scripts/economy.mjs          (print table + pacing, no write)
//        node scripts/economy.mjs --write  (also update shared/economy.json)
//
// Every crop has a tier k (its position in unlock order). Tier k earns
// ~17% more profit/min and ~10% more XP/min than tier k-1. Its kind then
// skews that: "coin" crops pay more money and less XP, "xp" crops the reverse,
// so players pick money farming or level farming.
import fs from 'node:fs';

const FILE = new URL('../../shared/economy.json', import.meta.url);

// id, name, unlock level, grow seconds, yield, kind
const CROPS = [
  ['carrot', 'Cà rốt', 1, 20, 4, 'coin'],
  ['wheat', 'Lúa mì', 2, 30, 5, 'xp'],
  ['tomato', 'Cà chua', 3, 45, 6, 'coin'],
  ['strawberry', 'Dâu tây', 5, 60, 5, 'xp'],
  ['potato', 'Khoai tây', 7, 75, 6, 'xp'],
  ['cabbage', 'Bắp cải', 9, 90, 3, 'xp'],
  ['corn', 'Ngô', 11, 120, 4, 'coin'],
  ['chili', 'Ớt', 13, 150, 8, 'xp'],
  ['eggplant', 'Cà tím', 15, 180, 5, 'coin'],
  ['watermelon', 'Dưa hấu', 18, 240, 2, 'coin'],
  ['pumpkin', 'Bí ngô', 21, 300, 2, 'coin'],
  ['pineapple', 'Dứa', 24, 360, 2, 'coin'],
  ['cotton', 'Bông', 27, 480, 6, 'xp'],
  ['lavender', 'Oải hương', 30, 600, 5, 'xp'],
  ['sunflower', 'Hướng dương', 34, 720, 3, 'coin'],
  // high tier
  ['tea', 'Trà', 36, 840, 6, 'xp'],
  ['grape', 'Nho', 38, 900, 6, 'coin'],
  ['coffee', 'Cà phê', 41, 1080, 5, 'xp'],
  ['dragonfruit', 'Thanh long', 44, 1200, 3, 'coin'],
  ['rose', 'Hoa hồng', 47, 1500, 4, 'xp'],
  ['durian', 'Sầu riêng', 50, 1800, 1, 'coin'],
  ['orchid', 'Hoa lan', 54, 2100, 3, 'xp'],
  ['ginseng', 'Nhân sâm', 58, 2400, 2, 'coin'],
  ['saffron', 'Nghệ tây', 63, 3000, 4, 'xp'],
  ['cantaloupe', 'Dưa lưới', 70, 3600, 2, 'coin'],
];

const SKEW = { coin: { profit: 1.5, xp: 0.5 }, xp: { profit: 0.55, xp: 1.8 } };
const round = (x) => (x < 100 ? Math.round(x) : x < 10000 ? Math.round(x / 5) * 5 : Math.round(x / 50) * 50);

export function buildCrops() {
  return CROPS.map(([id, name, unlockLevel, growSeconds, yieldN, kind], k) => {
    const sk = SKEW[kind];
    const base = (30 * 1.17 ** k * growSeconds) / 60;
    const profit = base * sk.profit;
    // seeds cost the same share of the *unskewed* profit, so a starter coin crop stays cheap (no soft-lock at 50 coins)
    const seedPrice = Math.max(5, round(base * 0.7));
    const sellPrice = Math.max(1, round((seedPrice + profit) / yieldN));
    const xp = Math.max(1, Math.round(((3 * 1.1 ** k * growSeconds) / 60) * sk.xp));
    return { id, name, seedName: `Hạt ${name[0].toLowerCase()}${name.slice(1)}`, kind, unlockLevel, seedPrice, growSeconds, yield: yieldN, sellPrice, xp };
  });
}

const eco = JSON.parse(fs.readFileSync(FILE, 'utf8'));
const crops = buildCrops();

console.log('id               lvl kind  grow   seed  yield  sell     profit  xp    profit/min  xp/min');
for (const c of crops) {
  const profit = c.yield * c.sellPrice - c.seedPrice;
  console.log(
    `${c.id.padEnd(16)} ${String(c.unlockLevel).padStart(3)} ${c.kind.padEnd(5)} ${String(c.growSeconds).padStart(5)} ${String(c.seedPrice).padStart(6)} ${String(c.yield).padStart(5)} ${String(c.sellPrice).padStart(7)} ${String(profit).padStart(9)} ${String(c.xp).padStart(5)} ${String(Math.round((profit * 60) / c.growSeconds)).padStart(10)} ${((c.xp * 60) / c.growSeconds).toFixed(1).padStart(7)}`,
  );
}

// ---------------------------------------------------------------- pacing sim
// A player who farms money while land is affordable-limited, and XP while level-limited.
const xpToNext = (L) => Math.round(eco.xp.base * L ** eco.xp.exponent);
const tileCap = (L) => eco.startUnlocked + L;
const tileCost = (n) => Math.round((eco.tileCost.base + eco.tileCost.factor * Math.max(0, n - eco.startUnlocked) ** eco.tileCost.exponent) / 10) * 10;
let coins = eco.startingCoins, tiles = eco.startUnlocked, L = 1, xp = 0, t = 0;
const marks = [];
while (L < 80 && t < 400 * 3600) {
  while (tiles < tileCap(L) && coins - tileCost(tiles) >= crops[0].seedPrice * (tiles + 1)) coins -= tileCost(tiles++);
  const avail = crops.filter((c) => c.unlockLevel <= L && c.seedPrice * tiles <= coins);
  if (!avail.length) avail.push(crops[0]);
  const wantXp = tiles >= tileCap(L);
  const score = (c) => (wantXp ? c.xp : c.yield * c.sellPrice - c.seedPrice) / c.growSeconds;
  const pick = avail.reduce((a, b) => (score(b) > score(a) ? b : a));
  const n = Math.min(tiles, Math.floor(coins / pick.seedPrice));
  if (n <= 0) break;
  coins += n * (pick.yield * pick.sellPrice - pick.seedPrice);
  xp += n * pick.xp;
  t += pick.growSeconds + 5;
  while (xp >= xpToNext(L)) {
    xp -= xpToNext(L);
    L++;
    coins += eco.levelRewardPerLevel * L;
    if ([5, 10, 20, 30, 40, 50, 60, 70].includes(L)) marks.push(`L${L}: ${(t / 3600).toFixed(1)}h, ${tiles} tiles, coins ${coins.toExponential(2)}`);
  }
}
console.log('\npacing (active player):', JSON.stringify({ end: { L, tiles, coins: Math.round(coins), hours: +(t / 3600).toFixed(1) } }));
console.log(marks.join('\n'));

if (process.argv.includes('--write')) {
  eco.crops = crops;
  fs.writeFileSync(FILE, JSON.stringify(eco, null, 2) + '\n');
  console.log('\nwrote', FILE.pathname);
}
