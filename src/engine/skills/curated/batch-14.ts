/**
 * 人工核对组装 · 批次 14（池：scripts/curated-pools/pool-14.json）
 * 核对者：agent 批次14
 *
 * 语义裁定备注：
 * - 「爆破一颗宝石」（无颜色、无选定/随机字样）→ explodeRandomGems(1,0,'color')
 *   （batch-03/batch-11 头注同口径；「宝石」不含骷髅）。
 * - 「因被摧毁的骷髅头数而增强」：batch-05 7052 口径——清除段本身只清骷髅时用
 *   不带色筛选的 destroyedGems（8297 同款）；8090 摧毁行混色无法筛骷髅 → SKIP。
 * - 爆破/摧毁段（ClearGemParams）数量无 modifier 挂点（effects/gems.ts 仅 CreateGemParams
 *   支持）→ 7972「每有一名恶魔盟友则再加 1 颗」、8160「爆破板面上半数蓝色宝石」SKIP。
 * - 「绿色/黄色盟友」= 施法方关联该法力色的盟友：来源计数 alliesOfColor（batch-09 头注
 *   口径）；作目标时无对应 TargetMode → 8273/8465 SKIP。
 * - 「赐福/祝福」「狂怒」不在状态白名单 → 缺失状态（batch-01 7740 / batch-03 8387 同款）。
 * - 「魔法值」= magic 属性、「法力值」= mana 资源（SOP 措辞裁定）。
 * - 「最强的敌人」= enemyHealthiest（spell-rules.md §0）；bleed 在状态白名单（tests
 *   STATUS_WHITELIST）。
 * - 「摧毁一行和一列」= destroyChosenRow + destroyChosenCol：两条 chosenLine 均读同一
 *   ctx.chosenCell，即选定宝石的行+列十字（无随机字样照 batch-01 7016「摧毁 1 行」选定口径）。
 * - 8160「上海」为「伤害」原文笔误、8160/8180 双空格均逐字保留（对号入座锚）。
 */
import { skill, dmg, dmgSplash, heal, armor, attack,
  createGems, createMix, transform, destroyChosenCol, destroyChosenRow,
  destroySkulls, destroyColor, explodeRandomGems, inflict, extraTurn, CHOSEN } from '../builders';
import { BaseColor } from '../../types';
import type { CuratedBatch } from './index';

const SKIPPED: { id: number; reason: string }[] = [
  { id: 7972, reason: '二次缩放来源不支持（「每有一名恶魔盟友则再加  1 颗」——alliesOfRace 来源本身支持，但爆破段数量无 modifier 挂点，仅创造段支持）' },
  { id: 7992, reason: '隐匿/位置操作（「使首位和末位敌人交换位置」，batch-03 7555 同款）' },
  { id: 8024, reason: '缺失状态（赐福/祝福，batch-03 8387 同款）' },
    { id: 8057, reason: '缺失状态（「赐福所有恶魔盟友」）' },
  { id: 8069, reason: '缺失状态（「赐福一名盟友」）；「与其法力颜色相同的宝石」动态颜色亦不做（batch-11 9540 同款）' },
  { id: 8090, reason: '二次缩放来源不支持（「因被摧毁的骷髅头数而增强」——摧毁行混色，destroyedGems 无法筛骷髅；batch-05 7052 口径仅限清除段本身只清骷髅）' },
  { id: 8109, reason: '隐匿/位置操作（「打回末位」，batch-05 7255 同款）；「其法力颜色的宝石」动态颜色亦不做' },
  { id: 8160, reason: '二次缩放来源不支持（「爆破板面上半数蓝色宝石 [2:1]」——爆破段数量不支持二次缩放/板面占比，仅创造段有 modifier 挂点）' },
  { id: 8175, reason: '隐匿/位置操作（「为其下方的所有盟友」按队形位置取目标，batch-10 9126 同款）' },
  { id: 8180, reason: '语义拿不准（「所有使用此颜色的敌人」按选定颜色动态选敌，动态颜色不做，batch-09 8657 同款）' },
  { id: 8188, reason: '语义拿不准（「与盟友的法力颜色相同的宝石」动态颜色（batch-11 9540 同款）；「复制盟友」兵种复制无原语）' },
  { id: 8218, reason: '语义拿不准（「再冻结或燃烧敌人」二选一无法表达，batch-01 7348 同款）' },
  { id: 8225, reason: '语义拿不准（「若敌人已下潜，则杀掉…若未下潜，则使其下潜」为 if/else 条件触发分支（条件执行杀/施加），非倍率句式，无条件执行原语）' },
  { id: 8269, reason: '隐匿/位置操作（「打回末位」，batch-05 7255 同款）；「再重复 2 次」重复执行亦无原语' },
  { id: 8273, reason: '语义拿不准（「所有黄色盟友」按法力色选目标无对应 TargetMode（alliesOfColor 仅作来源计数）；「召唤首位敌人的卡牌」兵种复制召唤亦无原语）' },
  { id: 8292, reason: '语义拿不准（「缠绕…或给予…」二选一无法表达，batch-01 7348 同款）；「半数法力值」比例法力亦不做' },
  { id: 8305, reason: '语义拿不准（「第 3 位敌人」单序位目标无对应 TargetMode，enemyFirstN 是前 N 名整体）' },
  { id: 8359, reason: '语义拿不准（尾缀 [100:1] 无「因…增强」来源句式，来源不明）' },
  { id: 8411, reason: '缺失状态（「因有赐福的盟友数」——赐福为缺失状态且为 modifier 来源）' },
  { id: 8438, reason: '「再跑掉」已由 escape 落地（batch-39 口径）；「杀死一名随机敌人」= dmg execute 本可表达；剩余卡点=「只能施放一次」（每场一次施放限制无对应原语）' },
  { id: 8465, reason: '缺失状态（「赐福所有黄色盟友」；「黄色盟友」按法力色选目标亦无对应 TargetMode）' },
];

