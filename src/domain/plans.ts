import type { SignalEvent, Task } from './types';

export interface PlanItem {
  key: string;
  kind: 'event' | 'task' | 'alarm';
  title: string;
  at: Date;
  /** False for all-day events and date-only to-dos. */
  hasTime: boolean;
  sourceLogId?: string;
  task?: Task;
}

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

/** Calendar events created from notes, plus dated open to-dos, from the start of today on, soonest first. */
export function agenda(logs: SignalEvent[], tasks: Task[], now = new Date()): PlanItem[] {
  const from = startOfDay(now).getTime();
  const items: PlanItem[] = [];
  for (const log of logs) {
    for (const c of log.links?.calendar ?? []) {
      if (c.status !== 'added' || Date.parse(c.start) < from) continue;
      items.push({ key: `e-${log.id}-${c.line}`, kind: 'event', title: c.title, at: new Date(c.start), hasTime: !c.allDay, sourceLogId: log.id });
    }
  }
  for (const log of logs) {
    for (const a of log.links?.alarms ?? []) {
      if (a.status !== 'set' || Date.parse(a.at) < from) continue;
      items.push({ key: `a-${log.id}-${a.line}`, kind: 'alarm', title: `⏰ ${a.title}`, at: new Date(a.at), hasTime: true, sourceLogId: log.id });
    }
  }
  for (const t of tasks) {
    if (t.done || !t.due || Date.parse(t.due) < from) continue;
    items.push({ key: `t-${t.id}`, kind: 'task', title: t.text, at: new Date(t.due), hasTime: t.dueHasTime, sourceLogId: t.sourceLogId, task: t });
  }
  return items.sort((a, b) => a.at.getTime() - b.at.getTime() || Number(a.hasTime) - Number(b.hasTime));
}

/**
 * What Today should surface, and nothing more: what's still ahead today (plus anything overdue);
 * if today is clear, just the single next thing coming up.
 */
export function nextUp(logs: SignalEvent[], tasks: Task[], now = new Date(), limit = 3) {
  const today = startOfDay(now).getTime();
  const tomorrow = today + 86_400_000;
  const overdue = tasks.filter((t) => !t.done && t.due && Date.parse(t.due) < today);
  const all = agenda(logs, tasks, now);
  const laterToday = all.filter((i) => i.at.getTime() < tomorrow && (!i.hasTime || i.at >= now));
  const items = laterToday.length ? laterToday.slice(0, limit) : all.filter((i) => i.at.getTime() >= tomorrow).slice(0, 1);
  return { items, isToday: laterToday.length > 0, moreToday: Math.max(0, laterToday.length - limit), overdue: overdue.length };
}
