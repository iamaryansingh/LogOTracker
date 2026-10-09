import { toISODate } from '../../utils/time';
import { dayRanges, humanize, nativeHealthAllowed, type HealthDaily, type HealthProvider } from './shared';
import type { RawWorkout } from './validate';

type HealthConnect = typeof import('react-native-health-connect');

// Required lazily: the native module doesn't exist in Expo Go, and importing it there would crash at startup.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const load = (): HealthConnect => require('react-native-health-connect');

const PERMISSIONS = [
  { accessType: 'read', recordType: 'Steps' },
  { accessType: 'read', recordType: 'ActiveCaloriesBurned' },
  { accessType: 'read', recordType: 'ExerciseSession' },
  { accessType: 'read', recordType: 'SleepSession' },
] as const;

const between = (start: Date, end: Date) => ({ operator: 'between' as const, startTime: start.toISOString(), endTime: end.toISOString() });

async function ready(): Promise<HealthConnect | null> {
  if (!nativeHealthAllowed()) return null;
  const HC = load();
  const status = await HC.getSdkStatus();
  if (status !== HC.SdkAvailabilityStatus.SDK_AVAILABLE) return null;
  return (await HC.initialize()) ? HC : null;
}

export const healthProvider: HealthProvider = {
  name: 'Health Connect',

  isSupported: async () => (await ready()) !== null,

  requestAccess: async () => {
    const HC = await ready();
    if (!HC) return false;
    const granted = await HC.requestPermission([...PERMISSIONS]);
    return granted.length > 0;
  },

  fetch: async (days) => {
    const HC = await ready();
    if (!HC) return { source: 'hc', daily: {}, sleep: [], workouts: [] };
    const ranges = dayRanges(days);
    const range = between(new Date(ranges[0].start.getTime() - 12 * 3_600_000), new Date());
    const daily: Record<string, HealthDaily> = {};

    await Promise.all(
      ranges.map(async ({ date, start, end }) => {
        const timeRangeFilter = between(start, end);
        const [steps, energy] = await Promise.all([
          HC.aggregateRecord({ recordType: 'Steps', timeRangeFilter }),
          HC.aggregateRecord({ recordType: 'ActiveCaloriesBurned', timeRangeFilter }),
        ]);
        daily[date] = { steps: steps.COUNT_TOTAL, activeKcal: energy.ACTIVE_CALORIES_TOTAL?.inKilocalories };
      }),
    );

    const sleep = await HC.readRecords('SleepSession', { timeRangeFilter: range });
    // Sleep sessions from Health Connect are already "asleep" spans.
    const sleepSamples = sleep.records.map((r) => ({ start: Date.parse(r.startTime), end: Date.parse(r.endTime), stage: 'asleep' as const }));

    const exercise = await HC.readRecords('ExerciseSession', { timeRangeFilter: range });
    const typeNames = Object.fromEntries(Object.entries(HC.ExerciseType).map(([k, v]) => [v, k])) as Record<number, string>;
    const workouts: RawWorkout[] = exercise.records.map((r) => ({
      id: `hc-${r.metadata?.id ?? r.startTime}`,
      title: r.title || humanize(typeNames[r.exerciseType] ?? 'Workout'),
      start: Date.parse(r.startTime),
      end: Date.parse(r.endTime),
    }));

    // Exercise minutes aren't a Health Connect record; derive them from sessions.
    for (const w of workouts) {
      const day = daily[toISODate(new Date(w.start))];
      if (day && w.end > w.start) day.exerciseMinutes = (day.exerciseMinutes ?? 0) + (w.end - w.start) / 60_000;
    }

    return { source: 'hc', daily, sleep: sleepSamples, workouts };
  },
};
