/**
 * 人工核对组装 · 批次 36（池：scripts/curated-pools/pool-36.json）
 * 核对者：窗口 E（2026-09-16 · TASK-CONTENT 阶段4 第三波）
 *
 * 语义裁定备注：
 * - 本批 SKIP 大头仍是 batch-34/35 头注两缺口：**「召唤/创造 X 风暴」无 createStorm 原语**
 *   （8093/8133/8222/8277/8317/8981 共 6 条）+ **「诅咒/燃烧/冻结/死亡标记/精灵火宝石」
 *   等不在窗口 C 十种特殊宝石内**（8683/8882/8975/9012/9050/9124/9192/9198/9312/9548/9637/9677 共 12 条）。
 * - 「由蓝宝石激发」= boardGems Blue（无「被摧毁/转换」字样 → 棋面计数，batch-08 8252 口径；
 *   batch-15「由蓝色盟友激发」alliesOfColor 同句式的宝石版）。
 * - 「窃取所有敌人 N 点护甲值」（未写转为何属性）= steal 同属性回填（batch-01 7141 口径）。
 * - 「对敌人造成…」（承前段指定敌）指回 enemyChosen 静态目标 → 多段同目标合法（batch-34 头注口径）。
 * - 「若有（一名）敌人陷入X状态」聚合存在判定不在条件域（逐目标过滤 ≠ 存在语义，SOP 8418 同款）。
 */
import { skill, dmg, inflict, createGems, createSpecialGems, transform, transformToSpecial, steal, summonRef, explodeRandomGems } from '../builders';
import { BaseColor } from '../../types';
import type { CuratedBatch } from './index';

const SKIPPED: { id: number; reason: string }[] = [
  { id: 8065, reason: '隐匿/位置操作（「对一名敌人和其下方的所有敌人」位置复合目标无对应模式，batch-35 8943 同款）；后半段诅咒双倍+死亡标记本可表达，整条受阻' },
  { id: 8093, reason: '「召唤冰风暴」创造风暴无技能原语（batch-35 头注建议）' },
  { id: 8133, reason: '「召唤尘风暴」创造风暴无技能原语（batch-35 7499 同款）；「爆破…盟友其中一个法力颜色」动态颜色亦不做（batch-11 9540 同款）' },
  { id: 8138, reason: '「使 1 到 4 名敌人中毒」数量区间无法表达，数值不明；「若有一名敌人陷入疾病状态」聚合存在判定亦不在条件域（SOP 8418 同款）' },
  { id: 8222, reason: '「召唤叶风暴」创造风暴无技能原语（batch-35 7495 同款）；「或疾病或缠绕或中毒」三选一状态亦无法表达（batch-35 7934 同款）' },
  { id: 8277, reason: '「召唤火风暴」创造风暴无技能原语（batch-35 7496 同款）' },
  { id: 8317, reason: '「召唤一个骸骨风暴」创造风暴无技能原语（batch-35 7530 同款）' },
  { id: 8683, reason: '「诅咒宝石」不在窗口 C 已实现特殊宝石清单（等美术/裁定，batch-35 9675 同款）；「有 20% 的几率跑掉」亦无对应原语' },
  { id: 8722, reason: '「将一颗宝石转换成炸弹宝石」单颗转换无原语（batch-34 9197 同款）；「创造…或爆破…」二选一亦无法表达（batch-35 8472 同款）' },
  { id: 8743, reason: '比例法力（「获得半数法力值」，不做清单）；「若有敌人陷入诅咒状态」聚合存在判定亦不在条件域（SOP 8418 同款）' },
  { id: 8756, reason: '「陷入死亡标记，或沉默，或诅咒状态」三选一无法表达（batch-35 7934 同款）；前段耗盟友法力本可表达，整条受阻' },
  { id: 8772, reason: '「若有风暴进行中」风暴在场条件无对应 kind（不在 condMult 条件域，batch-34 7788 同款）' },
  { id: 8882, reason: '「诅咒宝石」不在窗口 C 已实现特殊宝石清单（等美术/裁定，batch-35 9675 同款）；伤害段+enemyStatusCount curse 本可表达，整条受阻' },
  { id: 8941, reason: '「消除 4 点魔法值或耗掉 4 点法力值，或窃取…」多重二选一无法表达（batch-34 7320 同款）；「消除魔法值」亦无对应削减原语（batch-34 8165 同款）' },
  { id: 8975, reason: '「死亡标记宝石」不在窗口 C 已实现特殊宝石清单；「将 2 颗紫色宝石转换成」定量转换亦无原语（transform 仅全棋盘）' },
  { id: 8981, reason: '「召唤叶风暴」创造风暴无技能原语（batch-35 7495 同款）' },
  { id: 9012, reason: '「诅咒宝石」不在窗口 C 已实现特殊宝石清单（等美术/裁定，batch-35 9675 同款）；前段耗蓝本可表达，整条受阻' },
  { id: 9050, reason: '「燃烧宝石」不在窗口 C 已实现特殊宝石清单（等美术/裁定，batch-34 8746 同款）' },
  { id: 9124, reason: '「冻结宝石」不在窗口 C 已实现特殊宝石清单（SOP 特殊宝石节仍 SKIP 清单明列「冻结」）' },
  { id: 9192, reason: '「蓝色闪电宝石或黄色闪电宝石」二选一无法表达（batch-34 7320 同款）；闪电宝石文本未区分行列亦不可表达（batch-34 9908 同款）' },
  { id: 9198, reason: '「打乱板面」无对应原语（隐匿/位置操作族）；「闪电宝石」文本未区分行列亦不可表达（batch-34 9908 同款）' },
  { id: 9312, reason: '「混合诅咒和冻结宝石」两种特殊宝石均不在窗口 C 十种内（createMix 仅支持颜色，batch-21 8219 口径）' },
  { id: 9548, reason: '「精灵火宝石」「燃烧宝石」均不在窗口 C 十种内（妖火/燃烧，等美术/裁定）' },
  { id: 9637, reason: '「引爆4颗燃烧宝石」燃烧宝石不在窗口 C 已实现特殊宝石清单（batch-34 8757 同款）；伤害段+enemyStatusCount burning 本可表达，整条受阻' },
  { id: 9677, reason: '「诅咒宝石」数量来源与创造均不在窗口 C 十种内（batch-35 8712 同款，boardSpecial 仅十种内 kind）' },
  { id: 9784, reason: '「驱散其流血效果」定向移除单一状态无对应原语（cleanse 仅全状态净化）；条件诅咒/偷蓝本可表达，整条受阻' },
];

