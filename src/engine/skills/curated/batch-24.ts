/**
 * 人工核对组装 · 批次 24（池：scripts/curated-pools/pool-24.json）
 * 核对者：agent 批次24
 *
 * 语义裁定备注：
 * - 本池大量「塔/Boss + 升华·升天·升阶 3-5 倍」条件 → 晋升度条件（batch-20 7790 /
 *   batch-25 9866/9875 同款）；「冰冻/沉没/愤怒/流血/石像鬼/妖精之火/末日骷髅/万能牌/
 *   天使/激怒/战利品/X形宝石」→ 特殊宝石家族（batch-10/16/23 同族）。
 * - 「使用X法力则加倍/三倍」「我的魔法值更高则双倍」「来自 Merlantis 则双倍」→
 *   条件倍率/条件触发，语义拿不准（batch-12 7254 / batch-22 8418/8467/8607 同款）。
 * - 「因被附魔/祝福/精灵射击/激怒的盟友和敌人数量而增强」→ 二次缩放来源不支持
 *   （附魔等非白名单状态 + 敌方侧无计数 kind，batch-04 9664 / batch-22 8656 同款）。
 * - 「恢复一半/50% 法力值」→ 比例法力（batch-14 8292 / batch-23 8857/9179 同款）；
 *   「因敌人(的)X而增强」来源归属已经第五遍裁定（前段目标单体 → targetStat；9596 据此回收）。
 * - 9591/9739 = batch-22 8820 精确同款（createMix base 0 + boardGems sources 计数相加）。
 * - 「龙龙」= Drake 名称族（troops.json 程序核实：DrakeRider 6133 / Drake 6360 /
 *   UndeadDrake 6891 / CobaltDrake 7368 / BrassDrake 7476）；排除施法者自身 DrakeEggs
 *   （batch-08 8389「卵孵化为奥眼能，不再召唤卵」同款）。
 * - 9613「杀死一名敌人」本可 execute（batch-20 7723 同款），因「随机法力药水宝石」
 *   无对应宝石原语整体 SKIP（batch-22 8602「红色法力药水」同款）。
 */
import { skill, dmg, heal, createMix, inflict, transform, transformToSpecial,
  summonRandom } from '../builders';
import { BaseColor } from '../../types';
import type { CuratedBatch } from './index';

