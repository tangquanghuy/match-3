/**
 * 人工核对组装 · 批次 20（池：scripts/curated-pools/pool-20.json）
 * 核对者：agent 批次20
 *
 * 语义裁定备注：
 * - 「将板面上的X宝石数翻倍。再创造 3 颗X宝石。[1:1]」（7508/7584/7634）照 batch-12 7258 /
 *   batch-19 7315/7381 口径：createGems(3) + [1:1] boardGems（创造 3+板面数 = 翻倍后再造 3，
 *   行为精确等价）。
 * - 「创造等同于板面上蓝色和棕色宝石数的混合宝石 [1:1]」（7765）= batch-14 8251 精确同款：
 *   base 0 + sources 计数相加。
 * - 一个方括号喂双段（7477「护甲值和生命值」）= batch-05 7152 / batch-03 8372 同款；
 *   modifier 挂最近数值段（batch-05 7334 / batch-14 8297 / batch-15 8614 口径）。
 * - 「魔法值」= magic 属性、「法力值」= mana（SOP 措辞裁定；7503/7551 同口径）。
 * - 「最强大的敌人」= enemyHealthiest（spell-rules.md §0 / batch-14 头注）；
 *   「最强大的两名敌人」= enemyHealthiestN + { n: 2 }。
 * - 「杀掉一名敌人」= execute（batch-03 7789「处死」同款）；「所有剩余的敌人」（7723）=
 *   击杀后存活者 → enemyAll（targeting 排除阵亡，阵亡者不入选，请复核）。
 * - 「若有一名敌人身亡」= spell-rules.md §4 死亡条件家族（batch-12 7225/7273/7335「如果(有)
 *   敌人身亡」同款），挂最近产目标段判定。
 * - 「宝石」不含骷髅（随机宝石段 include:'color'）；「创造 12 颗骷髅头」为骷髅（createSkulls）。
 * - 种族/召唤物经 troops.json 程序核实（SOP §6 命令）：神祇=Divine（主教 6351 troopTypes
 *   Divine/Human，batch-17「神圣=Divine」同族）、矮人=Dwarf、巨人=Giant（troopTypes 全集）、
 *   沙地眼镜蛇=SandCobra(6229)。
 * - 「随机蜘蛛」（7533）无对应 troopType（种族全集无 Spider），按名圈定混入 蛛网王子 等
 *   非蜘蛛成员、家族边界无法程序核实 → 召唤物无法解析 SKIP。
 */
import { skill, dmg, dmgAll, dmgSplash, trueDmg, heal, armor, magic, mana,
  cleanse, reduce, inflict, createGems, createMix, createSkulls, createSpecialGems,
  transform, destroyChosenRow, destroyChosenCol, explodeRandomGems, summonRef,
  summonRandom, extraTurn, CHOSEN } from '../builders';
import { BaseColor } from '../../types';
import type { CuratedBatch } from './index';

/** troopTypes 含 Giant 的全部兵种 referenceName（SOP §6 查询命令得出） */
const GIANTS = [
  'Ogre', 'Ettin', 'StoneGiant', 'FrostGiant', 'Berserker',
  'JarlFiremantle', 'Elf-Eater', 'Cyclops', 'Zephyros', 'Gob-Chomper',
  'SeaTroll', 'DragonCruncher', 'RockTroll', 'DarkTroll', 'GogAndGud',
  'JotnarStormshield', 'Ogryn', 'DesertTroll', 'ForestTroll', 'FireGiant',
  'MonsterMuncher', 'FlameTroll', 'SkrymirTheLofty', 'HyndlaFrostcrown', 'IceTroll',
  'Igneus', 'HalfgrimHalf-Giant', 'Sledgepaw', 'LavaTroll', 'Stone-Biter',
  'CorruptTroll', 'Fomorian', 'FrostfireTroll', 'CrazedTroll', 'OgrakShaman',
  'Bone-Biter', 'IllithianColossus', 'Smashedmouth', 'StormKnight', 'FlameMaiden',
  'Kharybdis', 'Ogress', 'Baldr', 'VidarrTheVast', 'IcespireShaman',
  'DarkForestTroll', 'TheOnyxGiant', 'TheSapphireGiant', 'TheEmeraldGiant', 'TheRubyGiant',
  'TheAmethystGiant', 'TheTopazGiant', 'TheUmbralGiant', 'TheGraveGiant', 'Ogretaur',
  'GiantSentinel', 'EarthGiant', 'Jordrin', 'Kolfrysti', 'Jarnvisa',
  'GhostOgre', 'MazeCyclops', 'GrimbornBloodeye', 'HeldrTheGrave', 'Polymetis',
  'SteamTroll', 'ScoriaGiant-born', 'VenomousTroll', 'LavaEttin', 'AbominableTroll',
  'StormOracle', 'ToxAndSion', 'StormGuard', 'AsbjornTheMountain',
];

