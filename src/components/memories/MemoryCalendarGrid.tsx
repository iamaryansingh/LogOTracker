import { Image, StyleSheet, View } from 'react-native';

import { radii, spacing, useTheme, withAlpha } from '../../theme';
import { toISODate } from '../../utils/time';
import { PressableScale, Text } from '../primitives';

export interface CalendarDay {
  /** Vibe colour of the day's memory. */
  color: string;
  /** A photo from that day, shown in the cell. */
  cover?: string;
  /** Memories that day (live day plus ones you made). */
  count: number;
}

export interface MemoryCalendarGridProps {
  /** Any date in the month shown. */
  month: Date;
  onMonthChange: (next: Date) => void;
  selected: string; // YYYY-MM-DD
  onSelect: (date: string) => void;
  days: Record<string, CalendarDay>;
}

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

/** A month of memories: days with photos show one, other memory days a vibe-coloured dot. */
export function MemoryCalendarGrid({ month, onMonthChange, selected, onSelect, days }: MemoryCalendarGridProps) {
  const { colors } = useTheme();
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const today = toISODate(new Date());
  const isCurrentMonth = first.getFullYear() === new Date().getFullYear() && first.getMonth() === new Date().getMonth();

  const cells: (string | null)[] = [...Array(first.getDay()).fill(null)];
  for (let d = 1; d <= daysInMonth; d++) cells.push(toISODate(new Date(month.getFullYear(), month.getMonth(), d)));
  while (cells.length % 7) cells.push(null);
  const weeks = Array.from({ length: cells.length / 7 }, (_, i) => cells.slice(i * 7, i * 7 + 7));
  const shift = (n: number) => onMonthChange(new Date(month.getFullYear(), month.getMonth() + n, 1));
  const memoryDays = Object.keys(days).filter((d) => d.startsWith(toISODate(first).slice(0, 7))).length;

  return (
    <View style={styles.wrap}>
      <View style={styles.head}>
        <PressableScale onPress={() => shift(-1)} accessibilityLabel="Previous month" hitSlop={12} style={styles.arrow}>
          <Text variant="sectionTitle" tone="secondary">
            ‹
          </Text>
        </PressableScale>
        <View style={styles.title}>
          <Text variant="sectionTitle">{first.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</Text>
          <Text variant="caption" tone="secondary">
            {memoryDays ? `${memoryDays} day${memoryDays > 1 ? 's' : ''} remembered` : 'No memories yet'}
          </Text>
        </View>
        <PressableScale
          onPress={() => shift(1)}
          disabled={isCurrentMonth}
          accessibilityLabel="Next month"
          hitSlop={12}
          style={[styles.arrow, isCurrentMonth && styles.disabled]}
        >
          <Text variant="sectionTitle" tone="secondary">
            ›
          </Text>
        </PressableScale>
      </View>

      <View style={styles.week}>
        {WEEKDAYS.map((w, i) => (
          <Text key={i} variant="caption" tone="secondary" style={styles.weekday}>
            {w}
          </Text>
        ))}
      </View>

      {weeks.map((week, wi) => (
        <View key={wi} style={styles.week}>
          {week.map((date, di) => {
            if (!date) return <View key={di} style={styles.cell} />;
            const info = days[date];
            const future = date > today;
            const isSelected = date === selected;
            const label = Number(date.slice(8));
            return (
              <PressableScale
                key={date}
                haptic
                disabled={future}
                onPress={() => onSelect(date)}
                pressedScale={0.92}
                accessibilityLabel={`${new Date(`${date}T12:00:00`).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}${info ? `, ${info.count} memor${info.count > 1 ? 'ies' : 'y'}` : ''}`}
                accessibilityState={{ selected: isSelected, disabled: future }}
                style={styles.cell}
              >
                <View
                  style={[
                    styles.day,
                    info && !info.cover && { backgroundColor: withAlpha(info.color, 0.2) },
                    date === today && { borderColor: colors.textSecondary, borderWidth: 1 },
                    isSelected && { borderColor: colors.memory.accentPin, borderWidth: 2 },
                  ]}
                >
                  {info?.cover && <Image source={{ uri: info.cover }} style={StyleSheet.absoluteFill} resizeMode="cover" />}
                  {info?.cover && <View style={[StyleSheet.absoluteFill, { backgroundColor: withAlpha(colors.bgSurface, 0.25) }]} />}
                  <Text
                    variant="caption"
                    tone={future ? 'secondary' : 'primary'}
                    style={[styles.num, info?.cover && styles.numOnPhoto, info && { fontWeight: '600' }, future && styles.disabled]}
                  >
                    {label}
                  </Text>
                  {info && !info.cover && <View style={[styles.dot, { backgroundColor: info.color }]} />}
                </View>
              </PressableScale>
            );
          })}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: spacing.xxs,
  },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  title: {
    flex: 1,
    alignItems: 'center',
  },
  arrow: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  disabled: {
    opacity: 0.35,
  },
  week: {
    flexDirection: 'row',
  },
  weekday: {
    flex: 1,
    textAlign: 'center',
  },
  cell: {
    flex: 1,
    aspectRatio: 1,
    padding: 2,
  },
  day: {
    flex: 1,
    borderRadius: radii.chip,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  num: {
    fontVariant: ['tabular-nums'],
  },
  numOnPhoto: {
    position: 'absolute',
    top: 3,
    left: 5,
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowRadius: 3,
    color: 'white',
  },
  dot: {
    position: 'absolute',
    bottom: 5,
    width: 5,
    height: 5,
    borderRadius: 2.5,
  },
});
