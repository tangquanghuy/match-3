/** Keep four-person portraits as upright as three-person cards, within the existing side-column budget. */
export function battleCardDimensions(slots: 3 | 4, boardPx: number, gap = 10): { width: number; height: number } {
  const height = Math.floor((boardPx - (slots - 1) * gap) / slots);
  const width = Math.round(Math.min(142 * boardPx / 512, height * 142 / 164));
  return { width, height };
}

/** Local card geometry, recalculated on resize/summon/departure rather than baked into the first CSS injection. */
export function battleCardOverlayMetrics(width: number, height: number): Record<string, number> {
  const scale = Math.min(width / 142, height / 164);
  return {
    'card-inset': Math.max(3, Math.round(6 * scale)),
    'trait-inset': Math.max(1, Math.round(2 * scale)),
    'trait-size': Math.max(9, Math.round(14 * scale)),
    'trait-gap': Math.max(1, Math.round(2 * scale)),
    'stat-font': Math.max(11, Math.round(17 * scale)),
    'stat-icon': Math.max(7, Math.round(12 * scale)),
    'stat-gap': Math.max(1, Math.round(2 * scale)),
    'status-bottom': Math.max(21, Math.round(32 * scale)),
  };
}
