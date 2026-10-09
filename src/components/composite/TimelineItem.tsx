import { StyleSheet, View } from 'react-native';

import { isPrevEveningSleep } from '../../domain/events';
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
  hasJournal?: boolean;
}

export function TimelineItem({ event, onPress, isLast = false, hasJournal = false }: TimelineItemProps) {
  const { colors } = useTheme();
  const { targetState, direction } = event.inferredStateImpact;
  const showConfidence = event.confidenceScore < LOW_CONFIDENCE;
  // A standalone note's first line is its title; the rest reads underneath.
  const noteRest = event.isNote ? event.note?.split('\n').slice(1).join(' ').trim() : undefined;
  // A night that began the evening before shows its full span, so it can't be mistaken for that evening.
  const prevEvening = isPrevEveningSleep(event);
  const time = prevEvening ? 'Night' : formatClock(event.timestampStart);
  const duration =
    event.timestampStart === event.timestampEnd ? 'Check-in' : formatDuration(event.timestampStart, event.timestampEnd);

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
          {prevEvening ? (
            <Text variant="caption" tone="secondary">
              {[event.subtitle, `${formatClock(event.timestampStart)} → ${formatClock(event.timestampEnd)}`].filter(Boolean).join(' · ')}
            </Text>
          ) : event.subtitle ? (
            <Text variant="caption" tone="secondary">
              {event.subtitle}
            </Text>
          ) : null}
          {event.note && !event.isNote ? (
            <Text variant="caption" tone="secondary" numberOfLines={2}>
              {event.note}
            </Text>
          ) : null}
          {event.isNote && noteRest ? (
            <Text variant="caption" tone="secondary" numberOfLines={3}>
              {noteRest}
            </Text>
          ) : null}
          <View style={styles.meta}>
            {event.isNote ? (
              <Text variant="caption" tone="secondary">
                Note
              </Text>
            ) : (
              <>
                <StateChip category={targetState} direction={chipDirection[direction]} />
                <Text variant="caption" tone="secondary">
                  {duration}
                </Text>
                {event.eventType === 'PRODUCER' && (
                  <Text variant="caption" tone="calm">
                    · gave energy
                  </Text>
                )}
                {event.eventType === 'CONSUMER' && (
                  <Text variant="caption" tone="stressLow">
                    · took energy
                  </Text>
                )}
              </>
            )}
            {(event.links?.calendar?.some((c) => c.status === 'added') ?? false) && (
              <Text variant="caption" tone="focus">
                · in calendar
              </Text>
            )}
            {(event.links?.taskIds?.length ?? 0) > 0 && (
              <Text variant="caption" tone="calm">
                · {event.links!.taskIds!.length} to-do{event.links!.taskIds!.length > 1 ? 's' : ''}
              </Text>
            )}
            {hasJournal && (
              <Text variant="caption" tone="focus">
                · journal
              </Text>
            )}
            {event.source === 'AUTO' && (
              <Text variant="caption" tone="secondary">
                · from Health
              </Text>
            )}
            {showConfidence && event.source !== 'AUTO' && (
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
