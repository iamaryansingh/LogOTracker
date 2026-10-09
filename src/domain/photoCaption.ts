import type { MemoryPlace, MemoryStyle, VibeCategory } from './memoryTypes';
import { seeded, timeOfDay, VIBE_EMOJI } from './narrative';

/**
 * Writes a title and caption for a memory the user made, from what Apple Vision saw in the photos,
 * where it was and when. Templates only, on device; the seed keeps the wording stable per memory.
 */

export type PhotoTheme =
  | 'beach'
  | 'water'
  | 'mountain'
  | 'nature'
  | 'food'
  | 'drink'
  | 'city'
  | 'night'
  | 'sunset'
  | 'snow'
  | 'pet'
  | 'art'
  | 'people'
  | 'travel'
  | 'sport';

// Words that show up in Vision's scene identifiers (e.g. "sunset_sunrise", "dessert", "cityscape").
const THEME_WORDS: Record<PhotoTheme, string[]> = {
  beach: ['beach', 'shore', 'sand', 'ocean', 'sea', 'coast', 'surfboard', 'wave'],
  water: ['lake', 'river', 'waterfall', 'waterways', 'boat', 'harbour', 'harbor', 'pool'],
  mountain: ['mountain', 'hill', 'cliff', 'canyon', 'hiking', 'volcano', 'glacier', 'rock'],
  nature: ['tree', 'forest', 'park', 'garden', 'flower', 'grass', 'foliage', 'field', 'blossom', 'plant', 'meadow'],
  food: ['food', 'meal', 'dish', 'dessert', 'cake', 'pizza', 'sushi', 'burger', 'bread', 'salad', 'fruit', 'breakfast', 'sandwich', 'pasta', 'noodles', 'baked', 'ice_cream', 'chocolate'],
  drink: ['coffee', 'beverage', 'cocktail', 'wine', 'beer', 'drink', 'tea', 'latte', 'cappuccino', 'espresso'],
  city: ['cityscape', 'skyscraper', 'street', 'bridge', 'architecture', 'skyline', 'urban', 'downtown', 'building', 'tower'],
  night: ['night', 'fireworks', 'concert', 'nightclub', 'stage', 'neon', 'party'],
  sunset: ['sunset', 'sunrise', 'dusk'],
  snow: ['snow', 'ski', 'snowboard', 'ice'],
  pet: ['dog', 'cat', 'puppy', 'kitten', 'pet'],
  art: ['museum', 'painting', 'art', 'sculpture', 'gallery', 'mural', 'statue'],
  people: ['people', 'crowd', 'selfie', 'wedding', 'portrait'],
  travel: ['airplane', 'aircraft', 'airport', 'train', 'road', 'vehicle', 'car', 'luggage'],
  sport: ['sport', 'stadium', 'ball', 'tennis', 'soccer', 'basketball', 'gym', 'bicycle'],
};

export interface PhotoSignals {
  labels: { id: string; confidence: number }[];
  /** Most faces in any one photo. */
  faces: number;
}

/** Themes across all photos, strongest first. */
export function photoThemes(photos: PhotoSignals[]): PhotoTheme[] {
  const score = new Map<PhotoTheme, number>();
  for (const p of photos) {
    for (const l of p.labels) {
      const parts = l.id.toLowerCase().split(/[_\s]+/);
      for (const [theme, words] of Object.entries(THEME_WORDS) as [PhotoTheme, string[]][]) {
        if (words.some((w) => parts.includes(w) || l.id === w)) score.set(theme, (score.get(theme) ?? 0) + l.confidence);
      }
    }
    // Faces count for less than the scene, so a group at the beach still reads as a beach day.
    if (p.faces >= 2) score.set('people', (score.get('people') ?? 0) + 0.6);
    else if (p.faces === 1) score.set('people', (score.get('people') ?? 0) + 0.2);
  }
  return [...score.entries()].filter(([, s]) => s >= 0.3).sort((a, b) => b[1] - a[1]).map(([t]) => t);
}

/** Readable labels to keep on the memory, skipping Vision's vaguest ones. */
const VAGUE = new Set(['outdoor', 'indoor', 'structure', 'sky', 'adult', 'people', 'material', 'textile', 'wood_processed', 'document', 'screenshot', 'machine', 'conveyance']);
export function keyLabels(photos: PhotoSignals[], max = 6): string[] {
  const score = new Map<string, number>();
  for (const p of photos) for (const l of p.labels) if (!VAGUE.has(l.id)) score.set(l.id, (score.get(l.id) ?? 0) + l.confidence);
  return [...score.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, max)
    .map(([id]) => (id === 'sunset_sunrise' ? 'sunset' : id.replace(/_/g, ' ')));
}

export function themeVibe(themes: PhotoTheme[]): VibeCategory {
  const set = new Set(themes.slice(0, 3));
  if (set.has('people') || set.has('night')) return 'Social';
  if (themes[0] === 'travel') return 'Transit';
  if (set.has('food') || set.has('drink') || set.has('snow')) return 'Cozy';
  if (themes[0] === 'art' || themes[0] === 'sunset') return 'Reflective';
  if (set.has('sport')) return 'Focus';
  return themes.length ? 'Exploratory' : 'Reflective';
}

export interface CaptionInput {
  seed: string;
  style: MemoryStyle;
  themes: PhotoTheme[];
  labels: string[];
  photoCount: number;
  place?: MemoryPlace;
  when: Date;
}

