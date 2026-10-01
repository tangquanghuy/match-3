/**
 * 素材词表（每周活动/入侵批）——钢锭、熔铸符卷、特质石的键格式与显示名单源。
 *
 * 官方口径（考据见 design/EVENTS-INVASION-DESIGN.md §1.1）：
 *  - 钢锭按武器稀有度分档（淬炼专用，见 systems/forge.ts）；
 *  - 特质石 = Minor/Major/Runic × 六元素色 + Celestial（圣辉）；官方 Arcane
 *    双色档（21 种）使用 arcane:color1:color2 库存键。
 * 元素色名对齐 GoW 词表：Blue=水 / Green=自然 / Red=火 / Yellow=风 / Purple=魔法 / Brown=土。
 */
import { BaseColor } from '../../engine/types';

/** 钢锭档位键（与 systems/forge.ts INGOT_BASE、src/data/weapons.json 的 rarity 同词表） */
export type IngotKey = 'common' | 'uncommon' | 'rare' | 'ultraRare' | 'epic' | 'legendary' | 'mythic';

/** INGOT_KEYS 顺序 = 稀有度升序（勿改动，掉落/显示按档递进依赖它） */
export const INGOT_KEYS: readonly IngotKey[] = [
  'common',
  'uncommon',
  'rare',
  'ultraRare',
  'epic',
  'legendary',
  'mythic',
] as const;

/** 钢锭显示名（与稀有度框色一致的中文词） */
export const INGOT_NAMES: Record<IngotKey, string> = {
  common: '普通钢锭',
  uncommon: '优良钢锭',
  rare: '稀有钢锭',
  ultraRare: '超稀钢锭',
  epic: '史诗钢锭',
  legendary: '传说钢锭',
  mythic: '神话钢锭',
};

/** 武器稀有度原文（weapons.json / WeaponDef.rarity 词表）→ 钢锭档键 */
const RARITY_TO_INGOT: Record<string, IngotKey> = {
  Common: 'common',
  Uncommon: 'uncommon',
  Rare: 'rare',
  UltraRare: 'ultraRare',
  'Ultra-Rare': 'ultraRare',
  Epic: 'epic',
  Legendary: 'legendary',
  Mythic: 'mythic',
  Doomed: 'mythic', // Doomed 武器淬炼耗符卷不耗锭；映射仅作兜底展示
};

export function ingotKeyForRarity(rarity: string): IngotKey | null {
  return RARITY_TO_INGOT[rarity] ?? null;
}

// ---------------------------------------------------------------------------
// 特质石
// ---------------------------------------------------------------------------

/** 特质石档位（Minor/Major/Runic/Arcane/Celestial） */
export type TraitstoneTier = 'minor' | 'major' | 'runic' | 'arcane' | 'celestial';

export const TRAITSTONE_TIERS: readonly TraitstoneTier[] = ['minor', 'major', 'runic', 'arcane', 'celestial'] as const;

/** 六元素色：键（存档/掉落词表）+ 显示名（GoW 元素口径） */
export const STONE_COLORS: ReadonlyArray<{ key: string; base: BaseColor; name: string }> = [
  { key: 'blue', base: BaseColor.Blue, name: '水' },
  { key: 'green', base: BaseColor.Green, name: '自然' },
  { key: 'red', base: BaseColor.Red, name: '火' },
  { key: 'yellow', base: BaseColor.Yellow, name: '风' },
  { key: 'purple', base: BaseColor.Purple, name: '魔法' },
  { key: 'brown', base: BaseColor.Brown, name: '土' },
];

const TIER_NAMES: Record<TraitstoneTier, string> = {
  minor: '初级',
  major: '高级',
  runic: '符文',
  celestial: '圣辉',
  arcane: '秘法',
};

/** 特质石库存键：'{tier}:{color}'；celestial 无色。非法组合返回 null（对账用） */
export function stoneKey(tier: TraitstoneTier, colorKey?: string): string | null {
  if (tier === 'celestial') return 'celestial';
  if (!colorKey) return null;
  const key = `${tier}:${colorKey}`;
  return parseStoneKey(key) ? key : null;
}

