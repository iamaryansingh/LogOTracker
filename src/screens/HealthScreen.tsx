import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Linking, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ScreenHeader } from '../components/composite/ScreenHeader';
import { SimpleSparkline } from '../components/composite/SimpleSparkline';
import { ScoreRing } from '../components/health/ScoreRing';
import { StageBar } from '../components/health/StageBar';
import { LiveHeartCard } from '../components/health/LiveHeartCard';
import { SmartAlarmCard } from '../components/health/SmartAlarmCard';
import { WhoopPanel } from '../components/health/WhoopPanel';
import { Button, Card, Chip, Text } from '../components/primitives';
import { dwellLabel } from '../domain/narrative';
import { SLEEP_NEED_MIN, type Trend } from '../domain/recovery';
import type { RootStackParamList } from '../navigation/types';
import { readVitals, vitalsSupported } from '../services/health/vitals';
import type { VitalsSnapshot } from '../services/health/vitalsTypes';
import { useWhoop } from '../services/health/useWhoop';
import { useAppStore } from '../state/AppStore';
import { screenPadding, spacing, useTheme } from '../theme';
import { toISODate } from '../utils/time';

const clock = (t: number) => new Date(t).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });

function MetricRow({ label, unit, trend, digits = 0, higherIsBetter = true }: { label: string; unit: string; trend?: Trend; digits?: number; higherIsBetter?: boolean }) {
  const { colors } = useTheme();
  if (!trend) return null;
  const diff = trend.baseline !== undefined ? trend.latest - trend.baseline : undefined;
  const good = diff === undefined || Math.abs(diff) < 0.02 * (trend.baseline ?? 1) ? undefined : (diff > 0) === higherIsBetter;
  const values = trend.days.slice(-14).map((d) => d.value);
  return (
    <View style={styles.metric}>
      <View style={styles.metricText}>
        <Text variant="caption" tone="secondary">
          {label}
        </Text>
        <Text variant="sectionTitle">
          {trend.latest.toFixed(digits)} <Text variant="caption">{unit}</Text>
        </Text>
        {trend.baseline !== undefined && (
          <Text variant="caption" tone={good === undefined ? 'secondary' : good ? 'calm' : 'stressLow'}>
            {diff! >= 0 ? '▲' : '▼'} {Math.abs(diff!).toFixed(digits)} vs 30-day avg {trend.baseline.toFixed(digits)}
          </Text>
        )}
      </View>
      {values.length >= 2 && (
        <View style={styles.spark}>
          <SimpleSparkline values={values} color={colors.state.focus} min={Math.min(...values) * 0.95} max={Math.max(...values) * 1.05} height={40} accessibilityLabel={`${label}, last ${values.length} days`} />
        </View>
      )}
    </View>
  );
}