const SKIPPED: { id: number; reason: string }[] = [
  { id: 9563, reason: '二次缩放来源不支持（「因被附魔的盟友和敌人数量而增强」：附魔为缺失状态且敌方侧无计数 kind，batch-04 9664 / batch-22 8656 同款）；「如果在星湾中使用」地点条件亦不支持' },
  { id: 9587, reason: '特殊宝石（冰冻宝石）' },
  { id: 9589, reason: '二次缩放来源不支持（「因沉没宝石数而增强」：boardGems 仅支持棋盘色宝石，batch-16 8798 同款）；「使敌方队伍混乱」亦为缺失状态' },
  { id: 9593, reason: '语义拿不准（「如果敌人来自 Merlantis」按王国限定条件无对应原语，batch-22 8607「光明森林」同款）' },
  { id: 9603, reason: '晋升度条件（「根据我的升华效果造成3-5倍伤害」，batch-20 7790 / batch-25 9866 同款）；「引爆2-3颗宝石」数量区间亦无原语' },
  { id: 9613, reason: '语义拿不准（「随机法力药水宝石」制作物无法对应宝石原语，batch-22 8602 同款）' },
  { id: 9614, reason: '二次缩放来源不支持（「因精灵射击敌人而增强」：精灵射击为缺失状态，batch-04 9664 附魔同族）；「将 3 个骷髅转换为 2 个万能牌」部分转化亦无原语（万能牌为特殊宝石）' },
  { id: 9651, reason: '语义拿不准（条件倍率：「如果我的魔法值更高，则造成双倍伤害」属性比较条件不在 condMult 条件域）' },
  { id: 9658, reason: '二次缩放来源「冰冻宝石」不在窗口 C 已实现特殊宝石清单（等美术/裁定）；「合成18颗冰冻宝石和末日骷髅头」混合创造语义亦不明' },
  { id: 9660, reason: '比例法力（「如果敌人死亡，则恢复一半法力值」无比例法力原语，batch-14 8292 / batch-23 8857 同款；「因敌人攻击力而增强」来源卡点已经第五遍裁定解决，仅剩比例法力）' },
  { id: 9665, reason: '晋升度条件（「根据我的升天次数造成3倍到5倍的伤害」，batch-20 7790 同款）；「摧毁一根随机柱子」亦无原语' },
  { id: 9668, reason: '晋升度条件（「如果敌人是Boss，则根据我的升华值造成3-5倍伤害」，batch-20 7790 / batch-25 9866 同款；「因敌人攻击力而增强」来源卡点已经第五遍裁定解决，仅剩晋升度条件）' },
  { id: 9669, reason: '语义拿不准（「对所有使用该法力颜色的敌人」按法力色限定目标无对应原语，batch-22 8477 同款）' },
  { id: 9672, reason: '晋升度条件（塔/升天等级 3-5 倍，batch-20 7790 同款）；「祝福所有盟友」亦为缺失状态' },
  { id: 9676, reason: '晋升度条件（Boss/升华 3-5 倍，batch-20 7790 同款）仍卡；「引爆3个末日骷髅」现可表达（explodeRandomSpecialGems doomSkull）' },
  { id: 9721, reason: '特殊宝石（X形宝石）；「在星湾使用时」地点条件亦不支持' },
  { id: 9724, reason: '二次缩放来源不支持（「因盟友和敌人受到祝福的数量而增强」：祝福为缺失状态且敌方侧无计数 kind，batch-22 8656 同款）；「天使宝石」亦为特殊宝石（batch-02 7158 同款）' },
  { id: 9727, reason: '二次缩放来源不支持（「因被激怒的盟友和敌人数量而增强」：激怒为缺失状态且敌方侧无计数 kind，batch-22 8656 同款）；「激怒宝石」亦为特殊宝石，「一名敌人和一名随机敌人」复合目标亦无原语' },
  { id: 9733, reason: '晋升度条件（Boss/升华 3-5 倍，batch-20 7790 同款）' },
  { id: 9741, reason: '晋升度条件（Boss/升华 3-5 倍，batch-20 7790 同款）' },
  { id: 9742, reason: '特殊宝石（愤怒宝石：来源计数与死亡条件创造均无法表达，batch-16 8798/8801 同款）' },
  { id: 9744, reason: '二次缩放来源不支持（「因愤怒宝石数量而增强」：boardGems 仅支持棋盘色宝石，batch-16 8798 同款）；「愤怒状态」亦为缺失状态' },
  { id: 9746, reason: '晋升度条件（塔/升华 3-5 倍，batch-20 7790 同款）；「引爆与敌人法力颜色相同的宝石」动态颜色亦无原语' },
  { id: 9772, reason: '特殊宝石（石像鬼宝石：来源计数与创造均无法表达，batch-16 8795 / batch-09 9023 同款）' },
  { id: 9776, reason: '语义拿不准（「对受屏障保护的 2 名盟友造成伤害」按状态筛选目标无对应原语，batch-22 8477「按法力色限定目标」同款）' },
  { id: 9785, reason: '晋升度条件（防御塔/升阶等级 3-5 倍，batch-25 9875 同款）；「流血宝石」亦为特殊宝石' },
  { id: 9786, reason: '特殊宝石（流血宝石：来源计数与转化均无法表达，batch-11 9793 同款）' },
  { id: 9792, reason: '特殊宝石（流血宝石/妖精之火宝石，batch-11 9793 / batch-10 特殊宝石家族同族）' },
  { id: 9794, reason: '晋升度条件（防御塔/升华 3-5 倍，batch-25 9866 同款）；「流血宝石」亦为特殊宝石' },
  { id: 9814, reason: '二次缩放来源不支持（「伤害由我的金币加成」黄金来源，SOP §3 明示）；「战利品宝石」亦为特殊宝石' },
  { id: 9843, reason: '语义拿不准（复合目标「一名敌人和另一名随机敌人」无对应原语）；「恢复我的法力值」数额不明' },
  { id: 9845, reason: '比例法力（「所有盟友恢复50%的法力值」，batch-14 8292 / batch-23 9179 同款）' },
];

