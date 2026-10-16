import { Constants } from '@babylonjs/core/Engines/constants.js';
import { Material } from '@babylonjs/core/Materials/material.js';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial.js';
import { DynamicTexture } from '@babylonjs/core/Materials/Textures/dynamicTexture.js';
import { Texture } from '@babylonjs/core/Materials/Textures/texture.js';
import { Mesh } from '@babylonjs/core/Meshes/mesh.js';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData.js';
import { Scene } from '@babylonjs/core/scene.js';
import { artUrl, loadImage } from '../art';
import { CameraRig } from './camera';

/**
 * Small camera-facing pictures that are not crops: the "ripe" bubble over
 * harvestable tiles, the farm animals and the bubbles showing their products.
 * Painted once on a canvas texture of its own.
 */

/** Animal pictures come in 12 poses (see animals.ts): `chicken:0` … `cow:11`. */
export const ANIMAL_FRAMES = 12;
/**
 * Pen furniture and products lying on the ground. Drawn from assets/sprites/props/<key>.png
 * when provided (feeders and water in a full and an "-empty" state); a few have a painted
 * stand-in until then.
 */
export type Prop =
  | 'coop' | 'hay' | 'doghouse'
  | 'chicken-feeder' | 'chicken-feeder-empty' | 'chicken-water' | 'chicken-water-empty'
  | 'cow-feeder' | 'cow-feeder-empty' | 'cow-water' | 'cow-water-empty'
  | 'egg-nest' | 'milk-can' | 'workshop' | 'sprinkler';
const PROPS: Prop[] = ['workshop', 'sprinkler', 'coop', 'hay', 'doghouse', 'chicken-feeder', 'chicken-feeder-empty', 'chicken-water', 'chicken-water-empty', 'cow-feeder', 'cow-feeder-empty', 'cow-water', 'cow-water-empty', 'egg-nest', 'milk-can'];
/** Ground products fall back to the UI icons until their own picture is provided. */
const PROP_FALLBACK: Partial<Record<Prop, string>> = { 'egg-nest': 'ui/egg.png', 'milk-can': 'ui/milk.png' };
type Picture = 'ripe' | 'chicken' | 'cow' | 'egg' | 'milk' | 'hungry' | 'coop' | 'hay' | 'doghouse' | 'feeder' | 'trough';
export type BillboardKey = 'ripe' | 'egg' | 'milk' | 'hungry' | 'goods' | Prop | `${'chicken' | 'cow'}:${number}`;
const KEYS: BillboardKey[] = ['ripe', 'egg', 'milk', 'hungry', 'goods', ...PROPS, ...(['chicken', 'cow'] as const).flatMap((a) => [...Array(ANIMAL_FRAMES).keys()].map((f) => `${a}:${f}` as const))];
const CELL = 256;
/** Cells per row of the texture (2048 px wide: fine for any mobile GPU). */
const COLS = 8;
const ROWS = Math.ceil(KEYS.length / COLS);
const cellX = (i: number) => (i % COLS) * CELL;
const cellY = (i: number) => Math.floor(i / COLS) * CELL;
const OUT = '#5a3214';
/** Bubbles whose picture comes from the hand-drawn UI art when it is provided. */
const BUBBLE_ART: Partial<Record<string, string>> = { ripe: 'ui/harvest.png', egg: 'ui/egg.png', milk: 'ui/milk.png', hungry: 'ui/feed-bowl.png', goods: 'ui/bread.png' };

type Ctx = CanvasRenderingContext2D;

function bubble(c: Ctx, inner: (c: Ctx) => void) {
  // round bubble with a little pointer at the bottom, content centred at (128, 108)
  c.lineWidth = 12;
  c.strokeStyle = OUT;
  c.fillStyle = '#fffdf3';
  c.beginPath();
  c.arc(128, 108, 88, 0.62 * Math.PI, 0.38 * Math.PI);
  c.lineTo(128, 236);
  c.closePath();
  c.fill();
  c.stroke();
  c.save();
  inner(c);
  c.restore();
}

function star(c: Ctx, x: number, y: number, r: number) {
  c.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5, rr = i % 2 ? r * 0.45 : r;
    c.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  c.closePath();
}

