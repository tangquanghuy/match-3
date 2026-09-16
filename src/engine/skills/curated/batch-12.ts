/**
 * 人工核对组装 · 批次 12（池：scripts/curated-pools/pool-12.json）
 * 核对者：agent 批次12
 *
 * 语义裁定备注：
 * - 「以增强/以强化」句式（移除/转换宝石以增强）：宝石操作段排在被增强段之前——
 *   transformedGems/destroyedGems 来源才数得到（batch-04 7002 / batch-07 7248 头注同款）；
 *   本批 7160/7215/7235/7300/7383 的 desc 语序为效果在前、宝石操作在后，按先例重排，请复核。
 * - 「魔法值」= magic 属性、「法力值」= mana 资源（SOP 措辞裁定；7177/7225/7273/7335 同口径）。
 * - 「爆破一颗宝石」（无颜色、无选定/随机字样）→ explodeRandomGems(1,0,'color')
 *   （batch-03 头注 + batch-11 7041 同口径）。
 * - 「散射伤害」目标为全体时是类型词而非溅射链 → dmg('enemyAll',…,{range:'all'})
 *   （SOP 措辞裁定；自动编译产物曾误作 range:'splash'，以 SOP 为准）。
 * - 7258「将板面上的骷髅头数翻倍，再创造 2 颗骷髅头。[1:1]」：翻倍 = 按现有骷髅数逐颗补造
 *   → createSkulls(2) + [1:1] boardSkulls（创造 2+骷髅数 = 翻倍后再造 2，行为精确等价，
 *   且 [1:1] 标记在句中无其它可绑定来源），本仓库首次如此映射，请复核。
 * - 7177「盟友可获得 1 点魔法值」：bare「盟友」按复数读作所有盟友 → allyAll
 *   （batch-05 7167「所有盟友可获得」同款；官方汉化单个盟友必作「一名/随机盟友」），请复核。
 * - 7225/7273/7335「如果(有)敌人身亡」= spell-rules.md §4 死亡条件家族
 *   （「如敌人身亡，则…」同款），按 §4 挂最近产目标段（enemyAll）判定。
 */
import { skill, dmg, dmgAll, dmgSplash, trueDmg, heal, armor, attack, magic, steal,
  cleanse, createGems, createSkulls, transform, destroyChosenCol,
  destroyChosenRow, destroyColor, destroyRandomGems, explodeRandomGems,
  inflict, summonRef, summonRandom, extraTurn, CHOSEN } from '../builders';
import { BaseColor } from '../../types';
import type { CuratedBatch } from './index';

