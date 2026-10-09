import { useNavigation } from '@react-navigation/native';
import { StyleSheet, View } from 'react-native';

import { affectLabel, classifyJEV, SOCIAL_LABEL, type JEVState } from '../../domain/jev';
import type { CustomMemory, DailyMemory, VibeCategory } from '../../domain/memoryTypes';
import { memoryPhotoUri } from '../../services/memories/custom';
import { useAppStore } from '../../state/AppStore';
import { spacing, typography, useTheme } from '../../theme';
import { formatDayLabel } from '../../utils/time';
import { Button, Card, Chip, PressableScale, Text } from '../primitives';
import { Polaroid } from './Polaroid';
import { VIBE_ICON, VIBE_LABEL, vibeColor } from './vibes';

const SOCIAL_KINDS = new Set(['meal', 'drinks', 'show']);

/** Mood and social badges for a day, from the circumplex model. */
export function JevSocialBadge({ state }: { state: JEVState }) {
  const { colors } = useTheme();
  const social = SOCIAL_LABEL[state.socialCategory];
  const tone = state.valence >= 0 ? colors.state.calm : colors.state.stressLow;
  return (
    <View style={styles.badges}>
      <Chip label={`${social.emoji} ${social.label}`} color={colors.memory.vibeSocial} />
      <Chip
        label={`${state.primaryEmotionTag} · ${affectLabel(state)}`}
        color={tone}
        accessibilityLabel={`Felt ${state.primaryEmotionTag}. ${affectLabel(state)}${state.fromRatings ? ', from your ratings' : ''}`}
      />
    </View>
  );
}

/** What the calendar shows for the chosen day: photos, the story, how it felt, and links into each memory. */
export function SemanticMemoryCard({ date, day, made }: { date: string; day?: DailyMemory; made: CustomMemory[] }) {
  const { colors } = useTheme();
  const navigation = useNavigation();
  const { ratings } = useAppStore();

  if (!day && made.length === 0) {
    return (
      <Card style={styles.gap}>
        <Text variant="caption" tone="secondary">
          {formatDayLabel(date)}
        </Text>
        <Text variant="body" tone="secondary">
          No memory for this day.
        </Text>
        <Button label="＋ Make a memory for this day" variant="secondary" onPress={() => navigation.navigate('MemoryCompose', { date })} />
      </Card>
    );
  }

  // Memories you made lead; the automatic day comes after, folded into a summary and a button.
  const ordered = [...made].sort((a, b) => Number(b.kind === 'live') - Number(a.kind === 'live') || (b.takenAt ?? b.createdAt).localeCompare(a.takenAt ?? a.createdAt));
  const vibe: VibeCategory = ordered[0]?.vibe ?? day!.primaryVibe;
  const outings = day?.spatialNodes.filter((n) => !n.isHome) ?? [];
  const jev = classifyJEV({
    ratings: ratings[date],
    vibe,
    activityKinds: outings.map((n) => n.activity?.kind).filter((k): k is string => !!k),
    categories: [...outings.map((n) => n.category), ...made.flatMap((m) => m.chapters?.map((c) => c.category) ?? [])].filter((c): c is string => !!c),
    socialMinutes: outings.filter((n) => n.activity && SOCIAL_KINDS.has(n.activity.kind)).reduce((s, n) => s + n.dwellTimeMinutes, 0),
  });
  const dayPhotos = day?.spatialNodes.flatMap((n) => n.photoUris ?? []) ?? [];

  return (
    <Card padded={false} style={{ backgroundColor: colors.memory.bgMemoryWarm }}>
      {ordered.map((m, i) => (
        <View key={m.id} style={i > 0 && [styles.divider, { borderTopColor: colors.borderSubtle }]}>
          <PrintFan
            photos={m.photos.map(memoryPhotoUri)}
            notes={Object.fromEntries(Object.entries(m.photoNotes ?? {}).map(([name, t]) => [memoryPhotoUri(name), t]))}
            onPress={() => navigation.navigate('MemoryPost', { id: m.id })}
          />
          <View style={styles.body}>
            <Text variant="caption" tone="secondary">
              {m.kind === 'live' ? '● Live memory' : '📷 Your memory'} · {formatDayLabel(date)}
            </Text>
            <PressableScale onPress={() => navigation.navigate('MemoryPost', { id: m.id })} accessibilityLabel={`Open ${m.title}`}>
              <Text style={[typography.handTitle, { color: colors.textPrimary }]}>{m.title}</Text>
            </PressableScale>
            <Text variant="body" tone="secondary" numberOfLines={4}>
              {m.note?.trim() ? `“${m.note.trim()}”` : m.caption}
            </Text>
            <View style={styles.badges}>
              <Chip label={`${VIBE_ICON[m.vibe]} ${VIBE_LABEL[m.vibe]}`} color={vibeColor(m.vibe, colors)} />
              {m.place && <Chip label={`📍 ${m.place.name}`} color={colors.state.neutral} />}
            </View>
          </View>
        </View>
      ))}

      {/* No memory made: the day itself is the memory. */}
      {ordered.length === 0 && day && (
        <>
          <PrintFan photos={dayPhotos} notes={day.photoNotes ?? {}} onPress={() => navigation.navigate('Memory', { date })} />
          <View style={styles.body}>
            <Text variant="caption" tone="secondary">
              {formatDayLabel(date)}
            </Text>
            <Text style={[typography.handTitle, { color: colors.textPrimary }]}>{day.title}</Text>
          </View>
        </>
      )}

      <View style={[styles.body, styles.tight]}>
        <JevSocialBadge state={jev} />
      </View>

      {day && (
        <View style={[styles.wholeDay, { borderTopColor: colors.borderSubtle, backgroundColor: colors.bgCard }]}>
          <Text variant="caption" tone="secondary">
            The whole day{outings.length ? ` · ${outings.length} place${outings.length > 1 ? 's' : ''}` : ''}
            {day.distanceKm >= 0.5 ? ` · ${day.distanceKm.toFixed(1)} km` : ''}
            {dayPhotos.length ? ` · ${dayPhotos.length} photo${dayPhotos.length > 1 ? 's' : ''}` : ''}
          </Text>
          <Text variant="body" tone="secondary" numberOfLines={ordered.length ? 2 : 4}>
            {day.userNote?.trim() || day.summaryNarrative}
          </Text>
          <Button label="See the whole day ›" variant="secondary" onPress={() => navigation.navigate('Memory', { date })} />
        </View>
      )}

      <PressableScale onPress={() => navigation.navigate('MemoryCompose', { date })} accessibilityLabel="Add a memory to this day" style={styles.add}>
        <Text variant="caption" style={{ color: colors.memory.accentPin }}>
          ＋ {ordered.length ? 'Add another memory' : 'Make a memory from this day'}
        </Text>
      </PressableScale>
    </Card>
  );
}

