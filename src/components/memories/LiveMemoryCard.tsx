import { useNavigation } from '@react-navigation/native';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Linking, StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';

import type { ParkedCar } from '../../domain/memoryTypes';
import { dwellLabel } from '../../domain/narrative';
import { deleteMemoryPhotos, pickMemoryPhotos, walkTo } from '../../services/memories/custom';
import { finishLiveMemory, liveProgress } from '../../services/memories/live';
import { useMemories } from '../../services/memories/MemoriesProvider';
import { enablePrompts, memoriesSupported, setLiveMode, startTracking } from '../../services/memories/tracking';
import { useAppStore } from '../../state/AppStore';
import { spacing, useTheme, withAlpha } from '../../theme';
import { haptics } from '../../utils/haptics';
import { Button, Card, Text } from '../primitives';

function RecordingDot() {
  const { colors } = useTheme();
  const opacity = useSharedValue(1);
  useEffect(() => {
    opacity.value = withRepeat(withTiming(0.25, { duration: 900 }), -1, true);
  }, [opacity]);
  const style = useAnimatedStyle(() => ({ opacity: opacity.value }));
  return <Animated.View style={[styles.dot, { backgroundColor: colors.memory.accentPin }, style]} />;
}

/** Start a live memory, see it build as you go, and End it to get the post. */
export function LiveMemoryCard() {
  const { colors } = useTheme();
  const navigation = useNavigation();
  const { liveMemory, setLiveMemory, saveCustomMemory, customMemories, memories: settings, setMemorySettings } = useAppStore();
  const { points, memories, refresh } = useMemories();
  const [busy, setBusy] = useState<'starting' | 'ending' | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [empty, setEmpty] = useState(false);
  const [, tick] = useState(0);

  // Keep the banner current while recording.
  useEffect(() => {
    if (!liveMemory) return;
    const t = setInterval(() => {
      tick((n) => n + 1);
      refresh();
    }, 60_000);
    return () => clearInterval(t);
  }, [liveMemory, refresh]);

  if (!memoriesSupported) return null;

  const start = async () => {
    setProblem(null);
    setBusy('starting');
    try {
      const r = await startTracking();
      if (!r.ok) {
        setProblem(
          r.reason === 'background-denied'
            ? 'Live memories need location set to “Always”, so they keep going with the phone in your pocket.'
            : 'Location access is off for Self Mirror.',
        );
        return;
      }
      if (!settings.enabled) setMemorySettings({ enabled: true });
      if (settings.prompts) await enablePrompts();
      await setLiveMode(true);
      setLiveMemory({ id: `live-${Date.now().toString(36)}`, startedAt: new Date().toISOString(), photos: [] });
      haptics.success();
    } finally {
      setBusy(null);
    }
  };

  const end = async () => {
    if (!liveMemory) return;
    setBusy('ending');
    setEmpty(false);
    try {
      const memory = await finishLiveMemory(liveMemory, settings.style, { memories, custom: Object.values(customMemories) });
      if (!memory) {
        setEmpty(true);
        return;
      }
      saveCustomMemory(memory);
      setLiveMemory(undefined);
      await setLiveMode(false).catch(() => undefined);
      haptics.success();
      navigation.navigate('MemoryPost', { id: memory.id });
    } finally {
      setBusy(null);
    }
  };

  const discard = async () => {
    if (liveMemory) deleteMemoryPhotos(liveMemory.photos);
    setLiveMemory(undefined);
    setEmpty(false);
    await setLiveMode(false).catch(() => undefined);
  };

  if (!liveMemory) {
    return (
      <Card style={styles.gap}>
        <Text variant="sectionTitle">Going somewhere?</Text>
        <Text variant="body" tone="secondary">
          Start a live memory and put your phone away. Where you park, each stop and what you did there, and the photos you take are
          gathered on their own. Tap End when you’re done.
        </Text>
        {busy === 'starting' ? <ActivityIndicator color={colors.textSecondary} /> : <Button label="● Start live memory" onPress={start} />}
        {problem && (
          <>
            <Text variant="caption" tone="stressLow">
              {problem}
            </Text>
            <Button label="Open Settings" variant="secondary" onPress={() => Linking.openSettings()} />
          </>
        )}
      </Card>
    );
  }

  const progress = liveProgress(points, liveMemory.startedAt);
  const since = new Date(liveMemory.startedAt).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  const stats = [
    progress.minutes >= 1 ? dwellLabel(progress.minutes) : 'Just started',
    progress.stops ? `${progress.stops} stop${progress.stops > 1 ? 's' : ''}` : null,
    progress.km >= 0.2 ? `${progress.km} km` : null,
    liveMemory.photos.length ? `${liveMemory.photos.length} added photo${liveMemory.photos.length > 1 ? 's' : ''}` : null,
  ].filter(Boolean);

  return (
    <Card style={[styles.gap, { borderColor: colors.memory.accentPin, backgroundColor: withAlpha(colors.memory.accentPin, 0.08) }]}>
      <View style={styles.row}>
        <RecordingDot />
        <Text variant="bodyMedium" style={styles.flex}>
          Live memory · since {since}
        </Text>
      </View>
      <Text variant="caption" tone="secondary">
        {stats.join(' · ')}
      </Text>
      <Text variant="caption" tone="secondary">
        Photos you take with the Camera are added automatically.
      </Text>
      {busy === 'ending' ? (
        <View style={styles.row}>
          <ActivityIndicator color={colors.textSecondary} />
          <Text variant="caption" tone="secondary">
            Writing your memory…
          </Text>
        </View>
      ) : empty ? (
        <>
          <Text variant="body" tone="secondary">
            Nothing to remember yet: no stops, photos or movement since you started.
          </Text>
          <View style={styles.row}>
            <Button label="Keep going" variant="secondary" style={styles.flex} onPress={() => setEmpty(false)} />
            <Button label="Discard" variant="ghost" style={styles.flex} onPress={discard} />
          </View>
        </>
      ) : (
        <View style={styles.row}>
          <Button
            label="📷 Add photo"
            variant="secondary"
            style={styles.flex}
            onPress={async () => {
              const picked = await pickMemoryPhotos();
              if (picked.length) setLiveMemory({ ...liveMemory, photos: [...liveMemory.photos, ...picked.map((p) => p.name)] });
            }}
          />
          <Button label="■ End" style={styles.flex} onPress={end} />
        </View>
      )}
    </Card>
  );
}

/** Where the car is, with walking directions back. */
export function CarCard({ car }: { car: ParkedCar }) {
  const [now] = useState(() => Date.now());
  const ago = dwellLabel((now - Date.parse(car.time)) / 60_000);
  return (
    <Card style={styles.row}>
      <Text style={styles.carEmoji}>🚗</Text>
      <View style={styles.flex}>
        <Text variant="bodyMedium">{car.name ? `Parked at ${car.name}` : 'Your car'}</Text>
        <Text variant="caption" tone="secondary">
          {ago} ago{car.toName ? ` · near ${car.toName}` : ''}
        </Text>
      </View>
      <Button label="Walk there" variant="secondary" style={styles.small} onPress={() => walkTo(car)} />
    </Card>
  );
}

const styles = StyleSheet.create({
  gap: {
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
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  carEmoji: {
    fontSize: 26,
  },
  small: {
    minHeight: 40,
    paddingHorizontal: spacing.md,
  },
});
