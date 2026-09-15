/**
 * 风暴引擎机制测试（阶段 1.3）：设置 / 替换 / 顶替 / 到期 / 全场唯一。
 *
 * 语义（任务书 + 契约）：
 *   - 风暴不是兵种：死亡召唤 spec 带风暴变体时不入队，改设持有者一方 team.storm；
 *   - 全场唯一：后召顶替先召（不分敌我）；被顶方收 color=null 的 replaced 供表现层撤指示器；
 *   - 同回合多个风暴 spec 按 specs 顺序结算，后者顶前者；
 *   - 回合尾（DoT 结算后）双方 storm.turns 递减，归零清除发 reason:'expired'。
 * 集成路径：TurnEngine.processDeathTriggers → resolveDeathSummons → applyDeathSummons(storm 分支)
 *   → TurnEngine.setStormFromSummon。
 */
import { describe, it, expect } from 'vitest';
import { applyDeathSummons, setSummonTemplateResolver } from '@engine/traits';
import type { DeathSummonSpec } from '@engine/traits';
import { TurnEngine } from '@engine/TurnEngine';
import { BoardGenerator } from '@engine/boardGen';
import { createGameState } from '@engine/GameState';
import { SeededRNG } from '@engine/rng';
import { ExtensionRegistry } from '@engine/registry';
import { chooseEnemySwap } from '@engine/ai';
import { MatchState, PlayerSide, BaseColor } from '@engine/types';
import type { Character } from '@engine/types';
import type { GameEvent, StormChangeEvent } from '@engine/events';

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

const isStormChange = (e: GameEvent): e is StormChangeEvent => e.type === 'storm-change';

describe('applyDeathSummons 纯函数层：风暴变体分支', () => {
  /** 暗风暴变体 spec（模拟生成器对 darkdeath 的产出） */
  const STORM_SPEC: DeathSummonSpec = {
    chance: 1,
    troopId: 9001,
    referenceName: 'Darkstorm',
    displayName: '暗风暴',
    storm: { color: BaseColor.Purple, turns: 8 },
  };

  it('带 storm 的 spec 不入队：setStorm 收到 (spec, side)，enqueue/模板解析不参与', () => {
    const seen: { color?: BaseColor; turns?: number; side?: PlayerSide }[] = [];
    const events = applyDeathSummons([{ spec: STORM_SPEC, side: PlayerSide.Left }], {
      deadId: 9,
      // 故意不提供 nextCharId：风暴不需要角色 id 分配器
      enqueue: () => {
        throw new Error('风暴变体不应走兵种入队');
      },
      setStorm: (spec, side) => {
        seen.push({ color: spec.storm?.color, turns: spec.storm?.turns, side });
        return [{ type: 'storm-change', player: side, color: spec.storm!.color, reason: 'set' }];
      },
    });
    expect(seen).toEqual([{ color: BaseColor.Purple, turns: 8, side: PlayerSide.Left }]);
    expect(events).toEqual([{ type: 'storm-change', player: PlayerSide.Left, color: BaseColor.Purple, reason: 'set' }]);
  });

  it('概率判定失败：风暴不设置（与兵种召唤同口径）', () => {
    const half: DeathSummonSpec = { ...STORM_SPEC, chance: 0.25 };
    const events = applyDeathSummons([{ spec: half, side: PlayerSide.Right }], {
      deadId: 9,
      enqueue: () => [],
      setStorm: () => {
        throw new Error('概率拒绝后不应设置风暴');
      },
      rng: { next: () => 0.5 }, // 0.5 >= 0.25 → 拒绝
    });
    expect(events).toEqual([]);
  });

  it('无 setStorm 回调的宿主：风暴变体安全跳过不崩溃', () => {
    const events = applyDeathSummons([{ spec: STORM_SPEC, side: PlayerSide.Left }], {
      deadId: 9,
      enqueue: () => [],
    });
    expect(events).toEqual([]);
  });

  it('多个 spec 按顺序结算：风暴与兵种混排时各自走各自分支', () => {
    const troop: DeathSummonSpec = { chance: 1, troopId: 6011, referenceName: 'AncientHorror', displayName: '远古恐惧' };
    setSummonTemplateResolver((spec) => ({
      name: spec.displayName,
      maxHp: 10, hp: 10, attack: 1, armor: 0, magic: 1,
      colors: [BaseColor.Purple], manaCost: 8, mana: 0, skillId: 'none',
    }));
    const calls: string[] = [];
    applyDeathSummons(
      [
        { spec: STORM_SPEC, side: PlayerSide.Left },
        { spec: troop, side: PlayerSide.Left },
        { spec: { ...STORM_SPEC, storm: { color: BaseColor.Red, turns: 8 } }, side: PlayerSide.Right },
      ],
      {
        deadId: 9,
        nextCharId: () => 100,
        enqueue: () => {
          calls.push('enqueue');
          return [];
        },
        setStorm: (spec) => {
          calls.push(`storm:${spec.storm!.color}`);
          return [];
        },
      },
    );
    expect(calls).toEqual(['storm:Purple', 'enqueue', 'storm:Red']);
  });
});

