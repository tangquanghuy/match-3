import { describe, expect, it } from 'vitest';
import { BoardModel } from '@engine/BoardModel';
import { createGameState } from '@engine/GameState';
import { SeededRNG } from '@engine/rng';
import { TurnEngine } from '@engine/TurnEngine';
import { executePrototype } from '@engine/skills/prototypes';
import { SKILL_LIBRARY } from '@engine/skills/library';
import { applyBigMatchTriggers, applyColorMatchTriggers, attachPassives, getTrait, resolvePassives } from '@engine/traits';
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
  OLD_MEEPO_ID,
  OLD_MEEPO_SPELL_ID,
  SHIRAKYUSU_ANNA_SPELL_ID,
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
    expect(troop.manaCost).toBe(13);
  });

  it('三项已有特质能进入战斗快照，立绘与图鉴同源', () => {
    const troop = getTroopById(BAILU_YIXI_ID)!;
    const codes = ['waterlink', 'stealthy', 'bailu_tide_suppression'];
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

  it('四连或五连时降低所有存活敌人 2 点攻击力', () => {
    const holder = character(0, { traitIds: ['bailu_tide_suppression'], passive: resolvePassives(['bailu_tide_suppression']) });
    const enemies = [character(1, { attack: 5 }), character(2, { attack: 1 })];
    applyBigMatchTriggers([holder], { size: 3, enemyTeam: enemies });
    expect(enemies.map(enemy => enemy.attack)).toEqual([5, 1]);
    applyBigMatchTriggers([holder], { size: 4, enemyTeam: enemies });
    expect(enemies.map(enemy => enemy.attack)).toEqual([3, 0]);
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

describe('Anna · 时空裂隙', () => {
  it('技能对选定敌人同时施加击晕和冻结', () => {
    const state = createGameState(new BoardModel(),
      { player: PlayerSide.Left, characters: [character(0)] },
      { player: PlayerSide.Right, characters: [character(1), character(2)] },
    );
    executePrototype(SKILL_LIBRARY[SHIRAKYUSU_ANNA_SPELL_ID], {
      state, casterId: 0, chosenTargetId: 1, rng: new SeededRNG(10003), nextGemId: () => 1,
    });
    expect(state.teams[PlayerSide.Right].characters[0]!.statuses.map(status => status.id)).toEqual(expect.arrayContaining(['stun', 'frozen']));
    expect(state.teams[PlayerSide.Right].characters[1]!.statuses).toEqual([]);
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
    expect(troop.manaCost).toBe(16);
    expect(troop.spell.name).toBe('拿铁涟漪');
    expect(troop.artUrl).toContain('douglas.webp');
    expect(troopArt(troop)).toBe(troop.artUrl);
  });

  it('已有特质、立绘与技能均进入战斗快照', () => {
    const troop = getTroopById(DOUGLAS_ID)!;
    const codes = ['naturelink', 'insulated', 'douglas_blue_lightning'];
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
    expect(snapshot.manaCost).toBe(16);
    expect(getTrait('douglas_blue_lightning')?.turnStartCreateSpecialGem).toEqual({ gem: 'lightningRow', count: 1 });
  });

  it('只在己方回合开始创造一颗蓝色闪电宝石', () => {
    const board = new BoardModel();
    const colors = [BaseColor.Red, BaseColor.Green, BaseColor.Blue, BaseColor.Purple];
    for (let row = 0; row < BoardModel.ROWS; row++) for (let col = 0; col < BoardModel.COLS; col++) {
      board.set({ row, col }, { id: row * BoardModel.COLS + col + 1, type: colorGem(colors[(row + col) % colors.length]!) });
    }
    const state = createGameState(board,
      { player: PlayerSide.Left, characters: [character(0, { traitIds: ['douglas_blue_lightning'] })] },
      { player: PlayerSide.Right, characters: [character(1)] },
    );
    const engine = new TurnEngine(state, new SeededRNG(10002), () => 1000);
    const created = (events: ReturnType<typeof engine.passTurn>) => events.flatMap(event => event.type === 'gem-transform' ? event.changes : [])
      .filter(change => change.to.kind === 'special' && change.to.spec.kind === 'lightningRow');
    expect(created(engine.passTurn())).toHaveLength(0);
    expect(created(engine.passTurn())).toHaveLength(1);
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

  it('buffs the first ally by magic + 1 attack and armor, hits the first enemy for a first ally attack, then creates eight skulls', () => {
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
    expect(troop.spell.meta.scalings).toEqual([{ base: 1, mult: 1 }]);
    expect(prototype.segments).toMatchObject([
      { kind: 'buff', target: 'allyFront', stat: 'attack', scaling: { base: 1, mult: 1 } },
      { kind: 'buff', target: 'allyFront', stat: 'armor', scaling: { base: 1, mult: 1 } },
      { kind: 'damage', target: 'enemyFront', scaling: { base: 0, mult: 0 }, modifier: { source: { kind: 'allyFrontStat', stat: 'attack' } } },
      { kind: 'gem', params: { op: 'create', gem: { kind: 'skull' }, count: { base: 8, mult: 0 } } },
    ]);
    const events = executePrototype(prototype, {
      state, casterId: 1, rng: new SeededRNG(10003), nextGemId: () => id++,
    });
    expect(front.attack).toBe(16);
    expect(front.armor).toBe(11);
    expect(caster.attack).toBe(7);
    expect(enemyFront.hp).toBe(29);
    expect(enemyRear.hp).toBe(45);
    let skulls = 0;
    for (let row = 0; row < BoardModel.ROWS; row++) {
      for (let col = 0; col < BoardModel.COLS; col++) {
        if (board.get({ row, col })?.type.kind === 'skull') skulls++;
      }
    }
    expect(skulls).toBe(8);
    expect(enemyFront.statuses).toEqual([]);
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

  it('青草场地实际增加首位盟友魔法+3攻击并创造23颗混合绿色宝石与骷髅头', () => {
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
      { kind: 'gem', params: { op: 'create', gem: { kind: 'mixAny', entries: [BaseColor.Green, 'SKULL'] }, count: { base: 23, mult: 0 } } },
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
    expect(changed).toBe(23);
  });
});


describe('OldMeepo - community troop', () => {
  const troop = getTroopById(OLD_MEEPO_ID)!;
  const prototype = SKILL_LIBRARY[OLD_MEEPO_SPELL_ID];

  it('legendary brown/yellow troop is available with portrait and traits', () => {
    expect(getTroopByRef('OldMeepo')).toBe(troop);
    expect(kingdomTroopPool(COMMUNITY_KINGDOM)).toContain(troop);
    expect(troop.rarity).toBe('UltraRare');
    expect(rarityNameByIndex(troop.rarityIdx)).toBe('\u4f20\u8bf4');
    expect(troop.manaColors).toEqual([BaseColor.Brown, BaseColor.Yellow]);
    expect(troop.spell.meta.modifier).toEqual({ kind: 'ratio', a: 1, b: 1 });
    expect(troop.artUrl).toContain('old-meepo.webp');
    expect(troopArt(troop)).toBe(troop.artUrl);
    const codes = ['old_meepo_skull_life', 'goldenhoard', 'jinx'];
    expect(troop.traits.map(t => t.code)).toEqual(codes);
    const save = newSave({ now: 0, starterTroopIds: [] });
    grantTroop(save, OLD_MEEPO_ID);
    const record = getRecord(save, OLD_MEEPO_ID)!;
    record.traits = [true, true, true];
    expect(troopToSnapshot(troop, record, 'old-meepo').traitIds).toEqual(codes);
  });

  it('skull match grants life, turn grants gold, jinx halves enemy gem mana', () => {
    expect(getTrait('old_meepo_skull_life')?.onColorMatchGain).toEqual({ color: 'skull', stat: 'hp', amount: 2 });
    expect(getTrait('goldenhoard')?.turnStartEconomy).toEqual({ currency: 'gold', amount: 5 });
    expect(resolvePassives(['jinx']).enemyMasteryMult).toBe(0.5);
    const me = character(0, { traitIds: ['old_meepo_skull_life'], hp: 45 });
    attachPassives(me);
    expect(applyColorMatchTriggers([me], 'skull')).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'buff', targetId: 0, stat: 'hp', amount: 2 }),
    ]));
    expect(me.hp).toBe(47);
    applyColorMatchTriggers([me], BaseColor.Brown);
    expect(me.hp).toBe(47);
  });

  it('credits five gold at the start of its own turn, not the enemy turn', () => {
    const me = character(0, { traitIds: ['goldenhoard'] });
    const state = createGameState(new BoardModel(),
      { player: PlayerSide.Left, characters: [me] },
      { player: PlayerSide.Right, characters: [character(10)] });
    const engine = new TurnEngine(state, new SeededRNG(10002), () => 1000);
    engine.passTurn();
    expect(state.economy.gold).toBe(0);
    const events = engine.passTurn();
    expect(state.economy.gold).toBe(5);
    expect(events).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'economy-gain', currency: 'gold', amount: 5 }),
    ]));
  });

  function cast(gold: number, allies = 1, roll?: number) {
    const board = new BoardModel();
    const me = character(0, { name: 'OldMeepo', skillId: String(OLD_MEEPO_SPELL_ID),
      colors: [...troop.manaColors], traitIds: ['old_meepo_skull_life', 'goldenhoard', 'jinx'],
      statuses: [], hp: 25 });
    const state = createGameState(board,
      { player: PlayerSide.Left, characters: [me, ...Array.from({ length: allies - 1 }, (_, i) => character(i + 1))] },
      { player: PlayerSide.Right, characters: [character(10)] });
    state.economy.gold = gold;
    const events = executePrototype(prototype, { state, casterId: 0,
      rng: roll === undefined ? new SeededRNG(10002) : new (class extends SeededRNG { override next() { return roll; } })(1),
      nextGemId: () => 99 });
    return { state, me, events };
  }

  it('summons a copy and submerges; 0 gold gives no bonus and 100 gold guarantees one', () => {
    expect(prototype.segments.map(s => s.kind)).toEqual(['summonCopy', 'status', 'summonCopy']);
    const zero = cast(0);
    expect(zero.events.filter(e => e.type === 'summon')).toHaveLength(1);
    expect(zero.me.statuses.some(s => s.id === 'submerged')).toBe(true);
    const clone = zero.state.teams[PlayerSide.Left].characters[1]!;
    expect(clone.name).toBe('OldMeepo');
    expect(clone.hp).toBe(clone.maxHp);
    expect(clone.mana).toBe(0);
    expect(clone.statuses).toEqual([]);
    const rich = cast(100);
    expect(rich.events.filter(e => e.type === 'summon')).toHaveLength(2);
    expect(cast(200).events.filter(e => e.type === 'summon')).toHaveLength(2);
  });

  it('each gold adds exactly one percentage point to the extra-copy roll', () => {
    expect(cast(1, 1, 0.009).events.filter(e => e.type === 'summon')).toHaveLength(2);
    expect(cast(1, 1, 0.01).events.filter(e => e.type === 'summon')).toHaveLength(1);
    expect(cast(37, 1, 0.369).events.filter(e => e.type === 'summon')).toHaveLength(2);
    expect(cast(37, 1, 0.37).events.filter(e => e.type === 'summon')).toHaveLength(1);
  });

  it('full team blocks summons but still submerges the caster', () => {
    const full = cast(100, 4);
    expect(full.events.filter(e => e.type === 'summon')).toHaveLength(0);
    expect(full.state.teams[PlayerSide.Left].characters).toHaveLength(4);
    expect(full.me.statuses.some(s => s.id === 'submerged')).toBe(true);
    expect(full.state.economy.gold).toBe(100);
  });
});
