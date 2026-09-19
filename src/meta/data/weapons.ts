/**
 * 主角武器（M5）——主角唯一施法手段（计划 §4.4）。
 *
 * 每把武器 = 一个 SkillPrototype（builders DSL，与 647 条部队法术同一管线）
 * + 法力色/耗蓝/描述/解锁条件。原型**注册进 meta 桥接注册表**
 * （battleBridge.buildMetaRegistry），不改 engine 技能库——那是技能窗口的地盘。
 * 首批 20 把：通用 4（主角等级解锁）+ 8 职业 × 2（冠军等级 10 / 20 解锁）。
 v2：classId 已对齐官方 38 职业表（berserker→warlord / cleric→priest / rogue→thief /
 druid→warden / ranger→archer，存档迁移同步改名）；weaponType 供天赋条件判定。
 官方口径是「每职业 1 把专属武器、250 胜解锁」，其余 30 职业的专属武器为已知缺口。
 */
import { BaseColor } from '../../engine/types';
import type { SkillPrototype } from '../../engine/skills/prototypes';
import {
  skill,
  dmg,
  dmgAll,
  heal,
  armor,
  attack,
  inflict,
  cleanse,
  createGems,
  transform,
  CHOSEN,
} from '../../engine/skills/builders';

export interface WeaponDef {
  id: string;
  name: string;
  /** null = 通用武器（按主角等级解锁）；否则需装备对应职业且职业等级达标 */
  classId: string | null;
  /**
   * 武器类型（官方 WeaponType 词表的小写键；null = 未标注）。
   * 天赋「使用 X 时获得 N 点属性」（selfStatIfWeapon）按它判定。
   */
  weaponType: string | null;
  /** 职业武器：所需职业等级；通用武器：所需主角等级 */
  unlockLevel: number;
  manaColors: BaseColor[];
  manaCost: number;
  description: string;
  skill: SkillPrototype;
}

/** 新档默认装备（保证主角一开始就有施法手段） */
export const STARTER_WEAPON_ID = 'w_univ_apprentice';

