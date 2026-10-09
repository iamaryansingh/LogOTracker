import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';

import { buildMemories, noEnrichment, type Enrichment } from '../../domain/memories';
import type { DailyMemory, LocationPoint, ParkedCar, Trip } from '../../domain/memoryTypes';
import { movementLogs } from '../../domain/movementLogs';
import { currentCar, detectParking, detectStays } from '../../domain/spatial';
import { useAppStore } from '../../state/AppStore';
import { enrichStays } from './enrich';
import { loadPoints } from './points';
import { memoriesSupported, recordNow } from './tracking';

interface MemoriesApi {
  memories: DailyMemory[];
  trips: Trip[];
  /** True while place names, photos or weather are being looked up. */
  enriching: boolean;
  refresh: () => void;
  getMemory: (date: string) => DailyMemory | undefined;
  getTrip: (id: string) => Trip | undefined;
  /** Where the car is parked now, if the last drive ended in a walk somewhere. */
  car?: ParkedCar;
  /** Raw location history (for the live memory banner). */
  points: LocationPoint[];
}

const MemoriesContext = createContext<MemoriesApi>({
  memories: [],
  trips: [],
  enriching: false,
  refresh: () => {},
  getMemory: () => undefined,
  getTrip: () => undefined,
  points: [],
});

export const useMemories = () => useContext(MemoriesContext);

/**
 * Builds the Memory Stream. The slow parts (reading points, geocoding, photos, weather) rerun only
 * when location data changes; edits like pinning or switching style rebuild instantly from cache.
 */
export function MemoriesProvider({ children }: { children: ReactNode }) {
  const { hydrated, memories: settings, memoryOverrides, logs, ratings } = useAppStore();
  const active = hydrated && settings.enabled && memoriesSupported;
  const [points, setPoints] = useState<LocationPoint[]>([]);
  const [enrichment, setEnrichment] = useState<Enrichment>(noEnrichment);
  const [enriching, setEnriching] = useState(false);
  const generation = useRef(0);

  const refresh = useCallback(async () => {
    if (!active) return;
    const run = ++generation.current;
    await recordNow().catch(() => undefined);
    const pts = await loadPoints();
    if (run !== generation.current) return;
    setPoints(pts);
    setEnriching(true);
    try {
      const stays = detectStays(pts);
      const e = await enrichStays(stays, { weather: settings.weather }, detectParking(pts, stays));
      if (run === generation.current) setEnrichment(e);
    } finally {
      if (run === generation.current) setEnriching(false);
    }
  }, [active, settings.weather]);

  useEffect(() => {
    void refresh();
    const sub = AppState.addEventListener('change', (s) => s === 'active' && refresh());
    return () => sub.remove();
  }, [refresh]);

  const built = useMemo(
    () =>
      active
        ? buildMemories({ points, logs, ratings, overrides: memoryOverrides, style: settings.style, enrichment, home: settings.home })
        : { memories: [], trips: [] },
    [active, points, logs, ratings, memoryOverrides, settings.style, settings.home, enrichment],
  );

  // The log keeps itself: walks and runs from location history become entries (last 3 days).
  const { importAutoEvents } = useAppStore();
  useEffect(() => {
    if (!active || !built.memories.length) return;
    const events = movementLogs(built.memories, points, logs);
    if (events.length) importAutoEvents(events);
  }, [active, built.memories, points, logs, importAutoEvents]);

  const car = useMemo<ParkedCar | undefined>(() => {
    if (!active) return undefined;
    const stays = detectStays(points);
    const spot = currentCar(points, detectParking(points, stays));
    // A car from days ago is probably at home or moved without us noticing.
    if (!spot || (points[points.length - 1]?.t ?? spot.t) - spot.t > 36 * 3_600_000) return undefined;
    return {
      latitude: spot.lat,
      longitude: spot.lon,
      time: new Date(spot.t).toISOString(),
      walkM: spot.walkM,
      name: enrichment.parkingName(spot),
      toName: enrichment.place(stays[spot.stayIndex])?.name,
    };
  }, [active, points, enrichment]);

  const api = useMemo<MemoriesApi>(
    () => ({
      ...built,
      car,
      points,
      enriching,
      refresh: () => void refresh(),
      getMemory: (date) => built.memories.find((m) => m.date === date),
      getTrip: (id) => built.trips.find((t) => t.id === id),
    }),
    [built, car, points, enriching, refresh],
  );

  return <MemoriesContext.Provider value={api}>{children}</MemoriesContext.Provider>;
}
