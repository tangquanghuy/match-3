import { maxExploreTier } from './explore';
/**
 * 王国操作（M3）——黄金升级 / 探索解锁 / 地图节点状态 / 10 级加成聚合。
 *
 * 里程碑口径：升级投黄金与 10 级「+1 绑定属性」的**存档与聚合逻辑**在此落地
 * （原计划 M6 的一部分提前——进贡概率依赖等级，没有升级的进贡链不完整）；
 * M6 余下的只有旗帜法力加成（动 ManaDistributor，需台账）与金钥匙经济收口。
 */
import type { MetaSave } from '../state/schema';
import { fail, type MetaFailure } from '../types';
import { kingdomUpgradeCost, tributeAmountScale, tributeChance } from '../data/economy';
import {
  EXPLORE_MAX_TIER,
  KINGDOM_ORDER,
  kingdomBonusStat,
  kingdomUnlockLevel,
} from '../data/kingdoms';
import { BANNERS } from '../data/banners';
import { spend } from './wallet';
import { planExploreEncounter, planQuestEncounter, questNodeUnlocked, type EncounterEnemy } from './encounter';
import { tributePreview } from './tribute';

export const KINGDOM_MAX_LEVEL = 10;

/** 升王国一级（投黄金，成本随等级递增；10 级封顶；未开放的王国不能升级） */
export function upgradeKingdom(save: MetaSave, kingdom: string): { ok: true; level: number; cost: number } | MetaFailure {
  const entry = save.kingdoms[kingdom] ?? { level: 1, questsDone: 0, exploreTier: 0, lastTributeAt: 0 };
  if (entry.level >= KINGDOM_MAX_LEVEL) return fail('MAXED', '王国已满级');
  if (!KINGDOM_ORDER.includes(kingdom)) return fail('UNKNOWN_TROOP', `未知王国：${kingdom}`);
  if (save.hero.level < kingdomUnlockLevel(kingdom)) {
    return fail('PREREQ_LOCKED', `冒险者 Lv.${kingdomUnlockLevel(kingdom)} 开放${kingdom}后才能升级`);
  }
  let cost: number;
  try {
    cost = kingdomUpgradeCost(entry.level);
  } catch {
    return fail('INVALID', `王国等级非法：${entry.level}`);
  }
  const paid = spend(save, { gold: cost });
  if (!paid.ok) return paid;
  entry.level += 1;
  save.kingdoms[kingdom] = entry;
  return { ok: true, level: entry.level, cost };
}

/** 探索模式：任务链 8 关全通后开放 */
export function exploreUnlocked(save: MetaSave, kingdom: string): boolean {
  return (save.kingdoms[kingdom]?.questsDone ?? 0) >= 8;
}

/** 设置探索难度（1–12）；先校验全局解锁和本轮难度锁定 */
export function setExploreTier(save: MetaSave, kingdom: string, tier: number): { ok: true; tier: number } | MetaFailure {
  if (!Number.isInteger(tier) || tier < 1 || tier > EXPLORE_MAX_TIER) {
    return fail('INVALID', '关卡不存在');
  }
  if (!exploreUnlocked(save, kingdom)) {
    return fail('PREREQ_LOCKED', '先通关该王国主线');
  }
  const entry = save.kingdoms[kingdom]!;
  if (entry.exploreRun && entry.exploreRun.tier !== tier) return fail('PREREQ_LOCKED', '先完成或放弃当前探索');
  if (tier > maxExploreTier(save)) return fail('PREREQ_LOCKED', '先击败上一难度的首领队伍');
  entry.exploreTier = tier;
  return { ok: true, tier };
}

// ---------------------------------------------------------------------------
// M10 王国主线页的阵容预览（纯读模型；与实战 seed 无关）
// ---------------------------------------------------------------------------

