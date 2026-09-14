/**
 * 人工核对组装 · 批次 06（池：scripts/curated-pools/pool-06.json）
 * 核对者：agent 批次06
 *
 * 语义裁定备注：
 * - 「宝石」不含骷髅（GoW 术语：Gem=色宝石，Skull=骷髅），随机宝石段 include:'color'。
 * - 「选定/指定类型的宝石」= 指定颜色 → CHOSEN（运行时选色，同 7062 先例）。
 * - 「魔法值」= magic 属性（spell-rules.md §3：「将之转为魔法值」→ gainStat='magic'）；
 *   「法力值」= mana 资源（「耗尽法力值」= drainMana）。
 * - 「前两名敌人」= enemyFirstN + n:2（确定性目标，跨段复用同一批目标，同 7063 先例）。
 * - 7663 的死亡条件：destroy 系构造函数无 opts 参，按 spell-rules.md §4「可挂任何段」
 *   在 builder 产物上直接补挂 ifTargetDied（GemSegment 继承 SegmentOptions，引擎统一裁决）。
 * - 多段「随机敌人」技能（7396/7500）：跨段会各自重掷随机目标，「其」无法绑定同一目标
 *   → 语义拿不准，SKIP（见 SKIPPED 备注）。
 */
import { skill, dmg, dmgSplash, trueDmg, heal, armor, magic, reduce,
  cleanse, createGems, transform, destroyColor, explodeColor, explodeRandomGems, inflict,
  drainMana, CHOSEN } from '../builders';
import { BaseColor } from '../../types';
import type { CuratedBatch } from './index';

const SKIPPED: { id: number; reason: string }[] = [
  { id: 7374, reason: '句子式不明（「造成 1 到 5 项随机状态效果」：随机状态未指定具体状态，无法映射白名单）' },
  { id: 7396, reason: '语义拿不准（「两名随机敌人」的伤害/窃取/沉默须同一目标，跨段随机目标各自重掷无法绑定）' },
  { id: 7397, reason: '「击退至末位」隐匿/位置操作（不做清单）' },
  { id: 7413, reason: '语义拿不准（「获得下列其一」二选一分支无法表达；「将随机敌人转化为怨灵」兵种转化无原语）' },
  { id: 7471, reason: '句子式不明（「如果敌人的魔法值高于自身」属性比较条件无对应机制）' },
  { id: 7472, reason: '二次缩放来源不支持（「因敌人所需的法力值而增强」：targetStat 仅支持 attack/armor/hp/magic，无法力消耗）' },
  { id: 7479, reason: '二次缩放来源不支持（「屏障盟友数 + 巨人盟友数」复合来源无法用单一 source kind 表达）' },
  { id: 7484, reason: '语义拿不准（「恢复自身原有生命值」治疗量原文未给出，同 batch-01 7161）' },
  { id: 7500, reason: '语义拿不准（「1 名随机敌人…并将其冻结」跨段随机目标绑定问题，同 7396）' },
  { id: 7504, reason: '句子式不明（「两名最强大的敌人」无对应目标模式）' },
  { id: 7507, reason: '句子式不明（「减除其生命值」削减原语仅支持 attack/armor/magic/mana，无 hp）' },
  { id: 7532, reason: '句子式不明（「使上方和下方的敌人沉默」相邻位置目标无对应目标模式）' },
  { id: 7630, reason: '句子式不明（「再转化成诺斯费拉图」兵种转化无对应原语）' },
  { id: 7635, reason: '句子式不明（「摧毁自身」即死无对应原语）' },
  { id: 7648, reason: '句子式不明（「最后两名敌人」无对应目标模式；「此伤害为致命」亦无机制）' },
  { id: 7650, reason: '二次缩放来源不支持（「因被杀掉盟友和敌人数量而增强」：阵亡数来源不支持，teamSize 仅存活数且单侧）' },
  { id: 7664, reason: '句子式不明（「最虚弱的两名敌人」无对应目标模式）' },
  { id: 7668, reason: '句子式不明（「对其和其下方的所有敌人」位置目标无对应目标模式）' },
  { id: 7669, reason: '句子式不明（「对每一个使用其颜色的敌人造成伤害」按法力色匹配敌人无对应目标模式）' },
];

