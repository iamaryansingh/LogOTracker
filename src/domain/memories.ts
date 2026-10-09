import { addDays, fromISODate, toISODate } from '../utils/time';
import type { CustomMemory, DailyMemory, LocationPoint, MemoryOverride, MemoryPlace, MemoryWalk, ParkedCar, MemoryStyle, SpatialNode, Trip, WeatherCondition } from './memoryTypes';
import { inferActivity } from './activity';
import { knownFromLogs } from './movementLogs';
import { routeCells, routineDays, routineLabel, stayPresence, walksDuring, type KnownActivity, type RouteSample } from './movement';
import { buildInsights } from './insights';
import { classifyVibe, highlightNode, memoryNarrative, memoryTitle, primaryVibe } from './narrative';
import { AWAY_FROM_HOME_KM, detectParking, detectStays, detectTrips, distanceM, findHome, pathDistanceKm, pointsForDay, simplifyPath, staysForDay, transitLegs, type Stay } from './spatial';
import type { DayRatings, SignalEvent } from './types';

/** Lookups resolved ahead of time by the enrichment service (geocoding, weather, Photos). */
export interface Enrichment {
  place: (s: Stay) => { name?: string; locality?: string; city?: string; category?: string } | undefined;
  parkingName: (p: { lat: number; lon: number }) => string | undefined;
  weather: (s: Stay) => { tempC: number; condition: WeatherCondition } | undefined;
  photos: (s: Stay) => string[];
}

export const noEnrichment: Enrichment = { place: () => undefined, parkingName: () => undefined, weather: () => undefined, photos: () => [] };

const HOME_RADIUS_M = 200;
const MIN = 60_000;

export const nodeId = (date: string, s: Stay) => `${date}-${s.lat.toFixed(4)}-${s.lon.toFixed(4)}-${Math.round(s.start / MIN)}`;

/** Apple Health's walks and runs that started on this day. */
function knownActivities(logs: SignalEvent[], date: string): KnownActivity[] {
  const dayStart = fromISODate(date).getTime();
  const dayEnd = addDays(fromISODate(date), 1).getTime();
  return knownFromLogs(logs).filter((k) => k.start >= dayStart && k.start < dayEnd);
}

export interface BuildInput {
  points: LocationPoint[];
  logs: SignalEvent[];
  ratings: Record<string, DayRatings>;
  overrides: Record<string, MemoryOverride>;
  style: MemoryStyle;
  enrichment?: Enrichment;
  home?: { latitude: number; longitude: number };
}

function energyAt(date: string, at: number, logs: SignalEvent[], ratings: Record<string, DayRatings>): number {
  // A check-in close in time says more than the day's overall rating.
  const near = logs
    .filter((e) => e.timestampStart === e.timestampEnd && Math.abs(Date.parse(e.timestampStart) - at) < 3 * 60 * MIN)
    .sort((a, b) => Math.abs(Date.parse(a.timestampStart) - at) - Math.abs(Date.parse(b.timestampStart) - at))[0];
  if (near) {
    const { targetState: s, direction: d } = near.inferredStateImpact;
    if (s === 'Overload' || s === 'Stress') return 2;
    if (d === 'INCREASE') return 4;
  }
  return ratings[date]?.energy ?? 3;
}

