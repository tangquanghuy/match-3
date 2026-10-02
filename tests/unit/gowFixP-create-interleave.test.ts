// sa-P fix round A: P-create-interleave (lane-L1 L1-6160).
// Root cause: every gem segment called ctx.resolveBoardChange at once, so a create/transform settled the board
// (gravity + cascades) before the next native step. Now pure board rewrites (nothing removed) defer the settle to the
// end of the spell; removals (destroy / explode) still settle immediately.
import { describe, it, expect } from 'vitest';
import { BaseColor, colorGem } from '@engine/types';
import type { GameEvent } from '@engine/events';
import { castSpell } from '../helpers/gowCast';
import { MatchResolver } from '@engine/MatchResolver';

const findMatches = (b: Parameters<MatchResolver['findMatches']>[0]) => new MatchResolver().findMatches(b);

const cols = [BaseColor.Blue, BaseColor.Yellow, BaseColor.Purple, BaseColor.Brown];
const board = (r: number, c: number) => colorGem(cols[(r + c) % 4]);
const createdColors = (ev: GameEvent[]) => ev.flatMap((e) => e.type === 'gem-transform' ? e.changes.map((c) => c.to)
  : e.type === 'gem-create' ? e.spawns.map((s) => s.gemType) : []);
const firstElim = (ev: GameEvent[]) => { const i = ev.findIndex((e) => e.type === 'elimination'); return i < 0 ? ev.length : i; };

describe('P-create-interleave: troop:6160 spell 7280 (Consume, CreateGems 8 Yellow, CreateGems 8 Brown)', () => {
  for (const seed of [1, 7, 42, 99]) {
    it(`seed ${seed}: both creations precede the first elimination; the board is settled when the spell ends`, () => {
      const r = castSpell({ skill: '7280', cost: 24, seed, board, target: 11 });
      const pre = r.events.slice(0, firstElim(r.events));
      const made = createdColors(pre).filter((t) => t.kind === 'color');
      expect(made.filter((t) => t.kind === 'color' && t.color === BaseColor.Yellow)).toHaveLength(8);
      expect(made.filter((t) => t.kind === 'color' && t.color === BaseColor.Brown)).toHaveLength(8);
      const placements = pre.flatMap(e => e.type === 'gem-transform' ? e.changes.map(c => c.pos)
        : e.type === 'gem-create' ? e.spawns.map(s => s.pos) : []);
      expect(new Set(placements.map(pos => `${pos.row}:${pos.col}`)).size).toBe(16);
      expect(findMatches(r.f.state.board)).toHaveLength(0);
    });
  }
});

describe('P-create-interleave: removals still settle mid-spell', () => {
  it('troop:6923 spell 8390 (DestroyGems X pattern, then Enchant): gravity/refill follow the destroy before the status', () => {
    const r = castSpell({ key: 'troop:6923', board });
    const types = r.events.map((e) => e.type);
    const destroy = types.indexOf('gem-destroy');
    expect(destroy).toBeGreaterThanOrEqual(0);
    expect(types.indexOf('gravity')).toBeGreaterThan(destroy);
    expect(types.indexOf('gravity')).toBeLessThan(types.indexOf('status-apply'));
  });
});
