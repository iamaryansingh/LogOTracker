import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { radii, spacing, useTheme, withAlpha } from '../../theme';
import { PressableScale, Text } from '../primitives';
import { Polaroid } from './Polaroid';

export interface PostItNoteProps {
  emoji: string;
  title: string;
  /** "7:10 – 8:20 PM · 1 h 10 min". */
  time?: string;
  detail?: string;
  tint: string;
  /** Position in the list; alternates the slight tilt. */
  index: number;
  photos?: string[];
  onOpenMaps?: () => void;
  extraAction?: { label: string; onPress: () => void };
  /** Shows a ✎ Fix action for correcting the step. */
  onEdit?: () => void;
  children?: ReactNode;
}

/** One step of a memory as a sticky note: tinted paper, a strip of tape, a slight tilt. */
export function PostItNote({ emoji, title, time, detail, tint, index, photos, onOpenMaps, extraAction, onEdit, children }: PostItNoteProps) {
  const { colors } = useTheme();
  const tilt = index % 2 === 0 ? '-0.6deg' : '0.6deg';
  return (
    <View style={[styles.note, { backgroundColor: colors.bgCard, shadowColor: colors.textPrimary, transform: [{ rotate: tilt }] }]}>
      <View style={[StyleSheet.absoluteFill, styles.paper, { backgroundColor: withAlpha(tint, 0.16) }]} />
      <View style={[styles.tape, { backgroundColor: withAlpha(colors.textSecondary, 0.18) }]} />
      <View style={styles.head}>
        <Text style={styles.emoji}>{emoji}</Text>
        <View style={styles.flex}>
          {time ? (
            <Text variant="caption" tone="secondary">
              {time}
            </Text>
          ) : null}
          <Text variant="bodyMedium">{title}</Text>
          {detail ? (
            <Text variant="caption" tone="secondary">
              {detail}
            </Text>
          ) : null}
        </View>
      </View>
      {children}
      {photos?.length ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.photos}>
          {photos.map((u, i) => (
            <Polaroid key={u} uri={u} width={92} pinColor={colors.memory.pins[i % colors.memory.pins.length]} />
          ))}
        </ScrollView>
      ) : null}
      {(onOpenMaps || extraAction || onEdit) && (
        <View style={styles.actions}>
          {onOpenMaps && (
            <PressableScale onPress={onOpenMaps} accessibilityLabel={`Open ${title} in Maps`} hitSlop={8}>
              <Text variant="caption" style={{ color: colors.memory.vibeExplore }}>
                Open in Maps ›
              </Text>
            </PressableScale>
          )}
          {onEdit && (
            <PressableScale onPress={onEdit} accessibilityLabel={`Fix ${title}`} hitSlop={8}>
              <Text variant="caption" tone="secondary">
                ✎ Fix
              </Text>
            </PressableScale>
          )}
          {extraAction && (
            <PressableScale onPress={extraAction.onPress} accessibilityLabel={extraAction.label} hitSlop={8}>
              <Text variant="caption" style={{ color: colors.memory.accentPin }}>
                {extraAction.label}
              </Text>
            </PressableScale>
          )}
        </View>
      )}
    </View>
  );
}

/** The small line between notes: a walk or a drive. */
export function NoteConnector({ emoji, text, onEdit }: { emoji: string; text: string; onEdit?: () => void }) {
  const { colors } = useTheme();
  return (
    <PressableScale onPress={onEdit} disabled={!onEdit} pressedScale={0.98} accessibilityLabel={onEdit ? `${text}. Tap to fix` : text} style={styles.connector}>
      <View style={[styles.line, { backgroundColor: colors.borderSubtle }]} />
      <Text variant="caption" tone="secondary" style={styles.flex}>
        {emoji} {text}
      </Text>
      {onEdit && (
        <Text variant="caption" tone="secondary">
          ✎
        </Text>
      )}
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  note: {
    borderRadius: radii.chip,
    padding: spacing.md,
    paddingTop: spacing.lg,
    gap: spacing.xs,
    shadowOpacity: 0.08,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  paper: {
    borderRadius: radii.chip,
  },
  tape: {
    position: 'absolute',
    top: -6,
    alignSelf: 'center',
    width: 56,
    height: 14,
    borderRadius: 2,
  },
  head: {
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'flex-start',
  },
  emoji: {
    fontSize: 26,
    lineHeight: 32,
  },
  flex: {
    flex: 1,
    gap: 2,
  },
  photos: {
    gap: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xs,
    paddingHorizontal: spacing.xxs,
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  connector: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingLeft: spacing.lg,
  },
  line: {
    width: 2,
    height: 22,
    borderRadius: 1,
  },
});
