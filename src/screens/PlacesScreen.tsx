import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ScreenHeader } from '../components/composite/ScreenHeader';
import { HomeCard } from '../components/memories/HomeCard';
import { MemoryMap } from '../components/memories/MemoryMap';
import { PlaceSuggestionCard } from '../components/memories/PlaceSuggestionCard';
import { Card, ListRow, Text } from '../components/primitives';
import { dwellLabel } from '../domain/narrative';
import { usualTime } from '../domain/places';
import type { RootStackParamList } from '../navigation/types';
import { driveTo, openInMaps } from '../services/memories/custom';
import { usePlaces } from '../services/memories/usePlaces';
import { screenPadding, spacing, useTheme } from '../theme';
import { formatDayLabel, toISODate } from '../utils/time';

/** Where to go next (decided from your habits), every spot you've really parked, and your regular places. */
export function PlacesScreen({ navigation }: NativeStackScreenProps<RootStackParamList, 'Places'>) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { places, parking, suggestions } = usePlaces();

  return (
    <ScrollView
      style={{ backgroundColor: colors.memory.bgMemoryWarm }}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + spacing.lg, paddingBottom: insets.bottom + spacing.xl }]}
    >
      <ScreenHeader title="Places" caption="Where to next, and where you park" navAction={{ label: '‹ Memories', onPress: navigation.goBack }} />
      <HomeCard />

      <View style={styles.section}>
        <Text variant="sectionTitle" accessibilityRole="header">
          Where to next
        </Text>
        {suggestions.length ? (
          suggestions.map((s) => <PlaceSuggestionCard key={s.key} s={s} />)
        ) : (
          <Card>
            <Text variant="body" tone="secondary">
              Suggestions appear once Memories has seen a few of your days: your routines, your go-to spots, and new places like them nearby.
            </Text>
          </Card>
        )}
      </View>

      <View style={styles.section}>
        <Text variant="sectionTitle" accessibilityRole="header">
          Where you’ve parked
        </Text>
        {parking.length ? (
          <>
            <MemoryMap path={[]} nodes={parking.map((p, i) => ({ id: `p${i}`, latitude: p.latitude, longitude: p.longitude, placeName: `🅿️ ${p.name}` }))} height={220} />
            <Card padded={false} style={styles.list}>
              {parking.slice(0, 12).map((p, i) => (
                <ListRow
                  key={`${p.latitude}-${p.longitude}`}
                  title={`🅿️ ${p.name}`}
                  detail={[
                    `${p.times}× · last ${formatDayLabel(toISODate(new Date(p.lastParked)))}`,
                    p.destinations.length ? `for ${p.destinations.slice(0, 2).join(', ')}` : null,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                  isLast={i === Math.min(parking.length, 12) - 1}
                  onPress={() => driveTo(p)}
                />
              ))}
            </Card>
          </>
        ) : (
          <Card>
            <Text variant="body" tone="secondary">
              When you drive somewhere and walk the rest of the way, the spot you parked is noted here automatically.
            </Text>
          </Card>
        )}
      </View>

      {places.length > 0 && (
        <View style={styles.section}>
          <Text variant="sectionTitle" accessibilityRole="header">
            Your places
          </Text>
          <Card padded={false} style={styles.list}>
            {places.slice(0, 10).map((p, i) => (
              <ListRow
                key={`${p.name}-${p.latitude}`}
                title={`${p.activity?.emoji ?? '📍'} ${p.name}`}
                detail={[`${p.visits} visit${p.visits > 1 ? 's' : ''}`, dwellLabel(p.totalMin), usualTime(p)].filter(Boolean).join(' · ')}
                isLast={i === Math.min(places.length, 10) - 1}
                onPress={() => openInMaps(p)}
              />
            ))}
          </Card>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: screenPadding,
    gap: spacing.lg,
  },
  section: {
    gap: spacing.sm,
  },
  list: {
    paddingHorizontal: spacing.md,
  },
});
