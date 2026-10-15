import { Constants, DynamicTexture, Material, Mesh, Scene, StandardMaterial, Texture, VertexData } from '@babylonjs/core';
import { CROP_ORDER, CropId, STAGE_COUNT } from '../config';
import { CameraRig } from './camera';
import { mulberry } from './geometry';
import { artUrl, cropSheetUrl, loadImage, SHEET } from '../art';

/**
 * Top-down 2D art for the farm grid: soil tiles, wild-grass tiles and every
 * crop at every growth stage, painted procedurally with Canvas 2D into one
 * atlas texture (placeholder art, see ASSETS.md). A PNG in
 * client/src/assets/sprites/ replaces its cell. Each sprite becomes a flat
 * quad template that tiles draw as thin instances.
 */

const CELL = 192; // px per atlas cell (includes padding against mip bleeding)
const PAD = 8;
const DRAW = CELL - PAD * 2; // drawable square in the atlas (176 px)
const COLS = 21;
const ATLAS_W = COLS * CELL; // 4032
const ATLAS_H = 7 * CELL; // 1344: 4 tile cells + 25 crops x 5 stages = 129 cells
/** Logical canvas units the procedural painters draw in (scaled to DRAW). */
const S = 144;
type Ctx = CanvasRenderingContext2D;

// ------------------------------------------------------------------ paint helpers

const OUTLINE = 'rgba(34, 52, 16, 0.55)';

function circle(c: Ctx, x: number, y: number, r: number, fill: string | CanvasGradient, stroke = OUTLINE, lw = 2) {
  c.beginPath();
  c.arc(x, y, r, 0, Math.PI * 2);
  c.fillStyle = fill;
  c.fill();
  if (stroke) {
    c.lineWidth = lw;
    c.strokeStyle = stroke;
    c.stroke();
  }
}

/** Glossy ball: light top-left, darker rim. */
function ball(c: Ctx, x: number, y: number, r: number, light: string, mid: string, dark: string, stroke = OUTLINE) {
  const g = c.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.1, x, y, r);
  g.addColorStop(0, light);
  g.addColorStop(0.45, mid);
  g.addColorStop(1, dark);
  circle(c, x, y, r, g, stroke);
  c.beginPath();
  c.ellipse(x - r * 0.35, y - r * 0.4, r * 0.28, r * 0.16, -0.6, 0, Math.PI * 2);
  c.fillStyle = 'rgba(255,255,255,.55)';
  c.fill();
}

/** A leaf from (x,y) pointing at `angle`, with a midrib. */
function leaf(c: Ctx, x: number, y: number, angle: number, len: number, wid: number, base: string, tip: string, rib = true) {
  c.save();
  c.translate(x, y);
  c.rotate(angle);
  const g = c.createLinearGradient(0, 0, len, 0);
  g.addColorStop(0, base);
  g.addColorStop(1, tip);
  c.beginPath();
  c.moveTo(0, 0);
  c.bezierCurveTo(len * 0.3, -wid, len * 0.75, -wid * 0.9, len, 0);
  c.bezierCurveTo(len * 0.75, wid * 0.9, len * 0.3, wid, 0, 0);
  c.fillStyle = g;
  c.fill();
  c.lineWidth = 1.8;
  c.strokeStyle = OUTLINE;
  c.stroke();
  if (rib) {
    c.beginPath();
    c.moveTo(len * 0.08, 0);
    c.quadraticCurveTo(len * 0.5, -wid * 0.08, len * 0.9, 0);
    c.strokeStyle = 'rgba(255,255,255,.35)';
    c.lineWidth = 1.4;
    c.stroke();
  }
  c.restore();
}

/** Broad leaf (strawberry/potato/pumpkin/melon): short stalk, then a wide heart-shaped blade with veins. */
function roundLeaf(c: Ctx, x: number, y: number, angle: number, dist: number, r: number, base: string, tip: string) {
  const sx = x + Math.cos(angle) * dist * 0.35, sy = y + Math.sin(angle) * dist * 0.35;
  c.beginPath();
  c.moveTo(x, y);
  c.lineTo(sx, sy);
  c.strokeStyle = '#4f8a2a';
  c.lineWidth = 2.5;
  c.stroke();
  const len = dist * 0.65 + r * 1.6, wid = r * 1.05;
  c.save();
  c.translate(sx, sy);
  c.rotate(angle);
  const g = c.createLinearGradient(0, -wid, len * 0.4, wid);
  g.addColorStop(0, tip);
  g.addColorStop(1, base);
  c.beginPath();
  c.moveTo(0, 0);
  c.bezierCurveTo(len * 0.05, -wid * 1.1, len * 0.85, -wid * 1.05, len, 0);
  c.bezierCurveTo(len * 0.85, wid * 1.05, len * 0.05, wid * 1.1, 0, 0);
  c.fillStyle = g;
  c.fill();
  c.lineWidth = 1.8;
  c.strokeStyle = OUTLINE;
  c.stroke();
  // midrib and side veins
  c.strokeStyle = 'rgba(255,255,255,.35)';
  c.lineWidth = 1.3;
  c.beginPath();
  c.moveTo(len * 0.05, 0);
  c.lineTo(len * 0.88, 0);
  for (const t of [0.3, 0.55]) {
    c.moveTo(len * t, 0);
    c.lineTo(len * (t + 0.18), -wid * 0.55);
    c.moveTo(len * t, 0);
    c.lineTo(len * (t + 0.18), wid * 0.55);
  }
  c.stroke();
  c.restore();
}

/** Soft contact shadow under a plant. */
function shade(c: Ctx, x: number, y: number, r: number) {
  const g = c.createRadialGradient(x + r * 0.12, y + r * 0.15, 0, x + r * 0.12, y + r * 0.15, r);
  g.addColorStop(0, 'rgba(30,18,8,.35)');
  g.addColorStop(1, 'rgba(30,18,8,0)');
  c.fillStyle = g;
  c.fillRect(x - r, y - r, r * 2.4, r * 2.4);
}

function star(c: Ctx, x: number, y: number, n: number, rOut: number, rIn: number, fill: string, rot = 0) {
  c.beginPath();
  for (let i = 0; i <= n * 2; i++) {
    const a = rot + (i / (n * 2)) * Math.PI * 2;
    const r = i % 2 ? rIn : rOut;
    const px = x + Math.cos(a) * r, py = y + Math.sin(a) * r;
    if (i === 0) c.moveTo(px, py);
    else c.lineTo(px, py);
  }
  c.closePath();
  c.fillStyle = fill;
  c.fill();
  c.lineWidth = 1.5;
  c.strokeStyle = OUTLINE;
  c.stroke();
}

function flower(c: Ctx, x: number, y: number, r: number, petal: string, heart: string) {
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    circle(c, x + Math.cos(a) * r * 0.6, y + Math.sin(a) * r * 0.6, r * 0.5, petal, 'rgba(0,0,0,.2)', 1);
  }
  circle(c, x, y, r * 0.4, heart, 'rgba(0,0,0,.25)', 1);
}

