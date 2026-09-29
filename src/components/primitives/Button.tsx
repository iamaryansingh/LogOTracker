import { StyleSheet, type StyleProp, type ViewStyle } from 'react-native';

import { radii, spacing, useTheme } from '../../theme';
import { PressableScale } from './PressableScale';
import { Text } from './Text';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost';

export interface ButtonProps {
  label: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  style?: StyleProp<ViewStyle>;
  disabled?: boolean;
}

export function Button({ label, onPress, variant = 'primary', style, disabled }: ButtonProps) {
  const { colors } = useTheme();

  const surface: ViewStyle =
    variant === 'primary'
      ? { backgroundColor: colors.textPrimary }
      : variant === 'secondary'
        ? { backgroundColor: colors.bgCard, borderColor: colors.borderSubtle, borderWidth: 1 }
        : { backgroundColor: 'transparent' };

  return (
    <PressableScale
      haptic
      disabled={disabled}
      onPress={onPress}
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      style={[styles.base, surface, disabled && styles.disabled, style]}
    >
      <Text variant="bodyMedium" style={variant === 'primary' ? { color: colors.bgSurface } : undefined}>
        {label}
      </Text>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: 48,
    paddingHorizontal: spacing.lg,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  disabled: {
    opacity: 0.4,
  },
});
