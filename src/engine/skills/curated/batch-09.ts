/**
 * 人工核对组装 · 批次 09（池：scripts/curated-pools/pool-09.json）
 * 核对者：agent 批次 09
 *
 * 语义裁定备注：
 * - 「窃取 X 点生命值」= 伤害 + drain（batch-01 7302 同口径）；「窃取法力值/魔法值」= steal
 *   同属性回填（「魔法值」= magic 属性，SOP 措辞裁定）。
 * - 「窃取攻击力并转化为生命值」（8597）= steal stat:'attack' + gainStat:'hp'（BuffStat 含 hp）。
 * - 「绿色盟友」= 施法方关联绿色法力色的盟友 → modifier source alliesOfColor（spell-rules §1 来源表）；
 *   「建造盟友」= Construct 种族（§6 种族表查询）。
 * - 修饰段归属：来源子句未点名段（「数值因…增强」）→ 挂最近数值段（spell-rules §1），
 *   8799 的加成挂创造段（紧随「创造 2 颗棕色宝石」子句）。
 */
import { skill, dmg, dmgSplash, steal, createGems, createSkulls, transform } from '../builders';
import { BaseColor } from '../../types';
import type { CuratedBatch } from './index';

const SKIPPED: { id: number; reason: string }[] = [
  { id: 8534, reason: '语义拿不准（「一名敌人和一名随机敌人」共用水一段缩放的复合目标；「若敌人是建造，则爆破 8 颗宝石」为目标相对条件挂无目标段（爆破宝石）——无从判定整段跳过，SOP 条件触发裁定不可如此组装）' },
  { id: 8535, reason: '语义拿不准（「若队伍里有尔福·哈利干」特定兵种在场条件触发）' },
  { id: 8537, reason: '语义拿不准（「前 2 位/最弱的 2 位/最强的 2 位盟友」的增益段：buff 族构造函数签名不含 n，N 目标增益无法用组装器词汇表达）' },
  { id: 8555, reason: '「获得一个藏宝图」= 战斗外收集物，本作无对应系统（batch-05 7279 同款）' },
  { id: 8556, reason: '语义拿不准（「如果该盟友来自神堂，则为其附魔」：附魔无原语，来源条件也不支持）' },
    { id: 8572, reason: '语义拿不准（「陷入一个随机的状态效果」随机状态无原语）' },
  { id: 8611, reason: '语义拿不准（「对他和他下面的所有敌人」位置型复合目标，目标措辞表未覆盖）' },
    { id: 8630, reason: '二次缩放来源不支持（元素星为特殊宝石）' },
  { id: 8632, reason: '特殊宝石（创建 2 颗元素星）' },
  { id: 8633, reason: '特殊宝石（创建 2 颗元素星）' },
  { id: 8634, reason: '特殊宝石（创建 2 颗元素星）' },
  { id: 8635, reason: '特殊宝石（创建 2 颗元素星）' },
  { id: 8639, reason: '句子式不明（「造成…散射伤害」未指明目标，batch-02 7265 同款；二次缩放来源元素星亦不支持）' },
  { id: 8657, reason: '语义拿不准（「爆破一颗法力宝石…拥有此颜色法力的敌人」跨段动态颜色绑定，动态颜色不做）' },
    { id: 8678, reason: '句子式不明（「造成…散射伤害」未指明目标，batch-02 7265 同款——2026-09-16 回收 triage 复核发现；紫色宝石数 + 紫色盟友数双来源本身已可用 sources[] 表达，见 batch-33 8366 同构）' },
  { id: 8686, reason: '语义拿不准（「消除…随机技能值」无对应削减原语，随机属性只支持获得）' },
  { id: 8690, reason: '语义拿不准（「所有受伤害的敌人」跨段指回前段溅射伤害目标）' },
  { id: 8691, reason: '语义拿不准（「个别有 50% 几率击晕他们」逐目标独立概率，chance 原语为段级一掷）' },
    { id: 8704, reason: '语义拿不准（「陷入一个随机状态」随机状态无原语）' },
    { id: 8733, reason: '特殊宝石（天使宝石）' },
  { id: 8735, reason: '伤害区间（[(魔法 / 2) + 1] – [魔法 + 2]，不做清单待顺路批次）' },
  { id: 8741, reason: '语义拿不准（「引爆 2 颗与其法力颜色相同的宝石」按目标法力色动态选色，动态颜色不做）' },
  { id: 8787, reason: '缺失状态（狂怒）' },
  { id: 8803, reason: '特殊宝石（恶石像鬼宝石）' },
  { id: 8813, reason: '特殊宝石（随机石像鬼宝石，且数量「1-2 颗」为区间创造）' },
  { id: 8815, reason: '二次缩放来源不支持（石像鬼宝石与石块数量——GEMS-SEMANTICS-2 B4/B5，状态宝石波A未含，等后续波）' },
];

