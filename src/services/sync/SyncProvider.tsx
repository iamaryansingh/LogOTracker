import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';

import { useAppStore } from '../../state/AppStore';
import { CloudUnavailableError, cloudSyncSupported, emptyCursor, syncOnce, wipeCloud, type SyncCursor } from './icloud';

export type SyncState = 'off' | 'unsupported' | 'unavailable' | 'syncing' | 'idle' | 'error';

interface SyncApi {
  state: SyncState;
  lastSyncedAt?: string;
  syncNow: () => void;
  /** Deletes this app's iCloud data; resolves once done (or immediately when sync isn't possible). */
  wipe: () => Promise<void>;
}

const SyncContext = createContext<SyncApi>({ state: 'unsupported', syncNow: () => {}, wipe: async () => {} });
export const useSync = () => useContext(SyncContext);

const CURSOR_KEY = 'selfmirror/sync/v1';
const DEBOUNCE_MS = 2500;
const POLL_MS = 45_000;

/** Keeps logs, ratings and journals in step with iCloud: at launch, after local edits, on foreground, and on a slow poll. */
export function SyncProvider({ children }: { children: ReactNode }) {
  const store = useAppStore();
  const { hydrated, cloudSync, meta, applyRemote } = store;
  const supported = cloudSyncSupported();
  const [runState, setRunState] = useState<'idle' | 'syncing' | 'unavailable' | 'error'>('idle');
  const [lastSyncedAt, setLastSyncedAt] = useState<string>();
  const state: SyncState = !supported ? 'unsupported' : !cloudSync ? 'off' : runState;

  // Latest local data for the sync pass, read at run time rather than captured per render.
  const latest = useRef(store);
  useEffect(() => {
    latest.current = store;
  });
  const running = useRef(false);
  const again = useRef(false);

  const run = useCallback(async () => {
    if (!supported || !latest.current.cloudSync) return;
    if (running.current) {
      again.current = true;
      return;
    }
    running.current = true;
    // Edits made while a pass is running get their own pass straight after.
    do {
      again.current = false;
      setRunState('syncing');
      try {
        const raw = await AsyncStorage.getItem(CURSOR_KEY);
        const cursor: SyncCursor = raw ? JSON.parse(raw) : emptyCursor();
        const { logs, ratings, journals, tasks, meta: localMeta } = latest.current;
        const result = await syncOnce({ logs, ratings, journals, tasks, meta: localMeta }, cursor);
        await AsyncStorage.setItem(CURSOR_KEY, JSON.stringify(result.cursor));
        if (result.incoming.length) applyRemote(result.incoming);
        setLastSyncedAt(new Date().toISOString());
        setRunState('idle');
      } catch (e) {
        setRunState(e instanceof CloudUnavailableError ? 'unavailable' : 'error');
      }
    } while (again.current);
    running.current = false;
  }, [supported, applyRemote]);

  // Push shortly after local edits settle.
  useEffect(() => {
    if (!hydrated || !cloudSync) return;
    const t = setTimeout(run, DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [hydrated, cloudSync, meta, run]);

  // Pull on foreground and periodically while open, since iCloud file changes don't notify us.
  useEffect(() => {
    if (!hydrated || !cloudSync || !supported) return;
    const sub = AppState.addEventListener('change', (s) => s === 'active' && run());
    const poll = setInterval(() => AppState.currentState === 'active' && run(), POLL_MS);
    return () => {
      sub.remove();
      clearInterval(poll);
    };
  }, [hydrated, cloudSync, supported, run]);

  const wipe = useCallback(async () => {
    await AsyncStorage.removeItem(CURSOR_KEY);
    if (supported) await wipeCloud().catch(() => {});
  }, [supported]);

  const api = useMemo<SyncApi>(() => ({ state, lastSyncedAt, syncNow: () => void run(), wipe }), [state, lastSyncedAt, run, wipe]);
  return <SyncContext.Provider value={api}>{children}</SyncContext.Provider>;
}
