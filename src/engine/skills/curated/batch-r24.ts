/**
 * 人工核对组装 · 硬尾终判批 R24（2026-09-19）。
 *
 * 工作面 = R1-R22 全量清洗后仍存留的最顽固 27 条（= batch-r22 SKIPPED 28 条去掉
 * 8320——该条已被并发批次 batch-p41 收录避让）。逐条对照官方英文原句
 * （data/raw/gow-2026-09-18/troops.en.json stats.spell.desc）与官方 SpellSteps
 * （data/raw/spells.gow.en.json RawData.SpellSteps；7000-7992 旧咒语无步骤数据，
 * 按现行全量词汇 + spell-rules §0-§14 判读），并经引擎代码级复核（builders.ts /
 * effects/secondary.ts / effects/gems.ts / effects/debuff.ts / targetChooser.ts）。
 *
 * 判读结果：回收 2 条——
 * - 7646：r22「驱散敌方增益不做」系陈旧口径，r18/r20/r21 dispelPositives 助手
 *   （spell-rules §6「消除敌方正面增益 = 按正面状态逐一驱散」）已三批量产；
 *   「因敌方的野兽数而增强 [x4]」= enemiesOfRace（K-E 批）。
 * - 8377：「窃取魔法并转换为随机技能值给予所有盟友」的转移额绑定 = lastReduce
 *   跨段来源（Wave4/K-B 收官轮落地，晚于 r22 判读时点）——reduce 实际削减额
 *   记入 castTracking.lastReduce，randomStat 挂 modifier 引用同额。官方步骤
 *   （CountMagic 100 全额魔法）与文本 [魔法 + 1] 的版本出入维持 r21 记录；
 *   尾缀 [100:1] 按 r11「Amount ≈ 100/N」推导即该 Count 步骤的编码产物，
 *   文本无「因…增强」来源句 → 按 §14.12 孤儿治理维持不挂载、不硬凑。
 *
 * 其余 25 条经复核仍不可表达（敌方黄金池/经济支出/CountMax 上限/自复活/狼化
 * 白名单等引擎缺口逐条仍在，见 SKIPPED 刷新理由），不硬凑。
 */
import type { CuratedBatch } from './index';
import { skill, dmg, reduce, randomStat, dispelStatus, enemiesOfRaceBoost } from '../builders';
import type { Condition } from '../effects/secondary';
import type { SegmentOpts } from '../builders';
import type { EffectSegment } from '../prototypes';
import type { TargetMode } from '../targeting';

/** 「消除(一名)敌人正面增益」= 按正面状态逐一驱散（spell-rules §6 口径，r18/r20/r21 同款助手） */
const POSITIVE_STATUSES = ['barrier', 'submerged', 'blessed', 'enchanted', 'reflect', 'enraged', 'rage'] as const;

function dispelPositives(target: TargetMode, shared?: SegmentOpts): EffectSegment[] {
  return POSITIVE_STATUSES.map((statusId) => {
    const statusCond: Condition = { kind: 'targetStatus', statusId };
    return dispelStatus(statusId, target, { ifCond: statusCond, ...shared });
  });
}

