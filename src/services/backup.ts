import * as DocumentPicker from 'expo-document-picker';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

import type { DayRatings, JournalEntry, SignalEvent, Task } from '../domain/types';
import type { RecordKey, RecordMeta, SyncRecord } from '../state/AppStore';
import { toISODate } from '../utils/time';
import type { HealthDaily } from './health/shared';

const FORMAT = 'self-mirror-backup';
const VERSION = 1;

export interface BackupData {
  logs: SignalEvent[];
  ratings: Record<string, DayRatings>;
  journals: Record<string, JournalEntry>;
  tasks: Record<string, Task>;
  meta: Partial<Record<RecordKey, RecordMeta>>;
  health: Record<string, HealthDaily>;
}

interface BackupFile {
  format: typeof FORMAT;
  version: number;
  exportedAt: string;
  data: BackupData;
}

export interface BackupSummary {
  entries: number;
  journals: number;
  todos: number;
  days: number;
}

export const summarize = (d: BackupData): BackupSummary => ({
  entries: d.logs.length,
  journals: Object.keys(d.journals).length,
  todos: Object.keys(d.tasks).length,
  days: Object.keys(d.ratings).length,
});

/** Writes everything to a dated JSON file and opens the share sheet (Save to Files, iCloud Drive, AirDrop…). */
export async function exportBackup(data: BackupData): Promise<void> {
  const body: BackupFile = { format: FORMAT, version: VERSION, exportedAt: new Date().toISOString(), data };
  const file = new File(Paths.cache, `Self Mirror backup ${toISODate(new Date())}.json`);
  if (file.exists) file.delete();
  file.create();
  file.write(JSON.stringify(body));
  await Sharing.shareAsync(file.uri, { mimeType: 'application/json', UTI: 'public.json', dialogTitle: 'Save your Self Mirror backup' });
}

/**
 * Turns a backup into sync records so restoring *merges* exactly like sync does: each item keeps
 * whichever version changed last, deletions carry over, and nothing newer on this device is lost.
 */
function toRecords(file: BackupFile): SyncRecord[] {
  const { data, exportedAt } = file;
  const records = new Map<RecordKey, SyncRecord>();
  const at = (key: RecordKey) => data.meta[key]?.updatedAt ?? exportedAt;
  for (const log of data.logs) records.set(`logs/${log.id}`, { key: `logs/${log.id}`, updatedAt: at(`logs/${log.id}`), data: log });
  for (const [date, r] of Object.entries(data.ratings)) records.set(`ratings/${date}`, { key: `ratings/${date}`, updatedAt: at(`ratings/${date}`), data: r });
  for (const [id, j] of Object.entries(data.journals)) records.set(`journal/${id}`, { key: `journal/${id}`, updatedAt: at(`journal/${id}`), data: j });
  for (const [id, t] of Object.entries(data.tasks)) records.set(`tasks/${id}`, { key: `tasks/${id}`, updatedAt: at(`tasks/${id}`), data: t });
  // Deletions made before the backup still apply.
  for (const [key, m] of Object.entries(data.meta) as [RecordKey, RecordMeta][]) {
    if (m.deleted && !records.has(key)) records.set(key, { key, updatedAt: m.updatedAt, deleted: true });
  }
  return [...records.values()];
}

export type PickedBackup = { records: SyncRecord[]; health: Record<string, HealthDaily>; summary: BackupSummary; exportedAt: string };

/** Checks a backup's text really is one and turns it into mergeable records. Throws with a readable reason. */
export function parseBackup(text: string): PickedBackup {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('That file isn’t readable as a Self Mirror backup.');
  }
  const file = parsed as Partial<BackupFile>;
  if (file?.format !== FORMAT || !file.data || !Array.isArray(file.data.logs)) {
    throw new Error('That file isn’t a Self Mirror backup.');
  }
  if ((file.version ?? 0) > VERSION) throw new Error('This backup is from a newer version of Self Mirror. Update the app first.');
  const data: BackupData = {
    logs: file.data.logs,
    ratings: file.data.ratings ?? {},
    journals: file.data.journals ?? {},
    tasks: file.data.tasks ?? {},
    meta: file.data.meta ?? {},
    health: file.data.health ?? {},
  };
  const exportedAt = file.exportedAt ?? new Date().toISOString();
  return { records: toRecords({ format: FORMAT, version: VERSION, exportedAt, data }), health: data.health, summary: summarize(data), exportedAt };
}

/** Lets the user pick a backup file and reads it. Null when they cancel. */
export async function pickBackup(): Promise<PickedBackup | null> {
  const result = await DocumentPicker.getDocumentAsync({ type: ['application/json', 'public.json', '*/*'], copyToCacheDirectory: true });
  if (result.canceled || !result.assets[0]) return null;
  return parseBackup(await new File(result.assets[0].uri).text());
}
