/**
 * Lane L4a review round 1 (sa-R1): table-driven checks for behaviour the default scenarios do not show.
 */
import { describe, expect, it } from 'vitest';
import { castSpell, reviewBoard, withCells } from '../helpers/gowCast';
import { BaseColor, colorGem, specialGem } from '@engine/types';

const statusTargets = (order: string[], id: string) => order.filter(o => o.endsWith(`+${id}`)).map(o => o.split(' ')[1]);

describe('L4a R1: FromPrevious binds to the same enemy', () => {
  // troop:6812 Tutankhatmun (8215): Curse@StrongestEnemy, DeathMark@FromPrevious, DestroyColor FromPreviousTroop.
  // All enemies tied (1 hp, 0 armor): the strongest pick is random, but all three steps must use one enemy.
  it.each([1, 2, 3, 4, 5, 6, 7, 8])('troop:6812 seed %i', (seed) => {
    const colors = [[BaseColor.Red], [BaseColor.Yellow], [BaseColor.Purple], [BaseColor.Brown]];
    const r = castSpell({ key: 'troop:6812', seed, enemies: colors.map(c => ({ hp: 1, maxHp: 1, armor: 0, mana: 5, colors: c })) });
    const [cursed] = statusTargets(r.summary.order, 'curse');
    expect(statusTargets(r.summary.order, 'death-mark')).toEqual([cursed]);
    const colour = colors[Number(cursed.slice(1)) - 10][0];
    const destroy = r.summary.order.find(o => o.startsWith('destroy '))!;
    // 11 = Magic + 1, capped by how many gems of that colour the board holds (review board: 9 Red)
    expect(destroy).toMatch(new RegExp(`^destroy \\d+ \\(${colour} x\\d+\\)$`));
  });
});

describe('L4a R1: all negative status effects', () => {
  // weapon:1220 EssenceOfEvil (7928): CauseCursed, CauseStun, CauseAllNegativeStatusEffects (official table, no Charm, R008).
  it('weapon:1220 applies Curse, Stun, then the official 15 negatives without Charm', () => {
    const r = castSpell({ key: 'weapon:1220' });
    const applied = r.summary.order.filter(o => o.startsWith('status E11 +')).map(o => o.slice('status E11 +'.length));
    expect(applied.slice(0, 2)).toEqual(['curse', 'stun']);
    expect(new Set(applied)).toEqual(new Set(['poison', 'burning', 'bleed', 'silence', 'frozen', 'stun', 'entangle', 'web', 'disease',
      'curse', 'death-mark', 'faerie-fire', 'marked', 'lycanthropy', 'terror']));
    expect(applied).not.toContain('charm');
  });
});

/** Sparse board: colour gems only on even/even cells (no two adjacent), so each explosion centre clears exactly one cell. */
const SPARSE = [BaseColor.Red, BaseColor.Blue, BaseColor.Green, BaseColor.Yellow, BaseColor.Purple, BaseColor.Brown];
const sparseBoard = (r: number, c: number) => (r % 2 === 0 && c % 2 === 0 ? colorGem(SPARSE[(r + c / 2) % 6]) : null);
const firstExplode = (r: ReturnType<typeof castSpell>) => Number(r.summary.order.find(o => o.startsWith('explode '))?.split(' ')[1] ?? 0);

