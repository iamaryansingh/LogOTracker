/**
 * Whoop-style scores from raw health samples (Whoop writes HRV, resting heart rate, respiratory
 * rate, SpO₂ and sleep stages to Apple Health, but not its own Recovery or Strain). These are
 * estimates in the same spirit, clearly labelled as such in the UI:
 *
 * - Recovery 0–100%: last night's HRV and resting HR against your 30-day baseline, plus sleep.
 * - Strain 0–21: cardiovascular load from today's heart rate (Edwards TRIMP), on Whoop's
 *   logarithmic-feeling 0–21 scale.
 * - Sleep performance: hours asleep against an assumed 8 h need.
 */

export const SLEEP_NEED_MIN = 8 * 60;

const clamp = (x: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, x));
const mean = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : undefined);

export interface DailyValue {
  date: string; // YYYY-MM-DD
  value: number;
}

export interface Trend {
  latest: number;
  /** Mean of the days before the latest one; undefined until there are 3 of them. */
  baseline?: number;
  /** Oldest first, for the sparkline. */
  days: DailyValue[];
}

/** Daily means of samples, and the latest day against the ones before it. */
export function trendOf(samples: { t: number; value: number }[], dateOf: (t: number) => string): Trend | undefined {
  if (!samples.length) return undefined;
  const byDay = new Map<string, number[]>();
  for (const s of samples) {
    const d = dateOf(s.t);
    byDay.set(d, [...(byDay.get(d) ?? []), s.value]);
  }
  const days = [...byDay.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([date, v]) => ({ date, value: mean(v)! }));
  const latest = days[days.length - 1].value;
  const before = days.slice(0, -1).map((d) => d.value);
  return { latest, baseline: before.length >= 3 ? mean(before) : undefined, days };
}

export interface SleepStages {
  awake: number;
  light: number; // "core" in Apple Health
  deep: number;
  rem: number;
  /** Asleep without stage detail (iPhone-only, older watches). */
  unspecified: number;
}

export interface SleepSummary {
  start: number;
  end: number;
  asleepMin: number;
  inBedMin: number;
  stages: SleepStages;
  /** Asleep ÷ need, 0–100. */
  performance: number;
  /** Asleep ÷ time in bed, 0–100. */
  efficiency: number;
  source: string;
}

export interface RawSleep {
  start: number;
  end: number;
  /** HKCategoryValueSleepAnalysis: 0 inBed, 1 asleep, 2 awake, 3 core, 4 deep, 5 REM. */
  value: number;
  source: string;
}

const MIN = 60_000;

/**
 * Last night from sleep samples. Phone and band often record the same night; the source with the
 * most stage detail (then the most sleep) is used on its own so nothing is counted twice.
 */
export function lastNight(samples: RawSleep[]): SleepSummary | undefined {
  if (!samples.length) return undefined;
  const bySource = new Map<string, RawSleep[]>();
  for (const s of samples) bySource.set(s.source, [...(bySource.get(s.source) ?? []), s]);
  const score = (xs: RawSleep[]) => {
    const staged = xs.some((x) => x.value >= 3);
    const asleep = xs.filter((x) => [1, 3, 4, 5].includes(x.value)).reduce((t, x) => t + x.end - x.start, 0);
    return (staged ? 1e12 : 0) + asleep;
  };
  const [source, chosen] = [...bySource.entries()].sort((a, b) => score(b[1]) - score(a[1]))[0];

  const stages: SleepStages = { awake: 0, light: 0, deep: 0, rem: 0, unspecified: 0 };
  let inBed = 0;
  for (const s of chosen) {
    const m = (s.end - s.start) / MIN;
    if (s.value === 0) inBed += m;
    else if (s.value === 2) stages.awake += m;
    else if (s.value === 3) stages.light += m;
    else if (s.value === 4) stages.deep += m;
    else if (s.value === 5) stages.rem += m;
    else if (s.value === 1) stages.unspecified += m;
  }
  const asleepMin = stages.light + stages.deep + stages.rem + stages.unspecified;
  if (asleepMin < 60) return undefined;
  const span = chosen.filter((s) => s.value !== 0);
  const start = Math.min(...span.map((s) => s.start));
  const end = Math.max(...span.map((s) => s.end));
  const inBedMin = Math.max(inBed, (end - start) / MIN);
  return {
    start,
    end,
    asleepMin,
    inBedMin,
    stages,
    performance: Math.round(clamp((asleepMin / SLEEP_NEED_MIN) * 100)),
    efficiency: Math.round(clamp((asleepMin / inBedMin) * 100)),
    source,
  };
}

