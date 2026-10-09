import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BarChart } from '../components/composite/BarChart';
import { EnergyBalanceCard } from '../components/composite/EnergyBalanceCard';
import { HorizontalBars } from '../components/composite/HorizontalBars';
import { ScreenHeader } from '../components/composite/ScreenHeader';
import { SimpleSparkline } from '../components/composite/SimpleSparkline';
import { Card, PressableScale, Text } from '../components/primitives';
import { energyBalance, weekHighlights, weekStats, type DayStats } from '../domain/analytics';
import { DOMAINS } from '../domain/events';
import type { RatingKey } from '../domain/types';
import type { RootStackParamList } from '../navigation/types';
import { useAppStore } from '../state/AppStore';
import { screenPadding, spacing, useTheme, type StateToken } from '../theme';
import { addDays, formatHours, fromISODate, shortWeekday } from '../utils/time';

const METRICS: { key: RatingKey; label: string; token: StateToken }[] = [
  { key: 'energy', label: 'Energy', token: 'energy' },
  { key: 'focus', label: 'Focus', token: 'focus' },
  { key: 'stress', label: 'Stress', token: 'stressLow' },
];

function trendPhrase(days: DayStats[], key: RatingKey): string {
  const vals = days.map((d) => d.ratings[key]).filter((v): v is NonNullable<typeof v> => v !== undefined);
  if (vals.length === 0) return 'Not rated yet';
  const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
  if (vals.length < 3) return `Averaging ${avg.toFixed(1)} of 5`;
  const half = Math.floor(vals.length / 2);
  const early = vals.slice(0, half).reduce((a, b) => a + b, 0) / half;
  const late = vals.slice(half).reduce((a, b) => a + b, 0) / (vals.length - half);
  const delta = late - early;
  const trend =
    Math.abs(delta) < 0.5 ? 'fairly steady' : key === 'stress' ? (delta > 0 ? 'appears to be building' : 'appears to be easing') : delta > 0 ? 'tending upward' : 'tending downward';
  return `Averaging ${avg.toFixed(1)}, ${trend}`;
}

function StatTile({ value, label }: { value: string; label: string }) {
  return (
    <Card style={styles.tile}>
      <Text variant="sectionTitle" numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
      <Text variant="caption" tone="secondary">
        {label}
      </Text>
    </Card>
  );
}

