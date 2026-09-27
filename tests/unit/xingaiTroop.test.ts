import { describe, expect, it } from 'vitest';
import { BoardModel } from '@engine/BoardModel';
import { createGameState } from '@engine/GameState';
import { TurnEngine } from '@engine/TurnEngine';
import { SeededRNG } from '@engine/rng';
import { SKILL_LIBRARY } from '@engine/skills/library';
import { reduce, skill } from '@engine/skills/builders';
import { executePrototype } from '@engine/skills/prototypes';
import { getTrait, resolvePassives } from '@engine/traits';
import { BaseColor, PlayerSide, colorGem } from '@engine/types';
import type { Character } from '@engine/types';
import { XINGAI_ID, XINGAI_SPELL_ID, COMMUNITY_KINGDOM, COMMUNITY_RACE } from '../../src/data/communityTroops';
import { getTroopById, getTroopByRef, TROOPS } from '../../src/data/troops';
import { kingdomTroopPool } from '../../src/meta/data/kingdoms';
import { rarityNameByIndex } from '../../src/meta/data/rarity';
import { troopArt } from '../../src/meta/screens/teamScreen';
import { newSave } from '../../src/meta/state/schema';
import { metaKnownTraitIds, troopToSnapshot } from '../../src/meta/systems/battleBridge';
import { grantTroop, getRecord } from '../../src/meta/systems/troopProgress';

function character(id: number, mana: number, overrides: Partial<Character> = {}): Character {
  return {
    id, name: `C${id}`, maxHp: 40, hp: 40, attack: 10, armor: 5, magic: 0,
    colors: [BaseColor.Red], manaCost: 15, mana, skillId: 'none',
    statuses: [], defeated: false, ...overrides,
  };
}

