import { describe, it, expect } from 'vitest';
import type { BattleResult } from '../../src/session/contract';
import { getTroopById } from '../../src/data/troops';
import {
  applySettlement,
  getRecord,
  killGoldReward,
  killSoulReward,
  newSave,
  planExploreEncounter,
  planQuestEncounter,
  WIN_BONUS_XP,
  xpForEnemy,
} from '../../src/meta';
import type { EncounterPlan } from '../../src/meta';

const KINGDOM = '破碎尖塔';
const DAY1 = 1726500000000;

/** 极小合成 BattleResult：结算只消费 winner / defeatedExternalIds / economy */
function mkResult(
  winner: 'player' | 'enemy',
  defeatedExternalIds: string[] = [],
  economy?: { gold: number; souls: number; gems: number },
): BattleResult {
  return {
    schemaVersion: 1,
    battleId: 'b',
    requestId: 'r',
    rulesetVersion: '1.0.0',
    seed: 1,
    winner,
    turns: 3,
    combatants: [],
    defeatedExternalIds,
    summonedCount: 0,
    actionLogDigest: '00000000',
    eventSummary: [],
    ...(economy ? { economy } : {}),
  };
}

/** 与 battleBridge 相同的 externalId 约定：e{index}-{troopId} */
function mapOf(plan: EncounterPlan) {
  return new Map(plan.enemies.map((enemy, index) => [`e${index}-${enemy.troopId}`, enemy]));
}

/** 合成结果的击杀 externalId 列表（全歼） */
function allDefeated(plan: EncounterPlan) {
  return plan.enemies.map((enemy, index) => `e${index}-${enemy.troopId}`);
}

function rarityIdxOf(troopId: number): number {
  return getTroopById(troopId)?.rarityIdx ?? 0;
}

/** 按出敌计划逐个查表算击杀奖励期望值（不含胜利加成） */
function expectedKills(plan: EncounterPlan) {
  let souls = 0;
  let gold = 0;
  let xp = 0;
  for (const enemy of plan.enemies) {
    souls += killSoulReward(rarityIdxOf(enemy.troopId), enemy.level);
    gold += killGoldReward(rarityIdxOf(enemy.troopId), enemy.level);
    xp += xpForEnemy(rarityIdxOf(enemy.troopId), enemy.level);
  }
  return { souls, gold, xp };
}

describe('结算入账（胜利 · 任务）', () => {
  it('打赢任务 1 关：击杀行+胜利行+首胜行+任务推进，账目与 stats 对得上', () => {
    const save = newSave({ now: 0, starterTroopIds: [6000, 6097, 6457] });
    const plan = planQuestEncounter(KINGDOM, 1, 5);
    const detail = applySettlement(save, mkResult('player', allDefeated(plan)), {
      plan,
      enemyByExternalId: mapOf(plan),
      todayStart: DAY1,
    });

    const kills = expectedKills(plan);
    expect(detail.victory).toBe(true);
    expect(detail.firstWinClaimed).toBe(true);
    expect(detail.questProgress).toEqual({ from: 0, to: 1 });
    expect(detail.lines.map((l) => l.key)).toEqual(['kills', 'victory', 'first-win', 'quest']);

    // 账本：击杀 + 胜利 60/30 + 首胜宝石 50
    expect(save.currencies.gold).toBe(2000 + kills.gold + 60);
    expect(save.currencies.souls).toBe(800 + kills.souls + 30);
    expect(save.currencies.gems).toBe(150 + 50);
    expect(save.dailyFirstWinAt).toBe(DAY1);

    // stats 与 xp
    expect(save.stats.battlesWon).toBe(1);
    expect(save.stats.goldEarned).toBe(kills.gold + 60);
    expect(save.stats.soulsEarned).toBe(kills.souls + 30);
    expect(detail.xpGained).toBe(kills.xp + WIN_BONUS_XP);
    expect(save.hero.xp).toBe(kills.xp + WIN_BONUS_XP);
    expect(save.hero.level).toBe(1); // M5 前只累积不升级
    expect(save.kingdoms[KINGDOM]?.questsDone).toBe(1);
  });

  it('同日第二场不再发首胜；任务推进到 2/8', () => {
    const save = newSave({ now: 0, starterTroopIds: [6000, 6097, 6457] });
    const ctx1 = { plan: planQuestEncounter(KINGDOM, 1, 5), todayStart: DAY1 };
    applySettlement(save, mkResult('player', allDefeated(ctx1.plan)), {
      ...ctx1,
      enemyByExternalId: mapOf(ctx1.plan),
    });
    const plan2 = planQuestEncounter(KINGDOM, 2, 6);
    const detail2 = applySettlement(save, mkResult('player', allDefeated(plan2)), {
      plan: plan2,
      enemyByExternalId: mapOf(plan2),
      todayStart: DAY1,
    });
    expect(detail2.firstWinClaimed).toBe(false);
    expect(detail2.lines.map((l) => l.key)).not.toContain('first-win');
    expect(save.currencies.gems).toBe(200); // 只领过一次
    expect(detail2.questProgress).toEqual({ from: 1, to: 2 });
  });

  it('打赢任务 4 关：发王国部队奖励（入册，copies 0）', () => {
    const save = newSave({ now: 0, starterTroopIds: [6000, 6097, 6457] });
    save.kingdoms[KINGDOM] = { level: 1, questsDone: 3, exploreTier: 0, lastTributeAt: 0 };
    const plan = planQuestEncounter(KINGDOM, 4, 8);
    const detail = applySettlement(save, mkResult('player', allDefeated(plan)), {
      plan,
      enemyByExternalId: mapOf(plan),
      todayStart: DAY1,
    });
    expect(detail.questProgress).toEqual({ from: 3, to: 4 });
    expect(detail.troopRewards).toHaveLength(1);
    const reward = getRecord(save, detail.troopRewards[0]!.troopId);
    expect(reward).toBeTruthy();
    expect(save.kingdoms[KINGDOM]?.questsDone).toBe(4);
  });

  it('越序打赢（不是下一关）不推进任务', () => {
    const save = newSave({ now: 0, starterTroopIds: [6000, 6097, 6457] });
    const plan = planQuestEncounter(KINGDOM, 2, 5);
    const detail = applySettlement(save, mkResult('player', allDefeated(plan)), {
      plan,
      enemyByExternalId: mapOf(plan),
      todayStart: DAY1,
    });
    expect(detail.questProgress).toBeNull();
    expect(save.kingdoms[KINGDOM]).toBeUndefined();
  });

  it('战斗内收集（economy）单列一行并入账', () => {
    const save = newSave({ now: 0, starterTroopIds: [6000, 6097, 6457] });
    const plan = planQuestEncounter(KINGDOM, 1, 5);
    const detail = applySettlement(
      save,
      mkResult('player', [], { gold: 60, souls: 85, gems: 5 }),
      { plan, enemyByExternalId: mapOf(plan), todayStart: DAY1 },
    );
    expect(detail.lines.map((l) => l.key)).toContain('battle-collect');
    expect(save.currencies.gold).toBe(2000 + 60 + 60); // 收集 60 + 胜利 60（无击杀行）
    expect(save.currencies.souls).toBe(800 + 85 + 30);
    expect(save.currencies.gems).toBe(150 + 5 + 50);
  });

  it('幽灵击杀（不在出敌计划里）不记账', () => {
    const save = newSave({ now: 0, starterTroopIds: [6000, 6097, 6457] });
    const plan = planQuestEncounter(KINGDOM, 1, 5);
    const detail = applySettlement(save, mkResult('player', ['e9-99999']), {
      plan,
      enemyByExternalId: mapOf(plan),
      todayStart: DAY1,
    });
    expect(detail.lines.map((l) => l.key)).not.toContain('kills');
  });
});

