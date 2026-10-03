import { describe, expect, it } from 'vitest';
import { BaseColor, PlayerSide, colorGem } from '@engine/types';
import { SeededRNG } from '@engine/rng';
import { TurnEngine } from '@engine/TurnEngine';
import { ExtensionRegistry } from '@engine/registry';
import { SKILL_LIBRARY } from '@engine/skills/library';
import { executePrototype } from '@engine/skills/prototypes';
import { applyStatus } from '@engine/skills/effects/status';
import { applyCastTriggers, applyColorMatchTriggers, getTrait, resolvePassives } from '@engine/traits';
import { damageCharacter, damageFixture } from '../helpers/damageFixture';
import { CUIXIANG_CHIXIGUA_ID, CUIXIANG_CHIXIGUA_SPELL_ID, COMMUNITY_KINGDOM, COMMUNITY_RACE } from '../../src/data/communityTroops';
import { getTroopById, getTroopByRef, TROOPS } from '../../src/data/troops';
import { kingdomTroopPool } from '../../src/meta/data/kingdoms';
import { rarityNameByIndex } from '../../src/meta/data/rarity';
import { troopArt } from '../../src/meta/screens/teamScreen';
import { newSave } from '../../src/meta/state/schema';
import { grantTroop, getRecord } from '../../src/meta/systems/troopProgress';
import { metaKnownTraitIds, troopToSnapshot } from '../../src/meta/systems/battleBridge';

const traits = ['cuixiang_slime_care', 'cuixiang_vine_dream', 'cuixiang_green_nap'];

function battle() {
  const f = damageFixture();
  Object.assign(f.caster, { name: '翠香吃西瓜', magic: 8, manaCost: 13, mana: 13,
    colors: [BaseColor.Green, BaseColor.Yellow], skillId: String(CUIXIANG_CHIXIGUA_SPELL_ID) });
  const allies = [
    damageCharacter(1, { hp: 30, maxHp: 100, armor: 100 }),
    damageCharacter(2, { hp: 40, maxHp: 100, armor: 0 }),
    damageCharacter(3, { hp: 50, maxHp: 100, armor: 0 }),
  ];
  f.state.teams[PlayerSide.Left].characters.push(...allies);
  return { ...f, allies };
}

