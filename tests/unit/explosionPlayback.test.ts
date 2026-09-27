import { describe, expect, it } from 'vitest';
import { planExplosionBursts, MAX_EXPLOSION_BURSTS } from '@render/explosionPlayback';
const cells = Array.from({ length: 64 }, (_, i) => ({ row: Math.floor(i / 8), col: i % 8 }));
describe('bounded dense explosion strips', () => {
  it.each([0, 1, 3, 8, 24, 64])('caps %i cells but assigns every cell to a burst', count => {
    const result = planExplosionBursts(cells.slice(0, count));
    expect(result).toHaveLength(Math.min(count, MAX_EXPLOSION_BURSTS));
    expect(result.flatMap(group => group.cells)).toHaveLength(count);
    expect(new Set(result.flatMap(group => group.cells).map(pos => `${pos.row}:${pos.col}`)).size).toBe(count);
    expect(result.every(group => group.cells.length > 0 && group.scale <= 1.35)).toBe(true);
  });
  it('deduplicates repeated cells without mutating the input', () => {
    const input = [...cells, ...cells];
    expect(planExplosionBursts(input).flatMap(group => group.cells)).toHaveLength(64);
    expect(input).toHaveLength(128);
  });
  it('covers disconnected regions rather than the first eight cells only', () => {
    const result = planExplosionBursts(cells, 4);
    expect(result.map(group => group.pos)).toContainEqual({ row: 7, col: 7 });
    expect(result.map(group => group.pos)).toContainEqual({ row: 0, col: 0 });
  });
  it('is deterministic and handles a disabled budget', () => {
    expect(planExplosionBursts(cells)).toEqual(planExplosionBursts(cells));
    expect(planExplosionBursts(cells, 0)).toEqual([]);
  });
});
