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
  const P = (col, row, crop = null, ago = 0) => ({ id: `${col},${row}`, col, row, unlocked: true, crop, plantedAt: crop ? now - ago : null });
  const plots = [P(-1, 0, 'carrot', 60000), P(0, 0, 'wheat', 120000), P(1, 0, 'tomato', 30000)];
  localStorage.removeItem('farm-empire:vs1');
  localStorage.setItem('farm-empire:vs2', JSON.stringify({ coins: 60, inventory: { carrot: 0, wheat: 0, tomato: 6 }, plots }));
  localStorage.setItem('farm-empire:prefs', JSON.stringify({ quality: 'high', sound: false, fps: true }));
});
await page.reload({ waitUntil: 'networkidle0' });
await page.waitForFunction('window.__game !== undefined', { timeout: 60000 });
await new Promise((r) => setTimeout(r, 2500));

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let n = 0;
const shot = async (name) => page.screenshot({ path: `${outDir}/${String(++n).padStart(2, '0')}-${name}.png` });
const tapPlot = async (i, hgt = 0.3) => {
  const p = await page.evaluate((i, hgt) => window.__game.plotAnchor(i, hgt), i, hgt);
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
await tapPlot('-1,0'); // ready carrot
await wait(260);
await shot('harvest-pop');
await wait(420);
await shot('harvest-fly');
await tapPlot('0,0'); // ready wheat
await wait(1600);
await shot('after-harvest');
await tapPlot('-1,0'); // now empty -> seed shop
await wait(500);
await shot('seed-shop');
await click('.seed-card .btn', '10');
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
await tapPlot('1,1', 0.1); // frontier tile
await wait(500);
await shot('unlock-popup');
await click('.panel .btn-green', 'Mở khóa');
await wait(420);
await shot('unlocking');
await wait(1400);
await shot('unlocked');
console.log(JSON.stringify(await page.evaluate(() => ({ state: JSON.parse(localStorage.getItem('farm-empire:vs2')), stats: window.__game.stats() }))).slice(0, 600));
console.log('errors:', errors.slice(0, 10));
await browser.close();
