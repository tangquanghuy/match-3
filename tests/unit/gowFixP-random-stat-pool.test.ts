// sa-P fix round A: P-random-stat-pool (rulings/R007 §2).
// DecreaseRandom / StealRandom roll one of the four Skills (Attack, Armor, Life, Magic) with equal odds.
// A Life reduction lowers current Life directly (no Armor/Barrier); a stolen Life point grows the caster like IncreaseHealth.
import { describe, it, expect } from 'vitest';
import { reduceEffect } from '@engine/skills/effects/debuff';
import { castSpell } from '../helpers/gowCast';
import { damageCharacter } from '../helpers/damageFixture';
import type { EffectContext } from '@engine/skills/effects/context';
import type { GameEvent, BuffEvent } from '@engine/events';

const fixedRng = (pick: number) => ({ next: () => 0, nextInt: (n: number) => { if (n !== 4) throw new Error(`pool size ${n}`); return pick; } });

describe('P-random-stat-pool: reduce stat random uses a 4-Skill pool', () => {
  for (const [pick, stat] of [[0, 'attack'], [1, 'armor'], [2, 'hp'], [3, 'magic']] as const) {
    it(`roll ${pick} -> ${stat}`, () => {
      const target = damageCharacter(10, { attack: 20, armor: 20, hp: 50, maxHp: 60, magic: 20, barrier: undefined } as never);
      const caster = damageCharacter(0, {});
      const state = { teams: { Left: { characters: [caster] }, Right: { characters: [target] } } } as unknown as EffectContext['state'];
      const ctx = { state, casterId: 0, rng: fixedRng(pick) } as unknown as EffectContext;
      const ev = reduceEffect({ targets: [target], stat: 'random', scaling: { base: 5, mult: 0 } }).apply(ctx);
      expect(ev).toEqual([{ type: 'buff', targetId: 10, stat, amount: -5 }]);
      if (stat === 'hp') { expect(target.hp).toBe(45); expect(target.armor).toBe(20); expect(target.maxHp).toBe(60); }
    });
  }
  it('steal random Life: caster gains Life and max Life (IncreaseHealth)', () => {
    const target = damageCharacter(10, { hp: 50, maxHp: 60 });
    const caster = damageCharacter(0, { hp: 30, maxHp: 30 });
    const state = { teams: { Left: { characters: [caster] }, Right: { characters: [target] } } } as unknown as EffectContext['state'];
    const ctx = { state, casterId: 0, rng: fixedRng(2) } as unknown as EffectContext;
    const ev = reduceEffect({ targets: [target], stat: 'random', gainStat: 'attack', scaling: { base: 5, mult: 0 } }).apply(ctx);
    expect(ev).toEqual([{ type: 'buff', targetId: 10, stat: 'hp', amount: -5 }, { type: 'buff', targetId: 0, stat: 'hp', amount: 5, maxHpGain: 5 }]);
    expect(caster.hp).toBe(35); expect(caster.maxHp).toBe(35);
  });
});

describe('P-random-stat-pool: real casts roll Life too', () => {
  const statsHit = (key: string, seeds: number) => {
    const seen = new Map<string, number>();
    for (let s = 1; s <= seeds; s++) {
      const r = castSpell({ key, seed: s });
      for (const e of r.events as GameEvent[]) if (e.type === 'buff' && e.amount < 0 && r.f.enemies.some((x) => x.id === (e as BuffEvent).targetId)
        && e.stat !== 'mana') seen.set(e.stat, (seen.get(e.stat) ?? 0) + 1);
    }
    return seen;
  };
  it('troop:6775 spell 8165 (2 x DecreaseRandom): all four Skills appear over 40 seeds', () => {
    expect([...statsHit('troop:6775', 40).keys()].sort()).toEqual(['armor', 'attack', 'hp', 'magic']);
  });
  it('troop:7817 spell 9861 (DecreaseRandom RandomEnemy): Life is in the pool', () => {
    expect(statsHit('troop:7817', 40).get('hp') ?? 0).toBeGreaterThan(0);
  });
});
