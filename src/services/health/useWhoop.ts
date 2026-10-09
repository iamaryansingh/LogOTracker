import { useCallback, useEffect, useState } from 'react';
import { AppState } from 'react-native';

import { cachedWhoop, fetchWhoop, whoopStatus, type WhoopSnapshot } from './whoop';

/**
 * WHOOP numbers with the cached copy shown at once, then refreshed. `liveMs` keeps refreshing on
 * an interval while the screen is open (strain climbs through the day).
 */
export function useWhoop(liveMs?: number) {
  const [status, setStatus] = useState<'loading' | 'none' | 'app' | 'connected'>('loading');
  const [data, setData] = useState<WhoopSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Strain as it climbs while the screen is open, one point per refresh.
  const [strainLog, setStrainLog] = useState<{ t: number; strain: number }[]>([]);

  const refresh = useCallback(async () => {
    const s = await whoopStatus();
    setStatus(s);
    if (s !== 'connected') return;
    try {
      const fresh = await fetchWhoop();
      setData(fresh);
      if (fresh.cycle) {
        const strain = fresh.cycle.strain;
        setStrainLog((xs) => (xs[xs.length - 1]?.strain === strain ? xs : [...xs.slice(-120), { t: Date.now(), strain }]));
      }
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Couldn’t reach WHOOP.');
    }
  }, []);

  useEffect(() => {
    let live = true;
    // Show the cached numbers at once, then fetch fresh ones.
    cachedWhoop()
      .then((c) => live && c && setData(c))
      .finally(() => live && refresh());
    const sub = AppState.addEventListener('change', (st) => st === 'active' && refresh());
    const timer = liveMs ? setInterval(refresh, liveMs) : undefined;
    return () => {
      live = false;
      sub.remove();
      if (timer) clearInterval(timer);
    };
  }, [refresh, liveMs]);

  return { status, data, error, refresh, strainLog };
}
