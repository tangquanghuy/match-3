import { describe, expect, it } from 'vitest';
import { SOURCE_TROOPS, getTroopById } from '../../src/data/troops';
import { TEMPORARY_AOE_MANA_TIERS, TEMPORARY_AOE_MULTIPLIERS, TEMPORARY_AOE_ORIGINAL_MULTIPLIERS, temporaryAoeMultiplier } from '../../src/data/temporaryAoeMultipliers';
import { spellDescription } from '../../src/data/combatText';
import { evaluateScaling } from '../../src/engine/skills/scaling';
import { damageEffect } from '../../src/engine/skills/effects/damage';
import { damageFixture } from '../helpers/damageFixture';
import { SeededRNG } from '../../src/engine/rng';
import { SKILL_LIBRARY } from '../../src/engine/skills/library';

describe('temporary all-enemy damage scaling', () => {
  it('has exactly 35 documented units and matches real mana tiers, spell IDs, descriptions and battle prototypes', () => {
    const ids = Object.keys(TEMPORARY_AOE_MANA_TIERS).map(Number);
    expect(ids).toHaveLength(35);
    const others = SOURCE_TROOPS.filter(t => !ids.includes(t.id));
    for (const id of ids) {
      const troop = getTroopById(id)!;
      const tier = TEMPORARY_AOE_MANA_TIERS[id]!;
      const multiplier = temporaryAoeMultiplier(id)!;
      expect(troop.manaCost).toBe(tier);
      const raw = SOURCE_TROOPS.find(t => t.id === id)!;
      const proto = SKILL_LIBRARY[troop.spell.id];
      const damage = proto?.segments.filter(s => s.kind === 'damage' && s.target === 'enemyAll') ?? [];
      expect(damage, String(id)).toHaveLength(1);
      expect(damage[0]).toMatchObject({ scaling: { mult: multiplier } });
      if (id in TEMPORARY_AOE_ORIGINAL_MULTIPLIERS) {
        expect(troop.spell.description).toBe(spellDescription(raw.spell.id, raw.spell.description));
      } else {
        expect(troop.spell.description).toContain(`\u9b54\u6cd5 x ${multiplier}`);
      }
      expect(others.filter(t => t.spell.id === raw.spell.id)).toHaveLength(0);
    }
  });
  it('restores six exception coefficients while leaving the six 28-mana dragons at 1.6', () => {
    expect(TEMPORARY_AOE_MULTIPLIERS).toEqual({ 28: 1.6, 30: 1.7, 32: 1.8, 34: 2 });
    expect(TEMPORARY_AOE_ORIGINAL_MULTIPLIERS).toEqual({
      6471: 1, 7572: 0.75, 7577: 0.75, 7689: 0.8, 7791: 0.75, 7933: 0.75,
    });
    for (const id of [7245, 7246, 7247, 7248, 7249, 7250]) {
      expect(temporaryAoeMultiplier(id)).toBe(1.6);
    }
    expect(temporaryAoeMultiplier(7573)).toBe(1.5);
  });
  it('makes Lucifer damage deterministic magic x 1.5 + 2, preserving true damage and region doubling', () => {
    const troop = getTroopById(7573)!;
    const segment = SKILL_LIBRARY[troop.spell.id].segments.find(s => s.kind === 'damage');
    expect(segment).toMatchObject({ target: 'enemyAll', trueDamage: true, scaling: { base: 2, mult: 1.5 },
      condMult: { times: 2, cond: { kind: 'regionPresent', region: 'SummerIsle' } } });
    expect(segment).not.toHaveProperty('rangeSpec');
    if (segment?.kind !== 'damage') throw new Error('Lucifer damage missing');
    expect(evaluateScaling(segment.scaling, 20)).toBe(32);
    expect(troop.spell.description).toContain('[(\u9b54\u6cd5 x 1.5) + 2]');
    expect(troop.spell.description).not.toContain('3-');
    expect(troop.spell.meta.scalings[0]).toEqual({ base: 2, mult: 1.5 });
    for (const seed of [1, 7, 42, 1234]) {
      const { ctx, enemies } = damageFixture();
      ctx.rng = new SeededRNG(seed);
      damageEffect({ targets: enemies, scaling: segment.scaling, range: 'all',
        trueDamage: segment.trueDamage, condMult: segment.condMult }).apply(ctx);
      expect(enemies.map(enemy => 1000 - enemy.hp)).toEqual([19, 19, 19, 19]);
    }
  });
  it('keeps the distinct ally healing coefficient on 7577', () => {
    const troop = getTroopById(7577)!;
    expect(troop.spell.description).toContain('(\u9b54\u6cd5 x 0.75) + 2');
    const heal = SKILL_LIBRARY[troop.spell.id].segments.find(s => s.kind === 'buff' && s.stat === 'hp');
    expect(heal).toMatchObject({ scaling: { mult: 0.75 } });
  });
});
