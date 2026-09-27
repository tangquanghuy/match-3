import { describe, expect, it } from 'vitest';
import { damageEffect, allocateScatterDamage } from '@engine/skills/effects/damage';
import { dmg, skill, inflict } from '@engine/skills/builders';
import { executePrototype, type EffectSegment, type SkillPrototype } from '@engine/skills/prototypes';
import { SKILL_LIBRARY } from '@engine/skills/library';
import { collectWeaponCurated } from '@engine/skills/curated';
import { SeededRNG } from '@engine/rng';
import { attachPassives } from '@engine/traits';
import { getTroopByRef } from '../../src/data/troops';
import { spellDescription } from '../../src/data/combatText';
import { damageFixture, damageCharacter } from '../helpers/damageFixture';

const flatten = (ss: EffectSegment[]): EffectSegment[] => ss.flatMap(s => s.kind === 'oneOf' ? s.options.flatMap(flatten) : [s]);

describe('GoW splash: full primary plus adjacent damage, never a pool', () => {
  it.each([[0.25, 4], [0.5, 8], [0.75, 12]])('ratio %f floors the collateral (%i)', (splashRatio, collateral) => {
    const { ctx, enemies } = damageFixture();
    const ev = damageEffect({ targets: [enemies[1]], scaling: { base: 17, mult: 0 }, range: 'splash', splashRatio }).apply(ctx);
    expect(enemies.map(e => 1000 - e.hp)).toEqual([collateral, 17, collateral, 0]);
    const hits = ev.filter(e => e.type === 'skill-damage');
    expect(hits.map(e => e.targetId)).toEqual([11, 10, 12]);
    expect(hits.slice(1).map(e => e.chainFromId)).toEqual([11, 11]);
  });
  it.each([0, 3])('edge centre %i never wraps around', index => {
    const { ctx, enemies } = damageFixture();
    damageEffect({ targets: [enemies[index]], scaling: { base: 20, mult: 0 }, range: 'splash' }).apply(ctx);
    expect(enemies.map(e => 1000 - e.hp)).toEqual(index === 0 ? [20, 10, 0, 0] : [0, 0, 10, 20]);
  });
  it('dead formation slots compress, no damage leaks to a fourth living unit', () => {
    const { ctx, enemies } = damageFixture(0, 0, [{}, { hp: 0, defeated: true }, {}, {}, {}]);
    damageEffect({ targets: [enemies[2]], scaling: { base: 20, mult: 0 }, range: 'splash' }).apply(ctx);
    expect(enemies.map(e => e.hp)).toEqual([990, 0, 980, 990, 1000]);
  });
  it('killing the primary does not cancel collateral or redistribute its excess', () => {
    const { ctx, enemies } = damageFixture(0, 0, [{}, { hp: 1 }, {}, {}]);
    damageEffect({ targets: [enemies[1]], scaling: { base: 20, mult: 0 }, range: 'splash' }).apply(ctx);
    expect(enemies.map(e => e.hp)).toEqual([990, 0, 990, 1000]);
  });
  it('barrier on the centre absorbs only that hit, not the two collateral hits', () => {
    const { ctx, enemies } = damageFixture();
    enemies[1].statuses = [{ id: 'barrier', turns: 3 }];
    damageEffect({ targets: [enemies[1]], scaling: { base: 20, mult: 0 }, range: 'splash' }).apply(ctx);
    expect(enemies.map(e => 1000 - e.hp)).toEqual([10, 0, 10, 0]);
  });
  it('true splash skips armor and still respects per-target spell reduction', () => {
    const { ctx, enemies } = damageFixture(0, 0, [{ armor: 30 }, { armor: 30 }, { armor: 30, traitIds: ['spellarmor'] }]);
    attachPassives(enemies[2]);
    damageEffect({ targets: [enemies[1]], scaling: { base: 32, mult: 0 }, range: 'splash', trueDamage: true }).apply(ctx);
    expect(enemies.map(e => 1000 - e.hp)).toEqual([16, 32, 12]);
    expect(enemies.map(e => e.armor)).toEqual([30, 30, 30]);
  });
  it('multiple supplied centres each fire a complete splash', () => {
    const { ctx, enemies } = damageFixture();
    damageEffect({ targets: [enemies[1], enemies[2]], scaling: { base: 16, mult: 0 }, range: 'splash' }).apply(ctx);
    expect(enemies.map(e => 1000 - e.hp)).toEqual([8, 24, 24, 8]);
  });
  it('a two-random-centre spell still hits twice when one enemy remains', () => {
    const { ctx, enemies } = damageFixture(0, 0, [{}]);
    const ev = executePrototype(skill(dmg('enemyRandomN', 16, 0, { n: 2, range: 'splash' })), ctx);
    expect(enemies[0].hp).toBe(968);
    expect(ev.filter(e => e.type === 'skill-damage')).toHaveLength(2);
  });
  it('later random waves retarget living enemies after the first wave kills a neighbour', () => {
    const { ctx } = damageFixture(0, 0, [{ hp: 1 }, { hp: 1 }, { hp: 1000 }, { hp: 1000 }]);
    const ev = executePrototype(skill(dmg('enemyRandomN', 20, 0, { n: 3, range: 'splash' })), ctx);
    expect(ev.filter(e => e.type === 'skill-damage' && e.chainIndex === 0)).toHaveLength(3);
  });
});

