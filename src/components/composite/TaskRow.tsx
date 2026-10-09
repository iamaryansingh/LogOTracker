import { StyleSheet, View } from 'react-native';

import { bucketOf, dueLabel } from '../../domain/tasks';
import type { Task } from '../../domain/types';
import { setReminderDone } from '../../services/reminders';
import { useAppStore } from '../../state/AppStore';
import { spacing, useTheme } from '../../theme';
import { haptics } from '../../utils/haptics';
import { PressableScale, Text } from '../primitives';

export interface TaskRowProps {
  task: Task;
  /** Opens the entry the to-do came from. */
  onOpenSource?: (logId: string) => void;
  isLast?: boolean;
}

export function TaskRow({ task, onOpenSource, isLast }: TaskRowProps) {
  const { colors } = useTheme();
  const { saveTasks, getLog, reminderLinks } = useAppStore();
  const due = dueLabel(task);
  const overdue = bucketOf(task) === 'Overdue';
  const source = task.sourceLogId ? getLog(task.sourceLogId) : undefined;

  const toggle = () => {
    haptics.selection();
    if (!task.done) haptics.success();
    saveTasks([{ ...task, done: !task.done, doneAt: task.done ? undefined : new Date().toISOString() }]);
    const rid = reminderLinks[task.id];
    if (rid) void setReminderDone(rid, !task.done);
  };

  return (
    <View style={[styles.row, !isLast && { borderBottomColor: colors.borderSubtle, borderBottomWidth: StyleSheet.hairlineWidth * 2 }]}>
      <PressableScale
        onPress={toggle}
        hitSlop={10}
        pressedScale={0.85}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: task.done }}
        accessibilityLabel={task.text}
        style={[styles.circle, { borderColor: task.done ? colors.state.calm : colors.textSecondary, backgroundColor: task.done ? colors.state.calm : 'transparent' }]}
      >
        {task.done && <Text style={[styles.tick, { color: colors.bgCard }]}>✓</Text>}
      </PressableScale>
      <PressableScale
        style={styles.text}
        disabled={!source || !onOpenSource}
        pressedScale={0.99}
        onPress={() => source && onOpenSource?.(source.id)}
        accessibilityLabel={source ? `${task.text}, from ${source.title}` : task.text}
      >
        <Text variant="body" tone={task.done ? 'secondary' : 'primary'} style={task.done ? styles.doneText : undefined}>
          {task.text}
        </Text>
        {(due || source) && (
          <Text variant="caption" tone={overdue ? 'stressHigh' : 'secondary'} numberOfLines={1}>
            {[due, source && `from ${source.title}`].filter(Boolean).join(' · ')}
          </Text>
        )}
      </PressableScale>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
  },
  circle: {
    width: 24,
    height: 24,
    borderRadius: 12,
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
    gap: 2,
  },
  doneText: {
    textDecorationLine: 'line-through',
  },
});
