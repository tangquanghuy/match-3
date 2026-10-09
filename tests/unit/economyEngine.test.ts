/**
 * 战场经济三币种单测（DECISIONS 四项拍板①，窗口 E）。
 *
 * 覆盖：金币/灵魂/宝石计数器、gainEconomy 效果段（数值缩放 + 二次缩放）、economy-gain 事件、
 * battleGold/battleSouls/battleGems 二次缩放来源、赃物宝石摧毁 +10 金币（技能清除与末日骷髅
 * 爆炸圈两路）、赃物不可匹配、merchant/necromancy live economy bonuses、
 * 以及「无经济内容对局事件流零经济事件」护栏。
 */
import { describe, it, expect } from 'vitest';
import { BoardModel } from '@engine/BoardModel';
import { TurnEngine } from '@engine/TurnEngine';
import { MatchResolver } from '@engine/MatchResolver';
import { createGameState } from '@engine/GameState';
import { BATTLE_GOLD_BASE_CAP, battleGoldCap, creditGoldForSide, goldForSide, setGoldForSide } from '@engine/battleGold';
import { BATTLE_SOUL_BASE_CAP, battleSoulCap } from '@engine/battleSouls';
import { registerDynamicTraits } from '@engine/traits';
import { PVP_DYNAMIC_DEFS } from '../../src/meta/data/talentDefs';
import { ExtensionRegistry } from '@engine/registry';
import { SeededRNG } from '@engine/rng';
import { executePrototype } from '@engine/skills/prototypes';
import { SKILL_LIBRARY } from '@engine/skills/library';
import type { SkillPrototype } from '@engine/skills/prototypes';
import { gainGold, gainSouls, gainGems, dmg, stealGold } from '@engine/skills/builders';
import { getTroopById } from '../../src/data/troops';
import type { EffectContext } from '@engine/skills/effects/context';
import { BaseColor, PlayerSide, colorGem, specialGem } from '@engine/types';
import type { Character, Team, Gem, GemType } from '@engine/types';
import { damageFixture } from '../helpers/damageFixture';

let gid = 0;
function g(type: GemType): Gem {
  return { id: gid++, type };
}

function makeChar(id: number, over: Partial<Character> = {}): Character {
  return {
    id, name: `C${id}`, maxHp: 50, hp: 50, attack: 5, armor: 0, magic: 0,
    colors: [BaseColor.Red], manaCost: 20, mana: 0,
    skillId: 'none', statuses: [], defeated: false, ...over,
  };
}

function fillBoard(board: BoardModel, f: (r: number, c: number) => GemType): void {
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) board.set({ row: r, col: c }, g(f(r, c)));
  }
}

/** 原语路径 ctx（不经 TurnEngine；经济读写 state.economy 即可验证） */
function primitiveCtx(over: { magic?: number; seed?: number } = {}): { ctx: EffectContext; state: ReturnType<typeof createGameState> } {
  const board = new BoardModel();
  fillBoard(board, () => colorGem(BaseColor.Red));
  const left: Team = { player: PlayerSide.Left, characters: [makeChar(0, { magic: over.magic ?? 6 })] };
  const right: Team = { player: PlayerSide.Right, characters: [makeChar(4), makeChar(5)] };
  const state = createGameState(board, left, right);
  const ctx: EffectContext = {
    state,
    casterId: 0,
    rng: new SeededRNG(over.seed ?? 7),
    nextGemId: () => 900000 + gid++,
  };
  return { ctx, state };
}

