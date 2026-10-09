import { useState } from 'react';
import { Image, Modal, Pressable, StyleSheet, TextInput, View, type LayoutChangeEvent } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { dateStampFont, spacing, typography, useTheme, withAlpha } from '../../theme';
import { PressableScale, Text } from '../primitives';

/** Same photo, same tilt, every time. */
function tiltFor(seed: string, max = 4): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  return ((Math.abs(h) % 1000) / 1000) * 2 * max - max;
}

/** "'26 10 04", the way a disposable camera stamps the photo. */
const stamp = (t: number) => {
  const d = new Date(t);
  const two = (n: number) => String(n).padStart(2, '0');
  return `'${two(d.getFullYear() % 100)} ${two(d.getMonth() + 1)} ${two(d.getDate())}`;
};

/** A round push pin with a highlight, sitting on the top edge of a print. */
export function PushPin({ color, size = 18 }: { color: string; size?: number }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.pinWrap, { top: -size / 2, marginLeft: -size / 2, width: size, height: size }]} pointerEvents="none">
      <View style={[styles.pinShadow, { width: size, height: size, borderRadius: size / 2, backgroundColor: withAlpha(colors.memory.polaroidInk, 0.25) }]} />
      <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: color }}>
        <View style={[styles.pinShine, { width: size * 0.32, height: size * 0.32, borderRadius: size, backgroundColor: withAlpha(colors.memory.polaroidPaper, 0.75) }]} />
      </View>
    </View>
  );
}

export interface PolaroidProps {
  uri: string;
  width: number;
  /** Handwritten line under the photo. */
  caption?: string;
  /** Shown faintly when there's no caption yet (editable prints only). */
  placeholder?: string;
  /** Makes the caption writable; called when you finish writing. */
  onCaptionChange?: (text: string) => void;
  /** When the photo was taken (epoch ms), for the orange date stamp. */
  takenAt?: number;
  pinColor?: string;
  onPress?: () => void;
}

/** An instant-camera print: white paper frame, the photo, a date stamp, and a handwritten caption. */
export function Polaroid({ uri, width, caption, placeholder, onCaptionChange, takenAt, pinColor, onPress }: PolaroidProps) {
  const { colors } = useTheme();
  const [draft, setDraft] = useState(caption ?? '');
  const pad = Math.max(6, width * 0.06);
  const photo = width - pad * 2;
  const small = width < 120;

  return (
    <View
      style={[
        styles.print,
        { width, padding: pad, paddingBottom: small ? pad * 2.2 : pad, backgroundColor: colors.memory.polaroidPaper, shadowColor: colors.memory.polaroidInk, transform: [{ rotate: `${tiltFor(uri)}deg` }] },
      ]}
    >
      <PressableScale onPress={onPress} disabled={!onPress} pressedScale={0.98} accessibilityLabel={caption ? `Photo: ${caption}` : 'Photo'}>
        <Image source={{ uri }} style={{ width: photo, height: photo, backgroundColor: withAlpha(colors.memory.polaroidInk, 0.08) }} resizeMode="cover" />
        {takenAt && !small ? <Text style={[dateStampFont, styles.stamp, { color: colors.memory.dateStamp, textShadowColor: withAlpha(colors.memory.dateStamp, 0.6) }]}>{stamp(takenAt)}</Text> : null}
      </PressableScale>
      {!small &&
        (onCaptionChange ? (
          <TextInput
            value={draft}
            onChangeText={setDraft}
            onEndEditing={() => draft !== (caption ?? '') && onCaptionChange(draft.trim())}
            placeholder={placeholder ?? 'write something…'}
            placeholderTextColor={withAlpha(colors.memory.polaroidInk, 0.35)}
            multiline
            maxLength={70}
            blurOnSubmit
            returnKeyType="done"
            style={[typography.hand, styles.caption, { color: colors.memory.polaroidInk }]}
            accessibilityLabel="Caption for this photo"
          />
        ) : caption ? (
          <Text style={[typography.hand, styles.caption, { color: colors.memory.polaroidInk }]} numberOfLines={2}>
            {caption}
          </Text>
        ) : (
          <View style={styles.blank} />
        ))}
      {pinColor && <PushPin color={pinColor} size={small ? 12 : 18} />}
    </View>
  );
}

