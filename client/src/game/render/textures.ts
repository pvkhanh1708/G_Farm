import { DynamicTexture, Scene, Texture } from '@babylonjs/core';

/**
 * Procedurally painted textures (no external files). These are stand-ins for
 * hand-painted texture assets; see ASSETS.md.
 */

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function makeTex(scene: Scene, name: string, size: number, paint: (ctx: CanvasRenderingContext2D, size: number) => void, alpha = false) {
  const tex = new DynamicTexture(name, { width: size, height: size }, scene, true, Texture.TRILINEAR_SAMPLINGMODE);
  const ctx = tex.getContext() as unknown as CanvasRenderingContext2D;
  paint(ctx, size);
  tex.hasAlpha = alpha;
  tex.anisotropicFilteringLevel = 8;
  tex.update(true);
  return tex;
}

/** Paint with wrap-around so the texture tiles seamlessly. */
function blobWrapped(ctx: CanvasRenderingContext2D, size: number, x: number, y: number, r: number, fill: string | CanvasGradient) {
  for (const dx of [-size, 0, size])
    for (const dy of [-size, 0, size]) {
      const cx = x + dx;
      const cy = y + dy;
      if (cx + r < 0 || cy + r < 0 || cx - r > size || cy - r > size) continue;
      ctx.fillStyle = fill;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();
    }
}

export function grassTexture(scene: Scene) {
  return makeTex(scene, 'tex-grass', 512, (ctx, S) => {
    const r = rng(7);
    ctx.fillStyle = '#62ab3e';
    ctx.fillRect(0, 0, S, S);
    // soft large mottling
    for (let i = 0; i < 70; i++) {
      const light = r() > 0.5;
      ctx.globalAlpha = 0.09;
      blobWrapped(ctx, S, r() * S, r() * S, 20 + r() * 50, light ? '#9ad35a' : '#3f8a2a');
    }
    // blade strokes
    ctx.lineCap = 'round';
    for (let i = 0; i < 2600; i++) {
      const x = r() * S;
      const y = r() * S;
      const len = 4 + r() * 9;
      const a = -Math.PI / 2 + (r() - 0.5) * 0.9;
      const t = r();
      ctx.globalAlpha = 0.35 + r() * 0.35;
      ctx.strokeStyle = t < 0.4 ? '#8fcc4e' : t < 0.75 ? '#4b9a2e' : '#acdc66';
      ctx.lineWidth = 1 + r() * 1.4;
      for (const dx of [-S, 0, S])
        for (const dy of [-S, 0, S]) {
          ctx.beginPath();
          ctx.moveTo(x + dx, y + dy);
          ctx.lineTo(x + dx + Math.cos(a) * len, y + dy + Math.sin(a) * len);
          ctx.stroke();
        }
    }
    ctx.globalAlpha = 1;
  });
}

export function soilTexture(scene: Scene) {
  return makeTex(scene, 'tex-soil', 512, (ctx, S) => {
    const r = rng(21);
    ctx.fillStyle = '#8a5a35';
    ctx.fillRect(0, 0, S, S);
    for (let i = 0; i < 90; i++) {
      ctx.globalAlpha = 0.12;
      blobWrapped(ctx, S, r() * S, r() * S, 12 + r() * 40, r() > 0.5 ? '#a8714a' : '#6a4026');
    }
    // clods with a lit top edge
    for (let i = 0; i < 520; i++) {
      const x = r() * S;
      const y = r() * S;
      const rad = 1.5 + r() * 5;
      ctx.globalAlpha = 0.55;
      blobWrapped(ctx, S, x, y + 1.2, rad, '#583421');
      ctx.globalAlpha = 0.65;
      blobWrapped(ctx, S, x, y, rad * 0.85, r() > 0.5 ? '#9c6840' : '#b07a4c');
    }
    // pebbles & specks
    for (let i = 0; i < 900; i++) {
      ctx.globalAlpha = 0.5 + r() * 0.4;
      blobWrapped(ctx, S, r() * S, r() * S, 0.6 + r() * 1.3, r() > 0.7 ? '#d9b48a' : '#4a2b19');
    }
    ctx.globalAlpha = 1;
  });
}

