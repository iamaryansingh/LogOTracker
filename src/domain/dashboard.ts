/**
 * Today's dashboard layout: an ordered list of rows. A row holds one card (full width) or two
 * half-width cards that are *tied* together; tied cards always move as one unit.
 */

export type WidgetId = 'ratings' | 'insight' | 'todaySoFar' | 'energyBalance' | 'whatShaped';

export const WIDGETS: Record<WidgetId, { title: string; icon: string; /** Can sit half-width, tied beside another card. */ half: boolean }> = {
  ratings: { title: 'Energy & focus', icon: '⚡︎', half: true },
  insight: { title: 'Insight', icon: '💡', half: true },
  // Full width: it also carries the WHOOP & Health summary.
  todaySoFar: { title: 'Today so far', icon: '⏱', half: false },
  energyBalance: { title: 'Energy balance', icon: '⚖︎', half: false },
  whatShaped: { title: 'What shaped your day', icon: '🧭', half: false },
};

export type Layout = WidgetId[][];

export const DEFAULT_LAYOUT: Layout = [['ratings', 'insight'], ['todaySoFar'], ['energyBalance'], ['whatShaped']];

const ALL = Object.keys(WIDGETS) as WidgetId[];

/** Repairs any stored layout: every card exactly once, pairs only of half-width cards, new cards appended. */
export function normalizeLayout(layout: Layout | undefined): Layout {
  if (!layout?.length) return DEFAULT_LAYOUT.map((r) => [...r]);
  const seen = new Set<WidgetId>();
  const out: Layout = [];
  for (const row of layout) {
    const ids = row.filter((id): id is WidgetId => id in WIDGETS && !seen.has(id));
    ids.forEach((id) => seen.add(id));
    if (ids.length === 2 && ids.every((id) => WIDGETS[id].half)) out.push(ids);
    else ids.forEach((id) => out.push([id]));
  }
  for (const id of ALL) if (!seen.has(id)) out.push([id]);
  return out;
}

/** Moves a whole row (with any tied card) from one position to another. */
export function moveRow(layout: Layout, from: number, to: number): Layout {
  const next = layout.map((r) => [...r]);
  const [row] = next.splice(from, 1);
  next.splice(Math.max(0, Math.min(to, next.length)), 0, row);
  return next;
}

/** Splits a tied pair into two rows, each now free to move on its own. */
export function untie(layout: Layout, rowIndex: number): Layout {
  const row = layout[rowIndex];
  if (row?.length !== 2) return layout;
  return [...layout.slice(0, rowIndex), [row[0]], [row[1]], ...layout.slice(rowIndex + 1)];
}

/** True when this row and the next are single half-width cards that could be tied together. */
export const canTie = (layout: Layout, rowIndex: number) =>
  layout[rowIndex]?.length === 1 && layout[rowIndex + 1]?.length === 1 && WIDGETS[layout[rowIndex][0]].half && WIDGETS[layout[rowIndex + 1][0]].half;

/** Ties a row with the one below it, side by side. */
export function tie(layout: Layout, rowIndex: number): Layout {
  if (!canTie(layout, rowIndex)) return layout;
  return [...layout.slice(0, rowIndex), [layout[rowIndex][0], layout[rowIndex + 1][0]], ...layout.slice(rowIndex + 2)];
}

export const rowKey = (row: WidgetId[]) => row.join('+');
