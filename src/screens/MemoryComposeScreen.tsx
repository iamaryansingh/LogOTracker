import DateTimePicker from '@react-native-community/datetimepicker';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Image, Platform, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ScreenHeader } from '../components/composite/ScreenHeader';
import { VoiceButton } from '../components/composite/VoiceButton';
import { VIBE_ICON, VIBE_LABEL, vibeColor } from '../components/memories/vibes';
import { Button, Card, Chip, ListRow, PressableScale, SelectablePill, Text } from '../components/primitives';
import { pastPlaces } from '../domain/memories';
import type { CustomMemory, MemoryPlace, MemoryStyle } from '../domain/memoryTypes';
import { keyLabels, photoMemoryText, photoThemes, type PhotoSignals } from '../domain/photoCaption';
import type { RootStackParamList } from '../navigation/types';
import {
  canDescribePhotos,
  currentPlace,
  deleteMemoryPhotos,
  describePhotos,
  memoryPhotoUri,
  openInMaps,
  pickMemoryPhotos,
  placeAt,
  type PickedPhoto,
} from '../services/memories/custom';
import { useMemories } from '../services/memories/MemoriesProvider';
import { searchPlaces } from '../services/memories/places';
import type { MapPlace } from '../../modules/self-mirror-places';
import { useAppStore } from '../state/AppStore';
import { radii, screenPadding, spacing, typography, useTheme } from '../theme';
import { haptics } from '../utils/haptics';
import { formatDayLabel, fromISODate, toISODate } from '../utils/time';
import { STYLES } from './MemoryScreen';

type PlaceSource = 'photos' | 'current' | 'pin' | 'past' | 'given' | 'search';
type Panel = 'search' | 'pin' | 'past' | null;