describe('additional wave tracking',()=>{

  it('tracks only randomly selected splash centres, not every candidate', () => {
    const {ctx} = damageFixture();
    const events = executePrototype(skill(dmg('enemyRandomN', 16, 0, {n:2,range:'splash'}),inflict('silence','lastTargets')),ctx);
    const centres = events.flatMap(e=>e.type==='skill-damage'&&e.chainIndex===0?[e.targetId]:[]);
    const silenced = events.filter(e=>e.type==='status-apply').map(e=>e.targetId);
    expect(centres).toHaveLength(2);
    expect(silenced).toEqual(centres);
  });
  it('a fully blocked second wave does not reuse the first wave hit list for statuses',()=>{
    const {ctx,enemies} = damageFixture();
    enemies[3].statuses=[{id:'barrier',turns:3}];
    const events=executePrototype(skill(dmg('enemyFront',10,0),dmg('enemyLast',10,0),inflict('frozen','lastDamaged')),ctx);
    expect(events.some(e=>e.type==='status-apply')).toBe(false);
    expect(ctx.castTracking?.lastDamage).toBe(0);
  });
});

describe('GoW scatter: one random shared pool', () => {

  it('applies a team-wide conditional bonus to the pool once, not once per enemy',()=>{
    const {ctx,enemies}=damageFixture(); enemies[0].troopTypes=['Elf'];
    const events=executePrototype(skill(dmg('enemyAll',10,0,{range:'scatter',condBonus:{n:10,cond:{kind:'enemyRacePresent',race:'Elf'}}})),ctx);
    expect(events.filter(e=>e.type==='skill-damage').reduce((n,e)=>n+e.damage,0)).toBe(20);
  });
  it('allocates a globally multiplied pool before avoiding overkill',()=>{
    const {ctx,enemies}=damageFixture(0,0,[{hp:1,troopTypes:['Elf']},{}]);
    const [first, second] = enemies;
    executePrototype(skill(dmg('enemyAll',10,0,{range:'scatter',condMult:{times:2,cond:{kind:'enemyRacePresent',race:'Elf'}}})),ctx);
    expect(first.hp).toBe(0);
    expect(second.hp).toBe(981);
  });

  it.each([0, 1, 3, 16, 100, 5000])('conserves the %i-point pool and is deterministic', amount => {
    const targets = [10, 11, 12, 13].map(id => damageCharacter(id));
    const a = allocateScatterDamage(amount, targets, new SeededRNG(7));
    expect(a.reduce((x,y) => x+y, 0)).toBe(amount);
    expect(a).toEqual(allocateScatterDamage(amount, targets, new SeededRNG(7)));
    expect(a.every(n => n >= 0 && Number.isInteger(n))).toBe(true);
  });
  it('changes with seed instead of using fixed formation weights', () => {
    const targets = [10, 11, 12, 13].map(id => damageCharacter(id));
    expect(allocateScatterDamage(100, targets, new SeededRNG(1))).not.toEqual(allocateScatterDamage(100, targets, new SeededRNG(99)));
  });
  it('avoids early overkill while another target has unallocated health', () => {
    const targets = [damageCharacter(10, { hp: 1 }), damageCharacter(11)];
    expect(allocateScatterDamage(100, targets, new SeededRNG(1))).toEqual([1, 99]);
  });
  it('distributes post-capacity excess over the original targets, even ones already saturated', () => {
    // Developer explanation: https://community.gemsofwar.com/t/55491/7
    const targets = [damageCharacter(10, { hp: 5 }), damageCharacter(11, { hp: 36 })];
    const shares = allocateScatterDamage(115, targets, new SeededRNG(7));
    expect(shares[0]).toBeGreaterThan(5);
    expect(shares[1]).toBeGreaterThan(36);
    expect(shares[0] + shares[1]).toBe(115);
  });
  it('evaluates modifiers and rangeSpec once, and only damages supplied targets', () => {
    const { ctx, enemies } = damageFixture();
    const ev = damageEffect({ targets: [enemies[1], enemies[3]], scaling: { base: 99, mult: 0 },
      rangeSpec: { min: { base: 12, mult: 0 }, max: { base: 12, mult: 0 } },
      modifiers: [{ mod: { kind: 'multiplier', a: 2 }, source: { kind: 'selfStat', stat: 'magic' } }], range: 'scatter' }).apply(ctx);
    expect(ev.filter(e => e.type === 'skill-damage').reduce((n,e) => n+e.damage, 0)).toBe(34);
    expect(enemies[0].hp).toBe(1000); expect(enemies[2].hp).toBe(1000);
  });
  it('barrier consumes once; its allocated share is not transferred to other enemies', () => {
    const { ctx, enemies } = damageFixture();
    const shares = allocateScatterDamage(100, enemies, new SeededRNG(42));
    enemies[0].statuses = [{ id: 'barrier', turns: 3 }];
    damageEffect({ targets: enemies, scaling: { base: 100, mult: 0 }, range: 'scatter' }).apply(ctx);
    expect(enemies.map(e => 1000-e.hp)).toEqual([0, ...shares.slice(1)]);
    expect(enemies[0].statuses).toEqual([]);
  });
  it('single surviving target takes the whole pool, including against spell armor', () => {
    const { ctx, enemies } = damageFixture(0,0,[{ hp: 10, traitIds: ['spellarmor'] }]);
    attachPassives(enemies[0]);
    damageEffect({ targets: enemies, scaling: { base: 100, mult: 0 }, range: 'scatter' }).apply(ctx);
    expect(enemies[0].defeated).toBe(true);
  });
  it('true scatter bypasses armor; drain uses the actual distributed damage events', () => {
    const { ctx, caster, enemies } = damageFixture(0,0,[{ armor: 20 }, { armor: 20 }]);
    caster.hp = 900;
    const ev = damageEffect({ targets: enemies, scaling: { base: 40, mult: 0 }, range: 'scatter', trueDamage: true, drain: true }).apply(ctx);
    expect(enemies.map(e=>e.armor)).toEqual([20,20]);
    expect(enemies.reduce((n,e)=>n+1000-e.hp,0)).toBe(40);
    expect(ev.some(e=>e.type==='buff' && e.stat==='hp' && e.amount===40)).toBe(true);
  });
});

