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

const relOf = (p) => path.relative(ROOT, p).split(path.sep).join('/');
const isAnimalSheet = (p) => /^animals\/[a-z]+\.png$/.test(relOf(p));
const isItemSheet = (p) => /^sheets\//.test(relOf(p));
const todo = pngs.filter((p) => {
  if (isAnimalSheet(p) || isItemSheet(p)) return false; // sliced below
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
// animal sheets animals/<id>.png (2 rows of 6 poses) become animals/<id>/frame-0..11.webp
const ANIMAL_COLS = 6, ANIMAL_ROWS = 2, ANIMAL_FRAMES = ANIMAL_COLS * ANIMAL_ROWS;
const frameOut = (file, f) => path.join(path.dirname(file), path.basename(file, '.png'), `frame-${f}.webp`);
const animalSheets = pngs.filter((p) => {
  if (!isAnimalSheet(p)) return false;
  const out = frameOut(p, ANIMAL_FRAMES - 1);
  return FORCE || !fs.existsSync(out) || fs.statSync(out).mtimeMs < fs.statSync(p).mtimeMs;
});
// an item sheet is redone when it or its .json changed after the first picture it makes
const itemSheets = pngs.filter((p) => {
  if (!isItemSheet(p)) return false;
  const json = p.replace(/\.png$/, '.json');
  if (!fs.existsSync(json)) return false;
  const first = JSON.parse(fs.readFileSync(json, 'utf8')).cells.find(Boolean);
  const out = first && path.join(ROOT, first.replace(/\.png$/, '.webp'));
  return FORCE || !out || !fs.existsSync(out) || fs.statSync(out).mtimeMs < Math.max(fs.statSync(p).mtimeMs, fs.statSync(json).mtimeMs);
});
if (!todo.length && !sheets.length && !animalSheets.length && !itemSheets.length) {
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
    // Label the shapes at alpha > `th`. A soft glow around the drawings can join two of them
    // into one shape that then has to be cut along the grid (clipping both); when that happens,
    // label again ignoring the glow (a higher threshold), and keep whichever needs fewer cuts.
    const cw = W / 3, ch = H / 2;
    const gridCell = (x, y) => Math.min(2, ((x * S) / cw) | 0) + 3 * Math.min(1, ((y * S) / ch) | 0);
    const labelShapes = (th) => {
      let mask = new Uint8Array(w * h);
      for (let i = 0; i < w * h; i++) mask[i] = a[i * 4 + 3] > th ? 1 : 0;
      for (let pass = 0; pass < 2; pass++) {
        const m2 = mask.slice();
        for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) if (!mask[y * w + x] && (mask[y * w + x - 1] || mask[y * w + x + 1] || mask[(y - 1) * w + x] || mask[(y + 1) * w + x])) m2[y * w + x] = 1;
        mask = m2;
      }
      const label = new Int32Array(w * h).fill(-1);
      const cellOf = [];
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
      // a shape mostly outside its centroid's cell is two drawings touching: split it along the grid
      const inOwn = new Float64Array(cellOf.length), total = new Float64Array(cellOf.length);
      for (let i = 0; i < w * h; i++) {
        const l = label[i];
        if (l < 0) continue;
        total[l]++;
        if (gridCell(i % w, (i / w) | 0) === cellOf[l]) inOwn[l]++;
      }
      const split = cellOf.map((_, l) => total[l] > 50 && inOwn[l] / total[l] < 0.8);
      return { label, cellOf, split, cuts: split.filter(Boolean).length };
    };
    let shapes = labelShapes(60);
    if (shapes.cuts) {
      const strict = labelShapes(170);
      if (strict.cuts < shapes.cuts) shapes = strict;
    }
    const { label, cellOf, split } = shapes;
    // Touching drawings are cut where they are thinnest near each grid line (not on the line
    // itself), so a plant reaching a little past its cell is kept whole.
    const cuts = new Map();
    split.forEach((isSplit, l) => {
      if (!isSplit) return;
      const colN = new Int32Array(w), rowN = new Int32Array(h);
      for (let i = 0; i < w * h; i++)
        if (label[i] === l) {
          colN[i % w]++;
          rowN[(i / w) | 0]++;
        }
      const best = (hist, line, reach) => {
        let at = line, min = Infinity;
        for (let v = Math.max(0, Math.round(line - reach)); v <= Math.min(hist.length - 1, Math.round(line + reach)); v++) {
          const score = hist[v] + Math.abs(v - line) * 0.01; // ties: closest to the grid line
          if (score < min) {
            min = score;
            at = v;
          }
        }
        return at;
      };
      const rw = (cw / S) * 0.2, rh = (ch / S) * 0.2;
      cuts.set(l, { x1: best(colN, cw / S, rw), x2: best(colN, (2 * cw) / S, rw), y: best(rowN, ch / S, rh) });
    });
    const cutCell = (l, x, y) => {
      const c = cuts.get(l);
      return (x < c.x1 ? 0 : x < c.x2 ? 1 : 2) + (y < c.y ? 0 : 3);
    };
    const src = fctx.getImageData(0, 0, W, H);
    const out = [];
    for (let cell = 0; cell < 6; cell++) {
      // this cell's pixels only
      const own = new ImageData(W, H);
      let x0 = W, y0 = H, x1 = 0, y1 = 0;
      for (let y = 0; y < H; y++)
        for (let x = 0; x < W; x++) {
          const l = label[((y / S) | 0) * w + ((x / S) | 0)];
          if (l < 0) continue;
          const owner = split[l] ? cutCell(l, (x / S) | 0, (y / S) | 0) : cellOf[l];
          if (owner !== cell) continue;
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

/**
 * An animal sheet is a grid of poses (6 x 2, read left to right, top to bottom). Each pose is the
 * group of solid shapes whose centre lies in its cell; specks of background left around the drawings (small shapes, faint
 * pixels) are dropped. All frames share one scale and stand on the bottom edge of a 256 px square,
 * centred, so the animal keeps its size and footing from frame to frame.
 */
/**
 * Cut a grid sheet into one picture per cell. Each picture is the group of solid shapes whose centre lies in
 * its cell; specks and the soft glow some generators paint around drawings are dropped. `ownScale` false: all
 * cells share one scale (animal poses); true: each picture fills its own square (a sheet of different items).
 * Every picture stands on the bottom edge of a 256 px square, centred. Returns base64 WebP per cell (null = empty).
 */
async function sliceGrid(file, cols, rows, ownScale) {
  return page.evaluate(async (data, C, R, own) => {
    const N = C * R;
    const img = new Image();
    img.src = 'data:image/png;base64,' + data;
    await img.decode();
    const W = img.width, H = img.height;
    const full = document.createElement('canvas');
    full.width = W;
    full.height = H;
    full.getContext('2d').drawImage(img, 0, 0);
    const src = full.getContext('2d').getImageData(0, 0, W, H);
    const S = 2, w = Math.ceil(W / S), h = Math.ceil(H / S);
    const mask = new Uint8Array(w * h);
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const i = (Math.min(H - 1, y * S) * W + Math.min(W - 1, x * S)) * 4;
        mask[y * w + x] = src.data[i + 3] > 140 ? 1 : 0;
      }
    const label = new Int32Array(w * h).fill(-1);
    const comps = [];
    for (let i = 0; i < w * h; i++) {
      if (!mask[i] || label[i] >= 0) continue;
      const id = comps.length;
      const stack = [i];
      label[i] = id;
      let sx = 0, sy = 0, n = 0, x0 = w, x1 = 0, y0 = h, y1 = 0;
      while (stack.length) {
        const j = stack.pop();
        const x = j % w, y = (j / w) | 0;
        sx += x;
        sy += y;
        n++;
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
        for (const k of [j - 1, j + 1, j - w, j + w]) {
          if (k < 0 || k >= w * h || label[k] >= 0 || !mask[k]) continue;
          if ((k === j - 1 && x === 0) || (k === j + 1 && x === w - 1)) continue;
          label[k] = id;
          stack.push(k);
        }
      }
      const col = Math.min(C - 1, Math.floor(((sx / n) * S) / (W / C))), row = Math.min(R - 1, Math.floor(((sy / n) * S) / (H / R)));
      comps.push({ n, cx: sx / n, cy: sy / n, x0, x1, y0, y1, frame: col + row * C });
    }
    const biggest = Math.max(...comps.map((c) => c.n));
    const keep = comps.map((c) => c.n >= biggest * 0.004);
    // small loose bits (water drops, sparkles) belong to the nearest big drawing, even when they fly over into
    // the next cell: spread every big drawing outward pixel by pixel and see which one reaches each bit first
    const isBig = comps.map((c) => c.n >= biggest * 0.05);
    const near = new Int32Array(w * h).fill(-1);
    const dist = new Int32Array(w * h);
    let wave = [];
    for (let i = 0; i < w * h; i++) if (label[i] >= 0 && isBig[label[i]]) (near[i] = label[i]), wave.push(i);
    while (wave.length) {
      const next = [];
      for (const j of wave) {
        const x = j % w;
        for (const k of [j - 1, j + 1, j - w, j + w]) {
          if (k < 0 || k >= w * h || near[k] >= 0) continue;
          if ((k === j - 1 && x === 0) || (k === j + 1 && x === w - 1)) continue;
          near[k] = near[j];
          dist[k] = dist[j] + 1;
          next.push(k);
        }
      }
      wave = next;
    }
    // distance from each bit to the nearest big drawing (its closest pixel, not its centre)
    const gap = comps.map(() => Infinity);
    for (let i = 0; i < w * h; i++) {
      const l = label[i];
      if (l >= 0 && !isBig[l] && near[i] >= 0) {
        // the bit's own pixels are not reached by the wave: look at its neighbours
        for (const k of [i - 1, i + 1, i - w, i + w]) {
          if (k < 0 || k >= w * h || label[k] === l) continue;
          if (near[k] >= 0 && dist[k] + 1 < gap[l]) (gap[l] = dist[k] + 1), (comps[l].owner = near[k]);
        }
      }
    }
    // bits right next to a drawing follow it; a stray one far from every drawing is dropped (on a sheet
    // of items it is a splash that flew over from a neighbour and would show up in the wrong picture)
    const reach = Math.round(Math.min(W / C, H / R) / S * 0.04);
    comps.forEach((c, l) => {
      if (isBig[l] || c.owner === undefined) return;
      if (gap[l] <= reach) c.frame = comps[c.owner].frame;
      else if (own) keep[l] = false;
    });
    // owner of each mask cell, grown by 2 cells so antialiased outlines survive
    let owner = new Int8Array(w * h).fill(-1);
    for (let i = 0; i < w * h; i++) if (label[i] >= 0 && keep[label[i]]) owner[i] = comps[label[i]].frame;
    for (let pass = 0; pass < 2; pass++) {
      const o2 = owner.slice();
      for (let y = 1; y < h - 1; y++)
        for (let x = 1; x < w - 1; x++) {
          const i = y * w + x;
          if (owner[i] >= 0) continue;
          for (const k of [i - 1, i + 1, i - w, i + w]) if (owner[k] >= 0) { o2[i] = owner[k]; break; }
        }
      owner = o2;
    }
    const layers = [], boxes = [];
    for (let f = 0; f < N; f++) {
      const own = new ImageData(W, H);
      let x0 = W, y0 = H, x1 = 0, y1 = 0;
      for (let y = 0; y < H; y++)
        for (let x = 0; x < W; x++) {
          if (owner[((y / S) | 0) * w + ((x / S) | 0)] !== f) continue;
          const i = (y * W + x) * 4;
          if (src.data[i + 3] < 70) continue;
          own.data.set(src.data.subarray(i, i + 4), i);
          if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
        }
      const layer = document.createElement('canvas');
      layer.width = W;
      layer.height = H;
      layer.getContext('2d').putImageData(own, 0, 0);
      layers.push(layer);
      boxes.push({ x0, y0, x1, y1 });
    }
    const shared = Math.max(...boxes.map((b) => Math.max(b.x1 - b.x0, b.y1 - b.y0))) * 1.04;
    const out = [];
    for (let f = 0; f < N; f++) {
      const b = boxes[f];
      if (b.x1 <= b.x0) {
        out.push(null);
        continue;
      }
      const side = own ? Math.max(b.x1 - b.x0, b.y1 - b.y0) * 1.04 : shared;
      const c = document.createElement('canvas');
      c.width = c.height = 256;
      const ctx = c.getContext('2d');
      ctx.imageSmoothingQuality = 'high';
      // feet on the bottom edge (a 2% margin), centred horizontally
      const sx = (b.x0 + b.x1) / 2 - side / 2, sy = b.y1 + side * 0.02 - side;
      ctx.drawImage(layers[f], sx, sy, side, side, 0, 0, 256, 256);
      out.push(c.toDataURL('image/webp', 0.9).split(',')[1]);
    }
    return out;
  }, fs.readFileSync(file).toString('base64'), cols, rows, ownScale);
}

for (const file of animalSheets) {
  const rel = relOf(file);
  const frames = await sliceGrid(file, ANIMAL_COLS, ANIMAL_ROWS, false);
  frames.forEach((b64, f) => {
    if (!b64) return;
    fs.mkdirSync(path.dirname(frameOut(file, f)), { recursive: true });
    fs.writeFileSync(frameOut(file, f), Buffer.from(b64, 'base64'));
  });
  console.log(`[art] ${rel} -> ${rel.replace(/\.png$/, '')}/frame-0..${ANIMAL_FRAMES - 1}.webp`);
}

/**
 * Item sheets: sheets/<name>.png with sheets/<name>.json = { "cols": 3, "rows": 2, "cells": ["ui/steal.png", …] }
 * (null for an unused cell). Each cell becomes the .webp of that path, as if it had been drawn on its own.
 */
for (const file of itemSheets) {
  const spec = JSON.parse(fs.readFileSync(file.replace(/\.png$/, '.json'), 'utf8'));
  const parts = await sliceGrid(file, spec.cols, spec.rows, true);
  spec.cells.forEach((target, i) => {
    if (!target || !parts[i]) return;
    const out = path.join(ROOT, target.replace(/\.png$/, '.webp'));
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, Buffer.from(parts[i], 'base64'));
    console.log(`[art] ${relOf(file)} cell ${i + 1} -> ${target.replace(/\.png$/, '.webp')}`);
  });
}

await browser.close();
console.log(`[art] ${todo.length} file(s): ${(before / 1048576).toFixed(1)} MB -> ${(after / 1048576).toFixed(2)} MB`);