describe('gainEconomy 效果段（金币/灵魂/宝石）', () => {
  it('小矮妖按施法前局内金币决定爆破数量，再获得 20 金币', () => {
    const cast = (battleGold: number) => {
      const f = damageFixture();
      f.caster.magic = 0;
      f.state.economy.gold = battleGold;
      for (const [row, col] of [[1, 1], [4, 4], [6, 6]]) {
        f.board.set({ row, col }, { id: 100 + row * 8 + col, type: colorGem(BaseColor.Green) });
      }
      const events = executePrototype(SKILL_LIBRARY[7967], f.ctx);
      return {
        exploded: events.filter(e => e.type === 'gem-explode').flatMap(e => e.cells).length,
        gold: f.state.economy.gold,
      };
    };
    expect(cast(0)).toEqual({ exploded: 9, gold: 20 });
    expect(cast(20)).toEqual({ exploded: 26, gold: 40 });
  });
  it('gainGold(10)：计数器 +10，发 economy-gain{gold,10,side:Left}', () => {
    const { ctx, state } = primitiveCtx();
    const events = executePrototype({ segments: [gainGold(10)] } as SkillPrototype, ctx);
    expect(state.economy.gold).toBe(10);
    expect(events).toEqual([{ type: 'economy-gain', currency: 'gold', amount: 10, side: PlayerSide.Left }]);
  });

  it('三币种各自独立计数', () => {
    const { ctx, state } = primitiveCtx();
    executePrototype({ segments: [gainGold(3), gainSouls(5), gainGems(2)] } as SkillPrototype, ctx);
    expect(state.economy).toEqual({ gold: 3, souls: 5, gems: 2, maps: 0 }); // 2026-09-17 回收批：经济池新增第四币种藏宝图
  });

  it('数值经魔法缩放：gainSouls(2,1) 且 magic=6 → +8', () => {
    const { ctx, state } = primitiveCtx({ magic: 6 });
    executePrototype({ segments: [gainSouls(2, 1)] } as SkillPrototype, ctx);
    expect(state.economy.souls).toBe(8);
  });

  it('数值为 0 的段零事件零入账', () => {
    const { ctx, state } = primitiveCtx();
    const events = executePrototype({ segments: [gainGold(0)] } as SkillPrototype, ctx);
    expect(events).toEqual([]);
    expect(state.economy.gold).toBe(0);
  });

  it('二次缩放 battleGold：「获得 [1:10] 颗宝石」按金币总数折算（35 金币 → 1+3=4）', () => {
    const { ctx, state } = primitiveCtx();
    state.economy.gold = 35;
    executePrototype({
      segments: [gainGems(1, 0, { modifier: { mod: { kind: 'ratio', a: 10, b: 1 }, source: { kind: 'battleGold' } } })],
    } as SkillPrototype, ctx);
    expect(state.economy.gems).toBe(4);
  });

  it('伤害段的 battleGold 来源：「对随机敌人造成 1 点伤害，伤害由我的金币加成 [10:1]」（batch-39 · 9783 句式）', () => {
    const { ctx } = primitiveCtx();
    ctx.state.economy.gold = 42;
    const events = executePrototype({
      segments: [dmg('enemyRandom', 1, 0, { modifier: { mod: { kind: 'ratio', a: 10, b: 1 }, source: { kind: 'battleGold' } } })],
    } as SkillPrototype, ctx);
    const hit = events.find((e) => e.type === 'skill-damage') as { damage: number } | undefined;
    expect(hit).toBeDefined();
    expect(hit!.damage).toBe(1 + Math.floor(42 / 10));
  });

  it('battleSouls/battleGems 来源读各自的池（multiplier a=1 → 加成=来源计数）', () => {
    const { ctx, state } = primitiveCtx();
    state.economy.souls = 9;
    state.economy.gems = 4;
    executePrototype({
      segments: [
        gainGold(0, 0, { modifier: { mod: { kind: 'multiplier', a: 1 }, source: { kind: 'battleSouls' } } }),
        gainGold(0, 0, { modifier: { mod: { kind: 'multiplier', a: 1 }, source: { kind: 'battleGems' } } }),
      ],
    } as SkillPrototype, ctx);
    expect(state.economy.gold).toBe(13);
  });
});

// ───────────────────────── TurnEngine 路径：赃物宝石 ─────────────────────────

