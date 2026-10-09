import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useContext, useEffect, useMemo, useReducer, type ReactNode } from 'react';

import type { RatingsByDay } from '../domain/analytics';
import { byStart } from '../domain/events';
import type { DayRatings, DevIdea, InputSource, JournalEntry, MetricValue, RatingKey, SignalEvent, Task } from '../domain/types';
import type { HealthDaily, HealthSnapshot } from '../services/health/shared';
import type { HealthReport } from '../services/health/validate';
import type { CustomMemory, MemoryOverride, MemoryStyle } from '../domain/memoryTypes';
import type { Layout } from '../domain/dashboard';

export type Appearance = 'system' | 'light' | 'dark';

// ---- Sync records ---------------------------------------------------------------------
// Every syncable item is a record with its own key and timestamp, so two devices can edit
// different things at once and merge cleanly (latest change per record wins).

export type RecordKey = `logs/${string}` | `ratings/${string}` | `journal/${string}` | `tasks/${string}`;

export interface RecordMeta {
  updatedAt: string;
  /** Tombstone: the record was deleted and the deletion should reach other devices. */
  deleted?: boolean;
}

export interface SyncRecord {
  key: RecordKey;
  updatedAt: string;
  deleted?: boolean;
  data?: SignalEvent | DayRatings | JournalEntry | Task;
}

interface PersistedState {
  /** Everything the user has logged: activities, check-ins, coping sessions and Health imports, across all days. */
  logs: SignalEvent[];
  ratings: RatingsByDay;
  journals: Record<string, JournalEntry>;
  tasks: Record<string, Task>;
  meta: Partial<Record<RecordKey, RecordMeta>>;
  /** Daily totals read from Apple Health / Health Connect. Per device, not synced. */
  health: Record<string, HealthDaily>;
  healthSyncedAt?: string;
  /** What the last Health sync brought in and what it left out. */
  healthReport?: HealthReport;
  cloudSync: boolean;
  /** Task id → Apple Reminders id on this device. Local only: reminder ids differ per device. */
  reminderLinks: Record<string, string>;
  /** Mirror to-dos into the "Self-care" list in Apple Reminders. */
  remindersSync: boolean;
  /** Send notes to Apple Notes through the "Self Mirror to Notes" shortcut. */
  appleNotes: boolean;
  /** Developer board: bugs and ideas noted while using the app. Local only, never synced or routed. */
  ideas: Record<string, DevIdea>;
  /** Trip & Memory engine settings. Read by the background location task too, so keep the shape stable. */
  memories: MemorySettings;
  /** User edits to generated memories and trips, by date (YYYY-MM-DD) or trip id. */
  memoryOverrides: Record<string, MemoryOverride>;
  /** Memories the user made themselves, from photos and a place. Local only. */
  customMemories: Record<string, CustomMemory>;
  /** A live memory being recorded (Start → End), if any. */
  liveMemory?: LiveMemorySession;
  /** How the Today dashboard is arranged (rows; two cards in a row are tied). Undefined = default. */
  todayLayout?: Layout;
  onboarded: boolean;
  inputs: Record<InputSource, boolean>;
  appearance: Appearance;
}

export interface LiveMemorySession {
  id: string;
  startedAt: string;
  /** Photos added by hand during the session (stored file names). Camera-roll photos are found by time. */
  photos: string[];
}

export interface MemorySettings {
  enabled: boolean;
  style: MemoryStyle;
  /** Look up weather from Open-Meteo (rounded location leaves the device). Off by default. */
  weather: boolean;
  /** Gentle notifications after meaningful stops. */
  prompts: boolean;
  /** Home, as the user set it. Overrides the guess from overnight stays; no prompts here. */
  home?: { name: string; latitude: number; longitude: number };
}

interface State extends PersistedState {
  hydrated: boolean;
}

const STORAGE_KEY = 'selfmirror/state/v2';