const SPELLS: CuratedBatch['spells'] = [
  {
    id: 7365,
    desc: '创造 7 颗选定类型的宝石。净化所有盟友并给予其 [魔法 + 1] 点护甲值。',
    build: skill(
      createGems(CHOSEN, 7),
      cleanse('allyAll'),
      armor('allyAll', 1),
    ),
  },
  {
    id: 7369,
    desc: '对前两名敌人造成 [魔法 + 3] 点真实伤害。将其击晕并耗尽其法力值。',
    build: skill(
      trueDmg('enemyFirstN', 3, 1, { n: 2 }),
      inflict('stun', 'enemyFirstN', { n: 2 }),
      drainMana('enemyFirstN', { n: 2 }),
    ),
  },
  {
    id: 7370,
    desc: '对 1 名敌人造成 [魔法 + 2] 点伤害，伤害值因所有盟友护甲值而增强。 [4:1]',
    build: skill(
      dmg('enemyChosen', 2, 1, {
        modifier: { mod: { kind: 'ratio', a: 4, b: 1 }, source: { kind: 'allyStatSum', stat: 'armor' } },
      }),
    ),
  },
  {
    id: 7375,
    desc: '对 1 名敌人造成 [魔法 + 1] 点伤害。如果有 13 颗或更多红色宝石，则将其全部爆破。',
    build: skill(
      dmg('enemyChosen', 1),
      // 回收：ifCond 现支持条件触发（SOP「通用条件触发 / 条件加成」节）；「其全部」= 红色宝石
      // → explodeColor('Red')；destroy/explode 系无 opts 参，展开补挂 ifCond（GemSegment 继承
      // SegmentOptions，7663 同款手法）；boardAtLeast 为全局条件、整段判定
      { ...explodeColor(BaseColor.Red), ifCond: { kind: 'boardAtLeast', color: BaseColor.Red, n: 13 } },
    ),
  },
  {
    id: 7382,
    desc: '创造 8 颗蓝色宝石和 8 颗绿色宝石。所有盟友获得 [魔法 + 1] 点生命值。',
    build: skill(
      createGems(BaseColor.Blue, 8),
      createGems(BaseColor.Green, 8),
      heal('allyAll', 1),
    ),
  },
  {
    id: 7395,
    desc: '使一名敌人陷入沉默和击晕状态，并耗掉他 [魔法 + 1] 点法力值。有 30% 的几率摧毁他。',
    build: skill(
      inflict('silence', 'enemyChosen'),
      inflict('stun', 'enemyChosen'),
      reduce('enemyChosen', 'mana', 1),
      // 回收：「摧毁他」= 即杀 dmg execute（b03:7789 先例，原跳过理由过时）；概率只辖本子句
      dmg('enemyChosen', 0, 0, { execute: true, chance: 0.3 }),
    ),
  },
  {
    id: 7398,
    desc: '对 1 名敌人造成 [魔法 + 6] 点伤害。如果对方使用红色法力，则造成三倍伤害。',
    build: skill(
      // 回收：condMult 现支持 targetColor 条件倍率（按目标 manaColors 含该色判定）
      dmg('enemyChosen', 6, 1, { condMult: { times: 3, cond: { kind: 'targetColor', color: BaseColor.Red } } }),
    ),
  },
  {
    id: 7400,
    desc: '对 1 名敌人造成 [魔法 + 4] 点伤害。如果敌方有龙族军队，则对所有敌人造成 6 点伤害。',
    build: skill(
      dmg('enemyChosen', 4),
      // 回收：ifCond 现支持 enemyRacePresent 全局条件（SOP「通用条件触发 / 条件加成」节示例同款）；
      // 「对所有敌人造成 6 点伤害」= 常数 6（mult=0）+ range:'all'
      dmg('enemyAll', 6, 0, { range: 'all', ifCond: { kind: 'enemyRacePresent', race: 'Dragon' } }),
    ),
  },
  {
    id: 7416,
    desc: '创造 5 颗紫色宝石，然后将所有紫色宝石转换为蓝色。',
    build: skill(
      createGems(BaseColor.Purple, 5),
      transform(BaseColor.Purple, BaseColor.Blue),
    ),
  },
  {
    id: 7437,
    desc: '摧毁所有紫色宝石，并创造 7 颗指定颜色的宝石。',
    build: skill(
      destroyColor(BaseColor.Purple),
      createGems(CHOSEN, 7),
    ),
  },
  {
    id: 7452,
    desc: '创造 8 颗黄色宝石和 8 颗蓝色宝石。',
    build: skill(
      createGems(BaseColor.Yellow, 8),
      createGems(BaseColor.Blue, 8),
    ),
  },
  {
    id: 7456,
    desc: '对两名最虚弱的敌人造成 [魔法 + 2] 点伤害。若自身的生命值受损，则造成两倍伤害。',
    build: skill(
      // 「两名最虚弱的敌人」= enemyWeakestN（SOP §0 目标措辞表，batch-03/07 同款）
      // 回收：condMult 现支持 selfHpDamaged 条件倍率
      dmg('enemyWeakestN', 2, 1, { n: 2, condMult: { times: 2, cond: { kind: 'selfHpDamaged' } } }),
    ),
  },
  {
    id: 7461,
    desc: '对 1 名敌人造成 [魔法 + 1] 点伤害，伤害值因被缠绕的敌军数量而增强。 [x5]',
    build: skill(
      dmg('enemyChosen', 1, 1, {
        modifier: { mod: { kind: 'multiplier', a: 5 }, source: { kind: 'enemyStatusCount', statusId: 'entangle' } },
      }),
    ),
  },
  {
    id: 7465,
    desc: '给予一名盟友 [魔法 + 1] 点生命值和 2 点魔法值。如果盟友是一名元素军队，则效果翻倍。',
    build: skill(
      heal('allyChosen', 1, 1, { raceDouble: 'Elemental' }),
      magic('allyChosen', 2, 0, { raceDouble: 'Elemental' }),
    ),
  },
  {
    id: 7517,
    desc: '赋予所有其他盟友屏障效果并给予 [魔法 + 1] 点生命值。创造 10 颗指定颜色宝石。',
    build: skill(
      inflict('barrier', 'allyOthers'),
      heal('allyOthers', 1),
      createGems(CHOSEN, 10),
    ),
  },
  {
    id: 7518,
    desc: '对 2 名随机敌人造成 [魔法 + 10] 点溅射伤害。爆破 5 颗随机宝石。',
    build: skill(
      dmgSplash('enemyRandomN', 10, 1, { n: 2 }),
      explodeRandomGems(5, 0, 'color'),
    ),
  },
  {
    id: 7522,
    desc: '对 1 名敌人造成 [魔法 + 1] 点伤害。如果敌人使用蓝色法力，则造成三倍伤害。',
    build: skill(
      // 回收：condMult 现支持 targetColor 条件倍率（按目标 manaColors 含该色判定）
      dmg('enemyChosen', 1, 1, { condMult: { times: 3, cond: { kind: 'targetColor', color: BaseColor.Blue } } }),
    ),
  },
  {
    id: 7525,
    desc: '对 1 名敌人造成 [魔法 + 4] 点伤害。如果敌人已陷入沉默状态，则造成三倍伤害。',
    build: skill(
      // 回收：condMult 现支持 targetStatus 条件倍率（batch-05 7330 同款）
      dmg('enemyChosen', 4, 1, { condMult: { times: 3, cond: { kind: 'targetStatus', statusId: 'silence' } } }),
    ),
  },
  {
    id: 7569,
    desc: '对一名敌人造成 [魔法 + 1] 点伤害并使其陷入中毒状态。创造 7 颗绿色宝石。',
    build: skill(
      dmg('enemyChosen', 1),
      inflict('poison', 'enemyChosen'),
      createGems(BaseColor.Green, 7),
    ),
  },
  {
    id: 7571,
    desc: '创造 7 颗红色和 7 颗黄色宝石。给予所有盟友 [魔法 + 1] 点生命值。',
    build: skill(
      createGems(BaseColor.Red, 7),
      createGems(BaseColor.Yellow, 7),
      heal('allyAll', 1),
    ),
  },
  {
    id: 7663,
    desc: '对最虚弱的敌人造成 [魔法 + 3] 点伤害。若敌人身亡，则摧毁所有紫色宝石。',
    build: skill(
      dmg('enemyWeakest', 3),
      // destroy 系构造函数无 opts 参；死亡条件按 spell-rules.md §4 可挂任意段，此处补挂
      { ...destroyColor(BaseColor.Purple), ifTargetDied: true },
    ),
  },
];

export const BATCH_06: CuratedBatch = { batch: '06', spells: SPELLS, skipped: SKIPPED };
