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
  it('troop:7807 knocks the 2nd then the 1st enemy back (native order: final [E12, E13, E11, E10])', () => {
    const { f } = castSpell({ key: 'troop:7807' });
    expect(f.state.teams[f.opponent].characters.map(c => c.id)).toEqual([12, 13, 11, 10]);
  });
  it('troop:6935 knocks the target back only when I am Enraged', () => {
    const { f } = castSpell({ key: 'troop:6935', caster: { statuses: [{ id: 'rage', turns: 99 }] as never } });
    expect(f.state.teams[f.opponent].characters.map(c => c.id)).toEqual([10, 12, 13, 11]);
    const plain = castSpell({ key: 'troop:6935' }).f;
    expect(plain.state.teams[plain.opponent].characters.map(c => c.id)).toEqual([10, 11, 12, 13]);
  });
  it('weapon:1197 triples only when the enemy Life is greater than mine', () => {
    expect(castSpell({ key: 'weapon:1197', enemies: enemiesWith(1, { hp: 950, maxHp: 950 }) }).summary.order[1]).toBe('dmg E11 45');
    expect(castSpell({ key: 'weapon:1197' }).summary.order[1]).toBe('dmg E11 15'); // 900 vs 900
  });
  it('13-or-more thresholds: 6097 Brown (all allies +5 Armor), 1112 Yellow (+4 Life and Magic)', () => {
    const nOf = (color: BaseColor, n: number) => (r: number, c: number) => (r * 8 + c < n ? colorGem(color) : allRed());
    expect(castSpell({ key: 'troop:6097', board: nOf(BaseColor.Brown, 13) }).summary.units.A1).toBe('arm+5');
    expect(castSpell({ key: 'troop:6097', board: nOf(BaseColor.Brown, 12) }).summary.units.A1).toBeUndefined();
    expect(castSpell({ key: 'weapon:1112', board: nOf(BaseColor.Yellow, 13) }).summary.units.A2).toBe('hp+4 max+4 arm+13 atk+5 mag+4');
    expect(castSpell({ key: 'weapon:1112', board: nOf(BaseColor.Yellow, 12) }).summary.units.A2).toBe('arm+13 atk+5');
  });
  it.each([
    ['troop:7514', 'Tauros', ['buff A1 attack+22', 'buff A1 hp+22 max+22']],
    ['troop:6740', 'Human', ['buff A1 hp+22 max+22', 'buff A1 attack+10']],
    ['troop:6315', 'Elemental', ['buff A1 hp+22 max+22', 'buff A1 magic+4']],
    ['troop:7354', 'Fey', ['buff A1 hp+22 max+22', 'buff A1 magic+6']],
    ['troop:7747', 'Centaur', ['buff A1 hp+22 max+22', 'buff A1 magic+4']],
  ])('%s doubles both parts on a %s ally (native order)', (key, race, order) => {
    const allies = [{ ...DEFAULT_ALLIES[0], troopTypes: [race] }, DEFAULT_ALLIES[1]];
    expect(castSpell({ key, allies }).summary.order).toEqual(order);
  });
  it('Doomed weapons 1517-1521: +10 Attack only when an enemy is a Doom troop', () => {
    const doom = enemiesWith(2, { troopTypes: ['Doom'] });
    for (const key of ['weapon:1517', 'weapon:1518', 'weapon:1519', 'weapon:1520', 'weapon:1521']) {
      expect(castSpell({ key, enemies: doom }).summary.order.at(-1)).toBe('buff C attack+10');
      expect(castSpell({ key }).summary.units.C).toBe('arm+14 mag+2');
    }
  });
  it('troop:7201 counts all Enemy Magic once before the hit (a kill does not shrink the Armor)', () => {
    const k = castSpell({ key: 'troop:7201', enemies: [0, 1, 2, 3].map(() => ({ hp: 1, maxHp: 1, armor: 0, mana: 5 })) });
    // 4 x 11 Magic / 2 = 22 -> 4 + 10 + 22 = 36 for both
    expect(k.summary.order.filter(x => !x.startsWith('defeat'))).toEqual(['buff C armor+36', 'dmg E11 36']);
  });
});
