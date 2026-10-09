import { StyleSheet, View } from 'react-native';

import { radii, spacing, useTheme } from '../../theme';
import { haptics } from '../../utils/haptics';
import { PressableScale } from './PressableScale';
import { Text } from './Text';

export interface SegmentedTabsProps<T extends string> {
  options: readonly T[];
  value: T;
  onChange: (value: T) => void;
  labels?: Partial<Record<T, string>>;
}

export function SegmentedTabs<T extends string>({ options, value, onChange, labels }: SegmentedTabsProps<T>) {
  const { colors } = useTheme();
  return (
    <View
      accessibilityRole="tablist"
      style={[styles.track, { backgroundColor: colors.bgCard, borderColor: colors.borderSubtle }]}
    >
      {options.map((option) => {
        const selected = option === value;
        return (
          <PressableScale
            key={option}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            pressedScale={0.96}
            onPress={() => {
              if (selected) return;
              haptics.selection();
              onChange(option);
            }}
            style={[styles.segment, selected && { backgroundColor: colors.bgSurface, borderColor: colors.borderSubtle }]}
          >
            <Text variant="caption" tone={selected ? 'primary' : 'secondary'}>
              {labels?.[option] ?? option}
            </Text>
          </PressableScale>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    flexDirection: 'row',
    padding: spacing.xxs,
    borderRadius: radii.pill,
    borderWidth: 1,
  },
  segment: {
    flex: 1,
    minHeight: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: 'transparent',
  },
});
