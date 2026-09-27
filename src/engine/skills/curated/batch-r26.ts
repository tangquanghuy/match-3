/**
 * 人工核对组装 · 放弃桶回收批 R26（2026-09-19）。
 *
 * 工作面核查（脚本逐条对账，tmp/extract26*.mjs 口径）：剥离行/块注释后重扫全部
 * batch-*.ts 的 SPELLS desc 条目与 SKIPPED 数组——「SKIP 过且至今未在任何批次组装」
 * 的现存放弃条目共 **29 条 unique id**（此前 r 链对账用的正则漏计了「{ 与 id: 之间
 * 夹注释行」及双引号 desc 的条目，本轮修正后工作面从 62 收敛到 29：r12/r13/r15 等
 * 批次实际早已把旧池弃条大半回收，r22/r24 又终判过硬尾）。
 *
 * 本批新增/接线原语（引擎最小扩展，见各文件 R26 注记）：
 * - reduce/steal fraction（builders.ts ReduceOpts / prototypes.ts ReduceSegment /
 *   effects/debuff.ts reduceEffect）：「消除 25% 攻击」「窃取敌人四分之一的护甲值」
 *   （官方 CountArmor 25 + StealArmor）= 削减额 = 当前值 × fraction 下取整——8040
 *   首段随之可表（整条仍卡升天 3-5 倍区间，见 SKIPPED）。
 * - steal() 补拷 drainAll（修 r15 7347「耗尽其法力值并获得其中半数」段静默无效的
 *   既有 bug：steal 此前不透传 drainAll，削减额恒 0）。
 * - createMix 端点扩 SpecialGemSpec/'SKULL'（builders.ts，混合端走既有 mixAny 路径，
 *   纯色数组旧序列化逐字节不变）。
 * - STATUS_WHITELIST 扩 'lycanthropy'（tests/unit/spellData.test.ts，「随回收批扩容」
 *   既定口径；引擎侧狼化本体已实现——WOLF_STATUS_IDS / TurnEngine 狼化宝石摧毁施加
 *   同 id / LYCANTHROPY_GEM_TURNS=3）。
 * - 引擎侧 explodeRandomGems countRange、reposition n（enemyNth）既有批次已落地，
 *   本批核实无需新代码。
 *
 * 判读依据 = 官方英文原句/SpellSteps（data/raw/spells.gow.en.json RawData.SpellSteps，
 * 8xxx 起可用；7000-7992 旧咒语无步骤数据，按现行全量词汇 + spell-rules §0-§14 判读），
 * 原句/步骤优先于机翻 ZH；孤儿尾缀按 §14.12 口径不挂载不硬凑。
 *
 * 判读结果：回收 2 条——
 * - 7542 太阳鸟：「凤凰涅槃浴火重生」= 自复活。r24 判读时点自复活原语尚未落地
 *   （bb05854 晚于 9fa0ebc/R24），「无 revive 原语」卡点已失效；官方 "Die and rise
 *   from the Ashes"（builders.ts selfRevive 的同名先例）= 满血复活。
 * - 8553 月亮：唯一卡点 = lycanthropy 不在 STATUS_WHITELIST（r19-r24 连续四批因
 *   「无权改测试文件」挂起）；引擎支持本已齐备，本批扩容即解。
 *
 * 其余 27 条经复核仍不可表达（手写 override 4 条 + 敌方黄金池/经济支出/CountMax 上限/
 * 狼化在场条件叶/晋升度 3-5 倍区间/泛指单体盟友来源/任意状态条件等引擎缺口逐条仍在，
 * 见 SKIPPED 刷新理由），不为凑数硬收（SOP §1.4）。
 */
import { skill, dmg, inflict, createSpecialGems, extraTurn, selfRevive } from '../builders';
import { BaseColor } from '../../types';
import type { CuratedBatch } from './index';

