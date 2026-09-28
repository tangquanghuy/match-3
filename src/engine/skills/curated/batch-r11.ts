/**
 * 放弃桶回收批 R11（2026-09-18）：目标措辞/条件原语族落地解锁批。
 *
 * 本批前置工作（引擎侧，均为最小扩展）：
 * - 颜色限定目标（官方 EnemyColor/AllyColor/FromManaColorEnemy）：ifCond 'targetColor'
 *   的 color 扩 'CHOSEN'（运行时取 ctx.chosenColor——「所有使用该(选定)颜色的敌人/盟友」；
 *   固定色「所有棕色盟友」等走既有 targetColor 通道零改动）。colorChooser.prototypeNeedsColor
 *   同步扩两处检测（oneOf 分支内宝石段 / ifCond 嵌套 targetColor 'CHOSEN'），AiColorChooser
 *   无随机消耗，检测扩面不改既有技能随机序列。
 * - 最常用法力色（官方 MostUsedManaEnemy/Ally）：ColorSpec 新增 'ENEMY_MOST_USED'/
 *   'ALLY_MOST_USED'，gems.mostUsedManaColor 从行动日志聚合（每次施法按 manaCost 均摊到
 *   施法者法力色计账；官方「使用最多的颜色」无逐色流水，以此确定性代理并注明）。
 * - 编队相邻（官方 AdjacentFromTarget「上方和下方的敌人」）：TargetMode 新增
 *   'enemyChosenAndAdjacent'（选定者编队前后各一位，不含选定者；邻居按编队伍索引、
 *   套下潮/隐匿过滤）。
 * - 地区/晋升度条件（官方 MultiplyForRegion4001-4010 / MultiplyForAscensionBoss）：
 *   Condition 新增 {kind:'regionPresent', region} / {kind:'ascended', min}——编译进既有
 *   condMult/ifCond；region/ascension 为模式字段，标准战斗恒 false（建模完整、惰性放置，
 *   用户裁定：晋升/魔头等模式专属内容也实现）。Boss×升华 3-5 倍 = allOf(targetRace Boss +
 *   ascended≥3)×3（倍率取官方区间下限）。
 * - 随机削减（官方 DecreaseRandom）：并行 R12 批已落 reduce stat:'random'（+times 连掷），
 *   本批直接消费（9485），不重复实现；面积形状 destroyArea('x') 亦为 R12 产出（9721 消费）。
 *
 * 本批口径：
 * - CountGems 34 = [3:1]、50 = [2:1]（Amount ≈ 100/N 取 ratio）；200/300 = ×2/×3（multiplier）。
 * - 「敌人/自身队伍使用对多」确认为「使用最多」机翻（官方步骤 MostUsedMana* 实锤）。
 * - 8658 官方「每名沮丧 ×3」按 zh 条件句取布尔近似（troopPresent），[x3] 即该计数词。
 * - 9547 石像鬼宝石善恶两口合计为一口（超集口径，注明）。
 * - 本批只收录回收成功条目；仍不可表达条目的 SKIP 记录保留在原批次文件（避免重复计数）。
 * - 纯 DecreaseRandom 条目（8684/8686/9241/9861/9514/8499/8500/9909/9640/8165/8967/9849）
 *   留给并行 R12 批按其原语组装，本批不重复认领。
 */
import type { CuratedBatch } from './index';
import {
  skill, dmg, dmgSplash, trueDmg, heal, armor, attack, magic, mana, reduce, drainMana,
  inflict, inflictRandom, createGems, createSkulls, transform, transformToSpecial,
  createSpecialGems, destroyColor, destroyRandomGems, destroyRandomCols, destroyChosenRow,
  destroyChosenCol, explodeRandomGems, explodeChosenRow, explodeRandomSpecialGems,
  destroyArea, oneOf, extraTurn, scale, flat, CHOSEN,
} from '../builders';
import { BaseColor } from '../../types';
import type { Condition, CondMult } from '../effects/secondary';

/** 「所有使用该(选定)颜色的敌人/盟友」动态色条件（R11：targetColor 扩 'CHOSEN'） */
const CHOSEN_COLOR: Condition = { kind: 'targetColor', color: 'CHOSEN' };

/** Boss×升华 3-5 倍（官方 MultiplyForAscensionBoss）：目标为 Boss 型 ∧ 施法方有晋升记录。
 *  倍率取官方区间下限 3；标准战斗 ascended 恒 false → 原值。 */
const BOSS_ASC: Condition = {
  kind: 'allOf',
  of: [{ kind: 'targetRace', race: 'Boss' }, { kind: 'ascended', min: 3 }],
};
const ASC3: CondMult = { times: 3, cond: BOSS_ASC };

/** 地区翻倍（官方 MultiplyForRegion4001-4010）：region 为模式字段，标准战斗恒 false → 原值 */
const REGION2 = (region: string): CondMult => ({ times: 2, cond: { kind: 'regionPresent', region } });

const SKIPPED: { id: number; reason: string }[] = [];