const THUMB = 84;
const newId = () => `cm-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

/** Make (or edit) a memory: photos in, place from the photos / a pin / somewhere you've been, story written for you. */
export function MemoryComposeScreen({ route, navigation }: NativeStackScreenProps<RootStackParamList, 'MemoryCompose'>) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { customMemories, saveCustomMemory, memories: settings } = useAppStore();
  const { memories: liveMemories } = useMemories();
  const existing = route.params?.id ? customMemories[route.params.id] : undefined;
  const given = route.params?.place;

  const [photos, setPhotos] = useState<PickedPhoto[]>(() => existing?.photos.map((name) => ({ name })) ?? []);
  const [signals, setSignals] = useState<Record<string, PhotoSignals>>({});
  const [place, setPlace] = useState<MemoryPlace | undefined>(existing?.place ?? given);
  const [placeSource, setPlaceSource] = useState<PlaceSource | undefined>(existing?.place || given ? 'given' : undefined);
  const [date, setDate] = useState(existing?.date ?? route.params?.date ?? toISODate(new Date()));
  const [takenAt, setTakenAt] = useState<number | undefined>(existing?.takenAt ? Date.parse(existing.takenAt) : undefined);
  const [style, setStyle] = useState<MemoryStyle>(settings.style);
  const [title, setTitle] = useState(existing?.title ?? '');
  const [caption, setCaption] = useState(existing?.caption ?? '');
  // Once the user writes their own words, stop rewriting them.
  const [edited, setEdited] = useState(!!existing);
  const [note, setNote] = useState(existing?.note ?? '');
  const [panel, setPanel] = useState<Panel>(null);
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState('');
  const [results, setResults] = useState<MapPlace[]>([]);
  const [searching, setSearching] = useState(false);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [showAndroidDate, setShowAndroidDate] = useState(false);
  // Photos added in this session, deleted again if the memory is discarded.
  const added = useRef<string[]>([]);
  const [seed] = useState(() => existing?.id ?? newId());

  const names = photos.map((p) => p.name);
  const namesKey = names.join('|');

  /** Has Vision look at any photos not yet described. */
  const describe = async (list: string[]) => {
    const todo = list.filter((n) => !(n in signals));
    if (!todo.length || !canDescribePhotos) return;
    setBusy('Looking at your photos…');
    try {
      const found = await describePhotos(todo);
      setSignals((s) => {
        const next = { ...s };
        todo.forEach((n, i) => (next[n] = found[i] ?? { labels: [], faces: 0 }));
        return next;
      });
    } finally {
      setBusy(null);
    }
  };

  const described = useMemo(
    () => namesKey.split('|').map((n) => signals[n]).filter((s): s is PhotoSignals => !!s),
    [namesKey, signals],
  );
  const themes = useMemo(() => photoThemes(described), [described]);
  const labels = useMemo(() => (described.length ? keyLabels(described) : (existing?.labels ?? [])), [described, existing]);
  const whenMs = takenAt ?? fromISODate(date).getTime();
  const generated = useMemo(
    () => photoMemoryText({ seed, style, themes, labels, photoCount: photos.length, place, when: new Date(whenMs) }),
    [seed, style, themes, labels, photos.length, place, whenMs],
  );
  // Until the user writes their own words, the story follows the photos, place and style.
  const shownTitle = edited ? title : generated.title;
  const shownCaption = edited ? caption : generated.caption;
  const freeze = () => {
    if (edited) return;
    setTitle(generated.title);
    setCaption(generated.caption);
    setEdited(true);
  };
  const rewrite = () => {
    setEdited(false);
    void describe(names);
  };

  const past = useMemo(() => {
    const all = pastPlaces(liveMemories, Object.values(customMemories));
    const q = query.trim().toLowerCase();
    return (q ? all.filter((p) => `${p.name} ${p.locality ?? ''} ${p.city ?? ''}`.toLowerCase().includes(q)) : all).slice(0, 12);
  }, [liveMemories, customMemories, query]);

  const addPhotos = async () => {
    setProblem(null);
    const picked = await pickMemoryPhotos();
    if (!picked.length) return;
    added.current.push(...picked.map((p) => p.name));
    setPhotos((ps) => [...ps, ...picked]);
    haptics.selection();
    void describe(picked.map((p) => p.name));

    // When the photos know when and where, use that unless the user already chose.
    const times = picked.map((p) => p.takenAt).filter((t): t is number => !!t);
    if (times.length && !existing && !route.params?.date) {
      const first = Math.min(...times);
      setTakenAt(first);
      setDate(toISODate(new Date(first)));
    }
    const located = picked.find((p) => p.lat !== undefined && p.lon !== undefined);
    if (located && (!placeSource || placeSource === 'photos')) {
      setBusy('Finding where these were taken…');
      try {
        setPlace(await placeAt(located.lat!, located.lon!));
        setPlaceSource('photos');
      } finally {
        setBusy(null);
      }
    }
  };

  const removePhoto = (name: string) => {
    setPhotos((ps) => ps.filter((p) => p.name !== name));
    if (added.current.includes(name)) {
      deleteMemoryPhotos([name]);
      added.current = added.current.filter((n) => n !== name);
    }
  };

  const pickCurrent = async () => {
    setProblem(null);
    setBusy('Finding where you are…');
    try {
      const here = await currentPlace();
      if (!here) setProblem('Location is off for Self Mirror. Turn it on in Settings to use where you are.');
      else {
        setPlace(here);
        setPlaceSource('current');
        setPanel(null);
      }
    } finally {
      setBusy(null);
    }
  };

  const onSearch = (text: string) => {
    setSearch(text);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (text.trim().length < 2) {
      setResults([]);
      return;
    }
    // Wait for a pause in typing before asking Apple Maps.
    searchTimer.current = setTimeout(async () => {
      setSearching(true);
      try {
        setResults(await searchPlaces(text, place ?? (past[0] ? { latitude: past[0].latitude, longitude: past[0].longitude } : undefined)));
      } finally {
        setSearching(false);
      }
    }, 350);
  };

  const dropPin = async (latitude: number, longitude: number) => {
    setPlace({ name: 'Dropped pin', latitude, longitude });
    setPlaceSource('pin');
    haptics.selection();
    const named = await placeAt(latitude, longitude);
    setPlace((p) => (p && p.latitude === latitude && p.longitude === longitude ? named : p));
  };

  const close = () => {
    // Discarding a draft shouldn't leave its copied photos behind.
    deleteMemoryPhotos(added.current);
    navigation.goBack();
  };

  const save = () => {
    const at = new Date().toISOString();
    const memory: CustomMemory = {
      // Keeps what this screen doesn't edit (a live memory's timeline, insights, route).
      ...existing,
      id: seed,
      date,
      takenAt: takenAt ? new Date(takenAt).toISOString() : undefined,
      title: shownTitle.trim() || generated.title,
      caption: shownCaption.trim() || generated.caption,
      note: note.trim() || undefined,
      photos: names,
      place,
      vibe: generated.vibe,
      labels,
      isPinned: existing?.isPinned ?? false,
      createdAt: existing?.createdAt ?? at,
      updatedAt: at,
    };
    // Photos removed while editing are gone for good once saved.
    if (existing) deleteMemoryPhotos(existing.photos.filter((n) => !names.includes(n)));
    saveCustomMemory(memory);
    haptics.success();
    if (existing) navigation.goBack();
    else navigation.replace('MemoryPost', { id: memory.id });
  };

  const region = place
    ? { latitude: place.latitude, longitude: place.longitude, latitudeDelta: 0.01, longitudeDelta: 0.01 }
    : past[0]
      ? { latitude: past[0].latitude, longitude: past[0].longitude, latitudeDelta: 0.05, longitudeDelta: 0.05 }
      : undefined;
  const canSave = photos.length > 0 || !!place || shownCaption.trim().length > 0;
  const inputStyle = [typography.body, styles.input, { color: colors.textPrimary, borderColor: colors.borderSubtle, backgroundColor: colors.bgSurface }];

  return (
    <ScrollView
      style={{ backgroundColor: colors.memory.bgMemoryWarm }}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={[styles.content, { paddingTop: spacing.lg, paddingBottom: insets.bottom + spacing.xl }]}
    >
      <ScreenHeader
        title={existing ? 'Edit memory' : 'New memory'}
        caption="Add photos and a place; the story writes itself."
        navAction={{ label: 'Cancel', onPress: close }}
        right={<Button label="Save" style={styles.small} disabled={!canSave} onPress={save} />}
      />

      {/* Photos */}
      <Card style={styles.gap}>
        <Text variant="caption" tone="secondary">
          Photos
        </Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.thumbs}>
          <PressableScale
            haptic
            onPress={addPhotos}
            accessibilityLabel="Add photos"
            style={[styles.addTile, { borderColor: colors.borderSubtle, backgroundColor: colors.bgSurface }]}
          >
            <Text variant="sectionTitle" tone="secondary">
              ＋
            </Text>
            <Text variant="caption" tone="secondary">
              Add
            </Text>
          </PressableScale>
          {photos.map((p) => (
            <View key={p.name}>
              <Image source={{ uri: memoryPhotoUri(p.name) }} style={styles.thumb} resizeMode="cover" />
              <PressableScale onPress={() => removePhoto(p.name)} accessibilityLabel="Remove photo" hitSlop={8} style={[styles.remove, { backgroundColor: colors.bgCard }]}>
                <Text variant="caption">✕</Text>
              </PressableScale>
            </View>
          ))}
        </ScrollView>
        {!canDescribePhotos && photos.length > 0 && (
          <Text variant="caption" tone="secondary">
            Reading what’s in photos needs the latest build of the app; the story uses the place and time for now.
          </Text>
        )}
      </Card>

      {/* Place */}
      <Card style={styles.gap}>
        <Text variant="caption" tone="secondary">
          Where
        </Text>
        {place ? (
          <View style={styles.row}>
            <View style={styles.flex}>
              <Text variant="bodyMedium" numberOfLines={1}>
                📍 {place.name}
              </Text>
              <Text variant="caption" tone="secondary" numberOfLines={1}>
                {placeSource === 'photos' ? 'From your photos' : placeSource === 'current' ? 'Where you are now' : placeSource === 'pin' ? 'Pin you dropped' : placeSource === 'past' ? 'A place you’ve been' : placeSource === 'search' ? (place.city ?? place.locality ?? 'From search') : (place.city ?? place.locality ?? '')}
              </Text>
            </View>
            <Button label="Maps" variant="secondary" style={styles.small} onPress={() => openInMaps(place)} />
          </View>
        ) : (
          <Text variant="body" tone="secondary">
            Photos with location fill this in. Or choose below.
          </Text>
        )}
        <View style={styles.wrap}>
          <SelectablePill label="📷 From photos" selected={placeSource === 'photos'} onPress={() => {
            const located = photos.find((p) => p.lat !== undefined);
            if (!located) {
              setProblem(photos.length ? 'These photos don’t have a location saved.' : 'Add photos first.');
              return;
            }
            setProblem(null);
            void placeAt(located.lat!, located.lon!).then((p) => {
              setPlace(p);
              setPlaceSource('photos');
            });
          }} />
          <SelectablePill label="🔍 Search" selected={panel === 'search'} onPress={() => setPanel(panel === 'search' ? null : 'search')} />
          <SelectablePill label="➤ Current location" selected={placeSource === 'current'} onPress={pickCurrent} />
          <SelectablePill label="📌 Drop a pin" selected={panel === 'pin'} onPress={() => setPanel(panel === 'pin' ? null : 'pin')} />
          <SelectablePill label="🕘 Past places" selected={panel === 'past'} onPress={() => setPanel(panel === 'past' ? null : 'past')} />
        </View>
        {busy && (
          <View style={styles.row}>
            <ActivityIndicator size="small" color={colors.textSecondary} />
            <Text variant="caption" tone="secondary" style={styles.flex}>
              {busy}
            </Text>
          </View>
        )}
        {problem && (
          <Text variant="caption" tone="stressLow">
            {problem}
          </Text>
        )}

        {panel === 'search' && (
          <View style={styles.gap}>
            <TextInput
              value={search}
              onChangeText={onSearch}
              autoFocus
              autoCorrect={false}
              returnKeyType="search"
              placeholder="A place, area or address"
              placeholderTextColor={colors.textSecondary}
              style={inputStyle}
            />
            {searching && <ActivityIndicator size="small" color={colors.textSecondary} />}
            {!searching && search.trim().length >= 2 && results.length === 0 && (
              <Text variant="caption" tone="secondary">
                No places found.
              </Text>
            )}
            {results.map((p, i) => (
              <ListRow
                key={`${p.name}-${p.latitude}-${p.longitude}`}
                title={p.name}
                detail={p.address ?? [p.locality, p.city].filter(Boolean).join(', ')}
                isLast={i === results.length - 1}
                onPress={() => {
                  setPlace({ name: p.name, latitude: p.latitude, longitude: p.longitude, locality: p.locality, city: p.city });
                  setPlaceSource('search');
                  setPanel(null);
                  haptics.selection();
                }}
              />
            ))}
          </View>
        )}

        {panel === 'pin' && (
          <View style={[styles.map, { borderColor: colors.borderSubtle }]}>
            <MapView
              style={StyleSheet.absoluteFill}
              initialRegion={region}
              showsUserLocation
              onPress={(e) => dropPin(e.nativeEvent.coordinate.latitude, e.nativeEvent.coordinate.longitude)}
              accessibilityLabel="Map. Tap to drop a pin."
            >
              {place && (
                <Marker
                  coordinate={{ latitude: place.latitude, longitude: place.longitude }}
                  draggable
                  onDragEnd={(e) => dropPin(e.nativeEvent.coordinate.latitude, e.nativeEvent.coordinate.longitude)}
                  pinColor={colors.memory.accentPin}
                />
              )}
            </MapView>
            <View style={[styles.mapHint, { backgroundColor: colors.bgCard }]} pointerEvents="none">
              <Text variant="caption">Tap the map or drag the pin</Text>
            </View>
          </View>
        )}

        {panel === 'past' && (
          <View style={styles.gap}>
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Search places you’ve been"
              placeholderTextColor={colors.textSecondary}
              style={inputStyle}
            />
            {past.length === 0 ? (
              <Text variant="caption" tone="secondary">
                {query ? 'No matches.' : 'Places from your live Memories show up here once you’ve been somewhere.'}
              </Text>
            ) : (
              past.map((p, i) => (
                <ListRow
                  key={`${p.name}-${p.latitude}-${p.longitude}`}
                  title={p.name}
                  detail={[p.city ?? p.locality, `${p.visits} visit${p.visits > 1 ? 's' : ''}`, `last ${formatDayLabel(p.lastVisited)}`].filter(Boolean).join(' · ')}
                  isLast={i === past.length - 1}
                  onPress={() => {
                    setPlace({ name: p.name, latitude: p.latitude, longitude: p.longitude, locality: p.locality, city: p.city });
                    setPlaceSource('past');
                    // A memory of an earlier visit: date it to that visit unless the photos say otherwise.
                    if (!takenAt && !existing) setDate(p.lastVisited);
                    setPanel(null);
                    haptics.selection();
                  }}
                />
              ))
            )}
          </View>
        )}
      </Card>

      {/* When */}
      <Card style={styles.row}>
        <Text variant="body">When</Text>
        {Platform.OS === 'ios' ? (
          <DateTimePicker
            value={fromISODate(date)}
            mode="date"
            display="compact"
            maximumDate={new Date()}
            onValueChange={(_: unknown, d: Date) => {
              setDate(toISODate(d));
              setTakenAt(undefined);
            }}
          />
        ) : (
          <>
            <Button label={formatDayLabel(date)} variant="secondary" style={styles.small} onPress={() => setShowAndroidDate(true)} />
            {showAndroidDate && (
              <DateTimePicker
                value={fromISODate(date)}
                mode="date"
                maximumDate={new Date()}
                onValueChange={(_: unknown, d: Date) => {
                  setShowAndroidDate(false);
                  setDate(toISODate(d));
                  setTakenAt(undefined);
                }}
                onDismiss={() => setShowAndroidDate(false)}
              />
            )}
          </>
        )}
      </Card>

      {/* Story */}
      <Card style={styles.gap}>
        <View style={styles.row}>
          <Text variant="caption" tone="secondary">
            Story
          </Text>
          {edited ? (
            <PressableScale onPress={rewrite} accessibilityLabel="Rewrite from photos" hitSlop={8}>
              <Text variant="caption" style={{ color: colors.memory.accentPin }}>
                ✨ Rewrite from photos
              </Text>
            </PressableScale>
          ) : (
            <Chip label={`${VIBE_ICON[generated.vibe]} ${VIBE_LABEL[generated.vibe]}`} color={vibeColor(generated.vibe, colors)} />
          )}
        </View>
        <TextInput
          value={shownTitle}
          onChangeText={(t) => {
            freeze();
            setTitle(t);
          }}
          placeholder="Title"
          placeholderTextColor={colors.textSecondary}
          style={[...inputStyle, typography.bodyMedium]}
        />
        <TextInput
          value={shownCaption}
          onChangeText={(t) => {
            freeze();
            setCaption(t);
          }}
          multiline
          placeholder="Caption"
          placeholderTextColor={colors.textSecondary}
          style={[...inputStyle, styles.multi]}
        />
        <View style={styles.wrap} accessibilityRole="radiogroup" accessibilityLabel="Writing style">
          {STYLES.map((s) => (
            <SelectablePill
              key={s.value}
              label={s.label}
              selected={style === s.value}
              onPress={() => {
                setStyle(s.value);
                rewrite();
                haptics.selection();
              }}
            />
          ))}
        </View>
        {labels.length > 0 && (
          <Text variant="caption" tone="secondary">
            Seen in your photos: {labels.join(', ')}
          </Text>
        )}
      </Card>

      {/* Note */}
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
          placeholder="Who you were with, how it felt…"
          placeholderTextColor={colors.textSecondary}
          style={[...inputStyle, styles.multi]}
        />
      </Card>

      <Button label={existing ? 'Save changes' : 'Save memory'} disabled={!canSave} onPress={save} />
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
  small: {
    minHeight: 40,
    paddingHorizontal: spacing.md,
  },
  thumbs: {
    gap: spacing.xs,
  },
  addTile: {
    width: THUMB,
    height: THUMB,
    borderRadius: radii.chip,
    borderWidth: 1,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
  },
  thumb: {
    width: THUMB,
    height: THUMB,
    borderRadius: radii.chip,
  },
  remove: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  map: {
    height: 240,
    borderRadius: radii.card,
    borderWidth: 1,
    overflow: 'hidden',
  },
  mapHint: {
    position: 'absolute',
    top: spacing.xs,
    alignSelf: 'center',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xxs,
    borderRadius: radii.pill,
  },
  input: {
    minHeight: 44,
    borderWidth: 1,
    borderRadius: radii.chip,
    paddingHorizontal: spacing.sm,
  },
  multi: {
    minHeight: 90,
    paddingTop: spacing.sm,
    textAlignVertical: 'top',
  },
});
