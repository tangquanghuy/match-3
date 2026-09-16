/**
 * 主角与职业（M5）——成长曲线、经验表、8 职业定义。
 *
 * 曲线口径：主角 1~20 级复用部队官方成长形状（statAtLevel，锚点为设计值），
 * 21~100 沿同一曲线外推；职业等级 1~80，天赋 5 档（5/20/40/60/80，计划 §4.4）。
 * 职业天赋 = **既有特质 code**（PassiveModifiers 既有键，不新增引擎机制；
 * 也不动 traits.json——那是特质生成器的独占地盘）。
 * 职业解锁 = 对应王国任务链 8 关通关（结算钩子写 unlockedClasses）。
 */
import { statAtLevel, type LeveledStats, type StatKey } from '../../data/leveling';
import { KINGDOM_ORDER } from './kingdoms';

/** 主角四维锚点（设计值）：base = 1 级，max = 20 级 */
export const HERO_STAT_ANCHORS: Record<StatKey, { base: number; max: number }> = {
  health: { base: 20, max: 62 },
  armor: { base: 8, max: 24 },
  attack: { base: 6, max: 15 },
  magic: { base: 10, max: 27 },
};

/** 主角指定等级的四维（含 20 级后的外推段） */
export function heroStatsAt(level: number): LeveledStats {
  return {
    health: statAtLevel('health', HERO_STAT_ANCHORS.health.base, HERO_STAT_ANCHORS.health.max, level),
    armor: statAtLevel('armor', HERO_STAT_ANCHORS.armor.base, HERO_STAT_ANCHORS.armor.max, level),
    attack: statAtLevel('attack', HERO_STAT_ANCHORS.attack.base, HERO_STAT_ANCHORS.attack.max, level),
    magic: statAtLevel('magic', HERO_STAT_ANCHORS.magic.base, HERO_STAT_ANCHORS.magic.max, level),
  };
}

/** 主角升到下一级所需经验（设计值：80×等级^1.35，就近取 10） */
export function heroXpToNext(level: number): number {
  return Math.max(10, Math.round((80 * Math.pow(Math.max(level, 1), 1.35)) / 10) * 10);
}

/** 职业升到下一级所需经验（设计值：100 + 50×等级） */
export function classXpToNext(level: number): number {
  return 100 + 50 * Math.max(level, 1);
}

/** 职业等级上限（毕业武器在 20 级，天赋到 80 级满档） */
export const CLASS_MAX_LEVEL = 80;
/** 天赋解锁档位 */
export const CLASS_TALENT_LEVELS = [5, 20, 40, 60, 80] as const;

export interface ClassDef {
  id: string;
  name: string;
  /** 解锁王国（该王国任务链 8 关通关） */
  kingdom: string;
  /** 参与族亲光环的种族标签 */
  troopTypes: string[];
  description: string;
  /** 天赋 5 档：职业等级达标即生效（code 必须是已实现特质，见 traitIndex） */
  talents: { level: number; code: string }[];
}

/** 职业蓝图：按推进序绑前 8 个王国（破碎尖塔→骑士，与 GoW 的开局王国一致） */
const CLASS_BLUEPRINTS: Array<{
  id: string;
  name: string;
  kingdomIndex: number;
  troopTypes: string[];
  description: string;
  codes: [string, string, string, string, string];
}> = [
  { id: 'knight', name: '骑士', kingdomIndex: 0, troopTypes: ['Knight', 'Human'], description: '坚壁与庇护：受击增甲、全队续航。', codes: ['armored', 'sturdy', 'impervious', 'regeneration', 'fast'] },
  { id: 'berserker', name: '狂战士', kingdomIndex: 1, troopTypes: ['Warrior', 'Human'], description: '以伤换势：受击增攻、火系爆发。', codes: ['frenzy', 'firebrand', 'big', 'sturdy', 'fast'] },
  { id: 'cleric', name: '牧师', kingdomIndex: 2, troopTypes: ['Divine', 'Human'], description: '治疗与净化：全队回血、稳定续航。', codes: ['regeneration', 'armored', 'fast', 'sturdy', 'impervious'] },
  { id: 'necromancer', name: '死灵法师', kingdomIndex: 3, troopTypes: ['Monster', 'Human'], description: '亡魂联动：敌方死亡增魔、灵魂 affin。', codes: ['necromancy', 'big', 'sturdy', 'regeneration', 'impervious'] },
  { id: 'rogue', name: '盗贼', kingdomIndex: 4, troopTypes: ['Rogue', 'Human'], description: '先手爆发：高闪避起步、收割残血。', codes: ['fast', 'stoneskin', 'merchant', 'sturdy', 'airheart'] },
  { id: 'druid', name: '德鲁伊', kingdomIndex: 5, troopTypes: ['Fey', 'Human'], description: '自然共鸣：大体型成长与全队回血。', codes: ['big', 'regeneration', 'sturdy', 'armored', 'impervious'] },
  { id: 'sorcerer', name: '法师', kingdomIndex: 6, troopTypes: ['Mystic', 'Human'], description: '奥术洪流：施法增魔、法系爆发。', codes: ['airheart', 'firebrand', 'sturdy', 'fast', 'regeneration'] },
  { id: 'ranger', name: '游侠', kingdomIndex: 7, troopTypes: ['Elf', 'Human'], description: '鹰眼游击：先手与精准点名。', codes: ['fast', 'big', 'stoneskin', 'sturdy', 'merchant'] },
];

/** 8 职业定义（kingdom 取自王国推进序，序变则职业解锁王国跟随） */
export const CLASSES: readonly ClassDef[] = CLASS_BLUEPRINTS.map((bp) => ({
  id: bp.id,
  name: bp.name,
  kingdom: KINGDOM_ORDER[bp.kingdomIndex] ?? `王国#${bp.kingdomIndex}`,
  troopTypes: [...bp.troopTypes],
  description: bp.description,
  talents: bp.codes.map((code, i) => ({ level: CLASS_TALENT_LEVELS[i]!, code })),
}));

export function classById(id: string): ClassDef | undefined {
  return CLASSES.find((c) => c.id === id);
}

/** 王国 → 职业（任务链全通解锁） */
export function classByKingdom(kingdom: string): ClassDef | undefined {
  return CLASSES.find((c) => c.kingdom === kingdom);
}
