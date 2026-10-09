import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';

import type { Task } from '../domain/types';
import { useAppStore } from '../state/AppStore';
import { toISODate } from '../utils/time';
import { entryContext } from './appleNotes';
import { addReminder, pullReminders, remindersSupported } from './reminders';

const POLL_MS = 60_000;

const sameTask = (t: Task, title: string, due?: Date) =>
  t.text.trim().toLowerCase() === title.trim().toLowerCase() && (t.due ? toISODate(new Date(t.due)) : undefined) === (due ? toISODate(due) : undefined);

/**
 * Keeps to-dos and the "Self-care" list in Apple Reminders in step, both ways:
 * checking something off in Reminders ticks it here, reminders added on another device
 * (the iPad, via iCloud) appear as to-dos, and to-dos made before Reminders was allowed get added.
 */
export function useRemindersSync() {
  const store = useAppStore();
  const { hydrated, remindersSync } = store;
  const latest = useRef(store);
  useEffect(() => {
    latest.current = store;
  });
  const running = useRef(false);

  useEffect(() => {
    if (!hydrated || !remindersSync || !remindersSupported) return;

    const run = async () => {
      if (running.current) return;
      running.current = true;
      try {
        const pulled = await pullReminders();
        if (!pulled) return;
        const { tasks, reminderLinks, saveTasks, deleteTasks, linkReminders, getLog } = latest.current;
        const byReminder = new Map(pulled.map((r) => [r.id, r]));
        const linkedIds = new Set(Object.values(reminderLinks));
        const updates: Task[] = [];
        const removed: string[] = [];
        const links: Record<string, string | null> = {};

        for (const task of Object.values(tasks)) {
          const rid = reminderLinks[task.id];
          if (!rid) continue;
          const r = byReminder.get(rid);
          if (!r) {
            // Gone from Reminders: deleted there, so remove it here too (old completed ones just age out).
            if (!task.done) removed.push(task.id);
            links[task.id] = null;
          } else if (r.done !== task.done) {
            updates.push({ ...task, done: r.done, doneAt: r.done ? (r.doneAt ?? new Date()).toISOString() : undefined });
          }
        }

        for (const r of pulled) {
          if (linkedIds.has(r.id)) continue;
          // Same to-do already here (e.g. synced from the iPad through iCloud): just link it.
          const match = Object.values(tasks).find((t) => !reminderLinks[t.id] && sameTask(t, r.title, r.due));
          if (match) {
            links[match.id] = r.id;
            continue;
          }
          if (r.done) continue;
          const id = `task-r-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
          updates.push({ id, text: r.title, due: r.due?.toISOString(), dueHasTime: r.dueHasTime, done: false, createdAt: new Date().toISOString() });
          links[id] = r.id;
        }

        if (updates.length) saveTasks(updates);
        if (removed.length) deleteTasks(removed);
        if (Object.keys(links).length) linkReminders(links);

        // To-dos created while Reminders wasn't allowed (or on the other device) get a reminder now.
        const unlinked = Object.values(latest.current.tasks).filter(
          (t) => !t.done && !reminderLinks[t.id] && !(t.id in links) && !pulled.some((r) => sameTask(t, r.title, r.due)),
        );
        const added: Record<string, string> = {};
        for (const t of unlinked) {
          const source = t.sourceLogId ? getLog(t.sourceLogId) : undefined;
          const rid = await addReminder(t, { from: source ? entryContext(source) : undefined, line: t.sourceLine }, false);
          if (rid) added[t.id] = rid;
        }
        if (Object.keys(added).length) linkReminders(added);
      } finally {
        running.current = false;
      }
    };

    void run();
    const sub = AppState.addEventListener('change', (s) => s === 'active' && run());
    const poll = setInterval(() => AppState.currentState === 'active' && run(), POLL_MS);
    return () => {
      sub.remove();
      clearInterval(poll);
    };
  }, [hydrated, remindersSync]);
}
