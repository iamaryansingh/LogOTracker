import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import Animated, { FadeInDown, FadeOut } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { InputSourceCard } from '../components/composite/InputSourceCard';
import { ScreenHeader } from '../components/composite/ScreenHeader';
import { Button, Card, Text } from '../components/primitives';
import { INPUT_SOURCES } from '../data/inputSources';
import type { RootStackParamList } from '../navigation/types';
import { clearEnrichmentCaches } from '../services/memories/enrich';
import { clearPoints } from '../services/memories/points';
import { stopTracking } from '../services/memories/tracking';
import { useSync } from '../services/sync/SyncProvider';
import type { HealthReport } from '../services/health/validate';
import { useAppStore } from '../state/AppStore';
import { screenPadding, spacing, useTheme } from '../theme';
import { haptics } from '../utils/haptics';

function HealthReportCard({ report }: { report: HealthReport }) {
  const skipped = Object.entries(report.skipped);
  const total = skipped.reduce((n, [, c]) => n + c, 0);
  const at = new Date(report.syncedAt).toLocaleString(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' });
  return (
    <Card style={styles.promise}>
      <Text variant="bodyMedium">Last Health sync · {at}</Text>
      <Text variant="body" tone="secondary">
        Checked {report.days} days of activity, {report.nights} night{report.nights === 1 ? '' : 's'} of sleep
        {report.naps ? `, ${report.naps} nap${report.naps === 1 ? '' : 's'}` : ''} and {report.workouts} workout
        {report.workouts === 1 ? '' : 's'}. Each night is filed under the day you woke up.
      </Text>
      {total > 0 && (
        <Text variant="caption" tone="secondary">
          Left out {total} item{total === 1 ? '' : 's'} that didn’t look right: {skipped.map(([reason, n]) => `${n} ${reason}`).join(', ')}.
        </Text>
      )}
    </Card>
  );
}

export function PrivacyCenterScreen({ navigation }: NativeStackScreenProps<RootStackParamList, 'PrivacyCenter'>) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { inputs, resetAllData, healthReport } = useAppStore();
  const { wipe } = useSync();
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const activeCount = Object.values(inputs).filter(Boolean).length;

  return (
    <ScrollView
      style={{ backgroundColor: colors.bgSurface }}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + spacing.lg, paddingBottom: insets.bottom + spacing.xl }]}
    >
      <ScreenHeader
        title="Privacy Center"
        caption={`${activeCount} of ${INPUT_SOURCES.length} inputs on`}
        navAction={{ label: 'Back', onPress: navigation.goBack }}
      />

      <Card style={styles.promise}>
        <Text variant="bodyMedium">What happens to your data</Text>
        <Text variant="body" tone="secondary">
          Everything is processed on your devices and kept in your own private iCloud, so your iPad and iPhone stay in
          step. There’s no Self Mirror account, no server, and no analytics. Nothing is shared or sold.
        </Text>
        <Text variant="body" tone="secondary">
          Health adds your steps, Move calories, workouts and sleep to your timeline and charts, including data from other
          fitness apps that save to Apple Health or Health Connect. Motion shows today’s steps when Health is off. Location
          builds your Memories (where you spent time), kept only on this iPhone. Calendar and Reminders hold the events and to-dos
          your notes create.
        </Text>
      </Card>

      <View style={styles.section}>
        <Text variant="sectionTitle" accessibilityRole="header">
          Inputs
        </Text>
        {INPUT_SOURCES.map((info) => (
          <InputSourceCard key={info.source} info={info} />
        ))}
        {inputs.Health && healthReport && <HealthReportCard report={healthReport} />}
      </View>

      <View style={styles.section}>
        <Text variant="sectionTitle" accessibilityRole="header">
          Your data
        </Text>
        <Card style={styles.promise}>
          <Text variant="body" tone="secondary">
            Removes every entry, rating, journal and choice from this device and your iCloud, then restarts the introduction.
          </Text>
          {confirmingDelete ? (
            <Animated.View entering={FadeInDown.duration(200)} exiting={FadeOut.duration(120)} style={styles.confirm}>
              <Text variant="bodyMedium" tone="stressHigh">
                Delete everything? This can’t be undone.
              </Text>
              <View style={styles.confirmRow}>
                <Button label="Keep it" variant="secondary" style={styles.flex} onPress={() => setConfirmingDelete(false)} />
                <Button
                  label="Delete"
                  style={[styles.flex, { backgroundColor: colors.state.stressHigh }]}
                  onPress={async () => {
                    haptics.warning();
                    await wipe();
                    await stopTracking().catch(() => undefined);
                    await clearPoints();
                    await clearEnrichmentCaches();
                    resetAllData();
                  }}
                />
              </View>
            </Animated.View>
          ) : (
            <Button label="Delete all my data" variant="secondary" onPress={() => setConfirmingDelete(true)} />
          )}
        </Card>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: screenPadding,
    gap: spacing.lg,
  },
  promise: {
    gap: spacing.sm,
  },
  section: {
    gap: spacing.sm,
  },
  confirm: {
    gap: spacing.sm,
  },
  confirmRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  flex: {
    flex: 1,
  },
});