export function WeeklySummaryScreen({ navigation }: NativeStackScreenProps<RootStackParamList, 'WeeklySummary'>) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { logs, ratings, health } = useAppStore();
  const [weeksBack, setWeeksBack] = useState(0);

  const end = useMemo(() => addDays(new Date(), -7 * weeksBack), [weeksBack]);
  const week = useMemo(() => weekStats(logs, ratings, end), [logs, ratings, end]);
  const highlights = useMemo(() => weekHighlights(week), [week]);
  const balance = useMemo(() => energyBalance(week.flatMap((d) => d.entries)), [week]);

  const totalActive = week.reduce((s, d) => s + d.activeHours, 0);
  const daysLogged = week.filter((d) => d.hasData).length;
  const slept = week.filter((d) => d.sleepHours > 0);
  const avgSleep = slept.length ? slept.reduce((s, d) => s + d.sleepHours, 0) / slept.length : 0;

  const bars = week.map((d) => {
    const parts = DOMAINS.filter((k) => k !== 'Sleep' && d.hoursByDomain[k] > 0)
      .sort((a, b) => d.hoursByDomain[b] - d.hoursByDomain[a])
      .map((k) => `${k} ${formatHours(d.hoursByDomain[k])}`);
    return {
      key: d.date,
      label: shortWeekday(d.date),
      value: d.activeHours,
      valueLabel: d.activeHours > 0 ? formatHours(d.activeHours) : 'nothing logged',
      detail: parts.join(' · ') || undefined,
    };
  });

  const stepBars = week.map((d) => {
    const h = health[d.date];
    const extra = [h?.activeKcal != null && `Move ${Math.round(h.activeKcal)} kcal`, h?.exerciseMinutes != null && `Exercise ${Math.round(h.exerciseMinutes)} min`]
      .filter(Boolean)
      .join(' · ');
    return {
      key: d.date,
      label: shortWeekday(d.date),
      value: h?.steps ?? 0,
      valueLabel: h?.steps != null ? `${Math.round(h.steps).toLocaleString()} steps` : 'no data',
      detail: extra || undefined,
    };
  });
  const hasSteps = stepBars.some((b) => b.value > 0);
  const avgSteps = hasSteps ? stepBars.reduce((s2, b) => s2 + b.value, 0) / stepBars.filter((b) => b.value > 0).length : 0;

  const byDomain = DOMAINS.map((k) => ({ k, h: week.reduce((s, d) => s + d.hoursByDomain[k], 0) }))
    .filter((x) => x.h > 0)
    .sort((a, b) => b.h - a.h)
    .map((x) => ({ key: x.k, label: x.k, value: x.h, valueLabel: formatHours(x.h) }));

  const range = `${fromISODate(week[0].date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} – ${fromISODate(week[6].date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`;

  return (
    <ScrollView
      style={{ backgroundColor: colors.bgSurface }}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + spacing.lg, paddingBottom: insets.bottom + spacing.xl }]}
    >
      <ScreenHeader
        title={weeksBack === 0 ? 'This week' : weeksBack === 1 ? 'Last week' : `${weeksBack} weeks ago`}
        caption={range}
        navAction={{ label: 'Back', onPress: navigation.goBack }}
        right={
          <View style={styles.weekNav}>
            <PressableScale haptic onPress={() => setWeeksBack((w) => w + 1)} accessibilityLabel="Previous week" style={[styles.arrow, { borderColor: colors.borderSubtle }]}>
              <Text variant="sectionTitle">‹</Text>
            </PressableScale>
            <PressableScale
              haptic
              disabled={weeksBack === 0}
              onPress={() => setWeeksBack((w) => Math.max(0, w - 1))}
              accessibilityLabel="Next week"
              style={[styles.arrow, { borderColor: colors.borderSubtle, opacity: weeksBack === 0 ? 0.3 : 1 }]}
            >
              <Text variant="sectionTitle">›</Text>
            </PressableScale>
          </View>
        }
      />

      <View style={styles.tiles}>
        <StatTile value={formatHours(totalActive)} label="logged, excl. sleep" />
        <StatTile value={`${daysLogged} / 7`} label="days with entries" />
        <StatTile value={avgSleep > 0 ? formatHours(avgSleep) : '–'} label="average sleep" />
      </View>

      <View style={styles.section}>
        <Text variant="sectionTitle" accessibilityRole="header">
          Hours logged each day
        </Text>
        <Card>
          <BarChart data={bars} color={colors.state.focus} formatMax={formatHours} emptyHint="Log activities to see your days take shape." />
        </Card>
      </View>

      <View style={styles.section}>
        <Text variant="sectionTitle" accessibilityRole="header">
          Producers and consumers
        </Text>
        <EnergyBalanceCard balance={balance} period={weeksBack === 0 ? 'this week' : 'that week'} />
      </View>

      {hasSteps && (
        <View style={styles.section}>
          <Text variant="sectionTitle" accessibilityRole="header">
            Steps each day
          </Text>
          <Card>
            <BarChart
              data={stepBars}
              color={colors.state.energy}
              formatMax={(m) => `${Math.round(m).toLocaleString()} steps`}
            />
          </Card>
          <Text variant="caption" tone="secondary">
            About {Math.round(avgSteps).toLocaleString()} steps a day, from Health.
          </Text>
        </View>
      )}

      {byDomain.length > 0 && (
        <View style={styles.section}>
          <Text variant="sectionTitle" accessibilityRole="header">
            Where your time went
          </Text>
          <Card>
            <HorizontalBars data={byDomain} color={colors.state.calm} />
          </Card>
        </View>
      )}

      <View style={styles.section}>
        <Text variant="sectionTitle" accessibilityRole="header">
          How your days felt
        </Text>
        <Card style={styles.metrics}>
          {METRICS.map(({ key, label, token }) => {
            const values = week.map((d) => d.ratings[key] ?? null);
            return (
              <View key={key} style={styles.metricRow}>
                <View style={styles.metricText}>
                  <Text variant="bodyMedium">{label}</Text>
                  <Text variant="caption" tone="secondary">
                    {trendPhrase(week, key)}
                  </Text>
                </View>
                <View style={styles.spark}>
                  <SimpleSparkline
                    values={values}
                    color={colors.state[token]}
                    accessibilityLabel={`${label} ratings: ${week.map((d, i) => `${shortWeekday(d.date)} ${values[i] ?? 'none'}`).join(', ')}`}
                  />
                </View>
              </View>
            );
          })}
          <Text variant="caption" tone="secondary">
            From your daily ratings on Today. Gaps are days you didn’t rate.
          </Text>
        </Card>
      </View>

      <View style={styles.section}>
        <Text variant="sectionTitle" accessibilityRole="header">
          Worth noticing
        </Text>
        <Card style={styles.notes}>
          {highlights.length > 0 ? (
            highlights.map((note) => (
              <Text key={note} variant="body">
                {note}
              </Text>
            ))
          ) : (
            <Text variant="body" tone="secondary">
              Once you’ve logged a few days, the week’s highlights appear here.
            </Text>
          )}
        </Card>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: screenPadding,
    gap: spacing.lg,
  },
  weekNav: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  arrow: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tiles: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  tile: {
    flex: 1,
    gap: 2,
    paddingHorizontal: spacing.sm,
  },
  section: {
    gap: spacing.sm,
  },
  metrics: {
    gap: spacing.md,
  },
  metricRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  metricText: {
    flex: 1.2,
    gap: 2,
  },
  spark: {
    flex: 1,
  },
  notes: {
    gap: spacing.sm,
  },
});
