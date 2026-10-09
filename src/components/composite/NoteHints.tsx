import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeInDown, FadeOutUp, useReducedMotion } from 'react-native-reanimated';

import { NOTE_EXAMPLES, type NoteDestination } from '../../domain/notes';
import { radii, spacing, useTheme, withAlpha, type StateToken } from '../../theme';
import { haptics } from '../../utils/haptics';
import { PressableScale, Text } from '../primitives';

const ROTATE_MS = 3800;

const destinationToken: Record<NoteDestination, StateToken> = {
  Reminders: 'calm',
  Calendar: 'focus',
  Notes: 'energy',
  Alarm: 'stressLow',
};

export interface NoteHintsProps {
  /** Adds the example to the note so it can be edited. */
  onUse: (text: string) => void;
}

/** A slowly rotating example of what to write, and where it will go. Tap to use it. */
export function NoteHints({ onUse }: NoteHintsProps) {
  const { colors } = useTheme();
  const reduceMotion = useReducedMotion();
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setIndex((i) => (i + 1) % NOTE_EXAMPLES.length), ROTATE_MS);
    return () => clearInterval(t);
  }, []);

  const example = NOTE_EXAMPLES[index];
  const color = colors.state[destinationToken[example.goesTo]];

  return (
    <View style={styles.wrap}>
      <Text variant="caption" tone="secondary">
        Try
      </Text>
      <Animated.View
        key={index}
        entering={reduceMotion ? undefined : FadeInDown.duration(260)}
        exiting={reduceMotion ? undefined : FadeOutUp.duration(180)}
        style={styles.flex}
      >
        <PressableScale
          pressedScale={0.97}
          onPress={() => {
            haptics.selection();
            onUse(example.text);
          }}
          accessibilityRole="button"
          accessibilityLabel={`Example: ${example.text}. Goes to ${example.goesTo}. Tap to add it to your note.`}
          style={[styles.hint, { backgroundColor: withAlpha(color, 0.08), borderColor: withAlpha(color, 0.25) }]}
        >
          <Text variant="caption" numberOfLines={2} style={styles.flex}>
            “{example.text}”
          </Text>
          <Text variant="caption" style={{ color }}>
            → {example.goesTo}
          </Text>
        </PressableScale>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    minHeight: 34,
    overflow: 'hidden',
  },
  flex: {
    flex: 1,
  },
  hint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: 6,
    paddingHorizontal: spacing.sm,
    borderRadius: radii.pill,
    borderWidth: 1,
  },
});
