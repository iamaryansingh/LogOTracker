import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Linking from 'expo-linking';
import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import * as TaskManager from 'expo-task-manager';
import { Platform } from 'react-native';

import { activityQuestion, inferActivity } from '../../domain/activity';
import type { LocationPoint } from '../../domain/memoryTypes';
import { dwellLabel } from '../../domain/narrative';
import { detectStays, distanceM, findHome, STAY_RADIUS_M } from '../../domain/spatial';
import { toISODate } from '../../utils/time';
import { nearestPlace } from './places';
import { appendPoints, loadPoints } from './points';

/**
 * Background location for Memories. Low power: "balanced" accuracy and a 60 m distance filter,
 * so iOS wakes the app only when you actually move. Runs on iPhone only.
 */
export const LOCATION_TASK = 'selfmirror-memories-location';
const STATE_KEY = 'selfmirror/state/v2';
const PROMPTED_KEY = 'selfmirror/prompted/v1';

const PROMPT_MIN_STAY_MIN = 40;
const MAX_PROMPTS_PER_DAY = 3;
const QUIET_FROM = 22;
const QUIET_UNTIL = 8;

const PHOTO_PROMPT_ID = 'selfmirror-photo-prompt';
const PHOTO_KEY = 'selfmirror/photo-prompt/v1';
// Long enough to know you've arrived and stayed, not just stopped at a light.
const PHOTO_AFTER_MIN = 10;
/** Notification category whose button opens the camera. */
export const SNAP_CATEGORY = 'selfmirror-snap';
const MAX_PHOTO_PROMPTS_PER_DAY = 3;

interface PhotoPromptState {
  /** The prompt waiting to go off, and where it was set. */
  pending?: { lat: number; lon: number; fireAt: number };
  /** The last one that went off, so the same visit isn't asked about twice. */
  lastFired?: { lat: number; lon: number; t: number };
  fired?: number[];
}

const isQuiet = (t: number) => {
  const h = new Date(t).getHours();
  return h >= QUIET_FROM || h < QUIET_UNTIL;
};

const NORMAL_UPDATES: Location.LocationTaskOptions = {
  accuracy: Location.Accuracy.Balanced,
  distanceInterval: 60,
  activityType: Location.ActivityType.Other,
  pausesUpdatesAutomatically: false,
  showsBackgroundLocationIndicator: false,
};

// While a live memory records: finer fixes, so parking, short stops and the route are caught.
const LIVE_UPDATES: Location.LocationTaskOptions = {
  ...NORMAL_UPDATES,
  accuracy: Location.Accuracy.High,
  distanceInterval: 20,
  showsBackgroundLocationIndicator: true,
};

export const memoriesSupported = Platform.OS === 'ios' && !Platform.isPad;

interface StoredSettings {
  memories?: { enabled?: boolean; prompts?: boolean; home?: { latitude: number; longitude: number } };
}

/** The home the user set, else the guess from overnight stays. No prompts within 200 m of it. */
const homeOf = (s: StoredSettings['memories'], points: LocationPoint[]) =>
  s?.home ? { lat: s.home.latitude, lon: s.home.longitude } : findHome(points);

