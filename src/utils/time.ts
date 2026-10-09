export function greetingFor(date: Date): string {
  const hour = date.getHours();
  if (hour < 5) return 'Good night';
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

export function formatLongDate(date: Date): string {
  return date.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
}

export function formatClock(iso: string): string {
  const d = new Date(iso);
  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
}

export function formatDuration(startIso: string, endIso: string): string {
  const minutes = Math.max(0, Math.round((Date.parse(endIso) - Date.parse(startIso)) / 60000));
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

export function toISODate(date: Date): string {
  const y = date.getFullYear();
  const m = (date.getMonth() + 1).toString().padStart(2, '0');
  const d = date.getDate().toString().padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function isSameDay(iso: string, date: Date): boolean {
  return toISODate(new Date(iso)) === toISODate(date);
}

export function formatClockRange(startIso: string, endIso: string): string {
  return startIso === endIso ? formatClock(startIso) : `${formatClock(startIso)} – ${formatClock(endIso)}`;
}

export function formatCountdown(totalSeconds: number): string {
  const s = Math.max(0, Math.ceil(totalSeconds));
  return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;
}

export function shortWeekday(isoDate: string): string {
  return fromISODate(isoDate).toLocaleDateString(undefined, { weekday: 'short' });
}

export function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

/** Parses a YYYY-MM-DD string as local noon, so day arithmetic never crosses a DST edge. */
export function fromISODate(isoDate: string): Date {
  return new Date(`${isoDate}T12:00:00`);
}

export function formatHours(hours: number): string {
  const minutes = Math.round(hours * 60);
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

export function formatDayLabel(isoDate: string, today = new Date()): string {
  const todayIso = toISODate(today);
  if (isoDate === todayIso) return 'Today';
  if (isoDate === toISODate(addDays(today, -1))) return 'Yesterday';
  return fromISODate(isoDate).toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
}