/** One day's memory, or null when the day has no location data. */
export function buildDayMemory(date: string, input: BuildInput, stays: Stay[], home: { lat: number; lon: number } | null): DailyMemory | null {
  const enrich = input.enrichment ?? noEnrichment;
  const dayPoints = pointsForDay(input.points, date);
  const dayStays = staysForDay(stays, date);
  if (dayPoints.length === 0 && dayStays.length === 0) return null;

  const ids = dayStays.map((s) => nodeId(date, s));
  const nodes: SpatialNode[] = dayStays.map((s, i) => {
    const isHome = !!home && distanceM(home, s) <= HOME_RADIUS_M;
    const place = enrich.place(s);
    const photos = enrich.photos(s);
    const weather = enrich.weather(s);
    const dwell = Math.round((s.end - s.start) / MIN);
    const overlapping = input.logs.filter((e) => Date.parse(e.timestampStart) < s.end && Date.parse(e.timestampEnd) > s.start);
    const dayEndMs = new Date(`${date}T23:59:00`).getTime();
    const overnight = !isHome && s.end >= dayEndMs && new Date(s.start).getHours() >= 15;
    const away = !!home && distanceM(home, s) / 1000 > AWAY_FROM_HOME_KM;
    const placeName = isHome ? 'Home' : (place?.name ?? place?.locality ?? 'Somewhere new');
    const presence = stayPresence(input.points, s);
    const activity = isHome ? undefined : inferActivity(place?.category, placeName, new Date(s.start), dwell, presence);
    return {
      id: ids[i],
      latitude: s.lat,
      longitude: s.lon,
      placeName,
      category: place?.category,
      activity,
      presence: { inside: presence.inside, movingShare: Math.round(presence.movingShare * 100) / 100 },
      locality: place?.locality,
      city: place?.city ?? place?.locality,
      arrivalTime: new Date(s.start).toISOString(),
      departureTime: new Date(s.end).toISOString(),
      dwellTimeMinutes: dwell,
      photoUris: photos.length ? photos : undefined,
      weather,
      energyLevelAtTime: energyAt(date, s.start, input.logs, input.ratings),
      isHome,
      vibe: classifyVibe({ isHome, dwellMin: dwell, arrival: new Date(s.start), overlapping, photos: photos.length, weather: weather?.condition, overnight, away }),
    };
  });

  // The user's fixes to this day's timeline win over what was inferred.
  const fixes = input.overrides[date]?.steps ?? {};
  for (const n of nodes) {
    const fix = fixes[`node:${n.id}`];
    if (!fix) continue;
    if (fix.place) {
      n.placeName = fix.place.name;
      n.locality = fix.place.locality ?? n.locality;
    }
    if (fix.title) n.activity = { label: fix.title, emoji: fix.emoji ?? n.activity?.emoji ?? '📍', kind: n.activity?.kind ?? 'visit' };
  }
  // Steps the user removed don't feed the title, story or insights.
  const storyNodes = nodes.filter((n) => !fixes[`node:${n.id}`]?.hidden);

  const known = knownActivities(input.logs, date);
  const transit = transitLegs(dayPoints, dayStays, ids, known);
  const walks: MemoryWalk[] = walksDuring(
    dayPoints,
    dayStays,
    transit.map((l) => ({ start: Date.parse(l.startTime), end: Date.parse(l.endTime) })),
    known,
  ).map((b) => ({
    start: new Date(b.start).toISOString(),
    end: new Date(b.end).toISOString(),
    mode: b.mode === 'run' ? 'run' : 'walk',
    km: Math.round(b.km * 10) / 10,
    source: b.km > 0 ? 'location' : 'health',
  }));
  const distanceKm = Math.round(pathDistanceKm(dayPoints) * 10) / 10;
  const photos = nodes.reduce((n, x) => n + (x.photoUris?.length ?? 0), 0);
  const ratingsEnergy = input.ratings[date]?.energy;
  const override = input.overrides[date] ?? {};
  const style = override.style ?? input.style;
  const story = { date, nodes: storyNodes, transit, distanceKm, vibe: primaryVibe(storyNodes, transit), photos, energy: ratingsEnergy };
  const hl = highlightNode(story);
  const parking: ParkedCar[] = detectParking(input.points, dayStays)
    .filter((p) => !nodes[p.stayIndex]?.isHome)
    .map((p) => ({
      latitude: p.lat,
      longitude: p.lon,
      time: new Date(p.t).toISOString(),
      walkM: p.walkM,
      toNodeId: nodes[p.stayIndex]?.id,
      toName: nodes[p.stayIndex]?.placeName,
      name: enrich.parkingName(p),
    }));

  return {
    id: `memory-${date}`,
    date,
    title: override.title ?? memoryTitle(story, style),
    summaryNarrative: memoryNarrative(story, style),
    isPinned: override.isPinned ?? false,
    styleApplied: style,
    primaryVibe: story.vibe,
    spatialNodes: nodes,
    transit,
    path: simplifyPath(dayPoints),
    distanceKm,
    coverPhotoUri: hl?.photoUris?.[0] ?? nodes.find((n) => n.photoUris?.length)?.photoUris?.[0],
    userNote: override.userNote,
    photoNotes: override.photoNotes,
    walks,
    parking,
  };
}

const tripName = (city: string | undefined, start: string, end: string) => {
  const s = fromISODate(start);
  const e = fromISODate(end);
  const days = Math.round((e.getTime() - s.getTime()) / 86_400_000) + 1;
  const weekend = days <= 3 && [5, 6, 0].includes(s.getDay()) && [6, 0, 1].includes(e.getDay());
  const place = city ?? 'Away';
  return days === 1 ? `${place} Day Trip` : weekend ? `${place} Weekend Getaway` : `${days} Days in ${place}`;
};

