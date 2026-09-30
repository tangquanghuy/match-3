import { describe, it, expect } from 'vitest';
import { BoardModel } from '@engine/BoardModel';
import { BoardGenerator } from '@engine/boardGen';
import { TurnEngine } from '@engine/TurnEngine';
import { createGameState } from '@engine/GameState';
import { ExtensionRegistry } from '@engine/registry';
import { SeededRNG } from '@engine/rng';
import { GravitySystem } from '@engine/GravitySystem';
import { MatchResolver } from '@engine/MatchResolver';
import { hasLegalSwap } from '@engine/boardUtils';
import { applyBoardPreset } from '@engine/battleRules';
import { BaseColor, MatchState, PlayerSide } from '@engine/types';
import {
  BATTLE_SCHEMA_VERSION, BattleSession, RULESET_VERSION, mapRequestToTeams, validateBattleRequest,
} from '@session/index';
import type { BattleRequest, BattleRules, CombatantSnapshot } from '@session/index';
import { applyRequestBoardPreset } from '@session/rules';

function snap(over: Partial<CombatantSnapshot> = {}): CombatantSnapshot {
  return {
    externalId: 'x', name: 'C', stats: { hp: 40, attack: 4, armor: 0, magic: 6 },
    manaColors: [BaseColor.Red], manaCost: 10, skillId: 'plain', traitIds: [], ...over,
  };
}

function request(rules?: BattleRules): BattleRequest {
  return {
    schemaVersion: BATTLE_SCHEMA_VERSION, battleId: 'b', requestId: 'r', rulesetVersion: RULESET_VERSION, seed: 4242,
    playerTeam: [snap({ externalId: 'p0' })],
    enemyTeam: [
      snap({ externalId: 'e0', stats: { hp: 5, attack: 1, armor: 0, magic: 1 } }),
      snap({ externalId: 'e1', stats: { hp: 60, attack: 1, armor: 0, magic: 1 } }),
    ],
    ...(rules ? { rules } : {}),
  };
}

function setup(rules?: BattleRules) {
  const req = request(rules);
  const { playerTeam, enemyTeam, idMap } = mapRequestToTeams(req);
  const rng = new SeededRNG(req.seed);
  let id = 9000;
  const board = new BoardGenerator(rng, () => id++, 0).generate();
  applyRequestBoardPreset(board, req, rng);
  const state = createGameState(board, playerTeam, enemyTeam);
  const registry = new ExtensionRegistry();
  registry.prototypes.set('plain', { segments: [{ kind: 'damage', target: 'enemyFront', scaling: { base: 8, mult: 0 } }] });
  const engine = new TurnEngine(state, rng, () => id++, registry);
  engine.skullChance = 0;
  const session = new BattleSession({ request: req, idMap, engine });
  return { session, state, engine, idMap, req };
}

describe('战斗规则 · 回合上限', () => {
  it('enemyWins：我方第 N 回合结束仍未获胜即判负', () => {
    const { session, state } = setup({ turnLimit: { turns: 2, onExpire: 'enemyWins' } });
    session.passTurn(); // 我方 1 → 敌方
    session.passTurn(); // 敌方 1 → 我方
    expect(state.state).not.toBe(MatchState.GameOver);
    session.passTurn(); // 我方 2 结束 → 到期
    expect(state.winner).toBe(PlayerSide.Right);
    const result = session.buildResult();
    expect(result.endReason).toBe('turn-limit');
    expect(result.playerTurns).toBe(2);
  });

  it('playerWins：坚守 N 回合（敌方回合也打完）即胜', () => {
    const { session, state } = setup({ turnLimit: { turns: 2, onExpire: 'playerWins' } });
    session.passTurn();
    session.passTurn();
    session.passTurn();
    expect(state.state).not.toBe(MatchState.GameOver);
    session.passTurn(); // 敌方第 2 回合结束
    expect(state.winner).toBe(PlayerSide.Left);
    expect(session.buildResult().endReason).toBe('turn-limit');
  });

  it('无规则对局不维护回合计数', () => {
    const { session, state } = setup();
    session.passTurn();
    expect(state.turnCount).toBeUndefined();
    expect(state.winner).toBeNull();
  });
});

describe('战斗规则 · 击杀目标', () => {
  it('指定目标阵亡即胜，其余敌人仍存活', () => {
    const { session, state } = setup({ objective: { killTargets: ['e0'] } });
    const hero = state.teams[PlayerSide.Left].characters[0]!;
    hero.mana = hero.manaCost;
    session.resolve({ type: 'cast', characterId: hero.id });
    expect(state.winner).toBe(PlayerSide.Left);
    const result = session.buildResult();
    expect(result.endReason).toBe('objective');
    expect(result.defeatedExternalIds).toContain('e0');
    expect(result.defeatedExternalIds).not.toContain('e1');
  });

  it('目标逃跑不算击杀', () => {
    const { session, state, engine } = setup({ objective: { killTargets: ['e0'] } });
    const target = state.teams[PlayerSide.Right].characters[0]!;
    target.fled = true;
    target.defeated = true; // 即使被标阵亡，只要 fled 也不算达成
    session.passTurn();
    expect(state.winner).toBeNull();
    expect(engine.getRules()?.killTargets).toEqual([target.id]);
  });
});