async function settings(): Promise<StoredSettings['memories']> {
  try {
    const raw = await AsyncStorage.getItem(STATE_KEY);
    return raw ? (JSON.parse(raw) as StoredSettings).memories : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Smart prompt: when you've just left somewhere you stayed a while (not home), ask one gentle
 * question about it. Quiet overnight, capped per day, and never twice for the same stay.
 */
async function maybePrompt(): Promise<void> {
  const s = await settings();
  if (!s?.enabled || !s.prompts) return;
  const now = new Date();
  const h = now.getHours();
  if (h >= QUIET_FROM || h < QUIET_UNTIL) return;

  const points = await loadPoints();
  const recent = points.filter((p) => p.t > now.getTime() - 10 * 3_600_000);
  const latest = recent[recent.length - 1];
  if (!latest) return;
  const stays = detectStays(recent);
  const left = [...stays].reverse().find((st) => distanceM(st, latest) > 250 && latest.t - st.end < 30 * 60_000);
  if (!left) return;
  const minutes = (left.end - left.start) / 60_000;
  if (minutes < PROMPT_MIN_STAY_MIN) return;
  const home = homeOf(s, points);
  if (home && distanceM(home, left) < 200) return;

  // Already asked for a photo during this visit; one nudge per place is enough.
  const photo = JSON.parse((await AsyncStorage.getItem(PHOTO_KEY)) ?? '{}') as PhotoPromptState;
  if (photo.lastFired && distanceM(photo.lastFired, left) < 250 && photo.lastFired.t >= left.start && photo.lastFired.t <= left.end + 30 * 60_000) return;

  const prompted = JSON.parse((await AsyncStorage.getItem(PROMPTED_KEY)) ?? '{}') as Record<string, number>;
  const stayKey = `${left.lat.toFixed(4)},${left.lon.toFixed(4)},${Math.round(left.start / 60_000)}`;
  const today = toISODate(now);
  const todayCount = Object.values(prompted).filter((t) => toISODate(new Date(t)) === today).length;
  if (prompted[stayKey] || todayCount >= MAX_PROMPTS_PER_DAY) return;

  let place = 'there';
  try {
    const [addr] = await Location.reverseGeocodeAsync({ latitude: left.lat, longitude: left.lon });
    place = addr?.name || addr?.street || addr?.district || place;
  } catch {
    // Offline or rate-limited; the generic wording still works.
  }
  await Notifications.scheduleNotificationAsync({
    content: {
      title: place === 'there' ? 'How was that stop?' : `How was ${place}?`,
      body: `You spent ${dwellLabel(minutes)} there. Add a line to today’s memory.`,
      data: { url: Linking.createURL(`memory/${toISODate(new Date(left.start))}`) },
    },
    trigger: null,
  });
  // Keep a week of history; that's enough to never repeat.
  const week = now.getTime() - 7 * 86_400_000;
  const kept = Object.fromEntries(Object.entries(prompted).filter(([, t]) => t > week));
  await AsyncStorage.setItem(PROMPTED_KEY, JSON.stringify({ ...kept, [stayKey]: now.getTime() }));
}

/**
 * "Take a picture" nudge, 30 minutes into a stay. iOS only wakes the app when you move, so each
 * wake (re)sets a notification for 30 minutes later: if you stay put, it goes off; if you move on,
 * the next wake cancels it. Small moves within the same place keep the original timer.
 */
async function reschedulePhotoPrompt(points: LocationPoint[]): Promise<void> {
  const s = await settings();
  if (!s?.enabled || !s.prompts) return;
  const latest = points[points.length - 1];
  if (!latest) return;
  const now = Date.now();
  const state = JSON.parse((await AsyncStorage.getItem(PHOTO_KEY)) ?? '{}') as PhotoPromptState;
  const fired = (state.fired ?? []).filter((t) => t > now - 7 * 86_400_000);
  const save = (next: PhotoPromptState) => AsyncStorage.setItem(PHOTO_KEY, JSON.stringify({ ...next, fired }));

  let { pending, lastFired } = state;
  if (pending && pending.fireAt <= now) {
    fired.push(pending.fireAt);
    lastFired = { lat: pending.lat, lon: pending.lon, t: pending.fireAt };
    pending = undefined;
  }
  // Still in the same place: let the running timer finish.
  if (pending && distanceM(pending, latest) <= STAY_RADIUS_M) return save({ pending, lastFired });

  await Notifications.cancelScheduledNotificationAsync(PHOTO_PROMPT_ID).catch(() => undefined);
  const fireAt = now + PHOTO_AFTER_MIN * 60_000;
  const today = toISODate(new Date(now));
  const skip =
    isQuiet(fireAt) ||
    fired.filter((t) => toISODate(new Date(t)) === today).length >= MAX_PHOTO_PROMPTS_PER_DAY ||
    (lastFired && distanceM(lastFired, latest) < 250 && now - lastFired.t < 4 * 3_600_000);
  const home = homeOf(s, points);
  if (skip || (home && distanceM(home, latest) < 200)) return save({ lastFired });

  const poi = await nearestPlace(latest.lat, latest.lon, 80);
  const activity = poi ? inferActivity(poi.category, poi.name, new Date(now), 45) : undefined;
  await Notifications.scheduleNotificationAsync({
    identifier: PHOTO_PROMPT_ID,
    content: {
      title: activity ? `${activity.emoji} ${activityQuestion(activity)}` : poi ? `📍 You’re at ${poi.name}` : '📍 Somewhere worth remembering?',
      body: 'Tap to snap a photo. It goes straight into today’s memory.',
      categoryIdentifier: SNAP_CATEGORY,
      // Opens the camera in Self Mirror, already knowing the place.
      data: {
        url: Linking.createURL('snap', {
          queryParams: poi ? { lat: String(poi.latitude), lon: String(poi.longitude), name: poi.name } : { lat: String(latest.lat), lon: String(latest.lon) },
        }),
      },
    },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: fireAt },
  });
  return save({ pending: { lat: latest.lat, lon: latest.lon, fireAt }, lastFired });
}

// Must be defined at module load, before the app renders, so iOS can wake the task in the background.
if (memoriesSupported) {
  TaskManager.defineTask<{ locations: Location.LocationObject[] }>(LOCATION_TASK, async ({ data, error }) => {
    if (error || !data?.locations?.length) return;
    await appendPoints(
      data.locations.map((l) => ({ t: l.timestamp, lat: l.coords.latitude, lon: l.coords.longitude, acc: l.coords.accuracy ?? undefined, s: l.coords.speed ?? undefined })),
    );
    await reschedulePhotoPrompt(await loadPoints()).catch(() => undefined);
    await maybePrompt().catch(() => undefined);
  });
}

export type TrackingResult = { ok: true } | { ok: false; reason: 'unsupported' | 'foreground-denied' | 'background-denied' };

/** Asks for "Always" location (iOS shows "While Using" first, then upgrades) and starts background updates. */
export async function startTracking(): Promise<TrackingResult> {
  if (!memoriesSupported) return { ok: false, reason: 'unsupported' };
  const fg = await Location.requestForegroundPermissionsAsync();
  if (fg.status !== 'granted') return { ok: false, reason: 'foreground-denied' };
  const bg = await Location.requestBackgroundPermissionsAsync();
  if (bg.status !== 'granted') return { ok: false, reason: 'background-denied' };
  if (!(await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK))) {
    await Location.startLocationUpdatesAsync(LOCATION_TASK, NORMAL_UPDATES);
  }
  await recordNow();
  return { ok: true };
}

