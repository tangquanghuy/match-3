import { describe, it, expect, vi, afterEach } from 'vitest';
import { BaseColor, PlayerSide } from '@engine/types';
import { SeededRNG } from '@engine/rng';
import { TurnEngine } from '@engine/TurnEngine';
import { ExtensionRegistry } from '@engine/registry';
import { executePrototype } from '@engine/skills/prototypes';
import { SKILL_LIBRARY, registerSkillLibrary } from '@engine/skills/library';
import { FixedColorChooser, prototypeNeedsColor } from '@engine/skills/colorChooser';
import { prototypeChosenTargetMode } from '@engine/skills/targetChooser';
import { candidatesFor } from '@engine/skills/targeting';
import { getTrait, resolvePassives } from '@engine/traits';
import { damageFixture, damageCharacter } from '../helpers/damageFixture';
import { PING_ID, PING_SPELL_ID, ZHUWANG_ID, ZHUWANG_SPELL_ID, COMMUNITY_KINGDOM } from '../../src/data/communityTroops';
import { getTroopById, getTroopByRef, troopToSummonTemplate } from '../../src/data/troops';
import { kingdomTroopPool } from '../../src/meta/data/kingdoms';
import { newSave } from '../../src/meta/state/schema';
import { grantTroop, getRecord } from '../../src/meta/systems/troopProgress';
import { troopToSnapshot, metaKnownTraitIds } from '../../src/meta/systems/battleBridge';

afterEach(() => vi.restoreAllMocks());
function pigFixture(red = 0, roll = 0.9) {
  const f = damageFixture(red);
  const ally = damageCharacter(1, { attack: 20 });
  f.state.teams[PlayerSide.Left].characters.push(ally, damageCharacter(2));
  f.ctx.chosenTargetId = ally.id;
  f.ctx.resolveSummonRef = troopToSummonTemplate;
  // Isolate chance rolls from gem shuffle / random target selection.
  const selectionRng = new SeededRNG(2026);
  vi.spyOn(f.ctx.rng, 'nextInt').mockImplementation(n => selectionRng.nextInt(n));
  vi.spyOn(f.ctx.rng, 'next').mockReturnValue(roll);
  return { ...f, ally };
}

