import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import * as MediaLibrary from 'expo-media-library/legacy';

import type { Enrichment } from '../../domain/memories';
import type { WeatherCondition } from '../../domain/memoryTypes';
import type { ParkingSpot, Stay } from '../../domain/spatial';
import { toISODate } from '../../utils/time';
import { nearestParking, nearestPlace, placesSupported } from './places';

/**
 * Fills in what raw coordinates can't say: place names (Apple's geocoder), photos you took there
 * (Photos library, by time), and weather (Open-Meteo, only when the user turns it on, with the
 * location rounded to ~1 km). Everything is cached on device, so each lookup happens once.
 */

// v3 adds Apple Maps categories (restaurant, park…) and parking names.
const PLACES_KEY = 'selfmirror/places/v3';
const WEATHER_KEY = 'selfmirror/weather/v1';
const MAX_PHOTOS = 12;

type Place = { name?: string; locality?: string; city?: string; category?: string };
type HourlyWeather = { temps: number[]; codes: number[]; isDay: number[] };

const placeKey = (s: { lat: number; lon: number }) => `${s.lat.toFixed(3)},${s.lon.toFixed(3)}`;
// ~1 km cells: enough for weather, and all that ever leaves the phone.
const weatherKey = (s: { lat: number; lon: number }, date: string) => `${s.lat.toFixed(2)},${s.lon.toFixed(2)},${date}`;

let places: Record<string, Place> | null = null;
let weather: Record<string, HourlyWeather> | null = null;

async function loadCaches() {
  if (!places) places = JSON.parse((await AsyncStorage.getItem(PLACES_KEY)) ?? '{}');
  if (!weather) weather = JSON.parse((await AsyncStorage.getItem(WEATHER_KEY)) ?? '{}');
}

const isAddress = (name: string, a: Location.LocationGeocodedAddress) =>
  /^\d/.test(name) || (!!a.street && name.includes(a.street) && /\d/.test(name));

/** Apple's name for a spot: a point of interest when it knows one, else the street. */
export async function lookupPlace(s: { lat: number; lon: number }): Promise<Place | undefined> {
  try {
    const [a] = await Location.reverseGeocodeAsync({ latitude: s.lat, longitude: s.lon });
    if (!a) return undefined;
    // Apple returns a point-of-interest name when it knows one, otherwise a street address.
    const name = a.name && !isAddress(a.name, a) ? a.name : (a.street ?? a.district ?? undefined);
    const base = { name: name ?? undefined, locality: a.district ?? a.city ?? a.subregion ?? undefined, city: a.city ?? a.subregion ?? undefined };
    // Apple Maps knows the business at the spot (and what kind it is) better than the geocoder.
    const poi = await nearestPlace(s.lat, s.lon);
    return poi ? { ...base, name: poi.name, category: poi.category } : base;
  } catch {
    return undefined;
  }
}

/** WMO weather codes → the five conditions memories use. */
function condition(code: number, isDay: boolean): WeatherCondition {
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return 'SNOWY';
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82) || code >= 95) return 'RAINY';
  if (code <= 1) return isDay ? 'SUNNY' : 'CLEAR_NIGHT';
  return 'CLOUDY';
}

async function fetchWeather(s: Stay, date: string): Promise<HourlyWeather | undefined> {
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${s.lat.toFixed(2)}&longitude=${s.lon.toFixed(2)}` +
    `&hourly=temperature_2m,weather_code,is_day&start_date=${date}&end_date=${date}&timezone=auto`;
  try {
    const res = await fetch(url);
    if (!res.ok) return undefined;
    const j = (await res.json()) as { hourly?: { temperature_2m: number[]; weather_code: number[]; is_day: number[] } };
    if (!j.hourly) return undefined;
    return { temps: j.hourly.temperature_2m, codes: j.hourly.weather_code, isDay: j.hourly.is_day };
  } catch {
    return undefined;
  }
}

async function photosFor(s: Stay): Promise<{ uri: string; t: number }[]> {
  try {
    const page = await MediaLibrary.getAssetsAsync({
      first: MAX_PHOTOS + 6,
      mediaType: 'photo',
      createdAfter: s.start,
      createdBefore: s.end,
      sortBy: [[MediaLibrary.SortBy.creationTime, true]],
    });
    // Screenshots aren't memories.
    return page.assets
      .filter((a) => !a.mediaSubtypes?.includes('screenshot'))
      .slice(0, MAX_PHOTOS)
      .map((a) => ({ uri: a.uri, t: a.creationTime }));
  } catch {
    return [];
  }
}

/**
 * Resolves anything not yet cached for these stays and returns synchronous lookups for the
 * memory builder. Photos are read fresh each time (they change as you shoot).
 */
export async function enrichStays(stays: Stay[], opts: { weather: boolean }, parking: ParkingSpot[] = []): Promise<Enrichment> {
  await loadCaches();
  let placesChanged = false;
  let weatherChanged = false;

  for (const p of parking) {
    const k = `P${placeKey(p)}`;
    if (!(k in places!) && placesSupported) {
      places![k] = { name: (await nearestParking(p.lat, p.lon))?.name };
      placesChanged = true;
    }
  }

  for (const s of stays) {
    const k = placeKey(s);
    if (!(k in places!)) {
      places![k] = (await lookupPlace(s)) ?? {};
      placesChanged = true;
    }
    if (opts.weather) {
      const date = toISODate(new Date(s.start));
      const wk = weatherKey(s, date);
      // Today's weather isn't final yet; don't cache it forever.
      if (!(wk in weather!) || date === toISODate(new Date())) {
        const w = await fetchWeather(s, date);
        if (w) {
          weather![wk] = w;
          weatherChanged = true;
        }
      }
    }
  }
  if (placesChanged) await AsyncStorage.setItem(PLACES_KEY, JSON.stringify(places));
  if (weatherChanged) await AsyncStorage.setItem(WEATHER_KEY, JSON.stringify(weather));

  const photoAccess = (await MediaLibrary.getPermissionsAsync(false).catch(() => null))?.granted ?? false;
  // Matched by time rather than by stay, so stays split at midnight still find their photos.
  const photos: { uri: string; t: number }[] = [];
  if (photoAccess) for (const s of stays) photos.push(...(await photosFor(s)));

  return {
    place: (s) => places![placeKey(s)],
    parkingName: (p) => places![`P${placeKey(p)}`]?.name,
    weather: (s) => {
      if (!opts.weather) return undefined;
      const date = toISODate(new Date(s.start));
      const w = weather![weatherKey(s, date)];
      if (!w) return undefined;
      // Weather at the middle of the stay.
      const h = new Date((s.start + s.end) / 2).getHours();
      if (w.temps[h] === undefined) return undefined;
      return { tempC: w.temps[h], condition: condition(w.codes[h], w.isDay[h] === 1) };
    },
    photos: (s) => photos.filter((p) => p.t >= s.start && p.t <= s.end).map((p) => p.uri),
  };
}

export async function clearEnrichmentCaches() {
  places = null;
  weather = null;
  await AsyncStorage.multiRemove([PLACES_KEY, WEATHER_KEY]);
}
