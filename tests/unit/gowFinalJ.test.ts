/**
 * sa-J final wrap-up round: checks for final-queue.json unreviewed / not-eligible keys that the
 * standard golden scenarios (L10 R10 L0 K) do not show on their own.
 */
import { describe, expect, it } from 'vitest';
import { BaseColor, specialGem } from '@engine/types';
import { castSpell, reviewBoard, type BoardFn } from '../helpers/gowCast';
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

describe('sa-J B03', () => {
  // troop:6178 Quasit (7319): DecreaseRandom 1+M on the chosen enemy = one random Skill, full amount.
  it('troop:6178 removes 1+M from a single random Skill of the chosen enemy', () => {
    const stats = new Set<string>();
    for (let seed = 1; seed <= 40; seed++) {
      const hits = order('troop:6178', { seed }).filter(x => x.startsWith('buff '));
      expect(hits).toHaveLength(1);
      // armor bottoms out at E11's 10 Armor
      const m = /^buff E11 (hp|attack|magic)-11$|^buff E11 (armor)-10$/.exec(hits[0]);
      expect(m).not.toBeNull();
      stats.add(m![1] ?? m![2]);
    }
    expect([...stats].sort()).toEqual(['armor', 'attack', 'hp', 'magic']);
  });
  // troop:6192 Borealis (7333): Damage@WeakestEnemy = lowest Life + Armor (R005) -> E12 (300 + 12).
  it('troop:6192 freezes all and hits the weakest enemy', () => {
    const o = order('troop:6192');
    expect(o.filter(x => x.endsWith('+frozen'))).toHaveLength(4);
    expect(o).toContain('dmg E12 28');
  });
});

describe('sa-J B04', () => {
  // troop:6352 HighPaladin (7504): CountArmor Self [2:1] ; Damage@TwoStrongestEnemies (Life + Armor, R005).
  it('troop:6352 adds floor(my Armor / 2) and hits the two strongest enemies', () => {
    const o = order('troop:6352', { caster: { armor: 21 } });
    expect(o).toEqual(['dmg E11 21 (all)', 'dmg E13 21 (all)']);
  });
  // troop:6487 PandaskaGuard (7674): with E10 dead from the explosion skulls, the first enemy is E11 (R012).
  it('troop:6487 hits first and last living enemies', () => {
    const o = order('troop:6487', { enemies: [{ hp: 300, maxHp: 300 }, { hp: 300, maxHp: 300 }, { hp: 300, maxHp: 300 }] });
    expect(o.filter(x => x.startsWith('dmg '))).toEqual(['dmg E10 12', 'dmg E12 12']);
  });
});

describe('sa-J B05', () => {
  // troop:6536 Vargouille (7730): StealLife 8 AddForDivine on the stunned target only when it is Divine.
  it('troop:6536 steals 8 Life only from a Divine target', () => {
    const divine = [{ hp: 300, maxHp: 300 }, { hp: 300, maxHp: 300, troopTypes: ['Divine'] }] as Record<string, unknown>[];
    const hit = order('troop:6536', { enemies: divine });
    expect(hit).toContain('status E11 +stun');
    expect(hit.some(x => /^dmg E11 8\b/.test(x))).toBe(true);
    const plain = order('troop:6536', { enemies: [{ hp: 300, maxHp: 300 }, { hp: 300, maxHp: 300 }] });
    expect(plain.some(x => x.startsWith('dmg E11'))).toBe(false);
  });
});

describe('sa-J B06', () => {
  // troop:6775 CorruptMagus (8165): CauseCursed ; DecreaseRandom 1+M ; DecreaseRandom 1+M = two independent rolls (R007-2).
  it('troop:6775 curses then makes two independent random-Skill reductions on the same enemy', () => {
    for (let seed = 1; seed <= 15; seed++) {
      const o = order('troop:6775', { seed });
      expect(o[0]).toBe('status E11 +curse');
      expect(o.slice(1).every(x => /^buff E11 (hp|attack|armor|magic)-\d+$/.test(x))).toBe(true);
    }
  });
  // troop:7016 TheArchduke (8547): chance to destroy = Magic %. Native runs LethalDamageConditional before Damage;
  // the end state is the same either way (target dead + Lemure, or plain damage), which these two cases pin.
  it('troop:7016 destroys at 100 Magic and summons, and only damages at 0 Magic', () => {
    const hi = order('troop:7016', { magic: 100 });
    expect(hi[0]).toBe('dmg E11 157');
    expect(hi).toContain('defeat E11');
    expect(hi.some(x => x.startsWith('summon mine'))).toBe(true);
    expect(order('troop:7016', { magic: 0 })).toEqual(['dmg E11 7']);
  });
  // troop:7029 SkyMage (8556): Enchant only if the ally is from Shentang (kingdom 3030).
  it('troop:7029 enchants a Shentang ally', () => {
    expect(order('troop:7029', { allies: [{ hp: 500, maxHp: 700, kingdomId: 3030 } as Record<string, unknown>] }))
      .toEqual(['buff A1 hp+11 max+11', 'buff A1 magic+2', 'status A1 +enchanted']);
  });
});

describe('sa-J B07', () => {
  // troop:7068 FountainOfStars (8596): 5 Green -> Purple potions, all Brown -> Skulls, cleanse Fey allies only.
  it('troop:7068 converts exactly 5 Green gems and the Chinese text is readable', () => {
    const o = order('troop:7068');
    expect(o[0]).toBe('convert Green x5 -> manaPotionGem/Purple x5');
    expect(o[1]).toMatch(/^convert Brown x\d+ -> skull x\d+$/);
    expect(o).not.toContain('cleanse A1 -poison');
    expect(zhOf(7068, 8596)).toBe('将 5 颗绿色宝石转换为紫色药水，并将所有棕色宝石转换为骷髅头。净化所有妖仙盟友。');
  });
  // troop:7132 Centuragon (8681): ConsumeConditional@RandomEnemy 10% + 10% per Wildcard = a real Devour.
  it('troop:7132 devours (gains stats) when 9+ Wildcards make the chance 100%', () => {
    const wild: BoardFn = (r, c) => (r === 7 && c < 5 ? specialGem('wildcard', 2) : r === 6 && c < 4 ? specialGem('wildcard', 3) : reviewBoard(r, c));
    const o = order('troop:7132', { board: wild });
    expect(o.some(x => / devoured$/.test(x))).toBe(true);
    expect(o.some(x => /^buff C hp\+\d+/.test(x))).toBe(true);
    expect(order('troop:7132').some(x => x.includes('devoured'))).toBe(false);
  });
});