function roundRect(c: Ctx, x: number, y: number, w: number, h: number, r: number) {
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}

// ------------------------------------------------------------------ tiles

function paintSoil(c: Ctx) {
  const r = mulberry(11);
  roundRect(c, 2, 2, S - 4, S - 4, 18);
  const g = c.createLinearGradient(0, 0, S, S);
  g.addColorStop(0, '#5e3c20');
  g.addColorStop(1, '#3e2410');
  c.fillStyle = g;
  c.fill();
  c.save();
  c.clip();
  // clods and darker patches
  for (let i = 0; i < 26; i++) {
    c.beginPath();
    c.ellipse(r() * S, r() * S, 6 + r() * 14, 4 + r() * 8, r() * 3, 0, Math.PI * 2);
    c.fillStyle = r() < 0.5 ? 'rgba(25,14,4,.25)' : 'rgba(130,88,52,.18)';
    c.fill();
  }
  // a few grey pebbles like a ploughed bed
  for (let i = 0; i < 7; i++) {
    const x = 14 + r() * (S - 28), y = 14 + r() * (S - 28), w = 3 + r() * 5;
    c.beginPath();
    c.ellipse(x, y, w, w * 0.65, r() * 3, 0, Math.PI * 2);
    c.fillStyle = r() < 0.5 ? '#9a9a92' : '#b6b4aa';
    c.fill();
  }
  c.restore();
  // bevel: light top-left rim, dark bottom-right
  roundRect(c, 3, 3, S - 6, S - 6, 17);
  c.lineWidth = 4;
  c.strokeStyle = 'rgba(255,220,170,.18)';
  c.stroke();
  roundRect(c, 2, 2, S - 4, S - 4, 18);
  c.lineWidth = 3;
  c.strokeStyle = 'rgba(40,22,8,.6)';
  c.stroke();
}

function paintGrass(c: Ctx, variant: number) {
  const r = mulberry(31 + variant * 7);
  roundRect(c, 2, 2, S - 4, S - 4, 18);
  const g = c.createLinearGradient(0, 0, S, S);
  g.addColorStop(0, '#b4e46c');
  g.addColorStop(1, '#8fcc4e');
  c.fillStyle = g;
  c.fill();
  c.save();
  c.clip();
  for (let i = 0; i < 40; i++) {
    const x = r() * S, y = r() * S;
    c.beginPath();
    c.moveTo(x, y);
    c.lineTo(x + (r() - 0.5) * 6, y - 6 - r() * 6);
    c.strokeStyle = r() < 0.5 ? 'rgba(70,140,40,.5)' : 'rgba(220,250,160,.6)';
    c.lineWidth = 2;
    c.stroke();
  }
  if (variant !== 1) flower(c, 24 + r() * (S - 48), 24 + r() * (S - 48), 7, variant === 0 ? '#ffffff' : '#ffd84a', '#f0a020');
  c.restore();
  roundRect(c, 2, 2, S - 4, S - 4, 18);
  c.lineWidth = 3;
  c.strokeStyle = 'rgba(60,120,30,.55)';
  c.stroke();
}

// ------------------------------------------------------------------ crops

/** Seed-bed for stage 0: little mounds with seeds. */
function paintSeeds(c: Ctx, seed: string) {
  const r = mulberry(5);
  const spots: Array<[number, number]> = [[0.32, 0.34], [0.66, 0.3], [0.5, 0.62], [0.28, 0.7], [0.72, 0.7]];
  for (const [sx, sy] of spots) {
    const x = sx * S, y = sy * S;
    c.beginPath();
    c.ellipse(x, y, 13, 9, 0, 0, Math.PI * 2);
    c.fillStyle = '#4a2e18';
    c.fill();
    for (let k = 0; k < 3; k++) circle(c, x + (r() - 0.5) * 12, y + (r() - 0.5) * 8, 2.6, seed, 'rgba(0,0,0,.35)', 1);
  }
}

function paintSprout(c: Ctx, base: string, tip: string, scale = 1) {
  const cx = S / 2, cy = S / 2;
  shade(c, cx, cy, 16 * scale);
  leaf(c, cx, cy, -2.4, 26 * scale, 11 * scale, base, tip);
  leaf(c, cx, cy, -0.7, 26 * scale, 11 * scale, base, tip);
  circle(c, cx, cy, 3 * scale, '#5a9a2a', '', 0);
}

type Painter = (c: Ctx, stage: number) => void;

const G = { deep: '#2f7a26', mid: '#4ea83a', light: '#9fe066', pale: '#c8f08a' };

/** Rosette of leaves around the centre; `n` leaves of length `len`. */
function rosette(c: Ctx, n: number, len: number, wid: number, base: string, tip: string, rot = 0, cx = S / 2, cy = S / 2) {
  for (let i = 0; i < n; i++) leaf(c, cx, cy, rot + (i / n) * Math.PI * 2, len, wid, base, tip);
}