/** 恶魔族全部 referenceName（troopTypes 含 Daemon，§6 命令核实；batch-15 GOBLINS 同款种族名单） */
const DEMONS = [
  'AncientHorror', 'SpiderQueen', 'Abhorath', 'Webspinner', 'Moloch', 'TheSilentOne',
  'Gorgotha', 'Kerberos', 'Cthyryzyx', 'Terraxis', 'Psion', 'Abynissia',
  'Quasit', 'Hellhound', 'Succubus', 'HeraldOfChaos', 'InfernalKing', 'Venbarak',
  'War', 'Plague', 'Famine', 'Death', 'Marilith', 'Hellcat',
  'Creeper', 'KruargTheDread', 'Desdaemona', 'Warg', 'Incubus', 'DarkMonolith',
  'Myzmer', 'Elemaugrim', 'CorruptedUrska', 'BoneDaemon', 'Hellspawn', 'Spinnerette',
  'Doomclaw', 'YaoGuai', 'Erinyes', 'Tzathoth', 'Gargantaur', 'TomeOfEvil',
  'Hellcackle', 'Glaycion', 'Nightmare', 'SirMordayne', 'Umbraxis', 'ThePossessedKing',
  'Sloth', 'Envy', 'Greed', 'Gluttony', 'Barghast', 'Pride',
  'Wrath', 'Lust', 'SibylOfLust', 'SoldierOfWrath', 'WallOfTentacles', 'Bael',
  'VashDagon', 'QueenOfSin', 'Glutmaw', 'Obsidius', 'Lamashtu', 'PossessedUrska',
  'BrokerOfGreed', 'EnvoyOfPride', 'MotherOfDarkness', 'GateOfSouls', 'Lucifria', 'Blightwing',
  'Deminaga', 'TheInfernalMachine', 'Ironjaw', 'Tartarus', 'Netherhound', 'EldritchGuardian',
  'FellDragonEgg', 'FellDragon', 'Nocturnia', 'HeraldOfWoe', 'IndolatorOfSloth', 'ShadeOfKurandara',
  'Kurandara', 'EnragedKurandara', 'DaemonGnome', 'Mambasira', 'Arcturion', 'HeraldOfDamnation',
  'Baphomet', 'TheScourgeOfHonor', 'DeepGolem', 'NyarMel', 'HoundOfYaoGuai', 'MaidOfEnvy',
  'TheArchduke', 'Lemure', 'Fury', 'Charonas', 'JudgeOfTheDead', 'HellclawHunter',
  'HellclawMage', 'HellclawWarrior', 'Indrajit', 'HelgorTheGuardian', 'FlamingOni', 'Oneiros',
  'RedAhriman', 'AbjectOfDespond', 'Despond', 'BileBlackheart', 'AnimusOfEnvy', 'HornedHag',
  'ConsortOfDarkness', 'EldritchMinion', 'Uvhash-Ka', 'WarMachine', 'HellclawRager', 'HeraldOfBlight',
  'HellstoneGate', 'HeraldOfTorpor', 'Czernobog', 'Nabassu', 'Xenith', 'Tourmaline',
  'Chalcedony', 'Petrahulk', 'StoneMefyt', 'TheElderDragon', 'VrawkDaemon', 'EldritchDisciple',
  'Voidcaller', 'TheBaneOfMercy', 'EyeOfArges', 'InfernalVoyager', 'TheIronMaiden', 'TriTerror',
  'DaemonChild', 'TheVoidDragon', 'Tempurath', 'DaemonicSentinel', 'Hellborer', 'DarkHerald',
  'Groevanga', 'FellHydra', 'Isban', 'Goethite', 'SuccubusQueen', 'Bieska',
  'HoundmasterGor', 'BlightHound', 'Astaroth', 'DaeDrak', 'MelekTauss', 'DoomedGuardian',
  'StingBat', 'TheBaneOfValor', 'Redreaver', 'LionOfYaoGuai', 'Discordia', 'ImmortalAbaddon',
  'BlightedHusk', 'BaneOfAmbition', 'HellclawShadowpriest', 'Polymetis', 'DagoNath', 'FelineOfEnvy',
  'Skarn', 'MaidenOfPain', 'HeraldOfWar', 'Azbeel', 'OkraNosTheSleeper', 'Voidjaw',
  'ChampionOfRot', 'BloodSpore', 'InfernalTrickster', 'Seditius', 'ImmortalZephaar',
];

const SKIPPED: { id: number; reason: string }[] = [
  { id: 7182, reason: '语义拿不准（「指定盟友的法力颜色」为动态颜色，无对应原语，同 batch-05 7358）' },
    { id: 7236, reason: '语义拿不准（「减除 4 点随机技能值」无对应削减原语，batch-01 7319 同款；「敌人是兽人或恶魔」析取条件现已可用 ifCond anyOf 表达，仅剩随机技能值削减卡点）' },
  { id: 7253, reason: '语义拿不准（「选择一颗紫色宝石，摧毁其行和列」限色选定宝石的行列绑定摧毁无对应原语，同 batch-03 8205 形状摧毁家族）' },
  { id: 7254, reason: '语义拿不准（「有 50% 的几率打错敌人」改判目标无对应机制；「如果对方使用棕色法力，则造成三倍伤害」条件倍率现已可表达但整条仍卡）' },
  { id: 7275, reason: '语义拿不准（「只能施放一次」施法限制无对应原语，同 batch-03 7673）' },
  { id: 7310, reason: '语义拿不准（「窃取随机技能值」无对应原语，batch-01 7319 同款）' },
  { id: 7331, reason: '语义拿不准（「只能施放一次」施法限制无对应原语，同 batch-03 7673）' },
  { id: 7353, reason: '句子式不明（「造成散射伤害」未指明目标，batch-11 9471 同款）' },
  { id: 7355, reason: '语义拿不准（「只能施放一次」施法限制无对应原语，同 batch-03 7673）' },
  { id: 7386, reason: '语义拿不准（同 7254：「有 50% 的几率打错敌人」+「如果对方使用绿色法力，则造成三倍伤害」条件倍率）' },
  { id: 7388, reason: '二次缩放来源不支持（「该行被摧毁的骷髅头数」= 被摧毁宝石的骷髅细分计数：无色来源会把同行色宝石也计入而超计，带色来源只匹配色宝石不含骷髅，两者都不对）' },
  { id: 7391, reason: '二次缩放来源不支持（「白盔国盟友」按王国计盟友无对应 kind；「天使宝石」为特殊宝石）' },
];

