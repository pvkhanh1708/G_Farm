export type CropId = 'carrot' | 'wheat' | 'tomato';

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
};

export const CROP_ORDER: CropId[] = ['carrot', 'wheat', 'tomato'];

export const PLOT_SPACING = 2.35;
export const PLOT_SIZE = 2.0;
export const SOIL_TOP = 0.2;

/** The farm is an unbounded grid of tiles addressed by (col, row); (0,0) is the centre. */
export const START_TILES: Array<[number, number]> = [[-1, 0], [0, 0], [1, 0]];
export const STARTING_COINS = 50;

export const tileId = (col: number, row: number) => `${col},${row}`;

export function tileWorldPos(col: number, row: number): { x: number; z: number } {
  return { x: col * PLOT_SPACING, z: row * PLOT_SPACING };
}

/** Price of the next plot grows with the number already owned. */
export function unlockCost(unlockedCount: number): number {
  const extra = Math.max(0, unlockedCount - START_TILES.length);
  return Math.round((40 * Math.pow(1.15, extra)) / 10) * 10;
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
