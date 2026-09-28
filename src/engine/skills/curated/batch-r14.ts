/**
 * 放弃桶回收批 R14（2026-09-18 窗口）：「机翻宝石族」真宝石重组装（gem-en-original.md 108 条
 * 中尚未组装的 53 条——R8 简化口径 40 条与 R10/R11/R13/R15 已收录 15 条不重复收）。
 *
 * Wave B 17 颗特殊宝石落地后的真宝石组装口径（区别于 R8 的「主题宝石映射基础色」简化）：
 * - 「创造 N 颗 X 色 法力药水/龙/巨人/灵力宝石」= createSpecialGems({kind, color}, N)（六色族 spec.color）；
 * - 「元素星/暗影之星/天使/恶魔门户/石块/狼化/腐烂/附魔宝石」按官方 Color1/Color2 直映 kind；
 * - 石像鬼宝石 tier：1=善 / 2=恶（CreateGems 无 tier 读写作通用石像鬼，引擎缺省按善处理，
 *   batch-w03 同款）；CreateGems2Colors（善恶随机）按 desc 通用词组装并注明；
 * - 「因天使/石像鬼/灵力/狼化/腐烂宝石数而增强」= boardSpecial（真宝石计数，取代 R8 的 boardGems 泛化）；
 * - 「因盟友和敌人受到祝福/附魔的数量」= sources [allyStatusCount, enemyStatusCount]（R13 8637 先例）；
 * - 王国翻倍（MultiplyForRegion）= condMult regionPresent（R11 建模，标准战斗恒 false）；
 * - ZH 机翻与官方 EN 原句冲突时（8930）以 EN + SpellSteps 为准组装，desc 仍逐字锚定 troops.json。
 */
import type { CuratedBatch } from './index';
import { chooseSkill, skill, dmg, dmgSplash, trueDmg, heal, armor, attack, magic, inflict,
  transform, transformToSpecial, createSpecialGems, createSpecialGems2, createSkulls,
  explodeColor, explodeSpecialGems, explodeRandomGems, destroyChosenRow,
  shuffleBoard, extraTurn, summonRandom, summonRef, oneOf, } from '../builders';
import { BaseColor } from '../../types';

// 诺斯王国（官方 KingdomId 3080/3081，来源 data/raw/gow-2026-09-18/troops.en.json）：
// 本地 troops.json 两子王国合并在「诺斯」名下，按官方 KingdomId 切分引用池。
const NEXUS_REFS = ["Aquaria", "Blackthorn", "Chrysantherax", "CorruptedCycad", "DoomedGargoyle", "Emberclaw", "FirebornEagle", "FirebornLynx", "FirebornPaladin", "FirebornWarrior", "Hawthorn", "Ignarion", "ImmortalAquaria", "ImmortalEmpyrion", "Kalika", "KingHeliodor", "NatureWeird", "NaturebornHunter", "NaturebornWarden", "NaturebornWolf", "NexusPortal", "PrinceBasalt", "QueenAsh", "Shayle", "StonebornLion", "TempestBallista", "Tetramorph", "TheLovers", "TheUmbralGiant", "ValiantPyrea", "WaterWeird", "WaterbornOwl", "WaterbornPriestess", "WaterbornScribe", "WaterbornTemplar"];
const UMBRAL_NEXUS_REFS = ["DarkbornWarlock", "LightbornEnchantress", "LightbornPaladin", "UmbralPortal", "VoidWisp"];

