import { StyleSheet, View } from 'react-native';

import type { EnergyBalance, FlowItem } from '../../domain/analytics';
import { spacing, useTheme } from '../../theme';
import { formatHours } from '../../utils/time';
import { Card, Text } from '../primitives';

const TOP = 3;

function FlowList({ title, items, color }: { title: string; items: FlowItem[]; color: string }) {
  return (
    <View style={styles.column}>
      <View style={styles.legend}>
        <View style={[styles.dot, { backgroundColor: color }]} />
        <Text variant="caption" tone="secondary">
          {title}
        </Text>
      </View>
      {items.length === 0 ? (
        <Text variant="caption" tone="secondary">
          None yet
        </Text>
      ) : (
        items.slice(0, TOP).map((i) => (
          <View key={i.key} style={styles.item}>
            <Text variant="body" numberOfLines={1} style={styles.itemTitle}>
              {i.title}
              {i.count > 1 ? <Text variant="caption" tone="secondary">{`  ×${i.count}`}</Text> : null}
            </Text>
            <Text variant="caption" tone="secondary" style={styles.num}>
              {formatHours(i.hours)}
            </Text>
          </View>
        ))
      )}
    </View>
  );
}

export interface EnergyBalanceCardProps {
  balance: EnergyBalance;
  /** "today" or "this week", used in the summary sentence. */
  period: string;
}

/** What gave energy (producers) versus what took it (consumers), by time spent. */
export function EnergyBalanceCard({ balance, period }: EnergyBalanceCardProps) {
  const { colors } = useTheme();
  const { producedHours: p, consumedHours: c, neutralHours: n } = balance;
  const total = p + c + n;
  const produce = colors.state.calm;
  const consume = colors.state.stressLow;

  if (total === 0) {
    return (
      <Card>
        <Text variant="body" tone="secondary">
          Log activities and say whether they gave or took energy. Your producers and consumers show up here.
        </Text>
      </Card>
    );
  }

  const summary =
    p === 0 && c === 0
      ? `Nothing ${period} was marked as giving or taking energy.`
      : p >= c * 1.25
        ? `More of your time ${period} gave energy than took it.`
        : c >= p * 1.25
          ? `${capitalize(period)} leaned toward things that drain you. A producer might help.`
          : `${capitalize(period)} was fairly balanced between giving and taking.`;

  const segments = [
    { key: 'p', hours: p, color: produce },
    { key: 'n', hours: n, color: colors.borderSubtle },
    { key: 'c', hours: c, color: consume },
  ].filter((s) => s.hours > 0);

  return (
    <Card style={styles.card}>
      <View
        style={styles.bar}
        accessible
        accessibilityRole="image"
        accessibilityLabel={`Gave energy ${formatHours(p)}, took energy ${formatHours(c)}${n > 0 ? `, neutral ${formatHours(n)}` : ''}`}
      >
        {segments.map((s) => (
          <View key={s.key} style={[styles.segment, { flex: s.hours, backgroundColor: s.color }]} />
        ))}
      </View>
      <View style={styles.totals}>
        <Text variant="bodyMedium">
          {formatHours(p)} <Text variant="caption" tone="secondary">gave energy</Text>
        </Text>
        <Text variant="bodyMedium">
          {formatHours(c)} <Text variant="caption" tone="secondary">took energy</Text>
        </Text>
      </View>
      <Text variant="caption" tone="secondary">
        {summary}
      </Text>
      <View style={styles.columns}>
        <FlowList title="Producers" items={balance.producers} color={produce} />
        <FlowList title="Consumers" items={balance.consumers} color={consume} />
      </View>
    </Card>
  );
}

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

const styles = StyleSheet.create({
  card: {
    gap: spacing.sm,
  },
  bar: {
    flexDirection: 'row',
    height: 10,
    borderRadius: 5,
    overflow: 'hidden',
    // 2px surface gap between segments.
    gap: 2,
  },
  segment: {
    height: '100%',
  },
  totals: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  columns: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.xxs,
  },
  column: {
    flex: 1,
    gap: spacing.xxs,
  },
  legend: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginBottom: 2,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  item: {
    gap: 0,
  },
  itemTitle: {
    flexShrink: 1,
  },
  num: {
    fontVariant: ['tabular-nums'],
  },
});
