import type { LocationPoint } from './memoryTypes';
import { distanceM, type Stay } from './spatial';

/**
 * How you were moving, and whether you were really *at* a place.
 *
 * - Modes come from speed (the GPS's own when the fix has one, else distance ÷ time), smoothed
 *   over neighbouring fixes so a red light doesn't turn a drive into a walk.
 * - Presence: a stay only counts as "inside" (eating, shopping, working out) when you were still,
 *   in a tight spot, for a while; drifting around at walking pace is passing through or wandering.
 * - Routines: a route you take on many days at about the same time (a daily walk, the commute) is
 *   recognised as yours, not as a string of places visited.
 */

export type MoveMode = 'still' | 'walk' | 'run' | 'cycle' | 'drive';

const MIN = 60_000;
/** A gap longer than this between fixes isn't a known speed. */
const MAX_GAP = 10 * MIN;

export function modeForKmh(kmh: number): MoveMode {
  if (kmh < 1.5) return 'still';
  if (kmh < 7) return 'walk';
  if (kmh < 12) return 'run';
  if (kmh < 25) return 'cycle';
  return 'drive';
}

export interface Segment {
  a: LocationPoint;
  b: LocationPoint;
  kmh: number;
  meters: number;
}

/** Speed between consecutive fixes, preferring the GPS's own reading. */
export function segments(points: LocationPoint[]): Segment[] {
  const out: Segment[] = [];
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    const dt = b.t - a.t;
    if (dt <= 0 || dt > MAX_GAP) continue;
    const meters = distanceM(a, b);
    const gps = [a.s, b.s].filter((s): s is number => s !== undefined && s >= 0);
    // A hop smaller than the two fixes' uncertainty is GPS jitter, not movement.
    const jitter = !gps.length && meters < Math.min((a.acc ?? 20) + (b.acc ?? 20), 120);
    const computed = jitter ? 0 : meters / 1000 / (dt / 3_600_000);
    // GPS speed is instantaneous and less noisy; fall back to distance over time.
    const kmh = gps.length ? (gps.reduce((x, y) => x + y, 0) / gps.length) * 3.6 : computed;
    out.push({ a, b, kmh, meters });
  }
  return out;
}

const median = (xs: number[]) => {
  const s = [...xs].sort((x, y) => x - y);
  return s.length ? s[Math.floor(s.length / 2)] : 0;
};

export interface Bout {
  mode: MoveMode;
  start: number;
  end: number;
  km: number;
  avgKmh: number;
}

/** Joins neighbouring bouts of the same mode. */
function mergeSame(bouts: Bout[]): Bout[] {
  const out: Bout[] = [];
  for (const b of bouts) {
    const prev = out[out.length - 1];
    if (prev && prev.mode === b.mode && b.start - prev.end < MAX_GAP) {
      prev.end = b.end;
      prev.km += b.km;
    } else out.push({ ...b });
  }
  return out;
}

/** A known stretch of walking or running, e.g. one Apple Health detected on its own. */
export interface KnownActivity {
  start: number;
  end: number;
  mode: 'walk' | 'run';
}

/**
 * Stretches of one way of moving. Speeds are smoothed with a 5-fix median, and bouts under two
 * minutes are folded into their neighbours (traffic lights, a jog across the road). Then each bout
 * is judged by its overall pace, slow stretches next to a drive count as driving (traffic, a car
 * park), and anything Apple Health saw as a walk or run is taken as one.
 */
