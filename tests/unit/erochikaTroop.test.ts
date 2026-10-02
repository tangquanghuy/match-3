import { describe, expect, it } from 'vitest';
import { BaseColor, PlayerSide, colorGem } from '@engine/types';
import { ManaDistributor } from '@engine/ManaDistributor';
import { TurnEngine } from '@engine/TurnEngine';
import { ExtensionRegistry } from '@engine/registry';
import { applyCastTriggers, getTrait, resolvePassives } from '@engine/traits';
import { executePrototype } from '@engine/skills/prototypes';
import { SKILL_LIBRARY, registerSkillLibrary } from '@engine/skills/library';
import { prototypeChosenTargetMode } from '@engine/skills/targetChooser';
import { applyStatus } from '@engine/skills/effects/status';
import { damageFixture, damageCharacter } from '../helpers/damageFixture';
import { EROCHIKA_ID, EROCHIKA_SPELL_ID, COMMUNITY_KINGDOM, COMMUNITY_RACE } from '../../src/data/communityTroops';
import { TROOPS, getTroopById, getTroopByRef, troopToSummonTemplate } from '../../src/data/troops';
import { kingdomTroopPool } from '../../src/meta/data/kingdoms';
import { troopArt } from '../../src/meta/screens/teamScreen';
import { newSave } from '../../src/meta/state/schema';
import { grantTroop, getRecord } from '../../src/meta/systems/troopProgress';
import { metaKnownTraitIds, troopToSnapshot } from '../../src/meta/systems/battleBridge';

const traitIds = ['airlink', 'invigorated', 'bornoflight'];
function fixture(unlocked = false) {
  const f = damageFixture();
  const troop = getTroopById(EROCHIKA_ID)!;
  Object.assign(f.caster, { name: troop.name, magic: 10, colors: troop.manaColors,
    manaCost: 12, mana: 12, skillId: String(EROCHIKA_SPELL_ID),
    traitIds: unlocked ? traitIds : [], passive: resolvePassives(unlocked ? traitIds : []) });
  return f;
}
function engineFixture(unlocked = false) {
  const f = fixture(unlocked);
  // A stable, blue-free board: isolate casting and turn-start hooks from cascades.
  const colors = [BaseColor.Red, BaseColor.Green, BaseColor.Purple, BaseColor.Brown, BaseColor.Yellow];
  for (let row = 0; row < 8; row++) for (let col = 0; col < 8; col++) {
    f.board.set({ row, col }, { id: 1 + row * 8 + col, type: colorGem(colors[(row * 2 + col) % colors.length]) });
  }
  const registry = new ExtensionRegistry(); registerSkillLibrary(registry.prototypes);
  const engine = new TurnEngine(f.state, f.ctx.rng, f.ctx.nextGemId, registry);
  engine.setTargetChooser({ choose: () => 11 });
  engine.skullChance = 0;
  return { ...f, engine };
}

