import { useEffect } from 'react';
import { ActivityIndicator, Linking, StyleSheet, View } from 'react-native';
import Animated, { cancelAnimation, useAnimatedStyle, useSharedValue, withRepeat, withSequence, withTiming } from 'react-native-reanimated';

import { dwellLabel } from '../../domain/narrative';
import { hrZone } from '../../domain/recovery';
import { liveHeartSupported, useLiveHeart } from '../../services/health/useLiveHeart';
import { useLiveSensors, type LiveSensors } from '../../services/health/useLiveSensors';
import { spacing, useTheme } from '../../theme';
import { Button, Card, Chip, Text } from '../primitives';
import { StageBar } from './StageBar';

/** A heart that beats at your actual rate. */
function Beat({ bpm, color }: { bpm?: number; color: string }) {
  const scale = useSharedValue(1);
  // Restart only when the rate moves by a few beats, so the rhythm stays smooth.
  const bucket = bpm ? Math.round(bpm / 4) * 4 : 0;
  useEffect(() => {
    if (!bucket) return;
    const beat = 60_000 / bucket;
    scale.value = withRepeat(withSequence(withTiming(1.18, { duration: beat * 0.18 }), withTiming(1, { duration: beat * 0.82 })), -1);
    return () => cancelAnimation(scale);
  }, [bucket, scale]);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  return <Animated.Text style={[styles.heart, { color }, style]}>♥</Animated.Text>;
}

/** Live heart rate from your WHOOP's heart rate broadcast (or any Bluetooth heart rate monitor). */
export function LiveHeartCard({ maxHr }: { maxHr?: number }) {
  const { colors } = useTheme();
  const live = useLiveHeart(maxHr ?? 190);
  // The phone's own sensors run alongside, while live is on.
  const sensors = useLiveSensors(live.status !== 'idle' && live.status !== 'stopped');
  if (!liveHeartSupported) return null;

  const max = maxHr ?? 190;
  const zone = live.bpm ? hrZone(live.bpm, max) : 0;
  const zoneColor = [colors.state.neutral, colors.state.calm, colors.state.focus, colors.state.energy, colors.state.stressLow, colors.state.stressHigh][zone];
  const streaming = live.status === 'connected' && live.bpm !== undefined;

  if (live.status === 'idle' || live.status === 'stopped') {
    return (
      <Card style={styles.gap}>
        <Text variant="bodyMedium">♥ Live heart rate</Text>
        <Text variant="body" tone="secondary">
          See your heart rate beat by beat, with your zone and live HRV. Turn on broadcasting first: in the WHOOP app, tap your band (top
          left) → Device Settings → Heart Rate Broadcast → On.
        </Text>
        <Button label="Go live" onPress={live.start} />
      </Card>
    );
  }

  if (live.status === 'bluetooth-off' || live.status === 'unauthorized' || live.status === 'unsupported') {
    return (
      <Card style={styles.gap}>
        <Text variant="bodyMedium">♥ Live heart rate</Text>
        <Text variant="body" tone="secondary">
          {live.status === 'bluetooth-off'
            ? 'Bluetooth is off. Turn it on in Control Centre, then try again.'
            : live.status === 'unauthorized'
              ? 'Self Mirror isn’t allowed to use Bluetooth. Allow it in Settings → Self Mirror.'
              : 'This device can’t connect to heart rate monitors.'}
        </Text>
        {live.status === 'unauthorized' && <Button label="Open Settings" variant="secondary" onPress={() => Linking.openSettings()} />}
        <Button label="Try again" variant="ghost" onPress={live.start} />
      </Card>
    );
  }

  if (!streaming) {
    return (
      <Card style={styles.gap}>
        <View style={styles.row}>
          <ActivityIndicator color={colors.textSecondary} />
          <Text variant="bodyMedium" style={styles.flex}>
            {live.status === 'connecting' ? `Connecting to ${live.device ?? 'your monitor'}…` : live.status === 'disconnected' ? 'Reconnecting…' : 'Looking for your WHOOP…'}
          </Text>
        </View>
        <Text variant="caption" tone="secondary">
          Make sure Heart Rate Broadcast is on in the WHOOP app and the band is on your wrist.
        </Text>
        <PhoneSensors sensors={sensors} />
        <Button label="Stop" variant="ghost" onPress={live.stop} />
      </Card>
    );
  }

  const s = live.session!;
  return (
    <Card style={styles.gap}>
      <View style={styles.row}>
        <View style={[styles.liveDot, { backgroundColor: colors.state.stressHigh }]} />
        <Text variant="caption" tone="secondary" style={styles.flex}>
          Live · {live.device}
        </Text>
        <Chip label={zone ? `Zone ${zone}` : 'Resting'} color={zoneColor} />
      </View>

      <View style={styles.hero}>
        <Beat bpm={live.bpm} color={zoneColor} />
        <Text style={styles.bpm}>{live.bpm}</Text>
        <Text variant="caption" tone="secondary">
          bpm · {Math.round(((live.bpm ?? 0) / max) * 100)}% of max
        </Text>
      </View>

      <View style={styles.stats}>
        <Stat label="Live HRV" value={live.hrv !== undefined ? `${live.hrv} ms` : '—'} />
        <Stat label="Avg" value={`${s.avg}`} />
      </View>
      {live.hrv === undefined && (
        <Text variant="caption" tone="secondary">
          Live HRV appears when the monitor sends beat-to-beat timing; sit still for a minute.
        </Text>
      )}

      {s.zoneMinutes.some((m) => m > 0) &&
        ['Zone 1', 'Zone 2', 'Zone 3', 'Zone 4', 'Zone 5'].map((z, i) => (
          <StageBar key={z} label={z} minutes={s.zoneMinutes[i]} total={Math.max(...s.zoneMinutes, 1)} color={[colors.state.calm, colors.state.focus, colors.state.energy, colors.state.stressLow, colors.state.stressHigh][i]} />
        ))}

      <PhoneSensors sensors={sensors} />

      <View style={styles.row}>
        <Text variant="caption" tone="secondary" style={styles.flex}>
          Session {dwellLabel((live.recent[live.recent.length - 1].t - s.since) / 60_000)}
        </Text>
        <Button label="Stop" variant="secondary" style={styles.small} onPress={live.stop} />
      </View>
    </Card>
  );
}

