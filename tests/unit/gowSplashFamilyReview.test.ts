// @ts-expect-error node types are not installed in this project
import fs from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { SKILL_LIBRARY, registerSkillLibrary } from '@engine/skills/library';
import { executePrototype, type SkillPrototype } from '@engine/skills/prototypes';
import { FixedTargetChooser, prototypeChosenTargetMode } from '@engine/skills/targetChooser';
import { ExtensionRegistry } from '@engine/registry';
import { TurnEngine } from '@engine/TurnEngine';
import type { GameEvent, SkillDamageEvent } from '@engine/events';
import { damageFixture } from '../helpers/damageFixture';

const weaponLibrary = new Map<string, SkillPrototype>();
registerSkillLibrary(weaponLibrary);
const source = JSON.parse(fs.readFileSync('data/raw/spells.gow.en.json', 'utf8')).spells as { Id: number; RawData?: string }[];
const steps = (id: number) => JSON.parse(source.find(s => s.Id === id && s.RawData)!.RawData!).SpellSteps as { Type: string; Target?: string }[];
const centres = (events: GameEvent[]) => events.filter((e): e is SkillDamageEvent => e.type === 'skill-damage' && e.range === 'splash' && e.chainIndex === 0).map(e => e.targetId);

// These tests check source steps AND real combat side effects, not full-skill sign-off.
describe('multi-step splash source review', () => {
  it('8154 hits only the chosen enemy and the one immediately below, then statuses only these two', () => {
    expect(steps(8154).map(s => [s.Type, s.Target])).toEqual([
      ['SplashHighDamage', 'FromTarget'], ['SplashHighDamage', 'NextDownFromTarget'],
      ['CauseStun', 'FromTarget'], ['CauseStun', 'NextDownFromTarget'],
      ['CauseBleed', 'FromTarget'], ['CauseBleed', 'NextDownFromTarget'],
    ]);
    // sa-C r9: two native splash steps (FromTarget, NextDownFromTarget) -> the player picks one enemy
    expect(prototypeChosenTargetMode(weaponLibrary.get('8154')!)).toBe('enemyChosen');
    const { ctx, enemies } = damageFixture();
    const events = executePrototype(weaponLibrary.get('8154')!, ctx);
    expect(centres(events)).toEqual([11, 12]);
    expect(enemies.map(c => 1000 - c.hp)).toEqual([6, 18, 18, 6]);
    for (const c of enemies) {
      expect(c.statuses.some(s => s.id === 'stun')).toBe(c.id === 11 || c.id === 12);
      expect(c.statuses.some(s => s.id === 'bleed')).toBe(c.id === 11 || c.id === 12);
    }
  });
  it('8154 goes through the registered weapon skill and TurnEngine target picker', () => {
    const { state, caster, enemies, ctx } = damageFixture();
    caster.skillId = '8154';
    const registry = new ExtensionRegistry();
    registerSkillLibrary(registry.prototypes);
    const engine = new TurnEngine(state, ctx.rng, ctx.nextGemId, registry);
    engine.setTargetChooser(new FixedTargetChooser(11));
    const events = engine.castSkill(caster.id);
    expect(events[0].type).toBe('skill-cast');
    expect(centres(events)).toEqual([11, 12]);
    expect(enemies.map(c => 1000 - c.hp)).toEqual([6, 19, 19, 6]);
  });
  it('8534 checks the originally selected enemy race before choosing the later random centre', () => {
    expect(steps(8534).map(s => s.Type)).toEqual(['ExplodeGems', 'SplashDamage', 'SplashDamage']);
    for (const construct of [true, false]) {
      const { ctx, enemies } = damageFixture();
      enemies[1].troopTypes = construct ? ['Construct'] : [];
      enemies[0].troopTypes = construct ? [] : ['Construct'];
      vi.spyOn(ctx.rng, 'nextInt').mockReturnValue(0);
      const events = executePrototype(SKILL_LIBRARY[8534], ctx);
      expect(centres(events)).toEqual([11, 10]);
      expect(events.filter(e => e.type === 'gem-explode').length > 0).toBe(construct);
      const firstDamage = events.findIndex(e => e.type === 'skill-damage');
      const firstExplode = events.findIndex(e => e.type === 'gem-explode');
      if (construct) expect(firstExplode).toBeLessThan(firstDamage);
    }
  });
  it('native random-pref-other reuses the sole surviving enemy', () => {
    const { ctx } = damageFixture(0, 0, [{}]);
    ctx.chosenTargetId = 10;
    expect(centres(executePrototype(SKILL_LIBRARY[8534], ctx))).toEqual([10, 10]);
  });
  it('8116 preserves native destroy -> heavy splash -> optional light splash order and ratios', () => {
    expect(steps(8116).map(s => s.Type)).toEqual(['DestroyGems', 'SplashHeavyDamage', 'SplashDamage']);
    expect(SKILL_LIBRARY[8116].segments.map(s => s.kind)).toEqual(['gem', 'damage', 'damage']);
    expect(SKILL_LIBRARY[8116].segments.filter(s => s.kind === 'damage').map(s => s.kind === 'damage' ? s.splashRatio : undefined)).toEqual([.75, .25]);
  });
  it('9727, 9843 retain heavy splash ratios across both native waves', () => {
    for (const id of [9727, 9843]) {
      expect(steps(id).filter(s => /Splash/.test(s.Type)).map(s => s.Type)).toEqual(['SplashHeavyDamage', 'SplashHeavyDamage']);
      expect(SKILL_LIBRARY[id].segments.filter(s => s.kind === 'damage').map(s => s.kind === 'damage' ? s.splashRatio : undefined)).toEqual([.75, .75]);
    }
  });
  it('9843 restores mana when the first splash kills a collateral enemy but neither centre dies', () => {
    const { ctx, enemies, caster } = damageFixture(0, 0, [{ hp: 1 }, {}, {}, {}]);
    caster.mana = 0;
    vi.spyOn(ctx.rng, 'nextInt').mockReturnValue(0);
    expect(steps(9843).at(-1)?.Type).toBe('GenerateFullManaConditional');
    const events = executePrototype(SKILL_LIBRARY[9843], ctx);
    expect(centres(events)).toEqual([11, 12]);
    expect(events.some(e => e.type === 'defeat' && e.characterId === 10)).toBe(true);
    expect(enemies[1].defeated).toBe(false);
    expect(enemies[2].defeated).toBe(false);
    expect(caster.mana).toBe(caster.manaCost);
  });
  it('7413 alternative increases Magic, not Mana', () => {
    const { ctx, caster } = damageFixture();
    vi.spyOn(ctx.rng, 'nextInt').mockReturnValue(1);
    const mana = caster.mana, magic = caster.magic;
    executePrototype(SKILL_LIBRARY[7413], ctx);
    expect(caster.magic).toBe(magic + 3);
    expect(caster.mana).toBe(mana);
  });
});





