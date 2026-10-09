import { useNavigation } from '@react-navigation/native';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeOut, LinearTransition } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { DaySummaryHeader } from '../components/composite/DaySummaryHeader';
import { useCapture } from '../components/composite/QuickCaptureBottomSheet';
import { Button, PressableScale, Text } from '../components/primitives';
import { ArrangeDashboard } from '../components/today/ArrangeDashboard';
import { useTodayWidgets } from '../components/today/TodayWidgets';
import { dayStats, loadFor } from '../domain/analytics';
import { normalizeLayout, rowKey } from '../domain/dashboard';
import { dayOf } from '../domain/events';
import { useAppStore } from '../state/AppStore';
import { screenPadding, spacing, useTheme } from '../theme';
import { haptics } from '../utils/haptics';
import { toISODate } from '../utils/time';

/** Today: a grid of cards you can rearrange. Hold any card to arrange; tied cards stay together. */
export function TodayScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const { openCheckIn, openLog } = useCapture();
  const { logs, ratings, todayLayout, setTodayLayout } = useAppStore();
  const widgets = useTodayWidgets();
  const [arranging, setArranging] = useState(false);
  const now = new Date();
  const today = toISODate(now);
  const layout = useMemo(() => normalizeLayout(todayLayout), [todayLayout]);
  const stats = useMemo(() => dayStats(today, logs.filter((e) => dayOf(e) === today), ratings[today]), [logs, ratings, today]);

  const startArranging = () => {
    haptics.light();
    setArranging(true);
  };

  return (
    <View style={[styles.screen, { backgroundColor: colors.bgSurface }]}>
      <ScrollView contentContainerStyle={[styles.content, { paddingTop: insets.top + spacing.lg }]} showsVerticalScrollIndicator={false}>
        <View style={styles.headerRow}>
          <View style={styles.flex}>
            <DaySummaryHeader now={now} load={loadFor(stats)} />
          </View>
          <PressableScale
            haptic
            onPress={() => navigation.navigate('Profile')}
            accessibilityLabel="Settings and your data"
            hitSlop={8}
            style={[styles.profileButton, { borderColor: colors.borderSubtle, backgroundColor: colors.bgCard }]}
          >
            <Text variant="sectionTitle" tone="secondary">
              ⚙︎
            </Text>
          </PressableScale>
        </View>

        {arranging ? (
          <Animated.View entering={FadeIn.duration(180)} exiting={FadeOut.duration(120)}>
            <ArrangeDashboard layout={layout} onChange={setTodayLayout} onDone={() => setArranging(false)} onReset={() => setTodayLayout(undefined)} />
          </Animated.View>
        ) : (
          <Animated.View entering={FadeIn.duration(180)} style={styles.grid}>
            {layout.map((row) => {
              const cards = row.filter((id) => widgets[id] !== null);
              if (!cards.length) return null;
              return (
                // Holding any card (outside its buttons) starts arranging.
                <Animated.View key={rowKey(row)} layout={LinearTransition}>
                  <Pressable
                    onLongPress={startArranging}
                    delayLongPress={450}
                    style={cards.length === 2 ? styles.pair : undefined}
                    accessibilityHint="Hold to rearrange Today"
                  >
                    {cards.map((id) => (
                      <View key={id} style={cards.length === 2 ? styles.half : undefined}>
                        {widgets[id]}
                      </View>
                    ))}
                  </Pressable>
                </Animated.View>
              );
            })}
            <PressableScale onPress={startArranging} accessibilityLabel="Arrange Today" style={styles.arrangeLink}>
              <Text variant="caption" tone="secondary">
                Hold any card, or tap here, to arrange
              </Text>
            </PressableScale>
          </Animated.View>
        )}
      </ScrollView>

      {!arranging && (
        <View style={[styles.footer, { backgroundColor: colors.bgSurface, borderTopColor: colors.borderSubtle }]}>
          <Button label="How are you feeling?" variant="secondary" style={styles.footerButton} onPress={openCheckIn} />
          <Button label="Log activity" style={styles.footerButton} onPress={() => openLog()} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  content: {
    paddingHorizontal: screenPadding,
    paddingBottom: spacing.xl,
    gap: spacing.lg,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  flex: {
    flex: 1,
  },
  profileButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  grid: {
    gap: spacing.md,
  },
  pair: {
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'stretch',
  },
  half: {
    flex: 1,
  },
  arrangeLink: {
    alignSelf: 'center',
    paddingVertical: spacing.xs,
  },
  footer: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: screenPadding,
    paddingVertical: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  footerButton: {
    flex: 1,
    paddingHorizontal: spacing.sm,
  },
});
