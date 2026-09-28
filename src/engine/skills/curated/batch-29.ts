/**
 * 人工核对组装 · 批次 29（池：scripts/curated-pools/pool-29.json）
 * 核对者：agent 批次 29
 *
 * 语义裁定备注：
 * - 「棋盘上每颗X宝石有 7% 的几率获得额外回合」家族（9590/9662/9728/9778/9860/9943）
 *   经 chanceBoost 回收（SOP 示例句式）；9531/9537 仍卡在「3 名盟友」目标口径与「4 次攻击力」量词。
 * - 「几率因…而增强」（9533 击杀几率、7385 召唤几率）经 chanceBoost 回收；
 *   击杀 = 独立 execute 段 + chance（batch-03 7789 同款）、几率召唤 = 召唤段挂 chance（batch-26 7776 同款）。
 * - 「施加 N 层流血效果」（9729/9879）经第四遍回收 = inflict stacks（SOP「状态叠层」节；
 *   bleed 每层 1，N 层 → magnitude N）。
 * - 「在X王国/地区使用时（伤害）翻倍」= 条件倍率（9648/9935/9719/9808/9810/9841/9933），SOP 措辞裁定 → SKIP。
 * - 「如果敌人是塔/防御塔/Boss，则根据升天/升华 3-5 倍」= 晋升度条件（9544/9547/9588/9738），SOP 措辞裁定不做。
 * - 腐烂/石像鬼/屏障/蛛网/狼人/缠绕/绿龙宝石为特殊宝石：作二次缩放来源、转换或创造目标均不做。
 * - 7352「移除所有骷髅头以增强效果」：清除段前置 + destroyedGems 不筛色恰等于被摧毁的骷髅数
 *   （batch-04 7002「以增强」前置 + batch-14 8297 只清骷髅口径）。
 * - 7149 转化段前置同理：desc 转化句在伤害句之后，编译时前置使 transformedGems 来源可数（batch-12 7215 同款）。
 * - 召唤物经 troops.json 程序核实（SOP §6）：奴隶=Thrall(6146)、堡垒大门=FortressGate(6097)。
 */
import { skill, dmg, heal, attack, armor, inflict, transform, summonRef, destroyChosenRow, destroySkulls,
  extraTurn } from '../builders';
import { BaseColor } from '../../types';
import type { CuratedBatch } from './index';

