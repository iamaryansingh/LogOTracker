import { Pedometer } from 'expo-sensors';
import { useEffect, useState } from 'react';
import { AppState, Platform } from 'react-native';

/** Today's step count from the phone's motion coprocessor, or null when unavailable or not allowed. */
export function useTodaySteps(enabled: boolean): number | null {
  const [steps, setSteps] = useState<number | null>(null);

  useEffect(() => {
    // Android only supports live step subscriptions, not historical ranges.
    if (!enabled || Platform.OS !== 'ios') return;
    let alive = true;
    const read = () => {
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      Pedometer.getStepCountAsync(start, new Date())
        .then((r) => alive && setSteps(r.steps))
        .catch(() => alive && setSteps(null));
    };
    read();
    const sub = AppState.addEventListener('change', (s) => s === 'active' && read());
    return () => {
      alive = false;
      sub.remove();
    };
  }, [enabled]);

  return enabled ? steps : null;
}
