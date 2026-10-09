import { useNavigation } from '@react-navigation/native';
import { FlashList } from '@shopify/flash-list';
import { useMemo, useState } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ScreenHeader } from '../components/composite/ScreenHeader';
import { Button, Card, Chip, PressableScale, SegmentedTabs, Text } from '../components/primitives';
import type { DevIdea } from '../domain/types';
import { copyText, imageUri } from '../services/ideas';
import { useAppStore } from '../state/AppStore';
import { radii, screenPadding, spacing, useTheme } from '../theme';
import { haptics } from '../utils/haptics';
import { kindToken } from './IdeaScreen';

const VIEWS = ['Open', 'Done', 'All'] as const;
type DevView = (typeof VIEWS)[number];

function IdeaRow({ idea }: { idea: DevIdea }) {
  const { colors } = useTheme();
  const navigation = useNavigation();
  const [copied, setCopied] = useState(false);
  return (
    <PressableScale haptic pressedScale={0.99} onPress={() => navigation.navigate('Idea', { id: idea.id })} accessibilityLabel={`${idea.kind}: ${idea.text}`} style={styles.rowWrap}>
      <Card style={[styles.row, idea.done && styles.doneRow]}>
        <View style={styles.rowText}>
          <View style={styles.tags}>
            <Chip label={idea.kind} color={colors.state[kindToken[idea.kind]]} />
            {idea.screen ? <Chip label={idea.screen} color={colors.state.neutral} /> : null}
            {idea.done ? <Chip label="Done" color={colors.state.calm} /> : null}
          </View>
          <Text variant="body" numberOfLines={3} style={idea.done ? styles.strike : undefined}>
            {idea.text.trim() || 'Screenshot only'}
          </Text>
          <View style={styles.metaRow}>
            <Text variant="caption" tone="secondary">
              {new Date(idea.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
              {idea.images.length ? ` · ${idea.images.length} screenshot${idea.images.length > 1 ? 's' : ''}` : ''}
            </Text>
            <PressableScale
              hitSlop={8}
              onPress={async () => {
                await copyText(idea);
                haptics.success();
                setCopied(true);
                setTimeout(() => setCopied(false), 1800);
              }}
              accessibilityLabel="Copy text"
            >
              <Text variant="caption" tone={copied ? 'calm' : 'focus'}>
                {copied ? 'Copied ✓' : 'Copy text'}
              </Text>
            </PressableScale>
          </View>
        </View>
        {idea.images[0] && <Image source={{ uri: imageUri(idea.images[0]) }} style={[styles.thumb, { borderColor: colors.borderSubtle }]} resizeMode="cover" />}
      </Card>
    </PressableScale>
  );
}

/** Developer board: bugs and ideas spotted while using the app, with screenshots, to work on later. */
export function DevScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const { ideas } = useAppStore();
  const [view, setView] = useState<DevView>('Open');
  const list = useMemo(() => {
    const all = Object.values(ideas).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return view === 'All' ? all : all.filter((i) => i.done === (view === 'Done'));
  }, [ideas, view]);
  const open = Object.values(ideas).filter((i) => !i.done).length;

  return (
    <View style={[styles.screen, { backgroundColor: colors.bgSurface }]}>
      <FlashList
        data={list}
        keyExtractor={(i) => i.id}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingTop: insets.top + spacing.lg, paddingHorizontal: screenPadding, paddingBottom: spacing.xl }}
        ListHeaderComponent={
          <View style={styles.header}>
            <ScreenHeader
              title="Dev"
              caption={`Scope of improvement · ${open} open`}
              right={<Button label="+ New" variant="secondary" style={styles.newButton} onPress={() => navigation.navigate('Idea', {})} />}
            />
            <Text variant="caption" tone="secondary">
              Spotted a bug or an idea? Take a screenshot, tap + New, and jot it down. These stay here (never in your notes)
              until you copy them out to work on.
            </Text>
            <SegmentedTabs options={VIEWS} value={view} onChange={setView} />
          </View>
        }
        renderItem={({ item }) => <IdeaRow idea={item} />}
        ListEmptyComponent={
          <Card>
            <Text variant="body" tone="secondary">
              {view === 'Done' ? 'Nothing marked done yet.' : 'No improvements logged. Tap + New when something bugs you.'}
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
  newButton: {
    minHeight: 36,
    paddingHorizontal: spacing.md,
  },
  rowWrap: {
    marginBottom: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  doneRow: {
    opacity: 0.6,
  },
  rowText: {
    flex: 1,
    gap: spacing.xs,
  },
  tags: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xxs,
  },
  strike: {
    textDecorationLine: 'line-through',
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  thumb: {
    width: 56,
    height: 112,
    borderRadius: radii.chip - 4,
    borderWidth: 1,
  },
});
