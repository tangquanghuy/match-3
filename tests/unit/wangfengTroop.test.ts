import { describe, expect, it } from 'vitest';
import { TurnEngine } from '@engine/TurnEngine';
import { ExtensionRegistry } from '@engine/registry';
import { executePrototype } from '@engine/skills/prototypes';
import { SKILL_LIBRARY } from '@engine/skills/library';
import { attachPassives, getTrait } from '@engine/traits';
import { BaseColor, PlayerSide, colorGem } from '@engine/types';
import {
  COMMUNITY_KINGDOM,
  COMMUNITY_RACE,
  WANGFENG_ID,
  WANGFENG_SPELL_ID,
} from '../../src/data/communityTroops';
import { getTroopById, getTroopByRef, troopToSummonTemplate, TROOPS } from '../../src/data/troops';
import { kingdomTroopPool } from '../../src/meta/data/kingdoms';
import { rarityNameByIndex } from '../../src/meta/data/rarity';
import { troopArt } from '../../src/meta/screens/teamScreen';
import { newSave } from '../../src/meta/state/schema';
import { metaKnownTraitIds, troopToSnapshot } from '../../src/meta/systems/battleBridge';
import { grantTroop, getRecord } from '../../src/meta/systems/troopProgress';
import { damageCharacter, damageFixture } from '../helpers/damageFixture';

const TRAITS = ['inscribed', 'darkancestry', 'songofdarkness'];
const prototype = SKILL_LIBRARY[WANGFENG_SPELL_ID];

