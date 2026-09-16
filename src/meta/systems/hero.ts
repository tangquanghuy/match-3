/**
 * 主角系统（M5）——等级/经验、职业装备与升级、武器装备、天赋解锁。
 *
 * 口径：
 *  - 主角经验来自战斗胜利（结算钩子调用 addHeroXp，多级一次连升）；
 *  - 职业经验只在「主角编入队伍」的胜场里积累（与职业绑定）；
 *  - 职业解锁 = 王国任务链 8 关通关（settlement 写 unlockedClasses，本模块只做装备校验）；
 *  - 武器 = 主角唯一施法手段：解锁条件见 data/weapons.ts（职业 10/20 级、通用按主角等级）；
 *  - 天赋按职业等级自动生效（5/20/40/60/80），只输出已实现特质 code（traitIndex）。
 */
import type { LeveledStats } from '../../data/leveling';
import { TRAIT_LIBRARY } from '../../engine/traits';
import type { MetaSave } from '../state/schema';
import { fail, type MetaFailure } from '../types';
import {
  classById,
  classXpToNext,
  heroStatsAt,
  heroXpToNext,
  CLASS_MAX_LEVEL,
} from '../data/hero';
import { weaponById, type WeaponDef } from '../data/weapons';

const KNOWN_CODES: ReadonlySet<string> = new Set(TRAIT_LIBRARY.map((t) => t.code));

/** 主角四维（不含王国加成——那是全体部队属性，桥接时统一加） */
export function heroStatsOf(save: MetaSave): LeveledStats {
  return heroStatsAt(save.hero.level);
}

export function classLevelOf(save: MetaSave, classId: string): number {
  return save.hero.classLevels[classId] ?? 0;
}

/** 当前职业的已生效天赋 code（过滤到引擎已实现集合） */
export function activeTalentCodes(save: MetaSave): string[] {
  const classId = save.hero.classId;
  if (!classId) return [];
  const def = classById(classId);
  const level = classLevelOf(save, classId);
  if (!def || level <= 0) return [];
  return def.talents
    .filter((t) => level >= t.level && KNOWN_CODES.has(t.code))
    .map((t) => t.code);
}

/** 主角加经验：可能连升多级；返回 {levelsGained, newLevel} */
export function addHeroXp(save: MetaSave, amount: number): { levelsGained: number; newLevel: number } {
  let gained = 0;
  save.hero.xp += Math.max(0, Math.floor(amount));
  while (save.hero.level < 100 && save.hero.xp >= heroXpToNext(save.hero.level)) {
    save.hero.xp -= heroXpToNext(save.hero.level);
    save.hero.level += 1;
    gained += 1;
  }
  return { levelsGained: gained, newLevel: save.hero.level };
}

/** 职业加经验（未装备/未解锁的职业不动） */
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

/** 武器是否可用（不解锁，只判定） */
export function canUseWeapon(save: MetaSave, weapon: WeaponDef): boolean {
  if (weapon.classId === null) return save.hero.level >= weapon.unlockLevel;
  return (
    save.hero.classId === weapon.classId &&
    classLevelOf(save, weapon.classId) >= weapon.unlockLevel
  );
}

/** 装备武器：校验职业与等级，自动记入 unlockedWeapons */
export function equipWeapon(save: MetaSave, weaponId: string): { ok: true; weaponId: string } | MetaFailure {
  const weapon = weaponById(weaponId);
  if (!weapon) return fail('INVALID', `未知武器：${weaponId}`);
  if (weapon.classId !== null) {
    const def = classById(weapon.classId);
    if (save.hero.classId !== weapon.classId) {
      return fail('PREREQ_LOCKED', `「${weapon.name}」需要装备职业：${def?.name ?? weapon.classId}`);
    }
    if (classLevelOf(save, weapon.classId) < weapon.unlockLevel) {
      return fail('PREREQ_LOCKED', `「${weapon.name}」需要职业等级 ${weapon.unlockLevel}`);
    }
  } else if (save.hero.level < weapon.unlockLevel) {
    return fail('PREREQ_LOCKED', `「${weapon.name}」需要主角等级 ${weapon.unlockLevel}`);
  }
  if (!save.hero.unlockedWeapons.includes(weaponId)) save.hero.unlockedWeapons.push(weaponId);
  save.hero.equippedWeapon = weaponId;
  return { ok: true, weaponId };
}

/** 当前装备的武器（可能为 null——桥接回退为「无施法」快照） */
export function equippedWeaponOf(save: MetaSave): WeaponDef | null {
  return weaponById(save.hero.equippedWeapon) ?? null;
}
