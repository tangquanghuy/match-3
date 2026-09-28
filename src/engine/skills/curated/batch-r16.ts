/**
 * 放弃桶回收批 R16（2026-09-18）：晋升度/魔头/地点条件族惰性建模批 + 语义清晰长尾判读批。
 *
 * 前置：R11 已落 {kind:'ascended', min} / {kind:'regionPresent', region} 惰性条件
 * （标准战斗恒 false → condMult 退化为原值，效果正确不炸；用户裁定：模式专属内容
 * 建模好放着）。本批为该族剩余条目收口 + 长尾逐条判读。
 *
 * 本批口径：
 * - 晋升度条件官方分两系（RawData.SpellSteps 实锤）：
 *   MultiplyForAscensionBoss（ZH「Boss」→ targetRace 'Boss'，r11 ASC3 口径）与
 *   MultiplyForAscensionCastle（ZH「塔/防御塔」→ targetRace 'Castle'，troopTypes 合法值）。
 *   StatusAmount 3 = 晋升层数下限；「3 倍 - 5 倍」取区间下限 3（r11 口径）。
 * - 地区翻倍 MultiplyForRegion4001-4010，region 取 r11 既有命名（WintersReach/AncientKhet 等）。
 * - [xN]/[N:M] 附着段按官方 UseCounterForAmount 实测：CountGems 200/300 系 ×N（r11 口径）、
 *   CountAttack/CountMagic 100 系 = ratio 100:1（每 100 点 +1，source targetStat）。
 * - 石像鬼宝石引擎为善恶合并一口（gargoyleGem，tier 区分），官方分 GoodGargoyle/BadGargoyle
 *   两口的条目按 r11 9547 超集口径合并并注明。
 * - 9933（狼人宝石+凛冬之境）经查重发现 batch-r14 已按同口径收录，本批不重复认领。
 * - 仍不可表达条目的 SKIP 记录保留在原批次文件（避免重复计数，r11 头注同款），
 *   本批复核结论见批尾 SKIP_REVIEW 注释。
 */
import type { CuratedBatch } from './index';
import {
  skill, dmg, trueDmg, heal, armor, attack, magic, reduce, steal, inflict,
  createGems, createSpecialGems, transformToSpecial, destroyColor,
  destroyRandomCols, explodeRandomGems, explodeRandomSpecialGems, createStorm, oneOf,
  extraTurn, shuffleBoard, summonRef, CHOSEN,
} from '../builders';
import { BaseColor } from '../../types';
import type { Condition, CondMult } from '../effects/secondary';

/** 「所有拥有此(选定)颜色法力值的盟友/敌人」动态色条件（r11 CHOSEN_COLOR 口径） */
const CHOSEN_COLOR: Condition = { kind: 'targetColor', color: 'CHOSEN' };

/** 塔/防御塔×晋升 3-5 倍（官方 MultiplyForAscensionCastle）：目标为 Castle 型 ∧ 施法方
 *  有晋升记录；倍率取官方区间下限 3。标准战斗 ascended 恒 false → 原值（惰性建模）。 */
const CASTLE_ASC: Condition = {
  kind: 'allOf',
  of: [{ kind: 'targetRace', race: 'Castle' }, { kind: 'ascended', min: 3 }],
};
const CASTLE_ASC3: CondMult = { times: 3, cond: CASTLE_ASC };

/** 地区翻倍（官方 MultiplyForRegion4001-4010）：r11 REGION2 同款 */
const REGION2 = (region: string): CondMult => ({ times: 2, cond: { kind: 'regionPresent', region } });

/** 「召唤(一场)随机风暴」（官方 StormRandom）：随机风暴无专用原语 → oneOf 六色风暴
 *  等概率掷选（batch-p37 7787 先例） */
const randomStorm = () =>
  oneOf(
    [createStorm(BaseColor.Green)],
    [createStorm(BaseColor.Red)],
    [createStorm(BaseColor.Blue)],
    [createStorm(BaseColor.Yellow)],
    [createStorm(BaseColor.Purple)],
    [createStorm(BaseColor.Brown)],
  );

