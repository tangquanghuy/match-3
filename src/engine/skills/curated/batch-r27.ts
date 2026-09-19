/**
 * 人工核对组装 · 终审回收批 R27（2026-09-19，窗口 G）。
 *
 * 工作面 = 主窗口权威审计后修剪的 tmp/remaining_r27.json（23 条 unique id，确认为
 * 全部批次中「SKIP 过且至今未组装」的最后存量；动手前已逐条 grep 复核无任何批次
 * SPELLS 数组认领）。判读依据 = 官方英文原句（data/raw/troops.gow.en.json
 * stats.spell.desc）+ 官方 SpellSteps（data/raw/spells.gow.en.json RawData.SpellSteps，
 * 8xxx 起可用；7000-7992 旧咒语无步骤数据），原句/步骤优先于机翻 ZH。
 *
 * 新增用户裁定（本批复核的增量）：
 * - 「基于我已晋升的稀有度造成 3 到 5 倍伤害」晋升度乘数 = 占位即可：condMult 固定
 *   取官方下限（步骤 StatusAmount=3）并注明占位语义（正式晋升模式接入前按 3 倍结算）。
 *
 * 判读结果：回收 1 条——
 * - 8040 乌心爵士：r26 唯一剩余卡点「高塔 × 晋升 3-5 倍区间倍率不可表」经占位裁定
 *   解锁；窃取 1/4 护甲 = R26 fraction 0.25 原语（官方 CountArmor 25 + StealArmor，
 *   尾缀 [4:1] 即该 1/4 比例的 boost-ratio 编码，语义已被 fraction 段消费、不另挂载
 *   ——§14.12 口径）；「高塔」EN 原文 "a Tower" = 官方步骤 MultiplyForAscensionCastle
 *   的 Castle 族（troopTypes 无 Tower 键，RACES 白名单按 Castle 挂）。
 *
 * 其余 22 条经本轮独立复核（含 r26 同日终审交叉验证）仍不可表达：晋升度占位裁定
 * 解锁不了 8037 的 targetStat 无 mana（独立卡点）；敌方黄金池/经济支出/CountMax 上限/
 * 双系数单通道/泛指单体盟友来源/时序状态快照/位置锚计数/种族召唤名册等引擎缺口
 * 逐条仍在（见 SKIPPED），不为凑数硬收（SOP §1.4）。
 */
import { skill, dmg, steal } from '../builders';
import type { CuratedBatch } from './index';