const PAINTERS: Record<CropId, Painter> = {
  carrot(c, st) {
    const k = [0, 0, 0.55, 0.8, 1][st];
    const spots: Array<[number, number]> = st === 4 ? [[0.33, 0.35], [0.67, 0.38], [0.5, 0.68]] : [[0.5, 0.5]];
    for (const [sx, sy] of spots) {
      const x = sx * S, y = sy * S;
      shade(c, x, y, 26 * k);
      for (let i = 0; i < 7; i++) leaf(c, x, y, (i / 7) * Math.PI * 2 + 0.3, (st === 4 ? 30 : 40) * k, 7 * k, G.mid, G.light, false);
      // ripe: the orange shoulder of the root pokes out of the soil between the fronds
      if (st === 4) {
        ball(c, x, y + 2, 12, '#ffc070', '#ff8a1a', '#d4520c');
        for (let i = 0; i < 3; i++) leaf(c, x, y - 2, -Math.PI / 2 + (i - 1) * 0.5, 14, 4, G.mid, G.light, false);
      }
    }
  },
  wheat(c, st) {
    const r = mulberry(21);
    const n = st === 2 ? 9 : 16;
    for (let i = 0; i < n; i++) {
      const x = 22 + r() * (S - 44), y = 22 + r() * (S - 44);
      const a = r() * Math.PI * 2;
      if (st === 2) leaf(c, x, y, a, 26, 5, G.mid, G.light, false);
      else {
        const ripe = st === 4;
        leaf(c, x, y, a, 18, 4, ripe ? '#c9a03a' : G.mid, ripe ? '#e6c25a' : G.light, false);
        c.save();
        c.translate(x, y);
        c.rotate(a + 1.2);
        c.beginPath();
        c.ellipse(0, 0, 13, 6, 0, 0, Math.PI * 2);
        const g = c.createLinearGradient(-13, 0, 13, 0);
        g.addColorStop(0, ripe ? '#d9a022' : '#8cbf4a');
        g.addColorStop(1, ripe ? '#ffe27a' : '#c6e88a');
        c.fillStyle = g;
        c.fill();
        c.strokeStyle = OUTLINE;
        c.lineWidth = 1.4;
        c.stroke();
        for (let k = -2; k <= 2; k++) {
          c.beginPath();
          c.moveTo(k * 4, -5);
          c.lineTo(k * 4, 5);
          c.strokeStyle = 'rgba(120,80,10,.35)';
          c.stroke();
        }
        c.restore();
      }
    }
  },
  tomato(c, st) {
    const cx = S / 2, cy = S / 2, k = [0, 0, 0.6, 0.9, 1][st];
    shade(c, cx, cy, 55 * k);
    rosette(c, 9, 46 * k, 16 * k, G.deep, G.light, 0.2);
    rosette(c, 6, 30 * k, 13 * k, G.mid, G.pale, 0.7);
    if (st === 3) {
      flower(c, cx - 22, cy - 10, 7, '#ffd83a', '#e09a0e');
      flower(c, cx + 18, cy + 20, 7, '#ffd83a', '#e09a0e');
      ball(c, cx + 20, cy - 18, 9, '#d6f59a', '#9ad64e', '#5ea832');
    }
    if (st === 4) {
      const fruits: Array<[number, number, number]> = [[-26, -14, 13], [22, -24, 12], [24, 18, 13], [-16, 24, 12], [0, -2, 11]];
      for (const [dx, dy, r] of fruits) {
        ball(c, cx + dx, cy + dy, r, '#ffa28c', '#ff3b2b', '#c21c14');
        star(c, cx + dx, cy + dy - r * 0.2, 5, r * 0.45, r * 0.18, '#4ea83a');
      }
    }
  },
  strawberry(c, st) {
    const k = [0, 0, 0.6, 0.9, 1][st];
    const plants: Array<[number, number]> = st === 2 ? [[0.5, 0.5]] : [[0.32, 0.36], [0.68, 0.4], [0.48, 0.7]];
    for (const [sx, sy] of plants) {
      const x = sx * S, y = sy * S;
      shade(c, x, y, 30 * k);
      for (let i = 0; i < 3; i++) roundLeaf(c, x, y, (i / 3) * Math.PI * 2 - 0.5, 14 * k, 11 * k, G.deep, G.light);
      if (st === 3) flower(c, x + 12, y + 12, 6, '#ffffff', '#ffd23a');
      if (st === 4) {
        for (const [dx, dy] of [[14, 12], [-14, 10]] as Array<[number, number]>) {
          const bx = x + dx, by = y + dy;
          c.beginPath();
          c.moveTo(bx, by - 10);
          c.bezierCurveTo(bx + 12, by - 10, bx + 9, by + 6, bx, by + 12);
          c.bezierCurveTo(bx - 9, by + 6, bx - 12, by - 10, bx, by - 10);
          const g = c.createRadialGradient(bx - 3, by - 4, 1, bx, by, 13);
          g.addColorStop(0, '#ff8a9a');
          g.addColorStop(1, '#c0102a');
          c.fillStyle = g;
          c.fill();
          c.strokeStyle = OUTLINE;
          c.lineWidth = 1.5;
          c.stroke();
          for (let s = 0; s < 6; s++) circle(c, bx + Math.cos(s * 2.1) * 5, by + Math.sin(s * 2.1) * 5, 1, '#ffe066', '', 0);
          star(c, bx, by - 9, 5, 6, 2.5, '#4ea83a');
        }
      }
    }
  },
  potato(c, st) {
    const cx = S / 2, cy = S / 2, k = [0, 0, 0.6, 0.9, 1][st];
    shade(c, cx, cy, 55 * k);
    for (let i = 0; i < 8; i++) roundLeaf(c, cx, cy, (i / 8) * Math.PI * 2, 30 * k, 15 * k, st === 4 ? '#5f8a2a' : G.deep, st === 4 ? '#c8d878' : G.light);
    roundLeaf(c, cx, cy, 0, 0, 16 * k, G.mid, G.pale);
    if (st === 3) for (const [dx, dy] of [[-18, -20], [20, -8], [-4, 24]] as Array<[number, number]>) flower(c, cx + dx, cy + dy, 7, '#e8d8ff', '#ffd23a');
    if (st === 4)
      for (const [dx, dy] of [[-44, 34], [42, 40], [40, -42]] as Array<[number, number]>) {
        c.beginPath();
        c.ellipse(cx + dx, cy + dy, 14, 10, 0.5, 0, Math.PI * 2);
        c.fillStyle = '#c9915a';
        c.fill();
        c.strokeStyle = OUTLINE;
        c.stroke();
        circle(c, cx + dx + 3, cy + dy - 2, 1.6, '#6b4220', '', 0);
      }
  },
  cabbage(c, st) {
    const cx = S / 2, cy = S / 2, k = [0, 0, 0.55, 0.85, 1][st];
    shade(c, cx, cy, 58 * k);
    for (let i = 0; i < 7; i++) roundLeaf(c, cx, cy, (i / 7) * Math.PI * 2, 30 * k, 22 * k, '#3f8a52', '#9cd98a');
    if (st >= 3) {
      const R = st === 4 ? 34 : 22;
      ball(c, cx, cy, R, '#eaffc8', '#a8dc84', '#5fa04a');
      // wrapped leaves: curved arcs around the head
      c.strokeStyle = 'rgba(70,130,50,.6)';
      c.lineWidth = 2;
      for (let i = 0; i < 6; i++) {
        c.beginPath();
        c.arc(cx, cy, R * (0.35 + i * 0.11), i * 1.3, i * 1.3 + 2.2);
        c.stroke();
      }
    }
  },
  corn(c, st) {
    const cx = S / 2, cy = S / 2, k = [0, 0, 0.55, 0.85, 1][st];
    shade(c, cx, cy, 50 * k);
    for (let i = 0; i < 8; i++) leaf(c, cx, cy, (i / 8) * Math.PI * 2 + 0.2, 64 * k, 8 * k, G.deep, i % 2 ? G.light : G.pale);
    if (st >= 3) {
      star(c, cx, cy, 8, st === 4 ? 14 : 10, 4, st === 4 ? '#e3b552' : '#cfe08a');
    }
    if (st === 4)
      for (const a of [0.9, 3.9]) {
        const x = cx + Math.cos(a) * 28, y = cy + Math.sin(a) * 28;
        c.save();
        c.translate(x, y);
        c.rotate(a);
        c.beginPath();
        c.ellipse(0, 0, 18, 8, 0, 0, Math.PI * 2);
        c.fillStyle = '#ffd23a';
        c.fill();
        c.strokeStyle = OUTLINE;
        c.stroke();
        for (let i = -3; i <= 3; i++) circle(c, i * 4.5, 0, 2, '#fff0a0', 'rgba(200,140,10,.6)', 1);
        leaf(c, -18, 0, 0.35, 22, 6, G.mid, G.light, false);
        leaf(c, -18, 0, -0.35, 22, 6, G.mid, G.light, false);
        c.restore();
      }
  },
  chili(c, st) {
    const cx = S / 2, cy = S / 2, k = [0, 0, 0.6, 0.9, 1][st];
    shade(c, cx, cy, 52 * k);
    rosette(c, 10, 40 * k, 11 * k, '#2f7a2a', '#9ee070', 0.1);
    if (st === 3) for (const a of [0.5, 2.6, 4.4]) flower(c, cx + Math.cos(a) * 24, cy + Math.sin(a) * 24, 6, '#ffffff', '#c8e070');
    if (st >= 3) {
      const n = st === 4 ? 6 : 3;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + 0.3;
        c.save();
        c.translate(cx + Math.cos(a) * 20, cy + Math.sin(a) * 20);
        c.rotate(a);
        c.beginPath();
        c.moveTo(0, -4);
        c.quadraticCurveTo(22, -6, 30, 4);
        c.quadraticCurveTo(18, 4, 0, 4);
        c.closePath();
        c.fillStyle = st === 4 ? '#e8241a' : '#7cc04a';
        c.fill();
        c.strokeStyle = OUTLINE;
        c.lineWidth = 1.5;
        c.stroke();
        c.restore();
      }
    }
  },
  eggplant(c, st) {
    const cx = S / 2, cy = S / 2, k = [0, 0, 0.6, 0.9, 1][st];
    shade(c, cx, cy, 56 * k);
    rosette(c, 7, 50 * k, 20 * k, '#356b3a', '#93cf72', 0.4);
    if (st === 3) for (const a of [0.2, 2.3, 4.3]) flower(c, cx + Math.cos(a) * 26, cy + Math.sin(a) * 26, 7, '#a35ad6', '#ffd23a');
    if (st === 4)
      for (const a of [0.8, 2.9, 5.0]) {
        c.save();
        c.translate(cx + Math.cos(a) * 30, cy + Math.sin(a) * 30);
        c.rotate(a);
        c.beginPath();
        c.ellipse(4, 0, 20, 10, 0, 0, Math.PI * 2);
        const g = c.createLinearGradient(0, -10, 0, 10);
        g.addColorStop(0, '#b06ad8');
        g.addColorStop(0.5, '#6b2a8f');
        g.addColorStop(1, '#3a1250');
        c.fillStyle = g;
        c.fill();
        c.strokeStyle = OUTLINE;
        c.lineWidth = 1.5;
        c.stroke();
        star(c, -14, 0, 5, 8, 3, '#4ea83a');
        c.restore();
      }
  },
  watermelon(c, st) {
    const cx = S / 2, cy = S / 2, k = [0, 0, 0.6, 0.9, 1][st];
    // vines
    c.strokeStyle = '#4f8a2a';
    c.lineWidth = 3;
    for (let i = 0; i < 4; i++) {
      const a = i * 1.57 + 0.4;
      c.beginPath();
      c.moveTo(cx, cy);
      c.quadraticCurveTo(cx + Math.cos(a + 0.6) * 40 * k, cy + Math.sin(a + 0.6) * 40 * k, cx + Math.cos(a) * 64 * k, cy + Math.sin(a) * 64 * k);
      c.stroke();
    }
    for (let i = 0; i < 6; i++) roundLeaf(c, cx, cy, (i / 6) * Math.PI * 2 + 0.2, 40 * k, 13 * k, G.deep, G.light);
    if (st === 3) {
      flower(c, cx - 30, cy + 26, 7, '#ffd21a', '#e0a00a');
      ball(c, cx + 6, cy - 4, 13, '#c8f08a', '#7cc04a', '#3f7f2a');
    }
    if (st === 4) {
      c.save();
      c.translate(cx, cy);
      c.rotate(-0.4);
      c.beginPath();
      c.ellipse(0, 0, 40, 30, 0, 0, Math.PI * 2);
      const g = c.createRadialGradient(-12, -10, 4, 0, 0, 40);
      g.addColorStop(0, '#9fdc78');
      g.addColorStop(1, '#3f8a2a');
      c.fillStyle = g;
      c.fill();
      c.save();
      c.clip();
      c.strokeStyle = '#2a5e22';
      c.lineWidth = 5;
      for (let i = -3; i <= 3; i++) {
        c.beginPath();
        c.moveTo(-44, i * 9);
        for (let x = -44; x <= 44; x += 8) c.lineTo(x, i * 9 + Math.sin(x * 0.3 + i) * 2.5);
        c.stroke();
      }
      c.restore();
      c.strokeStyle = OUTLINE;
      c.lineWidth = 2;
      c.stroke();
      c.restore();
    }
  },
  pumpkin(c, st) {
    const cx = S / 2, cy = S / 2, k = [0, 0, 0.6, 0.9, 1][st];
    c.strokeStyle = '#4f8a2a';
    c.lineWidth = 3;
    for (let i = 0; i < 4; i++) {
      const a = i * 1.57 + 0.8;
      c.beginPath();
      c.moveTo(cx, cy);
      c.quadraticCurveTo(cx + Math.cos(a - 0.5) * 40 * k, cy + Math.sin(a - 0.5) * 40 * k, cx + Math.cos(a) * 64 * k, cy + Math.sin(a) * 64 * k);
      c.stroke();
    }
    for (let i = 0; i < 7; i++) roundLeaf(c, cx, cy, (i / 7) * Math.PI * 2, 42 * k, 15 * k, G.deep, G.light);
    if (st === 3) {
      flower(c, cx + 28, cy - 28, 8, '#ff9f1a', '#e07a0a');
      ball(c, cx - 4, cy + 4, 14, '#c8f08a', '#7cc04a', '#3f7f2a');
    }
    if (st === 4) {
      const R = 38;
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        c.beginPath();
        c.ellipse(cx + Math.cos(a) * R * 0.45, cy + Math.sin(a) * R * 0.45, R * 0.62, R * 0.36, a, 0, Math.PI * 2);
        const g = c.createRadialGradient(cx - 10, cy - 12, 4, cx, cy, R * 1.1);
        g.addColorStop(0, '#ffc46a');
        g.addColorStop(0.6, '#ff8a1c');
        g.addColorStop(1, '#c4500a');
        c.fillStyle = g;
        c.fill();
        c.strokeStyle = 'rgba(150,60,0,.6)';
        c.lineWidth = 1.5;
        c.stroke();
      }
      circle(c, cx, cy, 7, '#7a8a3a', OUTLINE, 2);
      leaf(c, cx + 4, cy - 2, -0.6, 18, 7, G.mid, G.light, false);
    }
  },
  pineapple(c, st) {
    const cx = S / 2, cy = S / 2, k = [0, 0, 0.6, 0.9, 1][st];
    shade(c, cx, cy, 58 * k);
    rosette(c, 14, 62 * k, 6 * k, '#3f7a4a', '#a8d880', 0);
    if (st === 3) circle(c, cx, cy, 10, '#e0567a', OUTLINE, 2);
    if (st === 4) {
      c.beginPath();
      c.ellipse(cx, cy, 24, 30, 0, 0, Math.PI * 2);
      const g = c.createRadialGradient(cx - 8, cy - 10, 3, cx, cy, 30);
      g.addColorStop(0, '#ffe27a');
      g.addColorStop(1, '#d08a1a');
      c.fillStyle = g;
      c.fill();
      c.save();
      c.clip();
      c.strokeStyle = 'rgba(150,90,10,.7)';
      c.lineWidth = 1.6;
      for (let i = -6; i <= 6; i++) {
        c.beginPath();
        c.moveTo(cx + i * 8 - 30, cy - 34);
        c.lineTo(cx + i * 8 + 30, cy + 34);
        c.moveTo(cx + i * 8 + 30, cy - 34);
        c.lineTo(cx + i * 8 - 30, cy + 34);
        c.stroke();
      }
      c.restore();
      c.strokeStyle = OUTLINE;
      c.lineWidth = 2;
      c.stroke();
      star(c, cx, cy, 8, 16, 5, '#5cb83a', 0.2);
      star(c, cx, cy, 6, 9, 3, '#8fd860', 0.5);
    }
  },
  cotton(c, st) {
    const k = [0, 0, 0.6, 0.9, 1][st];
    for (const [sx, sy] of [[0.36, 0.38], [0.64, 0.62]] as Array<[number, number]>) {
      const x = sx * S, y = sy * S;
      shade(c, x, y, 36 * k);
      rosette(c, 6, 32 * k, 14 * k, '#2f7a3a', '#8fd070', sx);
      if (st === 3) {
        flower(c, x + 14, y - 10, 7, '#fff4c8', '#e8b0c8');
        ball(c, x - 12, y + 10, 7, '#c8f08a', '#7fb04a', '#4f8a2a');
      }
      if (st === 4)
        for (const [dx, dy] of [[0, 0], [16, -14], [-16, 12], [14, 16]] as Array<[number, number]>) {
          star(c, x + dx, y + dy, 4, 12, 5, '#8a5a2e', 0.4);
          for (let i = 0; i < 4; i++) circle(c, x + dx + Math.cos(i * 1.57 + 0.8) * 5, y + dy + Math.sin(i * 1.57 + 0.8) * 5, 6.5, '#ffffff', 'rgba(120,110,100,.5)', 1);
        }
    }
  },
  lavender(c, st) {
    const k = [0, 0, 0.6, 0.9, 1][st];
    const spots: Array<[number, number]> = [[0.3, 0.3], [0.7, 0.3], [0.5, 0.52], [0.3, 0.74], [0.7, 0.74]];
    for (const [sx, sy] of spots) {
      const x = sx * S, y = sy * S;
      shade(c, x, y, 22 * k);
      rosette(c, 8, 22 * k, 4 * k, '#5f8a5a', '#b8d0a8', sx * 3);
      if (st >= 3) {
        for (let i = 0; i < 5; i++) {
          const a = (i / 5) * Math.PI * 2 + sy;
          const px = x + Math.cos(a) * 10, py = y + Math.sin(a) * 10;
          for (let j = 0; j < 3; j++)
            circle(c, px + Math.cos(a) * j * 4, py + Math.sin(a) * j * 4, 3.4 - j * 0.6, st === 4 ? (j % 2 ? '#a87ae8' : '#7a4ad0') : '#a0b890', 'rgba(60,30,90,.4)', 1);
        }
      }
    }
  },
  sunflower(c, st) {
    const cx = S / 2, cy = S / 2, k = [0, 0, 0.6, 0.85, 1][st];
    shade(c, cx, cy, 58 * k);
    for (let i = 0; i < 6; i++) roundLeaf(c, cx, cy, (i / 6) * Math.PI * 2 + 0.3, 38 * k, 16 * k, G.deep, G.light);
    if (st === 3) {
      circle(c, cx, cy, 14, '#6fb83a', OUTLINE, 2);
      star(c, cx, cy, 8, 15, 8, '#5aa83a');
    }
    if (st === 4) {
      for (let layer = 0; layer < 2; layer++)
        for (let i = 0; i < 16; i++) {
          const a = ((i + layer * 0.5) / 16) * Math.PI * 2;
          leaf(c, cx + Math.cos(a) * 18, cy + Math.sin(a) * 18, a, layer ? 22 : 26, 7, layer ? '#f59e0b' : '#ffb81c', layer ? '#ffcf3a' : '#ffe85a', false);
        }
      const g = c.createRadialGradient(cx - 4, cy - 4, 2, cx, cy, 22);
      g.addColorStop(0, '#9a5a22');
      g.addColorStop(1, '#3a1f0c');
      circle(c, cx, cy, 21, g, OUTLINE, 2);
      for (let i = 0; i < 40; i++) {
        const a = i * 2.399, r = Math.sqrt(i) * 3;
        circle(c, cx + Math.cos(a) * r, cy + Math.sin(a) * r, 1.3, '#d89a4a', '', 0);
      }
    }
  },
  tea(c, st) {
    // clipped tea bushes in two rows, glossy small leaves
    const k = [0, 0, 0.6, 0.9, 1][st];
    for (const [sx, sy] of [[0.3, 0.32], [0.7, 0.32], [0.3, 0.7], [0.7, 0.7]] as Array<[number, number]>) {
      const x = sx * S, y = sy * S;
      shade(c, x, y, 26 * k);
      for (let i = 0; i < 9; i++) leaf(c, x, y, (i / 9) * Math.PI * 2 + sx * 4, 20 * k, 7 * k, '#2f6e2a', '#7fd060');
      if (st >= 3) for (let i = 0; i < 3; i++) leaf(c, x, y, i * 2.1 + 0.4, 10, 4.5, '#8fe070', '#d6ffb0');
      if (st === 3) flower(c, x + 9, y - 8, 4.5, '#ffffff', '#ffd23a');
    }
  },
  grape(c, st) {
    const cx = S / 2, cy = S / 2, k = [0, 0, 0.6, 0.9, 1][st];
    // trellis posts and wires seen from above
    c.strokeStyle = '#8a6a44';
    c.lineWidth = 3;
    for (const y of [0.3, 0.7]) {
      c.beginPath();
      c.moveTo(10, y * S);
      c.lineTo(S - 10, y * S);
      c.stroke();
    }
    for (let i = 0; i < 6; i++) roundLeaf(c, cx, cy, (i / 6) * Math.PI * 2 + 0.3, 44 * k, 14 * k, '#3f7a2a', '#9fd860');
    if (st >= 3)
      for (const [dx, dy] of [[-28, -26], [26, -24], [-24, 26], [28, 28]] as Array<[number, number]>) {
        const ripe = st === 4;
        for (let i = 0; i < (ripe ? 9 : 5); i++) {
          const row = Math.floor(Math.sqrt(i * 2));
          ball(c, cx + dx + (i % 3) * 6 - 6, cy + dy + row * 6 - 6, ripe ? 5.5 : 4, ripe ? '#c8a0f0' : '#d6f59a', ripe ? '#7a3ab8' : '#9ad64e', ripe ? '#3e1468' : '#5ea832', 'rgba(30,10,40,.4)');
        }
      }
  },
  coffee(c, st) {
    const cx = S / 2, cy = S / 2, k = [0, 0, 0.6, 0.9, 1][st];
    shade(c, cx, cy, 58 * k);
    // glossy dark leaves in opposite pairs along branches
    for (let b = 0; b < 4; b++) {
      const a = (b / 4) * Math.PI * 2 + 0.4;
      for (let j = 1; j <= 3; j++) {
        const px = cx + Math.cos(a) * j * 15 * k, py = cy + Math.sin(a) * j * 15 * k;
        leaf(c, px, py, a + 1.2, 18 * k, 7 * k, '#1f5a26', '#4ea83a');
        leaf(c, px, py, a - 1.2, 18 * k, 7 * k, '#1f5a26', '#4ea83a');
        if (st === 3 && j === 2) flower(c, px, py, 4, '#ffffff', '#f6f0d0');
        if (st === 4 && j >= 2) for (let q = 0; q < 3; q++) ball(c, px + (q - 1) * 5, py + 3, 4, '#ff9a8a', '#d0281e', '#7a0e0a', 'rgba(0,0,0,.35)');
      }
    }
  },
  dragonfruit(c, st) {
    const cx = S / 2, cy = S / 2, k = [0, 0, 0.6, 0.9, 1][st];
    shade(c, cx, cy, 56 * k);
    // three-ribbed cactus arms
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 + 0.2;
      c.save();
      c.translate(cx, cy);
      c.rotate(a);
      c.beginPath();
      c.ellipse(28 * k, 0, 30 * k, 8 * k, 0, 0, Math.PI * 2);
      c.fillStyle = '#5aa86a';
      c.fill();
      c.strokeStyle = OUTLINE;
      c.lineWidth = 1.6;
      c.stroke();
      c.beginPath();
      c.moveTo(4, 0);
      c.lineTo(56 * k, 0);
      c.strokeStyle = '#9ad8a0';
      c.stroke();
      c.restore();
    }
    if (st === 3) for (const a of [0.8, 3.3]) flower(c, cx + Math.cos(a) * 34, cy + Math.sin(a) * 34, 9, '#fff6e0', '#ffe066');
    if (st === 4)
      for (const a of [0.8, 2.9, 5.0]) {
        const x = cx + Math.cos(a) * 36, y = cy + Math.sin(a) * 36;
        ball(c, x, y, 13, '#ffb0d0', '#f0287a', '#a0104a');
        for (let i = 0; i < 6; i++) leaf(c, x, y, (i / 6) * Math.PI * 2, 10, 4, '#c0e070', '#88c040', false);
      }
  },
  rose(c, st) {
    const cx = S / 2, cy = S / 2, k = [0, 0, 0.6, 0.9, 1][st];
    shade(c, cx, cy, 58 * k);
    for (let i = 0; i < 12; i++) leaf(c, cx, cy, (i / 12) * Math.PI * 2, 46 * k, 10 * k, '#2a6a2e', '#6ab84a');
    const spots: Array<[number, number]> = [[0, 0], [-28, -18], [26, -22], [-22, 26], [28, 22]];
    for (const [dx, dy] of spots) {
      const x = cx + dx, y = cy + dy;
      if (st === 3) ball(c, x, y, 6, '#ff9aaa', '#d82a4a', '#8a1028');
      if (st === 4) {
        // spiral of petals
        for (let r = 3; r >= 0; r--) {
          const R = 5 + r * 3.2;
          for (let p = 0; p < 5; p++) {
            const a = (p / 5) * Math.PI * 2 + r * 0.6;
            circle(c, x + Math.cos(a) * R * 0.45, y + Math.sin(a) * R * 0.45, R * 0.55, r % 2 ? '#e8304e' : '#c41a3a', 'rgba(90,0,20,.4)', 1);
          }
        }
        circle(c, x, y, 3, '#8a0a24', '', 0);
      }
    }
  },
  durian(c, st) {
    const cx = S / 2, cy = S / 2, k = [0, 0, 0.6, 0.9, 1][st];
    shade(c, cx, cy, 60 * k);
    rosette(c, 8, 56 * k, 18 * k, '#2f6e2a', '#8fcf5a', 0.2);
    if (st === 3) ball(c, cx, cy, 14, '#d6f59a', '#9ad64e', '#5ea832');
    if (st === 4) {
      const R = 32;
      ball(c, cx, cy, R, '#e8e070', '#b8b030', '#6e6a14');
      // spikes
      for (let ring = 0; ring < 3; ring++)
        for (let i = 0; i < 6 + ring * 6; i++) {
          const a = (i / (6 + ring * 6)) * Math.PI * 2 + ring;
          const r = ring * 11;
          star(c, cx + Math.cos(a) * r, cy + Math.sin(a) * r, 4, 4.5, 1.6, '#8a8a20', a);
        }
    }
  },
  orchid(c, st) {
    const cx = S / 2, cy = S / 2, k = [0, 0, 0.6, 0.9, 1][st];
    shade(c, cx, cy, 50 * k);
    for (let i = 0; i < 6; i++) leaf(c, cx, cy, (i / 6) * Math.PI * 2 + 0.3, 44 * k, 16 * k, '#2f6a3a', '#7ac070');
    if (st >= 3) {
      // arching flower spike
      c.strokeStyle = '#4f7a3a';
      c.lineWidth = 2.5;
      c.beginPath();
      c.moveTo(cx, cy);
      c.quadraticCurveTo(cx + 30, cy - 40, cx + 46, cy - 10);
      c.stroke();
      const pts: Array<[number, number]> = [[18, -26], [32, -30], [42, -20], [46, -6]];
      for (const [dx, dy] of pts) {
        const x = cx + dx, y = cy + dy;
        if (st === 3) ball(c, x, y, 4, '#f6e8ff', '#c8a0e0', '#8a5ab0');
        else {
          for (let p = 0; p < 5; p++) {
            const a = (p / 5) * Math.PI * 2 - Math.PI / 2;
            c.beginPath();
            c.ellipse(x + Math.cos(a) * 6, y + Math.sin(a) * 6, 6.5, 4.2, a, 0, Math.PI * 2);
            c.fillStyle = p === 2 ? '#a83ac8' : '#f0d8ff';
            c.fill();
            c.strokeStyle = 'rgba(90,30,110,.5)';
            c.lineWidth = 1;
            c.stroke();
          }
          circle(c, x, y, 3, '#ffd23a', '', 0);
        }
      }
    }
  },
  ginseng(c, st) {
    const cx = S / 2, cy = S / 2, k = [0, 0, 0.6, 0.9, 1][st];
    shade(c, cx, cy, 52 * k);
    // palmate leaves: 3 stalks each ending in 5 leaflets
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2 + 0.5;
      const x = cx + Math.cos(a) * 28 * k, y = cy + Math.sin(a) * 28 * k;
      c.strokeStyle = '#4f7a2a';
      c.lineWidth = 2.5;
      c.beginPath();
      c.moveTo(cx, cy);
      c.lineTo(x, y);
      c.stroke();
      for (let j = 0; j < 5; j++) leaf(c, x, y, a + (j - 2) * 0.55, 22 * k, 7 * k, '#2f7a2a', '#9ae070');
    }
    if (st === 3) circle(c, cx, cy, 6, '#c8e07a', OUTLINE, 1.5);
    if (st === 4) {
      for (let i = 0; i < 9; i++) {
        const a = (i / 9) * Math.PI * 2;
        ball(c, cx + Math.cos(a) * 7, cy + Math.sin(a) * 7, 4.5, '#ff9a8a', '#e01e1e', '#800a0a', 'rgba(0,0,0,.35)');
      }
      ball(c, cx, cy, 4.5, '#ff9a8a', '#e01e1e', '#800a0a', 'rgba(0,0,0,.35)');
      // the root shows at the soil
      c.beginPath();
      c.ellipse(cx - 34, cy + 38, 16, 7, 0.5, 0, Math.PI * 2);
      c.fillStyle = '#e8d2a0';
      c.fill();
      c.strokeStyle = OUTLINE;
      c.lineWidth = 1.5;
      c.stroke();
    }
  },
  saffron(c, st) {
    const k = [0, 0, 0.6, 0.9, 1][st];
    const spots: Array<[number, number]> = [[0.28, 0.3], [0.7, 0.28], [0.5, 0.52], [0.3, 0.74], [0.72, 0.72]];
    for (const [sx, sy] of spots) {
      const x = sx * S, y = sy * S;
      shade(c, x, y, 20 * k);
      for (let i = 0; i < 8; i++) leaf(c, x, y, (i / 8) * Math.PI * 2 + sx, 24 * k, 3 * k, '#3f7a3a', '#9ad070', false);
      if (st === 3) ball(c, x, y, 5, '#e8d8ff', '#b890e0', '#6a40a0');
      if (st === 4) {
        for (let p = 0; p < 6; p++) {
          const a = (p / 6) * Math.PI * 2;
          c.beginPath();
          c.ellipse(x + Math.cos(a) * 6, y + Math.sin(a) * 6, 7, 4, a, 0, Math.PI * 2);
          c.fillStyle = p % 2 ? '#9a6ae0' : '#b88af0';
          c.fill();
          c.strokeStyle = 'rgba(60,20,100,.5)';
          c.lineWidth = 1;
          c.stroke();
        }
        // the precious red stigmas
        for (let s = 0; s < 3; s++) {
          const a = (s / 3) * Math.PI * 2 + 0.4;
          c.beginPath();
          c.moveTo(x, y);
          c.lineTo(x + Math.cos(a) * 7, y + Math.sin(a) * 7);
          c.strokeStyle = '#e0201a';
          c.lineWidth = 2.2;
          c.stroke();
        }
      }
    }
  },
  cantaloupe(c, st) {
    const cx = S / 2, cy = S / 2, k = [0, 0, 0.6, 0.9, 1][st];
    c.strokeStyle = '#4f8a2a';
    c.lineWidth = 3;
    for (let i = 0; i < 4; i++) {
      const a = i * 1.57 + 0.2;
      c.beginPath();
      c.moveTo(cx, cy);
      c.quadraticCurveTo(cx + Math.cos(a + 0.6) * 40 * k, cy + Math.sin(a + 0.6) * 40 * k, cx + Math.cos(a) * 64 * k, cy + Math.sin(a) * 64 * k);
      c.stroke();
    }
    for (let i = 0; i < 6; i++) roundLeaf(c, cx, cy, (i / 6) * Math.PI * 2 + 0.5, 40 * k, 13 * k, G.deep, G.light);
    if (st === 3) {
      flower(c, cx + 28, cy - 26, 7, '#ffe03a', '#e0a00a');
      ball(c, cx - 4, cy + 4, 13, '#e0f0b0', '#a8c870', '#6a8a3a');
    }
    if (st === 4)
      for (const [dx, dy, R] of [[-14, -6, 26], [22, 20, 20]] as Array<[number, number, number]>) {
        const x = cx + dx, y = cy + dy;
        ball(c, x, y, R, '#f6efc0', '#d8c48a', '#9a8450');
        // netted rind
        c.save();
        c.beginPath();
        c.arc(x, y, R - 1, 0, Math.PI * 2);
        c.clip();
        c.strokeStyle = 'rgba(255,250,230,.75)';
        c.lineWidth = 1.2;
        for (let i = -4; i <= 4; i++) {
          c.beginPath();
          c.moveTo(x - R, y + i * 6);
          c.lineTo(x + R, y + i * 6 + R * 0.6);
          c.moveTo(x - R, y + i * 6 + R * 0.6);
          c.lineTo(x + R, y + i * 6);
          c.stroke();
        }
        c.restore();
      }
  },
};

