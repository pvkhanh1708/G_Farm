// Frame-cost benchmark on a big farm. Usage: node scripts/bench.mjs [url] [tiles] [outPng]
import puppeteer from 'puppeteer-core';
const [url = 'http://localhost:5173/?offline', tilesArg = '640', out = ''] = process.argv.slice(2);
const N = Number(tilesArg);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const b = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--disable-frame-rate-limit', '--disable-gpu-vsync'] });
const p = await b.newPage();
const throttle = Number(process.env.CPU || 1);
if (throttle > 1) await (await p.target().createCDPSession()).send('Emulation.setCPUThrottlingRate', { rate: throttle });
await p.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
await p.goto(url, { waitUntil: 'domcontentloaded' });
await p.evaluate((N) => {
  const crops = ['carrot', 'wheat', 'tomato', 'strawberry', 'potato', 'cabbage', 'corn', 'chili', 'eggplant', 'watermelon', 'pumpkin', 'pineapple', 'cotton', 'lavender', 'sunflower'];
  const now = Date.now();
  const plantings = {};
  // half ripe, a quarter growing, a quarter empty
  for (let g = 0; g < N; g++) if (g % 4 !== 3) plantings[g] = { crop: crops[g % crops.length], plantedAt: g % 4 === 2 ? now : 1 };
  localStorage.setItem('farm-empire:vs3', JSON.stringify({ coins: 1e9, level: 999, xp: 0, inventory: {}, unlocked: N, plantings }));
  localStorage.setItem('farm-empire:prefs', JSON.stringify({ quality: 'medium', sound: false, fps: true }));
}, N);
await p.reload({ waitUntil: 'domcontentloaded', timeout: 180000 });
const t0 = Date.now();
await p.waitForFunction('window.__game && !document.querySelector(".loading:not(.done)")', { timeout: 300000, polling: 500 });
console.log(`load: ${((Date.now() - t0) / 1000).toFixed(1)}s`);
await wait(2500);
const measure = (label) => p.evaluate(async (label) => {
  const g = window.__game;
  const scene = g.scene;
  const frames = [];
  let last = performance.now();
  await new Promise((done) => {
    const obs = scene.onAfterRenderObservable.add(() => {
      const t = performance.now();
      frames.push(t - last);
      last = t;
      if (frames.length >= 120) { scene.onAfterRenderObservable.remove(obs); done(); }
    });
  });
  frames.shift();
  frames.sort((a, b) => a - b);
  const avg = frames.reduce((a, b) => a + b, 0) / frames.length;
  const s = g.stats();
  const prof = await g.profile(2500);
  return `${label}: ${JSON.stringify(prof)}
   avg ${avg.toFixed(1)}ms (${(1000 / avg).toFixed(0)} fps) p90 ${frames[Math.floor(frames.length * 0.9)].toFixed(1)}ms | draws ${s.drawCalls} meshes ${s.activeMeshes} verts ${s.vertices} | nodes ${scene.transformNodes.length} meshes ${scene.meshes.length} particles ${scene.particleSystems.length} | dom ${document.querySelectorAll('.plot-anchor').length}`;
}, label);
console.log(await measure('farm view'));
await p.click('.zoom-btn'); await wait(2500);
console.log(await measure('overview  '));
if (out) await p.screenshot({ path: out });
await b.close();
