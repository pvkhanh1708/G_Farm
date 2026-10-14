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

export const GRID_SIZE = 3;
export const PLOT_SPACING = 2.35;
export const PLOT_SIZE = 2.0;
export const SOIL_TOP = 0.2;

/** Unlock price per plot index (row-major, 3x3). 0 = unlocked at start. */
export const UNLOCK_COSTS = [60, 40, 90, 0, 0, 0, 140, 100, 200];
export const STARTING_COINS = 50;

export function plotWorldPos(index: number): { x: number; z: number } {
  const col = index % GRID_SIZE;
  const row = Math.floor(index / GRID_SIZE);
  const off = (GRID_SIZE - 1) / 2;
  return { x: (col - off) * PLOT_SPACING, z: (row - off) * PLOT_SPACING };
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