const MOVEMENT_LABEL = { still: 'Still', light: 'Moving', active: 'Active' } as const;

/** Other live readings, from the phone itself. Heart rate only ever comes from the Bluetooth monitor. */
function PhoneSensors({ sensors }: { sensors: LiveSensors }) {
  const { colors } = useTheme();
  const items = [
    sensors.steps !== undefined && { label: 'Steps today', value: sensors.steps.toLocaleString() },
    sensors.cadence !== undefined && { label: 'Steps / min', value: `${sensors.cadence}` },
    sensors.movement && { label: 'Movement', value: MOVEMENT_LABEL[sensors.movement] },
    sensors.elevationM !== undefined && { label: 'Height change', value: `${sensors.elevationM >= 0 ? '+' : ''}${sensors.elevationM} m` },
    sensors.pressureHpa !== undefined && { label: 'Air pressure', value: `${Math.round(sensors.pressureHpa)} hPa` },
  ].filter((x): x is { label: string; value: string } => !!x);
  if (!items.length) return null;
  return (
    <View style={[styles.sensors, { borderTopColor: colors.borderSubtle }]}>
      <Text variant="caption" tone="secondary">
        Live from your phone
      </Text>
      <View style={styles.stats}>
        {items.map((i) => (
          <Stat key={i.label} label={i.label} value={i.value} />
        ))}
      </View>
    </View>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.stat}>
      <Text variant="bodyMedium">{value}</Text>
      <Text variant="caption" tone="secondary">
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
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
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  hero: {
    alignItems: 'center',
    gap: 2,
  },
  heart: {
    fontSize: 40,
    lineHeight: 46,
  },
  bpm: {
    fontSize: 64,
    lineHeight: 70,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  stats: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    rowGap: spacing.sm,
  },
  stat: {
    width: '25%',
    minWidth: 80,
    gap: 2,
  },
  sensors: {
    gap: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  small: {
    minHeight: 36,
    paddingHorizontal: spacing.md,
  },
});
