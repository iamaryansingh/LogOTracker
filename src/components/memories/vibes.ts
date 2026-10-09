import type { VibeCategory } from '../../domain/memoryTypes';
import type { Theme } from '../../theme';

export const VIBE_LABEL: Record<VibeCategory, string> = {
  Cozy: 'Cozy',
  Exploratory: 'Exploring',
  Social: 'Social',
  Reflective: 'Reflective',
  Focus: 'Focus',
  Transit: 'On the move',
};

export const VIBE_ICON: Record<VibeCategory, string> = { Cozy: '☕', Exploratory: '🌿', Social: '🥂', Reflective: '🌙', Focus: '🎧', Transit: '🚗' };

export function vibeColor(v: VibeCategory, colors: Theme['colors']): string {
  switch (v) {
    case 'Cozy':
      return colors.memory.vibeCozy;
    case 'Exploratory':
      return colors.memory.vibeExplore;
    case 'Social':
      return colors.memory.vibeSocial;
    case 'Focus':
      return colors.state.focus;
    case 'Transit':
      return colors.state.neutral;
    case 'Reflective':
      return colors.state.calm;
  }
}

export const WEATHER_ICON = { SUNNY: '☀️', RAINY: '🌧️', CLOUDY: '☁️', SNOWY: '❄️', CLEAR_NIGHT: '🌙' } as const;