export const WEAPONS: readonly WeaponDef[] = [
  // —— 通用（主角等级解锁）——
  {
    id: 'w_univ_apprentice',
    name: '学徒法杖',
    classId: null,
    weaponType: 'staff',
    unlockLevel: 1,
    manaColors: [BaseColor.Blue, BaseColor.Yellow],
    manaCost: 10,
    description: '治疗 [魔法+5]。新人也能用的入门法杖。',
    skill: skill(heal('allySelf', 5)),
  },
  {
    id: 'w_univ_sword',
    name: '训练长剑',
    classId: null,
    weaponType: 'sword',
    unlockLevel: 3,
    manaColors: [BaseColor.Red, BaseColor.Brown],
    manaCost: 12,
    description: '对一名敌人造成 [魔法+6] 点伤害。',
    skill: skill(dmg('enemyFront', 6)),
  },
  {
    id: 'w_univ_bow',
    name: '猎手短弓',
    classId: null,
    weaponType: 'bow',
    unlockLevel: 6,
    manaColors: [BaseColor.Green, BaseColor.Yellow],
    manaCost: 12,
    description: '对最虚弱的敌人造成 [魔法+6] 点伤害。',
    skill: skill(dmg('enemyWeakest', 6)),
  },
  {
    id: 'w_univ_tome',
    name: '学者之书',
    classId: null,
    weaponType: 'tome',
    unlockLevel: 10,
    manaColors: [BaseColor.Blue, BaseColor.Purple],
    manaCost: 14,
    description: '对所有敌人造成 [魔法+4] 点伤害。',
    skill: skill(dmgAll(4)),
  },

  // —— 骑士 ——
  {
    id: 'w_knight_10',
    name: '守誓盾锤',
    classId: 'knight',
    weaponType: 'shield',
    unlockLevel: 10,
    manaColors: [BaseColor.Red, BaseColor.Brown],
    manaCost: 14,
    description: '全队获得 [魔法+2] 点护甲与 [魔法+3] 点生命。',
    skill: skill(armor('allyAll', 2), heal('allyAll', 3)),
  },
  {
    id: 'w_knight_20',
    name: '王国誓约',
    classId: 'knight',
    weaponType: 'sword',
    unlockLevel: 20,
    manaColors: [BaseColor.Red, BaseColor.Brown],
    manaCost: 16,
    description: '对一名敌人造成 [魔法+8] 点伤害，全队获得 [魔法+3] 点护甲。骑士毕业武器。',
    skill: skill(dmg('enemyFront', 8), armor('allyAll', 3)),
  },

  // —— 狂战士 ——
  {
    id: 'w_warlord_10',
    name: '狂战斧',
    classId: 'warrior',
    weaponType: 'axe',
    unlockLevel: 10,
    manaColors: [BaseColor.Red],
    manaCost: 13,
    description: '对一名敌人造成 [魔法+10] 点伤害。',
    skill: skill(dmg('enemyFront', 10)),
  },
  {
    id: 'w_warlord_20',
    name: '血怒战刃',
    classId: 'warrior',
    weaponType: 'axe',
    unlockLevel: 20,
    manaColors: [BaseColor.Red],
    manaCost: 18,
    description: '对一名敌人造成 [魔法+12] 点伤害，自身获得 [魔法+3] 点攻击。狂战士毕业武器。',
    skill: skill(dmg('enemyFront', 12), attack('allySelf', 3)),
  },

  // —— 牧师 ——
  {
    id: 'w_priest_10',
    name: '祈愿圣印',
    classId: 'priest',
    weaponType: 'jewellery',
    unlockLevel: 10,
    manaColors: [BaseColor.Blue, BaseColor.Yellow],
    manaCost: 12,
    description: '全队获得 [魔法+4] 点生命。',
    skill: skill(heal('allyAll', 4)),
  },
  {
    id: 'w_priest_20',
    name: '晨曦权杖',
    classId: 'priest',
    weaponType: 'staff',
    unlockLevel: 20,
    manaColors: [BaseColor.Blue, BaseColor.Yellow],
    manaCost: 16,
    description: '净化全队 1 个负面状态，全队获得 [魔法+6] 点生命。牧师毕业武器。',
    skill: skill(cleanse('allyAll'), heal('allyAll', 6)),
  },

  // —— 死灵法师 ——
  {
    id: 'w_necromancer_10',
    name: '魂引铃',
    classId: 'necromancer',
    weaponType: 'relic',
    unlockLevel: 10,
    manaColors: [BaseColor.Purple, BaseColor.Brown],
    manaCost: 13,
    description: '对最虚弱的敌人造成 [魔法+6] 点伤害，创造 3 颗紫色宝石。',
    skill: skill(dmg('enemyWeakest', 6), createGems(BaseColor.Purple, 3)),
  },
  {
    id: 'w_necromancer_20',
    name: '亡者之书',
    classId: 'necromancer',
    weaponType: 'tome',
    unlockLevel: 20,
    manaColors: [BaseColor.Purple],
    manaCost: 17,
    description: '使所有敌人中毒 3 回合，并对所有敌人造成 [魔法+3] 点伤害。死灵法师毕业武器。',
    skill: skill(inflict('poison', 'enemyAll', { turns: 3 }), dmg('enemyAll', 3)),
  },

  // —— 盗贼 ——
  {
    id: 'w_thief_10',
    name: '影匕',
    classId: 'thief',
    weaponType: 'dagger',
    unlockLevel: 10,
    manaColors: [BaseColor.Green, BaseColor.Purple],
    manaCost: 12,
    description: '对最虚弱的敌人造成 [魔法+8] 点伤害。',
    skill: skill(dmg('enemyWeakest', 8)),
  },
  {
    id: 'w_thief_20',
    name: '暗杀者之牙',
    classId: 'thief',
    weaponType: 'dagger',
    unlockLevel: 20,
    manaColors: [BaseColor.Purple],
    manaCost: 15,
    description: '对最虚弱与最后的敌人分别造成 [魔法+10]/[魔法+6] 点伤害。盗贼毕业武器。',
    skill: skill(dmg('enemyWeakest', 10), dmg('enemyLast', 6)),
  },

  // —— 德鲁伊 ——
  {
    id: 'w_warden_10',
    name: '荆棘杖',
    classId: 'warden',
    weaponType: 'staff',
    unlockLevel: 10,
    manaColors: [BaseColor.Green, BaseColor.Brown],
    manaCost: 12,
    description: '将指定颜色的 3 颗宝石转为绿色，自身获得 [魔法+3] 点生命。',
    skill: skill(transform(CHOSEN, BaseColor.Green, { count: 3 }), heal('allySelf', 3)),
  },
  {
    id: 'w_warden_20',
    name: '世界树枝',
    classId: 'warden',
    weaponType: 'staff',
    unlockLevel: 20,
    manaColors: [BaseColor.Green],
    manaCost: 16,
    description: '全队获得 [魔法+5] 点生命，创造 4 颗绿色宝石。德鲁伊毕业武器。',
    skill: skill(heal('allyAll', 5), createGems(BaseColor.Green, 4)),
  },

  // —— 法师 ——
  {
    id: 'w_sorcerer_10',
    name: '秘法宝珠',
    classId: 'sorcerer',
    weaponType: 'relic',
    unlockLevel: 10,
    manaColors: [BaseColor.Blue, BaseColor.Purple],
    manaCost: 13,
    description: '对所有敌人造成 [魔法+5] 点伤害。',
    skill: skill(dmgAll(5)),
  },
  {
    id: 'w_sorcerer_20',
    name: '星陨法典',
    classId: 'sorcerer',
    weaponType: 'tome',
    unlockLevel: 20,
    manaColors: [BaseColor.Blue],
    manaCost: 17,
    description: '对所有敌人造成 [魔法+7] 点伤害。法师毕业武器。',
    skill: skill(dmgAll(7)),
  },

  // —— 游侠 ——
  {
    id: 'w_archer_10',
    name: '游侠长弓',
    classId: 'archer',
    weaponType: 'bow',
    unlockLevel: 10,
    manaColors: [BaseColor.Green, BaseColor.Yellow],
    manaCost: 12,
    description: '对一名随机敌人造成 [魔法+7] 点伤害。',
    skill: skill(dmg('enemyRandom', 7)),
  },
  {
    id: 'w_archer_20',
    name: '鹰眼战弓',
    classId: 'archer',
    weaponType: 'bow',
    unlockLevel: 20,
    manaColors: [BaseColor.Green],
    manaCost: 16,
    description: '对最虚弱与一名随机敌人各造成 [魔法+8]/[魔法+6] 点伤害。游侠毕业武器。',
    skill: skill(dmg('enemyWeakest', 8), dmg('enemyRandom', 6)),
  },
];

export function weaponById(id: string | null): WeaponDef | undefined {
  if (!id) return undefined;
  return WEAPONS.find((w) => w.id === id);
}

/**
 * 武器稀有度（淬炼钢锭档的判定依据，2026-09-19 素材批）：
 * 首批 20 把按解锁档推导（通用 1~3 级=Common、6~10 级=Rare；职业 10 级=UltraRare、20 级=Epic）；
 * 718 目录武器用 weapons.json 自带的 rarity（systems/forgeOps 统一解析）。
 */
export function weaponRarity(w: WeaponDef): string {
  if (w.classId === null) return w.unlockLevel <= 3 ? 'Common' : 'Rare';
  return w.unlockLevel <= 10 ? 'UltraRare' : 'Epic';
}