const SPELLS: CuratedBatch['spells'] = [
  {
    id: 9552,
    desc: '为一名盟友赋予 [魔法 + 1] 点生命值，由黄色宝石增强。如果他们使用黄色法力，则效果增加三倍。 [2:1]',
    build: skill(
      // 回收：condMult 现支持 targetColor 条件倍率（按目标 manaColors 含该色判定）；
      // 「由黄色宝石增强」无「被摧毁/转换」字样 → boardGems 现读棋盘（batch-05 7334 / batch-19 7297 口径）
      heal('allyChosen', 1, 1, {
        modifier: { mod: { kind: 'ratio', a: 2, b: 1 }, source: { kind: 'boardGems', color: BaseColor.Yellow } },
        condMult: { times: 3, cond: { kind: 'targetColor', color: BaseColor.Yellow } },
      }),
    ),
  },
  {
    id: 9568,
    desc: '对敌人造成 [魔法 + 6] 点伤害，伤害值因骷髅数而增强。如果他们使用紫色法力，则伤害加倍并对其造成流血。 [x4]',
    build: skill(
      // 回收：condMult 现支持 targetColor 条件倍率（batch-24 9552 同款）；条件下的施加状态 =
      // inflict + ifCond（目标相对条件按该段自己的目标过滤，SOP「通用条件触发 / 条件加成」节）；
      // 裸「对敌人造成」= enemyChosen（batch-11 9852 / batch-21 8032 先例）
      dmg('enemyChosen', 6, 1, {
        modifier: { mod: { kind: 'multiplier', a: 4 }, source: { kind: 'boardSkulls' } },
        condMult: { times: 2, cond: { kind: 'targetColor', color: BaseColor.Purple } },
      }),
      inflict('bleed', 'enemyChosen', { ifCond: { kind: 'targetColor', color: BaseColor.Purple } }),
    ),
  },
  {
    id: 9591,
    desc: '创建与棋盘上当前蓝色和黄色宝石数量相等的蓝色和黄色宝石混合。 [1:1]',
    build: skill(
      // batch-22 8820 精确同款：base 0 + boardGems sources 计数相加
      createMix([BaseColor.Blue, BaseColor.Yellow], 0, 0, {
        modifier: {
          mod: { kind: 'ratio', a: 1, b: 1 },
          sources: [{ kind: 'boardGems', color: BaseColor.Blue }, { kind: 'boardGems', color: BaseColor.Yellow }],
        },
      }),
    ),
  },
  {
    id: 9596,
    desc: '对一名敌人造成[魔法 + 3]点伤害，伤害值因敌人攻击力而增强。如果敌人使用红色法力，则使其叠加2层流血效果。 [4:1]',
    build: skill(
      // 回收（第五遍）：「因敌人(的)X而增强」来源归属已裁定——前段目标为单体（enemyChosen）
      // → targetStat（受击目标自己的攻击力），不再是 targetStat/enemyStatSum 二选一（batch-13 7436 卡点解除）；
      // 「使用红色法力则叠加2层流血」= ifCond targetColor + inflict stacks（batch-24 9568 同款，引擎均已支持）
      dmg('enemyChosen', 3, 1, {
        modifier: { mod: { kind: 'ratio', a: 4, b: 1 }, source: { kind: 'targetStat', stat: 'attack' } },
      }),
      inflict('bleed', 'enemyChosen', { stacks: 2, ifCond: { kind: 'targetColor', color: BaseColor.Red } }),
    ),
  },
  {
    id: 9601,
    desc: '对一名敌人造成[魔法 + 3]点伤害，伤害值因绿色宝石数量而增强。如果敌人是恶魔，则造成双倍伤害并将其缠绕。 [3:1]',
    build: skill(
      // 回收：condMult 现支持 targetRace 条件倍率；「并将其缠绕」= inflict + ifCond
      // （条件施加状态现可表达，SOP「通用条件触发 / 条件加成」节，batch-15 8530 同款）
      dmg('enemyChosen', 3, 1, {
        modifier: { mod: { kind: 'ratio', a: 3, b: 1 }, source: { kind: 'boardGems', color: BaseColor.Green } },
        condMult: { times: 2, cond: { kind: 'targetRace', race: 'Daemon' } },
      }),
      inflict('entangle', 'enemyChosen', { ifCond: { kind: 'targetRace', race: 'Daemon' } }),
    ),
  },
  {
    id: 9615,
    desc: '将所有紫色宝石转换为骷髅。然后召唤一支随机的龙龙部队。',
    build: skill(
      transform(BaseColor.Purple, 'SKULL'),
      // 「龙龙」= Drake 名称族（SOP §6 程序核实，见文件头备注）；排除施法者自身 DrakeEggs
      summonRandom(['DrakeRider', 'Drake', 'UndeadDrake', 'CobaltDrake', 'BrassDrake']),
    ),
  },
  {
    id: 9739,
    desc: '创建与棋盘上当前蓝色和绿色宝石数量相等的蓝色和绿色宝石混合。 [1:1]',
    build: skill(
      // batch-22 8820 精确同款：base 0 + boardGems sources 计数相加
      createMix([BaseColor.Blue, BaseColor.Green], 0, 0, {
        modifier: {
          mod: { kind: 'ratio', a: 1, b: 1 },
          sources: [{ kind: 'boardGems', color: BaseColor.Blue }, { kind: 'boardGems', color: BaseColor.Green }],
        },
      }),
    ),
  },
  {
    id: 9818,
    desc: '对前两个敌人造成[魔法 + 4]点伤害，并将所有绿色宝石转化为末日骷髅。对后两个敌人造成[魔法 + 4]点伤害，并将所有红色宝石转化为末日骷髅。',
    build: skill(
      dmg('enemyFirstN', 4, 1, { n: 2 }),
      // 回收（第六遍）：「末日骷髅」= doomSkull 同物异名（SOP「特殊宝石」词表对照）；
      // 四个子句按描述顺序各成一段，无「以增强」修饰
      transformToSpecial(BaseColor.Green, 'doomSkull'),
      dmg('enemyLastN', 4, 1, { n: 2 }),
      transformToSpecial(BaseColor.Red, 'doomSkull'),
    ),
  },
];

export const BATCH_24: CuratedBatch = { batch: '24', spells: SPELLS, skipped: SKIPPED };
