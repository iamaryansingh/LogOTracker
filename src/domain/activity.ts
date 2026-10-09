/**
 * Guesses what you were doing at a place from its Apple Maps category, the time you arrived and
 * how long you stayed: 40 minutes at a restaurant at 7 pm reads as dinner there.
 */

export type ActivityKind =
  | 'meal'
  | 'coffee'
  | 'drinks'
  | 'workout'
  | 'outdoors'
  | 'culture'
  | 'show'
  | 'shopping'
  | 'study'
  | 'errand'
  | 'travel'
  | 'stay'
  | 'visit';

export interface Activity {
  kind: ActivityKind;
  /** "Dinner at Olive Garden". */
  label: string;
  emoji: string;
}

const MEALS_MIN = 25;

function meal(arrival: Date): { word: string; emoji: string } {
  const h = arrival.getHours() + arrival.getMinutes() / 60;
  const weekend = arrival.getDay() === 0 || arrival.getDay() === 6;
  if (h < 5) return { word: 'Late-night bite', emoji: '🌙' };
  if (h < 10.5) return { word: 'Breakfast', emoji: '🍳' };
  if (h < 12 && weekend) return { word: 'Brunch', emoji: '🥞' };
  if (h < 15.5) return { word: 'Lunch', emoji: '🥗' };
  if (h < 17) return { word: 'A late lunch', emoji: '🥪' };
  if (h < 22) return { word: 'Dinner', emoji: '🍽️' };
  return { word: 'Late-night bite', emoji: '🌙' };
}

const WEEKDAY = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/**
 * Names that only make sense with the day and hour: a market on a Sunday morning is the
 * "Sunday Farmers Market", a park on a weekend morning is a slow weekend morning there.
 */
function semanticEvent(category: string | undefined, placeName: string, arrival: Date, dwellMin: number): Activity | undefined {
  const day = WEEKDAY[arrival.getDay()];
  const h = arrival.getHours();
  const weekend = arrival.getDay() === 0 || arrival.getDay() === 6;
  const morning = h >= 7 && h < 14;
  const market = /\bmarket\b/i.test(placeName) && !/\bsuper ?market\b/i.test(placeName);
  if (market && weekend && morning && dwellMin >= 20) {
    return { kind: 'shopping', label: /farmer/i.test(placeName) || category === 'FoodMarket' ? `${day} Farmers Market` : `${day} Market at ${placeName}`, emoji: '🧺' };
  }
  if ((category === 'Park' || category === 'NationalPark') && weekend && morning && dwellMin >= 30) {
    return { kind: 'outdoors', label: `${day} morning at ${placeName}`, emoji: '🌤️' };
  }
  if (category === 'Restaurant' && weekend && h >= 10 && h < 13 && dwellMin >= MEALS_MIN) {
    return { kind: 'meal', label: `${day} brunch at ${placeName}`, emoji: '🥞' };
  }
  return undefined;
}

/** Places you're only "at" when you're inside: still, in one spot. */
const OUTDOOR = new Set(['Park', 'NationalPark', 'Hiking', 'Campground', 'Beach', 'Marina', 'Surfing', 'Kayaking', 'Skiing', 'Fishing', 'AmusementPark', 'Fairground', 'Zoo', 'Landmark', 'Castle', 'Fortress', 'NationalMonument', 'Stadium', 'Baseball']);

export interface PresenceHint {
  /** Still, in a tight spot, long enough to be inside. */
  inside: boolean;
  /** Share of the stay spent moving. */
  movingShare: number;
}

/**
 * What you were likely doing, or undefined when the place or stay doesn't say enough. With a
 * presence hint, indoor places (restaurants, shops, gyms…) only count when you were inside; out
 * walking through a park reads as a walk there, not a visit.
 */
