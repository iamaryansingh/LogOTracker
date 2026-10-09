import { addDays, formatHours, shortWeekday, toISODate } from '../utils/time';
import { dayOf, DOMAINS, durationHours, flowOf, isCheckIn, isNegative, isPositive, outcomeOf, type Outcome } from './events';
import type { HealthDaily } from '../services/health/shared';
import type { CopingActionType, DayRatings, DomainCategory, InsightCardData, LoadLevel, RatingKey, SignalEvent } from './types';

export type RatingsByDay = Record<string, DayRatings>;

export interface DayStats {
  date: string;
  entries: SignalEvent[];
  hoursByDomain: Record<DomainCategory, number>;
  /** Logged hours excluding sleep. */
  activeHours: number;
  sleepHours: number;
  ratings: DayRatings;
  hasData: boolean;
}

const emptyHours = (): Record<DomainCategory, number> =>
  Object.fromEntries(DOMAINS.map((d) => [d, 0])) as Record<DomainCategory, number>;

export function groupByDay(logs: SignalEvent[]): Map<string, SignalEvent[]> {
  const map = new Map<string, SignalEvent[]>();
  for (const e of logs) {
    const key = dayOf(e);
    const list = map.get(key);
    if (list) list.push(e);
    else map.set(key, [e]);
  }
  return map;
}

export function dayStats(date: string, entries: SignalEvent[], ratings: DayRatings = {}): DayStats {
  const hoursByDomain = emptyHours();
  for (const e of entries) if (!isCheckIn(e)) hoursByDomain[e.domain] += durationHours(e);
  const sleepHours = hoursByDomain.Sleep;
  const activeHours = DOMAINS.reduce((s, d) => s + (d === 'Sleep' ? 0 : hoursByDomain[d]), 0);
  const hasData = entries.length > 0 || Object.keys(ratings).length > 0;
  return { date, entries, hoursByDomain, activeHours, sleepHours, ratings, hasData };
}

/** Seven consecutive days ending on `endDate` (oldest first). */
export function weekStats(logs: SignalEvent[], ratings: RatingsByDay, endDate: Date): DayStats[] {
  const byDay = groupByDay(logs);
  return Array.from({ length: 7 }, (_, i) => {
    const date = toISODate(addDays(endDate, i - 6));
    return dayStats(date, byDay.get(date) ?? [], ratings[date]);
  });
}

/** Rough load for a day: your own stress rating counts most, long logged days add weight. */
export function loadFor(stats: DayStats): LoadLevel | null {
  const stress = stats.ratings.stress;
  const negatives = stats.entries.filter((e) => isNegative(outcomeOf(e))).length;
  if (!stats.hasData) return null;
  const score = Math.max(stress ?? 0, stats.activeHours >= 11 ? 5 : stats.activeHours >= 9 ? 4 : stats.activeHours >= 6 ? 3 : 1, negatives >= 3 ? 4 : negatives >= 2 ? 3 : 1);
  if (score >= 5) return 'Extreme';
  if (score >= 4) return 'Heavy';
  if (score >= 3) return 'Moderate';
  return 'Light';
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);

// ---- Insights ------------------------------------------------------------------------
// Every insight is derived from the user's own entries, needs repeated evidence, and is
// phrased probabilistically. Thresholds are deliberately conservative.

const MIN_DOMAIN_ENTRIES = 3;
const MIN_GROUP_DAYS = 2;
const MIN_RATING_GAP = 0.8;

const domainNoun: Record<DomainCategory, string> = {
  Work: 'Work',
  Exercise: 'Exercise',
  Sleep: 'Sleep',
  Social: 'Time with people',
  Food: 'Meals',
  Personal: 'Personal time',
  Health: 'Self-care',
};

const outcomeWord: Record<Outcome, string> = {
  Energized: 'energized',
  Focused: 'focused',
  Calm: 'calm',
  Neutral: 'neutral',
  Drained: 'drained',
  Stressed: 'stressed',
  Overwhelmed: 'overwhelmed',
};

const copingFor = (domain: DomainCategory): { label: string; actionType: CopingActionType } =>
  domain === 'Work'
    ? { label: 'Take a 10-minute walk', actionType: 'WALK' }
    : domain === 'Personal'
      ? { label: 'Disconnect for 15 minutes', actionType: 'DISCONNECT' }
      : { label: 'Take one minute to breathe', actionType: 'BREATHE' };