const SEED: Record<CropId, string> = {
  carrot: '#e8c48c', wheat: '#f5cf5a', tomato: '#fff0b8', strawberry: '#ffe9a8', potato: '#c9915a', cabbage: '#c9a46a', corn: '#ffd23a', chili: '#fff0c0',
  eggplant: '#f2e2b0', watermelon: '#3a2a1a', pumpkin: '#fff3d0', pineapple: '#8a6a3a', cotton: '#5a4a3a', lavender: '#3a3040', sunflower: '#4a3a2a',
  tea: '#6a4a2a', grape: '#7a5a3a', coffee: '#d8c08a', dragonfruit: '#222222', rose: '#9a7a4a', durian: '#c8a46a', orchid: '#e8e0c8',
  ginseng: '#e01e1e', saffron: '#c8a07a', cantaloupe: '#f0e6c0',
};

// ------------------------------------------------------------------ atlas + quads

export class SpriteLibrary {
  private atlas: DynamicTexture;
  private cells = new Map<string, number>();
  private cache = new Map<string, Mesh>();
  readonly tileMaterial: StandardMaterial;
  readonly cropMaterial: StandardMaterial;

  constructor(private scene: Scene) {
    this.atlas = new DynamicTexture('farm-atlas', { width: ATLAS_W, height: ATLAS_H }, scene, true, Texture.TRILINEAR_SAMPLINGMODE);
    this.atlas.hasAlpha = true;
    this.atlas.wrapU = this.atlas.wrapV = Texture.CLAMP_ADDRESSMODE;
    const c = this.atlas.getContext() as unknown as Ctx;
    c.clearRect(0, 0, ATLAS_W, ATLAS_H);
    let i = 0;
    /** atlas cell <- image url (+ which cell of a 3x2 crop sheet, if it is one) */
    const art: Array<{ cell: number; url: string; part?: number }> = [];
    const paint = (key: string, file: string, fn: (c: Ctx) => void, sheet?: { url?: string; part: number }) => {
      const x = (i % COLS) * CELL + PAD, y = Math.floor(i / COLS) * CELL + PAD;
      c.save();
      c.translate(x, y);
      c.scale(DRAW / S, DRAW / S);
      c.beginPath();
      c.rect(-PAD / 2, -PAD / 2, S + PAD, S + PAD);
      c.clip();
      fn(c);
      c.restore();
      const url = artUrl(file);
      if (url) art.push({ cell: i, url });
      else if (sheet?.url) art.push({ cell: i, url: sheet.url, part: sheet.part });
      this.cells.set(key, i++);
    };
    // file names: see client/src/assets/sprites/README.md
    paint('soil', 'tiles/soil.png', paintSoil);
    for (let v = 0; v < 3; v++) paint(`grass${v}`, `tiles/grass-${v + 1}.png`, (cc) => paintGrass(cc, v));
    for (const crop of CROP_ORDER) {
      const sheet = cropSheetUrl(crop);
      for (let s = 0; s < STAGE_COUNT; s++)
        paint(`crop:${crop}:${s}`, `crops/${crop}/${crop}-${s}.png`, (cc) => {
          if (s === 0) paintSeeds(cc, SEED[crop]);
          else if (s === 1) paintSprout(cc, G.mid, G.light, 1);
          else PAINTERS[crop](cc, s);
        }, { url: sheet, part: s });
    }
    this.atlas.update(true);
    // hand-made PNGs replace their procedural cell as they load
    void Promise.all(
      art.map(async ({ cell, url, part }) => {
        const img = await loadImage(url);
        if (!img) return;
        const x = (cell % COLS) * CELL + PAD, y = Math.floor(cell / COLS) * CELL + PAD;
        c.clearRect(x - PAD, y - PAD, CELL, CELL);
        if (part === undefined) c.drawImage(img, x, y, DRAW, DRAW);
        else {
          // one cell of a 3x2 crop sheet
          const w = img.width / SHEET.cols, h = img.height / SHEET.rows;
          c.drawImage(img, (part % SHEET.cols) * w, Math.floor(part / SHEET.cols) * h, w, h, x, y, DRAW, DRAW);
        }
      }),
    ).then(() => art.length && this.atlas.update(true));

    const mat = (name: string, blend: boolean) => {
      const m = new StandardMaterial(name, scene);
      // unlit: colour comes from the emissive channel, alpha from the diffuse one
      m.diffuseTexture = this.atlas;
      m.emissiveTexture = this.atlas;
      m.useAlphaFromDiffuseTexture = true;
      m.disableLighting = true;
      m.emissiveColor.set(1, 1, 1);
      m.specularColor.set(0, 0, 0);
      m.backFaceCulling = false;
      if (blend) {
        // blend for soft edges, but drop near-empty pixels and write depth, so overlapping
        // plants (sprites larger than their tile) layer by row instead of by draw order
        m.transparencyMode = Material.MATERIAL_ALPHATESTANDBLEND;
        // high cut-off: the faint glow around drawn art must not hide the neighbouring plant
        m.alphaCutOff = 0.45;
        m.forceDepthWrite = true;
        m.alphaMode = Constants.ALPHA_COMBINE;
      } else {
        m.transparencyMode = Material.MATERIAL_ALPHATEST;
        m.alphaCutOff = 0.4;
      }
      return m;
    };
    this.tileMaterial = mat('tile-sprites', false);
    this.cropMaterial = mat('crop-sprites', true);
  }

