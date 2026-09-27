import type { CellPos } from '@engine/types';

export const MAX_EXPLOSION_BURSTS = 8;
/** Keep every gem's own clearing animation, but cluster overlapping large strips.
 * Deterministic farthest-point centers spread the budget across disconnected areas. */
export function planExplosionBursts(cells: CellPos[], cap = MAX_EXPLOSION_BURSTS) {
  const unique = [...new Map(cells.map(pos => [`${pos.row}:${pos.col}`, pos])).values()];
  if (!unique.length || cap < 1) return [];
  const distance = (a: CellPos, b: CellPos) => (a.row - b.row) ** 2 + (a.col - b.col) ** 2;
  const seeds = [unique[0]];
  while (seeds.length < Math.min(Math.floor(cap), unique.length)) {
    let best: CellPos | undefined, bestDistance = -1;
    for (const pos of unique) {
      const d = Math.min(...seeds.map(seed => distance(seed, pos)));
      if (d > bestDistance) { best = pos; bestDistance = d; }
    }
    seeds.push(best!);
  }
  const groups = seeds.map(pos => ({ pos, cells: [] as CellPos[] }));
  for (const pos of unique) {
    let nearest = 0;
    for (let i = 1; i < seeds.length; i++) if (distance(pos, seeds[i]) < distance(pos, seeds[nearest])) nearest = i;
    groups[nearest].cells.push(pos);
  }
  return groups.map(group => ({ ...group, scale: Math.min(1.35, 1 + (group.cells.length - 1) * .04) }));
}
