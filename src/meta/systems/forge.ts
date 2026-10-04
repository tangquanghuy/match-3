/**
 * 武器淬炼 + 熔炉锻造（设计文档 design/WEAPON-FORGE-DESIGN.md 的纯逻辑落地）。
 *
 * 纯函数、零 DOM、零引擎依赖；不读 MetaSave（持久化三字段 weaponTempering/ingots/forgeScrolls
 * 由 save v2 提供，见设计文档 §1 接线点）。武器淬炼只消耗钢锭／符卷。
 *
 * 官方口径（考据见设计文档 §0/§6）：
 *  - 淬炼用「与武器稀有度对应」的钢锭；Doomed/Cursebreaker 改用熔铸符卷；
 *  - 词缀随等级解锁、战斗中在主效果之后触发（二期战斗化）；
 *  - 熔炉只造活动系武器（王国包/精通/任务线武器永不进熔炉），高档位需诅咒符文。
 */
/** 官方普通武器上限：Common +5、Rare +6 … Mythic +10。项目特有的 Uncommon 归入 Common 档。 */
export const MAX_TEMPERING_LEVEL = 10;
const TEMPERING_CAPS: Record<string, number> = {
  Common: 5, Uncommon: 5, Rare: 6, UltraRare: 7, 'Ultra-Rare': 7,
  Epic: 8, Legendary: 9, Mythic: 10, Doomed: 10,
};
export function temperingMaxLevel(rarity: string): number {
  return TEMPERING_CAPS[rarity] ?? MAX_TEMPERING_LEVEL;
}

/** 前五级提升属性，+6 起每级解锁一条词缀；低稀有度的可解锁条数受等级上限约束。 */
export const AFFIX_UNLOCK_LEVELS = [6, 7, 8, 9, 10] as const;
export const DOOMED_AFFIX_UNLOCK_LEVELS = AFFIX_UNLOCK_LEVELS;
export function affixUnlockLevels(rarity: string): readonly number[] {
  return AFFIX_UNLOCK_LEVELS.filter(level => level <= temperingMaxLevel(rarity));
}

/** 熔铸符卷专属稀有度（这些武器淬炼不消耗普通钢锭，改消耗符卷） */
export const FORGE_SCROLL_RARITY = 'Doomed';

export interface TemperingCost {
  /** 对应稀有度钢锭（Doomed 武器此值为 0，改耗 scrolls） */
  ingots: number;
  gold: number;
  /** 熔铸符卷（仅 Doomed 系武器） */
  scrolls: number;
}

/** 淬炼 currentLevel → nextLevel 的消耗（nextLevel = currentLevel+1 由调用方保证 ≤ 上限） */
export function temperingCost(rarity: string, currentLevel: number): TemperingCost {
  const next = currentLevel + 1;
  const ingots = next;
  const gold = 0;
  const scrolls = rarity === FORGE_SCROLL_RARITY ? next : 0;
  // Doomed 系：普通钢锭替换为符卷
  return { ingots: scrolls > 0 ? 0 : ingots, gold, scrolls };
}

/** level 级时已解锁的词缀数（从 +6 起每级一档） */
export function affixUnlockedCount(rarity: string, level: number): number {
  const table = affixUnlockLevels(rarity);
  let n = 0;
  for (const lv of table) if (level >= lv) n += 1;
  return n;
}

export type ForgeIssueCode =
  | 'NOT_OWNED'
  | 'MAX_LEVEL'
  | 'BAD_LEVEL'
  | 'MISSING_INGOTS'
  | 'MISSING_SCROLLS'
  | 'MISSING_GOLD'
  | 'MISSING_SOULS'
  | 'ALREADY_OWNED'
  | 'TIER_LOCKED'
  | 'BAD_RECIPE';

export interface ForgeIssue {
  code: ForgeIssueCode;
  message: string;
}

export interface TemperInput {
  /** 武器是否已在 unlockedWeapons 中 */
  owned: boolean;
  /** 当前淬炼等级（缺省 0） */
  currentLevel?: number;
  /** 武器稀有度（src/data/weapons.json 的 rarity 全集） */
  rarity: string;
  /** 钢锭持有量（对应稀有度档） */
  ingots: number;
  /** 黄金持有量 */
  gold: number;
  /** 熔铸符卷持有量（仅 Doomed 系需要） */
  scrolls?: number;
}

export type TemperResult =
  | { ok: true; level: number; cost: TemperingCost }
  | { ok: false; issues: ForgeIssue[] };

/**
 * 淬炼一级：校验汇总全部问题（对齐 teamRules 的 issues 风格），成功返回新等级与实收消耗。
 * 调用方负责把 level 写回 weaponTempering[weaponId]、把 cost 从库存扣除（原子性由调用方保证）。
 */
