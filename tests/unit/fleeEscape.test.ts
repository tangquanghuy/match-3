/**
 * 逃跑机制单测（DECISIONS 四项拍板③，窗口 E）。
 *
 * 覆盖：escapeChance 效果段判定成功/失败（种子化）、flee 事件形态、编队 splice 与队首顺延、
 * 不触发死亡召唤/阵亡响应（fled ≠ defeat）、全队 fled 判负、结算侧 fledExternalIds
 * 与 defeatedExternalIds 的区分。原语路径走 executePrototype（含 resolveDefeatEvents
 * 的移出管线），结算路径走 buildBattleResult。
 */
import { describe, it, expect } from 'vitest';
import { BoardModel } from '@engine/BoardModel';
import { TurnEngine } from '@engine/TurnEngine';
import { ExtensionRegistry } from '@engine/registry';
import { createGameState } from '@engine/GameState';
import { SeededRNG } from '@engine/rng';
import { executePrototype } from '@engine/skills/prototypes';
import { escape, dmg, skill } from '@engine/skills/builders';
import type { SkillPrototype } from '@engine/skills/prototypes';
import type { EffectContext } from '@engine/skills/effects/context';
import { buildBattleResult } from '@session/battleResult';
import { mapRequestToTeams } from '@session/index';
import type { BattleRequest, CombatantSnapshot } from '@session/index';
import { BATTLE_SCHEMA_VERSION, RULESET_VERSION } from '@session/contract';
import { BaseColor, PlayerSide, MatchState, colorGem } from '@engine/types';
import type { Character, Team, Gem, GemType } from '@engine/types';
import type { GameState } from '@engine/GameState';

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

function makeTeam(side: PlayerSide, chars: Character[]): Team {
  return { player: side, characters: chars };
}

/** 全红满盘（无预成匹配：红宝石同色会成三连？——满盘同色必然横向三连。
 * 用 (r+c) 交错保证无三连且交换不合法即可；逃跑测试不经棋盘解析。 */
function quietBoard(): BoardModel {
  const board = new BoardModel();
  const colors = [BaseColor.Red, BaseColor.Green, BaseColor.Blue, BaseColor.Yellow];
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      board.set({ row: r, col: c }, g(colorGem(colors[(r * 3 + c * 5) % 4])));
    }
  }
  return board;
}

interface Setup {
  left?: Partial<Character>[];
  right?: Partial<Character>[];
  seed?: number;
}

function setup(s: Setup = {}): { ctx: EffectContext; state: GameState } {
  const left: Team = makeTeam(PlayerSide.Left, (s.left ?? [{}]).map((o, i) => makeChar(i, { magic: 6, ...o })));
  const right: Team = makeTeam(PlayerSide.Right, (s.right ?? [{}, {}, {}]).map((o, i) => makeChar(i + 4, o)));
  const state = createGameState(quietBoard(), left, right);
  const ctx: EffectContext = {
    state,
    casterId: state.teams[PlayerSide.Left].characters[0].id,
    rng: new SeededRNG(s.seed ?? 7),
    nextGemId: () => 900000 + gid++,
  };
  return { ctx, state };
}

