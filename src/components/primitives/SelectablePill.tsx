import { StyleSheet } from 'react-native';

import { radii, spacing, useTheme, withAlpha } from '../../theme';
import { haptics } from '../../utils/haptics';
import { PressableScale } from './PressableScale';
import { Text } from './Text';

export interface SelectablePillProps {
  label: string;
  selected: boolean;
  onPress: () => void;
  /** Token color used when selected; defaults to primary text. */
  color?: string;
}

export function SelectablePill({ label, selected, onPress, color }: SelectablePillProps) {
  const { colors } = useTheme();
  const accent = color ?? colors.textPrimary;
  return (
    <PressableScale
      pressedScale={0.95}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={label}
      onPress={() => {
        haptics.selection();
        onPress();
      }}
      style={[
        styles.pill,
        selected
          ? { backgroundColor: withAlpha(accent, 0.12), borderColor: accent }
          : { backgroundColor: colors.bgCard, borderColor: colors.borderSubtle },
      ]}
    >
      <Text variant="caption" style={selected ? { color: accent } : undefined} tone={selected ? undefined : 'secondary'}>
        {label}
      </Text>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  pill: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderRadius: radii.pill,
    borderWidth: 1,
    minHeight: 36,
    justifyContent: 'center',
  },
});
