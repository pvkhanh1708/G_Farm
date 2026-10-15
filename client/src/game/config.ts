import economy from '../../../shared/economy.json';

export type CropId =
  | 'carrot' | 'wheat' | 'tomato' | 'strawberry' | 'potato' | 'cabbage' | 'corn' | 'chili'
  | 'eggplant' | 'watermelon' | 'pumpkin' | 'pineapple' | 'cotton' | 'lavender' | 'sunflower';

export interface CropDef {
  id: CropId;
  name: string;
  seedName: string;
  /** Player level needed to buy the seed. */
  unlockLevel: number;
  seedPrice: number;
  growSeconds: number;
  yield: number;
  sellPrice: number;
  /** Experience per harvested tile. */
  xp: number;
}

/** Growth stages: 0 seeded, 1 sprout, 2 young leaves, 3 mature leaves, 4 harvestable. */
export const STAGE_COUNT = 5;
export const STAGE_NAMES = ['Vừa gieo hạt', 'Nảy mầm', 'Lá non', 'Lá trưởng thành', 'Có thể thu hoạch'];

/**
 * Prices, yields, XP and level formulas live in shared/economy.json so the
 * Laravel server validates actions with exactly the same numbers. Balanced
 * with an economy sim (greedy active player): each newer crop earns ~17% more
 * profit per minute and ~10% more XP per minute than the one before.
 */
export const ECONOMY = economy;

export const CROPS = Object.fromEntries(economy.crops.map((c) => [c.id, c as CropDef])) as Record<CropId, CropDef>;

/** Unlock order (also shop order). */
export const CROP_ORDER = economy.crops.map((c) => c.id as CropId);

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

export const START_UNLOCKED = economy.startUnlocked;
export const STARTING_COINS = economy.startingCoins;

// ------------------------------------------------------------------ levels

/** XP needed to go from `level` to `level + 1`. No level cap. */
export function xpToNext(level: number): number {
  return Math.round(economy.xp.base * Math.pow(level, economy.xp.exponent));
}

/** Tiles a player of this level may own: each level (from level 1) allows one more tile, forever. */
export function tileCap(level: number): number {
  return START_UNLOCKED + level;
}

/** Lowest level that allows owning `count` tiles. */
export function levelForTiles(count: number): number {
  return Math.max(1, count - START_UNLOCKED);
}

/** Coins granted on reaching `level`. */
export function levelReward(level: number): number {
  return economy.levelRewardPerLevel * level;
}

export function cropsUnlockedAt(level: number): CropId[] {
  return CROP_ORDER.filter((c) => CROPS[c].unlockLevel === level);
}

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

/**
 * Price of the next tile. Land opens one tile per level, so each tile is
 * priced at roughly the coins a player earns during that level.
 */
export function unlockCost(unlockedCount: number): number {
  const extra = Math.max(0, unlockedCount - START_UNLOCKED);
  return Math.round((economy.tileCost.base + economy.tileCost.factor * Math.pow(extra, economy.tileCost.exponent)) / 10) * 10;
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
