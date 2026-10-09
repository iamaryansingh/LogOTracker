import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

import SelfMirrorAlarms from '../../modules/self-mirror-alarms';

/** Real alarms (they ring like the Clock app's, even in Silent mode) need iOS 26's AlarmKit. */
export const alarmsSupported = () => Platform.OS === 'ios' && (SelfMirrorAlarms?.isAvailable() ?? false);

// AlarmKit doesn't hand titles back, so they're remembered here by alarm id.
const TITLES_KEY = 'selfmirror/alarm-titles/v1';

const uuid = () =>
  'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });

export type AlarmResult = { ok: true; alarmId: string } | { ok: false; reason: 'unsupported' | 'denied' | 'failed'; message?: string };

async function titles(): Promise<Record<string, string>> {
  try {
    return JSON.parse((await AsyncStorage.getItem(TITLES_KEY)) ?? '{}');
  } catch {
    return {};
  }
}

export async function setAlarm(at: Date, title: string): Promise<AlarmResult> {
  if (!SelfMirrorAlarms || !alarmsSupported()) return { ok: false, reason: 'unsupported' };
  try {
    if ((await SelfMirrorAlarms.requestAuthorization()) !== 'authorized') return { ok: false, reason: 'denied' };
    const alarmId = uuid();
    const result = await SelfMirrorAlarms.schedule(alarmId, Math.floor(at.getTime() / 1000), title);
    if (result !== 'ok') return { ok: false, reason: 'failed', message: result };
    await AsyncStorage.setItem(TITLES_KEY, JSON.stringify({ ...(await titles()), [alarmId]: title }));
    return { ok: true, alarmId };
  } catch (e) {
    return { ok: false, reason: 'failed', message: e instanceof Error ? e.message : undefined };
  }
}

export async function cancelAlarm(alarmId: string): Promise<boolean> {
  try {
    return (await SelfMirrorAlarms?.cancel(alarmId)) ?? false;
  } catch {
    return false;
  }
}

export interface ScheduledAlarm {
  id: string;
  title: string;
  at?: Date;
  /** AlarmKit's state: scheduled, alerting… */
  state: string;
}

/** Every alarm Self Mirror has set that iOS still holds, soonest first. */
export async function listAlarms(): Promise<ScheduledAlarm[]> {
  if (!SelfMirrorAlarms || !alarmsSupported()) return [];
  const names = await titles();
  return SelfMirrorAlarms.list()
    .map((a) => ({ id: a.id, state: a.state, at: a.time ? new Date(a.time * 1000) : undefined, title: names[a.id.toLowerCase()] ?? names[a.id] ?? 'Alarm' }))
    .sort((a, b) => (a.at?.getTime() ?? 0) - (b.at?.getTime() ?? 0));
}
