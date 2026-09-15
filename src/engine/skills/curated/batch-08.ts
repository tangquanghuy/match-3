/**
 * 人工核对组装 · 批次 08（池：scripts/curated-pools/pool-08.json）
 * 核对者：agent 批次08
 *
 * 语义裁定备注：
 * - 「魔法值」= magic 属性、「法力值」= mana 资源（SOP 措辞裁定；同 batch-07 头注）。
 * - 「窃取 X 点生命值」= dmg + drain（batch-01 7302 同款）；「窃取 X 点法力值/魔法值」
 *   = steal(stat, gainStat 同属性)（batch-01 8278 同款）。
 * - 「以增强」句式（转换宝石以增强）：宝石操作段排在被增强段之前——transformedGems
 *   来源只数「本技能前序段」（batch-04 7002 / batch-07 7932 同款）。
 * - 「最弱/最强的敌人（盟友）」= enemyWeakest/allyHealthiest（spell-rules.md §0 目标措辞表）。
 * - 「数量因X宝石数而增强」（无「被摧毁/转换」字样）= boardGems 段执行时现读棋盘
 *   （batch-07 7974 同款）。
 * - 骑士 = Knight（troopTypes 核对）；「数值双倍」只辖数值段，屏障段无数值不挂 raceDouble。
 * - 「召唤一名随机奥眼能」：奥眼能非种族，按 referenceName 的 Ocularen 名称族列表
 *   （batch-03 8689「随机女巫」同款），排除施法者自身 OcularenEgg（卵孵化为奥眼能，不再召唤卵）。
 * - transform 骷髅端点用 'SKULL'（SOP 措辞裁定）；「宝石」不含骷髅，指定色段均指色宝石。
 */
import { skill, dmg, dmgAll, heal, armor, steal, transform, createGems,
  destroyColor, inflict, summonRandom } from '../builders';
import { BaseColor } from '../../types';
import type { CuratedBatch } from './index';

const SKIPPED: { id: number; reason: string }[] = [
  { id: 8164, reason: '句子式不明（「摧毁一整块大小为 5x5 的宝石」无对应面积清除原语）' },
  { id: 8212, reason: '语义拿不准（「或」三选一分支；「随机增益状态效果」无对应原语，同 batch-07 7994）' },
    { id: 8220, reason: '语义拿不准（跨段随机目标绑定：「燃烧第一组/冻结第二组敌人」指回前段 2 名随机目标，SOP 措辞裁定）' },
  { id: 8286, reason: '语义拿不准（「冻结 1 到 4 名随机敌人」随机数量区间无对应原语，inflict 仅支持固定 n）' },
  { id: 8294, reason: '语义拿不准（「对 1 到 4 名随机敌人」随机数量区间无原语；「打乱板面」亦无对应操作）' },
  { id: 8310, reason: '句子式不明（「所有在我下方的盟友」位置目标无对应目标模式，同 batch-07 8061）' },
  { id: 8356, reason: '语义拿不准（「所有紫色敌人」为法力色过滤目标，同 batch-07 7672；「耗掉 1-3 点法力值」区间数值无原语）' },
  { id: 8360, reason: '定量转换（「再将 4 颗黄色宝石转换成末日骷髅头」仅转 4 颗）无原语（transform 仅全棋盘，batch-16 8827 同款）；末日骷髅头转化端点本身现可表达（transformToSpecial doomSkull）' },
  { id: 8365, reason: '句子式不明（「一名敌人和其下方的敌人」位置目标无对应模式，同 batch-07 8061）；「荆棘森林的盟友数」来源（王国归属）亦不支持' },
    { id: 8369, reason: '语义拿不准（「或」三选一分支；「随机的状态效果」无对应原语，同 batch-07 7994）' },
  { id: 8371, reason: '语义拿不准（兵种转化：「转化成一名怨灵」，SOP 措辞裁定明确不做）' },
  { id: 8374, reason: '语义拿不准（条件触发：「若敌人幸存」——仅支持 ifTargetDied 反向条件，无幸存条件原语）' },
  { id: 8375, reason: '语义拿不准（「将之转换成生命值和攻击力」窃取转双属性无对应原语，steal 仅支持单一 gainStat）' },
  { id: 8377, reason: '语义拿不准（「转换成一个随机技能值并给予所有盟友」随机属性给予无对应原语，同 batch-07 7987）' },
  { id: 8407, reason: '语义拿不准（「有 50% 的几率造成三倍伤害」为概率化倍率，非条件倍率——chance 与 condMult 无法组合表达；「有 15% 的几率自毁」亦无对应原语）' },
  { id: 8416, reason: '缺失状态（狂怒）；「击回末位」隐匿/位置操作（同 batch-01 7534）' },
  { id: 8424, reason: '句子式不明（「以 3x3 交叉队列方式爆破宝石」形状与落点均无对应原语，explodeAt 仅 3x3 方块辐射）' },
  { id: 8433, reason: '二次缩放来源不支持（「陷入燃烧和妖火的敌人数」双状态复合来源，妖火不在状态白名单，同 batch-07 7811）' },
  { id: 8458, reason: '语义拿不准（「获得一个额外回合或获得 12 点护甲值」「或」二选一无法表达，同 batch-01 7348）' },
  { id: 8492, reason: '语义拿不准（「石墩」棋盘物的创造/摧毁无对应原语，「或者」分支亦无法表达）' },
  { id: 8496, reason: '句子式不明（「结果 [魔法 + 1] 对所有敌人造成损伤，由愤怒的同盟和敌人激活」机翻无法解析；「愤怒」亦不在状态白名单）' },
  { id: 8504, reason: '句子式不明（「炸毁三个骷髅头」无定量骷髅爆破原语（仅全部骷髅）；「获得一次攻击」无对应机制）' },
  { id: 8526, reason: '句子式不明（「敌人队伍使用对多的颜色宝石」机翻无法确解，疑为「敌方使用最多的颜色宝石」）' },
  { id: 8532, reason: '语义拿不准（条件触发：「若敌人法力值满值」，同 batch-07 7719）' },
];