describe('翠香吃西瓜', () => {
  it('registers as a green-yellow UltraRare visitor with an unlockable 13-mana spell', () => {
    const troop = getTroopById(CUIXIANG_CHIXIGUA_ID)!;
    expect(getTroopByRef('CuixiangChixigua')).toBe(troop);
    expect(TROOPS.filter(t => t.spell.id === CUIXIANG_CHIXIGUA_SPELL_ID)).toHaveLength(1);
    expect(troop).toMatchObject({ name: '翠香吃西瓜', rarity: 'UltraRare', rarityIdx: 3,
      kingdom: COMMUNITY_KINGDOM, troopTypes: [COMMUNITY_RACE], role: 'Support',
      manaColors: [BaseColor.Green, BaseColor.Yellow], manaCost: 13, spell: { name: '史莱姆抱枕' } });
    expect(rarityNameByIndex(troop.rarityIdx)).toBe('传说');
    expect(kingdomTroopPool(COMMUNITY_KINGDOM)).toContain(troop);
    expect(troop.artUrl).toContain('cuixiang-chixigua.webp');
    expect(troopArt(troop)).toBe(troop.artUrl);
    expect(troop.traits.map(t => t.code)).toEqual(traits);
    traits.forEach(code => { expect(getTrait(code)).toBeDefined(); expect(metaKnownTraitIds()).toContain(code); });
    const save = newSave({ now: 0, starterTroopIds: [] });
    grantTroop(save, CUIXIANG_CHIXIGUA_ID);
    const record = getRecord(save, CUIXIANG_CHIXIGUA_ID)!;
    expect(troopToSnapshot(troop, record, '翠香吃西瓜').traitIds).toEqual([]);
    record.traits = [true, true, true];
    expect(troopToSnapshot(troop, record, '翠香吃西瓜')).toMatchObject({
      traitIds: traits, skillId: String(CUIXIANG_CHIXIGUA_SPELL_ID), portraitUrl: troop.artUrl,
    });
  });

  it('grows the two lowest current-HP other allies, then protects the front caster', () => {
    const f = battle();
    f.caster.hp = 5; f.caster.maxHp = 100;
    const events = executePrototype(SKILL_LIBRARY[CUIXIANG_CHIXIGUA_SPELL_ID], f.ctx);
    expect(f.allies.map(c => [c.hp, c.maxHp, c.armor])).toEqual([
      [42, 112, 100], [52, 112, 0], [50, 100, 0],
    ]);
    expect(f.caster).toMatchObject({ hp: 5, maxHp: 100, armor: 8 });
    expect(f.caster.statuses.some(s => s.id === 'barrier')).toBe(true);
    expect(events.filter(e => e.type === 'buff' && e.stat === 'hp')).toHaveLength(2);
  });

  it('may give the front ally both Life and protection; ties use team order', () => {
    const f = battle();
    f.caster.hp = 1000;
    f.allies[0].hp = 40; f.allies[1].hp = 40; f.allies[2].hp = 40;
    f.state.teams[PlayerSide.Left].characters.splice(0, 4, ...f.allies, f.caster);
    executePrototype(SKILL_LIBRARY[CUIXIANG_CHIXIGUA_SPELL_ID], f.ctx);
    expect(f.allies.map(c => c.hp)).toEqual([52, 52, 40]);
    expect(f.allies[0]).toMatchObject({ armor: 108, maxHp: 112 });
    expect(f.allies[0].statuses.some(s => s.id === 'barrier')).toBe(true);
    expect(f.caster.armor).toBe(0);
  });

  it('handles fewer than two other living allies without choosing self', () => {
    const f = battle();
    f.state.teams[PlayerSide.Left].characters.splice(2);
    executePrototype(SKILL_LIBRARY[CUIXIANG_CHIXIGUA_SPELL_ID], f.ctx);
    expect(f.allies[0]).toMatchObject({ hp: 42, maxHp: 112 });
    expect(f.caster.maxHp).toBe(1000);
    expect(f.caster.armor).toBe(8);
  });

  it('casts through TurnEngine, spends 13 mana, and applies the same target split', () => {
    const f = battle();
    const registry = new ExtensionRegistry();
    registry.prototypes.set(String(CUIXIANG_CHIXIGUA_SPELL_ID), SKILL_LIBRARY[CUIXIANG_CHIXIGUA_SPELL_ID]);
    const engine = new TurnEngine(f.state, f.ctx.rng, f.ctx.nextGemId, registry);
    const events = engine.castSkill(f.caster.id);
    expect(events.some(e => e.type === 'skill-cast')).toBe(true);
    expect(f.caster.mana).toBe(0);
    expect(f.allies.map(c => c.maxHp)).toEqual([112, 112, 100]);
    expect(f.caster.armor).toBe(8);
  });

  it('grants one current and maximum Life to every living ally on an allied cast', () => {
    const f = battle();
    f.caster.traitIds = [traits[0]];
    f.caster.passive = resolvePassives(f.caster.traitIds);
    f.allies[0].hp = 30; f.allies[0].maxHp = 100;
    f.allies[2].defeated = true; f.allies[2].hp = 0;
    applyCastTriggers(f.state.teams[PlayerSide.Left].characters, f.enemies);
    expect(f.caster).toMatchObject({ hp: 1001, maxHp: 1001 });
    expect(f.allies[0]).toMatchObject({ hp: 31, maxHp: 101 });
    expect(f.allies[1]).toMatchObject({ hp: 41, maxHp: 101 });
    expect(f.allies[2].hp).toBe(0);
  });

  it('creates one Entangle Gem at the start of its own turn', () => {
    const f = battle();
    const right = f.enemies[0];
    right.traitIds = [traits[1]];
    right.passive = resolvePassives(right.traitIds);
    for (let row = 0; row < 8; row++) for (let col = 0; col < 8; col++) {
      const colors = [BaseColor.Blue, BaseColor.Green, BaseColor.Yellow, BaseColor.Purple];
      f.board.set({ row, col }, { id: row * 8 + col + 1, type: colorGem(colors[(row + col) % 4]) });
    }
    const engine = new TurnEngine(f.state, new SeededRNG(17), f.ctx.nextGemId, new ExtensionRegistry());
    const events = engine.passTurn();
    const changes = events.flatMap(e => e.type === 'gem-transform' ? e.changes : []);
    expect(changes.filter(c => c.to.kind === 'special' && c.to.spec.kind === 'entangleGem')).toHaveLength(1);
  });

  it('gains Enchanted only when green is matched and its trait is unlocked', () => {
    const f = battle();
    f.caster.traitIds = [traits[2]];
    f.caster.passive = resolvePassives(f.caster.traitIds);
    const team = f.state.teams[PlayerSide.Left].characters;
    const opts = { applyStatus, rng: f.ctx.rng };
    applyColorMatchTriggers(team, BaseColor.Yellow, opts);
    expect(f.caster.statuses).toEqual([]);
    applyColorMatchTriggers(team, BaseColor.Green, opts);
    expect(f.caster.statuses).toContainEqual({ id: 'enchanted', turns: 3 });
    expect(f.allies.every(c => c.statuses.length === 0)).toBe(true);
    f.caster.statuses = []; f.caster.traitIds = []; f.caster.passive = resolvePassives([]);
    applyColorMatchTriggers(team, BaseColor.Green, opts);
    expect(f.caster.statuses).toEqual([]);
  });
});
