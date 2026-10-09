import { requireOptionalNativeModule } from 'expo';

interface SelfMirrorAlarmsNative {
  isAvailable(): boolean;
  requestAuthorization(): Promise<'authorized' | 'denied' | 'notDetermined' | 'unavailable'>;
  /** "ok", or iOS's reason for refusing. */
  schedule(id: string, epochSeconds: number, title: string): Promise<string>;
  /** Alarms this app has scheduled. `time` is epoch seconds (fixed alarms). */
  list(): { id: string; state: string; time?: number }[];
  cancel(id: string): Promise<boolean>;
}

// Optional so the app still runs where the module isn't built in (Expo Go, Android, older iOS builds).
const native = requireOptionalNativeModule<SelfMirrorAlarmsNative>('SelfMirrorAlarms');

export default native;
