/**
 * 部队养成系统（M1/M4 的逻辑部分）——升级 / 升阶 / 特质解锁 / 分解 / 入册。
 *
 * 官方口径（META-GAME-PLAN.md §4.2，数值单源在 data/economy.ts）：
 *  - 等级上限按基础稀有度 15..20，升阶提档 +1 上限；
 *  - 升阶同名卡 5/10/25（不耗本体）；升阶后四维按新上限重算，全副本生效（存档每卡一份）；
 *  - 特质解锁按裁定②：黄金+灵魂+同名卡，槽位有前置顺序；
 *  - 分解只拆多余副本（本体不可拆），locked 保护，不回收已投入养成。
 *
 * 所有函数直接改传入的 save（调用方自行 persist），失败返回 MetaFailure 且存档不被改动。
 */
import { getTroopById, type TroopData } from '../../data/troops';
import { troopStatsAtLevel, type LeveledStats } from '../../data/leveling';
import type { MetaSave, TroopRecord } from '../state/schema';
import { fail, type MetaFailure } from '../types';
import {
  ascensionCopiesNeeded,
  decomposeYield,
  levelCapFor,
  MAX_ASCENSION,
  totalSoulCost,
  traitUnlockCost,
  TRAIT_SLOT_COUNT,
} from '../data/economy';
import { earn, spend } from './wallet';

// ---------------------------------------------------------------------------
// 收藏条目
// ---------------------------------------------------------------------------

export function getRecord(save: MetaSave, troopId: number): TroopRecord | undefined {
  return save.collection[String(troopId)];
}

/**
 * 入册（宝箱/任务奖励/竞技场保留等唯一入口）：首次获得建立条目，之后累加副本数。
 * 本体之外记 copies；重复获得 n 张 → copies += n。
 * troopId 悬空（不在 troops.json）返回 null——对账脚本盯的正是这种引用。
 */
export function grantTroop(save: MetaSave, troopId: number, count = 1): TroopRecord | null {
  if (!Number.isInteger(troopId) || count < 1) return null;
  if (!getTroopById(troopId)) return null;
  const key = String(troopId);
  let rec = save.collection[key];
  if (!rec) {
    // 首次入册：第一张是本体，其余记副本
    rec = { copies: count - 1, level: 1, ascension: 0, traits: [false, false, false], locked: false };
    save.collection[key] = rec;
  } else {
    rec.copies += count; // 已拥有：本次获得全部记副本
  }
  return rec;
}

// ---------------------------------------------------------------------------
// 稀有度档 / 等级上限 / 四维
// ---------------------------------------------------------------------------

/** 当前稀有度档 idx（基础 + 升阶，封顶表尾）。升阶后卡框色/星标随之变化（ASSETS-NEEDED §1.5）。 */
export function rarityTierOf(troop: TroopData, rec: TroopRecord): number {
  return Math.min(troop.rarityIdx + rec.ascension, 5);
}

export function levelCapOf(troop: TroopData, rec: TroopRecord): number {
  return levelCapFor(troop.rarityIdx, rec.ascension);
}

/** 战斗桥接用：当前等级四维（升阶只抬高上限，数值由等级驱动） */
export function troopStatsOf(troop: TroopData, rec: TroopRecord): LeveledStats {
  return troopStatsAtLevel(troop, rec.level);
}

// ---------------------------------------------------------------------------
// 升级（灵魂）
// ---------------------------------------------------------------------------

export type LevelUpResult =
  | { ok: true; from: number; to: number; soulsSpent: number }
  | MetaFailure;

/** 升到 targetLevel（支持一次多级；上限按当前稀有度档硬截断） */
export function levelUp(save: MetaSave, troopId: number, targetLevel: number): LevelUpResult {
  const troop = getTroopById(troopId);
  if (!troop) return fail('UNKNOWN_TROOP', `部队 id ${troopId} 不存在`);
  const rec = getRecord(save, troopId);
  if (!rec) return fail('NOT_OWNED', '尚未拥有该部队');
  if (!Number.isInteger(targetLevel)) return fail('INVALID', '目标等级必须是整数');
  const cap = levelCapOf(troop, rec);
  if (targetLevel > cap) {
    return fail('AT_CAP', `已达当前稀有度上限 ${cap} 级，升阶可提升`);
  }
  if (targetLevel <= rec.level) return fail('INVALID', '目标等级需高于当前等级');
  const cost = totalSoulCost(troop.rarityIdx, rec.level, targetLevel);
  const paid = spend(save, { souls: cost });
  if (!paid.ok) return paid;
  const from = rec.level;
  rec.level = targetLevel;
  return { ok: true, from, to: targetLevel, soulsSpent: cost };
}

