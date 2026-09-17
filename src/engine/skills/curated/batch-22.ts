/**
 * 人工核对组装 · 批次 22（池：scripts/curated-pools/pool-22.json）
 * 核对者：agent 批次22
 *
 * 语义裁定备注：
 * - 召唤物/种族经 troops.json 程序核实（SOP §6 命令）：巨大毒菌=GiantToadstool(6279)、
 *   爆毒菌=Exploadstool(6758)、猫蝶=Catterfly(7127)；神祇=Divine、不死族=Undead、
 *   海族=Merfolk（海马/海珠拉/海兽利维坦等 troopTypes 均为 Merfolk）。
 * - 「若敌人是不死族/神祇，则(双倍/3 倍)伤害」= raceDouble(+raceTimes) 挂伤害段
 *   （DamageSegment.raceDouble 按受击者判定；神祇=Divine 承 batch-20 7503）。
 * - 「若敌人身亡，则创建 8 颗骷髅头」= ifTargetDied 挂创造段（batch-20 7749 同款）。
 * - 一个方括号喂双段、modifier 挂最近数值段（batch-15 8614 / batch-14 8297 口径）。
 * - 「有 50% 的几率召唤」= 召唤段挂 chance（batch-17 109 { ...summonRef, chance } 同款）。
 * - 「巨大毒菌或爆毒菌」= 二选一枚举 → summonRandom（batch-20 7697「随机巨人」同款）。
 * - 「严重溅射」单目标 = dmgSplash（SOP 措辞裁定；batch-20 7697 同款）。
 * - 「因蓝色盟友和敌人数而增强」（8656）与 batch-15 8599「由棕色盟友和敌人激发」/
 *   8784「每有一名绿色盟友或敌人」同构（双名词同类、颜色可分配到敌方侧），
 *   敌方侧颜色计数无对应 kind → 从先例 SKIP，不套用 SOP「蓝色宝石和盟友数」异类名词口径。
 * - 8820 = batch-20 7765 精确同款（createMix base 0 + boardGems sources 计数相加）。
 * - 「魔法值」= magic 属性、「法力值/魔力」= mana（SOP 措辞裁定；8818）。
 */
import { skill, dmg, trueDmg, dmgSplash, heal, armor, attack, magic, inflict,
  createGems, createMix, createSkulls, destroyChosenCol, explodeRandomGems,
  summonRef, summonRandom, extraTurn } from '../builders';
import { BaseColor } from '../../types';
import type { CuratedBatch } from './index';

const SKIPPED: { id: number; reason: string }[] = [
  { id: 8414, reason: '隐匿/位置操作（「将之击回末位」，batch-01 7534 / batch-16 8933 同款）' },
  { id: 8457, reason: '语义拿不准（「获得一个额外回合或创造 7 颗骷髅头」二选一，batch-01 7348 / batch-16 8961 同款）' },
  { id: 8464, reason: '二次缩放来源不支持（「因选定的颜色（黄色除外）而增强」：来源 color 仅支持具体基色，选定色/除外色无法表达）' },
  { id: 8467, reason: '语义拿不准（[x5] 无来源子句可绑定（meta.modifier 非空但文本无「因…而增强」子句）；「若敌人使用蓝色法力，则摧毁一列/获得攻击力」为目标相对条件——挂无目标段（摧毁一列）无从判定，挂自身获得段（attack allySelf）则判定对象错位）' },
  { id: 8475, reason: '语义拿不准（「每爆破一颗红色宝石则燃烧一名随机敌人」逐来源重复施加状态无对应原语，batch-20 7636 同款；[1:1] 绑定亦不明确）' },
  { id: 8477, reason: '语义拿不准（「所有棕色盟友」按法力色限定目标无对应原语：targetRace 仅支持种族，颜色限定仅 modifier 来源 alliesOfColor 可表达）' },
  { id: 8485, reason: '语义拿不准（「每一名受到伤害的敌人」跨段指回溅射目标集，无对应目标模式，SOP「对其…指回前段」同款）' },
  { id: 8493, reason: '语义拿不准（「可保护一位同盟不受伤害」机制不明；[1:1] 无来源子句可绑定）' },
  { id: 8494, reason: '特殊宝石（「石墩」：由石墩激活/炸毁/重建石墩均无法表达；首句译文亦不可解析）' },
  { id: 8495, reason: '句子式不明（「结果 [魔法 + 3] 造成一名敌人受伤并封印他们……减10点」译文不可解析）' },
  { id: 8590, reason: '隐匿/位置操作（「对其和其上位所有敌人」相对位置目标，batch-20 7790「上方和下方」同款）' },
  { id: 8596, reason: '句子式不明（「将5有绿宝石都转化为紫色药水」译文不可解析）' },
  { id: 8602, reason: '语义拿不准（条件触发：「如果任何敌人火烧上身，有 50% 的几率…」；「制作红色法力药水」制作物亦无法对应宝石原语）' },
  { id: 8607, reason: '语义拿不准（「所有光明森林的盟友」按王国限定目标无对应原语；「被保佑并给予3种魔法」译文不可解析）' },
  { id: 8694, reason: '语义拿不准（「有 [魔法 + 1] 的几率」概率用缩放表达无对应原语；「消除其所有技能值 10 点」无多属性削减原语）' },
  { id: 8716, reason: '伤害区间（[(魔法 x 2) + 1] – [(魔法 x 4) + 3]，待「顺路」批次）' },
  { id: 8779, reason: '特殊宝石（「石块」：因石块数量增强、转换成石块均无法表达）' },
  { id: 8812, reason: '二次缩放来源不支持（「每有一颗骷髅头被摧毁」被摧毁骷髅计数无对应 kind：destroyedGems 无色筛选时色宝石一并计入）' },
  { id: 8852, reason: '语义拿不准（「偷取魔力值10，或者生命值20，或者盔甲魔力值20」三选一且「盔甲魔力值」译文不可解析，batch-01 7348 二选一同款）' },
];

