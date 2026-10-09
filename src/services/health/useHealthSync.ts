import { useEffect, useRef } from 'react';
import { AppState, Platform } from 'react-native';

import { useAppStore } from '../../state/AppStore';
import { healthProvider } from './provider';
import { validateHealth } from './validate';

const SYNC_DAYS = 14;
const MIN_INTERVAL_MS = 5 * 60_000;

/** Pulls recent health data when Health is switched on: at launch and whenever the app returns to the foreground. */
export function useHealthSync() {
  const { inputs, syncHealth, hydrated } = useAppStore();
  // Only the iPhone imports Health; the iPad receives those entries through iCloud, which avoids duplicates.
  const enabled = hydrated && inputs.Health && !(Platform.OS === 'ios' && Platform.isPad);
  const lastRun = useRef(0);

  useEffect(() => {
    if (!enabled) return;
    let alive = true;

    const run = async (force = false) => {
      if (!force && Date.now() - lastRun.current < MIN_INTERVAL_MS) return;
      lastRun.current = Date.now();
      try {
        if (!(await healthProvider.isSupported())) return;
        // Nothing from Health is used until it has been validated and dated correctly.
        const { snapshot, report } = validateHealth(await healthProvider.fetch(SYNC_DAYS));
        if (alive) syncHealth(snapshot, report);
      } catch {
        // A failed sync leaves existing data untouched; the next foreground retries.
      }
    };

    run(true);
    const sub = AppState.addEventListener('change', (s) => s === 'active' && run());
    return () => {
      alive = false;
      sub.remove();
    };
  }, [enabled, syncHealth]);
}