const SPELLS: CuratedBatch['spells'] = [
  {
    id: 8540,
    desc: '对 2 名随机敌人造成 [魔法 + 2] 点伤害，伤害值因骷髅头数而增强。 [3:1]',
    build: skill(
      // 「伤害值因…增强」点名伤害段；「因骷髅头数」= boardSkulls（spell-rules §1 样例亡魂同款）
      dmg('enemyRandomN', 2, 1, {
        n: 2,
        modifier: { mod: { kind: 'ratio', a: 3, b: 1 }, source: { kind: 'boardSkulls' } },
      }),
    ),
  },
  {
    id: 8597,
    desc: '窃取第一个敌人的 [魔法 + 1] 点攻击力，由绿色盟友的增强，并将其转化为生命值。 [x2]',
    build: skill(
      // 「窃取攻击力并转化为生命值」= stat:'attack' + gainStat:'hp'（SOP 窃取句式表）
      // 「由绿色盟友的增强」= alliesOfColor 'Green'（法力色关联盟友数）
      steal('enemyFront', 'attack', 'hp', 1, 1, {
        modifier: { mod: { kind: 'multiplier', a: 2 }, source: { kind: 'alliesOfColor', color: BaseColor.Green } },
      }),
    ),
  },
  {
    id: 8612,
    desc: '对一名敌人造成 [魔法 + 3] 点伤害。若敌人身亡则创造 10 颗骷髅头。',
    build: skill(
      dmg('enemyChosen', 3),
      createSkulls(10, 0, { ifTargetDied: true }),
    ),
  },
  {
    id: 8615,
    desc: '对所有敌人造成 [魔法 + 2] 点伤害，伤害值因骷髅头数而增强。 [2:1]',
    build: skill(
      dmg('enemyAll', 2, 1, {
        range: 'all',
        modifier: { mod: { kind: 'ratio', a: 2, b: 1 }, source: { kind: 'boardSkulls' } },
      }),
    ),
  },
  {
    id: 8676,
    desc: '窃取一名敌人 [(魔法 x 0.75) + 1] 点生命值，4 点法力值和 2 点魔法值。',
    build: skill(
      // 「窃取 X 点生命值」= 伤害 + drain（batch-01 7302 同口径）
      dmg('enemyChosen', 1, 0.75, { drain: true }),
      steal('enemyChosen', 'mana', 'mana', 4, 0),
      // 「魔法值」= magic 属性（SOP 措辞裁定）
      steal('enemyChosen', 'magic', 'magic', 2, 0),
    ),
  },
  {
    id: 8742,
    desc: '将所有红色宝石转换成绿色宝石，和所有黄色宝石转换成棕色宝石。',
    build: skill(
      transform(BaseColor.Red, BaseColor.Green),
      transform(BaseColor.Yellow, BaseColor.Brown),
    ),
  },
  {
    id: 8786,
    desc: '创造 5 颗黄色宝石，再将所有黄色宝石转换成棕色。',
    build: skill(
      createGems(BaseColor.Yellow, 5, 0),
      transform(BaseColor.Yellow, BaseColor.Brown),
    ),
  },
  {
    id: 8794,
    desc: '窃取一名敌人 10 点护甲值。再对一名敌人造成 [魔法 + 3] 点轻微溅射伤害。',
    build: skill(
      steal('enemyChosen', 'armor', 'armor', 10, 0),
      dmgSplash('enemyChosen', 3),
    ),
  },
  {
    id: 8799,
    desc: '对一名敌人造成 [魔法 + 4] 点伤害，再创造 2 颗棕色宝石，数值因建造盟友数而增强。 [x2]',
    build: skill(
      dmg('enemyChosen', 4),
      // 「数值」未点名归属段 → 挂最近数值段 = 创造段（spell-rules §1 修饰段归属）；
      // 「建造盟友」= Construct 种族（§6 种族表）
      createGems(BaseColor.Brown, 2, 0, {
        modifier: { mod: { kind: 'multiplier', a: 2 }, source: { kind: 'alliesOfRace', race: 'Construct' } },
      }),
    ),
  },
];

export const BATCH_09: CuratedBatch = { batch: '09', spells: SPELLS, skipped: SKIPPED };