const SKIPPED: { id: number; reason: string }[] = [
  { id: 7483, reason: '句子式不明（「造成散射伤害」未指明目标，batch-11 9471 / batch-12 7353 同款；「棕色敌军数量」敌方侧颜色计数亦无对应 kind）' },
  { id: 7506, reason: '语义拿不准（「伤害值因其他盟友的魔法值而增强」来源口径无法裁定：allyStatSum 为己方全体含自身，手册未覆盖「其他盟友」句式，batch-13 7436 同款）' },
  { id: 7511, reason: '伤害区间（[(魔法/2)+6] – [魔法+13] 到 {2}）；「如果自身攻击力较高」属性比较条件亦不支持' },
  { id: 7533, reason: '召唤物无法解析（「随机蜘蛛」无对应 troopType，按名圈定混入 蛛网王子 等非蜘蛛成员，家族边界无法程序核实）' },
  { id: 7558, reason: '语义拿不准（复合目标「对 1 名敌人和一个随机敌人」SOP 措辞裁定不支持；「如果敌人已陷入沉默状态，则造成的双倍伤害」条件倍率现可表达但整条仍卡）' },
  { id: 7636, reason: '语义拿不准（「每摧毁一颗绿色宝石则随机使一名盟友下潜」逐来源重复施加状态无对应原语（状态段数量不支持二次缩放）；[1:1] 亦无明确来源子句可绑定）' },
  { id: 7640, reason: '伤害区间（[(魔法/2)+4] – [魔法+8] 到 {2}）' },
  { id: 7645, reason: '语义拿不准（「对生命值和护甲值造成伤害」双池伤害口径手册未裁定，无法对号入座）' },
  { id: 7698, reason: '二次缩放来源不支持（「因敌我双方的不死族军队数量」双侧种族计数无对应 kind，batch-13 7546/7547 同款）' },
  { id: 7713, reason: '语义拿不准（「窃取……并将之给予你第一位盟友」窃取所得无法重定向给施法者以外目标，steal 仅支持施法者获得）' },
  { id: 7747, reason: '语义拿不准（「若其中一名敌人身亡，则击杀另一名敌人」：ifTargetDied 仅判定最近段主目标，「其中一名/另一名」目标绑定无对应原语；首句现可完整表达——enemyWeakestN n:2 + sources allyStatSum/enemyStatSum attack，仅剩死亡绑定卡点）' },
  { id: 7790, reason: '晋升度条件（「如果是Boss，则根据我的升华效果造成3-5倍伤害」）；「沉默上方和下方的敌人」位置目标亦不支持' },
];

