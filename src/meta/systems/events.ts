/**
 * 每周活动（素材批 2026-09-19；玩法差异化批同日追补）——官方 Live Event 六类型的单机适配。
 *
 * 结构对齐官方（考据与设计值见 design/EVENTS-INVASION-DESIGN.md §1.2/§2.4）：
 *  - 六活动常驻开放、各自持有周实例，周一 0:00 同步重置；
 *  - 战斗胜利得积分/代币 → 里程碑自动入账；商店按活动类型供货架；
 *  - **六种活动各自独立的玩法机制**（本文件是唯一实现处）：
 *      invasion      防线波次：3 条防线逐条推进，破全线=守土成功（额外赏），败则打回第 1 条；
 *      raidBoss      首领血池：血池跨战斗持久（胜/败都计伤害），见底=讨伐成功并刷新更强首领；
 *      towerOfDoom   爬塔 run：一层一战、层数越高越强，队伍 HP/阵亡跨层冻结延续，
 *                    减员继续、全灭或败北即结束，按到达层数结算符卷/荣耀；
 *      factionAssault 阵营克制：编入目标王国的部队每 1 名全队攻击+2/生命+10（可叠加）；
 *      worldEvent    收集玩法：胜场掉「事件物资」（加成种族每 1 名 +2），里程碑按物资结算；
 *      classTrials   连胜试炼：连续胜利积分 ×1.3/×1.6/×2.0，败场清零；主角强制编入、职业经验 ×2。
 *
 * 与竞技场的对照（对齐官方 Arena vs Live Event 分工）：活动吃养成
 * （主角/旗帜/王国加成全生效——走 buildBattleRequest），draft 不吃。
 */
import { SeededRNG } from '../../engine/rng';
import type { EventWeekState, MetaSave } from '../state/schema';
import { getTroopById } from '../../data/troops';
import { troopStatsAtLevel } from '../../data/leveling';
import type { EventGoods, EventMilestone, EventTheme, EventTypeId } from '../data/events';
import {
  EVENT_MILESTONES,
  EVENT_SHOP,
  EVENT_TOKEN_DIVISOR,
  EVENT_TOKEN_MIN_PER_WIN,
  EVENT_WEEKLY_PLAY_REWARD_CAP,
  eventThemeOf,
} from '../data/events';
import { kingdomBaseLevel, kingdomTroopPool, KINGDOM_ORDER } from '../data/kingdoms';
import { fail, type CurrencyDelta, type MetaFailure } from '../types';
import type { MaterialDelta } from '../data/materials';
import { earn, earnMaterials } from './wallet';
import { activeTeam } from './teamRules';
import type { BridgeOutcome } from './battleBridge';
import type { EncounterPlan, EnemyTier } from './encounter';
import { pickEnemies } from './encounter';
import { fnv1a32 } from '../data/hash';
import type { BattleResult } from '../../session/contract';

/** 单场积分上限（设计值，防无脑刷；对齐官方活动「单场得分封顶」的手感） */
export const EVENT_POINTS_CAP = 120;
/** 职业试炼连胜加成的积分封顶（×2 后的硬上限） */
export const EVENT_TRIAL_POINTS_CAP = EVENT_POINTS_CAP * 2;

/** eventData 键约定（schema.eventData 的唯一写入口都在本文件） */
export const EVENT_STATE_KEYS = {
  invLine: 'invLine', // 入侵：当前防线 1..3
  invRepelled: 'invRepelled', // 入侵：本周守土成功次数
  bossTier: 'bossTier', // 突袭：当前首领阶层（1 起）
  bossHp: 'bossHp', // 突袭：当前血池剩余
  bossMax: 'bossMax', // 突袭：当前血池上限
  bossesSlain: 'bossesSlain', // 突袭：本周讨伐数
  floor: 'floor', // 塔：当前层
  floorBest: 'floorBest', // 塔：本周最高层
  runActive: 'runActive', // 塔：run 进行中 1/0
  supplies: 'supplies', // 世界事件：累计物资
  trialStreak: 'trialStreak', // 职业试炼：当前连胜
  assaultWins: 'assaultWins', // 阵营突袭：本周进攻胜场
} as const;

