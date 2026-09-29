import { StyleSheet, View } from 'react-native';

import type { ImpactDirection, SignalEvent } from '../../domain/types';
import { spacing, useTheme } from '../../theme';
import { formatClock, formatDuration } from '../../utils/time';
import { Card, PressableScale, StateChip, Text } from '../primitives';

const LOW_CONFIDENCE = 0.8;

const chipDirection: Record<ImpactDirection, 'UP' | 'DOWN' | undefined> = {
  INCREASE: 'UP',
  DECREASE: 'DOWN',
  NEUTRAL: undefined,
};

export interface TimelineItemProps {
  event: SignalEvent;
  onPress?: (event: SignalEvent) => void;
  isLast?: boolean;
}

export function TimelineItem({ event, onPress, isLast = false }: TimelineItemProps) {
  const { colors } = useTheme();
  const { targetState, direction } = event.inferredStateImpact;
  const showConfidence = event.confidenceScore < LOW_CONFIDENCE;
  const time = formatClock(event.timestampStart);
  const duration = formatDuration(event.timestampStart, event.timestampEnd);

  return (
    <View style={styles.row}>
      <View style={styles.rail}>
        <Text variant="caption" tone="secondary" style={styles.time}>
          {time}
        </Text>
        <View style={[styles.node, { borderColor: colors.textSecondary, backgroundColor: colors.bgSurface }]} />
        {!isLast && <View style={[styles.connector, { backgroundColor: colors.borderSubtle }]} />}
      </View>

      <PressableScale
        style={styles.pressable}
        onPress={onPress ? () => onPress(event) : undefined}
        disabled={!onPress}
        accessibilityLabel={`${time}, ${event.title}, ${duration}`}
      >
        <Card style={styles.card}>
          <Text variant="bodyMedium">{event.title}</Text>
          {event.subtitle ? (
            <Text variant="caption" tone="secondary">
              {event.subtitle}
            </Text>
          ) : null}
          <View style={styles.meta}>
            <StateChip category={targetState} direction={chipDirection[direction]} />
            <Text variant="caption" tone="secondary">
              {duration}
            </Text>
            {showConfidence && (
              <Text variant="caption" tone="secondary" style={styles.confidence}>
                ~{Math.round(event.confidenceScore * 100)}% sure
              </Text>
            )}
          </View>
        </Card>
      </PressableScale>
    </View>
  );
}

const RAIL_WIDTH = 48;
const NODE = 9;

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
  },
  rail: {
    width: RAIL_WIDTH,
    alignItems: 'center',
  },
  time: {
    marginTop: spacing.md,
    fontVariant: ['tabular-nums'],
  },
  node: {
    width: NODE,
    height: NODE,
    borderRadius: NODE / 2,
    borderWidth: 1.5,
    marginTop: spacing.xs,
  },
  connector: {
    width: 2,
    flex: 1,
    marginTop: spacing.xxs,
  },
  pressable: {
    flex: 1,
    paddingBottom: spacing.sm,
  },
  card: {
    gap: spacing.xxs,
  },
  meta: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  confidence: {
    opacity: 0.8,
  },
});
