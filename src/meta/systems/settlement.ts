/**
 * 战斗结算（M2）——BattleResult → 账本入账 + 任务推进 + 逐行明细。
 *
 * 结算行（key/label/deltas/note）与 ASSETS-NEEDED.md §4.8 的结算屏
 * 「逐行上账 + 来源注释」一一对应：未来 ResultScreen 直接渲染这些行，
 * 禁止屏层自算数字（钱的去向可解释是养成游戏的手感底线）。
 *
 * 口径（设计值见 data/economy.ts）：
 *  - 击杀奖励只在胜利时发放（战败只拿保底）；
 *  - 战斗内收集（BattleResult.economy，幽魂宝石等）单列一行并入账；
 *  - 每日首胜按「当日零点」判定，一天只领一次；
 *  - 任务只线性推进（打赢 questsDone+1 关才推进），4/8 关发王国部队奖励；
 *  - 经验一律累积，升级曲线 M5 落地（当前 hero.level 不动）。
 */
import { getTroopById } from '../../data/troops';
import type { BattleResult } from '../../session/contract';
import type { KingdomState, MetaSave } from '../state/schema';
import type { CurrencyDelta } from '../types';
import {
  DEFEAT_CONSOLATION,
  DAILY_FIRST_WIN_GEMS,
  killGoldReward,
  killSoulReward,
  VICTORY_BONUS,
  WIN_BONUS_XP,
  xpForEnemy,
} from '../data/economy';
import { kingdomQuestRewardTroop, QUESTS_PER_KINGDOM } from '../data/kingdoms';
import { earn } from './wallet';
import { grantTroop } from './troopProgress';
import type { EncounterEnemy, EncounterPlan } from './encounter';

export interface SettlementContext {
  plan: EncounterPlan;
  /** externalId → 出敌条目（buildBattleRequest 产物原样传入） */
  enemyByExternalId: Map<string, EncounterEnemy>;
  /** 本地时区「今日零点」epoch ms；调用方算好传入，逻辑层不自取时钟（可测） */
  todayStart: number;
}

export type SettlementLineKey =
  | 'kills'
  | 'victory'
  | 'battle-collect'
  | 'first-win'
  | 'quest'
  | 'defeat';

/** 结算屏的一行：label 直接可显示，deltas 是该行入账，note 是来源注释 */
export interface SettlementLine {
  key: SettlementLineKey;
  label: string;
  deltas: CurrencyDelta;
  note?: string;
}

export interface SettlementDetail {
  victory: boolean;
  lines: SettlementLine[];
  xpGained: number;
  questProgress: { from: number; to: number } | null;
  troopRewards: { troopId: number; note: string }[];
  firstWinClaimed: boolean;
}

function newKingdomEntry(): KingdomState {
  return { level: 1, questsDone: 0, exploreTier: 0, lastTributeAt: 0 };
}

export function applySettlement(
  save: MetaSave,
  result: BattleResult,
  ctx: SettlementContext,
): SettlementDetail {
  const lines: SettlementLine[] = [];
  const victory = result.winner === 'player';
  let xpGained = 0;
  let goldEarned = 0;
  let soulsEarned = 0;

  const earnLine = (key: SettlementLineKey, label: string, deltas: CurrencyDelta, note?: string) => {
    const applied = earn(save, deltas);
    if (Object.keys(applied).length === 0) return;
    lines.push({ key, label, deltas: applied, note });
    goldEarned += applied.gold ?? 0;
    soulsEarned += applied.souls ?? 0;
  };

  if (victory) {
    let souls = 0;
    let gold = 0;
    let kills = 0;
    for (const externalId of result.defeatedExternalIds) {
      const enemy = ctx.enemyByExternalId.get(externalId);
      if (!enemy) continue; // 幽灵击杀（召唤物等不属于出敌计划）不记账
      const troop = getTroopById(enemy.troopId);
      if (!troop) continue;
      souls += killSoulReward(troop.rarityIdx, enemy.level);
      gold += killGoldReward(troop.rarityIdx, enemy.level);
      xpGained += xpForEnemy(troop.rarityIdx, enemy.level);
      kills += 1;
    }
    earnLine('kills', `击杀 ×${kills}`, { souls, gold });
    earnLine('victory', '胜利奖励', { ...VICTORY_BONUS });
    xpGained += WIN_BONUS_XP;
  } else {
    earnLine('defeat', '战败保底', { ...DEFEAT_CONSOLATION });
  }

  if (result.economy) {
    earnLine('battle-collect', '战斗内收集', {
      gold: result.economy.gold,
      souls: result.economy.souls,
      gems: result.economy.gems,
    }, '幽魂宝石 / 战斗内经济');
  }

  let firstWinClaimed = false;
  if (victory && save.dailyFirstWinAt < ctx.todayStart) {
    save.dailyFirstWinAt = ctx.todayStart;
    earnLine('first-win', '每日首胜', { gems: DAILY_FIRST_WIN_GEMS });
    firstWinClaimed = true;
  }

  let questProgress: { from: number; to: number } | null = null;
  const troopRewards: { troopId: number; note: string }[] = [];
  if (victory && ctx.plan.source.kind === 'quest') {
    const node = ctx.plan.source.node;
    const done = save.kingdoms[ctx.plan.kingdom]?.questsDone ?? 0;
    if (node === done + 1 && node <= QUESTS_PER_KINGDOM) {
      // 只有真正推进时才落王国条目（缺条目 = 尚未在该王国出过任务胜场）
      const entry = save.kingdoms[ctx.plan.kingdom] ?? newKingdomEntry();
      save.kingdoms[ctx.plan.kingdom] = entry;
      questProgress = { from: done, to: node };
      entry.questsDone = node;
      lines.push({
        key: 'quest',
        label: `任务推进 ${questProgress.from} → ${node}`,
        deltas: {},
        note: `${ctx.plan.kingdom} 任务链`,
      });
      if (node === 4 || node === 8) {
        const rewardId = kingdomQuestRewardTroop(ctx.plan.kingdom, node);
        if (rewardId !== null && getTroopById(rewardId)) {
          grantTroop(save, rewardId, 1);
          troopRewards.push({ troopId: rewardId, note: `${ctx.plan.kingdom} 任务 ${node}/8 首通` });
        }
      }
    }
  }

  save.hero.xp += xpGained; // M5 前只累积不升级（曲线未定）
  if (victory) save.stats.battlesWon += 1;
  else save.stats.battlesLost += 1;
  save.stats.goldEarned += goldEarned;
  save.stats.soulsEarned += soulsEarned;

  return { victory, lines, xpGained, questProgress, troopRewards, firstWinClaimed };
}
