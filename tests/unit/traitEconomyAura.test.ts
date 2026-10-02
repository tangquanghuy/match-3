/**
 * 条件经济光环批测试（「在配对 4 或 5 颗宝石时，获得额外 N 黄金」「在配对骷髅头时，
 * 获得 N 个灵魂」族——greedy/extremegreed/pillageandplunder/darkensouls）。
 *
 * 覆盖：
 *   - 编译正确性：4 code → resolvePassives 产物断言（bigMatchEconomyGain 按 minSize 分桶 / skullMatchEconomyGain）。
 *   - 触发纯函数层：applyBigMatchTriggers 的 gainEconomy 回调、minSize 限定、多持有者累加、
 *     阵亡不贡献、无回调零事件；applyColorMatchTriggers 的骷髅键结算、配色键不触发。
 *   - TurnEngine 集成：真实对局入账战场经济池（GameState.economy）+ economy-gain 事件。
 *   - 护栏：条件经济路径零随机消耗——同种子对局有无新键特质 rng 终态一致，
 *     事件流差异恰为 economy-gain 事件。
 */
import { describe, it, expect } from 'vitest';
import {
  resolvePassives,
  neutralPassives,
  getTrait,
  attachPassives,
  applyBigMatchTriggers,
  applyColorMatchTriggers,
} from '@engine/traits';
import type { TraitDefinition } from '@engine/traits';
import { TurnEngine } from '@engine/TurnEngine';
import { BoardModel } from '@engine/BoardModel';
import { BoardGenerator } from '@engine/boardGen';
import { createGameState } from '@engine/GameState';
import { SeededRNG } from '@engine/rng';
import { ExtensionRegistry } from '@engine/registry';
import { chooseEnemySwap } from '@engine/ai';
import { PlayerSide, BaseColor } from '@engine/types';
import type { Character, Team, TraitEconomyGain } from '@engine/types';
import type { GameEvent } from '@engine/events';
import { colorGem, skullGem } from '@engine/types';

function makeChar(id: number, over: Partial<Character> = {}): Character {
  return {
    id,
    name: `C${id}`,
    maxHp: 50,
    hp: 50,
    attack: 5,
    armor: 0,
    magic: 8,
    colors: [BaseColor.Red],
    manaCost: 20,
    mana: 0,
    skillId: 'none',
    statuses: [],
    defeated: false,
    ...over,
  };
}

function makeTeam(side: PlayerSide, chars: Character[]): Team {
  return { player: side, characters: chars };
}

/** gainEconomy 回调的最小实现：记录调用并回 economy-gain 事件（与引擎注入口径一致） */
function recordEconomy(log: [string, number][] = []) {
  return (currency: keyof TraitEconomyGain, amount: number): GameEvent[] => {
    log.push([currency, amount]);
    return [{ type: 'economy-gain', currency, amount, side: PlayerSide.Left }];
  };
}

// ============================================================
// 编译正确性
// ============================================================

describe('编译正确性（4 code → resolvePassives 产物）', () => {
  it('greedy / extremegreed / pillageandplunder：4/5 连获得额外黄金（minSize 缺省 4）', () => {
    expect(getTrait('greedy')?.onBigMatchEconomy).toEqual({ currency: 'gold', amount: 2 });
    expect(getTrait('extremegreed')?.onBigMatchEconomy).toEqual({ currency: 'gold', amount: 4 });
    expect(getTrait('pillageandplunder')?.onBigMatchEconomy).toEqual({ currency: 'gold', amount: 20 });
    const zero: TraitEconomyGain = { gold: 0, souls: 0, gems: 0 };
    expect(resolvePassives(['greedy']).bigMatchEconomyGain).toEqual({
      '4': { ...zero, gold: 2 },
    });
    expect(resolvePassives(['extremegreed']).bigMatchEconomyGain).toEqual({
      '4': { ...zero, gold: 4 },
    });
    expect(resolvePassives(['pillageandplunder']).bigMatchEconomyGain).toEqual({
      '4': { ...zero, gold: 20 },
    });
  });

  it('darkensouls：配对骷髅头获得 3 个灵魂（skullMatchEconomyGain）', () => {
    expect(getTrait('darkensouls')?.onSkullMatchEconomy).toEqual({ currency: 'souls', amount: 3 });
    expect(resolvePassives(['darkensouls']).skullMatchEconomyGain).toEqual({
      gold: 0, souls: 3, gems: 0,
    });
  });

  it('新键编译后与中性被动有差异且编译为纯函数', () => {
    const codes = ['greedy', 'extremegreed', 'pillageandplunder', 'darkensouls'];
    for (const code of codes) {
      expect(JSON.stringify(resolvePassives([code]))).not.toBe(JSON.stringify(neutralPassives()));
    }
    expect(JSON.stringify(resolvePassives(codes))).toBe(JSON.stringify(resolvePassives(codes)));
  });
});

