import { Path } from '@shopify/react-native-skia';
import { useMemo } from 'react';
import { View } from 'react-native';
import { Gesture, GestureDetector, PointerType } from 'react-native-gesture-handler';
import { useDerivedValue, useSharedValue } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import type { InkStroke, InkTone } from '../../domain/types';
import { useTheme } from '../../theme';
import { INK_WIDTHS, inkColor, strokePath, type InkWidth } from './ink';
import { InkPage } from './InkPage';

export type InkTool = { mode: 'pen'; tone: InkTone; width: InkWidth } | { mode: 'eraser' };

export interface InkCanvasProps {
  /** Page index, passed back to the callbacks so they can stay stable across renders. */
  page: number;
  strokes: InkStroke[];
  width: number;
  tool: InkTool;
  /** Ignore finger touches so a resting palm doesn't draw; fingers scroll instead. */
  pencilOnly: boolean;
  onAddStroke: (page: number, stroke: InkStroke) => void;
  onErase: (page: number, x: number, y: number) => void;
  /** Lets the parent pause scrolling while a stroke is in progress. */
  onDrawingChange?: (drawing: boolean) => void;
}

/** Skip points closer than this (fraction of page width) to keep strokes light. */
const MIN_STEP = 0.0015;

const newStrokeId = () => `s-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

export function InkCanvas({ page, strokes, width, tool, pencilOnly, onAddStroke, onErase, onDrawingChange }: InkCanvasProps) {
  const { colors } = useTheme();
  const current = useSharedValue<number[]>([]);
  const livePath = useDerivedValue(() => strokePath(current.get(), width));

  const gesture = useMemo(() => {
    const commit = (points: number[]) => {
      if (tool.mode !== 'pen' || points.length === 0) return;
      onAddStroke(page, { id: newStrokeId(), points, width: INK_WIDTHS[tool.width], tone: tool.tone });
    };
    const erasing = tool.mode === 'eraser';
    const setDrawing = (d: boolean) => onDrawingChange?.(d);

    return Gesture.Pan()
      .minDistance(0)
      .maxPointers(1)
      .manualActivation(true)
      .onTouchesDown((e, manager) => {
        if (pencilOnly && e.pointerType !== PointerType.STYLUS) manager.fail();
        else manager.activate();
      })
      .onStart((e) => {
        scheduleOnRN(setDrawing, true);
        if (erasing) scheduleOnRN(onErase, page, e.x / width, e.y / width);
        else current.set([e.x / width, e.y / width]);
      })
      .onUpdate((e) => {
        const x = e.x / width;
        const y = e.y / width;
        if (erasing) {
          scheduleOnRN(onErase, page, x, y);
          return;
        }
        current.modify((pts) => {
          'worklet';
          const lx = pts[pts.length - 2];
          const ly = pts[pts.length - 1];
          if (pts.length === 0 || Math.abs(x - lx) + Math.abs(y - ly) >= MIN_STEP) pts.push(x, y);
          return pts;
        });
      })
      .onFinalize(() => {
        scheduleOnRN(setDrawing, false);
        const pts = current.get();
        if (!erasing && pts.length > 0) {
          scheduleOnRN(commit, pts.slice());
          current.set([]);
        }
      });
  }, [page, tool, pencilOnly, width, onAddStroke, onErase, onDrawingChange, current]);

  const liveColor = tool.mode === 'pen' ? inkColor(tool.tone, colors) : 'transparent';
  const liveWidth = tool.mode === 'pen' ? INK_WIDTHS[tool.width] * width : 0;

  return (
    <GestureDetector gesture={gesture}>
      <View collapsable={false} accessibilityLabel="Handwriting page" accessibilityHint={pencilOnly ? 'Write with Apple Pencil' : 'Write with your finger or Apple Pencil'}>
        <InkPage strokes={strokes} width={width}>
          <Path path={livePath} color={liveColor} style="stroke" strokeWidth={liveWidth} strokeCap="round" strokeJoin="round" />
        </InkPage>
      </View>
    </GestureDetector>
  );
}