export function temperWeapon(input: TemperInput): TemperResult {
  const issues: ForgeIssue[] = [];
  const level = input.currentLevel ?? 0;
  if (!input.owned) issues.push({ code: 'NOT_OWNED', message: '尚未拥有该武器' });
  if (!Number.isInteger(level) || level < 0) issues.push({ code: 'BAD_LEVEL', message: '淬炼等级非法' });
  const cap = temperingMaxLevel(input.rarity);
  if (level >= cap) issues.push({ code: 'MAX_LEVEL', message: `已达淬炼上限 ${cap} 级` });
  if (issues.length > 0) return { ok: false, issues };

  const cost = temperingCost(input.rarity, level);
  if (input.ingots < cost.ingots) {
    issues.push({ code: 'MISSING_INGOTS', message: `钢锭不足（需要 ${cost.ingots}，持有 ${input.ingots}）` });
  }
  if (input.scrolls !== undefined && input.scrolls < cost.scrolls) {
    issues.push({ code: 'MISSING_SCROLLS', message: `熔铸符卷不足（需要 ${cost.scrolls}，持有 ${input.scrolls}）` });
  }
  if (input.gold < cost.gold) {
    issues.push({ code: 'MISSING_GOLD', message: `黄金不足（需要 ${cost.gold}，持有 ${input.gold}）` });
  }
  if (issues.length > 0) return { ok: false, issues };
  return { ok: true, level: level + 1, cost };
}

// —— 熔炉（Soulforge） ——

/** 熔炉上架档位：Tier1 = 主角 20 级解锁；Tier2 = 主角 40 级（神话/末日档配方） */
export type ForgeTier = 1 | 2;

export interface ForgeRecipe {
  /** 武器 id（与解锁列表同一 id 空间：meta 首批 20 把或 718 目录导入后的 referenceName） */
  weaponId: string;
  name: string;
  rarity: string;
  /** 上架档位 */
  tier: ForgeTier;
  /** 灵魂消耗 */
  souls: number;
  /** 黄金消耗 */
  gold: number;
  /** 钢锭消耗（对应稀有度档；v1 预留） */
  ingots?: number;
  /** 熔铸符卷消耗（Doomed 配方） */
  scrolls?: number;
  note?: string;
}

export interface ForgeCraftInput {
  recipe: ForgeRecipe | null;
  /** 玩家主角等级（熔炉档位门槛） */
  heroLevel: number;
  owned: boolean;
  souls: number;
  gold: number;
  ingots?: number;
  scrolls?: number;
}

export type ForgeCraftResult =
  | { ok: true; weaponId: string }
  | { ok: false; issues: ForgeIssue[] };

/** 熔炉档位解锁的主角等级（设计值：对齐官方「玩家 38/45 级」的双档结构，压缩到我们主角 20/40） */
export function forgeTierUnlockLevel(tier: ForgeTier): number {
  return tier === 1 ? 20 : 40;
}

/** 锻造：白名单配方 → 解锁武器。消耗原子性由调用方（wallet.spend 语义）保证 */
export function forgeWeapon(input: ForgeCraftInput): ForgeCraftResult {
  const issues: ForgeIssue[] = [];
  const r = input.recipe;
  if (!r) {
    issues.push({ code: 'BAD_RECIPE', message: '配方不存在' });
    return { ok: false, issues };
  }
  if (input.heroLevel < forgeTierUnlockLevel(r.tier)) {
    issues.push({
      code: 'TIER_LOCKED',
      message: `熔炉 Tier ${r.tier} 需要主角 ${forgeTierUnlockLevel(r.tier)} 级（当前 ${input.heroLevel}）`,
    });
  }
  if (input.owned) issues.push({ code: 'ALREADY_OWNED', message: '已拥有该武器' });
  if (input.souls < r.souls) issues.push({ code: 'MISSING_SOULS', message: `灵魂不足（需要 ${r.souls}，持有 ${input.souls}）` });
  if (r.gold > 0 && input.gold < r.gold) issues.push({ code: 'MISSING_GOLD', message: `黄金不足（需要 ${r.gold}，持有 ${input.gold}）` });
  if (r.ingots !== undefined && (input.ingots ?? 0) < r.ingots) issues.push({ code: 'MISSING_INGOTS', message: `钢锭不足（需要 ${r.ingots}，持有 ${input.ingots}）` });
  if (r.scrolls !== undefined && (input.scrolls ?? 0) < r.scrolls) {
    issues.push({ code: 'MISSING_SCROLLS', message: `熔铸符卷不足（需要 ${r.scrolls}，持有 ${input.scrolls ?? 0}）` });
  }
  if (issues.length > 0) return { ok: false, issues };
  return { ok: true, weaponId: r.weaponId };
}

