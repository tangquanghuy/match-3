/**
 * 人工核对组装 · 批次 21（池：scripts/curated-pools/pool-21.json）
 * 核对者：agent 批次21
 *
 * 语义裁定备注：
 * - 裸「对敌方造成…溅射伤害」（8032）= enemyChosen + dmgSplash（SOP 措辞裁定「裸敌人」
 *   + batch-11 9852「对敌人造成」→ enemyChosen 同款；「溅射」→ 溅射链 dmgSplash）。
 * - 「爆破 2 颗宝石」（7940）无颜色/选定/随机字样 → explodeRandomGems(2,0,'color')
 *   （batch-07 7674 / batch-11 头注同口径）。
 * - 「召唤一名树精或绿魔像」（7990）= 二者随机其一 → summonRandom（batch-19 7389
 *   「受膏者或残败者」同款）；referenceName 经 troops.json 程序核实：
 *   树精=Treant(6027)、绿魔像=GreenGolem(6653)。
 * - 「创造等同于目前板面上X和Y宝石数的混合X和Y的宝石 [1:1]」（8103/8113/8219）=
 *   createMix base 0 + sources boardGems 计数相加（batch-20 7765 / batch-14 8251 精确同款）。
 * - 「每摧毁一颗黄色宝石则爆破 2 颗随机宝石 [x2]」（8167）：数量二次缩放挂 gem 清除段
 *   （clear 段支持 modifier，batch-19 7133 骷髅版同款）；同句式施加状态版无此支持
 *   （batch-19 7430 / batch-20 7636 先例 → 7939/7988 SKIP）。
 * - 「因被缠绕和出血的敌人而增强」（8181）双状态来源 → sources 计数相加
 *   （batch-11 9938 同款；bleed 在 STATUS_WHITELIST）。
 * - 「窃取所有敌人 10 点生命值」（8181）= dmg + drain（batch-01 7302 同款）。
 * - 一个方括号喂攻/甲两段（8370）= batch-05 7152 / batch-19 7379 同款；
 *   modifier 挂最近数值段 = 护甲段（batch-05 7334 / batch-19 7379 口径）。
 * - transform 终点可为 'SKULL'（7990，SOP 措辞裁定）。
 */
import { skill, dmg, dmgSplash, trueDmg, heal, armor, attack, reduce, inflict,
  cleanse, transform, destroyChosenRow, destroyChosenCol, explodeRandomGems,
  createMix, summonRandom } from '../builders';
import { BaseColor } from '../../types';
import type { CuratedBatch } from './index';

const SKIPPED: { id: number; reason: string }[] = [
    { id: 7939, reason: '语义拿不准（「每摧毁一颗黄色宝石则击晕一名随机敌人」逐来源重复施加状态无对应原语（状态段数量不支持二次缩放）；[1:1] 归属亦不明，batch-19 7430 / batch-20 7636 同款）' },
  { id: 7943, reason: '语义拿不准（「若板面有 13+ 蓝宝石则获得 4 点攻击力」条件触发现可用 ifCond boardAtLeast 表达，但「爆破一行或一列」行/列二选一无对应原语，batch-16 8961 同款）' },
  { id: 7981, reason: '二次缩放来源不支持（「数值因敌我两方的恶魔数而增强」双侧种族计数无对应 kind，batch-20 7698 / batch-13 7546 同款）' },
  { id: 7988, reason: '语义拿不准（「每爆破一颗绿色宝石则缠绕一名随机敌人」逐来源重复施加状态无对应原语，batch-19 7430 / batch-20 7636 同款）' },
  { id: 8042, reason: '语义拿不准（「召唤 1-2 只恐狼」召唤数量区间无对应原语，summon 仅支持召唤一只/随机其一）' },
  { id: 8071, reason: '缺失状态（「因被赐福的盟友数而增强」赐福不在状态白名单，来源不可表达，batch-20 7792「狂怒的盟友数」同款）' },
  { id: 8172, reason: '二次缩放来源不支持（「因敌我双方死亡数而增强」阵亡计数无对应 kind，batch-20 7698 同款）；「杀死第一位敌人或第一位盟友」二选一亦无法表达' },
  { id: 8189, reason: '缺失状态（反射：「每摧毁一颗骷髅头，则赋予一名盟友反射效果」，batch-20 7792 同款）' },
  { id: 8190, reason: '缺失状态（「因拥有反射效果的盟友数而增强」反射不在状态白名单，batch-20 7792 同款）；「复制那名敌人」兵种转化亦不支持' },
  { id: 8240, reason: '语义拿不准（复合目标「对一名敌人和一名随机敌人」同 batch-20 7558；「若敌人使用紫色法力值，则造成双倍伤害」条件倍率现可表达但整条仍卡）' },
  { id: 8287, reason: '语义拿不准（双重增强子句「数量因被冻结的敌人数」「伤害值因蓝色宝石数」但 meta.modifier 仅一个 [x2]，归属无法裁定，SOP「至多一个 modifier」无先例）' },
  { id: 8307, reason: '语义拿不准（「有 50% 的几率打错人」目标偏移无对应机制；「若敌人使用红色法力值，则造成 3 倍伤害」条件倍率现可表达但整条仍卡）' },
  { id: 8355, reason: '语义拿不准（「使板面上一个指定颜色的宝石数翻倍」「所有同色盟友」跨段动态颜色绑定，boardGems/alliesOfColor 仅支持固定色，batch-09 8657 同款）' },
  { id: 8358, reason: '比例法力（「给予所有盟友 4 分之一的法力值」，SOP §4）' },
  { id: 8367, reason: '二次缩放来源不支持（「因所有红色敌人的法力值而增强」敌方侧按颜色筛选的属性总和无对应 kind，batch-20 7483「棕色敌军数量」同款；「所有红色敌人」颜色限定目标亦不支持）' },
  { id: 8368, reason: '语义拿不准（「将最强的敌人的魔力值减半」暂无原语（SOP §3），batch-19 7438 同款）' },
  { id: 8373, reason: '缺失状态（狂怒：「如果自身身处狂怒状态…自身获得狂怒效果」，batch-20 7792 同款；「则造成双倍伤害」的自身狂怒条件亦不在 condMult 条件域）' },
];

