import { StyleSheet, View } from 'react-native';

import type { Insight } from '../../domain/memoryTypes';
import { spacing } from '../../theme';
import { Card, Text } from '../primitives';

export function InsightsCard({ insights }: { insights?: Insight[] }) {
  if (!insights?.length) return null;
  return (
    <Card style={styles.card}>
      <Text variant="caption" tone="secondary">
        Insights
      </Text>
      {insights.map((i) => (
        <View key={i.text} style={styles.row}>
          <Text style={styles.emoji}>{i.emoji}</Text>
          <Text variant="body" style={styles.flex}>
            {i.text}
          </Text>
        </View>
      ))}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'flex-start',
  },
  emoji: {
    fontSize: 18,
    lineHeight: 22,
  },
  flex: {
    flex: 1,
  },
});
