import * as Location from 'expo-location';

import SelfMirrorPlaces, { type MapPlace } from '../../../modules/self-mirror-places';

/** Apple Maps lookups. Without the native module (Expo Go, Android) search falls back to the geocoder. */
export const placesSupported = !!SelfMirrorPlaces;

/** The point of interest you were most likely at: the nearest one within `radius` metres, parking excluded. */
export async function nearestPlace(latitude: number, longitude: number, radius = 60): Promise<MapPlace | undefined> {
  if (!SelfMirrorPlaces) return undefined;
  try {
    const found = await SelfMirrorPlaces.nearby(latitude, longitude, radius, null);
    return found.find((p) => p.category !== 'Parking' && (p.distance ?? 0) <= radius);
  } catch {
    return undefined;
  }
}

/** The parking lot or garage at a spot, if Apple Maps has one close by. */
export async function nearestParking(latitude: number, longitude: number): Promise<MapPlace | undefined> {
  if (!SelfMirrorPlaces) return undefined;
  try {
    return (await SelfMirrorPlaces.nearby(latitude, longitude, 120, ['Parking']))[0];
  } catch {
    return undefined;
  }
}

/** Search places and areas by name, near a point when known. */
export async function searchPlaces(query: string, near?: { latitude: number; longitude: number }): Promise<MapPlace[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  if (SelfMirrorPlaces) {
    try {
      return await SelfMirrorPlaces.search(q, near?.latitude ?? null, near?.longitude ?? null);
    } catch {
      // Fall through to the geocoder.
    }
  }
  try {
    const hits = await Location.geocodeAsync(q);
    return Promise.all(
      hits.slice(0, 5).map(async (h) => {
        const [a] = await Location.reverseGeocodeAsync({ latitude: h.latitude, longitude: h.longitude }).catch(() => []);
        return {
          name: a?.name ?? q,
          latitude: h.latitude,
          longitude: h.longitude,
          locality: a?.district ?? a?.city ?? undefined,
          city: a?.city ?? undefined,
          address: [a?.street, a?.city].filter(Boolean).join(', ') || undefined,
        };
      }),
    );
  } catch {
    return [];
  }
}
