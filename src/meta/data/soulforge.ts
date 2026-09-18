/**
 * 熔炉（Soulforge）配方表 —— 白名单制（设计文档 design/WEAPON-FORGE-DESIGN.md §3）。
 *
 * 官方口径：只有活动系武器进熔炉；王国武器包 / 精通·任务线武器永不进熔炉（论坛帖 55952 原文）。
 * 首批配方 = 官方目录中无王国包归属的纯活动武器 6 把 + 神话直购位（Dawnbringer，130 万灵魂）
 * + Doomed 档样例 2 把（熔铸符卷通道）。
 *
 * weaponId 使用 718 目录的 referenceName（id 空间与 meta 首批 20 把 w_* 独立；
 * 目录导入 meta 解锁体系后直接互通）。消耗数值为设计值（文档 §3）。
 */
import type { ForgeRecipe, ForgeTier } from '../systems/forge';

export interface SoulforgeStock {
  /** 配方（按档位分组供 UI 遮罩） */
  recipe: ForgeRecipe;
  /** 一句话来源说明（活动名等） */
  source: string;
}

export const SOULFORGE_RECIPES: readonly SoulforgeStock[] = [
  // —— Tier 1 · 活动武器（官方目录 Special Events 系，Epic）——
  { recipe: { weaponId: 'Eggsplosion', name: '蛋爆', rarity: 'Epic', tier: 1, souls: 120_000, ingots: 32 },
    source: '复活节活动' },
  { recipe: { weaponId: 'EyeOfXathenos', name: '克萨诺斯之眼', rarity: 'Epic', tier: 1, souls: 120_000, ingots: 32 },
    source: '深渊活动' },
  { recipe: { weaponId: 'FireAndIce', name: '冰与火', rarity: 'Epic', tier: 1, souls: 120_000, ingots: 32 },
    source: '冬幕活动' },
  { recipe: { weaponId: 'SlayBells', name: '屠戮铃铛', rarity: 'Epic', tier: 1, souls: 120_000, ingots: 32 },
    source: '冬幕活动' },
  { recipe: { weaponId: 'WitheringTouch', name: '凋零之触', rarity: 'Epic', tier: 1, souls: 120_000, ingots: 32 },
    source: '亡灵节活动' },
  { recipe: { weaponId: 'SparkRocket2.0.16', name: '火花火箭 2.0.16', rarity: 'Epic', tier: 1, souls: 120_000, ingots: 32 },
    source: '周年活动' },
  // —— Tier 2 · 神话直购位（官方 Dawnbringer 口径：130 万灵魂）——
  { recipe: { weaponId: 'Dawnbringer', name: '黎明使者', rarity: 'Mythic', tier: 2, souls: 1_300_000, ingots: 100 },
    source: '官方直购位（三色神话）' },
  // —— Tier 2 · Doomed 档样例（熔铸符卷通道）——
  { recipe: { weaponId: 'DoomedTome', name: '劫数之卷', rarity: 'Doomed', tier: 2, souls: 800_000, ingots: 100, scrolls: 25 },
    source: '末日战役·卡其尔' },
  { recipe: { weaponId: 'DoomedLibram', name: '劫数之书', rarity: 'Doomed', tier: 2, souls: 800_000, ingots: 100, scrolls: 25 },
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
