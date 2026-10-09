import type { SignalEvent } from './types';
import type { MemoryStyle, SpatialNode, TransitLeg, VibeCategory, WeatherCondition } from './memoryTypes';

/**
 * Turns a day's places into a title and a short story, in one of four voices. Runs entirely on
 * device from templates; the phrasing is picked with a seed from the date, so a memory reads the
 * same every time it's opened.
 */

const MIN = 60_000;

// ---- Vibes -----------------------------------------------------------------------------------

export interface VibeContext {
  isHome: boolean;
  dwellMin: number;
  arrival: Date;
  /** Entries the user logged while at this place. */
  overlapping: SignalEvent[];
  photos: number;
  weather?: WeatherCondition;
  /** The stay runs into the night (where you slept, away from home). */
  overnight?: boolean;
  /** Far from home, e.g. on a trip. */
  away?: boolean;
}

/** What a place felt like, preferring what the user logged there over guesses from time and place. */
export function classifyVibe(c: VibeContext): VibeCategory {
  const domains = new Set(c.overlapping.filter((e) => !e.isNote).map((e) => e.domain));
  if (domains.has('Social')) return 'Social';
  if (domains.has('Exercise')) return 'Exploratory';
  if (domains.has('Work')) return 'Focus';
  const h = c.arrival.getHours();
  if (c.isHome) return h >= 17 || h < 5 || c.weather === 'RAINY' ? 'Cozy' : 'Reflective';
  // Somewhere you slept that isn't home (a hotel, a friend's place).
  if (c.overnight) return 'Cozy';
  if (c.photos >= 3) return 'Exploratory';
  if (c.away) return h >= 18 && c.dwellMin >= 60 ? 'Social' : 'Exploratory';
  if (h >= 18 && c.dwellMin >= 60) return 'Social';
  if (c.dwellMin >= 150 && h >= 8 && h < 17) return 'Focus';
  if (c.dwellMin >= 45 && (c.weather === 'RAINY' || h >= 15)) return 'Cozy';
  return 'Exploratory';
}

/** The day's overall vibe, weighted by time spent; long drives make it a travel day. */
export function primaryVibe(nodes: SpatialNode[], transit: TransitLeg[]): VibeCategory {
  const weight = new Map<VibeCategory, number>();
  // Hours at home (mostly asleep) only decide the vibe when nothing else happened.
  const outside = nodes.filter((n) => !n.isHome);
  for (const n of outside.length ? outside : nodes) {
    // Nights away count less than the waking hours of the day.
    const w = n.vibe === 'Cozy' && new Date(n.arrivalTime).getHours() >= 20 ? n.dwellTimeMinutes * 0.3 : n.dwellTimeMinutes;
    weight.set(n.vibe, (weight.get(n.vibe) ?? 0) + w);
  }
  const driveMin = transit.filter((t) => t.mode === 'drive').reduce((s, t) => s + (Date.parse(t.endTime) - Date.parse(t.startTime)) / MIN, 0);
  if (driveMin >= 120) weight.set('Transit', (weight.get('Transit') ?? 0) + driveMin * 1.5);
  let best: VibeCategory = 'Reflective';
  let max = -1;
  for (const [v, w] of weight) if (w > max) [best, max] = [v, w];
  return best;
}

// ---- Helpers ---------------------------------------------------------------------------------

/** Stable pseudo-random pick, so the same day always gets the same wording. */
export function seeded(seed: string) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  return <T,>(xs: T[]): T => {
    h = Math.imul(h ^ (h >>> 15), 2246822507) >>> 0;
    return xs[h % xs.length];
  };
}

export const timeOfDay = (d: Date) => {
  const h = d.getHours();
  return h < 5 ? 'Night' : h < 12 ? 'Morning' : h < 17 ? 'Afternoon' : h < 21 ? 'Evening' : 'Night';
};

const clock = (iso: string) => new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });

export function dwellLabel(minutes: number): string {
  // Round the total first, so 179.6 min reads "3 h", never "2 h 60 min".
  const m = Math.round(minutes);
  if (m < 60) return `${m} min`;
  const rest = m % 60;
  return `${Math.floor(m / 60)} h${rest >= 5 ? ` ${rest} min` : ''}`;
}

const WEATHER_ADJ: Record<WeatherCondition, string[]> = {
  RAINY: ['Rain-Kissed', 'Drizzly', 'Rain-Soaked'],
  SUNNY: ['Sun-Soaked', 'Golden', 'Bright'],
  CLOUDY: ['Grey-Skied', 'Soft-Lit', 'Overcast'],
  SNOWY: ['Snow-Dusted', 'Frosty', 'Snowbound'],
  CLEAR_NIGHT: ['Starlit', 'Clear-Skied', 'Moonlit'],
};

export const VIBE_EMOJI: Record<VibeCategory, string> = { Cozy: '☕', Exploratory: '🌿', Social: '🥂', Reflective: '🌙', Focus: '🎧', Transit: '🚗' };

