// Renders the favicon and the PWA / home-screen icons into public/ from one square picture,
// client/icon-source.png (kept out of git, like the other art originals), using Chrome.
// Usage: node scripts/icons.mjs
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const SRC = fileURLToPath(new URL('../icon-source.png', import.meta.url));
const PUBLIC = new URL('../public/', import.meta.url);
const ICONS = new URL('icons/', PUBLIC);
fs.mkdirSync(ICONS, { recursive: true });

/**
 * size: output px. crop: part of the source (fractions of its side) — the tab favicon is tiny, so
 * it keeps only the cow and chicken faces. radius: rounded corners as a fraction of the side
 * (0 for iOS, which rounds the icon itself, and for maskable icons, which Android shapes).
 */
const FACES = { x: 0.15, y: 0.2, side: 0.62 };
const OUTPUTS = [
  { file: 'icons/icon-192.png', size: 192, radius: 0.2 },
  { file: 'icons/icon-512.png', size: 512, radius: 0.2 },
  // full-bleed scene: whatever shape Android cuts, the picture still fills it
  { file: 'icons/icon-maskable-512.png', size: 512, radius: 0 },
  { file: 'icons/apple-touch-icon.png', size: 180, radius: 0 },
  { file: 'favicon-32.png', size: 32, radius: 0.18, crop: FACES },
  { file: 'favicon-48.png', size: 48, radius: 0.18, crop: FACES },
];

const chrome = ['C:/Program Files/Google/Chrome/Application/chrome.exe', '/usr/bin/google-chrome', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'].find((c) => fs.existsSync(c));
const browser = await puppeteer.launch({ executablePath: chrome, headless: 'new' });
const page = await browser.newPage();
const pngs = await page.evaluate(
  async (data, outputs) => {
    const img = new Image();
    img.src = 'data:image/png;base64,' + data;
    await img.decode();
    const side = Math.min(img.width, img.height);
    return outputs.map(({ size, radius, crop }) => {
      const c = crop ?? { x: 0, y: 0, side: 1 };
      // halve step by step for a clean downscale
      let src = document.createElement('canvas');
      src.width = src.height = Math.round(side * c.side);
      src.getContext('2d').drawImage(img, c.x * side, c.y * side, src.width, src.height, 0, 0, src.width, src.height);
      while (src.width / 2 >= size) {
        const next = document.createElement('canvas');
        next.width = next.height = Math.round(src.width / 2);
        const n = next.getContext('2d');
        n.imageSmoothingQuality = 'high';
        n.drawImage(src, 0, 0, next.width, next.height);
        src = next;
      }
      const out = document.createElement('canvas');
      out.width = out.height = size;
      const ctx = out.getContext('2d');
      if (radius) {
        ctx.beginPath();
        ctx.roundRect(0, 0, size, size, size * radius);
        ctx.clip();
      }
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(src, 0, 0, size, size);
      return out.toDataURL('image/png').split(',')[1];
    });
  },
  fs.readFileSync(SRC).toString('base64'),
  OUTPUTS.map(({ size, radius, crop }) => ({ size, radius, crop })),
);
await browser.close();

const buffers = {};
OUTPUTS.forEach((o, i) => {
  buffers[o.file] = Buffer.from(pngs[i], 'base64');
  fs.writeFileSync(new URL(o.file, PUBLIC), buffers[o.file]);
  console.log(`[icons] public/${o.file} (${o.size}px, ${Math.round(buffers[o.file].length / 1024)} KB)`);
});

// favicon.ico for browsers and crawlers that ask for it: PNG entries inside an ICO container
const entries = [buffers['favicon-32.png'], buffers['favicon-48.png']];
const header = Buffer.alloc(6 + 16 * entries.length);
header.writeUInt16LE(0, 0);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(entries.length, 4);
let offset = header.length;
entries.forEach((png, i) => {
  const size = png.readUInt32BE(16); // PNG IHDR width
  const e = 6 + 16 * i;
  header.writeUInt8(size, e);
  header.writeUInt8(size, e + 1);
  header.writeUInt16LE(1, e + 4); // colour planes
  header.writeUInt16LE(32, e + 6); // bits per pixel
  header.writeUInt32LE(png.length, e + 8);
  header.writeUInt32LE(offset, e + 12);
  offset += png.length;
});
fs.writeFileSync(new URL('favicon.ico', PUBLIC), Buffer.concat([header, ...entries]));
console.log('[icons] public/favicon.ico');
