import { lastNight, recoveryFrom, strainFrom, trendOf, type RawSleep } from '../../domain/recovery';
import { toISODate } from '../../utils/time';
import { nativeHealthAllowed } from './shared';
import type { VitalsSnapshot } from './vitalsTypes';

type HealthKit = typeof import('@kingstinct/react-native-healthkit');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const load = (): HealthKit => require('@kingstinct/react-native-healthkit');

const READ = [
  'HKQuantityTypeIdentifierHeartRateVariabilitySDNN',
  'HKQuantityTypeIdentifierRestingHeartRate',
  'HKQuantityTypeIdentifierHeartRate',
  'HKQuantityTypeIdentifierRespiratoryRate',
  'HKQuantityTypeIdentifierOxygenSaturation',
  'HKQuantityTypeIdentifierAppleSleepingWristTemperature',
  'HKCategoryTypeIdentifierSleepAnalysis',
] as const;

const DAY = 86_400_000;
const isWhoop = (name: string, bundle: string) => /whoop/i.test(name) || /whoop/i.test(bundle);

export const vitalsSupported = true;

/**
 * Reads the vitals Whoop (or an Apple Watch) writes to Apple Health over the last 30 days and
 * turns them into Recovery, Strain and Sleep. Returns null when Health isn't available.
 */
export async function readVitals(): Promise<VitalsSnapshot | null> {
  if (!nativeHealthAllowed()) return null;
  const HK = load();
  if (!HK.isHealthDataAvailable()) return null;
  await HK.requestAuthorization({ toRead: READ });

  const now = new Date();
  const since = new Date(now.getTime() - 30 * DAY);
  const midnight = new Date(now);
  midnight.setHours(0, 0, 0, 0);
  const sources = new Set<string>();
  let fromWhoop = false;
  const note = (s: { sourceRevision?: { source?: { name?: string; bundleIdentifier?: string } } }) => {
    const name = s.sourceRevision?.source?.name ?? '';
    if (name) sources.add(name);
    if (isWhoop(name, s.sourceRevision?.source?.bundleIdentifier ?? '')) fromWhoop = true;
  };

  const range = (start: Date, end = now) => ({ limit: 0, filter: { date: { startDate: start, endDate: end } } });
  const [hrv, rhr, resp, spo2, temp, hr, sleep] = await Promise.all([
    HK.queryQuantitySamples('HKQuantityTypeIdentifierHeartRateVariabilitySDNN', { ...range(since), unit: 'ms' }).catch(() => []),
    HK.queryQuantitySamples('HKQuantityTypeIdentifierRestingHeartRate', { ...range(since), unit: 'count/min' }).catch(() => []),
    HK.queryQuantitySamples('HKQuantityTypeIdentifierRespiratoryRate', { ...range(since), unit: 'count/min' }).catch(() => []),
    HK.queryQuantitySamples('HKQuantityTypeIdentifierOxygenSaturation', { ...range(since), unit: '%' }).catch(() => []),
    HK.queryQuantitySamples('HKQuantityTypeIdentifierAppleSleepingWristTemperature', { ...range(since), unit: 'degC' }).catch(() => []),
    HK.queryQuantitySamples('HKQuantityTypeIdentifierHeartRate', { ...range(midnight), unit: 'count/min' }).catch(() => []),
    // Last night: from yesterday noon.
    HK.queryCategorySamples('HKCategoryTypeIdentifierSleepAnalysis', range(new Date(midnight.getTime() - 12 * 3_600_000))).catch(() => []),
  ]);
  for (const s of [...hrv, ...rhr, ...resp, ...spo2, ...sleep]) note(s);

  // Overnight samples belong to the morning they end on, which is how Whoop dates them too.
  const dateOf = (t: number) => toISODate(new Date(t));
  const series = (xs: readonly { endDate: Date; quantity: number }[], scale = 1) => xs.map((s) => ({ t: s.endDate.getTime(), value: s.quantity * scale }));

  const hrvTrend = trendOf(series(hrv), dateOf);
  const rhrTrend = trendOf(series(rhr), dateOf);
  // HealthKit's percent unit is a fraction (0.97).
  const spo2Trend = trendOf(series(spo2, spo2.some((s) => s.quantity > 1) ? 1 : 100), dateOf);
  const tempTrend = trendOf(series(temp), dateOf);
  const night = lastNight(
    sleep.map((s): RawSleep => ({ start: s.startDate.getTime(), end: s.endDate.getTime(), value: Number(s.value), source: s.sourceRevision?.source?.name ?? 'Unknown' })),
  );

  return {
    sources: [...sources],
    fromWhoop,
    hrv: hrvTrend,
    restingHr: rhrTrend,
    respiratoryRate: trendOf(series(resp), dateOf),
    spo2: spo2Trend,
    wristTempDelta: tempTrend?.baseline !== undefined ? Math.round((tempTrend.latest - tempTrend.baseline) * 10) / 10 : undefined,
    sleep: night,
    strain: strainFrom(hr.map((s) => ({ t: s.startDate.getTime(), bpm: s.quantity }))),
    recovery: recoveryFrom(hrvTrend, rhrTrend, night),
    readAt: now.toISOString(),
  };
}
