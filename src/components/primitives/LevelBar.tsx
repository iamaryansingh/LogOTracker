import { StyleSheet, View } from 'react-native';

import { useTheme } from '../../theme';

export interface LevelBarProps {
  /** 0–1 */
  value: number;
  color: string;
  accessibilityLabel?: string;
}

export function LevelBar({ value, color, accessibilityLabel }: LevelBarProps) {
  const { colors } = useTheme();
  const pct = `${Math.round(Math.min(Math.max(value, 0), 1) * 100)}%` as const;
  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={accessibilityLabel}
      style={[styles.track, { backgroundColor: colors.borderSubtle }]}
    >
      <View style={[styles.fill, { width: pct, backgroundColor: color }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: 3,
  },
});