const SKIPPED: { id: number; reason: string }[] = [
  { id: 7402, reason: '「伤害值等同于一名盟友的攻击力」= 泛指单体盟友（哪一名？）无来源 kind（allyStatSum 为总和、chosenStat 为本次手动选定目标——本咒语无 chosen 段且源是盟友非选定敌人）；「给予其攻甲」EN them=首敌/ZH=盟友 两读并存；3-8 法力区间（buff rangeSpec）与尾缀本身可表（r17-r24 口径维持）' },
  { id: 7435, reason: '「如果自身有 12 个或更多灵魂」= 经济阈值条件不在条件域（无 economy 阈值叶子，r18 口径维持）；「召唤一位随机恶魔」= 无按种族召唤通道（Daemon 179 个兵种、summonRandom 需显式名册、summonRandomOfKingdom 仅王国维度）；恶魔盟友魔法增益本身可表' },
  { id: 7460, reason: '「花费我所有的黄金以增强伤害」= 经济支出无对应原语（仅 gainGold 入账、无 spend/lose 通道），battleGold 读共用池总额≠花费额且金不减少语义不成立；oneOf 分支结构本身可表（r18-r24 口径维持）' },
  { id: 7483, reason: '「伤害值等同于自身的攻击力，并因棕色敌军数量而增强 [x10]」= 伤害基数=攻击力（×1）与来源计数（×10）双系数结构：modifier 单通道，sources 只做计数相加后乘同一系数（secondary.ts 无逐源独立系数），数学上不可同表（r21-r24 口径维持）' },
  { id: 7493, reason: '历史跳过；现已依据原始 A-B-C-D-E-F 六步骤在 batch-acceptance 恢复，非永久排除。共享吞噬、转化池及状态规则另待认证。' },
  { id: 7542, reason: '「凤凰涅槃浴火重生」= 自复活无引擎机制（spell 侧无 revive/死亡自召原语；traits 的 summonOnDeath 复活族不适用于兵种技能位，r18-r24 代码复核维持）；散射+selfStat hp 增强本身可表' },
  { id: 7667, reason: '「创造 6 颗红色宝石、数量因自身的黄金数量而增强、上限为 14 颗」= battleGold 来源已可表，但 CountMax 上限（官方步骤 CountMax 8 → 6+8=14）无原语（ModifierSpec 无 max 封顶字段，代码复核维持）；上限缺失时高黄金无限突破官方值，不硬凑' },
  { id: 7690, reason: '「并将其冻结。如果该敌人已被冻结，则再造成 5 点伤害并冻结其上下左右的敌人」= 条件须读施加冻结**之前**的状态快照，段序执行后 targetStatus 恒真（时序绑定无原语，r17-r24 口径维持；enemyChosenAndAdjacent 相邻冻结目标模式已落，仅卡时序）' },
  { id: 7810, reason: '「爆破 4 颗敌军法力颜色的宝石、20% 几率吞噬敌军」= ColorSpec ENEMY 逐段独立掷签且不落跨段追踪（gems.ts resolveColor ENEMY 分支只回色不记来源，代码复核维持），「them」= 出色敌人绑定断裂；devour 原语本身已落' },
  { id: 8037, reason: '「伤害值因其法力值而增强」官方 CountMana@FromTarget = 目标现行法力，targetStat 无 mana（仅 magic/manaCost/missingHp，secondary.ts 代码复核维持）；「魔头×升华 3-5 倍」区间下限口径已可表（BOSS_ASC3），升天 3-5 倍区间倍率本身仍不可表' },
  { id: 8040, reason: '「窃取敌人四分之一的护甲值」官方 CountArmor 25+StealArmor = 25% 比例无原语（reduce 仅 halve 50% 一档，ReduceOpts 无任意比例字段，代码复核维持）；高塔×升华 3-5 倍区间同不做' },
  { id: 8056, reason: '「若盟友被吞噬则召唤一名恶魔」= 无按种族召唤通道（官方 SummoningTypeConditional Data:daemon；Daemon 179 个兵种无名册通道，summonRandomOfKingdom 仅王国维度，代码复核维持）；吞噬+ifTargetDied+生命增强真实散射本身可表' },
  { id: 8087, reason: '「伤害值因被窃取的黄金数而增强 [1:1]」= 文本明指来源（Gold stolen）须挂载而本次窃取额无 kind（battleGold 为共用池总额非本次窃取额，且敌方黄金扣除 TakeEnemyGold 无池，代码复核维持，r18-r24 口径维持）' },
  { id: 8141, reason: '「窃取所有敌人的黄金」= 敌方黄金池无来源（TakeEnemyGold/CountEnemyGold 无池）；「数量因窃取的黄金数而增强、上限为 16 颗」= 窃取额来源缺失 + CountMax 上限无原语（r18-r24 口径维持）' },
  { id: 8142, reason: '「创造 6 颗骷髅头、数量因自身的黄金数而增强、上限为 14 颗」= battleGold 来源已可表，但 CountMax 上限（官方 CountMax 8 → 6+8=14）无原语（ModifierSpec 无 max 封顶字段，r18-r24 口径维持）' },
  { id: 8211, reason: '「并或使其下潜、或将其吞噬、或将其转化成一名恶魔并打回末位」官方步骤为顺序执行（Damage→CauseSubmerged→TransformType→TroopOrderBack→Consume，无分支标记）与 EN/ZH「或」句式矛盾，无法对号；「转化成一名恶魔」亦需 Daemon 名册（8056 同卡，r18-r24 口径维持）' },
  { id: 8243, reason: '「失去所有黄金」= 经济支出无对应原语（官方 TakeMyGold 1000，引擎无 spend/lose 通道，r18-r24 代码复核维持）；随机技能值给予 + battleGold 修饰 + 爆破黄色宝石本身可表' },
  { id: 8553, reason: '「使 2 名随机敌人陷入狼化状态」= lycanthropy 不在 STATUS_WHITELIST（tests/unit/spellData.test.ts，本批无权改测试文件，r19-r24 口径维持）；狼化宝石创造（lycanthropyGem 波B）与紫宝石几率额外回合 chanceBoost boardGems 已可表' },
  { id: 8567, reason: '「若板面上有狼化宝石」= 特殊宝石在场条件不在条件域（boardAtLeast 只计基色/骷髅，Condition 无 boardSpecialPresent 叶子，代码复核维持）+ 狼化状态白名单缺口（8553 同卡）；[(魔法/2)+2] 半倍缩放与收回法力本身可表' },
  { id: 8737, reason: '「选择一个盟友，创造其法力颜色宝石」= 全咒语仅创造段、prototypeChosenTargetMode 只认带 target 字段的段（targetChooser.ts 代码复核），CHOSEN_TARGET 无回退值整段跳过（r19-r24 口径维持）' },
  { id: 8804, reason: '「宝石附近或下方每有一颗绿色宝石」= 以创造宝石格为锚的周边位置计数（官方 BoardTarget SurroundingGems），boardGems 为全盘口径无位置来源（ModifierSource 无位置族，r19-r24 代码复核维持）；石像鬼创造 createSpecialGems2 与 perCount 施加本已可表' },
  { id: 8904, reason: '「数值因窃取黄金数而增强 [50:1]」= 文本明指来源（Gold stolen）须挂载而本次窃取额无 kind（battleGold 为共用池总额、非本次窃取额），敌方黄金池扣除亦不可表（r19-r24 口径维持）' },
  { id: 9189, reason: '「窃取一名敌人所有黄金数」= 敌方全额黄金池无来源（TakeEnemyGold 无池，§10.2 gainGold 口径仅适用定量句式），尾缀 [x10] 同源不可挂（r19-r24 口径维持）；伤害+出血本身可表' },
  { id: 9545, reason: '「诅咒敌人数量增加」官方 ConvertGems UseCounterForAmount——transform count 仅静态缩放、无 modifier 通道（gems.ts doTransform params.count 走 evaluateScaling，代码复核维持）；紫色龙宝石转换+诅咒/死亡标记本身可表' },
  { id: 10061, reason: '「击杀几率受其护甲值提升（最高可达 30%）」= chanceBoost 有 ratio 通道（targetStat armor 每 10 甲 +10%）但 CountMax 封顶（官方 +20%，与 ZH 30% 一致）无原语，线性叠加在高护甲下突破官方上限——不硬凑（r19-r24 口径维持）；拉到后方 reposition 本身可表' },
];

