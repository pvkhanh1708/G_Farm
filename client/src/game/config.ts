import economy from '../../../shared/economy.json';

export type CropId =
  | 'carrot' | 'wheat' | 'tomato' | 'strawberry' | 'potato' | 'cabbage' | 'corn' | 'chili'
  | 'eggplant' | 'watermelon' | 'pumpkin' | 'pineapple' | 'cotton' | 'lavender' | 'sunflower'
  | 'tea' | 'grape' | 'coffee' | 'dragonfruit' | 'rose' | 'durian' | 'orchid' | 'ginseng' | 'saffron' | 'cantaloupe';

/** "coin" crops are for farming money, "xp" crops for levelling (see client/scripts/economy.mjs). */
export type CropKind = 'coin' | 'xp';

export interface CropDef {
  id: CropId;
  name: string;
  seedName: string;
  kind: CropKind;
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
 * Laravel server validates actions with exactly the same numbers. The crop
 * table is generated (and its pacing simulated) by client/scripts/economy.mjs:
 * each tier earns ~17% more profit/min and ~10% more XP/min than the one
 * before, then "coin" crops pay x1.5 money / x0.5 XP and "xp" crops x0.55 / x1.8.
 */
export const ECONOMY = economy;

export const CROPS = Object.fromEntries(economy.crops.map((c) => [c.id, c as CropDef])) as Record<CropId, CropDef>;

/** Unlock order (also shop order). */
export const CROP_ORDER = economy.crops.map((c) => c.id as CropId);

/**
 * The farm is one block of square tiles laid edge to edge, filled column by
 * column: a column ("parcel" in the code) holds TILES_PER_PARCEL tiles, and each
 * new column is added on the left of the previous one. Tiles are numbered
 * globally (g = column * 10 + row) and unlocked strictly in that order.
 */
export const TILES_PER_PARCEL = 10;
export const TILE_SIZE = 1.5;
/** Tiles touch: no gap between them. */
export const TILE_PITCH = TILE_SIZE;
/** Height of a tile's top surface above the meadow. */
export const SOIL_TOP = 0.14;
/** Length of one column in world units. */
export const COLUMN_LENGTH = TILES_PER_PARCEL * TILE_PITCH;
/** Period of the meadow texture / decor grid. */
export const ISLAND_SIZE = 8;

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

/** Centre of column k: column 0 sits at x = 0, each next column one tile further left (-x). */
export function parcelCenter(k: number): { x: number; z: number } {
  return { x: -k * TILE_PITCH, z: -(COLUMN_LENGTH - TILE_PITCH) / 2 };
}

/** Row 0 of a column is at z = 0, later rows run toward -z. */
export function tileWorldPos(g: number): { x: number; z: number } {
  const col = Math.floor(g / TILES_PER_PARCEL), row = g % TILES_PER_PARCEL;
  return { x: -col * TILE_PITCH, z: -row * TILE_PITCH };
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

// ------------------------------------------------------------------ progression (mirrors server/app/Game/Economy.php)

export type UpgradeKind = 'soil' | 'sprinkler';
export type AnimalId = 'chicken' | 'cow';
export type ProductId = 'egg' | 'milk';
/** Made in the workshop machines. */
export type GoodId = 'flour' | 'bread' | 'cake' | 'cheese' | 'yogurt';
export type MachineId = 'mill' | 'bakery' | 'dairy';
/** Anything that can sit in the barn and be sold. */
export type ItemId = CropId | ProductId | GoodId;

export interface AnimalDef {
  id: AnimalId;
  name: string;
  unlockLevel: number;
  price: number;
  max: number;
  /** Seconds between two products. */
  period: number;
  product: ProductId;
  productName: string;
  sellPrice: number;
  xp: number;
  /** Eaten from the barn before each product. */
  feed: { crop: CropId; qty: number };
}

export interface GoodDef {
  id: GoodId;
  name: string;
  sellPrice: number;
  xp: number;
}

export interface RecipeDef {
  output: GoodId;
  inputs: Partial<Record<ItemId, number>>;
  seconds: number;
}

export interface MachineDef {
  id: MachineId;
  name: string;
  unlockLevel: number;
  price: number;
  /** Batches that can wait in line. */
  queue: number;
  recipes: RecipeDef[];
}

export const GOODS = Object.fromEntries(economy.goods.map((g) => [g.id, g as GoodDef])) as Record<GoodId, GoodDef>;
export const GOOD_ORDER = economy.goods.map((g) => g.id as GoodId);
export const MACHINES = economy.machines as unknown as MachineDef[];
export const NEIGHBORS = economy.neighbors;

export const UPGRADES = economy.upgrades as Record<UpgradeKind, { name: string; max: number; baseCost: number; growth: number; unlockLevel: number; yieldPerLevel?: number; speedPerLevel?: number }>;
export const ANIMALS = Object.fromEntries(economy.animals.map((a) => [a.id, a as AnimalDef])) as Record<AnimalId, AnimalDef>;
export const ANIMAL_ORDER = economy.animals.map((a) => a.id as AnimalId);
export const PRODUCT_ORDER = economy.animals.map((a) => a.product as ProductId);
export const ITEM_ORDER: ItemId[] = [...CROP_ORDER, ...PRODUCT_ORDER, ...GOOD_ORDER];

export function itemDef(id: ItemId): { name: string; sellPrice: number } {
  if (id in CROPS) return CROPS[id as CropId];
  if (id in GOODS) return GOODS[id as GoodId];
  const a = economy.animals.find((x) => x.product === id)!;
  return { name: a.productName, sellPrice: a.sellPrice };
}

export const isProduct = (id: ItemId): id is ProductId => PRODUCT_ORDER.includes(id as ProductId);

/** Coins to raise an upgrade from `level` to `level + 1`. */
export function upgradeCost(kind: UpgradeKind, level: number): number {
  const u = UPGRADES[kind];
  return Math.round((u.baseCost * Math.pow(u.growth, level)) / 10) * 10;
}

/** Growth time (ms) of a crop with the sprinkler at `sprinkler`. */
export function growMs(crop: CropId, sprinkler: number): number {
  return Math.round(CROPS[crop].growSeconds * 1000 * (1 - UPGRADES.sprinkler.speedPerLevel! * sprinkler));
}

/** Crops harvested from one tile with the soil at `soil`. */
export function harvestAmount(crop: CropId, soil: number): number {
  const y = CROPS[crop].yield;
  return y + Math.round(y * UPGRADES.soil.yieldPerLevel! * soil);
}

export function fertilizerCost(crop: CropId): number {
  return Math.max(1, Math.round(CROPS[crop].seedPrice * economy.fertilizer.costShare));
}

export const ORDERS_UNLOCK = economy.orders.unlockLevel;
export const LOGIN_REWARDS = economy.login;

/**
 * Fenced pens on the right of the farm block (column 0 is at x = 0, columns grow toward -x),
 * one per animal kind: a small chicken coop, then a larger cow pen further along the column.
 */
export const PENS: Record<AnimalId, { x0: number; x1: number; z0: number; z1: number }> = {
  chicken: { x0: 1.5, x1: 5.5, z0: -5.2, z1: -1.4 },
  cow: { x0: 1.5, x1: 6.3, z0: -12.4, z1: -6.2 },
};
/** Right edge of the pens (camera bounds, meadow decor). */
export const PENS_X1 = Math.max(...Object.values(PENS).map((p) => p.x1));
