import type { DailyMemory } from './memoryTypes';
import { distanceM } from './spatial';

/**
 * Your places, learned from memories: where you really parked, the places you keep going back to
 * (and when), and from that, where you might go next. Pure; the screen supplies "now", where you
 * are and what Apple Maps has nearby.
 */

const DAY_MS = 86_400_000;
const WEEKDAY = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const ll = (p: { latitude: number; longitude: number }) => ({ lat: p.latitude, lon: p.longitude });

export interface ParkingHabit {
  name: string;
  latitude: number;
  longitude: number;
  times: number;
  lastParked: string; // ISO
  /** Where you walked to from here, most often first. */
  destinations: string[];
  /** Typical walk from the car, metres. */
  walkM: number;
}

/** Every spot you actually parked, grouped within ~80 m, most used first. */
export function parkingHabits(memories: DailyMemory[]): ParkingHabit[] {
  const spots: (ParkingHabit & { dest: Map<string, number>; walks: number[] })[] = [];
  for (const m of memories) {
    for (const p of m.parking ?? []) {
      const near = spots.find((s) => distanceM(ll(s), ll(p)) < 80);
      if (near) {
        near.times++;
        if (p.time > near.lastParked) near.lastParked = p.time;
        // Keep the first real lot name Apple Maps gave us.
        if (near.name === 'Parking spot' && p.name) near.name = p.name;
        near.walks.push(p.walkM);
        if (p.toName) near.dest.set(p.toName, (near.dest.get(p.toName) ?? 0) + 1);
      } else {
        spots.push({
          name: p.name ?? 'Parking spot',
          latitude: p.latitude,
          longitude: p.longitude,
          times: 1,
          lastParked: p.time,
          destinations: [],
          walkM: p.walkM,
          dest: new Map(p.toName ? [[p.toName, 1]] : []),
          walks: [p.walkM],
        });
      }
    }
  }
  return spots
    .map(({ dest, walks, ...s }) => ({
      ...s,
      destinations: [...dest.entries()].sort((a, b) => b[1] - a[1]).map(([n]) => n),
      walkM: [...walks].sort((a, b) => a - b)[Math.floor(walks.length / 2)],
    }))
    .sort((a, b) => b.times - a.times || b.lastParked.localeCompare(a.lastParked));
}

export interface PlaceHabit {
  name: string;
  latitude: number;
  longitude: number;
  category?: string;
  locality?: string;
  visits: number;
  totalMin: number;
  lastVisited: string; // YYYY-MM-DD
  /** Arrival times, for "usually Sunday mornings". */
  arrivals: number[];
  activity?: { label: string; emoji: string; kind: string };
}

/** Places you've spent time (home excluded), most visited first. */
export function placeHabits(memories: DailyMemory[]): PlaceHabit[] {
  const out: PlaceHabit[] = [];
  for (const m of memories) {
    for (const n of m.spatialNodes) {
      if (n.isHome || n.placeName === 'Somewhere new') continue;
      const seen = out.find((p) => p.name === n.placeName && distanceM(ll(p), ll(n)) < 150);
      const arrival = Date.parse(n.arrivalTime);
      if (seen) {
        seen.visits++;
        seen.totalMin += n.dwellTimeMinutes;
        seen.arrivals.push(arrival);
        if (m.date > seen.lastVisited) seen.lastVisited = m.date;
        seen.activity ??= n.activity;
        seen.category ??= n.category;
      } else {
        out.push({
          name: n.placeName,
          latitude: n.latitude,
          longitude: n.longitude,
          category: n.category,
          locality: n.locality,
          visits: 1,
          totalMin: n.dwellTimeMinutes,
          lastVisited: m.date,
          arrivals: [arrival],
          activity: n.activity,
        });
      }
    }
  }
  return out.sort((a, b) => b.visits - a.visits || b.totalMin - a.totalMin);
}

const partOfDay = (h: number) => (h < 11 ? 'mornings' : h < 15 ? 'middays' : h < 18 ? 'afternoons' : 'evenings');

/** "Usually Sunday mornings", when visits cluster; otherwise undefined. */
export function usualTime(p: PlaceHabit): string | undefined {
  if (p.arrivals.length < 2) return undefined;
  const days = new Map<number, number>();
  const parts = new Map<string, number>();
  for (const t of p.arrivals) {
    const d = new Date(t);
    days.set(d.getDay(), (days.get(d.getDay()) ?? 0) + 1);
    parts.set(partOfDay(d.getHours()), (parts.get(partOfDay(d.getHours())) ?? 0) + 1);
  }
  const [day, dayN] = [...days.entries()].sort((a, b) => b[1] - a[1])[0];
  const [part, partN] = [...parts.entries()].sort((a, b) => b[1] - a[1])[0];
  const n = p.arrivals.length;
  if (dayN / n >= 0.6 && partN / n >= 0.6) return `Usually ${WEEKDAY[day]} ${part}`;
  if (partN / n >= 0.7) return `Usually ${part}`;
  return undefined;
}

export interface NearbyCandidate {
  name: string;
  latitude: number;
  longitude: number;
  category?: string;
  distance?: number;
}