const SKIPPED: { id: number; reason: string }[] = [
  { id: 7402, reason: '二次缩放来源不支持（「伤害值等同于一名盟友的攻击力」无对应来源 kind，仅支持自身 selfStat，SOP §3）；「3 到 8 点法力值」区间数值亦无法表达' },
  { id: 9531, reason: '语义拿不准（几率部分现可用 chanceBoost 表达；但「给予 3 名盟友 4 点攻击力」裸复数未指明选择口径（首 3 位/随机 3 名），SOP 目标表无此措辞裁定）' },
  { id: 9536, reason: '特殊宝石（「腐烂宝石」：散射伤害增强来源与「转换为腐烂宝石」目标均不支持）' },
  { id: 9537, reason: '语义拿不准（几率部分现可用 chanceBoost 表达；但「4 次攻击力」量词机翻不明，同 batch-28 8964）' },
  { id: 9544, reason: '晋升度条件（「如果敌人是塔，则基于我已晋升的稀有度造成 3 到 5 倍伤害」，SOP 措辞裁定魔头/塔条件不做）' },
  { id: 9547, reason: '二次缩放来源不支持（「腐烂宝石和石像鬼宝石」为特殊宝石，batch-17 9639 同款）；Boss 晋升度条件亦不做' },
  { id: 9588, reason: '二次缩放来源不支持（「Dhrak-Zum 盟友数量」按王国名计数，alliesOfRace 仅支持种族）；Boss 晋升度条件亦不做' },
  { id: 9604, reason: '句子式不明（「摧毁一个 5x5 的方块」无对应面积清除原语，batch-28 9512 / batch-08 8164 同款）' },
  { id: 9646, reason: '缺失状态（「被激怒的盟友和敌人」Enraged 状态不在白名单）；破碎之地双倍条件亦不做' },
  { id: 9648, reason: '语义拿不准（「在南荒使用时，造成双倍伤害」条件倍率，SOP 措辞裁定）；「绿龙宝石」转换亦为特殊宝石' },
  { id: 9711, reason: '语义拿不准（「对一名敌人和 2 名随机敌人」复合目标，SOP 措辞裁定不做）' },
  { id: 9712, reason: '句子式不明（「摧毁一个5x5的圆圈」无对应面积清除原语，batch-10 8927 同款）' },
  { id: 9719, reason: '二次缩放来源不支持（「屏障石数量」为特殊宝石，batch-17 9639 同款）；艾达尼亚双倍条件亦不做' },
  { id: 9723, reason: '驱散敌方增益（「驱散一名敌人」不做清单，spell-rules.md §6）' },
  { id: 9738, reason: '晋升度条件（「如果敌人是防御塔，则…取决于我的升华值」，SOP 措辞裁定）' },
  { id: 9808, reason: '缺失状态（「受祝福的敌人」Blessed 状态不在白名单）；夏日岛双倍条件亦不做' },
  { id: 9810, reason: '二次缩放来源不支持（「缠绕宝石」为特殊宝石，batch-17 9639 同款）；南方荒野翻倍条件亦不做' },
  { id: 9815, reason: '二次缩放来源不支持（「宝石数量根据消除的护甲值提升」=被减除的护甲值来源，SOP 明列不做）' },
  { id: 9841, reason: '「造成…真实散射伤害」未指明目标（batch-02 7265 同款）；「若在格赫隆使用」王国条件亦不做——蛛网宝石来源计数已可表达（boardSpecial web，batch-38 复核）' },
  { id: 9933, reason: '「狼人宝石」（Lycanthropy Gem，GEMS-SEMANTICS-2 官方数据族）未实现（状态宝石波A未含）；「若在凛冬之境使用」王国条件亦不做' },
  { id: 9935, reason: '语义拿不准（「若在中央尖塔内使用，则造成双倍伤害」条件倍率，SOP 措辞裁定）' },
  { id: 9949, reason: '二次缩放来源不支持（「受摧毁的骷髅数量加成」——摧毁一排混色无法筛骷髅，batch-14 8090 / batch-26 8168 同款）' },
  { id: 9952, reason: '特殊宝石（「生成 1 个蛛网宝石」创造不支持）' },
];

