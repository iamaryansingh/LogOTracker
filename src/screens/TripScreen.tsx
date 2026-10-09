import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ScreenHeader } from '../components/composite/ScreenHeader';
import { MemoryCard } from '../components/memories/MemoryCard';
import { MemoryMap } from '../components/memories/MemoryMap';
import { Button, Card, PressableScale, Text } from '../components/primitives';
import type { RootStackParamList } from '../navigation/types';
import { useMemories } from '../services/memories/MemoriesProvider';
import { useAppStore } from '../state/AppStore';
import { radii, screenPadding, spacing, typography, useTheme } from '../theme';
import { fromISODate } from '../utils/time';

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <Card style={styles.stat}>
      <Text variant="sectionTitle">{value}</Text>
      <Text variant="caption" tone="secondary">
        {label}
      </Text>
    </Card>
  );
}

export function TripScreen({ route, navigation }: NativeStackScreenProps<RootStackParamList, 'Trip'>) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { getTrip } = useMemories();
  const { overrideMemory } = useAppStore();
  const trip = getTrip(route.params.id);
  const [renaming, setRenaming] = useState(false);
  const [title, setTitle] = useState('');

  const combined = useMemo(() => {
    if (!trip) return { path: [], nodes: [], km: 0, places: 0, photos: 0 };
    const days = [...trip.dailyMemories].sort((a, b) => a.date.localeCompare(b.date));
    const nodes = days.flatMap((d) => d.spatialNodes);
    return {
      path: days.flatMap((d) => d.path),
      nodes,
      km: days.reduce((s, d) => s + d.distanceKm, 0),
      places: new Set(nodes.filter((n) => !n.isHome).map((n) => n.placeName)).size,
      photos: nodes.reduce((s, n) => s + (n.photoUris?.length ?? 0), 0),
    };
  }, [trip]);

  if (!trip) {
    return (
      <View style={[styles.content, { flex: 1, backgroundColor: colors.memory.bgMemoryWarm, paddingTop: insets.top + spacing.lg }]}>
        <ScreenHeader title="Trip not found" navAction={{ label: 'Back', onPress: navigation.goBack }} />
      </View>
    );
  }

  const range = `${fromISODate(trip.startDate).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })} – ${fromISODate(trip.endDate).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}`;
  const days = [...trip.dailyMemories].sort((a, b) => a.date.localeCompare(b.date));

  return (
    <ScrollView
      style={{ backgroundColor: colors.memory.bgMemoryWarm }}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={[styles.content, { paddingTop: insets.top + spacing.lg, paddingBottom: insets.bottom + spacing.xl }]}
    >
      <ScreenHeader title={trip.title} caption={range} navAction={{ label: 'Back', onPress: navigation.goBack }} />
      {renaming ? (
        <View style={styles.renameRow}>
          <TextInput
            value={title}
            onChangeText={setTitle}
            autoFocus
            style={[typography.body, styles.input, { color: colors.textPrimary, borderColor: colors.borderSubtle, backgroundColor: colors.bgCard }]}
          />
          <Button
            label="Save"
            style={styles.small}
            onPress={() => {
              overrideMemory(trip.id, { title: title.trim() || undefined });
              setRenaming(false);
            }}
          />
        </View>
      ) : (
        <PressableScale
          onPress={() => {
            setTitle(trip.title);
            setRenaming(true);
          }}
          accessibilityLabel="Rename trip"
          style={styles.renameLink}
        >
          <Text variant="caption" tone="secondary">
            Rename trip
          </Text>
        </PressableScale>
      )}

      <MemoryMap path={combined.path} nodes={combined.nodes} height={300} />

      <View style={styles.stats}>
        <Stat value={`${days.length}`} label={days.length === 1 ? 'day' : 'days'} />
        <Stat value={`${combined.km.toFixed(0)} km`} label="travelled" />
        <Stat value={`${combined.places}`} label="places" />
        <Stat value={`${combined.photos}`} label="photos" />
      </View>

      <View>
        {days.map((m) => (
          <MemoryCard key={m.id} memory={m} onPress={() => navigation.navigate('Memory', { date: m.date })} />
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: screenPadding,
    gap: spacing.md,
  },
  renameRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'center',
  },
  renameLink: {
    alignSelf: 'flex-start',
  },
  input: {
    flex: 1,
    minHeight: 44,
    borderWidth: 1,
    borderRadius: radii.chip,
    paddingHorizontal: spacing.sm,
  },
  small: {
    minHeight: 40,
    paddingHorizontal: spacing.md,
  },
  stats: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  stat: {
    flex: 1,
    gap: 2,
    paddingHorizontal: spacing.sm,
  },
});