const initialPersisted: PersistedState = {
  logs: [],
  ratings: {},
  journals: {},
  tasks: {},
  meta: {},
  health: {},
  cloudSync: true,
  reminderLinks: {},
  remindersSync: true,
  appleNotes: false,
  ideas: {},
  memories: { enabled: false, style: 'NARRATIVE_STORY', weather: false, prompts: true },
  memoryOverrides: {},
  customMemories: {},
  onboarded: false,
  inputs: { Calendar: false, Health: false, Motion: false, Location: false },
  appearance: 'system',
};

type Action =
  | { type: 'hydrate'; state: Partial<PersistedState> }
  | { type: 'upsertLog'; event: SignalEvent }
  | { type: 'deleteLog'; id: string }
  | { type: 'setRating'; date: string; key: RatingKey; value: MetricValue | undefined }
  | { type: 'saveJournal'; entry: Omit<JournalEntry, 'updatedAt'> }
  | { type: 'saveTasks'; tasks: Task[] }
  | { type: 'deleteTasks'; ids: string[] }
  | { type: 'syncHealth'; snapshot: HealthSnapshot; report: HealthReport }
  | { type: 'importAuto'; events: SignalEvent[] }
  | { type: 'applyRemote'; records: SyncRecord[] }
  | { type: 'mergeHealth'; daily: Record<string, HealthDaily> }
  | { type: 'setCloudSync'; value: boolean }
  | { type: 'linkReminders'; links: Record<string, string | null> }
  | { type: 'setRemindersSync'; value: boolean }
  | { type: 'setAppleNotes'; value: boolean }
  | { type: 'saveIdea'; idea: DevIdea }
  | { type: 'setMemorySettings'; patch: Partial<MemorySettings> }
  | { type: 'overrideMemory'; key: string; patch: MemoryOverride }
  | { type: 'clearMemories' }
  | { type: 'saveCustomMemory'; memory: CustomMemory }
  | { type: 'deleteCustomMemory'; id: string }
  | { type: 'setLiveMemory'; session: LiveMemorySession | undefined }
  | { type: 'setTodayLayout'; layout: Layout | undefined }
  | { type: 'deleteIdea'; id: string }
  | { type: 'setOnboarded'; value: boolean }
  | { type: 'setInput'; source: InputSource; enabled: boolean }
  | { type: 'setAppearance'; appearance: Appearance }
  | { type: 'reset' };

const now = () => new Date().toISOString();

const stamp = (meta: PersistedState['meta'], keys: RecordKey[], deleted = false): PersistedState['meta'] => {
  const at = now();
  const next = { ...meta };
  for (const key of keys) next[key] = deleted ? { updatedAt: at, deleted: true } : { updatedAt: at };
  return next;
};

const overlapRatio = (a: SignalEvent, b: SignalEvent) => {
  const start = Math.max(Date.parse(a.timestampStart), Date.parse(b.timestampStart));
  const end = Math.min(Date.parse(a.timestampEnd), Date.parse(b.timestampEnd));
  const shorter = Math.min(Date.parse(a.timestampEnd) - Date.parse(a.timestampStart), Date.parse(b.timestampEnd) - Date.parse(b.timestampStart));
  return shorter > 0 ? Math.max(0, end - start) / shorter : 0;
};

/**
 * Adds or refreshes imported entries. Anything the user logged or edited (source MANUAL) is never overwritten,
 * an import that mostly overlaps a manual entry of the same kind is skipped as a duplicate, and an entry
 * the user deleted stays deleted.
 */
