import type { StateCategory } from '../domain/types';

export interface SurfacePalette {
  bgSurface: string;
  bgCard: string;
  textPrimary: string;
  textSecondary: string;
  borderSubtle: string;
}

export const lightPalette: SurfacePalette = {
  bgSurface: '#F9F9FB',
  bgCard: '#FFFFFF',
  textPrimary: '#1A1A1E',
  textSecondary: '#6C6C75',
  borderSubtle: '#EBEBEF',
};

export const darkPalette: SurfacePalette = {
  bgSurface: '#121214',
  bgCard: '#1C1C1E',
  textPrimary: '#F0F0F2',
  textSecondary: '#8E8E93',
  borderSubtle: '#2C2C2E',
};

/** Memory canvas: a warm parchment surface, the pin accent, and one colour per vibe. */
export const memoryLight = {
  bgMemoryWarm: '#FAF8F5',
  accentPin: '#E06D53',
  vibeCozy: '#D99B26',
  vibeExplore: '#4A7C59',
  vibeSocial: '#5A84A2',
  /** Instant-photo prints: paper stays light in dark mode, like a real print. */
  polaroidPaper: '#FFFDF7',
  polaroidInk: '#2B2A33',
  /** The orange date stamp disposable cameras print on the photo. */
  dateStamp: '#FF9A3C',
  /** A pinboard under the prints. */
  board: '#F1E6D6',
  pins: ['#E5484D', '#F5B83D', '#3E8ED0', '#46A758', '#8E4EC6'] as string[],
};
export const memoryDark = { ...memoryLight, bgMemoryWarm: '#161518', polaroidPaper: '#F4F1EA', board: '#2A2520' };
export type MemoryPalette = typeof memoryLight;

/** State tokens carry meaning; never use them decoratively. Shared across light and dark. */
export const stateColors = {
  calm: '#5B8E7D',
  focus: '#5A84A2',
  energy: '#D99B26',
  stressLow: '#D97724',
  stressHigh: '#C94A4A',
  neutral: '#8E8E93',
} as const;

export type StateToken = keyof typeof stateColors;

export const stateCategoryToken: Record<StateCategory, StateToken> = {
  Calm: 'calm',
  Recovery: 'calm',
  Focus: 'focus',
  Energy: 'energy',
  Stress: 'stressLow',
  Overload: 'stressHigh',
};

/** Applies an alpha (0–1) to a #RRGGBB color. */
export function withAlpha(hex: string, alpha: number): string {
  const a = Math.round(Math.min(Math.max(alpha, 0), 1) * 255)
    .toString(16)
    .padStart(2, '0');
  return `${hex}${a}`;
}