const SKIPPED: { id: number; reason: string }[] = [];

const SPELLS: CuratedBatch['spells'] = [
  {
    id: 7672,
    desc: '摧毁所有指定颜色的宝石。给予所有拥有此颜色法力值的盟友 [魔法 + 1] 点生命值和 4 点魔力值。',
    // 「所有拥有此颜色法力值的盟友」= allyAll + ifCond targetColor CHOSEN（r11 8180/8477 动态色口径）
    build: skill(
      destroyColor(CHOSEN),
      heal('allyAll', 1, 1, { ifCond: CHOSEN_COLOR }),
      magic('allyAll', 4, 0, { ifCond: CHOSEN_COLOR }),
    ),
  },
  {
    id: 8359,
    desc: '窃取一个敌人 [魔法 + 1] 点攻击力，并将之转换为护甲值。给予所有蛮族盟友屏障效果。 [100:1]',
    // CountAttack 100 = ratio 100:1 targetStat attack；「所有蛮族盟友」= allyAll + ifCond targetRace Wildfolk
    build: skill(
      steal('enemyChosen', 'attack', 'armor', 1, 1, {
        modifier: { mod: { kind: 'ratio', a: 100, b: 1 }, source: { kind: 'targetStat', stat: 'attack' } },
      }),
      inflict('barrier', 'allyAll', { ifCond: { kind: 'targetRace', race: 'Wildfolk' } }),
    ),
  },
  {
    id: 8797,
    desc: '创造 5 颗末日骷髅头，数量因恶石像鬼而增强。 [x3]',
    // CountGems BadGargoyle 300 = ×3；「恶石像鬼」按引擎石像鬼宝石善恶合并一口（gargoyleGem，r11 9547 超集口径并注明）
    build: skill(
      // sa-R2 L4b-7210: native CreateGems Doomskull (was plain Skulls). Evil-only count needs P-R2-gargoyle-tier.
      createSpecialGems({ kind: 'doomSkull' }, 5, 0, {
        // native CountGems 300 BadGargoyle: tier 2 only (P-R2-gargoyle-tier)
        modifier: { mod: { kind: 'multiplier', a: 3 }, source: { kind: 'boardSpecial', gem: 'gargoyleGem', tier: 2 } },
      }),
    ),
  },
  {
    id: 9022,
    desc: '爆破 3 颗善石像鬼宝石。获得 [魔法 + 1] 点攻击力和护甲值。',
    // 官方 ExplodeColor GoodGargoyle 3；引擎善恶合并一口 → gargoyleGem 超集口径（r11 9547 并注明）
    build: skill(
      // native ExplodeColor 3 GoodGargoyle: tier 1 only (P-R1-gargoyle-tier-filter)
      explodeRandomSpecialGems('gargoyleGem', 3, 0, undefined, 1),
      attack('allySelf', 1, 1),
      armor('allySelf', 1, 1),
    ),
  },
  {
    id: 9139,
    desc: '窃取一名敌人 [魔法 + 1] 点攻击力，并换成生命值。打乱板面。有 25% 的几率获得一个额外回合。 [100:1]',
    // P-steal-to-life：原生 CountAttack 100 → CountMaxWithMagic 1 → DecreaseAttack → IncreaseHealth Self
    // = 计数 min(攻击, M+1)（[100:1] 是 CountAttack 100% 的显示标签，不是额外加成）；生命与上限同增；
    // 「打乱板面」= shuffleBoard（batch-37 落地）
    build: skill(
      steal('enemyChosen', 'attack', 'hp', 1, 1, { gainLifeMode: 'gain' }),
      shuffleBoard(),
      extraTurn({ chance: 0.25 }),
    ),
  },
  {
    id: 9219,
    desc: '将所有选定颜色的宝石转换成善石像鬼宝石。对所有拥有其法力颜色的敌人造成 [(魔法 x 1.5) + 4] 点伤害。获得一个额外回合。',
    // 官方 ConvertGems FromTarget→GoodGargoyle + FromManaColorEnemy：善石像鬼按合并一口超集口径；「拥有其(选定)法力颜色的敌人」= targetColor CHOSEN（r11 口径）
    build: skill(
      transformToSpecial(CHOSEN, 'gargoyleGem'),
      dmg('enemyAll', 4, 1.5, { range: 'all', ifCond: CHOSEN_COLOR }),
      extraTurn(),
    ),
  },
  {
    id: 9223,
    desc: '创建 9 颗紫色宝石。窃取一名敌人 [魔法 + 1] 点魔力值，移用到自身的生命值。 [100:1]',
    // P-steal-to-life：原生 CountMagic 100 → CountMaxWithMagic 1 → CreateGems 9 → IncreaseHealth Self →
    // DecreaseSpellPower = 计数 min(魔法, M+1)（[100:1] 为 CountMagic 100% 标签）；生命与上限同增
    build: skill(
      createGems(BaseColor.Purple, 9, 0),
      steal('enemyChosen', 'magic', 'hp', 1, 1, { gainLifeMode: 'gain' }),
    ),
  },
  {
    id: 9473,
    desc: '对敌人造成 [魔法 + 2] 点伤害。如果敌人是塔，则基于我已晋升的稀有度造成 3 到 5 倍伤害。如果发生风暴，则消除 5 点魔法。然后召唤随机风暴。',
    // MultiplyForAscensionCastle（塔 = 官方 Castle 型，惰性建模）；「如果发生风暴，则消除 5 点魔法」= 官方 DecreaseSpellPower+AddForAnyStorm → ifCond stormPresent（8658 同款读法）；StormRandom = oneOf 六色（p37 先例）
    build: skill(
      dmg('enemyChosen', 2, 1, { condMult: CASTLE_ASC3 }),
      reduce('lastTarget', 'magic', 5, 0, { ifCond: { kind: 'stormPresent' } }),
      randomStorm(),
    ),
  },
  {
    id: 9479,
    desc: '对敌人造成 [魔法 + 2] 点伤害，伤害值因恶魔传送门宝石而增强。如果敌人是塔，则基于我已晋升的稀有度造成 3 到 5 倍伤害。如果敌人死亡，则将 2 颗红宝石转换为恶魔传送门宝石。 [x4]',
    // CountGems DaemonicPortal 400 = ×4（波B 落地）；MultiplyForAscensionCastle；「敌人死亡→转换」= ifTargetDied（AddForKill，单一伤害主目标精确判定）
    build: skill(
      dmg('enemyChosen', 2, 1, {
        modifier: { mod: { kind: 'multiplier', a: 4 }, source: { kind: 'boardSpecial', gem: 'daemonicPortalGem' } },
        condMult: CASTLE_ASC3,
      }),
      transformToSpecial(BaseColor.Red, 'daemonicPortalGem', { count: 2, ifTargetDied: true }),
    ),
  },
  {
    id: 9515,
    desc: '对所有敌人造成 [(魔法 x 2.75) + 6] 点伤害。将 5 颗蓝宝石转换为灵石。有 10% 的几率额外获得一回合，蓝宝石数量越多，几率越大。 [x3]',
    // CountGems Blue 300 供 ExtraTurnConditional：几率 = 10% + 每 300 颗 +10 个百分点（ratio 300:10，官方步骤精确口径，[x3] 即该计数词）；灵石 = spiritGem（波B 落地）
    build: skill(
      dmg('enemyAll', 6, 2.75, { range: 'all' }),
      transformToSpecial(BaseColor.Blue, 'spiritGem', { count: 5 }),
      extraTurn({
        chance: 0.1,
        chanceBoost: { mod: { kind: 'ratio', a: 300, b: 10 }, source: { kind: 'boardGems', color: BaseColor.Blue } },
      }),
    ),
  },
  {
    id: 9544,
    desc: '对敌人造成 [魔法 + 2] 点伤害。如果敌人是塔，则基于我已晋升的稀有度造成 3 到 5 倍伤害。召唤一条腐烂的蛇。',
    // MultiplyForAscensionCastle；Summoning 7639 = RottingSerpent
    build: skill(
      dmg('enemyChosen', 2, 1, { condMult: CASTLE_ASC3 }),
      summonRef('RottingSerpent', 7639),
    ),
  },
  {
    id: 9565,
    desc: "从前 2 名敌人身上窃取 [(魔法 x 0.8) + 3] 点生命值，数量因紫宝石而增加。如果在 Winter's Reach 中使用，效果加倍。 [x2]",
    // Native StealLife: steal from the first two enemies, boosted by purple gems and region.
    build: skill(
      dmg('enemyFirstN', 3, 0.8, {
        n: 2, drain: true,
        modifier: { mod: { kind: 'multiplier', a: 2 }, source: { kind: 'boardGems', color: BaseColor.Purple } },
        condMult: REGION2('WintersReach'),
      }),
    ),
  },
  {
    id: 9595,
    desc: '对一名敌人造成[魔法 + 2]点伤害。如果敌人是塔，则基于我已晋升的稀有度造成 3 到 5 倍伤害。然后召唤一场随机风暴。',
    // MultiplyForAscensionCastle；StormRandom = oneOf 六色风暴等概率掷选（p37 7787 先例）
    build: skill(
      dmg('enemyChosen', 2, 1, { condMult: CASTLE_ASC3 }),
      randomStorm(),
    ),
  },
  {
    id: 9603,
    desc: '对一名敌人造成[魔法 + 2]点伤害。如果敌人是塔，则基于我已晋升的稀有度造成 3 到 5 倍伤害。引爆2-3颗宝石并获得额外回合。',
    // 官方步骤序：ExtraTurn → 引爆 2 → 50% 引爆 1（「2-3 颗」= 2 + 50%×1，段序按官方步骤）
    build: skill(
      dmg('enemyChosen', 2, 1, { condMult: CASTLE_ASC3 }),
      extraTurn(),
      explodeRandomGems(2, 0),
      explodeRandomGems(1, 0, 'all', undefined, { chance: 0.5 }),
    ),
  },
  {
    id: 9665,
    desc: '对一名敌人造成[魔法 + 2]点伤害。如果敌人是塔，则基于我已晋升的稀有度造成 3 到 5 倍伤害。摧毁一根随机柱子。',
    // MultiplyForAscensionCastle；「摧毁一根随机柱子」= destroyRandomCols(1)
    build: skill(
      dmg('enemyChosen', 2, 1, { condMult: CASTLE_ASC3 }),
      destroyRandomCols(1),
    ),
  },
  {
    id: 9672,
    desc: '对一名敌人造成[魔法 + 2]点伤害。如果敌人是塔，则基于我已晋升的稀有度造成 3 到 5 倍伤害。如果敌人死亡，则祝福所有盟友。',
    // MultiplyForAscensionCastle；「敌人死亡→祝福所有盟友」= ifTargetDied（官方 AddForKill，单一伤害主目标精确判定）；blessed r10 落地
    build: skill(
      dmg('enemyChosen', 2, 1, { condMult: CASTLE_ASC3 }),
      inflict('blessed', 'allyAll', { ifTargetDied: true }),
    ),
  },
  {
    id: 9730,
    desc: '对一名敌人造成[魔法 + 2]点伤害。如果敌人是塔，则基于我已晋升的稀有度造成 3 到 5 倍伤害。然后创造5颗燃烧宝石。',
    // MultiplyForAscensionCastle；燃烧宝石 = burningGem（状态宝石波A）
    build: skill(
      dmg('enemyChosen', 2, 1, { condMult: CASTLE_ASC3 }),
      createSpecialGems({ kind: 'burningGem' }, 5),
    ),
  },
  {
    id: 9738,
    desc: '对一名敌人造成 [魔法 + 2] 点伤害，伤害值因我的生命值而增强。如果敌人是防御塔，则基于我已晋升的稀有度造成 3 到 5 倍伤害。 [10:1]',
    // CountLife Self 10 = ratio 10:1 selfStat hp（r11 9668 CountAttack 同款）；MultiplyForAscensionCastle
    build: skill(
      dmg('enemyChosen', 2, 1, {
        modifier: { mod: { kind: 'ratio', a: 10, b: 1 }, source: { kind: 'selfStat', stat: 'hp' } },
        condMult: CASTLE_ASC3,
      }),
    ),
  },
  {
    id: 9740,
    desc: '从敌人那里窃取[(魔法 / 2) + 1]次攻击，并将其转移到我的魔法中。 [100:1]',
    // CountAttack 100 = ratio 100:1 targetStat attack；「转移到我的魔法」= gainStat magic
    build: skill(
      steal('enemyChosen', 'attack', 'magic', 1, 0.5, {
        modifier: { mod: { kind: 'ratio', a: 100, b: 1 }, source: { kind: 'targetStat', stat: 'attack' } },
      }),
    ),
  },
  {
    id: 9785,
    desc: '对一名敌人造成[魔法 + 2]点伤害。如果该敌人是防御塔，则基于我已晋升的稀有度造成 3 到 5 倍伤害。将9颗蓝色宝石转化为流血宝石。',
    // MultiplyForAscensionCastle；流血宝石 = bleedGem（波A）定量转换 count 9
    build: skill(
      dmg('enemyChosen', 2, 1, { condMult: CASTLE_ASC3 }),
      transformToSpecial(BaseColor.Blue, 'bleedGem', { count: 9 }),
    ),
  },
  {
    id: 9794,
    desc: '对一名敌人造成[魔法 + 2]点伤害。如果该敌人是防御塔，则基于我已晋升的稀有度造成 3 到 5 倍伤害。生成7颗流血宝石。',
    // MultiplyForAscensionCastle；创造 7 颗流血宝石 = createSpecialGems bleedGem
    build: skill(
      dmg('enemyChosen', 2, 1, { condMult: CASTLE_ASC3 }),
      createSpecialGems({ kind: 'bleedGem' }, 7),
    ),
  },
  {
    id: 9866,
    desc: '对一名敌人造成[魔法 + 2]点伤害。如果该敌人是防御塔，则基于我已晋升的稀有度造成 3 到 5 倍伤害。生成5个毒宝石和5个腐朽宝石。',
    // MultiplyForAscensionCastle；毒宝石 poisonGem（波A）+ 腐朽宝石 decayGem（波B）各 5（官方两步 CreateGems）
    build: skill(
      dmg('enemyChosen', 2, 1, { condMult: CASTLE_ASC3 }),
      createSpecialGems({ kind: 'poisonGem' }, 5),
      createSpecialGems({ kind: 'decayGem' }, 5),
    ),
  },
  {
    id: 9875,
    desc: '对敌人造成[魔法 + 2]点伤害，蓝色宝石和友军可提升伤害。如果敌人是防御塔，则基于我已晋升的稀有度造成 3 到 5 倍伤害。 [x2]',
    // 「蓝色宝石和友军」双来源各 ×2（r11 9563 双计数口径）；MultiplyForAscensionCastle
    build: skill(
      dmg('enemyChosen', 2, 1, {
        modifier: {
          mod: { kind: 'multiplier', a: 2 },
          sources: [
            { kind: 'boardGems', color: BaseColor.Blue },
            { kind: 'alliesOfColor', color: BaseColor.Blue },
          ],
        },
        condMult: CASTLE_ASC3,
      }),
    ),
  },
  {
    id: 9948,
    desc: '对一名敌人造成[魔法 + 2]点伤害，伤害由冰冻宝石提升。如果敌人是防御塔，则基于我已晋升的稀有度造成 3 到 5 倍伤害。如果敌人死亡，则生成8颗冰冻宝石。 [x2]',
    // 冰冻宝石 = boardSpecial freezeGem ×2；MultiplyForAscensionCastle；「敌人死亡→生成」= ifTargetDied（AddForKill）
    build: skill(
      dmg('enemyChosen', 2, 1, {
        modifier: { mod: { kind: 'multiplier', a: 2 }, source: { kind: 'boardSpecial', gem: 'freezeGem' } },
        condMult: CASTLE_ASC3,
      }),
      createSpecialGems({ kind: 'freezeGem' }, 8, 0, { ifTargetDied: true }),
    ),
  },
  {
    id: 9955,
    desc: '对敌人造成[魔法 + 2]点伤害，紫色宝石可提升伤害。如果敌人是防御塔，则基于我已晋升的稀有度造成 3 到 5 倍伤害。 [2:1]',
    // [2:1] 紫色宝石 = ratio 2:1 boardGems Purple；MultiplyForAscensionCastle
    build: skill(
      dmg('enemyChosen', 2, 1, {
        modifier: { mod: { kind: 'ratio', a: 2, b: 1 }, source: { kind: 'boardGems', color: BaseColor.Purple } },
        condMult: CASTLE_ASC3,
      }),
    ),
  },
  {
    id: 9984,
    desc: '造成[(魔法 x 2.5) + 8]点真实散射伤害，受诅咒敌人加成。若在远古凯特使用，则造成双倍伤害。 [x3]',
    // 裸散射 = 全体散射（2026-09-18 官方口径）；「受诅咒敌人」= enemyStatusCount curse ×3；MultiplyForRegion4006（远古凯特）
    build: skill(
      trueDmg('enemyAll', 8, 2.5, {
        range: 'all',
        modifier: { mod: { kind: 'multiplier', a: 3 }, source: { kind: 'enemyStatusCount', statusId: 'curse' } },
        condMult: REGION2('AncientKhet'),
      }),
    ),
  },
];

