import { useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, TextInput, View } from 'react-native';

import type { MapPlace } from '../../../modules/self-mirror-places';
import { placeHabits } from '../../domain/places';
import { currentPlace } from '../../services/memories/custom';
import { useMemories } from '../../services/memories/MemoriesProvider';
import { searchPlaces } from '../../services/memories/places';
import { useAppStore } from '../../state/AppStore';
import { radii, spacing, typography, useTheme } from '../../theme';
import { haptics } from '../../utils/haptics';
import { Button, Card, ListRow, PressableScale, Text } from '../primitives';

/**
 * Where home is. Memories never prompt there, and it's left out of places and suggestions.
 * Set from where you are now, a search, or one of the places you spend the most time.
 */
export function HomeCard() {
  const { colors } = useTheme();
  const { memories: settings, setMemorySettings } = useAppStore();
  const { memories } = useMemories();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<MapPlace[]>([]);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const home = settings.home;

  const choose = (p: { name: string; latitude: number; longitude: number }) => {
    setMemorySettings({ home: { name: p.name, latitude: p.latitude, longitude: p.longitude } });
    haptics.success();
    setOpen(false);
    setQuery('');
    setResults([]);
  };

  const search = (text: string) => {
    setQuery(text);
    if (timer.current) clearTimeout(timer.current);
    if (text.trim().length < 2) return setResults([]);
    timer.current = setTimeout(async () => setResults(await searchPlaces(text)), 350);
  };

  // Places you spend the most time at are the likeliest homes.
  const candidates = placeHabits(memories)
    .sort((a, b) => b.totalMin - a.totalMin)
    .slice(0, 4);

  return (
    <Card style={styles.gap}>
      <View style={styles.row}>
        <Text style={styles.emoji}>🏠</Text>
        <View style={styles.flex}>
          <Text variant="bodyMedium">{home ? home.name : 'Home isn’t set'}</Text>
          <Text variant="caption" tone="secondary">
            {home ? 'No memory prompts here.' : 'Set it so you’re never prompted at home.'}
          </Text>
        </View>
        {!open && <Button label={home ? 'Change' : 'Set home'} variant="secondary" style={styles.small} onPress={() => setOpen(true)} />}
      </View>

      {open && (
        <View style={styles.gap}>
          {busy ? (
            <ActivityIndicator color={colors.textSecondary} />
          ) : (
            <Button
              label="➤ I’m home now"
              onPress={async () => {
                setProblem(null);
                setBusy(true);
                try {
                  const here = await currentPlace();
                  if (here) choose({ ...here, name: here.name === 'Dropped pin' ? 'Home' : here.name });
                  else setProblem('Location is off for Self Mirror.');
                } finally {
                  setBusy(false);
                }
              }}
            />
          )}
          <TextInput
            value={query}
            onChangeText={search}
            placeholder="Or search your address"
            placeholderTextColor={colors.textSecondary}
            autoCorrect={false}
            style={[typography.body, styles.input, { color: colors.textPrimary, borderColor: colors.borderSubtle, backgroundColor: colors.bgSurface }]}
          />
          {results.map((p, i) => (
            <ListRow key={`${p.name}-${p.latitude}`} title={p.name} detail={p.address ?? p.city} isLast={i === results.length - 1} onPress={() => choose(p)} />
          ))}
          {!query && candidates.length > 0 && (
            <>
              <Text variant="caption" tone="secondary">
                Or one of your places
              </Text>
              {candidates.map((p, i) => (
                <ListRow key={`${p.name}-${p.latitude}`} title={p.name} detail={`${p.visits} visit${p.visits > 1 ? 's' : ''}`} isLast={i === candidates.length - 1} onPress={() => choose(p)} />
              ))}
            </>
          )}
          {problem && (
            <Text variant="caption" tone="stressLow">
              {problem}
            </Text>
          )}
          <View style={styles.row}>
            {home && (
              <PressableScale onPress={() => { setMemorySettings({ home: undefined }); setOpen(false); }} hitSlop={8} accessibilityLabel="Clear home">
                <Text variant="caption" tone="secondary">
                  Clear home
                </Text>
              </PressableScale>
            )}
            <View style={styles.flex} />
            <PressableScale onPress={() => setOpen(false)} hitSlop={8} accessibilityLabel="Done">
              <Text variant="caption" tone="focus">
                Done
              </Text>
            </PressableScale>
          </View>
        </View>
      )}
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
  emoji: {
    fontSize: 26,
  },
  small: {
    minHeight: 36,
    paddingHorizontal: spacing.md,
  },
  input: {
    minHeight: 44,
    borderWidth: 1,
    borderRadius: radii.chip,
    paddingHorizontal: spacing.sm,
  },
});