const SPELLS: CuratedBatch['spells'] = [
  {
    id: 7993,
    desc: '创造 7 颗黄色宝石。魅惑一名随机敌人。',
    build: skill(
      createGems(BaseColor.Yellow, 7, 0),
      inflict('charm', 'enemyRandom'),
    ),
  },
  {
    id: 8091,
    desc: '爆破 1 颗宝石。对 2 名随机敌人造成 [魔法 + 3] 点伤害。再创造 2 颗炸弹宝石。',
    build: skill(
      // 「宝石」不含骷髅 → include 'color'（batch-34 8823 口径）
      explodeRandomGems(1, 0, 'color'),
      dmg('enemyRandomN', 3, 1, { n: 2 }),
      createSpecialGems({ kind: 'bomb' }, 2, 0),
    ),
  },
  {
    id: 8129,
    desc: '诅咒所有敌人。将所有绿色宝石转换成骷髅头。',
    build: skill(
      inflict('curse', 'enemyAll'),
      // transform 端点 'SKULL'（batch-05 7135 口径）
      transform(BaseColor.Green, 'SKULL'),
    ),
  },
  {
    id: 8159,
    desc: '魅惑一名随机敌人。创造 9 颗蓝色宝石。',
    build: skill(
      inflict('charm', 'enemyRandom'),
      createGems(BaseColor.Blue, 9, 0),
    ),
  },
  {
    id: 8169,
    desc: '将紫色宝石转换成绿色。使第一名敌人陷入猎人标记状态。',
    build: skill(
      transform(BaseColor.Purple, BaseColor.Green),
      inflict('marked', 'enemyFront'),
    ),
  },
  {
    id: 8462,
    desc: '将蓝色宝石转换成紫色。诅咒和燃烧最强的敌人。',
    build: skill(
      transform(BaseColor.Blue, BaseColor.Purple),
      // 「最强的敌人」= enemyHealthiest（spell-rules §0 措辞表）
      inflict('curse', 'enemyHealthiest'),
      inflict('burning', 'enemyHealthiest'),
    ),
  },
  {
    id: 8542,
    desc: '对一名敌人造成 [魔法 + 2] 点伤害，数值因板面上的绿宝石数而增强。再使其陷入疾病状态。 [3:1]',
    build: skill(
      // 泛指「数值」→ 挂最近（唯一）数值段 = dmg；「板面上的绿宝石数」= boardGems
      dmg('enemyChosen', 2, 1, {
        modifier: { mod: { kind: 'ratio', a: 3, b: 1 }, source: { kind: 'boardGems', color: BaseColor.Green } },
      }),
      // 「使其」= 前段 chosen（静态指定，多段同目标合法）
      inflict('disease', 'enemyChosen'),
    ),
  },
  {
    id: 8561,
    desc: '创造 9 颗红色宝石和 9 颗紫色宝石。诅咒并燃烧第一个敌人。',
    build: skill(
      createGems(BaseColor.Red, 9, 0),
      createGems(BaseColor.Purple, 9, 0),
      inflict('curse', 'enemyFront'),
      inflict('burning', 'enemyFront'),
    ),
  },
  {
    id: 8600,
    desc: '诅咒并冻结一名敌人。并对敌人造成[魔法 + 1]点伤害，由蓝宝石激发。 [3:1]',
    build: skill(
      inflict('curse', 'enemyChosen'),
      inflict('frozen', 'enemyChosen'),
      // 「对敌人造成」承前段 chosen（静态目标）；「由蓝宝石激发」= boardGems Blue（batch-08 口径）
      dmg('enemyChosen', 1, 1, {
        modifier: { mod: { kind: 'ratio', a: 3, b: 1 }, source: { kind: 'boardGems', color: BaseColor.Blue } },
      }),
    ),
  },
  {
    id: 8610,
    desc: '将所有黄宝石变成超级末日骷髅。诅咒、布网并毒害最强的敌人。',
    build: skill(
      // 超级末日骷髅 = uberDoomSkull（SOP 词表对照）
      transformToSpecial(BaseColor.Yellow, 'uberDoomSkull'),
      // 「布网」= web（batch-34 7703 口径）；「最强的敌人」= enemyHealthiest
      inflict('curse', 'enemyHealthiest'),
      inflict('web', 'enemyHealthiest'),
      inflict('poison', 'enemyHealthiest'),
    ),
  },
  {
    id: 8655,
    desc: '将所有棕色宝石转换成骷髅头。使所有矮人陷入诅咒和死亡标记状态。',
    build: skill(
      transform(BaseColor.Brown, 'SKULL'),
      // 「所有矮人」= 种族限定目标 enemyAll + targetRace（SOP 措辞裁定；矮人 = Dwarf）
      inflict('curse', 'enemyAll', { targetRace: 'Dwarf' }),
      inflict('death-mark', 'enemyAll', { targetRace: 'Dwarf' }),
    ),
  },
  {
    id: 8719,
    desc: '窃取所有敌人 [魔法 + 1] 点护甲值。创造 10 颗炸弹宝石。再随机爆破一颗宝石。',
    build: skill(
      // 未写转为何属性 → 同属性回填（batch-01 7141「窃取所有敌人的护甲值」口径）
      steal('enemyAll', 'armor', 'armor', 1, 1),
      createSpecialGems({ kind: 'bomb' }, 10, 0),
      // 「宝石」不含骷髅 → include 'color'（batch-34 8823 口径）
      explodeRandomGems(1, 0, 'color'),
    ),
  },
  {
    id: 8782,
    desc: '使首位敌人陷入猎人标记状态。再将所有绿色宝石转换成骷髅头。',
    build: skill(
      inflict('marked', 'enemyFront'),
      transform(BaseColor.Green, 'SKULL'),
    ),
  },
  {
    id: 8892,
    desc: '将所有黄色宝石转换成织网宝石。再召蜘蛛群。',
    build: skill(
      transformToSpecial(BaseColor.Yellow, 'web'),
      // 蜘蛛群 = SpiderSwarm（troops.json id 6136，§6 命令核对）
      summonRef('SpiderSwarm', 6136),
    ),
  },
];

export const BATCH_36: CuratedBatch = { batch: '36', spells: SPELLS, skipped: SKIPPED };
