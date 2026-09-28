import { PARTICIPATION_XP } from './battleRewards';
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
import { TROOP_PROGRESSION } from '../../data/leveling';
import { getTroopById } from '../../data/troops';
import { SeededRNG } from '../../engine/rng';
import { BaseColor } from '../../engine/types';
import type { BattleResult } from '../../session/contract';
import type { KingdomState, MetaSave } from '../state/schema';
import type { CurrencyDelta } from '../types';
import type { MaterialDelta } from '../data/materials';
import { INGOT_KEYS, stoneColorKeyOf, stoneKey } from '../data/materials';
import {
  DEFEAT_CONSOLATION,
  DAILY_FIRST_WIN_GEMS,
  KINGDOM_FIRST_CLEAR_GEMS,
  EXPLORE_DROPS,
  killGoldReward,
  killSoulReward,
  QUEST_COMPLETE_GOLD_KEYS,
  VICTORY_BONUS,
  WIN_BONUS_XP,
  xpForEnemy,
  HERO_XP_PER_WIN,
  CLASS_XP_PER_WIN,
} from '../data/economy';
import { EXPLORE_MAX_TIER, HARD_NODE_COUNT, KINGDOM_ORDER, kingdomBaseLevel, kingdomQuestRewardTroop, QUESTS_PER_KINGDOM } from '../data/kingdoms';
import { earn, earnMaterials } from './wallet';
import { grantTroop } from './troopProgress';
import { activeTeam } from './teamRules';
import { addClassWin, addClassXp, addHeroXp } from './hero';
import { classByKingdom } from '../data/classes';
import { xpBonusPct } from './talents';
import type { EncounterEnemy, EncounterPlan } from './encounter';
import {
  ensureEventWeek, claimEventWeeklyGems,
  eventBattleProgress,
  eventMilestonesReached,
  eventPointsOf,
  raidBattleDamage,
  raidPointsFor,
  eventTokensFor,
  trialMultiplier,
  EVENT_TRIAL_POINTS_CAP,
  EVENT_STATE_KEYS,
} from './events';
import { EVENT_WEEKLY_RULES, WEEK_MS, type EventTypeId } from '../data/events';

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
  | 'kingdom-first-clear'
  | 'quest'
  | 'defeat'
  | 'event-points'
  | 'event-progress'
  | 'event-milestone'
  | 'explore-drop';

/** 结算屏的一行：label 直接可显示，deltas 是该行入账，note 是来源注释；
 *  mats 是该行的素材入账（素材批 2026-09-19，与 deltas 并列展示） */