/** 确保指定活动的本周实例存在（lazy 建档/周切重置，六活动互不借用进度）。 */
export function ensureEventWeek(save: MetaSave, weekStart: number, typeId: EventTypeId): EventWeekState {
  if (!save.eventWeeks[typeId] || save.eventWeeks[typeId].weekStart !== weekStart) {
    save.eventWeeks[typeId] = {
      weekStart, points: 0, claimed: [], wins: 0, tokens: 0, tokensEarned: 0,
      playRewards: 0, bought: {}, eventData: {}, runTeam: null,
    };
  }
  const week = save.eventWeeks[typeId]!;
  if (typeof week.tokens !== 'number') week.tokens = 0;
  if (typeof week.tokensEarned !== 'number') week.tokensEarned = week.tokens;
  if (typeof week.playRewards !== 'number') week.playRewards = 0;
  if (!week.bought) week.bought = {};
  if (!week.eventData) week.eventData = {};
  if (week.runTeam === undefined) week.runTeam = null;
  return week;
}

/** 指定活动的本周主题（存档无关的纯读）。 */
export function currentEventTheme(weekStart: number, typeId: EventTypeId): EventTheme {
  return eventThemeOf(typeId, weekStart);
}

// ---------------------------------------------------------------------------
// 出敌（按活动类型各自的规则）
// ---------------------------------------------------------------------------

const RAID_POOL_BATTLES = 8; // 血池 ≈ 8 场满伤害（设计值）
const RAID_POOL_GROWTH = 1.15; // 每阶层血池成长
const TOWER_LEVEL_CAP = 19; // 楼层等级成长封顶（+19）

/** 活动各类型敌人的层级表（防线/楼层/首领各有专属编排） */
function eventTierPlan(typeId: EventTypeId, arg: { line: number; floor: number }): EnemyTier[] {
  switch (typeId) {
    case 'invasion':
      if (arg.line === 1) return ['minion', 'minion', 'minion'];
      if (arg.line === 2) return ['elite', 'minion', 'minion'];
      return ['elite', 'elite', 'boss'];
    case 'towerOfDoom':
      if (arg.floor % 5 === 0) return ['elite', 'elite', 'boss'];
      if (arg.floor <= 2) return ['minion', 'minion'];
      return ['elite', 'minion', 'minion'];
    case 'raidBoss':
      return ['boss', 'elite', 'elite'];
    case 'factionAssault':
      return ['elite', 'minion', 'minion'];
    case 'worldEvent':
      return ['minion', 'minion', 'elite'];
    case 'classTrials':
      return ['elite', 'minion', 'boss'];
  }
}

