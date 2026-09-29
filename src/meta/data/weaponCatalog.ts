import { spellDescription } from '../../data/combatText';
/**
 * 官方 718 目录武器 → meta 武器域（UX 阶段 B · 窗口 M 批次 1 重写）。
 *
 * 数据源 `src/data/weapons.json`（中文化全量、718 行）× 已编译武器法术
 * （curated W 系批次 `collectWeaponCurated().byId`：spellId → SkillPrototype）。
 * id 约定：`gw_<referenceName>`。首批 20 把自造 `w_*` 已整表退役（见 data/weapons.ts 头注），
 * 因此**这是主角武器的唯一来源**。
 *
 * 本轮修掉的三件事（阶段 A 编号 H-5 / C-4 / 无编号真 bug）：
 *  ① 旧实现建 `CatalogWeaponDef` 时**把一半字段扔了**——`affixes` 写死 `[]`（json 侧 710/718 把有词缀）、
 *    `attack/armor/health/magic` 四维（718/718 有）与 `role/roleName/masteryRequirement` 压根没搬。
 *    武器详情面板「看不到具体属性」（UX-1 用户原话）有一半是这里造成的，不是数据缺失。
 *  ② 旧实现只导出「可装备的 703 把」，图鉴要浏览的另外 15 把 mana-only 占位武器拿不到 →
 *    现在 `ALL_CATALOG_WEAPONS` 全量 718，`CATALOG_WEAPONS` 仍是装备池。
 *  ③ **`weaponType` 归一**：`classes.json` 的天赋条件 `selfStatIfWeapon` 用 13 个类型键，其中
 *    `relic` 出现 8 次；而官方 json 里这一类叫 `Artifact`（65 把）。旧实现只做 `toLowerCase()`
 *    → `'artifact'`，于是**这 8 条天赋对 718 把里任何一把都不生效**。见 normalizeWeaponType。
 */
import catalogJson from '../../data/weapons.json';
import { BaseColor } from '../../engine/types';
import type { MetaSave } from '../state/schema';
import { collectWeaponCurated } from '../../engine/skills/curated/index';
import {
  LEGACY_WEAPON_REMAP,
  isStarterWeapon,
  resolveWeaponId,
  STARTER_WEAPON_IDS,
  type WeaponAffix,
  type WeaponDef,
} from './weapons';

/** 兼容旧导入路径；稀有度中文名与颜色的实际单源在 rarity.ts。 */
export { RARITY_ZH } from './rarity';

/** 兼容别名：假数据退役后武器只有一种形状（见 data/weapons.ts 的 WeaponDef 头注） */
export type CatalogWeaponDef = WeaponDef;

/** `src/data/weapons.json` 单行（字段全貌与 scripts/build_weapons.mjs 的产出一一对应） */
interface CatalogJsonRow {
  id: number;
  name: string;
  nameEn: string;
  referenceName: string;
  rarity: string;
  rarityIdx: number;
  kingdom: string;
  weaponType: string;
  role: string | null;
  roleName: string | null;
  attack: number;
  armor: number;
  health: number;
  magic: number;
  manaColors: string[];
  manaCost: number;
  spell: { id: number; name: string; description: string };
  affixes: WeaponAffix[];
  masteryRequirement: number;
  imageFile: string;
  releaseDate: string | null;
  immortal: boolean;
}

const CATALOG = catalogJson as unknown as CatalogJsonRow[];

/**
 * 官方 `WeaponType` → 本项目类型键（小写）。
 *
 * 唯一需要改名的是 **`Artifact` → `relic`**：天赋条件词表（`classes.json` 的
 * `selfStatIfWeapon.weaponType`）用的是 `relic`，官方武器数据用的是 `Artifact`，
 * 两边不通就有 8 条天赋永久空转。归一到天赋侧的词，因为天赋词表是 38 职业 × 3 树 × 7 档
 * 的生成产物（`data/classes.json`，不是我的领地），而武器侧只有这一个函数。
 *
 * 其余 13 种官方类型（Sword/Bow/Axe/Polearm/Staff/Hammer/Dagger/Missile/Tome/Mace/
 * Scythe/Shield/Jewellery）小写后即与天赋词表一致。
 */
const WEAPON_TYPE_ALIASES: Readonly<Record<string, string>> = {
  artifact: 'relic',
};

export function normalizeWeaponType(raw: string | null | undefined): string | null {
  const lower = (raw ?? '').toLowerCase();
  if (!lower) return null;
  return WEAPON_TYPE_ALIASES[lower] ?? lower;
}

/**
 * 武器类型与法力色中文词表。
 *
 * 稀有度映射已集中到 rarity.ts；这里的类型键统一使用归一后的小写形式（含 `relic`）。
 */
export const TYPE_ZH: Readonly<Record<string, string>> = {
  sword: '剑',
  bow: '弓',
  axe: '斧',
  polearm: '长柄',
  staff: '法杖',
  hammer: '锤',
  dagger: '匕首',
  missile: '投掷',
  tome: '魔典',
  mace: '钉锤',
  scythe: '镰',
  shield: '盾',
  relic: '神器',
  jewellery: '首饰',
};

