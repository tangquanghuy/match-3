/**
 * 人工核对组装 · 批次 30（池：scripts/curated-pools/pool-30.json）
 * 核对者：agent 批次30
 *
 * 语义裁定备注：
 * - 「移除所有指定颜色的宝石以增强效果」（7146）：清除段前置，destroyedGems 来源才数得到
 *   （batch-04 7002 口径）；来源不带色筛选，色限定由 destroyColor(CHOSEN) 承担（batch-04 头注）。
 * - 「所有技能值」按技能值域（攻/甲/血/魔）拆 4 个增益段（batch-05 7165 口径）；
 *   一个方括号喂多段共用同一缩放（batch-04 9667 / batch-05 7256 同款）。
 * - 双属性/双创造段共用一个 modifier 子句 → modifier 挂最近数值段（batch-15 8614 / batch-04 7027 口径）。
 * - 「每摧毁一颗X宝石则耗掉 N 点法力值」：常数 N 为基础、[xN] 每来源叠加
 *   （batch-21 8167「每摧毁一颗黄色宝石则爆破 2 颗」同款）。
 * - 「陷入法力燃烧状态」（8897）= 清蓝语义 drainMana（spell-rules.md §3「法力燃烧」行）。
 * - 「魔力值」= magic 属性、「法力值」= mana 资源（SOP 措辞裁定）。
 * - 「宝石」不含骷髅（GoW 术语），随机宝石段 include:'color'。
 * - GOBLINS / ORCS 常量 = SOP §6 查询命令对 troops.json 按 troopTypes 过滤的程序核实结果
 *   （含三体合一种 'Murk,Lurk,AndDurk'，referenceName 真实存在）。
 * - 「若在X王国/地点使用则翻倍」= 王国条件倍率 → SKIP（batch-23 9376 同款）。
 */
import { chooseSkill, skill, dmg, dmgAll, trueDmg, heal, armor, attack, magic, mana,
  reduce, createGems, createMix, destroyColor, destroyChosenRow,
  destroyChosenCol, explodeRandomGems, explodeSkulls, inflict, summonRandom, extraTurn, CHOSEN } from '../builders';
import { BaseColor } from '../../types';
import type { CuratedBatch } from './index';

/** troopTypes 含 Goblin 的全部兵种 referenceName（SOP §6 查询命令得出） */
const GOBLINS = [
  'Goblin', 'GoblinShaman', 'BoarRider', 'GoblinKing', 'Hobgoblin', 'GoblinRocket',
  'NobendBrothers', 'SirSnothelm', 'Bugbear', 'PrincessFizzbang', 'QueenGrapplepot',
  'Hellcackle', 'IceGoblin', 'HighKingIrongut', 'KingGobtruffle', 'Stringfiddler',
  'Toadsqueezer', 'Goblette', 'Rogueling', 'Smashedmouth', 'Kobold', 'KoboldKnight',
  'KoboldMagi', 'Emperinazara', 'Fundingus', 'WilliTheAnchor', 'FlamingOni',
  'FaerieGobmother', 'GoblinBomber', 'KoboldEmissary', 'PriestOfNilbog', 'FrostfireGoblin',
  'Slughoarder', 'BombRider', 'CinderhandGoblin', 'Murk,Lurk,AndDurk', 'Gloomhob',
  'KoboldThief', 'GoblinPickpocket', 'MokTheCannon-Rider', 'Skulker', 'ZargsBoomPile',
  'CountGobula', 'LordGobthe', 'ImmortalTrogolin',
];

/** troopTypes 含 Orc 的全部兵种 referenceName（SOP §6 查询命令得出） */
const ORCS = [
  'Orc', 'Summoner', 'Cyclops', 'DrakeRider', 'DarkSong', 'GarNok', 'FelDras', 'Bugbear',
  'Ogryn', 'OrcVeteran', 'Gargantaur', 'SolZara', 'VorKarn', 'FistOfZorn', 'BorGakk',
  'ShadeOfZorn', 'GorThrum', 'FirstMateAxelubber', 'BrawlmasterBurNakh', 'WarDrok',
  'TuskRaider', 'RokGarTheGuardian', 'Pyrophemus', 'TrkNala', 'EyeOfArges', 'MouthOfZorn',
  'OrcRogue', 'MazeCyclops', 'DaeDrak', 'ImmortalAngRak', 'KragRaxBloodskull', 'MorZarn',
  'Warfang', 'Shargral',
];