/** 活动战斗出敌计划：难度与编排按各类型玩法状态推进。seed 由网关注入（熵源） */
export function planEventEncounter(save: MetaSave, weekStart: number, seed: number, typeId: EventTypeId): EncounterPlan {
  const theme = currentEventTheme(weekStart, typeId);
  const rng = new SeededRNG(seed);
  const week = ensureEventWeek(save, weekStart, typeId);
  const randomKingdom = (): string => KINGDOM_ORDER[rng.nextInt(KINGDOM_ORDER.length)]!;

  let kingdom: string;
  let level: number;
  let tiers: readonly EnemyTier[];
  switch (typeId) {
    case 'invasion': {
      // 防线波次：第 N 条防线等级 +3(N-1)，越推越硬
      const line = Math.min(Math.max(week.eventData[EVENT_STATE_KEYS.invLine] ?? 1, 1), 3);
      kingdom = theme.kingdom!;
      level = kingdomBaseLevel(kingdom) + (line - 1) * 3;
      tiers = eventTierPlan(typeId, { line, floor: 0 });
      break;
    }
    case 'raidBoss': {
      // 首领血池：无首领（首次/已讨伐）则按阶层生成新血池
      const tier = Math.max(week.eventData[EVENT_STATE_KEYS.bossTier] ?? 1, 1);
      kingdom = randomKingdom();
      level = kingdomBaseLevel(kingdom) + 8 + (tier - 1) * 3;
      tiers = eventTierPlan(typeId, { line: 0, floor: 0 });
      const enemies = pickEnemies(kingdom, level, tiers, rng);
      if ((week.eventData[EVENT_STATE_KEYS.bossHp] ?? 0) <= 0) {
        const teamMax = enemies.reduce((sum, e) => {
          const troop = getTroopById(e.troopId);
          return sum + (troop ? troopStatsAtLevel(troop, e.level).health : 0);
        }, 0);
        week.eventData[EVENT_STATE_KEYS.bossTier] = tier;
        week.eventData[EVENT_STATE_KEYS.bossMax] = Math.round(teamMax * RAID_POOL_BATTLES * Math.pow(RAID_POOL_GROWTH, tier - 1));
        week.eventData[EVENT_STATE_KEYS.bossHp] = week.eventData[EVENT_STATE_KEYS.bossMax]!;
      }
      return {
        kingdom,
        source: { kind: 'event', weekStart, typeId },
        seed: seed >>> 0,
        enemies,
      };
    }
    case 'towerOfDoom': {
      // 爬塔 run：未开跑则从第 1 层开爬（状态冻结随战斗结算写入）
      if ((week.eventData[EVENT_STATE_KEYS.runActive] ?? 0) !== 1) {
        week.eventData[EVENT_STATE_KEYS.runActive] = 1;
        week.eventData[EVENT_STATE_KEYS.floor] = 1;
        week.runTeam = null;
      }
      const floor = Math.max(week.eventData[EVENT_STATE_KEYS.floor] ?? 1, 1);
      kingdom = KINGDOM_ORDER[(fnv1a32(`tower-${weekStart >>> 0}`) + (floor - 1) * 7) % KINGDOM_ORDER.length]!;
      level = kingdomBaseLevel(kingdom) + Math.min(floor - 1, TOWER_LEVEL_CAP);
      tiers = eventTierPlan(typeId, { line: 0, floor });
      break;
    }
    case 'factionAssault':
      kingdom = theme.kingdom!;
      level = kingdomBaseLevel(kingdom) + 3;
      tiers = eventTierPlan(typeId, { line: 0, floor: 0 });
      break;
    case 'worldEvent':
      kingdom = randomKingdom();
      level = kingdomBaseLevel(kingdom);
      tiers = eventTierPlan(typeId, { line: 0, floor: 0 });
      break;
    case 'classTrials':
      kingdom = randomKingdom();
      level = kingdomBaseLevel(kingdom) + 2;
      tiers = eventTierPlan(typeId, { line: 0, floor: 0 });
      break;
  }
  if (kingdomTroopPool(kingdom).length === 0) kingdom = KINGDOM_ORDER[0]!;
  return {
    kingdom,
    source: { kind: 'event', weekStart, typeId },
    seed: seed >>> 0,
    enemies: pickEnemies(kingdom, level, tiers, rng),
  };
}

/** 职业试炼要求主角编入出战队（屏层提前提示；计划层硬校验） */
export function eventBattleReady(save: MetaSave, typeId: EventTypeId, hasHeroInTeam: boolean): string | null {
  if (typeId === 'classTrials' && !hasHeroInTeam) return '职业试炼需要主角编入出战队伍';
  void save;
  return null;
}

// ---------------------------------------------------------------------------
// 出战请求加成（buildBattleRequest 之后、校验无关的面板修改）
// ---------------------------------------------------------------------------

/** 阵营克制：编入目标王国的部队每 1 名 → 全队攻击 +2 / 生命 +10（可叠加，设计值） */
export const FACTION_BUFF_ATTACK_PER = 2;
export const FACTION_BUFF_HP_PER = 10;

/** 编队中来自目标王国的部队数（阵营突袭加成/页面预览共用） */
export function factionMatchCount(save: MetaSave, kingdom: string): number {
  let match = 0;
  for (const member of activeTeam(save)?.members ?? []) {
    if (member.kind !== 'troop') continue;
    const troop = getTroopById(member.troopId);
    if (troop?.kingdom === kingdom) match += 1;
  }
  return match;
}

