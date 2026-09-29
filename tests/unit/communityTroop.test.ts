import { describe, expect, it } from 'vitest';
import { BoardModel } from '@engine/BoardModel';
import { createGameState } from '@engine/GameState';
import { SeededRNG } from '@engine/rng';
import { executePrototype } from '@engine/skills/prototypes';
import { SKILL_LIBRARY } from '@engine/skills/library';
import { getTrait, resolvePassives } from '@engine/traits';
import { BaseColor, PlayerSide, colorGem } from '@engine/types';
import type { Character, Team } from '@engine/types';
import {
  BAILU_YIXI_ID,
  BAILU_YIXI_SPELL_ID,
  CIALLO_ID,
  CIALLO_SPELL_ID,
  CHIKORITA_ID,
  CHIKORITA_SPELL_ID,
  COMMUNITY_KINGDOM,
  COMMUNITY_RACE,
  DOUGLAS_ID,
  DOUGLAS_SPELL_ID,
} from '../../src/data/communityTroops';
import { getTroopById, getTroopByRef, knownTroopTypes, TROOPS } from '../../src/data/troops';
import { allKingdoms, kingdomTroopPool } from '../../src/meta/data/kingdoms';
import { rarityNameByIndex } from '../../src/meta/data/rarity';
import { troopArt } from '../../src/meta/screens/teamScreen';
import { newSave } from '../../src/meta/state/schema';
import { metaKnownTraitIds, troopToSnapshot } from '../../src/meta/systems/battleBridge';
import { grantTroop, getRecord } from '../../src/meta/systems/troopProgress';

function character(id: number, overrides: Partial<Character> = {}): Character {
  return {
    id, name: `C${id}`, maxHp: 50, hp: 45, attack: 5, armor: 0, magic: 4,
    colors: [BaseColor.Blue], manaCost: 15, mana: 15, skillId: 'none',
    statuses: [], defeated: false, ...overrides,
  };
}

describe('白鹭依晞 · 时空裂隙', () => {
  it('进入图鉴和可获取池，不进入普通王国推进序', () => {
    const troop = getTroopById(BAILU_YIXI_ID)!;
    expect(getTroopByRef('BaiLuYiXi')).toBe(troop);
    expect(TROOPS.filter((entry) => entry.id === BAILU_YIXI_ID)).toHaveLength(1);
    expect(troop.kingdom).toBe(COMMUNITY_KINGDOM);
    expect(kingdomTroopPool(COMMUNITY_KINGDOM)).toContain(troop);
    expect(allKingdoms()).not.toContain(COMMUNITY_KINGDOM);
    expect(troop.troopTypes).toEqual([COMMUNITY_RACE]);
    expect(knownTroopTypes()).toContain(COMMUNITY_RACE);
    expect(troop.rarity).toBe('UltraRare');
    expect(rarityNameByIndex(troop.rarityIdx)).toBe('传说');
    expect(troop.role).toBe('Warlock');
    expect(troop.manaColors).toEqual([BaseColor.Blue, BaseColor.Purple]);
    expect(troop.manaCost).toBe(15);
  });

  it('三项已有特质能进入战斗快照，立绘与图鉴同源', () => {
    const troop = getTroopById(BAILU_YIXI_ID)!;
    const codes = ['waterlink', 'stealthy', 'arcane'];
    expect(troop.traits.map((trait) => trait.code)).toEqual(codes);
    for (const code of codes) expect(getTrait(code)).toBeDefined();

    const save = newSave({ now: 0, starterTroopIds: [] });
    grantTroop(save, BAILU_YIXI_ID);
    const record = getRecord(save, BAILU_YIXI_ID)!;
    expect(troopToSnapshot(troop, record, 'bailu').traitIds).toEqual([]);
    record.traits = [true, true, true];
    const snapshot = troopToSnapshot(troop, record, 'bailu');
    expect(snapshot.traitIds).toEqual(codes);
    expect(snapshot.skillId).toBe(String(BAILU_YIXI_SPELL_ID));
    expect(snapshot.portraitUrl).toBe(troopArt(troop));
  });

  it('离岸封函只伤害并织网指定敌人，为当前最低生命盟友加屏障', () => {
    const troop = getTroopById(BAILU_YIXI_ID)!;
    const allies: Team = {
      player: PlayerSide.Left,
      characters: [
        character(0, { magic: 9, hp: 40 }),
        character(1, { hp: 13 }),
        character(2, { hp: 30 }),
      ],
    };
    const enemies: Team = {
      player: PlayerSide.Right,
      characters: [character(4), character(5), character(6)],
    };
    const state = createGameState(new BoardModel(), allies, enemies);
    const prototype = SKILL_LIBRARY[BAILU_YIXI_SPELL_ID];
    expect(prototype).toBeDefined();
    expect(troop.spell.meta.scalings).toEqual([{ base: 7, mult: 1 }]);
    executePrototype(prototype, {
      state,
      casterId: 0,
      chosenTargetId: 5,
      rng: new SeededRNG(10001),
      nextGemId: () => 1,
    });

    expect(state.teams[PlayerSide.Right].characters.map((enemy) => enemy.hp)).toEqual([45, 29, 45]);
    expect(state.teams[PlayerSide.Right].characters[1]!.statuses).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: 'web' })]),
    );
    expect(state.teams[PlayerSide.Right].characters[0]!.statuses).toEqual([]);
    expect(state.teams[PlayerSide.Right].characters[2]!.statuses).toEqual([]);
    expect(state.teams[PlayerSide.Left].characters[1]!.statuses).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: 'barrier' })]),
    );
    expect(state.teams[PlayerSide.Left].characters[0]!.statuses).toEqual([]);
    expect(state.teams[PlayerSide.Left].characters[2]!.statuses).toEqual([]);
  });
});


