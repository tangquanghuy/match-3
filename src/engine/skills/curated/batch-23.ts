/**
 * 人工核对组装 · 批次 23（池：scripts/curated-pools/pool-23.json）
 * 核对者：agent 批次23
 *
 * 语义裁定备注：
 * - 本池多条 desc 以「&&」分隔子句（spell-rules.md §0.1 认可的子句分隔符），desc 逐字保留原文。
 * - 裸「造成…散射伤害」未指明目标 → SKIP 句子式不明（batch-02 7265 / batch-18 头注同款；
 *   本批 8860/9175/9376 三条均因此放弃）。
 * - 「消除一名敌人所有护甲值」= reduce armor + drainAll（batch-01 7175「减除全部护甲值」同口径）。
 * - 「吸取一名敌人的所有法力值」= drainMana（batch-17 9572「吸取敌人的所有法力」同款）；
 *   「因吸取的法力值而增强」= source drainedMana（batch-05 7142 / batch-17 9572 同口径）。
 * - 「若有敌人身亡」= spell-rules.md §4 死亡条件家族，挂最近产目标段（batch-12 7225 同款）；
 *   「前 2 位敌人…消除他们」= enemyFirstN 确定性目标跨段复用（batch-06 7063 先例）。
 * - 「所有技能值」按 batch-05 7165 口径拆 4 个增益段，一个方括号喂四段共用缩放
 *   （batch-30 9401 同款）；8883 的额外回合几率随板面绿色宝石数增强经 chanceBoost 回收。
 * - 种族经 troops.json 程序核实（SOP §6）：鸟族=Stryx（埃格里斯 7436 自身 troopTypes 含
 *   Stryx/Beast）；「Urska Allies」原文即种族名（伊瓦尔 7637 troopTypes=Urska，batch-10 9264
 *   同族先例）。
 * - 特殊宝石家族（冻结/灵力/紫色龙/末日骷髅头/赃物+藏宝图/妖火/石像鬼/鬼魂/恶魔传送门/
 *   红龙/腐烂）按既有批次口径 → 特殊宝石 SKIP。
 * - 「半数法力值」= 比例法力（batch-14 8292 同款）；「N-M 点/颗/只」区间数值无原语
 *   （batch-08 8356 / batch-11 9466 同款）；「摧毁 5x5 圈」无面积清除原语（batch-10 8927 同款）。
 */
import { skill, dmg, trueDmg, heal, armor, attack, magic, reduce, drainMana, inflict,
  createGems, transform, transformToSpecial, destroyChosenCol, destroyChosenRow,
  extraTurn } from '../builders';
import { BaseColor } from '../../types';
import type { CuratedBatch } from './index';