/**
 * 活动玩法对出战请求的修改（阵营突袭的全队 buff、末日之塔的跨层减员/残血）。
 * 在 buildBattleRequest 之后调用——只动 stats/成员，不影响会话校验的约束面。
 */
export function applyEventBattleModifiers(save: MetaSave, outcome: BridgeOutcome): void {
  const source = outcome.plan.source;
  if (source.kind !== 'event') return;
  const typeId = source.typeId as EventTypeId;
  const theme = currentEventTheme(source.weekStart, typeId);
  const week = ensureEventWeek(save, source.weekStart, typeId);

  if (theme.type.id === 'factionAssault') {
    const match = factionMatchCount(save, theme.kingdom!);
    if (match > 0) {
      for (const snap of outcome.request.playerTeam) {
        snap.stats.attack += FACTION_BUFF_ATTACK_PER * match;
        snap.stats.hp += FACTION_BUFF_HP_PER * match;
      }
    }
  }

  if (theme.type.id === 'towerOfDoom' && week.runTeam) {
    const states = new Map(week.runTeam.map((m) => [m.externalId, m]));
    outcome.request.playerTeam = outcome.request.playerTeam.filter((snap) => {
      const st = states.get(snap.externalId);
      if (!st) return true; // 中途换上来的新成员满状态入场
      if (st.defeated || st.hp <= 0) return false; // 阵亡减员，跳过该成员
      snap.stats.hp = Math.min(snap.stats.hp, st.hp); // 残血延续
      return true;
    });
    if (outcome.request.playerTeam.length === 0) {
      // 兜底：全员状态异常时视为新 run（正常流程在结算里已经收尾）
      week.eventData[EVENT_STATE_KEYS.runActive] = 0;
    }
  }
}

// ---------------------------------------------------------------------------
// 结算推进（每类型各自的玩法状态机；胜/败都推进）
// ---------------------------------------------------------------------------

export interface EventProgressLine {
  label: string;
  deltas: CurrencyDelta;
  mats?: MaterialDelta;
  note?: string;
}

/** 职业试炼连胜倍率：连胜 1/2/3/≥4 场 → ×1.0/×1.3/×1.6/×2.0（设计值，与玩法规则卡一致） */
export function trialMultiplier(streak: number): number {
  if (streak >= 4) return 2;
  const table = [1, 1.3, 1.6, 2];
  return table[Math.max(0, streak - 1)] ?? 1;
}

/** 敌人 externalId（与 enemyToSnapshot 同式样） */
function enemyExternalId(enemy: { troopId: number }, index: number): string {
  return `e${index}-${enemy.troopId}`;
}

