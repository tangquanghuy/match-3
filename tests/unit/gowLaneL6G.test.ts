// sa-G review round 8, lane L6 (stats / economy): cases the standard golden scenarios cannot show. Real TurnEngine casts.
import { describe, it, expect } from 'vitest';
import { castSpell, DEFAULT_ALLIES, DEFAULT_ENEMIES } from '../helpers/gowCast';
import { BaseColor, colorGem } from '@engine/types';

const allRed = () => colorGem(BaseColor.Red);
const redWith = (blue: string[]) => (r: number, c: number) => blue.includes(`${r},${c}`) ? colorGem(BaseColor.Blue) : allRed();
const enemiesWith = (i: number, over: object) => DEFAULT_ENEMIES.map((e, j) => (j === i ? { ...e, ...over } : e));

describe('L6 sa-G', () => {
  it('troop:6154 heals first, boosted by the chosen enemy Attack x34% (still boosted through a Barrier)', () => {
    const r = castSpell({ key: 'troop:6154', enemies: enemiesWith(1, { attack: 50, statuses: [{ id: 'barrier', turns: 99 }] }) });
    // 1 + 10 + floor(50 x 0.34) = 28; the heal precedes the hit (native order)
    expect(r.summary.order[0]).toBe('buff C hp+28 max+28');
    expect(r.summary.units.A1).toBe('hp+28 max+28');
    expect(castSpell({ key: 'troop:6154' }).summary.order[0]).toBe('buff C hp+16 max+16');
  });
  it('troop:7091 Life = 1 + Magic + Blue gems + Blue allies (caster included)', () => {
    const r = castSpell({ key: 'troop:7091', board: redWith(['0,0', '1,1', '2,2']) });
    // caster Blue/Yellow + A1 Blue = 2 Blue allies; 3 Blue gems
    expect(r.summary.units.A2).toBe('hp+16 max+16');
    const none = castSpell({ key: 'troop:7091', board: allRed, allies: [DEFAULT_ALLIES[1]], caster: { colors: [BaseColor.Yellow] } });
    expect(none.summary.units.C).toBe('hp+11 max+11');
  });
});