const SKIPPED: { id: number; reason: string }[] = [
  // —— 来源/目标口径缺口 ——
  { id: 7402, reason: '「伤害值等同于一名盟友的攻击力」= 泛指单体盟友（哪一名？）无来源 kind（allyStatSum 为总和、chosenStat 为手动选定目标且本咒语无 chosen 段）；「3 到 8 点法力值」数值区间亦不可表（§9.8 数值型区间 blocked）——EN 原句 "equal to an Ally\'s Attack…Give 3-8 Mana" 实锤（r26 口径维持）' },
  { id: 7435, reason: '「如果自身有 12 个或更多灵魂」= 经济阈值条件不在条件域（无 economy 阈值叶子）；「召唤一位随机恶魔」= 无按种族召唤通道（Daemon 179 个兵种、summonRandom 需显式名册、summonRandomOfKingdom 仅王国维度）——EN "If my Souls are 12 or more, summon a random Daemon" 实锤（r26 口径维持）' },
  { id: 7483, reason: '「伤害值等同于自身的攻击力，并因棕色敌军数量而增强 [x10]」= 伤害基数=攻击力（×1）与来源计数（×10）双系数结构：modifier 单通道，sources 只做计数相加后乘同一系数（secondary.ts modifierBonus），数学上不可同表——EN "equal to my Attack, boosted by Brown Enemies [x10]" 实锤（r26 口径维持）' },
  { id: 7493, reason: '「随机发生任何情况」= 蒙戈玩笑咒语（EN "Something random happens."，官方无 SpellSteps、无任何可枚举分支）——oneOf 无支可组，混沌句 spell-rules §7 永久排除口径维持' },
  { id: 7690, reason: '「如果该敌人已被冻结，则再造成 5 点伤害」= 条件须读首段施加冻结**之前**的状态快照，段序执行后 targetStatus(frozen) 恒真（时序绑定无原语）；「冻结其上下左右的敌人」EN 实为 "the next Enemies above and below"（机翻添「左右」），相邻编队目标模式虽已落仍卡时序（r26 口径维持）' },
  { id: 7810, reason: '「爆破 4 颗敌军法力颜色的宝石、20% 几率吞噬敌军」= ColorSpec ENEMY 逐段独立掷签且不落跨段追踪（resolveColor ENEMY 分支只回色不记来源），「them」= 出色敌人绑定断裂；7xxx 段无官方步骤数据可考（r26 口径维持）' },
  { id: 8037, reason: '「伤害值因其法力值而增强」官方 CountMana@FromTarget = 目标现行法力，targetStat 无 mana（仅 attack/armor/hp/magic/missingHp/manaCost）——晋升度占位裁定解不了该独立卡点；「魔头 × 3-5 倍」区间倍率同不可表（r26 口径维持）' },
  { id: 8056, reason: '「若盟友被吞噬则召唤一名恶魔」= 无按种族召唤通道（官方步骤 SummoningTypeConditional Data:daemon；Daemon 179 个兵种无名册通道，summonRandomOfKingdom 仅王国维度）；吞噬+ifTargetDied+生命增强真实散射本身可表（r26 口径维持）' },
  { id: 8567, reason: '「若板面上有狼化宝石」= 特殊宝石在场条件不在条件域（boardAtLeast 只计基色/骷髅，Condition 无 boardSpecialPresent 叶子；lycanthropy 状态白名单 r26 已扩但条件叶仍缺）；[(魔法/2)+2] 半倍缩放与收回法力本身可表（r26 口径维持）' },
  { id: 8737, reason: '「选择一个盟友，创造其法力颜色宝石」= 全咒语仅创造段、prototypeChosenTargetMode 只认带 target 字段的段（targetChooser.ts 口径），CHOSEN_TARGET 无回退值整段跳过（r19-r26 口径维持）' },
  { id: 8804, reason: '「宝石附近或下方每有一颗绿色宝石」= 以创造宝石格为锚的周边位置计数（官方步骤 BoardTarget SurroundingGems），boardGems 为全盘口径、ModifierSource 无位置族；石像鬼创造 createSpecialGems2 与 perCount 施加本已可表（r26 口径维持）' },
  // —— 元经济（黄金）来源/上限缺口 ——
  { id: 7460, reason: '「花费我所有的黄金以增强伤害」= 经济支出无对应原语（economy.ts 仅 gain 入账、无 spend/lose 通道），battleGold 读共用池总额≠花费额且金不减少语义不成立；oneOf 分支结构本身可表——EN "Either: …spend all my Gold…, OR …" 实锤（r26 口径维持）' },
  { id: 7667, reason: '「创造 6 颗红色宝石、数量因自身的黄金数量而增强、上限为 14 颗」= battleGold 来源已可表，但 CountMax 上限（官方步骤 CountMax 8 → 6+8=14）无原语（ModifierSpec 无 max 封顶字段），高黄金无限突破官方值不硬凑（r26 口径维持）' },
  { id: 8087, reason: '「伤害值因被窃取的黄金数而增强 [1:1]」= 文本明指来源（Gold stolen）须挂载而本次窃取额无 kind（battleGold 为共用池总额非本次窃取额，敌方黄金扣除 TakeEnemyGold 无池）——官方步骤 CountEnemyGold+CountMax 50+TakeEnemyGold 实锤（r26 口径维持）' },
  { id: 8141, reason: '「窃取所有敌人的黄金」= 敌方黄金池无来源（TakeEnemyGold/CountEnemyGold 无池）；「数量因窃取的黄金数而增强、上限为 16 颗」= 窃取额来源缺失 + CountMax 上限无原语（官方步骤 CountMax 10，r26 口径维持）' },
  { id: 8142, reason: '「创造 6 颗骷髅头、数量因自身的黄金数而增强、上限为 14 颗」= battleGold 来源已可表，但 CountMax 上限（官方步骤 CountMax 8 → 6+8=14）无原语（r26 口径维持）' },
  { id: 8904, reason: '「数值因窃取黄金数而增强 [50:1]」= 文本明指来源（Gold stolen）须挂载而本次窃取额无 kind（battleGold 为共用池总额、非本次窃取额），敌方黄金池扣除亦不可表——官方步骤 CountMaxWithMagic+TakeEnemyGold 实锤（r26 口径维持）' },
  { id: 9189, reason: '「窃取一名敌人所有黄金数」= 敌方全额黄金池无来源（TakeEnemyGold 无池，§10.2 gainGold 口径仅适用定量句式），尾缀 [x10] 同源不可挂——官方步骤 CountEnemyGold 1000+TakeEnemyGold 实锤；伤害+出血本身可表（r26 口径维持）' },
  { id: 8243, reason: '「失去所有黄金」= 经济支出无对应原语（官方步骤 TakeMyGold 1000，引擎无 spend/lose 通道）；随机技能值给予 + battleGold 修饰 + 爆破黄色宝石本身可表（r26 口径维持）' },
  // —— 官方数据矛盾 / 语义歧义 ——
  { id: 8211, reason: '「并或使其下潜、或将其吞噬、或将其转化成一名恶魔并打回末位」官方步骤为顺序执行（Damage→CauseSubmerged→TransformType daemon→TroopOrderBack→Consume，无分支标记）与 EN/ZH「或」句式矛盾（EN "…and Submerge them, OR Devour them, OR Transform…"），oneOf 读法不成立；「转化成一名恶魔」亦需 Daemon 名册（8056 同卡，r26 口径维持）' },
  { id: 9545, reason: '「诅咒敌人数量增加」官方 ConvertGems UseCounterForAmount（计数=3+被诅咒敌人数）——transform count 仅静态缩放、无 modifier 通道（gems.ts doTransform params.count 走 evaluateScaling）；紫色龙宝石转换+诅咒/死亡标记本身可表（r26 口径维持）' },
  { id: 10061, reason: '「击杀几率受其护甲值提升（最高可达 30%）」= chanceBoost 有 ratio 通道（targetStat armor 每 10 甲 +10%，官方 [10:1]）但 CountMax 封顶（官方步骤 CountMax 20 → 30% 上限）无原语，线性叠加在高护甲下突破官方上限——不硬凑；伤害+拉到后方 reposition 本身可表（r26 口径维持）' },
];

