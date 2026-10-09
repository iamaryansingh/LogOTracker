import { dayRanges, humanize, nativeHealthAllowed, type HealthDaily, type HealthProvider } from './shared';
import type { RawSleepSample, RawWorkout } from './validate';

type HealthKit = typeof import('@kingstinct/react-native-healthkit');

// Required lazily: the native module doesn't exist in Expo Go, and importing it there would crash at startup.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const load = (): HealthKit => require('@kingstinct/react-native-healthkit');

const READ = [
  'HKQuantityTypeIdentifierStepCount',
  'HKQuantityTypeIdentifierActiveEnergyBurned',
  'HKQuantityTypeIdentifierAppleExerciseTime',
  'HKCategoryTypeIdentifierSleepAnalysis',
  'HKWorkoutTypeIdentifier',
] as const;

// HKCategoryValueSleepAnalysis: 0 inBed, 1 asleepUnspecified, 2 awake, 3 core, 4 deep, 5 REM.
const ASLEEP = new Set([1, 3, 4, 5]);
const IN_BED = 0;

export const healthProvider: HealthProvider = {
  name: 'Apple Health',

  isSupported: async () => nativeHealthAllowed() && load().isHealthDataAvailable(),

  // HealthKit never reveals whether read access was granted (for privacy), only that the prompt was answered.
  requestAccess: async () => load().requestAuthorization({ toRead: READ }),

  fetch: async (days) => {
    const HK = load();
    const ranges = dayRanges(days);
    const since = ranges[0].start;
    const daily: Record<string, HealthDaily> = {};

    await Promise.all(
      ranges.map(async ({ date, start, end }) => {
        const filter = { date: { startDate: start, endDate: end } };
        const [steps, energy, exercise] = await Promise.all([
          HK.queryStatisticsForQuantity('HKQuantityTypeIdentifierStepCount', ['cumulativeSum'], { filter, unit: 'count' }),
          HK.queryStatisticsForQuantity('HKQuantityTypeIdentifierActiveEnergyBurned', ['cumulativeSum'], { filter, unit: 'kcal' }),
          HK.queryStatisticsForQuantity('HKQuantityTypeIdentifierAppleExerciseTime', ['cumulativeSum'], { filter, unit: 'min' }),
        ]);
        daily[date] = {
          steps: steps.sumQuantity?.quantity,
          activeKcal: energy.sumQuantity?.quantity,
          exerciseMinutes: exercise.sumQuantity?.quantity,
        };
      }),
    );

    const sleep = await HK.queryCategorySamples('HKCategoryTypeIdentifierSleepAnalysis', {
      limit: 0,
      filter: { date: { startDate: new Date(since.getTime() - 12 * 3_600_000) } },
    });
    const sleepSamples: RawSleepSample[] = sleep
      .filter((s) => ASLEEP.has(Number(s.value)) || Number(s.value) === IN_BED)
      .map((s) => ({ start: s.startDate.getTime(), end: s.endDate.getTime(), stage: Number(s.value) === IN_BED ? 'inBed' : 'asleep' }));

    const workouts = await HK.queryWorkoutSamples({ limit: 0, filter: { date: { startDate: since } } });
    const workoutNames = HK.WorkoutActivityType as unknown as Record<number, string>;
    const rawWorkouts: RawWorkout[] = workouts.map((w) => {
      const item = {
        id: `hk-${w.uuid}`,
        title: humanize(workoutNames[w.workoutActivityType] ?? 'Workout'),
        start: w.startDate.getTime(),
        end: w.endDate.getTime(),
      };
      w.dispose();
      return item;
    });

    return { source: 'hk', daily, sleep: sleepSamples, workouts: rawWorkouts };
  },
};
