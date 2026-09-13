/**
 * 技能库（手写配置）。
 *
 * 理念：技能 = 效果段的有序组合，逐条手写、配一个准一个。中文描述只作注释参考，
 * 不参与运行逻辑。key = 兵种 spell.id（troops.json 里 spell.id），值 = 技能原型。
 *
 * 数值用 builder 表达：dmg/heal/... 的 (base, mult) 对应 [魔法 × mult + base]，
 * mult 省略默认 1，纯常数用第三参 0。范围/真实伤害等用可选项或专用函数。
 *
 * 这份表会随开发逐步扩充。运行时由 registry 按 skillId 载入执行；未配置的技能
 * 自动回退"仅扣法力"（引擎既有契约），不崩溃。
 */
import { BaseColor } from '../types';
import type { SkillPrototype } from './prototypes';
import {
  skill,
  dmg,
  dmgAll,
  dmgSplash,
  createGems,
  transform,
  heal,
  inflict,
  CHOSEN,
} from './builders';

/**
 * skillId(=spell.id) → 技能原型。
 * 分组按兵种，注释写明中文原文，方便对照校对。手写、配一条准一条。
 */
export const SKILL_LIBRARY: Record<number, SkillPrototype> = {
  // 狙击手「狙击」：对 1 名敌人造成 [魔法 + 2] 点伤害。
  7004: skill(dmg('enemyFront', 2)),

  // 箭雨「箭雨」：对所有敌人造成 [魔法 + 2] 点伤害。
  7155: skill(dmgAll(2)),

  // 犀首兽「杀戮节庆」：对 1 名敌人造成 [魔法 + 2] 点轻微溅射伤害。
  7132: skill(dmgSplash('enemyFront', 2)),

  // 瓦尔基里「英灵再世」：将指定的法力颜色转换为蓝色。（"灵魂"是元资源本作未实现，省略）
  //   —— 用 CHOSEN 表达"指定颜色"：释放时由玩家/AI 选一个色转成蓝色。
  7062: skill(transform(CHOSEN, BaseColor.Blue)),

  // 毒蛇「剧毒蛇液」：使前 2 名敌人陷入中毒状态，并创造 9 颗红色宝石。获得 [魔法 + 1] 点生命值。
  7063: skill(
    inflict('poison', 'enemyFirstN', { n: 2 }), // 前 2 名敌人中毒（DoT 默认每回合伤害）
    createGems(BaseColor.Red, 9), // 创造 9 颗红色宝石
    heal('allySelf', 1), // 获得 [魔法 + 1] 点生命值
  ),
};

/**
 * 技能库里全部已配置的 skillId（字符串形式，与注册表 key 一致）。
 * 供宿主快照校验判断「这个技能客户端认不认」，不必先建注册表。
 */
export function skillLibraryIds(): string[] {
  return Object.keys(SKILL_LIBRARY);
}

/** 取某技能的原型；未配置返回 undefined（运行时回退仅扣法力） */
export function getSkillPrototype(spellId: number): SkillPrototype | undefined {
  return SKILL_LIBRARY[spellId];
}

/**
 * 把技能库全部原型注册进一个注册表映射（key = String(spellId)），供 castSkill 按角色 skillId 查执行。
 * registerInto 接收 `Map<string, SkillPrototype>`（即 ExtensionRegistry.prototypes）。
 */
export function registerSkillLibrary(prototypes: Map<string, SkillPrototype>): void {
  for (const [spellId, proto] of Object.entries(SKILL_LIBRARY)) {
    prototypes.set(String(spellId), proto);
  }
}
