import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Switch, TextInput, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { InkCanvas, type InkTool } from '../components/journal/InkCanvas';
import { INK_TONES, INK_WIDTHS, inkColor, type InkWidth } from '../components/journal/ink';
import { InkPage } from '../components/journal/InkPage';
import { ScreenHeader } from '../components/composite/ScreenHeader';
import { VoiceButton } from '../components/composite/VoiceButton';
import { Button, Card, PressableScale, SelectablePill, Text } from '../components/primitives';
import { dayOf, isCheckIn } from '../domain/events';
import type { InkStroke, SignalEvent } from '../domain/types';
import type { RootStackParamList } from '../navigation/types';
import { useAppStore } from '../state/AppStore';
import { radii, screenPadding, spacing, typography, useTheme } from '../theme';
import { canWriteJournal } from '../utils/device';
import { haptics } from '../utils/haptics';
import { formatClockRange, formatDayLabel, formatDuration, formatLongDate } from '../utils/time';

const MAX_PAGE_WIDTH = 820;
const SAVE_DELAY_MS = 700;
const ERASE_RADIUS = 0.018;
const MAX_UNDO = 50;

const whenOf = (e: SignalEvent) =>
  isCheckIn(e)
    ? `${formatDayLabel(dayOf(e))} · ${formatClockRange(e.timestampStart, e.timestampEnd)}`
    : `${formatDayLabel(dayOf(e))} · ${formatClockRange(e.timestampStart, e.timestampEnd)} · ${formatDuration(e.timestampStart, e.timestampEnd)}`;

export function JournalEntryScreen({ route, navigation }: NativeStackScreenProps<RootStackParamList, 'JournalEntry'>) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const { getLog, journals } = useAppStore();
  const log = getLog(route.params.logId);
  const pageWidth = Math.min(windowWidth - screenPadding * 2, MAX_PAGE_WIDTH);

  if (!log) {
    return (
      <View style={[styles.fill, styles.content, { backgroundColor: colors.bgSurface, paddingTop: insets.top + spacing.lg }]}>
        <ScreenHeader title="Not found" caption="This entry was deleted." navAction={{ label: 'Close', onPress: navigation.goBack }} />
      </View>
    );
  }

  const header = <ScreenHeader title={log.title} caption={whenOf(log)} navAction={{ label: 'Done', onPress: navigation.goBack }} />;

  return canWriteJournal ? (
    <JournalEditor log={log} header={header} pageWidth={pageWidth} />
  ) : (
    <ScrollView
      style={{ backgroundColor: colors.bgSurface }}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + spacing.lg, paddingBottom: insets.bottom + spacing.xl }]}
    >
      {header}
      <JournalReader entry={journals[log.id]} pageWidth={pageWidth} />
    </ScrollView>
  );
}

// ---- Reader (iPhone) -----------------------------------------------------------------

function JournalReader({ entry, pageWidth }: { entry: ReturnType<typeof useAppStore>['journals'][string] | undefined; pageWidth: number }) {
  const { colors } = useTheme();
  if (!entry) {
    return (
      <Card style={styles.gap}>
        <Text variant="body" tone="secondary">
          Nothing written yet. Open this entry on your iPad to journal about it. It will appear here once iCloud syncs.
        </Text>
      </Card>
    );
  }
  const pages = entry.pages.filter((p) => p.length > 0);
  return (
    <View style={styles.gap}>
      {entry.text.trim() !== '' && (
        <Text variant="body" style={styles.readerText} selectable>
          {entry.text}
        </Text>
      )}
      {pages.map((strokes, i) => (
        <View key={i} style={[styles.page, { borderColor: colors.borderSubtle, backgroundColor: colors.bgCard }]}>
          <InkPage strokes={strokes} width={pageWidth - 2} />
        </View>
      ))}
      <Text variant="caption" tone="secondary">
        Last edited {formatLongDate(new Date(entry.updatedAt))} on iPad
      </Text>
    </View>
  );
}

// ---- Editor (iPad) -------------------------------------------------------------------

function nearStroke(stroke: InkStroke, x: number, y: number): boolean {
  const r = ERASE_RADIUS + stroke.width;
  for (let i = 0; i < stroke.points.length; i += 2) {
    if (Math.abs(stroke.points[i] - x) < r && Math.abs(stroke.points[i + 1] - y) < r) return true;
  }
  return false;
}