const WEATHER_WORD: Record<WeatherCondition, string> = { RAINY: 'rain', SUNNY: 'sun', CLOUDY: 'clouds', SNOWY: 'snow', CLEAR_NIGHT: 'clear skies' };

export interface DayStory {
  date: string;
  nodes: SpatialNode[];
  transit: TransitLeg[];
  distanceKm: number;
  vibe: VibeCategory;
  photos: number;
  /** Average energy rating, 1–5. */
  energy?: number;
}

const outings = (d: DayStory) => d.nodes.filter((n) => !n.isHome);

/** The place that best represents the day: the longest stay away from home, photos as tie-breaker. */
export function highlightNode(d: DayStory): SpatialNode | undefined {
  return [...outings(d)].sort((a, b) => b.dwellTimeMinutes + (b.photoUris?.length ?? 0) * 20 - (a.dwellTimeMinutes + (a.photoUris?.length ?? 0) * 20))[0];
}

const placeOf = (n?: SpatialNode) => n?.placeName || n?.locality || 'somewhere new';
const areaOf = (d: DayStory) => highlightNode(d)?.locality || placeOf(highlightNode(d));

const SMALL_WORDS = new Set(['a', 'an', 'at', 'the', 'of', 'in', 'and']);
/** "A quick bite at Joe's" → "A Quick Bite at Joe's" (place names keep their own casing). */
export const titleCase = (s: string) =>
  s
    .split(' ')
    .map((w, i) => (i > 0 && SMALL_WORDS.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(' ');

// ---- Titles ----------------------------------------------------------------------------------

export function memoryTitle(d: DayStory, style: MemoryStyle): string {
  const pick = seeded(`${d.date}-title`);
  const hl = highlightNode(d);
  const place = placeOf(hl);
  const area = areaOf(d);
  const tod = hl ? timeOfDay(new Date(hl.arrivalTime)) : 'Day';
  const weather = hl?.weather?.condition;

  if (style === 'RAW_BULLETS') {
    const date = new Date(`${d.date}T12:00:00`).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
    return `${date} — ${hl ? place : 'Home'}${d.distanceKm >= 1 ? `, ${d.distanceKm.toFixed(1)} km` : ''}`;
  }

  let title: string;
  // Knowing what you did there ("Dinner at Olive Garden") beats guessing from the vibe.
  if (hl?.activity && d.vibe !== 'Transit' && hl.dwellTimeMinutes >= 30) title = titleCase(hl.activity.label);
  else if (!hl) title = pick(['A Home Day', 'Staying In', 'A Quiet Day at Home']);
  else if (d.vibe === 'Transit') {
    const first = outings(d)[0];
    const last = outings(d)[outings(d).length - 1];
    title = first && last && first !== last ? `On the Move: ${placeOf(first)} to ${placeOf(last)}` : `On the Road to ${area}`;
  } else if (weather && pick([true, false, true])) title = `A ${pick(WEATHER_ADJ[weather])} ${tod} in ${area}`;
  else
    title = pick(
      {
        Cozy: [`A Slow ${tod} at ${place}`, `A Quiet ${tod} at ${place}`, `Lingering at ${place}`],
        Exploratory: [`Wandering ${area}`, `Out and About in ${area}`, `${d.distanceKm >= 3 ? `${d.distanceKm.toFixed(0)} km Through ` : 'Exploring '}${area}`],
        Social: [`Good Company at ${place}`, `${tod} Together at ${place}`, `Gathering at ${place}`],
        Reflective: [`A Still ${tod}`, `Time to Think`, `A Gentle ${tod}`],
        Focus: [`Heads-Down at ${place}`, `Deep Work at ${place}`, `A Focused ${tod} at ${place}`],
        Transit: [`On the Road to ${area}`],
      }[d.vibe],
    );

  if (style === 'GEN_Z_CASUAL') return `${title.toLowerCase()} ${VIBE_EMOJI[d.vibe]}`;
  return title;
}

// ---- Stories ---------------------------------------------------------------------------------

export function memoryNarrative(d: DayStory, style: MemoryStyle): string {
  const pick = seeded(`${d.date}-${style}`);
  const out = outings(d);
  const hl = highlightNode(d);
  const energyWord = d.energy === undefined ? null : d.energy >= 4 ? 'high' : d.energy <= 2 ? 'low' : 'steady';

  if (style === 'RAW_BULLETS') {
    const lines = d.nodes.map((n) => {
      const w = n.weather ? `, ${WEATHER_WORD[n.weather.condition]} ${Math.round(n.weather.tempC)}°` : '';
      const pics = n.photoUris?.length ? `, ${n.photoUris.length} photo${n.photoUris.length > 1 ? 's' : ''}` : '';
      return `• ${clock(n.arrivalTime)}–${clock(n.departureTime)} ${n.isHome ? 'Home' : placeOf(n)} (${dwellLabel(n.dwellTimeMinutes)}${w}${pics})`;
    });
    const moved = d.distanceKm >= 0.5 ? [`• Moved ${d.distanceKm.toFixed(1)} km`] : [];
    const energy = energyWord ? [`• Energy: ${energyWord}`] : [];
    return [...lines, ...moved, ...energy].join('\n') || '• Stayed put';
  }

  if (!hl) {
    return {
      GEN_Z_CASUAL: `home day fr 🏠 no notes, just vibes${energyWord ? ` (energy ${energyWord})` : ''}`,
      POETIC_MINIMAL: 'Home, all day.\nThe kind of quiet you only notice later.',
      NARRATIVE_STORY: `You spent the day close to home${energyWord ? `, with ${energyWord} energy` : ''}. Not every day needs to go somewhere.`,
    }[style];
  }

  if (style === 'GEN_Z_CASUAL') {
    const bits = out.slice(0, 4).map((n) => `${placeOf(n).toLowerCase()} (${dwellLabel(n.dwellTimeMinutes)}) ${VIBE_EMOJI[n.vibe]}`);
    const opener = pick(['ok so today:', 'today’s lore:', 'the itinerary, unfiltered:']);
    const tail = [
      d.distanceKm >= 2 ? `${d.distanceKm.toFixed(1)} km of touching grass` : null,
      d.photos ? `${d.photos} pics in the camera roll` : null,
      energyWord ? `energy ${energyWord === 'high' ? 'was UP' : energyWord === 'low' ? 'kinda low tbh' : 'mid but stable'}` : null,
    ].filter(Boolean);
    return `${opener} ${bits.join(' → ')}.${tail.length ? ` ${tail.join(', ')}.` : ''} vibe check: ${d.vibe.toLowerCase()} ${VIBE_EMOJI[d.vibe]}`;
  }

  if (style === 'POETIC_MINIMAL') {
    const lines = out.slice(0, 4).map((n, i) => {
      const word = n.weather ? WEATHER_WORD[n.weather.condition] : '';
      const cap = word.charAt(0).toUpperCase() + word.slice(1);
      const w = n.weather ? pick([`${cap} overhead.`, `${cap}, ${Math.round(n.weather.tempC)}°.`]) : '';
      const opener = i === 0 ? `${timeOfDay(new Date(n.arrivalTime))}.` : pick(['Then', 'After,', 'Later']);
      return `${opener} ${dwellLabel(n.dwellTimeMinutes)} at ${placeOf(n)}. ${w}`.trim();
    });
    const close = d.distanceKm >= 2 ? `${d.distanceKm.toFixed(0)} km, and the long way home.` : 'And home again.';
    return [...lines, close].join('\n');
  }

  // NARRATIVE_STORY
  const first = out[0];
  const parts: string[] = [];
  const w = first.weather;
  const wokeThere = new Date(first.arrivalTime).getHours() === 0 && new Date(first.arrivalTime).getMinutes() === 0;
  parts.push(
    wokeThere
      ? `You woke up at ${placeOf(first)}${w ? ` to ${WEATHER_WORD[w.condition]} and ${Math.round(w.tempC)}°` : ''}.`
      : `${pick(['Your', 'The'])} ${timeOfDay(new Date(first.arrivalTime)).toLowerCase()} began at ${placeOf(first)}${w ? `, ${pick(['under', 'with'])} ${WEATHER_WORD[w.condition]} and ${Math.round(w.tempC)}°` : ''}, where you stayed ${dwellLabel(first.dwellTimeMinutes)}.`,
  );
  if (out.length > 1) {
    const rest = out.slice(1, 4).map((n) => `${placeOf(n)} (${dwellLabel(n.dwellTimeMinutes)})`);
    parts.push(`From there you moved on to ${rest.length > 1 ? `${rest.slice(0, -1).join(', ')} and ${rest[rest.length - 1]}` : rest[0]}.`);
  }
  if (hl !== first) parts.push(pick([`${placeOf(hl)} was the highlight.`, `The best of it was ${placeOf(hl)}.`]));
  const longest = [...d.transit].sort((a, b) => b.distanceKm - a.distanceKm)[0];
  if (longest && longest.mode === 'drive' && longest.distanceKm >= 20) {
    const to = d.nodes.find((n) => n.id === longest.toNodeId);
    const mins = (Date.parse(longest.endTime) - Date.parse(longest.startTime)) / MIN;
    parts.push(`A ${dwellLabel(mins)} drive took you ${to?.isHome ? 'home' : `to ${placeOf(to)}`}.`);
  }
  if (d.distanceKm >= 2) parts.push(`In all you covered ${d.distanceKm.toFixed(1)} km.`);
  if (d.photos) parts.push(`You took ${d.photos} photo${d.photos > 1 ? 's' : ''} along the way.`);
  if (energyWord) parts.push(`Your energy ran ${energyWord}${d.vibe === 'Cozy' ? ', and the day leaned cozy' : d.vibe === 'Social' ? ', and it was a day for people' : ''}.`);
  return parts.join(' ');
}
