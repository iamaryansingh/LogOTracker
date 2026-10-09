import { requireOptionalNativeModule } from 'expo';

export interface MapPlace {
  name: string;
  latitude: number;
  longitude: number;
  /** Apple Maps point-of-interest category without its prefix, e.g. "Restaurant", "Parking", "Cafe". */
  category?: string;
  address?: string;
  locality?: string;
  city?: string;
  /** Metres from the searched point (nearby only). */
  distance?: number;
}

interface SelfMirrorPlacesNative {
  /** Apple Maps search ("sushi", "Boston Common", an address), biased toward a point when given. */
  search(query: string, latitude: number | null, longitude: number | null): Promise<MapPlace[]>;
  /** Points of interest around a spot, nearest first; optionally only some categories (e.g. ["Parking"]). */
  nearby(latitude: number, longitude: number, radius: number, categories: string[] | null): Promise<MapPlace[]>;
}

// Optional so the app still runs where the module isn't built in (Expo Go, Android, older builds).
const native = requireOptionalNativeModule<SelfMirrorPlacesNative>('SelfMirrorPlaces');

export default native;
