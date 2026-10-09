import { useNavigation } from '@react-navigation/native';
import { FlashList } from '@shopify/flash-list';
import { useMemo, useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { InkPage } from '../components/journal/InkPage';
import { ScreenHeader } from '../components/composite/ScreenHeader';
import { Card, Chip, PressableScale, SegmentedTabs, Text } from '../components/primitives';
import { dayOf } from '../domain/events';
import type { JournalEntry, SignalEvent } from '../domain/types';
import { useSync } from '../services/sync/SyncProvider';
import { useAppStore } from '../state/AppStore';
import { screenPadding, spacing, useTheme } from '../theme';
import { canWriteJournal } from '../utils/device';
import { formatClock, formatDayLabel } from '../utils/time';

const VIEWS = ['Written', 'All entries'] as const;
type View_ = (typeof VIEWS)[number];

const THUMB = 64;

function Row({ log, entry, onPress }: { log: SignalEvent; entry?: JournalEntry; onPress: () => void }) {
  const { colors } = useTheme();
  const firstInk = entry?.pages.find((p) => p.length > 0);
  return (
    <PressableScale haptic pressedScale={0.99} onPress={onPress} accessibilityLabel={`${log.title}, ${entry ? 'has journal' : 'no journal yet'}`} style={styles.rowWrap}>
      <Card style={styles.row}>
        <View style={styles.rowText}>
          <Text variant="caption" tone="secondary">
            {formatDayLabel(dayOf(log))} · {formatClock(log.timestampStart)}
          </Text>
          <Text variant="bodyMedium">{log.title}</Text>
          {entry?.text ? (
            <Text variant="body" tone="secondary" numberOfLines={3}>
              {entry.text}
            </Text>
          ) : entry ? (
            <Text variant="caption" tone="secondary">
              Handwritten
            </Text>
          ) : (
            <Chip label={canWriteJournal ? 'Tap to write' : 'No journal yet'} color={colors.state.neutral} />
          )}
        </View>
        {firstInk && (
          <View style={[styles.thumb, { borderColor: colors.borderSubtle, backgroundColor: colors.bgSurface }]}>
            <InkPage strokes={firstInk} width={THUMB} ruled={false} />
          </View>
        )}
      </Card>
    </PressableScale>
  );
}

/** Journal entries list. Lives inside the Memories tab; `switcher` is the Memories | Journal toggle. */
export function JournalScreen({ switcher }: { switcher: ReactNode }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const { logs, journals } = useAppStore();
  const sync = useSync();
  const [view, setView] = useState<View_>('Written');

  const data = useMemo(() => {
    const newestFirst = [...logs].reverse();
    return view === 'Written' || !canWriteJournal ? newestFirst.filter((l) => journals[l.id]) : newestFirst;
  }, [logs, journals, view]);

  const syncNote =
    sync.state === 'unsupported'
      ? 'Journals sync between iPad and iPhone in the installed app.'
      : sync.state === 'unavailable'
        ? 'Sign in to iCloud in Settings to sync journals.'
        : sync.state === 'off'
          ? 'iCloud sync is off (Profile).'
          : null;

  return (
    <View style={[styles.screen, { backgroundColor: colors.bgSurface }]}>
      <FlashList
        data={data}
        keyExtractor={(l) => l.id}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingTop: insets.top + spacing.lg, paddingHorizontal: screenPadding, paddingBottom: spacing.xl }}
        ListHeaderComponent={
          <View style={styles.header}>
            <ScreenHeader
              title="Journal"
              caption={canWriteJournal ? 'Write about any entry: type, or use Apple Pencil.' : 'What you’ve written on your iPad.'}
            />
            {switcher}
            {canWriteJournal && <SegmentedTabs options={VIEWS} value={view} onChange={setView} />}
            {syncNote && (
              <Text variant="caption" tone="secondary">
                {syncNote}
              </Text>
            )}
          </View>
        }
        renderItem={({ item }) => (
          <Row log={item} entry={journals[item.id]} onPress={() => navigation.navigate('JournalEntry', { logId: item.id })} />
        )}
        ListEmptyComponent={
          <Card style={styles.empty}>
            <Text variant="body" tone="secondary">
              {canWriteJournal
                ? view === 'Written'
                  ? 'No journal entries yet. Switch to “All entries” and pick any log to write about.'
                  : 'Log an activity first, then write about it here.'
                : 'Nothing yet. Journal about any entry on your iPad and it appears here to read.'}
            </Text>
          </Card>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  header: {
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  rowWrap: {
    marginBottom: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    gap: spacing.md,
    alignItems: 'center',
  },
  rowText: {
    flex: 1,
    gap: spacing.xxs,
  },
  thumb: {
    width: THUMB + 2,
    borderWidth: 1,
    borderRadius: 8,
    overflow: 'hidden',
  },
  empty: {
    gap: spacing.sm,
  },
});
