import type { Insight, MemoryWalk, ParkedCar, TransitLeg } from './memoryTypes';
import { dwellLabel } from './narrative';

/** A place in a memory, reduced to what the insights need. */
export interface InsightStop {
  name: string;
  dwellMin: number;
  activity?: { label: string; emoji: string; kind: string };
  photos: number;
  /** Which visit this is, counting earlier memories (1 = first time). */
  visitNumber?: number;
}

const walk = (m: number) => (m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.max(10, Math.round(m / 10) * 10)} m`);
const lower = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

/** A few short, specific observations about a day or outing; most telling first, at most four. */
export function buildInsights(stops: InsightStop[], parking: ParkedCar[], distanceKm: number, legs: TransitLeg[] = [], walks: MemoryWalk[] = []): Insight[] {
  const out: Insight[] = [];
  const routine = [...walks, ...legs].find((l) => l.routine);
  const routineKm = routine && ('distanceKm' in routine ? routine.distanceKm : routine.km);
  const longest = [...stops].sort((a, b) => b.dwellMin - a.dwellMin)[0];
  if (longest && longest.dwellMin >= 20) {
    out.push(
      longest.activity
        ? { emoji: longest.activity.emoji, text: `Most of your time went to ${lower(longest.activity.label)} (${dwellLabel(longest.dwellMin)}).` }
        : { emoji: '⏳', text: `Your longest stop was ${longest.name} (${dwellLabel(longest.dwellMin)}).` },
    );
  }

  const first = stops.find((s) => s.visitNumber === 1 && s.dwellMin >= 15);
  const regular = [...stops].filter((s) => (s.visitNumber ?? 0) >= 3).sort((a, b) => (b.visitNumber ?? 0) - (a.visitNumber ?? 0))[0];
  if (first) out.push({ emoji: '✨', text: `First time at ${first.name}.` });
  else if (regular) out.push({ emoji: '🔁', text: `Visit #${regular.visitNumber} to ${regular.name} in the last two months. A regular spot.` });

  const car = parking[0];
  if (car) {
    const where = car.name ? ` at ${car.name}` : '';
    out.push(
      car.walkM < 60
        ? { emoji: '🅿️', text: `Parked${where}, right by ${car.toName ?? 'where you were going'}.` }
        : { emoji: '🅿️', text: `Parked${where} and walked about ${walk(car.walkM)} to ${car.toName ?? 'your stop'}.` },
    );
  }

  if (routine?.routine) out.push({ emoji: '🔁', text: `${routine.routine.label}${routineKm ? `, ${routineKm} km` : ''}. You’ve done it on ${routine.routine.days} days lately.` });

  // How the day's distance was covered, e.g. "Walked 3.2 km, drove 18 km".
  const byMode = new Map<string, number>();
  for (const l of legs) for (const p of l.parts ?? [{ mode: l.mode, km: l.distanceKm }]) byMode.set(p.mode, (byMode.get(p.mode) ?? 0) + p.km);
  for (const w of walks) byMode.set(w.mode, (byMode.get(w.mode) ?? 0) + w.km);
  const verbs: Record<string, string> = { walk: 'walked', run: 'ran', cycle: 'cycled', drive: 'drove' };
  const mix = [...byMode.entries()].filter(([, km]) => km >= 0.3).sort((a, b) => b[1] - a[1]).map(([m, km]) => `${verbs[m]} ${km.toFixed(1)} km`);
  if (mix.length >= 2) out.push({ emoji: '🧭', text: `${mix.join(', ').replace(/^./, (c) => c.toUpperCase())}.` });
  const covered = mix.length >= 2;

  const meals = stops.filter((s) => s.activity?.kind === 'meal').length;
  if (meals >= 2) out.push({ emoji: '🍽️', text: `${meals} meals out.` });

  const photos = stops.reduce((n, s) => n + s.photos, 0);
  const most = [...stops].sort((a, b) => b.photos - a.photos)[0];
  if (photos >= 2 && most?.photos) out.push({ emoji: '📸', text: `${photos} photos, most of them at ${most.name}.` });
  else if (distanceKm >= 1 && !covered) out.push({ emoji: '👣', text: `${distanceKm.toFixed(1)} km covered.` });

  return out.slice(0, 4);
}