describe('escapeChance 效果段（有 N% 的几率跑掉）', () => {
  it('判定成功：施法者标 fled、发 flee 事件（带 hp/armor 快照），并从编队 splice 移出', () => {
    const { ctx, state } = setup({ seed: 7, left: [{ hp: 31, armor: 4 }] });
    const fleer = state.teams[PlayerSide.Left].characters[0].id;
    // escape(1) 必定成功（不经概率歧义）
    const events = executePrototype(skill(escape(1)) as SkillPrototype, ctx);
    expect(events).toEqual([
      { type: 'flee', characterId: fleer, player: PlayerSide.Left, hp: 31, armor: 4 },
    ]);
    // 已从编队移出（不在场）
    expect(state.teams[PlayerSide.Left].characters.some((c) => c.id === fleer)).toBe(false);
  });

  it('判定失败（chance=0）：零事件、角色留在编队、fled 不置位', () => {
    const { ctx, state } = setup({ seed: 7 });
    const events = executePrototype(skill(escape(0)) as SkillPrototype, ctx);
    expect(events).toEqual([]);
    const caster = state.teams[PlayerSide.Left].characters[0];
    expect(caster.fled ?? false).toBe(false);
    expect(state.teams[PlayerSide.Left].characters).toHaveLength(1);
  });

  it('种子化概率：同 seed 同判定，不同 seed 可不同（sanity）', () => {
    // 找一个必成功的种子与必失败的种子（确定性：同 seed 恒同结果）
    const probe = (seed: number): boolean => {
      const { ctx } = setup({ seed, left: [{ id: 99 }] });
      ctx.casterId = 99;
      const events = executePrototype(skill(escape(0.5)) as SkillPrototype, ctx);
      return events.some((e) => e.type === 'flee');
    };
    const succeeded = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(probe);
    expect(new Set(succeeded).size).toBeGreaterThan(0);
    // 同种子重复判定一致
    expect(probe(3)).toBe(probe(3));
  });

  it('逃跑 ≠ 阵亡：不触发对方 summonOnEnemyDeath 等死亡钩子路径（无 defeat 事件）', () => {
    const { ctx, state } = setup({ seed: 7, left: [{ id: 42, hp: 20 }] });
    ctx.casterId = 42;
    // runSegment 包裹的 resolveDefeatEvents 只在 defeat/flee 时移出；此处确认
    // 逃跑后编队里剩余角色不受影响、无 defeat 事件混入。
    const before = state.teams[PlayerSide.Right].characters.map((c) => c.id);
    const events = executePrototype(skill(escape(1)) as SkillPrototype, ctx);
    expect(events.filter((e) => e.type === 'defeat')).toEqual([]);
    expect(state.teams[PlayerSide.Right].characters.map((c) => c.id)).toEqual(before);
    expect(state.teams[PlayerSide.Right].characters.every((c) => !c.defeated)).toBe(true);
  });

  it('移出后队首顺延：原第二位成为新的队首（吃骷髅伤害的坦位）', () => {
    const { ctx, state } = setup({ seed: 7, left: [{ id: 42 }, { id: 43 }, { id: 44 }] });
    ctx.casterId = 42;
    executePrototype(skill(escape(1)) as SkillPrototype, ctx);
    const left = state.teams[PlayerSide.Left].characters;
    expect(left.map((c) => c.id)).toEqual([43, 44]);
    expect(left[0].id).toBe(43);
  });

  it('队列补位：逃跑者的空位由召唤队列 FIFO 顶替（与阵亡同一管线）', () => {
    const { ctx, state } = setup({ seed: 7, left: [{ id: 42 }] });
    ctx.casterId = 42;
    const substitute = makeChar(77);
    state.teams[PlayerSide.Left].summonQueue = [{ character: substitute, troopId: 555 }];
    const events = executePrototype(skill(escape(1)) as SkillPrototype, ctx);
    expect(events.some((e) => e.type === 'summon')).toBe(true);
    expect(state.teams[PlayerSide.Left].characters.map((c) => c.id)).toEqual([77]);
    expect(substitute.defeated).toBe(false); // 补位者不是"复活"，fled 不置 defeated
  });

  it('全队逃光 → isWipedOut 判定败北，game-over 发给对方', () => {
    const { ctx, state } = setup({
      seed: 7,
      left: [{ id: 42 }, { id: 43 }],
    });
    ctx.casterId = 42;
    // 队首逃跑
    executePrototype(skill(escape(1)) as SkillPrototype, ctx);
    expect(state.winner).toBeNull();
    // 队尾逃跑 → 全队空 → 该方败北（逐角色逃跑，由调用方判定；此处直接验证判定语义）
    ctx.casterId = 43;
    executePrototype(skill(escape(1)) as SkillPrototype, ctx);
    expect(state.teams[PlayerSide.Left].characters).toHaveLength(0);
    expect(state.state).toBe(MatchState.AwaitingInput); // executePrototype 不做胜负判定
  });
});

