import { StyleSheet, View } from 'react-native';

import type { DailySummary, MetricValue } from '../../domain/types';
import { spacing, useTheme, type StateToken } from '../../theme';
import { Card, Text } from '../primitives';

const SCALE = [1, 2, 3, 4, 5] as const;

interface MetricRowProps {
  label: string;
  value: MetricValue;
  token: StateToken;
}

function MetricRow({ label, value, token }: MetricRowProps) {
  const { colors } = useTheme();
  const filled = colors.state[token];
  return (
    <View style={styles.row} accessible accessibilityLabel={`${label}, ${value} out of 5`}>
      <Text variant="body" style={styles.label}>
        {label}
      </Text>
      <View style={styles.dots}>
        {SCALE.map((step) => (
          <View
            key={step}
            style={[styles.dot, { backgroundColor: step <= value ? filled : colors.borderSubtle }]}
          />
        ))}
      </View>
    </View>
  );
}

export interface StateIndicatorMeterProps {
  metrics: DailySummary['metrics'];
}

export function StateIndicatorMeter({ metrics }: StateIndicatorMeterProps) {
  return (
    <Card style={styles.card}>
      <MetricRow label="Energy" value={metrics.energy} token="energy" />
      <MetricRow label="Focus" value={metrics.focus} token="focus" />
      <MetricRow label="Stress" value={metrics.stress} token={metrics.stress >= 4 ? 'stressHigh' : 'stressLow'} />
    </Card>
  );
}

const DOT = 10;

const styles = StyleSheet.create({
  card: {
    gap: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  label: {
    flexShrink: 1,
  },
  dots: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  dot: {
    width: DOT,
    height: DOT,
    borderRadius: DOT / 2,
  },
});
