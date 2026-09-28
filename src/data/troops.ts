/**
 * 兵种数据加载器（数据来源：Gems of War / gowhead 导出，经 scripts/build_troops.mjs 精简）。
 *
 * 本文件是"数据 → 引擎"的唯一入口。它做两件事：
 *   1. 为精简后的 troops.json 提供忠实的类型（TroopData），并建立按 id / referenceName 的索引与查询；
 *   2. 提供一个"尽力而为"的适配器 troopToCharacter()，把兵种映射到引擎现有的 Character 模型。
 *
 * 适配器中所有以 GAP 标注的位置，即当前战斗系统与数据之间的缺口，
 * 详见 .kiro/specs/match3-battle-core/troops-gap-analysis.md。
 */
import raw from './troops.json';
import { normalizeCombatText, spellDescription } from './combatText';
import { OFFICIAL_MAX_LEVEL, troopStatsAtLevel } from './leveling';
import { BaseColor } from '../engine/types';
import type { Character } from '../engine/types';
import { buildSkillMetadata, type SkillMetadata } from '../engine/skills/scaling';
import { COMMUNITY_TROOPS } from './communityTroops';

export type Rarity =
  | 'Common'
  | 'Uncommon'
  | 'Rare'
  | 'UltraRare'
  | 'Epic'
  | 'Legendary';

/** 兵种角色定位（原始 role 字段） */
export type TroopRole =
  | 'Generator'
  | 'Striker'
  | 'Warmaster'
  | 'Defender'
  | 'Mage'
  | 'Warlock'
  | 'Support'
  | 'Warrior'
  | 'Assassin';

export interface TroopTrait {
  code: string;
  name: string;
  description: string;
}

export interface TroopSpell {
  id: number;
  name: string;
  description: string;
  /** 构建期预解析的技能元数据（缩放/二级修饰/原文/是否识别），见需求 2。 */
  meta: SkillMetadata;
}

/** 官方与自定义部队共用的数据结构。 */
export interface TroopData {
  id: number;
  name: string;
  referenceName: string;
  rarity: Rarity;
  rarityIdx: number;
  kingdom: string | null;
  /** P-E-faction-kingdom: raw native KingdomId (en dump; faction troops keep their own id). Absent for community troops. */
  kingdomId?: number | null;
  /** 种族/类型，可有 1~2 个（用于特质羁绊，如 beastbond） */
  troopTypes: string[];
  role: TroopRole | null;
  attack: number;
  armor: number;
  health: number;
  /** 法术强度：绝大多数技能按 [魔法+N] 缩放。已接入 Character.magic。 */
  magic: number;
  /**
   * 1 级基础值（GoW 官方 `*_Base`）。上面四项是 20 级满级值，两者一起作为
   * 等级曲线的锚点，见 `src/data/leveling.ts`。
   *
   * 可选：构建产物里恒存在，但手写的测试夹具可以省略——此时按 0 计，
   * 默认 20 级取值不受影响。
   */
  base?: {
    attack: number;
    armor: number;
    health: number;
    magic: number;
  };
  /** 关联法力颜色（GoW 单一法力条由这些颜色共同充能） */
  manaColors: BaseColor[];
  /** 释放技能所需的法力总量（单一数值）。已接入 Character.manaCost。 */
  manaCost: number;
  spell: TroopSpell;
  traits: TroopTrait[];
  portrait: string | null;
  artUrl?: string;
}

/** 全部兵种（只读）：官方数据与独立维护的异界部队。 */
export const SOURCE_TROOPS: readonly TroopData[] = [...(raw as unknown as TroopData[]), ...COMMUNITY_TROOPS];
export const TROOPS: readonly TroopData[] = SOURCE_TROOPS.map(t => {
  const description = spellDescription(t.spell.id, t.spell.description);
  return { ...t,
    spell: { ...t.spell, description, meta: description === t.spell.description ? t.spell.meta : buildSkillMetadata(description) },
    traits: t.traits.map(trait => ({ ...trait, description: normalizeCombatText(trait.description) })),
  };
});

/** 按数值 id 索引 */
const BY_ID = new Map<number, TroopData>(TROOPS.map((t) => [t.id, t]));
/** 按 referenceName（英文唯一名）索引 */
const BY_REF = new Map<string, TroopData>(
  TROOPS.map((t) => [t.referenceName, t]),
);

/** 按 id 取兵种 */
export function getTroopById(id: number): TroopData | undefined {
  return BY_ID.get(id);
}

/** 按 referenceName 取兵种 */
export function getTroopByRef(referenceName: string): TroopData | undefined {
  return BY_REF.get(referenceName);
}