/** 稳定棋盘：周期染色无预成三连；可用 setGems 覆写特定格（g 为本局局部 id 分配器，保证跨局确定） */
function makeEngineHarness(options: {
  seed?: number;
  left?: Partial<Character>[];
  right?: Partial<Character>[];
  prototypes?: Record<string, SkillPrototype>;
  setGems?: (board: BoardModel, g: (type: GemType) => Gem) => void;
} = {}) {
  let localId = 50000;
  const g = (type: GemType): Gem => ({ id: localId++, type });
  const board = new BoardModel();
  const palette = [BaseColor.Blue, BaseColor.Green, BaseColor.Yellow, BaseColor.Purple];
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) board.set({ row: r, col: c }, g(colorGem(palette[(r + c) % palette.length])));
  }
  options.setGems?.(board, g);
  const left: Team = { player: PlayerSide.Left, characters: (options.left ?? [{}]).map((o, i) => makeChar(i, { mana: 99, magic: 3, ...o })) };
  const right: Team = { player: PlayerSide.Right, characters: (options.right ?? [{}, {}, {}]).map((o, i) => makeChar(i + 4, { mana: 0, ...o })) };
  const state = createGameState(board, left, right);
  const registry = new ExtensionRegistry();
  for (const [id, proto] of Object.entries(options.prototypes ?? {})) registry.prototypes.set(id, proto);
  const engine = new TurnEngine(state, new SeededRNG(options.seed ?? 11), () => 800000 + localId++, registry);
  engine.skullChance = 0;
  return { engine, state };
}

function skull(): GemType {
  return { kind: 'skull', variant: 'normal' };
}

describe('赃物宝石（Booty Gem）：摧毁 → +10 金币', () => {
  it('技能清除赃物宝石：economy-gain{gold,10} + special-gem-trigger，池 +10', () => {
    const { engine, state } = makeEngineHarness({
      left: [{ skillId: 'nuke' }],
      prototypes: { nuke: { segments: [{ kind: 'gem', params: { op: 'clear', mode: 'destroy', target: { kind: 'special', gem: 'bootyGem' } } }] } },
      setGems: (board, g) => board.set({ row: 3, col: 3 }, g(specialGem('bootyGem'))),
    });
    expect(state.economy.gold).toBe(0);
    const events = engine.resolveAction({ type: 'cast', characterId: 0 });
    expect(state.economy.gold).toBe(10);
    expect(events.some((e) => e.type === 'special-gem-trigger' && e.kind === 'bootyGem')).toBe(true);
    expect(events.filter((e) => e.type === 'economy-gain'))
      .toEqual([{ type: 'economy-gain', currency: 'gold', amount: 10, side: PlayerSide.Left }]);
  });

  it('至尊末日骷髅匹配爆炸圈波及赃物宝石：同样 +10 金币', () => {
    const { engine, state } = makeEngineHarness({
      setGems: (board, g) => {
        // 至尊末日骷髅 (4,4) + 普通骷髅 (4,3) + 普通骷髅 (5,5)：交换 (4,5)/(5,5) 后
        // 行4 成 [骷髅,至尊末日骷髅,骷髅] → 至尊末日骷髅被匹配引爆一圈，赃物 (3,4) 在环上
        board.set({ row: 4, col: 3 }, g(skull()));
        board.set({ row: 4, col: 4 }, g(specialGem('uberDoomSkull')));
        board.set({ row: 3, col: 4 }, g(specialGem('bootyGem')));
        board.set({ row: 5, col: 5 }, g(skull()));
      },
    });
    const before = state.economy.gold;
    const events = engine.resolveAction({ type: 'swap', from: { row: 4, col: 5 }, to: { row: 5, col: 5 } });
    const matchGold = events.flatMap(e => e.type === 'elimination' && e.cells.length >= 4
      ? [e.cells.length >= 5 ? 5 : 4] : []).reduce((sum, gain) => sum + gain, 0);
    expect(state.economy.gold).toBe(before + 10 + matchGold);
  });

  it('赃物宝石不可匹配：不与任何宝石成组（MatchResolver 不可匹配集合）', () => {
    const board = new BoardModel();
    fillBoard(board, () => colorGem(BaseColor.Red));
    board.set({ row: 3, col: 3 }, g(specialGem('bootyGem')));
    const groups = new MatchResolver().findMatches(board);
    for (const group of groups) {
      for (const cell of group.cells) {
        expect(cell).not.toEqual({ row: 3, col: 3 });
      }
    }
  });

});

