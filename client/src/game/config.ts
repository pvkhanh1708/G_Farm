export type CropId = 'carrot' | 'wheat' | 'tomato' | 'strawberry' | 'cabbage' | 'corn' | 'eggplant' | 'pumpkin' | 'sunflower';

export interface CropDef {
  id: CropId;
  name: string;
  seedName: string;
  seedPrice: number;
  growSeconds: number;
  yield: number;
  sellPrice: number;
}

/** Growth stages: 0 seeded, 1 sprout, 2 young leaves, 3 mature leaves, 4 harvestable. */
export const STAGE_COUNT = 5;
export const STAGE_NAMES = ['Vừa gieo hạt', 'Nảy mầm', 'Lá non', 'Lá trưởng thành', 'Có thể thu hoạch'];

export const CROPS: Record<CropId, CropDef> = {
  carrot: { id: 'carrot', name: 'Cà rốt', seedName: 'Hạt cà rốt', seedPrice: 10, growSeconds: 20, yield: 4, sellPrice: 5 },
  wheat: { id: 'wheat', name: 'Lúa mì', seedName: 'Hạt lúa mì', seedPrice: 18, growSeconds: 30, yield: 5, sellPrice: 6 },
  tomato: { id: 'tomato', name: 'Cà chua', seedName: 'Hạt cà chua', seedPrice: 30, growSeconds: 45, yield: 6, sellPrice: 9 },
  strawberry: { id: 'strawberry', name: 'Dâu tây', seedName: 'Hạt dâu tây', seedPrice: 40, growSeconds: 60, yield: 5, sellPrice: 14 },
  cabbage: { id: 'cabbage', name: 'Bắp cải', seedName: 'Hạt bắp cải', seedPrice: 55, growSeconds: 75, yield: 3, sellPrice: 32 },
  corn: { id: 'corn', name: 'Ngô', seedName: 'Hạt ngô', seedPrice: 70, growSeconds: 90, yield: 4, sellPrice: 30 },
  eggplant: { id: 'eggplant', name: 'Cà tím', seedName: 'Hạt cà tím', seedPrice: 90, growSeconds: 120, yield: 5, sellPrice: 30 },
  pumpkin: { id: 'pumpkin', name: 'Bí ngô', seedName: 'Hạt bí ngô', seedPrice: 150, growSeconds: 180, yield: 2, sellPrice: 130 },
  sunflower: { id: 'sunflower', name: 'Hướng dương', seedName: 'Hạt hướng dương', seedPrice: 200, growSeconds: 240, yield: 3, sellPrice: 120 },
};

/** Cheapest/fastest first; later crops earn more per minute but tie up the tile longer. */
export const CROP_ORDER: CropId[] = ['carrot', 'wheat', 'tomato', 'strawberry', 'cabbage', 'corn', 'eggplant', 'pumpkin', 'sunflower'];

/**
 * The farm is a sequence of parcels (floating islands), each a 4x4 grid of
 * square tiles. Tiles are numbered globally (g = parcel * 16 + local) and are
 * unlocked strictly in that order, so a parcel fills up before the next opens.
 */
export const PARCEL_DIM = 4;
export const TILES_PER_PARCEL = PARCEL_DIM * PARCEL_DIM;
export const TILE_SIZE = 1.5;
export const TILE_PITCH = 1.64;
/** Height of a tile's top surface above the island grass. */
export const SOIL_TOP = 0.14;
export const PARCEL_BORDER = 0.8;
export const ISLAND_SIZE = PARCEL_DIM * TILE_PITCH - (TILE_PITCH - TILE_SIZE) + PARCEL_BORDER * 2;
export const PARCEL_PITCH = ISLAND_SIZE + 1.5;

export const START_UNLOCKED = 4;
export const STARTING_COINS = 50;

/** Square spiral around the first parcel: (0,0), (1,0), (1,1), (0,1), (-1,1), ... */
export function parcelGrid(k: number): { gx: number; gz: number } {
  let x = 0, z = 0, dx = 1, dz = 0, run = 1, step = 0, turns = 0;
  for (let i = 0; i < k; i++) {
    x += dx;
    z += dz;
    if (++step === run) {
      step = 0;
      [dx, dz] = [-dz, dx];
      if (++turns % 2 === 0) run++;
    }
  }
  return { gx: x, gz: z };
}

export function parcelCenter(k: number): { x: number; z: number } {
  const { gx, gz } = parcelGrid(k);
  return { x: gx * PARCEL_PITCH, z: gz * PARCEL_PITCH };
}

/** Local tile order: rows from the far (top-left on screen) edge toward the camera. */
export function tileLocal(local: number): { c: number; r: number } {
  return { c: local % PARCEL_DIM, r: PARCEL_DIM - 1 - Math.floor(local / PARCEL_DIM) };
}

export function tileWorldPos(g: number): { x: number; z: number } {
  const parcel = Math.floor(g / TILES_PER_PARCEL);
  const { c, r } = tileLocal(g % TILES_PER_PARCEL);
  const pc = parcelCenter(parcel);
  const off = (PARCEL_DIM - 1) / 2;
  return { x: pc.x + (c - off) * TILE_PITCH, z: pc.z + (r - off) * TILE_PITCH };
}

/** Price of the next tile grows gently with the number already owned. */
export function unlockCost(unlockedCount: number): number {
  const extra = Math.max(0, unlockedCount - START_UNLOCKED);
  return Math.round((30 * Math.pow(1.09, extra)) / 10) * 10;
}

export type Quality = 'low' | 'medium' | 'high';

export interface QualityPreset {
  maxPixelRatio: number;
  shadowMapSize: number;
  shadowPcfQuality: 'low' | 'medium' | 'high';
  grassCount: number;
  flowerCount: number;
  particleScale: number;
  butterflies: number;
  antialias: boolean;
}

export const QUALITY_PRESETS: Record<Quality, QualityPreset> = {
  low: { maxPixelRatio: 1, shadowMapSize: 512, shadowPcfQuality: 'low', grassCount: 700, flowerCount: 60, particleScale: 0.4, butterflies: 1, antialias: false },
  medium: { maxPixelRatio: 1.5, shadowMapSize: 1024, shadowPcfQuality: 'medium', grassCount: 1800, flowerCount: 140, particleScale: 0.7, butterflies: 3, antialias: true },
  high: { maxPixelRatio: 2, shadowMapSize: 2048, shadowPcfQuality: 'high', grassCount: 3600, flowerCount: 260, particleScale: 1, butterflies: 5, antialias: true },
};