export function pathTexture(scene: Scene) {
  // U runs along the path, V across it; alpha fades at the edges.
  return makeTex(
    scene,
    'tex-path',
    256,
    (ctx, S) => {
      const r = rng(5);
      ctx.clearRect(0, 0, S, S);
      const g = ctx.createLinearGradient(0, 0, 0, S);
      g.addColorStop(0, 'rgba(196,150,96,0)');
      g.addColorStop(0.2, 'rgba(196,150,96,0.95)');
      g.addColorStop(0.8, 'rgba(196,150,96,0.95)');
      g.addColorStop(1, 'rgba(196,150,96,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, S, S);
      ctx.globalCompositeOperation = 'source-atop';
      for (let i = 0; i < 500; i++) {
        ctx.globalAlpha = 0.25 + r() * 0.4;
        ctx.fillStyle = r() > 0.5 ? '#a87a4b' : '#ddb985';
        ctx.beginPath();
        ctx.arc(r() * S, r() * S, 0.8 + r() * 3, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
    },
    true,
  );
}

export function woodTexture(scene: Scene) {
  return makeTex(scene, 'tex-wood', 256, (ctx, S) => {
    const r = rng(11);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, S, S);
    for (let i = 0; i < 60; i++) {
      const y = r() * S;
      ctx.globalAlpha = 0.08 + r() * 0.12;
      ctx.strokeStyle = r() > 0.4 ? '#7a5a40' : '#ffffff';
      ctx.lineWidth = 1 + r() * 3;
      ctx.beginPath();
      ctx.moveTo(0, y);
      for (let x = 0; x <= S; x += 16) ctx.lineTo(x, y + Math.sin(x * 0.05 + i) * 2);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  });
}

/** Subtle greyscale grain to break up flat vertex-coloured props. */
export function grainTexture(scene: Scene) {
  return makeTex(scene, 'tex-grain', 256, (ctx, S) => {
    const r = rng(3);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, S, S);
    for (let i = 0; i < 1400; i++) {
      ctx.globalAlpha = 0.05 + r() * 0.07;
      blobWrapped(ctx, S, r() * S, r() * S, 1 + r() * 6, '#5c5c5c');
    }
    ctx.globalAlpha = 1;
  });
}

export function sparkleTexture(scene: Scene) {
  return makeTex(
    scene,
    'tex-sparkle',
    128,
    (ctx, S) => {
      const c = S / 2;
      const glow = ctx.createRadialGradient(c, c, 0, c, c, c);
      glow.addColorStop(0, 'rgba(255,255,255,1)');
      glow.addColorStop(0.15, 'rgba(255,250,220,0.8)');
      glow.addColorStop(0.45, 'rgba(255,240,180,0.15)');
      glow.addColorStop(1, 'rgba(255,240,180,0)');
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, S, S);
      ctx.fillStyle = 'rgba(255,255,255,0.95)';
      ctx.beginPath();
      const arm = c * 0.95;
      const w = c * 0.09;
      ctx.moveTo(c, c - arm);
      ctx.quadraticCurveTo(c + w, c - w, c + arm, c);
      ctx.quadraticCurveTo(c + w, c + w, c, c + arm);
      ctx.quadraticCurveTo(c - w, c + w, c - arm, c);
      ctx.quadraticCurveTo(c - w, c - w, c, c - arm);
      ctx.fill();
    },
    true,
  );
}

export function softDotTexture(scene: Scene) {
  return makeTex(
    scene,
    'tex-dot',
    64,
    (ctx, S) => {
      const c = S / 2;
      const g = ctx.createRadialGradient(c, c, 0, c, c, c);
      g.addColorStop(0, 'rgba(255,255,255,1)');
      g.addColorStop(0.4, 'rgba(255,255,255,0.55)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, S, S);
    },
    true,
  );
}

export function leafParticleTexture(scene: Scene) {
  return makeTex(
    scene,
    'tex-leaf',
    64,
    (ctx, S) => {
      ctx.clearRect(0, 0, S, S);
      ctx.translate(S / 2, S / 2);
      ctx.rotate(-0.6);
      const g = ctx.createLinearGradient(-20, 0, 20, 0);
      g.addColorStop(0, '#4f9f2f');
      g.addColorStop(1, '#a5dc58');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(-26, 0);
      ctx.quadraticCurveTo(0, -16, 26, 0);
      ctx.quadraticCurveTo(0, 16, -26, 0);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.45)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-22, 0);
      ctx.lineTo(22, 0);
      ctx.stroke();
    },
    true,
  );
}

export function waterTexture(scene: Scene) {
  return makeTex(scene, 'tex-water', 256, (ctx, S) => {
    const r = rng(9);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, S, S);
    ctx.lineCap = 'round';
    for (let i = 0; i < 70; i++) {
      const x = r() * S;
      const y = r() * S;
      const len = 10 + r() * 26;
      ctx.globalAlpha = 0.25 + r() * 0.35;
      ctx.strokeStyle = '#d8f6ff';
      ctx.lineWidth = 1.5 + r() * 2;
      for (const dx of [-S, 0, S])
        for (const dy of [-S, 0, S]) {
          ctx.beginPath();
          ctx.moveTo(x + dx, y + dy);
          ctx.quadraticCurveTo(x + dx + len / 2, y + dy - 3, x + dx + len, y + dy);
          ctx.stroke();
        }
    }
    ctx.globalAlpha = 1;
  });
}

export function butterflyWingTexture(scene: Scene, base: string, edge: string) {
  return makeTex(
    scene,
    `tex-wing-${base}`,
    64,
    (ctx, S) => {
      ctx.clearRect(0, 0, S, S);
      const g = ctx.createRadialGradient(4, S / 2, 2, 4, S / 2, S * 0.9);
      g.addColorStop(0, base);
      g.addColorStop(0.75, base);
      g.addColorStop(1, edge);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(2, S / 2);
      ctx.bezierCurveTo(S * 0.4, -4, S + 2, 6, S * 0.8, S * 0.45);
      ctx.bezierCurveTo(S * 0.98, S * 0.62, S * 0.6, S + 2, 2, S / 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.8)';
      ctx.beginPath();
      ctx.arc(S * 0.62, S * 0.3, 4, 0, Math.PI * 2);
      ctx.fill();
    },
    true,
  );
}
