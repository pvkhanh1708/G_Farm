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
// crop sheets crops/<id>.png also get sliced into one sprite per stage (+ icon), see sliceSheet()
const sheetOut = (file, s) => path.join(path.dirname(file), path.basename(file, '.png'), `stage-${s}.webp`);
const sheets = pngs.filter((p) => {
  const rel = path.relative(ROOT, p).split(path.sep).join('/');
  if (!/^crops\/[a-z]+\.png$/.test(rel)) return false;
  const out = sheetOut(p, 4);
  return FORCE || !fs.existsSync(out) || fs.statSync(out).mtimeMs < fs.statSync(p).mtimeMs;
});
if (!todo.length && !sheets.length) {
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

/**
 * ChatGPT sheets often let a plant spill out of its 512 px cell, so cutting along the grid
 * clips it. Instead: find the connected shapes on the sheet, give each one to the cell its
 * centre lies in, and export every stage on a canvas 1.5 cells wide centred on its cell,
 * keeping only that stage's own pixels (neighbours that reach in are dropped). The game
 * draws these sprites 1.5x larger, so the plant keeps its size and position.
 * The icon is cropped to its shape and centred.
 */
for (const file of sheets) {
  const rel = path.relative(ROOT, file).split(path.sep).join('/');
  const id = path.basename(file, '.png');
  const parts = await page.evaluate(async (data) => {
    const img = new Image();
    img.src = 'data:image/png;base64,' + data;
    await img.decode();
    const W = img.width, H = img.height;
    const full = document.createElement('canvas');
    full.width = W;
    full.height = H;
    const fctx = full.getContext('2d');
    fctx.drawImage(img, 0, 0);
    // label shapes on a quarter-size alpha mask, slightly dilated so leaves join their plant
    const S = 4, w = Math.ceil(W / S), h = Math.ceil(H / S);
    const small = document.createElement('canvas');
    small.width = w;
    small.height = h;
    small.getContext('2d').drawImage(img, 0, 0, w, h);
    const a = small.getContext('2d').getImageData(0, 0, w, h).data;
    let mask = new Uint8Array(w * h);
    for (let i = 0; i < w * h; i++) mask[i] = a[i * 4 + 3] > 60 ? 1 : 0;
    for (let pass = 0; pass < 2; pass++) {
      const m2 = mask.slice();
      for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) if (!mask[y * w + x] && (mask[y * w + x - 1] || mask[y * w + x + 1] || mask[(y - 1) * w + x] || mask[(y + 1) * w + x])) m2[y * w + x] = 1;
      mask = m2;
    }
    const label = new Int32Array(w * h).fill(-1);
    const cellOf = [];
    const cw = W / 3, ch = H / 2;
    for (let i = 0; i < w * h; i++) {
      if (!mask[i] || label[i] >= 0) continue;
      const id = cellOf.length;
      const stack = [i];
      label[i] = id;
      let sx = 0, sy = 0, n = 0;
      while (stack.length) {
        const j = stack.pop();
        const x = j % w, y = (j / w) | 0;
        sx += x; sy += y; n++;
        for (const k of [j - 1, j + 1, j - w, j + w]) {
          if (k < 0 || k >= w * h || label[k] >= 0 || !mask[k]) continue;
          if ((k === j - 1 && x === 0) || (k === j + 1 && x === w - 1)) continue;
          label[k] = id;
          stack.push(k);
        }
      }
      const cx = ((sx / n) * S) / cw, cy = ((sy / n) * S) / ch;
      cellOf.push(Math.min(2, Math.max(0, cx | 0)) + 3 * Math.min(1, Math.max(0, cy | 0)));
    }
    const src = fctx.getImageData(0, 0, W, H);
    const out = [];
    for (let cell = 0; cell < 6; cell++) {
      // this cell's pixels only
      const own = new ImageData(W, H);
      let x0 = W, y0 = H, x1 = 0, y1 = 0;
      for (let y = 0; y < H; y++)
        for (let x = 0; x < W; x++) {
          const l = label[((y / S) | 0) * w + ((x / S) | 0)];
          if (l < 0 || cellOf[l] !== cell) continue;
          const i = (y * W + x) * 4;
          if (src.data[i + 3] < 24) continue;
          own.data.set(src.data.subarray(i, i + 4), i);
          if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
        }
      const layer = document.createElement('canvas');
      layer.width = W;
      layer.height = H;
      layer.getContext('2d').putImageData(own, 0, 0);
      const c = document.createElement('canvas');
      const cctx = c.getContext('2d');
      cctx.imageSmoothingQuality = 'high';
      if (cell < 5) {
        // stage: 1.5 cells around the cell, same scale as the sheet
        c.width = c.height = 384;
        const ox = (cell % 3) * cw - cw * 0.25, oy = ((cell / 3) | 0) * ch - ch * 0.25;
        cctx.drawImage(layer, ox, oy, cw * 1.5, ch * 1.5, 0, 0, 384, 384);
      } else {
        // icon: fit the shape into the square
        c.width = c.height = 256;
        if (x1 > x0) {
          const side = Math.max(x1 - x0, y1 - y0) * 1.08;
          cctx.drawImage(layer, (x0 + x1) / 2 - side / 2, (y0 + y1) / 2 - side / 2, side, side, 0, 0, 256, 256);
        }
      }
      out.push(c.toDataURL('image/webp', 0.88).split(',')[1]);
    }
    return out;
  }, fs.readFileSync(file).toString('base64'));
  fs.mkdirSync(path.join(path.dirname(file), id), { recursive: true });
  parts.slice(0, 5).forEach((b64, s) => fs.writeFileSync(sheetOut(file, s), Buffer.from(b64, 'base64')));
  fs.mkdirSync(path.join(ROOT, 'icons'), { recursive: true });
  fs.writeFileSync(path.join(ROOT, 'icons', `${id}.webp`), Buffer.from(parts[5], 'base64'));
  console.log(`[art] ${rel} -> crops/${id}/stage-0..4.webp + icons/${id}.webp`);
}

await browser.close();
console.log(`[art] ${todo.length} file(s): ${(before / 1048576).toFixed(1)} MB -> ${(after / 1048576).toFixed(2)} MB`);