describe('catalog registration and descriptions', () => {
  it('Rowanne distributes M+3+2*armor ONCE, not once per enemy', () => {
    const { ctx, caster, enemies } = damageFixture();
    caster.magic = 6; caster.armor = 17;
    const troop = getTroopByRef('Rowanne')!;
    const ev = executePrototype(SKILL_LIBRARY[troop.spell.id], ctx);
    expect(ev.filter(e=>e.type==='skill-damage').reduce((n,e)=>n+e.damage,0)).toBe(43);
    expect(enemies.reduce((n,e)=>n+1000-e.hp,0)).toBe(43);
  });
  it('Frostfire King fires two normal splash waves with their respective statuses', () => {
    const { ctx } = damageFixture();
    const ev = executePrototype(SKILL_LIBRARY[8220], ctx);
    expect(ev.filter(e=>e.type==='skill-damage' && e.chainIndex===0)).toHaveLength(2);
    expect(ev.some(e=>e.type==='status-apply' && e.statusId==='burning')).toBe(true);
    expect(ev.some(e=>e.type==='status-apply' && e.statusId==='frozen')).toBe(true);
  });
  it('restores distinct heavy/light waves for Obsidius and normal/light multi-target troops', () => {
    const waves = SKILL_LIBRARY[8116].segments.filter(s=>s.kind==='damage');
    expect(waves.map(s=>s.splashRatio)).toEqual([0.75,0.25]);
    expect(SKILL_LIBRARY[7208].segments[0]).toMatchObject({ range:'splash', splashRatio:0.25 });
    expect(spellDescription(8116, '造成溅射伤害，然后造成溅射伤害')).toBe('造成重度溅射伤害，然后造成轻度溅射伤害');
  });
  it('all displayed scatter clauses use scatter in the final troop and weapon registries', () => {
    const combined: Record<number, SkillPrototype> = {...SKILL_LIBRARY,...Object.fromEntries(collectWeaponCurated().byId)};
    expect(combined[7069].segments[0]).toMatchObject({range:'scatter'});
    expect(SKILL_LIBRARY[9493].segments.filter(s=>s.kind==='damage' && s.range==='scatter')).toHaveLength(2);
    for (const id of [7157, 7007, 7035, 7265, 7778, 9493, 7069, 8721]) {
      expect(flatten(combined[id].segments).some(s=>s.kind==='damage' && s.range==='scatter'), `spell ${id}`).toBe(true);
    }
  });
});
