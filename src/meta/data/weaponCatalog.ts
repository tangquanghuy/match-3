/**
 * 718 目录武器 → meta 装备体系适配层（M5 扩容）。
 *
 * 官方目录（src/data/weapons.json，中文化全量）× 已编译武器技能（curated W 批次，
 * collectWeaponCurated().byId：spellId → SkillPrototype）= 可装备的目录武器。
 * id 约定：`gw_<referenceName>`（与 meta 首批 20 把 w_* 空间并存，存档 unlockedWeapons 直接混存）。
 *
 * 保真度口径：full/partial（战斗可用 706 把）可装备；mana-only（占位 8-12 把）不可装备——
 * 它们没有真实法术原型，装配进去只会「仅扣法力」，按诚实口径不进装备池。
 * 立绘：public/gowhead-icons/{imageFile}（官方卡面 webp）。
 */
import catalogJson from '../../data/weapons.json';
import type { SkillPrototype } from '../../engine/skills/prototypes';
import { BaseColor } from '../../engine/types';
import type { MetaSave } from '../state/schema';
import { collectWeaponCurated } from '../../engine/skills/curated/index';
import { WEAPONS } from './weapons';
import type { WeaponDef } from './weapons';

export interface CatalogWeaponDef extends WeaponDef {
  nameEn: string;
  /** 目录武器标记（与首批 20 把 w_* 区分） */
  gw: true;
  rarity: string;
  kingdom: string;
  /** 稀有度序（0=Common … 6=Doomed），排序用 */
  rarityIdx: number;
  imageFile: string;
  spellId: number;
  releaseDate: string | null;
  affixes: { name: string; description: string; rarity: string }[];
}

const CATALOG = catalogJson as unknown as CatalogJsonRow[];

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
  attack: number;
  armor: number;
  health: number;
  magic: number;
  manaColors: string[];
  manaCost: number;
  spell: { id: number; name: string; description: string };
  imageFile: string;
  releaseDate: string | null;
  immortal: boolean;
}

const prototypeById = collectWeaponCurated().byId;
const byGwId = new Map<string, CatalogWeaponDef>();

/** 可装备目录武器（full/partial——mana-only 无原型不进装备池） */
export const CATALOG_WEAPONS: CatalogWeaponDef[] = CATALOG.flatMap((w) => {
  const skill = prototypeById.get(w.spell.id);
  if (!skill) return []; // mana-only：无编译原型，不可装备
  const def: CatalogWeaponDef = {
    id: `gw_${w.referenceName}`,
    gw: true,
    name: w.name,
    nameEn: w.nameEn,
    classId: null,
    weaponType: (w.weaponType || '').toLowerCase() || null,
    unlockLevel: 1,
    manaColors: w.manaColors as BaseColor[],
    manaCost: Math.min(100, Math.max(1, w.manaCost)),
    description: w.spell.description,
    skill,
    rarity: w.rarity,
    kingdom: w.kingdom,
    rarityIdx: w.rarityIdx,
    imageFile: w.imageFile,
    spellId: w.spell.id,
    releaseDate: w.releaseDate,
    affixes: [],
  };
  byGwId.set(def.id, def);
  return [def];
});

/** gw_ 前缀 id → 目录武器（仅装备池内的） */
export function catalogWeaponById(id: string | null): CatalogWeaponDef | undefined {
  if (!id || !id.startsWith('gw_')) return undefined;
  return byGwId.get(id);
}

/** 统一武器解析：首批 20 把（w_*）优先，其次目录（gw_*）。找不到返回 undefined */
export function anyWeaponById(id: string | null): (WeaponDef & { gw?: boolean; rarity?: string; imageFile?: string }) | undefined {
  return WEAPONS.find((w) => w.id === id) ?? catalogWeaponById(id);
}

/** 存档中已拥有（已锻造）的目录武器 */
export function ownedCatalogWeapons(save: MetaSave): CatalogWeaponDef[] {
  const out: CatalogWeaponDef[] = [];
  for (const id of save.hero.unlockedWeapons) {
    const w = catalogWeaponById(id);
    if (w) out.push(w);
  }
  return out;
}

/** 目录武器的卡面图地址（public/gowhead-icons/） */
export function catalogIconUrl(w: { imageFile?: string; id: string }): string | null {
  return w.imageFile ? `/gowhead-icons/${w.imageFile}` : null;
}

/** 类型守卫：是否目录武器 id */
export function isCatalogId(id: string): boolean {
  return id.startsWith('gw_');
}

export type { SkillPrototype };