// ---------------------------------------------------------------------------
// 升阶（同名卡）
// ---------------------------------------------------------------------------

export type AscendResult =
  | { ok: true; ascension: number; copiesConsumed: number; newCap: number }
  | MetaFailure;

/** 升一阶：同名卡 5/10/25（不耗本体），稀有度档 +1 → 等级上限 +1 */
export function ascend(save: MetaSave, troopId: number): AscendResult {
  const troop = getTroopById(troopId);
  if (!troop) return fail('UNKNOWN_TROOP', `部队 id ${troopId} 不存在`);
  const rec = getRecord(save, troopId);
  if (!rec) return fail('NOT_OWNED', '尚未拥有该部队');
  if (rec.ascension >= MAX_ASCENSION) return fail('MAXED', '已是三阶满阶');
  const need = ascensionCopiesNeeded(rec.ascension);
  if (rec.copies < need) {
    return fail('NEED_COPIES', `同名卡不足：需 ${need} 张（另保留本体），现有 ${rec.copies} 张`);
  }
  rec.copies -= need;
  rec.ascension += 1;
  return {
    ok: true,
    ascension: rec.ascension,
    copiesConsumed: need,
    newCap: levelCapOf(troop, rec),
  };
}

// ---------------------------------------------------------------------------
// 特质解锁（黄金 + 灵魂 + 同名卡，裁定②）
// ---------------------------------------------------------------------------

export type UnlockTraitResult =
  | { ok: true; slot: number; cost: { gold: number; souls: number; copies: number } }
  | MetaFailure;

/** 解锁第 slot（1 起）个特质；槽位按顺序解锁（GoW 语义） */
export function unlockTrait(save: MetaSave, troopId: number, slot: number): UnlockTraitResult {
  if (!Number.isInteger(slot) || slot < 1 || slot > TRAIT_SLOT_COUNT) {
    return fail('BAD_SLOT', `特质槽位号须为 1~${TRAIT_SLOT_COUNT}`);
  }
  const troop = getTroopById(troopId);
  if (!troop) return fail('UNKNOWN_TROOP', `部队 id ${troopId} 不存在`);
  const rec = getRecord(save, troopId);
  if (!rec) return fail('NOT_OWNED', '尚未拥有该部队');
  if (rec.traits[slot - 1]) return fail('ALREADY_UNLOCKED', '该特质已解锁');
  if (slot > 1 && !rec.traits[slot - 2]) {
    return fail('PREREQ_LOCKED', `需先解锁特质 ${slot - 1}`);
  }
  const cost = traitUnlockCost(slot);
  if (rec.copies < cost.copies) {
    return fail('NEED_COPIES', `同名卡不足：需 ${cost.copies} 张，现有 ${rec.copies} 张`);
  }
  const paid = spend(save, { gold: cost.gold, souls: cost.souls });
  if (!paid.ok) return paid;
  rec.copies -= cost.copies;
  rec.traits[slot - 1] = true;
  return { ok: true, slot, cost };
}

// ---------------------------------------------------------------------------
// 分解
// ---------------------------------------------------------------------------

export type DecomposeResult =
  | { ok: true; count: number; gained: { gold: number; souls: number } }
  | MetaFailure;

/** 分解 count 张多余同名卡（本体不可拆，locked 整卡保护） */
export function decompose(save: MetaSave, troopId: number, count = 1): DecomposeResult {
  const troop = getTroopById(troopId);
  if (!troop) return fail('UNKNOWN_TROOP', `部队 id ${troopId} 不存在`);
  const rec = getRecord(save, troopId);
  if (!rec) return fail('NOT_OWNED', '尚未拥有该部队');
  if (rec.locked) return fail('LOCKED', '该卡已开启分解保护');
  if (!Number.isInteger(count) || count < 1) return fail('INVALID', '分解数量非法');
  if (rec.copies < count) {
    return fail('NEED_COPIES', `多余同名卡不足：现有 ${rec.copies} 张（本体不可分解）`);
  }
  rec.copies -= count;
  const gained = decomposeYield(troop.rarityIdx);
  earn(save, { gold: gained.gold * count, souls: gained.souls * count });
  return { ok: true, count, gained: { gold: gained.gold * count, souls: gained.souls * count } };
}
