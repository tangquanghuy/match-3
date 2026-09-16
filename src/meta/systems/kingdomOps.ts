/**
 * 王国操作（M3）——黄金升级 / 探索解锁 / 地图节点状态 / 10 级加成聚合。
 *
 * 里程碑口径：升级投黄金与 10 级「+1 绑定属性」的**存档与聚合逻辑**在此落地
 * （原计划 M6 的一部分提前——进贡概率依赖等级，没有升级的进贡链不完整）；
 * M6 余下的只有旗帜法力加成（动 ManaDistributor，需台账）与金钥匙经济收口。
 */
import type { MetaSave } from '../state/schema';
import { fail, type MetaFailure } from '../types';
import { kingdomUpgradeCost } from '../data/economy';
import {
  KINGDOM_ORDER,
  kingdomBonusStat,
  kingdomUnlockLevel,
} from '../data/kingdoms';
import { spend } from './wallet';
import { questNodeUnlocked } from './encounter';
import { tributePreview } from './tribute';

export const KINGDOM_MAX_LEVEL = 10;

/** 升王国一级（投黄金，成本随等级递增；10 级封顶） */
export function upgradeKingdom(save: MetaSave, kingdom: string): { ok: true; level: number; cost: number } | MetaFailure {
  const entry = save.kingdoms[kingdom] ?? { level: 1, questsDone: 0, exploreTier: 0, lastTributeAt: 0 };
  if (entry.level >= KINGDOM_MAX_LEVEL) return fail('MAXED', '王国已满级');
  if (!KINGDOM_ORDER.includes(kingdom)) return fail('UNKNOWN_TROOP', `未知王国：${kingdom}`);
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

/** 设置探索难度档（1~5），未解锁或越界拒绝 */
export function setExploreTier(save: MetaSave, kingdom: string, tier: number): { ok: true; tier: number } | MetaFailure {
  if (!Number.isInteger(tier) || tier < 1 || tier > 5) {
    return fail('INVALID', '探索难度档须为 1~5');
  }
  if (!exploreUnlocked(save, kingdom)) {
    return fail('PREREQ_LOCKED', '先通关该王国任务链（8/8）才能探索');
  }
  const entry = save.kingdoms[kingdom]!;
  entry.exploreTier = tier;
  return { ok: true, tier };
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

/** 世界地图节点状态（v5 地图屏的逻辑部分；locked 判定需要主角等级） */
export interface KingdomNodeState {
  kingdom: string;
  /** 解锁所需主角等级 */
  unlockLevel: number;
  /** 主角等级不够 → 剪影显示 */
  locked: boolean;
  questsDone: number;
  /** 下一关（全通为 null） */
  nextNode: number | null;
  /** 探索是否开放 */
  exploreUnlocked: boolean;
  /** 进贡气泡：可结算小时数与命中数（锁定时不显示） */
  tributeHours: number;
  tributeHits: number;
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
    questsDone,
    nextNode: locked ? null : questNodeUnlocked(save, kingdom, questsDone + 1) ? questsDone + 1 : null,
    exploreUnlocked: !locked && exploreUnlocked(save, kingdom),
    tributeHours: locked ? 0 : tribute.hours,
    tributeHits: locked ? 0 : tribute.hits,
  };
}