const SPELLS: CuratedBatch['spells'] = [
  {
    id: 7149,
    desc: '使所有敌人陷入中毒状态，并对 1 名随机的敌人造成 [魔法 + 1] 点真实伤害。将所有黄色的宝石转换成紫色宝石。伤害值因转换的宝石数而增强。 [x3]',
    build: skill(
      inflict('poison', 'enemyAll'),
      // 转化段前置：transformedGems 来源才数得到（batch-12 7215 同款）
      transform(BaseColor.Yellow, BaseColor.Purple),
      dmg('enemyRandom', 1, 1, {
        trueDamage: true,
        modifier: { mod: { kind: 'multiplier', a: 3 }, source: { kind: 'transformedGems' } },
      }),
    ),
  },
  {
    id: 7262,
    desc: '对 1 名敌人造成 [(魔法 / 2) + 9] 点伤害。召唤一名奴隶。如果敌人死亡，为所有盟友增加 2 点攻击力。',
    build: skill(
      dmg('enemyChosen', 9, 0.5),
      // 奴隶 = Thrall（troops.json 程序核实，SOP §6）
      summonRef('Thrall', 6146),
      attack('allyAll', 2, 0, { ifTargetDied: true }),
    ),
  },
  {
    id: 7352,
    desc: '召唤一个堡垒大门。所有盟友获得 1 点护甲值，并移除所有骷髅头以增强效果。 [1:1]',
    build: skill(
      // 堡垒大门 = FortressGate（troops.json 程序核实，SOP §6）
      summonRef('FortressGate', 6097),
      // 「移除所有骷髅头以增强」句式：清除段前置（batch-04 7002 同款）
      destroySkulls(),
      // 清除段只清骷髅 → destroyedGems 不带色筛选恰等于被摧毁的骷髅数（batch-14 8297 同款）
      armor('allyAll', 1, 0, {
        modifier: { mod: { kind: 'ratio', a: 1, b: 1 }, source: { kind: 'destroyedGems' } },
      }),
    ),
  },
  {
    id: 7385,
    desc: '将所有紫色宝石转换为红色。有 40% 的几率召唤一只有翅野牛，几率因转换的宝石数而增强。 [x2]',
    build: skill(
      transform(BaseColor.Purple, BaseColor.Red),
      // 回收：几率召唤 = 召唤段挂 chance（batch-26 7776「贝格拉」同款）；chanceBoost 现支持
      // 概率加成，「因转换的宝石数而增强」= transformedGems（转化段前置才数得到，batch-04 7002 同款）；
      // 有翅野牛 = WingedBison(6242)（troops.json 程序核实）
      { ...summonRef('WingedBison', 6242), chance: 0.4, chanceBoost: { mod: { kind: 'multiplier', a: 2 }, source: { kind: 'transformedGems' } } },
    ),
  },
  {
    id: 9533,
    desc: '对一名敌人造成 [(魔法 x 2) + 4] 点伤害。有 20% 的几率杀死对方，几率因陷入冻结和出血状态的敌人数而增强。  [x5]',
    build: skill(
      dmg('enemyChosen', 4, 2),
      // 回收：几率击杀 = 独立 execute 段 + chance（batch-03 7789「处死」同款）；
      // chanceBoost 来源「冻结和出血状态的敌人数」双状态计数相加（SOP §3 sources）
      dmg('enemyChosen', 0, 0, {
        execute: true,
        chance: 0.2,
        chanceBoost: {
          mod: { kind: 'multiplier', a: 5 },
          sources: [{ kind: 'enemyStatusCount', statusId: 'frozen' }, { kind: 'enemyStatusCount', statusId: 'bleed' }],
        },
      }),
    ),
  },
  {
    id: 9590,
    desc: '给予所有盟友 10 点生命。棋盘上每颗绿宝石都有 7% 的几率获得额外回合。 [x7]',
    build: skill(
      heal('allyAll', 10, 0),
      // 回收：chanceBoost 现支持「每颗X宝石 7% 几率」（SOP 示例句式；boardGems Green）
      extraTurn({ chanceBoost: { mod: { kind: 'multiplier', a: 7 }, source: { kind: 'boardGems', color: BaseColor.Green } } }),
    ),
  },
  {
    id: 9662,
    desc: '为所有盟友提供 10 点护甲。棋盘上每增加一颗蓝宝石，就有 7% 的几率额外获得一回合。 [x7]',
    build: skill(
      armor('allyAll', 10, 0),
      // 回收：chanceBoost 现支持「每颗X宝石 7% 几率」（SOP 示例句式；boardGems Blue）
      extraTurn({ chanceBoost: { mod: { kind: 'multiplier', a: 7 }, source: { kind: 'boardGems', color: BaseColor.Blue } } }),
    ),
  },
  {
    id: 9728,
    desc: '赋予所有盟友 5 点攻击力。棋盘上每颗黄色宝石有 7% 的概率额外获得一回合。 [x7]',
    build: skill(
      attack('allyAll', 5, 0),
      // 回收：chanceBoost 现支持「每颗X宝石 7% 几率」（SOP 示例句式；boardGems Yellow）
      extraTurn({ chanceBoost: { mod: { kind: 'multiplier', a: 7 }, source: { kind: 'boardGems', color: BaseColor.Yellow } } }),
    ),
  },
  {
    id: 9729,
    desc: '摧毁一行。对前 2 名敌人造成 [魔法 + 3] 点伤害，伤害值因摧毁的红色宝石数量而增强。然后对其施加 2 层流血效果。 [x3]',
    build: skill(
      destroyChosenRow(),
      // 「伤害值因摧毁的红色宝石数量而增强 [x3]」= destroyedGems Red（batch-12 7366 同款）
      dmg('enemyFirstN', 3, 1, {
        n: 2,
        modifier: { mod: { kind: 'multiplier', a: 3 }, source: { kind: 'destroyedGems', color: BaseColor.Red } },
      }),
      // 回收（第四遍）：「对其施加 2 层流血效果」= inflict stacks（SOP「状态叠层」节，2 层 → magnitude 2）；
      // 「其」= 前 2 名敌人，enemyFirstN 确定性目标跨段复用（batch-06 7063 / batch-23 先例）
      inflict('bleed', 'enemyFirstN', { stacks: 2, n: 2 }),
    ),
  },
  {
    id: 9778,
    desc: '为所有友军恢复8点生命值。场上每有一颗绿色宝石，就有7%的几率获得额外回合。 [x7]',
    build: skill(
      heal('allyAll', 8, 0),
      // 回收：chanceBoost 现支持「每颗X宝石 7% 几率」（SOP 示例句式；boardGems Green）
      extraTurn({ chanceBoost: { mod: { kind: 'multiplier', a: 7 }, source: { kind: 'boardGems', color: BaseColor.Green } } }),
    ),
  },
  {
    id: 9860,
    desc: '为所有友军增加8点护甲。场上每有一颗蓝色宝石，就有7%的几率获得额外回合。 [x7]',
    build: skill(
      armor('allyAll', 8, 0),
      // 回收：chanceBoost 现支持「每颗X宝石 7% 几率」（SOP 示例句式；boardGems Blue）
      extraTurn({ chanceBoost: { mod: { kind: 'multiplier', a: 7 }, source: { kind: 'boardGems', color: BaseColor.Blue } } }),
    ),
  },
  {
    id: 9879,
    desc: '对两名最强敌人造成[(魔法 x 1.5) + 4]点伤害，伤害值受所有敌方魔法加成。然后对他们施加4层流血效果。 [2:1]',
    build: skill(
      // 「最强敌人」= enemyHealthiest（spell-rules.md §0）；「受所有敌方魔法加成 [2:1]」=
      // enemyStatSum magic（SOP 来源计数表「因所有敌人的护甲值」同族）
      // 原生序 4 × CauseBleed@TwoStrongest → Damage@TwoStrongest（R001：先按伤害前的强弱选目标施加流血）
      // 回收（第四遍）：「对他们施加4层流血效果」= inflict stacks（SOP「状态叠层」节，4 层 → magnitude 4）
      inflict('bleed', 'enemyHealthiestN', { stacks: 4, n: 2 }),
      dmg('enemyHealthiestN', 4, 1.5, {
        n: 2,
        modifier: { mod: { kind: 'ratio', a: 2, b: 1 }, source: { kind: 'enemyStatSum', stat: 'magic' } },
      }),
    ),
  },
  {
    id: 9943,
    desc: '为所有友方单位恢复6点生命值。场上每有一颗绿色宝石，就有7%的几率获得额外回合。 [x7]',
    build: skill(
      heal('allyAll', 6, 0),
      // 回收：chanceBoost 现支持「每颗X宝石 7% 几率」（SOP 示例句式；boardGems Green）
      extraTurn({ chanceBoost: { mod: { kind: 'multiplier', a: 7 }, source: { kind: 'boardGems', color: BaseColor.Green } } }),
    ),
  },
];

export const BATCH_29: CuratedBatch = { batch: '29', spells: SPELLS, skipped: SKIPPED };