const SPELLS: CuratedBatch['spells'] = [
  {
    id: 7532,
    desc: "对一名敌人造成[魔法 + 2]点伤害并使其沉默。有50%的几率使上方和下方的敌人沉默。",
    // 「上方和下方的敌人」= enemyChosenAndAdjacent（选定者前后各一位，R11 新目标模式）；50% 几率段走段级 chance
    build: skill(
      dmg('enemyChosen', 2, 1),
      inflict('silence', 'lastTarget'),
      inflict('silence', 'enemyChosenAndAdjacent', { chance: 0.5 }),
    ),
  },
  {
    id: 7790,
    desc: "对一名敌人造成[魔法 + 4]点伤害。如果是Boss，则基于我已晋升的稀有度造成 3 到 5 倍伤害。同时沉默上方和下方的敌人。",
    // 「沉默上方和下方的敌人」= enemyChosenAndAdjacent；Boss 晋升 3-5 倍 = condMult ASC3（建模，标准战斗恒 false）
    build: skill(
      dmg('enemyChosen', 4, 1, { condMult: ASC3 }),
      inflict('silence', 'enemyChosenAndAdjacent'),
    ),
  },
  {
    id: 8180,
    desc: "摧毁所有选定颜色的宝石。所有使用此颜色的敌人都受到 [魔法 + 9]  真实伤害，耗尽所有法力值，并陷入沉默和冻结状态。",
    // DestroyColor FromTarget + FromManaColorEnemy 四段 = 选定色动态目标 ifCond targetColor CHOSEN（R11 扩展）；耗尽=drainMana
    build: skill(
      destroyColor(CHOSEN),
      trueDmg('enemyAll', 9, 1, { range: 'all', ifCond: CHOSEN_COLOR }),
      drainMana('enemyAll', { ifCond: CHOSEN_COLOR }),
      inflict('silence', 'enemyAll', { ifCond: CHOSEN_COLOR }),
      inflict('frozen', 'enemyAll', { ifCond: CHOSEN_COLOR }),
    ),
  },
  {
    id: 8465,
    desc: "对所有敌人造成 [魔法 + 1] 点伤害，伤害值因黄色宝石数而增强。赐福所有黄色盟友。 [2:1]",
    // 「赐福所有黄色盟友」= allyAll + ifCond targetColor（既有通道，R11 口径落词）；CountGems 50 = [2:1] boardGems Yellow
    build: skill(
      dmg('enemyAll', 1, 1, {
        range: 'all',
        modifier: { mod: { kind: 'ratio', a: 2, b: 1 }, source: { kind: 'boardGems', color: BaseColor.Yellow } },
      }),
      inflict('blessed', 'allyAll', { ifCond: { kind: 'targetColor', color: BaseColor.Yellow } }),
    ),
  },
  {
    id: 8477,
    desc: "给予所有棕色盟友 [魔法 + 1] 点护甲值和 3 点魔力值。创造 4 颗棕色宝石，数量因棕色盟友数而增强。 [x3]",
    // 「所有棕色盟友」= allyAll + ifCond targetColor Brown；CountArmyColor 300 = ×3 alliesOfColor Brown
    build: skill(
      armor('allyAll', 1, 1, { ifCond: { kind: 'targetColor', color: BaseColor.Brown } }),
      magic('allyAll', 3, 0, { ifCond: { kind: 'targetColor', color: BaseColor.Brown } }),
      createGems(BaseColor.Brown, 4, 0, {
        modifier: { mod: { kind: 'multiplier', a: 3 }, source: { kind: 'alliesOfColor', color: BaseColor.Brown } },
      }),
    ),
  },
  {
    id: 8525,
    desc: "移除 [魔法 + 1] 颗敌人队伍使用对多的颜色宝石。每移除一颗宝石则获得 2 点护甲值。 [x2]",
    // 「敌人队伍使用对多」机翻实锤 = MostUsedManaEnemy → ColorSpec ENEMY_MOST_USED（R11，行动日志聚合）；「每移除一颗…2 点 [x2]」= destroyedGems ×2
    build: skill(
      destroyRandomGems(1, 1, 'color', 'ENEMY_MOST_USED'),
      armor('allySelf', 2, 0, {
        modifier: { mod: { kind: 'multiplier', a: 2 }, source: { kind: 'destroyedGems' } },
      }),
    ),
  },
  {
    id: 8526,
    desc: "摧毁 [魔法 + 1] 颗敌人队伍使用对多的颜色宝石。使最强的敌人陷入织网状态。",
    // 同 8525 口径；「最强的敌人」= enemyHealthiest（按当前 hp）
    build: skill(
      destroyRandomGems(1, 1, 'color', 'ENEMY_MOST_USED'),
      inflict('web', 'enemyHealthiest'),
    ),
  },
  {
    id: 8527,
    desc: "创建 10 颗自身队伍使用对多的颜色宝石。再创建 8 颗骷髅头。",
    // 「自身队伍使用对多」= MostUsedManaAlly → ColorSpec ALLY_MOST_USED（R11）
    build: skill(
      createGems('ALLY_MOST_USED', 10, 0),
      createSkulls(8, 0),
    ),
  },
  {
    id: 8528,
    desc: "对首位和末位敌人造成 [魔法 + 3] 点真实伤害，并使他们陷入沉默状态。爆破 5 颗自身队伍使用对多的颜色宝石。",
    // 「首位和末位」= enemyFront + enemyLast（7059 先例）；爆破 5 颗 = explode 随机取自 ALLY_MOST_USED 色池
    build: skill(
      // sa-F2 fix round A (R001): native CauseSilence@FirstLastEnemies precedes TrueDamage@FirstLastEnemies
      inflict('silence', 'enemyFront'),
      inflict('silence', 'enemyLast'),
      trueDmg('enemyFront', 3, 1),
      trueDmg('enemyLast', 3, 1),
      explodeRandomGems(5, 0, 'color', 'ALLY_MOST_USED'),
    ),
  },
  {
    id: 8657,
    desc: "爆破一颗法力宝石。对所有拥有此颜色法力值的敌人造成 [魔法 + 2] 点伤害。",
    // FromManaColorEnemy 首条：「爆破一颗法力宝石」= 选定色池随机一颗（裸单颗=随机，§11）；「拥有此颜色法力值的敌人」= enemyAll + ifCond targetColor CHOSEN
    build: skill(
      explodeRandomGems(1, 0, 'color', CHOSEN),
      dmg('enemyAll', 2, 1, { range: 'all', ifCond: CHOSEN_COLOR }),
    ),
  },
  {
    id: 8658,
    desc: "摧毁敌人使用颜色最多的宝石，再消除所有敌人 3 点法力值。若队伍中有沮丧，则再消除 3 点法力值。 [x3]",
    // 「摧毁敌人使用颜色最多的宝石」= destroyColor ENEMY_MOST_USED；「若队伍中有沮丧，则再消除 3 点」= troopPresent 条件段（官方 UseCounterForAmount 每名沮丧 ×3，按 zh 条件句取布尔近似并注明）；[x3] 即该计数词
    build: skill(
      destroyColor('ENEMY_MOST_USED'),
      reduce('enemyAll', 'magic', 3, 0),
      reduce('enemyAll', 'magic', 3, 0, { ifCond: { kind: 'troopPresent', side: 'ally', name: '沮丧' } }),
    ),
  },
  {
    id: 8943,
    desc: "对一名敌人造成[魔法 + 2]点伤害，并使其获得死亡标记。有25%的几率对上下相邻的敌人也获得死亡标记。",
    // 「上下相邻的敌人」= enemyChosenAndAdjacent（R11）；25% 几率段走段级 chance
    build: skill(
      dmg('enemyChosen', 2, 1),
      inflict('death-mark', 'lastTarget'),
      inflict('death-mark', 'enemyChosenAndAdjacent', { chance: 0.25 }),
    ),
  },
  {
    id: 9244,
    desc: "将所有棕色宝石转换成黄龙宝石。给予所有黄色盟友 1 点魔力值。",
    // 「黄龙宝石」带色 → 按 ZH 色名恢复基础色全量转换（R8 8557 先例）；「所有黄色盟友」= targetColor Yellow
    build: skill(
      // DragonYellow = Yellow dragonGem special (L4b-7499-dragon).
      transformToSpecial(BaseColor.Brown, { kind: 'dragonGem', color: BaseColor.Yellow }),
      magic('allyAll', 1, 0, { ifCond: { kind: 'targetColor', color: BaseColor.Yellow } }),
    ),
  },
  {
    id: 9367,
    desc: "对 3 名随机敌人造成 [(魔法 x 0.67) + 2] 点真实溅射伤害，伤害值因燃烧宝石数而增强。若在中央尖塔内使用，则伤害翻倍。 [x2]",
    // MultiplyForRegion4001（中央尖塔）= condMult regionPresent（R11 建模，标准战斗恒 false）；燃烧宝石 = boardSpecial burningGem ×2；真实溅射 = dmgSplash trueDamage
    build: skill(
      dmgSplash('enemyRandomN', 2, 0.67, {
        n: 3,
        trueDamage: true,
        modifier: { mod: { kind: 'multiplier', a: 2 }, source: { kind: 'boardSpecial', gem: 'burningGem' } },
        condMult: REGION2('CentralSpire'),
      }),
    ),
  },
  {
    id: 9368,
    desc: "将所有选定颜色的宝石转换成末日骷髅头。对所有敌人造成 [(魔法 x 0.75) + 2] 点真实伤害。若在古盖塔使用，则伤害翻倍。",
    // 「选定颜色→末日骷髅头」= transformToSpecial(CHOSEN, doomSkull)；MultiplyForRegion4006（古代凯特）
    build: skill(
      transformToSpecial(CHOSEN, 'doomSkull'),
      trueDmg('enemyAll', 2, 0.75, { range: 'all', condMult: REGION2('AncientKhet') }),
    ),
  },
  {
    id: 9370,
    desc: "对 3 名随机敌人造成 [(魔法 x 0.6) + 2] 点真实严重溅射伤害。若在南荒使用，则伤害翻倍。摧毁一行和一列。",
    // 真实重度溅射 ×3 随机 = dmgSplash trueDamage（9881 先例）；MultiplyForRegion4003（南荒）；「摧毁一行和一列」= chosenLine 行+列共享选定格（8745 先例）
    build: skill(
      dmgSplash('enemyRandomN', 2, 0.6, { n: 3, trueDamage: true, condMult: REGION2('Southwild') }),
      destroyChosenRow(),
      destroyChosenCol(),
    ),
  },
  {
    id: 9372,
    desc: "对 4 名敌人造成 [(魔法 x 0.6) + 2] 点真实轻量溅射伤害。若在迈纳杰大区使用，则伤害翻倍。爆破 5 颗选定颜色的宝石。",
    // 「4 名敌人」步骤为 RandomEnemy → enemyRandomN n:4（zh 省略「随机」按步骤补全）；轻量溅射同 dmgSplash；MultiplyForRegion4008（玛拉吉大区）；「爆破 5 颗选定颜色的宝石」= 选定色池随机爆破
    build: skill(
      // sa-F2 fix round A (R001): native ExplodeColor 5 FromTarget precedes the four splash waves
      explodeRandomGems(5, 0, 'color', CHOSEN),
      dmgSplash('enemyRandomN', 2, 0.6, { n: 4, trueDamage: true, condMult: REGION2('MarajiExpanse') }),
    ),
  },
  {
    id: 9373,
    desc: "对所有敌人造成 [(魔法 x 0.75) + 2] 点真实伤害。若在盖赫龙使用，则伤害翻倍。给予所有其他盟友 [(魔法 x 0.75) + 2] 点生命值，数量因天使宝石数而增强。 [x2]",
    // MultiplyForRegion4004（盖赫龙）；天使宝石 = boardSpecial angelGem（波B 落地）×2
    build: skill(
      trueDmg('enemyAll', 2, 0.75, { range: 'all', condMult: REGION2('Geheron') }),
      heal('allyOthers', 2, 0.75, {
        modifier: { mod: { kind: 'multiplier', a: 2 }, source: { kind: 'boardSpecial', gem: 'angelGem' } },
      }),
    ),
  },
  {
    id: 9374,
    desc: "对一名敌人和 3 个随机敌人造成 3- [(魔法 x 1.33) + 2] 点真实随机伤害，伤害之因出血敌人数而增强。若在破碎之地使用，则伤害翻倍。 [x3]",
    // TrueRandomDamage「3 – [M×1.33]+2」= rangeSpec {min 3, max [M×1.33+2]}；「一名敌人和 3 个随机敌人」= enemyChosen + enemyRandomN n:3（9220 先例）；出血敌人 ×3；MultiplyForRegion4010（破碎之地）
    build: skill(
      trueDmg('enemyChosen', 2, 1.33, {
        rangeSpec: { min: flat(3), max: scale(2, 1.33) },
        modifier: { mod: { kind: 'multiplier', a: 3 }, source: { kind: 'enemyStatusCount', statusId: 'bleed' } },
        condMult: REGION2('BrokenLands'),
      }),
      trueDmg('enemyRandomN', 2, 1.33, {
        n: 3,
        rangeSpec: { min: flat(3), max: scale(2, 1.33) },
        modifier: { mod: { kind: 'multiplier', a: 3 }, source: { kind: 'enemyStatusCount', statusId: 'bleed' } },
        condMult: REGION2('BrokenLands'),
      }),
    ),
  },
  {
    id: 9375,
    desc: "造成 [(魔法 x 2.5) + 8] 点真实散射伤害，数量因妖仙宝石数而增强。若在夏之岛使用，则伤害翻倍。 [x2]",
    // 妖仙宝石 = boardSpecial faerieFireGem（官方步骤 Color1=FaerieFire 实锤）×2；MultiplyForRegion4009（夏之岛）
    build: skill(
      trueDmg('enemyAll', 8, 2.5, {
        range: 'all',
        modifier: { mod: { kind: 'multiplier', a: 2 }, source: { kind: 'boardSpecial', gem: 'faerieFireGem' } },
        condMult: REGION2('SummerIsle'),
      }),
    ),
  },
  {
    id: 9376,
    desc: "造成 [(魔法 x 2.5) + 8] 点真实散射伤害。若在阿达尼亚使用，则伤害翻倍。随机摧毁 3 列。",
    // MultiplyForRegion4002（阿达尼亚）；「随机摧毁 3 列」= destroyRandomCols(3)
    build: skill(
      trueDmg('enemyAll', 8, 2.5, { range: 'all', condMult: REGION2('Aidania') }),
      destroyRandomCols(3),
    ),
  },
  {
    id: 9377,
    desc: "对 5 名随机敌人造成 [(魔法 x 0.6) + 2] 点真实伤害，伤害值因冻结敌人数而增强。若在寒冬堡垒使用，则伤害翻倍。 [x3]",
    // 冻结敌人 ×3；MultiplyForRegion4005（寒冬堡垒）
    build: skill(
      trueDmg('enemyRandomN', 2, 0.6, {
        n: 5, randomWaves: 5,
        modifier: { mod: { kind: 'multiplier', a: 3 }, source: { kind: 'enemyStatusCount', statusId: 'frozen' } },
        condMult: REGION2('WintersReach'),
      }),
    ),
  },
  {
    id: 9468,
    desc: "对敌人造成 [魔法 + 4] 点伤害。如果敌人是 Boss，则基于我已晋升的稀有度造成 3 到 5 倍伤害。获得 2 点魔力值并变得愤怒。",
    // Boss 晋升 3-5 倍 = condMult ASC3（目标 Boss 型 ∧ ascended≥3，倍率取区间下限）；「变得愤怒」= enraged（R10 落地）
    build: skill(
      dmg('enemyChosen', 4, 1, { condMult: ASC3 }),
      mana('allySelf', 2, 0),
      inflict('enraged', 'allySelf'),
    ),
  },
  {
    id: 9483,
    desc: "对 3 名随机敌人造成 [(魔法 x 0.67) + 2] 点真实溅射伤害，伤害值因沙漏宝石而增强。如果在玛拉吉扩张区使用，则造成双倍伤害。 [x2]",
    // 沙漏宝石 = boardSpecial hourglass（窗口 C 落地）×2；MultiplyForRegion4008（玛拉吉扩张区）
    build: skill(
      dmgSplash('enemyRandomN', 2, 0.67, {
        n: 3,
        trueDamage: true,
        modifier: { mod: { kind: 'multiplier', a: 2 }, source: { kind: 'boardSpecial', gem: 'hourglass' } },
        condMult: REGION2('MarajiExpanse'),
      }),
    ),
  },
  {
    id: 9485,
    desc: "消除所有敌人 2 个随机技能中的 [(魔法 x 0.8) + 1] 点。如果在 Geheron 使用，效果加倍。然后造成随机负面状态效果。",
    // 「消除所有敌人 2 个随机技能中的…」= reduce stat random times:2（并行 R12 原语）；MultiplyForRegion4004（格赫隆）作用于削减；「随机负面状态」= inflictRandom（§11）
    build: skill(
      reduce('enemyAll', 'random', 1, 0.8, { times: 2, condMult: REGION2('Geheron') }),
      inflictRandom('enemyAll'),
    ),
  },
  {
    id: 9487,
    desc: "对第一个和最后一个敌人造成 [(魔法 x 1.1) + 2] 真实伤害，因中毒敌人而增强。如果在古代 Khet 使用，则造成双倍伤害。 [x3]",
    // 「第一个和最后一个敌人」= enemyFront + enemyLast；中毒敌人 ×3；MultiplyForRegion4006（古代凯特）
    build: skill(
      trueDmg('enemyFront', 2, 1.1, {
        modifier: { mod: { kind: 'multiplier', a: 3 }, source: { kind: 'enemyStatusCount', statusId: 'poison' } },
        condMult: REGION2('AncientKhet'),
      }),
      trueDmg('enemyLast', 2, 1.1, {
        modifier: { mod: { kind: 'multiplier', a: 3 }, source: { kind: 'enemyStatusCount', statusId: 'poison' } },
        condMult: REGION2('AncientKhet'),
      }),
    ),
  },
  {
    id: 9489,
    desc: "获得 [(魔法 x 0.8) + 1] 点攻击力、生命值和护甲。如果在中央尖塔中使用，效果加倍。引爆 5 颗红宝石。",
    // Gain 攻/生/甲三段各挂 region 倍率（MultiplyForRegion4001 中央尖塔）；「引爆 5 颗红宝石」= 红色池随机爆破 5
    build: skill(
      attack('allySelf', 1, 0.8, { condMult: REGION2('CentralSpire') }),
      heal('allySelf', 1, 0.8, { condMult: REGION2('CentralSpire') }),
      armor('allySelf', 1, 0.8, { condMult: REGION2('CentralSpire') }),
      explodeRandomGems(5, 0, 'color', BaseColor.Red),
    ),
  },
  {
    id: 9539,
    desc: "对敌人造成 [魔法 + 4] 点伤害，伤害值因腐烂宝石数量而增强。如果敌人是 Boss，则基于我已晋升的稀有度造成 3 到 5 倍伤害。然后将 3 颗蓝宝石转换为腐烂宝石。 [x2]",
    // 腐烂宝石 = boardSpecial decayGem（波B 落地）×2；「3 颗蓝宝石→腐烂宝石」= transformToSpecial count 3
    build: skill(
      dmg('enemyChosen', 4, 1, {
        modifier: { mod: { kind: 'multiplier', a: 2 }, source: { kind: 'boardSpecial', gem: 'decayGem' } },
        condMult: ASC3,
      }),
      transformToSpecial(BaseColor.Blue, 'decayGem', { count: 3 }),
    ),
  },
  {
    id: 9547,
    desc: "对敌人造成 [魔法 + 4] 点伤害，伤害值会因腐烂宝石和石像鬼宝石而增强。如果敌人是 Boss，则基于我已晋升的稀有度造成 3 到 5 倍伤害。 [3:1]",
    // 「腐烂宝石和石像鬼宝石」= boardSpecial decayGem + gargoyleGem（善恶合计，官方分善恶两口各 [3:1] 为超集口径并注明）
    build: skill(
      dmg('enemyChosen', 4, 1, {
        modifier: {
          mod: { kind: 'ratio', a: 3, b: 1 },
          sources: [
            { kind: 'boardSpecial', gem: 'decayGem' },
            // native CountGems 34 GoodGargoyle + 34 BadGargoyle: separate steps, one floor each (P-R4-gargoyle-tier-count)
            { kind: 'boardSpecial', gem: 'gargoyleGem', tier: 1 },
            { kind: 'boardSpecial', gem: 'gargoyleGem', tier: 2 },
          ],
        },
        condMult: ASC3,
      }),
    ),
  },
  {
    id: 9563,
    desc: "对 3 名随机敌人造成 [魔法 + 2] 真实伤害，伤害值因被附魔的盟友和敌人数量而增强。如果在星湾中使用，则造成双倍伤害。 [x3]",
    // 附魔盟友+敌人双计数各 ×3（多来源相加，8637 先例）；MultiplyForRegion4007（星湾）
    // Native 9563: RandomEnemy + 2 x RandomPrefNotPrevEnemy (R007-3: each hit only avoids the previous one; was 3 distinct).
    build: skill(
      ...(['enemyRandom', 'enemyRandomPrefNotPrev', 'enemyRandomPrefNotPrev'] as const).map(t => trueDmg(t, 2, 1, {
        modifier: {
          mod: { kind: 'multiplier', a: 3 },
          sources: [
            { kind: 'allyStatusCount', statusId: 'enchanted' },
            { kind: 'enemyStatusCount', statusId: 'enchanted' },
          ],
        },
        condMult: REGION2('BayOfStars'),
      })),
    ),
  },
  {
    id: 9570,
    desc: "将所有红色宝石转换为紫色，将所有黄色宝石转换为骷髅。为所有紫色盟友附魔，并赋予他们 [魔法 + 1] 生命和 4 魔法。",
    // 「为所有紫色盟友附魔…」= allyAll + ifCond targetColor Purple 三段（附魔 R10 落地）；黄→骷髅 = SKULL 端点
    build: skill(
      transform(BaseColor.Red, BaseColor.Purple),
      transform(BaseColor.Yellow, 'SKULL'),
      inflict('enchanted', 'allyAll', { ifCond: { kind: 'targetColor', color: BaseColor.Purple } }),
      heal('allyAll', 1, 1, { ifCond: { kind: 'targetColor', color: BaseColor.Purple } }),
      magic('allyAll', 4, 0, { ifCond: { kind: 'targetColor', color: BaseColor.Purple } }),
    ),
  },
  {
    id: 9598,
    desc: "对敌人造成 [魔法 + 4] 点伤害。如果敌人是 Boss，则基于我已晋升的稀有度造成 3 到 5 倍伤害。然后将 6 颗绿宝石转换为诅咒宝石。",
    // 诅咒宝石 = transformToSpecial curseGem（波A 落地）count 6
    build: skill(
      dmg('enemyChosen', 4, 1, { condMult: ASC3 }),
      transformToSpecial(BaseColor.Green, 'curseGem', { count: 6 }),
    ),
  },
  {
    id: 9606,
    desc: "对一名敌人造成 [魔法 + 4] 点伤害，伤害值因沉没宝石数量而增强。如果敌人是 Boss，则基于我已晋升的稀有度造成 3 到 5 倍伤害。然后创造 4 颗沉没宝石。 [x2]",
    // 沉没宝石 = boardSpecial submergeGem（波A 落地）×2；创造 4 颗 = createSpecialGems
    build: skill(
      dmg('enemyChosen', 4, 1, {
        modifier: { mod: { kind: 'multiplier', a: 2 }, source: { kind: 'boardSpecial', gem: 'submergeGem' } },
        condMult: ASC3,
      }),
      createSpecialGems({ kind: 'submergeGem' }, 4),
    ),
  },
  {
    id: 9646,
    desc: "对4名随机敌人造成[(魔法 x 0.7) + 2]真实伤害，伤害值因被激怒的盟友和敌人数量而增强。在破碎之地使用时，造成双倍伤害。 [x2]",
    // 激怒盟友+敌人双计数 ×2（9727 先例）；MultiplyForRegion4010（破碎之地）
    // Native 9646: RandomEnemy + 3 x RandomPrefNotPrevEnemy (R007-3: each hit only avoids the previous one; was 4 distinct).
    build: skill(
      ...(['enemyRandom', 'enemyRandomPrefNotPrev', 'enemyRandomPrefNotPrev', 'enemyRandomPrefNotPrev'] as const).map(t => trueDmg(t, 2, 0.7, {
        modifier: {
          mod: { kind: 'multiplier', a: 2 },
          sources: [
            { kind: 'allyStatusCount', statusId: 'enraged' },
            { kind: 'enemyStatusCount', statusId: 'enraged' },
          ],
        },
        condMult: REGION2('BrokenLands'),
      })),
    ),
  },
  {
    id: 9648,
    desc: "对所有敌人造成[(魔法 x 0.8) + 2]真实伤害。在南荒使用时，造成双倍伤害。然后将6颗黄宝石转换为绿龙宝石。",
    // MultiplyForRegion4003（南荒）；「6 颗黄宝石→绿龙宝石」带色 → 基础色转换 count 6（R8 8830 先例）
    build: skill(
      trueDmg('enemyAll', 2, 0.8, { range: 'all', condMult: REGION2('Southwild') }),
      transform(BaseColor.Yellow, BaseColor.Green, { count: 6 }),
    ),
  },
  {
    id: 9668,
    desc: "对一名敌人造成[魔法 + 4]点伤害，伤害值因敌人攻击力而增强。如果敌人是Boss，则基于我已晋升的稀有度造成 3 到 5 倍伤害。 [3:1]",
    // 「因敌人攻击力而增强」= targetStat attack [3:1]（CountAttack 34 = 每 3 点 +1）
    build: skill(
      dmg('enemyChosen', 4, 1, {
        modifier: { mod: { kind: 'ratio', a: 3, b: 1 }, source: { kind: 'targetStat', stat: 'attack' } },
        condMult: ASC3,
      }),
    ),
  },
  {
    id: 9669,
    desc: "选择一颗法力宝石。摧毁所有该颜色的宝石，并对所有使用该法力颜色的敌人造成 [魔法 + 3] 点伤害，伤害值因摧毁的宝石数量而增强。 [3:1]",
    // 「选择一颗法力宝石…该颜色」≈ 选定色（ColorChooser 承担选择，等价口径）；「所有使用该法力颜色的敌人」= ifCond targetColor CHOSEN；[3:1] 摧毁宝石数 = destroyedGems
    build: skill(
      destroyColor(CHOSEN),
      dmg('enemyAll', 3, 1, {
        range: 'all',
        ifCond: CHOSEN_COLOR,
        modifier: { mod: { kind: 'ratio', a: 3, b: 1 }, source: { kind: 'destroyedGems' } },
      }),
    ),
  },
  {
    id: 9676,
    desc: "对一名敌人造成[魔法 + 4]点伤害。如果是Boss，则基于我已晋升的稀有度造成 3 到 5 倍伤害。然后引爆3个末日骷髅。",
    // 「引爆 3 个末日骷髅」= explodeRandomSpecialGems doomSkull（R9 起可表达）
    build: skill(
      dmg('enemyChosen', 4, 1, { condMult: ASC3 }),
      explodeRandomSpecialGems('doomSkull', 3),
    ),
  },
  {
    id: 9719,
    desc: "对3名随机敌人造成[(魔法 x 0.6) + 2]点真实重度溅射伤害，伤害值因屏障石数量而增强。在艾达尼亚使用时，伤害加倍。 [x2]",
    // 屏障宝石 = boardSpecial barrierGem（波A 落地）×2；MultiplyForRegion4002（艾达尼亚）
    build: skill(
      dmgSplash('enemyRandomN', 2, 0.6, {
        n: 3,
        trueDamage: true,
        modifier: { mod: { kind: 'multiplier', a: 2 }, source: { kind: 'boardSpecial', gem: 'barrierGem' } },
        condMult: REGION2('Aidania'),
      }),
    ),
  },
  {
    id: 9721,
    desc: "对5名随机敌人造成[(魔法 x 0.6) + 2]真实伤害。在星湾使用时，造成双倍伤害。摧毁X形宝石。",
    // 「摧毁X形宝石」= destroyArea x（并行 R12 面积原语）；MultiplyForRegion4007（星湾）
    build: skill(
      // sa-F2 fix round A (R001): native DestroyGems (X shape) precedes the five true-damage waves
      destroyArea('x', 'destroy'),
      trueDmg('enemyRandomN', 2, 0.6, { n: 5, randomWaves: 5, condMult: REGION2('BayOfStars') }),
    ),
  },
  {
    id: 9733,
    desc: "对一名敌人造成[魔法 + 4]点伤害，伤害值因黄色和紫色宝石数量而增强。如果敌人是Boss，则基于我已晋升的稀有度造成 3 到 5 倍伤害。 [3:1]",
    // 「黄色和紫色宝石数量」双计数各 [3:1]（CountGems 34 ×2）→ ratio 多来源相加
    build: skill(
      dmg('enemyChosen', 4, 1, {
        modifier: {
          mod: { kind: 'ratio', a: 3, b: 1 },
          sources: [
            { kind: 'boardGems', color: BaseColor.Yellow },
            { kind: 'boardGems', color: BaseColor.Purple },
          ],
        },
        condMult: ASC3,
      }),
    ),
  },
  {
    id: 9741,
    desc: "对一名敌人造成[魔法 + 4]点伤害。如果对方是Boss，则基于我已晋升的稀有度造成 3 到 5 倍伤害。沉默第一名敌人。",
    // MultiplyForRegion 见 9468 口径；「沉默第一名敌人」= enemyFront
    build: skill(
      dmg('enemyChosen', 4, 1, { condMult: ASC3 }),
      inflict('silence', 'enemyFront'),
    ),
  },
  {
    id: 9808,
    desc: "对所有敌人造成[(魔法 x 0.75) + 2]点真实伤害，受到其他友方和受祝福的敌人的加成。在夏日岛使用时，伤害翻倍。 [x1.5]",
    // 「其他友方和受祝福的敌人」= blessed 盟友+敌人双计数 ×1.5（盟友侧含自身为超集，官方 AllAlliesButNotSelf）；MultiplyForRegion4009（夏日岛）
    build: skill(
      trueDmg('enemyAll', 2, 0.75, {
        range: 'all',
        modifier: {
          mod: { kind: 'multiplier', a: 1.5 },
          sources: [
            // native CountSpecificStatusEffect@AllAlliesButNotSelf (P-R3-ally-status-excl-self)
            { kind: 'allyStatusCount', statusId: 'blessed', excludeSelf: true },
            { kind: 'enemyStatusCount', statusId: 'blessed' },
          ],
        },
        condMult: REGION2('SummerIsle'),
      }),
    ),
  },
  {
    id: 9810,
    desc: "获得 [(魔法 x 0.8) + 1] 点攻击力、生命值和护甲值，数值因缠绕宝石和被缠绕的敌人数量而增强。在南方荒野使用，效果翻倍。 [x2]",
    // 「缠绕宝石和被缠绕的敌人数量」= boardSpecial entangleGem + enemyStatusCount entangle 双来源 ×2；Gain 三段；MultiplyForRegion4003（南方荒野）
    build: skill(
      attack('allySelf', 1, 0.8, {
        modifier: {
          mod: { kind: 'multiplier', a: 2 },
          sources: [
            { kind: 'boardSpecial', gem: 'entangleGem' },
            { kind: 'enemyStatusCount', statusId: 'entangle' },
          ],
        },
        condMult: REGION2('Southwild'),
      }),
      heal('allySelf', 1, 0.8, {
        modifier: {
          mod: { kind: 'multiplier', a: 2 },
          sources: [
            { kind: 'boardSpecial', gem: 'entangleGem' },
            { kind: 'enemyStatusCount', statusId: 'entangle' },
          ],
        },
        condMult: REGION2('Southwild'),
      }),
      armor('allySelf', 1, 0.8, {
        modifier: {
          mod: { kind: 'multiplier', a: 2 },
          sources: [
            { kind: 'boardSpecial', gem: 'entangleGem' },
            { kind: 'enemyStatusCount', statusId: 'entangle' },
          ],
        },
        condMult: REGION2('Southwild'),
      }),
    ),
  },
  {
    id: 9839,
    desc: "对 3 个随机敌人造成 [魔法 + 2] 点真实伤害，受许愿宝石加成。若在破碎之地使用，则造成双倍伤害。然后获得额外回合。 [x2]",
    // 许愿宝石 = boardSpecial wish（窗口 C 落地）×2；MultiplyForRegion4010（破碎之地）；「获得额外回合」
    build: skill(
      trueDmg('enemyRandomN', 2, 1, {
        n: 3,
        modifier: { mod: { kind: 'multiplier', a: 2 }, source: { kind: 'boardSpecial', gem: 'wish' } },
        condMult: REGION2('BrokenLands'),
      }),
      extraTurn(),
    ),
  },
  {
    id: 9841,
    desc: "造成[(魔法 x 2.5) + 8]点真实散射伤害，受蛛网宝石加成。若在格赫隆使用，则造成双倍伤害。 [x2]",
    // 蛛网宝石 = boardSpecial web（R9 419 先例）×2；MultiplyForRegion4004（格赫隆）
    build: skill(
      trueDmg('enemyAll', 8, 2.5, {
        range: 'all',
        modifier: { mod: { kind: 'multiplier', a: 2 }, source: { kind: 'boardSpecial', gem: 'web' } },
        condMult: REGION2('Geheron'),
      }),
    ),
  },
  {
    id: 9935,
    desc: "对 3 个随机敌人造成 [(魔法 x 0.67) + 2] 点真实溅射伤害。若在中央尖塔内使用，则造成双倍伤害。引爆一排敌人。",
    // 「真实溅射」= TrueSplashHighDamage → dmgSplash trueDamage；MultiplyForRegion4001（中央尖塔）；「引爆一排」= explodeChosenRow（裸行列=选定，batch-r7 先例）
    build: skill(
      dmgSplash('enemyRandomN', 2, 0.67, { n: 3, trueDamage: true, condMult: REGION2('CentralSpire') }),
      explodeChosenRow(),
    ),
  },
  {
    id: 9956,
    desc: "选择一颗魔法宝石。消除所有该颜色敌人的[魔法 + 1]点攻击力。然后将所有该颜色的宝石转化为紫色宝石或恐惧宝石。",
    // 「消除所有该颜色敌人的攻击」= reduce attack + ifCond targetColor CHOSEN；「转化为紫色宝石或恐惧宝石」= oneOf 二选一（§9.3）；恐惧宝石 = terrorGem（波A 落地）
    build: skill(
      reduce('enemyAll', 'attack', 1, 1, { ifCond: CHOSEN_COLOR }),
      oneOf([transform(CHOSEN, BaseColor.Purple)], [transformToSpecial(CHOSEN, 'terrorGem')]),
    ),
  },
  {
    id: 9982,
    desc: "对 3 个随机敌人造成 [魔法] 点真实伤害。若在玛拉吉广袤区域使用，则造成双倍伤害。有 20% 的几率击杀一个随机敌人，每有一个敌人被死亡标记，击杀几率额外提高 2%。 [x2]",
    // 「击杀一个随机敌人，每死亡标记敌人 +2% 几率」= execute + chance 0.2 + chanceBoost（§11 追加口径）
    build: skill(
      trueDmg('enemyRandomN', 0, 1, { n: 3, condMult: REGION2('MarajiExpanse') }),
      dmg('enemyRandom', 0, 0, {
        execute: true,
        chance: 0.2,
        chanceBoost: { mod: { kind: 'multiplier', a: 0.02 }, source: { kind: 'enemyStatusCount', statusId: 'death-mark' } },
      }),
    ),
  },
];

export const BATCH_R11: CuratedBatch = { batch: 'R11', spells: SPELLS, skipped: SKIPPED };
