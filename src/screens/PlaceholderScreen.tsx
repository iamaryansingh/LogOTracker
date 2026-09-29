import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Text } from '../components/primitives';
import { screenPadding, spacing, useTheme } from '../theme';

/** Stand-in for tabs whose screens arrive in later sprints. */
export function PlaceholderScreen({ title, note }: { title: string; note: string }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.screen, { backgroundColor: colors.bgSurface, paddingTop: insets.top + spacing.lg }]}>
      <Text variant="headerLarge">{title}</Text>
      <Text variant="body" tone="secondary">
        {note}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    paddingHorizontal: screenPadding,
    gap: spacing.xs,
  },
});
