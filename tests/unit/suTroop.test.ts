import { describe, expect, it, vi } from 'vitest';
import { TurnEngine } from '@engine/TurnEngine';
import { ManaDistributor } from '@engine/ManaDistributor';
import { ExtensionRegistry } from '@engine/registry';
import { SKILL_LIBRARY } from '@engine/skills/library';
import { executePrototype } from '@engine/skills/prototypes';
import { FixedTargetChooser } from '@engine/skills/targetChooser';
import { getTrait, attachPassives, applyCastTriggers } from '@engine/traits';
import { BaseColor, PlayerSide } from '@engine/types';
import { SU_ID, SU_SPELL_ID, COMMUNITY_KINGDOM, COMMUNITY_RACE } from '../../src/data/communityTroops';
import { getTroopById, getTroopByRef, TROOPS } from '../../src/data/troops';
import { kingdomTroopPool } from '../../src/meta/data/kingdoms';
import { troopArt } from '../../src/meta/screens/teamScreen';
import { newSave } from '../../src/meta/state/schema';
import { metaKnownTraitIds, troopToSnapshot } from '../../src/meta/systems/battleBridge';
import { grantTroop, getRecord } from '../../src/meta/systems/troopProgress';
import { damageCharacter, damageFixture } from '../helpers/damageFixture';

const codes = ['stonelink', 'arcane', 'cursedaura'];
const proto = SKILL_LIBRARY[SU_SPELL_ID];
function setup(unlocked = false) {
  const f = damageFixture();
  Object.assign(f.caster, { magic: 10, manaCost: 12, mana: 12, skillId: String(SU_SPELL_ID),
    colors: [BaseColor.Purple, BaseColor.Brown], traitIds: unlocked ? codes : [] });
  const allies = [damageCharacter(1, { colors: [BaseColor.Green] }), f.caster,
    damageCharacter(2, { colors: [BaseColor.Green] }), damageCharacter(3, { colors: [BaseColor.Green] })];
  f.state.teams[PlayerSide.Left].characters = [...allies];
  f.state.teams[PlayerSide.Right].characters = [...f.enemies];
  allies.forEach(a => attachPassives(a));
  return { ...f, allies };
}
function rig(f: ReturnType<typeof setup>, roll: number) {
  return vi.spyOn(f.ctx.rng, 'next').mockReturnValueOnce(roll);
}