// ============================================================
// 触发纯函数层
// ============================================================

describe('applyBigMatchTriggers / applyColorMatchTriggers（纯函数层）', () => {
  it('greedy：4 连入账 2 黄金；5 连同样触发（「4 或 5 颗」= 任意大连）', () => {
    const holder = makeChar(0, { traitIds: ['greedy'] });
    attachPassives(holder);
    const log4: [string, number][] = [];
    const events4 = applyBigMatchTriggers([holder], { size: 4, gainEconomy: recordEconomy(log4) });
    expect(log4).toEqual([['gold', 2]]);
    expect(events4).toEqual([{ type: 'economy-gain', currency: 'gold', amount: 2, side: PlayerSide.Left }]);

    const log5: [string, number][] = [];
    applyBigMatchTriggers([holder], { size: 5, gainEconomy: recordEconomy(log5) });
    expect(log5).toEqual([['gold', 2]]);
  });

  it('minSize 限定：minSize 5 的特质 4 连不触发、5 连触发', () => {
    const custom: TraitDefinition = {
      code: 'testbigfive',
      name: '测试五连',
      description: '在配对 5 颗宝石时，获得额外 9 黄金。',
      onBigMatchEconomy: { currency: 'gold', amount: 9, minSize: 5 },
    };
    const lookup = (code: string) => (code === 'testbigfive' ? custom : undefined);
    const char = makeChar(0, { traitIds: ['testbigfive'] });
    attachPassives(char, lookup);
    const log4: [string, number][] = [];
    applyBigMatchTriggers([char], { size: 4, gainEconomy: recordEconomy(log4) });
    expect(log4).toEqual([]);
    const log5: [string, number][] = [];
    applyBigMatchTriggers([char], { size: 5, gainEconomy: recordEconomy(log5) });
    expect(log5).toEqual([['gold', 9]]);
  });

  it('多持有者各自入账（两名 greedy → 4 黄金）；阵亡持有者不贡献', () => {
    const a = makeChar(0, { traitIds: ['greedy'] });
    const b = makeChar(1, { traitIds: ['greedy'] });
    attachPassives(a);
    attachPassives(b);
    const log: [string, number][] = [];
    applyBigMatchTriggers([a, b], { size: 4, gainEconomy: recordEconomy(log) });
    expect(log).toEqual([['gold', 2], ['gold', 2]]);

    const dead = makeChar(2, { traitIds: ['greedy'], defeated: true });
    attachPassives(dead);
    const logDead: [string, number][] = [];
    applyBigMatchTriggers([dead], { size: 4, gainEconomy: recordEconomy(logDead) });
    expect(logDead).toEqual([]);
  });

  it('无 gainEconomy 回调时条件经济跳过（纯逻辑环境零事件）', () => {
    const char = makeChar(0, { traitIds: ['greedy', 'darkensouls'] });
    attachPassives(char);
    expect(applyBigMatchTriggers([char], { size: 4 })).toEqual([]);
    expect(applyColorMatchTriggers([char], 'skull')).toEqual([]);
  });

  it('darkensouls：骷髅键入账 3 灵魂；配色键不触发条件经济', () => {
    const holder = makeChar(0, { traitIds: ['darkensouls'] });
    attachPassives(holder);
    const skullLog: [string, number][] = [];
    applyColorMatchTriggers([holder], 'skull', { gainEconomy: recordEconomy(skullLog) });
    expect(skullLog).toEqual([['souls', 3]]);

    const redLog: [string, number][] = [];
    applyColorMatchTriggers([holder], BaseColor.Red, { gainEconomy: recordEconomy(redLog) });
    expect(redLog).toEqual([]);
  });
});

