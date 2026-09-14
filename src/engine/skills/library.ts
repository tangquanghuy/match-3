/**
 * 技能库（窗口 B · 组装器消费端）。
 *
 * 组成（优先级从高到低）：
 *   1. SKILL_OVERRIDES —— 早期逐条手写的条目（行为保持不变，测试覆盖）；
 *   2. curated 批次 —— 人工核对组装结果（src/engine/skills/curated/，
 *      SOP 见 scripts/spell-assembler.md，语义依据 scripts/spell-rules.md）。
 *
 * key = 兵种 spell.id（troops.json）。校验测试（tests/unit/spellData.test.ts）保证：
 * 批内 desc 与 troops.json 逐字一致、枚举白名单、护栏、全量烟雾执行。
 * 未配置的技能运行时回退"仅扣法力"（引擎既有契约），不崩溃。
 */
import { BaseColor } from '../types';
import type { SkillPrototype } from './prototypes';
import { collectCurated } from './curated';
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
 * 早期手写条目（skillId → 原型）。优先级最高；新内容请进 curated 批次，别再加这里。
 */
export const SKILL_OVERRIDES: Record<number, SkillPrototype> = {
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

const curated = collectCurated();

/** 组装器全表：overrides 覆盖 curated（key = String(spellId)） */
export const SKILL_LIBRARY: Record<number, SkillPrototype> = {};
for (const [id, proto] of curated.byId) SKILL_LIBRARY[id] = proto;
for (const [id, proto] of Object.entries(SKILL_OVERRIDES)) SKILL_LIBRARY[Number(id)] = proto;

/** 核对后放弃的条目（覆盖率报告用） */
export function curatedSkipped(): { id: number; batch: string; reason: string }[] {
  return curated.skipped;
}

/** 已核对批次号 */
export function curatedBatches(): string[] {
  return curated.batches;
}

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
