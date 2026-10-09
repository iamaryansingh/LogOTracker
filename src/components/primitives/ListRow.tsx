import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { spacing, useTheme } from '../../theme';
import { PressableScale } from './PressableScale';
import { Text } from './Text';

export interface ListRowProps {
  title: string;
  detail?: string;
  onPress?: () => void;
  right?: ReactNode;
  isLast?: boolean;
  tone?: 'primary' | 'stressHigh';
}

/** A row inside a Card. Rows with onPress get a chevron; otherwise pass `right` (e.g. a Switch). */
export function ListRow({ title, detail, onPress, right, isLast, tone = 'primary' }: ListRowProps) {
  const { colors } = useTheme();
  const content = (
    <View style={[styles.row, !isLast && { borderBottomColor: colors.borderSubtle, borderBottomWidth: StyleSheet.hairlineWidth * 2 }]}>
      <View style={styles.text}>
        <Text variant="body" tone={tone}>
          {title}
        </Text>
        {detail ? (
          <Text variant="caption" tone="secondary">
            {detail}
          </Text>
        ) : null}
      </View>
      {right ?? (onPress ? <Text tone="secondary">›</Text> : null)}
    </View>
  );

  if (!onPress) return content;
  return (
    <PressableScale haptic onPress={onPress} accessibilityLabel={title} pressedScale={0.99}>
      {content}
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    minHeight: 52,
  },
  text: {
    flex: 1,
    gap: 2,
  },
});