const SKIPPED: { id: number; reason: string }[] = [
  // —— 手写 override 保留（SKILL_OVERRIDES 既有行为，不重复配置）——
  { id: 7004, reason: '已有手写 override（SKILL_OVERRIDES 保留既有行为，r26 复核维持）' },
  { id: 7063, reason: '已有手写 override（SKILL_OVERRIDES 保留既有行为，r26 复核维持）' },
  { id: 7132, reason: '已有手写 override（SKILL_OVERRIDES 保留既有行为，r26 复核维持）' },
  { id: 7155, reason: '已有手写 override（SKILL_OVERRIDES 保留既有行为，r26 复核维持）' },
  // —— 来源/目标口径缺口 ——
  { id: 7402, reason: '「伤害值等同于一名盟友的攻击力」= 泛指单体盟友（哪一名？）无来源 kind（allyStatSum 为总和、chosenStat 为本次手动选定目标——本咒语无 chosen 段且源是盟友非选定敌人）；「给予其攻甲」EN them=首敌/ZH=盟友 两读并存（r17-r26 口径维持）；3-8 法力区间与尾缀本身可表' },
  { id: 7435, reason: '「如果自身有 12 个或更多灵魂」= 经济阈值条件不在条件域（无 economy 阈值叶子）；「召唤一位随机恶魔」= 无按种族召唤通道（Daemon 179 个兵种、summonRandom 需显式名册、summonRandomOfKingdom 仅王国维度），r24/r26 口径维持' },
  { id: 7483, reason: '「伤害值等同于自身的攻击力，并因棕色敌军数量而增强 [x10]」= 伤害基数=攻击力（×1）与来源计数（×10）双系数结构：modifier 单通道，sources 只做计数相加后乘同一系数，数学上不可同表（r21-r26 口径维持）' },
  { id: 7493, reason: '历史跳过；现已依据原始 A-B-C-D-E-F 六步骤在 batch-acceptance 恢复，非永久排除。共享吞噬、转化池及状态规则另待认证。' },
  { id: 7690, reason: '「并将其冻结。如果该敌人已被冻结，则再造成 5 点伤害」= 条件须读施加冻结**之前**的状态快照，段序执行后 targetStatus 恒真（时序绑定无原语，r17-r26 口径维持）；enemyChosenAndAdjacent 相邻冻结目标模式已落，仅卡时序' },
  { id: 7810, reason: '「爆破 4 颗敌军法力颜色的宝石、20% 几率吞噬敌军」= ColorSpec ENEMY 逐段独立掷签且不落跨段追踪（resolveColor ENEMY 分支只回色不记来源），「them」= 出色敌人绑定断裂；7xxx 无步骤数据可考（r18-r26 口径维持）' },
  { id: 8037, reason: '「伤害值因其法力值而增强」官方 CountMana@FromTarget = 目标现行法力，targetStat 无 mana（仅 attack/armor/hp/magic/missingHp/manaCost）；「魔头×升华 3-5 倍」区间倍率亦不可表（r18-r26 口径维持）' },
  { id: 8040, reason: '「窃取敌人四分之一的护甲值」官方 CountArmor 25 + StealArmor = 25% 比例——本批 reduce/steal fraction 0.25 已落地（首段随之可表），但「高塔×基于晋升稀有度 3-5 倍伤害」区间倍率仍不可表（condMult 仅固定倍数），整条维持 SKIP（r18-r26 口径维持）' },
  { id: 8056, reason: '「若盟友被吞噬则召唤一名恶魔」= 无按种族召唤通道（官方 SummoningTypeConditional Data:daemon；Daemon 179 个兵种无名册通道，summonRandomOfKingdom 仅王国维度）；吞噬+ifTargetDied+生命增强真实散射本身可表（r22-r26 口径维持）' },
  { id: 8567, reason: '「若板面上有狼化宝石」= 特殊宝石在场条件不在条件域（boardAtLeast 只计基色/骷髅，Condition 无 boardSpecialPresent 叶子；狼化状态白名单本批已扩但条件叶仍缺）（r20-r26 口径维持）；[(魔法/2)+2] 半倍缩放与收回法力本身可表' },
  { id: 8737, reason: '「选择一个盟友，创造其法力颜色宝石」= 全咒语仅创造段、prototypeChosenTargetMode 只认带 target 字段的段（targetChooser.ts 口径），CHOSEN_TARGET 无回退值整段跳过（r19-r26 口径维持）' },
  { id: 8804, reason: '「宝石附近或下方每有一颗绿色宝石」= 以创造宝石格为锚的周边位置计数（官方 BoardTarget SurroundingGems），boardGems 为全盘口径无位置来源（ModifierSource 无位置族，r19-r26 口径维持）；石像鬼创造 createSpecialGems2 与 perCount 施加本已可表' },
  // —— 元经济（黄金）来源/上限缺口 ——
  { id: 7460, reason: '「花费我所有的黄金以增强伤害」= 经济支出无对应原语（仅 gainGold 入账、无 spend/lose 通道），battleGold 读共用池总额≠花费额且金不减少语义不成立；oneOf 分支结构本身可表（r18-r26 口径维持）' },
  { id: 7667, reason: '「创造 6 颗红色宝石、数量因自身的黄金数量而增强、上限为 14 颗」= battleGold 来源已可表，但 CountMax 上限（官方步骤 CountMax 8 → 6+8=14）无原语（ModifierSpec 无 max 封顶字段）；上限缺失时高黄金无限突破官方值，不硬凑（r18-r26 口径维持）' },
  { id: 8087, reason: '「伤害值因被窃取的黄金数而增强 [1:1]」= 文本明指来源（Gold stolen）须挂载而本次窃取额无 kind（battleGold 为共用池总额非本次窃取额，且敌方黄金扣除 TakeEnemyGold 无池）（r18-r26 口径维持）' },
  { id: 8141, reason: '「窃取所有敌人的黄金」= 敌方黄金池无来源（TakeEnemyGold/CountEnemyGold 无池）；「数量因窃取的黄金数而增强、上限为 16 颗」= 窃取额来源缺失 + CountMax 上限无原语（r18-r26 口径维持）' },
  { id: 8142, reason: '「创造 6 颗骷髅头、数量因自身的黄金数而增强、上限为 14 颗」= battleGold 来源已可表，但 CountMax 上限（官方 CountMax 8 → 6+8=14）无原语（r18-r26 口径维持）' },
  { id: 8904, reason: '「数值因窃取黄金数而增强 [50:1]」= 文本明指来源（Gold stolen）须挂载而本次窃取额无 kind（battleGold 为共用池总额、非本次窃取额），敌方黄金池扣除亦不可表（r19-r26 口径维持）' },
  { id: 9189, reason: '「窃取一名敌人所有黄金数」= 敌方全额黄金池无来源（TakeEnemyGold 无池，§10.2 gainGold 口径仅适用定量句式），尾缀 [x10] 同源不可挂（r19-r26 口径维持）；伤害+出血本身可表' },
  { id: 8243, reason: '「失去所有黄金」= 经济支出无对应原语（官方 TakeMyGold 1000，引擎无 spend/lose 通道）；随机技能值给予 + battleGold 修饰 + 爆破黄色宝石本身可表（r18-r26 口径维持）' },
  // —— 官方数据矛盾 / 语义歧义 ——
  { id: 8211, reason: '「并或使其下潜、或将其吞噬、或将其转化成一名恶魔并打回末位」官方步骤为顺序执行（Damage→CauseSubmerged→TransformType→TroopOrderBack→Consume，无分支标记）与 EN/ZH「或」句式矛盾，无法对号；「转化成一名恶魔」亦需 Daemon 名册（8056 同卡，r18-r26 口径维持）' },
  { id: 9545, reason: '「诅咒敌人数量增加」官方 ConvertGems UseCounterForAmount——transform count 仅静态缩放、无 modifier 通道（gems.ts doTransform params.count 走 evaluateScaling）；紫色龙宝石转换+诅咒/死亡标记本身可表（r19-r26 口径维持）' },
  { id: 10061, reason: '「击杀几率受其护甲值提升（最高可达 30%）」= chanceBoost 有 ratio 通道（targetStat armor 每 10 甲 +10%）但 CountMax 封顶（官方 +20%，与 ZH 30% 一致）无原语，线性叠加在高护甲下突破官方上限——不硬凑（r19-r26 口径维持）；伤害+拉到后方 reposition 本身可表' },
];

