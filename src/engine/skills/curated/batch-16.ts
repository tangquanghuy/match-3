/**
 * 人工核对组装 · 批次 16（池：scripts/curated-pools/pool-16.json）
 * 核对者：agent 批次16
 *
 * 语义裁定备注：
 * - 种族英文名经 troops.json troopTypes 核对：精灵 = Elf、龙族 = Dragon、野兽 = Beast、
 *   人马族 = Centaur、狼族 = Wargare（batch-10 8864「狼族盟友数」先例）、
 *   秘士 = Mystic（施法者「制图师」Human/Mystic 自证）。
 * - 石像鬼宝石 / 石块 / 天使宝石 / 龙宝石 / 末日骷髅头 / 万能牌 / 赃物宝石 / 妖仙宝石 /
 *   狼人宝石均为特殊宝石（不在色宝石词汇内）→ 相关段整条 SKIP（SOP §4）。
 * - 「首位盟友」= allyFront（SOP §0 盟友同构表）；「移除」= destroyColor、「爆破所有」= explodeColor。
 * - 「创造 X 颗」常数数量 mult=0；modifier 按 pool meta 逐字挂段（点名属性挂削减段、
 *   点名创造挂创造段、点名伤害挂伤害段）。
 */
import { skill, dmg, armor, createGems, createSkulls, destroyChosenRow, destroyColor,
  explodeColor, reduce, inflict, summonRef } from '../builders';
import { BaseColor } from '../../types';
import type { CuratedBatch } from './index';

const SKIPPED: { id: number; reason: string }[] = [
  { id: 8795, reason: '特殊宝石（石像鬼宝石）' },
  { id: 8797, reason: '二次缩放来源「恶石像鬼（宝石）」不在窗口 C 已实现特殊宝石清单（等美术/裁定）；「创造 5 颗末日骷髅头」本身现可表达（createSpecialGems doomSkull）' },
  { id: 8798, reason: '二次缩放来源不支持（「因石像鬼宝石数而增强」——boardGems 仅支持棋盘色宝石）' },
  { id: 8801, reason: '特殊宝石（石块转换成善/恶石像鬼宝石）' },
  { id: 8802, reason: '隐匿/位置操作（「将一名敌人拉至前方」；modifier 来源「石像鬼宝石数」亦不支持）' },
  { id: 8814, reason: '隐匿/位置操作（「打乱板面」；石块/石像鬼宝石亦为特殊宝石）' },
  { id: 8826, reason: '语义拿不准（「造成伤害，或给予生命值」二选一无法表达）' },
  { id: 8827, reason: '「造成 [(魔法 x 2) + 22] 点散射伤害」未指明目标（batch-02 7265 同款）；后半句定量转换端点已可表达（batch-38 8360 口径）' },
  { id: 8831, reason: '语义拿不准（「并重复一次」无重复原语；「随机聚沙之地军队」按王国随机无法用种族列表表达）' },
  { id: 8838, reason: '二次缩放来源不支持（「所有亡灵和恶魔（包括盟友和敌人的）」——敌方侧种族计数无对应 kind，仅 alliesOfRace 己方）' },
  { id: 8884, reason: '特殊宝石（蓝色龙族宝石；「或创造 3 颗宝石」二选一亦无法表达）' },
  { id: 8889, reason: '特殊宝石（棕色龙宝石）' },
  { id: 8933, reason: '隐匿/位置操作（「击回末位」；「爆破其一个法力颜色的宝石」跨段目标绑定亦不支持）' },
  { id: 8942, reason: '二次缩放来源不支持（「因被击败的敌人而增强」——击杀计数无对应 kind）' },
  { id: 8961, reason: '语义拿不准（「摧毁一行或一列」二选一无对应原语）' },
  { id: 8962, reason: '隐匿/位置操作（「将自己移至前方」；「万能牌」亦为特殊宝石）' },
  { id: 8968, reason: '特殊宝石（天使宝石）' },
  { id: 9004, reason: '特殊宝石（赃物宝石）' },
  { id: 9010, reason: '特殊宝石（善石像鬼宝石）' },
  { id: 9052, reason: '语义拿不准（「爆破一颗宝石和其两边的宝石」——「两边」指向不明，非标准 3x3 辐射）' },
  { id: 9057, reason: '缺失状态（恐怖）' },
  { id: 9058, reason: '缺失状态（恐怖；「若敌人已陷入恐怖状态则伤害翻倍」条件倍率亦不做）' },
  { id: 9140, reason: '语义拿不准（「召唤 0-3 只驯鹿」随机数量召唤无对应原语）' },
  { id: 9183, reason: '特殊宝石（狼人宝石——chanceBoost 的 boardGems 来源仅支持棋盘色宝石，见头注特殊宝石家族；「4 个叠加出血状态」现已可用 inflict stacks 表达，仅剩该卡点）' },
  { id: 9187, reason: '隐匿/位置操作（「将自身和敌人移到首位」）' },
  { id: 9200, reason: '语义拿不准（「获得护甲值，或创造石块，或击晕，或爆破」四选一无法表达；石块亦为特殊宝石）' },
  { id: 9223, reason: '数值不明（[100:1] 未在文本中说明二次缩放来源）' },
  { id: 9237, reason: '特殊宝石（爆破天使宝石；来源「不死族和恶魔敌人数」敌方侧种族计数亦无对应 kind）' },
];

