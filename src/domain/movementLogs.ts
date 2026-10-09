import type { DailyMemory, LocationPoint } from './memoryTypes';
import { movementBouts, type KnownActivity } from './movement';
import { pointsForDay } from './spatial';
import type { SignalEvent } from './types';

/**
 * Walks and runs found in location history, as log entries, so the log keeps itself even when
 * nobody started a workout. Apple Health's own walks win: an import that overlaps one of these
 * replaces it (see mergeImported), and an entry the user deleted is never brought back.
 */

const MIN = 60_000;
const MIN_WALK_MIN = 6;
const MIN_WALK_KM = 0.3;
/** Rounded so the id stays put as later fixes nudge the start time. */
const idFor = (mode: string, start: number) => `loc-${mode}-${Math.round(start / (10 * MIN))}`;

export function movementLogs(memories: DailyMemory[], points: LocationPoint[], logs: SignalEvent[], days = 3): SignalEvent[] {
  const out: SignalEvent[] = [];
  const known = knownFromLogs(logs);
  // Anything already logged as exercise (a Health workout, or one you logged) covers that time.
  const taken = logs.filter((e) => e.domain === 'Exercise' && !e.id.startsWith('loc-')).map((e) => [Date.parse(e.timestampStart), Date.parse(e.timestampEnd)] as const);
  const covered = (s: number, e: number) => taken.some(([a, b]) => Math.min(b, e) - Math.max(a, s) > 0.3 * (e - s));
  for (const m of memories.slice(0, days)) {
    const bouts = movementBouts(pointsForDay(points, m.date), known).filter(
      (b) => (b.mode === 'walk' || b.mode === 'run') && b.end - b.start >= MIN_WALK_MIN * MIN && b.km >= MIN_WALK_KM && !covered(b.start, b.end),
    );
    for (const b of bouts) {
      // Name it after where it led, when it ended at a place you then stayed.
      const to = m.spatialNodes.find((n) => {
        const arrive = Date.parse(n.arrivalTime);
        return arrive >= b.start && arrive - b.end <= 5 * MIN;
      });
      const routine = [...(m.walks ?? []), ...m.transit].find((w) => w.routine && Math.abs(Date.parse('start' in w ? w.start : w.startTime) - b.start) < 10 * MIN)?.routine;
      const noun = b.mode === 'run' ? 'Run' : 'Walk';
      const title = routine?.label.replace(/^Your /, '').replace(/^./, (c) => c.toUpperCase()) ?? (to && !to.isHome ? `${noun} to ${to.placeName}` : to?.isHome ? `${noun} home` : noun);
      out.push({
        id: idFor(b.mode, b.start),
        timestampStart: new Date(b.start).toISOString(),
        timestampEnd: new Date(b.end).toISOString(),
        title,
        subtitle: `${b.km.toFixed(1)} km · from your location`,
        domain: 'Exercise',
        eventType: 'PRODUCER',
        inferredStateImpact: { targetState: 'Energy', direction: 'INCREASE', magnitude: b.mode === 'run' ? 0.5 : 0.35 },
        confidenceScore: 0.5,
        source: 'AUTO',
      });
    }
  }
  return out;
}

/** Walks and runs Apple Health logged, for telling walking from slow traffic. */
export function knownFromLogs(logs: SignalEvent[]): KnownActivity[] {
  return logs
    .filter((e) => e.id.startsWith('hk-') && !e.id.startsWith('hk-sleep'))
    .map((e) => ({ e, mode: /run|jog/i.test(e.title) ? ('run' as const) : /walk|hik/i.test(e.title) ? ('walk' as const) : null }))
    .filter((x): x is { e: SignalEvent; mode: 'walk' | 'run' } => x.mode !== null)
    .map(({ e, mode }) => ({ start: Date.parse(e.timestampStart), end: Date.parse(e.timestampEnd), mode }));
}
