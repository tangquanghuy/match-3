// sa-R4 lane review round 1, lane L7: count boosts the standard golden scenarios cannot show. Real TurnEngine casts.
import { describe, it, expect } from 'vitest';
import { castSpell, DEFAULT_ENEMIES, sixColourBoard } from '../helpers/gowCast';
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
    ['weapon:1655', Brown, 'Dwarf', 14, 3],
    ['weapon:1661', Brown, 'Tauros', 14, 3],
    ['weapon:1664', Purple, 'Dragon', 14, 3],
    ['weapon:1676', Red, 'Raksha', 14, 3],
    ['weapon:1679', Blue, 'Human', 14, 3],
    ['weapon:1688', Red, 'Orc', 14, 3],
    ['weapon:1698', Green, 'Mystic', 14, 3],
    ['weapon:1701', Yellow, 'Mech', 14, 3],
    ['weapon:1712', Green, 'Goblin', 14, 3],
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

describe('L7 sa-R4: "boosted by <Kingdom> Allies" (CountArmyKingdom AllAllies, caster included)', () => {
  const kRows: [string, string, number, number, number][] = [ // key, kingdom, base, a, targets
    ['weapon:1580', '玉银林地', 13, 3, 2], ['weapon:1590', '蛛尔卡里', 13, 3, 2], ['weapon:1614', '沃尔帕克', 13, 3, 2], ['weapon:1626', '玉银林地', 13, 3, 2],
    ['troop:6741', '狮心帝国', 14, 4, 1], ['troop:7660', '卓克祖', 14, 4, 1],
  ];
  it.each(kRows)('%s: +a per %s ally', (key, kingdom, base, a, targets) => {
    const allies = [{ ...unit([Red]), kingdom }, { ...unit([Red]), kingdom }, { ...unit([Red]), kingdom: '混沌' }];
    const self = key.startsWith('troop:') ? 1 : 0; // weapons: hero has no kingdom in the harness
    expect(dmgs(castSpell({ key, allies }))).toEqual(Array(targets).fill(base + a * (2 + self)));
    expect(dmgs(castSpell({ key, allies: [unit([Red])] }))).toEqual(Array(targets).fill(base + a * self));
  });
});

describe('L7 sa-R4: colour / gem / condition boosts', () => {
  it('troop:6868 x4 per Purple enemy only (allies ignored)', () => {
    const enemies = DEFAULT_ENEMIES.map((e, i) => ({ ...e, colors: i < 3 ? [Purple] : [Red] }));
    expect(dmgs(castSpell({ key: 'troop:6868', allies: [unit([Purple])], enemies }))).toEqual([14 + 4 * 3]);
  });
  it('troop:6905 x2 per Blue ally plus per Blue gem on the board', () => {
    let blue = 0;
    for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) { const g = sixColourBoard(r, c); if (g && g.kind === 'color' && g.color === Blue) blue++; }
    expect(blue).toBeGreaterThan(8);
    const r = castSpell({ key: 'troop:6905', caster: { colors: [Blue] }, allies: [unit([Blue]), unit([Red])], board: sixColourBoard });
    expect(dmgs(r)[0]).toBe(13 + 2 * (2 + blue));
  });
  it('troop:6394 hits the last enemy x3 per Blue ally, doubled when that enemy is damaged', () => {
    const allies = [unit([Blue]), unit([Red])];
    expect(castSpell({ key: 'troop:6394', allies }).summary.order).toEqual(['dmg E13 19']); // 13 + 3 x 2 (caster + A1)
    const enemies = DEFAULT_ENEMIES.map((e, i) => (i === 3 ? { ...e, hp: 400 } : e));
    expect(castSpell({ key: 'troop:6394', allies, enemies }).summary.order).toEqual(['dmg E13 38']);
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