export function movementBouts(points: LocationPoint[], known: KnownActivity[] = []): Bout[] {
  const segs = segments(points);
  if (!segs.length) return [];
  const smooth = segs.map((_, i) => median(segs.slice(Math.max(0, i - 2), i + 3).map((s) => s.kmh)));
  const bouts: Bout[] = [];
  segs.forEach((s, i) => {
    const mode = modeForKmh(smooth[i]);
    const last = bouts[bouts.length - 1];
    if (last && last.mode === mode && s.a.t - last.end < MAX_GAP) {
      last.end = s.b.t;
      last.km += s.meters / 1000;
    } else bouts.push({ mode, start: s.a.t, end: s.b.t, km: s.meters / 1000, avgKmh: 0 });
  });
  // Fold blips into the bout before them (or after, at the start).
  const merged: Bout[] = [];
  for (const b of bouts) {
    const prev = merged[merged.length - 1];
    if (prev && (b.end - b.start < 2 * MIN || prev.mode === b.mode)) {
      prev.end = b.end;
      prev.km += b.km;
    } else merged.push({ ...b });
  }
  if (merged.length > 1 && merged[0].end - merged[0].start < 2 * MIN) {
    merged[1].start = merged[0].start;
    merged[1].km += merged[0].km;
    merged.shift();
  }
  const pace = (b: Bout) => b.km / Math.max((b.end - b.start) / 3_600_000, 1 / 60);
  // Overall pace beats the per-fix guess: 2 km over an hour is a stroll, whatever the jitter said.
  for (const b of merged) if (b.end - b.start >= 3 * MIN) b.mode = modeForKmh(pace(b));
  // Slow going right next to driving is still the car; so is a few minutes of crawling between two drives.
  merged.forEach((b, i) => {
    const near = (o?: Bout) => o?.mode === 'drive' && Math.min(Math.abs(o.start - b.end), Math.abs(b.start - o.end)) <= 3 * MIN;
    if ((b.mode === 'run' || b.mode === 'cycle') && (near(merged[i - 1]) || near(merged[i + 1]))) b.mode = 'drive';
    else if (b.mode === 'walk' && b.end - b.start < 6 * MIN && near(merged[i - 1]) && near(merged[i + 1])) b.mode = 'drive';
  });
  // Apple Health's own walk and run detection uses the motion chip; trust it.
  for (const b of merged) {
    const k = known.find((x) => Math.min(x.end, b.end) - Math.max(x.start, b.start) >= 0.5 * (b.end - b.start));
    if (k && b.mode !== 'drive') b.mode = k.mode;
  }
  const out = mergeSame(merged);
  for (const b of out) b.avgKmh = pace(b);
  return out;
}

/**
 * Walks and runs that happened *during* stays (a loop around the block, wandering a market),
 * which the travel between places doesn't cover. Only time at places is looked at, so nothing is
 * counted twice. Includes Apple Health's walks with no location trail. A location walk needs 6+
 * minutes and 300+ m.
 */
export function walksDuring(points: LocationPoint[], stays: { start: number; end: number }[], travel: { start: number; end: number }[], known: KnownActivity[] = []): Bout[] {
  const overlapsTravel = (s: number, e: number) => travel.some((t) => Math.min(t.end, e) - Math.max(t.start, s) > 0.5 * (e - s));
  const fromLocation = stays.flatMap((st) =>
    movementBouts(points.filter((p) => p.t >= st.start && p.t <= st.end), known).filter(
      (b) => (b.mode === 'walk' || b.mode === 'run') && b.end - b.start >= 6 * MIN && b.km >= 0.3,
    ),
  );
  const fromHealth = known
    .filter((k) => !fromLocation.some((b) => Math.min(b.end, k.end) - Math.max(b.start, k.start) > 0) && !overlapsTravel(k.start, k.end))
    .map((k): Bout => ({ mode: k.mode, start: k.start, end: k.end, km: 0, avgKmh: 0 }));
  return [...fromLocation, ...fromHealth].sort((a, b) => a.start - b.start);
}

