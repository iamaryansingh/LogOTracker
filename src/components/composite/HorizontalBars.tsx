import { StyleSheet, View } from 'react-native';

import { spacing, useTheme } from '../../theme';
import { Text } from '../primitives';

export interface HorizontalBarDatum {
  key: string;
  label: string;
  value: number;
  valueLabel: string;
}

/** Ranked single-colour bars with direct labels; used for "where your time went". */
export function HorizontalBars({ data, color }: { data: HorizontalBarDatum[]; color: string }) {
  const { colors } = useTheme();
  const max = Math.max(...data.map((d) => d.value), 0);
  return (
    <View style={styles.list}>
      {data.map((d) => (
        <View key={d.key} style={styles.row} accessible accessibilityLabel={`${d.label}: ${d.valueLabel}`}>
          <View style={styles.text}>
            <Text variant="body">{d.label}</Text>
            <Text variant="caption" tone="secondary" style={styles.value}>
              {d.valueLabel}
            </Text>
          </View>
          <View style={[styles.track, { backgroundColor: colors.borderSubtle }]}>
            <View style={[styles.fill, { width: `${max > 0 ? (d.value / max) * 100 : 0}%`, backgroundColor: color }]} />
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  list: {
    gap: spacing.sm,
  },
  row: {
    gap: spacing.xxs,
  },
  text: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
  },
  value: {
    fontVariant: ['tabular-nums'],
  },
  track: {
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: 4,
  },
});
