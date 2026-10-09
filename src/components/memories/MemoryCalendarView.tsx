import { useNavigation } from '@react-navigation/native';
import { useMemo, useState, type ReactNode } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { CustomMemory, DailyMemory } from '../../domain/memoryTypes';
import { memoryPhotoUri } from '../../services/memories/custom';
import { useMemories } from '../../services/memories/MemoriesProvider';
import { usePlaces } from '../../services/memories/usePlaces';
import { useAppStore } from '../../state/AppStore';
import { screenPadding, spacing, useTheme } from '../../theme';
import { haptics } from '../../utils/haptics';
import { toISODate } from '../../utils/time';
import { Button, Card, PressableScale, Text } from '../primitives';
import { CarCard, LiveMemoryCard } from './LiveMemoryCard';
import { MemoriesSetupCard } from './MemoriesSetupCard';
import { MemoryCalendarGrid, type CalendarDay } from './MemoryCalendarGrid';
import { PlaceSuggestionCard } from './PlaceSuggestionCard';
import { TripCard } from './MemoryCard';
import { SemanticMemoryCard } from './SemanticMemoryCard';
import { vibeColor } from './vibes';

/** Memories, calendar first: pick a day to see its memory; trips and live recording sit around it. */
export function MemoryCalendarView({ header }: { header: ReactNode }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const { memories: settings, customMemories } = useAppStore();
  const { memories, trips, enriching, refresh, car } = useMemories();
  const [month, setMonth] = useState(() => new Date());
  const [selected, setSelected] = useState(() => toISODate(new Date()));
  const { suggestions, parking } = usePlaces();

  const byDate = useMemo(() => {
    const map = new Map<string, { day?: DailyMemory; made: CustomMemory[] }>();
    for (const m of memories) map.set(m.date, { day: m, made: [] });
    for (const c of Object.values(customMemories)) {
      const entry = map.get(c.date) ?? { made: [] };
      entry.made.push(c);
      map.set(c.date, entry);
    }
    return map;
  }, [memories, customMemories]);

  const days = useMemo(() => {
    const out: Record<string, CalendarDay> = {};
    for (const [date, { day, made }] of byDate) {
      const cover = made.find((m) => m.photos.length)?.photos[0];
      out[date] = {
        color: vibeColor(day?.primaryVibe ?? made[0].vibe, colors),
        cover: cover ? memoryPhotoUri(cover) : day?.coverPhotoUri,
        count: (day ? 1 : 0) + made.length,
      };
    }
    return out;
  }, [byDate, colors]);

  // The month's most memorable days, for the legend under the grid.
  const highlights = useMemo(() => {
    const prefix = toISODate(month).slice(0, 7);
    const score = ({ day, made }: { day?: DailyMemory; made: CustomMemory[] }) =>
      (day?.isPinned || made.some((m) => m.isPinned) ? 100 : 0) +
      made.length * 20 +
      (day?.spatialNodes.filter((n) => !n.isHome).length ?? 0) * 5 +
      (day?.spatialNodes.reduce((n, x) => n + (x.photoUris?.length ?? 0), 0) ?? 0);
    return [...byDate.entries()]
      .filter(([date, e]) => date.startsWith(prefix) && score(e) > 0)
      .sort((a, b) => score(b[1]) - score(a[1]))
      .slice(0, 3)
      .map(([date, e]) => ({ date, title: e.made.find((m) => m.kind === 'live')?.title ?? e.day?.title ?? e.made[0].title, color: days[date].color }));
  }, [byDate, month, days]);

  const entry = byDate.get(selected);

  return (
    <ScrollView
      style={{ backgroundColor: colors.memory.bgMemoryWarm }}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + spacing.lg }]}
      refreshControl={settings.enabled ? <RefreshControl refreshing={false} onRefresh={refresh} /> : undefined}
      showsVerticalScrollIndicator={false}
    >
      {header}
      {!settings.enabled && <MemoriesSetupCard />}
      <LiveMemoryCard />
      {car && <CarCard car={car} />}

      <Card>
        <MemoryCalendarGrid
          month={month}
          onMonthChange={setMonth}
          selected={selected}
          onSelect={(d) => {
            setSelected(d);
            haptics.selection();
          }}
          days={days}
        />
        {highlights.length > 0 && (
          <View style={styles.legend}>
            {highlights.map((h) => (
              <PressableScale key={h.date} onPress={() => setSelected(h.date)} accessibilityLabel={`Show ${h.title}`} style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: h.color }]} />
                <Text variant="caption" numberOfLines={1} tone={h.date === selected ? 'primary' : 'secondary'}>
                  {h.title}
                </Text>
              </PressableScale>
            ))}
          </View>
        )}
      </Card>

      {enriching && (
        <View style={styles.enriching}>
          <ActivityIndicator size="small" color={colors.textSecondary} />
          <Text variant="caption" tone="secondary">
            Finding place names and photos…
          </Text>
        </View>
      )}

      <SemanticMemoryCard date={selected} day={entry?.day} made={entry?.made ?? []} />

      <View style={styles.section}>
        <View style={styles.sectionHead}>
          <Text variant="sectionTitle" accessibilityRole="header" style={styles.flex}>
            Where to next?
          </Text>
          <PressableScale haptic onPress={() => navigation.navigate('Places')} accessibilityLabel="All places and parking" hitSlop={10}>
            <Text variant="caption" tone="focus">
              {parking.length ? `Places & ${parking.length} parking spot${parking.length > 1 ? 's' : ''} →` : 'All places →'}
            </Text>
          </PressableScale>
        </View>
        {suggestions[0] ? (
          <PlaceSuggestionCard s={suggestions[0]} />
        ) : (
          <Text variant="caption" tone="secondary">
            Ideas show up here as Memories learns your routines.
          </Text>
        )}
      </View>

      <View style={styles.actions}>
        <Button label="📸 Snap" style={styles.flex} onPress={() => navigation.navigate('Snap', {})} />
        <Button label="＋ From photos or a place" variant="secondary" style={styles.grow} onPress={() => navigation.navigate('MemoryCompose', {})} />
      </View>

      {trips.length > 0 && (
        <View style={styles.section}>
          <Text variant="sectionTitle" accessibilityRole="header">
            Trips
          </Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.trips}>
            {trips.map((t) => (
              <TripCard key={t.id} trip={t} onPress={() => navigation.navigate('Trip', { id: t.id })} />
            ))}
          </ScrollView>
        </View>
      )}
      {settings.enabled && <MemoriesSetupCard />}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: screenPadding,
    paddingBottom: spacing.xl,
    gap: spacing.md,
  },
  section: {
    gap: spacing.sm,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  grow: {
    flex: 2,
  },
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  flex: {
    flex: 1,
  },
  trips: {
    gap: spacing.sm,
  },
  legend: {
    marginTop: spacing.sm,
    gap: spacing.xxs,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    minHeight: 28,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  enriching: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
});