const SPELLS: CuratedBatch['spells'] = [
  {
    id: 7646,
    desc: '消除一名敌人所有的正面增益效果，并对其造成 [魔法 + 3] 点伤害，伤害值因敌方的野兽数而增强。 [x4]',
    // 【回收】r22「驱散敌方增益不做」系陈旧口径：spell-rules §6「消除敌方正面增益 = 按正面
    // 状态逐一驱散」已落（r18/r20/r21 dispelPositives 助手三批量产，9723 泛指驱散同款回收）。
    // 「其」= lastTarget（9723 同款）；「因敌方的野兽数而增强 [x4]」= enemiesOfRace（K-E 批）。
    build: skill(
      ...dispelPositives('enemyChosen'),
      // 驱散段按 ifCond 过滤后可能不产目标（lastTarget 未设）→ 伤害直接取选定敌人
      dmg('enemyChosen', 3, 1, { modifier: enemiesOfRaceBoost('Beast', 4) }),
    ),
  },
  {
    id: 8377,
    desc: '窃取敌人 [魔法 + 1] 点魔力值，并将之转换成一个随机技能值并给予所有盟友。 [100:1]',
    // 【回收】「转换转移额」句式 = lastReduce 跨段来源（Wave4/K-B 收官落地，晚于 r22 判读）：
    // reduce（削减族）实际削去的魔法额记入 castTracking.lastReduce（debuff.ts 段末整体覆写），
    // randomStat 挂 modifier {multiplier 1 × lastReduce} 每名盟友获得同额随机技能值
    // （「魔力值」= magic 属性口径）。官方步骤 CountMagic 100（全额魔法）与文本 [魔法 + 1]
    // 的版本出入维持 r21 记录，按文本组装；尾缀 [100:1] 即 r11「Amount ≈ 100/N」推导的
    // Count 步骤编码产物，文本无「因…增强」来源句 → §14.12 孤儿治理维持不挂载、不硬凑。
    build: skill(
      reduce('enemyChosen', 'magic', 1, 1),
      randomStat('allyAll', 0, 0, {
        modifier: { mod: { kind: 'multiplier', a: 1 }, source: { kind: 'lastReduce' } },
      }),
    ),
  },
];

export const BATCH_R24: CuratedBatch = { batch: 'R24', spells: SPELLS, skipped: SKIPPED };