describe('Douglas · 时空裂隙', () => {
  it('史诗三色法师进入异界来客图鉴、王国与宝箱池，并复用立绘', () => {
    const troop = getTroopById(DOUGLAS_ID)!;
    expect(getTroopByRef('Douglas')).toBe(troop);
    expect(TROOPS.filter((entry) => entry.id === DOUGLAS_ID)).toHaveLength(1);
    expect(TROOPS.filter((entry) => entry.spell.id === DOUGLAS_SPELL_ID)).toHaveLength(1);
    expect(troop.kingdom).toBe(COMMUNITY_KINGDOM);
    expect(kingdomTroopPool(COMMUNITY_KINGDOM)).toContain(troop);
    expect(allKingdoms()).not.toContain(COMMUNITY_KINGDOM);
    expect(troop.troopTypes).toEqual([COMMUNITY_RACE]);
    expect(troop.rarity).toBe('Epic');
    expect(troop.rarityIdx).toBe(4);
    expect(rarityNameByIndex(troop.rarityIdx)).toBe('史诗');
    expect(troop.role).toBe('Mage');
    expect(troop.manaColors).toEqual([BaseColor.Green, BaseColor.Blue, BaseColor.Purple]);
    expect(troop.manaCost).toBe(19);
    expect(troop.spell.name).toBe('拿铁涟漪');
    expect(troop.artUrl).toContain('douglas.webp');
    expect(troopArt(troop)).toBe(troop.artUrl);
  });

  it('已有特质、立绘与技能均进入战斗快照', () => {
    const troop = getTroopById(DOUGLAS_ID)!;
    const codes = ['naturelink', 'insulated', 'agile'];
    expect(troop.traits.map((trait) => trait.code)).toEqual(codes);
    for (const code of codes) expect(getTrait(code)).toBeDefined();

    const save = newSave({ now: 0, starterTroopIds: [] });
    grantTroop(save, DOUGLAS_ID);
    const record = getRecord(save, DOUGLAS_ID)!;
    record.traits = [true, true, true];
    const snapshot = troopToSnapshot(troop, record, 'douglas');
    expect(snapshot.traitIds).toEqual(codes);
    expect(snapshot.skillId).toBe(String(DOUGLAS_SPELL_ID));
    expect(snapshot.portraitUrl).toBe(troopArt(troop));
    expect(snapshot.manaColors).toEqual(troop.manaColors);
    expect(snapshot.manaCost).toBe(19);
  });

  it('拿铁涟漪先对所有敌人造成魔法+3伤害，再随机爆破3颗宝石', () => {
    const troop = getTroopById(DOUGLAS_ID)!;
    const board = new BoardModel();
    let id = 1;
    for (let row = 0; row < BoardModel.ROWS; row++) {
      for (let col = 0; col < BoardModel.COLS; col++) {
        board.set({ row, col }, { id: id++, type: colorGem(BaseColor.Green) });
      }
    }
    const state = createGameState(board,
      { player: PlayerSide.Left, characters: [character(0, { magic: 10 })] },
      { player: PlayerSide.Right, characters: [character(1), character(2), character(3)] },
    );
    const prototype = SKILL_LIBRARY[DOUGLAS_SPELL_ID];
    expect(prototype).toBeDefined();
    expect(troop.spell.meta.scalings).toEqual([{ base: 3, mult: 1 }]);
    expect(prototype.segments[1]).toMatchObject({
      kind: 'gem', params: {
        op: 'clear', mode: 'explode',
        target: { kind: 'randomGems', count: { base: 3, mult: 0 }, include: 'all' },
      },
    });
    const events = executePrototype(prototype, {
      state, casterId: 0, rng: new SeededRNG(10002), nextGemId: () => id++,
    });
    expect(state.teams[PlayerSide.Right].characters.map((enemy) => enemy.hp)).toEqual([32, 32, 32]);
    expect(events.slice(0, 3).map((event) => event.type)).toEqual(['skill-damage', 'skill-damage', 'skill-damage']);
    const explosions = events.filter((event) => event.type === 'gem-explode');
    expect(explosions).toHaveLength(1);
    expect(explosions[0]!.cells.length).toBeGreaterThanOrEqual(9);
    expect(explosions[0]!.cells.length).toBeLessThanOrEqual(27);
    for (const { pos } of explosions[0]!.cells) expect(board.get(pos)).toBeNull();
  });
});


