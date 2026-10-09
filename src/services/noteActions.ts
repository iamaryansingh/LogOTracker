import { useCallback } from 'react';

import { durationHours } from '../domain/events';
import { NOTES_ROW, type NoteItem } from '../domain/notes';
import type { AlarmLink, CalendarLink, SignalEvent, Task } from '../domain/types';
import { useAppStore } from '../state/AppStore';
import { haptics } from '../utils/haptics';
import { appleNotesSupported, entryContext, sendToAppleNotes, whenLabel } from './appleNotes';
import { setAlarm } from './alarms';
import { addCalendarEvent } from './calendar';
import { addReminder } from './reminders';

const newTaskId = () => `task-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

export function taskFromItem(item: Extract<NoteItem, { kind: 'task' }>, sourceLogId?: string): Task {
  return {
    id: newTaskId(),
    text: item.text,
    sourceLine: item.line !== item.text ? item.line : undefined,
    due: item.due?.toISOString(),
    dueHasTime: item.dueHasTime,
    done: false,
    sourceLogId,
    createdAt: new Date().toISOString(),
  };
}

/**
 * Saves an entry together with what its note asked for: tasks right away, calendar events as
 * soon as the calendar answers. Lines already handled on an earlier save are never re-created.
 */
export function useNoteActions() {
  const { saveLog, saveTasks, linkReminders, remindersSync, appleNotes } = useAppStore();

  return useCallback(
    async (entry: SignalEvent, accepted: NoteItem[]) => {
      const handled = new Set(entry.links?.handledLines ?? []);
      const fresh = accepted.filter((i) => i.kind !== 'note' && !handled.has(i.line));

      const tasks = fresh.filter((i): i is Extract<NoteItem, { kind: 'task' }> => i.kind === 'task').map((i) => taskFromItem(i, entry.id));
      if (tasks.length) saveTasks(tasks);

      const events = fresh.filter((i): i is Extract<NoteItem, { kind: 'event' }> => i.kind === 'event');
      const alarms = fresh.filter((i): i is Extract<NoteItem, { kind: 'alarm' }> => i.kind === 'alarm');
      const links = {
        ...entry.links,
        taskIds: [...(entry.links?.taskIds ?? []), ...tasks.map((t) => t.id)],
        handledLines: [...handled, ...fresh.map((i) => i.line)],
      };
      // The note-like lines go to Apple Notes, like dates go to Calendar and to-dos to Reminders.
      // Only a note's first save is sent; edits stay in the app.
      const noteLines = accepted.filter((i) => i.kind === 'note').map((i) => i.line);
      // It's marked as saved only when Shortcuts reports success (see NotesResultBanner).
      const toNotes =
        appleNotes && appleNotesSupported && noteLines.length > 0 && !entry.links?.sentToNotesAt && !handled.has(NOTES_ROW);

      // Save first so the entry appears immediately; calendar and Reminders results are filled in after.
      saveLog({ ...entry, links });

      if (remindersSync && tasks.length) {
        const linked: Record<string, string> = {};
        for (const t of tasks) {
          const rid = await addReminder(t, { from: entryContext(entry), line: t.sourceLine });
          if (rid) linked[t.id] = rid;
        }
        if (Object.keys(linked).length) linkReminders(linked);
      }

      if (alarms.length) {
        const set: AlarmLink[] = [...(entry.links?.alarms ?? [])];
        for (const a of alarms) {
          const r = await setAlarm(a.at, a.title);
          set.push({ line: a.line, title: a.title, at: a.at.toISOString(), status: r.ok ? 'set' : 'failed', alarmId: r.ok ? r.alarmId : undefined });
        }
        links.alarms = set;
        saveLog({ ...entry, links });
        if (set.some((x) => x.status === 'set')) haptics.success();
      }

      // A follow-up meeting usually runs as long as the session it came from.
      const minutes = Math.min(180, Math.max(30, Math.round(durationHours(entry) * 60) || 60));
      const calendar: CalendarLink[] = [...(entry.links?.calendar ?? [])];
      for (const e of events) {
        const followUp = e.title === entry.title && !entry.isNote;
        const eventId = await addCalendarEvent({
          title: e.title,
          start: e.start,
          allDay: e.allDay,
          durationMinutes: followUp ? minutes : 60,
          // Context for future-you opening the event: what it follows on from, and the words you wrote.
          notes: [
            followUp ? `Follow-up to your ${entry.title} on ${whenLabel(entry.timestampStart)}.` : `From “${entry.title}”, ${whenLabel(entry.timestampStart)}.`,
            `Your note: “${e.line}”`,
            entry.note && entry.note.trim() !== e.line ? `Full note:\n${entry.note.trim()}` : null,
            '— Self Mirror',
          ]
            .filter(Boolean)
            .join('\n\n'),
        });
        calendar.push({ line: e.line, title: e.title, start: e.start.toISOString(), allDay: e.allDay, status: eventId ? 'added' : 'failed', eventId: eventId ?? undefined });
      }
      if (events.length) {
        saveLog({ ...entry, links: { ...links, calendar } });
        if (calendar.some((c) => c.status === 'added')) haptics.success();
      }
      // Last, because it briefly switches to the Shortcuts app.
      if (toNotes) {
        await sendToAppleNotes(
          { ...entry, links },
          {
            lines: noteLines,
            calendar: calendar.filter((c) => c.status === 'added').map((c) => `${c.title}, ${whenLabel(c.start)}`),
            reminders: tasks.map((t) => (t.due ? `${t.text} (due ${whenLabel(t.due)})` : t.text)),
          },
        );
      }
    },
    [saveLog, saveTasks, linkReminders, remindersSync, appleNotes],
  );
}