/** Summon roster of a kingdom (randomOfKingdom): number = raw KingdomId, string = zh kingdom name. */
export function troopRefsOfKingdom(kingdom: string | number): string[] {
  return TROOPS.filter((t) => (typeof kingdom === 'number' ? t.kingdomId === kingdom : t.kingdom === kingdom)).map((t) => t.referenceName);
}

/** 按稀有度筛选 */
export function troopsByRarity(rarity: Rarity): TroopData[] {
  return TROOPS.filter((t) => t.rarity === rarity);
}

/**
 * 全部出现过的种族/类型（对齐 GoW `TroopType`）。
 * 从数据实时派生，不手写常量表，避免数据更新后失同步。供宿主快照校验使用。
 */
export function knownTroopTypes(): Set<string> {
  const types = new Set<string>();
  for (const troop of TROOPS) for (const type of troop.troopTypes) types.add(type);
  return types;
}

/** 按种族/类型筛选（匹配任一 troopType） */
export function troopsByType(troopType: string): TroopData[] {
  return TROOPS.filter((t) => t.troopTypes.includes(troopType));
}

/**
 * 把兵种适配为引擎 Character。
 *
 * 法力模型已与 GoW 对齐（单一法力条 + manaColors + manaCost），magic 已接入。
 * 以下缺口仍待后续阶段（见 troops-gap-analysis.md）：
 *
 *  - GAP-3 skillId：数据里技能是自然语言描述，引擎需要注册表键。
 *      暂统一指向 'none'（无实现），技能名/描述另存于 TroopData 供 UI。
 *  - GAP-4 traits：特质是纯文本，引擎无被动/羁绊系统，暂全部忽略。
 *  - GAP-5 hp：引擎只有单一 hp，GoW 的 life 与 armor 是两条独立耐久，此处 maxHp=health。
 */
export function troopToCharacter(troop: TroopData, id: number, level = OFFICIAL_MAX_LEVEL): Character {
  const colors = troop.manaColors.length > 0 ? troop.manaColors : [BaseColor.Brown];
  // 默认 20 级：与 GoW 满级口径一致，也保持既有调用方行为不变
  const stats = troopStatsAtLevel(troop, level);

  return {
    id,
    name: troop.name,
    maxHp: stats.health, // GAP-5
    hp: stats.health,
    attack: stats.attack,
    armor: stats.armor,
    magic: stats.magic,
    colors: [...colors],
    manaCost: troop.manaCost,
    mana: 0,
    // 技能 id = 兵种 spell.id 字符串；技能库(SKILL_LIBRARY)按此键提供原型，
    // 未配置则运行时回退"仅扣法力"（需求 1.4/1.5）。
    skillId: String(troop.spell.id),
    statuses: [],
    defeated: false,
    // 特质 code 直接透传；引擎未实现的 code 在编译被动时安全忽略（原 GAP-4 已落地）
    traitIds: troop.traits.map((t) => t.code),
    // 种族光环（族亲/之盾）按 troopTypes 筛选受益对象
    troopTypes: [...troop.troopTypes],
    kingdom: troop.kingdom ?? undefined,
    ...(troop.kingdomId != null ? { kingdomId: troop.kingdomId } : {}),
  };
}

/** 便捷：随机抽取 n 个兵种组成一支队伍的 Character 数组（用于演示/测试对局） */
export function draftCharacters(troops: TroopData[], baseId: number): Character[] {
  return troops.map((t, i) => troopToCharacter(t, baseId + i));
}

/**
 * 召唤物属性模板：把一个兵种 referenceName 映射为召唤所需的引擎属性
 * （不含 id/defeated/statuses，由引擎在召唤时补齐）。找不到兵种返回 null。
 * 供 TurnEngine.setSummonResolver 注入，实现「召唤技能引用具体兵种」（需求 7）。
 */
export function troopToSummonTemplate(
  referenceName: string,
  arenaRules = false,
): Omit<Character, 'id' | 'defeated' | 'statuses'> | null {
  const troop = getTroopByRef(referenceName);
  if (!troop) return null;
  const colors = troop.manaColors.length > 0 ? troop.manaColors : [BaseColor.Brown];
  const stats = troopStatsAtLevel(troop, arenaRules ? 15 : OFFICIAL_MAX_LEVEL);
  return {
    name: troop.name,
    maxHp: stats.health,
    hp: stats.health,
    attack: stats.attack,
    armor: stats.armor,
    magic: stats.magic,
    colors: [...colors],
    manaCost: troop.manaCost,
    mana: 0,
    skillId: String(troop.spell.id),
    traitIds: arenaRules ? [] : troop.traits.map(t => t.code),
    troopTypes: [...troop.troopTypes],
    kingdom: troop.kingdom ?? undefined,
    ...(troop.kingdomId != null ? { kingdomId: troop.kingdomId } : {}),
  };
}