function mergeImported(state: State, imported: SignalEvent[]): { logs: SignalEvent[]; changed: RecordKey[]; removed: RecordKey[] } {
  const byId = new Map(state.logs.map((e) => [e.id, e]));
  const manual = state.logs.filter((e) => e.source !== 'AUTO');
  const changed: RecordKey[] = [];
  const removed: RecordKey[] = [];
  for (const event of imported) {
    const key: RecordKey = `logs/${event.id}`;
    if (state.meta[key]?.deleted) continue;
    const existing = byId.get(event.id);
    if (existing && existing.source !== 'AUTO') continue;
    if (manual.some((m) => m.domain === event.domain && overlapRatio(m, event) > 0.5)) continue;
    if (existing && existing.timestampStart === event.timestampStart && existing.timestampEnd === event.timestampEnd) continue;
    // An older import of the same thing under another id (e.g. a night re-dated by validation) is replaced.
    for (const [otherId, other] of byId) {
      // A location walk never pushes out a Health entry; a Health entry does replace a location walk.
      const outranks = !event.id.startsWith('loc-') || otherId.startsWith('loc-');
      if (otherId !== event.id && outranks && other.source === 'AUTO' && other.domain === event.domain && overlapRatio(other, event) > 0.5) {
        byId.delete(otherId);
        changed.push(`logs/${otherId}`);
        removed.push(`logs/${otherId}`);
      }
    }
    byId.set(event.id, event);
    changed.push(key);
  }
  return { logs: [...byId.values()].sort(byStart), changed: changed.filter((k) => !removed.includes(k)), removed };
}

const isNewer = (remote: SyncRecord, local: RecordMeta | undefined) => !local || remote.updatedAt > local.updatedAt;