describe('ciallo - community troop', () => {
  it('registers an epic Blue/Yellow Warmaster in the otherworld visitor collection and kingdom pool', () => {
    const troop = getTroopById(CIALLO_ID)!;
    expect(getTroopByRef('ciallo')).toBe(troop);
    expect(TROOPS.filter((entry) => entry.id === CIALLO_ID)).toHaveLength(1);
    expect(TROOPS.filter((entry) => entry.spell.id === CIALLO_SPELL_ID)).toHaveLength(1);
    expect(troop.kingdom).toBe(COMMUNITY_KINGDOM);
    expect(kingdomTroopPool(COMMUNITY_KINGDOM)).toContain(troop);
    expect(allKingdoms()).not.toContain(COMMUNITY_KINGDOM);
    expect(troop.troopTypes).toEqual([COMMUNITY_RACE]);
    expect(troop.rarity).toBe('Epic');
    expect(troop.rarityIdx).toBe(4);
    expect(troop.role).toBe('Warmaster');
    expect(troop.manaColors).toEqual([BaseColor.Blue, BaseColor.Yellow]);
    expect(troop.manaCost).toBe(15);
    expect(troop.spell.name).toBe('双龙助阵');
    expect(troop.artUrl).toContain('ciallo.webp');
    expect(troopArt(troop)).toBe(troop.artUrl);
  });

  it('exposes Dragon Bond, Tough Scales and Song of Light in the combat snapshot', () => {
    const troop = getTroopById(CIALLO_ID)!;
    const codes = ['dragonbond', 'toughscales', 'songoflight'];
    expect(troop.traits.map((trait) => trait.code)).toEqual(codes);
    for (const code of codes) expect(getTrait(code)).toBeDefined();
    expect(getTrait('dragonbond')?.typeAura).toMatchObject({ troopType: 'Dragon', stat: 'hp', amount: 2 });
    expect(getTrait('toughscales')?.skullDamageReduction).toBe(0.3);
    expect(getTrait('songoflight')?.battleStartStorm).toMatchObject({ color: BaseColor.Yellow });

    const save = newSave({ now: 0, starterTroopIds: [] });
    grantTroop(save, CIALLO_ID);
    const record = getRecord(save, CIALLO_ID)!;
    record.traits = [true, true, true];
    const snapshot = troopToSnapshot(troop, record, 'ciallo');
    expect(snapshot.traitIds).toEqual(codes);
    expect(snapshot.skillId).toBe(String(CIALLO_SPELL_ID));
    expect(snapshot.portraitUrl).toBe(troopArt(troop));
    expect(snapshot.manaColors).toEqual(troop.manaColors);
    expect(snapshot.manaCost).toBe(15);
  });

  it('buffs the front ally by magic + 2, creates six skulls, then webs the front enemy', () => {
    const troop = getTroopById(CIALLO_ID)!;
    const board = new BoardModel();
    let id = 1;
    for (let row = 0; row < BoardModel.ROWS; row++) {
      for (let col = 0; col < BoardModel.COLS; col++) {
        board.set({ row, col }, { id: id++, type: colorGem(BaseColor.Blue) });
      }
    }
    const front = character(0, { attack: 5 });
    const caster = character(1, { magic: 10, attack: 7 });
    const enemyFront = character(2);
    const enemyRear = character(3);
    const state = createGameState(board,
      { player: PlayerSide.Left, characters: [front, caster] },
      { player: PlayerSide.Right, characters: [enemyFront, enemyRear] },
    );
    const prototype = SKILL_LIBRARY[CIALLO_SPELL_ID];
    expect(prototype).toBeDefined();
    expect(troop.spell.meta.scalings).toEqual([{ base: 2, mult: 1 }]);
    expect(prototype.segments).toMatchObject([
      { kind: 'buff', target: 'allyFront', stat: 'attack', scaling: { base: 2, mult: 1 } },
      { kind: 'gem', params: { op: 'create', gem: { kind: 'skull' }, count: { base: 6, mult: 0 } } },
      { kind: 'status', target: 'enemyFront', statusId: 'web' },
    ]);
    const events = executePrototype(prototype, {
      state, casterId: 1, rng: new SeededRNG(10003), nextGemId: () => id++,
    });
    expect(front.attack).toBe(17);
    expect(caster.attack).toBe(7);
    let skulls = 0;
    for (let row = 0; row < BoardModel.ROWS; row++) {
      for (let col = 0; col < BoardModel.COLS; col++) {
        if (board.get({ row, col })?.type.kind === 'skull') skulls++;
      }
    }
    expect(skulls).toBe(6);
    expect(enemyFront.statuses).toEqual(expect.arrayContaining([expect.objectContaining({ id: 'web' })]));
    expect(enemyRear.statuses).toEqual([]);
    expect(events.some((event) => event.type === 'gem-transform')).toBe(true);
  });
});

