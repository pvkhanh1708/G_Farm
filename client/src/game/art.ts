/**
 * Hand-made art dropped into client/src/assets/sprites/ (see the README there).
 * Vite lists the files at build time, so a missing PNG simply has no URL and
 * the game keeps its procedural placeholder for it; nothing is fetched blindly.
 */
const files = import.meta.glob('../assets/sprites/**/*.png', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;

/** URL of `assets/sprites/<path>` (e.g. "crops/carrot/carrot-4.png"), or undefined when not provided. */
export function artUrl(path: string): string | undefined {
  return files[`../assets/sprites/${path}`];
}

/** Number of art files provided (shown in Settings). */
export function artCount() {
  return Object.keys(files).length;
}

/** Load an image, resolving null on failure so callers can fall back. */
export function loadImage(url: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  });
}