/** Finer tracking while a live memory records; back to battery-friendly when it ends. */
export async function setLiveMode(on: boolean): Promise<void> {
  if (!memoriesSupported) return;
  if (await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK).catch(() => false)) {
    await Location.stopLocationUpdatesAsync(LOCATION_TASK);
  }
  await Location.startLocationUpdatesAsync(LOCATION_TASK, on ? LIVE_UPDATES : NORMAL_UPDATES);
  await recordNow();
}

export async function stopTracking(): Promise<void> {
  if (!memoriesSupported) return;
  if (await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK).catch(() => false)) {
    await Location.stopLocationUpdatesAsync(LOCATION_TASK);
  }
}

/** A fresh fix whenever the app opens, so today's memory is current even after a quiet stretch. */
export async function recordNow(): Promise<void> {
  if (!memoriesSupported) return;
  const perm = await Location.getForegroundPermissionsAsync();
  if (perm.status !== 'granted') return;
  const l = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }).catch(() => null);
  if (l) await appendPoints([{ t: l.timestamp, lat: l.coords.latitude, lon: l.coords.longitude, acc: l.coords.accuracy ?? undefined, s: l.coords.speed ?? undefined }]);
}

export async function isTracking(): Promise<boolean> {
  if (!memoriesSupported) return false;
  return Location.hasStartedLocationUpdatesAsync(LOCATION_TASK).catch(() => false);
}

/** Asks once for notification permission, for smart prompts. */
export async function enablePrompts(): Promise<boolean> {
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  return (await Notifications.requestPermissionsAsync({ ios: { allowAlert: true, allowSound: true, allowBadge: false } })).granted;
}
