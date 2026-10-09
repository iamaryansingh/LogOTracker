import { useRef, useState } from 'react';
import { ActivityIndicator, Modal, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { MapPlace } from '../../../modules/self-mirror-places';
import type { MemoryPlace } from '../../domain/memoryTypes';
import { searchPlaces } from '../../services/memories/places';
import { radii, screenPadding, spacing, typography, useTheme } from '../../theme';
import { haptics } from '../../utils/haptics';
import { Button, ListRow, PressableScale, SelectablePill, Text } from '../primitives';

export type StepMode = 'walk' | 'run' | 'cycle' | 'drive' | 'transit';

/** One step of a memory's timeline, as the editor sees it. */
export interface EditableStep {
  kind: 'stop' | 'parked' | 'move';
  title: string;
  emoji: string;
  detail?: string;
  place?: MemoryPlace;
  mode?: StepMode;
  km?: number;
}

const ACTIVITIES: { word: string; emoji: string }[] = [
  { word: 'Breakfast', emoji: '🍳' },
  { word: 'Brunch', emoji: '🥞' },
  { word: 'Lunch', emoji: '🥗' },
  { word: 'Dinner', emoji: '🍽️' },
  { word: 'Coffee', emoji: '☕' },
  { word: 'Drinks', emoji: '🍻' },
  { word: 'Shopping', emoji: '🛍️' },
  { word: 'Groceries', emoji: '🛒' },
  { word: 'Workout', emoji: '🏋️' },
  { word: 'A walk', emoji: '🚶' },
  { word: 'Work', emoji: '💻' },
  { word: 'Studying', emoji: '📚' },
  { word: 'A movie', emoji: '🎬' },
  { word: 'Friends', emoji: '🫶' },
  { word: 'An errand', emoji: '📋' },
  { word: 'Just passing by', emoji: '👟' },
];

export const MODES: { mode: StepMode; verb: string; emoji: string }[] = [
  { mode: 'walk', verb: 'Walked', emoji: '🚶' },
  { mode: 'run', verb: 'Ran', emoji: '🏃' },
  { mode: 'cycle', verb: 'Cycled', emoji: '🚴' },
  { mode: 'drive', verb: 'Drove', emoji: '🚗' },
  { mode: 'transit', verb: 'Bus or train', emoji: '🚌' },
];

const activityTitle = (word: string, place?: string) =>
  !place ? word : word === 'Just passing by' ? `Passing by ${place}` : word === 'Friends' ? `With friends at ${place}` : `${word} at ${place}`;

/**
 * Fix a step the app got wrong: what you did there, the place, how you got around, a note — or
 * remove it. Opens as a sheet over the memory.
 */
export function StepEditor({ step, onSave, onDelete, onClose }: { step: EditableStep | null; onSave: (s: EditableStep) => void; onDelete: () => void; onClose: () => void }) {
  return (
    <Modal visible={!!step} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      {step && <EditorBody key={step.title + step.kind} step={step} onSave={onSave} onDelete={onDelete} onClose={onClose} />}
    </Modal>
  );
}

function EditorBody({ step, onSave, onDelete, onClose }: { step: EditableStep; onSave: (s: EditableStep) => void; onDelete: () => void; onClose: () => void }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [draft, setDraft] = useState<EditableStep>(step);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<MapPlace[]>([]);
  const [searching, setSearching] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const input = [typography.body, styles.input, { color: colors.textPrimary, borderColor: colors.borderSubtle, backgroundColor: colors.bgCard }];
  const placeName = draft.place?.name;

  const search = (text: string) => {
    setQuery(text);
    if (timer.current) clearTimeout(timer.current);
    if (text.trim().length < 2) return setResults([]);
    timer.current = setTimeout(async () => {
      setSearching(true);
      try {
        setResults(await searchPlaces(text, draft.place));
      } finally {
        setSearching(false);
      }
    }, 350);
  };

  const pickPlace = (p: MapPlace) => {
    const place: MemoryPlace = { name: p.name, latitude: p.latitude, longitude: p.longitude, locality: p.locality, city: p.city };
    // Keep what you did, move it to the new place: "Dinner at A" → "Dinner at B".
    const title = placeName && draft.title.includes(placeName) ? draft.title.replace(placeName, p.name) : draft.title;
    setDraft({ ...draft, place, title });
    setQuery('');
    setResults([]);
    haptics.selection();
  };

  return (
    <ScrollView style={{ backgroundColor: colors.bgSurface }} keyboardShouldPersistTaps="handled" contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.xl }]}>
      <View style={styles.head}>
        <PressableScale onPress={onClose} hitSlop={10} accessibilityLabel="Cancel">
          <Text variant="bodyMedium" tone="secondary">
            Cancel
          </Text>
        </PressableScale>
        <Text variant="sectionTitle">Fix this step</Text>
        <PressableScale
          onPress={() => {
            onSave({ ...draft, title: draft.title.trim() || step.title });
            haptics.success();
          }}
          hitSlop={10}
          accessibilityLabel="Save"
        >
          <Text variant="bodyMedium" style={{ color: colors.memory.accentPin }}>
            Save
          </Text>
        </PressableScale>
      </View>

      <View style={styles.preview}>
        <Text style={styles.emoji}>{draft.emoji}</Text>
        <TextInput value={draft.title} onChangeText={(title) => setDraft({ ...draft, title })} style={[...input, styles.flex, typography.bodyMedium]} accessibilityLabel="Title" />
      </View>

      {draft.kind === 'stop' && (
        <View style={styles.gap}>
          <Text variant="caption" tone="secondary">
            What were you doing?
          </Text>
          <View style={styles.wrap}>
            {ACTIVITIES.map((a) => (
              <SelectablePill
                key={a.word}
                label={`${a.emoji} ${a.word}`}
                selected={draft.title === activityTitle(a.word, placeName)}
                onPress={() => {
                  setDraft({ ...draft, emoji: a.emoji, title: activityTitle(a.word, placeName) });
                  haptics.selection();
                }}
              />
            ))}
          </View>
        </View>
      )}

      {draft.kind === 'move' && (
        <View style={styles.gap}>
          <Text variant="caption" tone="secondary">
            How did you get around?
          </Text>
          <View style={styles.wrap}>
            {MODES.map((m) => (
              <SelectablePill
                key={m.mode}
                label={`${m.emoji} ${m.verb}`}
                selected={draft.mode === m.mode}
                onPress={() => {
                  setDraft({ ...draft, mode: m.mode, emoji: m.emoji, title: `${m.mode === 'transit' ? 'By bus or train' : m.verb}${draft.km ? ` ${draft.km} km` : ''}` });
                  haptics.selection();
                }}
              />
            ))}
          </View>
        </View>
      )}

      {draft.kind !== 'move' && (
        <View style={styles.gap}>
          <Text variant="caption" tone="secondary">
            Place{placeName ? `: ${placeName}` : ''}
          </Text>
          <TextInput value={query} onChangeText={search} placeholder="Wrong place? Search Apple Maps" placeholderTextColor={colors.textSecondary} autoCorrect={false} style={input} />
          {searching && <ActivityIndicator color={colors.textSecondary} />}
          {results.map((p, i) => (
            <ListRow key={`${p.name}-${p.latitude}`} title={p.name} detail={p.address ?? p.city} isLast={i === results.length - 1} onPress={() => pickPlace(p)} />
          ))}
        </View>
      )}

      <View style={styles.gap}>
        <Text variant="caption" tone="secondary">
          Note
        </Text>
        <TextInput
          value={draft.detail ?? ''}
          onChangeText={(detail) => setDraft({ ...draft, detail })}
          placeholder="Anything to remember about it"
          placeholderTextColor={colors.textSecondary}
          multiline
          style={[...input, styles.multi]}
        />
      </View>

      {confirmDelete ? (
        <View style={styles.gap}>
          <Text variant="body">Remove this step from the memory?</Text>
          <View style={styles.row}>
            <Button label="Keep it" variant="secondary" style={styles.flex} onPress={() => setConfirmDelete(false)} />
            <Button label="Remove" style={[styles.flex, { backgroundColor: colors.state.stressHigh }]} onPress={onDelete} />
          </View>
        </View>
      ) : (
        <Button label={step.kind === 'parked' ? 'I didn’t park here' : 'Remove this step'} variant="ghost" onPress={() => setConfirmDelete(true)} />
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: screenPadding,
    paddingTop: spacing.lg,
    gap: spacing.lg,
  },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  preview: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  emoji: {
    fontSize: 30,
  },
  gap: {
    gap: spacing.sm,
  },
  wrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  row: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  flex: {
    flex: 1,
  },
  input: {
    minHeight: 44,
    borderWidth: 1,
    borderRadius: radii.chip,
    paddingHorizontal: spacing.sm,
  },
  multi: {
    minHeight: 80,
    paddingTop: spacing.sm,
    textAlignVertical: 'top',
  },
});
