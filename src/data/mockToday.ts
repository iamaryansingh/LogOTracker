import type { DailySummary, InsightCardData, SignalEvent } from '../domain/types';
import { toISODate } from '../utils/time';

// Mock events are anchored to the current day so the Today screen always reads as "today".
const at = (hour: number, minute = 0): string => {
  const d = new Date();
  d.setHours(hour, minute, 0, 0);
  return d.toISOString();
};

export const todayEvents: SignalEvent[] = [
  {
    id: 'evt-sleep',
    timestampStart: at(0, 40),
    timestampEnd: at(7, 10),
    title: 'Slept 6 h 30 min',
    subtitle: 'Shorter than your usual 7 h 15 min',
    domain: 'Sleep',
    eventType: 'SIGNAL',
    inferredStateImpact: { targetState: 'Energy', direction: 'DECREASE', magnitude: 0.5 },
    confidenceScore: 0.91,
  },
  {
    id: 'evt-walk',
    timestampStart: at(7, 45),
    timestampEnd: at(8, 10),
    title: 'Morning walk',
    subtitle: '2,400 steps',
    domain: 'Exercise',
    eventType: 'PRODUCER',
    inferredStateImpact: { targetState: 'Energy', direction: 'INCREASE', magnitude: 0.4 },
    confidenceScore: 0.86,
  },
  {
    id: 'evt-notif',
    timestampStart: at(8, 30),
    timestampEnd: at(8, 32),
    title: 'Notification burst',
    domain: 'Personal',
    eventType: 'NOISE',
    inferredStateImpact: { targetState: 'Focus', direction: 'NEUTRAL', magnitude: 0.05 },
    confidenceScore: 0.4,
  },
  {
    id: 'evt-deepwork',
    timestampStart: at(9, 0),
    timestampEnd: at(10, 45),
    title: 'Deep work block',
    subtitle: 'No calendar events, low phone use',
    domain: 'Work',
    eventType: 'PRODUCER',
    inferredStateImpact: { targetState: 'Focus', direction: 'INCREASE', magnitude: 0.7 },
    confidenceScore: 0.78,
  },
  {
    id: 'evt-meetings',
    timestampStart: at(11, 0),
    timestampEnd: at(13, 30),
    title: 'Back-to-back meetings',
    subtitle: '3 meetings, no breaks',
    domain: 'Work',
    eventType: 'CONSUMER',
    inferredStateImpact: { targetState: 'Stress', direction: 'INCREASE', magnitude: 0.8 },
    confidenceScore: 0.84,
  },
  {
    id: 'evt-lunch',
    timestampStart: at(13, 45),
    timestampEnd: at(14, 5),
    title: 'Late lunch',
    domain: 'Food',
    eventType: 'SIGNAL',
    inferredStateImpact: { targetState: 'Energy', direction: 'NEUTRAL', magnitude: 0.15 },
    confidenceScore: 0.62,
  },
  {
    id: 'evt-call',
    timestampStart: at(17, 30),
    timestampEnd: at(18, 15),
    title: 'Call with a friend',
    domain: 'Social',
    eventType: 'PRODUCER',
    inferredStateImpact: { targetState: 'Recovery', direction: 'INCREASE', magnitude: 0.55 },
    confidenceScore: 0.69,
  },
];

const MAX_SHAPING_EVENTS = 5;

/** Drops noise, keeps the most impactful events, and returns them in chronological order. */
export function selectShapingEvents(events: SignalEvent[], limit = MAX_SHAPING_EVENTS): SignalEvent[] {
  return events
    .filter((e) => e.eventType !== 'NOISE')
    .sort((a, b) => b.inferredStateImpact.magnitude - a.inferredStateImpact.magnitude)
    .slice(0, limit)
    .sort((a, b) => Date.parse(a.timestampStart) - Date.parse(b.timestampStart));
}

export const meetingsInsight: InsightCardData = {
  id: 'ins-meetings',
  type: 'PATTERN',
  headline: 'Long meetings tend to increase your stress',
  body: 'On days with more than two hours of meetings in a row, your evenings often appear less restful.',
  evidenceCount: 8,
  suggestedAction: { label: 'Take a 10-minute walk', actionType: 'WALK' },
};

export const todaySummary: DailySummary = {
  date: toISODate(new Date()),
  overallLoad: 'Moderate',
  metrics: { energy: 3, focus: 4, stress: 3 },
  shapingEvents: selectShapingEvents(todayEvents),
  primaryInsight: meetingsInsight,
};
