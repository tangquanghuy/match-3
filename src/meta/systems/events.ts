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
 *      worldEvent    收集玩法：胜场掉「事件物资」（加成种族每 1 名 +1），里程碑按物资结算；
 *      classTrials   连胜试炼：连续胜利积分 ×1.3/×1.6/×2.0，败场清零；主角强制编入、职业经验 ×2。
 *
 * 与竞技场的对照（对齐官方 Arena vs Live Event 分工）：活动吃养成
 * （主角/旗帜/王国加成全生效——走 buildBattleRequest），draft 不吃。
 */
import { eventShopPeriodOf } from './eventShopClock';
import { weekStartOf } from '../gateway/clock';
import { SeededRNG } from '../../engine/rng';
import type { EventWeekState, MetaSave } from '../state/schema';
import { getTroopById, TROOPS } from '../../data/troops';
import { enemyLevel, enemyStatsAtLevel } from '../data/enemyDifficulty';
import type { EventGoods, EventMilestone, EventTheme, EventTypeId } from '../data/events';
import {
  EVENT_MILESTONES, EVENT_WEEKLY_RULES, EVENT_SHARED_GOALS, EVENT_CHOICES,
  EVENT_DEFENSE_REWARD,
  EVENT_SHOP,
  EVENT_TOKEN_DIVISOR,
  EVENT_TOKEN_MIN_PER_WIN,
  EVENT_WEEKLY_PLAY_REWARD_CAP,
  eventThemeOf,
} from '../data/events';
import { kingdomTroopPool, KINGDOM_ORDER } from '../data/kingdoms';
import { fail, type CurrencyDelta, type MetaFailure } from '../types';
import type { MaterialDelta } from '../data/materials';
import { earn, earnMaterials } from './wallet';
import { addClassXp, classLevelOf } from './hero';
import { grantTroop, rarityTierOf } from './troopProgress';
import { activeTeam } from './teamRules';
import type { BridgeOutcome } from './battleBridge';
import type { EncounterPlan, EnemyTier } from './encounter';
import { pickEnemies } from './encounter';
import { fnv1a32 } from '../data/hash';
import type { BattleResult } from '../../session/contract';
import { STAT_LIMITS } from '../../session/validateRequest';

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
      playRewards: 0, bought: {}, eventData: { revision: EVENT_WEEKLY_RULES.revision }, runTeam: null,
    };
  }
  const week = save.eventWeeks[typeId]!;
  if (typeof week.tokens !== 'number') week.tokens = 0;
  if (typeof week.tokensEarned !== 'number') week.tokensEarned = week.tokens;
  if (typeof week.playRewards !== 'number') week.playRewards = 0;
  if (!week.bought) week.bought = {};
  if (!week.eventData) week.eventData = {};
  // Old saves already track wins. Seed new difficulty counters without discarding weekly progress.
  if (typeId === 'worldEvent' && week.eventData.worldWins === undefined) week.eventData.worldWins = week.wins;
  if (typeId === 'classTrials' && week.eventData.trialWins === undefined) week.eventData.trialWins = week.wins;
  if (week.runTeam === undefined) week.runTeam = null;
  // 升级当周保留素材领取和购买记录，只为宝石补差；旧档不会重复领取素材。
  if (!week.eventData.revision) {
    const legacy: Record<EventTypeId, readonly number[]> = {
      invasion: [0,0,0,0,60,0], raidBoss: [0,0,0,40,0,0], towerOfDoom: [0,0,0,0,60,0],
      factionAssault: [0,0,0,40,0,0], worldEvent: [0,0,0,30,80,0], classTrials: [0,0,0,40,0,0],
    };
    for (const i of week.claimed) week.eventData[`gemPaid${i}`] = legacy[typeId][i] ?? 0;
    if (typeId === 'towerOfDoom') week.eventData.towerPaidFloors = Math.min(EVENT_WEEKLY_RULES.towerFloors, week.eventData.floorBest ?? 0);
    week.eventData.revision = EVENT_WEEKLY_RULES.revision;
  }
  return week;
}

/** 指定活动的本周主题（存档无关的纯读）。 */
export function currentEventTheme(weekStart: number, typeId: EventTypeId): EventTheme {
  return eventThemeOf(typeId, weekStart);
}

// ---------------------------------------------------------------------------
// 出敌（按活动类型各自的规则）
// ---------------------------------------------------------------------------

