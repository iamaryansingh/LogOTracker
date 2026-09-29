import { useMemo } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { DaySummaryHeader } from '../components/composite/DaySummaryHeader';
import { InsightCard } from '../components/composite/InsightCard';
import { StateIndicatorMeter } from '../components/composite/StateIndicatorMeter';
import { TimelineItem } from '../components/composite/TimelineItem';
import { Button, Text } from '../components/primitives';
import { todaySummary } from '../data/mockToday';
import type { DailySummary } from '../domain/types';
import { screenPadding, spacing, useTheme } from '../theme';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text variant="sectionTitle" accessibilityRole="header">
        {title}
      </Text>
      {children}
    </View>
  );
}

export interface TodayScreenProps {
  summary?: DailySummary;
}

export function TodayScreen({ summary = todaySummary }: TodayScreenProps) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const now = useMemo(() => new Date(), []);
  const events = summary.shapingEvents;

  return (
    <View style={[styles.screen, { backgroundColor: colors.bgSurface }]}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: insets.top + spacing.lg }]}
        showsVerticalScrollIndicator={false}
      >
        <DaySummaryHeader now={now} load={summary.overallLoad} />

        <StateIndicatorMeter metrics={summary.metrics} />

        <Section title="What shaped your day">
          {events.length > 0 ? (
            <View>
              {events.map((event, i) => (
                <TimelineItem key={event.id} event={event} isLast={i === events.length - 1} />
              ))}
            </View>
          ) : (
            <Text variant="body" tone="secondary">
              Nothing notable yet. Your day will fill in as it unfolds.
            </Text>
          )}
        </Section>

        {summary.primaryInsight && (
          <Section title="One thing I noticed">
            <InsightCard insight={summary.primaryInsight} />
          </Section>
        )}
      </ScrollView>

      <View style={[styles.footer, { backgroundColor: colors.bgSurface, borderTopColor: colors.borderSubtle }]}>
        {/* Opens QuickCaptureBottomSheet once it lands in Sprint 2. */}
        <Button label="How are you feeling?" />
      </View>
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
    gap: spacing.lg,
  },
  section: {
    gap: spacing.sm,
  },
  footer: {
    paddingHorizontal: screenPadding,
    paddingVertical: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
});