const SPELLS: CuratedBatch['spells'] = [
  {
    id: 7477,
    desc: '净化自身并给自己赋予屏障效果。摧毁 1 行，获得 [魔法 + 1] 点护甲值和生命值，所获得的点数因摧毁的黄色宝石数而增强。 [1:1]',
    build: skill(
      cleanse('allySelf'),
      inflict('barrier', 'allySelf'),
      destroyChosenRow(),
      // 一个方括号喂双段（batch-05 7152 同款）；modifier 挂最近数值段（batch-14 8297 同款）
      armor('allySelf', 1, 1),
      heal('allySelf', 1, 1, {
        modifier: { mod: { kind: 'ratio', a: 1, b: 1 }, source: { kind: 'destroyedGems', color: BaseColor.Yellow } },
      }),
    ),
  },
  {
    id: 7503,
    desc: '给予一名盟友 [(魔法 / 2) + 4] 点护甲值以及 1 点魔法值。如果盟友是一名神祇军队，则效果翻倍。',
    build: skill(
      // 「魔法值」= magic 属性（SOP 措辞裁定）；「效果翻倍」两段各自挂 raceDouble（神祇 = Divine，batch-05 7152 同款）
      armor('allyChosen', 4, 0.5, { raceDouble: 'Divine' }),
      magic('allyChosen', 1, 0, { raceDouble: 'Divine' }),
    ),
  },
  {
    id: 7508,
    desc: '将板面上的黄色宝石数翻倍。再创造 3 颗黄色宝石。 [1:1]',
    build: skill(
      // 翻倍 = 按现有宝石数逐颗补造：创造 3+板面数 = 翻倍后再造 3（batch-12 7258 / batch-19 7315 同款）
      createGems(BaseColor.Yellow, 3, 0, {
        modifier: { mod: { kind: 'ratio', a: 1, b: 1 }, source: { kind: 'boardGems', color: BaseColor.Yellow } },
      }),
    ),
  },
  {
    id: 7516,
    desc: '对所有敌人造成 [魔法 + 3] 点伤害。创造 9 颗紫色宝石，创造的宝石数因陷入燃烧状态的敌军数量而增强。 [1:1]',
    build: skill(
      dmgAll(3),
      // 「创造的宝石数因…增强」点名创造段（spell-rules.md §1 修饰段归属）
      createGems(BaseColor.Purple, 9, 0, {
        modifier: { mod: { kind: 'ratio', a: 1, b: 1 }, source: { kind: 'enemyStatusCount', statusId: 'burning' } },
      }),
    ),
  },
  {
    id: 7535,
    desc: '创造 9 颗紫色宝石。召唤一只沙地眼镜蛇。',
    build: skill(
      createGems(BaseColor.Purple, 9, 0),
      summonRef('SandCobra'),
    ),
  },
  {
    id: 7549,
    desc: '对最后一名敌人造成 [魔法 + 3] 点伤害，伤害值因蓝色的盟友数而增强。若敌人已受伤，则造成两倍伤害。 [x3]',
    build: skill(
      // 回收：condMult 条件域现含 targetHpDamaged（SOP「通用条件触发 / 条件加成」节：
      // 条件域 = condMult 的全部 7 种，原跳过理由「受伤不在条件域」已过时）；
      // 「因蓝色的盟友数」= alliesOfColor（batch-09 8672 同款）
      dmg('enemyLast', 3, 1, {
        modifier: { mod: { kind: 'multiplier', a: 3 }, source: { kind: 'alliesOfColor', color: BaseColor.Blue } },
        condMult: { times: 2, cond: { kind: 'targetHpDamaged' } },
      }),
    ),
  },
  {
    id: 7551,
    desc: '获得 [魔法 + 3] 点护甲值，点数因矮人盟友数而增强。赋予所有其他盟友屏障效果并给予 5 点法力值。 [1:1]',
    build: skill(
      armor('allySelf', 3, 1, {
        modifier: { mod: { kind: 'ratio', a: 1, b: 1 }, source: { kind: 'alliesOfRace', race: 'Dwarf' } },
      }),
      inflict('barrier', 'allyOthers'),
      // 「法力值」= mana 资源（SOP 措辞裁定）
      mana('allyOthers', 5, 0),
    ),
  },
  {
    id: 7564,
    desc: '对所有敌人造成 [魔法 + 20] 点散射伤害，伤害值因被缠绕的敌军数量而增强。创造 10 颗绿色宝石。 [x10]',
    build: skill(
      // 「对所有敌人…散射」：散射只是类型词，全体目标（SOP 措辞裁定）
      dmg('enemyAll', 20, 1, {
        range: 'all',
        modifier: { mod: { kind: 'multiplier', a: 10 }, source: { kind: 'enemyStatusCount', statusId: 'entangle' } },
      }),
      createGems(BaseColor.Green, 10, 0),
    ),
  },
  {
    id: 7573,
    desc: '摧毁 1 列。对最虚弱的敌人造成 [魔法 + 2] 点真实伤害，伤害值因被摧毁的红色宝石数而增强。 [x2]',
    build: skill(
      destroyChosenCol(),
      trueDmg('enemyWeakest', 2, 1, {
        modifier: { mod: { kind: 'multiplier', a: 2 }, source: { kind: 'destroyedGems', color: BaseColor.Red } },
      }),
    ),
  },
  {
    id: 7584,
    desc: '将板面上的绿色宝石数翻倍。再创造 3 颗绿色宝石。 [1:1]',
    build: skill(
      // 翻倍 = 按现有宝石数逐颗补造（batch-12 7258 / batch-19 7315 同款，见 7508 备注）
      createGems(BaseColor.Green, 3, 0, {
        modifier: { mod: { kind: 'ratio', a: 1, b: 1 }, source: { kind: 'boardGems', color: BaseColor.Green } },
      }),
    ),
  },
  {
    id: 7627,
    desc: '对 1 名敌人造成 [魔法 + 3] 点伤害。敌人陷入燃烧状态，则造成三倍伤害。若敌人身亡，则创造 10 颗红宝石。',
    build: skill(
      // 回收：condMult 现支持 targetStatus 条件倍率（batch-05 7330 同款）
      dmg('enemyChosen', 3, 1, { condMult: { times: 3, cond: { kind: 'targetStatus', statusId: 'burning' } } }),
      // 「若敌人身亡」= §4 死亡条件；「红宝石」= 红色宝石（batch-26 8117 头注口径）
      createGems(BaseColor.Red, 10, 0, { ifTargetDied: true }),
    ),
  },
  {
    id: 7632,
    desc: '对 1 名敌人造成 [魔法 + 2] 点伤害。获得 2 点法力值。每个被缠绕的敌人可增加 25% 获得额外回合的几率。',
    build: skill(
      dmg('enemyChosen', 2),
      mana('allySelf', 2, 0),
      // 回收：chanceBoost 现支持几率随来源增强——每个被缠绕敌人 +25 个百分点
      extraTurn({
        chanceBoost: { mod: { kind: 'multiplier', a: 25 }, source: { kind: 'enemyStatusCount', statusId: 'entangle' } },
      }),
    ),
  },
  {
    id: 7634,
    desc: '将板面上的红色宝石数翻倍。再创造 3 颗红色宝石。 [1:1]',
    build: skill(
      // 翻倍 = 按现有宝石数逐颗补造（batch-12 7258 / batch-19 7315 同款，见 7508 备注）
      createGems(BaseColor.Red, 3, 0, {
        modifier: { mod: { kind: 'ratio', a: 1, b: 1 }, source: { kind: 'boardGems', color: BaseColor.Red } },
      }),
    ),
  },
  {
    id: 7641,
    desc: '召唤两名夸赛魔。将指定的法力颜色转换为紫色。',
    build: skill(
      // 回收：「将指定的法力颜色转换为X」= transform(CHOSEN, X)（SOP 措辞裁定，7062 先例）；
      // 「两名」→ 两个召唤段各召 1 名（batch-26 8117「两名卓恩拳」同款）；夸赛魔=Quasit(6178) 程序核实
      summonRef('Quasit', 6178),
      summonRef('Quasit', 6178),
      transform(CHOSEN, BaseColor.Purple),
    ),
  },
  {
    id: 7697,
    desc: '对一名敌人造成 [魔法 + 7] 点溅射伤害。冻结所有敌人。召唤一名随机巨人。',
    build: skill(
      // 「对 1 名敌人…溅射」= 溅射链（SOP 措辞裁定）
      dmgSplash('enemyChosen', 7),
      inflict('frozen', 'enemyAll'),
      // 巨人 = troopTypes 含 Giant 全集（SOP §6 程序核实）
      summonRandom(GIANTS),
    ),
  },
  {
    id: 7723,
    desc: '杀掉一名敌人。燃烧并冻结所有剩余的敌人。创造 12 颗骷髅头。',
    build: skill(
      // 「杀掉」= 即杀 execute（batch-03 7789 同款）
      dmg('enemyChosen', 0, 0, { execute: true }),
      // 「所有剩余的敌人」= 击杀后存活者 → enemyAll（targeting 排除阵亡，请复核）
      inflict('burning', 'enemyAll'),
      inflict('frozen', 'enemyAll'),
      createSkulls(12, 0),
    ),
  },
  {
    id: 7732,
    desc: '将指定的法力颜色转换为绿色。召唤一只灵之狐。',
    build: skill(
      // 回收：「将指定的法力颜色转换为X」= transform(CHOSEN, X)（SOP 措辞裁定，7062 先例）；
      // 灵之狐=SpiritFox(6207) 程序核实
      transform(CHOSEN, BaseColor.Green),
      summonRef('SpiritFox', 6207),
    ),
  },
  {
    id: 7749,
    desc: '使所有敌人陷入织网状态。对最后两名敌人造成 [魔法 + 5] 点真实伤害。若有一名敌人身亡，则爆破 15 颗宝石。',
    build: skill(
      inflict('web', 'enemyAll'),
      trueDmg('enemyLastN', 5, 1, { n: 2 }),
      // 「若有一名敌人身亡」= §4 死亡条件家族（batch-12 7225/7273/7335 同款），挂最近产目标段
      explodeRandomGems(15, 0, 'color', undefined, { ifTargetDied: true }),
    ),
  },
  {
    id: 7761,
    desc: '将所有绿色宝石转换成棕色。减除一名敌人 [魔法 + 3] 点护甲值，数量因被转换的宝石数而增强。 [2:1]',
    build: skill(
      transform(BaseColor.Green, BaseColor.Brown),
      reduce('enemyChosen', 'armor', 3, 1, {
        modifier: { mod: { kind: 'ratio', a: 2, b: 1 }, source: { kind: 'transformedGems' } },
      }),
    ),
  },
  {
    id: 7763,
    desc: '随机爆破 2 颗宝石。随机冻结一名敌人。获得一个额外回合。',
    build: skill(
      // 「宝石」不含骷髅 → include:'color'（batch-01 头注口径）
      explodeRandomGems(2, 0, 'color'),
      inflict('frozen', 'enemyRandom'),
      extraTurn(),
    ),
  },
  {
    id: 7764,
    desc: '创造 7 颗末日骷髅头。召唤一名矮人丧尸，或一名杀手鬼魂。',
    build: skill(
      // 回收（第六遍）：创造末日骷髅头 = createSpecialGems（SOP「特殊宝石」节原例）
      createSpecialGems({ kind: 'doomSkull' }, 7, 0),
      // 文本点名两选一 → randomOf 两项（batch-26 7930「奥眼能血蛭或一名奥眼能」同款；
      // 矮人丧尸 = DwarvenZombie(6559)、杀手鬼魂 = SlayerGhost(6560)，程序核实）
      summonRandom(['DwarvenZombie', 'SlayerGhost']),
    ),
  },
  {
    id: 7765,
    desc: '创造等同于目前板面上蓝色和棕色宝石数的混合蓝色和棕色的宝石。 [1:1]',
    build: skill(
      // 数量 = 板上蓝色 + 棕色数：base 0 + sources 计数相加（batch-14 8251 精确同款）
      createMix([BaseColor.Blue, BaseColor.Brown], 0, 0, {
        modifier: {
          mod: { kind: 'ratio', a: 1, b: 1 },
          sources: [{ kind: 'boardGems', color: BaseColor.Blue }, { kind: 'boardGems', color: BaseColor.Brown }],
        },
      }),
    ),
  },
  {
    id: 7772,
    desc: '创造 5 颗红色宝石，宝石数量因陷入燃烧状态的敌军数量而增强。 [x3]',
    build: skill(
      createGems(BaseColor.Red, 5, 0, {
        modifier: { mod: { kind: 'multiplier', a: 3 }, source: { kind: 'enemyStatusCount', statusId: 'burning' } },
      }),
    ),
  },
  {
    id: 7775,
    desc: '减除所有敌人全部护甲值。对一名敌人造成 [(魔法 x 2) + 7] 点伤害。使自身下潜。',
    build: skill(
      // 「减除全部护甲值」= drainAll（SOP 措辞裁定）
      reduce('enemyAll', 'armor', 0, 0, { drainAll: true }),
      // [(魔法 x 2) + 7] = scale(7, 2)
      dmg('enemyChosen', 7, 2),
      inflict('submerged', 'allySelf'),
    ),
  },
  {
    id: 7796,
    desc: '将黄色宝石转换成骷髅头和红色宝石转换成紫色。使最强大的两名敌人陷入沉默状态。',
    build: skill(
      // transform 终点可为 'SKULL'（SOP 措辞裁定）
      transform(BaseColor.Yellow, 'SKULL'),
      transform(BaseColor.Red, BaseColor.Purple),
      // 「最强大的敌人」= enemyHealthiest（spell-rules.md §0）
      inflict('silence', 'enemyHealthiestN', { n: 2 }),
    ),
  },
];

export const BATCH_20: CuratedBatch = { batch: '20', spells: SPELLS, skipped: SKIPPED };
