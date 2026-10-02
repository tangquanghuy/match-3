import { describe, expect, it } from 'vitest';
import { TurnEngine } from '@engine/TurnEngine';
import { ManaDistributor } from '@engine/ManaDistributor';
import { ExtensionRegistry } from '@engine/registry';
import { SKILL_LIBRARY } from '@engine/skills/library';
import { executePrototype } from '@engine/skills/prototypes';
import { POSITIVE_STATUS_IDS } from '@engine/skills/effects/status';
import { FixedTargetChooser } from '@engine/skills/targetChooser';
import { getTrait, attachPassives } from '@engine/traits';
import { BaseColor, PlayerSide, colorGem } from '@engine/types';
import { SHIRAKYUSU_ANNA_ID as ID, SHIRAKYUSU_ANNA_SPELL_ID as SPELL_ID, COMMUNITY_KINGDOM, COMMUNITY_RACE } from '../../src/data/communityTroops';
import { getTroopById, getTroopByRef, TROOPS } from '../../src/data/troops';
import { kingdomTroopPool } from '../../src/meta/data/kingdoms';
import { rarityNameByIndex } from '../../src/meta/data/rarity';
import { troopArt } from '../../src/meta/screens/teamScreen';
import { newSave } from '../../src/meta/state/schema';
import { metaKnownTraitIds, troopToSnapshot } from '../../src/meta/systems/battleBridge';
import { grantTroop, getRecord } from '../../src/meta/systems/troopProgress';
import { damageCharacter, damageFixture } from '../helpers/damageFixture';

const codes = ['waterheart', 'waterlink', 'songofice'];
const proto = SKILL_LIBRARY[SPELL_ID];
function setup(unlocked = false, red = 0) {
  const f = damageFixture(red);
  Object.assign(f.caster, { manaCost: 11, mana: 11, skillId: String(SPELL_ID),
    colors: [BaseColor.Blue, BaseColor.Purple], traitIds: unlocked ? codes : [] });
  attachPassives(f.caster);
  return f;
}
function engineFor(f: ReturnType<typeof setup>) {
  const registry = new ExtensionRegistry(); registry.prototypes.set(String(SPELL_ID), proto);
  const engine = new TurnEngine(f.state, f.ctx.rng, f.ctx.nextGemId, registry);
  engine.setTargetChooser(new FixedTargetChooser(11));
  return engine;
}

