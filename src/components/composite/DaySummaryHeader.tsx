import { StyleSheet, View } from 'react-native';

import type { LoadLevel } from '../../domain/types';
import { spacing, useTheme, type StateToken } from '../../theme';
import { formatLongDate, greetingFor } from '../../utils/time';
import { Chip, Text } from '../primitives';

const loadToken: Record<LoadLevel, StateToken> = {
  Light: 'calm',
  Moderate: 'energy',
  Heavy: 'stressLow',
  Extreme: 'stressHigh',
};

export interface DaySummaryHeaderProps {
  now: Date;
  load: LoadLevel;
}

export function DaySummaryHeader({ now, load }: DaySummaryHeaderProps) {
  const { colors } = useTheme();
  return (
    <View style={styles.container} accessibilityRole="header">
      <View style={styles.text}>
        <Text variant="headerLarge">{greetingFor(now)}</Text>
        <Text variant="caption" tone="secondary">
          {formatLongDate(now)}
        </Text>
      </View>
      <Chip label={`${load} load`} color={colors.state[loadToken[load]]} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  text: {
    flexShrink: 1,
    gap: spacing.xxs,
  },
});