/** A small fan of pinned prints, like snaps stuck on a board. */
function PrintFan({ photos, notes, onPress }: { photos: string[]; notes: Record<string, string>; onPress: () => void }) {
  const { colors } = useTheme();
  const shown = photos.slice(0, 3);
  if (!shown.length) return null;
  return (
    <PressableScale onPress={onPress} pressedScale={0.98} accessibilityLabel={`${photos.length} photos. Open memory`}>
      <View style={[styles.fan, { backgroundColor: colors.memory.board }]}>
        {shown.map((u, i) => (
          <View key={u} style={[styles.fanItem, i > 0 && styles.fanOverlap, { zIndex: shown.length - i }]}>
            <Polaroid uri={u} width={shown.length === 1 ? 170 : 128} caption={i === 0 ? notes[u] : undefined} pinColor={colors.memory.pins[i % colors.memory.pins.length]} />
          </View>
        ))}
        {photos.length > shown.length && <Text style={[typography.hand, styles.fanMore, { color: colors.memory.polaroidInk }]}>+{photos.length - shown.length}</Text>}
      </View>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  gap: {
    gap: spacing.sm,
  },
  fan: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
    paddingHorizontal: spacing.md,
  },
  fanItem: {
    alignItems: 'center',
  },
  fanOverlap: {
    marginLeft: -28,
    marginTop: spacing.md,
  },
  fanMore: {
    marginLeft: spacing.xs,
  },
  body: {
    padding: spacing.md,
    gap: spacing.xs,
  },
  badges: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xxs,
  },
  tight: {
    paddingTop: 0,
  },
  divider: {
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  wholeDay: {
    borderTopWidth: StyleSheet.hairlineWidth,
    padding: spacing.md,
    gap: spacing.xs,
  },
  add: {
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