export function inferActivity(category: string | undefined, placeName: string, arrival: Date, dwellMin: number, presence?: PresenceHint): Activity | undefined {
  if (dwellMin < 10) return undefined;
  if (presence && !presence.inside) {
    if (category && OUTDOOR.has(category) && presence.movingShare > 0.35) {
      return { kind: 'outdoors', label: category === 'Beach' ? `A walk on ${placeName}` : `A walk through ${placeName}`, emoji: '🚶' };
    }
    if (presence.movingShare > 0.35) return { kind: 'visit', label: `Walking around near ${placeName}`, emoji: '👟' };
    // Near a restaurant isn't eating at it.
    if (!category || !OUTDOOR.has(category)) return undefined;
  }
  const semantic = semanticEvent(category, placeName, arrival, dwellMin);
  if (semantic) return semantic;
  if (!category) return undefined;
  const at = (verb: string) => `${verb} at ${placeName}`;
  switch (category) {
    case 'Restaurant':
    case 'FoodMarket': {
      if (category === 'FoodMarket') return { kind: 'shopping', label: at('Groceries'), emoji: '🛒' };
      if (dwellMin < MEALS_MIN) return { kind: 'meal', label: at('A quick bite'), emoji: '🥡' };
      const m = meal(arrival);
      return { kind: 'meal', label: at(m.word), emoji: m.emoji };
    }
    case 'Cafe':
    case 'Bakery':
      return dwellMin >= 90 ? { kind: 'study', label: at('A long sit'), emoji: '💻' } : { kind: 'coffee', label: at('Coffee'), emoji: '☕' };
    case 'Nightlife':
    case 'Brewery':
    case 'Winery':
    case 'Distillery':
      return { kind: 'drinks', label: at('Drinks'), emoji: '🍻' };
    case 'MusicVenue':
      return { kind: 'show', label: at('Live music'), emoji: '🎶' };
    case 'FitnessCenter':
    case 'Swimming':
    case 'RockClimbing':
    case 'Tennis':
    case 'Basketball':
    case 'Soccer':
    case 'Volleyball':
    case 'Bowling':
    case 'Golf':
    case 'MiniGolf':
    case 'Skating':
    case 'SkatePark':
    case 'GoKart':
      return { kind: 'workout', label: at(category === 'FitnessCenter' ? 'Workout' : 'Playing'), emoji: '🏋️' };
    case 'Park':
    case 'NationalPark':
    case 'Hiking':
    case 'Campground':
    case 'Beach':
    case 'Marina':
    case 'Surfing':
    case 'Kayaking':
    case 'Skiing':
    case 'Fishing':
      return { kind: 'outdoors', label: category === 'Beach' ? at('Beach time') : category === 'Hiking' ? at('A hike') : at('Time outside'), emoji: category === 'Beach' ? '🏖️' : '🌳' };
    case 'Museum':
    case 'Aquarium':
    case 'Zoo':
    case 'Planetarium':
    case 'Landmark':
    case 'Castle':
    case 'Fortress':
    case 'NationalMonument':
      return { kind: 'culture', label: at(category === 'Zoo' || category === 'Aquarium' ? 'A visit' : 'Exploring'), emoji: '🏛️' };
    case 'MovieTheater':
      return { kind: 'show', label: at('A movie'), emoji: '🎬' };
    case 'Theater':
      return { kind: 'show', label: at('A show'), emoji: '🎭' };
    case 'Stadium':
    case 'Baseball':
      return { kind: 'show', label: at('A game'), emoji: '🏟️' };
    case 'AmusementPark':
    case 'Fairground':
      return { kind: 'outdoors', label: at('A fun day'), emoji: '🎢' };
    case 'Store':
      return { kind: 'shopping', label: at('Shopping'), emoji: '🛍️' };
    case 'Library':
    case 'University':
    case 'School':
      return { kind: 'study', label: at(category === 'Library' ? 'Reading' : 'Class'), emoji: '📚' };
    case 'Spa':
    case 'Beauty':
      return { kind: 'errand', label: at('Some self-care'), emoji: '💆' };
    case 'Hospital':
    case 'Pharmacy':
    case 'Bank':
    case 'PostOffice':
    case 'Laundry':
    case 'AutomotiveRepair':
    case 'GasStation':
    case 'EVCharger':
      return { kind: 'errand', label: at('An errand'), emoji: '📋' };
    case 'Airport':
    case 'PublicTransport':
      return { kind: 'travel', label: at('In transit'), emoji: '✈️' };
    case 'Hotel':
    case 'RVPark':
      return { kind: 'stay', label: at('Staying'), emoji: '🛏️' };
    case 'ConventionCenter':
      return { kind: 'visit', label: at('An event'), emoji: '🎟️' };
    default:
      return undefined;
  }
}

/** Short words for the photo-prompt notification ("Having dinner at …?"). */
export function activityQuestion(a: Activity): string {
  switch (a.kind) {
    case 'meal':
      return `${a.label.replace(/^(\S+)/, (w) => `Having ${w.toLowerCase()}`)}?`;
    case 'coffee':
      return `Coffee break${a.label.slice('Coffee'.length)}?`;
    default:
      return `${a.label}?`;
  }
}
