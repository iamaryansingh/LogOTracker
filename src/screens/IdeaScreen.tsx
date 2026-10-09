import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useEffect, useRef, useState } from 'react';
import { Image, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ScreenHeader } from '../components/composite/ScreenHeader';
import { VoiceButton } from '../components/composite/VoiceButton';
import { Button, Card, PressableScale, SelectablePill, Text } from '../components/primitives';
import type { DevIdea, IdeaKind } from '../domain/types';
import type { RootStackParamList } from '../navigation/types';
import { attachLatestScreenshot, contextLine, copyImage, copyText, deleteImages, imageUri, pickImages, shareIdea } from '../services/ideas';
import { useAppStore } from '../state/AppStore';
import { radii, screenPadding, spacing, typography, useTheme, type StateToken } from '../theme';
import { haptics } from '../utils/haptics';

const KINDS: IdeaKind[] = ['Bug', 'Idea', 'Polish'];
export const kindToken: Record<IdeaKind, StateToken> = { Bug: 'stressHigh', Idea: 'focus', Polish: 'calm' };
const SCREENS = ['Today', 'Timeline', 'Memories', 'Plans', 'Journal', 'Insights', 'Settings', 'Logging', 'Other'];

const newId = () => `idea-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

export function IdeaScreen({ route, navigation }: NativeStackScreenProps<RootStackParamList, 'Idea'>) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { ideas, saveIdea, deleteIdea } = useAppStore();
  const existing = route.params?.id ? ideas[route.params.id] : undefined;
  const [idea, setIdea] = useState<DevIdea>(
    () =>
      existing ?? {
        id: newId(),
        kind: 'Bug',
        text: '',
        images: [],
        done: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
  );
  const [status, setStatus] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const saved = useRef(!!existing);
  const deleted = useRef(false);
  const [dirty, setDirty] = useState(false);
  const [everSaved, setEverSaved] = useState(!!existing);
  // Latest values for saving on close, after this render's closures are gone.
  const latest = useRef({ idea, dirty, saveIdea });
  useEffect(() => {
    latest.current = { idea, dirty, saveIdea };
  });

  // Saves now. An untouched new item leaves nothing behind.
  const commit = (i: DevIdea = idea) => {
    const hasContent = i.text.trim() !== '' || i.images.length > 0;
    if (!hasContent && !saved.current) return false;
    saveIdea({ ...i, updatedAt: new Date().toISOString() });
    saved.current = true;
    setEverSaved(true);
    setDirty(false);
    return true;
  };

  // Autosave shortly after typing pauses, as a safety net for the Save button.
  useEffect(() => {
    if (!dirty) return;
    const t = setTimeout(() => commit(), 800);
    return () => clearTimeout(t);
  }, [idea, dirty]); // eslint-disable-line react-hooks/exhaustive-deps

  // Closing (Close, swipe down) before the autosave fires still keeps what was typed.
  useEffect(
    () => () => {
      const { idea: i, dirty: d, saveIdea: save } = latest.current;
      if (!d || deleted.current) return;
      if (i.text.trim() === '' && i.images.length === 0 && !saved.current) return;
      save({ ...i, updatedAt: new Date().toISOString() });
    },
    [],
  );

  const update = (patch: Partial<DevIdea>) => {
    setIdea((i) => ({ ...i, ...patch }));
    setDirty(true);
  };
  const saveAndClose = () => {
    if (!commit() && !existing) {
      flash('Write something or add a screenshot first.');
      return;
    }
    haptics.success();
    navigation.goBack();
  };
  const flash = (text: string) => {
    setStatus(text);
    setTimeout(() => setStatus((s) => (s === text ? null : s)), 2500);
  };

  const addLatest = async () => {
    const r = await attachLatestScreenshot();
    if ('name' in r) {
      update({ images: [...idea.images, r.name] });
      haptics.success();
    } else {
      flash(r.error === 'denied' ? 'Allow Photos access in Settings to attach screenshots.' : 'No screenshots in Photos yet. Take one, then try again.');
    }
  };

  return (
    <ScrollView
      style={{ backgroundColor: colors.bgSurface }}
      keyboardShouldPersistTaps="handled"
      automaticallyAdjustKeyboardInsets
      keyboardDismissMode="interactive"
      contentContainerStyle={[styles.content, { paddingTop: spacing.lg, paddingBottom: insets.bottom + spacing.xl }]}
    >
      <ScreenHeader
        title={existing ? 'Improvement' : 'New improvement'}
        caption="Tagged: Scope of improvement"
        navAction={{ label: 'Close', onPress: navigation.goBack }}
        right={<Button label="Save" style={styles.save} onPress={saveAndClose} />}
      />
      <Text variant="caption" tone={dirty ? 'secondary' : 'calm'}>
        {dirty ? 'Unsaved changes' : everSaved ? 'Saved ✓' : 'Not saved yet'}
      </Text>

      <View style={styles.wrap}>
        {KINDS.map((k) => (
          <SelectablePill key={k} label={k} color={colors.state[kindToken[k]]} selected={idea.kind === k} onPress={() => update({ kind: k })} />
        ))}
      </View>

      <Card style={styles.gap}>
        <View style={styles.row}>
          <Text variant="caption" tone="secondary">
            What did you notice?
          </Text>
          <VoiceButton value={idea.text} onChange={(text) => update({ text })} />
        </View>
        <TextInput
          value={idea.text}
          onChangeText={(text) => update({ text })}
          autoFocus={!existing}
          multiline
          placeholder={idea.kind === 'Bug' ? 'What happened, and what you expected instead…' : 'What would make this better…'}
          placeholderTextColor={colors.textSecondary}
          scrollEnabled={false}
          style={[typography.body, styles.input, { color: colors.textPrimary, backgroundColor: colors.bgSurface, borderColor: colors.borderSubtle }]}
        />
      </Card>

      <View style={styles.gap}>
        <Text variant="caption" tone="secondary">
          Where in the app
        </Text>
        <View style={styles.wrap}>
          {SCREENS.map((s) => (
            <SelectablePill key={s} label={s} selected={idea.screen === s} onPress={() => update({ screen: idea.screen === s ? undefined : s })} />
          ))}
        </View>
      </View>

      <Card style={styles.gap}>
        <Text variant="caption" tone="secondary">
          Screenshots
        </Text>
        {idea.images.length > 0 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.thumbs}>
            {idea.images.map((name) => (
              <View key={name} style={styles.thumbWrap}>
                <Image source={{ uri: imageUri(name) }} style={[styles.thumb, { borderColor: colors.borderSubtle }]} resizeMode="cover" />
                <View style={styles.thumbActions}>
                  <PressableScale
                    haptic
                    onPress={async () => {
                      await copyImage(name);
                      flash('Image copied. Paste it anywhere.');
                    }}
                    accessibilityLabel="Copy this image"
                    style={[styles.tiny, { backgroundColor: colors.bgCard, borderColor: colors.borderSubtle }]}
                  >
                    <Text variant="caption">Copy</Text>
                  </PressableScale>
                  <PressableScale
                    haptic
                    onPress={() => {
                      deleteImages([name]);
                      update({ images: idea.images.filter((n) => n !== name) });
                    }}
                    accessibilityLabel="Remove this image"
                    style={[styles.tiny, { backgroundColor: colors.bgCard, borderColor: colors.borderSubtle }]}
                  >
                    <Text variant="caption" tone="stressHigh">
                      Remove
                    </Text>
                  </PressableScale>
                </View>
              </View>
            ))}
          </ScrollView>
        )}
        <View style={styles.buttons}>
          <Button label="Latest screenshot" variant="secondary" style={styles.flex} onPress={addLatest} />
          <Button
            label="From Photos"
            variant="secondary"
            style={styles.flex}
            onPress={async () => {
              const names = await pickImages();
              if (names.length) update({ images: [...idea.images, ...names] });
            }}
          />
        </View>
        <Text variant="caption" tone="secondary">
          Take a screenshot where you spotted it (side + volume up), then tap “Latest screenshot” here.
        </Text>
      </Card>

      <Card style={styles.gap}>
        <Text variant="caption" tone="secondary">
          Take it elsewhere
        </Text>
        <View style={styles.buttons}>
          <Button
            label="Copy text"
            variant="secondary"
            style={styles.flex}
            onPress={async () => {
              await copyText(idea);
              haptics.success();
              flash('Text copied, with app and device details.');
            }}
          />
          <Button label="Share all" variant="secondary" style={styles.flex} onPress={() => shareIdea(idea)} />
        </View>
        {status && (
          <Text variant="caption" tone="calm">
            {status}
          </Text>
        )}
        <Text variant="caption" tone="secondary">
          {contextLine(idea)}
        </Text>
      </Card>

      <View style={styles.buttons}>
        <Button
          label={idea.done ? 'Reopen' : 'Mark as done'}
          variant="secondary"
          style={styles.flex}
          onPress={() => {
            update({ done: !idea.done });
            haptics.success();
          }}
        />
        {confirmDelete ? (
          <Button
            label="Delete for good"
            style={[styles.flex, { backgroundColor: colors.state.stressHigh }]}
            onPress={() => {
              deleted.current = true;
              deleteImages(idea.images);
              deleteIdea(idea.id);
              saved.current = false;
              navigation.goBack();
            }}
          />
        ) : (
          <Button label="Delete" variant="ghost" style={styles.flex} onPress={() => setConfirmDelete(true)} />
        )}
      </View>

      <Button label={existing ? 'Save changes' : 'Save'} onPress={saveAndClose} />
    </ScrollView>
  );
}

const THUMB_W = 110;

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: screenPadding,
    gap: spacing.lg,
  },
  gap: {
    gap: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  wrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  input: {
    // Room for a real write-up; grows with the text and the page scrolls.
    minHeight: 260,
    borderWidth: 1,
    borderRadius: radii.chip,
    padding: spacing.sm,
    textAlignVertical: 'top',
  },
  save: {
    minHeight: 40,
    paddingHorizontal: spacing.lg,
  },
  thumbs: {
    gap: spacing.sm,
  },
  thumbWrap: {
    width: THUMB_W,
    gap: spacing.xxs,
  },
  thumb: {
    width: THUMB_W,
    height: THUMB_W * 2,
    borderRadius: radii.chip,
    borderWidth: 1,
  },
  thumbActions: {
    flexDirection: 'row',
    gap: spacing.xxs,
  },
  tiny: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 4,
    borderRadius: radii.pill,
    borderWidth: 1,
  },
  buttons: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  flex: {
    flex: 1,
  },
});