const SKIPPED: { id: number; reason: string }[] = [
  { id: 7708, reason: '已被并发批次 batch-r15 收录（同款组装：anyOf 种族析取 + 天使宝石），此处避让防批间重复' },
  { id: 7391, reason: '官方无 SpellSteps（旧版/已移除效果）；且「因白盔国盟友」= 王国盟友计数无 modifier 来源 kind' },
  { id: 8556, reason: '「如果该盟友来自神堂」= 兵种王国所属条件无原语（regionPresent 为地区键非兵种王国）；生命/魔法/附魔本身可表达' },
  { id: 8801, reason: '「将石块转换成善或恶石像鬼宝石」转换来源端点 fromSpecial 无构造器暴露（transformToSpecial 仅支持色/ANY）；「善或恶」tier 随机端点亦无词汇' },
  { id: 8804, reason: '「宝石附近或下方每有一颗绿色宝石」= 周边位置宝石计数无 modifier 来源 kind（boardGems 为全盘口径）' },
  { id: 8915, reason: '「因恶魔敌人和盟友数而增强 [1:1]」敌方侧种族计数无 source kind（仅 alliesOfRace/enemiesOfColor）；创造 5 颗紫龙宝石本身可表达' },
  { id: 8925, reason: '「若对方是一名骑士，则创造 3 颗灵力宝石」目标相对条件挂无目标创造段无从判定（SOP：整段跳过）；屏障/半数法力本身可表达' },
  { id: 9022, reason: '「爆破 3 颗善石像鬼宝石」tier 过滤爆破无词汇（explodeRandomSpecialGems 不分 tier）' },
  { id: 9219, reason: '「对所有拥有其法力颜色的敌人」FromManaColorEnemy 目标措辞无对应 TargetMode；选定色→善石像鬼转换本身可表达' },
  { id: 9237, reason: '「因不死族和恶魔敌人数而增强 [x10]」敌方侧种族计数无 source kind；爆破所有天使宝石本身可表达' },
  { id: 9546, reason: '「棕色和腐烂宝石的混合体」createMix 仅支持颜色混合（特殊宝石不可入 mix）；「击退」reposition 本身可表达' },
  { id: 9638, reason: '「选择一颗宝石（CELL）将其转换」transform 无选定格端点；「其和另 2 颗随机宝石」玩家选定成分无法表达' },
];