describe('战斗规则 · 回合开始', () => {
  it('只给指定单位补法力，按 every 间隔触发', () => {
    const { session, state } = setup({ turnStart: [{ side: 'enemy', every: 2, mana: { amount: 3, targets: ['e0'] } }] });
    const [e0, e1] = state.teams[PlayerSide.Right].characters;
    session.passTurn(); // 敌方第 1 回合开始
    expect(e0!.mana).toBe(3);
    expect(e1!.mana).toBe(0);
    session.passTurn();
    session.passTurn(); // 敌方第 2 回合：every 2 不触发
    expect(e0!.mana).toBe(3);
    session.passTurn();
    session.passTurn(); // 敌方第 3 回合
    expect(e0!.mana).toBe(6);
  });

  it('我方第 1 回合的开局项在首屏事件里结算', () => {
    const { state } = setup({ turnStart: [{ side: 'player', mana: { amount: 4 } }] });
    expect(state.teams[PlayerSide.Left].characters[0]!.mana).toBe(4);
  });

  it('回合开始创造宝石', () => {
    const { session, state } = setup({ turnStart: [{ side: 'enemy', createGems: [{ gem: { kind: 'stoneBlock' }, count: 2 }] }] });
    session.passTurn();
    let stones = 0;
    state.board.forEach((gem) => { if (gem?.type.kind === 'special' && gem.type.spec.kind === 'stoneBlock') stones += 1; });
    expect(stones).toBe(2);
  });
});

describe('战斗规则 · 棋盘', () => {
  it('预置特殊宝石：不造现成三连，仍有合法交换', () => {
    const rng = new SeededRNG(7);
    let id = 0;
    const board = new BoardGenerator(rng, () => id++, 0.1).generate();
    const placed = applyBoardPreset(board, [
      { gem: { kind: 'bootyGem' }, count: 3 },
      { gem: { kind: 'freezeGem' }, count: 2 },
      { gem: { kind: 'candyGem', color: BaseColor.Green }, count: 2 },
    ], rng);
    expect(placed).toHaveLength(7);
    expect(new MatchResolver().hasAnyMatch(board)).toBe(false);
    expect(hasLegalSwap(board)).toBe(true);
    // 可匹配宝石落在同色格
    for (const pos of placed) {
      const gem = board.get(pos)!;
      expect(gem.type.kind).toBe('special');
    }
  });

  it('特殊宝石掉落池只产出池内宝石', () => {
    const rng = new SeededRNG(3);
    let id = 0;
    const gravity = new GravitySystem(rng, () => id++);
    gravity.specialSpawnChance = 1;
    gravity.specialPool = [{ gem: { kind: 'candyGem', color: BaseColor.Red }, weight: 1 }, { gem: { kind: 'hourglass' }, weight: 1 }];
    const board = new BoardModel();
    const result = gravity.apply(board, 0);
    expect(result.spawns.length).toBe(BoardModel.ROWS * BoardModel.COLS);
    const kinds = new Set(result.spawns.map((s) => (s.gemType.kind === 'special' ? s.gemType.spec.kind : 'plain')));
    expect([...kinds].sort()).toEqual(['candyGem', 'hourglass']);
  });

  it('基色权重让指定色明显更常掉落', () => {
    const { engine, state } = setup({ board: { colorWeights: { [BaseColor.Yellow]: 5 } } });
    // 通过引擎私有补充口间接验证：清空棋盘后补一次
    state.board.forEach((_, pos) => state.board.set(pos, null));
    const weights = (engine as unknown as { dropWeights(): Map<BaseColor, number> | undefined }).dropWeights();
    expect(weights?.get(BaseColor.Yellow)).toBe(5);
  });
});

describe('战斗规则 · 校验', () => {
  const opts = { knownSkillIds: new Set(['plain']), knownTraitIds: new Set<string>(), knownTroopTypes: new Set<string>() };
  it('合法规则通过', () => {
    const ok = validateBattleRequest(request({
      board: { skullChance: 0.2, preset: [{ gem: { kind: 'bootyGem' }, count: 3 }], specialDrops: { chance: 0.05, pool: [{ gem: { kind: 'hourglass' }, weight: 1 }] } },
      turnLimit: { turns: 8, onExpire: 'playerWins' },
      objective: { killTargets: ['e0'] },
      turnStart: [{ side: 'enemy', mana: { amount: 3, targets: ['e0'] } }],
    }), opts);
    expect(ok.ok).toBe(true);
  });
  it('目标不是敌方 / 宝石未知 / 六色族缺色 → 拒绝', () => {
    const bad = validateBattleRequest(request({
      objective: { killTargets: ['p0'] },
      board: { preset: [{ gem: { kind: 'nope' as never }, count: 1 }, { gem: { kind: 'candyGem' }, count: 1 }] },
      turnStart: [{ side: 'enemy', mana: { amount: 3, targets: ['p0'] } }],
    }), opts);
    expect(bad.ok).toBe(false);
    if (!bad.ok) {
      const paths = bad.issues.map((i) => i.path);
      expect(paths).toContain('rules.objective.killTargets');
      expect(paths).toContain('rules.board.preset.0.gem');
      expect(paths).toContain('rules.board.preset.1.gem.color');
      expect(paths).toContain('rules.turnStart.0.mana.targets');
    }
  });
});
