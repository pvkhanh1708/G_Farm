// Usage: node scripts/shot.mjs <url> <out.png> [width] [height] [waitMs] [setupJs]
import puppeteer from 'puppeteer-core';
const [url, out, w = '1440', h = '900', wait = '2500', setup = ''] = process.argv.slice(2);
const browser = await puppeteer.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: 'new',
  args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'],
});
const page = await browser.newPage();
const dpr = Number(process.env.DPR || 1);
await page.setViewport({ width: Number(w), height: Number(h), deviceScaleFactor: dpr, isMobile: Number(w) < 600, hasTouch: Number(w) < 600 });
const logs = [];
page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
if (setup) {
  await page.goto(url.split('?')[0], { waitUntil: 'domcontentloaded' });
  await page.evaluate(setup);
}
await page.goto(url, { waitUntil: 'networkidle0', timeout: 60000 });
await page.waitForFunction('window.__game !== undefined', { timeout: 60000 }).catch(() => logs.push('game never ready'));
await new Promise((r) => setTimeout(r, Number(wait)));
if (process.env.ACTIONS) await page.evaluate(process.env.ACTIONS);
if (process.env.WAIT2) await new Promise((r) => setTimeout(r, Number(process.env.WAIT2)));
const info = await page.evaluate(() => { const g = window.__game; return g ? { fps: Math.round(g.fps), ...g.stats(), crops: undefined } : null; });
await page.screenshot({ path: out });
console.log(JSON.stringify(info));
console.log(logs.filter((l) => !l.includes('Babylon.js v')).slice(0, 20).join('\n'));
await browser.close();
