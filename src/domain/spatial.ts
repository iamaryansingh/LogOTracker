import { toISODate } from '../utils/time';
import type { LocationPoint, TransitLeg } from './memoryTypes';
import { legModes, type KnownActivity } from './movement';

/**
 * Turns raw background location points into places you stayed (stay points), the movement
 * between them, your home, and days spent away. Pure and synchronous so it can be unit-tested.
 *
 * iOS only reports location when you move (~50 m), so a long stay often shows up as just an
 * arrival fix and a departure fix hours apart. Stay detection therefore works on *time span
 * within a radius*, not on point density.
 */

const MIN = 60_000;
const EARTH_M = 6_371_000;

export const STAY_RADIUS_M = 150;
export const MIN_STAY_MS = 15 * MIN;
const MERGE_DISTANCE_M = 250;
const MERGE_GAP_MS = 45 * MIN;
const MAX_ACCURACY_M = 200;
export const AWAY_FROM_HOME_KM = 50;

export interface Stay {
  lat: number;
  lon: number;
  start: number;
  end: number;
  count: number;
}

const rad = (d: number) => (d * Math.PI) / 180;

export function distanceM(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Drops fixes too inaccurate to place you, and sorts by time. */
export function cleanPoints(points: LocationPoint[]): LocationPoint[] {
  return points.filter((p) => (p.acc ?? 0) <= MAX_ACCURACY_M && Number.isFinite(p.lat) && Number.isFinite(p.lon)).sort((a, b) => a.t - b.t);
}

/** Stay-point detection: a run of fixes within STAY_RADIUS_M of their running centre for at least MIN_STAY_MS. */
export function detectStays(raw: LocationPoint[], radiusM = STAY_RADIUS_M, minStayMs = MIN_STAY_MS): Stay[] {
  const points = cleanPoints(raw);
  const stays: Stay[] = [];
  let i = 0;
  while (i < points.length) {
    let lat = points[i].lat;
    let lon = points[i].lon;
    let j = i + 1;
    while (j < points.length && distanceM({ lat, lon }, points[j]) <= radiusM) {
      const n = j - i + 1;
      lat += (points[j].lat - lat) / n;
      lon += (points[j].lon - lon) / n;
      j++;
    }
    const span = points[j - 1].t - points[i].t;
    if (span >= minStayMs) {
      // Weight each fix by how long you stayed there, so the walk-in fixes (seconds apart)
      // don't drag the centre toward the street and make the geocoder pick the shop next door.
      let wSum = 0;
      let wLat = 0;
      let wLon = 0;
      for (let k = i; k < j; k++) {
        const w = Math.min((points[k + 1]?.t ?? points[k].t) - points[k].t, 60 * MIN) + 1000;
        wSum += w;
        wLat += points[k].lat * w;
        wLon += points[k].lon * w;
      }
      stays.push({ lat: wLat / wSum, lon: wLon / wSum, start: points[i].t, end: points[j - 1].t, count: j - i });
      i = j;
    } else {
      i++;
    }
  }
  return mergeStays(stays);
}

/** A short walk to the car and back, or GPS drift, shouldn't split one visit into two. */
function mergeStays(stays: Stay[]): Stay[] {
  const out: Stay[] = [];
  for (const s of stays) {
    const last = out[out.length - 1];
    if (last && s.start - last.end <= MERGE_GAP_MS && distanceM(last, s) <= MERGE_DISTANCE_M) {
      const w = last.count + s.count;
      last.lat = (last.lat * last.count + s.lat * s.count) / w;
      last.lon = (last.lon * last.count + s.lon * s.count) / w;
      last.end = Math.max(last.end, s.end);
      last.count = w;
    } else {
      out.push({ ...s });
    }
  }
  return out;
}

const dayStart = (date: string) => new Date(`${date}T00:00:00`).getTime();
const dayEnd = (date: string) => dayStart(date) + 24 * 60 * MIN;

/** Stays that overlap a calendar day, clipped to it (an overnight stay at home shows as early morning and late evening). */
export function staysForDay(stays: Stay[], date: string): Stay[] {
  const s0 = dayStart(date);
  const s1 = dayEnd(date);
  return stays
    .filter((s) => s.end > s0 && s.start < s1)
    .map((s) => ({ ...s, start: Math.max(s.start, s0), end: Math.min(s.end, s1) }))
    .filter((s) => s.end - s.start >= MIN_STAY_MS);
}

export function pointsForDay(points: LocationPoint[], date: string): LocationPoint[] {
  const s0 = dayStart(date);
  const s1 = dayEnd(date);
  return points.filter((p) => p.t >= s0 && p.t < s1);
}

export function pathDistanceKm(points: LocationPoint[]): number {
  let m = 0;
  for (let i = 1; i < points.length; i++) {
    const d = distanceM(points[i - 1], points[i]);
    // A jump this large between two fixes is GPS noise, not a journey.
    if (d < 50_000) m += d;
  }
  return m / 1000;
}

/** The movement between consecutive stays on a day. */
export function transitLegs(points: LocationPoint[], stays: Stay[], nodeIds: string[], known: KnownActivity[] = []): TransitLeg[] {
  const legs: TransitLeg[] = [];
  for (let k = 1; k < stays.length; k++) {
    const from = stays[k - 1];
    const to = stays[k];
    const between = points.filter((p) => p.t >= from.end && p.t <= to.start);
    const route = [{ t: from.end, lat: from.lat, lon: from.lon }, ...between, { t: to.start, lat: to.lat, lon: to.lon }];
    const km = Math.max(pathDistanceKm(route), distanceM(from, to) / 1000);
    if (km < 0.2) continue;
    const hours = Math.max((to.start - from.end) / 3_600_000, 1 / 60);
    const kmh = km / hours;
    // Speed fix by fix tells a walk to the car and a drive apart; the average alone can't.
    const modes = legModes(points, from.end, to.start, known);
    legs.push({
      fromNodeId: nodeIds[k - 1],
      toNodeId: nodeIds[k],
      startTime: new Date(from.end).toISOString(),
      endTime: new Date(to.start).toISOString(),
      distanceKm: Math.round(km * 10) / 10,
      mode: modes?.mode ?? (kmh < 7 ? 'walk' : kmh < 12 ? 'run' : kmh < 25 ? 'cycle' : 'drive'),
      parts: modes && modes.parts.length > 1 ? modes.parts : undefined,
    });
  }
  return legs;
}

/** Ramer–Douglas–Peucker in metres, so the map line stays light. */
export function simplifyPath(points: LocationPoint[], epsilonM = 15, max = 400): { latitude: number; longitude: number }[] {
  if (points.length <= 2) return points.map((p) => ({ latitude: p.lat, longitude: p.lon }));
  const keep = new Array(points.length).fill(false);
  keep[0] = keep[points.length - 1] = true;
  const stack: [number, number][] = [[0, points.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop()!;
    let maxD = 0;
    let idx = -1;
    for (let i = a + 1; i < b; i++) {
      const d = perpendicularM(points[i], points[a], points[b]);
      if (d > maxD) {
        maxD = d;
        idx = i;
      }
    }
    if (idx !== -1 && maxD > epsilonM) {
      keep[idx] = true;
      stack.push([a, idx], [idx, b]);
    }
  }
  let out = points.filter((_, i) => keep[i]);
  if (out.length > max) out = out.filter((_, i) => i % Math.ceil(out.length / max) === 0);
  return out.map((p) => ({ latitude: p.lat, longitude: p.lon }));
}

function perpendicularM(p: LocationPoint, a: LocationPoint, b: LocationPoint): number {
  const ab = distanceM(a, b);
  if (ab === 0) return distanceM(p, a);
  // Heron's formula on the small triangle; plenty accurate at city scale.
  const ap = distanceM(a, p);
  const bp = distanceM(b, p);
  const s = (ab + ap + bp) / 2;
  const area = Math.sqrt(Math.max(0, s * (s - ab) * (s - ap) * (s - bp)));
  return (2 * area) / ab;
}

/** Home is where you most often are between 1 and 5 am. Null until there's enough to tell. */
export function findHome(points: LocationPoint[]): { lat: number; lon: number } | null {
  const cells = new Map<string, LocationPoint[]>();
  for (const p of cleanPoints(points)) {
    const h = new Date(p.t).getHours();
    if (h < 1 || h >= 5) continue;
    const key = `${p.lat.toFixed(3)},${p.lon.toFixed(3)}`;
    cells.set(key, [...(cells.get(key) ?? []), p]);
  }
  let best: LocationPoint[] = [];
  for (const c of cells.values()) if (c.length > best.length) best = c;
  if (best.length < 2) return null;
  return { lat: best.reduce((s, p) => s + p.lat, 0) / best.length, lon: best.reduce((s, p) => s + p.lon, 0) / best.length };
}

/** Days spent far from home, grouped into runs. A run is a trip if it includes a night away or spans 2+ days. */
export function detectTrips(points: LocationPoint[], home: { lat: number; lon: number } | null): { start: string; end: string; days: string[] }[] {
  if (!home) return [];
  const byDay = new Map<string, LocationPoint[]>();
  for (const p of cleanPoints(points)) {
    const d = toISODate(new Date(p.t));
    byDay.set(d, [...(byDay.get(d) ?? []), p]);
  }
  const days = [...byDay.keys()].sort();
  const awayKm = (pts: LocationPoint[]) => Math.max(...pts.map((p) => distanceM(home, p) / 1000));
  const nightAway = (pts: LocationPoint[]) => pts.some((p) => new Date(p.t).getHours() < 5 && distanceM(home, p) / 1000 > AWAY_FROM_HOME_KM);

  const trips: { start: string; end: string; days: string[] }[] = [];
  let run: string[] = [];
  const close = () => {
    if (!run.length) return;
    const multiDay = run.length >= 2;
    const slept = run.some((d) => nightAway(byDay.get(d)!));
    if (multiDay || slept) trips.push({ start: run[0], end: run[run.length - 1], days: run });
    run = [];
  };
  for (const d of days) {
    const pts = byDay.get(d)!;
    const prev = run[run.length - 1];
    const consecutive = prev && dayStart(d) - dayStart(prev) <= 26 * 3_600_000;
    if (awayKm(pts) > AWAY_FROM_HOME_KM) {
      if (!consecutive) close();
      run.push(d);
    } else {
      close();
    }
  }
  close();
  return trips;
}

// ---- Parking -----------------------------------------------------------------------------------

const DRIVE_KMH = 20;
const WALK_KMH = 8;

export interface ParkingSpot {
  lat: number;
  lon: number;
  /** When the car stopped (epoch ms). */
  t: number;
  /** Straight-line metres from the car to the place you walked to. */
  walkM: number;
  /** Index of the stay you walked to. */
  stayIndex: number;
}

const kmhBetween = (a: LocationPoint, b: LocationPoint) => {
  const h = (b.t - a.t) / 3_600_000;
  return h > 0 ? distanceM(a, b) / 1000 / h : 0;
};

/**
 * Where the car was left before each stay: scanning back from arrival, the last fix after
 * driving speed gave way to walking pace. Cycling or running pace in between means it wasn't a
 * park-and-walk, so nothing is noted.
 */
export function detectParking(raw: LocationPoint[], stays: Stay[]): ParkingSpot[] {
  const points = cleanPoints(raw);
  const spots: ParkingSpot[] = [];
  stays.forEach((stay, k) => {
    // The fix where you parked can be the first one inside the stay (a lot next door).
    const before = points.filter((p) => p.t >= stay.start - 40 * MIN && p.t <= stay.start + 2 * MIN);
    const park = (car: LocationPoint) => {
      const walkM = distanceM(car, stay);
      if (walkM <= 2000) spots.push({ lat: car.lat, lon: car.lon, t: car.t, walkM: Math.round(walkM), stayIndex: k });
    };
    for (let j = before.length - 1; j > 0; j--) {
      const kmh = kmhBetween(before[j - 1], before[j]);
      if (kmh >= DRIVE_KMH) return park(before[j]);
      if (kmh > WALK_KMH) {
        // The fix that spans parking mixes driving and walking. If driving came right before it,
        // the car stopped close to where driving ended.
        if (j > 1 && kmhBetween(before[j - 2], before[j - 1]) >= DRIVE_KMH) park(before[j - 1]);
        return;
      }
    }
  });
  return spots;
}

/** The latest parking spot the car hasn't driven away from since, i.e. where it is now. */
export function currentCar(raw: LocationPoint[], spots: ParkingSpot[]): ParkingSpot | undefined {
  const last = spots[spots.length - 1];
  if (!last) return undefined;
  const after = cleanPoints(raw).filter((p) => p.t > last.t);
  for (let i = 1; i < after.length; i++) if (kmhBetween(after[i - 1], after[i]) >= DRIVE_KMH) return undefined;
  return last;
}