describe('WangFeng / 禁典开扉', () => {
  it('以史诗紫棕生成者接入图鉴、时空裂隙和战斗快照', () => {
    const troop = getTroopById(WANGFENG_ID)!;
    expect(getTroopByRef('WangFeng')).toBe(troop);
    expect(TROOPS.filter(entry => entry.id === WANGFENG_ID)).toHaveLength(1);
    expect(TROOPS.filter(entry => entry.spell.id === WANGFENG_SPELL_ID)).toHaveLength(1);
    expect(troop).toMatchObject({
      name: 'WangFeng',
      rarity: 'Epic',
      rarityIdx: 4,
      kingdom: COMMUNITY_KINGDOM,
      troopTypes: [COMMUNITY_RACE],
      role: 'Generator',
      manaColors: [BaseColor.Purple, BaseColor.Brown],
      manaCost: 16,
      spell: { name: '禁典开扉' },
    });
    expect(rarityNameByIndex(troop.rarityIdx)).toBe('史诗');
    expect(troop.spell.description).toBe(
      '将所有红色宝石转换为紫色宝石，并将所有黄色宝石转换为棕色宝石。召唤一名触手之墙，并将其推至队首。',
    );
    expect(troop.spell.meta?.scalings).toEqual([]);
    expect(troop.traits.map(trait => trait.code)).toEqual(TRAITS);
    for (const code of TRAITS) {
      expect(getTrait(code)).toBeDefined();
      expect(metaKnownTraitIds()).toContain(code);
    }
    expect(kingdomTroopPool(COMMUNITY_KINGDOM)).toContain(troop);
    expect(troop.artUrl).toContain('wangfeng.png');
    expect(troopArt(troop)).toBe(troop.artUrl);

    const save = newSave({ now: 0, starterTroopIds: [] });
    grantTroop(save, WANGFENG_ID);
    const record = getRecord(save, WANGFENG_ID)!;
    expect(troopToSnapshot(troop, record, 'wangfeng').traitIds).toEqual([]);
    record.traits = [true, true, true];
    expect(troopToSnapshot(troop, record, 'wangfeng')).toMatchObject({
      name: 'WangFeng',
      traitIds: TRAITS,
      skillId: String(WANGFENG_SPELL_ID),
      manaCost: 16,
      portraitUrl: troop.artUrl,
    });
  });

  it('将全部红色转为紫色、黄色转为棕色，并召唤触手之墙', () => {
    const f = damageFixture();
    Object.assign(f.caster, {
      skillId: String(WANGFENG_SPELL_ID),
      manaCost: 16,
      mana: 16,
      colors: [BaseColor.Purple, BaseColor.Brown],
    });
    const original = [
      BaseColor.Red, BaseColor.Red, BaseColor.Yellow, BaseColor.Yellow,
      BaseColor.Green, BaseColor.Blue, BaseColor.Purple, BaseColor.Brown,
    ];
    for (let col = 0; col < original.length; col++) {
      f.board.set({ row: 0, col }, { id: 500 + col, type: colorGem(original[col]!) });
    }

    const events = executePrototype(prototype, {
      ...f.ctx,
      resolveSummonRef: troopToSummonTemplate,
    });

    expect(Array.from({ length: 8 }, (_, col) => f.board.get({ row: 0, col })!.type)).toEqual([
      colorGem(BaseColor.Purple), colorGem(BaseColor.Purple),
      colorGem(BaseColor.Brown), colorGem(BaseColor.Brown),
      colorGem(BaseColor.Green), colorGem(BaseColor.Blue),
      colorGem(BaseColor.Purple), colorGem(BaseColor.Brown),
    ]);
    const team = f.state.teams[PlayerSide.Left];
    expect(team.characters).toHaveLength(2);
    expect(team.characters[0]).toMatchObject({
      name: '触手之墙',
      skillId: '7981',
      mana: 0,
      defeated: false,
    });
    expect(events).toContainEqual(expect.objectContaining({
      type: 'summon',
      player: PlayerSide.Left,
      troopId: 6648,
      destination: 'field',
      slot: 1,
    }));
    expect(events).toContainEqual({
      type: 'troop-reposition', targetId: team.characters[0].id, to: 'front', index: 0,
    });
  });

  it('满四人时只执行双转换，召唤和推至队首均不触发', () => {
    const f = damageFixture();
    Object.assign(f.caster, {
      skillId: String(WANGFENG_SPELL_ID),
      manaCost: 16,
      mana: 16,
      colors: [BaseColor.Purple, BaseColor.Brown],
    });
    f.state.teams[PlayerSide.Left].characters.push(
      damageCharacter(1), damageCharacter(2), damageCharacter(3),
    );
    f.board.set({ row: 0, col: 0 }, { id: 800, type: colorGem(BaseColor.Red) });
    f.board.set({ row: 0, col: 1 }, { id: 801, type: colorGem(BaseColor.Yellow) });

    const events = executePrototype(prototype, {
      ...f.ctx,
      resolveSummonRef: troopToSummonTemplate,
    });

    expect(f.state.teams[PlayerSide.Left].characters.map(character => character.id)).toEqual([0, 1, 2, 3]);
    expect(events.some(event => event.type === 'summon' || event.type === 'troop-reposition')).toBe(false);
    expect(f.board.get({ row: 0, col: 0 })!.type).toEqual(colorGem(BaseColor.Purple));
    expect(f.board.get({ row: 0, col: 1 })!.type).toEqual(colorGem(BaseColor.Brown));
  });

  it('暗之歌在战斗开始时召唤持续 8 回合的暗风暴', () => {
    const f = damageFixture();
    Object.assign(f.caster, {
      traitIds: TRAITS,
      colors: [BaseColor.Purple, BaseColor.Brown],
      skillId: String(WANGFENG_SPELL_ID),
    });
    attachPassives(f.caster);
    const registry = new ExtensionRegistry();
    registry.prototypes.set(String(WANGFENG_SPELL_ID), prototype);
    const engine = new TurnEngine(f.state, f.ctx.rng, f.ctx.nextGemId, registry);
    expect(f.state.teams[PlayerSide.Left].storm).toEqual({
      color: BaseColor.Purple,
      turns: 8,
      troopId: 9001,
    });
    expect(engine.takeInitialEvents()).toContainEqual({
      type: 'storm-change',
      player: PlayerSide.Left,
      color: BaseColor.Purple,
      reason: 'set',
    });
  });
});

