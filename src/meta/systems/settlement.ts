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
 *  - 任务只线性推进（打赢 questsDone+1 关才推进），4/8 关发王国部队奖励，8 关解锁职业；
 *  - 主角/职业经验在胜利时结算（M5）：多级一次连升，职业经验只在主角编队时积累。
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
  HERO_XP_PER_WIN,
  CLASS_XP_PER_WIN,
} from '../data/economy';
import { kingdomQuestRewardTroop, QUESTS_PER_KINGDOM } from '../data/kingdoms';
import { earn } from './wallet';
import { grantTroop } from './troopProgress';
import { activeTeam } from './teamRules';
import { addClassXp, addHeroXp } from './hero';
import { classByKingdom } from '../data/hero';
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
  /** 主角本次升级数（M5：经验会真正升级，解锁王国门槛） */
  heroLevelsGained: number;
  /** 主角编队且有职业时的职业升级 */
  classLevelUp: { classId: string; newLevel: number } | null;
  /** 任务链全通解锁的职业 */
  classUnlocked: string | null;
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

  const firstWinClaimable = save.dailyFirstWinAt < ctx.todayStart;

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
    // 探索模式的每日首胜：当日首场探索胜利的击杀奖励双倍（计划 §4.5）
    const exploreFirstWin = ctx.plan.source.kind === 'explore' && firstWinClaimable;
    const mult = exploreFirstWin ? 2 : 1;
    earnLine(
      'kills',
      `击杀 ×${kills}`,
      { souls: souls * mult, gold: gold * mult },
      exploreFirstWin && kills > 0 ? '每日首胜双倍' : undefined,
    );
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
  if (victory && firstWinClaimable) {
    save.dailyFirstWinAt = ctx.todayStart;
    earnLine('first-win', '每日首胜', { gems: DAILY_FIRST_WIN_GEMS });
    firstWinClaimed = true;
  }

  let questProgress: { from: number; to: number } | null = null;
  let classUnlocked: string | null = null;
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
      if (node === QUESTS_PER_KINGDOM) {
        // 全链通关 → 解锁该王国绑定职业（M5）
        const cls = classByKingdom(ctx.plan.kingdom);
        if (cls && !save.hero.unlockedClasses.includes(cls.id)) {
          save.hero.unlockedClasses.push(cls.id);
          classUnlocked = cls.id;
        }
      }
    }
  }

  // 主角与职业成长（M5）：胜利有额外经验加成，多级一次连升；
  // 职业经验只在「主角编入队伍」的胜场里积累
  if (victory) xpGained += HERO_XP_PER_WIN;
  const heroXpResult = addHeroXp(save, xpGained);
  let classLevelUp: { classId: string; newLevel: number } | null = null;
  if (victory && save.hero.classId) {
    const team = activeTeam(save);
    if (team?.members.some((m) => m.kind === 'hero')) {
      const r = addClassXp(save, save.hero.classId, CLASS_XP_PER_WIN);
      if (r && r.levelsGained > 0) classLevelUp = { classId: save.hero.classId, newLevel: r.newLevel };
    }
  }

  if (victory) save.stats.battlesWon += 1;
  else save.stats.battlesLost += 1;
  save.stats.goldEarned += goldEarned;
  save.stats.soulsEarned += soulsEarned;

  return {
    victory,
    lines,
    xpGained,
    heroLevelsGained: heroXpResult.levelsGained,
    classLevelUp,
    classUnlocked,
    questProgress,
    troopRewards,
    firstWinClaimed,
  };
}
