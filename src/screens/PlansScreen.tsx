import { useNavigation } from '@react-navigation/native';
import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { describeWhen } from '../components/composite/NoteSuggestions';
import { useCapture } from '../components/composite/QuickCaptureBottomSheet';
import { ScreenHeader } from '../components/composite/ScreenHeader';
import { AlarmsCard } from '../components/plans/AlarmsCard';
import { TaskRow } from '../components/composite/TaskRow';
import { Button, Card, PressableScale, SegmentedTabs, Text } from '../components/primitives';
import { parseNote } from '../domain/notes';
import { agenda, type PlanItem } from '../domain/plans';
import { groupTasks, TASK_BUCKETS } from '../domain/tasks';
import { entryContext, whenLabel } from '../services/appleNotes';
import { taskFromItem } from '../services/noteActions';
import { addReminder, REMINDERS_LIST } from '../services/reminders';
import { useAppStore } from '../state/AppStore';
import { radii, screenPadding, spacing, typography, useTheme } from '../theme';
import { haptics } from '../utils/haptics';
import { formatDayLabel, toISODate } from '../utils/time';

const VIEWS = ['Upcoming', 'To-dos', 'Notes'] as const;
type PlansView = (typeof VIEWS)[number];

export function PlansScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { openNote } = useCapture();
  const [view, setView] = useState<PlansView>('Upcoming');

  return (
    <View style={[styles.screen, { backgroundColor: colors.bgSurface }]}>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.content, { paddingTop: insets.top + spacing.lg, paddingBottom: spacing.xl }]}
      >
        <ScreenHeader
          title="Plans"
          caption="What’s coming up, what to do, and what you noted."
          right={<Button label="+ Note" variant="secondary" onPress={() => openNote()} style={styles.headerButton} />}
        />
        <SegmentedTabs options={VIEWS} value={view} onChange={setView} />
        {view === 'Upcoming' && <AlarmsCard />}
        {view === 'Upcoming' && <UpcomingPanel />}
        {view === 'To-dos' && <TodoPanel />}
        {view === 'Notes' && <NotesPanel />}
      </ScrollView>
    </View>
  );
}

// ---- Upcoming ----------------------------------------------------------------------------

function EventRow({ item, isLast }: { item: PlanItem; isLast: boolean }) {
  const { colors } = useTheme();
  const navigation = useNavigation();
  return (
    <PressableScale
      disabled={!item.sourceLogId}
      pressedScale={0.99}
      onPress={() => item.sourceLogId && navigation.navigate('EventDetail', { eventId: item.sourceLogId })}
      accessibilityLabel={`${item.title}, ${describeWhen(item.at, item.hasTime)}`}
      style={[styles.eventRow, !isLast && { borderBottomColor: colors.borderSubtle, borderBottomWidth: StyleSheet.hairlineWidth * 2 }]}
    >
      <View style={[styles.eventBar, { backgroundColor: item.kind === 'alarm' ? colors.state.stressLow : colors.state.focus }]} />
      <View style={styles.flex}>
        <Text variant="body">{item.title}</Text>
        <Text variant="caption" tone="secondary">
          {item.hasTime ? item.at.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }) : 'All day'} · {item.kind === 'alarm' ? 'Alarm' : 'Calendar'}
        </Text>
      </View>
    </PressableScale>
  );
}

function UpcomingPanel() {
  const navigation = useNavigation();
  const { logs, tasks } = useAppStore();
  const days = useMemo(() => {
    const groups = new Map<string, PlanItem[]>();
    for (const item of agenda(logs, Object.values(tasks))) {
      const day = toISODate(item.at);
      groups.set(day, [...(groups.get(day) ?? []), item]);
    }
    return [...groups.entries()];
  }, [logs, tasks]);

  if (days.length === 0) {
    return (
      <Card>
        <Text variant="body" tone="secondary">
          Nothing scheduled. When a note mentions a date, like “next meet is on 26 at 3pm”, it lands here and in your
          Calendar.
        </Text>
      </Card>
    );
  }
  return (
    <>
      {days.map(([day, items]) => (
        <View key={day} style={styles.section}>
          <Text variant="sectionTitle" accessibilityRole="header">
            {formatDayLabel(day)}
          </Text>
          <Card padded={false} style={styles.group}>
            {items.map((item, i) =>
              item.kind === 'task' && item.task ? (
                <TaskRow key={item.key} task={item.task} isLast={i === items.length - 1} onOpenSource={(id) => navigation.navigate('EventDetail', { eventId: id })} />
              ) : (
                <EventRow key={item.key} item={item} isLast={i === items.length - 1} />
              ),
            )}
          </Card>
        </View>
      ))}
    </>
  );
}

// ---- To-dos ------------------------------------------------------------------------------

const DONE_SHOWN = 15;

