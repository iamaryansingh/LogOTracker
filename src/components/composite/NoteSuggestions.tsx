import * as Linking from 'expo-linking';
import { StyleSheet, View } from 'react-native';

import { NOTES_ROW, type NoteItem } from '../../domain/notes';
import { appleNotesSupported, NOTES_FOLDER } from '../../services/appleNotes';
import { alarmsSupported } from '../../services/alarms';
import { useAppStore } from '../../state/AppStore';
import { radii, spacing, useTheme, withAlpha } from '../../theme';
import { haptics } from '../../utils/haptics';
import { PressableScale, Text } from '../primitives';

export function describeWhen(date: Date, hasTime: boolean): string {
  const day = date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  return hasTime ? `${day} · ${date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}` : day;
}

export interface NoteSuggestionsProps {
  items: NoteItem[];
  /** Lines the user switched off. */
  off: Set<string>;
  onToggle: (line: string) => void;
  /** Lines already turned into events/tasks on an earlier save. */
  handled?: string[];
}

/** What the note seems to ask for, each switchable before saving. Nothing is created until Save. */
export function NoteSuggestions({ items, off, onToggle, handled = [] }: NoteSuggestionsProps) {
  const { colors } = useTheme();
  const { appleNotes, remindersSync } = useAppStore();
  const actionable = items.filter((i) => i.kind !== 'note');
  const noteLines = items.filter((i) => i.kind === 'note');
  const showNotes = appleNotesSupported && noteLines.length > 0 && !handled.includes(NOTES_ROW);
  if (actionable.length === 0 && !showNotes) return null;

  return (
    <View style={styles.list} accessibilityLabel="Found in your note">
      <Text variant="caption" tone="secondary">
        Found in your note
      </Text>
      {actionable.map((item) => {
        const done = handled.includes(item.line);
        const on = !done && !off.has(item.line);
        const accent = item.kind === 'event' ? colors.state.focus : item.kind === 'alarm' ? colors.state.stressLow : colors.state.calm;
        const label =
          item.kind === 'event'
            ? 'Add to Calendar'
            : item.kind === 'alarm'
              ? alarmsSupported()
                ? 'Set alarm'
                : 'Alarm (needs iOS 26)'
              : remindersSync
                ? 'Add to Reminders'
                : 'Add to-do';
        const title = item.kind === 'task' ? item.text : item.title;
        const when =
          item.kind === 'event'
            ? describeWhen(item.start, !item.allDay)
            : item.kind === 'alarm'
              ? `Rings ${describeWhen(item.at, true)}`
              : item.due
                ? `Due ${describeWhen(item.due, item.dueHasTime)}`
                : 'No date';
        return (
          <PressableScale
            key={item.line}
            disabled={done}
            pressedScale={0.98}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: on || done, disabled: done }}
            accessibilityLabel={`${label}: ${title}, ${when}`}
            onPress={() => {
              haptics.selection();
              onToggle(item.line);
            }}
            style={[
              styles.row,
              { borderColor: on ? withAlpha(accent, 0.4) : colors.borderSubtle, backgroundColor: on ? withAlpha(accent, 0.07) : colors.bgCard },
            ]}
          >
            <View style={[styles.check, { borderColor: on || done ? accent : colors.textSecondary, backgroundColor: on || done ? accent : 'transparent' }]}>
              {(on || done) && <Text style={[styles.tick, { color: colors.bgCard }]}>✓</Text>}
            </View>
            <View style={styles.text}>
              <Text variant="caption" style={{ color: accent }}>
                {done ? (item.kind === 'event' ? 'In your calendar' : item.kind === 'alarm' ? 'Alarm set' : 'Added to your to-dos') : label}
              </Text>
              <Text variant="bodyMedium" numberOfLines={2}>
                {title}
              </Text>
              <Text variant="caption" tone="secondary">
                {when}
              </Text>
            </View>
          </PressableScale>
        );
      })}
      {showNotes && (appleNotes ? (
        <PressableScale
          pressedScale={0.98}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: !off.has(NOTES_ROW) }}
          accessibilityLabel={`Save to Apple Notes, ${NOTES_FOLDER} folder`}
          onPress={() => {
            haptics.selection();
            onToggle(NOTES_ROW);
          }}
          style={[
            styles.row,
            !off.has(NOTES_ROW)
              ? { borderColor: withAlpha(colors.state.energy, 0.4), backgroundColor: withAlpha(colors.state.energy, 0.07) }
              : { borderColor: colors.borderSubtle, backgroundColor: colors.bgCard },
          ]}
        >
          <View style={[styles.check, { borderColor: !off.has(NOTES_ROW) ? colors.state.energy : colors.textSecondary, backgroundColor: !off.has(NOTES_ROW) ? colors.state.energy : 'transparent' }]}>
            {!off.has(NOTES_ROW) && <Text style={[styles.tick, { color: colors.bgCard }]}>✓</Text>}
          </View>
          <View style={styles.text}>
            <Text variant="caption" style={{ color: colors.state.energy }}>
              Save to Apple Notes · {NOTES_FOLDER}
            </Text>
            <Text variant="bodyMedium" numberOfLines={2}>
              {noteLines[0].line}
            </Text>
            <Text variant="caption" tone="secondary">
              {noteLines.length > 1 ? `+ ${noteLines.length - 1} more line${noteLines.length > 2 ? 's' : ''}` : 'The rest of your note'}
            </Text>
          </View>
        </PressableScale>
      ) : (
        <PressableScale
          pressedScale={0.98}
          accessibilityLabel="Set up Apple Notes"
          onPress={() => Linking.openURL(Linking.createURL('profile'))}
          style={[styles.row, { borderColor: colors.borderSubtle, backgroundColor: colors.bgCard, borderStyle: 'dashed' }]}
        >
          <View style={styles.text}>
            <Text variant="caption" style={{ color: colors.state.energy }}>
              Apple Notes
            </Text>
            <Text variant="body" tone="secondary">
              The rest of this note can go to your “{NOTES_FOLDER}” folder. One-time setup ›
            </Text>
          </View>
        </PressableScale>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  list: {
    gap: spacing.xs,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.sm,
    borderRadius: radii.chip,
    borderWidth: 1,
  },
  check: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tick: {
    fontSize: 13,
    lineHeight: 15,
    fontWeight: '700',
  },
  text: {
    flex: 1,
    gap: 1,
  },
});
