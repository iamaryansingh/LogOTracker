import * as MediaLibrary from 'expo-media-library/legacy';

import { inferActivity, type Activity } from '../../domain/activity';
import { buildInsights } from '../../domain/insights';
import { pastPlaces } from '../../domain/memories';
import type { CustomMemory, DailyMemory, LocationPoint, MemoryChapter, MemoryPlace, MemoryStyle, ParkedCar, VibeCategory } from '../../domain/memoryTypes';
import { dwellLabel, seeded, timeOfDay, titleCase, VIBE_EMOJI } from '../../domain/narrative';
import { stayPresence, walksDuring } from '../../domain/movement';
import { detectParking, detectStays, distanceM, pathDistanceKm, simplifyPath, STAY_RADIUS_M, transitLegs, type Stay } from '../../domain/spatial';
import { toISODate } from '../../utils/time';
import { lookupPlace } from './enrich';
import { nearestParking, nearestPlace } from './places';
import { loadPoints } from './points';
import { recordNow } from './tracking';

/**
 * Turns a live memory (Start → End) into a post: where you parked, each stop and what you did
 * there, the walks between, and the photos you took along the way, in order.
 */

const MIN = 60_000;
const MODE_EMOJI = { walk: '🚶', run: '🏃', cycle: '🚴', drive: '🚗' } as const;
const MODE_VERB = { walk: 'Walked', run: 'Ran', cycle: 'Rode', drive: 'Drove' } as const;
/** Shorter than daily memories: on an outing, a 10-minute stop is part of the story. */
const LIVE_MIN_STAY_MS = 10 * MIN;

interface Stop {
  stay: Stay;
  place: MemoryPlace;
  category?: string;
  activity?: Activity;
  photos: string[];
}

async function libraryPhotos(start: number, end: number): Promise<{ uri: string; t: number }[]> {
  const granted = (await MediaLibrary.getPermissionsAsync(false).catch(() => null))?.granted ?? false;
  if (!granted) return [];
  try {
    const page = await MediaLibrary.getAssetsAsync({
      first: 60,
      mediaType: 'photo',
      createdAfter: start,
      createdBefore: end,
      sortBy: [[MediaLibrary.SortBy.creationTime, true]],
    });
    return page.assets.filter((a) => !a.mediaSubtypes?.includes('screenshot')).map((a) => ({ uri: a.uri, t: a.creationTime }));
  } catch {
    return [];
  }
}

async function describeStop(stay: Stay, points: LocationPoint[]): Promise<Omit<Stop, 'photos'>> {
  const [poi, geo] = await Promise.all([nearestPlace(stay.lat, stay.lon, 80), lookupPlace(stay)]);
  const name = poi?.name ?? geo?.name ?? geo?.locality ?? 'A stop';
  const place: MemoryPlace = { name, latitude: stay.lat, longitude: stay.lon, locality: geo?.locality, city: geo?.city };
  const category = poi?.category ?? geo?.category;
  return { stay, place, category, activity: inferActivity(category, name, new Date(stay.start), (stay.end - stay.start) / MIN, stayPresence(points, stay)) };
}

function vibeOf(a?: Activity): VibeCategory {
  switch (a?.kind) {
    case 'meal':
    case 'drinks':
    case 'show':
      return 'Social';
    case 'coffee':
    case 'stay':
      return 'Cozy';
    case 'culture':
      return 'Reflective';
    case 'workout':
    case 'study':
      return 'Focus';
    case 'travel':
      return 'Transit';
    default:
      return 'Exploratory';
  }
}

