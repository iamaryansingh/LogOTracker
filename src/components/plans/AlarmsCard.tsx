import DateTimePicker from '@react-native-community/datetimepicker';
import { useCallback, useEffect, useState } from 'react';
import { Linking, Platform, StyleSheet, TextInput, View } from 'react-native';

import { alarmsSupported, cancelAlarm, listAlarms, setAlarm, type ScheduledAlarm } from '../../services/alarms';
import { radii, spacing, typography, useTheme } from '../../theme';
import { haptics } from '../../utils/haptics';
import { Button, Card, PressableScale, Text } from '../primitives';

const when = (d: Date) => {
  const today = new Date();
  const tomorrow = new Date(today.getTime() + 86_400_000);
  const day = d.toDateString() === today.toDateString() ? 'Today' : d.toDateString() === tomorrow.toDateString() ? 'Tomorrow' : d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  return `${day} · ${d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`;
};

/** The next time this clock time comes round (today if still ahead, else tomorrow). */
const nextAt = (t: Date) => {
  const d = new Date();
  d.setHours(t.getHours(), t.getMinutes(), 0, 0);
  if (d.getTime() <= Date.now()) d.setDate(d.getDate() + 1);
  return d;
};

/**
 * Alarms Self Mirror has set, read from iOS. iOS keeps app alarms out of the Clock app, so this is
 * where they're seen, set, tested and cancelled.
 */
export function AlarmsCard() {
  const { colors } = useTheme();
  const [alarms, setAlarms] = useState<ScheduledAlarm[]>([]);
  const [adding, setAdding] = useState(false);
  const [time, setTime] = useState(() => new Date(Date.now() + 60 * 60_000));
  const [label, setLabel] = useState('');
  const [status, setStatus] = useState<{ text: string; good: boolean } | null>(null);
  const [showAndroid, setShowAndroid] = useState(false);

  const reload = useCallback(async () => setAlarms(await listAlarms()), []);
  useEffect(() => {
    let live = true;
    listAlarms().then((a) => live && setAlarms(a));
    return () => {
      live = false;
    };
  }, []);

  if (!alarmsSupported()) return null;

  const schedule = async (at: Date, title: string) => {
    setStatus(null);
    const r = await setAlarm(at, title);
    if (r.ok) {
      haptics.success();
      setStatus({ text: `Set for ${when(at)}. It rings even in Silent mode.`, good: true });
      setAdding(false);
      setLabel('');
      await reload();
    } else {
      setStatus({
        text:
          r.reason === 'denied'
            ? 'Alarms are turned off for Self Mirror. Turn them on in Settings → Self Mirror → Alarms.'
            : `iOS didn’t accept the alarm${r.message ? `: ${r.message}` : '.'}`,
        good: false,
      });
    }
  };

  return (
    <Card style={styles.gap}>
      <View style={styles.row}>
        <Text variant="sectionTitle" style={styles.flex}>
          ⏰ Alarms
        </Text>
        {!adding && <Button label="＋ Set alarm" variant="secondary" style={styles.small} onPress={() => setAdding(true)} />}
      </View>

      {alarms.length === 0 && !adding && (
        <Text variant="body" tone="secondary">
          No alarms set. Add one here, or write “wake me up at 6:30” in a note.
        </Text>
      )}
      {alarms.map((a) => (
        <View key={a.id} style={[styles.alarm, { borderColor: colors.borderSubtle }]}>
          <View style={styles.flex}>
            <Text variant="bodyMedium">{a.at ? a.at.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }) : 'Alarm'}</Text>
            <Text variant="caption" tone="secondary">
              {a.title}
              {a.at ? ` · ${when(a.at).split(' · ')[0]}` : ''}
              {a.state === 'alerting' ? ' · ringing' : ''}
            </Text>
          </View>
          <PressableScale
            onPress={async () => {
              await cancelAlarm(a.id);
              haptics.selection();
              await reload();
            }}
            hitSlop={8}
            accessibilityLabel={`Cancel ${a.title}`}
          >
            <Text variant="caption" tone="stressHigh">
              Cancel
            </Text>
          </PressableScale>
        </View>
      ))}

      {adding && (
        <View style={styles.gap}>
          <View style={styles.row}>
            <Text variant="body" style={styles.flex}>
              Ring at
            </Text>
            {Platform.OS === 'ios' ? (
              <DateTimePicker value={time} mode="time" display="compact" onValueChange={(_: unknown, d: Date) => setTime(d)} />
            ) : (
              <>
                <Button label={time.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })} variant="secondary" style={styles.small} onPress={() => setShowAndroid(true)} />
                {showAndroid && (
                  <DateTimePicker
                    value={time}
                    mode="time"
                    onValueChange={(_: unknown, d: Date) => {
                      setShowAndroid(false);
                      setTime(d);
                    }}
                    onDismiss={() => setShowAndroid(false)}
                  />
                )}
              </>
            )}
          </View>
          <TextInput
            value={label}
            onChangeText={setLabel}
            placeholder="Label (e.g. Gym)"
            placeholderTextColor={colors.textSecondary}
            style={[typography.body, styles.input, { color: colors.textPrimary, borderColor: colors.borderSubtle, backgroundColor: colors.bgSurface }]}
          />
          <View style={styles.row}>
            <Button label="Cancel" variant="ghost" style={styles.flex} onPress={() => setAdding(false)} />
            <Button label={`Set for ${when(nextAt(time)).split(' · ')[0].toLowerCase()}`} style={styles.flex} onPress={() => schedule(nextAt(time), label.trim() || 'Alarm')} />
          </View>
        </View>
      )}

      {status && (
        <Text variant="caption" tone={status.good ? 'calm' : 'stressLow'}>
          {status.text}
        </Text>
      )}
      {status && !status.good && <Button label="Open Settings" variant="secondary" onPress={() => Linking.openSettings()} />}

      <View style={styles.row}>
        <Text variant="caption" tone="secondary" style={styles.flex}>
          iOS doesn’t show app alarms in the Clock app. They live here and ring like Clock alarms.
        </Text>
        <PressableScale onPress={() => schedule(new Date(Date.now() + 60_000), 'Test alarm')} hitSlop={8} accessibilityLabel="Test an alarm in one minute">
          <Text variant="caption" tone="focus">
            Test (1 min)
          </Text>
        </PressableScale>
      </View>
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
  small: {
    minHeight: 36,
    paddingHorizontal: spacing.md,
  },
  alarm: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.xs,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  input: {
    minHeight: 44,
    borderWidth: 1,
    borderRadius: radii.chip,
    paddingHorizontal: spacing.sm,
  },
});