  /**
   * Quad showing one atlas cell, `size` world units square. Flat on the ground (tiles), or
   * `upright`: standing on the origin and facing the fixed isometric camera (crops), so
   * plants read as standing up. Upright quads sit a little toward the camera so their own
   * soil tile never hides the base of the plant.
   */
  private quad(key: string, size: number, material: Material, upright = false) {
    let mesh = this.cache.get(key);
    if (mesh) return mesh;
    const i = this.cells.get(key)!;
    const x0 = ((i % COLS) * CELL + PAD) / ATLAS_W, x1 = x0 + DRAW / ATLAS_W;
    const yTop = (Math.floor(i / COLS) * CELL + PAD) / ATLAS_H, yBot = yTop + DRAW / ATLAS_H;
    // DynamicTexture is uploaded flipped: canvas top = v 1
    const vTop = 1 - yTop, vBot = 1 - yBot;
    const h = size / 2;
    const vd = new VertexData();
    if (upright) {
      const R = CameraRig.screenRight, U = CameraRig.screenUp;
      const lift = CameraRig.toCamera.scale(0.4);
      const corner = (sx: number, sy: number) => R.scale(sx).addInPlace(U.scale(sy)).addInPlace(lift).asArray();
      // the plant's base sits a little below the cell's bottom edge in the art
      const y0 = -size * 0.1;
      vd.positions = [...corner(-h, y0), ...corner(h, y0), ...corner(h, y0 + size), ...corner(-h, y0 + size)];
      const n = CameraRig.toCamera.asArray();
      vd.normals = [...n, ...n, ...n, ...n];
    } else {
      // +z is "up" in the art
      vd.positions = [-h, 0, -h, h, 0, -h, h, 0, h, -h, 0, h];
      vd.normals = [0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0];
    }
    vd.uvs = [x0, vBot, x1, vBot, x1, vTop, x0, vTop];
    vd.indices = [0, 2, 1, 0, 3, 2];
    mesh = new Mesh(`sprite-${key}`, this.scene);
    vd.applyToMesh(mesh);
    mesh.material = material;
    mesh.isVisible = false;
    mesh.isPickable = false;
    this.cache.set(key, mesh);
    return mesh;
  }

  soil(size: number) {
    return this.quad('soil', size, this.tileMaterial);
  }

  grass(variant: number, size: number) {
    return this.quad(`grass${variant % 3}`, size, this.tileMaterial);
  }

  crop(crop: CropId, stage: number, size: number) {
    return this.quad(`crop:${crop}:${Math.max(0, Math.min(STAGE_COUNT - 1, stage))}`, size, this.cropMaterial, true);
  }
}