describe('织网双路径（官方 matched or destroyed，DECISIONS 四项拍板②）', () => {
  it('被技能摧毁 → 随机敌人获得 web 状态（摧毁路径，此前缺失）', () => {
    const { engine, state } = makeEngineHarness({
      seed: 5,
      left: [{ skillId: 'nuke' }],
      prototypes: { nuke: { segments: [{ kind: 'gem', params: { op: 'clear', mode: 'destroy', target: { kind: 'special', gem: 'web' } } }] } },
      setGems: (board, g) => board.set({ row: 2, col: 2 }, g(specialGem('web'))),
    });
    const events = engine.resolveAction({ type: 'cast', characterId: 0 });
    const webbed = events.filter((e) => e.type === 'status-apply' && e.statusId === 'web');
    expect(webbed).toHaveLength(1);
    expect(state.teams[PlayerSide.Right].characters.some((c) => c.statuses.some((s) => s.id === 'web'))).toBe(true);
  });

  it('被匹配 → 同样触发且只触发一次（匹配路径不入摧毁队列，管线天然去重）', () => {
    const { engine, state } = makeEngineHarness({
      seed: 5,
      setGems: (board, g) => {
        // (4,3)紫 + (4,4)织网 + 普通骷髅(5,5)：交换 (4,5)/(5,5) 后行4成 [紫,织网,紫] 三连
        board.set({ row: 4, col: 3 }, g(colorGem(BaseColor.Purple)));
        board.set({ row: 4, col: 4 }, g(specialGem('web')));
        board.set({ row: 5, col: 5 }, g(colorGem(BaseColor.Purple)));
      },
    });
    const events = engine.resolveAction({ type: 'swap', from: { row: 4, col: 5 }, to: { row: 5, col: 5 } });
    const rightIds = state.teams[PlayerSide.Right].characters.map((c) => c.id);
    const webbed = events.filter((e) => e.type === 'status-apply' && e.statusId === 'web') as { targetId: number }[];
    // 恰好一次，且目标在敌方编队（回合尾 10% 挣脱可能随即移除状态，故断言事件而非终态）
    expect(webbed).toHaveLength(1);
    expect(rightIds).toContain(webbed[0].targetId);
  });
});

describe('merchant/necromancy live battle economy bonuses', () => {
  it('merchant boosts Gold on cast, without multiplying the victory balance twice', () => {
    const board = new BoardModel();
    fillBoard(board, () => colorGem(BaseColor.Red));
    const left: Team = {
      player: PlayerSide.Left,
      characters: [
        makeChar(0, { traitIds: ['merchant'], mana: 99, skillId: 'gold10' }),
        makeChar(1, { traitIds: ['necromancy'], mana: 99, skillId: 'nuke' }),
      ],
    };
    const right: Team = { player: PlayerSide.Right, characters: [makeChar(4, { hp: 1 })] };
    const state = createGameState(board, left, right);
    const registry = new ExtensionRegistry();
    registry.prototypes.set('gold10', { segments: [gainGold(10)] });
    registry.prototypes.set('nuke', { segments: [dmg('enemyFront', 50, 0)] });
    const engine = new TurnEngine(state, new SeededRNG(3), () => 810000 + gid++, registry);
    engine.skullChance = 0;

    const first = engine.resolveAction({ type: 'cast', characterId: 0 });
    expect(state.economy.gold).toBe(12);
    expect(first).toContainEqual({ type: 'economy-gain', currency: 'gold', amount: 12, side: PlayerSide.Left });
    // Victory does not multiply the already-enhanced live balance.
    // First cast hands off; opponent passes before the second allied cast.
    expect(state.activePlayer).toBe(PlayerSide.Right);
    engine.passTurn();
    engine.resolveAction({ type: 'cast', characterId: 1 });
    expect(state.winner).toBe(PlayerSide.Left);
    expect(state.economy.gold).toBe(12);
    expect(state.economy.souls).toBe(0); // 灵魂零入账时乘法不产生灵魂
  });

  it('敌方（Right）的比率不放大共用池（GoW 奖励归玩家）', () => {
    const board = new BoardModel();
    fillBoard(board, () => colorGem(BaseColor.Red));
    const left: Team = {
      player: PlayerSide.Left,
      characters: [
        makeChar(0, { mana: 99, skillId: 'gold10' }),
        makeChar(1, { mana: 99, skillId: 'nuke' }),
      ],
    };
    const right: Team = { player: PlayerSide.Right, characters: [makeChar(4, { traitIds: ['merchant'], hp: 1 })] };
    const state = createGameState(board, left, right);
    const registry = new ExtensionRegistry();
    registry.prototypes.set('gold10', { segments: [gainGold(10)] });
    registry.prototypes.set('nuke', { segments: [dmg('enemyFront', 50, 0)] });
    const engine = new TurnEngine(state, new SeededRNG(3), () => 820000 + gid++, registry);
    engine.skullChance = 0;
    engine.resolveAction({ type: 'cast', characterId: 0 });
    // First cast hands off; opponent passes before the second allied cast.
    expect(state.activePlayer).toBe(PlayerSide.Right);
    engine.passTurn();
    engine.resolveAction({ type: 'cast', characterId: 1 });
    expect(state.winner).toBe(PlayerSide.Left);
    expect(state.economy.gold).toBe(10);
  });
});

