// The legacy entry point works in Expo Go; the newer API is stubbed out there.
import {
  createEventAsync,
  EntityTypes,
  getCalendarsAsync,
  getDefaultCalendarAsync,
  requestCalendarPermissionsAsync,
} from 'expo-calendar/legacy';
import { Platform } from 'react-native';

export interface NewCalendarEvent {
  title: string;
  start: Date;
  allDay: boolean;
  durationMinutes: number;
  notes: string;
}

async function writableCalendarId(): Promise<string | null> {
  if (Platform.OS === 'ios') {
    const def = await getDefaultCalendarAsync().catch(() => null);
    if (def?.allowsModifications) return def.id;
  }
  const calendars = await getCalendarsAsync(EntityTypes.EVENT);
  const writable = calendars.filter((c) => c.allowsModifications);
  return (writable.find((c) => c.isPrimary) ?? writable[0])?.id ?? null;
}

/** Adds an event to the phone's default calendar. Returns its id, or null if access isn't allowed. */
export async function addCalendarEvent(event: NewCalendarEvent): Promise<string | null> {
  try {
    const { status } = await requestCalendarPermissionsAsync();
    if (status !== 'granted') return null;
    const calendarId = await writableCalendarId();
    if (!calendarId) return null;

    const start = new Date(event.start);
    let end = new Date(start.getTime() + event.durationMinutes * 60_000);
    if (event.allDay) {
      start.setHours(0, 0, 0, 0);
      end = new Date(start);
      end.setDate(end.getDate() + 1);
    }
    return await createEventAsync(calendarId, {
      title: event.title,
      startDate: start,
      endDate: end,
      allDay: event.allDay,
      notes: event.notes,
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    });
  } catch {
    return null;
  }
}