/** 每场活动战斗后的玩法状态推进。胜负都调用（血池败场也计伤害、败场防线/塔收尾） */
export function eventBattleProgress(
  save: MetaSave,
  plan: EncounterPlan,
  result: BattleResult,
  victory: boolean,
): { lines: EventProgressLine[] } {
  const source = plan.source;
  if (source.kind !== 'event') return { lines: [] };
  const typeId = source.typeId as EventTypeId;
  const theme = currentEventTheme(source.weekStart, typeId);
  const week = ensureEventWeek(save, source.weekStart, typeId);
  const lines: EventProgressLine[] = [];

  switch (theme.type.id) {
    case 'invasion': {
      const line = Math.min(Math.max(week.eventData[EVENT_STATE_KEYS.invLine] ?? 1, 1), 3);
      if (victory) {
        if (line >= 3) {
          week.eventData[EVENT_STATE_KEYS.invRepelled] = (week.eventData[EVENT_STATE_KEYS.invRepelled] ?? 0) + 1;
          week.eventData[EVENT_STATE_KEYS.invLine] = 1;
          if (week.playRewards < EVENT_WEEKLY_PLAY_REWARD_CAP.invasion) {
            const mats: MaterialDelta = { traitstones: { 'runic:red': 2, 'runic:blue': 2 } };
            earn(save, { glory: 40, gems: 20 });
            earnMaterials(save, mats);
            week.playRewards += 1;
            lines.push({ label: '守土成功！', deltas: { glory: 40, gems: 20 }, mats, note: '三条防线全部守住，防线重整' });
          } else {
            lines.push({ label: '守土成功！', deltas: {}, note: '本周守土奖励已领满，积分与代币仍正常获得' });
          }
        } else {
          week.eventData[EVENT_STATE_KEYS.invLine] = line + 1;
          lines.push({ label: `防线推进 → 第 ${line + 1} 条`, deltas: {}, note: '敌人一节比一节强' });
        }
      } else if (line !== 1) {
        week.eventData[EVENT_STATE_KEYS.invLine] = 1;
        lines.push({ label: '防线失守', deltas: {}, note: '被打回第 1 条防线，重新推进' });
      }
      break;
    }

    case 'raidBoss': {
      // 血池：胜/败都按打掉的 HP 累计
      let damage = 0;
      for (const c of result.combatants) {
        if (c.side !== 'enemy') continue;
        const index = plan.enemies.findIndex((e, i) => enemyExternalId(e, i) === c.externalId);
        if (index < 0) continue;
        const enemy = plan.enemies[index]!;
        const troop = getTroopById(enemy.troopId);
        if (!troop) continue;
        damage += Math.max(0, troopStatsAtLevel(troop, enemy.level).health - c.hp);
      }
      if (damage > 0) {
        week.eventData[EVENT_STATE_KEYS.bossHp] = Math.max(0, (week.eventData[EVENT_STATE_KEYS.bossHp] ?? 0) - damage);
      }
      const hpLeft = week.eventData[EVENT_STATE_KEYS.bossHp] ?? 0;
      const hpMax = week.eventData[EVENT_STATE_KEYS.bossMax] ?? 0;
      lines.push({ label: `首领伤害 +${damage}`, deltas: {}, note: `血池 ${hpLeft} / ${hpMax}` });
      if (hpMax > 0 && hpLeft <= 0) {
        const tier = Math.max(week.eventData[EVENT_STATE_KEYS.bossTier] ?? 1, 1);
        if (week.playRewards < EVENT_WEEKLY_PLAY_REWARD_CAP.raidBoss) {
          const mats: MaterialDelta = { ingots: { epic: 2 } };
          if (tier >= 3) mats.ingots!.legendary = 1;
          const glory = 30 + 20 * tier;
          earn(save, { glory });
          earnMaterials(save, mats);
          week.playRewards += 1;
          lines.push({ label: `讨伐成功 · Tier ${tier} 首领倒下！`, deltas: { glory }, mats, note: '下一只首领血更厚' });
        } else {
          lines.push({ label: `讨伐成功 · Tier ${tier} 首领倒下！`, deltas: {}, note: '本周讨伐奖励已领满，积分与代币仍正常获得' });
        }
        week.eventData[EVENT_STATE_KEYS.bossesSlain] = (week.eventData[EVENT_STATE_KEYS.bossesSlain] ?? 0) + 1;
        week.eventData[EVENT_STATE_KEYS.bossTier] = tier + 1;
        week.eventData[EVENT_STATE_KEYS.bossHp] = 0;
        week.eventData[EVENT_STATE_KEYS.bossMax] = 0;
      }
      break;
    }

    case 'towerOfDoom': {
      if ((week.eventData[EVENT_STATE_KEYS.runActive] ?? 0) !== 1) break;
      const floor = Math.max(week.eventData[EVENT_STATE_KEYS.floor] ?? 1, 1);
      if (victory) {
        // 队伍状态冻结：HP/阵亡跨层延续（减员继续）
        week.runTeam = result.combatants
          .filter((c) => c.side === 'player')
          .map((c) => ({ externalId: c.externalId, hp: Math.max(0, c.hp), maxHp: Math.max(1, c.maxHp), defeated: c.defeated }));
        const alive = week.runTeam.filter((m) => !m.defeated && m.hp > 0).length;
        if (alive === 0) {
          // 惨胜全灭：同样收尾
          finishTowerRun(save, week, floor, lines, '全灭');
        } else {
          week.eventData[EVENT_STATE_KEYS.floor] = floor + 1;
          lines.push({ label: `第 ${floor} 层通过 → 第 ${floor + 1} 层`, deltas: {}, note: `存活 ${alive} 人（状态跨层延续）` });
        }
      } else {
        finishTowerRun(save, week, floor - 1, lines, '败北');
      }
      break;
    }

    case 'worldEvent': {
      if (!victory) break;
      const rng = new SeededRNG((result.seed ^ (source.weekStart >>> 0)) >>> 0);
      let drop = 2 + rng.nextInt(3);
      const race = theme.bonusRace;
      if (race) {
        for (const member of activeTeam(save)?.members ?? []) {
          if (member.kind !== 'troop') continue;
          const troop = getTroopById(member.troopId);
          if (troop?.troopTypes.includes(race)) drop += 2;
        }
      }
      week.eventData[EVENT_STATE_KEYS.supplies] = (week.eventData[EVENT_STATE_KEYS.supplies] ?? 0) + drop;
      lines.push({
        label: `事件物资 +${drop}`,
        deltas: {},
        note: `累计 ${week.eventData[EVENT_STATE_KEYS.supplies]}${race ? ` · 加成种族 ${race}` : ''}`,
      });
      break;
    }

    case 'factionAssault': {
      if (victory) week.eventData[EVENT_STATE_KEYS.assaultWins] = (week.eventData[EVENT_STATE_KEYS.assaultWins] ?? 0) + 1;
      break;
    }

    case 'classTrials':
      break; // 连胜计分在 settlement 的积分段处理
  }
  return { lines };
}

