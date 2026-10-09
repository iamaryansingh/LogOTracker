import { isRunningInExpoGo } from 'expo';

import type { SignalEvent } from '../../domain/types';
import { toISODate } from '../../utils/time';
import type { RawHealth } from './validate';

export interface HealthDaily {
  steps?: number;
  /** Active energy ("Move" on Apple Watch), in kcal. */
  activeKcal?: number;
  exerciseMinutes?: number;
}

export interface HealthSnapshot {
  daily: Record<string, HealthDaily>;
  /** Sleep sessions and workouts, as timeline entries. */
  events: SignalEvent[];
}

export interface HealthProvider {
  /** Store name shown to the user. */
  name: string;
  isSupported: () => Promise<boolean>;
  requestAccess: () => Promise<boolean>;
  /** Raw samples; always pass them through `validateHealth` before use. */
  fetch: (days: number) => Promise<RawHealth>;
}

/** Native health stores need a custom build; Expo Go can't load them. */
export const nativeHealthAllowed = () => !isRunningInExpoGo();

/** "traditionalStrengthTraining" / "STRENGTH_TRAINING" → "Traditional strength training". */
export function humanize(name: string): string {
  const words = name
    .replace(/_/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** Local-midnight boundaries for the last `days` days, oldest first. */
export function dayRanges(days: number): { date: string; start: Date; end: Date }[] {
  return Array.from({ length: days }, (_, i) => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() - (days - 1 - i));
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    return { date: toISODate(start), start, end: end > new Date() ? new Date() : end };
  });
}