const TITLES: Record<PhotoTheme, (place: string, tod: string) => string[]> = {
  beach: (p) => [`Salt Air at ${p}`, `Sand and Sea at ${p}`, `A Beach Day at ${p}`],
  water: (p) => [`By the Water at ${p}`, `Waterside at ${p}`],
  mountain: (p) => [`Up High at ${p}`, `Trails and Views at ${p}`],
  nature: (p, t) => [`A Green ${t} at ${p}`, `Among the Trees at ${p}`, `Outside at ${p}`],
  food: (p, t) => [`${t} Bites at ${p}`, `Something Good at ${p}`, `A Table at ${p}`],
  drink: (p) => [`A Cup at ${p}`, `Sipping at ${p}`],
  city: (p) => [`City Wandering in ${p}`, `Streets of ${p}`],
  night: (p) => [`A Night Out at ${p}`, `After Dark at ${p}`],
  sunset: (p) => [`Golden Hour at ${p}`, `Watching the Light Go at ${p}`],
  snow: (p) => [`Snow Day at ${p}`, `Cold Air at ${p}`],
  pet: (p) => [`Furry Company at ${p}`, `Paws at ${p}`],
  art: (p) => [`Slow Looking at ${p}`, `An Afternoon of Art at ${p}`],
  people: (p, t) => [`Good Company at ${p}`, `${t} Together at ${p}`],
  travel: (p) => [`On the Way to ${p}`, `In Transit: ${p}`],
  sport: (p) => [`Game On at ${p}`, `Moving at ${p}`],
};

const SCENES: Record<PhotoTheme, string> = {
  beach: 'sand and open water',
  water: 'the water close by',
  mountain: 'big views from up high',
  nature: 'green all around',
  food: 'something good on the table',
  drink: 'a drink in hand',
  city: 'the city all around',
  night: 'the night lit up',
  sunset: 'the light turning gold',
  snow: 'snow on the ground',
  pet: 'a four-legged friend',
  art: 'art worth slowing down for',
  people: 'good people',
  travel: 'the road ahead',
  sport: 'a game in motion',
};

const THEME_EMOJI: Record<PhotoTheme, string> = {
  beach: '🏖️', water: '🌊', mountain: '⛰️', nature: '🌿', food: '🍽️', drink: '☕', city: '🏙️', night: '✨',
  sunset: '🌅', snow: '❄️', pet: '🐾', art: '🖼️', people: '🫶', travel: '✈️', sport: '🏅',
};

const a = (word: string) => (/^[aeiou]/i.test(word) ? `an ${word}` : `a ${word}`);
const join = (xs: string[]) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);

export function photoMemoryText(c: CaptionInput): { title: string; caption: string; vibe: VibeCategory } {
  const pick = seeded(c.seed);
  const vibe = themeVibe(c.themes);
  const place = c.place?.name || c.place?.locality || 'somewhere new';
  const area = c.place?.city && c.place.city !== place ? c.place.city : undefined;
  const tod = timeOfDay(c.when);
  const date = c.when.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
  const top = c.themes.slice(0, 2);
  const scenes = top.map((t) => SCENES[t]);
  const pics = c.photoCount ? `${c.photoCount} photo${c.photoCount > 1 ? 's' : ''}` : '';

  const baseTitle = top[0] ? pick(TITLES[top[0]](place, tod)) : c.place ? pick([`${tod} at ${place}`, `${place}, Remembered`, `Back at ${place}`]) : `${a(tod)[0].toUpperCase()}${a(tod).slice(1)} to Remember`;

  if (c.style === 'RAW_BULLETS') {
    const lines = [
      `• ${date}, ${c.when.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`,
      c.place ? `• ${place}${area ? `, ${area}` : ''}` : null,
      pics ? `• ${pics}` : null,
      c.labels.length ? `• Seen: ${c.labels.join(', ')}` : null,
    ];
    return { title: `${c.when.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} — ${place}`, caption: lines.filter(Boolean).join('\n'), vibe };
  }

  if (c.style === 'GEN_Z_CASUAL') {
    const emoji = top.map((t) => THEME_EMOJI[t]).join('') || VIBE_EMOJI[vibe];
    const opener = pick(['core memory unlocked:', 'pov:', 'lore drop:']);
    const what = scenes.length ? `${join(scenes)} at ${place.toLowerCase()}` : `${tod.toLowerCase()} at ${place.toLowerCase()}`;
    const tail = pics ? ` ${pics} bc it deserved it.` : '';
    return { title: `${baseTitle.toLowerCase()} ${emoji}`, caption: `${opener} ${what} ${emoji}${tail} vibe check: ${vibe.toLowerCase()} ${VIBE_EMOJI[vibe]}`, vibe };
  }

  if (c.style === 'POETIC_MINIMAL') {
    const lines = [
      `${place}${area ? `, ${area}` : ''}.`,
      scenes.length ? `${scenes[0][0].toUpperCase()}${scenes[0].slice(1)}${scenes[1] ? `,\n${scenes[1]}` : ''}.` : `${a(tod.toLowerCase())[0].toUpperCase()}${a(tod.toLowerCase()).slice(1)} held still.`,
      pick(['Kept, so it stays.', 'Worth remembering.', 'Some days ask to be kept.']),
    ];
    return { title: baseTitle, caption: lines.join('\n'), vibe };
  }

  const opener = c.place
    ? pick([`${date}: ${a(tod.toLowerCase())} at ${place}${area ? ` in ${area}` : ''}.`, `On ${date}, you were at ${place}${area ? ` in ${area}` : ''}.`])
    : `${date}, ${tod.toLowerCase()}.`;
  const middle = scenes.length ? ` ${pick(['There was', 'The photos remember', 'What stayed:'])} ${join(scenes)}.` : '';
  const close = pics ? ` ${pick([`You kept ${pics} of it.`, `${pics[0].toUpperCase()}${pics.slice(1)} to hold onto.`])}` : '';
  return { title: baseTitle, caption: `${opener}${middle}${close}`, vibe };
}