export interface BoardPhoto {
  uri: string;
  caption?: string;
  placeholder?: string;
  takenAt?: number;
}

/**
 * Prints pinned to a board in two staggered columns (one big print when there's a single photo).
 * Tap a print to see it full size; with `onCaption`, write under each one.
 */
export function PolaroidBoard({ photos, onCaption, max = 12 }: { photos: BoardPhoto[]; onCaption?: (uri: string, text: string) => void; max?: number }) {
  const { colors } = useTheme();
  const [width, setWidth] = useState(0);
  const [open, setOpen] = useState<BoardPhoto | null>(null);
  const shown = photos.slice(0, max);
  if (!shown.length) return null;

  const onLayout = (e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width);
  const inner = width - spacing.md * 2;
  const single = shown.length === 1;
  const printW = single ? inner * 0.78 : (inner - spacing.md) / 2;
  const columns = single ? [shown] : [shown.filter((_, i) => i % 2 === 0), shown.filter((_, i) => i % 2 === 1)];

  return (
    <View onLayout={onLayout} style={[styles.board, { backgroundColor: colors.memory.board }]}>
      {width > 0 && (
        <View style={[styles.columns, single && styles.center]}>
          {columns.map((col, c) => (
            <View key={c} style={[styles.column, c === 1 && styles.offset]}>
              {col.map((p) => (
                <Polaroid
                  key={p.uri}
                  uri={p.uri}
                  width={printW}
                  caption={p.caption}
                  placeholder={p.placeholder}
                  takenAt={p.takenAt}
                  pinColor={colors.memory.pins[shown.indexOf(p) % colors.memory.pins.length]}
                  onCaptionChange={onCaption ? (t) => onCaption(p.uri, t) : undefined}
                  onPress={() => setOpen(p)}
                />
              ))}
            </View>
          ))}
        </View>
      )}
      {photos.length > max && (
        <Text style={[typography.hand, styles.more, { color: colors.memory.polaroidInk }]}>+ {photos.length - max} more</Text>
      )}
      <PhotoViewer photo={open} onClose={() => setOpen(null)} />
    </View>
  );
}

/** Full-size photo with its caption; tap anywhere to close. */
function PhotoViewer({ photo, onClose }: { photo: BoardPhoto | null; onClose: () => void }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={!!photo} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={[styles.viewer, { backgroundColor: withAlpha(colors.memory.polaroidInk, 0.94), paddingTop: insets.top, paddingBottom: insets.bottom + spacing.lg }]} onPress={onClose} accessibilityLabel="Close photo">
        {photo && <Image source={{ uri: photo.uri }} style={styles.full} resizeMode="contain" />}
        {photo?.caption ? <Text style={[typography.handTitle, { color: colors.memory.polaroidPaper, textAlign: 'center' }]}>{photo.caption}</Text> : null}
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  print: {
    borderRadius: 3,
    shadowOpacity: 0.18,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  stamp: {
    position: 'absolute',
    right: 6,
    bottom: 5,
    textShadowRadius: 4,
  },
  caption: {
    textAlign: 'center',
    paddingTop: spacing.xs,
    paddingBottom: 2,
    minHeight: 34,
  },
  blank: {
    height: 30,
  },
  pinWrap: {
    position: 'absolute',
    left: '50%',
  },
  pinShadow: {
    position: 'absolute',
    left: 2,
    top: 3,
  },
  pinShine: {
    position: 'absolute',
    left: '22%',
    top: '18%',
  },
  board: {
    borderRadius: 16,
    padding: spacing.md,
    paddingTop: spacing.lg,
  },
  columns: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  center: {
    justifyContent: 'center',
  },
  column: {
    gap: spacing.lg,
  },
  offset: {
    marginTop: spacing.xl,
  },
  more: {
    textAlign: 'center',
    marginTop: spacing.sm,
  },
  viewer: {
    flex: 1,
    justifyContent: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.md,
  },
  full: {
    width: '100%',
    flex: 1,
  },
});