describe('苹与zhuwang真实接入', () => {
  it.each([
    [PING_ID, PING_SPELL_ID, 'Ping', '苹', 'Legendary', 5, 22, '夜色流转', 'ping.webp', ['firelink', 'ping_evernight', 'ping_nightsong']],
    [ZHUWANG_ID, ZHUWANG_SPELL_ID, 'Zhuwang', 'zhuwang', 'UltraRare', 3, 15, '猪猪变身术', 'zhuwang.webp', ['stonelink', 'frenzy', 'armored']],
  ] as const)('%s catalogue, collection, portrait and traits', (id, spellId, ref, name, rarity, rarityIdx, cost, spellName, art, traits) => {
    const troop = getTroopById(id)!;
    expect(getTroopByRef(ref)).toBe(troop);
    expect(troop).toMatchObject({ name, rarity, rarityIdx, manaCost: cost, spell: { id: spellId, name: spellName } });
    expect(troop.artUrl).toContain(art);
    expect(troop.manaColors).toEqual(id === PING_ID ? [BaseColor.Red, BaseColor.Purple, BaseColor.Brown] : [BaseColor.Green, BaseColor.Yellow, BaseColor.Brown]);
    expect(kingdomTroopPool(COMMUNITY_KINGDOM)).toContain(troop);
    expect(troop.traits.map(t => t.code)).toEqual(traits);
    expect(SKILL_LIBRARY[spellId]).toBeDefined();
    traits.forEach(code => { expect(getTrait(code)).toBeDefined(); expect(metaKnownTraitIds()).toContain(code); });
    const save = newSave({ now: 0, starterTroopIds: [] });
    grantTroop(save, id);
    const record = getRecord(save, id)!;
    record.traits = [true, true, true];
    expect(troopToSnapshot(troop, record, ref)).toMatchObject({ name, skillId: String(spellId), manaCost: cost, traitIds: traits });
  });

  it('苹的夜曲只在己方回合开始给予紫色盟友原有的生命与魔力', () => {
    expect(getTrait('ping_nightsong')).toMatchObject({
      description: '所有紫色盟友在我的回合开始时获得 2 点生命值和魔力值。',
      turnStartTypeAura: { scope: 'Purple', gains: { hp: 2, magic: 2 } },
    });
    const { caster, state, ctx } = pigFixture();
    const allies = state.teams[PlayerSide.Left].characters;
    caster.traitIds = ['ping_nightsong'];
    caster.colors = [BaseColor.Purple];
    allies[1]!.colors = [BaseColor.Purple];
    const hp = allies[1]!.hp, magic = allies[1]!.magic;
    const engine = new TurnEngine(state, ctx.rng, ctx.nextGemId, new ExtensionRegistry());
    engine.passTurn();
    expect(allies[1]).toMatchObject({ hp, magic });
    engine.passTurn();
    expect(allies[1]).toMatchObject({ hp: hp + 2, magic: magic + 2 });
  });

  it('夜色流转 requests a colour, not a branch or a unit', () => {
    const proto = SKILL_LIBRARY[PING_SPELL_ID];
    expect(prototypeNeedsColor(proto)).toBe(true);
    expect(prototypeChosenTargetMode(proto)).toBeNull();
    expect(proto.segments.some(s => s.kind === 'choose')).toBe(false);
  });

  it.each([0, 9, 10, 13])('夜色流转: %i destroyed selected gems determine the extra turn', red => {
    const f = damageFixture(red, 0, [
      { colors: [BaseColor.Red] }, { colors: [BaseColor.Blue] },
      { colors: [BaseColor.Red, BaseColor.Purple], mana: 2 }, { colors: [BaseColor.Yellow] },
    ]);
    f.ctx.chosenColor = BaseColor.Red;
    const events = executePrototype(SKILL_LIBRARY[PING_SPELL_ID], f.ctx);
    expect(events.filter(e => e.type === 'skill-damage').map(e => [e.targetId, e.damage])).toEqual([[10, 15], [12, 15]]);
    expect(f.enemies.map(e => e.mana)).toEqual([12, 16, 0, 16]);
    expect(events.filter(e => e.type === 'gem-destroy').flatMap(e => e.cells)).toHaveLength(red);
    expect(events.filter(e => e.type === 'extra-turn')).toHaveLength(red >= 10 ? 1 : 0);
  });

  it('blue selection does not damage red-only enemies', () => {
    const f = damageFixture(10, 0, [{ colors: [BaseColor.Red] }, { colors: [BaseColor.Blue] }]);
    f.ctx.chosenColor = BaseColor.Blue;
    executePrototype(SKILL_LIBRARY[PING_SPELL_ID], f.ctx);
    expect(f.enemies.map(e => [e.hp, e.mana])).toEqual([[1000, 16], [985, 12]]);
  });

  it('mana shield protects drain, not skill damage', () => {
    const f = damageFixture(10, 0, [{ passive: resolvePassives(['manashield']) }]);
    f.ctx.chosenColor = BaseColor.Red;
    executePrototype(SKILL_LIBRARY[PING_SPELL_ID], f.ctx);
    expect(f.enemies[0]).toMatchObject({ hp: 985, mana: 16 });
  });

  it('a slain colour target does not redirect the drain', () => {
    const f = damageFixture(10, 0, [{ hp: 1, colors: [BaseColor.Red] }, { colors: [BaseColor.Blue] }]);
    f.ctx.chosenColor = BaseColor.Red;
    executePrototype(SKILL_LIBRARY[PING_SPELL_ID], f.ctx);
    expect(f.enemies.find(e => e.id === 11)!.mana).toBe(16);
  });

  it.each([0, 0.249, 0.25, 0.9])('zhuwang always buffs the chosen ally: roll %s', roll => {
    const f = pigFixture(0, roll);
    const events = executePrototype(SKILL_LIBRARY[ZHUWANG_SPELL_ID], f.ctx);
    const transformed = roll < 0.25;
    const template = troopToSummonTemplate('ArmoredBoarlet')!;
    expect(events.filter(e => e.type === 'troop-transform')).toHaveLength(transformed ? 1 : 0);
    expect(f.ally.attack).toBe((transformed ? template.attack : 20) + f.caster.magic + 3);
    expect(f.ally.name).toBe(transformed ? template.name : 'C1');
    expect(f.caster.attack).toBe(17);
    expect(f.state.teams[PlayerSide.Left].characters[2].attack).toBe(17);
    expect(events.filter(e => e.type === 'gem-transform').flatMap(e => e.changes)).toHaveLength(6);
    expect(events.filter(e => e.type === 'extra-turn')).toHaveLength(0);
  });

  it.each([
    [12, 100, 0, false], [13, 0, 0.1, false], [13, 20, 0.19, true],
    [13, 20, 0.20, false], [13, 50, 0.49, true], [13, 100, 0.5, false],
  ])('enemy transform: pre-cast red=%i, attack=%i, roll=%s', (red, attack, roll, success) => {
    const f = pigFixture(red, roll);
    f.caster.attack = attack;
    const events = executePrototype(SKILL_LIBRARY[ZHUWANG_SPELL_ID], f.ctx);
    expect(events.filter(e => e.type === 'troop-transform' && e.targetId >= 10)).toHaveLength(success ? 1 : 0);
  });

  it('ally picker excludes caster, defeated allies and enemies', () => {
    const f = pigFixture();
    f.state.teams[PlayerSide.Left].characters[2].defeated = true;
    expect(prototypeChosenTargetMode(SKILL_LIBRARY[ZHUWANG_SPELL_ID])).toBe('allyChosenOther');
    expect(candidatesFor('allyChosenOther', f.state, 0).map(c => c.id)).toEqual([1]);
    expect(candidatesFor('allyChosen', f.state, 0).map(c => c.id)).toEqual([0, 1]);
  });

  it('real TurnEngine consumes 22 mana and resolves selected-colour damage', () => {
    const f = damageFixture(10);
    f.caster.skillId = String(PING_SPELL_ID);
    f.caster.manaCost = f.caster.mana = 22;
    const registry = new ExtensionRegistry(); registerSkillLibrary(registry.prototypes);
    const engine = new TurnEngine(f.state, f.ctx.rng, f.ctx.nextGemId, registry);
    engine.setColorChooser(new FixedColorChooser(BaseColor.Red));
    const events = engine.castSkill(0);
    expect(events.filter(e => e.type === 'skill-cast')).toHaveLength(1);
    expect(events.filter(e => e.type === 'skill-damage')).toHaveLength(4);
    expect(events.some(e => e.type === 'extra-turn')).toBe(true);
    expect(f.state.actionLog).toHaveLength(1);
  });

  it('real zhuwang cast grants attack when transformation misses', () => {
    const f = pigFixture(0, 0.9);
    f.caster.skillId = String(ZHUWANG_SPELL_ID);
    f.caster.manaCost = f.caster.mana = 15;
    const registry = new ExtensionRegistry(); registerSkillLibrary(registry.prototypes);
    const engine = new TurnEngine(f.state, f.ctx.rng, f.ctx.nextGemId, registry);
    engine.setTargetChooser({ choose: () => f.ally.id });
    engine.setSummonResolver(troopToSummonTemplate);
    const events = engine.castSkill(0);
    expect(events.filter(e => e.type === 'skill-cast')).toHaveLength(1);
    expect(events.filter(e => e.type === 'troop-transform')).toHaveLength(0);
    expect(f.ally).toMatchObject({ name: 'C1', attack: 34 });
  });

  it.each([0, 10, 999])('invalid zhuwang ally selection %i cancels before spending mana', target => {
    const f = pigFixture();
    f.caster.skillId = String(ZHUWANG_SPELL_ID);
    f.caster.manaCost = f.caster.mana = 15;
    const registry = new ExtensionRegistry(); registerSkillLibrary(registry.prototypes);
    const engine = new TurnEngine(f.state, f.ctx.rng, f.ctx.nextGemId, registry);
    engine.setTargetChooser({ choose: () => target });
    engine.setSummonResolver(troopToSummonTemplate);
    expect(engine.castSkill(0).filter(e => e.type === 'skill-cast')).toHaveLength(0);
    expect(f.caster.mana).toBe(15);
  });
});
