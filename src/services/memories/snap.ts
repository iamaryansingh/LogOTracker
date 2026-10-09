import type { CustomMemory, MemoryPlace, MemoryStyle } from '../../domain/memoryTypes';
import { keyLabels, photoMemoryText, photoThemes, type PhotoSignals } from '../../domain/photoCaption';
import { distanceM } from '../../domain/spatial';
import { toISODate } from '../../utils/time';

const ll = (p: MemoryPlace) => ({ lat: p.latitude, lon: p.longitude });

/**
 * Files a photo taken from a prompt into today's memory for that place: added to the one already
 * there (same day, within ~150 m), or a new memory written from what's in the photo.
 */
export function fileSnap(
  existing: CustomMemory[],
  snap: { name: string; takenAt: number; place?: MemoryPlace; signals?: PhotoSignals },
  style: MemoryStyle,
): CustomMemory {
  const date = toISODate(new Date(snap.takenAt));
  const signals = snap.signals ? [snap.signals] : [];
  const labels = keyLabels(signals);
  const now = new Date().toISOString();
  const same = existing.find(
    (m) => m.kind !== 'live' && m.date === date && (snap.place && m.place ? distanceM(ll(m.place), ll(snap.place)) < 150 : !snap.place && !m.place),
  );
  if (same) {
    return { ...same, photos: [...same.photos, snap.name], labels: [...new Set([...(same.labels ?? []), ...labels])].slice(0, 8), updatedAt: now };
  }
  const id = `cm-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  const text = photoMemoryText({ seed: id, style, themes: photoThemes(signals), labels, photoCount: 1, place: snap.place, when: new Date(snap.takenAt) });
  return {
    id,
    kind: 'made',
    date,
    takenAt: new Date(snap.takenAt).toISOString(),
    title: text.title,
    caption: text.caption,
    photos: [snap.name],
    place: snap.place,
    vibe: text.vibe,
    labels,
    isPinned: false,
    createdAt: now,
    updatedAt: now,
  };
}
