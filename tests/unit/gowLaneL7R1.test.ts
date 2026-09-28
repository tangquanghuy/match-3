// sa-R4 lane review round 1, lane L7: count boosts the standard golden scenarios cannot show. Real TurnEngine casts.
import { describe, it, expect } from 'vitest';
import { castSpell, DEFAULT_ENEMIES, sixColourBoard, reviewBoard, withCells } from '../helpers/gowCast';
import { BaseColor, specialGem, type Character } from '@engine/types';

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
    ['weapon:1545', Yellow, 'Stryx', 14, 3],
    ['weapon:1530', Red, 'Dragon', 14, 3],
    ['weapon:1542', Green, 'Centaur', 14, 3],
    ['weapon:1554', Brown, 'Beast', 14, 3],
    ['weapon:1557', Purple, 'Wargare', 14, 3],
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

describe('L7 sa-R4: "[M+3] to the first 2 Enemies, boosted by <Race> Allies"', () => {
  const rRows: [string, string, number][] = [
    ['weapon:1540', 'Undead', 4], ['weapon:1543', 'Fey', 3], ['weapon:1572', 'Daemon', 3], ['weapon:1582', 'Monster', 3],
    ['weapon:1586', 'Mystic', 3], ['weapon:1589', 'Rogue', 3], ['weapon:1628', 'Giant', 3],
    ['weapon:1641', 'Elemental', 3], ['weapon:1644', 'Goblin', 3], ['weapon:1662', 'Elf', 3], ['weapon:1677', 'Construct', 3],
    ['weapon:1689', 'Knight', 3], ['weapon:1717', 'Beast', 3],
  ];
  it.each(rRows)('%s: +a per %s ally on E10 and E11', (key, race, a) => {
    const allies = [unit([Red], [race]), unit([Red], [race, 'Human']), unit([Red], ['Human'])];
    expect(castSpell({ key, allies }).summary.order).toEqual([`dmg E10 ${13 + 2 * a} (all)`, `dmg E11 ${13 + 2 * a} (all)`]);
  });
});

describe('L7 sa-R4: enemy race counts and race multipliers', () => {
  it('weapon:1148 splash (50% adjacent) [M+5] x6 per Giant ally and Giant enemy', () => {
    const enemies = DEFAULT_ENEMIES.map((e, i) => ({ ...e, troopTypes: i === 3 ? ['Giant'] : ['Human'] }));
    const r = castSpell({ key: 'weapon:1148', allies: [unit([Red], ['Giant'])], enemies });
    expect(r.summary.order).toEqual(['dmg E11 27 (splash)', 'dmg E10 13 (splash)', 'dmg E12 13 (splash)']); // 15 + 6 x 2
  });
  it('troop:6309 [M+1] x4 per enemy Construct, tripled against a Construct', () => {
    const enemies = DEFAULT_ENEMIES.map((e, i) => ({ ...e, troopTypes: i === 1 || i === 3 ? ['Construct'] : ['Human'] }));
    expect(castSpell({ key: 'troop:6309', enemies }).summary.order).toEqual(['dmg E11 57']); // (11 + 8) x 3
    expect(castSpell({ key: 'troop:6309', enemies, target: 10 }).summary.order).toEqual(['dmg E10 19']);
  });
  it('weapon:1205 [(M/2)+2] to all enemies x8 per enemy Tower (Castle type)', () => {
    const enemies = DEFAULT_ENEMIES.map((e, i) => ({ ...e, troopTypes: i === 2 ? ['Castle'] : ['Human'] }));
    expect(dmgs(castSpell({ key: 'weapon:1205', enemies }))).toEqual([15, 15, 15, 15]);
  });
});

