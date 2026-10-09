import { useEffect, useState } from 'react';
import { Linking, StyleSheet, Switch, View } from 'react-native';

import type { InputSourceInfo } from '../../data/inputSources';
import { getAccess, requestAccess, type AccessStatus } from '../../services/permissions';
import { useAppStore } from '../../state/AppStore';
import { spacing, useTheme } from '../../theme';
import { haptics } from '../../utils/haptics';
import { Button, Card, Text } from '../primitives';

export interface InputSourceCardProps {
  info: InputSourceInfo;
  /** Shows exactly what is and isn't read. Off in onboarding to keep it light. */
  showDetails?: boolean;
}

function statusLine(status: AccessStatus | null, enabled: boolean, source: string): string | null {
  if (status === 'unavailable') {
    return source === 'Health'
      ? 'Needs the installed Self Mirror app. Health data can’t be read inside Expo Go.'
      : 'Not available on this device.';
  }
  if (status === 'denied')
    return source === 'Health'
      ? 'No access yet. Allow it in Health (iPhone) or Health Connect (Android).'
      : 'Access is turned off in your phone’s Settings.';
  if (status === 'granted' && !enabled) return 'Paused. Self Mirror isn’t reading this. You can also remove access in Settings.';
  if (enabled) return 'On. Used only on this phone.';
  return null;
}

export function InputSourceCard({ info, showDetails = true }: InputSourceCardProps) {
  const { colors } = useTheme();
  const { inputs, setInput } = useAppStore();
  const enabled = inputs[info.source];
  const [status, setStatus] = useState<AccessStatus | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    getAccess(info.source).then((s) => alive && setStatus(s));
    return () => {
      alive = false;
    };
  }, [info.source]);

  const onToggle = async (next: boolean) => {
    haptics.selection();
    if (!next) {
      setInput(info.source, false);
      return;
    }
    setBusy(true);
    const result = await requestAccess(info.source);
    setBusy(false);
    setStatus(result);
    setInput(info.source, result === 'granted');
    if (result === 'granted') haptics.success();
  };

  const line = statusLine(status, enabled, info.source);

  return (
    <Card style={styles.card}>
      <View style={styles.header}>
        <View style={styles.title}>
          <Text variant="bodyMedium">{info.source}</Text>
          <Text variant="caption" tone="secondary">
            {info.purpose}
          </Text>
        </View>
        <Switch
          value={enabled}
          onValueChange={onToggle}
          disabled={busy || status === 'unavailable'}
          trackColor={{ true: colors.state.calm, false: colors.borderSubtle }}
          accessibilityLabel={`${info.source}: ${info.purpose}`}
        />
      </View>

      {showDetails && (
        <View style={styles.details}>
          <Text variant="caption" tone="secondary">
            Reads: <Text variant="caption">{info.reads}</Text>
          </Text>
          <Text variant="caption" tone="secondary">
            Never reads: <Text variant="caption">{info.neverReads}</Text>
          </Text>
        </View>
      )}

      {line && (
        <Text variant="caption" tone={enabled ? 'calm' : 'secondary'}>
          {line}
        </Text>
      )}
      {status === 'denied' && (
        <Button label="Open Settings" variant="ghost" style={styles.settings} onPress={() => Linking.openSettings()} />
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: spacing.sm,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  title: {
    flex: 1,
    gap: 2,
  },
  details: {
    gap: spacing.xxs,
  },
  settings: {
    alignSelf: 'flex-start',
    minHeight: 32,
    paddingHorizontal: 0,
  },
});
