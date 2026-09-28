// sa-P review round 2: special-gem tier / colour filters.
// P-R1-gargoyle-tier-filter (troop:7851, troop:7380), P-R2-gargoyle-tier (troop:7210), P-R4-gargoyle-tier-count (troop:7643):
//   native Good/BadGargoyle = gargoyleGem tier 1 / tier 2, counted and exploded separately.
// P-R3-dragon-gem-count (troop:7626, troop:7611, troop:7627, troop:7575, weapon:1647): native CountGems Dragon<Color>
//   = dragonGem with that base colour (R009), not every gem of the colour.
import { describe, it, expect } from 'vitest';
import { BaseColor } from '@engine/types';
import type { GemType } from '@engine/types';
import { castSpell, reviewBoard, withCells } from '../helpers/gowCast';

const garg = (tier: number): GemType => ({ kind: 'special', spec: { kind: 'gargoyleGem', tier } } as GemType);
const dragon = (color: BaseColor): GemType => ({ kind: 'special', spec: { kind: 'dragonGem', color } } as GemType);
// mutually non-adjacent cells: one explosion never reaches another gargoyle
const SPREAD = ['0,0', '0,3', '0,6', '3,0', '3,3', '3,6', '6,0', '6,3', '6,6'];
const tiersLeft = (r: ReturnType<typeof castSpell>) => {
  const n = { 1: 0, 2: 0 } as Record<number, number>;
  r.f.board.forEach((g) => { if (g && g.type.kind === 'special' && g.type.spec.kind === 'gargoyleGem') n[g.type.spec.tier ?? 1] += 1; });
  return n;
};
const dmgTo = (r: ReturnType<typeof castSpell>, who: string) => r.summary.order.filter((s) => s.startsWith(`dmg ${who} `)).map((s) => Number(s.split(' ')[2]));

describe('special-gem tier / colour filters', () => {
  it('troop:7851 Seditius 9918: explodes 3 Bad Gargoyles only', () => {
    const board = withCells(reviewBoard, Object.fromEntries(SPREAD.slice(0, 7).map((k, i) => [k, garg(i < 4 ? 2 : 1)])));
    const left = tiersLeft(castSpell({ key: 'troop:7851', board }));
    expect(left).toEqual({ 1: 3, 2: 1 });
  });
  it('troop:7380 9022: explodes 3 Good Gargoyles only', () => {
    const board = withCells(reviewBoard, Object.fromEntries(SPREAD.slice(0, 7).map((k, i) => [k, garg(i < 4 ? 1 : 2)])));
    const left = tiersLeft(castSpell({ key: 'troop:7380', board }));
    expect(left).toEqual({ 1: 1, 2: 3 });
  });
  it('troop:7210 Xenith 8797: Doomskulls boosted by Bad Gargoyles only (5 + 3 x 1)', () => {
    const board = withCells(reviewBoard, { '0,0': garg(1), '0,3': garg(2) });
    const r = castSpell({ key: 'troop:7210', board });
    expect(r.summary.gems.created.doomSkull).toBe(8);
  });
  it('troop:7643 Mudwalker 9547: Good and Bad Gargoyles floor separately ([3:1]: 2 + 2 -> +0)', () => {
    const plain = dmgTo(castSpell({ key: 'troop:7643' }), 'E11');
    const board = withCells(reviewBoard, { '0,0': garg(1), '0,3': garg(1), '0,6': garg(2), '3,0': garg(2) });
    expect(dmgTo(castSpell({ key: 'troop:7643', board }), 'E11')).toEqual(plain);
    const three = withCells(reviewBoard, { '0,0': garg(1), '0,3': garg(1), '0,6': garg(1) });
    expect(dmgTo(castSpell({ key: 'troop:7643', board: three }), 'E11')[0]).toBe(plain[0] + 1);
  });
  it('troop:7626 Dragonlord Luther 9527: boosted by Blue Dragon gems, not by plain Blue gems', () => {
    const plain = dmgTo(castSpell({ key: 'troop:7626' }), 'E10')[0];
    expect(plain).toBe(10 + 2);
    const board = withCells(reviewBoard, { '0,0': dragon(BaseColor.Blue), '0,3': dragon(BaseColor.Blue), '0,6': dragon(BaseColor.Red) });
    expect(dmgTo(castSpell({ key: 'troop:7626', board }), 'E10')[0]).toBe(12 + 8 * 2);
  });
  it('troop:7611 9494 / troop:7627 9532: Purple / Red Dragon gems only', () => {
    const board = withCells(reviewBoard, { '0,0': dragon(BaseColor.Purple), '0,3': dragon(BaseColor.Red), '0,6': dragon(BaseColor.Blue) });
    expect(dmgTo(castSpell({ key: 'troop:7611', board }), 'E10')[0]).toBe(12 + 6);
    expect(dmgTo(castSpell({ key: 'troop:7611' }), 'E10')[0]).toBe(12);
    const amira = castSpell({ key: 'troop:7627', board }).summary.order.filter((s) => s.startsWith('dmg '));
    expect(amira.every((s) => s.includes(' 18'))).toBe(true);
  });
});