export const COLOR_ZH: Readonly<Record<string, string>> = {
  red: '红',
  blue: '蓝',
  green: '绿',
  yellow: '黄',
  purple: '紫',
  brown: '棕',
};

/** 武器类型中文名（未知键回落「武器」） */
export function weaponTypeZh(type: string | null | undefined): string {
  return TYPE_ZH[type ?? ''] ?? '武器';
}

const prototypeById = collectWeaponCurated().byId;
const byGwId = new Map<string, WeaponDef>();

function buildDef(row: CatalogJsonRow): WeaponDef {
  const id = `gw_${row.referenceName}`;
  const skill = prototypeById.get(row.spell.id) ?? null;
  return {
    id,
    name: row.name,
    nameEn: row.nameEn,
    weaponType: normalizeWeaponType(row.weaponType),
    rarity: row.rarity,
    rarityIdx: row.rarityIdx,
    kingdom: row.kingdom,
    role: row.role,
    roleName: row.roleName,
    attack: row.attack,
    armor: row.armor,
    health: row.health,
    magic: row.magic,
    manaColors: row.manaColors as BaseColor[],
    manaCost: Math.min(100, Math.max(1, row.manaCost)),
    description: spellDescription(row.spell.id, row.spell.description),
    spellName: row.spell.name,
    spellId: row.spell.id,
    skill,
    equippable: skill !== null,
    imageFile: row.imageFile,
    masteryRequirement: row.masteryRequirement,
    releaseDate: row.releaseDate,
    immortal: row.immortal,
    affixes: row.affixes ?? [],
    starter: isStarterWeapon(id),
  };
}

/** **全量 718 把**（含 mana-only 占位）——图鉴「全部」tab 的数据源 */
export const ALL_CATALOG_WEAPONS: readonly WeaponDef[] = CATALOG.map((row) => {
  const def = buildDef(row);
  byGwId.set(def.id, def);
  return def;
});

/** **装备池**（有编译原型的那些；mana-only 占位不进——装上只会「仅扣法力」） */
export const CATALOG_WEAPONS: readonly WeaponDef[] = ALL_CATALOG_WEAPONS.filter((w) => w.equippable);

/** 起始池实例（零解锁条件、每份存档隐式拥有） */
export const STARTER_WEAPONS: readonly WeaponDef[] = STARTER_WEAPON_IDS.flatMap((id) => {
  const w = byGwId.get(id);
  return w ? [w] : [];
});

/** `gw_*` id → 目录武器（全量 718，含不可装备的占位） */
export function catalogWeaponById(id: string | null): WeaponDef | undefined {
  if (!id) return undefined;
  return byGwId.get(id);
}

/**
 * 统一武器解析：先把旧 `w_*` 经退役映射归一，再查目录。
 * 老档在 schema v4 迁移落地前也能正确解析（见 weapons.ts resolveWeaponId）。
 */
export function anyWeaponById(id: string | null): WeaponDef | undefined {
  return catalogWeaponById(resolveWeaponId(id));
}

/**
 * 玩家拥有的武器 id 集合（**去重 + 归一**）：起始池 ∪ 存档 `unlockedWeapons`。
 *
 * 起始池不写进存档（存档不膨胀、老档自动获得），所以「拥有」这件事必须过这个函数，
 * 不能直接读 `save.hero.unlockedWeapons`。返回顺序稳定：起始池按 STARTER_WEAPON_IDS 序，
 * 其后是存档解锁序（锻造先后）。
 */
export function ownedWeaponIds(save: MetaSave): string[] {
  const out: string[] = [...STARTER_WEAPON_IDS];
  const seen = new Set(out);
  for (const raw of save.hero.unlockedWeapons) {
    const id = resolveWeaponId(raw);
    if (!id || seen.has(id) || !byGwId.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

/** 玩家拥有的武器实例（同 ownedWeaponIds 的顺序口径） */
export function ownedWeapons(save: MetaSave): WeaponDef[] {
  return ownedWeaponIds(save).flatMap((id) => {
    const w = byGwId.get(id);
    return w ? [w] : [];
  });
}

/** 是否已拥有（起始池算拥有） */
export function ownsWeapon(save: MetaSave, id: string): boolean {
  const resolved = resolveWeaponId(id);
  if (!resolved) return false;
  if (isStarterWeapon(resolved)) return true;
  return save.hero.unlockedWeapons.some((raw) => resolveWeaponId(raw) === resolved);
}

/** 目录武器的官方卡面（`public/static/weapons/`；718/718 零缺失，故不返回 null） */
export function catalogIconUrl(w: { imageFile?: string }): string | null {
  return w.imageFile ? `/static/weapons/${w.imageFile}` : null;
}

/** 类型守卫：是否目录武器 id */
export function isCatalogId(id: string): boolean {
  return id.startsWith('gw_');
}

/** 类型守卫：是否已退役的假数据 id（旧档兼容判定用） */
export function isLegacyWeaponId(id: string): boolean {
  return Object.prototype.hasOwnProperty.call(LEGACY_WEAPON_REMAP, id);
}