const SPELLS: CuratedBatch['spells'] = [
  {
    id: 8040,
    desc: '窃取敌人四分之一到护甲值，并对一名敌人造成 [魔法 + 4] 点伤害。如果敌人是个高塔，则基于我已晋升的稀有度造成 3 到 5 倍伤害。 [4:1]',
    // 【回收】r18-r25 卡点「1/4 比例窃取无原语」R26 fraction 已解；r26 剩余卡点
    // 「高塔 × 晋升 3-5 倍区间倍率」按用户新裁定占位。判读：
    // - 首段「窃取敌人四分之一（到→的 机翻）护甲值」= 官方 CountArmor 25 + StealArmor
    //   → steal fraction 0.25（削减额 = 当前护甲 × 1/4 下取整、自身同额入账）；
    //   尾缀 [4:1] 即该 1/4 比例的 boost-ratio 编码，语义已被 fraction 段消费（§14.12
    //   口径不另挂载、不硬凑）。
    // - 次段 [魔法+4] 伤害；「如果敌人是个高塔」EN 原文 "If they are a Tower" =
    //   官方步骤 StatusModifier MultiplyForAscensionCastle 的 Castle 族（troopTypes
    //   无 Tower 键，RACES 白名单按 Castle 挂 targetRace）。
    // - 「基于我已晋升的稀有度造成 3 到 5 倍」= 晋升度乘数，用户新裁定占位：condMult
    //   固定取官方下限（步骤 StatusAmount=3），正式晋升模式（ascended 条件/ascension
    //   字段）接入前对高塔恒按 3 倍结算。
    build: skill(
      steal('enemyChosen', 'armor', 'armor', 0, 0, { fraction: 0.25 }),
      dmg('enemyChosen', 4, 1, {
        condMult: { times: 3, cond: { kind: 'targetRace', race: 'Castle' } },
      }),
    ),
  },
];

export const BATCH_R27: CuratedBatch = { batch: 'r27', spells: SPELLS, skipped: SKIPPED };