describe('L7 sa-R4: instant-kill chance boosted by enemy race (LethalDamageConditional 4%, +4% each)', () => {
  const rate = (key: string, race: string, n: number) => {
    const enemies = DEFAULT_ENEMIES.map((e, i) => ({ ...e, troopTypes: i < n ? [race] : ['Human'] }));
    let kills = 0;
    for (let seed = 1; seed <= 400; seed++) {
      const r = castSpell({ key, enemies, seed });
      expect(dmgs(r)[0]).toBe(14);
      if (r.summary.order.includes('defeat E11')) kills++;
    }
    return kills / 400;
  };
  it.each([['weapon:1357', 'Daemon'], ['weapon:1358', 'Elemental']])('%s: ~4%% with no %s enemy, ~20%% with four', (key, race) => {
    expect(rate(key, race, 0)).toBeLessThan(0.09);
    const four = rate(key, race, 4);
    expect(four).toBeGreaterThan(0.13);
    expect(four).toBeLessThan(0.28);
  });
});

describe('L7 sa-R4: stat-count boosts (R003 percent, R007 per-step floor)', () => {
  it('troop:6339 [M+4] + floor(atk/2) + floor(armor/2) + floor(life/2), each floored separately', () => {
    const r = castSpell({ key: 'troop:6339', caster: { attack: 15, armor: 7, hp: 101 } });
    expect(dmgs(r)[0]).toBe(14 + 7 + 3 + 50); // merged floor would give 61
  });
  it('troop:6333 scatter = my Attack + 10 per Brown enemy', () => {
    const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
    const enemies = DEFAULT_ENEMIES.map((e, i) => ({ ...e, colors: i < 3 ? [Brown] : [Red] }));
    expect(sum(dmgs(castSpell({ key: 'troop:6333', caster: { attack: 20 }, enemies })))).toBe(50);
  });
  it('troop:6553 [M+2] + 17% of enemy Attack + 17% of ally Attack to the 2 weakest; if one dies the other dies too', () => {
    const enemies = DEFAULT_ENEMIES.map((e, i) => ({ ...e, attack: 10 * (i + 1) })); // 100 -> 17
    const r = castSpell({ key: 'troop:6553', caster: { attack: 30 }, allies: [{ ...unit([Red]), attack: 30 }], enemies }); // 60 -> 10
    expect(r.summary.order).toEqual(['dmg E12 39 (all)', 'dmg E10 39 (all)']);
    const low = DEFAULT_ENEMIES.map((e, i) => (i === 2 ? { ...e, hp: 20, maxHp: 300, armor: 0 } : e));
    const k = castSpell({ key: 'troop:6553', enemies: low });
    expect(k.summary.units.E12).toContain('DEAD');
    expect(k.summary.units.E10).toContain('DEAD');
    const none = castSpell({ key: 'troop:6553' });
    expect(Object.values(none.summary.units).some(v => v.includes('DEAD'))).toBe(false);
  });
  it('troop:7707 +34% of the target Attack; troop:7876 +34% of my Attack', () => {
    const enemies = DEFAULT_ENEMIES.map((e, i) => (i === 1 ? { ...e, attack: 50 } : e));
    expect(dmgs(castSpell({ key: 'troop:7707', enemies }))).toEqual([14 + 17]);
    expect(dmgs(castSpell({ key: 'troop:7876', caster: { attack: 50 } }))).toEqual([14 + 17]);
  });
});