const RAID_POOL_BATTLES = 6; // 首领基础生命的 6 倍，不代表固定战斗场数
const RAID_POOL_GROWTH = 1.15; // 每阶层血池成长，最终受战斗生命上限9999约束
const TOWER_LEVEL_CAP = EVENT_WEEKLY_RULES.towerFloors - 1; // 楼层成长封顶（25层）

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
export function planEventEncounter(save: MetaSave, weekStart: number, seed: number, typeId: EventTypeId, requestedChoice?: string): EncounterPlan {
  const theme = currentEventTheme(weekStart, typeId);
  const week = ensureEventWeek(save, weekStart, typeId);
  const choice = EVENT_CHOICES[typeId].find(c => c.id === requestedChoice)?.id ?? EVENT_CHOICES[typeId][0]!.id;
  const tier = Math.max(week.eventData[EVENT_STATE_KEYS.bossTier] ?? 1, 1);
  const rng = new SeededRNG(typeId === 'raidBoss' ? fnv1a32(`raid-${weekStart}-${tier}`) : seed);
  const baseLevel = 5; // 独立活动曲线，王国仅决定兵种风格
  let matchingTroops = 0;
  for (const m of activeTeam(save)?.members ?? []) {
    const troop = m.kind === 'troop' ? getTroopById(m.troopId) : null;
    if (troop && theme.bonusRace && troop.troopTypes.includes(theme.bonusRace)) matchingTroops++;
  }
  const randomKingdom = (): string => KINGDOM_ORDER[rng.nextInt(KINGDOM_ORDER.length)]!;

  let kingdom: string;
  let level: number;
  let tiers: readonly EnemyTier[];
  switch (typeId) {
    case 'invasion': {
      // 防线波次：每条防线 +5；完整守土后 +15，不循环降级，越推越硬
      const line = Math.min(Math.max(week.eventData[EVENT_STATE_KEYS.invLine] ?? 1, 1), 3);
      kingdom = theme.kingdom!;
      level = baseLevel + (line - 1) * 5 + (week.eventData.invRepelled ?? 0) * 15 + (choice === 'charge' ? 3 : 0);
      tiers = eventTierPlan(typeId, { line, floor: 0 });
      break;
    }
    case 'raidBoss': {
      // 首领血池：无首领（首次/已讨伐）则按阶层生成新血池
      kingdom = randomKingdom();
      level = enemyLevel(baseLevel + 3 + (tier - 1) * 5);
      tiers = eventTierPlan(typeId, { line: 0, floor: 0 });
      const enemies = pickEnemies(kingdom, level, tiers, rng);
      if ((week.eventData[EVENT_STATE_KEYS.bossHp] ?? 0) <= 0) {
        const baseBossHp = enemies.filter(e => e.tier === 'boss').reduce((sum, e) => {
          const troop = getTroopById(e.troopId);
          return sum + (troop ? enemyStatsAtLevel(troop, e.level).health : 0);
        }, 0);
        week.eventData[EVENT_STATE_KEYS.bossTier] = tier;
        week.eventData[EVENT_STATE_KEYS.bossMax] = Math.min(STAT_LIMITS.hp.max, Math.round(baseBossHp * RAID_POOL_BATTLES * Math.pow(RAID_POOL_GROWTH, tier - 1)));
        week.eventData[EVENT_STATE_KEYS.bossHp] = week.eventData[EVENT_STATE_KEYS.bossMax]!;
      }
      return {
        kingdom,
        source: { kind: 'event', weekStart, typeId, choice, matchingTroops, bossStartHp: week.eventData.bossHp },
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
      kingdom = KINGDOM_ORDER[(fnv1a32(`tower-${weekStart >>> 0}`) + (floor - 1) * 5) % KINGDOM_ORDER.length]!;
      level = baseLevel + Math.min(floor - 1, TOWER_LEVEL_CAP) * 5;
      tiers = eventTierPlan(typeId, { line: 0, floor });
      break;
    }
    case 'factionAssault':
      kingdom = theme.kingdom!;
      level = 20 + Math.floor((week.eventData.assaultWins ?? 0) / 3) * 10 + (choice === 'siege' ? 4 : 0);
      tiers = (week.eventData.assaultWins ?? 0) % 3 === 2 ? ['boss', 'elite', 'minion'] : ['elite', 'minion', 'minion'];
      break;
    case 'worldEvent':
      kingdom = randomKingdom();
      level = baseLevel + (week.eventData.worldWins ?? 0) * 5 + (choice === 'escort' ? 5 : 0);
      tiers = eventTierPlan(typeId, { line: 0, floor: 0 });
      break;
    case 'classTrials':
      kingdom = randomKingdom();
      level = baseLevel + (week.eventData.trialWins ?? 0) * 5 + (choice === 'ordeal' ? 5 : 0);
      tiers = eventTierPlan(typeId, { line: 0, floor: 0 });
      break;
  }
  if (kingdomTroopPool(kingdom).length === 0) kingdom = KINGDOM_ORDER[0]!;
  return {
    kingdom,
    source: { kind: 'event', weekStart, typeId, choice, matchingTroops },
    seed: seed >>> 0,
    enemies: pickEnemies(kingdom, level, tiers, rng),
  };
}

/** 职业试炼要求主角编入出战队（屏层提前提示；计划层硬校验） */
export function eventBattleReady(save: MetaSave, typeId: EventTypeId, hasHeroInTeam: boolean): string | null {
  if (typeId === 'classTrials' && !hasHeroInTeam) return '职业试炼需要主角编入出战队伍';
  if (typeId === 'classTrials' && (!save.hero.classId || !save.hero.unlockedClasses.includes(save.hero.classId) || classLevelOf(save, save.hero.classId) < 1)) return '请先为主角装备职业，再进入职业试炼';
  const tower = save.eventWeeks.towerOfDoom;
  if (typeId === 'towerOfDoom' && tower?.eventData.runActive === 1 && tower.runTeam) {
    const ids = (activeTeam(save)?.members ?? []).map((m, i) => `p${i}-${m.kind === 'hero' ? 'hero' : m.troopId}`);
    if (tower.runTeam.length !== ids.length || tower.runTeam.some(m => !ids.includes(m.externalId)))
      return '本轮登塔阵容已锁定，请恢复原队伍与站位，或放弃本轮后重新编队';
  }
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
 * 在 buildBattleRequest 之后调用——修改战斗快照的面板、当前生命、活动专精标记与存活成员。
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

  const choice = source.choice;
  for (const snap of outcome.request.playerTeam) {
    const id = snap.externalId.match(/^p\d+-(\d+)$/)?.[1];
    const troop = id ? getTroopById(Number(id)) : undefined;
    const record = id ? save.collection[id] : undefined;
    snap.eventRarity = troop && record ? rarityTierOf(troop, record) : 0;
    if (typeId === 'invasion' && choice === 'hold') snap.stats.armor += 8;
    if (typeId === 'raidBoss' && choice === 'ward') {
      snap.stats.armor += 12;
      snap.stats.attack = Math.max(1, Math.round(snap.stats.attack * .8));
    }
  }
  for (const [index, snap] of outcome.request.enemyTeam.entries()) {
    if (typeId === 'invasion') snap.eventTarget = 'tower';
    if (typeId === 'factionAssault' && week.eventData.breach === 1) snap.stats.armor = Math.floor(snap.stats.armor / 2);
    if (typeId === 'raidBoss' && outcome.plan.enemies[index]?.tier === 'boss') {
      snap.eventTarget = 'boss';
      snap.stats.hp = Math.min(STAT_LIMITS.hp.max, Math.max(1, week.eventData.bossMax ?? snap.stats.hp));
      snap.initialHp = Math.min(snap.stats.hp, Math.max(1, week.eventData.bossHp ?? snap.stats.hp));
      week.eventData.bossMax = snap.stats.hp; week.eventData.bossHp = snap.initialHp;
      source.bossStartHp = snap.initialHp;
      if (snap.initialHp <= snap.stats.hp / 2) snap.stats.attack = Math.min(STAT_LIMITS.attack.max, Math.round(snap.stats.attack * 1.3));
    }
  }
  if (typeId === 'towerOfDoom') {
    if (!week.runTeam) {
      week.runTeam = outcome.request.playerTeam.map(snap => ({ externalId: snap.externalId,
        hp: snap.stats.hp, maxHp: snap.stats.hp, defeated: false }));
    }
    const states = new Map(week.runTeam.map(m => [m.externalId, m]));
    const floor = week.eventData.floor ?? 1;
    const rest = choice === 'rest' && floor > 1 && floor % 5 === 1;
    outcome.request.playerTeam = outcome.request.playerTeam.filter(snap => {
      const st = states.get(snap.externalId);
      if (!st || st.defeated || st.hp <= 0) return false;
      snap.stats.hp = st.maxHp;
      snap.initialHp = Math.min(st.maxHp, st.hp + (rest ? Math.ceil(st.maxHp * .35) : 0));
      return true;
    });
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
            earn(save, EVENT_DEFENSE_REWARD);
            earnMaterials(save, mats);
            week.playRewards += 1;
            lines.push({ label: '守土成功！', deltas: { ...EVENT_DEFENSE_REWARD }, mats, note: '三条防线全部守住，防线重整' });
          } else {
            lines.push({ label: '守土成功！', deltas: {}, note: '本周守土奖励已领满，积分与印记仍正常获得' });
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
      const bossIndex = plan.enemies.findIndex(e => e.tier === 'boss');
      const boss = plan.enemies[bossIndex];
      const resultBoss = boss && result.combatants.find(c => c.side === 'enemy' && c.externalId === enemyExternalId(boss, bossIndex));
      const startHp = source.bossStartHp ?? week.eventData.bossHp ?? 0;
      const damage = resultBoss ? Math.max(0, startHp - resultBoss.hp) : 0;
      week.eventData.bossHp = Math.max(0, (week.eventData.bossHp ?? 0) - damage);
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
          lines.push({ label: `讨伐成功 · Tier ${tier} 首领倒下！`, deltas: {}, note: '本周讨伐奖励已领满，积分与印记仍正常获得' });
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
        const previous = new Map((week.runTeam ?? []).map(m => [m.externalId, m]));
        for (const c of result.combatants.filter(c => c.side === 'player')) {
          const before = previous.get(c.externalId);
          if (week.runTeam && !before) continue; // 召唤物不成为跨层资产
          const maxHp = before?.maxHp ?? Math.max(1, c.maxHp);
          previous.set(c.externalId, { externalId: c.externalId, hp: Math.min(maxHp, Math.max(0, c.hp)),
            maxHp, defeated: c.defeated || c.hp <= 0 });
        }
        week.runTeam = [...previous.values()];
        week.eventData.floorBest = Math.max(week.eventData.floorBest ?? 0, floor);
        const alive = week.runTeam.filter((m) => !m.defeated && m.hp > 0).length;
        if (floor >= EVENT_WEEKLY_RULES.towerFloors) {
          finishTowerRun(save, week, floor, lines, '通关');
        } else if (alive === 0) {
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
      week.eventData.worldWins = (week.eventData.worldWins ?? 0) + 1;
      const rng = new SeededRNG((result.seed ^ (source.weekStart >>> 0)) >>> 0);
      let drop = (source.choice === 'escort' ? 10 : 6) + rng.nextInt(3);
      const race = theme.bonusRace;
      const matches = source.matchingTroops ?? (activeTeam(save)?.members ?? []).filter(m =>
        m.kind === 'troop' && race && getTroopById(m.troopId)?.troopTypes.includes(race)).length;
      drop += matches;
      week.eventData[EVENT_STATE_KEYS.supplies] = (week.eventData[EVENT_STATE_KEYS.supplies] ?? 0) + drop;
      lines.push({
        label: `事件物资 +${drop}`,
        deltas: {},
        note: `累计 ${week.eventData[EVENT_STATE_KEYS.supplies]}${race ? ` · 加成种族 ${race}` : ''}`,
      });
      break;
    }

    case 'factionAssault': {
      if (victory) {
        week.eventData[EVENT_STATE_KEYS.assaultWins] = (week.eventData[EVENT_STATE_KEYS.assaultWins] ?? 0) + 1;
        week.eventData.breach = source.choice === 'flank' ? 1 : 0;
        lines.push({ label: '据点占领', deltas: {}, note: source.choice === 'flank' ? '补给已破坏，下个据点护甲减半' : '强攻成功，继续推进下个据点' });
      }
      break;
    }

    case 'classTrials':
      if (victory) week.eventData.trialWins = (week.eventData.trialWins ?? 0) + 1;
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
  const paid = week.eventData.towerPaidFloors ?? 0;
  const reached = Math.min(EVENT_WEEKLY_RULES.towerFloors, Math.max(paid, floorReached));
  const scrolls = Math.floor(reached / 5) - Math.floor(paid / 5);
  const glory = (reached - paid) * 2;
  week.eventData.towerPaidFloors = reached;
  if (reached > paid) {
    earn(save, { glory });
    earnMaterials(save, { forgeScrolls: scrolls });
    week.playRewards = Math.min(EVENT_WEEKLY_PLAY_REWARD_CAP.towerOfDoom, week.playRewards + 1);
  }
  lines.push({
    label: `登塔结束（${reason}）· 到达第 ${floorReached} 层`,
    deltas: glory > 0 ? { glory } : {},
    ...(scrolls > 0 ? { mats: { forgeScrolls: scrolls } } : {}),
    note: `本周最高 第 ${best} 层 · ${reached > paid ? '新高层数奖励已入账' : '本轮未超过已领奖励层数'}`,
  });
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

/** 单场积分（设计值）：基础100；强攻120；营地50。试炼连胜在结算阶段计算 */
export function eventPointsOf(plan: EncounterPlan): number {
  let points = 100;
  if (plan.source.kind === 'event') {
    const choice = plan.source.choice;
    if (choice === 'charge') points *= 1.2;
    if (choice === 'siege') points *= 1.2;
    if (choice === 'rest') points *= .5;
  }
  return Math.min(EVENT_POINTS_CAP, Math.round(points));
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
      extra = { kind: 'classTrials', streak, mult: trialMultiplier(streak + 1) };
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

function eventTroop(theme: EventTheme, periodIndex: number, role: NonNullable<EventGoods['troopRole']>) {
  const candidates = TROOPS.filter((troop) => {
    if (role === 'siegebreaker' || role === 'godslayer') return troop.traits.some((trait) => trait?.code === role);
    if (role === 'faction') return troop.kingdom === theme.kingdom && troop.rarityIdx >= 2 && troop.rarityIdx <= 4;
    return troop.troopTypes.includes(theme.bonusRace ?? '') && troop.rarityIdx === 3;
  });
  const themed = theme.kingdom && (role === 'siegebreaker' || role === 'godslayer')
    ? candidates.filter((troop) => troop.kingdom === theme.kingdom)
    : [];
  const pool = themed.length ? themed : candidates.length ? candidates : TROOPS.filter((troop) =>
    role === 'faction' ? troop.kingdom === theme.kingdom : troop.troopTypes.includes(theme.bonusRace ?? ''));
  if (!pool.length) throw new Error(`活动商店缺少可用兵种：${theme.type.id}/${role}`);
  const offset = fnv1a32(`${theme.type.id}-${role}`);
  return pool[((offset + periodIndex) % pool.length + pool.length) % pool.length]!;
}

export function eventShopOf(save: MetaSave, weekStart: number, typeId: EventTypeId, now = weekStart) {
  const period = eventShopPeriodOf(now);
  // Freeze this shelf's theme through its two-day window, including Monday midnight.
  const theme = currentEventTheme(weekStartOf(period.start), typeId);
  const week = ensureEventWeek(save, weekStart, typeId);
  save.eventShops ??= {};
  const previous = save.eventShops[typeId];
  if (!previous || previous.periodStart !== period.start) {
    save.eventShops[typeId] = {
      periodStart: period.start,
      // Legacy weekly-only saves retain existing purchases until the next restock.
      bought: previous ? {} : { ...week.bought },
    };
  }
  const stock = save.eventShops[typeId]!;
  const rows = EVENT_SHOP[theme.type.id]!.map((baseGoods) => {
    const troop = baseGoods.troopRole ? eventTroop(theme, period.index, baseGoods.troopRole) : undefined;
    const goods = troop ? { ...baseGoods, troopId: troop.id, name: troop.name, blurb: ({
      siegebreaker: '攻城手 · 入侵专精', godslayer: '神祇杀手 · 首领专精',
      faction: `阵营精选 · ${theme.kingdom}`, race: `种族精选 · ${theme.bonusRace}`,
    } as Record<NonNullable<EventGoods['troopRole']>, string>)[baseGoods.troopRole!] } : baseGoods;
    return {
      goods,
      stockLeft: goods.stock === null ? null : Math.max(0, goods.stock - (stock.bought[goods.id] ?? 0)),
    };
  });
  return { theme, week, stock, period, rows };
}

export type EventBuyResult =
  | { ok: true; goodsId: string; tokensSpent: number; tokensLeft: number; stockLeft: number | null }
  | MetaFailure;

/** 购买一件货架商品：代币原子扣账 → 素材/货币入账 → 已购计数 +1 */
export function buyEventGoods(save: MetaSave, goodsId: string, weekStart: number, typeId: EventTypeId, now = weekStart, expectedPeriodStart?: number): EventBuyResult {
  if (expectedPeriodStart !== undefined && expectedPeriodStart !== eventShopPeriodOf(now).start) {
    return fail('INVALID', '货品已刷新，请确认新货架后兑换');
  }
  const shop = eventShopOf(save, weekStart, typeId, now);
  const row = shop.rows.find((r) => r.goods.id === goodsId);
  if (!row) return fail('INVALID', '该商品不在此活动货架');
  if (row.stockLeft !== null && row.stockLeft <= 0) return fail('SOLD_OUT', '该商品本期已售罄');
  if (row.goods.classXp && (!save.hero.classId || !save.hero.unlockedClasses.includes(save.hero.classId) || classLevelOf(save, save.hero.classId) <= 0)) {
    return fail('PREREQ_LOCKED', '请先解锁并装备一个职业');
  }
  const week = shop.week;
  if (week.tokens < row.goods.cost) {
    return fail('INSUFFICIENT', `活动印记不足：需要 ${row.goods.cost}，现有 ${week.tokens}`);
  }
  week.tokens -= row.goods.cost;
  week.bought[goodsId] = (week.bought[goodsId] ?? 0) + 1;
  shop.stock.bought[goodsId] = (shop.stock.bought[goodsId] ?? 0) + 1;
  const g = row.goods;
  earn(save, { gold: g.gold ?? 0, souls: g.souls ?? 0, gems: g.gems ?? 0, goldKeys: g.goldKeys ?? 0, glory: g.glory ?? 0 });
  earnMaterials(save, g.mats ?? {});
  if (g.troopId) grantTroop(save, g.troopId, 1);
  if (g.classXp && save.hero.classId) addClassXp(save, save.hero.classId, g.classXp);
  const stockLeft = g.stock === null ? null : g.stock - shop.stock.bought[goodsId]!;
  return { ok: true, goodsId, tokensSpent: g.cost, tokensLeft: week.tokens, stockLeft };
}

/** 跨活动周目标集中在入侵周实例的命名键中，随同一周锚点重置。 */
export function eventWeeklySummary(save: MetaSave, weekStart: number) {
  const ledger = ensureEventWeek(save, weekStart, 'invasion');
  const wins = Object.values(save.eventWeeks).reduce((sum, w) => sum + (w?.weekStart === weekStart ? w.wins : 0), 0);
  const goals = EVENT_SHARED_GOALS.map((goal, i) => ({ ...goal, claimed: ledger.eventData[`sharedClaim${i}`] === 1 }));
  return { wins, goals, earned: goals.reduce((sum, g) => sum + (g.claimed ? g.gems : 0), 0) };
}

/** 宝石与素材分账，旧版已领里程碑只补宝石差额，不重复发材料。 */
export function claimEventWeeklyGems(save: MetaSave, weekStart: number, typeId: EventTypeId): EventProgressLine[] {
  const week = ensureEventWeek(save, weekStart, typeId);
  const metric = eventMetricOf(save, weekStart, typeId).value;
  const lines: EventProgressLine[] = [];
  EVENT_MILESTONES[typeId].forEach((m, i) => {
    if (metric < m.points && !week.claimed.includes(i)) return;
    const paid = week.eventData[`gemPaid${i}`] ?? 0;
    const gems = Math.max(0, (m.gems ?? 0) - paid);
    if (gems > 0) {
      earn(save, { gems }); week.eventData[`gemPaid${i}`] = paid + gems;
      lines.push({ label: `周常宝石 · ${m.label}`, deltas: { gems } });
    }
  });
  const summary = eventWeeklySummary(save, weekStart);
  const ledger = ensureEventWeek(save, weekStart, 'invasion');
  summary.goals.forEach((g, i) => {
    if (g.claimed || summary.wins < g.wins) return;
    earn(save, { gems: g.gems }); ledger.eventData[`sharedClaim${i}`] = 1;
    lines.push({ label: `每周远征 · 累计${g.wins}胜`, deltas: { gems: g.gems }, note: '六种活动共同推进，周一刷新' });
  });
  return lines;
}
