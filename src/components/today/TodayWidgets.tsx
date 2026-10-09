import { useNavigation } from '@react-navigation/native';
import { useMemo, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { computeInsights, dayStats, energyBalance } from '../../domain/analytics';
import type { WidgetId } from '../../domain/dashboard';
import { dayOf, DOMAINS, selectShapingEvents } from '../../domain/events';
import { useWhoop } from '../../services/health/useWhoop';
import { useTodaySteps } from '../../services/steps';
import { useAppStore } from '../../state/AppStore';
import { spacing, useTheme } from '../../theme';
import { formatHours, toISODate } from '../../utils/time';
import { EnergyBalanceCard } from '../composite/EnergyBalanceCard';
import { StateIndicatorMeter } from '../composite/StateIndicatorMeter';
import { TimelineItem } from '../composite/TimelineItem';
import { Card, Chip, PressableScale, Text } from '../primitives';

function WidgetCard({ title, right, children }: { title: string; right?: ReactNode; children: ReactNode }) {
  return (
    <Card style={styles.card}>
      <View style={styles.cardHeader}>
        <Text variant="caption" tone="secondary" numberOfLines={1} style={styles.flex}>
          {title}
        </Text>
        {right}
      </View>
      {children}
    </Card>
  );
}

const insightTone = { PATTERN: 'focus', TRIGGER: 'energy', RECOVERY: 'calm', CHANGE: 'neutral', REFLECTION: 'neutral' } as const;

/**
 * Every Today card, keyed by id. A card is `null` when it has nothing to show, so a tied partner
 * can take the full row instead of leaving a gap.
 */
export function useTodayWidgets(): Record<WidgetId, ReactNode | null> {
  const { colors } = useTheme();
  const navigation = useNavigation();
  const { logs, ratings, setRating, inputs, health, journals } = useAppStore();
  const pedometerSteps = useTodaySteps(inputs.Motion && !inputs.Health);
  const today = toISODate(new Date());
  const whoop = useWhoop();

  const stats = useMemo(() => dayStats(today, logs.filter((e) => dayOf(e) === today), ratings[today]), [logs, ratings, today]);
  const balance = useMemo(() => energyBalance(stats.entries), [stats.entries]);
  const shaping = useMemo(() => selectShapingEvents(stats.entries.filter((e) => !e.isNote)), [stats.entries]);
  const insight = useMemo(() => computeInsights(logs, ratings, health)[0], [logs, ratings, health]);

  const todayHealth = inputs.Health ? health[today] : undefined;
  const steps = todayHealth?.steps ?? pedometerSteps;
  const timeSplit = DOMAINS.filter((d) => stats.hoursByDomain[d] > 0).sort((a, b) => stats.hoursByDomain[b] - stats.hoursByDomain[a]);
  const soFarRows: [string, string][] = [
    ...timeSplit.map((d): [string, string] => [d, formatHours(stats.hoursByDomain[d])]),
    ...(steps != null ? [['Steps', Math.round(steps).toLocaleString()] as [string, string]] : []),
    ...(todayHealth?.activeKcal != null ? [['Move', `${Math.round(todayHealth.activeKcal)} kcal`] as [string, string]] : []),
  ];

  return {
    ratings: (
      <Card style={styles.card}>
        <StateIndicatorMeter ratings={stats.ratings} onRate={(key, value) => setRating(today, key, value)} compact bare />
      </Card>
    ),

    insight: (
      <PressableScale haptic pressedScale={0.99} onPress={() => navigation.navigate('Insights')} style={styles.flex} accessibilityLabel="Open insights">
        <WidgetCard
          title="Insight"
          right={
            <Text variant="caption" tone="secondary">
              See all ›
            </Text>
          }
        >
          {insight ? (
            <>
              <Chip label={insight.type.charAt(0) + insight.type.slice(1).toLowerCase()} color={colors.state[insightTone[insight.type]]} />
              <Text variant="bodyMedium" numberOfLines={5}>
                {insight.headline}
              </Text>
              {insight.suggestedAction && (
                <PressableScale
                  hitSlop={6}
                  onPress={() => navigation.navigate('CopingSession', { action: insight.suggestedAction!.actionType })}
                  accessibilityLabel={insight.suggestedAction.label}
                >
                  <Text variant="caption" tone="calm" numberOfLines={2}>
                    {insight.suggestedAction.label} ›
                  </Text>
                </PressableScale>
              )}
            </>
          ) : (
            <Text variant="caption" tone="secondary">
              Patterns show up after a few days of ratings and logs.
            </Text>
          )}
        </WidgetCard>
      </PressableScale>
    ),

    // Full width; tapping it opens WHOOP & Health.
    todaySoFar: (
      <PressableScale haptic pressedScale={0.99} onPress={() => navigation.navigate('Health')} style={styles.flex} accessibilityLabel="Today so far. Open WHOOP and health details">
        <WidgetCard
          title="Today so far"
          right={
            <Text variant="caption" tone="secondary">
              {formatHours(stats.activeHours + stats.sleepHours)}
            </Text>
          }
        >
          {soFarRows.length > 0 ? (
            <View style={styles.soFarGrid}>
              {soFarRows.slice(0, 8).map(([label, value]) => (
                <View key={label} style={[styles.splitRow, styles.soFarCell]}>
                  <Text variant="caption" numberOfLines={1} style={styles.flex}>
                    {label}
                  </Text>
                  <Text variant="caption" tone="secondary" style={styles.num}>
                    {value}
                  </Text>
                </View>
              ))}
            </View>
          ) : (
            <Text variant="caption" tone="secondary">
              Nothing logged yet today.
            </Text>
          )}
          <View style={[styles.healthLine, { borderTopColor: colors.borderSubtle }]}>
            <Text variant="caption" tone="focus" numberOfLines={1} style={styles.flex}>
              {whoop.data?.recovery
                ? `♥ Recovery ${whoop.data.recovery.score}%${whoop.data.cycle ? ` · Strain ${whoop.data.cycle.strain.toFixed(1)}` : ''}${whoop.data.recovery ? ` · HRV ${whoop.data.recovery.hrvMs} ms` : ''}`
                : '♥ WHOOP & Health'}
            </Text>
            <Text variant="caption" tone="focus">
              ›
            </Text>
          </View>
        </WidgetCard>
      </PressableScale>
    ),

    energyBalance: (
      <View style={styles.section}>
        <Text variant="sectionTitle" accessibilityRole="header">
          Energy balance
        </Text>
        <EnergyBalanceCard balance={balance} period="today" />
      </View>
    ),

    whatShaped: (
      <View style={styles.section}>
        <View style={styles.sectionHead}>
          <Text variant="sectionTitle" accessibilityRole="header" style={styles.flex}>
            What shaped your day
          </Text>
          <PressableScale haptic onPress={() => navigation.navigate('Timeline')} accessibilityLabel="Open timeline" hitSlop={10}>
            <Text variant="caption" tone="focus">
              Timeline →
            </Text>
          </PressableScale>
        </View>
        {shaping.length > 0 ? (
          <View>
            {shaping.map((event, i) => (
              <TimelineItem
                key={event.id}
                event={event}
                isLast={i === shaping.length - 1}
                hasJournal={!!journals[event.id]}
                onPress={(e) => navigation.navigate('EventDetail', { eventId: e.id })}
              />
            ))}
          </View>
        ) : (
          <Card>
            <Text variant="body" tone="secondary">
              Nothing logged yet today. Log what you did and how it left you.
            </Text>
          </Card>
        )}
      </View>
    ),
  };
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    gap: spacing.xs,
    padding: spacing.sm + 2,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  flex: {
    flex: 1,
  },
  splitRow: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  num: {
    fontVariant: ['tabular-nums'],
  },
  section: {
    gap: spacing.sm,
  },
  soFarGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    columnGap: spacing.lg,
    rowGap: spacing.xxs,
  },
  soFarCell: {
    width: '46%',
    flexGrow: 1,
  },
  healthLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.xs,
    paddingTop: spacing.xs,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
});
