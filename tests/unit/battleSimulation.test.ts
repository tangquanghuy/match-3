/**
 * 棋盘手感 AI 对 AI 模拟（连消倾向调参的依据与回归护栏）。
 *
 * 场景：meta 任务关出敌队伍互打（真实兵种/技能/特质，王国与关卡随 seed 轮转），双方都用
 * aiPolicy 新优先级；AI 与引擎共用一条种子化 RNG（与 App 一致）。固定 seed → 统计逐次一致。
 *
 * 三行对照：
 *   - 旧 AI · 无倾向   = 改动前的实战口径（敌方只会交换，不施法）；
 *   - 新 AI · 无倾向   = 连消倾向的基线；
 *   - 新 AI · 实战倾向 = App 实战配置（BATTLE_COMBO_BIAS / BATTLE_SETUP_BIAS）。
 *
 * 调参目标与取舍（详见 comboBias.ts）：回合开头有 4+ 交换 ≥ 45%、额外回合占行动 25–40%、
 * 交换带来的 ≥5 连续额外回合对局 < 3%、每场行动数明显少于基线。AI 一见 4+ 就打，额外回合
 * 占比 ≈ 全部决策点的 4+ 机会占比 + 连锁，因此「全部决策点 ≥45%」与「额外回合 ≤40%」
 * 无法同时满足；取舍为：机会集中在回合开头（满额倾向），额外回合中的决策点由连段护栏压低。
 * 下面的断言是留有余量的回归护栏，不是精确目标。
 */
import { describe, expect, it } from 'vitest';
import { simulate, simSeeds } from '../helpers/battleSimulation';
import type { SimStats } from '../helpers/battleSimulation';
import { BATTLE_COMBO_BIAS, BATTLE_SETUP_BIAS } from '@engine/comboBias';

const SEEDS = simSeeds(40);

function row(s: SimStats): Record<string, string | number> {
  return {
    '4+可换(全部)': s.bigSwapShare,
    '4+可换(回合首)': s.bigSwapShareTurnStart,
    '4+可换(额外回合中)': s.bigSwapShareInStreak,
    '4连/百次': s.match4Per100,
    '5连/百次': s.match5Per100,
    'L·T/百次': s.matchLTPer100,
    '额外回合占比': s.extraTurnShare,
    '平均连锁深度': s.meanCascadeDepth,
    '最长连段p95': s.streakP95,
    '最长连段max': s.streakMax,
    '≥5连段对局': s.streak5BattleShare,
    '≥5连段(仅交换)': s.swapStreak5BattleShare,
    '骷髅占比': s.skullBoardShare,
    '每场行动数': s.actionsPerBattle,
    '每场施法(左/右)': `${s.castsPerBattle.left}/${s.castsPerBattle.right}`,
  };
}

describe('AI 对 AI 棋盘手感模拟', () => {
  it('实战连消倾向：4+ 机会与额外回合在目标区间内，对局明显变短', () => {
    const legacy = simulate({ label: '旧 AI · 无倾向', scenario: 'meta', policy: 'legacy', comboBias: 0, setupBias: 0 }, SEEDS);
    const base = simulate({ label: '新 AI · 无倾向', scenario: 'meta', policy: 'priority', comboBias: 0, setupBias: 0 }, SEEDS);
    const tuned = simulate({
      label: '新 AI · 实战倾向', scenario: 'meta', policy: 'priority',
      comboBias: BATTLE_COMBO_BIAS, setupBias: BATTLE_SETUP_BIAS,
    }, SEEDS);
    console.table(Object.fromEntries([legacy, base, tuned].map((s) => [s.label, row(s)])));

    for (const s of [legacy, base, tuned]) expect(s.unfinished).toBeLessThanOrEqual(1);
    // 新 AI 会施法（旧 AI 从不施法）
    expect(legacy.castsPerBattle.right).toBe(0);
    expect(tuned.castsPerBattle.right).toBeGreaterThan(1);
    // 连消倾向：回合开头的 4+ 机会明显变多，额外回合落在区间内
    expect(tuned.bigSwapShareTurnStart).toBeGreaterThanOrEqual(0.45);
    expect(tuned.bigSwapShare).toBeGreaterThan(base.bigSwapShare * 1.5);
    expect(tuned.match4Per100 + tuned.match5Per100).toBeGreaterThan(1.5 * (base.match4Per100 + base.match5Per100));
    expect(tuned.extraTurnShare).toBeGreaterThanOrEqual(0.25);
    expect(tuned.extraTurnShare).toBeLessThanOrEqual(0.42);
    // 连段护栏：额外回合中的 4+ 机会低于回合开头，交换带来的长连段罕见
    expect(tuned.bigSwapShareInStreak).toBeLessThan(tuned.bigSwapShareTurnStart);
    expect(tuned.swapStreak5BattleShare).toBeLessThanOrEqual(0.05);
    expect(tuned.meanCascadeDepth).toBeGreaterThan(base.meanCascadeDepth);
    // 节奏：每场行动数明显少于基线；骷髅占比基本不变
    expect(tuned.actionsPerBattle).toBeLessThan(base.actionsPerBattle * 0.85);
    expect(tuned.actionsPerBattle).toBeLessThan(legacy.actionsPerBattle * 0.75);
    expect(Math.abs(tuned.skullBoardShare - base.skullBoardShare)).toBeLessThan(0.03);
  }, 60_000);

  it('同一组 seed 两次模拟结果完全一致（确定性）', () => {
    const cfg = { label: 'det', scenario: 'meta' as const, policy: 'priority' as const, comboBias: BATTLE_COMBO_BIAS, setupBias: BATTLE_SETUP_BIAS };
    expect(simulate(cfg, simSeeds(3, 99))).toEqual(simulate(cfg, simSeeds(3, 99)));
  }, 30_000);
});
