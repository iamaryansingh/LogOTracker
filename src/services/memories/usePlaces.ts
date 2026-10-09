import { useEffect, useMemo, useState } from 'react';

import { favouriteCategories, parkingHabits, placeHabits, suggestPlaces, type NearbyCandidate } from '../../domain/places';
import { toISODate } from '../../utils/time';
import SelfMirrorPlaces from '../../../modules/self-mirror-places';
import { useMemories } from './MemoriesProvider';

/** Your parking spots, frequent places, and where you might go next, from your memories and where you are. */
export function usePlaces() {
  const { memories, points } = useMemories();
  const last = points[points.length - 1];
  const here = last ? { latitude: last.lat, longitude: last.lon } : undefined;
  // Round "here" so small GPS jitter doesn't refetch nearby places.
  const hereKey = here ? `${here.latitude.toFixed(3)},${here.longitude.toFixed(3)}` : '';

  const places = useMemo(() => placeHabits(memories), [memories]);
  const parking = useMemo(() => parkingHabits(memories), [memories]);
  const categories = useMemo(() => favouriteCategories(places), [places]);
  const [nearby, setNearby] = useState<NearbyCandidate[]>([]);

  useEffect(() => {
    if (!SelfMirrorPlaces || !hereKey || !categories.length) return;
    const [lat, lon] = hereKey.split(',').map(Number);
    let live = true;
    SelfMirrorPlaces.nearby(lat, lon, 1500, categories)
      .then((found) => live && setNearby(found))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [hereKey, categories]);

  const suggestions = useMemo(() => {
    const today = memories.find((m) => m.date === toISODate(new Date()));
    return suggestPlaces({
      places,
      parking,
      now: new Date(),
      here,
      nearby,
      visitedToday: today?.spatialNodes.map((n) => n.placeName) ?? [],
    });
  }, [places, parking, nearby, memories, hereKey]); // eslint-disable-line react-hooks/exhaustive-deps

  return { places, parking, suggestions, here };
}