const SKIPPED: { id: number; reason: string }[] = [
  { id: 7523, reason: '缺失状态（狂怒：「每摧毁一颗紫色宝石，则赋予一名随机盟友狂怒状态」，batch-01 7740 同款）' },
  { id: 7652, reason: '语义拿不准（「施放法力灼烧，伤害值因自身魔力值而增强」batch-19 7328 同款）；「把这两名敌人推到后方」隐匿/位置操作亦不做' },
  { id: 8060, reason: '二次缩放来源不支持（「创造与此色宝石数等量的红色宝石」需按选定色计棋盘宝石，boardGems 来源 color 仅支持 BaseColor、不支持 CHOSEN）' },
  { id: 8204, reason: '二次缩放来源不支持（「因绿色的敌人和盟友数而增强」敌方侧无按色计数 kind，batch-24 9563 同款）' },
  { id: 8460, reason: '语义拿不准（「再获得一个额外回合或召唤另一名科博」二选一分支无法表达，batch-05 7277 同款）' },
  { id: 8585, reason: '句子式不明（「爆破 3x3 阵型的宝石」无对应面积清除原语，batch-15 8541 同款）；「每爆破一颗骷髅头则赋予屏障」逐来源重复施加状态亦无原语（batch-28 8885 同款）' },
  { id: 8605, reason: '语义拿不准（「制作1-3瓶棕色法力药水」制作物无对应宝石原语，batch-22 8602 / batch-24 9613 同款）；「1-3瓶」数量区间亦无原语' },
  { id: 8606, reason: '数值不明（「对1-3名随机敌人下毒」数量区间无法表达，batch-04 9710 同款）；「绿色法力药水」「被网勾住」条件触发亦无原语' },
  { id: 8658, reason: '语义拿不准（「摧毁敌人使用颜色最多的宝石」动态颜色，batch-04 8819 同款）；「若队伍中有沮丧」条件触发亦无原语' },
  { id: 8659, reason: '语义拿不准（「一名敌人和其上位的敌人」复合/位置目标，batch-05 7229 同款）' },
  { id: 8663, reason: '二次缩放来源不支持（「因身亡的地人数而增强」阵亡计数无对应来源 kind）' },
  { id: 8785, reason: '特殊宝石（元素星，batch-03 8627 同款）' },
  { id: 9006, reason: '特殊宝石（「x3 通配符卡牌」，batch-10 8963 同款）' },
  { id: 9049, reason: '召唤物无法解析（「召唤一颗水晶龙蛋」：troops.json 无此 referenceName，仅有「水晶蛋 CrystalEggs」/「龙蛋 DragonEggs」，禁止凭印象写）' },
  { id: 9060, reason: '缺失状态（恐怖：「每摧毁一颗蓝色宝石，则使一名敌人陷入恐怖状态」，batch-21 8189 同款）' },
  { id: 9166, reason: '二次缩放来源不支持（「因恐怖宝石数而增强」，恐怖宝石为特殊宝石，batch-04 9164 同款）' },
  { id: 9181, reason: '数值不明（「给予所有其他盟友 3-10 点法力值」随机数值区间无原语）' },
  { id: 9371, reason: '语义拿不准（「使其下方敌受到其所受伤害的一半」位置目标/伤害回显无原语，batch-04 9258 同款）；「若在星星湾使用」王国条件（batch-23 9376 同款）、「蓝龙宝石」来源（特殊宝石）亦不支持' },
  { id: 9374, reason: '伤害区间（「3- [(魔法 x 1.33) + 2] 点真实随机伤害」）；「若在破碎之地使用」王国条件亦不支持（batch-23 9376 同款）' },
  { id: 9487, reason: '语义拿不准（「如果在古代 Khet 使用，则造成双倍伤害」王国条件倍率，batch-23 9376 同款）' },
  { id: 9539, reason: '晋升度条件（「如果敌人是 Boss，则基于我已晋升的稀有度造成 3 到 5 倍伤害」，batch-20 7790 同款）' },
  { id: 9565, reason: '语义拿不准（「如果在 Winter\'s Reach 中使用，效果加倍」王国条件倍率，batch-23 9376 同款）' },
  { id: 9599, reason: '特殊宝石（冰冻宝石/精灵火宝石，batch-24 9587 冰冻宝石同款）' },
  { id: 9716, reason: '语义拿不准（「如果敌人死亡，则获得伤害值增加三倍」：死亡后增益条件不在 condMult 条件域（无 targetDied 条件，ifTargetDied 仅辖后段动作），译文句式本身亦不明）' },
  { id: 9948, reason: '晋升度条件（「如果敌人是防御塔，则基于我已晋升的稀有度造成 3 到 5 倍伤害」，batch-24 9746 同款）' },
];

