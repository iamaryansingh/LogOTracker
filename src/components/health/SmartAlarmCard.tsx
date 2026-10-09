import DateTimePicker from '@react-native-community/datetimepicker';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Platform, StyleSheet, View } from 'react-native';

import SelfMirrorHeart, { type SleepStage, type SleepStatus } from '../../../modules/self-mirror-heart';
import { alarmsSupported } from '../../services/alarms';
import { spacing, useTheme } from '../../theme';
import { haptics } from '../../utils/haptics';
import { Button, Card, Chip, SelectablePill, Text } from '../primitives';

const clock = (s: number) => new Date(s * 1000).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
const STAGE_LABEL: Record<SleepStage, string> = { awake: 'Awake', light: 'Light', deep: 'Deep', rem: 'REM' };
const LEVEL: Record<SleepStage, number> = { awake: 4, rem: 3, light: 2, deep: 1 };

/** Next time this clock time comes round. */
const nextAt = (t: Date) => {
  const d = new Date();
  d.setHours(t.getHours(), t.getMinutes(), 0, 0);
  if (d.getTime() <= Date.now()) d.setDate(d.getDate() + 1);
  return d;
};

const defaultLatest = () => {
  const d = new Date();
  d.setHours(7, 30, 0, 0);
  return d;
};

/** Tonight's stages as a hypnogram strip: awake at the top, deep at the bottom. */
function Hypnogram({ epochs }: { epochs: NonNullable<SleepStatus['epochs']> }) {
  const { colors } = useTheme();
  const color: Record<SleepStage, string> = { awake: colors.state.stressLow, rem: colors.memory.vibeSocial, light: colors.state.focus, deep: colors.state.calm };
  // Up to 240 columns: two-minute columns over a long night.
  const step = Math.max(1, Math.ceil(epochs.length / 240));
  const cols = epochs.filter((_, i) => i % step === 0);
  return (
    <View style={styles.hypno} accessibilityLabel={`Sleep stages, ${cols.length} points`}>
      {cols.map((e) => (
        <View key={e.t} style={[styles.bar, { height: LEVEL[e.stage] * 10, backgroundColor: color[e.stage] }]} />
      ))}
    </View>
  );
}

/**
 * Smart REM alarm: overnight, the WHOOP heart rate broadcast is staged live (natively, so it works
 * locked), and 10 minutes into the chosen REM period an alarm rings, with a latest wake-up as a
 * safety net.
 */
export function SmartAlarmCard() {
  const { colors } = useTheme();
  const [target, setTarget] = useState(4);
  const [latest, setLatest] = useState(defaultLatest);
  const [status, setStatus] = useState<SleepStatus>({ active: false });
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const poll = useCallback(() => {
    if (SelfMirrorHeart) setStatus(SelfMirrorHeart.sleepStatus());
  }, []);

  useEffect(() => {
    const heart = SelfMirrorHeart;
    if (!heart) return;
    const read = () => setStatus(heart.sleepStatus());
    const first = setTimeout(read, 0);
    const t = setInterval(read, 30_000);
    const sub = heart.addListener('onSleep', read);
    return () => {
      clearTimeout(first);
      clearInterval(t);
      sub.remove();
    };
  }, []);

  if (!SelfMirrorHeart || !alarmsSupported()) return null;

  const start = async () => {
    setProblem(null);
    setBusy(true);
    try {
      const wake = nextAt(latest);
      const r = await SelfMirrorHeart!.startSleep(target, Math.floor(wake.getTime() / 1000));
      if (r !== 'ok') setProblem(r === 'denied' ? 'Alarms are off for Self Mirror. Turn them on in Settings → Self Mirror → Alarms.' : `Couldn’t set the safety alarm: ${r}`);
      haptics.success();
      poll();
    } finally {
      setBusy(false);
    }
  };

  if (!status.active) {
    return (
      <Card style={styles.gap}>
        <Text variant="bodyMedium">⏰ Smart REM alarm</Text>
        <Text variant="body" tone="secondary">
          Wear your WHOOP with Heart Rate Broadcast on. Overnight, Self Mirror reads your heart rate and HRV to follow your sleep stages, and
          rings 10 minutes after you enter the REM period you pick.
        </Text>
        <Text variant="caption" tone="secondary">
          Wake me in REM period
        </Text>
        <View style={styles.wrap}>
          {[1, 2, 3, 4, 5].map((n) => (
            <SelectablePill key={n} label={`${n}${n === 1 ? 'st' : n === 2 ? 'nd' : n === 3 ? 'rd' : 'th'}`} selected={target === n} onPress={() => setTarget(n)} />
          ))}
        </View>
        <View style={styles.row}>
          <Text variant="body" style={styles.flex}>
            Latest wake-up
          </Text>
          {Platform.OS === 'ios' && <DateTimePicker value={latest} mode="time" display="compact" onValueChange={(_: unknown, d: Date) => setLatest(d)} />}
        </View>
        <Text variant="caption" tone="secondary">
          If REM period {target} hasn’t come by then, the alarm rings at that time anyway. Leave Self Mirror open in the background (don’t swipe it
          away) and keep the phone charging.
        </Text>
        {busy ? <ActivityIndicator color={colors.textSecondary} /> : <Button label="Start sleep tracking" onPress={start} />}
        {problem && (
          <Text variant="caption" tone="stressLow">
            {problem}
          </Text>
        )}
      </Card>
    );
  }

  const rems = status.remPeriods?.length ?? 0;
  return (
    <Card style={styles.gap}>
      <View style={styles.row}>
        <Text variant="bodyMedium" style={styles.flex}>
          ⏰ Smart REM alarm · on
        </Text>
        {status.stage && <Chip label={STAGE_LABEL[status.stage]} color={status.stage === 'rem' ? colors.memory.vibeSocial : status.stage === 'deep' ? colors.state.calm : status.stage === 'awake' ? colors.state.stressLow : colors.state.focus} />}
      </View>
      <Text variant="caption" tone="secondary">
        Tracking since {status.started ? clock(status.started) : '—'} · {status.onset ? `asleep since ${clock(status.onset)}` : 'waiting for you to fall asleep'}
      </Text>
      <Text variant="body">
        REM periods: {rems} of {status.target}
      </Text>
      <Text variant="body" style={{ color: colors.memory.accentPin }}>
        {status.alarmAt ? `🔔 Ringing at ${clock(status.alarmAt)} (10 min into REM ${status.target})` : status.latestWake ? `Latest wake-up ${clock(status.latestWake)}` : 'No safety alarm set'}
      </Text>
      {status.epochs && status.epochs.length > 1 && <Hypnogram epochs={status.epochs} />}
      <Button
        label="Stop sleep tracking"
        variant="secondary"
        onPress={async () => {
          await SelfMirrorHeart!.stopSleep();
          poll();
        }}
      />
    </Card>
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
  wrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  hypno: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    height: 44,
    gap: 1,
  },
  bar: {
    flex: 1,
    borderRadius: 1,
  },
});