describe('护栏：无经济内容的对局零经济事件', () => {
  const layout = (board: BoardModel, g: (type: GemType) => Gem): void => {
    board.set({ row: 7, col: 0 }, g(colorGem(BaseColor.Red)));
    board.set({ row: 7, col: 1 }, g(colorGem(BaseColor.Red)));
    board.set({ row: 6, col: 2 }, g(colorGem(BaseColor.Red)));
    board.set({ row: 7, col: 2 }, g(colorGem(BaseColor.Green)));
  };
  it('普通交换战斗的事件流不含 economy-gain / flee，且同 seed 逐字节一致', () => {
    const { engine, state } = makeEngineHarness({ setGems: layout });
    const events = engine.resolveAction({ type: 'swap', from: { row: 7, col: 1 }, to: { row: 7, col: 2 } });
    expect(events.some((e) => e.type === 'economy-gain' || e.type === 'flee')).toBe(false);
    expect(state.economy).toEqual({ gold: 0, souls: 0, gems: 0, maps: 0 });
    const { engine: engine2, state: state2 } = makeEngineHarness({ seed: 11, setGems: layout });
    const events2 = engine2.resolveAction({ type: 'swap', from: { row: 7, col: 1 }, to: { row: 7, col: 2 } });
    expect(JSON.stringify(events2)).toBe(JSON.stringify(events));
    void state2;
  });
});