function applyRemote(state: State, records: SyncRecord[]): State {
  let { logs, ratings, journals, tasks } = state;
  const meta = { ...state.meta };
  let touched = false;
  for (const r of records) {
    if (!isNewer(r, meta[r.key])) continue;
    touched = true;
    meta[r.key] = r.deleted ? { updatedAt: r.updatedAt, deleted: true } : { updatedAt: r.updatedAt };
    const [kind, id] = r.key.split('/') as ['logs' | 'ratings' | 'journal' | 'tasks', string];
    if (kind === 'logs') {
      logs = logs.filter((e) => e.id !== id);
      if (!r.deleted && r.data) logs = [...logs, r.data as SignalEvent].sort(byStart);
    } else if (kind === 'ratings') {
      ratings = { ...ratings };
      if (r.deleted || !r.data) delete ratings[id];
      else ratings[id] = r.data as DayRatings;
    } else if (kind === 'tasks') {
      tasks = { ...tasks };
      if (r.deleted || !r.data) delete tasks[id];
      else tasks[id] = r.data as Task;
    } else {
      journals = { ...journals };
      if (r.deleted || !r.data) delete journals[id];
      else journals[id] = r.data as JournalEntry;
    }
  }
  return touched ? { ...state, logs, ratings, journals, tasks, meta } : state;
}

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'hydrate':
      return {
        ...state,
        ...action.state,
        inputs: { ...state.inputs, ...action.state.inputs },
        journals: action.state.journals ?? {},
        tasks: action.state.tasks ?? {},
        reminderLinks: action.state.reminderLinks ?? {},
        ideas: action.state.ideas ?? {},
        memories: { ...state.memories, ...action.state.memories },
        memoryOverrides: action.state.memoryOverrides ?? {},
        customMemories: action.state.customMemories ?? {},
        meta: action.state.meta ?? {},
        hydrated: true,
      };
    case 'upsertLog': {
      const exists = state.logs.some((e) => e.id === action.event.id);
      const logs = exists ? state.logs.map((e) => (e.id === action.event.id ? action.event : e)) : [...state.logs, action.event];
      return { ...state, logs: logs.sort(byStart), meta: stamp(state.meta, [`logs/${action.event.id}`]) };
    }
    case 'deleteLog': {
      const journals = { ...state.journals };
      const keys: RecordKey[] = [`logs/${action.id}`];
      if (journals[action.id]) {
        delete journals[action.id];
        keys.push(`journal/${action.id}`);
      }
      return { ...state, logs: state.logs.filter((e) => e.id !== action.id), journals, meta: stamp(state.meta, keys, true) };
    }
    case 'setRating': {
      const day = { ...state.ratings[action.date] };
      if (action.value === undefined) delete day[action.key];
      else day[action.key] = action.value;
      const ratings = { ...state.ratings };
      const empty = Object.keys(day).length === 0;
      if (empty) delete ratings[action.date];
      else ratings[action.date] = day;
      return { ...state, ratings, meta: stamp(state.meta, [`ratings/${action.date}`], empty) };
    }
    case 'saveJournal': {
      const updatedAt = now();
      const { entry } = action;
      const blank = entry.text.trim() === '' && entry.pages.every((p) => p.length === 0);
      const journals = { ...state.journals };
      if (blank) delete journals[entry.logId];
      else journals[entry.logId] = { ...entry, updatedAt };
      return { ...state, journals, meta: stamp(state.meta, [`journal/${entry.logId}`], blank) };
    }
    case 'saveTasks': {
      const tasks = { ...state.tasks };
      for (const t of action.tasks) tasks[t.id] = t;
      return { ...state, tasks, meta: stamp(state.meta, action.tasks.map((t) => `tasks/${t.id}` as RecordKey)) };
    }
    case 'deleteTasks': {
      const tasks = { ...state.tasks };
      for (const id of action.ids) delete tasks[id];
      return { ...state, tasks, meta: stamp(state.meta, action.ids.map((id) => `tasks/${id}` as RecordKey), true) };
    }
    case 'syncHealth': {
      const { logs, changed, removed } = mergeImported(state, action.snapshot.events);
      let meta = changed.length ? stamp(state.meta, changed) : state.meta;
      if (removed.length) meta = stamp(meta, removed, true);
      return {
        ...state,
        health: { ...state.health, ...action.snapshot.daily },
        healthSyncedAt: now(),
        healthReport: action.report,
        logs,
        meta,
      };
    }
    case 'importAuto': {
      // Walks found in location history; same rules as Health imports (deletions stick, manual wins).
      const { logs, changed, removed } = mergeImported(state, action.events);
      if (!changed.length && !removed.length) return state;
      let meta = stamp(state.meta, changed);
      if (removed.length) meta = stamp(meta, removed, true);
      return { ...state, logs, meta };
    }
    case 'applyRemote':
      return applyRemote(state, action.records);
    case 'mergeHealth':
      // Days this device already has stay as read from Health here.
      return { ...state, health: { ...action.daily, ...state.health } };
    case 'setCloudSync':
      return { ...state, cloudSync: action.value };
    case 'linkReminders': {
      const reminderLinks = { ...state.reminderLinks };
      for (const [taskId, rid] of Object.entries(action.links)) {
        if (rid) reminderLinks[taskId] = rid;
        else delete reminderLinks[taskId];
      }
      return { ...state, reminderLinks };
    }
    case 'setRemindersSync':
      return { ...state, remindersSync: action.value };
    case 'setAppleNotes':
      return { ...state, appleNotes: action.value };
    case 'setMemorySettings':
      return { ...state, memories: { ...state.memories, ...action.patch } };
    case 'overrideMemory':
      return { ...state, memoryOverrides: { ...state.memoryOverrides, [action.key]: { ...state.memoryOverrides[action.key], ...action.patch } } };
    case 'setTodayLayout':
      return { ...state, todayLayout: action.layout };
    case 'saveCustomMemory':
      return { ...state, customMemories: { ...state.customMemories, [action.memory.id]: action.memory } };
    case 'deleteCustomMemory': {
      const customMemories = { ...state.customMemories };
      delete customMemories[action.id];
      return { ...state, customMemories };
    }
    case 'setLiveMemory':
      return { ...state, liveMemory: action.session };
    case 'clearMemories':
      return { ...state, memoryOverrides: {} };
    case 'saveIdea':
      return { ...state, ideas: { ...state.ideas, [action.idea.id]: action.idea } };
    case 'deleteIdea': {
      const ideas = { ...state.ideas };
      delete ideas[action.id];
      return { ...state, ideas };
    }
    case 'setOnboarded':
      return { ...state, onboarded: action.value };
    case 'setInput':
      return { ...state, inputs: { ...state.inputs, [action.source]: action.enabled } };
    case 'setAppearance':
      return { ...state, appearance: action.appearance };
    case 'reset':
      // Wiping data keeps the user inside the app; onboarding replays so choices are made fresh.
      return { ...initialPersisted, hydrated: true };
  }
}