/**
 * 本批复核仍留弃条目（SKIP 记录保留在原批次文件，避免重复计数；此处仅记复核结论）：
 * - 9476：恶魔传送门宝石已实现（波B），残余卡点 =「将其 1 颗法力色宝石转换为…」按目标
 *   法力色动态转换无对应原语（batch-28 同款）。
 * - 9593：「如果敌人来自 Merlantis」按王国限定条件无对应条件 kind（regionPresent 为
 *   「战场地面」条件，语义不同，不混用）。
 * - 9588：「Dhrak-Zum 盟友数量」按王国计数无对应来源 kind（batch-29 同款）。
 * - 9986：恐惧 = terror（白名单已有），残余卡点 =「若有(任意一名)敌人死亡」跨段任意
 *   死亡绑定缺失（ifTargetDied 仅判最近段主目标，4 目标段会漏判）。
 * - 8925：屏障+半数法力现可表达，残余卡点 =「若对方(该盟友)是一名骑士」目标相对条件
 *   挂无目标宝石段整段跳过；allyRacePresent 为超集近似不取。
 * - 8101：官方步骤为两轮「击退+伤害」（第二击退目标为动态编队第二位，RepositionSegment
 *   无 n 通道），ZH 压缩为单次——无法对号入座。
 * - 10061：击杀几率「最高可达 30%」上限无法表达（chanceBoost 仅 [0,1] 夹取）；官方
 *   CountMax 20 与 ZH 30% 亦互相矛盾，语义拿不准。
 * - 8504：官方 ExplodeColor Skull 3 = 定量骷髅爆破，引擎骷髅清除仅全量一款，无定量原语。
 * - 9780/9546：CreateGems2Colors（色+特殊宝石混合创造）无对应原语（createMix 仅颜色，
 *   batch-36 9312 口径）。
 * - 7463/9287/8804：每摧毁/每在场 N 颗宝石→施加状态（计数驱动施加）无原语（8885 族）。
 * - 7483：「等同自身攻击力」与「×10 棕色敌军」两套不同系数无法共存于单段 modifier。
 * - 7507：「减除生命值并转化为攻击力」同额双段动态绑定无原语（reduce hp 现可表达）。
 * - 8368：减半现可表达，残余卡点 =「爆破等值于失去的魔力值的紫色宝石」动态数量无来源。
 * - 9638：选定单格宝石转换（BoardTarget SingleGem FromTarget）无对应原语（暗影之星本体
 *   已实现）。
 * - 8801：石块→善恶石像鬼（ConvertGems Block→Gargoyle）特殊→特殊转换无原语。
 * - 9603「2-3 颗」以 2 + 50%×1 拆分精确表达（官方步骤即如此），不再以「数量区间」留弃。
 */
export const BATCH_R16: CuratedBatch = { batch: 'R16', spells: SPELLS, skipped: SKIPPED };
