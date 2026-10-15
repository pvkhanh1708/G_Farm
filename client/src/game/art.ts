/**
 * Hand-made art dropped into client/src/assets/sprites/ (see the README there).
 * The PNG originals are converted by scripts/art.mjs into small WebP siblings,
 * and only those ship. Vite lists them at build time, so a missing file simply
 * has no URL and the game keeps its procedural placeholder; nothing is fetched blindly.
 */
const files = import.meta.glob('../assets/sprites/**/*.webp', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;

/** URL of `assets/sprites/<path>` (named as the PNG, e.g. "crops/carrot.png"), or undefined when not provided. */
export function artUrl(path: string): string | undefined {
  return files[`../assets/sprites/${path.replace(/\.png$/, '.webp')}`];
}

/** Number of art files provided (shown in Settings). */
export function artCount() {
  return Object.keys(files).length;
}

/**
 * A whole crop on one sheet: crops/<id>.png, a 3x2 grid of equal cells read left to right,
 * top to bottom: stage 0, 1, 2 / stage 3, 4, shop icon. Individual files win over the sheet.
 */
export const SHEET = { cols: 3, rows: 2, icon: 5 };

export function cropSheetUrl(crop: string): string | undefined {
  return artUrl(`crops/${crop}.png`);
}

const images = new Map<string, Promise<HTMLImageElement | null>>();

/** Load an image once, resolving null on failure so callers can fall back. */
export function loadImage(url: string): Promise<HTMLImageElement | null> {
  let p = images.get(url);
  if (!p) {
    p = new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = url;
    });
    images.set(url, p);
  }
  return p;
}
