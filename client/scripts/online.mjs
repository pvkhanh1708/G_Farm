// End-to-end check against the real API: guest signup, plant, server-side ripening, harvest, sell.
// Needs `php artisan serve` (port 8000) and the Vite dev server.
// Usage: node scripts/online.mjs [url] [outDir]
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';

const [url = 'http://localhost:5173/', outDir = 'online-shots'] = process.argv.slice(2);
fs.mkdirSync(outDir, { recursive: true });
const api = (path, token, body) =>
  fetch(new URL('/api' + path, url), {
    method: body ? 'POST' : 'GET',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: body ? JSON.stringify(body) : undefined,
  }).then((r) => r.json());

const browser = await puppeteer.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: 'new',
  args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 800 });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const check = (label, cond, extra = '') => console.log(`${cond ? 'PASS' : 'FAIL'} ${label} ${extra}`);

await page.goto(url, { waitUntil: 'domcontentloaded' });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: 'networkidle0' });
await page.waitForFunction('window.__game && !document.querySelector(".loading:not(.done)")', { timeout: 60000 });
await wait(800);

const token = await page.evaluate(() => localStorage.getItem('farm-empire:token'));
check('guest token issued', !!token);
check('badge says synced', (await page.$eval('.build-tag', (e) => e.textContent)) === 'Đã đồng bộ');

// plant everything through the UI's bulk action
await page.evaluate(() => window.__game.plantAll('carrot'));
await wait(900);
let farm = await api('/farm', token);
check('server got 4 plantings', Object.keys(farm.state.plantings).length === 4, JSON.stringify(farm.state.plantings));
check('server charged seeds', farm.state.coins === 50 - 4 * 7, `coins=${farm.state.coins}`);

// a premature harvest from a tampered client is refused and rolled back
await page.evaluate(() => {
  const s = window.__store.getState();
  const plantings = Object.fromEntries(Object.entries(s.plantings).map(([k, p]) => [k, { ...p, plantedAt: 0 }]));
  window.__store.hydrate({ ...s, plantings }); // local-only edit, never sent
});
await page.evaluate(() => window.__game.harvestAll());
await wait(2500);
farm = await api('/farm', token);
const local = await page.evaluate(() => Object.keys(window.__store.getState().plantings).length);
check('cheated harvest rejected by server', Object.keys(farm.state.plantings).length === 4 && farm.state.inventory.carrot === 0);
check('client rolled back to server state', local === 4, `local plantings=${local}`);
await page.screenshot({ path: `${outDir}/01-rejected.png` });

// wait for real ripeness (carrot = 20s) then harvest all
console.log('waiting 20s for carrots to ripen on the server clock…');
await wait(20500);
await page.evaluate(() => window.__game.harvestAll());
await wait(2500);
farm = await api('/farm', token);
check('harvest reached server', farm.state.inventory.carrot === 16 && Object.keys(farm.state.plantings).length === 0, JSON.stringify(farm.state.inventory.carrot));
check('xp + level up on server', farm.state.level === 1 ? farm.state.xp === 4 : farm.state.level === 2, `level=${farm.state.level} xp=${farm.state.xp}`);
await page.screenshot({ path: `${outDir}/02-harvested.png` });

// reload: progress comes back from the server
await page.evaluate(() => localStorage.removeItem('farm-empire:vs3'));
await page.reload({ waitUntil: 'networkidle0' });
await page.waitForFunction('window.__game && !document.querySelector(".loading:not(.done)")', { timeout: 60000 });
await wait(800);
const after = await page.evaluate(() => window.__store.getState().inventory.carrot);
check('state restored from server after wiping local save', after === 16, `carrot=${after}`);

console.log('errors:', errors.filter((e) => !e.includes('422')).slice(0, 5));
await browser.close();