// ============================================================
// TurnEngine 集成：真实对局入账战场经济池
// ============================================================

/** 底行构造「交换 (7,2)<->(6,2) 后成 N 连红」的局面（palette 染色保证无其它红干扰） */
function buildWithNMatch(nRed: 4 | 5, playerChars: Character[], enemyChars: Character[], seed = 5) {
  const board = new BoardModel();
  const palette = [BaseColor.Green, BaseColor.Blue, BaseColor.Yellow, BaseColor.Purple];
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      board.set({ row: r, col: c }, { id: r * 8 + c + 1, type: colorGem(palette[(r + c) % 4]) });
    }
  }
  for (let c = 0; c < 8; c++) {
    const isRedCol = c < nRed && c !== 2;
    board.set({ row: 7, col: c }, { id: 70 + c, type: colorGem(isRedCol ? BaseColor.Red : palette[c % 4]) });
  }
  board.set({ row: 6, col: 2 }, { id: 62, type: colorGem(BaseColor.Red) });
  board.set({ row: 5, col: 2 }, { id: 52, type: colorGem(BaseColor.Blue) });

  const rng = new SeededRNG(seed);
  const idGen = (() => { let n = 700; return () => ++n; })();
  const state = createGameState(
    board,
    makeTeam(PlayerSide.Left, playerChars),
    makeTeam(PlayerSide.Right, enemyChars),
  );
  return { engine: new TurnEngine(state, rng, idGen, new ExtensionRegistry()), state };
}

/** 底行构造「交换 (7,1)<->(6,1) 后三骷髅」的局面（骷髅匹配触发点用） */
function buildWithSkullMatch(playerChars: Character[], enemyChars: Character[], seed = 11) {
  const board = new BoardModel();
  const palette = [BaseColor.Green, BaseColor.Blue, BaseColor.Yellow, BaseColor.Purple];
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      board.set({ row: r, col: c }, { id: r * 8 + c + 1, type: colorGem(palette[(r + c) % 4]) });
    }
  }
  board.set({ row: 7, col: 0 }, { id: 70, type: skullGem() });
  board.set({ row: 7, col: 2 }, { id: 72, type: skullGem() });
  board.set({ row: 7, col: 1 }, { id: 71, type: colorGem(BaseColor.Green) });
  board.set({ row: 6, col: 1 }, { id: 61, type: skullGem() });
  const rng = new SeededRNG(seed);
  const idGen = (() => { let n = 800; return () => ++n; })();
  const state = createGameState(
    board,
    makeTeam(PlayerSide.Left, playerChars),
    makeTeam(PlayerSide.Right, enemyChars),
  );
  return { engine: new TurnEngine(state, rng, idGen, new ExtensionRegistry()), state };
}