export interface StrainResult {
  /** 0–21. */
  value: number;
  /** Minutes in each heart-rate zone (50–60, 60–70, 70–80, 80–90, 90–100 % of max). */
  zoneMinutes: number[];
  maxHr: number;
  peakHr: number;
}

/** Day strain from heart-rate samples (bpm). Gaps over 10 minutes aren't counted as effort. */
export function strainFrom(hr: { t: number; bpm: number }[], maxHr = 190): StrainResult | undefined {
  if (hr.length < 2) return undefined;
  const sorted = [...hr].sort((a, b) => a.t - b.t);
  const peakHr = Math.max(...sorted.map((s) => s.bpm));
  const max = Math.max(maxHr, peakHr);
  const zoneMinutes = [0, 0, 0, 0, 0];
  let trimp = 0;
  for (let i = 1; i < sorted.length; i++) {
    const dt = Math.min((sorted[i].t - sorted[i - 1].t) / MIN, 10);
    const pct = sorted[i].bpm / max;
    const zone = pct >= 0.9 ? 4 : pct >= 0.8 ? 3 : pct >= 0.7 ? 2 : pct >= 0.6 ? 1 : pct >= 0.5 ? 0 : -1;
    if (zone < 0) continue;
    zoneMinutes[zone] += dt;
    trimp += dt * (zone + 1);
  }
  // Saturating curve: an easy day lands ~5–8, a hard training day ~14–18, like Whoop's scale.
  const value = Math.round(21 * (1 - Math.exp(-trimp / 160)) * 10) / 10;
  return { value, zoneMinutes: zoneMinutes.map(Math.round), maxHr: max, peakHr };
}

export interface RecoveryResult {
  score: number;
  /** What moved it, for the explanation line. */
  parts: { hrv?: number; rhr?: number; sleep?: number };
  band: 'green' | 'yellow' | 'red';
}

/** Recovery from last night's HRV and resting HR vs baseline, and sleep performance. Needs an HRV baseline. */
export function recoveryFrom(hrv?: Trend, rhr?: Trend, sleep?: SleepSummary): RecoveryResult | undefined {
  if (!hrv?.baseline) return undefined;
  const parts: RecoveryResult['parts'] = {
    // 25% above your usual HRV reads as fully recovered; 25% below as depleted.
    hrv: clamp(50 + 200 * (hrv.latest / hrv.baseline - 1)),
    rhr: rhr?.baseline ? clamp(50 - 300 * (rhr.latest / rhr.baseline - 1)) : undefined,
    sleep: sleep?.performance,
  };
  const weights: [number | undefined, number][] = [
    [parts.hrv, 0.5],
    [parts.rhr, 0.2],
    [parts.sleep, 0.3],
  ];
  const used = weights.filter(([v]) => v !== undefined) as [number, number][];
  const score = Math.round(used.reduce((s, [v, w]) => s + v * w, 0) / used.reduce((s, [, w]) => s + w, 0));
  return { score, parts, band: score >= 67 ? 'green' : score >= 34 ? 'yellow' : 'red' };
}

// ---- Live -------------------------------------------------------------------------------------

/**
 * HRV as RMSSD (what WHOOP reports) from beat-to-beat intervals in ms. Implausible beats and
 * jumps over 20% (missed or extra beats) are dropped first. Needs ~20 clean intervals.
 */
export function rmssd(rr: number[]): number | undefined {
  const clean = rr.filter((x) => x >= 300 && x <= 2000);
  const diffs: number[] = [];
  for (let i = 1; i < clean.length; i++) {
    const d = clean[i] - clean[i - 1];
    if (Math.abs(d) <= 0.2 * clean[i - 1]) diffs.push(d);
  }
  if (diffs.length < 20) return undefined;
  return Math.round(Math.sqrt(diffs.reduce((s, d) => s + d * d, 0) / diffs.length));
}

/** Heart-rate zone 0 (below zone 1) to 5, by share of max heart rate, as WHOOP shows them. */
export function hrZone(bpm: number, maxHr: number): number {
  const pct = bpm / maxHr;
  return pct >= 0.9 ? 5 : pct >= 0.8 ? 4 : pct >= 0.7 ? 3 : pct >= 0.6 ? 2 : pct >= 0.5 ? 1 : 0;
}