describe('结算入账（探索首胜双倍）', () => {
  it('当日首场探索胜利：击杀奖励双倍并标注；首胜宝石照领', () => {
    const save = newSave({ now: 0, starterTroopIds: [6000, 6097, 6457] });
    const plan = planExploreEncounter(KINGDOM, 1, 21);
    const detail = applySettlement(save, mkResult('player', allDefeated(plan)), {
      plan,
      enemyByExternalId: mapOf(plan),
      todayStart: DAY1,
    });
    const kills = expectedKills(plan);
    const line = detail.lines.find((l) => l.key === 'kills')!;
    expect(line.deltas.souls).toBe(kills.souls * 2);
    expect(line.deltas.gold).toBe(kills.gold * 2);
    expect(line.note).toBe('每日首胜双倍');
    expect(detail.firstWinClaimed).toBe(true);
    expect(save.currencies.gems).toBe(200);
  });

  it('当日已领过首胜：探索击杀不双倍', () => {
    const save = newSave({ now: 0, starterTroopIds: [6000, 6097, 6457] });
    save.dailyFirstWinAt = DAY1;
    const plan = planExploreEncounter(KINGDOM, 1, 21);
    const detail = applySettlement(save, mkResult('player', allDefeated(plan)), {
      plan,
      enemyByExternalId: mapOf(plan),
      todayStart: DAY1,
    });
    const kills = expectedKills(plan);
    const line = detail.lines.find((l) => l.key === 'kills')!;
    expect(line.deltas.souls).toBe(kills.souls);
    expect(line.note).toBeUndefined();
    expect(detail.firstWinClaimed).toBe(false);
  });
});

describe('结算入账（战败）', () => {
  it('战败只拿保底：不推进任务、不领首胜、stats 记败场', () => {    const save = newSave({ now: 0, starterTroopIds: [6000, 6097, 6457] });
    const plan = planQuestEncounter(KINGDOM, 1, 5);
    const detail = applySettlement(save, mkResult('enemy'), {
      plan,
      enemyByExternalId: mapOf(plan),
      todayStart: DAY1,
    });
    expect(detail.victory).toBe(false);
    expect(detail.lines.map((l) => l.key)).toEqual(['defeat']);
    expect(save.currencies.gold).toBe(2020);
    expect(save.currencies.souls).toBe(810);
    expect(save.currencies.gems).toBe(150);
    expect(save.dailyFirstWinAt).toBe(0);
    expect(save.stats.battlesLost).toBe(1);
    expect(save.hero.xp).toBe(0);
    expect(save.kingdoms[KINGDOM]).toBeUndefined();
  });
});
