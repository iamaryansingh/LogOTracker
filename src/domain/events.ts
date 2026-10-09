import { toISODate } from '../utils/time';
import type {
  CopingActionType,
  DomainCategory,
  ImpactDirection,
  MoodLevel,
  SignalEvent,
  StateCategory,
} from './types';

const MAX_SHAPING_EVENTS = 5;

/** Keeps the entries with the most impact (weighted by duration) and returns them in time order. */
export function selectShapingEvents(events: SignalEvent[], limit = MAX_SHAPING_EVENTS): SignalEvent[] {
  const weight = (e: SignalEvent) => e.inferredStateImpact.magnitude * (1 + Math.min(durationHours(e), 8) / 4);
  return events
    .filter((e) => e.eventType !== 'NOISE')
    .sort((a, b) => weight(b) - weight(a))
    .slice(0, limit)
    .sort(byStart);
}

export const byStart = (a: SignalEvent, b: SignalEvent) => Date.parse(a.timestampStart) - Date.parse(b.timestampStart);

export const durationHours = (e: SignalEvent) =>
  Math.max(0, (Date.parse(e.timestampEnd) - Date.parse(e.timestampStart)) / 3_600_000);

/** The day an entry belongs to. Sleep counts toward the day you woke up. */
export const dayOf = (e: SignalEvent): string =>
  toISODate(new Date(e.domain === 'Sleep' ? e.timestampEnd : e.timestampStart));

export const isCheckIn = (e: SignalEvent) => !e.isNote && e.timestampStart === e.timestampEnd;

export type DayBlock = 'Overnight' | 'Morning' | 'Afternoon' | 'Evening';

export function dayBlockOf(iso: string): DayBlock {
  const hour = new Date(iso).getHours();
  if (hour < 5) return 'Overnight';
  if (hour < 12) return 'Morning';
  if (hour < 17) return 'Afternoon';
  return 'Evening';
}

export const DAY_BLOCKS: DayBlock[] = ['Overnight', 'Morning', 'Afternoon', 'Evening'];

/** A night's sleep that began the evening before the day it belongs to (the day you woke up). */
export const isPrevEveningSleep = (e: SignalEvent) =>
  e.domain === 'Sleep' && e.title !== 'Nap' && toISODate(new Date(e.timestampStart)) !== dayOf(e);

/** Where an entry sits within its day. Last night's sleep always opens the day, whenever it started. */
export const blockOf = (e: SignalEvent): DayBlock => (isPrevEveningSleep(e) ? 'Overnight' : dayBlockOf(e.timestampStart));

export const DOMAINS: DomainCategory[] = ['Work', 'Exercise', 'Sleep', 'Social', 'Food', 'Personal', 'Health'];

export const domainDefaultTitle: Record<DomainCategory, string> = {
  Work: 'Work session',
  Exercise: 'Exercise',
  Sleep: 'Sleep',
  Social: 'Time with people',
  Food: 'Meal',
  Personal: 'Personal time',
  Health: 'Health & self-care',
};

// ---- Outcomes: how an activity left you ------------------------------------------

export type Outcome = 'Energized' | 'Focused' | 'Calm' | 'Neutral' | 'Drained' | 'Stressed' | 'Overwhelmed';

export const OUTCOMES: Outcome[] = ['Energized', 'Focused', 'Calm', 'Neutral', 'Drained', 'Stressed', 'Overwhelmed'];

interface Impact {
  targetState: StateCategory;
  direction: ImpactDirection;
  magnitude: number;
}

const outcomeImpact: Record<Outcome, Impact> = {
  Energized: { targetState: 'Energy', direction: 'INCREASE', magnitude: 0.6 },
  Focused: { targetState: 'Focus', direction: 'INCREASE', magnitude: 0.6 },
  Calm: { targetState: 'Calm', direction: 'INCREASE', magnitude: 0.5 },
  Neutral: { targetState: 'Calm', direction: 'NEUTRAL', magnitude: 0.15 },
  Drained: { targetState: 'Energy', direction: 'DECREASE', magnitude: 0.6 },
  Stressed: { targetState: 'Stress', direction: 'INCREASE', magnitude: 0.65 },
  Overwhelmed: { targetState: 'Overload', direction: 'INCREASE', magnitude: 0.85 },
};

export function outcomeOf(e: SignalEvent): Outcome {
  const { targetState: s, direction: d } = e.inferredStateImpact;
  if (d === 'NEUTRAL') return 'Neutral';
  if (s === 'Energy') return d === 'INCREASE' ? 'Energized' : 'Drained';
  if (s === 'Focus') return d === 'INCREASE' ? 'Focused' : 'Drained';
  if (s === 'Stress') return d === 'INCREASE' ? 'Stressed' : 'Calm';
  if (s === 'Overload') return 'Overwhelmed';
  return 'Calm';
}