const walkText = (m: number) => (m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.max(10, Math.round(m / 10) * 10)} m`);
const lower = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

function story(stops: Stop[], parking: ParkedCar[], photoCount: number, style: MemoryStyle, seed: string, start: Date): string {
  const pick = seeded(seed);
  const bits = stops.map((s) => {
    const dwell = dwellLabel((s.stay.end - s.stay.start) / MIN);
    return { text: s.activity ? lower(s.activity.label) : s.place.name, dwell, emoji: s.activity?.emoji ?? '📍', car: parking.find((p) => p.toName === s.place.name) };
  });
  const pics = photoCount ? `${photoCount} photo${photoCount > 1 ? 's' : ''}` : '';

  if (style === 'RAW_BULLETS') {
    const lines = stops.flatMap((s, i) => {
      const car = bits[i].car;
      return [
        ...(car ? [`• 🅿️ Parked${car.name ? ` at ${car.name}` : ''}, walked ${walkText(car.walkM)}`] : []),
        `• ${new Date(s.stay.start).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })} ${bits[i].emoji} ${s.activity?.label ?? s.place.name} (${bits[i].dwell})`,
      ];
    });
    return [...lines, ...(pics ? [`• ${pics}`] : [])].join('\n') || '• Out and about';
  }
  if (!stops.length) return `${timeOfDay(start)} out and about.${pics ? ` ${pics} along the way.` : ''}`;

  if (style === 'GEN_Z_CASUAL') {
    const route = bits.map((b) => `${b.text.toLowerCase()} ${b.emoji}`).join(' → ');
    return `${pick(['the outing, unfiltered:', 'today’s side quest:', 'pov: you actually went out:'])} ${route}.${pics ? ` ${pics} for the archive.` : ''} ${VIBE_EMOJI[vibeOf(stops[0].activity)]}`;
  }
  if (style === 'POETIC_MINIMAL') {
    return [...bits.map((b) => `${b.emoji} ${b.text.charAt(0).toUpperCase()}${b.text.slice(1)}.`), pick(['Kept, so it stays.', 'A few hours, held still.'])].join('\n');
  }

  const sentences = bits.map((b, i) => {
    const lead = i === 0 ? '' : pick(['Then ', 'After that, ', 'Later, ']);
    const park = b.car ? `you parked${b.car.name ? ` at ${b.car.name}` : ''} and walked ${walkText(b.car.walkM)} for ` : '';
    const body = park ? `${park}${b.text}` : i === 0 ? `It started with ${b.text}` : b.text;
    return `${lead}${lead ? body : body.charAt(0).toUpperCase() + body.slice(1)} (${b.dwell}).`;
  });
  return `${sentences.join(' ')}${pics ? ` ${pics} along the way.` : ''}`;
}

/** Builds the post for a live memory. Returns null if there's nothing to remember (no movement, no photos). */
export async function finishLiveMemory(
  session: { id: string; startedAt: string; photos: string[] },
  style: MemoryStyle,
  history: { memories: DailyMemory[]; custom: CustomMemory[] },
): Promise<CustomMemory | null> {
  await recordNow().catch(() => undefined);
  const start = Date.parse(session.startedAt);
  const end = Date.now();
  const points: LocationPoint[] = (await loadPoints()).filter((p) => p.t >= start && p.t <= end);

  const stays = detectStays(points, STAY_RADIUS_M, LIVE_MIN_STAY_MS);
  // Ending the memory while still at the last place: that stay lasts until now.
  const lastStay = stays[stays.length - 1];
  const lastPoint = points[points.length - 1];
  if (lastStay && lastPoint && distanceM(lastStay, lastPoint) <= STAY_RADIUS_M) lastStay.end = end;

  const described = await Promise.all(stays.map((s) => describeStop(s, points)));
  const library = await libraryPhotos(start, end);
  const stops: Stop[] = described.map((d) => ({
    ...d,
    photos: library.filter((p) => p.t >= d.stay.start - 5 * MIN && p.t <= d.stay.end + 5 * MIN).map((p) => p.uri),
  }));

  const parking: ParkedCar[] = await Promise.all(
    detectParking(points, stays).map(async (p) => ({
      latitude: p.lat,
      longitude: p.lon,
      time: new Date(p.t).toISOString(),
      walkM: p.walkM,
      toName: stops[p.stayIndex]?.place.name,
      name: (await nearestParking(p.lat, p.lon))?.name,
    })),
  );

  const allPhotos = [...library.map((p) => p.uri), ...session.photos];
  if (!stops.length && !allPhotos.length && pathDistanceKm(points) < 0.2) return null;

  // The timeline: parked → walk → stop, in time order.
  const ids = stops.map((s, i) => `${session.id}-stop-${i}`);
  const legs = transitLegs(points, stays, ids);
  const chapters: MemoryChapter[] = [];
  stops.forEach((s, i) => {
    const leg = legs.find((l) => l.toNodeId === ids[i]);
    const car = parking.find((p) => p.toName === s.place.name && Math.abs(Date.parse(p.time) - s.stay.start) < 45 * MIN);
    if (leg && !(car && leg.mode === 'drive')) {
      chapters.push({
        id: `${ids[i]}-move`,
        kind: 'move',
        start: leg.startTime,
        end: leg.endTime,
        emoji: MODE_EMOJI[leg.mode],
        mode: leg.mode,
        km: leg.distanceKm,
        title: leg.parts ? leg.parts.map((p) => `${MODE_EMOJI[p.mode]} ${p.km} km`).join(' → ') : `${MODE_VERB[leg.mode]} ${leg.distanceKm} km`,
      });
    }
    if (car) {
      chapters.push({
        id: `${ids[i]}-parked`,
        kind: 'parked',
        start: car.time,
        emoji: '🅿️',
        title: car.name ? `Parked at ${car.name}` : 'Parked the car',
        detail: car.walkM < 60 ? `Right by ${s.place.name}` : `Walked ${walkText(car.walkM)} to ${s.place.name}`,
        place: { name: car.name ?? 'Where you parked', latitude: car.latitude, longitude: car.longitude },
        category: 'Parking',
      });
    }
    chapters.push({
      id: ids[i],
      kind: 'stop',
      start: new Date(s.stay.start).toISOString(),
      end: new Date(s.stay.end).toISOString(),
      emoji: s.activity?.emoji ?? '📍',
      title: s.activity ? titleCase(s.activity.label) : s.place.name,
      detail: [s.place.locality ?? s.place.city, s.category?.replace(/([a-z])([A-Z])/g, '$1 $2')].filter(Boolean).join(' · ') || undefined,
      place: s.place,
      category: s.category,
      dwellMin: Math.round((s.stay.end - s.stay.start) / MIN),
      photos: s.photos,
    });
  });
  // Walks while at a stop (out and back, wandering around) get their own line after it.
  const walks = walksDuring(points, stays, legs.map((l) => ({ start: Date.parse(l.startTime), end: Date.parse(l.endTime) })));
  for (const w of walks) {
    const after = chapters.findIndex((c) => c.kind === 'stop' && Date.parse(c.start) <= w.start && (!c.end || Date.parse(c.end) >= w.start));
    const chapter: MemoryChapter = {
      id: `${session.id}-walk-${w.start}`,
      kind: 'move',
      start: new Date(w.start).toISOString(),
      end: new Date(w.end).toISOString(),
      emoji: w.mode === 'run' ? '🏃' : '🚶',
      mode: w.mode === 'run' ? 'run' : 'walk',
      km: Math.round(w.km * 10) / 10,
      title: `${w.mode === 'run' ? 'Ran' : 'Walked'} ${Math.round(w.km * 10) / 10} km around`,
    };
    if (after >= 0) chapters.splice(after + 1, 0, chapter);
  }

  // Photos taken between stops still belong to the outing.
  const placed = new Set(stops.flatMap((s) => s.photos));
  const loose = [...library.filter((p) => !placed.has(p.uri)).map((p) => p.uri), ...session.photos];
  if (loose.length) chapters.push({ id: `${session.id}-moments`, kind: 'stop', start: new Date(end).toISOString(), emoji: '📸', title: 'Moments along the way', photos: loose });

  const main = [...stops].sort((a, b) => b.stay.end - b.stay.start - (a.stay.end - a.stay.start))[0];
  const distanceKm = Math.round(pathDistanceKm(points) * 10) / 10;
  const visits = pastPlaces(history.memories, history.custom);
  const insights = buildInsights(
    stops.map((s) => {
      const prior = visits.find((v) => v.name === s.place.name && distanceM({ lat: v.latitude, lon: v.longitude }, s.stay) < 150)?.visits ?? 0;
      return { name: s.place.name, dwellMin: (s.stay.end - s.stay.start) / MIN, activity: s.activity, photos: s.photos.length, visitNumber: prior + 1 };
    }),
    parking,
    distanceKm,
  );

  const startDate = new Date(start);
  const area = main?.place.locality ?? main?.place.city;
  const baseTitle = main?.activity ? titleCase(main.activity.label) : main ? `${timeOfDay(startDate)} at ${main.place.name}` : `${timeOfDay(startDate)} Out${area ? ` in ${area}` : ''}`;
  const title = stops.length > 1 ? `${baseTitle} & ${stops.length - 1} More` : baseTitle;
  const vibe = vibeOf(main?.activity);
  const at = new Date().toISOString();

  return {
    id: session.id,
    kind: 'live',
    date: toISODate(startDate),
    takenAt: session.startedAt,
    startedAt: session.startedAt,
    endedAt: new Date(end).toISOString(),
    title: style === 'GEN_Z_CASUAL' ? `${title.toLowerCase()} ${main?.activity?.emoji ?? VIBE_EMOJI[vibe]}` : title,
    caption: story(stops, parking, allPhotos.length, style, session.id, startDate),
    photos: allPhotos,
    place: main?.place,
    vibe,
    chapters,
    insights,
    path: simplifyPath(points),
    distanceKm,
    isPinned: false,
    createdAt: at,
    updatedAt: at,
  };
}

/** Stops so far in a running live memory, for the banner. */
export function liveProgress(points: LocationPoint[], startedAt: string): { stops: number; km: number; minutes: number } {
  const start = Date.parse(startedAt);
  const pts = points.filter((p) => p.t >= start);
  return {
    stops: detectStays(pts, STAY_RADIUS_M, LIVE_MIN_STAY_MS).length,
    km: Math.round(pathDistanceKm(pts) * 10) / 10,
    minutes: Math.round((Date.now() - start) / MIN),
  };
}
