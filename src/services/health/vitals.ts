import type { VitalsSnapshot } from './vitalsTypes';

// Whoop-style vitals come from Apple Health; elsewhere (Android, web) there's nothing to read yet.
export const vitalsSupported = false;
export async function readVitals(): Promise<VitalsSnapshot | null> {
  return null;
}