const SPELLS: CuratedBatch['spells'] = [
  {
    id: 7542,
    desc: '对所有敌人造成 [魔法 + 6] 点散射伤害，伤害值因自身生命值而增强。凤凰涅槃浴火重生。 [1:1]',
    // 【回收】r18-r24 卡点「自复活无引擎机制」已失效——selfRevive 原语（凤凰涅槃批，
    // Sunbird 官方 "Die and rise from the Ashes" 即本条先例）落地于 r24 判读之后
    //（bb05854 晚于 9fa0ebc/R24）。涅槃 = 满血复活（官方口径 full）；散射无目标词 =
    // 全体散射（2026-09-18 重裁）；「因自身生命值而增强 [1:1]」= selfStat hp 挂伤害段。
    build: skill(
      dmg('enemyAll', 6, 1, {
        range: 'all',
        modifier: { mod: { kind: 'ratio', a: 1, b: 1 }, source: { kind: 'selfStat', stat: 'hp' } },
      }),
      selfRevive(0.5, { full: true }),
    ),
  },
  {
    id: 8553,
    desc: '使 2 名随机敌人陷入狼化状态，再创造 2 颗狼化宝石。板面上每有 1 颗紫色宝石则有 7%的几率获得一个额外回合。 [x7]',
    // 【回收】r19-r24 唯一卡点「lycanthropy 不在 STATUS_WHITELIST、当批无权扩容」——
    // 本批扩容（白名单「随回收批扩容」既定口径；引擎侧 WOLF_STATUS_IDS / TurnEngine
    // 狼化宝石摧毁施加同 id / LYCANTHROPY_GEM_TURNS=3 均已实现）。官方步骤：CauseLycanthropy
    // @RandomEnemy ×2（ enemyRandomN n:2）→ CreateGems Lycanthropy 2（lycanthropyGem 波B）→
    // ExtraTurnConditional 7%/紫宝石（chanceBoost boardGems Purple）。
    build: skill(
      inflict('lycanthropy', 'enemyRandomN', { n: 2, turns: 3 }),
      createSpecialGems({ kind: 'lycanthropyGem' }, 2),
      extraTurn({ chanceBoost: { mod: { kind: 'multiplier', a: 7 }, source: { kind: 'boardGems', color: BaseColor.Purple } } }),
    ),
  },
];

export const BATCH_R26: CuratedBatch = { batch: 'r26', spells: SPELLS, skipped: SKIPPED };