const SPELLS: CuratedBatch['spells'] = [
  {
    id: 8789,
    desc: '创造 8 颗黄色宝石和 8 颗棕色宝石。再赋予首位盟友屏障效果。',
    build: skill(
      createGems(BaseColor.Yellow, 8),
      createGems(BaseColor.Brown, 8),
      // 「首位盟友」= allyFront（SOP §0 盟友同构表）
      inflict('barrier', 'allyFront'),
    ),
  },
  {
    id: 8792,
    desc: '摧毁一行。消除首 2 位敌人 [魔法 + 1] 点攻击力，数值因被摧毁的紫色宝石数而增强。 [1:1]',
    build: skill(
      destroyChosenRow(),
      // 「消除首 2 位敌人…攻击力」= reduce + n；modifier 点名属性 → 挂削减段
      reduce('enemyFirstN', 'attack', 1, 1, {
        n: 2,
        modifier: { mod: { kind: 'ratio', a: 1, b: 1 }, source: { kind: 'destroyedGems', color: BaseColor.Purple } },
      }),
    ),
  },
  {
    id: 8893,
    desc: '对一名敌人造成 [魔法 + 4] 点伤害。再创造 2 颗紫色宝石，数量因精灵盟友数而增强。 [x2]',
    build: skill(
      dmg('enemyChosen', 4),
      // 「数量因精灵盟友数而增强」：modifier 点名「创造/宝石数」→ 挂创造段（精灵 = Elf）
      createGems(BaseColor.Purple, 2, 0, {
        modifier: { mod: { kind: 'multiplier', a: 2 }, source: { kind: 'alliesOfRace', race: 'Elf' } },
      }),
    ),
  },
  {
    id: 8932,
    desc: '移除所有蓝色宝石。对末位敌人造成 [魔法 + 3] 点伤害，伤害值因被移除的宝石数而增强。 [x2]',
    build: skill(
      destroyColor(BaseColor.Blue),
      // 「因被移除的宝石数」= destroyedGems（无色=任意）；modifier 点名伤害 → 挂伤害段
      dmg('enemyLast', 3, 1, {
        modifier: { mod: { kind: 'multiplier', a: 2 }, source: { kind: 'destroyedGems' } },
      }),
    ),
  },
  {
    id: 9009,
    desc: '对一名敌人造成 [魔法 + 4] 点伤害。再创造 2 颗红色宝石，数量因龙族盟友数而增强。 [x2]',
    build: skill(
      dmg('enemyChosen', 4),
      // 龙族 = Dragon（troopTypes 核对）
      createGems(BaseColor.Red, 2, 0, {
        modifier: { mod: { kind: 'multiplier', a: 2 }, source: { kind: 'alliesOfRace', race: 'Dragon' } },
      }),
    ),
  },
  {
    id: 9065,
    desc: '创造 9 颗骷髅头。召唤一只骨犬。',
    build: skill(
      createSkulls(9),
      // 骨犬 referenceName = BoneHound（SOP §6 查询）
      summonRef('BoneHound', 7416),
    ),
  },
  {
    id: 9122,
    desc: '对一名敌人造成 [魔法 + 4] 点伤害。再创造 2 颗绿色宝石，数量因人马族盟友数而增强。 [x2]',
    build: skill(
      dmg('enemyChosen', 4),
      // 人马族 = Centaur（troopTypes 核对）
      createGems(BaseColor.Green, 2, 0, {
        modifier: { mod: { kind: 'multiplier', a: 2 }, source: { kind: 'alliesOfRace', race: 'Centaur' } },
      }),
    ),
  },
  {
    id: 9188,
    desc: '对一名敌人造成 [魔法 + 4] 点伤害。再创造 2 颗棕色宝石，数量因野兽盟友数而增强。  [x2]',
    build: skill(
      dmg('enemyChosen', 4),
      // 野兽 = Beast（troopTypes 核对）
      createGems(BaseColor.Brown, 2, 0, {
        modifier: { mod: { kind: 'multiplier', a: 2 }, source: { kind: 'alliesOfRace', race: 'Beast' } },
      }),
    ),
  },
  {
    id: 9195,
    desc: '爆破所有棕色宝石。获得 [魔法 + 1] 点护甲值，数值因被摧毁的棕色宝石数而增强。 [1:1]',
    build: skill(
      explodeColor(BaseColor.Brown),
      // modifier 点名属性（护甲值）→ 挂增益段
      armor('allySelf', 1, 1, {
        modifier: { mod: { kind: 'ratio', a: 1, b: 1 }, source: { kind: 'destroyedGems', color: BaseColor.Brown } },
      }),
    ),
  },
  {
    id: 9196,
    desc: '对一名敌人造成 [魔法 + 4] 点伤害。再创造 2 颗紫色宝石，数量因狼族盟友数而增强。 [x2]',
    build: skill(
      dmg('enemyChosen', 4),
      // 狼族 = Wargare（batch-10 8864 同款句式先例）
      createGems(BaseColor.Purple, 2, 0, {
        modifier: { mod: { kind: 'multiplier', a: 2 }, source: { kind: 'alliesOfRace', race: 'Wargare' } },
      }),
    ),
  },
  {
    id: 9240,
    desc: '对一名敌人造成 [魔法 + 4] 点伤害。再创造 2 颗紫色宝石，数量因秘士盟友数而增强。 [x2]',
    build: skill(
      dmg('enemyChosen', 4),
      // 秘士 = Mystic（施法者「制图师」Human/Mystic 自证）
      createGems(BaseColor.Purple, 2, 0, {
        modifier: { mod: { kind: 'multiplier', a: 2 }, source: { kind: 'alliesOfRace', race: 'Mystic' } },
      }),
    ),
  },
];

export const BATCH_16: CuratedBatch = { batch: '16', spells: SPELLS, skipped: SKIPPED };
