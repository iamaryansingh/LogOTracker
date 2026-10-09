import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { spacing, useTheme, withAlpha } from '../../theme';
import { haptics } from '../../utils/haptics';
import { PressableScale, Text } from '../primitives';

export interface BarDatum {
  key: string;
  label: string;
  value: number;
  /** Shown when the bar is pressed, e.g. "7 h 30 min". */
  valueLabel: string;
  detail?: string;
}

export interface BarChartProps {
  data: BarDatum[];
  color: string;
  height?: number;
  /** Unit label for the scale hint, e.g. formats the max value. */
  formatMax: (max: number) => string;
  emptyHint?: string;
}

/** Single-series vertical bars. Press a bar to read its value; nothing is colour-only. */
export function BarChart({ data, color, height = 140, formatMax, emptyHint = 'Nothing logged yet' }: BarChartProps) {
  const { colors } = useTheme();
  const [selected, setSelected] = useState<number | null>(null);
  const max = Math.max(...data.map((d) => d.value), 0);
  const active = selected !== null ? data[selected] : null;

  return (
    <View style={styles.container}>
      <View style={styles.readout} accessibilityLiveRegion="polite">
        {active ? (
          <>
            <Text variant="bodyMedium">
              {active.label} · {active.valueLabel}
            </Text>
            {active.detail ? (
              <Text variant="caption" tone="secondary" numberOfLines={2}>
                {active.detail}
              </Text>
            ) : null}
          </>
        ) : (
          <Text variant="caption" tone="secondary">
            {max > 0 ? `Up to ${formatMax(max)} a day · tap a bar for details` : emptyHint}
          </Text>
        )}
      </View>

      <View style={[styles.plot, { height, borderBottomColor: colors.borderSubtle }]}>
        {data.map((d, i) => {
          const h = max > 0 ? (d.value / max) * height : 0;
          const isSelected = selected === i;
          return (
            <PressableScale
              key={d.key}
              pressedScale={0.96}
              onPress={() => {
                haptics.selection();
                setSelected(isSelected ? null : i);
              }}
              accessibilityLabel={`${d.label}: ${d.valueLabel}${d.detail ? `. ${d.detail}` : ''}`}
              style={styles.column}
            >
              <View
                style={[
                  styles.bar,
                  {
                    height: Math.max(h, d.value > 0 ? 4 : 2),
                    backgroundColor: d.value > 0 ? (selected === null || isSelected ? color : withAlpha(color, 0.35)) : colors.borderSubtle,
                  },
                ]}
              />
            </PressableScale>
          );
        })}
      </View>

      <View style={styles.labels}>
        {data.map((d, i) => (
          <Text key={d.key} variant="caption" tone={selected === i ? 'primary' : 'secondary'} style={styles.label} numberOfLines={1}>
            {d.label}
          </Text>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.sm,
  },
  readout: {
    minHeight: 38,
    justifyContent: 'flex-end',
    gap: 2,
  },
  plot: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    borderBottomWidth: 1,
  },
  column: {
    flex: 1,
    height: '100%',
    justifyContent: 'flex-end',
    // 2px surface gap between adjacent bars.
    paddingHorizontal: 1,
  },
  bar: {
    marginHorizontal: '18%',
    borderTopLeftRadius: 4,
    borderTopRightRadius: 4,
  },
  labels: {
    flexDirection: 'row',
  },
  label: {
    flex: 1,
    textAlign: 'center',
  },
});