const SPELLS: CuratedBatch['spells'] = [
  {
    id: 7146,
    desc: '获得 8 点生命值，并移除所有指定颜色的宝石以增强效果。召唤一名随机哥布林。获得一个额外回合。 [2:1]',
    build: skill(
      // 「移除…以增强」句式：清除段前置，destroyedGems 来源才数得到（batch-04 7002 同款）；
      // 来源不带色筛选，色限定由 destroyColor(CHOSEN) 承担（batch-04 头注口径）
      destroyColor(CHOSEN),
      heal('allySelf', 8, 0, { modifier: { mod: { kind: 'ratio', a: 2, b: 1 }, source: { kind: 'destroyedGems' } } }),
      summonRandom(GOBLINS),
      extraTurn(),
    ),
  },
  {
    id: 7237,
    desc: '对所有盟友造成 1 点真实伤害，然后创造 7 颗红色宝石和 7 颗棕色宝石，创造的宝石数因兽人盟友数而增强。召唤一名随机兽人。 [1:1]',
    build: skill(
      trueDmg('allyAll', 1, 0),
      createGems(BaseColor.Red, 7, 0),
      // 「创造的宝石数因兽人盟友数而增强」：modifier 挂最近创造段（batch-15 8614 口径）
      createGems(BaseColor.Brown, 7, 0, { modifier: { mod: { kind: 'ratio', a: 1, b: 1 }, source: { kind: 'alliesOfRace', race: 'Orc' } } }),
      summonRandom(ORCS),
    ),
  },
  {
    id: 7404,
    desc: '创造 15 颗宝石，所创造的宝石混合蓝色和一种选定类型。所有其他盟友获得 [(魔法 / 2) + 1] 点生命值和攻击力，点数因被冻结的敌军数量而增强。 [x4]',
    build: skill(
      createMix([BaseColor.Blue, CHOSEN], 15),
      heal('allyOthers', 1, 0.5),
      // 「点数因被冻结的敌军数量而增强」双属性共用 modifier → 挂最近数值段（batch-15 8614 同款）
      attack('allyOthers', 1, 0.5, { modifier: { mod: { kind: 'multiplier', a: 4 }, source: { kind: 'enemyStatusCount', statusId: 'frozen' } } }),
    ),
  },
  {
    id: 7406,
    desc: '创造 15 颗宝石，所创造的宝石混合红色和一种选定类型。所有其他盟友获得 [(魔法 / 2) + 4] 点攻击力，点数因陷入燃烧状态的敌军数量而增强。 [x4]',
    build: skill(
      createMix([BaseColor.Red, CHOSEN], 15),
      attack('allyOthers', 4, 0.5, { modifier: { mod: { kind: 'multiplier', a: 4 }, source: { kind: 'enemyStatusCount', statusId: 'burning' } } }),
    ),
  },
  {
    id: 7595,
    desc: '摧毁 1 行。获得 [(魔法 / 2) + 1] 点护甲值和攻击力，点数因被摧毁的红色宝石数而增强。获得屏障效果。 [x2]',
    build: skill(
      destroyChosenRow(),
      armor('allySelf', 1, 0.5),
      // 行清除混色 → 来源筛红色（batch-16 8792 同款）；modifier 挂最近数值段（batch-15 8614 同款）
      attack('allySelf', 1, 0.5, { modifier: { mod: { kind: 'multiplier', a: 2 }, source: { kind: 'destroyedGems', color: BaseColor.Red } } }),
      inflict('barrier', 'allySelf'),
    ),
  },
  {
    id: 8306,
    desc: '对一名敌人造成 [魔法 + 1] 点真实伤害。若敌人已中毒，则造成双倍伤害。再对他造成 [魔法 + 1] 点真实伤害。若敌人被击晕，则造成双倍伤害。',
    build: skill(
      // 回收：condMult 现支持 targetStatus 条件倍率（batch-05 7330 同款）；两段各挂各自条件
      trueDmg('enemyChosen', 1, 1, { condMult: { times: 2, cond: { kind: 'targetStatus', statusId: 'poison' } } }),
      trueDmg('enemyChosen', 1, 1, { condMult: { times: 2, cond: { kind: 'targetStatus', statusId: 'stun' } } }),
    ),
  },
  {
    id: 8589,
    desc: '摧毁一列。每摧毁一颗紫色宝石则耗掉首位敌人 4 点法力值。获得屏障效果。 [x4]',
    build: skill(
      destroyChosenCol(),
      // 「每摧毁一颗X宝石则耗掉 N 点法力值」：常数 N 为基础、[x4] 每来源叠加（batch-21 8167 同款）
      reduce('enemyFront', 'mana', 4, 0, { modifier: { mod: { kind: 'multiplier', a: 4 }, source: { kind: 'destroyedGems', color: BaseColor.Purple } } }),
      inflict('barrier', 'allySelf'),
    ),
  },
  {
    id: 8856,
    desc: '&& 对 3 名随机敌人造成 [(魔法 / 2) + 2] 点伤害 && 消除 3 名随机敌人 3 点魔力值',
    build: skill(chooseSkill(['三名随机敌人受到伤害', '削减三名随机敌人各三点魔法'], [dmg('enemyRandomN', 2, 0.5, { n: 3 })], [reduce('enemyRandomN', 'magic', 3, 0, { n: 3 })])),
  },
  {
    id: 8858,
    desc: '&& 摧毁所有紫色宝石，并对前 2 名敌人造成 [魔法 + 4] 点伤害 && 创建 12 颗紫色宝石并对末 2 位敌人造成 [魔法 + 4] 点伤害',
    build: skill(chooseSkill(['摧毁全部紫色宝石，对前两名敌人造成［魔法＋4］伤害', '创造12颗紫色宝石，对末两名敌人造成［魔法＋4］伤害'], [destroyColor(BaseColor.Purple), dmg('enemyFirstN', 4, 1, { n: 2, range: 'all' })], [createGems(BaseColor.Purple, 12, 0), dmg('enemyLastN', 4, 1, { n: 2, range: 'all' })])),
  },
  {
    id: 8897,
    desc: '&& 爆破 [魔法 + 1] 颗紫色宝石。&&  使首 2 位敌人陷入法力燃烧状态。',
    build: skill(chooseSkill(['爆破紫色宝石', '前两名敌人法力燃烧'], [explodeRandomGems(1, 1, 'color', BaseColor.Purple)], [dmg('enemyFirstN', 0, 1, { n: 2, manaBurn: true })])),
  },
  {
    id: 9401,
    desc: '&& 给予所有盟友 8 点法力值和屏障效果 && 给予所有其他盟友 [(魔法 x 0.75) + 1] 所有技能值',
    build: skill(chooseSkill(["所有盟友获得8法力及屏障","其他盟友获得［魔法×0.75＋1］所有属性"], [mana('allyAll', 8, 0), inflict('barrier', 'allyAll')], [attack('allyOthers', 1, 0.75), armor('allyOthers', 1, 0.75), heal('allyOthers', 1, 0.75), magic('allyOthers', 1, 0.75)])),
  },
  {
    id: 9521,
    desc: '对所有敌人造成 [(魔法 x 3.25) + 6] 点伤害。引爆所有骷髅。有 10% 的几率额外进行一回合，几率随引爆骷髅数而增加。 [x4]',
    build: skill(
      dmgAll(6, 3.25),
      explodeSkulls(),
      // 回收：chanceBoost 现支持概率加成；「随引爆骷髅数」= destroyedGems 不筛色——
      // 本技能只有引爆骷髅一个清除段，计数恰为引爆骷髅数（batch-29 7352 只清骷髅口径）
      extraTurn({ chance: 0.1, chanceBoost: { mod: { kind: 'multiplier', a: 4 }, source: { kind: 'destroyedGems' } } }),
    ),
  },
];

export const BATCH_30: CuratedBatch = { batch: '30', spells: SPELLS, skipped: SKIPPED };
