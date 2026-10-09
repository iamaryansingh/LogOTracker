import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { canTie, rowKey, tie, untie, WIDGETS, type Layout, type WidgetId } from '../../domain/dashboard';
import { radii, spacing, useTheme, withAlpha } from '../../theme';
import { haptics } from '../../utils/haptics';
import { Button, PressableScale, Text } from '../primitives';

const TILE_H = 68;
const GAP = 12;
const SLOT = TILE_H + GAP;
const spring = { damping: 20, stiffness: 260 };

type Positions = Record<string, number>;

interface TileProps {
  row: WidgetId[];
  id: string;
  count: number;
  positions: SharedValue<Positions>;
  onDragState: (dragging: boolean) => void;
  onDrop: () => void;
  onUntie: () => void;
}

function Tile({ row, id, count, positions, onDragState, onDrop, onUntie }: TileProps) {
  const { colors } = useTheme();
  const reduceMotion = useReducedMotion();
  const active = useSharedValue(false);
  const y = useSharedValue(0);
  const wiggle = useSharedValue(0);
  const tied = row.length === 2;

  // iOS-style jiggle while arranging, slightly out of phase per tile.
  useEffect(() => {
    if (reduceMotion) return;
    const delay = (id.length * 37) % 120;
    const t = setTimeout(() => {
      wiggle.set(withRepeat(withSequence(withTiming(-1, { duration: 130 }), withTiming(1, { duration: 130 })), -1, true));
    }, delay);
    return () => {
      clearTimeout(t);
      cancelAnimation(wiggle);
    };
  }, [id, reduceMotion, wiggle]);

  const origin = useSharedValue(0);

  const pan = Gesture.Pan()
    .activateAfterLongPress(180)
    .onStart(() => {
      active.set(true);
      origin.set((positions.get()[id] ?? 0) * SLOT);
      y.set(origin.get());
      scheduleOnRN(onDragState, true);
      scheduleOnRN(haptics.light);
    })
    .onUpdate((e) => {
      // Follow the finger from where the drag began; swapping slots never moves the tile under it.
      const nextY = origin.get() + e.translationY;
      y.set(nextY);
      const from = positions.get()[id] ?? 0;
      const to = Math.max(0, Math.min(count - 1, Math.round(nextY / SLOT)));
      if (to !== from) {
        const p = { ...positions.get() };
        const other = Object.keys(p).find((k) => p[k] === to);
        if (other) p[other] = from;
        p[id] = to;
        positions.set(p);
        scheduleOnRN(haptics.selection);
      }
    })
    .onEnd(() => {
      y.set(withSpring((positions.get()[id] ?? 0) * SLOT, spring));
    })
    .onFinalize(() => {
      active.set(false);
      scheduleOnRN(onDragState, false);
      scheduleOnRN(onDrop);
    });

  const style = useAnimatedStyle(() => {
    const slot = (positions.get()[id] ?? 0) * SLOT;
    return {
      top: active.get() ? y.get() : withSpring(slot, spring),
      zIndex: active.get() ? 10 : 1,
      transform: [{ scale: withSpring(active.get() ? 1.04 : 1, spring) }, { rotateZ: `${active.get() ? 0 : wiggle.get() * 0.7}deg` }],
      shadowOpacity: withTiming(active.get() ? 0.18 : 0),
    };
  });

  return (
    <GestureDetector gesture={pan}>
      <Animated.View style={[styles.tile, { backgroundColor: colors.bgCard, borderColor: tied ? withAlpha(colors.state.focus, 0.5) : colors.borderSubtle }, style]}>
        <Text tone="secondary" style={styles.grip}>
          ≡
        </Text>
        <View style={styles.tileBody}>
          <View style={styles.titles}>
            {row.map((w, i) => (
              <View key={w} style={styles.titlePart}>
                {i === 1 && (
                  <PressableScale haptic hitSlop={8} onPress={onUntie} accessibilityLabel={`Untie ${WIDGETS[row[0]].title} and ${WIDGETS[w].title}`}>
                    <Text variant="caption" style={{ color: colors.state.focus }}>
                      🔗
                    </Text>
                  </PressableScale>
                )}
                <Text variant="bodyMedium" numberOfLines={1} style={styles.shrink}>
                  {WIDGETS[w].icon} {WIDGETS[w].title}
                </Text>
              </View>
            ))}
          </View>
          <Text variant="caption" tone="secondary">
            {tied ? 'Tied together · moves as one · tap 🔗 to untie' : WIDGETS[row[0]].half ? 'Half width · can be tied' : 'Full width'}
          </Text>
        </View>
      </Animated.View>
    </GestureDetector>
  );
}