/** fnv1a32（与 session/battleResult.digestString、systems/tribute 同算法） */
function fnv1a32(input: string): number {
  let hash = 0x811c9dc7;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/**
 * 任务关阵容预览的种子：`fnv1a32('quest-<王国>-<关号>')`。
 *
 * 与**实战 seed 无关**（实战 seed 来自网关熵源），所以预览只是"这一关大概谁来打"，
 * 同参数任何时候都复现同一份，可入单测锁死（`TASK-META §9.5` 验收 2）。
 */
export function questPreviewSeed(kingdom: string, node: number): number {
  return fnv1a32(`quest-${kingdom}-${node}`);
}

/** 任务关阵容预览。node 越界抛 RangeError。 */
export function questLineupPreview(kingdom: string, node: number): EncounterEnemy[] {
  return planQuestEncounter(kingdom, node, questPreviewSeed(kingdom, node)).enemies;
}

export function explorePreviewSeed(kingdom: string, tier: number): number {
  return fnv1a32(`explore-${kingdom}-${tier}`);
}

/** Hard / Very Hard 关卡预览。tier 越界抛 RangeError。 */
export function exploreLineupPreview(kingdom: string, tier: number): EncounterEnemy[] {
  return planExploreEncounter(kingdom, tier, explorePreviewSeed(kingdom, tier)).enemies;
}

export interface KingdomStatBonus {
  health: number;
  armor: number;
  attack: number;
  magic: number;
}

/** 全体部队的王国 10 级加成聚合：每个满级王国给其绑定属性 +1（M6 桥接已消费） */
export function kingdomBonusOf(save: MetaSave): KingdomStatBonus {
  const bonus: KingdomStatBonus = { health: 0, armor: 0, attack: 0, magic: 0 };
  for (const [kingdom, entry] of Object.entries(save.kingdoms)) {
    if (entry.level < KINGDOM_MAX_LEVEL) continue;
    bonus[kingdomBonusStat(kingdom)] += 1;
  }
  return bonus;
}

/** 已满 10 级的王国（按推进序），全局王国加成面板用 */
export function maxedKingdoms(save: MetaSave): string[] {
  return KINGDOM_ORDER.filter((k) => (save.kingdoms[k]?.level ?? 1) >= KINGDOM_MAX_LEVEL);
}

// ---------------------------------------------------------------------------
// 迷雾（GoW 4.5：只看得见「当前可开放」与「下一批」王国，更远的藏在迷雾里）
// ---------------------------------------------------------------------------

/** 未来多少级内要开放的王国算「已探明」（地图上可见、带锁，能看到门槛与收益） */
export const FOG_SCOUT_LEVELS = 3;

/** open = 已开放；scouted = 已探明但未开放；hidden = 仍在迷雾中 */
export type KingdomFog = 'open' | 'scouted' | 'hidden';

export function kingdomFogOf(heroLevel: number, kingdom: string): KingdomFog {
  const need = kingdomUnlockLevel(kingdom);
  if (heroLevel >= need) return 'open';
  if (need <= heroLevel + FOG_SCOUT_LEVELS) return 'scouted';
  return 'hidden';
}

// ---------------------------------------------------------------------------
// 王国等级收益轨道（GoW：每级 +进贡几率、+该国法力精通；10 级全体属性 +1）
// ---------------------------------------------------------------------------

export interface KingdomLevelPerk {
  level: number;
  /** 达到该级的黄金成本（1 级为 0） */
  cost: number;
  /** 每小时进贡几率 */
  tributeChance: number;
  /** 黄金/灵魂进贡倍率（相对 1 级） */
  tributeScale: number;
  /** 旗帜主色的法力精通加成（战斗涌动几率） */
  mastery: number;
  /** 满级：全体部队与主角 +1 绑定属性 */
  statBonus: boolean;
}

/** 王国 1~10 级的收益轨道（纯数据；屏层画轨道、测试锁口径） */
export function kingdomLevelTrack(): KingdomLevelPerk[] {
  return Array.from({ length: KINGDOM_MAX_LEVEL }, (_, i) => {
    const level = i + 1;
    return {
      level,
      cost: level === 1 ? 0 : kingdomUpgradeCost(level - 1),
      tributeChance: tributeChance(level),
      tributeScale: tributeAmountScale(level),
      mastery: level,
      statBonus: level >= KINGDOM_MAX_LEVEL,
    };
  });
}

/** 该王国旗帜的正加成色（王国等级给这些颜色的法力精通 +等级） */
export function kingdomMasteryColors(kingdom: string): string[] {
  return Object.entries(BANNERS[kingdom]?.boosts ?? {})
    .filter(([, v]) => (v ?? 0) > 0)
    .map(([c]) => c);
}

/** 世界地图节点状态（v5 地图屏的逻辑部分；locked 判定需要主角等级） */
export interface KingdomNodeState {
  kingdom: string;
  /** 解锁所需主角等级 */
  unlockLevel: number;
  /** 主角等级不够 → 剪影显示 */
  locked: boolean;
  /** 迷雾状态 */
  fog: KingdomFog;
  questsDone: number;
  /** 下一关（全通为 null） */
  nextNode: number | null;
  /** 探索是否开放 */
  exploreUnlocked: boolean;
  /** 进贡气泡：可结算小时数与命中数（锁定时不显示） */
  tributeHours: number;
  tributeHits: number;
  /**
   * 进贡产出与满溢信息（UX M-4/M-7/M-10 口径单源）：
   * `tributeReady` 是「地图角标 / 底部 chip / 弹层收取按钮」三处共用的唯一判据。
   */
  tributeGold: number;
  tributeSouls: number;
  tributeGlory: number;
  tributeKeys: number;
  tributeReady: boolean;
  tributeOverflowing: boolean;
  tributeCapAt: number;
  tributeNextHourAt: number;
  /** 本国每小时进贡几率 */
  tributeChance: number;
  /** 是否主城 */
  home: boolean;
}

export function kingdomNodeState(save: MetaSave, kingdom: string, now: number): KingdomNodeState {
  const unlockLevel = kingdomUnlockLevel(kingdom);
  const locked = save.hero.level < unlockLevel;
  const entry = save.kingdoms[kingdom];
  const questsDone = entry?.questsDone ?? 0;
  const tribute = tributePreview(save, kingdom, now);
  return {
    kingdom,
    unlockLevel,
    locked,
    fog: kingdomFogOf(save.hero.level, kingdom),
    questsDone,
    nextNode: locked ? null : questNodeUnlocked(save, kingdom, questsDone + 1) ? questsDone + 1 : null,
    exploreUnlocked: !locked && exploreUnlocked(save, kingdom),
    tributeHours: locked ? 0 : tribute.hours,
    tributeHits: locked ? 0 : tribute.hits,
    tributeGold: locked ? 0 : tribute.gold,
    tributeSouls: locked ? 0 : tribute.souls,
    tributeGlory: locked ? 0 : tribute.glory,
    tributeKeys: locked ? 0 : tribute.goldKeys,
    tributeReady: locked ? false : tribute.ready,
    tributeOverflowing: locked ? false : tribute.overflowing,
    tributeCapAt: tribute.capAt,
    tributeNextHourAt: tribute.nextHourAt,
    tributeChance: tribute.chance,
    home: tribute.home,
  };
}

/** 设为主城（GoW Home Kingdom：进贡翻倍）。null = 取消主城。未开放王国拒绝。 */
export function setHomeKingdom(save: MetaSave, kingdom: string | null): { ok: true; home: string | null } | MetaFailure {
  if (kingdom === null) {
    save.homeKingdom = null;
    return { ok: true, home: null };
  }
  if (!KINGDOM_ORDER.includes(kingdom)) return fail('INVALID', `未知王国：${kingdom}`);
  if (save.hero.level < kingdomUnlockLevel(kingdom)) {
    return fail('PREREQ_LOCKED', `${kingdom}尚未开放：需冒险者 Lv.${kingdomUnlockLevel(kingdom)}`);
  }
  save.homeKingdom = kingdom;
  return { ok: true, home: kingdom };
}
