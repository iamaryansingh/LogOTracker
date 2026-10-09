import { useCallback, useEffect, useRef, useState } from 'react';

import SelfMirrorHeart, { type HeartStatus } from '../../../modules/self-mirror-heart';
import { rmssd, strainFrom } from '../../domain/recovery';

export const liveHeartSupported = !!SelfMirrorHeart;

const WINDOW_MS = 5 * 60_000;
const HRV_WINDOW_MS = 60_000;

export interface LiveHeart {
  status: HeartStatus | 'idle';
  device?: string;
  bpm?: number;
  /** Last 5 minutes, for the trend line. */
  recent: { t: number; bpm: number }[];
  /** Live HRV (RMSSD) over the last minute, when the monitor sends beat-to-beat data. */
  hrv?: number;
  session: { since: number; avg: number; max: number; min: number; strain?: number; zoneMinutes: number[] } | null;
  start: () => void;
  stop: () => void;
}

/** Streams heart rate from a Bluetooth monitor while `start`ed; stops when the screen closes. */
export function useLiveHeart(maxHr = 190): LiveHeart {
  const [status, setStatus] = useState<LiveHeart['status']>('idle');
  const [device, setDevice] = useState<string>();
  const [readings, setReadings] = useState<{ t: number; bpm: number }[]>([]);
  const [hrv, setHrv] = useState<number>();
  const rr = useRef<{ t: number; ms: number }[]>([]);

  useEffect(() => {
    const heart = SelfMirrorHeart;
    if (!heart) return;
    const a = heart.addListener('onHeartRate', (r) => {
      const t = Date.now();
      if (r.bpm > 25 && r.bpm < 240) setReadings((xs) => [...xs.slice(-14_400), { t, bpm: r.bpm }]);
      setDevice(r.device);
      if (r.rr.length) {
        rr.current = [...rr.current, ...r.rr.map((ms) => ({ t, ms }))].filter((x) => t - x.t <= HRV_WINDOW_MS);
        setHrv(rmssd(rr.current.map((x) => x.ms)));
      }
    });
    const b = heart.addListener('onStatus', (s) => {
      setStatus(s.status);
      if (s.device) setDevice(s.device);
    });
    return () => {
      a.remove();
      b.remove();
      heart.stop();
    };
  }, []);

  const start = useCallback(() => {
    setReadings([]);
    rr.current = [];
    setHrv(undefined);
    setStatus('scanning');
    SelfMirrorHeart?.start();
  }, []);
  const stop = useCallback(() => SelfMirrorHeart?.stop(), []);

  const latest = readings[readings.length - 1];
  const recent = latest ? readings.filter((r) => latest.t - r.t <= WINDOW_MS) : [];
  const bpms = readings.map((r) => r.bpm);
  const strain = strainFrom(readings, maxHr);
  return {
    status,
    device,
    bpm: latest?.bpm,
    recent,
    hrv,
    session: readings.length
      ? {
          since: readings[0].t,
          avg: Math.round(bpms.reduce((s, x) => s + x, 0) / bpms.length),
          max: Math.max(...bpms),
          min: Math.min(...bpms),
          strain: strain?.value,
          zoneMinutes: strain?.zoneMinutes ?? [0, 0, 0, 0, 0],
        }
      : null,
    start,
    stop,
  };
}