const SKIPPED: { id: number; reason: string }[] = [
  { id: 8853, reason: '语义拿不准（「二者选一」二选一结构无法表达，batch-14 8292 同款；「若盐爪船长在我的队伍中」特定兵种条件亦不支持，batch-10 8841 同款）' },
  { id: 8857, reason: '比例法力（「给予所有其他盟友半数法力值」，batch-14 8292 同款）' },
  { id: 8860, reason: '句子式不明（「造成 [魔法 + 6] 点散射伤害」未指明目标，batch-02 7265 同款）' },
  { id: 8868, reason: '特殊宝石（冻结宝石，batch-11 9319 同款）' },
  { id: 8870, reason: '语义拿不准（「再给予其」指回前段随机盟友，跨段随机目标绑定不支持，batch-02 7043 同款）' },
  { id: 8915, reason: '特殊宝石（紫色龙宝石，batch-16 8795 同族）；来源「恶魔敌人和盟友数」敌方侧种族计数亦无对应 kind（batch-13 7546 同款）' },
  { id: 8916, reason: '特殊宝石（灵力宝石，batch-04 8918 同款）' },
  { id: 8925, reason: '比例法力（「给予其半数法力值」，batch-14 8292 同款）；「若对方是一名骑士」条件触发与「灵力宝石」亦不支持' },
  { id: 8930, reason: '句子式不明（「摧毁 5x5 圈宝石」无对应面积清除原语，batch-10 8927 同款）；「因被摧毁的石像鬼宝石数而增强」来源亦不支持（batch-16 8798 同款）' },
  { id: 8931, reason: '语义拿不准（「给予其他盟友 3-8 点法力值」区间数值无原语，batch-08 8356 同款）' },
  { id: 9024, reason: '特殊宝石（妖火宝石，batch-02 9053 同款）' },
  { id: 9055, reason: '二次缩放来源不支持（「因被赐福的盟友数而增强」无对应 kind，赐福不在状态词表，batch-14 头注同款）；「3-10 法力值」区间数值亦无原语' },
  { id: 9131, reason: '隐匿/位置操作（「打回末位」「移至首位」，batch-01 7439/7534 同款）' },
  { id: 9179, reason: '比例法力（「获得…半数法力值」，batch-14 8292 同款）；「几率因棕色宝石数而增强」现可用 chanceBoost 表达但整条仍卡' },
  { id: 9220, reason: '语义拿不准（「一名选定敌人和一名随机敌人」共用一段缩放的复合目标，batch-09 8534 同款）' },
  { id: 9249, reason: '二次缩放来源不支持（「因皓彩森林盟友…数而增强」按王国计数无对应 kind，batch-15 8723 同款）；「陷入妖火状态敌人数」妖火亦不在状态词表' },
  { id: 9284, reason: '特殊宝石（鬼魂宝石，batch-04 9292 同款）' },
  { id: 9291, reason: '语义拿不准（「若自身护甲值更高，则获得屏障效果」：属性比较条件不在 condMult 条件域，且屏障为条件触发动作；「因红色宝石数而增强」来源现可表达但整条仍卡）' },
  { id: 9339, reason: '数值不明（「召唤 1-3 只」区间数量无原语，batch-11 9466 同款）；「爆破 1 颗宝石」对象亦未指明（batch-10 8841 同款）' },
  { id: 9376, reason: '句子式不明（「造成…真实散射伤害」未指明目标，batch-02 7265 同款）；「若在阿达尼亚使用」王国条件亦不支持' },
  { id: 9465, reason: '特殊宝石（恶魔传送门宝石，batch-11 9466 同款）' },
  { id: 9468, reason: '晋升度条件（「如果敌人是 Boss，则根据我的升级造成 3 倍 - 5 倍伤害」）；「变得愤怒」狂怒亦为缺失状态（batch-01 7740 同款）' },
  { id: 9475, reason: '特殊宝石（恶魔传送门宝石，batch-11 9466 同款）' },
  { id: 9514, reason: '句子式不明（「通过随机技能消灭敌人的 [魔法 + 1] 个」机翻无法解析）；「造成恐惧」恐惧亦为缺失状态' },
  { id: 9532, reason: '特殊宝石（红龙宝石，batch-16 8795 同族）；「末位 2 名对人」机翻亦不明' },
  { id: 9543, reason: '缺失状态（患病/疾病不在状态词表，batch-07 7811 同族）；「腐烂宝石」亦为特殊宝石' },
];

