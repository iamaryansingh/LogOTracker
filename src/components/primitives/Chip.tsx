import { StyleSheet, View } from 'react-native';

import { radii, spacing, withAlpha } from '../../theme';
import { Text } from './Text';

export interface ChipProps {
  label: string;
  /** Token color: rendered at full saturation for text and 12% for the fill. */
  color: string;
  accessibilityLabel?: string;
}

export function Chip({ label, color, accessibilityLabel }: ChipProps) {
  return (
    <View style={[styles.chip, { backgroundColor: withAlpha(color, 0.12) }]} accessibilityLabel={accessibilityLabel}>
      <Text variant="caption" style={{ color }}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    alignSelf: 'flex-start',
    paddingVertical: spacing.xxs,
    paddingHorizontal: 10,
    borderRadius: radii.pill,
  },
});
