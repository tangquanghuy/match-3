/** Scoped native StealLife mechanics: no whole-skill acceptance implied. */
import { describe, expect, it } from 'vitest';
import { damageEffect } from '@engine/skills/effects/damage';
import { executePrototype } from '@engine/skills/prototypes';
import { SKILL_LIBRARY } from '@engine/skills/library';
import { attachPassives } from '@engine/traits';
import { damageFixture } from '../helpers/damageFixture';
// @ts-expect-error Node audit source snapshots
import fs from 'node:fs';
// @ts-expect-error Native parser lives outside application tsconfig
import { indexNativeSpells } from '../../scripts/lib/gow-native-source.mjs';
import { registerSkillLibrary } from '@engine/skills/library';
import { ExtensionRegistry } from '@engine/registry';
import { TurnEngine } from '@engine/TurnEngine';
import type { EffectSegment } from '@engine/skills/prototypes';

describe('native StealLife shared damage/life transfer', () => {
  it('bypasses Armor, and grows both current and maximum caster Life even at full Life', () => {
    const { ctx, caster, enemies } = damageFixture(0, 0, [{ hp: 30, armor: 90 }]);
    caster.hp = caster.maxHp = 100;
    const events = damageEffect({ targets: enemies, scaling: { base: 12, mult: 0 }, drain: true }).apply(ctx);
    expect([enemies[0].hp, enemies[0].armor]).toEqual([18, 90]);
    expect([caster.hp, caster.maxHp]).toEqual([112, 112]);
    expect(events).toContainEqual({ type: 'buff', targetId: caster.id, stat: 'hp', amount: 12, maxHpGain: 12 });
  });
  it('a Barrier consumes the hit but transfers no Life', () => {
    const { ctx, caster, enemies } = damageFixture(0, 0, [{ hp: 15, armor: 80, statuses: [{ id: 'barrier', turns: 3 }] }]);
    caster.hp = caster.maxHp = 100;
    const events = damageEffect({ targets: enemies, scaling: { base: 20, mult: 0 }, drain: true }).apply(ctx);
    expect([enemies[0].hp, enemies[0].armor]).toEqual([15, 80]);
    expect(enemies[0].statuses).toEqual([]);
    expect([caster.hp, caster.maxHp]).toEqual([100, 100]);
    expect(events.filter(e => e.type === 'buff' || e.type === 'skill-damage')).toEqual([]);
  });
  it('caps each target transfer at Life actually lost, not nominal overkill', () => {
    const { ctx, caster, enemies } = damageFixture(0, 0, [{ hp: 3, armor: 80 }, { hp: 9, armor: 80 }]);
    caster.hp = 40; caster.maxHp = 100;
    const events = damageEffect({ targets: enemies, scaling: { base: 20, mult: 0 }, range: 'all', drain: true }).apply(ctx);
    expect(enemies.map(e => [e.hp, e.armor, e.defeated])).toEqual([[0, 80, true], [0, 80, true]]);
    expect([caster.hp, caster.maxHp]).toEqual([52, 112]);
    expect(events.find(e => e.type === 'buff')).toMatchObject({ amount: 12, maxHpGain: 12 });
  });
  it('counts post-resistance Life lost; a resisted or blocked hit gives no transfer', () => {
    const { ctx, caster, enemies } = damageFixture(0, 0, [
      { hp: 30, armor: 90, traitIds: ['spellarmor'] },
      { hp: 30, armor: 90, statuses: [{ id: 'barrier', turns: 3 }] },
    ]);
    attachPassives(enemies[0]); caster.hp = caster.maxHp = 100;
    damageEffect({ targets: enemies, scaling: { base: 20, mult: 0 }, range: 'all', drain: true }).apply(ctx);
    expect([enemies[0].hp, enemies[1].hp, caster.hp, caster.maxHp]).toEqual([15, 30, 115, 115]);
  });
  it('Draakulis 7302 registered multi-target spell shares the same rule', () => {
    const { ctx, caster, enemies } = damageFixture(0, 0, [
      { hp: 3, armor: 90 }, { hp: 20, armor: 90, statuses: [{ id: 'barrier', turns: 3 }] },
      { hp: 20, armor: 90 }, { hp: 20, armor: 90 },
    ]);
    const victims = [...enemies]; // prototype may remove defeated troops from the formation array
    caster.hp = caster.maxHp = 100; caster.magic = 11;
    const events = executePrototype(SKILL_LIBRARY[7302], ctx); // 11 Magic + 5 = 16 per enemy
    expect(victims.map(e => e.hp)).toEqual([0, 20, 4, 4]);
    expect(victims.map(e => e.armor)).toEqual([90, 90, 90, 90]);
    expect([caster.hp, caster.maxHp]).toEqual([135, 135]);
    expect(events.find(e => e.type === 'buff')).toMatchObject({ amount: 35, maxHpGain: 35 });
  });
  it('7302 real TurnEngine cast applies Life growth and pays its stored mana cost', () => {
    const { state, ctx, caster, enemies } = damageFixture(0, 0, [{ hp: 30, armor: 90 }]);
    caster.skillId = '7302'; caster.mana = caster.manaCost = 20;
    caster.hp = caster.maxHp = 100; caster.magic = 11;
    const local = new ExtensionRegistry(); registerSkillLibrary(local.prototypes);
    const engine = new TurnEngine(state, ctx.rng, ctx.nextGemId, local);
    engine.skullChance = 0;
    const events = engine.castSkill(caster.id);
    expect(enemies[0].hp).toBe(14);
    expect(enemies[0].armor).toBe(90);
    expect([caster.hp, caster.maxHp, caster.mana]).toEqual([116, 116, 0]);
    expect(events).toContainEqual({ type: 'buff', targetId: caster.id, stat: 'hp', amount: 16, maxHpGain: 16 });
  });
  it('split distribution also transfers actual Life (not the total nominal pool)', () => {
    const { ctx, caster, enemies } = damageFixture(0, 0, [{ hp: 2, armor: 20 }, { hp: 50, armor: 20 }]);
    caster.hp = caster.maxHp = 100;
    damageEffect({ targets: enemies, scaling: { base: 20, mult: 0 }, split: 2, drain: true }).apply(ctx);
    expect(enemies.map(e => e.hp)).toEqual([0, 40]);
    expect([caster.hp, caster.maxHp]).toEqual([112, 112]);
  });
});