// ---- Energy flow: did an activity give energy (producer) or take it (consumer)? ----------

export type EnergyFlow = 'PRODUCER' | 'CONSUMER' | 'NEUTRAL';

export const flowOf = (e: SignalEvent): EnergyFlow =>
  e.eventType === 'PRODUCER' ? 'PRODUCER' : e.eventType === 'CONSUMER' ? 'CONSUMER' : 'NEUTRAL';

/** The flow an outcome suggests; the user can override it when logging. */
export const flowForOutcome = (o: Outcome): EnergyFlow => (isPositive(o) ? 'PRODUCER' : isNegative(o) ? 'CONSUMER' : 'NEUTRAL');

const eventTypeFor: Record<EnergyFlow, SignalEvent['eventType']> = { PRODUCER: 'PRODUCER', CONSUMER: 'CONSUMER', NEUTRAL: 'SIGNAL' };

export const isNegative = (o: Outcome) => o === 'Drained' || o === 'Stressed' || o === 'Overwhelmed';
export const isPositive = (o: Outcome) => o === 'Energized' || o === 'Focused' || o === 'Calm';

const newId = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

export interface ActivityInput {
  domain: DomainCategory;
  title?: string;
  start: Date;
  minutes: number;
  outcome: Outcome;
  /** Defaults to what the outcome suggests. */
  flow?: EnergyFlow;
  note?: string;
}

export function createActivity(input: ActivityInput, id = newId('log')): SignalEvent {
  const end = new Date(input.start.getTime() + input.minutes * 60_000);
  return {
    id,
    timestampStart: input.start.toISOString(),
    timestampEnd: end.toISOString(),
    title: input.title?.trim() || domainDefaultTitle[input.domain],
    domain: input.domain,
    eventType: eventTypeFor[input.flow ?? flowForOutcome(input.outcome)],
    inferredStateImpact: outcomeImpact[input.outcome],
    confidenceScore: 1,
    source: 'MANUAL',
    note: input.note?.trim() || undefined,
  };
}

/** A standalone note or reminder on the timeline. */
export function createNoteEntry(text: string, at: Date, id = newId('note')): SignalEvent {
  const iso = at.toISOString();
  const firstLine = text.trim().split('\n')[0];
  return {
    id,
    timestampStart: iso,
    timestampEnd: iso,
    title: firstLine.length > 48 ? `${firstLine.slice(0, 47)}…` : firstLine || 'Note',
    domain: 'Personal',
    eventType: 'SIGNAL',
    inferredStateImpact: { targetState: 'Calm', direction: 'NEUTRAL', magnitude: 0.05 },
    confidenceScore: 1,
    source: 'MANUAL',
    note: text.trim(),
    isNote: true,
  };
}

// ---- Mood check-ins ---------------------------------------------------------------

const moodImpact: Record<MoodLevel, Impact & { title: string }> = {
  Good: { targetState: 'Calm', direction: 'INCREASE', magnitude: 0.4, title: 'Felt good' },
  Okay: { targetState: 'Calm', direction: 'NEUTRAL', magnitude: 0.25, title: 'Felt okay' },
  Neutral: { targetState: 'Calm', direction: 'NEUTRAL', magnitude: 0.15, title: 'Felt neutral' },
  Stressed: { targetState: 'Stress', direction: 'INCREASE', magnitude: 0.6, title: 'Felt stressed' },
  Overwhelmed: { targetState: 'Overload', direction: 'INCREASE', magnitude: 0.85, title: 'Felt overwhelmed' },
};

export function createMoodCapture(mood: MoodLevel, at = new Date()): SignalEvent {
  const { title, ...impact } = moodImpact[mood];
  const iso = at.toISOString();
  return {
    id: newId('cap'),
    timestampStart: iso,
    timestampEnd: iso,
    title,
    subtitle: 'Check-in',
    domain: 'Personal',
    eventType: 'SIGNAL',
    inferredStateImpact: impact,
    confidenceScore: 1,
    source: 'MANUAL',
  };
}

// ---- Coping sessions --------------------------------------------------------------

const copingTitle: Record<CopingActionType, string> = {
  WALK: 'Took a short walk',
  BREATHE: 'Paused to breathe',
  DISCONNECT: 'Stepped away from screens',
};

export function createCopingEvent(action: CopingActionType, startedAt: Date, endedAt = new Date()): SignalEvent {
  return {
    id: newId('cope'),
    timestampStart: startedAt.toISOString(),
    timestampEnd: endedAt.toISOString(),
    title: copingTitle[action],
    subtitle: 'Recovery moment',
    domain: action === 'WALK' ? 'Exercise' : 'Health',
    eventType: 'PRODUCER',
    inferredStateImpact: { targetState: 'Recovery', direction: 'INCREASE', magnitude: 0.5 },
    confidenceScore: 1,
    source: 'MANUAL',
  };
}