/** Soft contact shadow under a prop standing on the bottom edge. */
function groundShadow(c: Ctx, w: number) {
  c.fillStyle = 'rgba(40,30,10,.22)';
  c.beginPath();
  c.ellipse(128, 238, w, 12, 0, 0, Math.PI * 2);
  c.fill();
}

function outlined(c: Ctx, fill: string, path: () => void, width = 7) {
  c.beginPath();
  path();
  c.fillStyle = fill;
  c.fill();
  c.lineWidth = width;
  c.strokeStyle = OUT;
  c.lineJoin = 'round';
  c.stroke();
}

/** Draw a picture cropped to its visible pixels, as large as fits, standing on the cell's bottom edge. */
function standOnBottom(c: Ctx, img: HTMLImageElement) {
  const w = img.width, h = img.height;
  const probe = document.createElement('canvas');
  probe.width = w;
  probe.height = h;
  const pc = probe.getContext('2d')!;
  pc.drawImage(img, 0, 0);
  const d = pc.getImageData(0, 0, w, h).data;
  let x0 = w, y0 = h, x1 = 0, y1 = 0;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      if (d[(y * w + x) * 4 + 3] > 40) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
  if (x1 <= x0) return;
  const bw = x1 - x0 + 1, bh = y1 - y0 + 1, k = 256 / Math.max(bw, bh);
  c.drawImage(img, x0, y0, bw, bh, (256 - bw * k) / 2, 256 - bh * k, bw * k, bh * k);
}

