import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useState } from 'react';
import { ScrollView, Share, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ScreenHeader } from '../components/composite/ScreenHeader';
import { InsightsCard } from '../components/memories/InsightsCard';
import { MemoryMap } from '../components/memories/MemoryMap';
import { NoteConnector, PostItNote } from '../components/memories/PostItNote';
import { StepEditor } from '../components/memories/StepEditor';
import { PolaroidBoard } from '../components/memories/Polaroid';
import { VIBE_ICON, VIBE_LABEL, vibeColor } from '../components/memories/vibes';
import { Button, Card, Chip, PressableScale, Text } from '../components/primitives';
import type { RootStackParamList } from '../navigation/types';
import { deleteMemoryPhotos, memoryPhotoUri, openInMaps } from '../services/memories/custom';
import { dwellLabel } from '../domain/narrative';
import { useAppStore } from '../state/AppStore';
import { screenPadding, spacing, useTheme } from '../theme';
import { haptics } from '../utils/haptics';
import { formatDayLabel } from '../utils/time';

/** A memory you made, laid out like a post: photos first, then where, the story and your note. */
export function MemoryPostScreen({ route, navigation }: NativeStackScreenProps<RootStackParamList, 'MemoryPost'>) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { customMemories, saveCustomMemory, deleteCustomMemory } = useAppStore();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const memory = customMemories[route.params.id];

  if (!memory) {
    return (
      <View style={[styles.pad, { flex: 1, backgroundColor: colors.memory.bgMemoryWarm, paddingTop: spacing.lg }]}>
        <ScreenHeader title="Memory not found" caption="It may have been deleted." navAction={{ label: 'Close', onPress: navigation.goBack }} />
      </View>
    );
  }

  const uris = memory.photos.map(memoryPhotoUri);
  const clock = (iso: string) => new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  const chapterPins = (memory.chapters ?? []).filter((c) => c.place && c.kind === 'stop').map((c) => ({ id: c.id, latitude: c.place!.latitude, longitude: c.place!.longitude, placeName: c.place!.name }));
  const when = memory.kind === 'live' && memory.startedAt && memory.endedAt
    ? `${formatDayLabel(memory.date)} · ${clock(memory.startedAt)} – ${clock(memory.endedAt)}${memory.distanceKm && memory.distanceKm >= 0.2 ? ` · ${memory.distanceKm} km` : ''}`
    : memory.takenAt
    ? `${formatDayLabel(memory.date)} · ${new Date(memory.takenAt).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`
    : formatDayLabel(memory.date);
  const place = memory.place;

  const share = () =>
    Share.share(
      uris[0]
        ? { message: `${memory.title}\n\n${memory.caption}`, url: uris[0] }
        : { message: `${memory.title}\n\n${memory.caption}` },
    );

  return (
    <ScrollView
      style={{ backgroundColor: colors.memory.bgMemoryWarm }}
      contentContainerStyle={[styles.content, { paddingTop: spacing.lg, paddingBottom: insets.bottom + spacing.xl }]}
    >
      <View style={styles.pad}>
        <ScreenHeader
          title={memory.title}
          caption={when}
          navAction={{ label: 'Close', onPress: navigation.goBack }}
          right={
            <PressableScale
              haptic
              onPress={() => saveCustomMemory({ ...memory, isPinned: !memory.isPinned, updatedAt: new Date().toISOString() })}
              accessibilityLabel={memory.isPinned ? 'Unpin memory' : 'Pin memory'}
              accessibilityState={{ selected: memory.isPinned }}
              style={[styles.pin, { borderColor: memory.isPinned ? colors.memory.accentPin : colors.borderSubtle }]}
            >
              <Text>{memory.isPinned ? '📌' : '📍'}</Text>
            </PressableScale>
          }
        />
      </View>

      {place && (
        <View style={[styles.pad, styles.placeRow]}>
          <View style={styles.flex}>
            <Text variant="bodyMedium" numberOfLines={1}>
              📍 {place.name}
            </Text>
            {(place.locality || place.city) && (
              <Text variant="caption" tone="secondary" numberOfLines={1}>
                {[place.locality, place.city].filter((x, i, a) => x && a.indexOf(x) === i && x !== place.name).join(', ')}
              </Text>
            )}
          </View>
          <Button label="Open in Maps" variant="secondary" style={styles.small} onPress={() => openInMaps(place)} />
        </View>
      )}

      <View style={styles.pad}>
        <PolaroidBoard
          photos={memory.photos.map((name) => ({
            uri: memoryPhotoUri(name),
            caption: memory.photoNotes?.[name],
            placeholder: place ? `${place.name}…` : 'write something…',
            takenAt: memory.takenAt ? Date.parse(memory.takenAt) : undefined,
          }))}
          onCaption={(uri, text) => {
            const name = memory.photos.find((n) => memoryPhotoUri(n) === uri);
            if (name) saveCustomMemory({ ...memory, photoNotes: { ...memory.photoNotes, [name]: text }, updatedAt: new Date().toISOString() });
          }}
        />
      </View>

      <View style={[styles.pad, styles.gap]}>
        <Text variant="body" style={styles.story}>
          {memory.caption}
        </Text>
        <View style={styles.wrap}>
          <Chip label={`${VIBE_ICON[memory.vibe]} ${VIBE_LABEL[memory.vibe]}`} color={vibeColor(memory.vibe, colors)} />
          {memory.labels?.slice(0, 5).map((l) => <Chip key={l} label={l} color={colors.state.neutral} />)}
        </View>
      </View>

      {memory.chapters?.length ? (
        <View style={[styles.pad, styles.timeline]}>
          <Text variant="sectionTitle" accessibilityRole="header">
            How it went
          </Text>
          {memory.chapters.map((c, i) =>
            c.kind === 'move' ? (
              <NoteConnector
                key={c.id}
                emoji={c.emoji}
                text={`${c.title}${c.end ? ` · ${dwellLabel((Date.parse(c.end) - Date.parse(c.start)) / 60_000)}` : ''}${c.detail ? ` · ${c.detail}` : ''}`}
                onEdit={() => setEditing(c.id)}
              />
            ) : (
              <PostItNote
                key={c.id}
                index={i}
                emoji={c.emoji}
                title={c.title}
                time={c.end ? `${clock(c.start)} – ${clock(c.end)}${c.dwellMin ? ` · ${dwellLabel(c.dwellMin)}` : ''}` : c.kind === 'parked' ? clock(c.start) : undefined}
                detail={c.detail}
                tint={c.kind === 'parked' ? colors.state.focus : i % 3 === 0 ? colors.memory.vibeCozy : i % 3 === 1 ? colors.memory.accentPin : colors.memory.vibeExplore}
                photos={c.photos?.map(memoryPhotoUri)}
                onOpenMaps={c.place ? () => openInMaps(c.place!) : undefined}
                onEdit={() => setEditing(c.id)}
              />
            ),
          )}
          <Text variant="caption" tone="secondary">
            Something off? Tap ✎ on any step to fix it.
          </Text>
        </View>
      ) : null}

      <StepEditor
        step={(() => {
          const c = memory.chapters?.find((x) => x.id === editing);
          return c ? { kind: c.kind, title: c.title, emoji: c.emoji, detail: c.detail, place: c.place, mode: c.mode, km: c.km } : null;
        })()}
        onClose={() => setEditing(null)}
        onSave={(s) => {
          const chapters = memory.chapters?.map((c) =>
            c.id === editing ? { ...c, title: s.title, emoji: s.emoji, detail: s.detail?.trim() || undefined, place: s.place, mode: s.mode, edited: true } : c,
          );
          // A new place for the main stop moves the memory's pin too.
          const main = memory.chapters?.find((c) => c.id === editing);
          const place = main?.place && memory.place && main.place.name === memory.place.name ? s.place : memory.place;
          saveCustomMemory({ ...memory, chapters, place, updatedAt: new Date().toISOString() });
          setEditing(null);
        }}
        onDelete={() => {
          saveCustomMemory({ ...memory, chapters: memory.chapters?.filter((c) => c.id !== editing), updatedAt: new Date().toISOString() });
          setEditing(null);
        }}
      />

      <View style={styles.pad}>
        <InsightsCard insights={memory.insights} />
      </View>

      {memory.note?.trim() ? (
        <View style={styles.pad}>
          <Card style={styles.gap}>
            <Text variant="caption" tone="secondary">
              Your note
            </Text>
            <Text variant="body">{memory.note.trim()}</Text>
          </Card>
        </View>
      ) : null}

      {(place || chapterPins.length > 0) && (
        <View style={[styles.pad, styles.gap]}>
          <MemoryMap
            path={memory.path ?? []}
            nodes={chapterPins.length ? chapterPins : [{ id: memory.id, latitude: place!.latitude, longitude: place!.longitude, placeName: place!.name }]}
            height={memory.path?.length ? 240 : 180}
          />
        </View>
      )}

      <View style={[styles.pad, styles.actions]}>
        <Button label="Edit" variant="secondary" style={styles.flex} onPress={() => navigation.navigate('MemoryCompose', { id: memory.id })} />
        <Button label="Share" variant="secondary" style={styles.flex} onPress={share} />
      </View>
      <View style={styles.pad}>
        {confirmDelete ? (
          <Card style={styles.gap}>
            <Text variant="body">Delete this memory and its photos? Photos in your library aren’t touched.</Text>
            <View style={styles.actions}>
              <Button label="Cancel" variant="secondary" style={styles.flex} onPress={() => setConfirmDelete(false)} />
              <Button
                label="Delete"
                style={styles.flex}
                onPress={() => {
                  deleteMemoryPhotos(memory.photos);
                  deleteCustomMemory(memory.id);
                  haptics.success();
                  navigation.goBack();
                }}
              />
            </View>
          </Card>
        ) : (
          <Button label="Delete memory" variant="ghost" onPress={() => setConfirmDelete(true)} />
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: spacing.md,
  },
  pad: {
    paddingHorizontal: screenPadding,
  },
  gap: {
    gap: spacing.sm,
  },
  flex: {
    flex: 1,
  },
  wrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  placeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  pin: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  small: {
    minHeight: 40,
    paddingHorizontal: spacing.md,
  },
  story: {
    fontSize: 16,
    lineHeight: 25,
  },
  timeline: {
    gap: spacing.md,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
});
