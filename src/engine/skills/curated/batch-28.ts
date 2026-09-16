/**
 * 人工核对组装 · 批次 28（池：scripts/curated-pools/pool-28.json）
 * 核对者：agent 批次28
 *
 * 语义裁定备注：
 * - 「爆破一行」= explodeChosenRow（batch-05/10/13 先例，无随机字样）；
 *   「爆破一颗宝石」= explodeRandomGems(1,0,'color)（batch-12/14/26 头注同口径）。
 * - 「因红色宝石、棕色宝石和骷髅头数量而增强」无「被摧毁」字样 → 棋盘现读三来源计数相加
 *   （batch-26 7930「绿色宝石和骷髅头数」同款）。
 * - 「因陷入冻结与燃烧状态的敌人数而增强」= 冻结敌人数 + 燃烧敌人数 双来源计数相加
 *   （batch-26 7565「纳迦和不死族盟友数」同款；GoW「boosted by A and B」为计数列表口径）。
 * - 「魔法值」= magic 属性（SOP 措辞裁定）；「因转换宝石数而增强」= transformedGems，
 *   转化段前置才数得到（batch-04 7002 同款）。
 * - 塔罗牌家族「板面上每有一颗X宝石，则有 7% 的几率获得一个额外回合。[x7]」：
 *   几率随来源增强经 chanceBoost 回收（8953/9029/9062）；「N 名盟友」裸复数（8970/9528-9530）
 *   未指明选择口径、「N 次攻击力」量词不明（8964）仍 SKIP。
 * - 8985「狂野皇廷」经程序核实（SOP §6 命令）既非 troopTypes 种族亦非 kingdom 字段取值 → 来源无法解析。
 * - 「若在南荒/古盖塔…使用，则翻倍」= 王国条件倍率 → SKIP（batch-23 9376 / batch-24 9721 同款）。
 */
import { skill, dmg, magic, transform, extraTurn, explodeChosenRow,
  explodeRandomGems, inflict } from '../builders';
import { BaseColor } from '../../types';
import type { CuratedBatch } from './index';

const SKIPPED: { id: number; reason: string }[] = [
  { id: 8863, reason: '语义拿不准（「召唤 1-3 名」数量区间无原语，batch-26 8193 同款）；「随所有敌人造成伤害」句式亦不明' },
  { id: 8885, reason: '语义拿不准（「每摧毁一颗黄色宝石，则使一名随机敌人陷入沉默」按来源数量重复施加状态无原语——status 段无数值缩放，modifier 无法驱动施加次数）' },
  { id: 8886, reason: '特殊宝石（绿色龙宝石，batch-10 8887 龙宝石同款）；「若我的队伍有克里斯坦纳斯」队伍含特定兵种条件亦不支持（batch-10 8841 同款）' },
  { id: 8917, reason: '特殊宝石（灵力宝石，batch-04 8918 同款）' },
  { id: 8964, reason: '语义拿不准（几率部分现可用 chanceBoost 表达；但「给予盟友 2 次攻击力」量词「2 次」机翻不明——攻击力点数还是攻击次数无法裁定，整条仍卡）' },
  { id: 8985, reason: '二次缩放来源不支持（「因狂野皇廷盟友数而增强」——程序核实「狂野皇廷」既非 troopTypes 种族亦非 kingdom 取值，alliesOfRace 无法取值）' },
  { id: 8986, reason: '缺失状态（反射效果）' },
  { id: 9063, reason: '缺失状态（恐怖）；「召唤一名午夜城市军队」按王国随机亦无法表达（batch-16 8831 同款）' },
  { id: 9139, reason: '隐匿/位置操作（「打乱板面」，batch-16 8814 同款）' },
  { id: 9219, reason: '特殊宝石（善石像鬼宝石，batch-16 8814 石像鬼宝石同款）；「对所有拥有其法力颜色的敌人」动态颜色条件亦不做（batch-26 8216 同款）' },
  { id: 9238, reason: '特殊宝石（天使宝石，batch-02 7158 同款）' },
  { id: 9247, reason: '特殊宝石（冻结宝石，非色宝石/骷髅，无对应创造原语）' },
  { id: 9283, reason: '特殊宝石（鬼魂宝石，batch-04 9292 同款）；「板面上没有一颗蓝色宝石」反向条件亦无对应原语' },
  { id: 9288, reason: '比例法力（「给予所有其他盟友 25% 法力值」，batch-23 9179 同款）' },
  { id: 9337, reason: '特殊宝石（缠绕宝石，batch-10 8945 同款）' },
  { id: 9368, reason: '王国条件倍率（「若在古盖塔使用，则伤害翻倍」）不支持（batch-23 9376 同款）；转化与真实伤害段现可表达（transformToSpecial CHOSEN doomSkull / trueDmg enemyAll）' },
  { id: 9370, reason: '语义拿不准（「若在南荒使用，则伤害翻倍」王国条件倍率，batch-23 9376 / batch-24 9721 同款）' },
  { id: 9372, reason: '语义拿不准（「若在迈纳杰大区使用，则伤害翻倍」王国条件倍率，batch-23 9376 同款）；「对 4 名敌人」目标随机性亦未指明' },
  { id: 9375, reason: '句子式不明（「真实散射伤害」未指明目标，batch-23 9376 同款）；「因妖仙宝石数而增强」来源亦不明' },
  { id: 9377, reason: '语义拿不准（「若在寒冬堡垒使用，则伤害翻倍」王国条件倍率，batch-23 9376 同款）' },
  { id: 9462, reason: '二次缩放来源不支持（「因敌我双方队伍的龙族军队数而增强」——来源计数仅支持己方，batch-26 头注 / 7598 同款）' },
  { id: 9476, reason: '晋升度条件（「如果敌人是 Boss，则根据我的升天造成 3 倍 - 5 倍伤害」，SOP 措辞裁定）；「恶魔传送门宝石」亦为特殊宝石' },
  { id: 9485, reason: '语义拿不准（「消除所有敌人 2 个随机技能中的 X 点」随机属性削减无原语，batch-26 7596 同款）；「如果在 Geheron 使用」王国条件、「随机负面状态」亦无原语' },
  { id: 9489, reason: '语义拿不准（「如果在中央尖塔中使用，效果加倍」王国条件倍率，batch-23 9376 同款）' },
  { id: 9512, reason: '句子式不明（「摧毁一个 5x5 的方块」无对应面积清除原语，batch-26 8116 / batch-08 8164 同款）' },
  { id: 9528, reason: '语义拿不准（几率部分现可用 chanceBoost 表达；但「给予 3 名盟友」裸复数未指明选择口径（首 3 位/随机 3 名），SOP 目标表无此措辞裁定）' },
  { id: 9529, reason: '语义拿不准（几率部分现可用 chanceBoost 表达；但「给予 3 名盟友」裸复数未指明选择口径，SOP 目标表无此措辞裁定）' },
  { id: 9530, reason: '语义拿不准（几率部分现可用 chanceBoost 表达；但「给予 3 名盟友」裸复数未指明选择口径，SOP 目标表无此措辞裁定）' },
];