const SPELLS: CuratedBatch['spells'] = [
  {
    id: 7937,
    desc: '对一名敌人造成 [魔法 + 1] 点伤害，并有 10% 的几率将其诛杀。同时此几率因每个紫色宝石而增强 +2%。 [x2]',
    build: skill(
      dmg('enemyChosen', 1),
      // 回收：几率诛杀 = 独立 execute 段 + chance（batch-03 7789「处死」同款）；
      // chanceBoost 现支持概率加成：「因每个紫色宝石而增强」无「被摧毁/板面上」字样，
      // 「宝石数」按现读棋盘计（batch-05 7334 / batch-19 7297 口径）→ boardGems Purple
      dmg('enemyChosen', 0, 0, {
        execute: true,
        chance: 0.1,
        chanceBoost: { mod: { kind: 'multiplier', a: 2 }, source: { kind: 'boardGems', color: BaseColor.Purple } },
      }),
    ),
  },
  {
    id: 7940,
    desc: '对一名敌人造成 [魔法 + 4] 点溅射伤害，伤害值因所有盟友的攻击力而增强。爆破 2 颗宝石。 [3:1]',
    build: skill(
      dmgSplash('enemyChosen', 4, 1, {
        modifier: { mod: { kind: 'ratio', a: 3, b: 1 }, source: { kind: 'allyStatSum', stat: 'attack' } },
      }),
      explodeRandomGems(2, 0, 'color'),
    ),
  },
  {
    id: 7990,
    desc: '将红色宝石转换成紫色和黄色宝石转换成骷髅头。召唤一名树精或绿魔像。',
    build: skill(
      transform(BaseColor.Red, BaseColor.Purple),
      transform(BaseColor.Yellow, 'SKULL'),
      summonRandom(['Treant', 'GreenGolem']),
    ),
  },
  {
    id: 8032,
    desc: '将所有红色宝石转换成绿色。对敌方造成 [魔法 + 3] 点溅射伤害，伤害值因被转换的宝石数而增强。 [1:1]',
    build: skill(
      transform(BaseColor.Red, BaseColor.Green),
      dmgSplash('enemyChosen', 3, 1, {
        modifier: { mod: { kind: 'ratio', a: 1, b: 1 }, source: { kind: 'transformedGems' } },
      }),
    ),
  },
  {
    id: 8103,
    desc: '创造等同于目前板面上红色和棕色宝石数的混合红色和棕色的宝石。 [1:1]',
    build: skill(
      createMix([BaseColor.Red, BaseColor.Brown], 0, 0, {
        modifier: {
          mod: { kind: 'ratio', a: 1, b: 1 },
          sources: [{ kind: 'boardGems', color: BaseColor.Red }, { kind: 'boardGems', color: BaseColor.Brown }],
        },
      }),
    ),
  },
  {
    id: 8105,
    desc: '对一名敌人造成 [魔法 + 1] 点真实伤害。若敌人陷入织网状态，则耗掉其 5 点法力值。使敌人陷入织网状态。',
    build: skill(
      trueDmg('enemyChosen', 1),
      // 回收：ifCond 现支持条件触发（SOP「通用条件触发 / 条件加成」节）；targetStatus 为目标
      // 相对条件、按该段自己的目标判定；「耗掉 X 点法力值」= reduce mana 带数值（spell-rules §3）
      reduce('enemyChosen', 'mana', 5, 0, { ifCond: { kind: 'targetStatus', statusId: 'web' } }),
      inflict('web', 'enemyChosen'),
    ),
  },
  {
    id: 8113,
    desc: '创造等同于目前板面上绿色和紫色宝石数的混合绿色和紫色的宝石。 [1:1]',
    build: skill(
      createMix([BaseColor.Green, BaseColor.Purple], 0, 0, {
        modifier: {
          mod: { kind: 'ratio', a: 1, b: 1 },
          sources: [{ kind: 'boardGems', color: BaseColor.Green }, { kind: 'boardGems', color: BaseColor.Purple }],
        },
      }),
    ),
  },
  {
    id: 8150,
    desc: '将棕色宝石转换成红色。对 1 名敌人造成 [魔法 + 5] 点伤害，伤害值因转换的宝石数而增强。 [2:1]',
    build: skill(
      transform(BaseColor.Brown, BaseColor.Red),
      dmg('enemyChosen', 5, 1, {
        modifier: { mod: { kind: 'ratio', a: 2, b: 1 }, source: { kind: 'transformedGems' } },
      }),
    ),
  },
  {
    id: 8167,
    desc: '摧毁一列。每摧毁一颗黄色宝石则爆破 2 颗随机宝石。 [x2]',
    build: skill(
      destroyChosenCol(),
      explodeRandomGems(2, 0, 'color', undefined, {
        modifier: { mod: { kind: 'multiplier', a: 2 }, source: { kind: 'destroyedGems', color: BaseColor.Yellow } },
      }),
    ),
  },
  {
    id: 8181,
    desc: '对一名敌人造成 [魔法 + 8] 点严重的溅射伤害，伤害值因被缠绕和出血的敌人而增强。窃取所有敌人 10 点生命值。 [x8]',
    build: skill(
      // 修饰子句辖域以子句为界（spell-rules §1 多同类段辖域，2026-09-16 裁定）：
      // 「伤害值因…增强」只包着溅射段；后续「窃取所有敌人 10 点生命值。」是独立子句，不吃 [x8]
      dmgSplash('enemyChosen', 8, 1, {
        modifier: {
          mod: { kind: 'multiplier', a: 8 },
          sources: [{ kind: 'enemyStatusCount', statusId: 'entangle' }, { kind: 'enemyStatusCount', statusId: 'bleed' }],
        },
      }),
      dmg('enemyAll', 10, 0, { range: 'all', drain: true }),
    ),
  },
  {
    id: 8210,
    desc: '摧毁一行。获得 [魔法 + 1] 点生命值，数量因被摧毁的绿色宝石而增强。净化所有其他盟友。 [x5]',
    build: skill(
      destroyChosenRow(),
      heal('allySelf', 1, 1, {
        modifier: { mod: { kind: 'multiplier', a: 5 }, source: { kind: 'destroyedGems', color: BaseColor.Green } },
      }),
      cleanse('allyOthers'),
    ),
  },
  {
    id: 8219,
    desc: '创造混合蓝色与红色的宝石，数量等同于目前板上蓝色和红色宝石数。 [1:1]',
    build: skill(
      createMix([BaseColor.Blue, BaseColor.Red], 0, 0, {
        modifier: {
          mod: { kind: 'ratio', a: 1, b: 1 },
          sources: [{ kind: 'boardGems', color: BaseColor.Blue }, { kind: 'boardGems', color: BaseColor.Red }],
        },
      }),
    ),
  },
  {
    id: 8267,
    desc: '对一名敌人造成 [魔法 + 3] 点真实伤害。有 10% 的几率将其击杀，几率因其护甲值而增强。 [5:1]',
    build: skill(
      trueDmg('enemyChosen', 3),
      // 回收：几率击杀 = 独立 execute 段 + chance（batch-03 7789 同款）；chanceBoost 来源
      // targetStat 读最近目标段主目标（即该敌人）的护甲值；[5:1] = 每 5 点护甲 +1 个百分点
      dmg('enemyChosen', 0, 0, {
        execute: true,
        chance: 0.1,
        chanceBoost: { mod: { kind: 'ratio', a: 5, b: 1 }, source: { kind: 'targetStat', stat: 'armor' } },
      }),
    ),
  },
  {
    id: 8370,
    desc: '摧毁一行。获得 [(魔法 / 2) + 1] 点攻击力和护甲值，数值因被摧毁的棕色宝石而增强。 [x5]',
    build: skill(
      destroyChosenRow(),
      attack('allySelf', 1, 0.5),
      armor('allySelf', 1, 0.5, {
        modifier: { mod: { kind: 'multiplier', a: 5 }, source: { kind: 'destroyedGems', color: BaseColor.Brown } },
      }),
    ),
  },
];

export const BATCH_21: CuratedBatch = { batch: '21', spells: SPELLS, skipped: SKIPPED };