function mostCommon<T>(xs: T[]): T {
  const counts = new Map<T, number>();
  for (const x of xs) counts.set(x, (counts.get(x) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
}

function domainInsights(logs: SignalEvent[]): InsightCardData[] {
  const out: InsightCardData[] = [];
  for (const domain of DOMAINS) {
    const entries = logs.filter((e) => e.domain === domain && !isCheckIn(e));
    if (entries.length < MIN_DOMAIN_ENTRIES) continue;
    const outcomes = entries.map(outcomeOf);
    const neg = outcomes.filter(isNegative);
    const pos = outcomes.filter(isPositive);
    const noun = domainNoun[domain];
    if (neg.length / outcomes.length >= 0.6) {
      const word = outcomeWord[mostCommon(neg)];
      out.push({
        id: `dom-neg-${domain}`,
        type: 'TRIGGER',
        headline: `${noun} tends to leave you ${word}`,
        body: `${neg.length} of your ${outcomes.length} ${noun.toLowerCase()} entries left you drained, stressed or overwhelmed.`,
        evidenceCount: outcomes.length,
        suggestedAction: copingFor(domain),
        relevance: 0.6 + (neg.length / outcomes.length) * 0.3,
      });
    } else if (pos.length / outcomes.length >= 0.6) {
      const word = outcomeWord[mostCommon(pos)];
      out.push({
        id: `dom-pos-${domain}`,
        type: 'RECOVERY',
        headline: `${noun} appears to leave you ${word}`,
        body: `${pos.length} of your ${outcomes.length} ${noun.toLowerCase()} entries left you feeling better.`,
        evidenceCount: outcomes.length,
        relevance: 0.5 + (pos.length / outcomes.length) * 0.3,
      });
    }
  }
  return out;
}

/** Compares a rating between days that match a condition and days that don't. */
function splitCompare(days: DayStats[], metric: RatingKey, test: (d: DayStats) => boolean) {
  const rated = days.filter((d) => d.ratings[metric] !== undefined);
  const yes = rated.filter(test).map((d) => d.ratings[metric]!);
  const no = rated.filter((d) => !test(d)).map((d) => d.ratings[metric]!);
  if (yes.length < MIN_GROUP_DAYS || no.length < MIN_GROUP_DAYS) return null;
  return { gap: mean(yes) - mean(no), evidence: yes.length + no.length };
}

const STEP_GOAL = 8000;

function stepInsights(days: DayStats[], health: Record<string, HealthDaily>): InsightCardData[] {
  const withSteps = days.filter((d) => health[d.date]?.steps !== undefined);
  const active = (d: DayStats) => (health[d.date]?.steps ?? 0) >= STEP_GOAL;
  const out: InsightCardData[] = [];
  const energy = splitCompare(withSteps, 'energy', active);
  if (energy && energy.gap >= MIN_RATING_GAP) {
    out.push({
      id: 'steps-energy',
      type: 'RECOVERY',
      headline: `Days with ${STEP_GOAL.toLocaleString()}+ steps appear to come with more energy`,
      body: `Your energy rating was about ${energy.gap.toFixed(1)} points higher on your more active days.`,
      evidenceCount: energy.evidence,
      evidenceUnit: 'days',
      suggestedAction: { label: 'Take a 10-minute walk', actionType: 'WALK' },
      relevance: 0.82,
    });
  }
  const stress = splitCompare(withSteps, 'stress', active);
  if (stress && stress.gap <= -MIN_RATING_GAP) {
    out.push({
      id: 'steps-stress',
      type: 'RECOVERY',
      headline: 'More active days are often associated with lower stress',
      body: `On days with ${STEP_GOAL.toLocaleString()}+ steps, your stress rating was about ${Math.abs(stress.gap).toFixed(1)} points lower.`,
      evidenceCount: stress.evidence,
      evidenceUnit: 'days',
      relevance: 0.78,
    });
  }
  return out;
}

function dayInsights(days: DayStats[]): InsightCardData[] {
  const out: InsightCardData[] = [];
  const logged = days.filter((d) => d.entries.length > 0);

  const sleep = splitCompare(logged.filter((d) => d.sleepHours > 0), 'energy', (d) => d.sleepHours >= 7);
  if (sleep && sleep.gap >= MIN_RATING_GAP) {
    out.push({
      id: 'day-sleep-energy',
      type: 'PATTERN',
      headline: 'Nights of 7+ hours tend to come before higher-energy days',
      body: `On those days you rated your energy about ${sleep.gap.toFixed(1)} points higher.`,
      evidenceCount: sleep.evidence,
      evidenceUnit: 'days',
      relevance: 0.85,
    });
  }

  const work = splitCompare(logged, 'stress', (d) => d.hoursByDomain.Work >= 8);
  if (work && work.gap >= MIN_RATING_GAP) {
    out.push({
      id: 'day-work-stress',
      type: 'PATTERN',
      headline: 'Longer work days tend to come with more stress',
      body: `On days with 8+ hours of work, your stress rating was about ${work.gap.toFixed(1)} points higher.`,
      evidenceCount: work.evidence,
      evidenceUnit: 'days',
      suggestedAction: copingFor('Work'),
      relevance: 0.9,
    });
  }

  const exercise = splitCompare(logged, 'energy', (d) => d.hoursByDomain.Exercise > 0);
  if (exercise && exercise.gap >= MIN_RATING_GAP) {
    out.push({
      id: 'day-exercise-energy',
      type: 'RECOVERY',
      headline: 'Days with exercise appear to have more energy',
      body: `Your energy rating was about ${exercise.gap.toFixed(1)} points higher on days you moved.`,
      evidenceCount: exercise.evidence,
      evidenceUnit: 'days',
      suggestedAction: { label: 'Take a 10-minute walk', actionType: 'WALK' },
      relevance: 0.8,
    });
  }

  const social = splitCompare(logged, 'stress', (d) => d.hoursByDomain.Social > 0);
  if (social && social.gap <= -MIN_RATING_GAP) {
    out.push({
      id: 'day-social-stress',
      type: 'RECOVERY',
      headline: 'Time with people is often associated with lower stress',
      body: `Your stress rating was about ${Math.abs(social.gap).toFixed(1)} points lower on days with social time.`,
      evidenceCount: social.evidence,
      evidenceUnit: 'days',
      relevance: 0.7,
    });
  }
  return out;
}

function changeInsight(logs: SignalEvent[], ratings: RatingsByDay, today: Date): InsightCardData | null {
  const thisWeek = weekStats(logs, ratings, today);
  const lastWeek = weekStats(logs, ratings, addDays(today, -7));
  const stress = (w: DayStats[]) => w.map((d) => d.ratings.stress).filter((v): v is NonNullable<typeof v> => v !== undefined);
  const a = stress(thisWeek);
  const b = stress(lastWeek);
  if (a.length < 3 || b.length < 3) return null;
  const gap = mean(a) - mean(b);
  if (Math.abs(gap) < 0.7) return null;
  return {
    id: 'change-stress',
    type: 'CHANGE',
    headline: gap < 0 ? 'Your stress appears lower than last week' : 'Your stress appears higher than last week',
    body: `Your average stress rating moved from ${mean(b).toFixed(1)} to ${mean(a).toFixed(1)}.`,
    evidenceCount: a.length + b.length,
    evidenceUnit: 'days',
    suggestedAction: gap > 0 ? { label: 'Take one minute to breathe', actionType: 'BREATHE' } : undefined,
    relevance: 0.75,
  };
}

function reflectionInsight(week: DayStats[]): InsightCardData | null {
  const totals = DOMAINS.filter((d) => d !== 'Sleep').map((d) => ({ d, h: week.reduce((s, day) => s + day.hoursByDomain[d], 0) }));
  const total = totals.reduce((s, t) => s + t.h, 0);
  if (total < 5) return null;
  const top = totals.sort((a, b) => b.h - a.h)[0];
  return {
    id: 'reflect-top-domain',
    type: 'REFLECTION',
    headline: `${domainNoun[top.d]} took most of your logged time this week`,
    body: `${formatHours(top.h)} of ${formatHours(total)} logged, not counting sleep. Something to notice, not necessarily change.`,
    evidenceCount: week.filter((d) => d.hoursByDomain[top.d] > 0).length,
    evidenceUnit: 'days',
    relevance: 0.4,
  };
}

/** Everything the user's data currently supports, most relevant first. */
export function computeInsights(
  logs: SignalEvent[],
  ratings: RatingsByDay,
  health: Record<string, HealthDaily> = {},
  today = new Date(),
): InsightCardData[] {
  const byDay = groupByDay(logs);
  const dates = new Set([...byDay.keys(), ...Object.keys(ratings)]);
  const days = [...dates].map((d) => dayStats(d, byDay.get(d) ?? [], ratings[d]));
  const week = weekStats(logs, ratings, today);
  return [
    ...dayInsights(days),
    ...stepInsights(days, health),
    ...domainInsights(logs),
    changeInsight(logs, ratings, today),
    reflectionInsight(week),
  ]
    .filter((i): i is InsightCardData => i !== null)
    .sort((a, b) => (b.relevance ?? 0) - (a.relevance ?? 0));
}

/** How many distinct days have any data, for the "keep logging" empty state. */
export const daysWithData = (logs: SignalEvent[], ratings: RatingsByDay) =>
  new Set([...logs.map(dayOf), ...Object.keys(ratings)]).size;

// ---- Weekly highlights ------------------------------------------------------------

export function weekHighlights(week: DayStats[]): string[] {
  const notes: string[] = [];
  const logged = week.filter((d) => d.hasData);
  if (logged.length === 0) return notes;

  const busiest = [...week].sort((a, b) => b.activeHours - a.activeHours)[0];
  if (busiest.activeHours > 0) notes.push(`${shortWeekday(busiest.date)} was your fullest day, with ${formatHours(busiest.activeHours)} logged.`);

  const slept = week.filter((d) => d.sleepHours > 0);
  if (slept.length >= 2) notes.push(`Sleep averaged ${formatHours(mean(slept.map((d) => d.sleepHours)))} across ${slept.length} nights you logged.`);

  const energyDays = week.filter((d) => d.ratings.energy !== undefined);
  if (energyDays.length >= 2) {
    const best = [...energyDays].sort((a, b) => b.ratings.energy! - a.ratings.energy!)[0];
    notes.push(`Your energy felt highest on ${shortWeekday(best.date)}.`);
  }

  const outcomes = week.flatMap((d) => d.entries.filter((e) => !isCheckIn(e)).map(outcomeOf));
  const neg = outcomes.filter(isNegative).length;
  const pos = outcomes.filter(isPositive).length;
  if (outcomes.length >= 4) {
    notes.push(
      pos >= neg
        ? `${pos} of ${outcomes.length} activities left you feeling better.`
        : `${neg} of ${outcomes.length} activities left you drained or stressed. It may be worth protecting some recovery time.`,
    );
  }

  const exercise = week.reduce((s, d) => s + d.hoursByDomain.Exercise, 0);
  if (exercise > 0) notes.push(`You moved for ${formatHours(exercise)} this week.`);
  return notes;
}

// ---- Energy balance: producers vs consumers ---------------------------------------------

export interface FlowItem {
  key: string;
  title: string;
  hours: number;
  count: number;
}

export interface EnergyBalance {
  producedHours: number;
  consumedHours: number;
  neutralHours: number;
  producers: FlowItem[];
  consumers: FlowItem[];
}

/** Splits logged time into what gave energy and what took it, grouping repeats of the same activity. */
export function energyBalance(entries: SignalEvent[]): EnergyBalance {
  const groups = { PRODUCER: new Map<string, FlowItem>(), CONSUMER: new Map<string, FlowItem>() };
  let producedHours = 0;
  let consumedHours = 0;
  let neutralHours = 0;
  for (const e of entries) {
    if (isCheckIn(e) || e.isNote) continue;
    const hours = durationHours(e);
    const flow = flowOf(e);
    if (flow === 'NEUTRAL') {
      neutralHours += hours;
      continue;
    }
    if (flow === 'PRODUCER') producedHours += hours;
    else consumedHours += hours;
    const key = `${e.domain}:${e.title.trim().toLowerCase()}`;
    const item = groups[flow].get(key) ?? { key, title: e.title, hours: 0, count: 0 };
    item.hours += hours;
    item.count += 1;
    groups[flow].set(key, item);
  }
  const ranked = (m: Map<string, FlowItem>) => [...m.values()].sort((a, b) => b.hours - a.hours);
  return { producedHours, consumedHours, neutralHours, producers: ranked(groups.PRODUCER), consumers: ranked(groups.CONSUMER) };
}
