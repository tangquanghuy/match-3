/**
 * M2 整环集成（headless）：存档 → 出敌 → 桥接 → TurnEngine 真实对局 →
 * BattleResult → 结算入账。全程零 DOM、零渲染，同 seed 必须复现同一场战斗。
 */
import { describe, it, expect } from 'vitest';
import { BoardGenerator } from '../../src/engine/boardGen';
import { BoardModel } from '../../src/engine/BoardModel';
import { MatchResolver } from '../../src/engine/MatchResolver';
import { findLegalSwaps } from '../../src/engine/boardUtils';
import { createGameState } from '../../src/engine/GameState';
import { MatchState } from '../../src/engine/types';
import { TurnEngine } from '../../src/engine/TurnEngine';
import { SeededRNG } from '../../src/engine/rng';
import type { CellPos } from '../../src/engine/types';
import { BattleSession, mapRequestToTeams } from '../../src/session';
import {
  applySettlement,
  buildBattleRequest,
  levelUp,
  newSave,
  planQuestEncounter,
} from '../../src/meta';

const KINGDOM = '破碎尖塔';
const SEED = 20260917;

interface RunOutcome {
  digest: string;
  winner: 'player' | 'enemy';
}

/**
 * 骷髅优先的交换策略：伤害主渠道是骷髅匹配，而引擎自带的 chooseEnemySwap
 * 偏好 4/5 连消除——那会喂大「庞然」类成长特质，把集成测试拖成不收敛的镜像局。
 * 这里明确以「制造骷髅匹配」为第一目标（平局时随机），保证战斗快速分出胜负。
 */
const resolver = new MatchResolver();

function skullFirstSwap(board: BoardModel, rng: SeededRNG): { a: CellPos; b: CellPos } | null {
  const swaps = findLegalSwaps(board);
  if (swaps.length === 0) return null;
  let best: { a: CellPos; b: CellPos }[] = [];
  let bestScore = -1;
  for (const sw of swaps) {
    const trial = board.clone();
    trial.swap(sw.a, sw.b);
    const matches = resolver.findMatches(trial);
    if (matches.length === 0) continue;
    let skulls = 0;
    let cells = 0;
    for (const group of matches) {
      cells += group.cells.length;
      for (const pos of group.cells) {
        if (trial.get(pos)?.type.kind === 'skull') skulls += 1;
      }
    }
    const score = skulls * 10 + cells;
    if (score > bestScore) {
      bestScore = score;
      best = [sw];
    } else if (score === bestScore) {
      best.push(sw);
    }
  }
  if (best.length === 0) return swaps[rng.nextInt(swaps.length)];
  return best[rng.nextInt(best.length)];
}

/** 打一整场：双方都由骷髅优先 AI 驱动，直到分出胜负 */
function runFullBattle(playerSeed: number): RunOutcome {
  const save = newSave({ now: 0, starterTroopIds: [6000, 6097, 6457] });
  // 先练到 10 级再出战：1 级镜像局双方续航特质互相抵消，单调不收敛；
  // 玩家占等级优势也让「升级 → 桥接快照数值」这条链路被真实对局验证。
  save.currencies.souls = 999999;
  for (const troopId of [6000, 6097, 6457]) {
    const leveled = levelUp(save, troopId, 10);
    if (!leveled.ok) throw new Error(leveled.message);
  }
  const plan = planQuestEncounter(KINGDOM, 1, playerSeed);
  const outcome = buildBattleRequest(save, plan);
  if (!outcome.ok) throw new Error(outcome.message);

  const { playerTeam, enemyTeam, idMap } = mapRequestToTeams(outcome.request);
  let gemId = 700000;
  const nextGemId = () => gemId++;
  const board = new BoardGenerator(new SeededRNG(playerSeed), nextGemId, 0.12).generate();
  const state = createGameState(board, playerTeam, enemyTeam);
  let unitId = 800000;
  const engine = new TurnEngine(
    state,
    new SeededRNG(outcome.request.seed),
    () => unitId++,
    outcome.registry,
  );
  // 引擎默认重填骷髅率为 0（由宿主设定，App 实战另行配置）：重填骷髅是
  // 骷髅伤害的长期来源，不设的话初始骷髅耗尽后战斗必然拖成平局。
  engine.skullChance = 0.18;
  const session = new BattleSession({ request: outcome.request, idMap, engine });

  const aiRng = new SeededRNG(424242);
  let guard = 0;
  while (!session.isFinished() && guard++ < 1500) {
    const snapshot = session.getState();
    if (snapshot.state !== MatchState.AwaitingInput) continue;
    const swap = skullFirstSwap(snapshot.board, aiRng);
    if (!swap) {
      session.passTurn();
      continue;
    }
    const events = session.resolve({ type: 'swap', from: swap.a, to: swap.b });
    if (events.length === 0) session.passTurn();
  }
  expect(session.isFinished()).toBe(true);

  const result = session.buildResult();
  const detail = applySettlement(save, result, {
    plan,
    enemyByExternalId: outcome.enemyByExternalId,
    todayStart: 1000,
  });

  // 结算口径与战斗结果一致
  expect(save.stats.battlesWon + save.stats.battlesLost).toBe(1);
  if (detail.victory) {
    expect(save.stats.battlesWon).toBe(1);
    expect(save.kingdoms[KINGDOM]?.questsDone).toBe(1);
    expect(save.currencies.gems).toBe(300); // 150 + 每日首胜 50 + 普通首通 100
    expect(save.currencies.souls).toBeGreaterThan(800);
  } else {
    expect(save.stats.battlesLost).toBe(1);
    expect(save.currencies.gems).toBe(150);
    expect(save.currencies.gold).toBe(2020); // 战败保底
  }

  return { digest: result.actionLogDigest, winner: result.winner };
}

describe('M2 整环（headless 真实对局）', () => {
  it('出敌 → 桥接 → 对局 → 结算：全程入账', () => {
    const outcome = runFullBattle(SEED);
    expect(['player', 'enemy']).toContain(outcome.winner);
  });

  it('同 seed 完全复现：两场战斗 digest 与胜负一致', () => {
    const a = runFullBattle(SEED);
    const b = runFullBattle(SEED);
    expect(b).toEqual(a);
  });
});
