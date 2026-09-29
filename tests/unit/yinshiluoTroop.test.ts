import { describe, expect, it } from 'vitest';
import { BoardModel } from '@engine/BoardModel';
import { createGameState } from '@engine/GameState';
import { SeededRNG } from '@engine/rng';
import { executePrototype } from '@engine/skills/prototypes';
import { SKILL_LIBRARY } from '@engine/skills/library';
import { getTrait } from '@engine/traits';
import { BaseColor, PlayerSide, colorGem, type Character } from '@engine/types';
import {
  COMMUNITY_KINGDOM,
  COMMUNITY_RACE,
  YINSHILUO_ID,
  YINSHILUO_SPELL_ID,
} from '../../src/data/communityTroops';
import { getTroopById, getTroopByRef, TROOPS } from '../../src/data/troops';
import { kingdomTroopPool } from '../../src/meta/data/kingdoms';
import { troopArt } from '../../src/meta/screens/teamScreen';
import { newSave } from '../../src/meta/state/schema';
import { metaKnownTraitIds, troopToSnapshot } from '../../src/meta/systems/battleBridge';
import { grantTroop, getRecord } from '../../src/meta/systems/troopProgress';

const TRAITS = ['naturespirit', 'spellarmor', 'magiclink'];

function character(id: number, overrides: Partial<Character> = {}): Character {
  return {
    id,
    name: `C${id}`,
    maxHp: 50,
    hp: 40,
    attack: 8,
    armor: 6,
    magic: 0,
    colors: [BaseColor.Green],
    manaCost: 14,
    mana: 0,
    skillId: 'none',
    statuses: [],
    defeated: false,
    ...overrides,
  };
}

function potionGems(board: BoardModel): Array<{ color?: BaseColor }> {
  const found: Array<{ color?: BaseColor }> = [];
  for (let row = 0; row < BoardModel.ROWS; row++) {
    for (let col = 0; col < BoardModel.COLS; col++) {
      const gem = board.get({ row, col })?.type;
      if (gem?.kind === 'special' && gem.spec.kind === 'manaPotionGem') found.push(gem.spec);
    }
  }
  return found;
}

describe('銀蒔蘿 / 花露秘酿', () => {
  it('以传说绿紫辅助单位接入图鉴、时空裂隙和战斗快照', () => {
    const troop = getTroopById(YINSHILUO_ID)!;
    expect(getTroopByRef('YinShiLuo')).toBe(troop);
    expect(TROOPS.filter(entry => entry.id === YINSHILUO_ID)).toHaveLength(1);
    expect(TROOPS.filter(entry => entry.spell.id === YINSHILUO_SPELL_ID)).toHaveLength(1);
    expect(troop).toMatchObject({
      name: '銀蒔蘿',
      rarity: 'UltraRare',
      rarityIdx: 3,
      kingdom: COMMUNITY_KINGDOM,
      troopTypes: [COMMUNITY_RACE, 'Elf'],
      role: 'Support',
      manaColors: [BaseColor.Green, BaseColor.Purple],
      manaCost: 14,
      spell: { name: '花露秘酿' },
    });
    expect(troop.spell.description).toBe(
      '净化一名盟友，并给予其 [魔法 + 2] 点生命值。创造 1 颗绿色法力药水宝石和 1 颗紫色法力药水宝石。',
    );
    expect(troop.spell.meta?.scalings).toContainEqual({ base: 2, mult: 1 });
    expect(troop.traits.map(trait => trait.code)).toEqual(TRAITS);
    for (const code of TRAITS) {
      expect(getTrait(code)).toBeDefined();
      expect(metaKnownTraitIds()).toContain(code);
    }
    expect(kingdomTroopPool(COMMUNITY_KINGDOM)).toContain(troop);
    expect(troop.artUrl).toContain('yinshiluo.webp');
    expect(troopArt(troop)).toBe(troop.artUrl);

    const save = newSave({ now: 0, starterTroopIds: [] });
    grantTroop(save, YINSHILUO_ID);
    const record = getRecord(save, YINSHILUO_ID)!;
    expect(troopToSnapshot(troop, record, 'yinshiluo').traitIds).toEqual([]);
    record.traits = [true, true, true];
    expect(troopToSnapshot(troop, record, 'yinshiluo')).toMatchObject({
      name: '銀蒔蘿',
      traitIds: TRAITS,
      skillId: String(YINSHILUO_SPELL_ID),
      manaCost: 14,
      portraitUrl: troop.artUrl,
    });
  });

  it('净化选定盟友、给予魔法+2生命值，并各创造一颗绿紫法力药水宝石', () => {
    const board = new BoardModel();
    const colors = [BaseColor.Red, BaseColor.Green, BaseColor.Blue, BaseColor.Yellow, BaseColor.Purple, BaseColor.Brown];
    let gemId = 1;
    for (let row = 0; row < BoardModel.ROWS; row++) {
      for (let col = 0; col < BoardModel.COLS; col++) {
        board.set({ row, col }, { id: gemId++, type: colorGem(colors[(row + col * 2) % colors.length]!) });
      }
    }
    const caster = character(0, { magic: 10, colors: [BaseColor.Green, BaseColor.Purple] });
    const chosen = character(1, {
      hp: 31,
      maxHp: 50,
      statuses: [
        { id: 'poison', turns: 3 },
        { id: 'silence', turns: 2 },
        { id: 'entangle', turns: 1 },
      ],
    });
    const untouched = character(2, { hp: 27, statuses: [{ id: 'poison', turns: 3 }] });
    const state = createGameState(
      board,
      { player: PlayerSide.Left, characters: [caster, chosen, untouched] },
      { player: PlayerSide.Right, characters: [character(10)] },
    );
    const prototype = SKILL_LIBRARY[YINSHILUO_SPELL_ID];
    expect(prototype).toBeDefined();

    const events = executePrototype(prototype, {
      state,
      casterId: caster.id,
      chosenTargetId: chosen.id,
      rng: new SeededRNG(YINSHILUO_ID),
      nextGemId: () => gemId++,
    });

    expect(chosen.statuses).toEqual([]);
    expect(chosen.maxHp).toBe(62);
    expect(chosen.hp).toBe(43);
    expect(untouched).toMatchObject({ hp: 27, maxHp: 50, statuses: [{ id: 'poison', turns: 3 }] });
    expect(caster).toMatchObject({ hp: 40, maxHp: 50 });
    expect(events).toContainEqual({ type: 'buff', targetId: chosen.id, stat: 'hp', amount: 12, maxHpGain: 12 });

    const potions = potionGems(board);
    expect(potions).toHaveLength(2);
    expect(potions.map(gem => gem.color).sort()).toEqual([BaseColor.Green, BaseColor.Purple].sort());
  });
});
