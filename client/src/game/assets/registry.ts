import { Mesh, Scene } from '@babylonjs/core';

export type AssetStatus = 'placeholder' | 'integrated' | 'planned';

export interface AssetEntry {
  id: string;
  label: string;
  /** Path under /public (e.g. 'assets/models/carrot_s4.glb'). When set, it replaces the procedural stand-in. */
  glb?: string;
  source: string;
  license: string;
  status: AssetStatus;
}

const PROC = 'Procedural (code, src/game/render)';
const OWN = 'Project-owned code, no third-party rights';

const crop = (id: string, name: string): AssetEntry[] =>
  [0, 1, 2, 3, 4].map((s) => ({ id: `crop.${id}.s${s}`, label: `${name} – stage ${s}`, source: PROC, license: OWN, status: 'placeholder' as const }));

/**
 * Single source of truth for 3D assets. To integrate a real model, drop the
 * GLB into public/assets/models, set `glb`, and flip status to 'integrated'.
 * ASSETS.md documents the same list for reviewers.
 */
export const ASSET_MANIFEST: AssetEntry[] = [
  ...crop('carrot', 'Carrot'),
  ...crop('wheat', 'Wheat'),
  ...crop('tomato', 'Tomato'),
  { id: 'tile.soil', label: 'Soil tile (rounded slab)', source: PROC, license: OWN, status: 'placeholder' },
  { id: 'tile.grass', label: 'Locked grass tile (3 variants)', source: PROC, license: OWN, status: 'placeholder' },
  { id: 'env.island', label: 'Floating island per parcel (grass top + cliff)', source: PROC, license: OWN, status: 'placeholder' },
  { id: 'env.bush', label: 'Bushes (4 variants)', source: PROC, license: OWN, status: 'placeholder' },
  { id: 'env.rock', label: 'Rock cluster', source: PROC, license: OWN, status: 'placeholder' },
  { id: 'env.flowers', label: 'Flower clusters (5 colours)', source: PROC, license: OWN, status: 'placeholder' },
  { id: 'env.grass', label: 'Grass tufts', source: PROC, license: OWN, status: 'placeholder' },
  { id: 'env.clouds', label: 'Clouds + distant islands with trees', source: PROC, license: OWN, status: 'placeholder' },
  { id: 'env.butterfly', label: 'Butterflies', source: PROC, license: OWN, status: 'placeholder' },
];

/** Loaded GLB replacements, keyed by asset id. */
const loaded = new Map<string, Mesh>();

/** Load every manifest entry that has a GLB. Missing/broken files fall back silently to procedural. */
export async function preloadAssets(scene: Scene, onProgress?: (k: number) => void) {
  const withGlb = ASSET_MANIFEST.filter((a) => a.glb);
  if (!withGlb.length) return;
  const { LoadAssetContainerAsync } = await import('@babylonjs/core');
  await import('@babylonjs/loaders/glTF');
  let done = 0;
  for (const a of withGlb) {
    try {
      const c = await LoadAssetContainerAsync(a.glb!, scene);
      c.addAllToScene();
      const meshes = c.meshes.filter((m): m is Mesh => m instanceof Mesh && m.getTotalVertices() > 0);
      const merged = Mesh.MergeMeshes(meshes, true, true, undefined, false, true);
      if (merged) {
        merged.isVisible = false;
        loaded.set(a.id, merged);
      }
    } catch (e) {
      console.warn(`[assets] ${a.id}: failed to load ${a.glb}, using procedural stand-in`, e);
    }
    onProgress?.(++done / withGlb.length);
  }
}

export function loadedAsset(id: string): Mesh | null {
  return loaded.get(id) ?? null;
}

export function assetSummary() {
  const total = ASSET_MANIFEST.length;
  const integrated = ASSET_MANIFEST.filter((a) => a.status === 'integrated').length;
  return { total, integrated, placeholder: total - integrated };
}