/** 塔层收尾：按到达层数结算符卷/荣耀，重置 run */
function finishTowerRun(
  save: MetaSave,
  week: EventWeekState,
  floorReached: number,
  lines: EventProgressLine[],
  reason: string,
): void {
  const best = Math.max(week.eventData[EVENT_STATE_KEYS.floorBest] ?? 0, floorReached);
  week.eventData[EVENT_STATE_KEYS.floorBest] = best;
  const scrolls = Math.floor(floorReached / 5);
  const glory = floorReached * 2;
  if (scrolls > 0 || glory > 0) {
    if (week.playRewards < EVENT_WEEKLY_PLAY_REWARD_CAP.towerOfDoom) {
      earn(save, { glory });
      earnMaterials(save, { forgeScrolls: scrolls });
      week.playRewards += 1;
      lines.push({
        label: `登塔结束（${reason}）· 到达第 ${floorReached} 层`,
        deltas: { glory },
        mats: { forgeScrolls: scrolls },
        note: `历史最高 第 ${best} 层 · 点击「攀爬」再来一程`,
      });
    } else {
      lines.push({ label: `登塔结束（${reason}）· 到达第 ${floorReached} 层`, deltas: {}, note: `历史最高 第 ${best} 层 · 本周登塔奖励已领满` });
    }
  } else {
    lines.push({ label: `登塔结束（${reason}）· 到达第 ${floorReached} 层`, deltas: {}, note: `历史最高 第 ${best} 层` });
  }
  week.eventData[EVENT_STATE_KEYS.runActive] = 0;
  week.eventData[EVENT_STATE_KEYS.floor] = 1;
  week.runTeam = null;
}

/** 主动放弃登塔：按败北同口径收尾（到达层 = 当前层 - 1，照发层数奖励） */
export function abandonTowerRun(
  save: MetaSave,
  weekStart: number,
): { ok: true; floorReached: number; glory: number; scrolls: number } | MetaFailure {
  const week = ensureEventWeek(save, weekStart, 'towerOfDoom');
  if ((week.eventData[EVENT_STATE_KEYS.runActive] ?? 0) !== 1) return fail('INVALID', '没有进行中的登塔');
  const floor = Math.max(week.eventData[EVENT_STATE_KEYS.floor] ?? 1, 1);
  const lines: EventProgressLine[] = [];
  finishTowerRun(save, week, floor - 1, lines, '主动放弃');
  const last = lines[0];
  return {
    ok: true,
    floorReached: floor - 1,
    glory: last?.deltas.glory ?? 0,
    scrolls: last?.mats?.forgeScrolls ?? 0,
  };
}

