import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Linking, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Polaroid } from '../components/memories/Polaroid';
import { Button, Chip, Text } from '../components/primitives';
import type { CustomMemory, MemoryPlace } from '../domain/memoryTypes';
import type { RootStackParamList } from '../navigation/types';
import { cameraAllowed, currentPlace, describePhotos, memoryPhotoUri, placeAt, takeMemoryPhoto } from '../services/memories/custom';
import { fileSnap } from '../services/memories/snap';
import { useAppStore } from '../state/AppStore';
import { screenPadding, spacing, typography, useTheme } from '../theme';
import { haptics } from '../utils/haptics';

type Phase = 'camera' | 'saving' | 'done' | 'denied';

/**
 * Opened from a "you're at …" prompt (or the Snap button): the camera comes up straight away, and
 * the photo is filed into today's memory for that place, captioned from what's in it.
 */
export function SnapScreen({ route, navigation }: NativeStackScreenProps<RootStackParamList, 'Snap'>) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { customMemories, saveCustomMemory, memories: settings } = useAppStore();
  const [phase, setPhase] = useState<Phase>('camera');
  const [result, setResult] = useState<{ memory: CustomMemory; photo: string; takenAt: number; fresh: boolean } | null>(null);
  // Latest memories without restarting the camera when they change.
  const memoriesRef = useRef(customMemories);
  useEffect(() => {
    memoriesRef.current = customMemories;
  });

  const { lat, lon, name } = route.params ?? {};
  const shoot = useCallback(async () => {
    const photo = await takeMemoryPhoto();
    if (!photo) {
      // Cancelled straight away from a prompt: just go back. No permission: explain.
      if (await cameraAllowed()) navigation.goBack();
      else setPhase('denied');
      return;
    }
    setPhase('saving');
    // Where: the place the prompt was about, else the photo's own location, else where you are.
    let place: MemoryPlace | undefined;
    if (lat && lon) place = { name: name ?? 'Here', latitude: Number(lat), longitude: Number(lon) };
    else if (photo.lat !== undefined && photo.lon !== undefined) place = await placeAt(photo.lat, photo.lon);
    else place = (await currentPlace().catch(() => null)) ?? undefined;

    const [signals] = await describePhotos([photo.name]);
    const before = Object.values(memoriesRef.current);
    const takenAt = photo.takenAt ?? Date.now();
    const memory = fileSnap(before, { name: photo.name, takenAt, place, signals }, settings.style);
    saveCustomMemory(memory);
    haptics.success();
    setResult({ memory, photo: photo.name, takenAt, fresh: !before.some((m) => m.id === memory.id) });
    setPhase('done');
  }, [lat, lon, name, navigation, saveCustomMemory, settings.style]);

  useEffect(() => {
    // Defer one tick so the screen is on before the camera covers it.
    const t = setTimeout(() => void shoot(), 50);
    return () => clearTimeout(t);
  }, [shoot]);

  const memory = result ? (customMemories[result.memory.id] ?? result.memory) : null;

  return (
    <ScrollView style={{ backgroundColor: colors.memory.bgMemoryWarm }} contentContainerStyle={[styles.content, { paddingTop: insets.top + spacing.lg, paddingBottom: insets.bottom + spacing.xl }]}>
      {phase === 'camera' && <ActivityIndicator color={colors.textSecondary} />}
      {phase === 'saving' && (
        <View style={styles.center}>
          <ActivityIndicator color={colors.textSecondary} />
          <Text variant="caption" tone="secondary">
            Looking at your photo…
          </Text>
        </View>
      )}
      {phase === 'denied' && (
        <View style={styles.gap}>
          <Text variant="sectionTitle">Camera is off for Self Mirror</Text>
          <Text variant="body" tone="secondary">
            Allow the camera in Settings to snap photos straight into your memories.
          </Text>
          <Button label="Open Settings" onPress={() => Linking.openSettings()} />
          <Button label="Close" variant="ghost" onPress={navigation.goBack} />
        </View>
      )}
      {phase === 'done' && memory && result && (
        <View style={styles.gap}>
          <Text style={[typography.handTitle, { color: colors.textPrimary, textAlign: 'center' }]}>{result.fresh ? 'Pinned to a new memory' : 'Added to today’s memory'}</Text>
          <View style={[styles.board, { backgroundColor: colors.memory.board }]}>
            <Polaroid
              uri={memoryPhotoUri(result.photo)}
              width={Math.min(width - screenPadding * 2 - spacing.xl * 2, 320)}
              caption={memory.photoNotes?.[result.photo]}
              placeholder={memory.place ? `${memory.place.name}…` : 'write something…'}
              takenAt={result.takenAt}
              pinColor={colors.memory.pins[memory.photos.length % colors.memory.pins.length]}
              onCaptionChange={(t) => saveCustomMemory({ ...memory, photoNotes: { ...memory.photoNotes, [result.photo]: t }, updatedAt: new Date().toISOString() })}
            />
          </View>
          <Text variant="sectionTitle">{memory.title}</Text>
          <View style={styles.chips}>
            {memory.place && <Chip label={`📍 ${memory.place.name}`} color={colors.memory.accentPin} />}
            {memory.labels?.slice(0, 4).map((l) => <Chip key={l} label={l} color={colors.state.neutral} />)}
          </View>
          <View style={styles.row}>
            <Button
              label="📸 Another"
              variant="secondary"
              style={styles.flex}
              onPress={() => {
                setPhase('camera');
                void shoot();
              }}
            />
            <Button label="Open memory" style={styles.flex} onPress={() => navigation.replace('MemoryPost', { id: memory.id })} />
          </View>
          <Button label="Done" variant="ghost" onPress={navigation.goBack} />
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: screenPadding,
    gap: spacing.md,
  },
  center: {
    alignItems: 'center',
    gap: spacing.sm,
    paddingTop: spacing.xl,
  },
  gap: {
    gap: spacing.md,
  },
  board: {
    alignItems: 'center',
    paddingVertical: spacing.xl,
    borderRadius: 16,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xxs,
  },
  row: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  flex: {
    flex: 1,
  },
});
