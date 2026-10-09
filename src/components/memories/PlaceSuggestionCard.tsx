import { StyleSheet, View } from 'react-native';

import type { PlaceSuggestion } from '../../domain/places';
import { driveTo, openInMaps } from '../../services/memories/custom';
import { spacing, useTheme } from '../../theme';
import { Button, Card, Chip, PressableScale, Text } from '../primitives';

const distanceText = (m: number) => (m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m / 10) * 10} m`);

/** One place to go next: why now, how far, and where you've parked for it before. */
export function PlaceSuggestionCard({ s }: { s: PlaceSuggestion }) {
  const { colors } = useTheme();
  return (
    <Card style={styles.card}>
      <View style={styles.row}>
        <Text style={styles.emoji}>{s.emoji}</Text>
        <View style={styles.flex}>
          <Text variant="bodyMedium">{s.name}</Text>
          <Text variant="caption" tone="secondary">
            {s.reason}
            {s.distanceM !== undefined ? ` · ${distanceText(s.distanceM)}` : ''}
          </Text>
        </View>
        {s.isNew && <Chip label="New" color={colors.memory.vibeExplore} />}
      </View>
      {s.parking && (
        <PressableScale onPress={() => driveTo(s.parking!)} accessibilityLabel={`Drive to ${s.parking.name}`} style={[styles.parking, { backgroundColor: colors.bgSurface }]}>
          <Text variant="caption">
            🅿️ You’ve parked at {s.parking.name} {s.parking.times > 1 ? `${s.parking.times}×` : 'before'} · walk ~{distanceText(s.parking.walkM)}
          </Text>
          <Text variant="caption" tone="focus">
            Drive to parking ›
          </Text>
        </PressableScale>
      )}
      <View style={styles.row}>
        <Button label="Directions" variant="secondary" style={styles.flex} onPress={() => driveTo(s)} />
        <Button label="Open in Maps" variant="ghost" style={styles.flex} onPress={() => openInMaps(s)} />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  flex: {
    flex: 1,
  },
  emoji: {
    fontSize: 26,
  },
  parking: {
    padding: spacing.sm,
    borderRadius: 10,
    gap: 2,
  },
});