function TodoPanel() {
  const { colors } = useTheme();
  const navigation = useNavigation();
  const { tasks, saveTasks, deleteTasks, remindersSync, linkReminders } = useAppStore();
  const [draft, setDraft] = useState('');
  const groups = useMemo(() => groupTasks(Object.values(tasks)), [tasks]);
  const open = Object.values(tasks).filter((t) => !t.done).length;

  // A typed to-do can carry its own date: "Pay rent on the 1st".
  const parsed = useMemo(() => {
    const item = parseNote(draft)[0];
    if (!item) return null;
    if (item.kind === 'task') return item;
    return {
      kind: 'task' as const,
      line: item.line,
      text: item.kind === 'event' ? item.title : item.line,
      due: item.kind === 'event' ? item.start : undefined,
      dueHasTime: item.kind === 'event' ? !item.allDay : false,
    };
  }, [draft]);

  const add = async () => {
    if (!parsed) return;
    const task = taskFromItem(parsed);
    saveTasks([task]);
    setDraft('');
    haptics.success();
    if (remindersSync) {
      const rid = await addReminder(task);
      if (rid) linkReminders({ [task.id]: rid });
    }
  };

  return (
    <>
      <Card style={styles.addCard}>
        <TextInput
          value={draft}
          onChangeText={setDraft}
          onSubmitEditing={add}
          returnKeyType="done"
          placeholder="Add a to-do, e.g. “Pay rent on the 1st”"
          placeholderTextColor={colors.textSecondary}
          style={[typography.body, styles.input, { color: colors.textPrimary, borderColor: colors.borderSubtle, backgroundColor: colors.bgSurface }]}
        />
        {parsed?.due && (
          <Text variant="caption" tone="secondary">
            Due {describeWhen(parsed.due, parsed.dueHasTime)}
          </Text>
        )}
        <Button label="Add" disabled={!draft.trim()} onPress={add} />
        {remindersSync && (
          <Text variant="caption" tone="secondary">
            Also kept in your “{REMINDERS_LIST}” list in Reminders, so they show on your iPad too.
          </Text>
        )}
      </Card>

      {open === 0 && groups.Done.length === 0 && (
        <Text variant="body" tone="secondary">
          Nothing to do yet. To-dos also appear on their own when a note says “need to…”, “send…”, “- [ ] …”.
        </Text>
      )}

      {TASK_BUCKETS.map((bucket) => {
        const list = bucket === 'Done' ? groups.Done.slice(0, DONE_SHOWN) : groups[bucket];
        if (list.length === 0) return null;
        return (
          <View key={bucket} style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text variant="sectionTitle" accessibilityRole="header" tone={bucket === 'Overdue' ? 'stressHigh' : 'primary'}>
                {bucket}
              </Text>
              {bucket === 'Done' && (
                <Button label="Clear done" variant="ghost" style={styles.small} onPress={() => deleteTasks(groups.Done.map((t) => t.id))} />
              )}
            </View>
            <Card padded={false} style={styles.group}>
              {list.map((t, i) => (
                <TaskRow key={t.id} task={t} isLast={i === list.length - 1} onOpenSource={(id) => navigation.navigate('EventDetail', { eventId: id })} />
              ))}
            </Card>
          </View>
        );
      })}
    </>
  );
}

// ---- Notes -------------------------------------------------------------------------------

function NotesPanel() {
  const { colors } = useTheme();
  const navigation = useNavigation();
  const { logs } = useAppStore();
  const notes = useMemo(() => [...logs].filter((l) => l.note?.trim()).reverse(), [logs]);

  if (notes.length === 0) {
    return (
      <Card>
        <Text variant="body" tone="secondary">
          Notes you add to entries, and notes from “+ Note”, collect here.
        </Text>
      </Card>
    );
  }
  return (
    <View style={styles.section}>
      {notes.map((n) => {
        const body = n.isNote ? n.note!.split('\n').slice(1).join(' ').trim() : n.note!;
        const events = n.links?.calendar?.filter((c) => c.status === 'added').length ?? 0;
        const todos = n.links?.taskIds?.length ?? 0;
        return (
          <PressableScale key={n.id} haptic pressedScale={0.99} onPress={() => navigation.navigate('EventDetail', { eventId: n.id })} accessibilityLabel={entryContext(n)}>
            <Card style={styles.noteCard}>
              <Text variant="caption" tone="secondary">
                {whenLabel(n.timestampStart)}
                {n.isNote ? '' : ` · ${n.domain}`}
              </Text>
              <Text variant="bodyMedium">{n.title}</Text>
              {body ? (
                <Text variant="body" tone="secondary" numberOfLines={3}>
                  {body}
                </Text>
              ) : null}
              {(events > 0 || todos > 0 || n.links?.sentToNotesAt) && (
                <Text variant="caption" style={{ color: colors.state.focus }}>
                  {[events > 0 && `${events} in calendar`, todos > 0 && `${todos} to-do${todos > 1 ? 's' : ''}`, n.links?.sentToNotesAt && 'in Apple Notes']
                    .filter(Boolean)
                    .join(' · ')}
                </Text>
              )}
            </Card>
          </PressableScale>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  content: {
    paddingHorizontal: screenPadding,
    gap: spacing.lg,
  },
  headerButton: {
    minHeight: 36,
    paddingHorizontal: spacing.md,
  },
  section: {
    gap: spacing.sm,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  group: {
    paddingHorizontal: spacing.md,
  },
  eventRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
  },
  eventBar: {
    width: 4,
    alignSelf: 'stretch',
    borderRadius: 2,
    marginVertical: 2,
    marginHorizontal: 10,
  },
  flex: {
    flex: 1,
    gap: 2,
  },
  addCard: {
    gap: spacing.sm,
  },
  input: {
    minHeight: 44,
    borderWidth: 1,
    borderRadius: radii.chip,
    paddingHorizontal: spacing.sm,
  },
  small: {
    minHeight: 32,
    paddingHorizontal: spacing.xs,
  },
  noteCard: {
    gap: spacing.xxs,
  },
});
