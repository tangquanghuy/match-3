/**
 * 熔炉（Soulforge）配方表 —— 白名单制（设计文档 design/WEAPON-FORGE-DESIGN.md §3）。
 *
 * 官方口径：只有活动系武器进熔炉；王国武器包 / 精通·任务线武器永不进熔炉（论坛帖 55952 原文）。
 * 首批配方 = 官方目录中无王国包归属的纯活动武器 6 把 + 神话直购位（Dawnbringer，官方口径 130 万灵魂）
 * + Doomed 档样例 2 把。
 *
 * weaponId 使用目录命名空间 `gw_<referenceName>`（与 weaponCatalog.ts 一致；
 * 锻造成功即写入存档 unlockedWeapons，可在英雄页武器库装备）。
 * 消耗为设计值：v1 = 灵魂 + 黄金（钢锭/符卷通道二期随淬炼经济开放，字段已预留）。
 */
import type { ForgeRecipe, ForgeTier } from '../systems/forge';

export interface SoulforgeStock {
  recipe: ForgeRecipe;
  /** 一句话来源说明（活动名等） */
  source: string;
}

export const SOULFORGE_RECIPES: readonly SoulforgeStock[] = [
  // —— Tier 1 · 活动武器（官方目录 Special Events 系，Epic；主角 20 级解锁）——
  { recipe: { weaponId: 'gw_Eggsplosion', name: '蛋爆', rarity: 'Epic', tier: 1, souls: 20_000, gold: 15_000 },
    source: '复活节活动' },
  { recipe: { weaponId: 'gw_EyeOfXathenos', name: '克萨诺斯之眼', rarity: 'Epic', tier: 1, souls: 20_000, gold: 15_000 },
    source: '深渊活动' },
  { recipe: { weaponId: 'gw_FireAndIce', name: '冰与火', rarity: 'Epic', tier: 1, souls: 20_000, gold: 15_000 },
    source: '冬幕活动' },
  { recipe: { weaponId: 'gw_SlayBells', name: '屠戮铃铛', rarity: 'Epic', tier: 1, souls: 20_000, gold: 15_000 },
    source: '冬幕活动' },
  { recipe: { weaponId: 'gw_WitheringTouch', name: '凋零之触', rarity: 'Epic', tier: 1, souls: 20_000, gold: 15_000 },
    source: '亡灵节活动' },
  { recipe: { weaponId: 'gw_SparkRocket2.0.16', name: '火花火箭 2.0.16', rarity: 'Epic', tier: 1, souls: 20_000, gold: 15_000 },
    source: '周年活动' },
  // —— Tier 2 · 神话直购位（官方 Dawnbringer 口径：130 万灵魂；主角 40 级解锁）——
  { recipe: { weaponId: 'gw_Dawnbringer', name: '黎明使者', rarity: 'Mythic', tier: 2, souls: 1_300_000, gold: 200_000 },
    source: '官方直购位（三色神话）' },
  // —— Tier 2 · Doomed 档样例（熔铸符卷通道二期开放）——
  { recipe: { weaponId: 'gw_DoomedTome', name: '劫数之卷', rarity: 'Doomed', tier: 2, souls: 400_000, gold: 150_000 },
    source: '末日战役·卡其尔' },
  { recipe: { weaponId: 'gw_DoomedLibram', name: '劫数之书', rarity: 'Doomed', tier: 2, souls: 400_000, gold: 150_000 },
    source: '末日战役' },
] as const;

/** 按档位取配方（UI 遮罩用） */
export function recipesOfTier(tier: ForgeTier): SoulforgeStock[] {
  return SOULFORGE_RECIPES.filter((r) => r.recipe.tier === tier);
}

/** 按 weaponId 查配方 */
export function findRecipe(weaponId: string): ForgeRecipe | null {
  return SOULFORGE_RECIPES.find((r) => r.recipe.weaponId === weaponId)?.recipe ?? null;
}