const SPELLS: CuratedBatch['spells'] = [
  {
    id: 7157,
    desc: '对所有敌人造成 [魔法 + 3] 点散射伤害。伤害值因自身的护甲值而增强。 [x2]',
    build: skill(
      dmg('enemyAll', 3, 1, {
        range: 'all',
        modifier: { mod: { kind: 'multiplier', a: 2 }, source: { kind: 'selfStat', stat: 'armor' } },
      }),
    ),
  },
  {
    id: 7160,
    desc: '为所有盟友提供 [魔法] 点护甲值，并移除所有紫色宝石以增强效果。获得屏障效果。 [3:1]',
    build: skill(
      // 「移除…以增强」句式：清除段先执行，destroyedGems 来源才数得到（batch-04 7002 同款）
      destroyColor(BaseColor.Purple),
      armor('allyAll', 0, 1, {
        modifier: { mod: { kind: 'ratio', a: 3, b: 1 }, source: { kind: 'destroyedGems', color: BaseColor.Purple } },
      }),
      // 「获得屏障效果」未点名对象 = 自身（batch-08 8524 同口径）
      inflict('barrier', 'allySelf'),
    ),
  },
  {
    id: 7177,
    desc: '对 1 名敌人造成 [魔法 + 4] 点伤害。冻结敌人。如果该敌人身亡，盟友可获得 1 点魔法值。',
    build: skill(
      dmg('enemyChosen', 4),
      inflict('frozen', 'enemyChosen'),
      // 「魔法值」= magic 属性（SOP 措辞裁定）；bare「盟友」按复数 = allyAll（见文件头备注，请复核）
      magic('allyAll', 1, 0, { ifTargetDied: true }),
    ),
  },
  {
    id: 7215,
    desc: '对所有敌人造成 [魔法 + 1] 点伤害，将蓝色宝石转换成棕色宝石，伤害值因转换的宝石数而增强。 [2:1]',
    build: skill(
      // 「转换…以增强」句式：转化段先执行，transformedGems 来源才数得到（batch-07 7248 同款）
      transform(BaseColor.Blue, BaseColor.Brown),
      dmg('enemyAll', 1, 1, {
        range: 'all',
        modifier: { mod: { kind: 'ratio', a: 2, b: 1 }, source: { kind: 'transformedGems' } },
      }),
    ),
  },
  {
    id: 7216,
    desc: '将指定的法力颜色转换为绿色。缠绕一名随机的敌人。',
    build: skill(
      // 回收：「将指定的法力颜色转换为X」= transform(CHOSEN, X)（SOP 措辞裁定，7062 先例）
      transform(CHOSEN, BaseColor.Green),
      inflict('entangle', 'enemyRandom'),
    ),
  },
  {
    id: 7224,
    desc: '爆破一颗宝石。对一名随机敌人造成 [魔法 + 5] 点伤害，伤害值因被摧毁的棕色宝石数而增强。 [x5]',
    build: skill(
      explodeRandomGems(1, 0, 'color'),
      dmg('enemyRandom', 5, 1, {
        modifier: { mod: { kind: 'multiplier', a: 5 }, source: { kind: 'destroyedGems', color: BaseColor.Brown } },
      }),
    ),
  },
  {
    id: 7225,
    desc: '对所有敌人造成 [魔法 + 3] 点散射伤害。创造 7 颗红色宝石。如果有敌人身亡，则获得 8 点魔法值。',
    build: skill(
      dmgAll(3),
      createGems(BaseColor.Red, 7, 0),
      // 「魔法值」= magic 属性；死亡条件判最近产目标段（dmgAll）主目标（spell-rules.md §4）
      magic('allySelf', 8, 0, { ifTargetDied: true }),
    ),
  },
  {
    id: 7235,
    desc: '对一名敌人造成 [魔法 + 4] 点溅射伤害。将所有黄色宝石转换为红色以增强伤害效果。 [2:1]',
    build: skill(
      // 转化段先执行，transformedGems 来源才数得到（batch-04 7002 同款）
      transform(BaseColor.Yellow, BaseColor.Red),
      dmgSplash('enemyChosen', 4, 1, {
        modifier: { mod: { kind: 'ratio', a: 2, b: 1 }, source: { kind: 'transformedGems' } },
      }),
    ),
  },
  {
    id: 7243,
    desc: '爆破一颗宝石。对 1 名敌人造成 [魔法 + 3] 点轻微溅射伤害。获得一个额外回合。',
    build: skill(
      explodeRandomGems(1, 0, 'color'),
      dmgSplash('enemyChosen', 3),
      extraTurn(),
    ),
  },
  {
    id: 7252,
    desc: '对第一位敌人造成 [魔法 + 2] 点轻微的溅射伤害，伤害值因自身的攻击力、生命值、护甲值而增强。 [10:1]',
    build: skill(
      // 三来源（攻击力/生命值/护甲值）→ sources 计数相加（SOP §3；hp=当前生命，batch-08 8303 口径）
      dmgSplash('enemyFront', 2, 1, {
        modifier: {
          mod: { kind: 'ratio', a: 10, b: 1 },
          sources: [
            { kind: 'selfStat', stat: 'attack' },
            { kind: 'selfStat', stat: 'hp' },
            { kind: 'selfStat', stat: 'armor' },
          ],
        },
      }),
    ),
  },
  {
    id: 7257,
    desc: '对所有敌人造成 [魔法 + 12] 点散射伤害。伤害值因自身损失的生命值而增强。 [x2]',
    build: skill(
      dmg('enemyAll', 12, 1, {
        range: 'all',
        modifier: { mod: { kind: 'multiplier', a: 2 }, source: { kind: 'selfStat', stat: 'missingHp' } },
      }),
    ),
  },
  {
    id: 7258,
    desc: '将板面上的骷髅头数翻倍，再创造 2 颗骷髅头。 [1:1]',
    build: skill(
      // 翻倍 = 按现有骷髅数逐颗补造：创造 2+骷髅数 = 翻倍后再造 2（行为精确等价，见文件头备注，请复核）
      createSkulls(2, 0, {
        modifier: { mod: { kind: 'ratio', a: 1, b: 1 }, source: { kind: 'boardSkulls' } },
      }),
    ),
  },
  {
    id: 7259,
    desc: '对 1 名敌人造成  [魔法 + 6]  点伤害。如果敌人已被缠绕，则造成三倍伤害。缠绕敌人。',
    build: skill(
      // 回收：condMult 现支持 targetStatus 条件倍率（batch-05 7330 同款）；desc 双空格逐字保留
      dmg('enemyChosen', 6, 1, { condMult: { times: 3, cond: { kind: 'targetStatus', statusId: 'entangle' } } }),
      inflict('entangle', 'enemyChosen'),
    ),
  },
  {
    id: 7273,
    desc: '对所有敌人造成 [魔法 + 3] 点散射伤害。摧毁 10 颗随机宝石。如果敌人身亡，则获得 8 点魔法值。',
    build: skill(
      dmgAll(3),
      // 「宝石」不含骷髅（batch-01 头注口径）→ include:'color'
      destroyRandomGems(10, 0, 'color'),
      magic('allySelf', 8, 0, { ifTargetDied: true }),
    ),
  },
  {
    id: 7298,
    desc: '摧毁 1 列。对所有敌人造成 [魔法 + 8] 点散射伤害，并因摧毁的黄色宝石数而增强。 [x10]',
    build: skill(
      destroyChosenCol(),
      dmg('enemyAll', 8, 1, {
        range: 'all',
        modifier: { mod: { kind: 'multiplier', a: 10 }, source: { kind: 'destroyedGems', color: BaseColor.Yellow } },
      }),
    ),
  },
  {
    id: 7300,
    desc: '给予最弱的盟友 [魔法] 点生命值，将紫色宝石转换为黄色来强化此效果。净化所有盟友。 [3:1]',
    build: skill(
      // 转化段先执行，transformedGems 来源才数得到（batch-04 7002 同款）
      transform(BaseColor.Purple, BaseColor.Yellow),
      heal('allyWeakest', 0, 1, {
        modifier: { mod: { kind: 'ratio', a: 3, b: 1 }, source: { kind: 'transformedGems' } },
      }),
      cleanse('allyAll'),
    ),
  },
  {
    id: 7335,
    desc: '对所有敌人造成 [魔法 + 3] 点散射伤害。缠绕所有敌人。如果敌人身亡，则获得 8 点魔法值。',
    build: skill(
      dmgAll(3),
      inflict('entangle', 'enemyAll'),
      magic('allySelf', 8, 0, { ifTargetDied: true }),
    ),
  },
  {
    id: 7344,
    desc: '对所有敌人造成 6 点真实伤害。摧毁 [魔法 + 3] 颗随机宝石。获得 6 点攻击力。',
    build: skill(
      dmgAll(6, 0, true),
      destroyRandomGems(3, 1, 'color'),
      attack('allySelf', 6, 0),
    ),
  },
  {
    id: 7345,
    desc: '将所有黄色宝石转换为红色。给予所有盟友 [魔法] 点生命值，点数因转换的宝石数而增强。 [3:1]',
    build: skill(
      transform(BaseColor.Yellow, BaseColor.Red),
      heal('allyAll', 0, 1, {
        modifier: { mod: { kind: 'ratio', a: 3, b: 1 }, source: { kind: 'transformedGems' } },
      }),
      cleanse('allyAll'),
    ),
  },
  {
    id: 7350,
    desc: '对 1 名敌人造成 [魔法 + 6] 点伤害。如果敌人已陷入织网状态，则造成双倍伤害。使敌人陷入织网状态。',
    build: skill(
      // 回收：condMult 现支持 targetStatus 条件倍率（batch-05 7330 同款）
      dmg('enemyChosen', 6, 1, { condMult: { times: 2, cond: { kind: 'targetStatus', statusId: 'web' } } }),
      inflict('web', 'enemyChosen'),
    ),
  },
  {
    id: 7366,
    desc: '摧毁 1 行。对前两名敌人造成 [魔法 + 2] 点伤害，伤害值因摧毁的黄色色宝石数而增强。 [x2]',
    build: skill(
      destroyChosenRow(),
      dmg('enemyFirstN', 2, 1, {
        n: 2,
        // 「黄色色宝石」为原文笔误，按黄色宝石筛（batch-07 8041 处理笔误同款）
        modifier: { mod: { kind: 'multiplier', a: 2 }, source: { kind: 'destroyedGems', color: BaseColor.Yellow } },
      }),
    ),
  },
  {
    id: 7368,
    desc: '对 1 名敌人造成 [魔法 + 2] 点真实伤害并窃取其 2 点魔法值。如果敌人使用蓝色法力，则造成双倍伤害。',
    build: skill(
      // 回收：condMult 现支持 targetColor 条件倍率（按目标 manaColors 含该色判定）；
      // 「魔法值」= magic 属性（SOP 措辞裁定）
      trueDmg('enemyChosen', 2, 1, { condMult: { times: 2, cond: { kind: 'targetColor', color: BaseColor.Blue } } }),
      // 「窃取其 2 点魔法值」= steal 同属性回填（batch-01 8278 同款）
      steal('enemyChosen', 'magic', 'magic', 2, 0),
    ),
  },
  {
    id: 7372,
    desc: '召唤一只幼龙。获得 6 点生命值。',
    build: skill(
      // 幼龙 = BabyDragon（troops.json id 6231，§6 命令查询）
      summonRef('BabyDragon', 6231),
      heal('allySelf', 6, 0),
    ),
  },
  {
    id: 7383,
    desc: '对第一名敌人造成 [魔法 + 2] 点伤害，移除所有红色宝石以强化伤害。缠绕敌人。 [3:1]',
    build: skill(
      // 清除段先执行，destroyedGems 来源才数得到（batch-04 7010 同款）
      destroyColor(BaseColor.Red),
      dmg('enemyFront', 2, 1, {
        modifier: { mod: { kind: 'ratio', a: 3, b: 1 }, source: { kind: 'destroyedGems', color: BaseColor.Red } },
      }),
      // 「缠绕敌人」= 前文第一名敌人
      inflict('entangle', 'enemyFront'),
    ),
  },
  {
    id: 7387,
    desc: '对最后两名敌人造成 [魔法 + 4] 点伤害。如果板面上有 13 颗或更多红色宝石，召唤一名随机恶魔。',
    build: skill(
      dmg('enemyLastN', 4, 1, { n: 2 }),
      // 回收：ifCond 现支持条件触发（SOP「通用条件触发 / 条件加成」节）；boardAtLeast 为全局
      // 条件、召唤段整段判定；summonRandom 无 opts 参，展开补挂（SummonSegment 继承
      // SegmentOptions）；DEMONS 名单见文件头常量（§6 命令核实）
      { ...summonRandom(DEMONS), ifCond: { kind: 'boardAtLeast', color: BaseColor.Red, n: 13 } },
    ),
  },
  {
    id: 7399,
    desc: '将指定的法力颜色转换为棕色。净化所有盟友。',
    build: skill(
      // 回收：「将指定的法力颜色转换为X」= transform(CHOSEN, X)（SOP 措辞裁定，7062 先例）
      transform(CHOSEN, BaseColor.Brown),
      cleanse('allyAll'),
    ),
  },
];

export const BATCH_12: CuratedBatch = { batch: '12', spells: SPELLS, skipped: SKIPPED };