const PAINT: Record<Picture, (c: Ctx) => void> = {
  hungry(c) {
    // an empty bowl with a few grains: "feed me"
    bubble(c, (c) => {
      outlined(c, '#c98a4a', () => {
        c.moveTo(52, 110);
        c.lineTo(204, 110);
        c.quadraticCurveTo(196, 170, 128, 172);
        c.quadraticCurveTo(60, 170, 52, 110);
        c.closePath();
      }, 8);
      outlined(c, '#7a4a22', () => c.ellipse(128, 110, 76, 16, 0, 0, Math.PI * 2), 6);
      c.fillStyle = '#f2c94c';
      for (const [x, y] of [[104, 108], [126, 112], [148, 106], [116, 104]]) {
        c.beginPath();
        c.ellipse(x, y, 7, 4, 0.4, 0, Math.PI * 2);
        c.fill();
      }
      c.fillStyle = '#e8463a';
      c.font = 'bold 54px sans-serif';
      c.textAlign = 'center';
      c.fillText('!', 128, 74);
    });
  },
  doghouse(c) {
    groundShadow(c, 100);
    outlined(c, '#b07a45', () => c.roundRect(48, 116, 160, 116, 8));
    c.strokeStyle = 'rgba(70,35,10,.35)';
    c.lineWidth = 3;
    for (const y of [146, 176, 206]) {
      c.beginPath();
      c.moveTo(54, y);
      c.lineTo(202, y);
      c.stroke();
    }
    outlined(c, '#d9473a', () => {
      c.moveTo(30, 126);
      c.lineTo(128, 44);
      c.lineTo(226, 126);
      c.closePath();
    });
    outlined(c, '#3a2414', () => {
      c.moveTo(98, 232);
      c.lineTo(98, 184);
      c.arc(128, 184, 30, Math.PI, 0);
      c.lineTo(158, 232);
      c.closePath();
    }, 6);
    // the dog peeking out
    outlined(c, '#e8b878', () => c.ellipse(128, 206, 22, 20, 0, 0, Math.PI * 2), 5);
    c.fillStyle = OUT;
    for (const x of [120, 136]) {
      c.beginPath();
      c.arc(x, 200, 3.5, 0, Math.PI * 2);
      c.fill();
    }
    c.beginPath();
    c.ellipse(128, 212, 5, 3.5, 0, 0, Math.PI * 2);
    c.fill();
    outlined(c, '#fff3dc', () => c.roundRect(104, 92, 48, 18, 5), 4);
  },
  coop(c) {
    groundShadow(c, 104);
    // stilts
    c.fillStyle = '#6b4220';
    for (const x of [62, 186]) c.fillRect(x, 200, 12, 38);
    // walls with planks
    outlined(c, '#c8553a', () => c.roundRect(46, 112, 164, 98, 8));
    c.strokeStyle = 'rgba(90,30,20,.35)';
    c.lineWidth = 3;
    for (let x = 70; x < 206; x += 22) {
      c.beginPath();
      c.moveTo(x, 118);
      c.lineTo(x, 206);
      c.stroke();
    }
    // white trim on the corners
    c.fillStyle = '#fff3dc';
    c.fillRect(48, 114, 9, 94);
    c.fillRect(199, 114, 9, 94);
    // roof
    outlined(c, '#7a4a2a', () => {
      c.moveTo(28, 124);
      c.lineTo(128, 34);
      c.lineTo(228, 124);
      c.closePath();
    });
    c.strokeStyle = 'rgba(40,20,8,.35)';
    c.lineWidth = 4;
    for (const y of [70, 96]) {
      const half = ((y - 34) / 90) * 100;
      c.beginPath();
      c.moveTo(128 - half, y);
      c.lineTo(128 + half, y);
      c.stroke();
    }
    // round window in the gable
    outlined(c, '#ffe9a8', () => c.arc(128, 92, 13, 0, Math.PI * 2), 5);
    // arched door with a ramp
    outlined(c, '#3a2414', () => {
      c.moveTo(106, 210);
      c.lineTo(106, 168);
      c.arc(128, 168, 22, Math.PI, 0);
      c.lineTo(150, 210);
      c.closePath();
    }, 6);
    outlined(c, '#c99a5e', () => {
      c.moveTo(108, 208);
      c.lineTo(150, 208);
      c.lineTo(168, 240);
      c.lineTo(122, 240);
      c.closePath();
    }, 5);
    // straw spilling out of the door
    c.strokeStyle = '#f0d27a';
    c.lineWidth = 3;
    for (let i = 0; i < 9; i++) {
      c.beginPath();
      c.moveTo(100 + i * 7, 236 - (i % 3) * 2);
      c.lineTo(108 + i * 7, 228 + (i % 2) * 6);
      c.stroke();
    }
  },
  feeder(c) {
    groundShadow(c, 96);
    outlined(c, '#a86c38', () => {
      c.moveTo(30, 170);
      c.lineTo(226, 170);
      c.lineTo(206, 226);
      c.lineTo(50, 226);
      c.closePath();
    });
    // grain heaped in the tray
    outlined(c, '#f2c94c', () => c.ellipse(128, 170, 96, 22, 0, Math.PI, 0), 5);
    c.fillStyle = '#d9a52c';
    for (let i = 0; i < 26; i++) {
      c.beginPath();
      c.arc(52 + ((i * 37) % 152), 156 + ((i * 13) % 14), 3.2, 0, Math.PI * 2);
      c.fill();
    }
    c.strokeStyle = 'rgba(70,35,10,.4)';
    c.lineWidth = 3;
    c.beginPath();
    c.moveTo(44, 198);
    c.lineTo(212, 198);
    c.stroke();
  },
  hay(c) {
    // a round bale lying on its side: the body, then the rolled-up end facing the viewer
    groundShadow(c, 108);
    outlined(c, '#e2b648', () => c.roundRect(26, 104, 150, 132, 40));
    c.strokeStyle = 'rgba(150,100,20,.45)';
    c.lineWidth = 3;
    for (let i = 0; i < 7; i++) {
      const y = 122 + i * 16;
      c.beginPath();
      c.moveTo(40, y);
      c.quadraticCurveTo(100, y - 8 + (i % 2) * 10, 160, y);
      c.stroke();
    }
    outlined(c, '#f3d77a', () => c.ellipse(170, 170, 60, 66, 0, 0, Math.PI * 2));
    c.strokeStyle = 'rgba(170,120,30,.6)';
    c.lineWidth = 4;
    c.beginPath();
    for (let a = 0; a < Math.PI * 7; a += 0.2) {
      const k = a / (Math.PI * 7);
      const x = 170 + Math.cos(a) * 54 * k, y = 170 + Math.sin(a) * 60 * k;
      if (a === 0) c.moveTo(x, y);
      else c.lineTo(x, y);
    }
    c.stroke();
    // twine around the body
    c.strokeStyle = '#9a5a26';
    c.lineWidth = 6;
    for (const x of [70, 120]) {
      c.beginPath();
      c.moveTo(x, 106);
      c.lineTo(x, 234);
      c.stroke();
    }
    // loose wisps
    c.strokeStyle = '#fbe7a6';
    c.lineWidth = 3;
    for (let i = 0; i < 6; i++) {
      c.beginPath();
      c.moveTo(48 + i * 22, 108);
      c.lineTo(56 + i * 22, 90 + (i % 2) * 8);
      c.stroke();
    }
  },
  trough(c) {
    groundShadow(c, 110);
    // legs
    c.fillStyle = '#6b4220';
    for (const x of [44, 198]) c.fillRect(x, 196, 14, 42);
    // box, water surface, planks
    outlined(c, '#a86c38', () => {
      c.moveTo(22, 140);
      c.lineTo(234, 140);
      c.lineTo(220, 210);
      c.lineTo(36, 210);
      c.closePath();
    });
    outlined(c, '#62b8f2', () => c.ellipse(128, 142, 104, 16, 0, 0, Math.PI * 2), 5);
    c.fillStyle = 'rgba(255,255,255,.7)';
    c.beginPath();
    c.ellipse(96, 138, 30, 4, 0, 0, Math.PI * 2);
    c.ellipse(160, 145, 18, 3, 0, 0, Math.PI * 2);
    c.fill();
    c.strokeStyle = 'rgba(70,35,10,.4)';
    c.lineWidth = 3;
    for (const y of [168, 190]) {
      c.beginPath();
      c.moveTo(30 + (y - 140) * 0.2, y);
      c.lineTo(226 - (y - 140) * 0.2, y);
      c.stroke();
    }
  },
  ripe(c) {
    bubble(c, (c) => {
      c.fillStyle = '#ffd23f';
      c.strokeStyle = OUT;
      c.lineWidth = 9;
      star(c, 128, 110, 62);
      c.fill();
      c.stroke();
      c.fillStyle = '#fff6b8';
      star(c, 116, 98, 18);
      c.fill();
    });
  },
  egg(c) {
    bubble(c, (c) => {
      c.fillStyle = '#fff4dc';
      c.strokeStyle = OUT;
      c.lineWidth = 9;
      c.beginPath();
      c.ellipse(128, 112, 46, 60, 0, 0, Math.PI * 2);
      c.fill();
      c.stroke();
      c.fillStyle = '#ffffff';
      c.beginPath();
      c.ellipse(110, 90, 11, 20, 0.3, 0, Math.PI * 2);
      c.fill();
    });
  },
  milk(c) {
    bubble(c, (c) => {
      c.strokeStyle = OUT;
      c.lineWidth = 9;
      c.fillStyle = '#ffffff';
      c.beginPath();
      c.moveTo(106, 40);
      c.lineTo(150, 40);
      c.lineTo(150, 62);
      c.lineTo(168, 86);
      c.lineTo(168, 168);
      c.lineTo(88, 168);
      c.lineTo(88, 86);
      c.lineTo(106, 62);
      c.closePath();
      c.fill();
      c.stroke();
      c.fillStyle = '#6fb6ff';
      c.fillRect(92, 110, 72, 34);
      c.fillStyle = '#e8463a';
      c.fillRect(104, 36, 48, 14);
    });
  },
  chicken(c) {
    // side view facing right, feet at the bottom centre
    c.lineWidth = 9;
    c.strokeStyle = OUT;
    c.lineJoin = 'round';
    // legs
    c.strokeStyle = '#e8961e';
    c.lineWidth = 10;
    c.beginPath();
    c.moveTo(110, 200);
    c.lineTo(106, 246);
    c.moveTo(146, 200);
    c.lineTo(150, 246);
    c.stroke();
    c.strokeStyle = OUT;
    c.lineWidth = 9;
    // tail
    c.fillStyle = '#f4ece0';
    c.beginPath();
    c.moveTo(60, 150);
    c.quadraticCurveTo(28, 90, 50, 70);
    c.quadraticCurveTo(80, 100, 90, 120);
    c.closePath();
    c.fill();
    c.stroke();
    // body
    c.fillStyle = '#fffaf0';
    c.beginPath();
    c.ellipse(124, 160, 72, 54, 0, 0, Math.PI * 2);
    c.fill();
    c.stroke();
    // head
    c.beginPath();
    c.ellipse(178, 100, 38, 40, 0, 0, Math.PI * 2);
    c.fill();
    c.stroke();
    // comb + wattle
    c.fillStyle = '#e8463a';
    c.beginPath();
    c.arc(166, 60, 13, 0, Math.PI * 2);
    c.arc(186, 56, 13, 0, Math.PI * 2);
    c.fill();
    c.beginPath();
    c.ellipse(204, 128, 9, 14, 0, 0, Math.PI * 2);
    c.fill();
    // beak
    c.fillStyle = '#ffb02e';
    c.beginPath();
    c.moveTo(210, 96);
    c.lineTo(240, 106);
    c.lineTo(210, 116);
    c.closePath();
    c.fill();
    c.stroke();
    // eye
    c.fillStyle = OUT;
    c.beginPath();
    c.arc(188, 94, 7, 0, Math.PI * 2);
    c.fill();
    // wing
    c.strokeStyle = '#d9cbb4';
    c.beginPath();
    c.moveTo(92, 158);
    c.quadraticCurveTo(124, 196, 156, 160);
    c.stroke();
  },
  cow(c) {
    c.lineJoin = 'round';
    c.lineWidth = 9;
    c.strokeStyle = OUT;
    // legs
    c.fillStyle = '#ffffff';
    for (const x of [50, 82, 160, 192]) {
      c.beginPath();
      c.rect(x - 11, 170, 22, 74);
      c.fill();
      c.stroke();
      c.fillStyle = '#3a2a22';
      c.fillRect(x - 11, 232, 22, 12);
      c.fillStyle = '#ffffff';
    }
    // tail
    c.beginPath();
    c.moveTo(24, 110);
    c.quadraticCurveTo(6, 150, 16, 178);
    c.stroke();
    // body
    c.beginPath();
    c.roundRect(20, 84, 196, 112, 46);
    c.fill();
    c.stroke();
    c.fillStyle = '#3a2a22';
    c.beginPath();
    c.ellipse(72, 120, 30, 22, 0.3, 0, Math.PI * 2);
    c.ellipse(150, 160, 26, 18, -0.2, 0, Math.PI * 2);
    c.fill();
    // udder
    c.fillStyle = '#ffb7c0';
    c.beginPath();
    c.ellipse(130, 198, 22, 12, 0, 0, Math.PI * 2);
    c.fill();
    // head
    c.fillStyle = '#ffffff';
    c.beginPath();
    c.ellipse(212, 92, 40, 46, 0, 0, Math.PI * 2);
    c.fill();
    c.stroke();
    // horns + ear
    c.fillStyle = '#f4e3b8';
    c.beginPath();
    c.ellipse(196, 42, 9, 16, -0.4, 0, Math.PI * 2);
    c.ellipse(228, 42, 9, 16, 0.4, 0, Math.PI * 2);
    c.fill();
    c.stroke();
    // muzzle
    c.fillStyle = '#ffb7c0';
    c.beginPath();
    c.ellipse(222, 120, 30, 22, 0, 0, Math.PI * 2);
    c.fill();
    c.stroke();
    c.fillStyle = OUT;
    c.beginPath();
    c.arc(212, 120, 5, 0, Math.PI * 2);
    c.arc(232, 120, 5, 0, Math.PI * 2);
    c.fill();
    c.beginPath();
    c.arc(220, 82, 7, 0, Math.PI * 2);
    c.fill();
  },
};

