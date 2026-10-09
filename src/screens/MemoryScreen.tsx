import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ScreenHeader } from '../components/composite/ScreenHeader';
import { VoiceButton } from '../components/composite/VoiceButton';
import { InsightsCard } from '../components/memories/InsightsCard';
import { MemoryMap } from '../components/memories/MemoryMap';
import { NoteConnector, PostItNote } from '../components/memories/PostItNote';
import { StepEditor, type EditableStep } from '../components/memories/StepEditor';
import { PolaroidBoard } from '../components/memories/Polaroid';
import { VIBE_ICON, VIBE_LABEL, vibeColor, WEATHER_ICON } from '../components/memories/vibes';
import { Button, Card, Chip, ListRow, PressableScale, SelectablePill, Text } from '../components/primitives';
import { dayOf } from '../domain/events';
import type { MemoryStyle, MemoryWalk, ParkedCar, SpatialNode, TransitLeg } from '../domain/memoryTypes';
import { dwellLabel, titleCase } from '../domain/narrative';
import type { RootStackParamList } from '../navigation/types';
import { openInMaps } from '../services/memories/custom';
import { useMemories } from '../services/memories/MemoriesProvider';
import { useAppStore } from '../state/AppStore';
import { radii, screenPadding, spacing, typography, useTheme } from '../theme';
import { haptics } from '../utils/haptics';
import { formatDayLabel } from '../utils/time';

export const STYLES: { value: MemoryStyle; label: string }[] = [
  { value: 'NARRATIVE_STORY', label: 'Story' },
  { value: 'POETIC_MINIMAL', label: 'Poetic' },
  { value: 'GEN_Z_CASUAL', label: 'Casual' },
  { value: 'RAW_BULLETS', label: 'Bullets' },
];

const clock = (iso: string) => new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
const MODE_ICON: Record<TransitLeg['mode'] | 'transit', string> = { walk: '🚶', run: '🏃', cycle: '🚴', drive: '🚗', transit: '🚌' };
const MODE_LABEL: Record<TransitLeg['mode'], string> = { walk: 'Walked', run: 'Ran', cycle: 'Cycled', drive: 'Drove' };

function EnergyDots({ value }: { value: number }) {
  const { colors } = useTheme();
  return (
    <View style={styles.dots} accessibilityLabel={`Energy ${value} of 5`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <View key={i} style={[styles.dot, { backgroundColor: i <= value ? colors.state.energy : colors.borderSubtle }]} />
      ))}
    </View>
  );
}

/** One place in the day as a post-it: what you did there (when known), when, and its photos. Home stays a quiet line. */
/** One place in the day as a post-it: what you did there (when known), when, and its photos. Home stays a quiet line. */
function NodeRow({ node, view, index, onMakeMemory, onEdit }: { node: SpatialNode; view: EditableStep; index: number; onMakeMemory: () => void; onEdit: () => void }) {
  const { colors } = useTheme();
  const time = `${clock(node.arrivalTime)} – ${clock(node.departureTime)} · ${dwellLabel(node.dwellTimeMinutes)}${node.weather ? `  ${WEATHER_ICON[node.weather.condition]} ${Math.round(node.weather.tempC)}°` : ''}`;
  if (node.isHome && view.title === 'Home') return <NoteConnector emoji="🏠" text={`Home · ${time}`} onEdit={onEdit} />;
  const place = view.place ?? { name: node.placeName, latitude: node.latitude, longitude: node.longitude };
  return (
    <PostItNote
      index={index}
      emoji={view.emoji}
      title={view.title}
      time={time}
      detail={view.detail}
      tint={vibeColor(node.vibe, colors)}
      photos={node.photoUris}
      onOpenMaps={() => openInMaps(place)}
      onEdit={onEdit}
      extraAction={{ label: '＋ Make a memory here', onPress: onMakeMemory }}
    >
      <View style={styles.nodeMeta}>
        <Chip label={`${VIBE_ICON[node.vibe]} ${VIBE_LABEL[node.vibe]}`} color={vibeColor(node.vibe, colors)} />
        <EnergyDots value={node.energyLevelAtTime} />
      </View>
    </PostItNote>
  );
}