/** The way you mostly moved between two moments, by distance, and the pieces of it. */
export function legModes(points: LocationPoint[], from: number, to: number, known: KnownActivity[] = []): { mode: Exclude<MoveMode, 'still'>; parts: { mode: Exclude<MoveMode, 'still'>; km: number; min: number }[] } | undefined {
  const bouts = movementBouts(points.filter((p) => p.t >= from && p.t <= to), known).filter((b): b is Bout & { mode: Exclude<MoveMode, 'still'> } => b.mode !== 'still' && b.km >= 0.05);
  if (!bouts.length) return undefined;
  const byMode = new Map<Exclude<MoveMode, 'still'>, number>();
  for (const b of bouts) byMode.set(b.mode, (byMode.get(b.mode) ?? 0) + b.km);
  const mode = [...byMode.entries()].sort((a, b) => b[1] - a[1])[0][0];
  return { mode, parts: bouts.map((b) => ({ mode: b.mode, km: Math.round(b.km * 10) / 10, min: Math.round((b.end - b.start) / MIN) })) };
}

// ---- Presence ----------------------------------------------------------------------------------

export interface Presence {
  /** Still, in a tight spot, long enough: inside a building, not passing by. */
  inside: boolean;
  /** Share of the stay spent moving at walking pace or faster. */
  movingShare: number;
  /** Metres from the centre that 90% of fixes fall within. */
  spreadM: number;
}

const INSIDE_MIN_DWELL = 20;
const INSIDE_MAX_SPREAD_M = 80;
const INSIDE_MAX_MOVING = 0.35;

/**
 * Whether a stay was really spent at one place. iOS reports location only when you move, so a
 * quiet stretch with few fixes is stillness, which is exactly what being inside looks like.
 */
export function stayPresence(points: LocationPoint[], stay: Stay): Presence {
  const pts = points.filter((p) => p.t >= stay.start && p.t <= stay.end);
  const dwell = (stay.end - stay.start) / MIN;
  const dists = pts.map((p) => distanceM(p, stay)).sort((a, b) => a - b);
  const spreadM = dists.length ? dists[Math.min(dists.length - 1, Math.floor(dists.length * 0.9))] : 0;
  const moving = segments(pts)
    .filter((s) => s.kmh >= 1.5)
    .reduce((t, s) => t + (s.b.t - s.a.t), 0);
  const movingShare = dwell > 0 ? Math.min(1, moving / MIN / dwell) : 0;
  return { inside: dwell >= INSIDE_MIN_DWELL && spreadM <= INSIDE_MAX_SPREAD_M && movingShare <= INSIDE_MAX_MOVING, movingShare, spreadM: Math.round(spreadM) };
}

// ---- Routines ----------------------------------------------------------------------------------

/** ~200 m grid cells a stretch of movement passed through. */
export function routeCells(points: LocationPoint[]): Set<string> {
  return new Set(points.map((p) => `${Math.round(p.lat / 0.002)},${Math.round(p.lon / 0.002)}`));
}

export interface RouteSample {
  day: string;
  mode: Exclude<MoveMode, 'still'>;
  /** Minutes after midnight the stretch began. */
  startMin: number;
  cells: Set<string>;
}

const jaccard = (a: Set<string>, b: Set<string>) => {
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  return inter / (a.size + b.size - inter || 1);
};

/** How many *other* days you took much the same route, the same way, at about the same time. */
export function routineDays(route: RouteSample, history: RouteSample[]): number {
  if (route.cells.size < 3) return 0;
  const days = new Set<string>();
  for (const h of history) {
    if (h.day === route.day || h.mode !== route.mode) continue;
    if (Math.abs(h.startMin - route.startMin) > 150) continue;
    if (jaccard(route.cells, h.cells) >= 0.5) days.add(h.day);
  }
  return days.size;
}

/** "Your usual morning walk", "Your daily commute". */
export function routineLabel(mode: Exclude<MoveMode, 'still'>, startMin: number, weekday: boolean): string {
  const h = startMin / 60;
  const part = h < 11 ? 'morning' : h < 15 ? 'midday' : h < 18 ? 'afternoon' : 'evening';
  if (mode === 'drive') return weekday && (h < 10 || (h >= 16 && h < 20)) ? 'Your daily commute' : `Your usual ${part} drive`;
  return `Your usual ${part} ${mode === 'cycle' ? 'ride' : mode}`;
}
