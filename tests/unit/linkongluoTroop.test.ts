import { describe, expect, it } from 'vitest';
import { TurnEngine } from '@engine/TurnEngine';
import { CombatResolver } from '@engine/CombatResolver';
import { ExtensionRegistry } from '@engine/registry';
import { SKILL_LIBRARY } from '@engine/skills/library';
import { executePrototype } from '@engine/skills/prototypes';
import { FixedTargetChooser } from '@engine/skills/targetChooser';
import { attachPassives, getTrait } from '@engine/traits';
import { BaseColor, PlayerSide } from '@engine/types';
import { LINKONGLUO_ID, LINKONGLUO_SPELL_ID, COMMUNITY_KINGDOM, COMMUNITY_RACE } from '../../src/data/communityTroops';
import { getTroopById, getTroopByRef, TROOPS } from '../../src/data/troops';
import { kingdomTroopPool } from '../../src/meta/data/kingdoms';
import { troopArt } from '../../src/meta/screens/teamScreen';
import { newSave } from '../../src/meta/state/schema';
import { metaKnownTraitIds, troopToSnapshot } from '../../src/meta/systems/battleBridge';
import { grantTroop, getRecord } from '../../src/meta/systems/troopProgress';
import { damageFixture } from '../helpers/damageFixture';

const traits = ['agile', 'fast', 'bloodlust'];
const proto = SKILL_LIBRARY[LINKONGLUO_SPELL_ID];
function fixture(unlocked = false) {
  const f = damageFixture();
  Object.assign(f.caster, { skillId: String(LINKONGLUO_SPELL_ID),
    manaCost: 11, mana: 0, magic: 10, traitIds: unlocked ? traits : [],
    troopTypes: [COMMUNITY_RACE, 'Dragon'], colors: [BaseColor.Purple, BaseColor.Red] });
  attachPassives(f.caster);
  return f;
}
function newEngine(f: ReturnType<typeof fixture>) {
  const registry = new ExtensionRegistry();
  registry.prototypes.set(String(LINKONGLUO_SPELL_ID), proto);
  const engine = new TurnEngine(f.state, f.ctx.rng, f.ctx.nextGemId, registry);
  engine.setTargetChooser(new FixedTargetChooser(11));
  return engine;
}
function dragonGems(events: ReturnType<typeof executePrototype>) {
  return events.flatMap(event => event.type === 'gem-transform'
    ? event.changes.map(change => change.to)
    : event.type === 'gem-create' ? event.spawns.map(spawn => spawn.gemType) : [])
    .filter(gem => gem.kind === 'special' && gem.spec.kind === 'dragonGem' && gem.spec.color === BaseColor.Red);
}