describe('好想星艾 / 法力征调', () => {
  it('registers a yellow-red UltraRare troop with a real portrait and three active traits', () => {
    const troop = getTroopById(XINGAI_ID)!;
    expect(getTroopByRef('HaoXiangXingAi')).toBe(troop);
    expect(TROOPS.filter((unit) => unit.id === XINGAI_ID)).toHaveLength(1);
    expect(TROOPS.filter((unit) => unit.spell.id === XINGAI_SPELL_ID)).toHaveLength(1);
    expect(troop.name).toBe('好想星艾');
    expect(troop.kingdom).toBe(COMMUNITY_KINGDOM);
    expect(troop.troopTypes).toEqual([COMMUNITY_RACE]);
    expect(kingdomTroopPool(COMMUNITY_KINGDOM)).toContain(troop);
    expect(troop.rarity).toBe('UltraRare');
    expect(rarityNameByIndex(troop.rarityIdx)).toBe('传说');
    expect(troop.manaColors).toEqual([BaseColor.Yellow, BaseColor.Red]);
    expect(troop.manaCost).toBe(15);
    expect(troop.spell.name).toBe('法力征调');
    expect(troop.artUrl).toContain('haoxiang-xingai.png');
    expect(troopArt(troop)).toBe(troop.artUrl);

    const codes = ['fast', 'manashield', 'revered'];
    expect(troop.traits.map((trait) => trait.code)).toEqual(codes);
    for (const code of codes) {
      expect(getTrait(code)).toBeDefined();
      expect(metaKnownTraitIds()).toContain(code);
    }
    expect(getTrait('fast')?.battleStartManaRatio).toBe(0.5);
    expect(resolvePassives(codes).manaOpsImmunity).toBe(true);
    expect(getTrait('revered')?.teamAura).toMatchObject({ scope: 'allies', stat: 'random', amount: 2 });

    const save = newSave({ now: 0, starterTroopIds: [] });
    grantTroop(save, XINGAI_ID);
    const record = getRecord(save, XINGAI_ID)!;
    expect(troopToSnapshot(troop, record, 'xingai').traitIds).toEqual([]);
    record.traits = [true, true, true];
    const snapshot = troopToSnapshot(troop, record, 'xingai');
    expect(snapshot.traitIds).toEqual(codes);
    expect(snapshot.skillId).toBe(String(XINGAI_SPELL_ID));
    expect(snapshot.portraitUrl).toBe(troop.artUrl);
    expect(snapshot.manaCost).toBe(15);
  });

  it('drains at most 6 mana from the chosen enemy, grants 4 to the lowest-mana other ally, then converts yellow to blue', () => {
    const board = new BoardModel();
    let nextId = 1;
    for (let row = 0; row < BoardModel.ROWS; row++) {
      for (let col = 0; col < BoardModel.COLS; col++) {
        const color = (row + col) % 2 === 0 ? BaseColor.Yellow : BaseColor.Red;
        board.set({ row, col }, { id: nextId++, type: colorGem(color) });
      }
    }
    const caster = character(0, 0);
    const allyA = character(1, 5);
    const allyB = character(2, 1);
    const allyC = character(3, 1);
    const enemyA = character(10, 12);
    const enemyB = character(11, 4);
    const state = createGameState(board,
      { player: PlayerSide.Left, characters: [caster, allyA, allyB, allyC] },
      { player: PlayerSide.Right, characters: [enemyA, enemyB] },
    );
    const prototype = SKILL_LIBRARY[XINGAI_SPELL_ID];
    expect(prototype).toBeDefined();
    expect(prototype.segments.map((segment) => segment.kind)).toEqual(['reduce', 'buff', 'gem']);
    const events = executePrototype(prototype, {
      state, casterId: 0, chosenTargetId: 11,
      rng: new SeededRNG(10005), nextGemId: () => nextId++,
    });
    expect(enemyA.mana).toBe(12);
    expect(enemyB.mana).toBe(0);
    expect(allyA.mana).toBe(5);
    expect(allyB.mana).toBe(5); // equal starting mana: earlier ally wins
    expect(allyC.mana).toBe(1);
    expect(caster.mana).toBe(0);
    expect(events.some((event) => event.type === 'gem-transform')).toBe(true);
    for (let row = 0; row < BoardModel.ROWS; row++) {
      for (let col = 0; col < BoardModel.COLS; col++) {
        const expected = (row + col) % 2 === 0 ? BaseColor.Blue : BaseColor.Red;
        expect(board.get({ row, col })?.type).toEqual(colorGem(expected));
      }
    }
  });


  it('activates fast start, random team skill points, and mana-operation immunity in battle', () => {
    const caster = character(0, 0, { traitIds: ['fast', 'manashield', 'revered'] });
    const ally = character(1, 0);
    const enemy = character(10, 10);
    const total = (c: Character) => c.attack + c.armor + c.maxHp + c.magic;
    const baseline = [total(caster), total(ally), total(enemy)];
    const state = createGameState(new BoardModel(),
      { player: PlayerSide.Left, characters: [caster, ally] },
      { player: PlayerSide.Right, characters: [enemy] },
    );
    let nextId = 1;
    new TurnEngine(state, new SeededRNG(10005), () => nextId++);
    expect(caster.mana).toBe(7); // floor(15 * 50%)
    expect(total(caster)).toBe(baseline[0]! + 2);
    expect(total(ally)).toBe(baseline[1]! + 2);
    expect(total(enemy)).toBe(baseline[2]);

    executePrototype(skill(reduce('enemyChosen', 'mana', 6, 0)), {
      state, casterId: enemy.id, chosenTargetId: caster.id,
      rng: new SeededRNG(8), nextGemId: () => nextId++,
    });
    expect(caster.mana).toBe(7); // manashield blocks enemy mana reduction
  });

  it('does not grant mana to the caster if no other ally survives', () => {
    const caster = character(0, 0);
    const fallen = character(1, 0, { defeated: true, hp: 0 });
    const enemy = character(10, 9);
    const state = createGameState(new BoardModel(),
      { player: PlayerSide.Left, characters: [caster, fallen] },
      { player: PlayerSide.Right, characters: [enemy] },
    );
    executePrototype(SKILL_LIBRARY[XINGAI_SPELL_ID], {
      state, casterId: 0, chosenTargetId: 10,
      rng: new SeededRNG(10005), nextGemId: () => 1,
    });
    expect(enemy.mana).toBe(3);
    expect(caster.mana).toBe(0);
  });
});