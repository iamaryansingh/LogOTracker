import {
  BottomSheetBackdrop,
  BottomSheetModal,
  BottomSheetView,
  type BottomSheetBackdropProps,
} from '@gorhom/bottom-sheet';
import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { createMoodCapture } from '../../domain/events';
import type { MoodLevel } from '../../domain/types';
import { useAppStore } from '../../state/AppStore';
import { radii, screenPadding, spacing, useTheme, withAlpha, type StateToken } from '../../theme';
import { haptics } from '../../utils/haptics';
import { PressableScale, Text } from '../primitives';
import { LogActivityForm, type LogTarget } from './LogActivitySheet';
import { NoteForm } from './NoteSheet';

const MOODS: { mood: MoodLevel; token: StateToken }[] = [
  { mood: 'Good', token: 'calm' },
  { mood: 'Okay', token: 'focus' },
  { mood: 'Neutral', token: 'neutral' },
  { mood: 'Stressed', token: 'stressLow' },
  { mood: 'Overwhelmed', token: 'stressHigh' },
];

interface CaptureApi {
  openCheckIn: () => void;
  openLog: (target?: LogTarget) => void;
  /** Standalone note or reminder, placed on `day` (defaults to today). */
  openNote: (day?: string) => void;
}

const CaptureContext = createContext<CaptureApi>({ openCheckIn: () => {}, openLog: () => {}, openNote: () => {} });

/** Opens the mood check-in or the activity log sheet from anywhere in the app. */
export const useCapture = () => useContext(CaptureContext);

function useSheetChrome() {
  const { colors } = useTheme();
  const renderBackdrop = useCallback(
    (props: BottomSheetBackdropProps) => (
      <BottomSheetBackdrop {...props} appearsOnIndex={0} disappearsOnIndex={-1} opacity={0.35} />
    ),
    [],
  );
  const backgroundStyle = useMemo(() => ({ backgroundColor: colors.bgCard, borderRadius: radii.sheet }), [colors.bgCard]);
  const handleIndicatorStyle = useMemo(() => ({ backgroundColor: colors.borderSubtle, width: 40 }), [colors.borderSubtle]);
  return { backdropComponent: renderBackdrop, backgroundStyle, handleIndicatorStyle };
}

/** Hosts the app-wide capture sheets. Must sit inside BottomSheetModalProvider. */
export function CaptureProvider({ children }: { children: ReactNode }) {
  const checkInRef = useRef<BottomSheetModal>(null);
  const logRef = useRef<BottomSheetModal>(null);
  const noteRef = useRef<BottomSheetModal>(null);
  const [note, setNote] = useState<{ key: number; day?: string }>({ key: 0 });
  // A fresh key per open resets the form to the new target's values.
  const [log, setLog] = useState<{ key: number; target: LogTarget }>({ key: 0, target: {} });
  const chrome = useSheetChrome();

  const api = useMemo<CaptureApi>(
    () => ({
      openCheckIn: () => checkInRef.current?.present(),
      openLog: (target = {}) => {
        setLog((l) => ({ key: l.key + 1, target }));
        logRef.current?.present();
      },
      openNote: (day) => {
        setNote((n) => ({ key: n.key + 1, day }));
        noteRef.current?.present();
      },
    }),
    [],
  );

  return (
    <CaptureContext.Provider value={api}>
      {children}
      <QuickCaptureBottomSheet ref={checkInRef} />
      <BottomSheetModal
        ref={logRef}
        snapPoints={['92%']}
        enableDynamicSizing={false}
        keyboardBehavior="interactive"
        keyboardBlurBehavior="restore"
        {...chrome}
      >
        <LogActivityForm key={log.key} target={log.target} onDone={() => logRef.current?.dismiss()} />
      </BottomSheetModal>
      <BottomSheetModal
        ref={noteRef}
        snapPoints={['75%']}
        enableDynamicSizing={false}
        keyboardBehavior="interactive"
        keyboardBlurBehavior="restore"
        {...chrome}
      >
        <NoteForm key={note.key} day={note.day} onDone={() => noteRef.current?.dismiss()} />
      </BottomSheetModal>
    </CaptureContext.Provider>
  );
}

// One tap records the mood and closes the sheet, keeping the whole interaction under five seconds.
export function QuickCaptureBottomSheet({ ref }: { ref: React.RefObject<BottomSheetModal | null> }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { saveLog } = useAppStore();
  const chrome = useSheetChrome();

  const onPick = (mood: MoodLevel) => {
    saveLog(createMoodCapture(mood));
    haptics.success();
    ref.current?.dismiss();
  };

  return (
    <BottomSheetModal ref={ref} enableDynamicSizing {...chrome}>
      <BottomSheetView style={[styles.content, { paddingBottom: insets.bottom + spacing.lg }]}>
        <View style={styles.heading}>
          <Text variant="sectionTitle">How are you feeling?</Text>
          <Text variant="caption" tone="secondary">
            One tap is enough. It’s added to your timeline.
          </Text>
        </View>
        <View style={styles.moods}>
          {MOODS.map(({ mood, token }) => {
            const color = colors.state[token];
            return (
              <PressableScale
                key={mood}
                pressedScale={0.94}
                onPress={() => onPick(mood)}
                accessibilityLabel={`Feeling ${mood.toLowerCase()}`}
                style={[styles.mood, { backgroundColor: withAlpha(color, 0.1), borderColor: withAlpha(color, 0.25) }]}
              >
                <View style={[styles.dot, { backgroundColor: color }]} />
                <Text variant="caption" numberOfLines={1} adjustsFontSizeToFit>
                  {mood}
                </Text>
              </PressableScale>
            );
          })}
        </View>
      </BottomSheetView>
    </BottomSheetModal>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: screenPadding,
    paddingTop: spacing.xs,
    gap: spacing.lg,
  },
  heading: {
    gap: spacing.xxs,
  },
  moods: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  mood: {
    flex: 1,
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xxs,
    borderRadius: radii.card - 4,
    borderWidth: 1,
  },
  dot: {
    width: 14,
    height: 14,
    borderRadius: 7,
  },
});
