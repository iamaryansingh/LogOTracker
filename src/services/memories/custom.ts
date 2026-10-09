import { Directory, File, Paths } from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import * as MediaLibrary from 'expo-media-library/legacy';
import { Linking, Platform } from 'react-native';

import SelfMirrorVision from '../../../modules/self-mirror-vision';
import type { MemoryPlace } from '../../domain/memoryTypes';
import type { PhotoSignals } from '../../domain/photoCaption';
import { lookupPlace } from './enrich';

/** Photos for memories you make are copied into the app, so they stay even if deleted from Photos. */
const folder = () => {
  const dir = new Directory(Paths.document, 'memories');
  if (!dir.exists) dir.create({ intermediates: true });
  return dir;
};

const newName = (ext: string) => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}.${ext}`;

/** Stored file names resolve into the app folder; library URIs (ph://, file://) from live memories pass through. */
export const memoryPhotoUri = (name: string) => (name.includes('://') ? name : new File(folder(), name).uri);

export function deleteMemoryPhotos(names: string[]) {
  // Library photos referenced by live memories belong to Photos, not the app.
  for (const n of names.filter((x) => !x.includes('://'))) {
    try {
      const f = new File(folder(), n);
      if (f.exists) f.delete();
    } catch {
      // Already gone.
    }
  }
}

export interface PickedPhoto {
  name: string;
  lat?: number;
  lon?: number;
  /** Epoch ms the photo was taken, when known. */
  takenAt?: number;
}

type Exif = Record<string, unknown>;
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' && v.trim() !== '' && Number.isFinite(+v) ? +v : undefined);

/** "2024:06:01 14:22:10" → epoch ms (local time). */
function exifDate(v: unknown): number | undefined {
  if (typeof v !== 'string') return undefined;
  const m = v.match(/^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/);
  return m ? new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]).getTime() : undefined;
}

/** GPS and capture time from EXIF; iOS nests them under {GPS} / {Exif}, Android keeps them flat. */
function fromExif(exif: Exif | null | undefined): Omit<PickedPhoto, 'name'> {
  if (!exif) return {};
  const gps = (exif['{GPS}'] as Exif | undefined) ?? {};
  const ex = (exif['{Exif}'] as Exif | undefined) ?? {};
  let lat = num(gps.Latitude) ?? num(exif.GPSLatitude);
  let lon = num(gps.Longitude) ?? num(exif.GPSLongitude);
  if (lat !== undefined && (gps.LatitudeRef ?? exif.GPSLatitudeRef) === 'S') lat = -Math.abs(lat);
  if (lon !== undefined && (gps.LongitudeRef ?? exif.GPSLongitudeRef) === 'W') lon = -Math.abs(lon);
  const takenAt = exifDate(ex.DateTimeOriginal) ?? exifDate(exif.DateTimeOriginal) ?? exifDate(exif.DateTime);
  return lat !== undefined && lon !== undefined && !(lat === 0 && lon === 0) ? { lat, lon, takenAt } : { takenAt };
}

async function keep(uri: string): Promise<string> {
  const ext = (uri.split('?')[0].split('.').pop() ?? 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
  const name = newName(ext);
  await new File(uri).copy(new File(folder(), name));
  return name;
}

/** Pick photos for a memory. Each comes back with where and when it was taken, if the photo knows. */
export async function pickMemoryPhotos(): Promise<PickedPhoto[]> {
  const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsMultipleSelection: true, selectionLimit: 20, quality: 0.9, exif: true });
  if (result.canceled) return [];
  // The library record has location even when the exported file's EXIF was stripped; read it only if already allowed.
  const library = (await MediaLibrary.getPermissionsAsync(false).catch(() => null))?.granted ?? false;
  return Promise.all(
    result.assets.map(async (a) => {
      const meta = fromExif(a.exif as Exif | null | undefined);
      if (library && a.assetId && (meta.lat === undefined || meta.takenAt === undefined)) {
        try {
          const info = await MediaLibrary.getAssetInfoAsync(a.assetId);
          if (meta.lat === undefined && info.location) Object.assign(meta, { lat: info.location.latitude, lon: info.location.longitude });
          meta.takenAt ??= info.creationTime || undefined;
        } catch {
          // Not in the library (e.g. a shared file); EXIF is all we have.
        }
      }
      return { name: await keep(a.uri), ...meta };
    }),
  );
}

export const cameraAllowed = async () => (await ImagePicker.getCameraPermissionsAsync()).granted;

/** Opens the camera; the photo is kept in the app and comes back with where it was taken. Null if cancelled or not allowed. */
export async function takeMemoryPhoto(): Promise<PickedPhoto | null> {
  const perm = await ImagePicker.requestCameraPermissionsAsync();
  if (!perm.granted) return null;
  const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.85, exif: true });
  if (result.canceled || !result.assets[0]) return null;
  const a = result.assets[0];
  // Just taken, so now is when; EXIF may still carry the location.
  return { name: await keep(a.uri), ...fromExif(a.exif as Exif | null | undefined), takenAt: Date.now() };
}

/** What Apple Vision sees in each photo, on device. Empty where the module isn't built in. */
export async function describePhotos(names: string[]): Promise<PhotoSignals[]> {
  if (!SelfMirrorVision) return [];
  const out: PhotoSignals[] = [];
  for (const n of names) {
    try {
      out.push(await SelfMirrorVision.describe(memoryPhotoUri(n)));
    } catch {
      // Unreadable image; keep the slot so results line up with `names`.
      out.push({ labels: [], faces: 0 });
    }
  }
  return out;
}

export const canDescribePhotos = !!SelfMirrorVision;

/** A named place for coordinates, using Apple's geocoder. */
export async function placeAt(latitude: number, longitude: number): Promise<MemoryPlace> {
  const p = await lookupPlace({ lat: latitude, lon: longitude });
  return { latitude, longitude, name: p?.name ?? p?.locality ?? 'Dropped pin', locality: p?.locality, city: p?.city };
}

/** Where the phone is now, or null if location is off. */
export async function currentPlace(): Promise<MemoryPlace | null> {
  const perm = await Location.requestForegroundPermissionsAsync();
  if (!perm.granted) return null;
  const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
  return placeAt(pos.coords.latitude, pos.coords.longitude);
}

/** Opens the place in Apple Maps (Google Maps / geo: on Android). */
export function openInMaps(place: Pick<MemoryPlace, 'name' | 'latitude' | 'longitude'>) {
  const q = encodeURIComponent(place.name);
  const ll = `${place.latitude},${place.longitude}`;
  const url = Platform.OS === 'ios' ? `https://maps.apple.com/?q=${q}&ll=${ll}` : `geo:${ll}?q=${ll}(${q})`;
  return Linking.openURL(url);
}

/** Walking directions to a spot in Apple Maps, e.g. back to the car. */
export function walkTo(place: Pick<MemoryPlace, 'latitude' | 'longitude'>) {
  const ll = `${place.latitude},${place.longitude}`;
  return Linking.openURL(Platform.OS === 'ios' ? `https://maps.apple.com/?daddr=${ll}&dirflg=w` : `google.navigation:q=${ll}&mode=w`);
}

/** Driving directions in Apple Maps (to a parking spot, or straight to the place). */
export function driveTo(place: Pick<MemoryPlace, 'latitude' | 'longitude'>) {
  const ll = `${place.latitude},${place.longitude}`;
  return Linking.openURL(Platform.OS === 'ios' ? `https://maps.apple.com/?daddr=${ll}&dirflg=d` : `google.navigation:q=${ll}`);
}
