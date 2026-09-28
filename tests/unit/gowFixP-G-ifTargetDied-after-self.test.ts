// sa-P round 9: P-G-ifTargetDied-after-self. ifTargetDied (and its negation lastTargetSurvived) judge the victim of the
// last targeting segment that is not itself kill-gated; a surviving self / ally target of a later step falls back to
// the last enemy-side target. Native AddForKill on consecutive steps (IncreaseAllStats x4, RandomStatusEffect x3) all
// see the same kill.
import { describe, it, expect } from 'vitest';
import { castSpell, registry, DEFAULT_ENEMIES } from '../helpers/gowCast';
import { skill, trueDmg, attack, armor, magic, reduce } from '@engine/skills/builders';
import type { SkillPrototype } from '@engine/skills/prototypes';
import type { Character } from '@engine/types';

const hp1: Partial<Character>[] = DEFAULT_ENEMIES.map((e) => ({ ...e, hp: 1, maxHp: 1, armor: 0 }));
const caster: Partial<Character> = { attack: 10, armor: 10, magic: 10, statuses: [] };
function cast(proto: SkillPrototype, enemies: Partial<Character>[] = hp1) {
  registry.prototypes.set('tst-pg-itd', proto);
  return castSpell({ skill: 'tst-pg-itd', cost: 10, target: 11, enemies, caster });
}
const selfChain = skill(
  trueDmg('enemyChosen', 1, 1),
  attack('allySelf', 4, 0, { ifTargetDied: true }),
  armor('allySelf', 4, 0, { ifTargetDied: true }),
  magic('allySelf', 4, 0, { ifTargetDied: true }),
);

describe('P-G-ifTargetDied-after-self', () => {
  it('kill -> every consecutive self step applies (was: only the first)', () => {
    const { f } = cast(selfChain);
    expect([f.caster.attack, f.caster.armor, f.caster.magic]).toEqual([14, 14, 14]);
  });
  it('no kill -> no self step applies', () => {
    const { f } = cast(selfChain, DEFAULT_ENEMIES);
    expect([f.caster.attack, f.caster.armor, f.caster.magic]).toEqual([10, 10, 10]);
  });
  it('an unconditional self step between the hit and the gated step does not hide the kill', () => {
    const { f } = cast(skill(trueDmg('enemyChosen', 1, 1), armor('allySelf', 1, 0), attack('allySelf', 5, 0, { ifTargetDied: true })));
    expect([f.caster.armor, f.caster.attack]).toEqual([11, 15]);
  });
  it('chained enemyAll kill-gated steps all fire (troop:7746 pattern)', () => {
    const enemies = DEFAULT_ENEMIES.map((e, i) => ({ ...e, attack: 20, ...(i === 1 ? { hp: 1, maxHp: 1, armor: 0 } : {}) }));
    const { f } = cast(skill(
      trueDmg('enemyChosen', 1, 1),
      reduce('enemyAll', 'attack', 1, 0, { ifTargetDied: true }),
      reduce('enemyAll', 'attack', 1, 0, { ifTargetDied: true }),
      reduce('enemyAll', 'attack', 1, 0, { ifTargetDied: true }),
    ), enemies);
    expect(f.enemies.filter((e) => !e.defeated).map((e) => e.attack)).toEqual([17, 17, 17]);
  });
  it('lastTargetSurvived after a self step judges the enemy, not the caster', () => {
    const p = skill(trueDmg('enemyChosen', 1, 1), armor('allySelf', 1, 0), attack('allySelf', 5, 0, { ifCond: { kind: 'lastTargetSurvived' } }));
    expect(cast(p).f.caster.attack).toBe(10);
    expect(cast(p, DEFAULT_ENEMIES).f.caster.attack).toBe(15);
  });
  it('real skill troop:6095: kill -> Attack, Armor, Life and Magic each +4', () => {
    const { f } = castSpell({ key: 'troop:6095', enemies: hp1, caster });
    expect([f.caster.attack, f.caster.armor, f.caster.magic]).toEqual([14, 14, 14]);
  });
  it('real skill troop:7746 (9731): kill -> the 100% random status lands on every other enemy', () => {
    const enemies = DEFAULT_ENEMIES.map((e, i) => ({ ...e, statuses: [], ...(i === 1 ? { hp: 1, maxHp: 1, armor: 0 } : {}) }));
    const { f } = castSpell({ key: 'troop:7746', target: 11, enemies });
    for (const e of f.enemies.filter((x) => !x.defeated)) expect(e.statuses.length).toBeGreaterThan(0);
  });
});
