// Turns the hand-made PNGs in src/assets/sprites/ into small WebP files the game ships.
// The PNG originals are never modified (and are not committed: see .gitignore); each gets a
// sibling <name>.webp sized for the game. Runs before `npm run dev` / `npm run build`.
// Usage: node scripts/art.mjs [--force]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../src/assets/sprites/', import.meta.url));
const FORCE = process.argv.includes('--force');

/** Target size per folder: width x height (a 3x2 crop sheet keeps 256 px cells). */
function target(rel) {
  if (rel.startsWith('ground/')) return [512, 512];
  if (rel.startsWith('crops/') && !rel.includes('/', 'crops/'.length)) return [768, 512]; // crops/<id>.png sheet
  return [256, 256]; // tiles, single crop stages, icons
}

const pngs = [];
(function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (e.name.toLowerCase().endsWith('.png')) pngs.push(p);
  }
})(ROOT);

const todo = pngs.filter((p) => {
  const out = p.replace(/\.png$/i, '.webp');
  return FORCE || !fs.existsSync(out) || fs.statSync(out).mtimeMs < fs.statSync(p).mtimeMs;
});
if (!todo.length) {
  console.log(`[art] ${pngs.length} PNG, all WebP up to date`);
  process.exit(0);
}

const chrome = ['C:/Program Files/Google/Chrome/Application/chrome.exe', '/usr/bin/google-chrome', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'].find((c) => fs.existsSync(c));
if (!chrome) {
  console.warn('[art] Chrome not found: WebP not regenerated (the game keeps the previous versions)');
  process.exit(0);
}
const { default: puppeteer } = await import('puppeteer-core');
const browser = await puppeteer.launch({ executablePath: chrome, headless: 'new' });
const page = await browser.newPage();
let before = 0, after = 0;
for (const file of todo) {
  const rel = path.relative(ROOT, file).split(path.sep).join('/');
  const [w, h] = target(rel);
  const src = fs.readFileSync(file);
  const webp = await page.evaluate(
    async (data, w, h, opaque) => {
      const img = new Image();
      img.src = 'data:image/png;base64,' + data;
      await img.decode();
      // halve step by step for a clean downscale, then draw at the exact size
      let canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      let ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0);
      while (canvas.width / 2 >= w * 1.2) {
        const next = document.createElement('canvas');
        next.width = Math.round(canvas.width / 2);
        next.height = Math.round(canvas.height / 2);
        const nctx = next.getContext('2d');
        nctx.imageSmoothingQuality = 'high';
        nctx.drawImage(canvas, 0, 0, next.width, next.height);
        canvas = next;
      }
      const out = document.createElement('canvas');
      out.width = w;
      out.height = h;
      ctx = out.getContext('2d');
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(canvas, 0, 0, w, h);
      if (!opaque) {
        // drop the faint glow some generators leave around transparent sprites
        const d = ctx.getImageData(0, 0, w, h);
        for (let i = 3; i < d.data.length; i += 4) if (d.data[i] < 24) d.data[i] = 0;
        ctx.putImageData(d, 0, 0);
      }
      return out.toDataURL('image/webp', 0.88).split(',')[1];
    },
    src.toString('base64'),
    w,
    h,
    rel.startsWith('ground/'),
  );
  const buf = Buffer.from(webp, 'base64');
  fs.writeFileSync(file.replace(/\.png$/i, '.webp'), buf);
  before += src.length;
  after += buf.length;
  console.log(`[art] ${rel} -> ${w}x${h} webp, ${Math.round(src.length / 1024)} KB -> ${Math.round(buf.length / 1024)} KB`);
}
await browser.close();
console.log(`[art] ${todo.length} file(s): ${(before / 1048576).toFixed(1)} MB -> ${(after / 1048576).toFixed(2)} MB`);
