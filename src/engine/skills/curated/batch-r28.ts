/**
 * 人工核对组装 · 终审回收批 R28（2026-09-19，窗口 G）。
 *
 * 工作面 = batch-r27 的 22 条 SKIP 存量逐条重审（官方 EN 原句 troops.gow.en.json +
 * 官方 SpellSteps spells.gow.en.json RawData.SpellSteps，8xxx 起可用）。本轮在**技能
 * 子系统内**补齐缺口原语后回收 19 条，3 条维持 SKIP（见 SKIPPED，7493 已在 batch-acceptance 恢复）。
 *
 * 本批新原语（全部落在 src/engine/skills/**，未动 TurnEngine/types/GameState）：
 * - 经济支出/窃取：spendGold / stealGold 段（effects/economy.ts）+ goldSpent / goldStolen
 *   跨段追踪（effects/context.ts）+ 同名 modifier 来源（effects/secondary.ts）——
 *   「花费/失去/窃取黄金」与「因花费/窃取的黄金数而增强」打通；双方独立黄金余额口径见
 *   economy.ts：黄金现按双方独立持有，窃取按敌方可用余额转移。
 * - CountMax 封顶：ModifierSpec.max（加成项封顶）——7667/8141/8142 上限、10061 几率封顶。
 * - 双系数伤害：DamageSegment.modifiers 数组（加成相加）——7483「=自身攻击力 ×1 +
 *   棕色敌军数 ×10」单通道数学上不可同表的解。
 * - 种族名册召唤：summonRandomOfRace + data/raceRoster.ts 构建期静态名册（Daemon 179 名，
 *   不依赖 TurnEngine 注入的王国解析器）——7435/8056「召唤一名随机恶魔」。
 * - 条件叶：economyAtLeast（7435 灵魂阈值）、boardAtLeast.special（8567 狼化宝石在场）、
 *   lastTargetStatusAtCastStart（7690「已被冻结」施法前状态快照，CastTracking 新增
 *   statusesAtCastStart）。
 * - 来源叶：targetStat 增 mana（8037 官方 CountMana@FromTarget）、randomAllyStat +
 *   TargetMode 'lastAlly'（7402 泛指单盟友跨段绑定）、surroundingGems 位置锚计数
 *   （8804 官方 BoardTarget SurroundingGems，锚 = CastTracking.lastCreatedCell）。
 * - 转换颗数缩放：TransformGemParams.countModifier（9545 官方 ConvertGems
 *   UseCounterForAmount = 3 + 被诅咒敌人数）。
 * - CHOSEN_TARGET 创造段驱动：prototypeChosenTargetMode 识别 create 段占位色（8737）。
 *
 * 判读依据与占位口径：原句/官方步骤优先于机翻 ZH；晋升度乘数沿用 r27 占位裁定
 * （condMult 固定取官方下限 3）；尾缀 [N:M]/[xN] 语义被显式段消费时不再重复挂载
 * （§14.12 口径）。
 */
import { skill, dmg, magic, attack, armor, mana, createGems, createSkulls, createSpecialGems2,
  inflict, oneOf, devour, summonRandomOfRace, stealGold, spendGold, gainGold, randomStat,
  explodeRandomGems, transformToSpecial, reposition, extraTurn, flat } from '../builders';
import { BaseColor } from '../../types';
import type { CuratedBatch } from './index';

const SKIPPED: { id: number; reason: string }[] = [
  // —— 官方数据矛盾 / 语义歧义（原语补齐后仍不可表达） ——
  { id: 7493, reason: '历史跳过；现已依据原始 A-B-C-D-E-F 六步骤在 batch-acceptance 恢复，非永久排除。共享吞噬、转化池及状态规则另待认证。' },
  { id: 7810, reason: '「爆破 4 颗敌军法力颜色的宝石、20% 几率吞噬敌军」= ColorSpec ENEMY 在宝石段内部掷签出色与来源敌人但不入跨段追踪，「them」= 出色敌人绑定断裂（需 ENEMY 色源敌人追踪 + 专用目标模式，本批未做）；7xxx 段无官方步骤数据可考，吞噬语义（是否同一名敌人）无从复核' },
  { id: 8211, reason: '「并或使其下潜、或将其吞噬、或将其转化成一名恶魔并打回末位」官方步骤为顺序执行（Damage→CauseSubmerged→TransformType daemon→TroopOrderBack→Consume，无分支标记）与 EN/ZH「或」句式矛盾——oneOf 读法被官方步骤否决、顺序链读法（下潜后变身再吞噬）官方手感不可能；恶魔名册本批已备（raceRoster）但分支结构无从裁定，官方数据矛盾维持 SKIP' },
];