describe('Erochika / 秋庭扫叶', () => {
  it('registers the confirmed rarity, mana, traits, spell and portrait exactly once', () => {
    const troop = getTroopById(EROCHIKA_ID)!;
    expect(getTroopByRef('Erochika')).toBe(troop);
    expect(TROOPS.filter(t => t.id === EROCHIKA_ID)).toHaveLength(1);
    expect(TROOPS.filter(t => t.spell.id === EROCHIKA_SPELL_ID)).toHaveLength(1);
    expect(troop).toMatchObject({ name: 'Erochika', rarity: 'UltraRare', rarityIdx: 3,
      kingdom: COMMUNITY_KINGDOM, troopTypes: [COMMUNITY_RACE], manaCost: 12,
      manaColors: [BaseColor.Purple, BaseColor.Yellow], spell: { id: EROCHIKA_SPELL_ID, name: '秋庭扫叶' } });
    expect(troop.spell.description).toBe('对一名敌人造成 [魔法 + 2] 点真实伤害，并窃取其 2 点魔力值。将所有蓝色宝石转换为黄色宝石。');
    expect(troop.traits.map(t => t.code)).toEqual(traitIds);
    expect(troop.artUrl).toContain('erochika.webp');
    expect(troopArt(troop)).toBe(troop.artUrl);
    expect(kingdomTroopPool(COMMUNITY_KINGDOM)).toContain(troop);
    expect(prototypeChosenTargetMode(SKILL_LIBRARY[EROCHIKA_SPELL_ID])).toBe('enemyChosen');
    expect(troopToSummonTemplate('Erochika')).toMatchObject({ name: 'Erochika', manaCost: 12, skillId: String(EROCHIKA_SPELL_ID) });
    traitIds.forEach(code => { expect(getTrait(code)).toBeDefined(); expect(metaKnownTraitIds()).toContain(code); });
  });

  it('collection and battle snapshots respect trait unlocks', () => {
    const troop = getTroopById(EROCHIKA_ID)!;
    const save = newSave({ now: 0, starterTroopIds: [] }); grantTroop(save, EROCHIKA_ID);
    const record = getRecord(save, EROCHIKA_ID)!;
    expect(troopToSnapshot(troop, record, 'Erochika').traitIds).toEqual([]);
    record.traits = [true, true, true];
    expect(troopToSnapshot(troop, record, 'Erochika')).toMatchObject({ name: 'Erochika',
      manaCost: 12, skillId: String(EROCHIKA_SPELL_ID), traitIds, portraitUrl: troop.artUrl });
  });

  it.each([0, 1, 2, 15])('deals true damage first, then steals up to 2 actual magic (target magic=%i)', magic => {
    const f = fixture(); const target = f.enemies[1]; target.magic = magic; target.armor = 200;
    const events = executePrototype(SKILL_LIBRARY[EROCHIKA_SPELL_ID], f.ctx);
    expect(target).toMatchObject({ hp: 988, armor: 200, magic: Math.max(0, magic - 2), mana: 16 });
    expect(f.caster.magic).toBe(10 + Math.min(magic, 2));
    expect(events.filter(e => e.type === 'skill-damage').map(e => [e.targetId, e.damage])).toEqual([[11, 12]]);
    expect(f.enemies.filter(e => e.id !== 11).every(e => e.hp === 1000 && e.magic === 11)).toBe(true);
  });

  it('converts every blue gem to yellow and preserves other colours', () => {
    const f = fixture();
    const before: { row: number; col: number; color: BaseColor }[] = [];
    f.board.forEach((gem, p) => { if (gem?.type.kind === 'color') before.push({ ...p, color: gem.type.color }); });
    const events = executePrototype(SKILL_LIBRARY[EROCHIKA_SPELL_ID], f.ctx);
    expect(events.filter(e => e.type === 'gem-transform').flatMap(e => e.changes)).toHaveLength(before.filter(p => p.color === BaseColor.Blue).length);
    for (const p of before) expect(f.board.get(p)?.type).toEqual(colorGem(p.color === BaseColor.Blue ? BaseColor.Yellow : p.color));
    expect(events.filter(e => e.type === 'extra-turn')).toHaveLength(0);
  });

  it('lethal damage does not steal from a replacement enemy; conversion still happens', () => {
    const f = fixture(); const target = f.enemies[1]; target.hp = 1;
    const events = executePrototype(SKILL_LIBRARY[EROCHIKA_SPELL_ID], f.ctx);
    expect(target.defeated).toBe(true);
    expect(f.caster.magic).toBe(10);
    expect(f.enemies.every(e => e.magic === 11)).toBe(true);
    expect(events.some(e => e.type === 'gem-transform')).toBe(true);
  });

  it('barrier blocks the true-damage hit without blocking magic theft', () => {
    const f = fixture(); const target = f.enemies[1]; applyStatus(target, { id: 'barrier', turns: 3 });
    executePrototype(SKILL_LIBRARY[EROCHIKA_SPELL_ID], f.ctx);
    expect(target).toMatchObject({ hp: 1000, magic: 9 });
    expect(f.caster.magic).toBe(12);
  });

  it('real cast spends 12 mana and invokes its own invigorated trait', () => {
    const f = engineFixture(true);
    const hp = f.caster.hp;
    const events = f.engine.castSkill(0);
    expect(events.filter(e => e.type === 'skill-cast')).toHaveLength(1);
    expect(f.caster.mana).toBe(0);
    expect(f.caster.magic).toBe(12);
    expect(f.caster.hp).toBe(hp + 1);
    expect(f.enemies.find(e => e.id === 11)!.hp).toBe(988);
    expect(f.state.activePlayer).toBe(PlayerSide.Right);
    expect(f.state.actionLog).toHaveLength(1);
  });

  it.each([0, 999])('invalid target %i cancels before mana spending', target => {
    const f = engineFixture(); f.engine.setTargetChooser({ choose: () => target });
    expect(f.engine.castSkill(0).filter(e => e.type === 'skill-cast')).toHaveLength(0);
    expect(f.caster.mana).toBe(12);
  });

  it('11 mana is insufficient to cast', () => {
    const f = engineFixture(); f.caster.mana = 11;
    expect(f.engine.castSkill(0).filter(e => e.type === 'skill-cast')).toHaveLength(0);
    expect(f.caster.mana).toBe(11);
  });

  it.each([true, false])('airlink adds one yellow mana only when unlocked (%s)', unlocked => {
    const f = fixture(unlocked); f.caster.mana = 0;
    const distributor = new ManaDistributor();
    distributor.distribute(f.state.teams[PlayerSide.Left], PlayerSide.Left, BaseColor.Yellow, 3);
    expect(f.caster.mana).toBe(unlocked ? 4 : 3);
    f.caster.mana = 0;
    distributor.distribute(f.state.teams[PlayerSide.Left], PlayerSide.Left, BaseColor.Purple, 3);
    expect(f.caster.mana).toBe(3);
  });

  it('invigorated grants life for allied casts but not enemy casts', () => {
    const f = fixture(true); const allies = f.state.teams[PlayerSide.Left].characters;
    allies.push(damageCharacter(1));
    applyCastTriggers(allies, f.enemies);
    expect(f.caster).toMatchObject({ hp: 1001, maxHp: 1001 });
    applyCastTriggers(f.enemies, allies);
    expect(f.caster).toMatchObject({ hp: 1001, maxHp: 1001 });
  });

  it('stun suppresses airlink and invigorated', () => {
    const f = fixture(true); applyStatus(f.caster, { id: 'stun', turns: 3 }); f.caster.mana = 0;
    new ManaDistributor().distribute(f.state.teams[PlayerSide.Left], PlayerSide.Left, BaseColor.Yellow, 3);
    expect(f.caster.mana).toBe(3);
    applyCastTriggers(f.state.teams[PlayerSide.Left].characters, f.enemies);
    expect(f.caster.hp).toBe(1000);
  });

  it.each([true, false])('bornoflight creates one yellow gem on own turn only (unlocked=%s)', unlocked => {
    const f = engineFixture(unlocked);
    expect(f.engine.passTurn().filter(e => e.type === 'gem-transform')).toHaveLength(0);
    const events = f.engine.passTurn();
    const changes = events.filter(e => e.type === 'gem-transform').flatMap(e => e.changes);
    expect(changes).toHaveLength(unlocked ? 1 : 0);
    if (unlocked) expect(changes[0].to).toEqual(colorGem(BaseColor.Yellow));
  });
});