describe('四脚萝卜怪 · 逆焰先锋', () => {
  it('进入神话图鉴、时空裂隙获取池，三色与立绘可进入战斗快照', () => {
    const troop = getTroopById(CHIKORITA_ID)!;
    expect(getTroopByRef('Chikorita')).toBe(troop);
    expect(troop.name).toBe('四脚萝卜怪');
    expect(TROOPS.filter((entry) => entry.id === CHIKORITA_ID)).toHaveLength(1);
    expect(TROOPS.filter((entry) => entry.spell.id === CHIKORITA_SPELL_ID)).toHaveLength(1);
    expect(troop.kingdom).toBe(COMMUNITY_KINGDOM);
    expect(troop.troopTypes).toEqual([COMMUNITY_RACE]);
    expect(kingdomTroopPool(COMMUNITY_KINGDOM)).toContain(troop);
    expect(allKingdoms()).not.toContain(COMMUNITY_KINGDOM);
    expect(troop.rarity).toBe('Legendary');
    expect(troop.rarityIdx).toBe(5);
    expect(rarityNameByIndex(5)).toBe('神话');
    expect(troop.role).toBe('Warmaster');
    expect(troop.manaColors).toEqual([BaseColor.Green, BaseColor.Blue, BaseColor.Red]);
    expect(troop.manaCost).toBe(21);
    expect(troopArt(troop)).toBe(troop.artUrl);
    expect(troop.artUrl).toContain('chikorita.webp');

    const save = newSave({ now: 0, starterTroopIds: [] });
    grantTroop(save, CHIKORITA_ID);
    const record = getRecord(save, CHIKORITA_ID)!;
    expect(troopToSnapshot(troop, record, 'chikorita').traitIds).toEqual([]);
    record.traits = [true, true, true];
    const snapshot = troopToSnapshot(troop, record, 'chikorita');
    expect(snapshot.skillId).toBe(String(CHIKORITA_SPELL_ID));
    expect(snapshot.portraitUrl).toBe(troop.artUrl);
    expect(snapshot.manaColors).toEqual(troop.manaColors);
    expect(snapshot.manaCost).toBe(21);
    expect(snapshot.traitIds).toEqual(['firelink', 'armored', 'counterflame']);
    expect(metaKnownTraitIds()).toContain('counterflame');
  });

  it('逆焰之力只在红色配对时自身+2攻击、+1护甲；另有灵链与25%骷髅减伤', () => {
    const traits = resolvePassives(['firelink', 'armored', 'counterflame']);
    expect(getTrait('counterflame')?.name).toBe('逆焰之力');
    expect(traits.gainOnColorMatch.Red).toMatchObject({ attack: 2, armor: 1, hp: 0 });
    expect(traits.gainOnColorMatch.Green).toBeUndefined();
    expect(traits.manaLink.Red).toBe(1);
    expect(traits.skullDamageTaken).toBe(0.75);
  });

  it('青草场地实际增加首位盟友魔法+3攻击并创造20颗混合绿色宝石与骷髅头', () => {
    const troop = getTroopById(CHIKORITA_ID)!;
    const board = new BoardModel();
    let nextId = 1;
    for (let row = 0; row < BoardModel.ROWS; row++) {
      for (let col = 0; col < BoardModel.COLS; col++) {
        board.set({ row, col }, { id: nextId++, type: colorGem(BaseColor.Blue) });
      }
    }
    const front = character(0, { attack: 7 });
    const caster = character(1, { magic: 9, attack: 11 });
    const state = createGameState(board,
      { player: PlayerSide.Left, characters: [front, caster] },
      { player: PlayerSide.Right, characters: [character(2)] },
    );
    const prototype = SKILL_LIBRARY[CHIKORITA_SPELL_ID];
    expect(prototype).toBeDefined();
    expect(troop.spell.meta.scalings).toEqual([{ base: 3, mult: 1 }]);
    expect(prototype.segments).toMatchObject([
      { kind: 'buff', target: 'allyFront', stat: 'attack', scaling: { base: 3, mult: 1 } },
      { kind: 'gem', params: { op: 'create', gem: { kind: 'mixAny', entries: [BaseColor.Green, 'SKULL'] }, count: { base: 20, mult: 0 } } },
    ]);
    const events = executePrototype(prototype, {
      state, casterId: 1, rng: new SeededRNG(10004), nextGemId: () => nextId++,
    });
    expect(front.attack).toBe(19);
    expect(caster.attack).toBe(11);
    expect(events.some((event) => event.type === 'gem-transform')).toBe(true);
    let changed = 0;
    for (let row = 0; row < BoardModel.ROWS; row++) {
      for (let col = 0; col < BoardModel.COLS; col++) {
        const gem = board.get({ row, col })?.type;
        if (gem?.kind === 'skull' || gem?.kind === 'color' && gem.color === BaseColor.Green) changed++;
      }
    }
    expect(changed).toBe(20);
  });
});