describe('per-battle base collection caps', () => {
  it('clips gains and events at 500 gold / 200 souls without capping gems', () => {
    const { ctx, state } = primitiveCtx();
    const first = executePrototype({ segments: [gainGold(490), gainSouls(195), gainGems(3)] }, ctx);
    expect(first.filter(e => e.type === 'economy-gain').map(e => [e.currency, e.amount]))
      .toEqual([['gold', 490], ['souls', 195], ['gems', 3]]);
    const clipped = executePrototype({ segments: [gainGold(100), gainSouls(100), gainGems(4)] }, ctx);
    expect(clipped.filter(e => e.type === 'economy-gain').map(e => [e.currency, e.amount]))
      .toEqual([['gold', 10], ['souls', 5], ['gems', 4]]);
    expect(state.economy).toMatchObject({ gold: BATTLE_GOLD_BASE_CAP, souls: BATTLE_SOUL_BASE_CAP, gems: 7 });
    expect(executePrototype({ segments: [gainGold(20), gainSouls(20)] }, ctx)).toEqual([]);
  });

  it('spending gold frees capacity again; opposing balances are independent', () => {
    const { state } = primitiveCtx();
    expect(creditGoldForSide(state, PlayerSide.Left, 500)).toBe(500);
    setGoldForSide(state, PlayerSide.Left, 0);
    expect(creditGoldForSide(state, PlayerSide.Left, 450)).toBe(450);
    expect(creditGoldForSide(state, PlayerSide.Left, 100)).toBe(50);
    expect(state.economy.gold).toBe(500);
    expect(creditGoldForSide(state, PlayerSide.Right, 400)).toBe(400);
    expect(goldForSide(state, PlayerSide.Right)).toBe(400);
    expect(creditGoldForSide(state, PlayerSide.Right, 200)).toBe(100);
    expect(goldForSide(state, PlayerSide.Right)).toBe(500);
  });

  it('post-battle PvP grants bypass the cap and the battle multiplier, once', () => {
    registerDynamicTraits(PVP_DYNAMIC_DEFS);
    const board = new BoardModel();
    fillBoard(board, () => colorGem(BaseColor.Red));
    const left: Team = { player: PlayerSide.Left, characters: [
      makeChar(0, { traitIds: ['merchant', 'bloodandglory'], mana: 99, skillId: 'collect' }),
      makeChar(1, { mana: 99, skillId: 'nuke' }),
    ] };
    const right: Team = { player: PlayerSide.Right, characters: [makeChar(4, { hp: 1 })] };
    const state = createGameState(board, left, right);
    const registry = new ExtensionRegistry();
    registry.prototypes.set('collect', { segments: [gainGold(900)] });
    registry.prototypes.set('nuke', { segments: [dmg('enemyFront', 50, 0)] });
    const engine = new TurnEngine(state, new SeededRNG(3), () => 840000 + gid++, registry);
    engine.skullChance = 0;
    engine.pvpMode = true;
    engine.resolveAction({ type: 'cast', characterId: 0 });
    expect(state.economy.gold).toBe(625);
    engine.passTurn();
    engine.resolveAction({ type: 'cast', characterId: 1 });
    expect(state.winner).toBe(PlayerSide.Left);
    expect(state.economy.gold).toBe(626); // capped base 500 * 1.25, then independent +1
  });

  it('traits multiply the capped battle pool, not its uncapped raw gains', () => {
    const board = new BoardModel();
    fillBoard(board, () => colorGem(BaseColor.Red));
    const left: Team = { player: PlayerSide.Left, characters: [
      makeChar(0, { traitIds: ['merchant'], mana: 99, skillId: 'collect' }),
      makeChar(1, { traitIds: ['necromancy'], mana: 99, skillId: 'nuke' }),
    ] };
    const right: Team = { player: PlayerSide.Right, characters: [makeChar(4, { hp: 1 })] };
    const state = createGameState(board, left, right);
    const registry = new ExtensionRegistry();
    registry.prototypes.set('collect', { segments: [gainGold(2000), gainSouls(2000)] });
    registry.prototypes.set('nuke', { segments: [dmg('enemyFront', 50, 0)] });
    const engine = new TurnEngine(state, new SeededRNG(3), () => 830000 + gid++, registry);
    engine.skullChance = 0;
    const first = engine.resolveAction({ type: 'cast', characterId: 0 });
    expect(first.filter(e => e.type === 'economy-gain').map(e => [e.currency, e.amount]))
      .toEqual([['gold', 625], ['souls', 300]]);
    expect(state.economy).toMatchObject({ gold: 625, souls: 300 });
    engine.passTurn();
    engine.resolveAction({ type: 'cast', characterId: 1 });
    expect(state.winner).toBe(PlayerSide.Left);
    expect(state.economy).toMatchObject({ gold: 625, souls: 300 });
  });
});