describe('L7 sa-R4: CountAttackArmorLife is one native step (sum, then one floor)', () => {
  const caster = { attack: 5, armor: 5, hp: 7 }; // 17 total; per-stat floors would differ at every percentage below
  const noRed = DEFAULT_ENEMIES.map(e => ({ ...e, colors: [Blue] }));
  it('troop:6304 15%: 13 + 2, doubled when the target Attack is lower', () => {
    expect(dmgs(castSpell({ key: 'troop:6304', caster }))).toEqual([15]);
    const weak = DEFAULT_ENEMIES.map((e, i) => (i === 1 ? { ...e, attack: 3 } : e));
    expect(dmgs(castSpell({ key: 'troop:6304', caster, enemies: weak }))).toEqual([30]);
  });
  it('troop:6644 34%: 14 + 5', () => expect(dmgs(castSpell({ key: 'troop:6644', caster }))).toEqual([19]));
  it('troop:6833 13%: 13 + 2 on the chosen and a random other enemy, x2 on Red users', () => {
    expect(dmgs(castSpell({ key: 'troop:6833', caster, enemies: noRed }))).toEqual([15, 15]);
    const red = noRed.map((e, i) => (i === 1 ? { ...e, colors: [Red] } : e));
    expect(dmgs(castSpell({ key: 'troop:6833', caster, enemies: red }))[0]).toBe(30);
    for (let seed = 1; seed <= 40; seed++) { // RandomPrefNotPrevEnemy: never the chosen enemy again while others live
      const o = castSpell({ key: 'troop:6833', caster, enemies: noRed, seed }).summary.order.filter(s => s.startsWith('dmg '));
      expect(o[0].startsWith('dmg E11 ')).toBe(true);
      expect(o[1].startsWith('dmg E11 ')).toBe(false);
    }
  });
  it('troop:7838 25%: 13 + 4 on 3 random enemies', () => expect(dmgs(castSpell({ key: 'troop:7838', caster, enemies: noRed }))).toEqual([17, 17, 17]));
  it('troop:6138 10%: light splash 12 + 1 on the first enemy', () => expect(dmgs(castSpell({ key: 'troop:6138', caster }))[0]).toBe(13));
});

describe('L7 sa-R4: gem-count boosts', () => {
  it('troop:7123 scatter [M+8] x4 per Purple gem and Purple ally', () => {
    const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
    const r = castSpell({ key: 'troop:7123', caster: { colors: [Purple] }, allies: [unit([Purple]), unit([Red])], board: sixColourBoard });
    expect(sum(dmgs(r))).toBe(18 + 4 * (boardCount(Purple) + 2));
  });
  it('weapon:1571 x3 per Purple gem (native CountGems, English says allies) and per Mystic ally', () => {
    const r = castSpell({ key: 'weapon:1571', caster: { colors: [Red] }, allies: [unit([Purple], ['Mystic']), unit([Purple])], board: sixColourBoard });
    expect(dmgs(r)).toEqual([14 + 3 * (boardCount(Purple) + 1)]);
  });
  it('troop:7056 x6 per Lycanthropy gem and per enemy Beast', () => {
    const enemies = DEFAULT_ENEMIES.map((e, i) => ({ ...e, troopTypes: i < 2 ? ['Beast'] : ['Human'] }));
    const board = withCells(reviewBoard, { '0,1': specialGem('lycanthropyGem'), '5,5': specialGem('lycanthropyGem'), '6,1': specialGem('lycanthropyGem') });
    expect(dmgs(castSpell({ key: 'troop:7056', allies: [unit([Red], ['Beast'])], enemies, board }))).toEqual([14 + 6 * (3 + 2)]);
  });
  it('troop:6115 [M+4] to the target, then 8 scatter boosted x4 per living enemy', () => {
    const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
    const d = dmgs(castSpell({ key: 'troop:6115', enemies: DEFAULT_ENEMIES.slice(0, 3) }));
    expect(d[0]).toBe(14);
    expect(sum(d.slice(1))).toBe(8 + 4 * 3);
  });
});

