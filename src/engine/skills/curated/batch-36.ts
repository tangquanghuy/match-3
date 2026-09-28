/**
 * 人工核对组装 · 批次 36（池：scripts/curated-pools/pool-36.json）
 * 核对者：窗口 E（2026-09-16 · TASK-CONTENT 阶段4 第三波）
 *
 * 语义裁定备注：
 * - 本批 SKIP 大头原为 batch-34/35 头注两缺口：**「召唤/创造 X 风暴」无 createStorm 原语**
 *   + **「诅咒/燃烧/冻结/死亡标记/精灵火宝石」等不在窗口 C 十种特殊宝石内**。
 *   2026-09-16 引擎原语批落地后，前一类与 oneOf/定量转换/dispelStatus/halve/存在判定/
 *   数量区间/打乱板面/位置复合目标受阻的 13 条（8065/8093/8138/8222/8277/8317/8722/8743/
 *   8756/8772/8981/9192/9784）已移入 batch-37；剩余 SKIP 全部卡在十种之外的特殊宝石
 *   （等 GEMS-SEMANTICS-2）、动态颜色、目标不明或「跑掉」机制，理由保持准确。
 * - 「由蓝宝石激发」= boardGems Blue（无「被摧毁/转换」字样 → 棋面计数，batch-08 8252 口径；
 *   batch-15「由蓝色盟友激发」alliesOfColor 同句式的宝石版）。
 * - 「窃取所有敌人 N 点护甲值」（未写转为何属性）= steal 同属性回填（batch-01 7141 口径）。
 * - 「对敌人造成…」（承前段指定敌）指回 enemyChosen 静态目标 → 多段同目标合法（batch-34 头注口径）。
 * - 「若有（一名）敌人陷入X状态」聚合存在判定原语批已落（anyEnemyStatus，spell-rules §9.7）。
 */
import { skill, dmg, inflict, createGems, createSpecialGems, transform, transformToSpecial, steal, summonRef, explodeRandomGems, CELL, explodeAt } from '../builders';
import { BaseColor } from '../../types';
import type { CuratedBatch } from './index';

const SKIPPED: { id: number; reason: string }[] = [
  { id: 8133, reason: '「召唤尘风暴」已由 createStorm 落地（batch-37 口径）；「爆破…盟友其中一个法力颜色」动态颜色仍不做（batch-11 9540 同款），整条维持' },
  { id: 8941, reason: '「消除 4 点魔力值或耗掉 4 点法力值，或窃取…」多重二选一虽已有一选一原语（oneOf），但前两支未点名目标（目标归属不明），语义拿不准维持 SKIP' },
  { id: 9198, reason: '「打乱板面」已由 shuffleBoard 落地（batch-37 口径）；剩余卡点=「创造 5 颗闪电宝石」文本未区分行列（batch-34 9908 同款）' },
  { id: 9312, reason: '诅咒/冻结宝石本体均已实现（状态宝石波A）；剩余卡点=「创造 16 颗混合诅咒和冻结宝石」混合特殊宝石创造无原语（createMix 仅颜色，batch-21 8219 口径）' },
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
      explodeAt(CELL),
      dmg('enemyRandomN', 3, 1, { n: 2 }),
      createSpecialGems({ kind: 'bomb' }, 2, 0),
    ),
  },
  {
    id: 8129,
    desc: '诅咒所有敌人。将所有绿色宝石转换成末日骷髅头。',
    // 修正（2026-09-18 官方复核）：官方 ConvertGems(Green→Doomskull) = 末日骷髅头（中文漏译「末日」，
    // 普通骷髅为降级误装）
    build: skill(
      inflict('curse', 'enemyAll'),
      transformToSpecial(BaseColor.Green, 'doomSkull'),
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
      // Native 8610 step 0 CreateGems 2 Yellow (not in EN) runs before the conversion.
      createGems(BaseColor.Yellow, 2),
      transformToSpecial(BaseColor.Yellow, 'uberDoomSkull'),
      // 「布网」= web（batch-34 7703 口径）；「最强的敌人」= enemyHealthiest；Web/Poison = FromPrevious（同一目标，同分不重抽）
      inflict('curse', 'enemyHealthiest'),
      inflict('web', 'lastTarget'),
      inflict('poison', 'lastTarget'),
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
      // Native order (R001, L4b-7195-order): ConvertGems Green->Skull, then CauseHuntersMark FrontEnemy.
      transform(BaseColor.Green, 'SKULL'),
      inflict('marked', 'enemyFront'),
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
