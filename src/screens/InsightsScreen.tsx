import { useNavigation } from '@react-navigation/native';
import { useMemo, useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { InsightCard } from '../components/composite/InsightCard';
import { ScreenHeader } from '../components/composite/ScreenHeader';
import { SimpleSparkline } from '../components/composite/SimpleSparkline';
import { Card, PressableScale, SegmentedTabs, Text } from '../components/primitives';
import { computeInsights, daysWithData, weekStats } from '../domain/analytics';
import { useAppStore } from '../state/AppStore';
import type { CopingActionType, InsightType } from '../domain/types';
import { radii, screenPadding, spacing, useTheme, withAlpha, type StateToken } from '../theme';

const FILTERS = ['All', 'Patterns', 'Triggers', 'Recovery'] as const;
type Filter = (typeof FILTERS)[number];

const filterType: Record<Exclude<Filter, 'All'>, InsightType> = {
  Patterns: 'PATTERN',
  Triggers: 'TRIGGER',
  Recovery: 'RECOVERY',
};

const COPING: { action: CopingActionType; label: string; detail: string; token: StateToken }[] = [
  { action: 'BREATHE', label: 'Breathe', detail: '1 min', token: 'calm' },
  { action: 'WALK', label: 'Walk', detail: '10 min', token: 'energy' },
  { action: 'DISCONNECT', label: 'Disconnect', detail: '15 min', token: 'focus' },
];

export function InsightsScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const [filter, setFilter] = useState<Filter>('All');
  const { logs, ratings, health } = useAppStore();

  const all = useMemo(() => computeInsights(logs, ratings, health), [logs, ratings, health]);
  const insights = useMemo(() => (filter === 'All' ? all : all.filter((i) => i.type === filterType[filter])), [all, filter]);
  const week = useMemo(() => weekStats(logs, ratings, new Date()), [logs, ratings]);
  const weekHours = week.map((d) => d.activeHours);
  const loggedDays = daysWithData(logs, ratings);

  const startCoping = (action: CopingActionType) => navigation.navigate('CopingSession', { action });

  return (
    <View style={[styles.screen, { backgroundColor: colors.bgSurface }]}>
      <FlatList
        data={insights}
        keyExtractor={(i) => i.id}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.content, { paddingTop: insets.top + spacing.lg }]}
        ItemSeparatorComponent={() => <View style={{ height: spacing.sm }} />}
        ListHeaderComponent={
          <View style={styles.header}>
            <ScreenHeader title="Insights" caption="Gentle observations, not verdicts." navAction={{ label: 'Back', onPress: navigation.goBack }} />

            <PressableScale haptic onPress={() => navigation.navigate('WeeklySummary')} accessibilityLabel="Open this week’s summary">
              <Card style={styles.weekCard}>
                <View style={styles.weekText}>
                  <Text variant="bodyMedium">Your week</Text>
                  <Text variant="caption" tone="secondary">
                    {weekHours.some((h) => h > 0) ? 'Hours logged over the last 7 days ›' : 'Charts of your hours and ratings ›'}
                  </Text>
                </View>
                {weekHours.some((h) => h > 0) && (
                  <View style={styles.weekSpark}>
                    <SimpleSparkline
                      values={weekHours}
                      min={0}
                      max={Math.max(...weekHours)}
                      color={colors.state.focus}
                      height={32}
                    />
                  </View>
                )}
              </Card>
            </PressableScale>

            <View style={styles.coping}>
              <Text variant="caption" tone="secondary">
                Take a moment
              </Text>
              <View style={styles.copingRow}>
                {COPING.map(({ action, label, detail, token }) => (
                  <PressableScale
                    key={action}
                    haptic
                    pressedScale={0.96}
                    onPress={() => startCoping(action)}
                    accessibilityLabel={`${label}, ${detail}`}
                    style={[styles.copingPill, { backgroundColor: withAlpha(colors.state[token], 0.1) }]}
                  >
                    <Text variant="bodyMedium" style={{ color: colors.state[token] }}>
                      {label}
                    </Text>
                    <Text variant="caption" tone="secondary">
                      {detail}
                    </Text>
                  </PressableScale>
                ))}
              </View>
            </View>

            <SegmentedTabs options={FILTERS} value={filter} onChange={setFilter} />
          </View>
        }
        ListEmptyComponent={
          <Card style={styles.empty}>
            <Text variant="bodyMedium">
              {all.length === 0 ? 'Patterns are still forming' : 'Nothing in this group yet'}
            </Text>
            <Text variant="body" tone="secondary">
              Insights come only from what you log. A pattern needs to show up a few times before it’s mentioned. Rate your day
              and log activities with how they left you.
            </Text>
            <Text variant="caption" tone="secondary">
              {loggedDays === 0 ? 'No days logged yet' : `${loggedDays} ${loggedDays === 1 ? 'day' : 'days'} logged so far`}
            </Text>
          </Card>
        }
        renderItem={({ item }) => (
          <InsightCard
            insight={item}
            onActionPress={(i) => i.suggestedAction && startCoping(i.suggestedAction.actionType)}
          />
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  content: {
    paddingHorizontal: screenPadding,
    paddingBottom: spacing.xl,
  },
  header: {
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  weekCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  weekText: {
    flex: 1,
    gap: spacing.xxs,
  },
  weekSpark: {
    width: 88,
  },
  coping: {
    gap: spacing.xs,
  },
  empty: {
    gap: spacing.sm,
  },
  copingRow: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  copingPill: {
    flex: 1,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    borderRadius: radii.card - 4,
    gap: 2,
  },
});