const SPELLS: CuratedBatch['spells'] = [
  {
    id: 8928,
    desc: '爆破一行。对一名随机敌人造成 [(魔法 x 2) + 6] 点伤害，伤害值因红色宝石、棕色宝石和骷髅头数量而增强。 [x8]',
    build: skill(
      explodeChosenRow(),
      // 「爆破一行」= explodeChosenRow（batch-05/10/13 先例）
      dmg('enemyRandom', 6, 2, {
        // 无「被摧毁」字样 → 棋盘现读三来源计数相加（batch-26 7930 同款）
        modifier: {
          mod: { kind: 'multiplier', a: 8 },
          sources: [
            { kind: 'boardGems', color: BaseColor.Red },
            { kind: 'boardGems', color: BaseColor.Brown },
            { kind: 'boardSkulls' },
          ],
        },
      }),
    ),
  },
  {
    id: 8953,
    desc: '使一名敌人陷入织网状态。板面上每有一颗绿色宝石，则有 7% 的几率获得一个额外回合。 [x7]',
    build: skill(
      inflict('web', 'enemyChosen'),
      // 回收：chanceBoost 现支持「每颗X宝石 7% 几率」（SOP 示例句式；boardGems Green）
      extraTurn({ chanceBoost: { mod: { kind: 'multiplier', a: 7 }, source: { kind: 'boardGems', color: BaseColor.Green } } }),
    ),
  },
  {
    id: 8987,
    desc: '爆破 2 颗宝石，数量因陷入冻结与燃烧状态的敌人数而增强。获得一个额外回合。 [1:1]',
    build: skill(
      // 数量二次缩放挂在随机清除段（SOP §3）；「冻结与燃烧状态的敌人数」= 双状态计数相加
      // （batch-26 7565「纳迦和不死族盟友数」同款）
      explodeRandomGems(2, 0, 'color', undefined, {
        modifier: {
          mod: { kind: 'ratio', a: 1, b: 1 },
          sources: [
            { kind: 'enemyStatusCount', statusId: 'frozen' },
            { kind: 'enemyStatusCount', statusId: 'burning' },
          ],
        },
      }),
      extraTurn(),
    ),
  },
  {
    id: 9007,
    desc: '将所有黄色宝石转换成棕色。给予所有盟友 2 点魔法值，数值因转换宝石数而增强。 [3:1]',
    build: skill(
      // 「魔法值」= magic 属性（SOP 措辞裁定，batch-01 7401 同款）
      transform(BaseColor.Yellow, BaseColor.Brown),
      // 转化段前置，transformedGems 来源才数得到（batch-04 7002 同款）
      magic('allyAll', 2, 0, {
        modifier: { mod: { kind: 'ratio', a: 3, b: 1 }, source: { kind: 'transformedGems' } },
      }),
    ),
  },
  {
    id: 9029,
    desc: '给予一名盟友 2 点魔法值。板面上每有一颗红色宝石则有 7% 的几率获得一个额外回合。 [x7]',
    build: skill(
      // 「魔法值」= magic 属性（SOP 措辞裁定）；缩放为空 → 常数（mult=0）
      magic('allyChosen', 2, 0),
      // 回收：chanceBoost 现支持「每颗X宝石 7% 几率」（SOP 示例句式；boardGems Red）
      extraTurn({ chanceBoost: { mod: { kind: 'multiplier', a: 7 }, source: { kind: 'boardGems', color: BaseColor.Red } } }),
    ),
  },
  {
    id: 9062,
    desc: '给予所有盟友 3 点魔法值。板面上每有一颗红色宝石，则有 7% 的几率获得一个额外回合。 [x7]',
    build: skill(
      magic('allyAll', 3, 0),
      // 回收：chanceBoost 现支持「每颗X宝石 7% 几率」（SOP 示例句式；boardGems Red）
      extraTurn({ chanceBoost: { mod: { kind: 'multiplier', a: 7 }, source: { kind: 'boardGems', color: BaseColor.Red } } }),
    ),
  },
];

export const BATCH_28: CuratedBatch = { batch: '28', spells: SPELLS, skipped: SKIPPED };
