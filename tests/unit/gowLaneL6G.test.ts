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
  it('kill bonuses apply every Skill (6095 +4, 1130 +10, 6334 Attack then full heal); nothing without a kill', () => {
    const K = { enemies: [0, 1, 2, 3].map(() => ({ hp: 1, maxHp: 1, armor: 0, mana: 5 })) };
    expect(castSpell({ key: 'troop:6095', ...K }).summary.units.C).toBe('hp+4 max+4 arm+4 atk+4 mag+4');
    expect(castSpell({ key: 'weapon:1130', ...K }).summary.units.C).toBe('hp+10 max+10 arm+10 atk+10 mag+10');
    const j = castSpell({ key: 'troop:6334', ...K }).summary;
    expect(j.order.slice(2)).toEqual(['buff C attack+8', 'buff C hp+100']);
    expect(castSpell({ key: 'troop:6734', ...K }).summary.units.C).toBe('hp+7 max+7 arm+7 atk+7 mag+7');
    for (const key of ['troop:6095', 'weapon:1130', 'troop:6334', 'troop:6734']) expect(castSpell({ key }).summary.units.C).toBeUndefined();
  });
  it('troop:6881 Armor then Life +12, doubled on a kill', () => {
    const K = { enemies: [0, 1, 2, 3].map(() => ({ hp: 1, maxHp: 1, armor: 0, mana: 5 })) };
    expect(castSpell({ key: 'troop:6881', ...K }).summary.units.C).toBe('hp+24 max+24 arm+24');
    expect(castSpell({ key: 'troop:6881' }).summary.order).toEqual(['dmg E11 14', 'buff C armor+12', 'buff C hp+12 max+12']);
  });
  it('troop:6308 triples only when the enemy Armor is lower than mine', () => {
    expect(castSpell({ key: 'troop:6308', caster: { armor: 20 } }).summary.order[0]).toBe('dmg E11 48');
    expect(castSpell({ key: 'troop:6308', caster: { armor: 10 } }).summary.order[0]).toBe('dmg E11 16');
  });
  it('weapon:1116 +6 Attack only when I am wounded', () => {
    expect(castSpell({ key: 'weapon:1116' }).summary.units.C).toBe('atk+6');
    expect(castSpell({ key: 'weapon:1116', caster: { hp: 1000, maxHp: 1000 } }).summary.units.C).toBeUndefined();
  });
  it('weapon:1096 steals 2 Magic from the last enemy', () => {
    expect(castSpell({ key: 'weapon:1096' }).summary.order).toEqual(['dmg E13 14', 'buff E13 magic-2', 'buff C magic+2']);
  });
  it('troop:6976 three random hits never repeat the previous target while others live', () => {
    for (let seed = 1; seed <= 30; seed++) {
      const hits = castSpell({ key: 'troop:6976', seed }).summary.order.filter(x => x.startsWith('dmg')).map(x => x.split(' ')[1]);
      expect(hits).toHaveLength(3);
      expect(hits[1]).not.toBe(hits[0]);
      expect(hits[2]).not.toBe(hits[1]);
    }
  });
  it('troop:7201 counts all Enemy Magic once before the hit (a kill does not shrink the Armor)', () => {
    const k = castSpell({ key: 'troop:7201', enemies: [0, 1, 2, 3].map(() => ({ hp: 1, maxHp: 1, armor: 0, mana: 5 })) });
    // 4 x 11 Magic / 2 = 22 -> 4 + 10 + 22 = 36 for both
    expect(k.summary.order.filter(x => !x.startsWith('defeat'))).toEqual(['buff C armor+36', 'dmg E11 36']);
  });
});
