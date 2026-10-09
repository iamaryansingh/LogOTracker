// The legacy entry point works in Expo Go; the newer API is stubbed out there.
import { getCalendarPermissionsAsync, requestCalendarPermissionsAsync } from 'expo-calendar/legacy';
import * as Location from 'expo-location';
import { Pedometer } from 'expo-sensors';

import type { InputSource } from '../domain/types';
import { healthProvider } from './health/provider';

export type AccessStatus = 'granted' | 'denied' | 'undetermined' | 'unavailable';

interface PermissionLike {
  status: string;
}

const toStatus = (r: PermissionLike): AccessStatus =>
  r.status === 'granted' ? 'granted' : r.status === 'denied' ? 'denied' : 'undetermined';


async function motionAvailable(): Promise<boolean> {
  try {
    return await Pedometer.isAvailableAsync();
  } catch {
    return false;
  }
}

export async function getAccess(source: InputSource): Promise<AccessStatus> {
  try {
    switch (source) {
      case 'Calendar':
        return toStatus(await getCalendarPermissionsAsync());
      case 'Location':
        return toStatus(await Location.getForegroundPermissionsAsync());
      case 'Motion':
        return (await motionAvailable()) ? toStatus(await Pedometer.getPermissionsAsync()) : 'unavailable';
      case 'Health':
        return (await healthProvider.isSupported()) ? 'undetermined' : 'unavailable';
    }
  } catch {
    return 'unavailable';
  }
}

/** Shows the system prompt (only if it hasn't been answered yet) and returns the result. */
export async function requestAccess(source: InputSource): Promise<AccessStatus> {
  try {
    switch (source) {
      case 'Calendar':
        return toStatus(await requestCalendarPermissionsAsync());
      case 'Location':
        return toStatus(await Location.requestForegroundPermissionsAsync());
      case 'Motion':
        return (await motionAvailable()) ? toStatus(await Pedometer.requestPermissionsAsync()) : 'unavailable';
      case 'Health':
        if (!(await healthProvider.isSupported())) return 'unavailable';
        return (await healthProvider.requestAccess()) ? 'granted' : 'denied';
    }
  } catch {
    return 'unavailable';
  }
}