describe('TurnEngine 集成：风暴设置 / 替换 / 顶替 / 到期', () => {
  /**
   * 双方轮流 AI 交换驱动对局，逐行动收集事件，谓词满足即停（风暴事件出现在同一行动内，
   * 停在 action 边界保证断言的事件集完整）。种子扫描：击杀依赖随机棋盘出骷髅匹配。
   */
  function driveUntil(
    engine: TurnEngine,
    state: ReturnType<typeof createGameState>,
    rng: SeededRNG,
    done: (events: GameEvent[]) => boolean,
    maxTurns = 60,
  ): GameEvent[] {
    const collected: GameEvent[] = [];
    for (let i = 0; i < maxTurns; i++) {
      if (state.state === MatchState.GameOver) break;
      const swap = chooseEnemySwap(state.board, rng);
      if (!swap) break;
      const events = engine.resolveAction({ type: 'swap', from: swap.a, to: swap.b });
      collected.push(...events);
      if (done(collected)) break;
    }
    return collected;
  }

  function buildEngine(
    playerChars: Character[],
    enemyChars: Character[],
    seed: number,
  ): { engine: TurnEngine; state: ReturnType<typeof createGameState>; rng: SeededRNG } {
    const idGen = (() => { let n = 500; return () => ++n; })();
    const rng = new SeededRNG(seed);
    const board = new BoardGenerator(rng, idGen, 0.16).generate();
    const state = createGameState(
      board,
      { player: PlayerSide.Left, characters: playerChars },
      { player: PlayerSide.Right, characters: enemyChars },
    );
    const engine = new TurnEngine(state, rng, idGen, new ExtensionRegistry());
    return { engine, state, rng };
  }

  it('战斗初始化触发 Song of Light，并把开局 storm-change 记录为一次性事件', () => {
    const idGen = (() => { let n = 900; return () => ++n; })();
    const rng = new SeededRNG(17);
    const board = new BoardGenerator(rng, idGen, 0.16).generate();
    const state = createGameState(
      board,
      { player: PlayerSide.Left, characters: [makeChar(0, { traitIds: ['songoflight'] })] },
      { player: PlayerSide.Right, characters: [makeChar(4)] },
    );
    const engine = new TurnEngine(state, rng, idGen, new ExtensionRegistry());

    expect(state.teams[PlayerSide.Left].storm).toEqual({
      color: BaseColor.Yellow,
      turns: 8,
      troopId: 9004,
    });
    expect(engine.takeInitialEvents()).toEqual([
      { type: 'storm-change', player: PlayerSide.Left, color: BaseColor.Yellow, reason: 'set' },
    ]);
    expect(engine.takeInitialEvents()).toEqual([]);
  });

  it('多份开局风暴按队伍/特质顺序顶替，最终只保留最后一份', () => {
    const idGen = (() => { let n = 950; return () => ++n; })();
    const rng = new SeededRNG(23);
    const board = new BoardGenerator(rng, idGen, 0.16).generate();
    const state = createGameState(
      board,
      { player: PlayerSide.Left, characters: [makeChar(0, { traitIds: ['songoflight', 'songofdarkness'] })] },
      { player: PlayerSide.Right, characters: [makeChar(4)] },
    );
    const engine = new TurnEngine(state, rng, idGen, new ExtensionRegistry());
    const events = engine.takeInitialEvents().filter(isStormChange);

    expect(events.map((event) => [event.player, event.color, event.reason])).toEqual([
      [PlayerSide.Left, BaseColor.Yellow, 'set'],
      [PlayerSide.Left, BaseColor.Purple, 'replaced'],
    ]);
    expect(state.teams[PlayerSide.Left].storm).toMatchObject({
      color: BaseColor.Purple,
      turns: 8,
      troopId: 9001,
    });
  });

  it('同回合两个风暴 spec 按顺序结算：己方后召顶先召（Purple set → Red replaced）', () => {
    let tested = false;
    for (let seed = 1; seed < 60 && !tested; seed++) {
      // 受害者站队首（骷髅伤害打队首）；两名持有者存活：fromdark(暗风暴) → fromashes(火风暴)
      const { engine, state, rng } = buildEngine(
        [
          makeChar(0, { hp: 1, maxHp: 1, attack: 1 }),
          makeChar(1, { hp: 9999, maxHp: 9999, attack: 1, traitIds: ['fromdark'] }),
          makeChar(2, { hp: 9999, maxHp: 9999, attack: 1, traitIds: ['fromashes'] }),
        ],
        [makeChar(4, { hp: 9999, maxHp: 9999, attack: 60 }), makeChar(5, { hp: 9999, maxHp: 9999, attack: 1 })],
        seed,
      );
      const events = driveUntil(engine, state, rng, (evs) =>
        evs.filter(isStormChange).filter((e) => e.color !== null && e.player === PlayerSide.Left).length >= 2);
      const storms = events.filter(isStormChange);
      if (storms.length < 2) continue;
      tested = true;

      expect(storms[0]).toMatchObject({ player: PlayerSide.Left, color: BaseColor.Purple, reason: 'set' });
      expect(storms[0].prevColor).toBeUndefined();
      expect(storms[1]).toMatchObject({
        player: PlayerSide.Left, color: BaseColor.Red, reason: 'replaced', prevColor: BaseColor.Purple,
      });
      // 全场唯一且后者顶前者：红风暴（fromashes, 虚拟 troopId 9002）在场，持续 8 回合
      expect(state.teams[PlayerSide.Left].storm).toEqual({ color: BaseColor.Red, turns: 8, troopId: 9002 });
      expect(state.teams[PlayerSide.Right].storm).toBeUndefined();
    }
    expect(tested, '60 个种子内应有至少一次触发（受害者 hp1 被高攻骷髅击杀）').toBe(true);
  });

  it('顶掉对方风暴：先给被顶方发 color=null 的 replaced，再给己方发 replaced（全场唯一）', () => {
    let tested = false;
    for (let seed = 1; seed < 60 && !tested; seed++) {
      // 我方（Left）fromdark 持有者存活、受害者阵亡 → Left 设暗风暴；
      // 敌方（Right）fierydeath 持有者对同一死者触发 → 顶掉 Left 的暗风暴，设火风暴
      const { engine, state, rng } = buildEngine(
        [
          makeChar(0, { hp: 1, maxHp: 1, attack: 1 }),
          makeChar(1, { hp: 9999, maxHp: 9999, attack: 1, traitIds: ['fromdark'] }),
        ],
        [
          makeChar(4, { hp: 9999, maxHp: 9999, attack: 60, traitIds: ['fierydeath'] }),
          makeChar(5, { hp: 9999, maxHp: 9999, attack: 1 }),
        ],
        seed,
      );
      const events = driveUntil(engine, state, rng, (evs) =>
        evs.filter(isStormChange).some((e) => e.player === PlayerSide.Right && e.color !== null));
      const storms = events.filter(isStormChange);
      if (storms.length < 3) continue;
      tested = true;

      expect(storms.map((e) => [e.player, e.color, e.reason])).toEqual([
        [PlayerSide.Left, BaseColor.Purple, 'set'],
        [PlayerSide.Left, null, 'replaced'],
        [PlayerSide.Right, BaseColor.Red, 'replaced'],
      ]);
      // 顶替事件带 prevColor：被顶方撤指示器与新高亮所需的数据都在
      expect(storms[1].prevColor).toBe(BaseColor.Purple);
      expect(storms[2].prevColor).toBe(BaseColor.Purple);
      // 全场唯一：风暴只归顶替方
      expect(state.teams[PlayerSide.Right].storm).toEqual({ color: BaseColor.Red, turns: 8, troopId: 9002 });
      expect(state.teams[PlayerSide.Left].storm).toBeUndefined();
    }
    expect(tested, '60 个种子内应有至少一次触发').toBe(true);
  });

  it('回合递减与到期：每次行动回合尾 -1，归零清除并发 expired（color=null, prevColor=旧色）', () => {
    let tested = false;
    outer: for (let seed = 1; seed < 60; seed++) {
      const { engine, state, rng } = buildEngine(
        [
          makeChar(0, { hp: 1, maxHp: 1, attack: 1 }),
          makeChar(1, { hp: 9999, maxHp: 9999, attack: 1, traitIds: ['fromdark'] }),
        ],
        [makeChar(4, { hp: 9999, maxHp: 9999, attack: 60 }), makeChar(5, { hp: 9999, maxHp: 9999, attack: 1 })],
        seed,
      );
      driveUntil(engine, state, rng, (evs) => evs.filter(isStormChange).some((e) => e.color !== null));
      if (!state.teams[PlayerSide.Left].storm) continue;

      // 风暴已在场（turns=8）。风暴设置发生在击杀行动的 finishTurn 之后，本行动不递减。
      const passEvents: GameEvent[] = [];
      for (let i = 0; i < 8; i++) {
        expect(state.state).toBe(MatchState.AwaitingInput);
        passEvents.push(...engine.passTurn());
        if (i < 7) expect(state.teams[PlayerSide.Left].storm?.turns).toBe(8 - (i + 1));
      }
      const expired = passEvents.filter(isStormChange);
      expect(expired).toHaveLength(1);
      expect(expired[0]).toMatchObject({
        player: PlayerSide.Left, color: null, reason: 'expired', prevColor: BaseColor.Purple,
      });
      expect(state.teams[PlayerSide.Left].storm).toBeUndefined();
      tested = true;
      break outer;
    }
    expect(tested).toBe(true);
  });

  it('无风暴时回合尾不产生 storm-change 事件', () => {
    const { engine, state } = buildEngine(
      [makeChar(0), makeChar(1)],
      [makeChar(4), makeChar(5)],
      1,
    );
    for (let i = 0; i < 10; i++) {
      if (state.state === MatchState.GameOver) break;
      const events = engine.passTurn();
      expect(events.filter(isStormChange)).toEqual([]);
    }
    expect(state.teams[PlayerSide.Left].storm).toBeUndefined();
    expect(state.teams[PlayerSide.Right].storm).toBeUndefined();
  });
});
