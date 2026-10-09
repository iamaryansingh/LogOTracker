import { StyleSheet, View } from 'react-native';

import type { DayRatings, MetricValue, RatingKey } from '../../domain/types';
import { spacing, useTheme, type StateToken } from '../../theme';
import { haptics } from '../../utils/haptics';
import { Card, PressableScale, Text } from '../primitives';

const SCALE: MetricValue[] = [1, 2, 3, 4, 5];

const ROWS: { key: RatingKey; label: string; token: (v: MetricValue | undefined) => StateToken }[] = [
  { key: 'energy', label: 'Energy', token: () => 'energy' },
  { key: 'focus', label: 'Focus', token: () => 'focus' },
  { key: 'stress', label: 'Stress', token: (v) => (v !== undefined && v >= 4 ? 'stressHigh' : 'stressLow') },
];

export interface StateIndicatorMeterProps {
  ratings: DayRatings;
  /** Omit for a read-only meter. Passing the current value again clears it. */
  onRate?: (key: RatingKey, value: MetricValue | undefined) => void;
  /** Half-width layout: label above the dots, smaller targets. */
  compact?: boolean;
  /** Render without its own card (when a parent card provides one). */
  bare?: boolean;
}

export function StateIndicatorMeter({ ratings, onRate, compact = false, bare = false }: StateIndicatorMeterProps) {
  const { colors } = useTheme();
  const rated = Object.keys(ratings).length > 0;

  return (
    <Card style={[styles.card, bare && styles.bare]} padded={!bare}>
      {ROWS.map(({ key, label, token }) => {
        const value = ratings[key];
        const filled = colors.state[token(value)];
        return (
          <View key={key} style={compact ? styles.compactRow : styles.row}>
            <Text variant={compact ? 'caption' : 'body'} tone={compact ? 'secondary' : 'primary'} style={compact ? undefined : styles.label}>
              {label}
            </Text>
            <View style={styles.dots} accessibilityRole="adjustable" accessibilityLabel={`${label}, ${value ?? 'not rated'} out of 5`}>
              {SCALE.map((step) => (
                <PressableScale
                  key={step}
                  disabled={!onRate}
                  pressedScale={0.8}
                  hitSlop={4}
                  accessibilityLabel={`Rate ${label.toLowerCase()} ${step} of 5`}
                  onPress={() => {
                    haptics.selection();
                    onRate?.(key, value === step ? undefined : step);
                  }}
                  style={compact ? styles.hitCompact : styles.hit}
                >
                  <View style={[styles.dot, { backgroundColor: value !== undefined && step <= value ? filled : colors.borderSubtle }]} />
                </PressableScale>
              ))}
            </View>
          </View>
        );
      })}
      {onRate && !rated && !compact && (
        <Text variant="caption" tone="secondary">
          Tap the dots to rate your day. It takes a second and makes patterns possible.
        </Text>
      )}
    </Card>
  );
}

const DOT = 12;

const styles = StyleSheet.create({
  card: {
    gap: spacing.xs,
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
  },
  bare: {
    borderWidth: 0,
    backgroundColor: 'transparent',
  },
  compactRow: {
    gap: 0,
  },
  hitCompact: {
    width: 26,
    height: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hit: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dot: {
    width: DOT,
    height: DOT,
    borderRadius: DOT / 2,
  },
});
