/**
 * 人工核对组装 · 批次 05（池：scripts/curated-pools/pool-05.json）
 * 核对者：agent 批次05
 *
 * 语义裁定备注：
 * - 「移除/转换所有X宝石以增强…」句式照 batch-04 口径：宝石操作段排在被增强段之前
 *   （destroyedGems/transformedGems 来源只数「本技能前序段」），来源不带色筛选，
 *   色/骷髅限定由宝石操作段本身承担；modifier 挂最近数值段（一条技能至多一个 modifier）。
 * - 7052「因所移除的骷髅头数而增强」：destroySkulls 的清除记录进 castTracking.destroyed，
 *   来源用不带色筛选的 destroyedGems（boardSkulls 是执行时刻现读棋盘，清除后为 0，时序不符）。
 * - 「宝石」不含骷髅（GoW 术语：Gem=色宝石，Skull=骷髅），随机宝石段 include:'color'。
 * - 「魔力值」= magic 属性、「法力值」= mana 资源（SOP 措辞裁定；7049/7055/7256 同口径）。
 * - 7165「所有技能值增加」按技能值域（攻/甲/血/魔，spell-rules.md randomStat 口径）拆 4 个增益段。
 * - 7209「如果对方是野兽，则造成双倍伤害」：raceDouble 逐受击目标判定（damage.ts），不只限盟友措辞。
 * - 「爆破一行」= explodeChosenRow（batch-03 7384「爆破一列」同款，无随机字样）。
 */
import { skill, dmg, dmgAll, trueDmg, heal, armor, attack, magic, mana,
  reduce, steal, drainMana, randomStat, createGems, transform,
  destroyChosenRow, destroyColor, destroySkulls, explodeChosenRow, explodeRandomGems,
  inflict, extraTurn } from '../builders';
import { BaseColor } from '../../types';
import type { CuratedBatch } from './index';

const SKIPPED: { id: number; reason: string }[] = [
  { id: 7065, reason: '语义拿不准（「减除其 1 点所有技能值」无对应削减原语）' },
  { id: 7130, reason: '语义拿不准（「若板面上有 13 颗或更多棕色宝石」棋盘宝石数条件无对应机制）' },
  { id: 7063, reason: '已有手写 override（SKILL_OVERRIDES 保留既有行为）' },
  { id: 7156, reason: '语义拿不准（「可拿回大部分法力值」无对应原语）' },
  { id: 7229, reason: '语义拿不准（「1 名敌人和另 1 名随机敌人」复合目标，且「另 1 名」不重复性无法保证）' },
  { id: 7255, reason: '隐匿/位置操作（「打回末位」不做清单）' },
  { id: 7263, reason: '语义拿不准（「如果敌人陷入某状态效果，则耗尽对方法力值」为条件触发而非倍率，且「某状态效果」任意状态不在 condMult 条件域，targetStatus 需具体状态）' },
  { id: 7276, reason: '隐匿/位置操作（「击退至末位」不做清单）' },
  { id: 7277, reason: '语义拿不准（「获得下列其一…或…」二选一分支无法表达）' },
  { id: 7356, reason: '语义拿不准（「光荣地死去」自我击杀与「只能施放一次」施法限制均无对应原语）' },
  { id: 7358, reason: '语义拿不准（「将指定法力的颜色转换为红色」动态颜色句式无对应原语，同 batch-04 8819）' },
];