interface AppStore {
  hydrated: boolean;
  onboarded: boolean;
  inputs: Record<InputSource, boolean>;
  appearance: Appearance;
  /** All entries in time order. */
  logs: SignalEvent[];
  ratings: RatingsByDay;
  journals: Record<string, JournalEntry>;
  tasks: Record<string, Task>;
  meta: PersistedState['meta'];
  health: Record<string, HealthDaily>;
  healthSyncedAt?: string;
  healthReport?: HealthReport;
  cloudSync: boolean;
  reminderLinks: Record<string, string>;
  remindersSync: boolean;
  appleNotes: boolean;
  /** Sets (or, with null, clears) task ↔ reminder links on this device. */
  linkReminders: (links: Record<string, string | null>) => void;
  setRemindersSync: (value: boolean) => void;
  setAppleNotes: (value: boolean) => void;
  ideas: Record<string, DevIdea>;
  memories: MemorySettings;
  memoryOverrides: Record<string, MemoryOverride>;
  setMemorySettings: (patch: Partial<MemorySettings>) => void;
  overrideMemory: (key: string, patch: MemoryOverride) => void;
  clearMemoryOverrides: () => void;
  customMemories: Record<string, CustomMemory>;
  saveCustomMemory: (memory: CustomMemory) => void;
  deleteCustomMemory: (id: string) => void;
  liveMemory?: LiveMemorySession;
  setLiveMemory: (session: LiveMemorySession | undefined) => void;
  todayLayout?: Layout;
  /** Pass undefined to reset to the default arrangement. */
  setTodayLayout: (layout: Layout | undefined) => void;
  saveIdea: (idea: DevIdea) => void;
  deleteIdea: (id: string) => void;
  getLog: (id: string) => SignalEvent | undefined;
  /** Adds a new entry, or replaces the one with the same id. */
  saveLog: (event: SignalEvent) => void;
  deleteLog: (id: string) => void;
  setRating: (date: string, key: RatingKey, value: MetricValue | undefined) => void;
  /** Saves (or, when empty, removes) the journal for a log entry. */
  saveJournal: (entry: Omit<JournalEntry, 'updatedAt'>) => void;
  /** Adds or replaces tasks. */
  saveTasks: (tasks: Task[]) => void;
  deleteTasks: (ids: string[]) => void;
  syncHealth: (snapshot: HealthSnapshot, report: HealthReport) => void;
  /** Adds walks and runs found in location history to the log (never re-adds deleted ones). */
  importAutoEvents: (events: SignalEvent[]) => void;
  applyRemote: (records: SyncRecord[]) => void;
  /** Merges a backup: each item keeps whichever version changed last. */
  importBackup: (records: SyncRecord[], health: Record<string, HealthDaily>) => void;
  setCloudSync: (value: boolean) => void;
  setOnboarded: (value: boolean) => void;
  setInput: (source: InputSource, enabled: boolean) => void;
  setAppearance: (appearance: Appearance) => void;
  resetAllData: () => void;
}

const AppStoreContext = createContext<AppStore | null>(null);