describe('Su / 狂乱献礼 integration', () => {
  it('registers the UltraRare purple-brown visitor, portrait, collection and unlocked traits', () => {
    const troop = getTroopById(SU_ID)!;
    expect(getTroopByRef('Su')).toBe(troop);
    expect(TROOPS.filter(t => t.id === SU_ID)).toHaveLength(1);
    expect(TROOPS.filter(t => t.spell.id === SU_SPELL_ID)).toHaveLength(1);
    expect(troop).toMatchObject({ name: '苏', rarity: 'UltraRare', rarityIdx: 3, manaCost: 12,
      kingdom: COMMUNITY_KINGDOM, troopTypes: [COMMUNITY_RACE],
      manaColors: [BaseColor.Purple, BaseColor.Brown], spell: { name: '狂乱献礼' } });
    expect(troop.spell.description).toBe('有 35% 的几率献祭除自身外的末位盟友。对一名敌人造成 [魔法 + 5] 点伤害。若成功献祭，则造成双倍伤害，并在击杀目标后吞噬另一名随机敌人。');
    expect(troop.spell.meta?.scalings).toContainEqual({ base: 5, mult: 1 });
    expect(kingdomTroopPool(COMMUNITY_KINGDOM)).toContain(troop);
    expect(troop.artUrl).toContain('su.png');
    expect(troopArt(troop)).toBe(troop.artUrl);
    expect(troop.traits.map(t => t.code)).toEqual(codes);
    codes.forEach(code => { expect(getTrait(code)).toBeDefined(); expect(metaKnownTraitIds()).toContain(code); });
    const save = newSave({ now: 0, starterTroopIds: [] });
    grantTroop(save, SU_ID);
    const record = getRecord(save, SU_ID)!;
    expect(troopToSnapshot(troop, record, 'su').traitIds).toEqual([]);
    record.traits = [true, true, true];
    expect(troopToSnapshot(troop, record, 'su')).toMatchObject({ traitIds: codes,
      skillId: String(SU_SPELL_ID), manaCost: 12, portraitUrl: troop.artUrl });
  });
  it.each([0, 0.349999, 0.35, 0.999])('uses a strict 35%% sacrifice threshold at %s', roll => {
    const f = setup(); rig(f, roll);
    executePrototype(proto, f.ctx);
    expect(f.allies[3].defeated).toBe(roll < 0.35);
    expect(f.enemies[1].hp).toBe(roll < 0.35 ? 970 : 985);
    expect(f.caster.defeated).toBe(false);
  });
  it.each([0, 10, 40])('doubles the complete magic + 5 formula at magic %i', magic => {
    const f = setup(); f.caster.magic = magic; rig(f, 0);
    executePrototype(proto, f.ctx);
    expect(f.enemies[1].hp).toBe(1000 - 2 * (magic + 5));
    expect(f.enemies.filter(e => e.id !== 11).every(e => e.hp === 1000)).toBe(true);
  });
  it('skips the caster at the back and already defeated allies', () => {
    const f = setup(); rig(f, 0);
    f.allies[3].defeated = true; f.allies[3].hp = 0;
    f.state.teams[PlayerSide.Left].characters = [f.allies[0], f.allies[2], f.allies[3], f.caster];
    executePrototype(proto, f.ctx);
    expect(f.allies[2].defeated).toBe(true);
    expect(f.allies[0].defeated).toBe(false);
    expect(f.caster.defeated).toBe(false);
    expect(f.enemies[1].hp).toBe(970);
  });
  it.each([false, true])('without a living ally only deals base damage, even on a kill (%s)', lethal => {
    const f = setup(); rig(f, 0);
    f.state.teams[PlayerSide.Left].characters = [f.caster];
    f.enemies[1].hp = lethal ? 15 : 1000;
    const events = executePrototype(proto, f.ctx);
    expect(f.caster.defeated).toBe(false);
    expect(f.enemies[1].hp).toBe(lethal ? 0 : 985);
    expect(events.some(e => e.type === 'skill-damage' && e.devoured)).toBe(false);
    expect(f.enemies.filter(e => e.id !== 11).every(e => e.hp === 1000)).toBe(true);
  });
  it('does not devour on a kill when the sacrifice roll failed', () => {
    const f = setup(); rig(f, 0.35); f.enemies[1].hp = 15;
    const events = executePrototype(proto, f.ctx);
    expect(events.filter(e => e.type === 'defeat')).toHaveLength(1);
    expect(events.some(e => e.type === 'skill-damage' && e.devoured)).toBe(false);
  });
  it('devours exactly one other enemy only after successful sacrifice and a damage kill', () => {
    const f = setup(); rig(f, 0); f.enemies[1].hp = 30;
    const events = executePrototype(proto, f.ctx);
    expect(events.filter(e => e.type === 'defeat')).toHaveLength(3);
    const devours = events.filter(e => e.type === 'skill-damage' && e.devoured);
    expect(devours).toHaveLength(1);
    expect(devours[0]).not.toMatchObject({ targetId: 11 });
    expect(f.enemies.filter(e => e.defeated)).toHaveLength(2);
    expect(f.caster.magic).toBe(10);
  });
  it.each(['barrier', 'spellarmor'])('a sacrifice blocked by %s does not unlock either bonus', protection => {
    const f = setup(); rig(f, 0);
    if (protection === 'barrier') f.allies[3].statuses = [{ id: 'barrier', turns: 3 }];
    else { f.allies[3].traitIds = ['spellarmor']; attachPassives(f.allies[3]); }
    f.enemies[1].hp = 15;
    const events = executePrototype(proto, f.ctx);
    expect(f.allies[3].defeated).toBe(false);
    expect(f.ctx.castTracking?.sacrificeSucceeded).not.toBe(true);
    expect(events.some(e => e.type === 'skill-damage' && e.devoured)).toBe(false);
  });
  it('a barrier on the selected enemy prevents the kill and devour', () => {
    const f = setup(); rig(f, 0); f.enemies[1].hp = 1;
    f.enemies[1].statuses = [{ id: 'barrier', turns: 3 }];
    const events = executePrototype(proto, f.ctx);
    expect(f.enemies[1].hp).toBe(1);
    expect(events.filter(e => e.type === 'defeat')).toHaveLength(1);
  });
  it.each(['indigestible', 'barrier'])('uses existing devour protection: %s', protection => {
    const f = setup(); rig(f, 0); f.enemies[1].hp = 30;
    for (const enemy of f.enemies.filter(e => e.id !== 11)) {
      if (protection === 'barrier') enemy.statuses = [{ id: 'barrier', turns: 3 }];
      else { enemy.traitIds = ['indigestible']; attachPassives(enemy); }
    }
    const events = executePrototype(proto, f.ctx);
    expect(events.filter(e => e.type === 'defeat')).toHaveLength(2);
    if (protection === 'indigestible') expect(f.caster.magic).toBe(10);
    expect(events.some(e => e.type === 'skill-damage' && e.devoured)).toBe(false);
  });
  it('finishes normally when the selected target is the last enemy', () => {
    const f = setup(); rig(f, 0); f.enemies[1].hp = 30;
    f.state.teams[PlayerSide.Right].characters = [f.enemies[1]];
    const events = executePrototype(proto, f.ctx);
    expect(events.filter(e => e.type === 'defeat')).toHaveLength(2);
    expect(f.caster.magic).toBe(10);
  });
  it('does not carry sacrifice success into a later cast', () => {
    const f = setup(); const roll = rig(f, 0);
    executePrototype(proto, f.ctx);
    roll.mockReturnValueOnce(0.5);
    executePrototype(proto, f.ctx);
    expect(f.enemies[1].hp).toBe(955);
    expect(f.ctx.castTracking?.sacrificeSucceeded).toBe(false);
  });
  it.each([BaseColor.Brown, BaseColor.Purple])('stonelink adds one mana only on brown: %s', color => {
    const f = setup(true); f.caster.mana = 0;
    new ManaDistributor().distribute(f.state.teams[PlayerSide.Left], PlayerSide.Left, color, 3);
    expect(f.caster.mana).toBe(color === BaseColor.Brown ? 4 : 3);
  });
  it('no longer gains mana from matching red gems', () => {
    const f = setup(true); f.caster.mana = 0;
    new ManaDistributor().distribute(f.state.teams[PlayerSide.Left], PlayerSide.Left, BaseColor.Red, 3);
    expect(f.caster.mana).toBe(0);
  });
  it('arcane gains one magic for allied spells and none for enemy spells', () => {
    const f = setup(true);
    applyCastTriggers(f.allies, f.enemies);
    expect(f.caster.magic).toBe(11);
    applyCastTriggers(f.enemies, f.allies);
    expect(f.caster.magic).toBe(11);
  });
  it.each([false, true])('real cast spends 16 mana and respects trait unlocks: %s', unlocked => {
    const f = setup(unlocked); rig(f, 0.5);
    const registry = new ExtensionRegistry(); registry.prototypes.set(String(SU_SPELL_ID), proto);
    const engine = new TurnEngine(f.state, f.ctx.rng, f.ctx.nextGemId, registry);
    engine.setTargetChooser(new FixedTargetChooser(11));
    const events = engine.castSkill(f.caster.id);
    expect(events[0].type).toBe('skill-cast');
    expect(f.caster.mana).toBe(0);
    expect(f.enemies[1].hp).toBe(unlocked ? 984 : 985);
  });
  it('real cast sacrifices the last ally, kills the selected enemy and devours once', () => {
    const f = setup(true); rig(f, 0); f.enemies[1].hp = 32;
    const registry = new ExtensionRegistry(); registry.prototypes.set(String(SU_SPELL_ID), proto);
    const engine = new TurnEngine(f.state, f.ctx.rng, f.ctx.nextGemId, registry);
    engine.setTargetChooser(new FixedTargetChooser(11));
    const events = engine.castSkill(f.caster.id);
    expect(f.caster.mana).toBe(0);
    expect(f.allies[3].defeated).toBe(true);
    expect(f.enemies[1].defeated).toBe(true);
    expect(events.filter(e => e.type === 'skill-damage' && e.devoured)).toHaveLength(1);
    expect(f.caster.magic).toBe(11);
  });
  it('a missing selected enemy does not mistake the sacrificed ally for a damage kill', () => {
    const f = setup(); rig(f, 0); f.ctx.chosenTargetId = 99999;
    const events = executePrototype(proto, f.ctx);
    expect(f.allies[3].defeated).toBe(true);
    expect(events.filter(e => e.type === 'defeat')).toHaveLength(1);
    expect(f.enemies.every(e => e.hp === 1000)).toBe(true);
  });
  it.each([0.09999, 0.1])('cursedaura creates exactly one curse gem below 10%%: %s', roll => {
    const f = setup(true);
    expect(getTrait('cursedaura')?.turnStartCreateSpecialGem).toEqual({ gem: 'curseGem', count: 1, chance: 0.1 });
    f.state.activePlayer = PlayerSide.Right;
    rig(f, roll);
    const engine = new TurnEngine(f.state, f.ctx.rng, f.ctx.nextGemId, new ExtensionRegistry());
    const events = engine.passTurn();
    const changes = events.flatMap(e => e.type === 'gem-transform' ? e.changes : [])
      .filter(c => c.to.kind === 'special' && c.to.spec.kind === 'curseGem');
    expect(changes).toHaveLength(roll < 0.1 ? 1 : 0);
  });
});
