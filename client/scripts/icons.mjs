// Renders the PWA / home-screen icons into public/icons with Chrome (puppeteer-core).
// Usage: node scripts/icons.mjs
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const OUT = new URL('../public/icons/', import.meta.url);
fs.mkdirSync(OUT, { recursive: true });

/** Sprout on a sunny field. `pad` shrinks the art toward the centre (maskable icons need an 80% safe zone). */
const svg = (pad, rounded) => `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <defs>
    <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#9fe3ff"/><stop offset="1" stop-color="#d9f6ff"/>
    </linearGradient>
    <linearGradient id="hill" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#8fdc4f"/><stop offset="1" stop-color="#4fae2e"/>
    </linearGradient>
    <linearGradient id="soil" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#a8683c"/><stop offset="1" stop-color="#6e4020"/>
    </linearGradient>
    <clipPath id="c"><rect width="512" height="512" rx="${rounded ? 112 : 0}"/></clipPath>
  </defs>
  <g clip-path="url(#c)">
    <rect width="512" height="512" fill="url(#sky)"/>
    <circle cx="410" cy="110" r="58" fill="#ffe066"/>
    <ellipse cx="256" cy="560" rx="420" ry="250" fill="url(#hill)"/>
    <g transform="translate(256 290) scale(${1 - pad}) translate(-256 -290)">
      <ellipse cx="256" cy="372" rx="150" ry="46" fill="url(#soil)" stroke="#5a3214" stroke-width="12"/>
      <path d="M256 370V230" stroke="#5a3214" stroke-width="30" stroke-linecap="round"/>
      <path d="M256 370V230" stroke="#4f9f2c" stroke-width="14" stroke-linecap="round"/>
      <path d="M256 246C246 170 182 124 104 136c8 80 72 124 152 110z" fill="#7fd04a" stroke="#5a3214" stroke-width="14" stroke-linejoin="round"/>
      <path d="M256 222c12-78 76-124 154-112-8 78-72 124-154 112z" fill="#9ee05a" stroke="#5a3214" stroke-width="14" stroke-linejoin="round"/>
      <path d="M150 160c30-6 60 4 82 26" stroke="#fff" stroke-opacity=".6" stroke-width="12" stroke-linecap="round" fill="none"/>
    </g>
  </g>
</svg>`;

const targets = [
  { file: 'icon-192.png', size: 192, pad: 0, rounded: true },
  { file: 'icon-512.png', size: 512, pad: 0, rounded: true },
  // Android adaptive icon: full-bleed square, art inside the central 80%
  { file: 'icon-maskable-512.png', size: 512, pad: 0.22, rounded: false },
  // iOS rounds the corners itself and shows transparency as black: full-bleed square
  { file: 'apple-touch-icon.png', size: 180, pad: 0.06, rounded: false },
];

const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new' });
const page = await browser.newPage();
for (const t of targets) {
  await page.setViewport({ width: t.size, height: t.size, deviceScaleFactor: 1 });
  await page.setContent(`<html><body style="margin:0;background:transparent">${svg(t.pad, t.rounded).replace('<svg ', `<svg width="${t.size}" height="${t.size}" `)}</body></html>`);
  await page.screenshot({ path: fileURLToPath(new URL(t.file, OUT)), omitBackground: true });
  console.log('wrote', t.file);
}
fs.writeFileSync(new URL('icon.svg', OUT), svg(0, true).trim() + '\n');
await browser.close();