export interface ArrangeDashboardProps {
  layout: Layout;
  onChange: (layout: Layout) => void;
  onDone: () => void;
  onReset: () => void;
}

/** Arrange mode: press and drag tiles to reorder. Tied cards share a tile, so they can't be pulled apart by dragging. */
export function ArrangeDashboard({ layout, onChange, onDone, onReset }: ArrangeDashboardProps) {
  const { colors } = useTheme();
  const keys = layout.map(rowKey);
  const signature = keys.join('|');
  const positions = useSharedValue<Positions>(Object.fromEntries(keys.map((k, i) => [k, i])));
  const [dragging, setDragging] = useState(false);

  // Re-seed slots whenever rows change (after a drop, tie or untie).
  useEffect(() => {
    positions.set(Object.fromEntries(signature.split('|').map((k, i) => [k, i])));
  }, [signature, positions]);

  const commit = () => {
    const p = positions.get();
    const ordered = [...layout].sort((a, b) => (p[rowKey(a)] ?? 0) - (p[rowKey(b)] ?? 0));
    if (ordered.map(rowKey).join('|') !== signature) onChange(ordered);
  };

  return (
    <View style={styles.wrap}>
      <View style={styles.bar}>
        <View style={styles.flex}>
          <Text variant="sectionTitle">Arrange Today</Text>
          <Text variant="caption" tone="secondary">
            Press and drag to move. Tied cards move together.
          </Text>
        </View>
        <Button label="Done" style={styles.done} onPress={onDone} />
      </View>

      <View style={{ height: keys.length * SLOT }}>
        {layout.map((row, i) => (
          <Tile
            key={rowKey(row)}
            id={rowKey(row)}
            row={row}
            count={keys.length}
            positions={positions}
            onDragState={setDragging}
            onDrop={commit}
            onUntie={() => onChange(untie(layout, i))}
          />
        ))}
        {!dragging &&
          layout.map((_, i) =>
            canTie(layout, i) ? (
              <PressableScale
                key={`tie-${i}`}
                haptic
                onPress={() => onChange(tie(layout, i))}
                accessibilityLabel={`Tie ${WIDGETS[layout[i][0]].title} with ${WIDGETS[layout[i + 1][0]].title}`}
                style={[styles.tieButton, { top: (i + 1) * SLOT - GAP / 2 - 13, backgroundColor: colors.bgSurface, borderColor: colors.borderSubtle }]}
              >
                <Text variant="caption" style={{ color: colors.state.focus }}>
                  🔗 Tie together
                </Text>
              </PressableScale>
            ) : null,
          )}
      </View>

      <Button label="Reset to default layout" variant="ghost" onPress={onReset} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: spacing.md,
  },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  flex: {
    flex: 1,
  },
  done: {
    minHeight: 38,
    paddingHorizontal: spacing.lg,
  },
  tile: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: TILE_H,
    borderRadius: radii.card - 4,
    borderWidth: 1.5,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.sm,
    gap: spacing.sm,
    shadowColor: '#000',
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
  },
  grip: {
    fontSize: 20,
    width: 18,
    textAlign: 'center',
  },
  tileBody: {
    flex: 1,
    gap: 2,
  },
  titles: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  titlePart: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    flexShrink: 1,
  },
  shrink: {
    flexShrink: 1,
  },
  tieButton: {
    position: 'absolute',
    alignSelf: 'center',
    height: 26,
    paddingHorizontal: spacing.sm,
    borderRadius: radii.pill,
    borderWidth: 1,
    justifyContent: 'center',
    zIndex: 5,
  },
});
