import type { VibeCategory } from './memoryTypes';
import type { DayRatings } from './types';

/**
 * Places a day on the circumplex model of affect (Russell): valence (unpleasant → pleasant) and
 * arousal (calm → activated), plus what kind of social day it was. Uses the user's own ratings
 * when there are any; otherwise leans on where they went and what they did there.
 */

export type SocialCategory = 'SOLITARY' | 'ONE_ON_ONE' | 'SMALL_GROUP' | 'CROWD_COMMUNITY' | 'DEEP_SOCIAL';

export interface JEVState {
  valence: number; // -1 … +1
  arousal: number; // -1 … +1
  socialCategory: SocialCategory;
  primaryEmotionTag: string;
  /** True when the user's ratings set it, not just the places. */
  fromRatings: boolean;
}

export interface JEVInput {
  ratings?: DayRatings;
  vibe: VibeCategory;
  /** Activity kinds at the day's places, e.g. "meal", "show". */
  activityKinds: string[];
  /** Apple Maps categories of the day's places. */
  categories: string[];
  /** Minutes spent at social places (meals, drinks, shows). */
  socialMinutes: number;
  /** Most faces in any photo that day. */
  maxFaces?: number;
}

const VIBE_AFFECT: Record<VibeCategory, { v: number; a: number }> = {
  Social: { v: 0.35, a: 0.35 },
  Exploratory: { v: 0.3, a: 0.3 },
  Cozy: { v: 0.3, a: -0.35 },
  Reflective: { v: 0.1, a: -0.4 },
  Focus: { v: 0.05, a: 0.2 },
  Transit: { v: -0.05, a: 0.15 },
};

const CROWD = new Set(['Stadium', 'MusicVenue', 'Nightlife', 'AmusementPark', 'Fairground', 'ConventionCenter', 'Baseball', 'Theater']);
const SOCIAL_KINDS = new Set(['meal', 'drinks', 'show']);

const clamp = (x: number) => Math.max(-1, Math.min(1, x));
const centred = (x?: number) => (x === undefined ? undefined : (x - 3) / 2); // 1…5 → -1…+1

function emotion(v: number, a: number): string {
  if (Math.abs(v) < 0.15 && Math.abs(a) < 0.15) return 'Steady';
  if (v >= 0 && a >= 0) return a > 0.45 ? 'Excited' : 'Energized';
  if (v >= 0) return a < -0.45 ? 'Serene' : 'Content';
  if (a >= 0) return a > 0.45 ? 'Stressed' : 'Tense';
  return a < -0.45 ? 'Exhausted' : 'Drained';
}

export function classifyJEV(i: JEVInput): JEVState {
  const base = VIBE_AFFECT[i.vibe];
  const energy = centred(i.ratings?.energy);
  const stress = centred(i.ratings?.stress);
  const fromRatings = energy !== undefined || stress !== undefined;
  // Ratings outweigh the places: the user knows how the day felt.
  const valence = clamp(base.v * (fromRatings ? 0.4 : 1) + (energy ?? 0) * 0.4 - (stress ?? 0) * 0.5);
  const arousal = clamp(base.a * (fromRatings ? 0.5 : 1) + (energy ?? 0) * 0.45 + (stress ?? 0) * 0.35);

  const crowd = i.categories.some((c) => CROWD.has(c));
  const social = i.activityKinds.filter((k) => SOCIAL_KINDS.has(k)).length;
  const socialCategory: SocialCategory = crowd
    ? 'CROWD_COMMUNITY'
    : i.socialMinutes >= 150 || social >= 3
      ? 'DEEP_SOCIAL'
      : (i.maxFaces ?? 0) >= 3 || social >= 2
        ? 'SMALL_GROUP'
        : social === 1 || (i.maxFaces ?? 0) === 2 || i.vibe === 'Social'
          ? 'ONE_ON_ONE'
          : 'SOLITARY';

  return { valence, arousal, socialCategory, primaryEmotionTag: emotion(valence, arousal), fromRatings };
}

export const SOCIAL_LABEL: Record<SocialCategory, { label: string; emoji: string }> = {
  SOLITARY: { label: 'Solo', emoji: '🧘' },
  ONE_ON_ONE: { label: 'One-on-one', emoji: '👥' },
  SMALL_GROUP: { label: 'Small group', emoji: '🫶' },
  CROWD_COMMUNITY: { label: 'Crowd · Community', emoji: '🎉' },
  DEEP_SOCIAL: { label: 'Deep social', emoji: '💬' },
};

/** "High valence · Low arousal" style label. */
export function affectLabel(s: JEVState): string {
  const band = (x: number) => (x > 0.25 ? 'High' : x < -0.25 ? 'Low' : 'Mid');
  return `${band(s.valence)} valence · ${band(s.arousal)} arousal`;
}