const SPELLS: CuratedBatch['spells'] = [
  {
    id: 8855,
    desc: '&&摧毁一列 && 摧毁一行',
    build: skill(
      destroyChosenCol(),
      destroyChosenRow(),
    ),
  },
  {
    id: 8867,
    desc: '&&  对一名敌人造成 [魔法 + 3] 点伤害 && 消除一名敌人所有护甲值',
    build: skill(
      dmg('enemyChosen', 3),
      // 「消除…所有护甲值」= 减除全部护甲（batch-01 7175 同口径）
      reduce('enemyChosen', 'armor', 0, 0, { drainAll: true }),
    ),
  },
  {
    id: 8883,
    desc: '给予末位盟友 [魔法 + 1] 点所有技能值。板面上每有一颗绿色宝石，则有 7% 的几率获得一个额外回合。 [x7]',
    build: skill(
      // 「所有技能值」拆 4 个增益段，一个方括号喂四段共用缩放（batch-30 9401 / batch-05 7165 口径）
      attack('allyLast', 1),
      armor('allyLast', 1),
      heal('allyLast', 1),
      magic('allyLast', 1),
      // 回收：chanceBoost 现支持「每颗X宝石 7% 几率」（SOP 示例句式；boardGems Green）
      extraTurn({ chanceBoost: { mod: { kind: 'multiplier', a: 7 }, source: { kind: 'boardGems', color: BaseColor.Green } } }),
    ),
  },
  {
    id: 9001,
    desc: '将绿色宝石转换成蓝色，将紫色宝石转换成末日骷髅头。耗掉所有敌人 2 点法力值。',
    build: skill(
      transform(BaseColor.Green, BaseColor.Blue),
      // 回收（第六遍）：紫色→末日骷髅头 = transformToSpecial（SOP「特殊宝石」节转化端点）
      transformToSpecial(BaseColor.Purple, 'doomSkull'),
      // 「耗掉 X 点法力值」= reduce stat:'mana' 带数值（spell-rules.md §3）
      reduce('enemyAll', 'mana', 2, 0),
    ),
  },
  {
    id: 9025,
    desc: '对前 2 位敌人造成 [魔法 + 3] 点真实伤害。再消除他们 7 点攻击力。若有敌人身亡，则创造 10 颗紫色宝石。',
    build: skill(
      trueDmg('enemyFirstN', 3, 1, { n: 2 }),
      // 「他们」= 前 2 位敌人，enemyFirstN 确定性目标跨段复用（batch-06 7063 先例）
      reduce('enemyFirstN', 'attack', 7, 0, { n: 2 }),
      // 「若有敌人身亡」判最近产目标段（reduce）主目标（spell-rules.md §4，batch-12 7225 同款）
      createGems(BaseColor.Purple, 10, 0, { ifTargetDied: true }),
    ),
  },
  {
    id: 9130,
    desc: '对一名敌人造成 [魔法 + 4] 点伤害。再创造 2 颗黄色宝石。宝石数因鸟族盟友数而增强。 [x2]',
    build: skill(
      dmg('enemyChosen', 4),
      // 「宝石数因…增强」点名创造段；鸟族=Stryx（埃格里斯自身 troopTypes 程序核实）
      createGems(BaseColor.Yellow, 2, 0, {
        modifier: { mod: { kind: 'multiplier', a: 2 }, source: { kind: 'alliesOfRace', race: 'Stryx' } },
      }),
    ),
  },
  {
    id: 9320,
    desc: '摧毁 1 行。给予首位盟友 [魔法 + 1] 点生命值和屏障效果，生命值数量因被摧毁的紫色宝石数而增强。 [1:1]',
    build: skill(
      destroyChosenRow(),
      // 「生命值数量因…增强」点名治疗段；被摧毁的紫色宝石 = 前序摧毁行段的直接摧毁数
      heal('allyFront', 1, 1, {
        modifier: { mod: { kind: 'ratio', a: 1, b: 1 }, source: { kind: 'destroyedGems', color: BaseColor.Purple } },
      }),
      inflict('barrier', 'allyFront'),
    ),
  },
  {
    id: 9491,
    desc: '吸取一名敌人的所有法力值。对所有敌人造成 [魔法 + 2] 点伤害，伤害值因吸取的法力值而增强。 [1:1]',
    build: skill(
      // 「吸取…所有法力值」= 耗尽法力（batch-17 9572 同款）
      drainMana('enemyChosen'),
      // 「因吸取的法力值而增强」= drainedMana（batch-05 7142 同口径）
      dmg('enemyAll', 2, 1, {
        range: 'all',
        modifier: { mod: { kind: 'ratio', a: 1, b: 1 }, source: { kind: 'drainedMana' } },
      }),
    ),
  },
  {
    id: 9541,
    desc: '对一名敌人造成 [魔法 + 4] 点伤害。然后创造 2 颗棕色宝石，数量因 Urska Allies 而增强。 [x2]',
    build: skill(
      dmg('enemyChosen', 4),
      // 「数量因…增强」点名创造段；Urska 即种族名（伊瓦尔 7637 troopTypes 程序核实，
      // batch-17 9592「巨人盟友」= Giant 同款句式）
      createGems(BaseColor.Brown, 2, 0, {
        modifier: { mod: { kind: 'multiplier', a: 2 }, source: { kind: 'alliesOfRace', race: 'Urska' } },
      }),
    ),
  },
];

export const BATCH_23: CuratedBatch = { batch: '23', spells: SPELLS, skipped: SKIPPED };