const SPELLS: CuratedBatch['spells'] = [
  {
    id: 8604,
    desc: '对一名随机盟友施魔法。制作 1-3 瓶紫色法力药水。如果有任何敌人被诅咒，有 50% 的几率可获得一个额外回合。',
    // 「施魔法」= CauseEnchanted（R10 附魔状态落地）；紫色法力药水 = manaPotionGem spec.color
    build: skill(
      inflict('enchanted', 'allyRandom'),
      createSpecialGems({ kind: 'manaPotionGem', color: BaseColor.Purple }, 1, 0, { countRange: { min: 1, max: 3 } }),
      extraTurn({ chance: 0.5, ifCond: { kind: 'anyEnemyStatus', statusId: 'curse' } }),
    ),
  },
  {
    id: 8627,
    desc: '将一颗法力宝石转换成一颗元素星。',
    // 官方 CreateGems x1（Color1=ElementalStar）→ 「一颗法力宝石」= 任意色 1 颗（'ANY' 排除已是元素星）
    build: skill(
      // Native CreateGems 1 ElementalStar BoardTarget SingleGem = the chosen cell (L4b-7276 / Explode-a-Gem convention).
      transformToSpecial('CELL', 'elementalStar'),
    ),
  },
  {
    id: 8628,
    desc: '创建 4-6 颗元素星，并召唤一名随机诺斯军队。',
    // SummoningKingdom 3080（诺斯）→ 官方 KingdomId 35 兵引用池（en dump KingdomId 切分）
    build: skill(
      createSpecialGems({ kind: 'elementalStar' }, 1, 0, { countRange: { min: 4, max: 6 } }),
      summonRandom(NEXUS_REFS),
    ),
  },
  {
    id: 8632,
    desc: '对一名敌人造成 [魔法 + 3] 点伤害，并缠绕他。若敌人身亡，则创建 2 颗元素星，并获得一个额外回合。',
    build: skill(
      // L3-001: native Cause* FromTarget precedes Damage (R001)
      inflict('entangle', 'enemyChosen'),
      dmg('enemyChosen', 3),
      createSpecialGems({ kind: 'elementalStar' }, 2, 0, { ifTargetDied: true }),
      extraTurn({ ifTargetDied: true }),
    ),
  },
  {
    id: 8633,
    desc: '对一名敌人造成 [魔法 + 3] 点伤害，并燃烧他。若敌人身亡，则创建 2 颗元素星，并获得一个额外回合。',
    build: skill(
      // L3-001: native Cause* FromTarget precedes Damage (R001)
      inflict('burning', 'enemyChosen'),
      dmg('enemyChosen', 3),
      createSpecialGems({ kind: 'elementalStar' }, 2, 0, { ifTargetDied: true }),
      extraTurn({ ifTargetDied: true }),
    ),
  },
  {
    id: 8634,
    desc: '对一名敌人造成 [魔法 + 3] 点伤害，并冻结他。若敌人身亡，则创建 2 颗元素星，并获得一个额外回合。',
    build: skill(
      // L3-001: native Cause* FromTarget precedes Damage (R001)
      inflict('frozen', 'enemyChosen'),
      dmg('enemyChosen', 3),
      createSpecialGems({ kind: 'elementalStar' }, 2, 0, { ifTargetDied: true }),
      extraTurn({ ifTargetDied: true }),
    ),
  },
  {
    id: 8635,
    desc: '对一名敌人造成 [魔法 + 3] 点伤害，并击晕他。若敌人身亡，则创建 2 颗元素星，并获得一个额外回合。',
    build: skill(
      // L3-001: native Cause* FromTarget precedes Damage (R001)
      inflict('stun', 'enemyChosen'),
      dmg('enemyChosen', 3),
      createSpecialGems({ kind: 'elementalStar' }, 2, 0, { ifTargetDied: true }),
      extraTurn({ ifTargetDied: true }),
    ),
  },
  {
    id: 8679,
    desc: '创建 5-7 颗临界星，并召唤一名随机临界诺斯军队。',
    // SummoningKingdom 3081（临界诺斯）→ 官方 KingdomId 5 兵引用池
    build: skill(
      createSpecialGems({ kind: 'umbralStar' }, 1, 0, { countRange: { min: 5, max: 7 } }),
      summonRandom(UMBRAL_NEXUS_REFS),
    ),
  },
  {
    id: 8733,
    desc: '为所有盟友赋予 [(魔法 x 0.8) + 1] 点生命，并创造 1 颗天使宝石。',
    build: skill(
      heal('allyAll', 1, 0.8),
      createSpecialGems({ kind: 'angelGem' }, 1),
    ),
  },
  {
    id: 8785,
    desc: '创建 1 颗元素星，数量因绿色盟友数和绿色宝石数而增强。若敌人队伍中有野兽，则获得一个额外回合。 [3:1]',
    // 官方双 Count x34（绿色盟友 + 绿色宝石）计数相加后按 [3:1] 折算 → sources 相加（§1 多来源）
    build: skill(
      createSpecialGems({ kind: 'elementalStar' }, 1, 0, {
        modifier: {
          mod: { kind: 'ratio', a: 3, b: 1 },
          sources: [{ kind: 'alliesOfColor', color: BaseColor.Green }, { kind: 'boardGems', color: BaseColor.Green }],
        },
      }),
      extraTurn({ ifCond: { kind: 'enemyRacePresent', race: 'Beast' } }),
    ),
  },
  {
    id: 8795,
    desc: '冻结一名随机敌人。创造 3 颗石像鬼宝石并获得一个额外回合。',
    // L3-003: native CreateGems2Colors GoodGargoyle/BadGargoyle → per-gem mix of tier 1 (good) / 2 (evil)
    build: skill(
      inflict('frozen', 'enemyRandom'),
      createSpecialGems2([{ kind: 'gargoyleGem', tier: 1 }, { kind: 'gargoyleGem', tier: 2 }], 3),
      extraTurn(),
    ),
  },
  {
    id: 8796,
    desc: '创造一颗石像鬼宝石。板面上每有一颗棕色宝石，则有 7% 的几率获得一个额外回合。 [x7]',
    // 原生 Randomize ABC-DEF：CountGems Brown 700 → CreateGems GoodGargoyle | BadGargoyle → ExtraTurnConditional，
    // 善/恶各 1/2；无基础几率（步骤无 Amount）。棕色计数在创造之前（新宝石可能覆盖一颗棕色）：
    // 额外回合段放在创造段之前读取计数，两者互不影响，结果与原生顺序相同。
    build: skill(
      oneOf(
        [extraTurn({ chanceBoost: { mod: { kind: 'multiplier', a: 7 }, source: { kind: 'boardGems', color: BaseColor.Brown } } }), createSpecialGems({ kind: 'gargoyleGem', tier: 1 }, 1)],
        [extraTurn({ chanceBoost: { mod: { kind: 'multiplier', a: 7 }, source: { kind: 'boardGems', color: BaseColor.Brown } } }), createSpecialGems({ kind: 'gargoyleGem', tier: 2 }, 1)],
      ),
    ),
  },
  {
    id: 8803,
    desc: '对 2 名随机敌人造成 [魔法 + 3] 点伤害。再创造 3 颗恶石像鬼宝石。',
    // 恶石像鬼 = gargoyleGem tier 2
    build: skill(
      dmg('enemyRandomN', 3, 1, { n: 2 }),
      createSpecialGems({ kind: 'gargoyleGem', tier: 2 }, 3),
    ),
  },
  {
    id: 8813,
    desc: '对一名敌人造成 [魔法 + 3] 点轻微溅射伤害。再创造 1-2 颗随机石像鬼宝石。',
    build: skill(
      dmgSplash('enemyChosen', 3),
      createSpecialGems({ kind: 'gargoyleGem' }, 1, 0, { countRange: { min: 1, max: 2 } }),
    ),
  },
  {
    id: 8814,
    desc: '打乱板面。再创造 2 颗石块和 4 颗石像鬼宝石。',
    // 「打乱板面」JumbleBoard = shuffleBoard；石块 = stoneBlock（惰性障碍，可创造）
    build: skill(
      shuffleBoard(),
      createSpecialGems({ kind: 'stoneBlock' }, 2),
      createSpecialGems({ kind: 'gargoyleGem' }, 4),
    ),
  },
  {
    id: 8886,
    desc: '将所有蓝色宝石转换成绿色龙宝石。若我的队伍有克里斯坦纳斯，则给予所有龙族盟友 4 点魔力值。 [x4]',
    // GreenDragonGem → transformToSpecial（转换端点无 color 通道，按任务口径落 dragonGem kind）；
    // [x4] = 官方 CountArmyTroop x400「每克里斯坦纳斯 +4」→ 引擎无按名计数来源，
    // 以 troopPresent 存在性 + 常数 4 表达（单队伍唯一 Krystenax，等价）
    build: skill(
      // R009: DragonGreen = Green dragonGem special.
      transformToSpecial(BaseColor.Blue, { kind: 'dragonGem', color: BaseColor.Green }),
      magic('allyAll', 4, 0, {
        targetRace: 'Dragon',
        ifCond: { kind: 'troopPresent', side: 'ally', name: '克里斯坦纳斯' },
      }),
    ),
  },
  {
    id: 8898,
    desc: '&& 将所有黄色宝石转换成灵力宝石。&& 将所有黄色宝石转换成骷髅头。',
    // 纯 '&&' 拼接按 §13.1 顺序组装（官方两变体顺序排列，9014 同款）
    build: skill(chooseSkill(["将所有黄色宝石转化为灵魂宝石","将所有黄色宝石转化为骷髅"], [transformToSpecial(BaseColor.Yellow, 'spiritGem')], [transform(BaseColor.Yellow, 'SKULL')])),
  },
  {
    id: 8899,
    desc: '&& 对所有敌人造成 [魔法 + 1] 点真实伤害。&&  对最弱的敌人造成 [魔法 + 1] 点真实伤害，数值因红色宝石和灵力宝石数而增强。 [x2]',
    build: skill(chooseSkill(["对全体敌人造成［魔法＋1］真实伤害","对最弱敌人造成［魔法＋1］真实伤害，每颗红色或灵魂宝石增强2点"], [trueDmg('enemyAll', 1, 1, { range: 'all' })], [trueDmg('enemyWeakest', 1, 1, {
        modifier: {
          mod: { kind: 'multiplier', a: 2 },
          sources: [{ kind: 'boardGems', color: BaseColor.Red }, { kind: 'boardSpecial', gem: 'spiritGem' }],
        },
      })])),
  },
  {
    id: 8916,
    desc: '爆破所有紫色宝石和灵力宝石。对后 2 位敌人造成 [魔法 + 3] 点伤害，伤害值因灵力宝石数而增强。 [x6]',
    build: skill(
      explodeColor(BaseColor.Purple),
      explodeSpecialGems('spiritGem'),
      dmg('enemyLastN', 3, 1, {
        n: 2,
        modifier: { mod: { kind: 'multiplier', a: 6 }, source: { kind: 'boardSpecial', gem: 'spiritGem' } },
      }),
    ),
  },
  {
    id: 8917,
    desc: '创造一颗灵力宝石。板面上每有一颗黄色宝石，则有 7% 的几率获得一个额外回合。 [x7]',
    build: skill(
      // sa-R7: native CountGems Yellow 700 is step 0 -> chance counted before the Spirit gem replaces a gem (R001).
      extraTurn({ chanceBoost: { mod: { kind: 'multiplier', a: 7 }, source: { kind: 'boardGems', color: BaseColor.Yellow } } }),
      createSpecialGems({ kind: 'spiritGem', color: BaseColor.Purple }, 1),
    ),
  },
  {
    id: 8918,
    desc: '将所有绿色宝石转换成灵力宝石。',
    build: skill(
      transformToSpecial(BaseColor.Green, 'spiritGem'),
    ),
  },
  {
    id: 8921,
    desc: '对一名敌人造成 [魔法 + 3] 点伤害。再创造 3 颗灵力宝石。',
    build: skill(
      dmg('enemyChosen', 3),
      createSpecialGems({ kind: 'spiritGem', color: BaseColor.Purple }, 3),
    ),
  },
  {
    id: 8930,
    desc: '摧毁 5x5 圈宝石。获得 [魔法 + 2] 点护甲值和生命值，数值因被摧毁的石像鬼宝石数而增强。 [3:1]',
    // ZH 为机翻转写；官方 EN「Destroy a row. Deal [Magic + 2] damage to the first 2 Enemies,
    // boosted by my Life. [3:1]」+ Steps（DestroyGems 行 / CountLife Self x34 → FirstTwoEnemies）
    // 按官方句组装（EN 优先口径），desc 仍逐字锚定 troops.json
    build: skill(
      destroyChosenRow(),
      dmg('enemyFirstN', 2, 1, {
        n: 2,
        modifier: { mod: { kind: 'ratio', a: 3, b: 1 }, source: { kind: 'selfStat', stat: 'hp' } },
      }),
    ),
  },
  {
    id: 8968,
    desc: '创造 4 颗天使宝石。然后引爆 4 颗宝石。',
    // 「引爆 4 颗宝石」ExplodeGems x4 = 随机 4 颗（r8 8968 卡点注：引爆随机宝石可表达）
    build: skill(
      createSpecialGems({ kind: 'angelGem' }, 4),
      explodeRandomGems(4, 0),
    ),
  },
  {
    id: 9010,
    desc: '对一名敌人造成 [魔法 + 3] 点伤害，伤害值因棕色盟友数而增强。再创造 3 颗善石像鬼宝石。 [x3]',
    // 善石像鬼 = gargoyleGem tier 1
    build: skill(
      dmg('enemyChosen', 3, 1, {
        modifier: { mod: { kind: 'multiplier', a: 3 }, source: { kind: 'alliesOfColor', color: BaseColor.Brown } },
      }),
      createSpecialGems({ kind: 'gargoyleGem', tier: 1 }, 3),
    ),
  },
  {
    id: 9023,
    desc: '对所有敌人造成[魔法 + 2] 点伤害。创造 5 颗混合善恶的石像鬼宝石。',
    // CreateGems2Colors 善恶混合 → 通用石像鬼（tier 缺省由引擎处理，8795 同款注明）
    build: skill(
      dmg('enemyAll', 2, 1, { range: 'all' }),
      createSpecialGems({ kind: 'gargoyleGem' }, 5),
    ),
  },
  {
    id: 9138,
    desc: '对所有敌人造成 [(魔法 x 3) + 6] 点伤害。创造 3 颗元素之星和 3 颗暗影之星。有 10% 的几率获得额外回合，根据骷髅头宝石数量提升。[x4]',
    build: skill(
      dmg('enemyAll', 6, 3, { range: 'all' }),
      createSpecialGems({ kind: 'elementalStar' }, 3),
      createSpecialGems({ kind: 'umbralStar' }, 3),
      extraTurn({
        chance: 0.1,
        chanceBoost: { mod: { kind: 'multiplier', a: 4 }, source: { kind: 'castStartBoardSkulls' } },
      }),
    ),
  },
  {
    id: 9183,
    desc: '对首 2 位敌人造成 [魔法 + 3] 点真实伤害。板面上每有一颗狼人宝石，则有 25% 的几率使敌人陷入 4 个叠加出血状态。',
    // 「敌人」= 前 2 位（官方步骤 FirstTwoEnemies）；累计 25%/颗 → chanceBoost；
    // 官方 4 条条件施加步骤 = 4 层（stacks 4）
    build: skill(
      trueDmg('enemyFirstN', 3, 1, { n: 2 }),
      inflict('bleed', 'enemyFirstN', {
        n: 2,
        stacks: 4,
        chanceBoost: { mod: { kind: 'multiplier', a: 25 }, source: { kind: 'boardSpecial', gem: 'lycanthropyGem' } },
      }),
    ),
  },
  {
    id: 9238,
    desc: '创造一颗天使宝石。板面上每有一颗黄色宝石，则有 7% 的几率获得一个额外回合。 [x7]',
    build: skill(
      createSpecialGems({ kind: 'angelGem' }, 1),
      extraTurn({ chanceBoost: { mod: { kind: 'multiplier', a: 7 }, source: { kind: 'boardGems', color: BaseColor.Yellow } } }),
    ),
  },
  {
    id: 9371,
    desc: '对一名敌人造成 [(魔法 x 1.5) + 2] 点真实伤害，并对其下方所有敌人造成该伤害的一半，伤害值因蓝龙宝石而增强。若在星星湾使用，则伤害翻倍。 [x2]',
    // 「其下方所有敌人」= enemyBelowTarget（R13）；「一半」[(M×1.5)+2]×0.5 = [(M×0.75)+1]；
    // 「蓝龙宝石」= boardSpecial dragonGem（引擎计数不分 spec.color，超集口径注明）；
    // MultiplyForRegion4007（星星湾）= regionPresent（R11 建模）
    build: skill(
      trueDmg('enemyChosen', 2, 1.5, {
        modifier: { mod: { kind: 'multiplier', a: 2 }, source: { kind: 'boardSpecial', gem: 'dragonGem', color: BaseColor.Blue } },
        condMult: { times: 2, cond: { kind: 'regionPresent', region: 'BayOfStars' } },
      }),
      trueDmg('enemyBelowTarget', 1, 0.75, {
        modifier: { mod: { kind: 'multiplier', a: 2 }, source: { kind: 'boardSpecial', gem: 'dragonGem', color: BaseColor.Blue } },
        condMult: { times: 2, cond: { kind: 'regionPresent', region: 'BayOfStars' } },
      }),
    ),
  },
  {
    id: 9467,
    desc: '&& 创建 2 颗恶魔门户宝石。&& 引爆一颗随机宝石并召唤一只灵狐。',
    // §13.1 顺序组装；灵狐 = SpiritFox（troops.json referenceName，官方 Summoning 6207）
    build: skill(chooseSkill(["创造2颗恶魔门户宝石","爆破一颗随机宝石并召唤灵狐"], [createSpecialGems({ kind: 'daemonicPortalGem' }, 2)], [explodeRandomGems(1, 0), summonRef('SpiritFox', 6207)])),
  },
  {
    id: 9469,
    desc: '对敌人造成 [魔法 + 3] 点伤害，伤害值因天使宝石数量而增强。制造一颗天使宝石。 [x6]',
    // 「对敌人造成」裸伤害 = enemyChosen（§0；r15 7031 同款）
    build: skill(
      dmg('enemyChosen', 3, 1, {
        modifier: { mod: { kind: 'multiplier', a: 6 }, source: { kind: 'boardSpecial', gem: 'angelGem' } },
      }),
      createSpecialGems({ kind: 'angelGem' }, 1),
    ),
  },
  {
    id: 9519,
    desc: '对所有敌人造成 [(魔法 x 2.75) + 6] 点伤害。将 5 颗紫色宝石转换为附魔宝石。有 10% 的几率获得额外回合，几率随紫色宝石数量增加而增加。 [x3]',
    build: skill(
      dmg('enemyAll', 6, 2.75, { range: 'all' }),
      // sa-R7: native CountGems is step 0 -> extra-turn chance counted before the gem change (R001).
      extraTurn({
        chance: 0.1,
        chanceBoost: { mod: { kind: 'multiplier', a: 3 }, source: { kind: 'boardGems', color: BaseColor.Purple } },
      }),
      transformToSpecial(BaseColor.Purple, 'enchantedGem', { count: 5 }),
    ),
  },
  {
    id: 9536,
    desc: '造成 [(魔法 x 1.5) + 12] 点散射伤害，因腐烂宝石数量而增强。然后将 6 颗绿宝石转换为腐烂宝石。 [x10]',
    // 裸散射 = 全体散射（§0 官方 ScatterDamage@AllEnemies 口径）
    build: skill(
      dmg('enemyAll', 12, 1.5, {
        range: 'all',
        modifier: { mod: { kind: 'multiplier', a: 10 }, source: { kind: 'boardSpecial', gem: 'decayGem' } },
      }),
      transformToSpecial(BaseColor.Green, 'decayGem', { count: 6 }),
    ),
  },
  {
    id: 9538,
    desc: '将绿色宝石转换为腐烂宝石。获得 [魔法 + 1] 攻击力和护甲，由转换的宝石数量增强。 [1:1]',
    // 修饰子句未点名类别 → 挂最近数值段=护甲段（r8 9639 先例）
    build: skill(
      transformToSpecial(BaseColor.Green, 'decayGem'),
      // Native: both IncreaseAttack and IncreaseArmor carry UseCounterForAmount (sa-R2 L4b-7634-attack).
      attack('allySelf', 1, 1, {
        modifier: { mod: { kind: 'ratio', a: 1, b: 1 }, source: { kind: 'transformedGems' } },
      }),
      armor('allySelf', 1, 1, {
        modifier: { mod: { kind: 'ratio', a: 1, b: 1 }, source: { kind: 'transformedGems' } },
      }),
    ),
  },
  {
    id: 9543,
    desc: '使敌人患病并中毒。创造 5 个骷髅，数量因腐烂宝石而增加。 [3:1]',
    build: skill(
      inflict('disease', 'enemyChosen'),
      inflict('poison', 'enemyChosen'),
      createSkulls(5, 0, {
        modifier: { mod: { kind: 'ratio', a: 3, b: 1 }, source: { kind: 'boardSpecial', gem: 'decayGem' } },
      }),
    ),
  },
  {
    id: 9656,
    desc: '制造5个邪恶石像鬼宝石和5个剧毒宝石。然后获得额外回合。',
    // 邪恶石像鬼 = gargoyleGem tier 2；剧毒宝石 = poisonGem（波A）
    build: skill(
      createSpecialGems({ kind: 'gargoyleGem', tier: 2 }, 5),
      createSpecialGems({ kind: 'poisonGem' }, 5),
      extraTurn(),
    ),
  },
  {
    id: 9724,
    desc: '对所有敌人造成[魔法 + 3]点伤害，伤害值因盟友和敌人受到祝福的数量而增强。之后将所有紫色宝石转换为天使宝石。 [x5]',
    // blessed 状态已落地（R10）；双计数相加（r11 8637 先例口径）
    build: skill(
      dmg('enemyAll', 3, 1, {
        range: 'all',
        modifier: {
          mod: { kind: 'multiplier', a: 5 },
          sources: [{ kind: 'allyStatusCount', statusId: 'blessed' }, { kind: 'enemyStatusCount', statusId: 'blessed' }],
        },
      }),
      transformToSpecial(BaseColor.Purple, 'angelGem'),
    ),
  },
  {
    id: 9772,
    desc: '对随机一名敌人造成[魔法 + 3]点伤害，伤害值因石像鬼宝石数量而增强。然后随机生成4颗石像鬼宝石。 [x2]',
    build: skill(
      dmg('enemyRandom', 3, 1, {
        modifier: { mod: { kind: 'multiplier', a: 2 }, source: { kind: 'boardSpecial', gem: 'gargoyleGem' } },
      }),
      createSpecialGems({ kind: 'gargoyleGem' }, 4),
    ),
  },
  {
    id: 9907,
    desc: '获得[魔法 + 1]点攻击力，由狼人宝石加成。然后将4颗紫色宝石转化为屏障宝石。 [x8]',
    // 屏障宝石 = barrierGem（波A）
    build: skill(
      attack('allySelf', 1, 1, {
        modifier: { mod: { kind: 'multiplier', a: 8 }, source: { kind: 'boardSpecial', gem: 'lycanthropyGem' } },
      }),
      transformToSpecial(BaseColor.Purple, 'barrierGem', { count: 4 }),
    ),
  },
  {
    id: 9933,
    desc: '对 4 个敌人造成 [(魔法 x 0.6) + 2] 点真实光溅射伤害，受狼人宝石加成。若在凛冬之境使用，则造成双倍伤害。 [x2]',
    // 真实溅射 ×4 随机 = dmgSplash trueDamage（r11 9371 先例）；MultiplyForRegion4005（凛冬之境）
    build: skill(
      dmgSplash('enemyRandomN', 2, 0.6, {
        n: 4,
        trueDamage: true,
        modifier: { mod: { kind: 'multiplier', a: 2 }, source: { kind: 'boardSpecial', gem: 'lycanthropyGem' } },
        condMult: { times: 2, cond: { kind: 'regionPresent', region: 'WintersReach' } },
      }),
    ),
  },
];

export const BATCH_R14: CuratedBatch = { batch: 'R14', spells: SPELLS, skipped: SKIPPED };