describe('L7 sa-R4: targets and race counts on both sides', () => {
  it('troop:6904 hits the chosen enemy and only the one directly below (NextDownFromTarget), x4 per Forest of Thorns ally', () => {
    const allies = [{ ...unit([Red]), kingdom: '荆棘森林' }, unit([Red])];
    expect(castSpell({ key: 'troop:6904', allies }).summary.order).toEqual(['dmg E11 21 (all)', 'dmg E12 21 (all)']); // 13 + 4 x 2
    expect(castSpell({ key: 'troop:6904', allies, target: 13 }).summary.order).toEqual(['dmg E13 21 (all)']);
  });
  it('troop:7592 scatter [M+8] x6 per Daemon and per Naga on both sides', () => {
    const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
    const enemies = DEFAULT_ENEMIES.map((e, i) => ({ ...e, troopTypes: i === 0 ? ['Daemon', 'Naga'] : i === 1 ? ['Naga'] : ['Human'] }));
    const r = castSpell({ key: 'troop:7592', allies: [unit([Red], ['Daemon']), unit([Red], ['Elf'])], enemies });
    expect(sum(dmgs(r))).toBe(18 + 6 * ((2 + 1) + (1 + 2))); // caster Daemon/Naga + A1 Daemon ; E10 both + E11 Naga
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
    ['weapon:1642', '黑石', 13, 3, 2], ['weapon:1645', '梅兰堤斯', 13, 3, 2], ['weapon:1651', '阿达纳', 13, 3, 2], ['weapon:1654', '聚沙之地', 13, 3, 2],
    ['weapon:1660', '卜筮之原', 13, 3, 2], ['weapon:1663', '潘神之谷', 13, 3, 2], ['weapon:1694', '地狱悬崖', 13, 3, 2], ['weapon:1700', '卓克祖', 13, 3, 2],
    ['weapon:1703', '狂野平原', 13, 3, 2], ['weapon:1715', '荆棘森林', 13, 3, 2],
  ];
  it.each(kRows)('%s: +a per %s ally', (key, kingdom, base, a, targets) => {
    const allies = [{ ...unit([Red]), kingdom }, { ...unit([Red]), kingdom }, { ...unit([Red]), kingdom: '混沌' }];
    const self = key.startsWith('troop:') ? 1 : 0; // weapons: hero has no kingdom in the harness
    expect(dmgs(castSpell({ key, allies }))).toEqual(Array(targets).fill(base + a * (2 + self)));
    expect(dmgs(castSpell({ key, allies: [unit([Red])] }))).toEqual(Array(targets).fill(base + a * self));
  });
});

const boardCount = (color: BaseColor) => {
  let n = 0;
  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) { const g = sixColourBoard(r, c); if (g && g.kind === 'color' && g.color === color) n++; }
  return n;
};

describe('L7 sa-R4: "<Colour> Gems and Allies" = CountGems + CountArmyColor (Data = colour), not team size', () => {
  it('troop:7831 [M+2] x2 per Blue gem and per Blue ally', () => {
    const allies = [unit([Blue]), unit([Red]), unit([Red])];
    const r = castSpell({ key: 'troop:7831', caster: { colors: [Blue] }, allies, board: sixColourBoard });
    expect(dmgs(r)).toEqual([12 + 2 * (boardCount(Blue) + 2)]);
  });
  it('troop:7089 random [(M/2)+1]-[M+2] +1 per Green gem and per Green ally', () => {
    const allies = [unit([Green]), unit([Red]), unit([Red])];
    const boost = boardCount(Green) + 2;
    for (const seed of [1, 2, 3, 4, 5]) {
      const d = dmgs(castSpell({ key: 'troop:7089', caster: { colors: [Green] }, allies, board: sixColourBoard, seed }));
      expect(d).toHaveLength(1);
      expect(d[0]).toBeGreaterThanOrEqual(6 + boost);
      expect(d[0]).toBeLessThanOrEqual(12 + boost);
    }
    const low = dmgs(castSpell({ key: 'troop:7089', caster: { colors: [Green] }, allies: [unit([Red])], board: sixColourBoard, magic: 0 }))[0];
    expect(low - (boardCount(Green) + 1)).toBeGreaterThanOrEqual(1);
    expect(low - (boardCount(Green) + 1)).toBeLessThanOrEqual(2);
  });
  it('weapon:1650 [M+3] to first 2 x3 per Divine ally (not per ally)', () => {
    const allies = [unit([Red], ['Divine']), unit([Red]), unit([Red], ['Divine'])];
    expect(dmgs(castSpell({ key: 'weapon:1650', allies }))).toEqual([19, 19]);
    expect(dmgs(castSpell({ key: 'weapon:1650', allies: [unit([Red]), unit([Red])] }))).toEqual([13, 13]);
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