describe('TurnEngine 集成：条件经济光环入账战场经济池', () => {
  it('greedy：4 连红 → economy.gold +2 并发 economy-gain 事件（side=行动方）', () => {
    const hero = makeChar(0, { traitIds: ['greedy'] });
    const { engine, state } = buildWithNMatch(4, [hero, makeChar(1)], [makeChar(4), makeChar(5)]);
    expect(state.economy.gold).toBe(0);
    const events = engine.resolveSwap({ row: 7, col: 2 }, { row: 6, col: 2 });
    const gains = events.filter((e) => e.type === 'economy-gain' && e.currency === 'gold');
    expect(gains).toMatchObject([
      { amount: 4, side: PlayerSide.Left },
      { amount: 2, side: PlayerSide.Left },
    ]);
    expect(engine.getState().economy.gold).toBe(6);
  });

  it('extremegreed / pillageandplunder：同一次 4 连按各自数额入账', () => {
    const a = makeChar(0, { traitIds: ['extremegreed'] });
    const b = makeChar(1, { traitIds: ['pillageandplunder'] });
    const { engine, state } = buildWithNMatch(4, [a, b], [makeChar(4), makeChar(5)]);
    engine.resolveSwap({ row: 7, col: 2 }, { row: 6, col: 2 });
    expect(state.economy.gold).toBe(28);
  });

  it('darkensouls：三消骷髅 → economy.souls +3（骷髅匹配触发点，伤害结算之后）', () => {
    const hero = makeChar(0, { traitIds: ['darkensouls'] });
    const { engine, state } = buildWithSkullMatch([hero, makeChar(1)], [makeChar(4), makeChar(5)]);
    expect(state.economy.souls).toBe(0);
    const events = engine.resolveSwap({ row: 7, col: 1 }, { row: 6, col: 1 });
    const gains = events.filter((e) => e.type === 'economy-gain' && e.currency === 'souls');
    expect(gains).toHaveLength(1);
    expect(gains[0]).toMatchObject({ amount: 3, side: PlayerSide.Left });
    expect(engine.getState().economy.souls).toBe(3);
  });

  it.each([4, 5] as const)('%i 连的基础黄金进入局内计数', size => {
    const { engine, state } = buildWithNMatch(size, [makeChar(0), makeChar(1)], [makeChar(4), makeChar(5)]);
    const events = engine.resolveSwap({ row: 7, col: 2 }, { row: 6, col: 2 });
    expect(events.filter(e => e.type === 'economy-gain' && e.currency === 'gold')).toMatchObject([
      { amount: size, side: PlayerSide.Left },
    ]);
    expect(state.economy).toEqual({ gold: size, souls: 0, gems: 0, maps: 0 });
  });
  it('敌方四连只增加敌方局内金币', () => {
    const { engine, state } = buildWithNMatch(4, [makeChar(0)], [makeChar(4)]);
    state.activePlayer = PlayerSide.Right;
    const events = engine.resolveSwap({ row: 7, col: 2 }, { row: 6, col: 2 });
    expect(events.filter(e => e.type === 'economy-gain' && e.currency === 'gold')).toMatchObject([
      { amount: 4, side: PlayerSide.Right },
    ]);
    expect(state.enemyGold).toBe(4);
    expect(state.economy.gold).toBe(0);
  });
});

// ============================================================
// 护栏 · 条件经济零随机消耗（同种子 rng 终态不变）
// ============================================================

describe('护栏 · 条件经济不消耗随机数、事件流差异恰为 economy-gain', () => {
  function build(seed: number, traitIds: string[]) {
    const idGen = (() => { let n = 500; return () => ++n; })();
    const rng = new SeededRNG(seed);
    const board = new BoardGenerator(rng, idGen, 0.16).generate();
    const state = createGameState(
      board,
      {
        player: PlayerSide.Left,
        characters: [makeChar(0, { traitIds }), makeChar(1), makeChar(2)],
      },
      { player: PlayerSide.Right, characters: [makeChar(4), makeChar(5)] },
    );
    const engine = new TurnEngine(state, rng, idGen, new ExtensionRegistry());
    return { engine, state, rng };
  }

  function drive(seed: number, traitIds: string[]) {
    const { engine, state, rng } = build(seed, traitIds);
    const events: GameEvent[] = [];
    for (let i = 0; i < 12; i++) {
      if (state.state === 'GameOver') break;
      const swap = chooseEnemySwap(state.board, rng);
      if (!swap) break;
      events.push(...engine.resolveAction({ type: 'swap', from: swap.a, to: swap.b }));
    }
    return { rngState: rng.getState(), events };
  }

  it('greedy/darkensouls 对局的 rng 终态与无特质对局逐字节一致', () => {
    for (const seed of [7, 42, 2026]) {
      const plain = drive(seed, []);
      const greedy = drive(seed, ['greedy', 'darkensouls']);
      // 经济入账不掷骰：随机流不受新键影响
      expect(greedy.rngState).toBe(plain.rngState);
      // 事件流差异恰为 economy-gain（其余事件逐条一致）
      const plainWithoutEconomy = JSON.stringify(plain.events.filter((e) => e.type !== 'economy-gain'));
      const economyEvents = greedy.events.filter((e) => e.type === 'economy-gain');
      const greedyWithoutEconomy = JSON.stringify(
        greedy.events.filter((e) => e.type !== 'economy-gain'),
      );
      expect(JSON.parse(greedyWithoutEconomy)).toEqual(JSON.parse(plainWithoutEconomy));
      expect(economyEvents.every((e) => e.type === 'economy-gain')).toBe(true);
    }
  });
});
