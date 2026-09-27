// @ts-expect-error node types are not installed in this project
import fs from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { SKILL_LIBRARY } from '@engine/skills/library';
import { executePrototype } from '@engine/skills/prototypes';
import { FixedTargetChooser, prototypeChosenTargetMode } from '@engine/skills/targetChooser';
import { FixedCellChooser, prototypeNeedsCell } from '@engine/skills/cellChooser';
import { TurnEngine } from '@engine/TurnEngine';
import { ExtensionRegistry } from '@engine/registry';
import { SeededRNG } from '@engine/rng';
import type { GameEvent, SkillDamageEvent } from '@engine/events';
import { TROOPS } from '../../src/data/troops';
import { damageFixture } from '../helpers/damageFixture';

const centres = (events: GameEvent[]) => events.filter((e): e is SkillDamageEvent => e.type === 'skill-damage' && e.range === 'splash' && e.chainIndex === 0);
function engineFixture(spellId: number) {
  const fixture = damageFixture();
  fixture.caster.skillId = String(spellId);
  fixture.caster.mana = fixture.caster.manaCost = TROOPS.find(t => t.spell.id === spellId)!.manaCost;
  const registry = new ExtensionRegistry();
  registry.prototypes.set(String(spellId), SKILL_LIBRARY[spellId]);
  const engine = new TurnEngine(fixture.state, fixture.ctx.rng, fixture.ctx.nextGemId, registry);
  engine.skullChance = 0;
  return { ...fixture, engine };
}

describe('Mistralus: native independent splash probabilities', () => {
  const proto = SKILL_LIBRARY[8294];
  it('derives four probabilities from original SpellSteps, not a uniform nRange', () => {
    const raw = JSON.parse(fs.readFileSync('data/raw/spells.gow.en.json', 'utf8')).spells
      .find((s: { Id: number; RawData?: string }) => s.Id === 8294 && s.RawData);
    const expected = JSON.parse(raw.RawData).SpellSteps.filter((s: { Type: string }) => /Splash/.test(s.Type))
      .map((s: { PercentageChance?: number }) => (s.PercentageChance ?? 100) / 100);
    expect(expected).toEqual([1, .9, .35, .25]);
    expect(proto.segments[0]).toMatchObject({ target: 'enemyRandomN', splashChances: expected, splashRatio: .5 });
    expect(proto.segments[0]).not.toHaveProperty('nRange');
    expect(prototypeChosenTargetMode(proto)).toBeNull();
  });
  it.each(Array.from({ length: 8 }, (_, mask) => mask))('independent success combination %i, with no nested stop', mask => {
    const { ctx } = damageFixture();
    // Isolate target/shuffle draws from the three probability draws.
    vi.spyOn(ctx.rng, 'nextInt').mockReturnValue(0);
    const rolls = [0, 1, 2].map(i => mask & (1 << i) ? 0 : .99);
    const chanceRng = vi.spyOn(ctx.rng, 'next');
    for (const roll of rolls) chanceRng.mockReturnValueOnce(roll);
    const ev = executePrototype(proto, ctx);
    const count = 1 + [0, 1, 2].filter(i => mask & (1 << i)).length;
    expect(centres(ev)).toHaveLength(count);
    expect(centres(ev).map(e => e.targetId)).toEqual([10, 11, 12, 13].slice(0, count));
    expect(centres(ev).every(e => e.damage === 15)).toBe(true);
    expect(ev.filter((e): e is SkillDamageEvent => e.type === 'skill-damage' && e.chainIndex !== 0).every(e => e.damage === 7)).toBe(true);
    expect(chanceRng).toHaveBeenCalledTimes(3);
    expect(ev.filter(e => e.type === 'reshuffle')).toHaveLength(1);
    expect(ev.filter(e => e.type === 'extra-turn')).toHaveLength(1);
  });
  it.each([.9, .35, .25])('the chance threshold %f is exclusive', threshold => {
    const { ctx } = damageFixture();
    vi.spyOn(ctx.rng, 'nextInt').mockReturnValue(0);
    const r = vi.spyOn(ctx.rng, 'next');
    for (const p of [.9, .35, .25]) r.mockReturnValueOnce(p === threshold ? threshold : .99);
    expect(centres(executePrototype(proto, ctx))).toHaveLength(1);
  });
  it('repeats on the last survivor, retaining all four successful waves', () => {
    const { ctx, enemies } = damageFixture(0, 0, [{}]);
    vi.spyOn(ctx.rng, 'nextInt').mockReturnValue(0);
    vi.spyOn(ctx.rng, 'next').mockReturnValue(0);
    expect(centres(executePrototype(proto, ctx))).toHaveLength(4);
    expect(enemies[0].hp).toBe(940);
  });
  it('retargets after a primary and neighbour die, ignoring defeated slots', () => {
    const { ctx, enemies } = damageFixture(0, 0, [{ hp: 1 }, { hp: 1 }, {}, {}]);
    const fallen = enemies.slice(0, 2);
    vi.spyOn(ctx.rng, 'nextInt').mockReturnValue(0);
    vi.spyOn(ctx.rng, 'next').mockReturnValue(0);
    const ev = executePrototype(proto, ctx);
    expect(centres(ev).map(e => e.targetId)).toEqual([10, 12, 13, 12]);
    expect(fallen.every(e => e.defeated)).toBe(true);
    expect(ctx.castTracking?.lastTargets?.map(t => t.id)).toEqual([10, 12, 13, 12]);
  });
  it('same seed reproduces damage targets, probabilities and shuffle', () => {
    const a = damageFixture(), b = damageFixture();
    a.ctx.rng = new SeededRNG(8294); b.ctx.rng = new SeededRNG(8294);
    expect(executePrototype(proto, a.ctx)).toEqual(executePrototype(proto, b.ctx));
  });
  it('casts through TurnEngine without a target prompt and preserves extra turn', () => {
    const { engine, caster } = engineFixture(8294);
    const choose = vi.fn(() => { throw new Error('Mistralus must not ask for an enemy'); });
    engine.setTargetChooser({ choose });
    const ev = engine.castSkill(caster.id);
    expect(ev[0].type).toBe('skill-cast');
    expect(choose).not.toHaveBeenCalled();
    expect(centres(ev).length).toBeGreaterThanOrEqual(1);
    expect(centres(ev).length).toBeLessThanOrEqual(4);
    expect(ev.some(e => e.type === 'reshuffle')).toBe(true);
    expect(ev.some(e => e.type === 'extra-turn')).toBe(true);
  });
});