export interface PlaceSuggestion {
  key: string;
  name: string;
  latitude: number;
  longitude: number;
  emoji: string;
  /** Why it's suggested now. */
  reason: string;
  category?: string;
  distanceM?: number;
  /** Where you've parked for this place before. */
  parking?: ParkingHabit;
  isNew: boolean;
}

const mealWindow = (h: number) => (h >= 7 && h < 10.5 ? 'breakfast' : h >= 11.5 && h < 14.5 ? 'lunch' : h >= 17.5 && h < 21.5 ? 'dinner' : undefined);
const CATEGORY_EMOJI: Record<string, string> = {
  Restaurant: '🍽️', Cafe: '☕', Bakery: '🥐', Park: '🌳', Museum: '🏛️', FitnessCenter: '🏋️', Nightlife: '🍸', Brewery: '🍺',
  Library: '📚', Store: '🛍️', FoodMarket: '🧺', Beach: '🏖️', MovieTheater: '🎬', Theater: '🎭',
};

/** The parking spot you've used for a place (within a short walk of it). */
export function parkingFor(place: { latitude: number; longitude: number; name: string }, spots: ParkingHabit[]): ParkingHabit | undefined {
  return (
    spots.find((s) => s.destinations.includes(place.name)) ??
    spots.filter((s) => distanceM(ll(s), ll(place)) < 600).sort((a, b) => b.times - a.times)[0]
  );
}

/**
 * Where you might go next, decided from your own patterns: your routine for this weekday and
 * hour, your go-to for the meal coming up, favourites you haven't been to in a while, and new
 * places nearby of the kinds you like. Each comes with the parking you've used there.
 */
export function suggestPlaces(input: {
  places: PlaceHabit[];
  parking: ParkingHabit[];
  now: Date;
  here?: { latitude: number; longitude: number };
  nearby?: NearbyCandidate[];
  visitedToday: string[];
}): PlaceSuggestion[] {
  const { places, parking, now, here, nearby = [], visitedToday } = input;
  const h = now.getHours() + now.getMinutes() / 60;
  const out: PlaceSuggestion[] = [];
  const add = (p: Omit<PlaceSuggestion, 'key' | 'parking' | 'distanceM'>) => {
    if (out.some((o) => o.name === p.name) || visitedToday.includes(p.name)) return;
    const distance = here ? distanceM(ll(here), ll(p)) : undefined;
    out.push({ ...p, key: `${p.name}-${p.latitude.toFixed(4)}`, distanceM: distance, parking: p.isNew ? undefined : parkingFor(p, parking) });
  };
  const daysSince = (date: string) => Math.round((now.getTime() - new Date(`${date}T12:00:00`).getTime()) / DAY_MS);

  // 1. Routine: places you've been on this weekday around this hour.
  for (const p of places) {
    const matches = p.arrivals.filter((t) => {
      const d = new Date(t);
      return d.getDay() === now.getDay() && Math.abs(d.getHours() - now.getHours()) <= 2;
    }).length;
    if (matches >= 2) add({ ...p, emoji: p.activity?.emoji ?? '🔁', reason: `You often come here on ${WEEKDAY[now.getDay()]}s around now`, isNew: false });
  }

  // 2. The meal coming up: your most-visited place for it.
  const meal = mealWindow(h);
  if (meal) {
    const goTo = places.find((p) => p.activity?.kind === 'meal' || p.category === 'Restaurant' || (meal === 'breakfast' && (p.category === 'Cafe' || p.category === 'Bakery')));
    if (goTo) add({ ...goTo, emoji: goTo.activity?.emoji ?? '🍽️', reason: `It’s ${meal} time. Your go-to (${goTo.visits} visit${goTo.visits > 1 ? 's' : ''})`, isNew: false });
  }

  // 3. Favourites you haven't been to in a while.
  for (const p of places.filter((x) => x.visits >= 3)) {
    const gap = daysSince(p.lastVisited);
    if (gap >= 21) add({ ...p, emoji: p.activity?.emoji ?? '💛', reason: `A favourite. You haven’t been in ${Math.round(gap / 7)} weeks`, isNew: false });
  }

  // 4. Somewhere new nearby, of a kind you already like.
  const known = new Set(places.map((p) => p.name));
  for (const c of nearby.filter((n) => !known.has(n.name)).slice(0, 3)) {
    add({
      name: c.name,
      latitude: c.latitude,
      longitude: c.longitude,
      category: c.category,
      emoji: (c.category && CATEGORY_EMOJI[c.category]) ?? '✨',
      reason: `New to you${c.category ? `: ${c.category.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase()}` : ''}, like the places you go`,
      isNew: true,
    });
  }

  return out.slice(0, 6);
}

/** The Apple Maps categories you spend the most time at, to look for new places of the same kind. */
export function favouriteCategories(places: PlaceHabit[], max = 3): string[] {
  const time = new Map<string, number>();
  for (const p of places) if (p.category && p.category !== 'Parking') time.set(p.category, (time.get(p.category) ?? 0) + p.totalMin);
  return [...time.entries()].sort((a, b) => b[1] - a[1]).slice(0, max).map(([c]) => c);
}