/** Everything Whoop and Apple Health know about your body today: recovery, strain, sleep and vitals. */
export function HealthScreen({ navigation }: NativeStackScreenProps<RootStackParamList, 'Health'>) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { health, inputs } = useAppStore();
  const [vitals, setVitals] = useState<VitalsSnapshot | null>(null);
  const [loading, setLoading] = useState(vitalsSupported);
  const today = health[toISODate(new Date())];
  // WHOOP's own numbers, refreshed every minute while this page is open.
  const whoop = useWhoop(60_000);
  const live = whoop.status === 'connected' && !!whoop.data;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setVitals(await readVitals());
    } catch {
      setVitals(null);
    } finally {
      setLoading(false);
    }
  }, []);

  // First read on open; `loading` already starts true.
  useEffect(() => {
    if (!vitalsSupported) return;
    let live = true;
    readVitals()
      .then((v) => live && setVitals(v))
      .catch(() => undefined)
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
  }, []);

  const band = vitals?.recovery?.band;
  const recoveryColor = band === 'green' ? colors.state.calm : band === 'yellow' ? colors.state.energy : colors.state.stressHigh;
  const sleep = vitals?.sleep;
  const nothing = !loading && vitals && !vitals.hrv && !vitals.sleep && !vitals.strain && !vitals.restingHr;

  return (
    <ScrollView
      style={{ backgroundColor: colors.bgSurface }}
      contentContainerStyle={[styles.content, { paddingTop: spacing.lg, paddingBottom: insets.bottom + spacing.xl }]}
      refreshControl={
        <RefreshControl
          refreshing={false}
          onRefresh={() => {
            void whoop.refresh();
            if (vitalsSupported) void load();
          }}
        />
      }
    >
      <ScreenHeader
        title="Body"
        caption={live ? 'Live from WHOOP' : vitals?.fromWhoop ? 'From WHOOP via Apple Health' : vitals?.sources.length ? `From ${vitals.sources.slice(0, 2).join(' & ')}` : 'Whoop & Apple Health'}
        navAction={{ label: 'Close', onPress: navigation.goBack }}
      />

      <LiveHeartCard maxHr={whoop.data?.maxHr} />
      <SmartAlarmCard />
      <WhoopPanel status={whoop.status} data={whoop.data} error={whoop.error} strainLog={whoop.strainLog} onChange={() => void whoop.refresh()} />

      {loading && <ActivityIndicator color={colors.textSecondary} />}

      {!vitalsSupported && (
        <Card>
          <Text variant="body" tone="secondary">
            Recovery, HRV and sleep stages are read from Apple Health on iPhone.
          </Text>
        </Card>
      )}

      {nothing && !live && (
        <Card style={styles.gap}>
          <Text variant="bodyMedium">No Whoop or watch data yet</Text>
          <Text variant="body" tone="secondary">
            In the WHOOP app: More → App Settings → Integrations → Apple Health, and turn on writing. Then allow Self Mirror to read Heart Rate
            Variability, Resting Heart Rate, Respiratory Rate, Blood Oxygen and Sleep in the Health app.
          </Text>
          <Button label="Open Health settings" variant="secondary" onPress={() => Linking.openURL('x-apple-health://')} />
        </Card>
      )}

      {!live && vitals && (vitals.recovery || vitals.strain || sleep) && (
        <Card style={styles.rings}>
          {vitals.recovery && <ScoreRing fraction={vitals.recovery.score / 100} color={recoveryColor} value={`${vitals.recovery.score}%`} label="Recovery" />}
          {vitals.strain && <ScoreRing fraction={vitals.strain.value / 21} color={colors.state.focus} value={vitals.strain.value.toFixed(1)} label="Strain" />}
          {sleep && <ScoreRing fraction={sleep.performance / 100} color={colors.memory.vibeSocial} value={`${sleep.performance}%`} label="Sleep" />}
        </Card>
      )}
      {!live && vitals?.recovery && (
        <Text variant="caption" tone="secondary">
          Estimated the way Whoop does it: last night’s HRV and resting heart rate against your 30-day average, plus sleep. Whoop’s own scores
          stay in the Whoop app.
        </Text>
      )}

      {!live && sleep && (
        <Card style={styles.gap}>
          <View style={styles.row}>
            <Text variant="caption" tone="secondary" style={styles.flex}>
              Last night · {clock(sleep.start)} – {clock(sleep.end)}
            </Text>
            <Chip label={sleep.source} color={colors.state.neutral} />
          </View>
          <Text variant="sectionTitle">
            {dwellLabel(sleep.asleepMin)} asleep <Text variant="caption" tone="secondary">of {dwellLabel(SLEEP_NEED_MIN)} needed</Text>
          </Text>
          <StageBar label="Awake" minutes={sleep.stages.awake} total={sleep.inBedMin} color={colors.state.stressLow} />
          <StageBar label="REM" minutes={sleep.stages.rem} total={sleep.inBedMin} color={colors.memory.vibeSocial} />
          <StageBar label="Light" minutes={sleep.stages.light} total={sleep.inBedMin} color={colors.state.focus} />
          <StageBar label="Deep (SWS)" minutes={sleep.stages.deep} total={sleep.inBedMin} color={colors.state.calm} />
          <StageBar label="Asleep" minutes={sleep.stages.unspecified} total={sleep.inBedMin} color={colors.state.neutral} />
          <Text variant="caption" tone="secondary">
            Efficiency {sleep.efficiency}% · {dwellLabel(sleep.inBedMin)} in bed
          </Text>
        </Card>
      )}

      {vitals?.strain && (
        <Card style={styles.gap}>
          <Text variant="caption" tone="secondary">
            Today’s strain · peak {Math.round(vitals.strain.peakHr)} bpm
          </Text>
          {['50–60%', '60–70%', '70–80%', '80–90%', '90–100%'].map((z, i) => (
            <StageBar key={z} label={`Zone ${i + 1}`} minutes={vitals.strain!.zoneMinutes[i]} total={Math.max(...vitals.strain!.zoneMinutes, 1)} color={[colors.state.calm, colors.state.focus, colors.state.energy, colors.state.stressLow, colors.state.stressHigh][i]} />
          ))}
        </Card>
      )}

      {vitals && (vitals.hrv || vitals.restingHr || vitals.respiratoryRate || vitals.spo2) && (
        <Card style={styles.gap}>
          {live && (
            <Text variant="caption" tone="secondary">
              30-day trends from Apple Health
            </Text>
          )}
          <MetricRow label="Heart rate variability" unit="ms" trend={vitals.hrv} />
          <MetricRow label="Resting heart rate" unit="bpm" trend={vitals.restingHr} higherIsBetter={false} />
          <MetricRow label="Respiratory rate" unit="rpm" trend={vitals.respiratoryRate} digits={1} higherIsBetter={false} />
          <MetricRow label="Blood oxygen" unit="%" trend={vitals.spo2} digits={0} />
          {vitals.wristTempDelta !== undefined && (
            <Text variant="caption" tone="secondary">
              Skin temperature {vitals.wristTempDelta >= 0 ? '+' : ''}
              {vitals.wristTempDelta.toFixed(1)}°C vs your baseline
            </Text>
          )}
        </Card>
      )}

      {inputs.Health && today && (
        <Card style={styles.gap}>
          <Text variant="caption" tone="secondary">
            Today’s activity
          </Text>
          <View style={styles.row}>
            {today.steps != null && <Stat label="Steps" value={Math.round(today.steps).toLocaleString()} />}
            {today.activeKcal != null && <Stat label="Active" value={`${Math.round(today.activeKcal)} kcal`} />}
            {today.exerciseMinutes != null && <Stat label="Exercise" value={`${Math.round(today.exerciseMinutes)} min`} />}
          </View>
        </Card>
      )}

      {vitals && vitals.sources.length > 0 && (
        <Text variant="caption" tone="secondary">
          Sources: {vitals.sources.join(', ')}
        </Text>
      )}
    </ScrollView>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.flex}>
      <Text variant="bodyMedium">{value}</Text>
      <Text variant="caption" tone="secondary">
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: screenPadding,
    gap: spacing.md,
  },
  gap: {
    gap: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  flex: {
    flex: 1,
  },
  rings: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  metric: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.xxs,
  },
  metricText: {
    flex: 1,
    gap: 2,
  },
  spark: {
    width: 110,
  },
});