/** All daily memories (newest first) and the trips they group into. */
export function buildMemories(input: BuildInput, today = new Date()): { memories: DailyMemory[]; trips: Trip[] } {
  const stays = detectStays(input.points);
  // The home the user chose wins over the guess from where nights are spent.
  const home = input.home ? { lat: input.home.latitude, lon: input.home.longitude } : findHome(input.points);
  if (input.points.length === 0) return { memories: [], trips: [] };

  const first = toISODate(new Date(Math.min(...input.points.map((p) => p.t))));
  const memories: DailyMemory[] = [];
  for (let d = fromISODate(first); toISODate(d) <= toISODate(today); d = addDays(d, 1)) {
    const m = buildDayMemory(toISODate(d), input, stays, home);
    if (m) memories.push(m);
  }

  // Routines: a route taken on 3+ days, the same way, at about the same time, is yours, not a trip.
  const samples: (RouteSample & { leg: { routine?: { label: string; days: number } } })[] = [];
  for (const m of memories) {
    for (const leg of m.transit) {
      const from = Date.parse(leg.startTime);
      const pts = input.points.filter((p) => p.t >= from && p.t <= Date.parse(leg.endTime));
      const start = new Date(from);
      samples.push({ leg, day: m.date, mode: leg.mode, startMin: start.getHours() * 60 + start.getMinutes(), cells: routeCells(pts) });
    }
  }
  // Walks during the day (a loop from home) are the most common routine of all.
  for (const m of memories) {
    for (const w of m.walks ?? []) {
      if (w.source !== 'location') continue;
      const from = Date.parse(w.start);
      const pts = input.points.filter((p) => p.t >= from && p.t <= Date.parse(w.end));
      const start = new Date(from);
      samples.push({ leg: w, day: m.date, mode: w.mode, startMin: start.getHours() * 60 + start.getMinutes(), cells: routeCells(pts) });
    }
  }
  for (const s of samples) {
    const others = routineDays(s, samples);
    if (others >= 2) {
      const d = fromISODate(s.day).getDay();
      s.leg.routine = { label: routineLabel(s.mode, s.startMin, d >= 1 && d <= 5), days: others + 1 };
    }
  }

  // Insights need history: which visit to each place this was.
  const seen = new Map<string, number>();
  for (const m of memories) {
    const stops = m.spatialNodes
      .filter((n) => !n.isHome)
      .map((n) => {
        const key = `${n.placeName}|${n.latitude.toFixed(3)},${n.longitude.toFixed(3)}`;
        const visitNumber = (seen.get(key) ?? 0) + 1;
        seen.set(key, visitNumber);
        return { name: n.placeName, dwellMin: n.dwellTimeMinutes, activity: n.activity, photos: n.photoUris?.length ?? 0, visitNumber: n.placeName === 'Somewhere new' ? undefined : visitNumber };
      });
    m.insights = buildInsights(stops, m.parking ?? [], m.distanceKm, m.transit, m.walks);
  }

  const trips: Trip[] = detectTrips(input.points, home).map((t) => {
    const days = memories.filter((m) => t.days.includes(m.date));
    // Name the trip after the town where most of the time away was spent.
    const time = new Map<string, number>();
    for (const n of days.flatMap((m) => m.spatialNodes)) if (!n.isHome && n.city) time.set(n.city, (time.get(n.city) ?? 0) + n.dwellTimeMinutes);
    const city = [...time.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
    const id = `trip-${t.start}`;
    for (const m of days) m.tripId = id;
    return {
      id,
      title: input.overrides[id]?.title ?? tripName(city, t.start, t.end),
      startDate: t.start,
      endDate: t.end,
      coverPhotoUri: days.find((m) => m.coverPhotoUri)?.coverPhotoUri,
      dailyMemories: days,
    };
  });

  return { memories: memories.reverse(), trips: trips.reverse() };
}

export interface PastPlace extends MemoryPlace {
  visits: number;
  /** YYYY-MM-DD of the latest visit. */
  lastVisited: string;
}

/** Everywhere you've been (from live memories and ones you made), most recent first. Home is left out. */
export function pastPlaces(memories: DailyMemory[], custom: CustomMemory[]): PastPlace[] {
  const byKey = new Map<string, PastPlace>();
  const add = (p: MemoryPlace, date: string) => {
    // Same name within ~100 m counts as one place.
    const key = `${p.name}|${p.latitude.toFixed(3)},${p.longitude.toFixed(3)}`;
    const seen = byKey.get(key);
    if (seen) {
      seen.visits++;
      if (date > seen.lastVisited) seen.lastVisited = date;
    } else byKey.set(key, { ...p, visits: 1, lastVisited: date });
  };
  for (const m of memories)
    for (const n of m.spatialNodes)
      if (!n.isHome && n.placeName !== 'Somewhere new')
        add({ name: n.placeName, latitude: n.latitude, longitude: n.longitude, locality: n.locality, city: n.city }, m.date);
  for (const c of custom) if (c.place) add(c.place, c.date);
  return [...byKey.values()].sort((a, b) => b.lastVisited.localeCompare(a.lastVisited) || b.visits - a.visits);
}