export class Billboards {
  private tex: DynamicTexture;
  private cache = new Map<string, Mesh>();
  readonly material: StandardMaterial;

  constructor(private scene: Scene) {
    this.tex = new DynamicTexture('billboards', { width: CELL * COLS, height: CELL * ROWS }, scene, true, Texture.TRILINEAR_SAMPLINGMODE);
    this.tex.hasAlpha = true;
    this.tex.wrapU = this.tex.wrapV = Texture.CLAMP_ADDRESSMODE;
    const c = this.tex.getContext() as unknown as Ctx;
    c.clearRect(0, 0, CELL * COLS, CELL * ROWS);
    // a little inset so trilinear sampling never bleeds a neighbour in
    const inCell = (i: number, draw: () => void) => {
      c.clearRect(cellX(i), cellY(i), CELL, CELL);
      c.save();
      c.translate(cellX(i) + CELL * 0.03, cellY(i) + CELL * 0.03);
      c.scale(0.94, 0.94);
      draw();
      c.restore();
    };
    // painted stand-ins: props without one stay blank until their picture loads
    const STAND_IN: Partial<Record<string, Picture>> = { goods: 'ripe',  'chicken-feeder': 'feeder', 'chicken-feeder-empty': 'feeder', 'cow-water': 'trough', 'cow-water-empty': 'trough', 'egg-nest': 'egg', 'milk-can': 'milk' };
    KEYS.forEach((k, i) => {
      const pic = (STAND_IN[k] ?? k.split(':')[0]) as Picture;
      if (PAINT[pic]) inCell(i, () => PAINT[pic](c));
    });
    this.tex.update(true);
    // hand-drawn pictures replace the painted ones as they load: bubbles keep their frame,
    // animal poses fill the cell (animals/<id>/frame-<n>, made by scripts/art.mjs)
    KEYS.forEach((k, i) => {
      const [name, frame] = k.split(':');
      const prop = PROPS.includes(k as Prop);
      const url = frame !== undefined
        ? artUrl(`animals/${name}/frame-${frame}.png`)
        : prop
          ? artUrl(`props/${k}.png`) ?? (PROP_FALLBACK[k as Prop] && artUrl(PROP_FALLBACK[k as Prop]!))
          : BUBBLE_ART[k] && artUrl(BUBBLE_ART[k]!);
      if (!url) return;
      void loadImage(url).then((img) => {
        if (!img) return;
        inCell(i, () => {
          if (frame !== undefined) c.drawImage(img, 0, 0, CELL, CELL);
          else if (prop) standOnBottom(c, img);
          else bubble(c, (c) => c.drawImage(img, 128 - 66, 108 - 66, 132, 132));
        });
        this.tex.update(true);
      });
    });
    const m = new StandardMaterial('billboard-mat', scene);
    m.diffuseTexture = this.tex;
    m.emissiveTexture = this.tex;
    m.useAlphaFromDiffuseTexture = true;
    m.disableLighting = true;
    m.emissiveColor.set(1, 1, 1);
    m.specularColor.set(0, 0, 0);
    m.backFaceCulling = false;
    m.transparencyMode = Material.MATERIAL_ALPHATESTANDBLEND;
    m.alphaCutOff = 0.4;
    m.forceDepthWrite = true;
    m.alphaMode = Constants.ALPHA_COMBINE;
    this.material = m;
  }

