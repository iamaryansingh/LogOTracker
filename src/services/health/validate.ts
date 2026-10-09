import type { SignalEvent } from '../../domain/types';
import { toISODate } from '../../utils/time';
import type { HealthDaily, HealthSnapshot } from './shared';

/**
 * Every value read from Apple Health / Health Connect passes through here before the app uses it.
 * Health data is messy: phone and watch record the same night twice, iPhone-only users get "in bed"
 * instead of "asleep", nights cross midnight, naps look like short nights, and stray samples can be
 * empty or implausible. This turns raw samples into clean, correctly-dated entries and reports what
 * it skipped.
 */

export type SleepStage = 'asleep' | 'inBed';

export interface RawSleepSample {
  start: number; // epoch ms
  end: number;
  stage: SleepStage;
}

export interface RawWorkout {
  id: string;
  title: string;
  start: number;
  end: number;
}

export interface RawHealth {
  /** Short source tag used in entry ids: "hk" (Apple Health) or "hc" (Health Connect). */
  source: 'hk' | 'hc';
  daily: Record<string, HealthDaily>;
  sleep: RawSleepSample[];
  workouts: RawWorkout[];
}

export interface HealthReport {
  syncedAt: string;
  days: number;
  nights: number;
  naps: number;
  workouts: number;
  /** Reason → how many items were left out for it. */
  skipped: Record<string, number>;
}

const MIN = 60_000;
const HOUR = 60 * MIN;

/** Gaps shorter than this inside one night (waking briefly, phone vs watch) still count as the same sleep. */
const SAME_NIGHT_GAP = 90 * MIN;
/** A separate stretch this close to the main night (e.g. fell back asleep at 6am) is folded into it. */
const FOLD_INTO_NIGHT = 4 * HOUR;
const MIN_SLEEP = 1 * HOUR;
const MAX_SLEEP = 16 * HOUR;
/** Daytime sleep shorter than this is a nap, kept on the day it happened. */
const MAX_NAP = 3 * HOUR;
const NAP_START_HOUR = 9;
const NAP_END_HOUR = 19;
const MAX_WORKOUT = 12 * HOUR;
const LIMITS = { steps: 100_000, activeKcal: 10_000, exerciseMinutes: 24 * 60 } as const;

interface Span {
  start: number;
  end: number;
}

function union(spans: Span[], joinGap: number): Span[] {
  const sorted = [...spans].sort((a, b) => a.start - b.start);
  const out: Span[] = [];
  for (const s of sorted) {
    const last = out[out.length - 1];
    if (last && s.start - last.end <= joinGap) last.end = Math.max(last.end, s.end);
    else out.push({ ...s });
  }
  return out;
}

const overlaps = (a: Span, b: Span) => a.start < b.end && b.start < a.end;

const isNap = (s: Span) => {
  const h = new Date(s.start).getHours();
  return s.end - s.start < MAX_NAP && h >= NAP_START_HOUR && h < NAP_END_HOUR;
};

/** "Night of Wed" — the evening the night began, so it reads naturally next to the wake-up day. */
function nightLabel(s: Span): string {
  const startedBeforeMidnight = toISODate(new Date(s.start)) !== toISODate(new Date(s.end));
  const evening = startedBeforeMidnight ? new Date(s.start) : new Date(s.end - 24 * HOUR);
  return `Night of ${evening.toLocaleDateString(undefined, { weekday: 'short' })}`;
}

function sleepEntry(id: string, span: Span, nap: boolean, fromInBed: boolean): SignalEvent {
  const hours = (span.end - span.start) / HOUR;
  return {
    id,
    timestampStart: new Date(span.start).toISOString(),
    timestampEnd: new Date(span.end).toISOString(),
    title: nap ? 'Nap' : 'Sleep',
    subtitle: nap ? undefined : `${nightLabel(span)}${fromInBed ? ' · time in bed' : ''}`,
    domain: 'Sleep',
    eventType: 'SIGNAL',
    // A starting guess only; the user can say how it actually left them.
    inferredStateImpact: nap
      ? { targetState: 'Calm', direction: 'INCREASE', magnitude: 0.3 }
      : hours >= 7
        ? { targetState: 'Energy', direction: 'INCREASE', magnitude: 0.5 }
        : { targetState: 'Energy', direction: 'DECREASE', magnitude: 0.5 },
    confidenceScore: fromInBed ? 0.45 : 0.6,
    source: 'AUTO',
  };
}

