import { Constants } from '@babylonjs/core/Engines/constants.js';
import { Material } from '@babylonjs/core/Materials/material.js';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial.js';
import { DynamicTexture } from '@babylonjs/core/Materials/Textures/dynamicTexture.js';
import { Texture } from '@babylonjs/core/Materials/Textures/texture.js';
import { Mesh } from '@babylonjs/core/Meshes/mesh.js';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData.js';
import { Scene } from '@babylonjs/core/scene.js';
import { CameraRig } from './camera';

/**
 * Small camera-facing pictures that are not crops: the "ripe" bubble over
 * harvestable tiles, the farm animals and the bubbles showing their products.
 * Painted once on a canvas texture of its own.
 */

export type BillboardKey = 'ripe' | 'chicken' | 'cow' | 'egg' | 'milk';
const KEYS: BillboardKey[] = ['ripe', 'chicken', 'cow', 'egg', 'milk'];
const CELL = 256;
const OUT = '#5a3214';

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

const PAINT: Record<BillboardKey, (c: Ctx) => void> = {
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
    this.tex = new DynamicTexture('billboards', { width: CELL * KEYS.length, height: CELL }, scene, true, Texture.TRILINEAR_SAMPLINGMODE);
    this.tex.hasAlpha = true;
    this.tex.wrapU = this.tex.wrapV = Texture.CLAMP_ADDRESSMODE;
    const c = this.tex.getContext() as unknown as Ctx;
    c.clearRect(0, 0, CELL * KEYS.length, CELL);
    KEYS.forEach((k, i) => {
      c.save();
      c.translate(i * CELL, 0);
      // a little inset so trilinear sampling never bleeds a neighbour in
      c.translate(CELL * 0.03, CELL * 0.03);
      c.scale(0.94, 0.94);
      PAINT[k](c);
      c.restore();
    });
    this.tex.update(true);
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
    const n = KEYS.length;
    // `flip` mirrors the picture (an animal walking the other way)
    const [u0, u1] = opts.flip ? [(i + 1) / n, i / n] : [i / n, (i + 1) / n];
    const R = CameraRig.screenRight, U = CameraRig.screenUp;
    const h = size / 2;
    const y0 = opts.bottom ? -size * 0.04 : -h;
    const corner = (sx: number, sy: number) => R.scale(sx).addInPlace(U.scale(sy)).asArray();
    const vd = new VertexData();
    vd.positions = [...corner(-h, y0), ...corner(h, y0), ...corner(h, y0 + size), ...corner(-h, y0 + size)];
    const nrm = CameraRig.toCamera.asArray();
    vd.normals = [...nrm, ...nrm, ...nrm, ...nrm];
    // DynamicTexture is uploaded flipped: canvas top = v 1
    vd.uvs = [u0, 0, u1, 0, u1, 1, u0, 1];
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