const native = indexNativeSpells(JSON.parse(fs.readFileSync('data/raw/spells.gow.en.json', 'utf8')).spells);
const registry = new ExtensionRegistry(); registerSkillLibrary(registry.prototypes);
const segments = (ss: EffectSegment[]): EffectSegment[] => ss.flatMap(s =>
  s.kind === 'choose' || s.kind === 'oneOf' ? s.options.flatMap(segments) : [s]);

describe('native StealLife prototype inventory (structural rule, not whole-skill acceptance)', () => {
  it('every installed native StealLife source uses the shared drain primitive', () => {
    const entries = [...native.entries()].filter(([id, source]: [number, { raw: { SpellSteps: { Type: string }[] } }]) =>
      registry.prototypes.has(String(id)) && source.raw.SpellSteps.some(s => s.Type === 'StealLife'));
    expect(entries.length).toBeGreaterThan(0);
    const missing = entries.flatMap(([id]: [number]) =>
      segments(registry.prototypes.get(String(id))!.segments).some(s => s.kind === 'damage' && s.drain) ? [] : [id]);
    expect(missing).toEqual([]);
    expect(entries).toHaveLength(34);
    const extra = [...registry.prototypes].flatMap(([key, proto]) => {
      const id = Number(key), source = native.get(id);
      if (!source || !segments(proto.segments).some(s => s.kind === 'damage' && s.drain)) return [];
      return source.raw.SpellSteps.some((step: { Type: string }) => step.Type === 'StealLife') ? [] : [key];
    });
    expect(extra).toEqual([]);
  });
});

