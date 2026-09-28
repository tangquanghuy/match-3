/**
 * 放弃桶回收批 R3（2026-09-17 用户裁定补充：随机状态按目标阵营分池——盟友正面/敌方负面；
 * 敌方颜色动态取色占位符 'ENEMY'（随机存活敌人的一种法力色）与 'LAST_TARGET'（跨段该敌人））。
 * 核对者：窗口 G，5 条。裁定依据 spell-rules §11 补充。
 */
import { skill, targetedSkill, dmg, heal, reduce, inflictRandom,
  createGems, transformToSpecial, transformTroop } from '../builders';
import { BaseColor } from '../../types';
import type { CuratedBatch } from './index';

const SKIPPED: { id: number; reason: string }[] = [];

const SPELLS: CuratedBatch['spells'] = [
  {
    id: 7521,
    desc: '给予所有盟友 [魔法 + 1] 点生命值，点数因棕色宝石数而增强。赋予一名随机盟友一项随机状态效果。 [3:1]',
    build: skill(
      // sa-R6：原生 CountGems Brown Amount 34 = [3:1]（R003，floor(n × 34%)）；原为每颗棕色 +3
      heal('allyAll', 1, 1, { modifier: { mod: { kind: 'ratio', a: 3, b: 1 }, source: { kind: 'boardGems', color: BaseColor.Brown } } }),
      inflictRandom('allyRandom'),
    ),
  },
  {
    id: 7994,
    desc: '对一名敌人造成 [魔法 + 4] 点伤害。赋予所有盟友一个随机状态效果。',
    build: skill(
      dmg('enemyChosen', 4),
      inflictRandom('allyAll'),
    ),
  },
  {
    id: 8428,
    desc: '消除一名敌人 [魔法 + 1] 点攻击力，再使其陷入 3 个随机状态效果。',
    build: skill(
      reduce('enemyChosen', 'attack', 1, 1),
      inflictRandom('enemyChosen', { times: 3 }),
    ),
  },
  {
    id: 7425,
    desc: '创造 7 颗指定敌人的法力颜色的宝石。有 20% 的几率将敌人转化为一只巨大毒菌。',
    // sa-R5 L1-6279: native CreateGems FromTarget + TransformEnemy@FromTarget 20% = the CHOSEN enemy
    // (was a random enemy's colour and a random enemy transformed). inputTarget: the colour source is an enemy.
    build: targetedSkill('enemyChosen',
      createGems('CHOSEN_TARGET', 7),
      { ...transformTroop('enemyChosen', 'GiantToadstool'), chance: 0.2 },
    ),
  },
  {
    id: 9957,
    desc: '从敌人身上吸取 6 点法力值，并将该敌人的一种法力颜色的所有宝石转化为毒宝石。',
    build: skill(
      // L3-007: native DecreaseMana (drain) — no refill to the caster
      reduce('enemyChosen', 'mana', 6, 0),
      transformToSpecial('LAST_TARGET', 'poisonGem'),
    ),
  },
];

export const BATCH_R3: CuratedBatch = { batch: 'R3', spells: SPELLS, skipped: SKIPPED };
