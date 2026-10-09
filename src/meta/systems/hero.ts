/**
 * 主角系统（M5/v2）——等级/经验、职业装备与冠军等级、武器装备。
 *
 * 口径：
 *  - 主角经验来自战斗胜利（结算钩子调用 addHeroXp，多级一次连升）；
 *  - 冠军（职业）经验只在「主角编入队伍」的胜场里积累（与职业绑定，上限 100）；
 *  - 职业解锁 = 王国任务链 8 关通关（settlement 写 unlockedClasses，本模块只做装备校验）；
 *  - 武器 = 主角唯一施法手段：全部来自官方目录（data/weaponCatalog.ts）；
 *    起始池 22 把零条件人人都有，其余按官方 MasteryRequirement 接线领取
 *    （主角等级 / 职业 250 胜 / 熔炉 / 通关王国后宝石商店，见 data/weaponAcquire.ts）；
 *  - 天赋树/职业特质的选取与解锁在 systems/talents.ts（v2：7 档三树选一，可随时改配）。
 */
import type { LeveledStats } from '../../data/leveling';
import type { MetaSave } from '../state/schema';
import { fail, type MetaFailure } from '../types';
import {
  classById,
  classXpToNext,
  heroStatsAt,
  heroXpToNext,
  CLASS_MAX_LEVEL,
  type ClassDef,
} from '../data/classes';
import type { WeaponDef } from '../data/weapons';
import { anyWeaponById, ownsWeapon } from '../data/weaponCatalog';
import { acquireOf, acquireProgress, kingdomQuestCleared } from '../data/weaponAcquire';
import { findRecipe } from '../data/soulforge';
import { isFailure } from '../gateway/types';
import { spend } from './wallet';
import { temperingLevelOf } from './forgeOps';
import { enqueueMasteryOffers } from './manaMastery';

const TEMPER_STAT_SEQUENCE = ['attack', 'armor', 'health', 'magic'] as const;

/** 前五级每级 +1 属性，后续等级解锁词缀；属性按攻/甲/生/魔轮转。 */
export function temperingBonusOf(save: MetaSave): LeveledStats {
  const weaponId = save.hero.equippedWeapon;
  const level = weaponId ? temperingLevelOf(save, weaponId) : 0;
  const bonus: LeveledStats = { health: 0, armor: 0, attack: 0, magic: 0 };
  const points = Math.min(Math.max(level, 0), 5);
  for (let i = 0; i < points; i++) {
    bonus[TEMPER_STAT_SEQUENCE[i % TEMPER_STAT_SEQUENCE.length]!] += 1;
  }
  return bonus;
}

/**
 * 主角战斗面板四维（不含王国加成与天赋加成——桥接时统一加）。
 * = 已装备职业的官方基底 + 等级属性点 + 武器淬炼；未装备职业时用 HERO_BASE_WITHOUT_CLASS 兜底。
 */
export function heroStatsOf(save: MetaSave): LeveledStats {
  const base = heroStatsAt(save.hero.level, save.hero.classId);
  const temper = temperingBonusOf(save);
  return {
    health: base.health + temper.health,
    armor: base.armor + temper.armor,
    attack: base.attack + temper.attack,
    magic: base.magic + temper.magic,
  };
}

export function classLevelOf(save: MetaSave, classId: string): number {
  return save.hero.classLevels[classId] ?? 0;
}

export function classWinsOf(save: MetaSave, classId: string): number {
  return save.hero.classWins[classId] ?? 0;
}

/** 职业胜场 +1（携带主角并以该职业出战的胜利） */
export function addClassWin(save: MetaSave, classId: string): number {
  const next = classWinsOf(save, classId) + 1;
  save.hero.classWins[classId] = next;
  return next;
}

/** 主角加经验：可能连升多级；返回 {levelsGained, newLevel} */
export function addHeroXp(save: MetaSave, amount: number): { levelsGained: number; newLevel: number } {
  let gained = 0;
  const before = save.hero.level;
  save.hero.xp += Math.max(0, Math.floor(amount));
  while (save.hero.xp >= heroXpToNext(save.hero.level)) {
    save.hero.xp -= heroXpToNext(save.hero.level);
    save.hero.level += 1;
    gained += 1;
  }
  enqueueMasteryOffers(save, Math.max(0, Math.min(100, save.hero.level) - Math.min(100, before)));
  return { levelsGained: gained, newLevel: save.hero.level };
}

/** 冠军等级加经验（未装备/未解锁的职业不动；上限 CLASS_MAX_LEVEL=100） */
export function addClassXp(save: MetaSave, classId: string, amount: number): { levelsGained: number; newLevel: number } | null {
  if (!save.hero.unlockedClasses.includes(classId)) return null;
  const before = classLevelOf(save, classId);
  if (before <= 0) return null; // 从未装备的职业不积经验
  let level = before;
  save.hero.classXp[classId] = (save.hero.classXp[classId] ?? 0) + Math.max(0, Math.floor(amount));
  while (level < CLASS_MAX_LEVEL && save.hero.classXp[classId]! >= classXpToNext(level)) {
    save.hero.classXp[classId]! -= classXpToNext(level);
    level += 1;
  }
  if (level !== before) save.hero.classLevels[classId] = level;
  return { levelsGained: level - before, newLevel: level };
}

