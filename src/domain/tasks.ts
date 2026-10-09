import { toISODate } from '../utils/time';
import type { Task } from './types';

export type TaskBucket = 'Overdue' | 'Today' | 'Upcoming' | 'Anytime' | 'Done';
export const TASK_BUCKETS: TaskBucket[] = ['Overdue', 'Today', 'Upcoming', 'Anytime', 'Done'];

export const dueDay = (t: Task) => (t.due ? toISODate(new Date(t.due)) : undefined);

export function bucketOf(t: Task, today = toISODate(new Date())): TaskBucket {
  if (t.done) return 'Done';
  const day = dueDay(t);
  if (!day) return 'Anytime';
  if (day < today) return 'Overdue';
  if (day === today) return 'Today';
  return 'Upcoming';
}

const dueTime = (t: Task) => (t.due ? Date.parse(t.due) : Number.POSITIVE_INFINITY);

/** Soonest first; done items most recently finished first. */
export function sortTasks(tasks: Task[]): Task[] {
  return [...tasks].sort((a, b) =>
    a.done && b.done ? Date.parse(b.doneAt ?? b.createdAt) - Date.parse(a.doneAt ?? a.createdAt) : dueTime(a) - dueTime(b) || a.createdAt.localeCompare(b.createdAt),
  );
}

export function groupTasks(tasks: Task[], today = toISODate(new Date())): Record<TaskBucket, Task[]> {
  const groups: Record<TaskBucket, Task[]> = { Overdue: [], Today: [], Upcoming: [], Anytime: [], Done: [] };
  for (const t of sortTasks(tasks)) groups[bucketOf(t, today)].push(t);
  return groups;
}

export function dueLabel(t: Task, today = toISODate(new Date())): string | null {
  if (!t.due) return null;
  const d = new Date(t.due);
  const day = toISODate(d);
  const time = t.dueHasTime ? ` · ${d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}` : '';
  if (day === today) return `Today${time}`;
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  if (day === toISODate(tomorrow)) return `Tomorrow${time}`;
  return `${d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}${time}`;
}
