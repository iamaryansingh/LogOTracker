import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { spacing } from '../../theme';
import { PressableScale, Text } from '../primitives';

export interface ScreenHeaderProps {
  title: string;
  caption?: string;
  /** Renders a quiet text action above the title, e.g. "Back" or "Close". */
  navAction?: { label: string; onPress: () => void };
  right?: ReactNode;
}

export function ScreenHeader({ title, caption, navAction, right }: ScreenHeaderProps) {
  return (
    <View style={styles.container}>
      {navAction && (
        <PressableScale
          onPress={navAction.onPress}
          accessibilityLabel={navAction.label}
          hitSlop={12}
          style={styles.nav}
        >
          <Text variant="bodyMedium" tone="secondary">
            {navAction.label}
          </Text>
        </PressableScale>
      )}
      <View style={styles.row}>
        <View style={styles.text}>
          <Text variant="headerLarge" accessibilityRole="header">
            {title}
          </Text>
          {caption ? (
            <Text variant="caption" tone="secondary">
              {caption}
            </Text>
          ) : null}
        </View>
        {right}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.sm,
  },
  nav: {
    alignSelf: 'flex-start',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  text: {
    flexShrink: 1,
    gap: spacing.xxs,
  },
});
