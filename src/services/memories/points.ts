import AsyncStorage from '@react-native-async-storage/async-storage';

import type { LocationPoint } from '../../domain/memoryTypes';

/**
 * Raw location history, stored compactly on this device only. Old points age out after
 * KEEP_DAYS; the generated memories keep their own summaries, so nothing visible is lost.
 */
const KEY = 'selfmirror/points/v1';
const KEEP_DAYS = 60;
const MAX_POINTS = 40_000;

type Packed = [number, number, number, (number | null)?, number?]; // t, lat, lon, acc, speed (m/s)

// Serialise writes so the background task and the app never interleave read-modify-write.
let queue: Promise<unknown> = Promise.resolve();
const serial = <T>(fn: () => Promise<T>): Promise<T> => {
  const next = queue.then(fn, fn);
  queue = next.catch(() => undefined);
  return next;
};

async function read(): Promise<Packed[]> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Packed[]) : [];
  } catch {
    return [];
  }
}

export async function loadPoints(): Promise<LocationPoint[]> {
  return (await read()).map(([t, lat, lon, acc, s]) => ({ t, lat, lon, acc: acc ?? undefined, s }));
}

export function appendPoints(points: LocationPoint[]): Promise<void> {
  return serial(async () => {
    if (!points.length) return;
    const cutoff = Date.now() - KEEP_DAYS * 86_400_000;
    const existing = (await read()).filter((p) => p[0] >= cutoff);
    const last = existing[existing.length - 1]?.[0] ?? 0;
    const fresh = points
      .filter((p) => p.t > last)
      .map((p): Packed => {
        const acc = p.acc === undefined ? null : Math.round(p.acc);
        return p.s !== undefined && p.s >= 0 ? [Math.round(p.t), +p.lat.toFixed(6), +p.lon.toFixed(6), acc, +p.s.toFixed(1)] : [Math.round(p.t), +p.lat.toFixed(6), +p.lon.toFixed(6), acc];
      });
    const all = [...existing, ...fresh];
    await AsyncStorage.setItem(KEY, JSON.stringify(all.length > MAX_POINTS ? all.slice(-MAX_POINTS) : all));
  });
}

export const clearPoints = () => serial(() => AsyncStorage.removeItem(KEY));
