// sa-R4 lane review round 1, lane L7: count boosts the standard golden scenarios cannot show. Real TurnEngine casts.
import { describe, it, expect } from 'vitest';
import { castSpell, DEFAULT_ENEMIES } from '../helpers/gowCast';
import { BaseColor, type Character } from '@engine/types';

const { Red, Blue, Green, Yellow, Purple, Brown } = BaseColor;
const unit = (colors: BaseColor[], troopTypes?: string[]): Partial<Character> => ({ hp: 500, maxHp: 500, armor: 0, colors, troopTypes });
const other = (c: BaseColor) => (c === Red ? Yellow : Red);
/** Damage numbers of the spell phase, in order. */
const dmgs = (r: ReturnType<typeof castSpell>) => r.summary.order.filter(s => s.startsWith('dmg ')).map(s => Number(s.split(' ')[2]));

describe('L7 sa-R4: "boosted by <Colour> and <Race> Allies" (CountArmyColor + CountArmyType, AllAllies)', () => {
  // key, colour, race, base damage at Magic 10, per-unit multiplier
  const rows: [string, BaseColor, string, number, number][] = [
    ['weapon:1431', Green, 'Elemental', 14, 3],
    ['weapon:1466', Purple, 'Undead', 14, 3],
    ['weapon:1483', Brown, 'Construct', 14, 5],
    ['weapon:1494', Purple, 'Elf', 14, 3],
    ['weapon:1502', Green, 'Wargare', 14, 3],
    ['weapon:1537', Blue, 'Knight', 14, 3],
    ['weapon:1574', Blue, 'Giant', 14, 3],
    ['weapon:1577', Brown, 'Naga', 14, 3],
    ['weapon:1581', Red, 'Elemental', 14, 3],
    ['weapon:1584', Blue, 'Undead', 14, 3],
    ['weapon:1588', Red, 'Daemon', 14, 3],
    ['weapon:1591', Yellow, 'Centaur', 14, 3],
    ['weapon:1615', Yellow, 'Divine', 14, 3],
    ['weapon:1618', Red, 'Tauros', 14, 3],
    ['weapon:1627', Brown, 'Urska', 14, 3],
    ['weapon:1630', Red, 'Fey', 14, 3],
    ['weapon:1640', Brown, 'Giant', 14, 3],
    ['weapon:1643', Blue, 'Fey', 14, 3],
    ['weapon:1648', Green, 'Wildfolk', 14, 3],
    ['weapon:1652', Yellow, 'Knight', 14, 3],
    ['weapon:1691', Green, 'Urska', 14, 3],
    ['weapon:1716', Yellow, 'Wildfolk', 14, 3],
  ];
  it.each(rows)('%s: colour and race counted separately (a unit with both counts twice); enemies ignored', (key, color, race, base, a) => {
    const n = other(color);
    const allies = [unit([color], [race]), unit([color]), unit([n], [race])];
    const r = castSpell({ key, caster: { colors: [n] }, allies, enemies: DEFAULT_ENEMIES.map(e => ({ ...e, colors: [color], troopTypes: [race] })) });
    expect(dmgs(r)).toEqual([base + a * 4]);
    const none = castSpell({ key, caster: { colors: [n] }, allies: [unit([n]), unit([n])] });
    expect(dmgs(none)).toEqual([base]);
  });
});

describe('L7 sa-R4: "boosted by <Race> and <Race> Allies" (two CountArmyType, AllAllies)', () => {
  it('weapon:1111 scatter [M+4] x5 per Divine ally plus per Knight ally', () => {
    const allies = [unit([Red], ['Divine', 'Knight']), unit([Red], ['Knight']), unit([Red], ['Human'])];
    const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
    expect(sum(dmgs(castSpell({ key: 'weapon:1111', allies })))).toBe(29); // scatter total split over enemies: 14 + 5 x (1 + 2)
    expect(sum(dmgs(castSpell({ key: 'weapon:1111', allies: [unit([Red], ['Human'])] })))).toBe(14);
  });
});

describe('L7 sa-R4: "boosted by <Colour> Allies and Enemies" (CountArmyColor AllAllies + AllEnemies)', () => {
  it('troop:7113 light splash [(M/2)+3] x3 per Blue ally and Blue enemy (not per enemy), adjacent 25% floor', () => {
    const enemies = DEFAULT_ENEMIES.map((e, i) => ({ ...e, colors: i < 2 ? [Blue] : [Red] }));
    const r = castSpell({ key: 'troop:7113', caster: { colors: [Red] }, allies: [unit([Blue]), unit([Blue, Yellow])], enemies });
    const d = dmgs(r); // 8 + 3 x (2 + 2) = 20, adjacent 5
    expect(Math.max(...d)).toBe(20);
    expect(d.filter(x => x === 20)).toHaveLength(2);
    expect(d.filter(x => x !== 20).every(x => x === 5)).toBe(true);
    const plain = castSpell({ key: 'troop:7113', caster: { colors: [Red] }, allies: [unit([Red])], enemies: DEFAULT_ENEMIES.map(e => ({ ...e, colors: [Green] })) });
    expect(Math.max(...dmgs(plain))).toBe(8);
  });
  it('troop:6719 steals [M+1] Life x4 per Purple ally and Purple enemy', () => {
    const enemies = DEFAULT_ENEMIES.map((e, i) => ({ ...e, colors: i === 0 || i === 2 ? [Purple] : [Red] }));
    const r = castSpell({ key: 'troop:6719', caster: { colors: [Purple] }, allies: [unit([Red])], enemies });
    expect(r.summary.order).toEqual(['dmg E11 23', 'buff C hp+23 max+23']); // 11 + 4 x (1 + 2)
  });
});
