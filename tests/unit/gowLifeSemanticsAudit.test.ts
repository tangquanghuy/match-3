// Scoped direct-Life semantics, not a whole-skill acceptance certificate.
// @ts-expect-error Node audit source snapshots
import fs from 'node:fs';
import { describe, it, expect, vi } from 'vitest';
// @ts-expect-error Native parser lives outside application tsconfig
import { indexNativeSpells } from '../../scripts/lib/gow-native-source.mjs';
import { registerSkillLibrary, getSkillPrototype } from '@engine/skills/library';
import { executePrototype } from '@engine/skills/prototypes';
import type { EffectSegment, BuffSegment } from '@engine/skills/prototypes';
import { gainLife, heal, skill } from '@engine/skills/builders';
import { GOW_LIFE_RULES, applyGowLifeRule } from '@engine/skills/gowLifeRules';
import { ExtensionRegistry } from '@engine/registry';
import { TurnEngine } from '@engine/TurnEngine';
import { BattleNarrator } from '../../src/render/BattleNarrator';
import { PlayerSide } from '@engine/types';
import { FixedBranchChooser } from '@engine/skills/branchChooser';
import { damageFixture, damageCharacter } from '../helpers/damageFixture';
import weapons from '../../src/data/weapons.json';
const native = indexNativeSpells(JSON.parse(fs.readFileSync('data/raw/spells.gow.en.json', 'utf8')).spells);
const registry = new ExtensionRegistry(); registerSkillLibrary(registry.prototypes);
const flat = (ss: EffectSegment[]): EffectSegment[] => ss.flatMap(s => s.kind === 'choose' || s.kind === 'oneOf' ? s.options.flatMap(flat) : [s]);
const hpSegments = (id: number) => flat(registry.prototypes.get(String(id))!.segments).filter((s): s is BuffSegment => s.kind === 'buff' && s.stat === 'hp');
function realCast(id: number, hp = 40, chosen = 1, branch = 0) {
  const f = damageFixture(); f.caster.hp = hp; f.caster.maxHp = 100;
  const weapon = weapons.find(w => w.spell.id === id);
  f.caster.skillId = weapon ? `gw_${weapon.referenceName}` : String(id);
  f.caster.mana = f.caster.manaCost = weapon?.manaCost ?? native.get(id).raw.Cost;
  const ally = damageCharacter(1, { hp: 40, maxHp: 100 }); f.state.teams[PlayerSide.Left].characters.push(ally);
  const engine = new TurnEngine(f.state, f.ctx.rng, f.ctx.nextGemId, registry); engine.skullChance = 0;
  engine.setTargetChooser({ choose: () => chosen }); engine.setBranchChooser(new FixedBranchChooser(branch));
  return { ...f, ally, engine, cast: () => engine.castSkill(f.caster.id) };
}
describe('source-backed IncreaseHealth / IncreaseAllStats versus Heal (direct hp buffs)', () => {
  it('reviews every installed direct Life buff without including the custom roster', () => {
    expect(Object.keys(GOW_LIFE_RULES)).toHaveLength(219);
    for (const id of [20001, 20002, 20003, 20004, 20005, 20006, 20007]) expect(GOW_LIFE_RULES[id]).toBeUndefined();
  });
  for (const [idText, modes] of Object.entries(GOW_LIFE_RULES)) it(`native spell ${idText}: registered hp modes and isolated full/injured-Life behavior`, () => {
    const id = Number(idText), segments = hpSegments(id);
    const types = native.get(id).raw.SpellSteps.filter((s: { Type: string }) => ['IncreaseHealth', 'IncreaseAllStats', 'Heal'].includes(s.Type)).map((s: { Type: string }) => s.Type);
    expect(segments.map(s => s.lifeMode)).toEqual(modes);
    const expectedModes = [...new Set(types.map((t: string) => t === 'Heal' ? 'heal' : 'gain'))];
    if (expectedModes.length === 1) expect(modes.every(m => m === expectedModes[0])).toBe(true);
    else { expect([7025, 7161]).toContain(id); expect(modes).toEqual(['gain', 'heal']); }
    for (const segment of segments) for (const initialHp of [40, 100]) {
      // Deliberate segment isolation: does not attest source amount, targeting, boost or branches.
      const f = damageFixture(); f.caster.hp = initialHp; f.caster.maxHp = 100;
      executePrototype(skill({ kind: 'buff', target: 'allySelf', stat: 'hp', scaling: { base: 7, mult: 0 }, lifeMode: segment.lifeMode }), f.ctx);
      expect(f.caster.hp).toBe(segment.lifeMode === 'gain' ? initialHp + 7 : Math.min(100, initialHp + 7));
      expect(f.caster.maxHp).toBe(segment.lifeMode === 'gain' ? 107 : 100);
    }
  });
  it('explicit Life growth preserves missing Life and is separate from legacy healing modifiers', () => {
    for (const statuses of [[], [{ id: 'bleed', turns: 3 }], [{ id: 'disease', turns: 3 }], [{ id: 'bleed', turns: 3 }, { id: 'disease', turns: 3 }]]) {
      const f = damageFixture(); f.caster.hp = 40; f.caster.maxHp = 100; f.caster.statuses = statuses;
      const events = executePrototype(skill(gainLife('allySelf', 7, 0)), f.ctx);
      expect([f.caster.hp, f.caster.maxHp, f.caster.maxHp - f.caster.hp]).toEqual([47, 107, 60]);
      expect(events).toContainEqual({ type: 'buff', targetId: 0, stat: 'hp', amount: 7, maxHpGain: 7 });
    }
  });
  it('legacy/custom healing remains capped, and custom prototypes are not normalized', () => {
    const p = skill(heal('allySelf', 7, 0)); expect(applyGowLifeRule(20007, p)).toBe(p);
    const f = damageFixture(); executePrototype(p, f.ctx); expect(f.caster.hp).toBe(1000); expect(f.caster.maxHp).toBe(1000);
  });
  it('changed hp segment count requires review rather than guessed mode reuse', () => {
    expect(() => applyGowLifeRule(7063, skill())).toThrow(/review required/);
    expect(() => applyGowLifeRule(7063, skill(heal('allySelf', 1), heal('allySelf', 2)))).toThrow(/reviewed modes/);
  });
  it('full healing while bleeding never produces NaN Life', () => {
    const f = damageFixture(); f.caster.hp = 40; f.caster.maxHp = 100; f.caster.statuses = [{ id: 'bleed', turns: 3 }];
    executePrototype(skill(heal('allySelf', 0, 0, { full: true })), f.ctx);
    expect(f.caster.hp).toBe(100); expect(Number.isFinite(f.caster.hp)).toBe(true);
  });
  for (const initialHp of [40, 100]) it(`7063 real troop cast increases current and maximum Life, initial hp=${initialHp}`, () => {
    const f = realCast(7063, initialHp); f.cast(); expect([f.caster.hp, f.caster.maxHp]).toEqual([initialHp + 12, 112]);
  });
  it('7025 native FromTarget gain AND healing AND barrier all affect the selected Ally, not self', () => {
    expect(native.get(7025).raw.SpellSteps.filter((s: { Type: string }) => ['IncreaseHealth', 'Heal'].includes(s.Type))).toMatchObject([{ Type: 'IncreaseHealth', Target: 'FromTarget', Amount: 5 }, { Type: 'Heal', Target: 'FromTarget', Amount: 1, SpellPowerMultiplier: 1 }]);
    expect(hpSegments(7025).map(s => s.target)).toEqual(['allyChosen', 'allyChosen']);
    const f = realCast(7025); const ev = f.cast();
    expect([f.ally.hp, f.ally.maxHp]).toEqual([57, 105]); expect([f.caster.hp, f.caster.maxHp]).toEqual([40, 100]);
    expect(ev.flatMap(e => e.type === 'buff' && e.stat === 'hp' ? [e.targetId] : [])).toEqual([1, 1]);
    expect(f.ally.statuses.some(s => s.id === 'barrier')).toBe(true);
  });
  it('7161 native gain, attack, cleanse and full healing use the new maximum on one Ally', () => {
    const f = realCast(7161); f.ally.statuses = [{ id: 'bleed', turns: 3 }]; f.cast();
    expect([f.ally.hp, f.ally.maxHp, f.ally.attack]).toEqual([111, 111, 28]); expect(f.ally.statuses).toHaveLength(0);
    expect([f.caster.hp, f.caster.maxHp]).toEqual([40, 100]);
  });
  for (const branch of [0, 1]) it(`8857 full-Life party: native choice branch ${branch} grows Life OR grants others half mana`, () => {
    const f = realCast(8857, 100, 1, branch); f.ally.hp = 100; f.ally.mana = 0; f.cast();
    expect([f.caster.hp, f.caster.maxHp, f.ally.hp, f.ally.maxHp]).toEqual(branch === 0 ? [112, 112, 112, 112] : [100, 100, 100, 100]);
    expect(f.ally.mana).toBe(branch === 1 ? 8 : 0);
  });
  for (const initialHp of [40, 100]) it(`7756 equipped alias gains all eliminated Armor as Life at hp=${initialHp}`, () => {
    const f = realCast(7756, initialHp, 11); f.enemies[1].armor = 150; f.cast();
    expect([f.caster.hp, f.caster.maxHp]).toEqual([initialHp + 150, 250]); expect(f.enemies[1].armor).toBe(0);
    const w = weapons.find(w => w.spell.id === 7756)!; expect(registry.prototypes.get(`gw_${w.referenceName}`)).toBe(registry.prototypes.get('7756'));
  });
  for (const initialHp of [40, 100]) it(`7284 real Heal weapon restores current party Life only, hp=${initialHp}`, () => {
    const f = realCast(7284, initialHp); f.ally.hp = initialHp; f.cast();
    expect([f.caster.hp, f.caster.maxHp, f.ally.hp, f.ally.maxHp]).toEqual([Math.min(100, initialHp + 16), 100, Math.min(100, initialHp + 16), 100]);
  });
  it('7203 full-Life restoration does not grow maxHp and still grants source Souls and turn', () => {
    const f = realCast(7203); const ev = f.cast(); expect([f.caster.hp, f.caster.maxHp]).toEqual([100, 100]);
    expect(ev.some(e => e.type === 'extra-turn')).toBe(true);
    expect(f.state.economy?.souls).toBe(12);
  });
  it('event-only presentation sees Life growth before subsequent incoming damage', () => {
    const f = damageFixture(); f.caster.hp = f.caster.maxHp = 100;
    const narrator = new BattleNarrator({ playNarration: vi.fn(() => true), preloadNarration: vi.fn(), isNarrationBusy: () => false, stopNarration: vi.fn() }, () => 0, () => 100000,
      [{ id: 'enemy-heavy', pool: 'spell_heavy.enemy', url: '/fixture.mp3', duration: 1 }]);
    narrator.start(f.state);
    const growth = executePrototype(skill(gainLife('allySelf', 100, 0)), f.ctx);
    const plan = narrator.prepare([...growth, { type: 'skill-damage', casterId: 10, targetId: 0, range: 'single', damage: 120, resultingHp: 80, resultingArmor: 0 }]);
    expect(plan?.eventIndex).toBe(1); // actual 120/200 damage, not 20/100 after stale-max clamping
    narrator.dispose();
  });
  it('legacy override and registered library agree on 7063 Life semantics', () => expect(getSkillPrototype(7063)).toBe(registry.prototypes.get('7063')));
});
