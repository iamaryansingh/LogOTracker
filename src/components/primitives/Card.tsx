import { StyleSheet, View, type ViewProps } from 'react-native';

import { radii, spacing, useTheme } from '../../theme';

export interface CardProps extends ViewProps {
  /** Optional background tint that replaces the default card surface. */
  tint?: string;
  padded?: boolean;
}

export function Card({ tint, padded = true, style, ...rest }: CardProps) {
  const { colors } = useTheme();
  return (
    <View
      style={[
        styles.card,
        { backgroundColor: tint ?? colors.bgCard, borderColor: colors.borderSubtle },
        padded && styles.padded,
        style,
      ]}
      {...rest}
    />
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radii.card,
    borderWidth: StyleSheet.hairlineWidth * 2,
    overflow: 'hidden',
  },
  padded: {
    padding: spacing.md,
  },
});