describe('battle-start economy traits apply during battle', () => {
  it('Cedric moneybags doubles every credited Gold gain and the 500 cap, but only when unlocked', () => {
    const boosted = makeEngineHarness({ left: [{ traitIds: ['moneybags'], skillId: 'collect' }],
      prototypes: { collect: { segments: [gainGold(10), gainGold(500)] } } });
    expect(battleGoldCap(boosted.state, PlayerSide.Left)).toBe(1000);
    const events = boosted.engine.resolveAction({ type: 'cast', characterId: 0 });
    expect(events.filter(e => e.type === 'economy-gain').map(e => e.amount)).toEqual([20, 980]);
    expect(boosted.state.economy.gold).toBe(1000);
    setGoldForSide(boosted.state, PlayerSide.Left, 995);
    expect(creditGoldForSide(boosted.state, PlayerSide.Left, 10)).toBe(5);
    expect(boosted.state.economy.gold).toBe(1000);
    const locked = makeEngineHarness({ left: [{ skillId: 'collect' }],
      prototypes: { collect: { segments: [gainGold(10)] } } });
    expect(battleGoldCap(locked.state, PlayerSide.Left)).toBe(500);
    locked.engine.resolveAction({ type: 'cast', characterId: 0 });
    expect(locked.state.economy.gold).toBe(10);
  });

  it('soul bonus changes live gain and cap, with additive traits and no victory doubling', () => {
    const board = new BoardModel();
    fillBoard(board, () => colorGem(BaseColor.Red));
    const left: Team = { player: PlayerSide.Left, characters: [
      makeChar(0, { traitIds: ['necromancy', 'necromaster'], mana: 99, skillId: 'collect' }),
      makeChar(1, { mana: 99, skillId: 'nuke' }),
    ] };
    const right: Team = { player: PlayerSide.Right, characters: [makeChar(4, { hp: 1 })] };
    const state = createGameState(board, left, right);
    const registry = new ExtensionRegistry();
    registry.prototypes.set('collect', { segments: [gainSouls(10), gainSouls(1000)] });
    registry.prototypes.set('nuke', { segments: [dmg('enemyFront', 50, 0)] });
    const engine = new TurnEngine(state, new SeededRNG(3), () => 850000 + gid++, registry);
    engine.skullChance = 0;
    const mult = 1 + (state.battleSoulGainRatio ?? 0);
    expect(mult).toBe(3);
    expect(battleSoulCap(state)).toBe(Math.floor(200 * mult));
    const gains = engine.resolveAction({ type: 'cast', characterId: 0 }).filter(e => e.type === 'economy-gain');
    expect(gains.map(e => e.amount)).toEqual([Math.floor(10 * mult), battleSoulCap(state) - Math.floor(10 * mult)]);
    expect(state.economy.souls).toBe(battleSoulCap(state));
    engine.passTurn();
    engine.resolveAction({ type: 'cast', characterId: 1 });
    expect(state.winner).toBe(PlayerSide.Left);
    expect(state.economy.souls).toBe(battleSoulCap(state));
  });

  it('enemy Gold traits affect only enemy Gold, not player reward balance', () => {
    const { state } = makeEngineHarness({ right: [{ traitIds: ['moneybags'] }] });
    expect(battleGoldCap(state, PlayerSide.Right)).toBe(1000);
    expect(battleGoldCap(state, PlayerSide.Left)).toBe(500);
    expect(creditGoldForSide(state, PlayerSide.Right, 10)).toBe(20);
    expect(creditGoldForSide(state, PlayerSide.Left, 10)).toBe(10);
    state.teams[PlayerSide.Right].characters.splice(0);
    expect(creditGoldForSide(state, PlayerSide.Right, 5)).toBe(10);
    expect(state.economy.gold).toBe(10);
  });

  it('booty gems grant trait-enhanced Gold on the same turn', () => {
    const { engine, state } = makeEngineHarness({
      left: [{ traitIds: ['moneybags'], skillId: 'clear' }],
      prototypes: { clear: { segments: [{ kind: 'gem', params: { op: 'clear', mode: 'destroy', target: { kind: 'special', gem: 'bootyGem' } } }] } },
      setGems: (board, g) => board.set({ row: 3, col: 3 }, g(specialGem('bootyGem'))),
    });
    const events = engine.resolveAction({ type: 'cast', characterId: 0 });
    expect(events).toContainEqual({ type: 'economy-gain', currency: 'gold', amount: 20, side: PlayerSide.Left });
    expect(state.economy.gold).toBe(20);
  });
});


describe('trait-enhanced Gold theft and troop definition', () => {
  it('Cedric Sparklesack has moneybags in the third trait slot', () => {
    expect(getTroopById(6498)?.traits[2]?.code).toBe('moneybags');
  });

  it('Gold theft removes only the raw amount needed to fill boosted capacity', () => {
    const { ctx, state } = primitiveCtx();
    state.battleGoldGainRatios = { [PlayerSide.Left]: 1, [PlayerSide.Right]: 0 };
    state.economy.gold = 995;
    state.enemyGold = 100;
    const events = executePrototype({ segments: [stealGold(10)] }, ctx);
    expect(events).toContainEqual({ type: 'economy-gain', currency: 'gold', amount: 5, side: PlayerSide.Left });
    expect(state.economy.gold).toBe(1000);
    expect(state.enemyGold).toBe(97);
  });
});