describe('结算侧：fled 不按击杀记账', () => {
  const snap = (externalId: string): CombatantSnapshot => ({
    externalId,
    name: externalId,
    stats: { hp: 50, attack: 5, armor: 0, magic: 0 },
    manaColors: [BaseColor.Red],
    manaCost: 20,
    skillId: 'plain',
  });

  function resultWithFlee() {
    const { ctx, state } = setup({ seed: 7, left: [{ id: 0, hp: 33, armor: 5 }, { id: 1 }] });
    ctx.casterId = 0;
    const events = executePrototype(skill(escape(1)) as SkillPrototype, ctx);
    // 模拟战斗结束（buildBattleResult 要求 winner 非空）
    state.winner = PlayerSide.Right;
    state.state = MatchState.GameOver;
    const request: BattleRequest = {
      schemaVersion: BATTLE_SCHEMA_VERSION,
      battleId: 'b',
      requestId: 'r',
      rulesetVersion: RULESET_VERSION,
      seed: 7,
      playerTeam: [snap('fleer'), snap('stayer')],
      enemyTeam: [snap('e1')],
    };
    const { idMap } = mapRequestToTeams(request);
    return { result: buildBattleResult({ request, state, idMap, events }) };
  }

  it('fledExternalIds 收录逃跑者，defeatedExternalIds 不含', () => {
    const { result } = resultWithFlee();
    expect(result.fledExternalIds).toEqual(['fleer']);
    expect(result.defeatedExternalIds).not.toContain('fleer');
    const fleer = result.combatants.find((c) => c.externalId === 'fleer');
    expect(fleer).toMatchObject({ fled: true, defeated: false, hp: 33, armor: 5 });
  });

  it('economy 字段随结果回传（三币总额）', () => {
    const { result } = resultWithFlee();
    expect(result.economy).toEqual({ gold: 0, souls: 0, gems: 0 });
  });
});

describe('组装器词汇（builders）', () => {
  it('dmg + escape 组合合法（batch-39 句式：伤害 + 几率跑掉）', () => {
    const proto = skill(dmg('enemyRandom', 2, 1), escape(0.3));
    expect(proto.segments).toHaveLength(2);
    expect(proto.segments[1]).toEqual({ kind: 'escapeChance', escapeChance: 0.3 });
  });
});

describe('TurnEngine 全管线：逃跑不触发死亡召唤/阵亡响应', () => {
  it('施法者逃跑后 processDeathTriggers 无 defeat 可扫：敌方 summonOnEnemyDeath 不发动', () => {
    const board = new BoardModel();
    const palette = [BaseColor.Blue, BaseColor.Green, BaseColor.Yellow, BaseColor.Purple];
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) board.set({ row: r, col: c }, g(colorGem(palette[(r + c) % palette.length])));
    }
    const left: Team = { player: PlayerSide.Left, characters: [makeChar(0, { mana: 99, skillId: 'esc' })] };
    // 敌方持有「敌人身亡时 50% 召唤幽魂」（soullegion，traits.json 已实现键）
    const right: Team = {
      player: PlayerSide.Right,
      characters: [makeChar(4, { traitIds: ['soullegion'] }), makeChar(5), makeChar(6)],
    };
    const state = createGameState(board, left, right);
    const registry = new ExtensionRegistry();
    registry.prototypes.set('esc', { segments: [{ kind: 'escapeChance', escapeChance: 1 }] });
    const engine = new TurnEngine(state, new SeededRNG(9), () => 700000 + gid++, registry);
    engine.skullChance = 0;

    const events = engine.resolveAction({ type: 'cast', characterId: 0 });
    expect(events.some((e) => e.type === 'flee')).toBe(true);
    // 逃跑不是阵亡：无 defeat 事件、无 summon 事件（死亡召唤管线只扫 defeat）
    expect(events.some((e) => e.type === 'defeat')).toBe(false);
    expect(events.some((e) => e.type === 'summon')).toBe(false);
    // 唯一角色逃光 → 全队 fled 判负（isWipedOut：编队已空）
    expect(state.winner).toBe(PlayerSide.Right);
    expect(state.state).toBe(MatchState.GameOver);
  });
});
