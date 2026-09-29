import { StyleSheet, View } from 'react-native';

import type { CopingActionType, InsightCardData, InsightType } from '../../domain/types';
import { spacing, useTheme, withAlpha, type StateToken } from '../../theme';
import { Card, Chip, PressableScale, Text } from '../primitives';

const typeToken: Record<InsightType, StateToken> = {
  PATTERN: 'focus',
  TRIGGER: 'energy',
  RECOVERY: 'calm',
  CHANGE: 'neutral',
  REFLECTION: 'neutral',
};

const typeLabel: Record<InsightType, string> = {
  PATTERN: 'Pattern',
  TRIGGER: 'Trigger',
  RECOVERY: 'Recovery',
  CHANGE: 'Change',
  REFLECTION: 'Reflection',
};

const actionGlyph: Record<CopingActionType, string> = {
  WALK: '🚶',
  BREATHE: '🌬️',
  DISCONNECT: '📵',
};

export interface InsightCardProps {
  insight: InsightCardData;
  onActionPress?: (insight: InsightCardData) => void;
}

export function InsightCard({ insight, onActionPress }: InsightCardProps) {
  const { colors } = useTheme();
  const token = colors.state[typeToken[insight.type]];
  // Only recovery and trigger insights carry a surface tint; the rest stay on the plain card.
  const tint = insight.type === 'RECOVERY' || insight.type === 'TRIGGER' ? withAlpha(token, 0.08) : undefined;
  const { suggestedAction } = insight;

  return (
    <Card tint={tint} padded={false}>
      <View style={styles.content}>
        <Chip label={typeLabel[insight.type]} color={token} />
        <Text variant="sectionTitle">{insight.headline}</Text>
        <Text variant="body" tone="secondary">
          {insight.body}
        </Text>
        <Text variant="caption" tone="secondary">
          Observed across {insight.evidenceCount} similar {insight.evidenceCount === 1 ? 'event' : 'events'}
        </Text>
      </View>

      {suggestedAction && (
        <>
          <View style={[styles.divider, { backgroundColor: colors.borderSubtle }]} />
          <PressableScale
            haptic
            style={styles.action}
            onPress={onActionPress ? () => onActionPress(insight) : undefined}
            disabled={!onActionPress}
            accessibilityLabel={`Suggested action: ${suggestedAction.label}`}
          >
            <Text variant="caption" tone="secondary">
              Suggested action
            </Text>
            <Text variant="bodyMedium">
              {actionGlyph[suggestedAction.actionType]}  {suggestedAction.label}
            </Text>
          </PressableScale>
        </>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: spacing.md,
    gap: spacing.xs,
  },
  divider: {
    height: StyleSheet.hairlineWidth * 2,
    marginHorizontal: spacing.md,
  },
  action: {
    padding: spacing.md,
    gap: spacing.xxs,
  },
});
