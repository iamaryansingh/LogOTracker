import type { HealthProvider } from './shared';

// Fallback for platforms without a health store (web). Metro picks provider.ios.ts / provider.android.ts on devices.
export const healthProvider: HealthProvider = {
  name: 'Health',
  isSupported: async () => false,
  requestAccess: async () => false,
  fetch: async () => ({ source: 'hk', daily: {}, sleep: [], workouts: [] }),
};