/** 装备职业：必须在已解锁列表里 */
export function equipClass(save: MetaSave, classId: string): { ok: true; classId: string } | MetaFailure {
  const def = classById(classId);
  if (!def) return fail('INVALID', `未知职业：${classId}`);
  if (!save.hero.unlockedClasses.includes(classId)) {
    return fail('PREREQ_LOCKED', `职业「${def.name}」未解锁：通关 ${def.kingdom} 任务链 8 关`);
  }
  save.hero.classId = classId;
  if (classLevelOf(save, classId) <= 0) save.hero.classLevels[classId] = 1;
  return { ok: true, classId };
}

/**
 * 武器是否可装备（只判定，不解锁）。
 *
 * 假数据退役后武器本身不再另挂等级/职业门槛：能装 = 已拥有 ∧ 有编译原型。
 * 未拥有的武器走 `claimWeapon`（官方解锁条件）或熔炉，而不是在装备时再判一次。
 */
export function canUseWeapon(save: MetaSave, weapon: WeaponDef): boolean {
  return weapon.equippable && ownsWeapon(save, weapon.id);
}

/**
 * 按获取途径领取武器（精通门槛、职业专属、宝石商店直购；王国包须先通关再买）。
 * 熔炉白名单仍走 `forgeCatalogWeapon`，这里会拒绝以免绕过消耗。
 */
export function claimWeapon(save: MetaSave, weaponId: string): { ok: true; weaponId: string } | MetaFailure {
  const weapon = anyWeaponById(weaponId);
  if (!weapon) return fail('INVALID', `未知武器：${weaponId}`);
  if (ownsWeapon(save, weapon.id)) return fail('INVALID', `「${weapon.name}」已拥有`);
  const acquire = acquireOf(weapon);
  if (acquire.kind === 'placeholder') {
    return fail('INVALID', `「${weapon.name}」是占位武器（无法术实现），不可领取`);
  }
  if (acquire.kind === 'forge') {
    return fail('INVALID', `「${weapon.name}」需在熔炉锻造`);
  }
  if (acquire.kind === 'buy') {
    if (acquire.kingdom && !kingdomQuestCleared(save, acquire.kingdom)) {
      return fail('PREREQ_LOCKED', `通关${acquire.kingdom}后于宝石商店购买`);
    }
    const paid = spend(save, { gems: acquire.gems ?? 0 });
    if (isFailure(paid)) return paid;
  } else {
    const progress = acquireProgress(save, acquire);
    if (!progress.ready) return fail('PREREQ_LOCKED', progress.hint);
  }
  if (!save.hero.unlockedWeapons.includes(weapon.id)) save.hero.unlockedWeapons.push(weapon.id);
  return { ok: true, weaponId: weapon.id };
}

/** 装备武器：校验所有权与可装备性；`gw_*` 之外（含已退役的 `w_*`）一律归一后再判 */
export function equipWeapon(save: MetaSave, weaponId: string): { ok: true; weaponId: string } | MetaFailure {
  const weapon = anyWeaponById(weaponId);
  if (!weapon) return fail('INVALID', `未知武器：${weaponId}`);
  if (!weapon.equippable) {
    return fail('INVALID', `「${weapon.name}」是占位武器（无法术实现），不可装备`);
  }
  if (!ownsWeapon(save, weapon.id)) {
    return fail('PREREQ_LOCKED', `「${weapon.name}」尚未拥有`);
  }
  // 起始池不写进存档（ownedWeaponIds 隐式并入）；非起始池的所有权在获取时已写入
  save.hero.equippedWeapon = weapon.id;
  return { ok: true, weaponId: weapon.id };
}

/**
 * 熔炉锻造：按配方白名单消耗灵魂+黄金，解锁一把目录武器（gw_* 命名空间）。
 * 档位门槛 / 重复拥有 / 资源原子扣费（wallet.spend）都在这里校验。
 */
export function forgeCatalogWeapon(
  save: MetaSave,
  weaponId: string,
  heroLevel?: number,
): { ok: true; weaponId: string } | MetaFailure {
  const recipe = findRecipe(weaponId);
  if (!recipe) return fail('INVALID', `熔炉没有该配方：${weaponId}`);
  const level = heroLevel ?? save.hero.level;
  if (level < forgeTierUnlockLevel(recipe.tier)) {
    return fail('PREREQ_LOCKED', `熔炉 Tier ${recipe.tier} 需要主角 ${forgeTierUnlockLevel(recipe.tier)} 级（当前 ${level}）`);
  }
  if (save.hero.unlockedWeapons.includes(weaponId)) {
    return fail('INVALID', `「${recipe.name}」已拥有`);
  }
  const paid = spend(save, { souls: recipe.souls, gold: recipe.gold });
  if (isFailure(paid)) return paid;
  save.hero.unlockedWeapons.push(weaponId);
  return { ok: true, weaponId };
}

function forgeTierUnlockLevel(tier: 1 | 2): number {
  return tier === 1 ? 20 : 40;
}

/** 当前装备的武器（可能为 null——桥接回退为「无施法」快照） */
export function equippedWeaponOf(save: MetaSave): WeaponDef | null {
  return anyWeaponById(save.hero.equippedWeapon) ?? null;
}

/** 当前装备职业（可空） */
export function equippedClassOf(save: MetaSave): ClassDef | null {
  return (save.hero.classId && classById(save.hero.classId)) || null;
}

/** 主角种族取当前职业，未装备职业时默认人类；与冠军等级无关。 */
export function heroTroopTypeOf(save: MetaSave): string {
  return equippedClassOf(save)?.troopType ?? 'Human';
}

/** 主角王国取当前装备武器的目录字段，与职业及冠军等级无关。 */
export function heroKingdomOf(save: MetaSave): string | undefined {
  return equippedWeaponOf(save)?.kingdom || undefined;
}
