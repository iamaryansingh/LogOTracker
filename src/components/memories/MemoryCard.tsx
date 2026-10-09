import { Image, StyleSheet, View } from 'react-native';

import type { DailyMemory, Trip } from '../../domain/memoryTypes';
import { radii, spacing, useTheme, withAlpha } from '../../theme';
import { formatDayLabel, fromISODate } from '../../utils/time';
import { Card, Chip, PressableScale, Text } from '../primitives';
import { VIBE_ICON, VIBE_LABEL, vibeColor, WEATHER_ICON } from './vibes';

/** One day in the Memory Stream: cover photo (or a vibe-tinted band), title, and the first lines of the story. */
export function MemoryCard({ memory, onPress }: { memory: DailyMemory; onPress: () => void }) {
  const { colors } = useTheme();
  const tint = vibeColor(memory.primaryVibe, colors);
  const places = memory.spatialNodes.filter((n) => !n.isHome).length;
  const daytime = (iso: string) => new Date(iso).getHours() >= 6 && new Date(iso).getHours() < 20;
  const weather = [...memory.spatialNodes]
    .filter((n) => n.weather && !n.isHome)
    .sort((a, b) => Number(daytime(b.arrivalTime)) - Number(daytime(a.arrivalTime)) || b.dwellTimeMinutes - a.dwellTimeMinutes)[0]?.weather;
  return (
    <PressableScale haptic pressedScale={0.99} onPress={onPress} accessibilityLabel={`${formatDayLabel(memory.date)}: ${memory.title}`} style={styles.wrap}>
      <Card padded={false} style={{ backgroundColor: colors.memory.bgMemoryWarm }}>
        {memory.coverPhotoUri ? (
          <Image source={{ uri: memory.coverPhotoUri }} style={styles.cover} resizeMode="cover" />
        ) : (
          <View style={[styles.band, { backgroundColor: withAlpha(tint, 0.18) }]}>
            <Text style={styles.bandIcon}>{VIBE_ICON[memory.primaryVibe]}</Text>
          </View>
        )}
        <View style={styles.body}>
          <View style={styles.metaRow}>
            <Text variant="caption" tone="secondary">
              {formatDayLabel(memory.date)}
              {weather ? `  ${WEATHER_ICON[weather.condition]} ${Math.round(weather.tempC)}°` : ''}
            </Text>
            {memory.isPinned && (
              <Text variant="caption" style={{ color: colors.memory.accentPin }}>
                📌 Pinned
              </Text>
            )}
          </View>
          <Text variant="sectionTitle">{memory.title}</Text>
          <Text variant="body" tone="secondary" numberOfLines={3}>
            {memory.userNote?.trim() ? `“${memory.userNote.trim()}”` : memory.summaryNarrative}
          </Text>
          <View style={styles.chips}>
            <Chip label={`${VIBE_ICON[memory.primaryVibe]} ${VIBE_LABEL[memory.primaryVibe]}`} color={tint} />
            {places > 0 && <Chip label={`${places} place${places > 1 ? 's' : ''}`} color={colors.state.neutral} />}
            {memory.distanceKm >= 0.5 && <Chip label={`${memory.distanceKm.toFixed(1)} km`} color={colors.state.neutral} />}
          </View>
        </View>
      </Card>
    </PressableScale>
  );
}

/** A multi-day trip, shown as a wide card above the daily stream. */
export function TripCard({ trip, onPress }: { trip: Trip; onPress: () => void }) {
  const { colors } = useTheme();
  const range = `${fromISODate(trip.startDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} – ${fromISODate(trip.endDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`;
  return (
    <PressableScale haptic pressedScale={0.98} onPress={onPress} accessibilityLabel={`Trip: ${trip.title}, ${range}`} style={styles.tripWrap}>
      <View style={[styles.trip, { backgroundColor: withAlpha(colors.memory.vibeExplore, 0.14), borderColor: colors.borderSubtle }]}>
        {trip.coverPhotoUri && <Image source={{ uri: trip.coverPhotoUri }} style={StyleSheet.absoluteFill} resizeMode="cover" />}
        <View style={[styles.tripShade, trip.coverPhotoUri && { backgroundColor: 'rgba(0,0,0,0.35)' }]}>
          <Text variant="caption" style={{ color: trip.coverPhotoUri ? '#fff' : colors.memory.vibeExplore }}>
            ✈︎ Trip · {range} · {trip.dailyMemories.length} day{trip.dailyMemories.length > 1 ? 's' : ''}
          </Text>
          <Text variant="sectionTitle" style={trip.coverPhotoUri ? { color: '#fff' } : undefined} numberOfLines={2}>
            {trip.title}
          </Text>
        </View>
      </View>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginBottom: spacing.md,
  },
  cover: {
    height: 160,
    width: '100%',
  },
  band: {
    height: 56,
    alignItems: 'flex-start',
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
  },
  bandIcon: {
    fontSize: 26,
  },
  body: {
    padding: spacing.md,
    gap: spacing.xs,
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xxs,
    marginTop: spacing.xxs,
  },
  tripWrap: {
    width: 260,
  },
  trip: {
    height: 130,
    borderRadius: radii.card,
    borderWidth: 1,
    overflow: 'hidden',
  },
  tripShade: {
    flex: 1,
    justifyContent: 'flex-end',
    padding: spacing.md,
    gap: spacing.xxs,
  },
});
