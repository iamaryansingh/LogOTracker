import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Linking from 'expo-linking';
import * as SecureStore from 'expo-secure-store';
import * as WebBrowser from 'expo-web-browser';

/**
 * Live numbers straight from WHOOP's API (v2): today's recovery, strain, last night's sleep and
 * workouts, exactly as the WHOOP app shows them.
 *
 * WHOOP only gives API access to registered developer apps and needs the app's secret to sign in,
 * so the user creates their own (free) app at developer-dashboard.whoop.com and pastes its Client ID
 * and Secret here once. Those and the sign-in tokens live in the iOS Keychain (SecureStore); only
 * the latest numbers are cached in plain storage, for the Today card.
 */

const AUTH_URL = 'https://api.prod.whoop.com/oauth/oauth2/auth';
const TOKEN_URL = 'https://api.prod.whoop.com/oauth/oauth2/token';
const API = 'https://api.prod.whoop.com/developer';
/** Register exactly this as the Redirect URL in the WHOOP developer app. */
export const WHOOP_REDIRECT = 'selfmirror://whoop';
const SCOPES = 'offline read:recovery read:cycles read:sleep read:workout read:profile read:body_measurement';
const SECRET_KEY = 'selfmirror.whoop';
const CACHE_KEY = 'selfmirror/whoop-cache/v1';

interface WhoopAuth {
  clientId: string;
  clientSecret: string;
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: number;
}

export interface WhoopSnapshot {
  firstName?: string;
  recovery?: { score: number; hrvMs: number; restingHr: number; spo2?: number; skinTempC?: number; calibrating: boolean; at: string };
  cycle?: { strain: number; kilojoule: number; averageHr: number; maxHr: number; start: string; end?: string };
  sleep?: {
    start: string;
    end: string;
    performance?: number;
    efficiency?: number;
    consistency?: number;
    respiratoryRate?: number;
    /** Minutes. */
    inBed: number;
    awake: number;
    light: number;
    deep: number;
    rem: number;
    needMin?: number;
    disturbances?: number;
  };
  workouts: { sport: string; strain?: number; start: string; end: string; averageHr?: number; kilojoule?: number }[];
  maxHr?: number;
  fetchedAt: string;
}

async function readAuth(): Promise<WhoopAuth | null> {
  try {
    const raw = await SecureStore.getItemAsync(SECRET_KEY);
    return raw ? (JSON.parse(raw) as WhoopAuth) : null;
  } catch {
    return null;
  }
}

const writeAuth = (auth: WhoopAuth) => SecureStore.setItemAsync(SECRET_KEY, JSON.stringify(auth));

/** 'none': no developer app yet; 'app': app saved but not signed in; 'connected'. */
export async function whoopStatus(): Promise<'none' | 'app' | 'connected'> {
  const auth = await readAuth();
  return !auth ? 'none' : auth.refreshToken || auth.accessToken ? 'connected' : 'app';
}

export async function saveWhoopApp(clientId: string, clientSecret: string) {
  await writeAuth({ clientId: clientId.trim(), clientSecret: clientSecret.trim() });
}

export async function disconnectWhoop() {
  await SecureStore.deleteItemAsync(SECRET_KEY).catch(() => undefined);
  await AsyncStorage.removeItem(CACHE_KEY);
}

async function tokenRequest(body: Record<string, string>): Promise<{ access_token: string; refresh_token?: string; expires_in: number }> {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: Object.entries(body)
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
      .join('&'),
  });
  if (!res.ok) throw new Error(`WHOOP sign-in failed (${res.status})`);
  return res.json();
}

export type ConnectResult = { ok: true } | { ok: false; reason: string };

/** Opens WHOOP's sign-in page; on approval, trades the code for tokens and stores them. */
export async function connectWhoop(): Promise<ConnectResult> {
  const auth = await readAuth();
  if (!auth) return { ok: false, reason: 'Add your WHOOP app’s Client ID and Secret first.' };
  // WHOOP asks for an 8-character state to guard the redirect.
  const state = Math.random().toString(36).slice(2, 10).padEnd(8, '0');
  const url =
    `${AUTH_URL}?response_type=code&client_id=${encodeURIComponent(auth.clientId)}` +
    `&redirect_uri=${encodeURIComponent(WHOOP_REDIRECT)}&scope=${encodeURIComponent(SCOPES)}&state=${state}`;
  const result = await WebBrowser.openAuthSessionAsync(url, WHOOP_REDIRECT);
  if (result.type !== 'success') return { ok: false, reason: 'Sign-in was cancelled.' };

  const params = Linking.parse(result.url).queryParams ?? {};
  if (params.error) return { ok: false, reason: String(params.error_description ?? params.error) };
  if (params.state !== state || typeof params.code !== 'string') return { ok: false, reason: 'WHOOP sent back an unexpected answer. Try again.' };

  try {
    const t = await tokenRequest({
      grant_type: 'authorization_code',
      code: params.code,
      client_id: auth.clientId,
      client_secret: auth.clientSecret,
      redirect_uri: WHOOP_REDIRECT,
    });
    await writeAuth({ ...auth, accessToken: t.access_token, refreshToken: t.refresh_token, expiresAt: Date.now() + t.expires_in * 1000 });
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : 'Couldn’t finish signing in.' };
  }
}