// ---------------------------------------------------------------------------
// 积分 / 里程碑（里程碑进度按类型：世界事件=物资，其余=积分）
// ---------------------------------------------------------------------------

/** 单场积分（设计值）：胜利 = Σ(稀有度档+1)×10 + Σ(等级)，封顶 EVENT_POINTS_CAP */
export function eventPointsOf(plan: EncounterPlan): number {
  let points = 0;
  for (const enemy of plan.enemies) {
    const troop = getTroopById(enemy.troopId);
    if (!troop) continue;
    points += (troop.rarityIdx + 1) * 10 + enemy.level;
  }
  return Math.min(points, EVENT_POINTS_CAP);
}

/** 里程碑进度值：世界事件按累计物资，其余按积分 */
export function eventMetricOf(save: MetaSave, weekStart: number, typeId: EventTypeId): { label: string; value: number } {
  const week = ensureEventWeek(save, weekStart, typeId);
  return typeId === 'worldEvent'
    ? { label: '物资', value: week.eventData[EVENT_STATE_KEYS.supplies] ?? 0 }
    : { label: '积分', value: week.points };
}

export interface EventMilestoneGain {
  index: number;
  milestone: EventMilestone;
}

/** 结算后新达标的里程碑（调用方负责入账；value 为含本场的进度总量） */
export function eventMilestonesReached(
  typeId: EventTypeId,
  value: number,
  alreadyClaimed: readonly number[],
): EventMilestoneGain[] {
  const table = EVENT_MILESTONES[typeId];
  const claimed = new Set(alreadyClaimed);
  const gains: EventMilestoneGain[] = [];
  for (let i = 0; i < table.length; i++) {
    if (claimed.has(i)) continue;
    if (value >= table[i]!.points) gains.push({ index: i, milestone: table[i]! });
  }
  return gains;
}

// ---------------------------------------------------------------------------
// 活动页面读模型（六页各自的状态区）
// ---------------------------------------------------------------------------

export type EventPageExtra =
  | { kind: 'invasion'; line: number; repelled: number }
  | { kind: 'raidBoss'; tier: number; hp: number; max: number; slain: number }
  | { kind: 'towerOfDoom'; floor: number; best: number; running: boolean; alive: number | null }
  | { kind: 'worldEvent'; race: string | null; supplies: number }
  | { kind: 'factionAssault'; kingdom: string; match: number; wins: number }
  | { kind: 'classTrials'; streak: number; mult: number };

export interface EventPageState {
  /** 里程碑进度 */
  metric: { label: string; value: number };
  extra: EventPageExtra;
}

