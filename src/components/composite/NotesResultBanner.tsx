import * as Linking from 'expo-linking';
import { useEffect, useRef, useState } from 'react';
import { Share, StyleSheet, View } from 'react-native';
import Animated, { FadeInUp, FadeOutUp } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { NOTES_ROW } from '../../domain/notes';
import { formatForNotes, NOTES_FOLDER, NOTES_SHORTCUT, parseNotesResult, pendingNoteText, sendToAppleNotes, type NotesResult } from '../../services/appleNotes';
import { useAppStore } from '../../state/AppStore';
import { radii, screenPadding, spacing, useTheme } from '../../theme';
import { haptics } from '../../utils/haptics';
import { Button, Card, Text } from '../primitives';

const OK_VISIBLE_MS = 3500;

/** Explains a Shortcuts failure in plain words, keeping Shortcuts' own message when it gave one. */
function explain(result: NotesResult): string {
  if (result.status === 'cancel') return 'The shortcut was stopped before the note was made.';
  const m = result.message ?? '';
  if (/(?:not|n.?t)\s+(?:be\s+)?(?:found|find)|no shortcut/i.test(m)) return `Shortcuts couldn’t find “${NOTES_SHORTCUT}”. Check the name matches exactly.`;
  if (/permission|access|allow/i.test(m)) return 'Shortcuts needs permission to use Notes. Run it once and tap “Always Allow”.';
  if (/folder/i.test(m)) return `Notes couldn’t find the “${NOTES_FOLDER}” folder. Create it in Notes first.`;
  return m ? `Shortcuts said: “${m}”` : 'The shortcut didn’t finish.';
}

/**
 * Listens for Shortcuts reporting back after "Self Mirror to Notes" runs, marks the entry as saved
 * on success, and on failure says why, offering a retry or the share sheet as a fallback.
 */
export function NotesResultBanner() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { getLog, saveLog } = useAppStore();
  const [result, setResult] = useState<NotesResult | null>(null);
  const handlers = useRef({ getLog, saveLog });
  useEffect(() => {
    handlers.current = { getLog, saveLog };
  });

  useEffect(() => {
    const handle = (url: string | null) => {
      const r = url ? parseNotesResult(url) : null;
      if (!r) return;
      setResult(r);
      if (r.status !== 'ok') {
        haptics.warning();
        return;
      }
      haptics.success();
      const entry = handlers.current.getLog(r.entryId);
      if (entry) {
        handlers.current.saveLog({
          ...entry,
          links: {
            ...entry.links,
            sentToNotesAt: new Date().toISOString(),
            handledLines: [...(entry.links?.handledLines ?? []), NOTES_ROW],
          },
        });
      }
    };
    Linking.getInitialURL().then(handle);
    const sub = Linking.addEventListener('url', ({ url }) => handle(url));
    return () => sub.remove();
  }, []);

  useEffect(() => {
    if (result?.status !== 'ok') return;
    const t = setTimeout(() => setResult(null), OK_VISIBLE_MS);
    return () => clearTimeout(t);
  }, [result]);

  if (!result) return null;
  const entry = getLog(result.entryId);
  const text = pendingNoteText(result.entryId) ?? (entry ? formatForNotes(entry) : undefined);

  return (
    <Animated.View
      entering={FadeInUp.duration(220)}
      exiting={FadeOutUp.duration(180)}
      style={[styles.wrap, { top: insets.top + spacing.xs }]}
      pointerEvents="box-none"
    >
      <Card style={[styles.card, { borderColor: result.status === 'ok' ? colors.state.calm : colors.state.stressLow }]} accessibilityLiveRegion="polite">
        {result.status === 'ok' ? (
          <Text variant="bodyMedium">Saved to Apple Notes · {NOTES_FOLDER} ✓</Text>
        ) : (
          <>
            <Text variant="bodyMedium">Apple Notes didn’t save this note</Text>
            <Text variant="caption" tone="secondary">
              {explain(result)}
            </Text>
            <View style={styles.actions}>
              {entry && <Button label="Try again" variant="secondary" style={styles.small} onPress={() => { setResult(null); void sendToAppleNotes(entry); }} />}
              {text && (
                <Button
                  label="Share to Notes instead"
                  variant="secondary"
                  style={styles.small}
                  onPress={async () => {
                    setResult(null);
                    await Share.share({ message: text });
                  }}
                />
              )}
              <Button label="Setup" variant="ghost" style={styles.small} onPress={() => { setResult(null); void Linking.openURL(Linking.createURL('profile')); }} />
              <Button label="Dismiss" variant="ghost" style={styles.small} onPress={() => setResult(null)} />
            </View>
          </>
        )}
      </Card>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: screenPadding,
    right: screenPadding,
    zIndex: 100,
  },
  card: {
    gap: spacing.xs,
    borderWidth: 1.5,
    borderRadius: radii.card,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginTop: spacing.xxs,
  },
  small: {
    minHeight: 34,
    paddingHorizontal: spacing.sm,
  },
});
