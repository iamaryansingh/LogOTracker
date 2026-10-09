import { isRunningInExpoGo } from 'expo';
import { Platform } from 'react-native';

import type { DayRatings, JournalEntry, SignalEvent, Task } from '../../domain/types';
import type { RecordKey, RecordMeta, SyncRecord } from '../../state/AppStore';

type CloudStorageModule = typeof import('react-native-cloud-storage');

// Required lazily: the native module doesn't exist in Expo Go, and importing it there would crash at startup.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const load = (): CloudStorageModule => require('react-native-cloud-storage');

const FOLDERS = ['logs', 'ratings', 'journal', 'tasks'] as const;

/** What this device has already seen in iCloud, so each sync only reads files that changed. */
export interface SyncCursor {
  /** Remote file path → modification time last read or written. */
  seen: Record<string, number>;
  /** Record key → updatedAt known to be in iCloud. */
  known: Partial<Record<RecordKey, string>>;
}

export const emptyCursor = (): SyncCursor => ({ seen: {}, known: {} });

export interface LocalSnapshot {
  meta: Partial<Record<RecordKey, RecordMeta>>;
  logs: SignalEvent[];
  ratings: Record<string, DayRatings>;
  journals: Record<string, JournalEntry>;
  tasks: Record<string, Task>;
}

export const cloudSyncSupported = () => Platform.OS === 'ios' && !isRunningInExpoGo();

export class CloudUnavailableError extends Error {}

const pathFor = (key: RecordKey) => `/${key}.json`;
const keyFor = (folder: string, name: string) => `${folder}/${name.replace(/^.*\//, '').replace(/\.json$/, '')}` as RecordKey;

function dataFor(key: RecordKey, local: LocalSnapshot): SyncRecord['data'] {
  const [kind, id] = key.split('/') as [(typeof FOLDERS)[number], string];
  if (kind === 'logs') return local.logs.find((e) => e.id === id);
  if (kind === 'ratings') return local.ratings[id];
  if (kind === 'tasks') return local.tasks[id];
  return local.journals[id];
}

/**
 * One two-way pass over the app's private iCloud container:
 * pull records changed on other devices, then push records changed here.
 * Conflicts resolve per record by `updatedAt` (the store applies only newer incoming records).
 */
export async function syncOnce(local: LocalSnapshot, cursor: SyncCursor): Promise<{ incoming: SyncRecord[]; cursor: SyncCursor }> {
  const { CloudStorage, CloudStorageScope } = load();
  const scope = CloudStorageScope.AppData;
  if (!(await CloudStorage.isCloudAvailable())) throw new CloudUnavailableError('iCloud is not available');

  const seen = { ...cursor.seen };
  const known = { ...cursor.known };
  const incoming: SyncRecord[] = [];

  for (const folder of FOLDERS) {
    const dir = `/${folder}`;
    if (!(await CloudStorage.exists(dir, scope))) {
      await CloudStorage.mkdir(dir, scope);
      continue;
    }
    for (const name of await CloudStorage.readdir(dir, scope)) {
      if (!name.endsWith('.json')) continue;
      const path = `${dir}/${name.replace(/^.*\//, '')}`;
      try {
        const { mtimeMs } = await CloudStorage.stat(path, scope);
        if (seen[path] === mtimeMs) continue;
        // Files written on another device may still be in the cloud only; ask iCloud to fetch them first.
        await CloudStorage.downloadFile(path, scope).catch(() => {});
        const record = JSON.parse(await CloudStorage.readFile(path, scope)) as SyncRecord;
        const key = keyFor(folder, name);
        incoming.push({ ...record, key });
        known[key] = record.updatedAt;
        seen[path] = mtimeMs;
      } catch {
        // Not downloaded yet or mid-write; picked up on a later pass.
      }
    }
  }

  const incomingAt = new Map(incoming.map((r) => [r.key, r.updatedAt]));
  for (const [key, meta] of Object.entries(local.meta) as [RecordKey, RecordMeta][]) {
    const remoteAt = incomingAt.get(key) ?? known[key];
    if (remoteAt && remoteAt >= meta.updatedAt) continue;
    const record: SyncRecord = meta.deleted
      ? { key, updatedAt: meta.updatedAt, deleted: true }
      : { key, updatedAt: meta.updatedAt, data: dataFor(key, local) };
    if (!record.deleted && !record.data) continue;
    const path = pathFor(key);
    await CloudStorage.writeFile(path, JSON.stringify(record), scope);
    known[key] = meta.updatedAt;
    seen[path] = (await CloudStorage.stat(path, scope)).mtimeMs;
  }

  return { incoming, cursor: { seen, known } };
}

/** Removes everything this app stored in iCloud (used by "Delete all my data"). */
export async function wipeCloud(): Promise<void> {
  const { CloudStorage, CloudStorageScope } = load();
  const scope = CloudStorageScope.AppData;
  if (!(await CloudStorage.isCloudAvailable())) return;
  for (const folder of FOLDERS) {
    const dir = `/${folder}`;
    if (await CloudStorage.exists(dir, scope)) await CloudStorage.rmdir(dir, { recursive: true }, scope);
  }
}
