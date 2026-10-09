import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import Animated, { FadeInDown, FadeOut } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useCapture } from '../components/composite/QuickCaptureBottomSheet';
import { describeWhen } from '../components/composite/NoteSuggestions';
import { ScreenHeader } from '../components/composite/ScreenHeader';
import { TaskRow } from '../components/composite/TaskRow';
import { Button, Card, Chip, StateChip, Text } from '../components/primitives';
import { dayOf, isCheckIn, outcomeOf } from '../domain/events';
import type { CalendarLink } from '../domain/types';
import type { RootStackParamList } from '../navigation/types';
import { appleNotesSupported, sendToAppleNotes } from '../services/appleNotes';
import { cancelAlarm } from '../services/alarms';
import { addCalendarEvent } from '../services/calendar';
import { canWriteJournal } from '../utils/device';
import { useMemories } from '../services/memories/MemoriesProvider';
import { useAppStore } from '../state/AppStore';
import { screenPadding, spacing, useTheme } from '../theme';
import { haptics } from '../utils/haptics';
import { formatClockRange, formatDayLabel, formatDuration } from '../utils/time';

export function EventDetailModal({ route, navigation }: NativeStackScreenProps<RootStackParamList, 'EventDetail'>) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { getLog, deleteLog, journals, tasks, saveLog, customMemories } = useAppStore();
  const { openLog } = useCapture();
  const { getMemory } = useMemories();
  const event = getLog(route.params.eventId);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  // Read once when the screen opens; enough to tell past alarms from upcoming ones.
  const [openedAt] = useState(() => Date.now());

  if (!event) {
    return (
      <View style={[styles.content, { flex: 1, backgroundColor: colors.bgSurface, paddingTop: spacing.lg }]}>
        <ScreenHeader title="Not found" caption="This entry was deleted." navAction={{ label: 'Close', onPress: navigation.goBack }} />
      </View>
    );
  }

  const { targetState, direction } = event.inferredStateImpact;
  const checkIn = isCheckIn(event);
  const isNote = event.isNote === true;
  const linkedTasks = (event.links?.taskIds ?? []).map((id) => tasks[id]).filter((t) => t !== undefined);
  const calendarLinks = event.links?.calendar ?? [];

  const retryCalendar = async (link: CalendarLink) => {
    const eventId = await addCalendarEvent({
      title: link.title,
      start: new Date(link.start),
      allDay: link.allDay,
      durationMinutes: 60,
      notes: `${link.line}\n\nAdded by Self Mirror from “${event.title}”.`,
    });
    if (!eventId) return;
    haptics.success();
    saveLog({
      ...event,
      links: { ...event.links, calendar: calendarLinks.map((c) => (c === link ? { ...c, status: 'added', eventId } : c)) },
    });
  };

  const when = checkIn || isNote
    ? `${formatDayLabel(dayOf(event))} · ${formatClockRange(event.timestampStart, event.timestampEnd)}`
    : `${formatDayLabel(dayOf(event))} · ${formatClockRange(event.timestampStart, event.timestampEnd)} · ${formatDuration(event.timestampStart, event.timestampEnd)}`;

  return (
    <ScrollView
      style={{ backgroundColor: colors.bgSurface }}
      contentContainerStyle={[styles.content, { paddingTop: spacing.lg, paddingBottom: insets.bottom + spacing.xl }]}
    >
      <ScreenHeader title={event.title} caption={when} navAction={{ label: 'Close', onPress: navigation.goBack }} />

      <View style={styles.tags}>
        <Chip label={isNote ? 'Note' : checkIn ? 'Check-in' : event.domain} color={colors.state.neutral} />
        {event.subtitle && !checkIn ? <Chip label={event.subtitle} color={colors.state.neutral} /> : null}
        {event.source === 'AUTO' && <Chip label="Imported from Health" color={colors.state.neutral} />}
      </View>

      {event.note ? (
        <Card style={styles.card}>
          <Text variant="caption" tone="secondary">
            {isNote ? 'Note' : 'Notes'}
          </Text>
          <Text variant="body" selectable>
            {event.note}
          </Text>
        </Card>
      ) : null}

      {event.note && appleNotesSupported ? (
        <Button
          label={event.links?.sentToNotesAt ? 'Save to Apple Notes again' : 'Save to Apple Notes'}
          variant="ghost"
          onPress={async () => {
            // Marked as saved when Shortcuts reports success.
            await sendToAppleNotes(event);
          }}
        />
      ) : null}

      {/* The log and Memories are one story: jump to the day this happened. */}
      {(getMemory(dayOf(event)) || Object.values(customMemories).some((m) => m.date === dayOf(event))) && (
        <Button
          label={event.id.startsWith('loc-') ? '📍 See this walk in Memories ›' : '📍 See this day in Memories ›'}
          variant="secondary"
          onPress={() => (getMemory(dayOf(event)) ? navigation.navigate('Memory', { date: dayOf(event) }) : navigation.navigate('Tabs', { screen: 'Memories' }))}
        />
      )}

      {(event.links?.alarms?.length ?? 0) > 0 && (
        <Card style={styles.card}>
          <Text variant="caption" tone="secondary">
            Alarms
          </Text>
          {event.links!.alarms!.map((a) => (
            <View key={a.line} style={styles.linkRow}>
              <View style={styles.flex}>
                <Text variant="bodyMedium">⏰ {a.title}</Text>
                <Text variant="caption" tone={a.status === 'set' ? 'stressLow' : 'secondary'}>
                  {a.status === 'set'
                    ? `Rings ${describeWhen(new Date(a.at), true)}`
                    : a.status === 'cancelled'
                      ? 'Cancelled'
                      : 'Not set: allow alarms in Settings, or this device needs iOS 26'}
                </Text>
              </View>
              {a.status === 'set' && a.alarmId && Date.parse(a.at) > openedAt && (
                <Button
                  label="Cancel"
                  variant="secondary"
                  style={styles.small}
                  onPress={async () => {
                    await cancelAlarm(a.alarmId!);
                    haptics.light();
                    saveLog({ ...event, links: { ...event.links, alarms: event.links!.alarms!.map((x) => (x === a ? { ...x, status: 'cancelled' } : x)) } });
                  }}
                />
              )}
            </View>
          ))}
        </Card>
      )}

      {calendarLinks.length > 0 && (
        <Card style={styles.card}>
          <Text variant="caption" tone="secondary">
            Calendar
          </Text>
          {calendarLinks.map((c) => (
            <View key={c.line} style={styles.linkRow}>
              <View style={styles.flex}>
                <Text variant="bodyMedium">{c.title}</Text>
                <Text variant="caption" tone={c.status === 'added' ? 'focus' : 'stressLow'}>
                  {c.status === 'added'
                    ? `In your calendar · ${describeWhen(new Date(c.start), !c.allDay)}`
                    : `Not added: Calendar access is off · ${describeWhen(new Date(c.start), !c.allDay)}`}
                </Text>
              </View>
              {c.status === 'failed' && <Button label="Try again" variant="secondary" style={styles.small} onPress={() => retryCalendar(c)} />}
            </View>
          ))}
        </Card>
      )}

      {linkedTasks.length > 0 && (
        <Card padded={false} style={styles.taskCard}>
          <Text variant="caption" tone="secondary" style={styles.taskHeader}>
            To-dos from this {isNote ? 'note' : 'entry'}
          </Text>
          {linkedTasks.map((t, i) => (
            <TaskRow key={t.id} task={t} isLast={i === linkedTasks.length - 1} />
          ))}
        </Card>
      )}

      {!isNote && (
        <Card style={styles.card}>
          <Text variant="caption" tone="secondary">
            {checkIn ? 'How you felt' : 'How it left you'}
          </Text>
          <StateChip category={targetState} direction={direction === 'INCREASE' ? 'UP' : direction === 'DECREASE' ? 'DOWN' : undefined} />
          <Text variant="body">
            {checkIn
              ? `You checked in: ${event.title.replace('Felt ', '')}.`
              : event.source === 'AUTO'
                ? `A first guess: ${outcomeOf(event).toLowerCase()}. Tap Edit to say how it actually left you.`
                : `You said this left you ${outcomeOf(event).toLowerCase()}.`}
          </Text>
        </Card>
      )}

      <Card style={styles.card}>
        <Text variant="caption" tone="secondary">
          Journal
        </Text>
        {journals[event.id] ? (
          <>
            {journals[event.id].text ? (
              <Text variant="body" numberOfLines={4}>
                {journals[event.id].text}
              </Text>
            ) : (
              <Text variant="body" tone="secondary">
                Handwritten page{journals[event.id].pages.filter((p) => p.length).length > 1 ? 's' : ''}
              </Text>
            )}
            <Button
              label={canWriteJournal ? 'Continue writing' : 'Read journal'}
              variant="secondary"
              onPress={() => navigation.navigate('JournalEntry', { logId: event.id })}
            />
          </>
        ) : canWriteJournal ? (
          <Button label="Write in journal" onPress={() => navigation.navigate('JournalEntry', { logId: event.id })} />
        ) : (
          <Text variant="body" tone="secondary">
            Nothing written yet. Open this entry on your iPad to journal about it.
          </Text>
        )}
      </Card>

      {!checkIn && !isNote && event.subtitle !== 'Recovery moment' && (
        <Button
          label="Edit"
          variant="secondary"
          onPress={() => {
            navigation.goBack();
            openLog({ event });
          }}
        />
      )}

      {confirmingDelete ? (
        <Animated.View entering={FadeInDown.duration(200)} exiting={FadeOut.duration(120)}>
          <Card style={styles.card}>
            <Text variant="bodyMedium" tone="stressHigh">
              Delete this entry?
            </Text>
            <View style={styles.row}>
              <Button label="Keep" variant="secondary" style={styles.flex} onPress={() => setConfirmingDelete(false)} />
              <Button
                label="Delete"
                style={[styles.flex, { backgroundColor: colors.state.stressHigh }]}
                onPress={() => {
                  haptics.warning();
                  navigation.goBack();
                  deleteLog(event.id);
                }}
              />
            </View>
          </Card>
        </Animated.View>
      ) : (
        <Button label="Delete" variant="ghost" onPress={() => setConfirmingDelete(true)} />
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: screenPadding,
    gap: spacing.md,
  },
  tags: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  card: {
    gap: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  small: {
    minHeight: 32,
    paddingHorizontal: spacing.sm,
  },
  taskCard: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
  },
  taskHeader: {
    marginBottom: spacing.xxs,
  },
  flex: {
    flex: 1,
  },
});
