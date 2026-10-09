import { BottomSheetScrollView, BottomSheetTextInput } from '@gorhom/bottom-sheet';
import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { createNoteEntry } from '../../domain/events';
import { acceptedItems, parseNote } from '../../domain/notes';
import { useNoteActions } from '../../services/noteActions';
import { radii, screenPadding, spacing, typography, useTheme } from '../../theme';
import { haptics } from '../../utils/haptics';
import { fromISODate, toISODate } from '../../utils/time';
import { Button, Text } from '../primitives';
import { NoteHints } from './NoteHints';
import { VoiceButton } from './VoiceButton';
import { NoteSuggestions } from './NoteSuggestions';

/** A standalone note or reminder on the timeline. Dates and to-dos inside it are picked up like any note. */
export function NoteForm({ day, onDone }: { day?: string; onDone: () => void }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const commitNote = useNoteActions();
  const [text, setText] = useState('');
  const [off, setOff] = useState<Set<string>>(new Set());
  const items = useMemo(() => parseNote(text), [text]);

  const save = () => {
    if (!text.trim()) return;
    const isToday = !day || day === toISODate(new Date());
    const at = isToday ? new Date() : new Date(fromISODate(day).setHours(12, 0, 0, 0));
    void commitNote(
      createNoteEntry(text, at),
      acceptedItems(items, off),
    );
    haptics.success();
    onDone();
  };

  return (
    <BottomSheetScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.lg }]}>
      <View style={styles.header}>
        <Text variant="sectionTitle">Note or reminder</Text>
        <VoiceButton value={text} onChange={setText} />
      </View>
      <BottomSheetTextInput
        value={text}
        onChangeText={setText}
        autoFocus
        multiline
        placeholder="Anything to remember…"
        placeholderTextColor={colors.textSecondary}
        style={[typography.body, styles.input, { color: colors.textPrimary, backgroundColor: colors.bgSurface, borderColor: colors.borderSubtle }]}
      />
      <NoteHints onUse={(t) => setText((prev) => (prev.trim() ? `${prev.trimEnd()}\n${t}` : t))} />
      <NoteSuggestions
        items={items}
        off={off}
        onToggle={(line) =>
          setOff((prev) => {
            const next = new Set(prev);
            if (next.has(line)) next.delete(line);
            else next.add(line);
            return next;
          })
        }
      />
      <Text variant="caption" tone="secondary">
        Plans with a date go to Calendar, things to do go to Reminders, and everything else is kept as a note (and in Apple Notes, if set up).
      </Text>
      <Button label="Save" disabled={!text.trim()} onPress={save} />
    </BottomSheetScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: screenPadding,
    paddingTop: spacing.xs,
    gap: spacing.md,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  input: {
    minHeight: 120,
    borderWidth: 1,
    borderRadius: radii.chip,
    padding: spacing.sm,
    textAlignVertical: 'top',
  },
});
