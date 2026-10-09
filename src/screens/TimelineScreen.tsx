import { useNavigation } from '@react-navigation/native';
import { FlashList } from '@shopify/flash-list';
import { useCallback, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useCapture } from '../components/composite/QuickCaptureBottomSheet';
import { ScreenHeader } from '../components/composite/ScreenHeader';
import { TaskRow } from '../components/composite/TaskRow';
import { TimelineItem } from '../components/composite/TimelineItem';
import { Button, Card, PressableScale, Text } from '../components/primitives';
import { dayStats } from '../domain/analytics';
import { blockOf, byStart, DAY_BLOCKS, dayOf, type DayBlock } from '../domain/events';
import { bucketOf, dueDay, sortTasks } from '../domain/tasks';
import type { SignalEvent } from '../domain/types';
import { useAppStore } from '../state/AppStore';
import { screenPadding, spacing, useTheme } from '../theme';
import { addDays, formatDayLabel, formatHours, fromISODate, toISODate } from '../utils/time';

type Row =
  | { kind: 'header'; key: string; block: DayBlock; count: number }
  | { kind: 'entry'; key: string; event: SignalEvent; isLast: boolean };

function buildRows(events: SignalEvent[]): Row[] {
  const rows: Row[] = [];
  for (const block of DAY_BLOCKS) {
    const inBlock = events.filter((e) => blockOf(e) === block);
    if (inBlock.length === 0) continue;
    rows.push({ kind: 'header', key: `h-${block}`, block, count: inBlock.length });
    inBlock.forEach((event, i) => rows.push({ kind: 'entry', key: event.id, event, isLast: i === inBlock.length - 1 }));
  }
  return rows;
}

function DayArrow({ label, onPress, disabled }: { label: string; onPress: () => void; disabled?: boolean }) {
  const { colors } = useTheme();
  return (
    <PressableScale
      haptic
      disabled={disabled}
      onPress={onPress}
      accessibilityLabel={label === '‹' ? 'Previous day' : 'Next day'}
      style={[styles.arrow, { borderColor: colors.borderSubtle, opacity: disabled ? 0.3 : 1 }]}
    >
      <Text variant="sectionTitle">{label}</Text>
    </PressableScale>
  );
}

export function TimelineScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const { openLog, openNote } = useCapture();
  const { logs, ratings, journals, tasks } = useAppStore();
  const today = toISODate(new Date());
  const [day, setDay] = useState(today);

  const entries = useMemo(() => logs.filter((e) => dayOf(e) === day).sort(byStart), [logs, day]);
  const rows = useMemo(() => buildRows(entries), [entries]);
  const stats = useMemo(() => dayStats(day, entries, ratings[day]), [day, entries, ratings]);
  const dayTasks = useMemo(
    () =>
      sortTasks(
        Object.values(tasks).filter((t) => dueDay(t) === day || (day === today && !t.done && bucketOf(t, today) === 'Overdue')),
      ),
    [tasks, day, today],
  );
  const shift = (n: number) => setDay(toISODate(addDays(fromISODate(day), n)));

  const openEvent = useCallback((event: SignalEvent) => navigation.navigate('EventDetail', { eventId: event.id }), [navigation]);

  const renderItem = useCallback(
    ({ item }: { item: Row }) =>
      item.kind === 'header' ? (
        <View style={styles.blockHeader}>
          <Text variant="sectionTitle" accessibilityRole="header">
            {item.block}
          </Text>
          <Text variant="caption" tone="secondary">
            {item.count} {item.count === 1 ? 'entry' : 'entries'}
          </Text>
        </View>
      ) : (
        <TimelineItem event={item.event} isLast={item.isLast} onPress={openEvent} hasJournal={!!journals[item.event.id]} />
      ),
    [openEvent, journals],
  );

  const summary =
    entries.length === 0
      ? 'Nothing logged'
      : [`${entries.length} ${entries.length === 1 ? 'entry' : 'entries'}`, stats.activeHours > 0 && `${formatHours(stats.activeHours)} active`, stats.sleepHours > 0 && `${formatHours(stats.sleepHours)} sleep`]
          .filter(Boolean)
          .join(' · ');

  return (
    <View style={[styles.screen, { backgroundColor: colors.bgSurface }]}>
      <FlashList
        data={rows}
        renderItem={renderItem}
        keyExtractor={(row) => row.key}
        getItemType={(row) => row.kind}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingTop: insets.top + spacing.lg, paddingHorizontal: screenPadding, paddingBottom: spacing.xl }}
        ListHeaderComponent={
          <View style={styles.header}>
            <ScreenHeader
              title="Timeline"
              caption={summary}
              navAction={navigation.canGoBack() ? { label: '‹ Today', onPress: navigation.goBack } : undefined}
              right={
                <View style={styles.headerButtons}>
                  <Button label="+ Note" variant="secondary" onPress={() => openNote(day)} style={styles.logButton} />
                  <Button label="+ Log" variant="secondary" onPress={() => openLog({ day })} style={styles.logButton} />
                </View>
              }
            />
            <View style={styles.dayNav}>
              <DayArrow label="‹" onPress={() => shift(-1)} />
              <Text variant="bodyMedium" style={styles.dayLabel}>
                {formatDayLabel(day)}
              </Text>
              <DayArrow label="›" onPress={() => shift(1)} />
            </View>
            {dayTasks.length > 0 && (
              <View style={styles.todo}>
                <Text variant="sectionTitle" accessibilityRole="header">
                  To do
                </Text>
                <Card padded={false} style={styles.todoCard}>
                  {dayTasks.map((t, i) => (
                    <TaskRow key={t.id} task={t} isLast={i === dayTasks.length - 1} onOpenSource={(id) => navigation.navigate('EventDetail', { eventId: id })} />
                  ))}
                </Card>
              </View>
            )}
          </View>
        }
        ListEmptyComponent={
          <Card style={styles.empty}>
            <Text variant="body" tone="secondary">
              {day === today
                ? 'Your day is empty so far. Log activities as you go, or fill in the day this evening.'
                : day > today
                  ? 'Nothing logged for this day yet. Add a note or reminder for it.'
                  : 'Nothing was logged this day. You can still add what you remember.'}
            </Text>
            <Button label="Log an activity" onPress={() => openLog({ day })} />
          </Card>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  header: {
    gap: spacing.md,
    marginBottom: spacing.xs,
  },
  headerButtons: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  todo: {
    gap: spacing.sm,
  },
  todoCard: {
    paddingHorizontal: spacing.md,
  },
  logButton: {
    minHeight: 36,
    paddingHorizontal: spacing.md,
  },
  dayNav: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  dayLabel: {
    flex: 1,
    textAlign: 'center',
  },
  arrow: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  blockHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    paddingTop: spacing.lg,
    paddingBottom: spacing.sm,
  },
  empty: {
    gap: spacing.md,
    marginTop: spacing.md,
  },
});