describe('霖空洛 / 绯翼突袭', () => {
  it('registers the exact name, UltraRare colors, portrait and unlocked traits in the catalog', () => {
    const troop = getTroopById(LINKONGLUO_ID)!;
    expect(getTroopByRef('LinKongLuo')).toBe(troop);
    expect(TROOPS.filter(t => t.id === LINKONGLUO_ID)).toHaveLength(1);
    expect(TROOPS.filter(t => t.spell.id === LINKONGLUO_SPELL_ID)).toHaveLength(1);
    expect(troop).toMatchObject({ name: '霖空洛', rarity: 'UltraRare', rarityIdx: 3,
      kingdom: COMMUNITY_KINGDOM, troopTypes: [COMMUNITY_RACE, 'Dragon'],
      manaColors: [BaseColor.Purple, BaseColor.Red], manaCost: 11,
      spell: { name: '绯翼突袭' } });
    expect(troop.spell.description).toBe('对一名敌人造成 [魔法 + 6] 点伤害。如果敌人的生命值全满，则造成双倍伤害。创造 3 颗红色龙宝石。');
    expect(troop.spell.meta?.scalings).toContainEqual({ base: 6, mult: 1 });
    expect(troop.traits.map(t => t.code)).toEqual(traits);
    for (const trait of traits) {
      expect(getTrait(trait)).toBeDefined();
      expect(metaKnownTraitIds()).toContain(trait);
    }
    expect(kingdomTroopPool(COMMUNITY_KINGDOM)).toContain(troop);
    expect(troop.artUrl).toContain('linkongluo.webp');
    expect(troopArt(troop)).toBe(troop.artUrl);
    const save = newSave({ now: 0, starterTroopIds: [] });
    grantTroop(save, LINKONGLUO_ID);
    const record = getRecord(save, LINKONGLUO_ID)!;
    expect(troopToSnapshot(troop, record, 'linkongluo').traitIds).toEqual([]);
    record.traits = [true, true, true];
    expect(troopToSnapshot(troop, record, 'linkongluo')).toMatchObject({
      traitIds: traits, skillId: String(LINKONGLUO_SPELL_ID), manaCost: 11,
      portraitUrl: troop.artUrl,
    });
  });
  it.each([0, 10, 40])('full-health targets take twice the complete magic + 6 at magic %i', magic => {
    const f = fixture(); f.caster.magic = magic;
    const events = executePrototype(proto, f.ctx);
    expect(f.enemies[1].hp).toBe(1000 - (magic + 6) * 2);
    expect(dragonGems(events)).toHaveLength(3);
    expect(f.enemies.filter(e => e.id !== 11).every(e => e.hp === 1000)).toBe(true);
  });
  it.each([999, 500, 1])('damaged targets take base damage at hp %i', hp => {
    const f = fixture();
    const target = f.enemies[1];
    target.hp = hp;
    const events = executePrototype(proto, f.ctx);
    expect(target.hp).toBe(Math.max(0, hp - 16));
    expect(dragonGems(events)).toHaveLength(3);
  });
  it('uses current HP rather than armor, max HP changes or mana to decide the double', () => {
    const f = fixture(); f.enemies[1].armor = 50;
    f.enemies[1].mana = 0;
    executePrototype(proto, f.ctx);
    expect(f.enemies[1].hp).toBe(1000);
    expect(f.enemies[1].armor).toBe(18);
  });
  it('a barrier blocks the hit while still creating three red dragon gems', () => {
    const f = fixture(); f.enemies[1].statuses = [{ id: 'barrier', turns: 3 }];
    const events = executePrototype(proto, f.ctx);
    expect(f.enemies[1].hp).toBe(1000);
    expect(f.enemies[1].statuses.some(s => s.id === 'barrier')).toBe(false);
    expect(dragonGems(events)).toHaveLength(3);
  });
  it('fast starts at floor(11 / 2), without applying when the trait is locked', () => {
    for (const enabled of [false, true]) {
      const f = fixture(enabled); newEngine(f);
      expect(f.caster.mana).toBe(enabled ? 5 : 0);
    }
  });
  it.each([0.1, 0.2])('agile uses a strict 20%% skull dodge at roll %s', roll => {
    const f = fixture(true); f.enemies[0].attack = 20;
    const result = new CombatResolver().resolveSkullDamage(
      f.state.teams[PlayerSide.Right], f.state.teams[PlayerSide.Left], 3,
      { next: () => roll } as typeof f.ctx.rng,
    );
    expect(f.caster.hp).toBe(roll < 0.2 ? 1000 : 980);
    expect(result.events.some(e => e.type === 'attack-struggle' && e.reason === 'dodge')).toBe(roll < 0.2);
  });
  it('an enemy killed by the cast triggers bloodlust on the living holder', () => {
    const f = fixture(true);
    f.enemies[1].hp = 32;
    f.enemies[1].maxHp = 32;
    f.caster.mana = 13;
    const events = newEngine(f).castSkill(f.caster.id);
    expect(f.caster.mana).toBe(0);
    expect(events.some(e => e.type === 'defeat' && e.characterId === 11)).toBe(true);
    expect(events.some(e => e.type === 'status-apply' && e.statusId === 'rage' && e.targetId === f.caster.id)).toBe(true);
    expect(f.caster.statuses.some(s => s.id === 'rage')).toBe(true);
    expect(dragonGems(events)).toHaveLength(3);
  });
  it('a normal cast consumes 13 mana and produces three red dragon gems', () => {
    const f = fixture(); f.caster.mana = 13;
    const events = newEngine(f).castSkill(f.caster.id);
    expect(events[0].type).toBe('skill-cast');
    expect(f.caster.mana).toBe(0);
    expect(f.enemies[1].hp).toBe(968);
    expect(dragonGems(events)).toHaveLength(3);
  });
});