const SPELLS: CuratedBatch['spells'] = [
  {
    id: 7783,
    desc: '创造 5 颗蓝色宝石，宝石数量因被冻结的敌军数量而增强。 [x2]',
    build: skill(
      // 「宝石数量因…增强」点名创造段；「被冻结的敌军数量」= enemyStatusCount('frozen')
      createGems(BaseColor.Blue, 5, 0, {
        modifier: { mod: { kind: 'multiplier', a: 2 }, source: { kind: 'enemyStatusCount', statusId: 'frozen' } },
      }),
    ),
  },
  {
    id: 7951,
    desc: '摧毁一列。对一名随机敌人造成 [魔法 + 3] 点溅射伤害，伤害值因被摧毁的蓝色宝石数而增强。 [x5]',
    build: skill(
      destroyChosenCol(),
      dmgSplash('enemyRandom', 3, 1, {
        modifier: { mod: { kind: 'multiplier', a: 5 }, source: { kind: 'destroyedGems', color: BaseColor.Blue } },
      }),
    ),
  },
  {
    id: 8028,
    desc: '将所有黄色宝石转换成骷髅头。给予第一位盟友 [(魔法 / 2) + 1] 点攻击力。',
    build: skill(
      // transform 终点可为 'SKULL'（SOP 措辞裁定）
      transform(BaseColor.Yellow, 'SKULL'),
      // 「第一位盟友」= allyFront（batch-03 8033 同款）
      attack('allyFront', 1, 0.5),
    ),
  },
  {
    id: 8030,
    desc: '摧毁 1 列。对最后一位敌人造成 [魔法 + 5] 点伤害，伤害值因被摧毁的棕色宝石而增强。 [x5]',
    build: skill(
      destroyChosenCol(),
      dmg('enemyLast', 5, 1, {
        modifier: { mod: { kind: 'multiplier', a: 5 }, source: { kind: 'destroyedGems', color: BaseColor.Brown } },
      }),
    ),
  },
  {
    id: 8038,
    desc: '对一名敌人造成 [魔法 + 2] 点伤害。创造 6 颗蓝色宝石，数量因下潜的盟友数而增强。 [x3]',
    build: skill(
      dmg('enemyChosen', 2),
      // 「数量因下潜的盟友数而增强」点名创造段；allyStatusCount('submerged')（SOP 来源表原例）
      createGems(BaseColor.Blue, 6, 0, {
        modifier: { mod: { kind: 'multiplier', a: 3 }, source: { kind: 'allyStatusCount', statusId: 'submerged' } },
      }),
    ),
  },
  {
    id: 8157,
    desc: '爆破一颗宝石。对所有敌人造成 [魔法 + 1] 点伤害，伤害值因被摧毁的黄色宝石数而增强。 [x4]',
    build: skill(
      // 「爆破一颗宝石」→ 随机色宝石（batch-03/batch-11 头注同口径）
      explodeRandomGems(1, 0, 'color'),
      // 「对所有敌人」伤害段要 opts（挂 modifier）→ dmg + range:'all'
      dmg('enemyAll', 1, 1, {
        range: 'all',
        modifier: { mod: { kind: 'multiplier', a: 4 }, source: { kind: 'destroyedGems', color: BaseColor.Yellow } },
      }),
    ),
  },
  {
    id: 8224,
    desc: '将蓝色宝石转换成红色。使最强的敌人陷入出血状态。',
    build: skill(
      transform(BaseColor.Blue, BaseColor.Red),
      // 「最强的敌人」= enemyHealthiest（spell-rules.md §0）；bleed 在状态白名单
      inflict('bleed', 'enemyHealthiest'),
    ),
  },
  {
    id: 8234,
    desc: '将选定颜色的宝石转换成棕色。使一名盟友下潜并赋予其屏障效果。',
    build: skill(
      // transform 任一端可为 CHOSEN（builders.ts transform 注释；batch-02 同款）
      transform(CHOSEN, BaseColor.Brown),
      inflict('submerged', 'allyChosen'),
      inflict('barrier', 'allyChosen'),
    ),
  },
  {
    id: 8247,
    desc: '将黄色宝石转换成绿色。使最弱的敌人陷入织网和中毒状态。',
    build: skill(
      transform(BaseColor.Yellow, BaseColor.Green),
      inflict('web', 'enemyWeakest'),
      inflict('poison', 'enemyWeakest'),
    ),
  },
  {
    id: 8251,
    desc: '创造等同于目前板上蓝色和紫色数量的混合蓝色和紫色的宝石。 [1:1]',
    build: skill(
      // 数量 = 板上蓝色 + 紫色数：base 0 + sources 计数相加（[1:1] 每 1 来源 +1，SOP §3 多来源句式）
      createMix([BaseColor.Blue, BaseColor.Purple], 0, 0, {
        modifier: {
          mod: { kind: 'ratio', a: 1, b: 1 },
          sources: [{ kind: 'boardGems', color: BaseColor.Blue }, { kind: 'boardGems', color: BaseColor.Purple }],
        },
      }),
    ),
  },
  {
    id: 8297,
    desc: '摧毁所有骷髅头。获得 [魔法 + 1] 点生命值和护甲值，数值因被摧毁的骷髅头数而增强。 [1:1]',
    build: skill(
      // batch-05 7052 同款：清除段只清骷髅 → destroyedGems 不带色筛选恰等于被摧毁的骷髅数
      destroySkulls(),
      // 一个方括号喂双段（batch-03 8372 同款）；modifier 挂最近数值段（batch-05 7059/7266 口径）
      heal('allySelf', 1),
      armor('allySelf', 1, 1, {
        modifier: { mod: { kind: 'ratio', a: 1, b: 1 }, source: { kind: 'destroyedGems' } },
      }),
    ),
  },
  {
    id: 8311,
    desc: '创建 18 颗混合蓝色和绿色的宝石。使自身下潜。',
    build: skill(
      createMix([BaseColor.Blue, BaseColor.Green], 18, 0),
      inflict('submerged', 'allySelf'),
    ),
  },
  {
    id: 8413,
    desc: '对 2 名随机敌人造成 [魔法 + 2] 点伤害，伤害值因绿色盟友而加强。获得一个额外回合。 [x3]',
    build: skill(
      // 「因绿色盟友而加强」= alliesOfColor 'Green'（batch-09 头注口径：法力色关联盟友数）
      dmg('enemyRandomN', 2, 1, {
        n: 2,
        modifier: { mod: { kind: 'multiplier', a: 3 }, source: { kind: 'alliesOfColor', color: BaseColor.Green } },
      }),
      extraTurn(),
    ),
  },
  {
    id: 8420,
    desc: '摧毁一行和一列。对所有敌人造成 [魔法 + 1] 点伤害，伤害值因被摧毁的紫色和黄色宝石而增强。 [x2]',
    build: skill(
      // 「摧毁一行和一列」：两条 chosenLine 读同一 ctx.chosenCell = 选定宝石行+列十字
      destroyChosenRow(),
      destroyChosenCol(),
      // 「紫色和黄色宝石」双来源 → sources 计数相加（SOP §3；batch-11 9938/9852 同款）
      dmg('enemyAll', 1, 1, {
        range: 'all',
        modifier: {
          mod: { kind: 'multiplier', a: 2 },
          sources: [{ kind: 'destroyedGems', color: BaseColor.Purple }, { kind: 'destroyedGems', color: BaseColor.Yellow }],
        },
      }),
    ),
  },
  {
    id: 8468,
    desc: '移除所有蓝色宝石。对一名敌人造成 [魔法 + 2] 点伤害，伤害值因蓝色宝石而增强。 [3:1]',
    build: skill(
      destroyColor(BaseColor.Blue),
      // 「因蓝色宝石而增强」承接前句「移除所有蓝色宝石」→ destroyedGems 筛蓝（「移除所有X宝石以增强」句式）
      dmg('enemyChosen', 2, 1, {
        modifier: { mod: { kind: 'ratio', a: 3, b: 1 }, source: { kind: 'destroyedGems', color: BaseColor.Blue } },
      }),
    ),
  },
];

export const BATCH_14: CuratedBatch = { batch: '14', spells: SPELLS, skipped: SKIPPED };