const SPELLS: CuratedBatch['spells'] = [
  {
    id: 7402,
    desc: '对第一名敌人造成伤害，伤害值等同于一名盟友的攻击力。给予盟友 [魔法 + 1] 点攻击力和护甲值。除了自身之外，所有盟友获得 3 到 8 点法力值。 [1:1]',
    // EN "Deal damage to the first Enemy equal to an Ally's Attack, then give
    // [Magic + 1] Attack and Armor to them. Give 3-8 Mana to all Allies other
    // than myself." 判读：
    // - 「一名盟友的攻击力」= randomAllyStat 来源（掷选一名存活盟友，含施法者；rng
    //   掷签缓存入 castTracking.randomAllyId）；[1:1] = multiplier 1 × 该来源，已被
    //   伤害段 modifier 消费。
    // - 「给予盟友…」的「其/他们」= 同一名被掷中的盟友 → 新目标模式 'lastAlly'
    //   跨段绑定同一名（不重掷 rng）；攻击/护甲两段共用 [魔法+1] scaling（§11 并列口径）。
    // - 「3 到 8 点法力值」= 数值区间（§9.8 数值型区间已由 buff rangeSpec 通道承载，
    //   R22 7469「3-8 点法力值」同款），「除了自身之外的所有盟友」= allyOthers。
    build: skill(
      // sa-R7: native spell Target=Ally (chosen), CountAttack@FromTarget before the buffs -> damage = the chosen
      // ally's pre-buff Attack (was randomAllyStat, a random ally). Damage first keeps the pre-buff value.
      dmg('enemyFront', 0, 0, {
        modifier: { mod: { kind: 'multiplier', a: 1 }, source: { kind: 'chosenStat', stat: 'attack' } },
      }),
      attack('allyChosen', 1, 1),
      armor('allyChosen', 1, 1),
      mana('allyOthers', 3, 0, { rangeSpec: { min: flat(3), max: flat(8) } }),
    ),
  },
  {
    id: 7435,
    desc: '所有恶魔盟友获得 2 点魔力值。如果自身有 12 个或更多灵魂，则召唤一位随机恶魔。',
    // EN "All Daemon Allies gain 2 Magic. If my Souls are 12 or more, summon a
    // random Daemon." 判读：
    // - 「所有恶魔盟友」= allyAll + targetRace Daemon（种族限定目标既有口径）。
    // - 「自身有 12 个或更多灵魂」= economyAtLeast 条件叶（GameState.economy.souls
    //   共用池现值直读，全局条件整段判定）。
    // - 「一位随机恶魔」= summonRandomOfRace（raceRoster Daemon 名册 179 名种子化均匀
    //   掷选；官方语义 = 该族全兵册随机，与王国召唤的「整册均匀」口径一致）。
    build: skill(
      magic('allyAll', 2, 0, { targetRace: 'Daemon' }),
      summonRandomOfRace('Daemon', { ifCond: { kind: 'economyAtLeast', currency: 'souls', n: 12 } }),
    ),
  },
  {
    id: 7460,
    desc: '对一名敌人造成 [魔法 + 4] 点伤害，并花费我所有的黄金以增强造成的伤害数，或对所有敌人造成 [魔法 + 4] 点伤害，并获得 80 黄金。 [1:1]',
    // EN "Either: Deal [Magic + 4] damage to an Enemy and spend all my Gold to
    // boost the damage, OR Deal [Magic + 4] damage to all Enemies and gain 80
    // Gold. [1:1]" 判读：
    // - oneOf 掷签二选一（「Either…OR…」官方分支句式实锤）。
    // - 支 1：花费全部黄金 → 伤害 + 花费额 [1:1]。段序按结算依赖排布（ZH 句序伤害在前，
    //   但「花费…以增强」要求先记账后消费）：spendGold() 实际扣减额入 goldSpent，
    //   伤害段以 { multiplier 1, source goldSpent } 引用同额；[1:1] 已被该 modifier 消费。
    // - 支 2：全体伤害 + gainGold(80)（§10.2 获得段）。
    build: skill(
      oneOf(
        [
          spendGold(),
          dmg('enemyChosen', 4, 1, { modifier: { mod: { kind: 'multiplier', a: 1 }, source: { kind: 'goldSpent' } } }),
        ],
        [
          dmg('enemyAll', 4, 1, { range: 'all' }),
          gainGold(80),
        ],
      ),
    ),
  },
  {
    id: 7483,
    desc: '造成散射伤害，伤害值等同于自身的攻击力，并因棕色敌军数量而增强。 [x10]',
    // EN "Deal scatter damage equal to my Attack, boosted by Brown Enemies. [x10]"
    // 判读：r27 卡点 =「基数=自身攻击力（×1）与棕色敌军计数（×10）」双系数单 modifier
    // 通道不可同表——本批 DamageSegment.modifiers 数组（各份加成相加）解锁：
    // 基础 0 + 1×攻击力 + 10×棕色敌人数。裸散射句式 = enemyAll + range 'all'
    // （2026-09-18 官方 SpellSteps 重裁口径）；[x10] 被第二份 modifier 消费。
    build: skill(
      dmg('enemyAll', 0, 0, {
        range: 'all',
        modifiers: [
          { mod: { kind: 'multiplier', a: 1 }, source: { kind: 'selfStat', stat: 'attack' } },
          { mod: { kind: 'multiplier', a: 10 }, source: { kind: 'enemiesOfColor', color: BaseColor.Brown } },
        ],
      }),
    ),
  },
  {
    id: 7667,
    desc: '创造 6 颗红色宝石，宝石数因自身的黄金数量而增强，上限为 14 颗宝石。 [4:1]',
    // EN "Create 6 Red Gems, boosted by my Gold, up to a maximum of 14 Gems. [4:1]"
    // 判读：来源 = battleGold（自身的黄金，§10.2 既有口径）；[4:1] = 每 4 黄金 +1 颗；
    // 「上限 14」= 官方 CountMax（6+8）→ ModifierSpec.max = 8 封**加成项**：
    // 6 + min(floor(gold/4), 8) ≤ 14，高黄金不再突破官方值。
    build: skill(
      createGems(BaseColor.Red, 6, 0, {
        modifier: { mod: { kind: 'ratio', a: 4, b: 1 }, source: { kind: 'battleGold' }, max: 8 },
      }),
    ),
  },
  {
    id: 7690,
    desc: '对一名敌人造成[魔法 + 3]点伤害并将其冻结。如果该敌人已被冻结，则再造成5点伤害，并冻结其上下左右的敌人。',
    // EN "Deal [Magic + 3] damage to an Enemy and Freeze them. If the Enemy is
    // already Frozen, deal 5 more damage and Freeze the next Enemies above and
    // below." 判读：
    // - 「已被冻结」= 施法**前**的快照状态：首段 damage+inflict 同段施加后 targetStatus
    //   恒真（r27 时序卡点）——本批 CastTracking.statusesAtCastStart（executePrototype
    //   进入段循环前采集）+ 条件叶 lastTargetStatusAtCastStart 解锁。
    // - 「再造成5点伤害」= 对同一名敌人（lastTarget 跨段绑定）常数段，挂施法前冻结条件。
    // - 「其上下左右的敌人」EN 原文 "the next Enemies above and below"（机翻添「左右」）
    //   = 编队相邻前后各一位 = enemyChosenAndAdjacent（R11 批「选定者编队前后各一位」
    //   精确对位），同挂施法前冻结条件。
    build: skill(
      dmg('enemyChosen', 3, 1),
      inflict('frozen', 'enemyChosen'),
      dmg('lastTarget', 5, 0, { ifCond: { kind: 'lastTargetStatusAtCastStart', statusId: 'frozen' } }),
      inflict('frozen', 'enemyChosenAndAdjacent', { ifCond: { kind: 'lastTargetStatusAtCastStart', statusId: 'frozen' } }),
    ),
  },
  {
    id: 8037,
    desc: '对一名敌人造成 [魔法 + 4] 点伤害，伤害值因其法力值而增强。如果敌人是个魔头，则基于我已晋升的稀有度造成 3 到 5 倍伤害。 [1:1]',
    // EN "Deal [Magic + 4] damage to an Enemy, boosted by their Mana. If they are
    // a Boss, deal 3x - 5x damage, based on my Ascensions. [1:1]" 判读：
    // - r27 卡点「targetStat 无 mana」本批补齐（官方 CountMana@FromTarget = 目标现行
    //   法力）；[1:1] = multiplier 1 × 目标法力，已被 modifier 消费。
    // - 「魔头 × 3-5 倍（晋升度）」沿用 r27/8040 占位裁定：condMult 固定取官方下限
    //   （步骤 StatusAmount=3）+ targetRace Boss（§14.3 魔头=Boss 重裁），正式晋升模式
    //   接入前对魔头恒按 3 倍结算。
    build: skill(
      dmg('enemyChosen', 4, 1, {
        modifier: { mod: { kind: 'multiplier', a: 1 }, source: { kind: 'targetStat', stat: 'mana' } },
        condMult: { times: 3, cond: { kind: 'targetRace', race: 'Boss' } },
      }),
    ),
  },
  {
    id: 8056,
    desc: '吞噬一名盟友。若盟友被吞噬，则召唤一名恶魔。造成 [魔法 + 16] 点真实散射伤害，伤害值因自身的生命值而增强。 [3:1]',
    // EN "Devour an Ally, then summon a Daemon if the Ally is devoured. Deal
    // [Magic + 16] true scatter damage, boosted by my Life. [3:1]" 判读：
    // - 咒语级 Target=Ally → allyChosen（施法方指定被吞噬的盟友）；「吞噬」= devour
    //   原语 chance 1（官方 Consume 无概率，必发）。
    // - 「若盟友被吞噬」= ifTargetDied（最近产目标段主目标身亡，吞噬即杀走 execute
    //   管线）；「召唤一名恶魔」= summonRandomOfRace（r27 卡点「无按种族召唤通道」
    //   由 raceRoster 名册解锁；官方步骤 SummoningTypeConditional Data:daemon 同口径）。
    // - 「真实散射伤害」= enemyAll + range all + trueDamage（裸散射官方重裁口径）；
    //   「因自身的生命值」= selfStat hp（当前生命）；[3:1] = 每 3 生命 +1，已被消费。
    build: skill(
      devour('allyChosen', { chance: 1 }),
      summonRandomOfRace('Daemon', { ifTargetDied: true }),
      dmg('enemyAll', 16, 1, {
        range: 'all',
        trueDamage: true,
        modifier: { mod: { kind: 'ratio', a: 3, b: 1 }, source: { kind: 'selfStat', stat: 'hp' } },
      }),
    ),
  },
  {
    id: 8087,
    desc: '窃取一名敌人最多 50 黄金。对一名敌人造成 [魔法 + 2] 点伤害，伤害值因被窃取的黄金数而增强。 [1:1]',
    // Native: count/cap enemy Gold -> debit -> damage boosted by actual theft -> credit.
    build: skill(
      stealGold(50, 0, { deferCredit: true }),
      dmg('enemyChosen', 2, 1, {
        modifier: { mod: { kind: 'multiplier', a: 1 }, source: { kind: 'goldStolen' } },
      }),
      gainGold(0, 0, { modifier: { mod: { kind: 'multiplier', a: 1 }, source: { kind: 'goldStolen' } } }),
    ),
  },
  {
    id: 8141,
    desc: '窃取所有敌人的黄金。创造 6 颗紫色宝石，数量因窃取的黄金数而增强，上限为 16 颗。 [1:1]',
    // EN "Steal all Enemy Gold. Create 6 Purple Gems, boosted by Gold stolen to a
    // maximum of 16 Gems. [1:1]" 判读：
    // - 「窃取所有敌人的黄金」= stealGold all（官方 CountEnemyGold 100 + TakeEnemyGold
    //   全额）：转移独立敌方黄金计数，goldStolen 记实际转移额。
    // - 「数量因窃取的黄金数而增强」= goldStolen；「上限 16」= 官方 CountMax 10 →
    //   max = 10 封加成项（6 + min(stolen, 10) ≤ 16）；[1:1] 已被消费。
    build: skill(
      stealGold(0, 0, { all: true }),
      createGems(BaseColor.Purple, 6, 0, {
        modifier: { mod: { kind: 'multiplier', a: 1 }, source: { kind: 'goldStolen' }, max: 10 },
      }),
    ),
  },
  {
    id: 8142,
    desc: '创造 6 颗骷髅头，数量因自身的黄金数而增强，上限为 14 颗。 [5:1]',
    // EN "Create 6 Skulls, boosted by my Gold, up to a maximum of 14 Skulls. [5:1]"
    // 判读：来源 = battleGold（自身的黄金）；[5:1] = 每 5 黄金 +1 颗；「上限 14」=
    // 官方 CountMax 8 → max = 8（6 + min(floor(gold/5), 8) ≤ 14）。
    build: skill(
      createSkulls(6, 0, {
        modifier: { mod: { kind: 'ratio', a: 5, b: 1 }, source: { kind: 'battleGold' }, max: 8 },
      }),
    ),
  },
  {
    id: 8243,
    desc: '给予另外一名盟友 5 点随机技能值，数量因自身黄金数而增强。失去所有黄金。爆破 3 颗黄色宝石。 [1:1]',
    // EN "Give 5 to a random Skill on another Ally, boosted by my Gold. Lose all
    // my Gold. Explode 3 Yellow Gems. [1:1]" 判读：
    // - 「另外一名盟友」= allyOthers + randomStat（随机技能值获得，5 点=常数）；
    //   「因自身黄金数而增强」= battleGold，[1:1] = 每 1 黄金 +1 点，已被消费。
    // - 「失去所有黄金」= spendGold()（官方 TakeMyGold 1000 全额扣减；r27 卡点
    //   「无 spend/lose 通道」由 spendEconomy 段解锁）。
    // - 「爆破 3 颗黄色宝石」= explodeRandomGems 定量限色爆破（非 explodeColor 全量）。
    // sa-F1: native IncreaseRandom@FromTarget (Target AllyButNotSelf) = ONE chosen ally, the whole value on one random
    // Skill (was every other ally, points spread over skills).
    build: skill(
      randomStat('allyChosen', 5, 0, {
        oneSkill: true,
        modifier: { mod: { kind: 'ratio', a: 1, b: 1 }, source: { kind: 'battleGold' } },
      }),
      spendGold(),
      explodeRandomGems(3, 0, 'color', BaseColor.Yellow),
    ),
  },
  {
    id: 8567,
    desc: '对一名敌人造成 [(魔法 / 2) + 2] 点伤害。若板面上有狼化宝石，则使他陷入狼化状态并收回自身的法力值。',
    // EN "Deal [(Magic / 2) + 2] damage to an Enemy. If there are any Lycanthropy
    // Gems on the Board, inflict them with Lycanthropy and get my Mana back."
    // 判读：
    // - 「若板面上有狼化宝石」= boardAtLeast.special 条件叶（官方 CountGems
    //   Color1=Lycanthropy 实锤，r27 卡点「条件无 boardSpecialPresent 叶」解锁）。
    // - 「使他陷入狼化状态」= inflict lycanthropy（状态白名单 r26 已扩；「他」=
    //   首段伤害目标 enemyChosen，确定性同一名）；「收回自身的法力值」= §12.7 既有
    //   口径（multiplier 1 × selfStat manaCost = 重获消耗的法力）。
    build: skill(
      dmg('enemyChosen', 2, 0.5),
      inflict('lycanthropy', 'enemyChosen', { ifCond: { kind: 'boardAtLeast', special: 'lycanthropyGem', n: 1 } }),
      mana('allySelf', 0, 0, {
        ifCond: { kind: 'boardAtLeast', special: 'lycanthropyGem', n: 1 },
        modifier: { mod: { kind: 'multiplier', a: 1 }, source: { kind: 'selfStat', stat: 'manaCost' } },
      }),
    ),
  },
  {
    id: 8737,
    desc: '选择一个盟友。创造10颗盟友对应法力颜色的宝石。',
    // EN "Choose an Ally. Create 10 Gems of one of their Mana Colors." 官方步骤
    // CreateGems FromTarget Color1=FromTarget Amount 10。判读：r27 卡点 = 全咒语仅
    // 创造段、prototypeChosenTargetMode 只认带 target 字段的段 → CHOSEN_TARGET 无
    // 回退值整段跳过。本批 targetChooser 增「create 段占位色 CHOSEN_TARGET → 报
    // allyChosen」驱动：释放时先走盟友选目标，创造段经 ctx.chosenTargetId 取该盟友
    // 的一种法力色（多色 rng 掷选，'CHOSEN_TARGET' 既有解析口径）。
    build: skill(
      createGems('CHOSEN_TARGET', 10),
    ),
  },
  {
    id: 8804,
    desc: '创造 1 颗石像鬼宝石。宝石附近或下方每有一颗绿色宝石，则使一名随机敌人陷入中毒状态。获得一个额外回合。 [1:1]',
    // EN "Create a Gargoyle Gem. Poison a random Enemy, for each Green Gem under
    // or around it. Gain an extra turn. [1:1]" 官方步骤 CountGems(SurroundingGems) +
    // CreateGems2Colors(GoodGargoyle/BadGargoyle, SingleGem) + InflictEffectOnRandomTroops
    // (UseCounterForAmount) + ExtraTurn。判读：
    // - 「创造 1 颗石像鬼宝石」= createSpecialGems2 善/恶逐颗掷签（8795 Frozen Time
    //   官方 CreateGems2Colors 双分支先例）；创造落格记入 lastCreatedCell。
    // - 「附近或下方每有一颗绿色宝石」= surroundingGems 来源（官方 BoardTarget
    //   SurroundingGems = 3x3 邻域，「下方」即其中正下格；锚 = 刚创造的宝石格）。
    //   [1:1] = multiplier 1 × 该计数，由 perCount 消费（次数 = 绿色邻位数，逐次随机
    //   取敌方一名，官方 InflictEffectOnRandomTroops 同口径）。
    build: skill(
      createSpecialGems2([{ kind: 'gargoyleGem', tier: 1 }, { kind: 'gargoyleGem', tier: 2 }], 1),
      inflict('poison', 'enemyRandom', {
        perCount: { mod: { kind: 'multiplier', a: 1 }, source: { kind: 'surroundingGems', color: BaseColor.Green, anchor: 'lastCreated' } },
      }),
      extraTurn(),
    ),
  },
  {
    id: 8904,
    desc: '窃取 [魔法 + 2] 黄金。再对一名敌人造成 [魔法 + 2] 点伤害，数值因窃取黄金数而增强。 [50:1]',
    // EN "Steal [Magic + 2] Gold. Then deal [Magic + 2] damage to an Enemy,
    // boosted by Gold stolen. [50:1]" 官方步骤 CountEnemyGold + CountMaxWithMagic +
    // TakeEnemyGold + GiveGold + Damage(UseCounterForAmount)。判读：
    // - 定量窃取 = stealGold(2, 1)（独立敌方余额转移 + goldStolen 记实际转移额）。
    // - 「数值因窃取黄金数而增强」= goldStolen；[50:1] = 每 50 黄金 +1 伤害，已被消费。
    build: skill(
      stealGold(2, 1),
      dmg('enemyChosen', 2, 1, {
        modifier: { mod: { kind: 'ratio', a: 50, b: 1 }, source: { kind: 'goldStolen' } },
      }),
    ),
  },
  {
    id: 9189,
    desc: '窃取一名敌人所有黄金数。对一名敌人造成 [魔法 + 3] 点伤害，并使其陷入出血状态。 [x10]',
    // EN "Steal all Gold from the Enemy. Deal [Magic + 3] damage to an Enemy and
    // inflict Bleed. [x10]" 官方步骤 CountEnemyGold 1000 + Damage + CauseBleed +
    // TakeEnemyGold + GiveGold（伤害段**无** UseCounterForAmount）。判读：
    // - 「窃取所有黄金」= stealGold all（独立敌方余额全额转移，8141 同口径）。
    // - 「使其陷入出血」= lastTarget（「其」= 首段伤害目标跨段绑定，不重抽 rng）。
    // - 尾缀 [x10]：官方步骤伤害/出血均无来源计数实锤，唯一量源（全额窃取额）×10
    //   与步骤矛盾——孤儿 tag 不挂载不硬凑（§14.12 / K-B 收官轮 12 口径，记录保留）。
    build: skill(
      dmg('enemyChosen', 3, 1),
      inflict('bleed', 'lastTarget'),
      stealGold(0, 0, { all: true }),
    ),
  },
  {
    id: 9545,
    desc: '将 3 颗黄色宝石转换成紫色龙宝石，诅咒敌人数量增加。然后对随机敌人施加诅咒和死亡标记。 [1:1]',
    // EN "Convert 3 Yellow Gems into Purple Dragon Gems, boosted by Cursed
    // Enemies. Then Curse and Death Mark a random Enemy. [1:1]" 官方步骤
    // CountSpecificStatusEffect(cursed) + ConvertGems UseCounterForAmount +
    // CauseCursed(RandomEnemy) + CauseDeathMark(FromPrevious)。判读：
    // - 「紫色龙宝石」= dragonGem + color Purple（六色族 spec.color 通道，波B 口径）。
    // - 「诅咒敌人数量增加」= 转换颗数 = 3 + 被诅咒敌人数：TransformGemParams.countModifier
    //   （r27 卡点「transform count 仅静态缩放、无 modifier 通道」解锁）；[1:1] 被消费。
    // - 「对随机敌人施加诅咒和死亡标记」= CauseCursed@RandomEnemy + CauseDeathMark@
    //   FromPrevious → 第二段挂 lastTarget 跨段绑定同一名随机敌人。
    build: skill(
      transformToSpecial(BaseColor.Yellow, { kind: 'dragonGem', color: BaseColor.Purple }, {
        count: 3,
        countModifier: { mod: { kind: 'multiplier', a: 1 }, source: { kind: 'enemyStatusCount', statusId: 'curse' } },
      }),
      inflict('curse', 'enemyRandom'),
      inflict('death-mark', 'lastTarget'),
    ),
  },
  {
    id: 10061,
    desc: '对敌人造成[魔法 + 4]点伤害，然后将其拉到后方。有10%的几率将其击杀，击杀几率受其护甲值提升（最高可达30%）。 [10:1]',
    // EN "Deal [Magic + 4] damage to an Enemy, then pull them to the back. There
    // is a 10% chance to slay them, boosted by their Armor (up to 30%). [10:1]"
    // 官方步骤 CountArmor 10 + CountMax 20 + LethalDamageConditional(UseCounterForAmount)
    // + Damage + TroopOrderBack。判读：
    // - 段序按描述子句：伤害 → 拉回末位（reposition lastTarget）→ 击杀几率。
    // - 「10% 几率击杀」= execute 段 chance 0.1；「几率受其护甲值提升」= chanceBoost
    //   { ratio 10:1, source targetStat armor }（每 10 护甲 +1 个百分点）；「最高可达
    //   30%」= 官方 CountMax 20 → max = 20 封加成百分点（10% + ≤20 ≤ 30%，r27 卡点
    //   「几率封顶无原语」解锁）。[10:1] 已被 chanceBoost 消费。
    // - 记录：官方步骤护甲计数在伤害前（CountArmor 先行），本组装按描述段序击杀判读
    //   在伤害后 → targetStat armor 读的是受击后的现行护甲（差异记录，不硬凑时序）。
    // - R001 / L6-7833（sa-L76 修复）：按原生步骤序执行——先按伤害前护甲判定击杀，再造成
    //   伤害、拉到末位（目标已死则两段空转）。段级几率在目标解析前求值（此时尚无 lastTarget），
    //   故几率来源用 chosenStat（本次选定的敌人 = FromTarget）。
    build: skill(
      dmg('enemyChosen', 0, 0, {
        execute: true,
        chance: 0.1,
        chanceBoost: { mod: { kind: 'ratio', a: 10, b: 1 }, source: { kind: 'chosenStat', stat: 'armor' }, max: 20 },
      }),
      dmg('enemyChosen', 4, 1),
      reposition('lastTarget', 'back'),
    ),
  },
];

export const BATCH_R28: CuratedBatch = { batch: 'r28', spells: SPELLS, skipped: SKIPPED };