function JournalEditor({ log, header, pageWidth }: { log: SignalEvent; header: React.ReactNode; pageWidth: number }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { journals, saveJournal } = useAppStore();
  const initial = journals[log.id];
  const [text, setText] = useState(initial?.text ?? '');
  const [pages, setPages] = useState<InkStroke[][]>(initial?.pages.length ? initial.pages : [[]]);
  const [tool, setTool] = useState<InkTool>({ mode: 'pen', tone: 'ink', width: 'medium' });
  const [pencilOnly, setPencilOnly] = useState(true);
  const [drawing, setDrawing] = useState(false);
  const [confirmClear, setConfirmClear] = useState<number | null>(null);
  const undoStack = useRef<InkStroke[][][]>([]);
  const dirty = useRef(false);

  // Autosave shortly after edits pause; flush on leave so nothing is lost.
  const latest = useRef({ text, pages });
  useEffect(() => {
    latest.current = { text, pages };
  });
  const flush = useCallback(() => {
    if (!dirty.current) return;
    dirty.current = false;
    saveJournal({ logId: log.id, text: latest.current.text, pages: latest.current.pages });
  }, [log.id, saveJournal]);
  useEffect(() => {
    const t = setTimeout(flush, SAVE_DELAY_MS);
    return () => clearTimeout(t);
  }, [text, pages, flush]);
  useEffect(() => flush, [flush]);

  const changePages = useCallback((next: (prev: InkStroke[][]) => InkStroke[][]) => {
    setPages((prev) => {
      undoStack.current = [...undoStack.current.slice(-MAX_UNDO + 1), prev];
      dirty.current = true;
      return next(prev);
    });
  }, []);

  const addStroke = useCallback(
    (page: number, stroke: InkStroke) => changePages((prev) => prev.map((p, i) => (i === page ? [...p, stroke] : p))),
    [changePages],
  );

  const eraseAt = useCallback((page: number, x: number, y: number) => {
    setPages((prev) => {
      const hit = prev[page].some((s) => nearStroke(s, x, y));
      if (!hit) return prev;
      undoStack.current = [...undoStack.current.slice(-MAX_UNDO + 1), prev];
      dirty.current = true;
      return prev.map((p, i) => (i === page ? p.filter((s) => !nearStroke(s, x, y)) : p));
    });
  }, []);

  const undo = () => {
    const prev = undoStack.current.pop();
    if (!prev) return;
    dirty.current = true;
    setPages(prev);
    haptics.light();
  };

  return (
    <View style={[styles.fill, { backgroundColor: colors.bgSurface }]}>
      <ScrollView
        scrollEnabled={!drawing}
        keyboardDismissMode="interactive"
        contentContainerStyle={[styles.content, styles.editorContent, { paddingTop: insets.top + spacing.lg, paddingBottom: insets.bottom + spacing.xxl }]}
      >
        <View style={{ width: pageWidth, gap: spacing.lg }}>
          {header}

          <View style={styles.pageFooter}>
            <Text variant="caption" tone="secondary">
              Type, or tap the mic and speak
            </Text>
            <VoiceButton
              value={text}
              onChange={(t) => {
                dirty.current = true;
                setText(t);
              }}
            />
          </View>
          <TextInput
            value={text}
            onChangeText={(t) => {
              dirty.current = true;
              setText(t);
            }}
            placeholder="Write about this…"
            placeholderTextColor={colors.textSecondary}
            multiline
            scrollEnabled={false}
            style={[typography.body, styles.textArea, { color: colors.textPrimary, backgroundColor: colors.bgCard, borderColor: colors.borderSubtle }]}
            accessibilityLabel="Journal text"
          />

          <Toolbar tool={tool} setTool={setTool} pencilOnly={pencilOnly} setPencilOnly={setPencilOnly} onUndo={undo} />

          {pages.map((strokes, i) => (
            <View key={i} style={styles.gap}>
              <View style={[styles.page, { borderColor: colors.borderSubtle, backgroundColor: colors.bgCard }]}>
                <InkCanvas
                  page={i}
                  strokes={strokes}
                  width={pageWidth - 2}
                  tool={tool}
                  pencilOnly={pencilOnly}
                  onAddStroke={addStroke}
                  onErase={eraseAt}
                  onDrawingChange={setDrawing}
                />
              </View>
              <View style={styles.pageFooter}>
                <Text variant="caption" tone="secondary">
                  Page {i + 1}
                </Text>
                {confirmClear === i ? (
                  <View style={styles.row}>
                    <Button label="Keep" variant="ghost" style={styles.small} onPress={() => setConfirmClear(null)} />
                    <Button
                      label={pages.length > 1 ? 'Remove page' : 'Clear page'}
                      variant="secondary"
                      style={styles.small}
                      onPress={() => {
                        changePages((prev) => (prev.length > 1 ? prev.filter((_, j) => j !== i) : [[]]));
                        setConfirmClear(null);
                        haptics.warning();
                      }}
                    />
                  </View>
                ) : (
                  (strokes.length > 0 || pages.length > 1) && (
                    <Button label={pages.length > 1 ? 'Remove…' : 'Clear…'} variant="ghost" style={styles.small} onPress={() => setConfirmClear(i)} />
                  )
                )}
              </View>
            </View>
          ))}

          <Button label="Add a page" variant="secondary" onPress={() => changePages((prev) => [...prev, []])} />
          <Text variant="caption" tone="secondary" style={styles.center}>
            Saved automatically. Syncs to your iPhone through iCloud.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

const WIDTH_LABELS: Record<InkWidth, string> = { fine: 'Fine', medium: 'Medium', bold: 'Bold' };

function Toolbar({
  tool,
  setTool,
  pencilOnly,
  setPencilOnly,
  onUndo,
}: {
  tool: InkTool;
  setTool: (t: InkTool) => void;
  pencilOnly: boolean;
  setPencilOnly: (v: boolean) => void;
  onUndo: () => void;
}) {
  const { colors } = useTheme();
  const pen = tool.mode === 'pen' ? tool : { mode: 'pen' as const, tone: 'ink' as const, width: 'medium' as const };
  return (
    <Card style={styles.toolbar}>
      <View style={styles.row}>
        {INK_TONES.map((tone) => {
          const selected = tool.mode === 'pen' && tool.tone === tone;
          return (
            <PressableScale
              key={tone}
              haptic
              accessibilityLabel={`${tone} ink`}
              accessibilityState={{ selected }}
              onPress={() => setTool({ ...pen, tone })}
              style={[styles.swatchRing, { borderColor: selected ? colors.textPrimary : 'transparent' }]}
            >
              <View style={[styles.swatch, { backgroundColor: inkColor(tone, colors) }]} />
            </PressableScale>
          );
        })}
        <View style={[styles.divider, { backgroundColor: colors.borderSubtle }]} />
        {(Object.keys(INK_WIDTHS) as InkWidth[]).map((w) => (
          <SelectablePill key={w} label={WIDTH_LABELS[w]} selected={tool.mode === 'pen' && tool.width === w} onPress={() => setTool({ ...pen, width: w })} />
        ))}
        <View style={[styles.divider, { backgroundColor: colors.borderSubtle }]} />
        <SelectablePill label="Eraser" selected={tool.mode === 'eraser'} onPress={() => setTool(tool.mode === 'eraser' ? pen : { mode: 'eraser' })} />
        <SelectablePill label="Undo" selected={false} onPress={onUndo} />
      </View>
      <View style={styles.row}>
        <Text variant="caption" tone="secondary" style={styles.fill}>
          {pencilOnly ? 'Apple Pencil draws; fingers scroll.' : 'Fingers and Apple Pencil both draw.'}
        </Text>
        <Text variant="caption">Pencil only</Text>
        <Switch value={pencilOnly} onValueChange={setPencilOnly} trackColor={{ true: colors.state.calm, false: colors.borderSubtle }} />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  fill: {
    flex: 1,
  },
  content: {
    paddingHorizontal: screenPadding,
    gap: spacing.lg,
  },
  editorContent: {
    alignItems: 'center',
  },
  gap: {
    gap: spacing.sm,
  },
  readerText: {
    fontSize: 17,
    lineHeight: 26,
  },
  page: {
    borderWidth: 1,
    borderRadius: radii.card - 8,
    overflow: 'hidden',
  },
  pageFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 36,
  },
  textArea: {
    minHeight: 160,
    borderWidth: 1,
    borderRadius: radii.card - 8,
    padding: spacing.md,
    textAlignVertical: 'top',
    fontSize: 17,
    lineHeight: 26,
  },
  toolbar: {
    gap: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  swatchRing: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  swatch: {
    width: 24,
    height: 24,
    borderRadius: 12,
  },
  divider: {
    width: 1,
    height: 24,
    marginHorizontal: spacing.xxs,
  },
  small: {
    minHeight: 32,
    paddingHorizontal: spacing.sm,
  },
  center: {
    textAlign: 'center',
  },
});
