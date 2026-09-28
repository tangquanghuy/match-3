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
  // curated sweep: castEnemyDied workarounds switched back to ifTargetDied (native AddForKill on the damaged target)
  it.each([
    ['troop:6095', { attack: 14, armor: 14, magic: 14 }],
    ['weapon:1130', { attack: 20, armor: 20, magic: 20 }],
    ['troop:6734', { attack: 17, armor: 17, magic: 17 }],
    ['troop:7724', { attack: 40, armor: 40, magic: 40 }],
    ['troop:6881', { armor: 34 }],
    ['troop:6334', { attack: 18 }],
    ['troop:6050', { attack: 14 }],
  ] as const)('%s kill -> every kill bonus applies', (key, want) => {
    const { f } = castSpell({ key, enemies: hp1, caster, target: 11 });
    for (const [stat, v] of Object.entries(want)) expect(f.caster[stat as 'attack']).toBe(v);
  });
  it.each(['troop:6095', 'weapon:1130', 'troop:6734', 'troop:6334'])('%s no kill -> no bonus', (key) => {
    const { f } = castSpell({ key, caster, target: 11 });
    expect(f.caster.attack).toBe(10);
  });
  it('troop:7700 (9661) kill -> other enemies lose all Armor, caster Blessed and Enchanted', () => {
    const enemies = DEFAULT_ENEMIES.map((e, i) => ({ ...e, statuses: [], ...(i === 1 ? { hp: 1, maxHp: 1, armor: 0 } : {}) }));
    const { f } = castSpell({ key: 'troop:7700', target: 11, enemies, caster });
    expect(f.enemies.filter((e) => !e.defeated).map((e) => e.armor)).toEqual([0, 0, 0]);
    expect(f.caster.statuses.map((s) => s.id).sort()).toEqual(['blessed', 'enchanted']);
  });
  it('troop:6819 (8223) kill -> allies cleansed and enemy positives dispelled', () => {
    const enemies = DEFAULT_ENEMIES.map((e, i) => (i === 1 ? { ...e, hp: 1, maxHp: 1, armor: 0 } : e));
    const { f } = castSpell({ key: 'troop:6819', target: 11, enemies });
    expect(f.enemies.filter((e) => !e.defeated).flatMap((e) => e.statuses.map((s) => s.id))).not.toContain('rage');
    expect(f.allies[0].statuses.map((s) => s.id)).not.toContain('poison');
  });
  it('real skill troop:7746 (9731): kill -> the 100% random status lands on every other enemy', () => {
    const enemies = DEFAULT_ENEMIES.map((e, i) => ({ ...e, statuses: [], ...(i === 1 ? { hp: 1, maxHp: 1, armor: 0 } : {}) }));
    const { f } = castSpell({ key: 'troop:7746', target: 11, enemies });
    for (const e of f.enemies.filter((x) => !x.defeated)) expect(e.statuses.length).toBeGreaterThan(0);
  });
});