describe('Shirakyusu Anna / 静海结界 / 冰潮共鸣', () => {
  it('registers the portrait, UltraRare catalog entry, collection and battle snapshot', () => {
    const troop = getTroopById(ID)!;
    expect(getTroopByRef('Shirakyusu Anna')).toBe(troop);
    expect(TROOPS.filter(t => t.id === ID)).toHaveLength(1);
    expect(TROOPS.filter(t => t.spell.id === SPELL_ID)).toHaveLength(1);
    expect(troop).toMatchObject({ name: 'Shirakyusu Anna', rarity: 'UltraRare', rarityIdx: 3,
      kingdom: COMMUNITY_KINGDOM, troopTypes: [COMMUNITY_RACE], manaCost: 11,
      manaColors: [BaseColor.Blue, BaseColor.Purple], spell: { name: '静海结界',
        description: '消除一名敌人的所有正面增益效果，并将其击晕和冻结。然后将所有红色宝石转换成蓝色宝石。' } });
    expect(rarityNameByIndex(troop.rarityIdx)).toBe('传说');
    expect(kingdomTroopPool(COMMUNITY_KINGDOM)).toContain(troop);
    expect(troop.artUrl).toContain('shirakyusu-anna.webp');
    expect(troopArt(troop)).toBe(troop.artUrl);
    expect(troop.traits.map(t => t.code)).toEqual(codes);
    codes.forEach(code => { expect(getTrait(code)).toBeDefined(); expect(metaKnownTraitIds()).toContain(code); });
    const save = newSave({ now: 0, starterTroopIds: [] });
    grantTroop(save, ID);
    const record = getRecord(save, ID)!;
    expect(troopToSnapshot(troop, record, 'anna').traitIds).toEqual([]);
    record.traits = [true, true, true];
    expect(troopToSnapshot(troop, record, 'anna')).toMatchObject({ name: 'Shirakyusu Anna', traitIds: codes,
      skillId: String(SPELL_ID), manaCost: 11, portraitUrl: troop.artUrl });
  });
  it('dispels all positive statuses on only the chosen enemy, retaining debuffs and removing blessed before stun', () => {
    const f = setup();
    const statuses = [...POSITIVE_STATUS_IDS, 'poison', 'silence', 'web'].map(id => ({ id, turns: 5 }));
    f.enemies.forEach(e => { e.statuses = statuses.map(s => ({ ...s })); });
    f.caster.statuses = [{ id: 'barrier', turns: 5 }];
    const events = executePrototype(proto, f.ctx);
    expect(f.enemies[1].statuses.map(s => s.id)).toEqual(['poison', 'silence', 'web', 'stun', 'freeze']);
    for (const index of [0, 2, 3]) expect(f.enemies[index].statuses).toEqual(statuses);
    expect(f.caster.statuses).toEqual([{ id: 'barrier', turns: 5 }]);
    expect(events.filter(e => e.type === 'status-expire')).toHaveLength(POSITIVE_STATUS_IDS.length);
    expect(f.enemies.every(e => e.hp === 1000 && e.mana === 16 && e.attack === 17)).toBe(true);
  });
  it.each([0, 1, 9])('converts exactly %i red gems to blue and leaves other gems unchanged', red => {
    const f = setup(false, red);
    const before = Array.from({ length: 64 }, (_, i) => f.board.get({ row: Math.floor(i / 8), col: i % 8 })!);
    executePrototype(proto, f.ctx);
    for (let i = 0; i < 64; i++) {
      const after = f.board.get({ row: Math.floor(i / 8), col: i % 8 })!;
      expect(after.type).toEqual(i < red ? colorGem(BaseColor.Blue) : before[i].type);
    }
    expect(f.enemies[1].statuses.some(s => s.id === 'stun')).toBe(true);
  });
  it('honors stun immunity while still dispelling and converting red to blue', () => {
    const f = setup(false, 1);
    f.enemies[1].traitIds = ['invulnerable']; attachPassives(f.enemies[1]);
    f.enemies[1].statuses = [{ id: 'barrier', turns: 5 }];
    executePrototype(proto, f.ctx);
    expect(f.enemies[1].statuses).toEqual([]);
    expect(f.board.get({ row: 0, col: 0 })!.type).toEqual(colorGem(BaseColor.Blue));
  });
  it.each([false, true])('casts via TurnEngine with unlocked traits = %s, spending exactly 13 mana', unlocked => {
    const f = setup(unlocked);
    const engine = engineFor(f);
    const events = engine.castSkill(f.caster.id);
    expect(events[0].type).toBe('skill-cast');
    expect(f.caster.mana).toBe(0);
    expect(events.some(e => e.type === 'status-apply' && e.targetId === 11 && e.statusId === 'stun')).toBe(true);
    expect(events.some(e => e.type === 'status-apply' && e.targetId === 11 && e.statusId === 'freeze')).toBe(true);
    expect(f.enemies.every(e => e.hp === 1000 && e.mana === 16)).toBe(true);
  });
  it('resolves conversion matches into blue mana through the real battle engine', () => {
    const f = setup(true);
    for (let col = 0; col < 3; col++) f.board.set({ row: 7, col }, { id: 57 + col,
      type: colorGem(col === 1 ? BaseColor.Red : BaseColor.Blue) });
    const engine = engineFor(f);
    const events = engine.castSkill(f.caster.id);
    expect(events.some(e => e.type === 'gem-transform')).toBe(true);
    expect(f.caster.mana).toBeGreaterThanOrEqual(4);
  });
  it.each([false, true])('startup heart and ice storm respect trait unlocks = %s', unlocked => {
    const f = setup(unlocked);
    const blue = damageCharacter(1, { colors: [BaseColor.Blue] });
    const red = damageCharacter(2, { colors: [BaseColor.Red] });
    const fallen = damageCharacter(3, { colors: [BaseColor.Blue], defeated: true, hp: 0 });
    f.state.teams[PlayerSide.Left].characters.push(blue, red, fallen);
    const engine = engineFor(f);
    expect(f.caster.maxHp).toBe(unlocked ? 1002 : 1000);
    expect(f.caster.hp).toBe(f.caster.maxHp);
    expect(blue.maxHp).toBe(1000);
    expect(red.maxHp).toBe(1000);
    if (unlocked) {
      expect(f.state.teams[PlayerSide.Left].storm).toEqual({ color: BaseColor.Blue, turns: 8, troopId: 9003 });
      expect(engine.takeInitialEvents()).toContainEqual({ type: 'storm-change', player: PlayerSide.Left,
        color: BaseColor.Blue, reason: 'set' });
    } else {
      expect(f.state.teams[PlayerSide.Left].storm).toBeFalsy();
      expect(engine.takeInitialEvents()).toEqual([]);
    }
  });
  it.each([BaseColor.Blue, BaseColor.Purple, BaseColor.Red])('waterlink grants bonus only to blue matches (%s)', color => {
    const f = setup(true); f.caster.mana = 0;
    new ManaDistributor().distribute(f.state.teams[PlayerSide.Left], PlayerSide.Left, color, 3);
    expect(f.caster.mana).toBe(color === BaseColor.Blue ? 4 : color === BaseColor.Purple ? 3 : 0);
  });
});