export function MemoryScreen({ route, navigation }: NativeStackScreenProps<RootStackParamList, 'Memory'>) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { getMemory, getTrip } = useMemories();
  const { overrideMemory, memories: settings, memoryOverrides, logs } = useAppStore();
  const [editing, setEditing] = useState<string | null>(null);
  const memory = getMemory(route.params.date);
  const [note, setNote] = useState(memory?.userNote ?? '');
  const [renaming, setRenaming] = useState(false);
  const [title, setTitle] = useState('');

  // Save the note shortly after typing pauses.
  useEffect(() => {
    if (!memory || note === (memory.userNote ?? '')) return;
    const t = setTimeout(() => overrideMemory(memory.date, { userNote: note }), 600);
    return () => clearTimeout(t);
  }, [note, memory, overrideMemory]);

  if (!memory) {
    return (
      <View style={[styles.content, { flex: 1, backgroundColor: colors.memory.bgMemoryWarm, paddingTop: spacing.lg }]}>
        <ScreenHeader title="No memory yet" caption="There’s no location data for this day." navAction={{ label: 'Close', onPress: navigation.goBack }} />
      </View>
    );
  }

  const trip = memory.tripId ? getTrip(memory.tripId) : undefined;
  type Item = { kind: 'node'; node: SpatialNode } | { kind: 'leg'; leg: TransitLeg } | { kind: 'car'; car: ParkedCar } | { kind: 'walk'; walk: MemoryWalk };
  const items: Item[] = [];
  for (const node of memory.spatialNodes) {
    const leg = memory.transit.find((l) => l.toNodeId === node.id);
    if (leg) items.push({ kind: 'leg', leg });
    const car = memory.parking?.find((p) => p.toNodeId === node.id);
    if (car) items.push({ kind: 'car', car });
    items.push({ kind: 'node', node });
    // Walks while you were here (a loop out and back, wandering around) follow the place.
    const until = Date.parse(node.departureTime);
    for (const walk of memory.walks ?? []) {
      const at = Date.parse(walk.start);
      if (at >= Date.parse(node.arrivalTime) && at < until) items.push({ kind: 'walk', walk });
    }
  }

  // Corrections the user made to the timeline, by step.
  const steps = memoryOverrides[memory.date]?.steps ?? {};
  const keyOf = (it: Item) => (it.kind === 'node' ? `node:${it.node.id}` : it.kind === 'leg' ? `leg:${it.leg.startTime}` : it.kind === 'car' ? `car:${it.car.time}` : `walk:${it.walk.start}`);
  const baseOf = (it: Item): EditableStep => {
    if (it.kind === 'node') {
      const n = it.node;
      const category = n.category?.replace(/([a-z])([A-Z])/g, '$1 $2');
      return {
        kind: 'stop',
        emoji: n.isHome ? '🏠' : (n.activity?.emoji ?? VIBE_ICON[n.vibe]),
        title: n.isHome ? 'Home' : n.activity && n.dwellTimeMinutes >= 30 ? titleCase(n.activity.label) : n.placeName,
        detail: [n.locality, category, n.presence && !n.presence.inside && !n.activity ? 'Passing through' : null].filter(Boolean).join(' · ') || undefined,
        place: { name: n.placeName, latitude: n.latitude, longitude: n.longitude, locality: n.locality, city: n.city },
      };
    }
    if (it.kind === 'car') {
      const c = it.car;
      const walk = c.walkM >= 1000 ? `${(c.walkM / 1000).toFixed(1)} km` : `${Math.round(c.walkM / 10) * 10} m`;
      return {
        kind: 'parked',
        emoji: '🅿️',
        title: c.name ? `Parked at ${c.name}` : 'Parked the car',
        detail: c.walkM < 60 ? `Right by ${c.toName ?? 'the next stop'}` : `Walked about ${walk} to ${c.toName ?? 'the next stop'}`,
        place: { name: c.name ?? 'Where you parked', latitude: c.latitude, longitude: c.longitude },
      };
    }
    if (it.kind === 'walk') {
      const w = it.walk;
      return {
        kind: 'move',
        mode: w.mode,
        km: w.km || undefined,
        emoji: w.routine ? '🔁' : MODE_ICON[w.mode],
        title: [w.routine?.label ?? `${w.mode === 'run' ? 'Run' : 'Walk'} at ${clock(w.start)}`, w.km > 0 ? `${w.km} km` : null].filter(Boolean).join(' · '),
        detail: w.source === 'health' ? 'from Apple Health' : undefined,
      };
    }
    const l = it.leg;
    return {
      kind: 'move',
      mode: l.mode,
      km: l.distanceKm,
      emoji: l.routine ? '🔁' : MODE_ICON[l.mode],
      title: [l.routine?.label, l.parts ? l.parts.map((p) => `${MODE_ICON[p.mode]} ${p.km} km`).join(' → ') : `${MODE_LABEL[l.mode]} ${l.distanceKm} km`].filter(Boolean).join(' · '),
    };
  };
  const viewOf = (it: Item): EditableStep => {
    const base = baseOf(it);
    const o = steps[keyOf(it)];
    if (!o) return base;
    return { ...base, ...Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)), detail: o.detail ?? (o.title ? undefined : base.detail) } as EditableStep;
  };
  const editingItem = items.find((it) => keyOf(it) === editing);
  // What you logged that day (and what was logged for you), linked both ways.
  const dayLogs = logs.filter((e) => !e.isNote && dayOf(e) === memory.date).sort((a, b) => a.timestampStart.localeCompare(b.timestampStart));

  return (
    <ScrollView
      style={{ backgroundColor: colors.memory.bgMemoryWarm }}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={[styles.content, { paddingTop: spacing.lg, paddingBottom: insets.bottom + spacing.xl }]}
    >
      <ScreenHeader
        title={memory.title}
        caption={`${formatDayLabel(memory.date)}${memory.distanceKm >= 0.5 ? ` · ${memory.distanceKm.toFixed(1)} km` : ''}`}
        navAction={{ label: 'Close', onPress: navigation.goBack }}
        right={
          <PressableScale
            haptic
            onPress={() => overrideMemory(memory.date, { isPinned: !memory.isPinned })}
            accessibilityLabel={memory.isPinned ? 'Unpin memory' : 'Pin memory'}
            accessibilityState={{ selected: memory.isPinned }}
            style={[styles.pin, { borderColor: memory.isPinned ? colors.memory.accentPin : colors.borderSubtle }]}
          >
            <Text>{memory.isPinned ? '📌' : '📍'}</Text>
          </PressableScale>
        }
      />

      {renaming ? (
        <View style={styles.renameRow}>
          <TextInput
            value={title}
            onChangeText={setTitle}
            autoFocus
            style={[typography.body, styles.input, styles.flex, { color: colors.textPrimary, borderColor: colors.borderSubtle, backgroundColor: colors.bgCard }]}
          />
          <Button
            label="Save"
            style={styles.small}
            onPress={() => {
              overrideMemory(memory.date, { title: title.trim() || undefined });
              setRenaming(false);
            }}
          />
        </View>
      ) : (
        <View style={styles.row}>
          {trip && (
            <PressableScale onPress={() => navigation.navigate('Trip', { id: trip.id })} accessibilityLabel={`Part of ${trip.title}`}>
              <Text variant="caption" style={{ color: colors.memory.vibeExplore }}>
                ✈︎ Part of {trip.title} ›
              </Text>
            </PressableScale>
          )}
          <PressableScale
            onPress={() => {
              setTitle(memory.title);
              setRenaming(true);
            }}
            accessibilityLabel="Rename this memory"
            style={styles.renameLink}
          >
            <Text variant="caption" tone="secondary">
              Rename
            </Text>
          </PressableScale>
        </View>
      )}

      <PolaroidBoard
        photos={memory.spatialNodes.flatMap((n) =>
          (n.photoUris ?? []).map((uri) => ({
            uri,
            caption: memory.photoNotes?.[uri],
            placeholder: `${n.activity && n.dwellTimeMinutes >= 30 ? titleCase(n.activity.label) : n.placeName}…`,
            takenAt: Date.parse(n.arrivalTime),
          })),
        )}
        onCaption={(uri, text) => overrideMemory(memory.date, { photoNotes: { ...memory.photoNotes, [uri]: text } })}
      />

      <MemoryMap path={memory.path} nodes={memory.spatialNodes} />

      <Card style={styles.gap}>
        <View style={styles.row}>
          <Chip label={`${VIBE_ICON[memory.primaryVibe]} ${VIBE_LABEL[memory.primaryVibe]} day`} color={vibeColor(memory.primaryVibe, colors)} />
        </View>
        <Text variant="body" style={memory.styleApplied === 'RAW_BULLETS' ? styles.bullets : styles.story}>
          {memory.summaryNarrative}
        </Text>
        <View style={styles.wrap} accessibilityRole="radiogroup" accessibilityLabel="Writing style">
          {STYLES.map((s) => (
            <SelectablePill
              key={s.value}
              label={s.label}
              selected={memory.styleApplied === s.value}
              onPress={() => {
                // Choosing the default style again clears the per-day override.
                overrideMemory(memory.date, { style: s.value === settings.style ? undefined : s.value });
                haptics.selection();
              }}
            />
          ))}
        </View>
      </Card>

      <InsightsCard insights={memory.insights} />

      <Button
        label="＋ Add your own photos to this day"
        variant="secondary"
        onPress={() => {
          const hl = [...memory.spatialNodes].filter((n) => !n.isHome).sort((a, b) => b.dwellTimeMinutes - a.dwellTimeMinutes)[0];
          navigation.navigate('MemoryCompose', {
            date: memory.date,
            place: hl ? { name: hl.placeName, latitude: hl.latitude, longitude: hl.longitude, locality: hl.locality, city: hl.city } : undefined,
          });
        }}
      />

      <Card style={styles.gap}>
        <View style={styles.row}>
          <Text variant="caption" tone="secondary">
            Your note
          </Text>
          <VoiceButton value={note} onChange={setNote} />
        </View>
        <TextInput
          value={note}
          onChangeText={setNote}
          multiline
          placeholder="Anything the map doesn’t know: who you were with, how it felt…"
          placeholderTextColor={colors.textSecondary}
          style={[typography.body, styles.input, styles.noteInput, { color: colors.textPrimary, borderColor: colors.borderSubtle, backgroundColor: colors.bgSurface }]}
        />
      </Card>

      <View style={styles.gap}>
        <Text variant="sectionTitle" accessibilityRole="header">
          The day, place by place
        </Text>
        <View style={styles.timeline}>
          {items
            .filter((it) => !steps[keyOf(it)]?.hidden)
            .map((it, i) => {
              const view = viewOf(it);
              const edit = () => setEditing(keyOf(it));
              if (it.kind === 'node') {
                return (
                  <NodeRow
                    key={it.node.id}
                    index={i}
                    node={it.node}
                    view={view}
                    onEdit={edit}
                    onMakeMemory={() =>
                      navigation.navigate('MemoryCompose', {
                        date: memory.date,
                        place: view.place ?? { name: it.node.placeName, latitude: it.node.latitude, longitude: it.node.longitude, locality: it.node.locality, city: it.node.city },
                      })
                    }
                  />
                );
              }
              if (it.kind === 'car') {
                const place = view.place ?? { name: it.car.name ?? 'Where you parked', latitude: it.car.latitude, longitude: it.car.longitude };
                return (
                  <PostItNote key={`${it.car.time}-car`} index={i} emoji={view.emoji} title={view.title} time={clock(it.car.time)} detail={view.detail} tint={colors.state.focus} onOpenMaps={() => openInMaps(place)} onEdit={edit} />
                );
              }
              const [start, end] = it.kind === 'walk' ? [it.walk.start, it.walk.end] : [it.leg.startTime, it.leg.endTime];
              return (
                <NoteConnector
                  key={keyOf(it)}
                  emoji={view.emoji}
                  text={[view.title, dwellLabel((Date.parse(end) - Date.parse(start)) / 60_000), view.detail].filter(Boolean).join(' · ')}
                  onEdit={edit}
                />
              );
            })}
          <Text variant="caption" tone="secondary">
            Something off? Tap ✎ on any step to fix it.
          </Text>
        </View>
        <StepEditor
          step={editingItem ? viewOf(editingItem) : null}
          onClose={() => setEditing(null)}
          onSave={(v) => {
            overrideMemory(memory.date, { steps: { ...steps, [editing!]: { title: v.title, emoji: v.emoji, detail: v.detail?.trim() || undefined, place: v.place, mode: v.mode } } });
            setEditing(null);
          }}
          onDelete={() => {
            overrideMemory(memory.date, { steps: { ...steps, [editing!]: { ...steps[editing!], hidden: true } } });
            setEditing(null);
          }}
        />
      </View>

      {dayLogs.length > 0 && (
        <View style={styles.gap}>
          <Text variant="sectionTitle" accessibilityRole="header">
            From your log
          </Text>
          <Card padded={false} style={styles.logList}>
            {dayLogs.map((e, i) => (
              <ListRow
                key={e.id}
                title={`${e.domain === 'Exercise' ? (/run/i.test(e.title) ? '🏃' : '🚶') : e.domain === 'Sleep' ? '😴' : e.domain === 'Social' ? '🫶' : e.domain === 'Work' ? '💼' : '•'} ${e.title}`}
                detail={[clock(e.timestampStart), e.subtitle, e.source === 'AUTO' ? 'logged automatically' : null].filter(Boolean).join(' · ')}
                isLast={i === dayLogs.length - 1}
                onPress={() => navigation.navigate('EventDetail', { eventId: e.id })}
              />
            ))}
          </Card>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: screenPadding,
    gap: spacing.md,
  },
  gap: {
    gap: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  wrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  flex: {
    flex: 1,
  },
  pin: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  renameRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'center',
  },
  renameLink: {
    marginLeft: 'auto',
  },
  small: {
    minHeight: 40,
    paddingHorizontal: spacing.md,
  },
  input: {
    minHeight: 44,
    borderWidth: 1,
    borderRadius: radii.chip,
    paddingHorizontal: spacing.sm,
  },
  noteInput: {
    minHeight: 90,
    paddingTop: spacing.sm,
    textAlignVertical: 'top',
  },
  story: {
    fontSize: 16,
    lineHeight: 25,
  },
  bullets: {
    fontVariant: ['tabular-nums'],
  },
  node: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  nodeMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: 4,
  },
  dots: {
    flexDirection: 'row',
    gap: 3,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  logList: {
    paddingHorizontal: spacing.md,
  },
  timeline: {
    gap: spacing.md,
    paddingTop: spacing.xs,
  },
});