export interface SettlementLine {
  key: SettlementLineKey;
  label: string;
  deltas: CurrencyDelta;
  note?: string;
  mats?: MaterialDelta;
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
  // 周实例不回拨；战斗重放不重复发放货币、成长、积分或首领进度。
  if (ctx.plan.source.kind === 'event') {
    const source = ctx.plan.source;
    const newestWeek = Math.max(0, ...Object.values(save.eventWeeks).map(w => w?.weekStart ?? 0));
    const expired = source.weekStart < newestWeek || ctx.todayStart >= source.weekStart + WEEK_MS;
    const week = expired ? undefined : ensureEventWeek(save, source.weekStart, source.typeId as EventTypeId);
    const key = `settled:${result.battleId}`;
    if (!week || week.eventData[key]) return {
      victory, lines: [{ key: 'event-progress', label: expired ? '上周活动已结束，本场周奖励已关闭' : '本场已结算', deltas: {} }],
      xpGained: 0, heroLevelsGained: 0, classLevelUp: null, classUnlocked: null,
      questProgress: null, troopRewards: [], firstWinClaimed: false,
    };
    week.eventData[key] = 1;
  }
  let xpGained = victory ? 0 : PARTICIPATION_XP;
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
    const maps = Math.floor(result.economy.maps ?? 0);
    if (maps > 0) {
      const mats = earnMaterials(save, { treasureMaps: maps });
      if ((mats.treasureMaps ?? 0) > 0) {
        lines.push({
          key: 'battle-collect',
          label: '藏宝图',
          deltas: {},
          mats,
          note: '本场战斗获得',
        });
      }
    }
  }

  let firstWinClaimed = false;
  if (victory && firstWinClaimable) {
    save.dailyFirstWinAt = ctx.todayStart;
    earnLine('first-win', '每日首胜', { gems: DAILY_FIRST_WIN_GEMS });
    firstWinClaimed = true;
  }

  // —— 每周活动（素材批）：积分/代币入账 + 各类型玩法推进 + 里程碑自动发放 ——
  if (ctx.plan.source.kind === 'event') {
    const source = ctx.plan.source;
    const typeId = source.typeId as EventTypeId;
    const week = ensureEventWeek(save, source.weekStart, typeId);
    // 首领突袭按伤害计分，胜败都算（血池首领通常要多场才能打空）
    const raidPoints = typeId === 'raidBoss'
      ? raidPointsFor(raidBattleDamage(save, ctx.plan, result), week.eventData[EVENT_STATE_KEYS.bossMax] ?? 0)
      : 0;
    if (victory || raidPoints > 0) {
      let points = typeId === 'raidBoss' ? raidPoints : eventPointsOf(ctx.plan);
      if (typeId === 'classTrials') {
        // 连胜试炼：连续胜利积分 ×1.3/×1.6/×2.0（封顶 ×2），败场清零
        const streak = (week.eventData[EVENT_STATE_KEYS.trialStreak] ?? 0) + 1;
        week.eventData[EVENT_STATE_KEYS.trialStreak] = streak;
        const ordeal = source.choice === 'ordeal' && result.combatants.some(c => c.side === 'player' && c.externalId.endsWith('-hero') && !c.defeated && c.hp > 0);
        points = Math.min(EVENT_TRIAL_POINTS_CAP, Math.round(points * trialMultiplier(streak) * (ordeal ? 1.25 : 1)));
      }
      week.points += points;
      if (victory) week.wins += 1;
      const tokensGain = Math.min(eventTokensFor(points), Math.max(0, EVENT_WEEKLY_RULES.tokenCap - week.tokensEarned));
      week.tokens += tokensGain;
      week.tokensEarned += tokensGain;
      lines.push({
        key: 'event-points',
        label: `活动积分 +${points}`,
        deltas: {},
        note: `累计 ${week.points} 分 · 活动代币 +${tokensGain}（本周商店可用）`,
      });
    } else if (typeId === 'classTrials') {
      week.eventData[EVENT_STATE_KEYS.trialStreak] = 0;
    }

    // 各类型玩法推进（入侵防线/首领血池/塔层/物资/连胜，胜败都推进）
    const progress = eventBattleProgress(save, ctx.plan, result, victory);
    for (const l of progress.lines) {
      lines.push({ key: 'event-progress', label: l.label, deltas: l.deltas, mats: l.mats, note: l.note });
    }

    // 里程碑：世界事件按物资，其余按积分
    const metric = typeId === 'worldEvent' ? (week.eventData[EVENT_STATE_KEYS.supplies] ?? 0) : week.points;
    for (const gain of eventMilestonesReached(typeId, metric, week.claimed)) {
      const m = gain.milestone;
      week.claimed.push(gain.index);
      const applied = earn(save, {
        gold: m.gold ?? 0, souls: m.souls ?? 0, goldKeys: m.goldKeys ?? 0, glory: m.glory ?? 0,
      });
      const mats = earnMaterials(save, m.mats ?? {});
      lines.push({
        key: 'event-milestone',
        label: `里程碑 · ${m.label}`,
        deltas: applied,
        mats,
        note: typeId === 'worldEvent' ? `${m.points} 物资达成` : `${m.points} 分达成`,
      });
    }
    for (const reward of claimEventWeeklyGems(save, source.weekStart, typeId)) {
      lines.push({ key: 'event-milestone', ...reward });
    }
  }

  // —— 探索掉落（素材批）：官方「王国战斗掉特质石」+ 公会任务给钢锭的合并口径 ——
  if (victory && ctx.plan.source.kind === 'explore') {
    const dropRng = new SeededRNG((result.seed ^ 0x51f00d) >>> 0);
    const mats: MaterialDelta = { ingots: {}, traitstones: {} };
    const baseLevel = kingdomBaseLevel(ctx.plan.kingdom);
    if (dropRng.next() < EXPLORE_DROPS.ingotChance) {
      const tierIdx = EXPLORE_DROPS.ingotTierByKingdomLevel.findIndex((cap) => baseLevel <= cap);
      const ingotKey = INGOT_KEYS[tierIdx === -1 ? INGOT_KEYS.length - 2 : tierIdx]!;
      mats.ingots![ingotKey] = (mats.ingots![ingotKey] ?? 0) + 1;
    }
    const lead = ctx.plan.enemies[0] ? getTroopById(ctx.plan.enemies[0].troopId) : null;
    if (lead && dropRng.next() < EXPLORE_DROPS.minorStoneChance) {
      const key = stoneKey('minor', stoneColorKeyOf(lead.manaColors[0] ?? BaseColor.Brown))!;
      mats.traitstones![key] = (mats.traitstones![key] ?? 0) + 1;
    }
    // Project economy: one useful stone per exploration, selected from next locked recipes.
    // All imported tiers/pairs are obtainable without introducing a paid-only material gate.
    const missing = Object.entries(save.collection).flatMap(([id, rec]) => {
      const slot = rec.traits.findIndex(unlocked => !unlocked);
      const recipe = TROOP_PROGRESSION[id]?.traits[slot];
      return Object.entries(recipe ?? {}).filter(([key, n]) => (save.materials.traitstones[key] ?? 0) < n).map(([key]) => key);
    });
    const useful = [...new Set(missing)];
    if (useful.length) {
      const key = useful[dropRng.nextInt(useful.length)]!;
      mats.traitstones![key] = (mats.traitstones![key] ?? 0) + 1;
    }
    const appliedMats = earnMaterials(save, mats);
    if (Object.keys(appliedMats).length > 0) {
      lines.push({
        key: 'explore-drop',
        label: '探索掉落',
        deltas: {},
        mats: appliedMats,
        note: `${ctx.plan.kingdom} 探索`,
      });
    }
  }

  // 探索可重复刷；仅实际首次胜利领取该档奖励，记录与钱包一起持久化。
  if (victory && ctx.plan.source.kind === 'explore' && KINGDOM_ORDER.includes(ctx.plan.kingdom)) {
    const tier = ctx.plan.source.tier;
    if (Number.isInteger(tier) && tier >= 1 && tier <= EXPLORE_MAX_TIER) {
      const entry = save.kingdoms[ctx.plan.kingdom] ?? newKingdomEntry();
      const cleared = entry.clearedExploreTiers ?? [];
      if (!cleared.includes(tier)) {
        save.kingdoms[ctx.plan.kingdom] = entry;
        entry.clearedExploreTiers = [...cleared, tier].sort((a, b) => a - b);
        const mode = tier <= HARD_NODE_COUNT ? 'hard' : 'veryHard';
        const node = mode === 'hard' ? tier : tier - HARD_NODE_COUNT;
        earnLine('kingdom-first-clear', '关卡首通', { gems: KINGDOM_FIRST_CLEAR_GEMS[mode] },
          `${ctx.plan.kingdom} · ${mode === 'hard' ? '困难' : '非常困难'} ${node} · 仅一次`);
      }
    }
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
      earnLine('kingdom-first-clear', '关卡首通', { gems: KINGDOM_FIRST_CLEAR_GEMS.normal },
        `${ctx.plan.kingdom} · 普通 ${node} · 仅一次`);
      // 金钥匙经济收口（M6）：任务链全通发钥匙（来源=进贡/任务/竞技场，去向=金宝箱），
      // 与旗帜解锁同刻——通关一个王国 = 解锁它的旗帜 + 领一把钥匙
      lines.push({
        key: 'quest',
        label: `任务推进 ${questProgress.from} → ${node}`,
        deltas: node === QUESTS_PER_KINGDOM ? { goldKeys: QUEST_COMPLETE_GOLD_KEYS } : {},
        note: `${ctx.plan.kingdom} 任务链${node === QUESTS_PER_KINGDOM ? '·全通奖励金钥匙' : ''}`,
      });
      if (node === QUESTS_PER_KINGDOM && QUEST_COMPLETE_GOLD_KEYS > 0) {
        earn(save, { goldKeys: QUEST_COMPLETE_GOLD_KEYS });
      }
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

  // 主角与职业成长（M5/v2）：胜利有额外经验加成，多级一次连升；
  // 冠军经验只在「主角编入队伍」的胜场里积累；职业试炼周（素材批）职业经验 ×2；
  // 天赋「勤学」类经验加成只作用主角经验
  if (victory) xpGained += HERO_XP_PER_WIN;
  const xpPct = xpBonusPct(save);
  if (xpPct > 0) xpGained = Math.round(xpGained * (1 + xpPct / 100));
  const heroXpResult = addHeroXp(save, xpGained);
  let classLevelUp: { classId: string; newLevel: number } | null = null;
  if (victory && save.hero.classId) {
    const team = activeTeam(save);
    if (team?.members.some((m) => m.kind === 'hero')) {
      const trialMult = ctx.plan.source.kind === 'event' && ctx.plan.source.typeId === 'classTrials'
        ? (ctx.plan.source.choice === 'ordeal' && result.combatants.some(c => c.side === 'player' && c.externalId.endsWith('-hero') && !c.defeated && c.hp > 0) ? 3 : 2) : 1;
      const r = addClassXp(save, save.hero.classId, CLASS_XP_PER_WIN * trialMult);
      if (r && r.levelsGained > 0) classLevelUp = { classId: save.hero.classId, newLevel: r.newLevel };
      addClassWin(save, save.hero.classId);
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
