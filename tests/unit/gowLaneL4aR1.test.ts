/**
 * Lane L4a review round 1 (sa-R1): table-driven checks for behaviour the default scenarios do not show.
 */
import { describe, expect, it } from 'vitest';
import { castSpell } from '../helpers/gowCast';
import { BaseColor, colorGem } from '@engine/types';

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