/** 解析库存键（'minor:fire' → {tier:'minor', colorKey:'fire'}；celestial → colorKey undefined） */
export function parseStoneKey(key: string): { tier: TraitstoneTier; colorKey?: string } | null {
  if (key === 'celestial') return { tier: 'celestial' };
  const parts = key.split(':');
  const [tier, color, second] = parts;
  if (tier === 'arcane' && parts.length === 3 && STONE_COLORS.some(c => c.key === color) && STONE_COLORS.some(c => c.key === second)) {
    return { tier, colorKey: `${color}:${second}` };
  }
  if (parts.length !== 2) return null;
  if (
    (tier === 'minor' || tier === 'major' || tier === 'runic') &&
    color &&
    STONE_COLORS.some((c) => c.key === color)
  ) {
    return { tier, colorKey: color };
  }
  return null;
}

/** 特质石显示名（'minor:fire' → 初级火之石） */
export function stoneName(key: string): string {
  const parsed = parseStoneKey(key);
  if (!parsed) return key;
  if (parsed.tier === 'celestial') return '圣辉石';
  if (parsed.tier === 'arcane') {
    // Preserve inventory identity while accepting either color order for display.
    const colors = parsed.colorKey!.split(':').sort((a, b) =>
      STONE_COLORS.findIndex(c => c.key === a) - STONE_COLORS.findIndex(c => c.key === b));
    return ARCANE_STONE_NAMES[`arcane:${colors.join(':')}`] ?? key;
  }
  const colorName = STONE_COLORS.find((c) => c.key === parsed.colorKey)?.name ?? parsed.colorKey ?? '';
  return `${TIER_NAMES[parsed.tier]}${colorName}之石`;
}

/** BaseColor → 元素键（部队主色 → 掉落/消耗用） */
export function stoneColorKeyOf(base: BaseColor): string {
  return STONE_COLORS.find((c) => c.base === base)?.key ?? 'brown';
}

/** 材料账目：钢锭 / 符卷 / 特质石 / 藏宝图的增量（数值恒正，方向由操作名决定） */
export interface MaterialDelta {
  ingots?: Partial<Record<IngotKey, number>>;
  forgeScrolls?: number;
  traitstones?: Record<string, number>;
  treasureMaps?: number;
}

/** 合并两个材料账目（结算明细聚合用） */
export function addMaterialDelta(a: MaterialDelta, b: MaterialDelta): MaterialDelta {
  const out: MaterialDelta = { ingots: { ...a.ingots }, traitstones: { ...a.traitstones } };
  out.forgeScrolls = (a.forgeScrolls ?? 0) + (b.forgeScrolls ?? 0) || undefined;
  out.treasureMaps = (a.treasureMaps ?? 0) + (b.treasureMaps ?? 0) || undefined;
  for (const [key, n] of Object.entries(b.ingots ?? {})) {
    out.ingots![key as IngotKey] = (out.ingots![key as IngotKey] ?? 0) + n!;
  }
  for (const [key, n] of Object.entries(b.traitstones ?? {})) {
    out.traitstones![key] = (out.traitstones![key] ?? 0) + n!;
  }
  return out;
}

/** Canonical 21 arcane pairs, in source-data color order. */
export const ARCANE_STONE_KEYS = STONE_COLORS.flatMap((a, i) => STONE_COLORS.slice(i).map(b => `arcane:${a.key}:${b.key}`));

/** 中文名称取自 data/raw/troops.gow.zh.json 的 stats.traits[].traitstones（ID 18–38）。
 * 仅校正显示名称，库存键与配方保持稳定；秘法与符文是独立档位。 */
export const ARCANE_STONE_NAMES: Readonly<Record<string, string>> = {
  'arcane:blue:blue': '秘法坚毅属性石',
  'arcane:blue:green': '秘法沼泽属性石',
  'arcane:blue:red': '秘法鲜血属性石',
  'arcane:blue:yellow': '秘法剑刃属性石',
  'arcane:blue:purple': '秘法精神属性石',
  'arcane:blue:brown': '秘法护盾属性石',
  'arcane:green:green': '秘法隐匿属性石',
  'arcane:green:red': '秘法野兽属性石',
  'arcane:green:yellow': '秘法光之属性石',
  'arcane:green:purple': '秘法毒液属性石',
  'arcane:green:brown': '秘法森林属性石',
  'arcane:red:red': '秘法狂怒属性石',
  'arcane:red:yellow': '秘法风暴属性石',
  'arcane:red:purple': '秘法暗之属性石',
  'arcane:red:brown': '秘法熔岩属性石',
  'arcane:yellow:yellow': '秘法夏之属性石',
  'arcane:yellow:purple': '秘法平原属性石',
  'arcane:yellow:brown': '秘法山岳属性石',
  'arcane:purple:purple': '秘法死亡属性石',
  'arcane:purple:brown': '秘法骷髅属性石',
  'arcane:brown:brown': '秘法深渊属性石',
};