const SPELLS: CuratedBatch['spells'] = [
  {
    id: 7046,
    desc: '移除 1 行，并对第 1 名敌人造成 [魔法 + 2] 点伤害。获得一个额外回合。',
    build: skill(
      destroyChosenRow(),
      dmg('enemyFront', 2),
      extraTurn(),
    ),
  },
  {
    id: 7049,
    desc: '对 1 名敌人造成 [魔法 + 3] 点伤害。如果该敌人身亡，则获得 5 点魔力值。',
    build: skill(
      dmg('enemyChosen', 3),
      // 「魔力值」= magic 属性（SOP 措辞裁定）；死亡条件只辖本段
      magic('allySelf', 5, 0, { ifTargetDied: true }),
    ),
  },
  {
    id: 7052,
    desc: '移除板面上所有的骷髅头，并获得 [魔法 + 1] 点生命值，点数因所移除的骷髅头数而增强。 [2:1]',
    build: skill(
      // 清除段先行，destroyedGems 来源才数得到（batch-04 口径）；骷髅限定由清除段承担
      // sa-F2 fix round A (R001): native CountGems Skull ; IncreaseHealth ; RemoveColor Skull
      heal('allySelf', 1, 1, { modifier: { mod: { kind: 'ratio', a: 2, b: 1 }, source: { kind: 'castStartBoardSkulls' } } }),
      destroySkulls(),
    ),
  },
  {
    id: 7055,
    desc: '爆破一行。获得 [魔法 + 2] 点生命值，并减除所有敌人 1 点魔力值。',
    build: skill(
      // sa-F2 fix round A (R001): native IncreaseHealth ; ExplodeGems Row ; DecreaseSpellPower
      heal('allySelf', 2),
      explodeChosenRow(),
      // 「魔力值」= magic 属性（SOP 措辞裁定）
      reduce('enemyAll', 'magic', 1, 0),
    ),
  },
  {
    id: 7059,
    desc: '对第一名和最后一名敌人造成 [魔法 + 1] 点伤害，并移除所有紫色宝石以增强伤害效果。 [2:1]',
    build: skill(
      // 清除段先行（batch-04 口径）；修饰子句辖本子句内全部同类段（spell-rules §1 多同类段辖域，
      // 2026-09-16 裁定）：front/last 两段伤害都挂同一 modifier（各段执行时各自读 destroyedGems，同源同值）
      destroyColor(BaseColor.Purple),
      dmg('enemyFront', 1, 1, { modifier: { mod: { kind: 'ratio', a: 2, b: 1 }, source: { kind: 'destroyedGems' } } }),
      dmg('enemyLast', 1, 1, { modifier: { mod: { kind: 'ratio', a: 2, b: 1 }, source: { kind: 'destroyedGems' } } }),
    ),
  },
  {
    id: 7131,
    desc: '随机爆破 一颗的宝石，摧毁其周围的其他宝石。',
    build: skill(
      // explode 模式 = 目标 ∪ 8 邻格（gems.ts）：随机一颗宝石 + 周围一圈，与描述一致
      explodeRandomGems(1, 0, 'all'),
    ),
  },
  {
    id: 7135,
    desc: '创造 7 颗红色宝石，然后将所有红色宝石转换成骷髅头。',
    build: skill(
      createGems(BaseColor.Red, 7),
      // transform 端点可为 'SKULL'（SOP 措辞裁定）
      transform(BaseColor.Red, 'SKULL'),
    ),
  },
  {
    id: 7138,
    desc: '对所有敌人造成 [魔法] 点伤害，并使他们陷入中毒状态。创造 9 颗绿色宝石。',
    build: skill(
      // Native order (R001, L4b-6068-order): CausePoison AllEnemies, then Damage AllEnemies.
      inflict('poison', 'enemyAll'),
      dmgAll(0),
      createGems(BaseColor.Green, 9),
    ),
  },
  {
    id: 7142,
    desc: '耗尽一名敌人的法力值并对其造成 [魔法 + 3] 点真实伤害，伤害值因所耗尽的法力值而增强。 [1:1]',
    build: skill(
      drainMana('enemyChosen'),
      // 「对其」= 同为显式选定目标（非随机，可跨段复用）
      trueDmg('enemyChosen', 3, 1, { modifier: { mod: { kind: 'ratio', a: 1, b: 1 }, source: { kind: 'drainedMana' } } }),
    ),
  },
  {
    id: 7152,
    desc: '给予一名盟友 [魔法 + 3] 点攻击力和护甲值。如果盟友是一名机械军队，则效果翻倍。',
    build: skill(
      // raceDouble 逐受益者判定，效果段逐段挂（batch-06 7465 同款）
      attack('allyChosen', 3, 1, { raceDouble: 'Mech' }),
      armor('allyChosen', 3, 1, { raceDouble: 'Mech' }),
    ),
  },
  {
    id: 7165,
    desc: '对 1 名敌人造成 [魔法 + 5] 点伤害。如果敌人身亡，所有技能值增加 4 点。',
    build: skill(
      dmg('enemyChosen', 5),
      // 「所有技能值」按技能值域（攻/甲/血/魔，spell-rules.md randomStat 口径）拆 4 段，共用常数 4
      attack('allySelf', 4, 0, { ifTargetDied: true }),
      armor('allySelf', 4, 0, { ifTargetDied: true }),
      heal('allySelf', 4, 0, { ifTargetDied: true }),
      magic('allySelf', 4, 0, { ifTargetDied: true }),
    ),
  },
  {
    id: 7166,
    desc: '对一名敌人造成 [魔法 + 4] 点伤害，并减除其 5 点魔力值。如果敌人是一名巨人，则造成 3 倍伤害。',
    build: skill(
      // 回收：condMult 现支持 targetRace 条件倍率（SOP「如果敌人是恶魔/怪兽（族），则造成 3 倍伤害」同款）
      dmg('enemyChosen', 4, 1, { condMult: { times: 3, cond: { kind: 'targetRace', race: 'Giant' } } }),
      reduce('enemyChosen', 'magic', 5, 0),
    ),
  },
  {
    id: 7167,
    desc: '对 1 名敌人造成 [魔法 + 4] 点伤害。如果该敌人死亡，所有盟友可获得 8 点护甲值。',
    build: skill(
      dmg('enemyChosen', 4),
      armor('allyAll', 8, 0, { ifTargetDied: true }),
    ),
  },
  {
    id: 7169,
    desc: '窃取 1 名敌人 [魔法] 点攻击力，并将所有蓝色宝石转换成紫色以增强效果。 [3:1]',
    build: skill(
      // 转化段先行，transformedGems 来源才数得到（batch-04 7002 同款）；EN + native ConvertGems 100 Blue>Purple（旧版误为黄色）
      transform(BaseColor.Blue, BaseColor.Purple),
      steal('enemyChosen', 'attack', 'attack', 0, 1, { modifier: { mod: { kind: 'ratio', a: 3, b: 1 }, source: { kind: 'transformedGems' } } }),
    ),
  },
  {
    id: 7173,
    desc: '对最健康的敌人造成 [魔法 + 4] 伤害，伤害值因所有敌人的生命值而增强。 [3:1]',
    build: skill(
      dmg('enemyHealthiest', 4, 1, { modifier: { mod: { kind: 'ratio', a: 3, b: 1 }, source: { kind: 'enemyStatSum', stat: 'hp' } } }),
    ),
  },
  {
    id: 7209,
    desc: '对 1 名敌人造成 [魔法 + 7] 点伤害。如果对方是野兽，则造成三倍伤害。',
    build: skill(
      // raceDouble 逐受击目标判定（damage.ts），「对方」= 该敌人为野兽时翻倍
      dmg('enemyChosen', 7, 1, { raceDouble: 'Beast', raceTimes: 3 }), // 原生 MultiplyForBeast StatusAmount 3 = triple（sa-D）
    ),
  },
  {
    id: 7234,
    desc: '对 1 名敌人造成 [魔法 + 4] 点伤害，伤害值因自身攻击力而增强。 [1:1]',
    build: skill(
      dmg('enemyChosen', 4, 1, { modifier: { mod: { kind: 'ratio', a: 1, b: 1 }, source: { kind: 'selfStat', stat: 'attack' } } }),
    ),
  },
  {
    id: 7256,
    desc: '为一名盟友增加 [魔法 + 2] 点攻击力、护甲值和生命值。盟友同时获得 6 点法力值。',
    build: skill(
      // 一个方括号喂三段（batch-03 8372 / batch-04 9667 同款）
      attack('allyChosen', 2),
      armor('allyChosen', 2),
      heal('allyChosen', 2),
      // 「法力值」= mana 资源（SOP 措辞裁定）
      mana('allyChosen', 6, 0),
    ),
  },
  {
    id: 7264,
    desc: '对所有敌人造成 [魔法 + 9] 点散射伤害。有 75% 的几率燃烧所有人。',
    build: skill(
      // 「对所有敌人…散射」：散射只是类型词，全体目标各自结算（SOP 措辞裁定）
      dmgAll(9),
      // 概率只辖所在子句（spell-rules.md §2）；「所有人」= 敌方全体
      inflict('burning', 'enemyAll', { chance: 0.75 }),
    ),
  },
  {
    id: 7266,
    desc: '获得 [魔法 + 1] 点攻击力和生命值，将所有绿色宝石转换为红色宝石以强化效果。 [3:1]',
    build: skill(
      // 转化段先行（batch-04 口径）；modifier 挂最近数值段（batch-04 7027 同款）
      transform(BaseColor.Green, BaseColor.Red),
      // sa-R2 L4b-6152: native IncreaseAttack and IncreaseHealth both UseCounterForAmount.
      attack('allySelf', 1, 1, { modifier: { mod: { kind: 'ratio', a: 3, b: 1 }, source: { kind: 'transformedGems' } } }),
      heal('allySelf', 1, 1, { modifier: { mod: { kind: 'ratio', a: 3, b: 1 }, source: { kind: 'transformedGems' } } }),
    ),
  },
  {
    id: 7288,
    desc: '给予一名盟友 [魔法 + 2] 点攻击力和生命值。如果盟友是一名野兽军队，则效果翻倍。',
    build: skill(
      attack('allyChosen', 2, 1, { raceDouble: 'Beast' }),
      heal('allyChosen', 2, 1, { raceDouble: 'Beast' }),
    ),
  },
  {
    id: 7289,
    desc: "创造 5 颗绿色宝石，然后将所有绿色宝石转换为紫色。自身一项随机属性获得 [魔法 + 2] 点。",
    build: skill(
      createGems(BaseColor.Green, 5),
      transform(BaseColor.Green, BaseColor.Purple),
      randomStat('allySelf', 2, 1, { oneSkill: true }),
    ),
  },
  {
    id: 7322,
    desc: "创造 5 颗红色和紫色宝石。一名随机盟友的一项随机属性获得 [魔法 + 1] 点。",
    build: skill(
      // 5 颗总数、红紫混色 → createMix 逐颗随机取色
      // sa-R6 L2-6181-create：原生两步 CreateGems Red 5 + CreateGems Purple 5 = 共 10 颗（原为红紫混合共 5 颗）
      createGems(BaseColor.Red, 5),
      createGems(BaseColor.Purple, 5),
      randomStat('allyRandom', 1, 1, { oneSkill: true }),
    ),
  },
  {
    id: 7324,
    desc: '将绿色宝石转换为骷髅头，并将棕色宝石转换为红色宝石。对所有敌人造成 [魔法 + 9] 点散射伤害。',
    build: skill(
      transform(BaseColor.Green, 'SKULL'),
      transform(BaseColor.Brown, BaseColor.Red),
      // 「对所有敌人…散射」：散射只是类型词（SOP 措辞裁定）
      dmgAll(9),
    ),
  },
  {
    id: 7330,
    desc: '对 1 名敌人造成 [魔法 + 4] 点伤害。如果敌人已被冻结，则造成双倍倍伤害。',
    build: skill(
      // 回收：condMult 现支持 targetStatus 条件倍率；「双倍倍」为原文笔误，逐字保留
      dmg('enemyChosen', 4, 1, { condMult: { times: 2, cond: { kind: 'targetStatus', statusId: 'frozen' } } }),
    ),
  },
  {
    id: 7334,
    desc: '给予一名盟友 [魔法 + 1] 点攻击力和护甲值，点数因红色宝石数量而增强。 [3:1]',
    build: skill(
      // boardGems 为段执行时刻现读棋盘，无时序要求。
      // L7-6193（sa-L76）：原生 IncreaseAttack 与 IncreaseArmor 都 UseCounterForAmount → 两段同挂 modifier。
      attack('allyChosen', 1, 1, { modifier: { mod: { kind: 'ratio', a: 3, b: 1 }, source: { kind: 'boardGems', color: BaseColor.Red } } }),
      armor('allyChosen', 1, 1, { modifier: { mod: { kind: 'ratio', a: 3, b: 1 }, source: { kind: 'boardGems', color: BaseColor.Red } } }),
    ),
  },
  {
    id: 7336,
    desc: '对 1 名敌人造成 [魔法 + 2] 点伤害，伤害值因敌人现有生命值而增强。 [2:1]',
    build: skill(
      // targetStat 读最近目标段主目标（本段自身目标：compileSegment 先解析目标再求值）
      dmg('enemyChosen', 2, 1, { modifier: { mod: { kind: 'ratio', a: 2, b: 1 }, source: { kind: 'targetStat', stat: 'hp' } } }),
    ),
  },
];

export const BATCH_05: CuratedBatch = { batch: '05', spells: SPELLS, skipped: SKIPPED };
