/**
 * 淬炼的存档集成（WEAPON-FORGE-DESIGN §1 的 F2 接线，素材批 2026-09-19）。
 *
 * forge.ts 保持纯逻辑（不读 MetaSave）；本模块负责：
 *  - 武器稀有度解析（统一走 weaponCatalog.anyWeaponById → weapons.json 自带 rarity；
 *    首批 20 把自造 w_* 已退役，按解锁档推导稀有度的 weaponRarity() 一并作废）；
 *  - 淬炼的「校验 → 扣账（钢锭/符卷） → 写回淬炼等级」闭环。
 */
import { resolveWeaponId } from '../data/weapons';
import { anyWeaponById, ownsWeapon } from '../data/weaponCatalog';
import { ingotKeyForRarity, type IngotKey, type MaterialDelta } from '../data/materials';
import type { MetaSave } from '../state/schema';
import { fail, type MetaFailure } from '../types';
import { temperWeapon, type TemperResult } from './forge';
import { spend, spendMaterials } from './wallet';

/** 武器 id → 官方稀有度原文；未知 id 返回 null（旧 `w_*` 先经退役映射归一） */
export function weaponRarityOfId(weaponId: string): string | null {
  return anyWeaponById(weaponId)?.rarity ?? null;
}

/**
 * 当前淬炼等级（缺省 0）。
 * 旧档的 `w_*` 键先归一到 `gw_*`：schema v4 迁移落地前后读到的值一致。
 */
export function temperingLevelOf(save: MetaSave, weaponId: string): number {
  const id = resolveWeaponId(weaponId);
  if (!id) return 0;
  return save.weaponTempering[id] ?? save.weaponTempering[weaponId] ?? 0;
}

export type TemperSaveResult =
  | { ok: true; level: number; ingotKey: string; cost: { gold: number; ingots: number; scrolls: number } }
  | MetaFailure;

/** 淬炼 +1 级：校验 → 扣账（原子） → 写回。返回新等级与实收消耗（供 UI 上账） */
export function temperWeaponOnSave(save: MetaSave, weaponId: string): TemperSaveResult {
  // 所有权走 ownsWeapon：起始池 22 把零条件隐式拥有，不在 unlockedWeapons 里
  if (!ownsWeapon(save, weaponId)) {
    return fail('NOT_OWNED', '尚未拥有该武器');
  }
  const id = resolveWeaponId(weaponId)!;
  const rarity = weaponRarityOfId(id);
  if (!rarity) return fail('INVALID', `未知武器 id：${weaponId}`);
  const current = temperingLevelOf(save, id);
  const result: TemperResult = temperWeapon({
    owned: true,
    currentLevel: current,
    rarity,
    ingots: Number.MAX_SAFE_INTEGER,
    gold: Number.MAX_SAFE_INTEGER,
    scrolls: Number.MAX_SAFE_INTEGER,
  });
  if (!result.ok) {
    return fail(result.issues[0]!.code === 'MAX_LEVEL' ? 'AT_CAP' : 'INVALID', result.issues[0]!.message);
  }
  const cost = result.cost;
  const ingotKey = ingotKeyForRarity(rarity);
  if (ingotKey === null) return fail('INVALID', `未知武器稀有度：${rarity}`);
  // Doomed 系：符卷替代钢锭（forge.temperingCost 已把 ingots 归零）
  const ingots: Partial<Record<IngotKey, number>> = { [ingotKey]: cost.ingots };
  const mats: MaterialDelta = cost.scrolls > 0 ? { forgeScrolls: cost.scrolls } : { ingots };
  const paidMats = spendMaterials(save, mats);
  if (!paidMats.ok) return paidMats;
  const paidGold = spend(save, { gold: cost.gold });
  if (!paidGold.ok) {
    // 材料先扣、黄金不足：回滚材料（加回；单线程两步扣费的一致性由这里保证）
    if (mats.forgeScrolls) {
      save.materials.forgeScrolls += mats.forgeScrolls;
    } else {
      save.materials.ingots[ingotKey] = (save.materials.ingots[ingotKey] ?? 0) + cost.ingots;
    }
    return paidGold;
  }
  save.weaponTempering[id] = result.level;
  return { ok: true, level: result.level, ingotKey, cost };
}
