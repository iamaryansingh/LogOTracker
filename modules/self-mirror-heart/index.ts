import { requireOptionalNativeModule } from 'expo';

type EventSubscription = { remove(): void };

export interface HeartReading {
  bpm: number;
  /** Beat-to-beat intervals in ms, when the monitor sends them (for live HRV). */
  rr: number[];
  device: string;
}

export type HeartStatus = 'scanning' | 'connecting' | 'connected' | 'disconnected' | 'failed' | 'stopped' | 'bluetooth-off' | 'unauthorized' | 'unsupported' | 'waiting';

export type SleepStage = 'awake' | 'light' | 'deep' | 'rem';

export interface SleepStatus {
  active: boolean;
  started?: number; // epoch s
  onset?: number;
  stage?: SleepStage;
  /** Which REM period triggers the alarm. */
  target?: number;
  /** Start of each REM period so far (epoch s). */
  remPeriods?: number[];
  /** When the smart alarm will ring, once the target REM began. */
  alarmAt?: number;
  /** The safety-net alarm, while it's still set. */
  latestWake?: number;
  epochs?: { t: number; hr: number; stage: SleepStage }[];
}

interface SelfMirrorHeartNative {
  start(): void;
  stop(): void;
  /** "ok", or why the safety-net alarm couldn't be set. */
  startSleep(remCycle: number, latestWakeEpochSeconds: number): Promise<string>;
  stopSleep(): Promise<void>;
  sleepStatus(): SleepStatus;
  addListener(event: 'onHeartRate', listener: (r: HeartReading) => void): EventSubscription;
  addListener(event: 'onStatus', listener: (s: { status: HeartStatus; device: string }) => void): EventSubscription;
  addListener(event: 'onSleep', listener: (e: { remPeriod: number }) => void): EventSubscription;
}

// Optional so the app still runs where the module isn't built in (Expo Go, Android, older builds).
const native = requireOptionalNativeModule<SelfMirrorHeartNative>('SelfMirrorHeart');

export default native;