const SPELLS: CuratedBatch['spells'] = [
  {
    id: 8474,
    desc: '爆破 [魔法 + 1] 颗紫色宝石。再召唤一名巨大毒菌或爆毒菌。获得一个额外回合。',
    build: skill(
      explodeRandomGems(1, 1, 'color', BaseColor.Purple),
      // 「召唤一名巨大毒菌或爆毒菌」= 二者取一（refs 程序核实：GiantToadstool 6279 / Exploadstool 6758）
      summonRandom(['GiantToadstool', 'Exploadstool']),
      extraTurn(),
    ),
  },
  {
    id: 8480,
    desc: '对一名敌人造成 [魔法 + 1] 点伤害。若敌人是不死族，则造成双倍伤害。若敌人身亡，则创建 8 颗骷髅头。',
    build: skill(
      // 「若敌人是不死族」= 受击者种族条件翻倍 → raceDouble 挂伤害段（不死族 = Undead，SOP §6 核实）
      dmg('enemyChosen', 1, 1, { raceDouble: 'Undead' }),
      // 「若敌人身亡」= §4 死亡条件挂创造段（batch-20 7749 同款）
      createSkulls(8, 0, { ifTargetDied: true }),
    ),
  },
  {
    id: 8481,
    desc: '摧毁一列。获得 [魔法 + 1] 点护甲值和攻击力，数值因被摧毁的黄色宝石而增强。获得屏障效果。 [x2]',
    build: skill(
      destroyChosenCol(),
      // 一个方括号喂双段；modifier 挂最近数值段（batch-15 8614 / batch-14 8297 口径）
      armor('allySelf', 1, 1),
      attack('allySelf', 1, 1, {
        modifier: { mod: { kind: 'multiplier', a: 2 }, source: { kind: 'destroyedGems', color: BaseColor.Yellow } },
      }),
      inflict('barrier', 'allySelf'),
    ),
  },
  {
    id: 8543,
    desc: '对一名敌人造成 [魔法 + 2] 点伤害。获得 [魔法 + 2] 点护甲值，数值因敌人攻击力而增强。  [2:1]',
    build: skill(
      dmg('enemyChosen', 2),
      // 回收（第五遍）：「因敌人(的)X而增强」来源归属已裁定——前段目标为单体（enemyChosen）
      // → targetStat（受击目标自己的攻击力），不再是 targetStat/enemyStatSum 二选一（batch-13 7436 卡点解除）
      armor('allySelf', 2, 1, {
        modifier: { mod: { kind: 'ratio', a: 2, b: 1 }, source: { kind: 'targetStat', stat: 'attack' } },
      }),
    ),
  },
  {
    id: 8631,
    desc: '给予首 2 位盟友 [魔法 + 1] 点生命值。板面上每有一颗红色宝石则有 7% 的几率获得一个额外回合。 [x7]',
    build: skill(
      heal('allyFirstN', 1, 1, { n: 2 }),
      // 回收：chanceBoost 现支持「每颗X宝石 7% 几率」（SOP 示例句式；boardGems Red）
      extraTurn({ chanceBoost: { mod: { kind: 'multiplier', a: 7 }, source: { kind: 'boardGems', color: BaseColor.Red } } }),
    ),
  },
  {
    id: 8660,
    desc: '对一名敌人造成 [魔法 + 3] 点伤害，有 3% 的几率将其杀戮。每有一颗末日骷髅头则几率增强 3%。 [x3]',
    build: skill(
      dmg('enemyChosen', 3),
      // 回收（第六遍）：「杀戮」= 即杀 execute（batch-03 7789「处死」同款）；几率增强 =
      // chanceBoost + boardSpecial（文本明说『末日骷髅头』→ 精确计数该种类；『因骷髅头数』才用 boardSkulls）
      dmg('enemyChosen', 0, 0, {
        execute: true,
        chance: 0.03,
        chanceBoost: { mod: { kind: 'multiplier', a: 3 }, source: { kind: 'boardSpecial', gem: 'doomSkull' } },
      }),
    ),
  },
  {
    id: 8662,
    desc: '对一名敌人造成 [魔法 + 3] 点真实伤害，有 5% 的几率将其杀戮。每有一颗末日骷髅头则几率增强 5%。 [x5]',
    build: skill(
      trueDmg('enemyChosen', 3),
      // 同 8660：execute + chance + chanceBoost(boardSpecial doomSkull)；主伤害为真实伤害 → trueDmg
      dmg('enemyChosen', 0, 0, {
        execute: true,
        chance: 0.05,
        chanceBoost: { mod: { kind: 'multiplier', a: 5 }, source: { kind: 'boardSpecial', gem: 'doomSkull' } },
      }),
    ),
  },
  {
    id: 8671,
    desc: '创造 10 颗绿色宝石。有 50% 的几率召唤猫蝶。',
    build: skill(
      createGems(BaseColor.Green, 10, 0),
      // 召唤段挂概率：batch-17 109 { ...summonRef, chance } 同款（猫蝶 = Catterfly 7127，程序核实）
      { ...summonRef('Catterfly'), chance: 0.5 },
    ),
  },
  {
    id: 8711,
    desc: '对一名敌人造成 [魔法 + 1] 点伤害。获得 [魔法 + 1] 点护甲值，数值因燃烧的敌人数而增强。 [x4]',
    build: skill(
      dmg('enemyChosen', 1),
      // 「燃烧的敌人数」= enemyStatusCount burning（batch-20 7516 同款）
      armor('allySelf', 1, 1, {
        modifier: { mod: { kind: 'multiplier', a: 4 }, source: { kind: 'enemyStatusCount', statusId: 'burning' } },
      }),
    ),
  },
  {
    id: 8720,
    desc: '给予盟友 [魔法 + 1] 点护甲值。板面上每有一颗绿色宝石，则有 7% 的几率获得一个额外回合。 [x7]',
    // 修正（2026-09-18 官方复核）：官方 IncreaseArmor@AllAllies = 全体盟友（中文漏译「所有」）
    build: skill(
      armor('allyAll', 1),
      // 回收：chanceBoost 现支持「每颗X宝石 7% 几率」（SOP 示例句式；boardGems Green）
      extraTurn({ chanceBoost: { mod: { kind: 'multiplier', a: 7 }, source: { kind: 'boardGems', color: BaseColor.Green } } }),
    ),
  },
  {
    id: 8748,
    desc: '对一名敌人造成 [魔法 + 3] 点伤害，伤害值因骷髅头数量而增强。若敌人是一名神祇，则造成 3 倍伤害。 [3:1]',
    build: skill(
      // 「因骷髅头数量而增强」= boardSkulls；「神祇 3 倍」= raceDouble + raceTimes（Divine，batch-20 7503 同族）
      dmg('enemyChosen', 3, 1, {
        modifier: { mod: { kind: 'ratio', a: 3, b: 1 }, source: { kind: 'boardSkulls' } },
        raceDouble: 'Divine',
        raceTimes: 3,
      }),
    ),
  },
  {
    id: 8818,
    desc: '对一名敌人造成 [魔法 + 3] 点严重溅射伤害，伤害值因蓝色宝石数而增强。再给予所有海族 4 点魔法值。 [1:1]',
    build: skill(
      // 「对 1 名敌人…溅射」= 溅射链（SOP 措辞裁定）；「魔法值」= magic 属性
      dmgSplash('enemyChosen', 3, 1, {
        modifier: { mod: { kind: 'ratio', a: 1, b: 1 }, source: { kind: 'boardGems', color: BaseColor.Blue } },
      }),
      // 「海族」= Merfolk（troops.json 程序核实：海马/海珠拉/海兽利维坦等均属 Merfolk）
      magic('allyAll', 4, 0, { targetRace: 'Merfolk' }),
    ),
  },
  {
    id: 8820,
    desc: '在板面上创造混合绿色和棕色的宝石，数量等同于板面上绿色和棕色宝石数。 [1:1]',
    build: skill(
      // batch-20 7765 精确同款：base 0 + sources 计数相加
      createMix([BaseColor.Green, BaseColor.Brown], 0, 0, {
        modifier: {
          mod: { kind: 'ratio', a: 1, b: 1 },
          sources: [{ kind: 'boardGems', color: BaseColor.Green }, { kind: 'boardGems', color: BaseColor.Brown }],
        },
      }),
    ),
  },
  {
    id: 8828,
    desc: '给予所有盟友 [魔法 + 1] 点攻击力。板面上每有一颗红色宝石则有 7% 的几率获得一个额外回合。 [x7]',
    build: skill(
      attack('allyAll', 1),
      // 回收：chanceBoost 现支持「每颗X宝石 7% 几率」（SOP 示例句式；boardGems Red）
      extraTurn({ chanceBoost: { mod: { kind: 'multiplier', a: 7 }, source: { kind: 'boardGems', color: BaseColor.Red } } }),
    ),
  },
];

export const BATCH_22: CuratedBatch = { batch: '22', spells: SPELLS, skipped: SKIPPED };