export function AppStoreProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, { ...initialPersisted, hydrated: false });

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => dispatch({ type: 'hydrate', state: raw ? (JSON.parse(raw) as Partial<PersistedState>) : {} }))
      .catch(() => dispatch({ type: 'hydrate', state: {} }));
  }, []);

  const { hydrated, logs, ratings, journals, tasks, meta, health, healthSyncedAt, healthReport, cloudSync, reminderLinks, remindersSync, appleNotes, ideas, memories, memoryOverrides, customMemories, liveMemory, todayLayout, onboarded, inputs, appearance } = state;

  useEffect(() => {
    if (!hydrated) return;
    const persisted: PersistedState = { logs, ratings, journals, tasks, meta, health, healthSyncedAt, healthReport, cloudSync, reminderLinks, remindersSync, appleNotes, ideas, memories, memoryOverrides, customMemories, liveMemory, todayLayout, onboarded, inputs, appearance };
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(persisted)).catch(() => {});
  }, [hydrated, logs, ratings, journals, tasks, meta, health, healthSyncedAt, healthReport, cloudSync, reminderLinks, remindersSync, appleNotes, ideas, memories, memoryOverrides, customMemories, liveMemory, todayLayout, onboarded, inputs, appearance]);

  const store = useMemo<AppStore>(
    () => ({
      hydrated,
      onboarded,
      inputs,
      appearance,
      logs,
      ratings,
      journals,
      tasks,
      meta,
      health,
      healthSyncedAt,
      healthReport,
      cloudSync,
      reminderLinks,
      remindersSync,
      appleNotes,
      linkReminders: (links) => dispatch({ type: 'linkReminders', links }),
      setRemindersSync: (value) => dispatch({ type: 'setRemindersSync', value }),
      setAppleNotes: (value) => dispatch({ type: 'setAppleNotes', value }),
      ideas,
      memories,
      memoryOverrides,
      setMemorySettings: (patch) => dispatch({ type: 'setMemorySettings', patch }),
      overrideMemory: (key, patch) => dispatch({ type: 'overrideMemory', key, patch }),
      clearMemoryOverrides: () => dispatch({ type: 'clearMemories' }),
      customMemories,
      saveCustomMemory: (memory) => dispatch({ type: 'saveCustomMemory', memory }),
      deleteCustomMemory: (id) => dispatch({ type: 'deleteCustomMemory', id }),
      liveMemory,
      setLiveMemory: (session) => dispatch({ type: 'setLiveMemory', session }),
      todayLayout,
      setTodayLayout: (layout) => dispatch({ type: 'setTodayLayout', layout }),
      saveIdea: (idea) => dispatch({ type: 'saveIdea', idea }),
      deleteIdea: (id) => dispatch({ type: 'deleteIdea', id }),
      getLog: (id) => logs.find((e) => e.id === id),
      saveLog: (event) => dispatch({ type: 'upsertLog', event }),
      deleteLog: (id) => dispatch({ type: 'deleteLog', id }),
      setRating: (date, key, value) => dispatch({ type: 'setRating', date, key, value }),
      saveJournal: (entry) => dispatch({ type: 'saveJournal', entry }),
      saveTasks: (list) => dispatch({ type: 'saveTasks', tasks: list }),
      deleteTasks: (ids) => dispatch({ type: 'deleteTasks', ids }),
      syncHealth: (snapshot, report) => dispatch({ type: 'syncHealth', snapshot, report }),
      importAutoEvents: (events) => dispatch({ type: 'importAuto', events }),
      applyRemote: (records) => dispatch({ type: 'applyRemote', records }),
      importBackup: (records, daily) => {
        dispatch({ type: 'applyRemote', records });
        dispatch({ type: 'mergeHealth', daily });
      },
      setCloudSync: (value) => dispatch({ type: 'setCloudSync', value }),
      setOnboarded: (value) => dispatch({ type: 'setOnboarded', value }),
      setInput: (source, enabled) => dispatch({ type: 'setInput', source, enabled }),
      setAppearance: (value) => dispatch({ type: 'setAppearance', appearance: value }),
      resetAllData: () => dispatch({ type: 'reset' }),
    }),
    [hydrated, onboarded, inputs, appearance, logs, ratings, journals, tasks, meta, health, healthSyncedAt, healthReport, cloudSync, reminderLinks, remindersSync, appleNotes, ideas, memories, memoryOverrides, customMemories, liveMemory, todayLayout],
  );

  return <AppStoreContext.Provider value={store}>{children}</AppStoreContext.Provider>;
}

export function useAppStore(): AppStore {
  const store = useContext(AppStoreContext);
  if (!store) throw new Error('useAppStore must be used inside AppStoreProvider');
  return store;
}