export function validateHealth(raw: RawHealth, now = new Date()): { snapshot: HealthSnapshot; report: HealthReport } {
  const skipped: Record<string, number> = {};
  const skip = (reason: string, n = 1) => {
    skipped[reason] = (skipped[reason] ?? 0) + n;
  };
  const nowMs = now.getTime();
  const today = toISODate(now);

  // ---- Daily totals --------------------------------------------------------------------------
  const daily: Record<string, HealthDaily> = {};
  for (const [date, d] of Object.entries(raw.daily)) {
    if (date > today) {
      skip('future day');
      continue;
    }
    const clean: HealthDaily = {};
    for (const key of Object.keys(LIMITS) as (keyof typeof LIMITS)[]) {
      const v = d[key];
      if (v === undefined || v === null || Number.isNaN(v)) continue;
      if (v < 0 || v > LIMITS[key]) skip(`implausible ${key}`);
      else clean[key] = key === 'steps' ? Math.round(v) : Math.round(v * 10) / 10;
    }
    daily[date] = clean;
  }

  // ---- Sleep -----------------------------------------------------------------------------------
  const valid = raw.sleep.filter((s) => {
    if (!(s.end > s.start)) return skip('empty sleep sample'), false;
    if (s.start > nowMs) return skip('sleep in the future'), false;
    if (s.end - s.start > 24 * HOUR) return skip('sleep sample over 24 h'), false;
    return true;
  });
  // Cap anything still in progress at now, so tonight's partial sleep doesn't claim the future.
  const capped = valid.map((s) => ({ ...s, end: Math.min(s.end, nowMs) }));

  const asleep = union(capped.filter((s) => s.stage === 'asleep'), SAME_NIGHT_GAP);
  // "In bed" only stands in where nothing recorded actual sleep (iPhone without a watch).
  const inBedOnly = union(capped.filter((s) => s.stage === 'inBed'), SAME_NIGHT_GAP).filter((b) => !asleep.some((a) => overlaps(a, b)));
  const sessions = [...asleep.map((s) => ({ ...s, inBed: false })), ...inBedOnly.map((s) => ({ ...s, inBed: true }))].sort((a, b) => a.start - b.start);

  const events: SignalEvent[] = [];
  const nightsByWakeDay = new Map<string, (Span & { inBed: boolean })[]>();
  let naps = 0;
  for (const s of sessions) {
    const len = s.end - s.start;
    if (len < MIN_SLEEP && !isNap(s)) {
      skip('sleep under 1 h');
      continue;
    }
    if (len > MAX_SLEEP) {
      skip('sleep over 16 h');
      continue;
    }
    if (isNap(s)) {
      if (len < 10 * MIN) {
        skip('nap under 10 min');
        continue;
      }
      events.push(sleepEntry(`${raw.source}-nap-${s.start}`, s, true, s.inBed));
      naps++;
      continue;
    }
    // A night belongs to the day you woke up.
    const wakeDay = toISODate(new Date(s.end));
    nightsByWakeDay.set(wakeDay, [...(nightsByWakeDay.get(wakeDay) ?? []), s]);
  }

  let nights = 0;
  for (const [wakeDay, spans] of nightsByWakeDay) {
    const main = spans.reduce((a, b) => (b.end - b.start > a.end - a.start ? b : a));
    const night = { ...main };
    for (const s of spans) {
      if (s === main) continue;
      const gap = s.start >= night.end ? s.start - night.end : night.start - s.end;
      if (gap <= FOLD_INTO_NIGHT) {
        night.start = Math.min(night.start, s.start);
        night.end = Math.max(night.end, s.end);
      } else {
        skip('second night on the same day');
      }
    }
    if (night.end - night.start > MAX_SLEEP) {
      skip('sleep over 16 h');
      continue;
    }
    // One stable id per wake-up day, so late-arriving samples update the night instead of duplicating it.
    events.push(sleepEntry(`${raw.source}-sleep-${wakeDay}`, night, false, night.inBed));
    nights++;
  }

  // ---- Workouts --------------------------------------------------------------------------------
  const seen = new Set<string>();
  let workouts = 0;
  for (const w of raw.workouts) {
    const len = w.end - w.start;
    if (!(len > 0)) {
      skip('empty workout');
      continue;
    }
    if (w.end > nowMs + MIN) {
      skip('workout in the future');
      continue;
    }
    if (len < MIN || len > MAX_WORKOUT) {
      skip('implausible workout length');
      continue;
    }
    // The same session recorded by two apps lands on the same minutes.
    const key = `${Math.round(w.start / MIN)}-${Math.round(w.end / MIN)}`;
    if (seen.has(key)) {
      skip('duplicate workout');
      continue;
    }
    seen.add(key);
    events.push({
      id: w.id,
      timestampStart: new Date(w.start).toISOString(),
      timestampEnd: new Date(w.end).toISOString(),
      title: w.title,
      domain: 'Exercise',
      eventType: 'PRODUCER',
      inferredStateImpact: { targetState: 'Energy', direction: 'INCREASE', magnitude: 0.5 },
      confidenceScore: 0.6,
      source: 'AUTO',
    });
    workouts++;
  }

  return {
    snapshot: { daily, events },
    report: {
      syncedAt: now.toISOString(),
      days: Object.keys(daily).length,
      nights,
      naps,
      workouts,
      skipped,
    },
  };
}
