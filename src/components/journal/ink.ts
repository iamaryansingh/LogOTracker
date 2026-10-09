import { Skia, type SkPath } from '@shopify/react-native-skia';

import type { InkTone } from '../../domain/types';
import type { Theme } from '../../theme';

/** Page proportions (height / width), close to a notebook page. */
export const PAGE_ASPECT = 4 / 3;

export const INK_WIDTHS = { fine: 0.0035, medium: 0.006, bold: 0.011 } as const;
export type InkWidth = keyof typeof INK_WIDTHS;

export const INK_TONES: InkTone[] = ['ink', 'blue', 'sage', 'rust'];

export function inkColor(tone: InkTone, colors: Theme['colors']): string {
  switch (tone) {
    case 'ink':
      return colors.textPrimary;
    case 'blue':
      return colors.state.focus;
    case 'sage':
      return colors.state.calm;
    case 'rust':
      return colors.state.stressHigh;
  }
}

/**
 * Smooth path through normalized points, scaled to `scale` px per page width.
 * Uses midpoint quadratic curves so fast pencil strokes don't look jagged. Runs on either thread.
 */
export function strokePath(points: number[], scale: number): SkPath {
  'worklet';
  const b = Skia.PathBuilder.Make();
  const n = points.length / 2;
  if (n === 0) return b.detach();
  b.moveTo(points[0] * scale, points[1] * scale);
  if (n === 1) {
    // A tap: a zero-length line with round caps draws a dot.
    b.lineTo(points[0] * scale + 0.01, points[1] * scale);
    return b.detach();
  }
  for (let i = 1; i < n - 1; i++) {
    const x = points[i * 2] * scale;
    const y = points[i * 2 + 1] * scale;
    const nx = points[(i + 1) * 2] * scale;
    const ny = points[(i + 1) * 2 + 1] * scale;
    b.quadTo(x, y, (x + nx) / 2, (y + ny) / 2);
  }
  b.lineTo(points[(n - 1) * 2] * scale, points[(n - 1) * 2 + 1] * scale);
  return b.detach();
}
