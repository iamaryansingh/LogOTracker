import { StyleSheet, View } from 'react-native';

import { dwellLabel } from '../../domain/narrative';
import { spacing, useTheme } from '../../theme';
import { Text } from '../primitives';

/** One labelled bar: a sleep stage or heart-rate zone, as a share of the whole. */
export function StageBar({ label, minutes, total, color }: { label: string; minutes: number; total: number; color: string }) {
  const { colors } = useTheme();
  if (minutes <= 0) return null;
  return (
    <View style={styles.stage}>
      <Text variant="caption" style={styles.stageLabel}>
        {label}
      </Text>
      <View style={[styles.stageTrack, { backgroundColor: colors.borderSubtle }]}>
        <View style={[styles.stageFill, { width: `${Math.min(100, (minutes / total) * 100)}%`, backgroundColor: color }]} />
      </View>
      <Text variant="caption" tone="secondary" style={styles.stageValue}>
        {dwellLabel(minutes)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  stage: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  stageLabel: {
    width: 78,
  },
  stageTrack: {
    flex: 1,
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
  },
  stageFill: {
    height: 8,
    borderRadius: 4,
  },
  stageValue: {
    width: 70,
    textAlign: 'right',
  },
});
