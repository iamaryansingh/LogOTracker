import * as Linking from 'expo-linking';
import { Platform } from 'react-native';

import { durationHours, isCheckIn, outcomeOf } from '../domain/events';
import type { SignalEvent } from '../domain/types';
import { formatHours } from '../utils/time';

/**
 * Apple Notes has no API for other apps, so notes go through a one-time iOS Shortcut
 * the user creates: it receives text and makes a note in the "Self-care" folder.
 */
export const NOTES_SHORTCUT = 'Self Mirror to Notes';
export const NOTES_FOLDER = 'Self-care Notes';

export const appleNotesSupported = Platform.OS === 'ios';

/** "Wed, Sep 30 · 2:00 PM" */
export function whenLabel(iso: string): string {
  const d = new Date(iso);
  return `${d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })} · ${d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`;
}

/** Where something came from, used to name reminders and notes: "One to one session with James · Wed, Sep 30 · 2:00 PM". */
export const entryContext = (entry: SignalEvent) => `${entry.title} · ${whenLabel(entry.timestampStart)}`;

/**
 * The note as it should read in Apple Notes. Notes uses the first line as the title,
 * so it names the moment: "One to one session with James — Wed, Sep 30 · 2:00 PM".
 */
export interface NotesExtras {
  /** Only these lines go in the body (the note-like ones); defaults to the whole note. */
  lines?: string[];
  /** Where the other lines went, so the note reads as a complete record. */
  calendar?: string[];
  reminders?: string[];
}

export function formatForNotes(entry: SignalEvent, extras: NotesExtras = {}): string {
  const heading = `${entry.title} — ${whenLabel(entry.timestampStart)}`;
  const body = extras.lines
    ? extras.lines.filter((l) => !(entry.isNote && l === entry.title)).join('\n')
    : ((entry.isNote ? entry.note?.split('\n').slice(1).join('\n') : entry.note)?.trim() ?? '');
  const routed = [
    ...(extras.calendar ?? []).map((c) => `📅 ${c}`),
    ...(extras.reminders ?? []).map((r) => `☐ ${r}`),
  ];
  const details =
    entry.isNote || isCheckIn(entry)
      ? []
      : [`${entry.domain} · ${formatHours(durationHours(entry))} · left you ${outcomeOf(entry).toLowerCase()}`];
  return [heading, body, routed.length ? `Also added:\n${routed.join('\n')}` : '', ...details, '— Self Mirror'].filter(Boolean).join('\n\n');
}

const RESULT_PATH = 'notes-result';

/** Text of notes handed to Shortcuts, kept until it reports back so a failure can fall back to the share sheet. */
const pending = new Map<string, string>();
export const pendingNoteText = (entryId: string) => pending.get(entryId);

const encode = (params: Record<string, string>) =>
  Object.entries(params)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');

/**
 * Runs the shortcut with the note. Shortcuts then reopens the app with the outcome
 * (success, cancel, or its error message), which `parseNotesResult` reads.
 * False if the Shortcuts app couldn't be opened at all.
 */
export async function sendToAppleNotes(entry: SignalEvent, extras: NotesExtras = {}): Promise<boolean> {
  if (!appleNotesSupported) return false;
  const text = formatForNotes(entry, extras);
  pending.set(entry.id, text);
  const back = (status: string) => Linking.createURL(RESULT_PATH, { queryParams: { status, entry: entry.id } });
  const url = `shortcuts://x-callback-url/run-shortcut?${encode({
    name: NOTES_SHORTCUT,
    input: 'text',
    text,
    'x-success': back('ok'),
    'x-cancel': back('cancel'),
    'x-error': back('error'),
  })}`;
  try {
    await Linking.openURL(url);
    return true;
  } catch {
    return false;
  }
}

export interface NotesResult {
  status: 'ok' | 'cancel' | 'error';
  entryId: string;
  /** Shortcuts' own explanation when it failed, e.g. that the shortcut couldn't be found. */
  message?: string;
}

/** Reads the link Shortcuts opens after running; null for any other link. */
export function parseNotesResult(url: string): NotesResult | null {
  if (!url.includes(RESULT_PATH)) return null;
  const { queryParams } = Linking.parse(url);
  const status = queryParams?.status;
  const entryId = queryParams?.entry;
  if ((status !== 'ok' && status !== 'cancel' && status !== 'error') || typeof entryId !== 'string') return null;
  const message = queryParams?.errorMessage;
  return { status, entryId, message: typeof message === 'string' ? message : undefined };
}

export const isNotesResultUrl = (url: string) => url.includes(RESULT_PATH);
