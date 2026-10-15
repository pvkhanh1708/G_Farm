// Drives the full loop (harvest -> plant -> sell -> unlock) and captures frames.
// Usage: node scripts/flow.mjs <url> <outDir> [width] [height] [dpr]
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';

const [url, outDir, w = '1440', h = '900', dpr = '1'] = process.argv.slice(2);
fs.mkdirSync(outDir, { recursive: true });
const mobile = Number(w) < 600;
const browser = await puppeteer.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: 'new',
  args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage();
await page.setViewport({ width: Number(w), height: Number(h), deviceScaleFactor: Number(dpr), isMobile: mobile, hasTouch: mobile });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && !m.text().includes('404') && errors.push(m.text()));

await page.goto(url, { waitUntil: 'domcontentloaded' });
await page.evaluate(() => {
  const now = Date.now();
  localStorage.setItem('farm-empire:vs3', JSON.stringify({
    coins: 60, level: 3, xp: 0, inventory: { carrot: 0, wheat: 0, tomato: 6 }, unlocked: 4,
    plantings: { 0: { crop: 'carrot', plantedAt: now - 60000 }, 1: { crop: 'wheat', plantedAt: now - 120000 }, 2: { crop: 'tomato', plantedAt: now - 30000 } },
  }));
  localStorage.setItem('farm-empire:prefs', JSON.stringify({ quality: 'high', sound: false, fps: true }));
});
await page.reload({ waitUntil: 'networkidle0' });
await page.waitForFunction('window.__game !== undefined', { timeout: 60000 });
await new Promise((r) => setTimeout(r, 2500));

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let n = 0;
const shot = async (name) => page.screenshot({ path: `${outDir}/${String(++n).padStart(2, '0')}-${name}.png` });
const tapPlot = async (i, hgt = 0.3) => {
  const p = await page.evaluate((i, hgt) => window.__game.tileAnchor(i, hgt), i, hgt);
  if (mobile) await page.touchscreen.tap(p.x, p.y);
  else await page.mouse.click(p.x, p.y);
};
const click = async (sel, text) => {
  const handles = await page.$$(sel);
  for (const hd of handles) {
    const t = await hd.evaluate((e) => e.textContent || '');
    if (!text || t.includes(text)) {
      await hd.click();
      return true;
    }
  }
  console.log('not found', sel, text);
  return false;
};

await shot('start');
await tapPlot(0); // ready carrot
await wait(260);
await shot('harvest-pop');
await wait(420);
await shot('harvest-fly');
await tapPlot(1); // ready wheat
await wait(1600);
await shot('after-harvest');
await tapPlot(0); // now empty -> seed shop
await wait(500);
await shot('seed-shop');
await click('.seed-card .btn', '7');
await wait(350);
await shot('planted');
await click('.round-btn.barn');
await wait(500);
await shot('inventory');
await click('.inv-row .btn-orange');
await wait(450);
await shot('sell-coins');
await wait(1200);
await shot('after-sell');
await click('.panel-close');
await wait(300);
await tapPlot(4, 0.1); // next tile with the sign
await wait(500);
await shot('unlock-popup');
await click('.panel .btn-green', 'Mở khóa');
await wait(420);
await shot('unlocking');
await wait(1400);
await shot('unlocked');
// bulk: plant all, fast-forward, harvest all
await click('.round-btn.plant');
await wait(500);
await shot('plant-all-shop');
await click('.seed-card .btn', '7');
await wait(700);
await shot('planted-all');
await page.evaluate(() => {
  const s = JSON.parse(localStorage.getItem('farm-empire:vs3'));
  for (const k of Object.keys(s.plantings)) s.plantings[k].plantedAt -= 120000;
  window.__store.getState().plantings = s.plantings; // shift growth in place for the demo
});
await wait(800);
await shot('all-ready');
await click('.round-btn.harvest');
await wait(450);
await shot('harvest-all');
await wait(1500);
await click('.zoom-btn');
await wait(1600);
await shot('overview');
console.log(JSON.stringify(await page.evaluate(() => ({ state: JSON.parse(localStorage.getItem('farm-empire:vs3')), stats: window.__game.stats() }))).slice(0, 600));
console.log('errors:', errors.slice(0, 10));
await browser.close();