/** A valid access token, refreshed when it's about to expire. */
async function accessToken(): Promise<string> {
  const auth = await readAuth();
  if (!auth?.accessToken) throw new Error('Not connected to WHOOP');
  if (auth.expiresAt && auth.expiresAt - 60_000 > Date.now()) return auth.accessToken;
  if (!auth.refreshToken) throw new Error('WHOOP sign-in expired. Connect again.');
  const t = await tokenRequest({
    grant_type: 'refresh_token',
    refresh_token: auth.refreshToken,
    client_id: auth.clientId,
    client_secret: auth.clientSecret,
    scope: 'offline',
  });
  await writeAuth({ ...auth, accessToken: t.access_token, refreshToken: t.refresh_token ?? auth.refreshToken, expiresAt: Date.now() + t.expires_in * 1000 });
  return t.access_token;
}

async function get<T>(path: string, token: string): Promise<T | undefined> {
  const res = await fetch(`${API}${path}`, { headers: { Authorization: `Bearer ${token}` } });
  if (res.status === 401) throw new Error('WHOOP sign-in expired. Connect again.');
  if (!res.ok) return undefined;
  return res.json() as Promise<T>;
}

type Collection<T> = { records: T[] };
type Scored<S> = { score_state: string; score?: S };
const min = (ms?: number) => Math.round((ms ?? 0) / 60_000);

/** Fetches the latest from WHOOP and caches it for the Today card. */
export async function fetchWhoop(): Promise<WhoopSnapshot> {
  const token = await accessToken();
  const [profile, body, recoveries, cycles, sleeps, workouts] = await Promise.all([
    get<{ first_name?: string }>('/v2/user/profile/basic', token),
    get<{ max_heart_rate?: number }>('/v2/user/measurement/body', token),
    get<Collection<Scored<{ recovery_score: number; resting_heart_rate: number; hrv_rmssd_milli: number; spo2_percentage?: number; skin_temp_celsius?: number; user_calibrating: boolean }> & { created_at: string }>>('/v2/recovery?limit=1', token),
    get<Collection<Scored<{ strain: number; kilojoule: number; average_heart_rate: number; max_heart_rate: number }> & { start: string; end?: string }>>('/v2/cycle?limit=1', token),
    get<Collection<Scored<{
      stage_summary: { total_in_bed_time_milli: number; total_awake_time_milli: number; total_light_sleep_time_milli: number; total_slow_wave_sleep_time_milli: number; total_rem_sleep_time_milli: number; disturbance_count?: number };
      sleep_needed?: { baseline_milli: number; need_from_sleep_debt_milli: number; need_from_recent_strain_milli: number; need_from_recent_nap_milli: number };
      respiratory_rate?: number;
      sleep_performance_percentage?: number;
      sleep_efficiency_percentage?: number;
      sleep_consistency_percentage?: number;
    }> & { start: string; end: string; nap: boolean }>>('/v2/activity/sleep?limit=5', token),
    get<Collection<Scored<{ strain: number; average_heart_rate?: number; kilojoule?: number }> & { start: string; end: string; sport_name?: string }>>('/v2/activity/workout?limit=5', token),
  ]);

  const r = recoveries?.records.find((x) => x.score_state === 'SCORED' && x.score);
  const c = cycles?.records[0];
  const s = sleeps?.records.find((x) => !x.nap && x.score_state === 'SCORED' && x.score);
  const need = s?.score?.sleep_needed;
  const snapshot: WhoopSnapshot = {
    firstName: profile?.first_name,
    maxHr: body?.max_heart_rate,
    recovery: r?.score && {
      score: Math.round(r.score.recovery_score),
      hrvMs: Math.round(r.score.hrv_rmssd_milli),
      restingHr: Math.round(r.score.resting_heart_rate),
      spo2: r.score.spo2_percentage,
      skinTempC: r.score.skin_temp_celsius,
      calibrating: r.score.user_calibrating,
      at: r.created_at,
    },
    cycle: c?.score && {
      strain: Math.round(c.score.strain * 10) / 10,
      kilojoule: c.score.kilojoule,
      averageHr: c.score.average_heart_rate,
      maxHr: c.score.max_heart_rate,
      start: c.start,
      end: c.end,
    },
    sleep: s?.score && {
      start: s.start,
      end: s.end,
      performance: s.score.sleep_performance_percentage,
      efficiency: s.score.sleep_efficiency_percentage,
      consistency: s.score.sleep_consistency_percentage,
      respiratoryRate: s.score.respiratory_rate,
      inBed: min(s.score.stage_summary.total_in_bed_time_milli),
      awake: min(s.score.stage_summary.total_awake_time_milli),
      light: min(s.score.stage_summary.total_light_sleep_time_milli),
      deep: min(s.score.stage_summary.total_slow_wave_sleep_time_milli),
      rem: min(s.score.stage_summary.total_rem_sleep_time_milli),
      disturbances: s.score.stage_summary.disturbance_count,
      needMin: need ? min(need.baseline_milli + need.need_from_sleep_debt_milli + need.need_from_recent_strain_milli - need.need_from_recent_nap_milli) : undefined,
    },
    workouts: (workouts?.records ?? [])
      .filter((w) => w.score_state === 'SCORED')
      .map((w) => ({ sport: w.sport_name ?? 'Workout', strain: w.score?.strain, start: w.start, end: w.end, averageHr: w.score?.average_heart_rate, kilojoule: w.score?.kilojoule })),
    fetchedAt: new Date().toISOString(),
  };
  await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(snapshot)).catch(() => undefined);
  return snapshot;
}

/** The last numbers fetched, for showing instantly before a refresh. */
export async function cachedWhoop(): Promise<WhoopSnapshot | null> {
  try {
    const raw = await AsyncStorage.getItem(CACHE_KEY);
    return raw ? (JSON.parse(raw) as WhoopSnapshot) : null;
  } catch {
    return null;
  }
}
