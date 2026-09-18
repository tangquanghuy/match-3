/**
 * 人工核对组装 · 批次 P41（pool 30-40 收尾复查批）
 * 范围：pool-{30,31,34,35,36,37,38,39,40}.json 全部未组装条目的终审。
 * 这 9 个池共 329 条，其中 317 条已随此前各批组装；剩余 12 条
 * （8060/8659/9181/8248/8804/8187/8429/7469/7541/8276/8427/8320）在本批逐条重审——
 * 依据官方 EN 原句（data/raw/gow-2026-09-18/troops.en.json）+ gowhead 官方
 * SpellSteps（spells.en.json RawData）× 全量现行词汇（含 R11-R17 新原语）交叉核实。
 * 结果：回收组装 1 条（8320）；仍弃 11 条（台账在原批 SKIPPED，本批不重复登记
 * 以免覆盖率报告双计——batch-p40 同款约定）。
 *
 * 回收依据（8320 夜龙「暗黑之气」）：
 * - 「真实严重的溅射伤害」= dmgSplash + trueDamage（batch-r15 538 同款裁定）。
 * - 「使所有被伤害的敌人陷入燃烧和疾病状态」：官方 SpellSteps = CauseBurning/
 *   CauseDisease 各作用于 FromTarget + AdjacentFromTarget。此前 SKIP 前提
 *   「受溅射目标集合无目标模式」不再成立：FromTarget = enemyChosen、
 *   AdjacentFromTarget = enemyChosenAndAdjacent（R11 批），且两模式共享同一次
 *   选定目标（TurnEngine 每次施放只选一次 chosenTargetId，ctx 全段共用）——
 *   集合精确对位、无超集无子集（溅射链全链受击 ≠ 官方状态施加集合，按官方步骤落段）。
 * - 「有 20% 的几率召唤一颗恶龙蛋」= summonRef('FellDragonEgg', 6892, { chance: 0.2 })
 *   （官方步骤 SummoningTargetNoError，Data 6892）。
 *
 * 仍弃 11 条的现行口径复查结论（供主线程更新原批 SKIPPED 旧文案时参考）：
 * - 8060（batch-30）：官方 CountGems(Color1=选定色)+CreateGems UseCounterForAmount——
 *   创造数量的计数来源 boardGems.color 仅 BaseColor（运行时亦无 ctx.chosenColor 分支），
 *   选定色计数仍无来源。
 * - 8659（batch-30）：官方 CountAttack 单计数器复用两段 Damage（第二段打 AboveTarget）；
 *   段 2 解析目标即更新 castTracking.lastTarget（prototypes.ts resolveTargetsTracked），
 *   modifier targetStat 指向段 2 首目标而非段 1 选定者——「同等伤害」跨段同额绑定仍无
 *   来源（无 lastDamage 追踪）。
 * - 9181（batch-30）：GenerateRandomMana「3-10 点法力」数值型随机区间无原语（nRange 是
 *   目标数区间、countRange 是宝石数区间）。四选一召唤（summonRandom）本身可表。
 * - 8248（batch-31）：官方 TrueDamage 第二段目标 = NextDownFromTarget（正下方单个），
 *   引擎只有「下方全部」形态（enemyBelowTarget/enemyChosenAndBelow 均超集）；
 *   「否则召唤 2 名暗影姐妹」= SummoningConditional 负向 else 分支（无否定死亡条件）。
 *   暗影姐妹 SisterOfShadows 6477 本身可引。
 * - 8804（batch-31）：石像鬼宝石现已可创造（createSpecialGems2 tier 掷签），但中毒次数 =
 *   CountGems SurroundingGems（创建格周边绿宝石数）——位置型计数无 modifier 来源
 *   （boardGems 为全盘口径），status 段计数仅 perDestroyed（被摧毁宝石）。
 * - 8187（batch-34）：TransformSelfFromTarget（自身变成目标敌人）无原语
 *   （transformTroop 只转化目标，不涉及施法者本体）。
 * - 8429（batch-35）：官方步骤为绿/紫两块【各自 explode+curse+web】与文案
 *   「绿色或紫色」单句互斥——读并集池则 randomGems 单色筛无原语，读 AB 分支则
 *   与文案句式冲突（curse/web 文案只出现一次）——官方数据自身矛盾，SKIP。
 * - 7469（batch-35）：「3-8 点法力值」数值型随机区间无原语（同 9181）。
 * - 7541（batch-35）：「+10 伤害」可 condBonus(targetStatus marked) 表达，但同句
 *   「并获得一个额外回合」= 目标相对条件辖无目标 extraTurn 段整段跳过（runSegment
 *   既有口径）；§0.3 禁止部分组装。
 * - 8276（batch-p37）：官方 ExplodeColor 挂 StatusModifier AddForBurning/AddForDisease
 *   （按目标状态条件爆破宝石）——目标相对条件辖无目标宝石段整段跳过，同上不可拆。
 * - 8427（batch-p37）：屏障次数 = CountSpecificStatusEffect(cursed)（状态计数驱动
 *   InflictEffectOnRandomTroops）——status 段计数仅 perDestroyed（被摧毁宝石），
 *   无状态计数来源；伤害段（enemyStatusCount curse [x2]）本身可表，整条不拆。
 *
 * 遗留（需主线程处理，本文件无权改他批）：
 * - 8320 在 batch-p38 SKIPPED 仍留有旧记录，本批已回收组装，主线程可从原批删除
 *   （避免覆盖率报告虚计）。
 */
import type { CuratedBatch } from './index';
import { skill, dmgSplash, inflict, summonRef } from '../builders';

const SKIPPED: { id: number; reason: string }[] = [
  // 仍弃条目沿用原批（batch-30/31/34/35/p37/p38）SKIPPED 记录，本批不重复登记（防覆盖率双计）；
  // 各条现行口径复查结论见文件头注释。
];

const SPELLS: CuratedBatch['spells'] = [
  {
    id: 8320,
    desc: '对一名敌人造成 [魔法 + 3] 点真实严重的溅射伤害。使所有被伤害的敌人陷入燃烧和疾病状态。有 20% 的几率召唤一颗恶龙蛋。',
    build: skill(
      // 「真实严重的溅射伤害」= dmgSplash + trueDamage（batch-r15 口径）
      dmgSplash('enemyChosen', 3, 1, { trueDamage: true }),
      // 「使所有被伤害的敌人…」官方步骤 = CauseBurning/CauseDisease 各作用于
      // FromTarget + AdjacentFromTarget：选定者 + 编队前后各一位（enemyChosen 与
      // enemyChosenAndAdjacent 共享同一次选定目标）
      inflict('burning', 'enemyChosen'),
      inflict('burning', 'enemyChosenAndAdjacent'),
      inflict('disease', 'enemyChosen'),
      inflict('disease', 'enemyChosenAndAdjacent'),
      // 有 20% 的几率召唤一颗恶龙蛋（官方 Summoning Data 6892）
      summonRef('FellDragonEgg', 6892, { chance: 0.2 }),
    ),
  },
];

export const BATCH_P41: CuratedBatch = { batch: 'p41', spells: SPELLS, skipped: SKIPPED };
