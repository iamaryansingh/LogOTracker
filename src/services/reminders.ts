// The legacy entry point works in Expo Go; the newer API is stubbed out there.
import {
  createCalendarAsync,
  createReminderAsync,
  EntityTypes,
  getCalendarsAsync,
  getRemindersAsync,
  getRemindersPermissionsAsync,
  ReminderStatus,
  requestRemindersPermissionsAsync,
  updateReminderAsync,
  type Reminder,
} from 'expo-calendar/legacy';
import { Platform } from 'react-native';

import type { Task } from '../domain/types';

/** The Apple Reminders list Self Mirror keeps its to-dos in. iCloud syncs it to every device. */
export const REMINDERS_LIST = 'Self-care';
const LIST_COLOR = '#5B8E7D';
/** Completed reminders older than this aren't pulled back in. */
const COMPLETED_LOOKBACK_DAYS = 30;

export const remindersSupported = Platform.OS === 'ios';

let cachedListId: string | null = null;

async function allowed(ask: boolean): Promise<boolean> {
  if (!remindersSupported) return false;
  const current = await getRemindersPermissionsAsync().catch(() => null);
  if (current?.status === 'granted') return true;
  if (!ask) return false;
  return (await requestRemindersPermissionsAsync().catch(() => null))?.status === 'granted';
}

/** Finds the "Self-care" list, creating it in iCloud (or the default account) the first time. */
async function listId(): Promise<string | null> {
  if (cachedListId) return cachedListId;
  const lists = await getCalendarsAsync(EntityTypes.REMINDER);
  const existing = lists.find((l) => l.title === REMINDERS_LIST && l.allowsModifications);
  if (existing) return (cachedListId = existing.id);
  const writable = lists.filter((l) => l.allowsModifications);
  // Prefer the iCloud account so the list reaches the iPad too.
  const source = (writable.find((l) => l.source?.name === 'iCloud') ?? writable[0])?.source;
  if (!source?.id) return null;
  cachedListId = await createCalendarAsync({
    title: REMINDERS_LIST,
    color: LIST_COLOR,
    entityType: EntityTypes.REMINDER,
    sourceId: source.id,
  });
  return cachedListId;
}

export interface ReminderContext {
  /** Where the to-do came from, e.g. "One to one session with James · Wed, Sep 30". */
  from?: string;
  /** The note line it was read from. */
  line?: string;
}

function reminderBody(task: Task, context: ReminderContext): Reminder {
  const notes = [context.from && `From ${context.from}`, context.line && context.line !== task.text && `“${context.line}”`, 'Added by Self Mirror']
    .filter(Boolean)
    .join('\n');
  const due = task.due ? new Date(task.due) : undefined;
  return {
    title: task.text,
    notes,
    dueDate: due,
    startDate: due,
    allDay: !!due && !task.dueHasTime,
    // A timed to-do gets a nudge at that time; date-only ones just appear on the day.
    alarms: due && task.dueHasTime ? [{ relativeOffset: 0 }] : undefined,
    completed: task.done,
  };
}

/** Adds the to-do to Reminders. Returns the reminder id, or null if Reminders isn't allowed. */
export async function addReminder(task: Task, context: ReminderContext = {}, ask = true): Promise<string | null> {
  try {
    if (!(await allowed(ask))) return null;
    const id = await listId();
    if (!id) return null;
    return await createReminderAsync(id, reminderBody(task, context));
  } catch {
    return null;
  }
}

export async function setReminderDone(reminderId: string, done: boolean): Promise<void> {
  try {
    if (!(await allowed(false))) return;
    await updateReminderAsync(reminderId, { completed: done, completionDate: done ? new Date() : undefined });
  } catch {
    // The reminder may have been deleted in Reminders; the next pull reconciles.
  }
}

export interface PulledReminder {
  id: string;
  title: string;
  due?: Date;
  dueHasTime: boolean;
  done: boolean;
  doneAt?: Date;
}

/** Everything in the "Self-care" list: open reminders plus recently completed ones. Null when not allowed. */
export async function pullReminders(): Promise<PulledReminder[] | null> {
  try {
    if (!(await allowed(false))) return null;
    const id = await listId();
    if (!id) return null;
    const since = new Date(Date.now() - COMPLETED_LOOKBACK_DAYS * 86_400_000);
    const [open, done] = await Promise.all([
      getRemindersAsync([id], null, null, null).then((all) => all.filter((r) => !r.completed)),
      getRemindersAsync([id], ReminderStatus.COMPLETED, since, new Date()),
    ]);
    return [...open, ...done]
      .filter((r): r is Reminder & { id: string } => !!r.id)
      .map((r) => {
        const due = r.dueDate ? new Date(r.dueDate) : undefined;
        return {
          id: r.id,
          title: r.title?.trim() || 'Reminder',
          due,
          dueHasTime: !!due && !r.allDay && (due.getHours() !== 0 || due.getMinutes() !== 0),
          done: !!r.completed,
          doneAt: r.completionDate ? new Date(r.completionDate) : undefined,
        };
      });
  } catch {
    return null;
  }
}