const SPELLS: CuratedBatch['spells'] = [
  {
    id: 8162,
    desc: '将黄色宝石转换成紫色宝石。对最弱的一名敌人造成 [魔法 + 2] 点伤害。',
    build: skill(
      transform(BaseColor.Yellow, BaseColor.Purple),
      // 「最弱的一名敌人」= enemyWeakest（spell-rules.md §0）
      dmg('enemyWeakest', 2),
    ),
  },
  {
    id: 8171,
    desc: '窃取一名敌人 [魔法 + 1] 生命值，窃取数因自身生命值而加强。 [3:1]',
    build: skill(
      // 「窃取生命」= dmg + drain（batch-01 7302 同款）；「因自身生命值」= selfStat hp（当前值）
      dmg('enemyChosen', 1, 1, {
        drain: true,
        modifier: { mod: { kind: 'ratio', a: 3, b: 1 }, source: { kind: 'selfStat', stat: 'hp' } },
      }),
    ),
  },
  {
    id: 8208,
    desc: '将所有蓝色宝石转换成红色。赋予最强的盟友 [魔法 + 1] 点护甲值和屏障效果。',
    build: skill(
      transform(BaseColor.Blue, BaseColor.Red),
      // 「最强的盟友」= allyHealthiest（目标措辞表「最健康的盟友」同义）
      armor('allyHealthiest', 1),
      inflict('barrier', 'allyHealthiest'),
    ),
  },
  {
    id: 8245,
    desc: '赋予一名盟友屏障效果，再给予其 [魔法 + 1] 点护甲值。若盟友是一名骑士，则数值双倍。',
    build: skill(
      inflict('barrier', 'allyChosen'),
      // 骑士 = Knight（troopTypes 核对）；「数值双倍」辖护甲数值段（屏障无数值，不挂）
      armor('allyChosen', 1, 1, { raceDouble: 'Knight' }),
    ),
  },
  {
    id: 8246,
    desc: '将紫色宝石转换成黄色，绿色宝石转换成骷髅头。对 2 名随机敌人造成 [魔法 + 2] 点伤害。',
    build: skill(
      transform(BaseColor.Purple, BaseColor.Yellow),
      // 骷髅端点 'SKULL'（SOP 措辞裁定）
      transform(BaseColor.Green, 'SKULL'),
      dmg('enemyRandomN', 2, 1, { n: 2 }),
    ),
  },
  {
    id: 8279,
    desc: '对一名敌人造成 [魔法 + 4] 点伤害。若板上有 13 或更多颗棕色宝石，则造成 3 倍伤害。',
    build: skill(
      // 回收：condMult 现支持 boardAtLeast 条件倍率（SOP「如果板面上有 13 颗或更多红色宝石，则…」同款）
      dmg('enemyChosen', 4, 1, {
        condMult: { times: 3, cond: { kind: 'boardAtLeast', color: BaseColor.Brown, n: 13 } },
      }),
    ),
  },
  {
    id: 8364,
    desc: '为所有盟友提供 [魔法 + 1] 点护甲值，并将所有蓝色宝石转换成黄色以增强效果。 [3:1]',
    build: skill(
      // 「以增强」句式：转化段前置，transformedGems 来源才数得到（batch-04 7002 同款）
      transform(BaseColor.Blue, BaseColor.Yellow),
      armor('allyAll', 1, 1, { modifier: { mod: { kind: 'ratio', a: 3, b: 1 }, source: { kind: 'transformedGems' } } }),
    ),
  },
  {
    id: 8376,
    desc: '对所有敌人造成 [魔法 + 1] 点伤害。再窃取所有敌人 2 点魔法值。',
    build: skill(
      dmgAll(1),
      // 「魔法值」= magic 属性（SOP 措辞裁定，同 batch-01 8278）
      steal('enemyAll', 'magic', 'magic', 2, 0),
    ),
  },
  {
    id: 8389,
    desc: '召唤一名随机奥眼能。',
    build: skill(
      // 「奥眼能」非种族，按 referenceName 的 Ocularen 名称族列表（batch-03 8689「随机女巫」同款）；
      // 排除施法者自身 OcularenEgg（卵孵化为奥眼能，不再召唤卵）
      summonRandom(['OcularenLeech', 'Ocularen', 'BurningOcularen', 'GloomOcularen']),
    ),
  },
  {
    id: 8419,
    desc: '给予一名盟友 [魔法 + 1] 点生命值。将板面上所有蓝色、红色和棕色宝石移除。',
    build: skill(
      heal('allyChosen', 1),
      destroyColor(BaseColor.Blue),
      destroyColor(BaseColor.Red),
      destroyColor(BaseColor.Brown),
    ),
  },
  {
    id: 8426,
    desc: '创造 8 颗红色宝石和 8 颗黄色宝石。对第一位敌人造成 [魔法 + 3] 点伤害，再燃烧他。',
    build: skill(
      createGems(BaseColor.Red, 8),
      createGems(BaseColor.Yellow, 8),
      dmg('enemyFront', 3),
      inflict('burning', 'enemyFront'),
    ),
  },
  {
    id: 8463,
    desc: '对 3 名随机敌人造成 [魔法 + 4] 点伤害。若敌人已陷入燃烧状态，则伤害翻倍。',
    build: skill(
      // 回收：condMult 现支持 targetStatus 条件倍率（batch-05 7330 同款；逐受击目标判定）
      dmg('enemyRandomN', 4, 1, { n: 3, condMult: { times: 2, cond: { kind: 'targetStatus', statusId: 'burning' } } }),
    ),
  },
  {
    id: 8482,
    desc: '窃取一名敌人 7 点法力值，再窃取 [魔法 + 3] 点生命值，数量因紫色宝石数而增强。 [1:1]',
    build: skill(
      // 「窃取 7 点法力值」= steal mana→mana（目标削减 + 施法者获得）
      steal('enemyChosen', 'mana', 'mana', 7, 0),
      // 「数量」= 生命窃取量 → modifier 挂本段；「紫色宝石数」无「被摧毁/转换」字样
      // = boardGems 现读棋盘（batch-07 7974 同款）
      dmg('enemyChosen', 3, 1, {
        drain: true,
        modifier: { mod: { kind: 'ratio', a: 1, b: 1 }, source: { kind: 'boardGems', color: BaseColor.Purple } },
      }),
    ),
  },
  {
    id: 8524,
    desc: '对首 2 位敌人造成 [魔法 + 5] 点伤害再将他们击晕。获得屏障效果。',
    build: skill(
      dmg('enemyFirstN', 5, 1, { n: 2 }),
      inflict('stun', 'enemyFirstN'),
      inflict('barrier', 'allySelf'),
    ),
  },
];

export const BATCH_08: CuratedBatch = { batch: '08', spells: SPELLS, skipped: SKIPPED };