export function eventPageState(save: MetaSave, weekStart: number, typeId: EventTypeId): EventPageState {
  const week = ensureEventWeek(save, weekStart, typeId);
  const theme = currentEventTheme(weekStart, typeId);
  const metric = eventMetricOf(save, weekStart, typeId);
  const d = week.eventData;
  let extra: EventPageExtra;
  switch (typeId) {
    case 'invasion':
      extra = { kind: 'invasion', line: Math.min(Math.max(d[EVENT_STATE_KEYS.invLine] ?? 1, 1), 3), repelled: d[EVENT_STATE_KEYS.invRepelled] ?? 0 };
      break;
    case 'raidBoss':
      extra = { kind: 'raidBoss', tier: Math.max(d[EVENT_STATE_KEYS.bossTier] ?? 1, 1), hp: d[EVENT_STATE_KEYS.bossHp] ?? 0, max: d[EVENT_STATE_KEYS.bossMax] ?? 0, slain: d[EVENT_STATE_KEYS.bossesSlain] ?? 0 };
      break;
    case 'towerOfDoom': {
      const running = (d[EVENT_STATE_KEYS.runActive] ?? 0) === 1;
      extra = {
        kind: 'towerOfDoom',
        floor: Math.max(d[EVENT_STATE_KEYS.floor] ?? 1, 1),
        best: d[EVENT_STATE_KEYS.floorBest] ?? 0,
        running,
        alive: running && week.runTeam ? week.runTeam.filter((m) => !m.defeated && m.hp > 0).length : null,
      };
      break;
    }
    case 'worldEvent':
      extra = { kind: 'worldEvent', race: theme.bonusRace, supplies: d[EVENT_STATE_KEYS.supplies] ?? 0 };
      break;
    case 'factionAssault':
      extra = { kind: 'factionAssault', kingdom: theme.kingdom ?? '—', match: factionMatchCount(save, theme.kingdom ?? ''), wins: d[EVENT_STATE_KEYS.assaultWins] ?? 0 };
      break;
    case 'classTrials': {
      const streak = d[EVENT_STATE_KEYS.trialStreak] ?? 0;
      extra = { kind: 'classTrials', streak, mult: trialMultiplier(Math.max(streak, 1)) };
      break;
    }
  }
  return { metric, extra };
}

// ---------------------------------------------------------------------------
// 活动商店（官方活动币商店的单机适配：代币 = 胜场产出，跨周作废）
// ---------------------------------------------------------------------------

/** 单场胜局的代币产出（设计值：max(3, floor(points/10))，30~120 分 → 3~12 代币） */
export function eventTokensFor(points: number): number {
  return Math.max(EVENT_TOKEN_MIN_PER_WIN, Math.floor(points / EVENT_TOKEN_DIVISOR));
}

/** 本周货架（读模型：带剩余库存；屏层直接渲染） */
export interface EventShopRow {
  goods: EventGoods;
  /** 剩余可购次数（限量货）；null = 无限量 */
  stockLeft: number | null;
}

export function eventShopOf(save: MetaSave, weekStart: number, typeId: EventTypeId): { theme: EventTheme; week: EventWeekState; rows: EventShopRow[] } {
  const theme = currentEventTheme(weekStart, typeId);
  const week = ensureEventWeek(save, weekStart, typeId);
  const rows = EVENT_SHOP[theme.type.id]!.map((goods) => ({
    goods,
    stockLeft: goods.stock === null ? null : Math.max(0, goods.stock - (week.bought[goods.id] ?? 0)),
  }));
  return { theme, week, rows };
}

export type EventBuyResult =
  | { ok: true; goodsId: string; tokensSpent: number; tokensLeft: number; stockLeft: number | null }
  | MetaFailure;

/** 购买一件货架商品：代币原子扣账 → 素材/货币入账 → 已购计数 +1 */
export function buyEventGoods(save: MetaSave, goodsId: string, weekStart: number, typeId: EventTypeId): EventBuyResult {
  const shop = eventShopOf(save, weekStart, typeId);
  const row = shop.rows.find((r) => r.goods.id === goodsId);
  if (!row) return fail('INVALID', '该商品不在此活动货架');
  if (row.stockLeft !== null && row.stockLeft <= 0) return fail('SOLD_OUT', '该商品本周已售罄');
  const week = shop.week;
  if (week.tokens < row.goods.cost) {
    return fail('INSUFFICIENT', `活动代币不足：需要 ${row.goods.cost}，现有 ${week.tokens}`);
  }
  week.tokens -= row.goods.cost;
  week.bought[goodsId] = (week.bought[goodsId] ?? 0) + 1;
  const g = row.goods;
  earn(save, { gold: g.gold, souls: g.souls, gems: g.gems, goldKeys: g.goldKeys, glory: g.glory });
  earnMaterials(save, g.mats ?? {});
  const stockLeft = g.stock === null ? null : g.stock - week.bought[goodsId]!;
  return { ok: true, goodsId, tokensSpent: g.cost, tokensLeft: week.tokens, stockLeft };
}