describe('restored random/chosen targeting in the battle pipeline', () => {
  it('Rhynax hits the chosen third enemy, not the front, with normal collateral', () => {
    const { engine, caster, enemies } = engineFixture(7132);
    engine.setTargetChooser(new FixedTargetChooser(12));
    const ev = engine.castSkill(caster.id);
    expect(prototypeChosenTargetMode(SKILL_LIBRARY[7132])).toBe('enemyChosen');
    expect(centres(ev).map(e => e.targetId)).toEqual([12]);
    expect(enemies.map(e => 1000 - e.hp)).toEqual([0, 6, 13, 6]);
    expect(caster.mana).toBe(0);
  });
  it('Rhynax can also choose the last enemy, with no wraparound', () => {
    const { engine, caster, enemies } = engineFixture(7132);
    engine.setTargetChooser(new FixedTargetChooser(13));
    engine.castSkill(caster.id);
    expect(enemies.map(e => 1000 - e.hp)).toEqual([0, 0, 6, 13]);
  });
  it('Goblin Rocket ignores a supplied enemy choice and uses a random living centre', () => {
    const { ctx, enemies } = damageFixture();
    ctx.chosenTargetId = 10; ctx.chosenCell = { row: 3, col: 3 };
    vi.spyOn(ctx.rng, 'nextInt').mockImplementation(n => n - 1);
    const ev = executePrototype(SKILL_LIBRARY[7243], ctx);
    expect(centres(ev).map(e => e.targetId)).toEqual([13]);
    expect(enemies.map(e => 1000 - e.hp)).toEqual([0, 0, 3, 14]);
    expect(ev.some(e => e.type === 'extra-turn')).toBe(true);
    expect(TROOPS.find(t => t.spell.id === 7243)!.spell.description).toContain('随机敌人');
  });
  it('Goblin Rocket prompts only for a gem, explodes it, and grants its extra turn', () => {
    const { engine, caster } = engineFixture(7243);
    const choose = vi.fn(() => { throw new Error('Goblin Rocket must not ask for an enemy'); });
    engine.setTargetChooser({ choose });
    const cellChooser = new FixedCellChooser({ row: 3, col: 3 });
    const cellSpy = vi.spyOn(cellChooser, 'choose');
    engine.setCellChooser(cellChooser);
    expect(prototypeChosenTargetMode(SKILL_LIBRARY[7243])).toBeNull();
    expect(prototypeNeedsCell(SKILL_LIBRARY[7243])).toBe(true);
    const ev = engine.castSkill(caster.id);
    expect(choose).not.toHaveBeenCalled();
    expect(cellSpy).toHaveBeenCalledOnce();
    expect(centres(ev)).toHaveLength(1);
    expect(ev.some(e => e.type === 'extra-turn')).toBe(true);
    expect(ev.some(e => e.type === 'gem-destroy' || e.type === 'gem-explode')).toBe(true);
  });
});
