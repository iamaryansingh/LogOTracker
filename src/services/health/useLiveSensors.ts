import { Accelerometer, Barometer, Pedometer } from 'expo-sensors';
import { useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';

export type Movement = 'still' | 'light' | 'active';

export interface LiveSensors {
  /** Today's steps, counting up live. */
  steps?: number;
  /** Steps per minute over the last minute. */
  cadence?: number;
  /** Metres climbed (+) or descended (−) since live started, from the barometer. */
  elevationM?: number;
  /** Air pressure in hPa. */
  pressureHpa?: number;
  movement?: Movement;
}

/**
 * The phone's own sensors, live, alongside the heart rate: steps and cadence (motion
 * coprocessor), height change and air pressure (barometer), and how much you're moving
 * (accelerometer). Runs only while `active`.
 */
export function useLiveSensors(active: boolean): LiveSensors {
  const [state, setState] = useState<LiveSensors>({});
  const stepLog = useRef<{ t: number; n: number }[]>([]);
  const motion = useRef<number[]>([]);

  useEffect(() => {
    if (!active) return;
    let alive = true;
    const subs: { remove: () => void }[] = [];

    // Steps: today's count so far, then live increments on top.
    if (Platform.OS === 'ios') {
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      Pedometer.getStepCountAsync(start, new Date())
        .then((base) => {
          if (!alive) return;
          setState((s) => ({ ...s, steps: base.steps }));
          subs.push(
            Pedometer.watchStepCount(({ steps }) => {
              const t = Date.now();
              stepLog.current = [...stepLog.current, { t, n: steps }].filter((x) => t - x.t <= 60_000);
              const first = stepLog.current[0];
              const span = (t - first.t) / 60_000;
              setState((s) => ({ ...s, steps: base.steps + steps, cadence: span >= 0.25 ? Math.round((steps - first.n) / span) : s.cadence }));
            }),
          );
        })
        .catch(() => undefined);
    }

    // Barometer: relative altitude (iOS) and pressure.
    Barometer.setUpdateInterval(2000);
    subs.push(
      Barometer.addListener(({ pressure, relativeAltitude }) =>
        setState((s) => ({ ...s, pressureHpa: Math.round(pressure * 10) / 10, elevationM: relativeAltitude !== undefined ? Math.round(relativeAltitude * 10) / 10 : s.elevationM })),
      ),
    );

    // Accelerometer: how far acceleration strays from gravity, averaged over ~3 s.
    Accelerometer.setUpdateInterval(200);
    subs.push(
      Accelerometer.addListener(({ x, y, z }) => {
        const dev = Math.abs(Math.sqrt(x * x + y * y + z * z) - 1);
        motion.current = [...motion.current.slice(-14), dev];
        const avg = motion.current.reduce((a, b) => a + b, 0) / motion.current.length;
        const movement: Movement = avg < 0.03 ? 'still' : avg < 0.15 ? 'light' : 'active';
        setState((s) => (s.movement === movement ? s : { ...s, movement }));
      }),
    );

    return () => {
      alive = false;
      subs.forEach((s) => s.remove());
      stepLog.current = [];
      motion.current = [];
    };
  }, [active]);

  return active ? state : {};
}