  /**
   * Template quad (invisible) facing the camera. `bottom`: the picture stands on the
   * origin (animals); otherwise it floats centred on it (bubbles). `onTop` draws it
   * after everything else (rendering group 1).
   */
  quad(key: BillboardKey, size: number, opts: { bottom?: boolean; onTop?: boolean; flip?: boolean } = {}) {
    const id = `${key}:${size}:${opts.bottom ? 1 : 0}:${opts.onTop ? 1 : 0}:${opts.flip ? 1 : 0}`;
    let mesh = this.cache.get(id);
    if (mesh) return mesh;
    const i = KEYS.indexOf(key);
    const a = cellX(i) / (CELL * COLS), b = (cellX(i) + CELL) / (CELL * COLS);
    // `flip` mirrors the picture (an animal walking the other way)
    const [u0, u1] = opts.flip ? [b, a] : [a, b];
    // DynamicTexture is uploaded flipped: canvas top = v 1
    const vTop = 1 - cellY(i) / (CELL * ROWS), vBot = 1 - (cellY(i) + CELL) / (CELL * ROWS);
    const R = CameraRig.screenRight, U = CameraRig.screenUp;
    const h = size / 2;
    const y0 = opts.bottom ? -size * 0.04 : -h;
    const corner = (sx: number, sy: number) => R.scale(sx).addInPlace(U.scale(sy)).asArray();
    const vd = new VertexData();
    vd.positions = [...corner(-h, y0), ...corner(h, y0), ...corner(h, y0 + size), ...corner(-h, y0 + size)];
    const nrm = CameraRig.toCamera.asArray();
    vd.normals = [...nrm, ...nrm, ...nrm, ...nrm];
    vd.uvs = [u0, vBot, u1, vBot, u1, vTop, u0, vTop];
    vd.indices = [0, 2, 1, 0, 3, 2];
    mesh = new Mesh(`billboard-${id}`, this.scene);
    vd.applyToMesh(mesh);
    mesh.material = this.material;
    mesh.isVisible = false;
    mesh.isPickable = false;
    if (opts.onTop) mesh.renderingGroupId = 1;
    this.cache.set(id, mesh);
    return mesh;
  }
}
