// sa-P round 5: R013-5. "Remove / Destroy all Gems" clears every gem, Skulls and every skull variant included
// (troop:7287 spell 8861, troop:6067 spell 7137: native RemoveGems 100); colour-based Skull removal
// (troop:6052 spell 7052: native RemoveColor Skull) also clears Doom / Uber Doom Skulls. Remove still follows R010.
import { describe, it, expect } from 'vitest';
import { castSpell, reviewBoard, withCells } from '../helpers/gowCast';
import { specialGem, skullGem, type GemType } from '@engine/types';
import type { GameEvent } from '@engine/events';

const DOOM = specialGem('doomSkull'), UBER = specialGem('uberDoomSkull'), BOMB = specialGem('bomb');
const board = withCells(reviewBoard, { '2,2': DOOM, '5,5': UBER, '6,1': BOMB });
const skillPhase = (ev: GameEvent[]) => { const i = ev.findIndex((e) => e.type === 'elimination'); return i < 0 ? ev : ev.slice(0, i); };
/** Cells of the first (spell's own) gem-destroy event. */
function firstClear(ev: GameEvent[]) {
  const e = skillPhase(ev).find((x) => x.type === 'gem-destroy') as Extract<GameEvent, { type: 'gem-destroy' }> | undefined;
  expect(e).toBeDefined();
  return e!;
}
const key = (t: GemType) => (t.kind === 'special' ? t.spec.kind : t.kind);
const boardCount = (pred: (t: GemType) => boolean) => { let n = 0; for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) { const t = board(r, c); if (t && pred(t)) n++; } return n; };

describe('R013-5: all gems include Skulls and skull variants', () => {
  for (const k of ['troop:7287', 'troop:6067']) it(`${k} (native RemoveGems 100): removes all 64 gems incl. Skulls, Doom / Uber Doom Skulls and specials; R010 remove`, () => {
    const r = castSpell({ key: k, board });
    const clear = firstClear(r.events);
    expect(clear.removed).toBe(true);
    expect(clear.cells).toHaveLength(64);
    const kinds = clear.cells.map((c) => key(c.gemType));
    expect(kinds.filter((x) => x === 'skull')).toHaveLength(boardCount((t) => t.kind === 'skull'));
    expect(kinds).toEqual(expect.arrayContaining(['doomSkull', 'uberDoomSkull', 'bomb']));
    // R010: removed -> no mana, no special trigger, no skull damage from the removal itself
    const head = skillPhase(r.events).slice(0, skillPhase(r.events).findIndex((e) => e.type === 'gravity'));
    expect(head.filter((e) => e.type === 'mana-gain' || e.type === 'special-gem-trigger' || e.type === 'gem-explode' || e.type === 'skull-damage')).toEqual([]);
  });

  it('troop:6052 (native RemoveColor Skull): Doom and Uber Doom Skulls are removed with the normal Skulls, colours stay', () => {
    const r = castSpell({ key: 'troop:6052', board });
    const clear = firstClear(r.events);
    expect(clear.removed).toBe(true);
    const kinds = clear.cells.map((c) => key(c.gemType)).sort();
    const skulls = boardCount((t) => t.kind === 'skull');
    expect(kinds).toEqual([...Array(skulls).fill('skull'), 'doomSkull', 'uberDoomSkull'].sort());
    // heal counter (native CountGems Skull at step 0) already counted the variants: 2 per skull incl. doom family
    void skullGem;
  });
});