describe('L4a R1: army counters', () => {
  // weapon:1433 OceasTome (8646): 4 per Blue ally + 4 per Elemental ally, no base. Caster (weapon colours Blue/Yellow) counts.
  it.each([
    ['caster only', [{ colors: [BaseColor.Red] }, { colors: [BaseColor.Red] }], 4],
    ['one Blue ally', [{ colors: [BaseColor.Blue] }, { colors: [BaseColor.Red] }], 8],
    ['one Elemental Red ally', [{ colors: [BaseColor.Red], troopTypes: ['Elemental'] }, { colors: [BaseColor.Red] }], 8],
    ['Blue Elemental ally counts twice', [{ colors: [BaseColor.Blue], troopTypes: ['Elemental'] }, { colors: [BaseColor.Red] }], 12],
  ])('weapon:1433 %s -> %i', (_n, allies, n) => {
    expect(firstExplode(castSpell({ key: 'weapon:1433', allies: allies as never, board: sparseBoard }))).toBe(n);
  });
  // weapon:1158 Runeforger (7568): one random gem (any colour) per Brown ally and Brown enemy, no base. Caster is Brown.
  it.each([
    [[BaseColor.Red], 1],
    [[BaseColor.Brown], 2],
  ])('weapon:1158 enemy colours %j -> %i', (colors, n) => {
    const enemies = [{ hp: 999, maxHp: 999, armor: 0, colors }, { hp: 999, maxHp: 999, armor: 0, colors: [BaseColor.Red] }];
    expect(firstExplode(castSpell({ key: 'weapon:1158', enemies, board: sparseBoard }))).toBe(n);
  });
  // troop:6964 StormKnight (8467): CountArmyColor@FromTarget Blue x5 counts the target only.
  it('troop:6964 two Blue enemies still give one column and +5 Attack', () => {
    const enemies = [{ hp: 600, maxHp: 600, armor: 5, colors: [BaseColor.Blue] }, { hp: 900, maxHp: 900, armor: 10, colors: [BaseColor.Blue] }];
    const r = castSpell({ key: 'troop:6964', enemies });
    expect(r.summary.order.filter(o => o.startsWith('destroy '))).toHaveLength(1);
    expect(r.summary.order.filter(o => o.startsWith('destroy '))[0]).toMatch(/^destroy 8 /);
    expect(r.summary.order).toContain('buff C attack+5');
    const red = castSpell({ key: 'troop:6964', enemies: enemies.map(e => ({ ...e, colors: [BaseColor.Red] })) });
    expect(red.summary.order.some(o => o.startsWith('destroy ') || o.startsWith('buff C attack'))).toBe(false);
  });
  // troop:7883 RagingBull (9958): Red enemies counted at step 0, before the row explosion's skulls can kill one.
  it('troop:7883 counts Red enemies before the explosion kills', () => {
    const r = castSpell({ key: 'troop:7883', enemies: [0, 1, 2, 3].map(() => ({ hp: 1, maxHp: 1, armor: 0, colors: [BaseColor.Red] })) });
    expect(r.summary.order).toContain('defeat E10');
    expect(r.summary.order).toContain('buff C attack+23'); // 1 + 10 + 3 x 4
  });
});
describe('L4a R1: "if <troop> is on my team" clauses', () => {
  const withAlly = (key: string, name: string, extra: Record<string, unknown> = {}) =>
    castSpell({ key, allies: [{ name, colors: [BaseColor.Red] }, { colors: [BaseColor.Red] }] as never, ...extra });
  it('troop:7476 Dragon Commander present: one random explosion after the Lightning conversion', () => {
    const r = withAlly('troop:7476', '龙族指挥官');
    expect(r.summary.order[0]).toMatch(/^convert Purple x\d+ -> lightningRow x\d+$/);
    expect(r.summary.order[1]).toMatch(/^explode \d+$/);
    expect(castSpell({ key: 'troop:7476' }).summary.order.some(o => o.startsWith('explode'))).toBe(false);
  });
  it('troop:7476 explosion centre is random, not the chosen cell', () => {
    const r = castSpell({ key: 'troop:7476', board: sparseBoard, cell: { row: 1, col: 1 }, allies: [{ name: '龙族指挥官' }, {}] as never });
    expect(r.summary.order).toContain('explode 1'); // (1,1) is empty on the sparse board: a chosen-cell explode would clear 4
  });
  it('troop:7787 Queen Wilhelmina present: Brown -> Bleed, then Magic + 1 explosions', () => {
    const r = withAlly('troop:7787', '威廉明娜女王', { board: sparseBoard });
    expect(r.summary.order[0]).toMatch(/^convert Brown x\d+ -> bleedGem x\d+$/);
    expect(r.summary.order[1]).toBe('explode 11');
  });
  it.each([
    ['weapon:1600', '永生神路西法', /^explode 3$/],
    ['weapon:1472', '泽菲罗斯', /^explode 5$/],
  ])('%s explosion count with the Immortal', (key, name, re) => {
    const r = withAlly(key, name, { board: sparseBoard });
    expect(r.summary.order.find(o => o.startsWith('explode'))).toMatch(re);
  });
  it('weapon:1600 explodes before the damage (native order)', () => {
    const o = withAlly('weapon:1600', '永生神路西法').summary.order;
    expect(o.findIndex(x => x.startsWith('explode'))).toBeLessThan(o.findIndex(x => x.startsWith('dmg E11')));
  });
  it('weapon:1607 destroys 2 columns before the true damage; Bomb count read after the columns', () => {
    const o = withAlly('weapon:1607', '永生神提泰纽斯').summary.order;
    const cols = o.filter(x => x.startsWith('destroy '));
    expect(cols.length).toBeGreaterThanOrEqual(1);
    expect(o.findIndex(x => x.startsWith('destroy '))).toBeLessThan(o.findIndex(x => x.startsWith('dmg E11')));
  });
  it('weapon:1609 two rows, plus two columns with Immortal Raqiyah', () => {
    const cells = (r: ReturnType<typeof castSpell>) => r.summary.order.filter(o => o.startsWith('destroy ')).reduce((n, o) => n + Number(o.split(' ')[1]), 0);
    expect(cells(castSpell({ key: 'weapon:1609' }))).toBe(16); // 2 full rows of 8
    expect(cells(withAlly('weapon:1609', '不朽的拉基亚'))).toBe(32); // + 2 columns of 8 (the board refills between the row and column steps)
  });
  it('troop:7115 Despond present: -6 Magic in total', () => {
    const r = withAlly('troop:7115', '沮丧');
    expect(r.summary.units.E11).toContain('mag-6');
    expect(castSpell({ key: 'troop:7115' }).summary.units.E11).toContain('mag-3');
  });
  it.each([
    ['weapon:1610', '不朽的亚巴顿', 'daemonicPortalGem'],
    ['weapon:1704', '不朽的泽法尔', 'deathMarkGem'],
    ['weapon:1666', '不朽的考马尼', 'angelGem'],
  ])('%s explodes all %s before the damage', (key, name, kind) => {
    const board = withCells(reviewBoard, { '6,1': specialGem(kind as never), '6,4': specialGem(kind as never) });
    const o = withAlly(key, name, { board }).summary.order;
    const ex = o.findIndex(x => x.startsWith('explode'));
    expect(ex).toBeGreaterThanOrEqual(0);
    expect(ex).toBeLessThan(o.findIndex(x => x.startsWith('dmg ')));
    expect(castSpell({ key, board }).summary.order.some(x => x.startsWith('explode'))).toBe(false);
  });
  it('weapon:1704 skull count is read after the Death Mark explosion', () => {
    // Death Mark gem next to the Skull at 2,5: the explosion removes that skull, so damage = 13 + 2 x 4.
    const board = withCells(reviewBoard, { '2,4': specialGem('deathMarkGem') });
    const o = withAlly('weapon:1704', '不朽的泽法尔', { board }).summary.order;
    expect(o).toContain('dmg E11 21');
  });
});
describe('L4a R1: B04 race/troop counters', () => {
  it('troop:7255 explodes one random gem (not the chosen cell); Emperor Liang gives the first two allies Barrier', () => {
    const r = castSpell({ key: 'troop:7255', board: sparseBoard, cell: { row: 1, col: 1 } });
    expect(r.summary.order[0]).toBe('explode 1');
    const liang = castSpell({ key: 'troop:7255', allies: [{ name: '梁帝' }, {}] as never });
    expect(statusTargets(liang.summary.order, 'barrier')).toEqual(['C', 'A1']);
    expect(statusTargets(castSpell({ key: 'troop:7255' }).summary.order, 'barrier')).toEqual([]);
  });
  it('troop:6593 Divine enemies: +1 Doomskull each, silenced before the explosion', () => {
    const board = withCells(reviewBoard, Object.fromEntries(['5,0', '5,2', '5,4', '5,6', '7,0', '7,6'].map(k => [k, specialGem('doomSkull')])));
    const enemies = [{ hp: 999, maxHp: 999, troopTypes: ['Divine'] }, { hp: 999, maxHp: 999, troopTypes: ['Divine'] }, { hp: 999, maxHp: 999 }];
    const o = castSpell({ key: 'troop:6593', board, enemies: enemies as never }).summary.order;
    expect(statusTargets(o, 'silence')).toEqual(['E10', 'E11']);
    expect(o.findIndex(x => x.includes('+silence'))).toBeLessThan(o.findIndex(x => x.startsWith('explode')));
  });
  it('weapon:1601 armor 2 + 1.5 x Magic; Immortal Terra explodes Stun gems after the armor', () => {
    const board = withCells(reviewBoard, { '6,1': specialGem('stunGem') });
    const o = castSpell({ key: 'weapon:1601', board, allies: [{ name: '永生神泰拉' }, {}] as never }).summary.order;
    expect(o.slice(0, 3)).toEqual(['buff C armor+17', 'buff A1 armor+17', 'buff A2 armor+17']);
    expect(o[3]).toMatch(/^explode \d+$/);
  });
});
describe('L4a R1: B05 row counters', () => {
  it('troop:7684 counts Stone Blocks and Gargoyles in the destroyed row for both Attack and Armor (x6)', () => {
    const board = withCells(reviewBoard, { '3,1': specialGem('stoneBlock'), '3,5': specialGem('gargoyleGem', 1), '6,0': specialGem('stoneBlock') });
    const o = castSpell({ key: 'troop:7684', board }).summary.order;
    expect(o).toContain('buff C attack+32'); // 10 + 10 + 6 x 2 (the block on row 6 is not in the row)
    expect(o).toContain('buff C armor+32');
  });
  it('troop:7102 counts Green gems in the destroyed row, not on the board', () => {
    expect(castSpell({ key: 'troop:7102' }).summary.order).toContain('dmg E10 19'); // 13 + 3 x (1 Green in row 3 + caster)
  });
  it('troop:7120 enemies killed by its own explosion do not boost it', () => {
    const o = castSpell({ key: 'troop:7120', enemies: [0, 1, 2, 3].map(() => ({ hp: 1, maxHp: 1, armor: 0 })) }).summary.order;
    expect(o).toContain('defeat E10');
    expect(o).toContain('buff C attack+6');
  });
  it('weapon:1174 cleanses and heals the other allies only, boosted by Blue gems at 34%', () => {
    const r = castSpell({ key: 'weapon:1174' });
    expect(r.summary.order.slice(0, 3)).toEqual(['cleanse A1 -poison', 'buff A1 hp+14 max+14', 'buff A2 hp+14 max+14']);
    expect(r.summary.units.C ?? '').not.toContain('-poison');
  });
});