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
  it('troop:7648 Life 1 + Magic + Yellow/2, tripled only on a Yellow ally', () => {
    const board = (r: number) => (r === 0 ? colorGem(BaseColor.Yellow) : allRed()); // 8 Yellow
    expect(castSpell({ key: 'troop:7648', board }).summary.units.A1).toBe('hp+15 max+15');
    expect(castSpell({ key: 'troop:7648', board, target: 2 }).summary.units.A2).toBe('hp+45 max+45'); // A2 Red/Yellow
  });
  it('troop:6914 steals min(Magic + 1, enemy Magic) and adds it to Armor then Life', () => {
    const big = castSpell({ key: 'troop:6914', enemies: enemiesWith(1, { magic: 20 }) });
    expect(big.summary.order).toEqual(['buff E11 magic-11', 'buff C armor+11', 'buff C hp+11 max+11']);
    const small = castSpell({ key: 'troop:6914', enemies: enemiesWith(1, { magic: 5 }) });
    expect(small.summary.units.C).toBe('hp+5 max+5 arm+5');
  });
  it('weapon:1133 second hit is RandomPrefNotPrev (never the chosen enemy while others live), steal from the chosen', () => {
    for (let seed = 1; seed <= 30; seed++) {
      const o = castSpell({ key: 'weapon:1133', seed }).summary.order;
      expect(o[0]).toBe('dmg E11 12');
      expect(o[1]).not.toBe('dmg E11 12');
      expect(o.slice(2)).toEqual(['buff E11 magic-1', 'buff C magic+1']);
    }
  });
  it('troop:7201 counts all Enemy Magic once before the hit (a kill does not shrink the Armor)', () => {
    const k = castSpell({ key: 'troop:7201', enemies: [0, 1, 2, 3].map(() => ({ hp: 1, maxHp: 1, armor: 0, mana: 5 })) });
    // 4 x 11 Magic / 2 = 22 -> 4 + 10 + 22 = 36 for both
    expect(k.summary.order.filter(x => !x.startsWith('defeat'))).toEqual(['buff C armor+36', 'dmg E11 36']);
  });
});
