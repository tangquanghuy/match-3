/**
 * sa-J final wrap-up round: checks for final-queue.json unreviewed / not-eligible keys that the
 * standard golden scenarios (L10 R10 L0 K) do not show on their own.
 */
import { describe, expect, it } from 'vitest';
import { BaseColor } from '@engine/types';
import { castSpell } from '../helpers/gowCast';
import { spellDescription } from '../../src/data/combatText';
import troops from '../../src/data/troops.json';

/** Chinese spell text the game shows for a troop (built data + snapshot overrides). */
const zhOf = (troopId: number, spellId: number) => spellDescription(spellId, troops.find(t => t.id === troopId)!.spell.description);
const order = (key: string, o: Record<string, unknown> = {}) => castSpell({ key, ...o }).summary.order;

describe('sa-J B01', () => {
  // troop:6017 StarGazer (7017): CountGems Blue ; RemoveColor Blue ; IncreaseAttack UseCounter -> Magic + removed.
  it('troop:6017 gives Magic + removed Blue gems as attack', () => {
    const o = order('troop:6017');
    expect(o[0]).toBe('destroy 11 (Blue x11)');
    expect(o).toContain('buff A1 attack+21');
  });
  // troop:6018 Pegasus (7018): quarter mana goes to all other allies, not self.
  it('troop:6018 gives quarter mana to other allies only', () => {
    const o = order('troop:6018');
    expect(o.filter(x => /^buff \w+ mana\+/.test(x))).toEqual(['buff A1 mana+4', 'buff A2 mana+4']);
  });
});

describe('sa-J B02', () => {
  // troop:6062 Valkyrie (7062): native Target NotBlueOrSkullGems ; ConvertGems FromTarget -> Blue ; GiveSouls 1+M.
  it('troop:6062 turns a chosen non-Blue colour into Blue and gives 1+M souls', () => {
    const o = order('troop:6062', { color: BaseColor.Red });
    expect(o[0]).toMatch(/^convert Red x\d+ -> Blue x\d+$/);
    expect(o).toContain('souls+11');
  });
  // troop:6160 TheGreatMaw (7280): CreateGems Yellow 8 ; CreateGems Brown 8 (8 each, not 8 in total).
  it('troop:6160 creates 8 Yellow and 8 Brown gems and the Chinese text says 8 each', () => {
    const o = order('troop:6160');
    expect(o.some(x => /-> Yellow x8$/.test(x))).toBe(true);
    expect(o.some(x => /-> Brown x8$/.test(x))).toBe(true);
    expect(zhOf(6160, 7280)).toBe('吞噬一名敌人。创造 8 颗黄色宝石和 8 颗棕色宝石。只能施放一次。');
  });
});
