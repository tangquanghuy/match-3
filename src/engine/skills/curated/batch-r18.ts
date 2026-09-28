/**
 * 放弃桶回收批 R18（2026-09-18）：现存未组装技能前半收口批（工作面 union 214 条之 id 较小半，
 * id ≤ 8248）。池 = 「从未组装」149 条 + 既有 SKIP 记录 65 条（tmp/remaining_all.json 去重）
 * 按 id 升序取前半；两半分界 = union[213]（8248），id 较大半留待并行批。
 *
 * 逐条判读依据 = 官方英文原句（data/raw/gow-2026-09-18/troops.en.json stats.spell.desc）
 * 与官方 SpellSteps（data/raw/spells.gow.en.json RawData.SpellSteps），原句优先于机翻 ZH。
 *
 * 本批口径：
 * - 元经济三币种落地后首批大规模回收：「获得/给予黄金·灵魂·藏宝图」= gainGold/gainSouls/gainMaps
 *  （§10），「因我的黄金/灵魂而增强」= battleGold/battleSouls 来源；逃跑 = escape（§10.1）。
 * - 魔头/高塔晋升惰性建模全族收口（r11 BOSS_ASC3 / r16 CASTLE_ASC3 口径，标准战斗恒 false）。
 * - 王国族来源/条件首批消费：「因狮心帝国/白盔国盟友数」= alliesOfKingdom（Wave4，kingdom 取
 *   troops.json 中文王国名口径）；「因天使/灵力宝石数」= boardSpecial。
 * - perDestroyed 驱动的状态施加族（「每摧毁一颗X宝石则施加状态」）+ 尾缀 [1:1] 序列化（r17 口径）。
 * - 「消除(一名/所有)敌人正面增益」= 按正面状态逐一 dispelStatus（§6 口径，POSITIVE_STATUSES 助手）。
 * - 官方 Devour（吞噬）机制引擎无对应原语 → 相关条目一律 SKIP（含 7047 盟友吞噬——即杀近似会
 *   丢失成长语义，不取）。
 * - 挽救候选复核后仍维持 SKIP 的 50 条记录保留在原批次文件（不重复计数），复核结论见批尾注记。
 */
import type { CuratedBatch } from './index';
import { explodeChosenCol, destroyChosenCross, destroyChosenCol } from '../builders';
import { skill, targetedSkill, dmg, dmgSplash, trueDmg, heal, armor, attack, magic, mana, reduce, steal, cleanse, dispelStatus, randomStat, inflict, inflictRandom, createGems, createSkulls, createMix, createStorm, destroyColor, destroyRandomGems, destroyRandomRows, explodeColor, explodeRandomGems, transform, transformToSpecial, reposition, shuffleBoard, shuffleTeam, extraTurn, oneOf, summonRef, summonRandom, sacrifice, gainGold, gainSouls, gainMaps, escape, CHOSEN, CELL, explodeAt } from '../builders';
import type { SegmentOpts } from '../builders';
import { BaseColor } from '../../types';
import type { Condition, CondMult } from '../effects/secondary';
import type { EffectSegment } from '../prototypes';
import type { TargetMode } from '../targeting';

/** 「若敌人是魔头，基于晋升 3-5 倍」（官方 MultiplyForAscensionBoss，r11 ASC3 口径：惰性建模，倍率取下限 3） */
const BOSS_ASC3: CondMult = {
  times: 3,
  cond: { kind: 'allOf', of: [{ kind: 'targetRace', race: 'Boss' }, { kind: 'ascended', min: 3 }] },
};

/** 「若敌人是塔/高塔，基于晋升 3-5 倍」（官方 MultiplyForAscensionCastle，r16 CASTLE_ASC 口径） */
const CASTLE_ASC3: CondMult = {
  times: 3,
  cond: { kind: 'allOf', of: [{ kind: 'targetRace', race: 'Castle' }, { kind: 'ascended', min: 3 }] },
};

/** 「所有使用该(选定)颜色法力的敌人」（r11 8180 动态色口径） */
const CHOSEN_COLOR: Condition = { kind: 'targetColor', color: 'CHOSEN' };

/** 「恶魔或不死族敌人」（7710 种族析取，r15 7708 同款） */
const DAEMON_OR_UNDEAD: Condition = {
  kind: 'anyOf',
  of: [{ kind: 'targetRace', race: 'Daemon' }, { kind: 'targetRace', race: 'Undead' }],
};

/** 「消除(一名/所有)敌人正面增益」= 按正面状态逐一驱散（spell-rules §6 口径：dispel 挂目标相对条件） */
const POSITIVE_STATUSES = ['barrier', 'submerged', 'blessed', 'enchanted', 'reflect', 'enraged', 'rage'] as const;

function dispelPositives(target: TargetMode, extra?: Condition, shared?: SegmentOpts): EffectSegment[] {
  return POSITIVE_STATUSES.map((statusId) => {
    const statusCond: Condition = { kind: 'targetStatus', statusId };
    return dispelStatus(statusId, target, {
      ifCond: extra ? { kind: 'allOf', of: [statusCond, extra] } : statusCond,
      ...shared,
    });
  });
}

// 随机骑士/不死族召唤池（troops.json troopTypes 全量 referenceName，batch-w02 大池先例）
const KNIGHT_REFS = ["Paladin", "LanceKnight", "WolfKnight", "GriffonKnight", "KnightCoronet", "Luther", "Alastair", "BrianTheLucky", "Templar", "GraveKnight", "Scarlett", "DarkMaster", "Valor", "HeraldOfChaos", "WinterKnight", "Rakshanin", "War", "SpiderKnight", "SettiteWarrior", "LionPrince", "PrideGuard", "Visk", "ThornKnight", "DragonKnight", "QueenYsabelle", "SirSnothelm", "UrskaWanderer", "GaardsAvatar", "LadyIronbeard", "ClockworkKnight", "Swordmaster", "TheSilvermaiden", "PrinceAzquila", "SirGwayne", "HighPaladin", "Urskatyr", "KingMikhail", "SummerKnight", "PrinceEthoras", "SerCygnea", "Strygik", "ChampionOfAnu", "Vanguard", "QueensHerald", "Arcanus", "SirWulfric", "LordEmber", "Fangblade", "SirMordayne", "UrskaDragoon", "TigrakiWarrior", "SpectralKnight", "LadyMorana", "LadyGarnetia", "LapinaKnight", "SirEbonheart", "Man-at-Arms", "ChampionOfGaard", "Lamashtu", "Dullahan", "GuardianOfTheFields", "WildKnight", "Gravitas", "Merknight", "KnightCaptain", "SirQuentinHadley", "ScarabKnight", "ManticoreProtector", "WarElephant", "ArachnaeanWatcher", "SileniGuard", "SapphireKnight", "HeraldOfWoe", "IndolatorOfSloth", "PrinceBarislav", "HauntedGuardian", "SirAlamir", "TombKnight", "HeraldOfDamnation", "StormKnight", "NUTCRKR-1225", "UlfsMascot", "UlfHarrigan", "SecondClawAnhur", "CrimsonAgent", "MeiraDawn", "DarkKnight", "JakalTheGuardian", "HelgorTheGuardian", "UrielleTheGuardian", "MoshuTheGuardian", "RokGarTheGuardian", "AransiTheGuardian", "FirebornWarrior", "LightbornPaladin", "AnimusOfEnvy", "VaultGuard", "BrianTheClucky", "SpectralColossus", "Totec", "HeraldOfBlight", "HeraldOfTorpor", "Tourmaline", "Libara", "HeraldOfKrystenax", "RelicKnight", "FirstClawMaahes", "SilkenFang", "KnightErrant", "Eleanor", "Militiaman", "CommanderDawnheart", "IronVlasta", "Dominion", "MirrorKnight", "GuardianOfLaw", "TritonGuardMera", "SirAiluin", "Half-DaemonKnight", "DarkHerald", "DragonCommander", "LionCommander", "Belladonnus", "TheBlessedMaiden", "DwarvenVanguard", "AldricTheFrostbound", "TheFallenKnight", "FirebornPaladin", "FeyDragoon", "DraugrKnight", "DrownedWanderer", "SparrowKnight", "BarrowLord", "ImmortalEmpyrion", "ImmortalLibara", "DoomedGuardian", "ExiledWargare", "DragonlordLuther", "DragonknightAmira", "SeabornKnight", "WaterbornTemplar", "AlabasterKnight", "SirHector", "AngelicaTheSeeker", "PrisonerLuther", "Raquel", "HeraldOfWar", "Siobhan", "ChampionOfRot", "CryptboundWight", "PixieKnight", "RattigarGladiator", "SirGeoffreyTheFallen", "GriffonCaptain", "Balearic", "TheSoulKnight"];

const UNDEAD_REFS = ["Skeleton", "Wight", "Revenant", "Zombie", "Banshee", "VampireLord", "FleshGolem", "Ghoul", "KeeperOfSouls", "CrimsonBat", "LadySapphira", "Alastair", "GraveKnight", "Aziris", "BoneDragon", "Sunweaver", "Skeleros", "Draakulis", "TwistedHero", "Death", "MorthanisWill", "Wraith", "AstralSpirit", "Remnant", "MummifiedKing", "BoneScorpion", "NightHag", "Pharos-Ra", "CaptainSkullbeard", "BoneNaga", "BoneDaemon", "Valraven", "Xathenos", "Nosferatu", "Umberwolf", "WallOfBones", "IceWraith", "Vargouille", "Carmella", "DwarvenZombie", "SlayerGhost", "KingBloodhammer", "FallenValdis", "Xerodar", "Nightshade", "SpectralKnight", "GraveSeer", "LadyMorana", "Apophisis", "Ankhekt", "Draugr", "Necrocorn", "BoneGolem", "VanyaSoulmourn", "Sanguinia", "CorpseMare", "BaneJaw", "ShadeOfZorn", "DrownedSailor", "VladTheUnsated", "Dullahan", "TheGrayKing", "Tutankhatmun", "FrostfireWraith", "ChaosHound", "Zilopochtli", "UndeadDrake", "DreadSteed", "ShadeOfKurandara", "BoneboundDredge", "HauntedGuardian", "PharaohNefertani", "TombKnight", "Metztli", "CarrionCrow", "TheGhostQueen", "Charonas", "JudgeOfTheDead", "FrozenShieldbreaker", "JakalTheGuardian", "TheFleshHorror", "Draxxius", "VaultGuard", "SpectralColossus", "FlamingSkeleton", "Deathclaw", "AncestorBrodir", "TheGemini", "CryptHound", "StoneZombie", "DhrakSmith", "Carmina", "DeathlockDreilak", "Rath-Amon", "BoundMage", "RelicKnight", "Negasus", "DrownedCaptain", "DeadParrot", "Deathgaunt", "AssessorOfMahat", "FallenSatyr", "TheGraveGiant", "DreadCaptainGrim", "MorthanisDarkness", "SkellyCat", "DeathTrapMimic", "BloodElf", "BoneCatapult", "UndeadSentinel", "UndeadLion", "AnointedChampion", "Valhawk", "LostWarrior", "PharaohKhafru", "AldricTheFrostbound", "Gloomhob", "Ghulemoth", "Shadowhisker", "TheFallenKnight", "GhostOgre", "Necroshale", "CryptWorm", "WargSpirit", "DraugrKnight", "DrownedWanderer", "BarrowLord", "GhostKingGrimhorn", "ImmortalOssifer", "BlightedHusk", "TheDecayingQueen", "WoodRot", "SkeletalUrska", "ZombieGoat", "RottingSerpent", "ShadowWraith", "Abraxas", "ImmortalGemini", "ToxicHag", "Helilya", "DesertOx", "ForsakenGuardian", "KhormacTheRestless", "VigilantShade", "Bothros", "QueenWilhelmina", "Vinepyre", "CountGobula", "LordGobthe", "AqenBloodclaw", "Sanguinette", "TheTombkeeper", "Merneith", "Cinereous", "LordHarker", "GraveWorm", "CryptboundWight", "MoonveilWarden", "CursedSailor", "DarkSpirit", "RhonaBittershield", "TheSoulKnight", "TheBansheeQueen"];

const SKIPPED: { id: number; reason: string }[] = [
  { id: 7047, reason: "语义拿不准（官方 Devour 吞噬成长机制引擎无对应原语，r18 口径）（吞噬盟友）" },
  { id: 7210, reason: "语义拿不准（官方 Devour 吞噬成长机制引擎无对应原语，r18 口径）" },
  { id: 7211, reason: "语义拿不准（官方 Devour 吞噬成长机制引擎无对应原语，r18 口径）" },
  { id: 7280, reason: "语义拿不准（官方 Devour 吞噬成长机制引擎无对应原语，r18 口径）" },
  { id: 7281, reason: "语义拿不准（官方 Devour 吞噬成长机制引擎无对应原语，r18 口径）；[1:1] 为吞噬步骤序列化" },
  { id: 7312, reason: "语义拿不准（官方 Devour 吞噬成长机制引擎无对应原语，r18 口径）" },
  { id: 7326, reason: "语义拿不准（官方 Devour 吞噬成长机制引擎无对应原语，r18 口径）" },
  { id: 7354, reason: "语义拿不准（官方 Devour 吞噬成长机制引擎无对应原语，r18 口径）" },
  { id: 7421, reason: "语义拿不准（官方 Devour 吞噬成长机制引擎无对应原语，r18 口径）" },
  { id: 7423, reason: "语义拿不准（官方 Devour 吞噬成长机制引擎无对应原语，r18 口径）（oneOf 六选一支含吞噬）" },
  { id: 7434, reason: "语义拿不准（「使板面同色宝石数翻倍」无对应原语）" },
  { id: 7435, reason: "句子式不明（「灵魂 ≥12 则召唤」经济阈值条件不在条件域）" },
  { id: 7450, reason: "语义拿不准（官方 Devour 吞噬成长机制引擎无对应原语，r18 口径）（死亡条件触发的吞噬）" },
  { id: 7460, reason: "语义拿不准（「花费我所有的黄金」经济支出无对应原语）" },
  { id: 7480, reason: "语义拿不准（官方 Devour 吞噬成长机制引擎无对应原语，r18 口径）" },
  { id: 7493, reason: '历史跳过；现已依据原始 A-B-C-D-E-F 六步骤在 batch-acceptance 恢复，非永久排除。共享吞噬、转化池及状态规则另待认证。' },
  { id: 7505, reason: "二次缩放来源不支持（尾缀 [25:1] 内部编码无法判读，r15 [100:1] 族同口径；「偷取黄金」按 gainGold 入账可表达但整条维持）" },
  { id: 7559, reason: "语义拿不准（官方 Devour 吞噬成长机制引擎无对应原语，r18 口径）（蓝色法力条件吞噬）" },
  { id: 7566, reason: "语义拿不准（官方 Devour 吞噬成长机制引擎无对应原语，r18 口径）（上下方军队逐一致升天度机会，位置+晋升复合）" },
  { id: 7633, reason: "语义拿不准（官方 Devour 吞噬成长机制引擎无对应原语，r18 口径）" },
  { id: 7637, reason: "语义拿不准（官方 Devour 吞噬成长机制引擎无对应原语，r18 口径）（下潜条件吞噬）" },
  { id: 7642, reason: "语义拿不准（官方 Devour 吞噬成长机制引擎无对应原语，r18 口径）（13+ 棕宝石条件吞噬）" },
  { id: 7646, reason: "二次缩放来源不支持（「因敌方的野兽数而增强」敌方侧种族计数无对应 kind）" },
  { id: 7647, reason: "语义拿不准（官方 Devour 吞噬成长机制引擎无对应原语，r18 口径）" },
  { id: 7667, reason: "二次缩放来源不支持（创造上限「最多 14 颗」无对应机制，r16 10061 上限同口径）" },
  { id: 7670, reason: "语义拿不准（「若敌人的生命值高于自身」反向属性比较——仅支持施法者>目标正向，§13.2）" },
  { id: 7724, reason: "语义拿不准（官方 Devour 吞噬成长机制引擎无对应原语，r18 口径）（几率因转换宝石数增强的吞噬）" },
  { id: 7781, reason: "语义拿不准（官方 Devour 吞噬成长机制引擎无对应原语，r18 口径）（织网/缠绕条件吞噬）" },
  { id: 7810, reason: "语义拿不准（官方 Devour 吞噬成长机制引擎无对应原语，r18 口径）" },
  { id: 7984, reason: "语义拿不准（官方 Devour 吞噬成长机制引擎无对应原语，r18 口径）（几率等同自身攻击力的吞噬）" },
  { id: 8037, reason: "二次缩放来源不支持（「因其法力值而增强」官方 CountMana 100——targetStat 无 mana，r16 9223 CountMagic 同族不同源）" },
  { id: 8040, reason: "比例法力（「窃取四分之一护甲值」25% 比例无对应原语，reduce 仅 halve 50%）" },
  { id: 8056, reason: "语义拿不准（官方 Devour 吞噬成长机制引擎无对应原语，r18 口径）（吞噬盟友+条件召唤恶魔）" },
  { id: 8086, reason: "语义拿不准（官方 Devour 吞噬成长机制引擎无对应原语，r18 口径）（几率因身亡敌人数增强的吞噬——countEnemyDeaths 本身已落地）" },
  { id: 8087, reason: "二次缩放来源不支持（「因被窃取的黄金数而增强」无对应来源 kind；窃取敌方黄金亦无对应池——economy 为共用池）" },
  { id: 8141, reason: "二次缩放来源不支持（窃取敌方黄金无对应来源池；创造上限 16 颗亦无对应机制）" },
  { id: 8142, reason: "二次缩放来源不支持（创造上限「最多 14 颗」无对应机制，r16 10061 同口径）" },
  { id: 8143, reason: "语义拿不准（「若(任一)敌人身亡」多目标段任意死亡绑定缺失——ifTargetDied 仅判首目标，r16 9986 同口径）" },
  { id: 8182, reason: "语义拿不准（「若该敌人已陷入猎人标记」条件辖「所有敌人」目标段——目标相对条件按本段目标逐个过滤会错滤，r16 8925 超集不取同口径）" },
  { id: 8185, reason: "语义拿不准（多目标伤害后的任意死亡绑定缺失，r16 9986 同口径；伤害区间与 marked 计数本身可表达）" },
  { id: 8211, reason: "语义拿不准（官方 Devour 吞噬成长机制引擎无对应原语，r18 口径）（three-of 分支含吞噬与「其下方」复合位）" },
  { id: 8235, reason: "二次缩放来源不支持（「因选定颜色的宝石数量增强」boardGems 不支持 CHOSEN）" },
  { id: 8237, reason: "语义拿不准（官方 Devour 吞噬成长机制引擎无对应原语，r18 口径）" },
  { id: 8243, reason: "语义拿不准（「失去所有黄金」经济支出无对应原语）" },
];

const SPELLS: CuratedBatch['spells'] = [
  {
    id: 7005,
    desc: "将指定法力的颜色转换为黄色。获得 [魔法 + 3] 黄金。",
    // 「将指定法力的颜色转换为黄色」= transform(CHOSEN, X)（7062 先例）；「获得黄金」= gainGold（§10 战场经济入账）
    build: skill(
      transform(CHOSEN, BaseColor.Yellow),
      gainGold(3, 1),
    ),
  },
  {
    id: 7018,
    desc: "对一名敌人造成 [魔法 + 2] 点伤害。然后为所有其他盟友提供相当于其法力值消耗四分之一的法力值。",
    // 「相当于其法力值消耗四分之一的法力值」= mana fraction 1/4（R12 原语，逐目标按各自 manaCost 现算）
    build: skill(
      dmg('enemyChosen', 2, 1),
      mana('allyOthers', 0, 0, { fraction: 0.25 }),
    ),
  },
  {
    id: 7037,
    desc: "窃取 1 名敌军 [魔法 + 1] 点生命值。创造 5 颗紫色宝石。获得 [魔法 + 1] 个灵魂。",
    // 「窃取生命」= dmg + drain（7302 口径）；「获得灵魂」= gainSouls（§10）
    build: skill(
      // sa-F2 fix round A (R001): native CreateGems 5 Purple ; StealLife ; GiveSouls
      createGems(BaseColor.Purple, 5),
      dmg('enemyChosen', 1, 1, { drain: true }),
      gainSouls(1, 1),
    ),
  },
  {
    id: 7040,
    desc: "摧毁 [魔法 + 1] 颗指定颜色的宝石。有 40% 的几率可获得 100 黄金。",
    // 「指定颜色的宝石」= 随机 N 颗限色（include color, CHOSEN）；「40% 获得 100 黄金」= gainGold + chance
    build: skill(
      destroyRandomGems(1, 1, 'color', CHOSEN),
      gainGold(100, 0, { chance: 0.4 }),
    ),
  },
  {
    id: 7053,
    desc: "对 1 名敌人造成 [魔法 + 2] 点伤害，并将所有蓝色宝石转换成红色以增强伤害效果。获得 [魔法 + 2] 个灵魂。  [2:1]",
    // 转换段前移供 transformedGems 计数（batch-25 清除段前移同口径）；[2:1] = ratio 2:1 transformedGems
    build: skill(
      // sa-F2 fix round A (R001): native CountGems Blue ; Damage ; ConvertGems Blue>Red ; GiveSouls
      dmg('enemyChosen', 2, 1, {
    modifier: { mod: { kind: 'ratio', a: 2, b: 1 }, source: { kind: 'boardGems', color: BaseColor.Blue } },
  }),
      transform(BaseColor.Blue, BaseColor.Red),
      gainSouls(2, 1),
    ),
  },
  {
    id: 7154,
    desc: "摧毁 [魔法 + 4] 颗指定颜色的宝石。获得 5 黄金，同时有 20% 的几率可获得一张藏宝图。",
    // 藏宝图 = gainMaps（§11.4）；「20% 几率」= chance
    build: skill(
      destroyRandomGems(4, 1, 'color', CHOSEN),
      gainGold(5),
      gainMaps(1, 0, { chance: 0.2 }),
    ),
  },
  {
    id: 7163,
    desc: "将所有骷髅头转换成选定的法力颜色。获得 [魔法 + 5] 黄金。",
    // 「所有骷髅头转换成选定颜色」= transform(SKULL, CHOSEN)（transform 两端 SKULL 先例）
    build: skill(
      transform('SKULL', CHOSEN),
      gainGold(5, 1),
    ),
  },
  {
    id: 7164,
    desc: "对 1 名敌人造成 [魔法 + 4] 点伤害。如果敌人是不死族，则造成三倍伤害。获得 [魔法 + 4] 个灵魂。",
    // 「若敌人是不死族则三倍伤害」= condMult targetRace（§条件倍率）
    build: skill(
      dmg('enemyChosen', 4, 1, { condMult: { times: 3, cond: { kind: 'targetRace', race: 'Undead' } } }),
      gainSouls(4, 1),
    ),
  },
  {
    id: 7182,
    desc: "创造 11 颗指定盟友的法力颜色的宝石。净化盟友并给他  [(魔法 x 1.5) + 2] 点生命值。",
    // 【挽救】「指定盟友的法力颜色」= createGems LAST_TARGET（首段回退 chosenTargetId，r17 9745 口径）；净化+治疗可表达
    build: skill(
      createGems('LAST_TARGET', 11),
      cleanse('allyChosen'),
      heal('allyChosen', 2, 1.5),
    ),
  },
  {
    id: 7231,
    desc: "减除一名敌人最多 25 点护甲值。创造 9 颗骷髅头，数量因被减除的护甲值而增强。获得 [魔法] 点护甲值。 [4:1]",
    // 【挽救】「数量因被减除的护甲值而增强」= lastReduce 来源（Wave4 落地，r17 7507 同款）；[4:1] = ratio 4:1 lastReduce
    build: skill(
      reduce('enemyChosen', 'armor', 25, 0),
      createSkulls(9, 0, {
    modifier: { mod: { kind: 'ratio', a: 4, b: 1 }, source: { kind: 'lastReduce' } },
  }),
      armor('allySelf', 0, 1),
    ),
  },
  {
    id: 7316,
    desc: "对所有敌人造成  [魔法 + 9] 点散射伤害。魅惑一名随机敌人。若自身的生命值受损，赐福 化所有的盟友，或所有盟友获得 3 点魔力值。",
    // 「若自身生命值受损，二选一」= oneOf 两支各挂 selfHpDamaged（§9.3 + 全局条件）
    build: skill(
      dmg('enemyAll', 9, 1, { range: 'all' }),
      inflict('charm', 'enemyRandom'),
      oneOf(
    [inflict('blessed', 'allyAll', { ifCond: { kind: 'selfHpDamaged' } })],
    [magic('allyAll', 3, 0, { ifCond: { kind: 'selfHpDamaged' } })],
  )
    ),
  },
  {
    id: 7332,
    desc: "对所有敌人施放法力灼烧，伤害值因自身魔力值而增强。如果板面上有 13 颗或更多蓝色宝石，则获得一个额外回合。",
    // Native ManaBurn: Magic + each enemy Mana; no drain. Blue threshold is handled separately.
    build: skill(
      dmg('enemyAll', 0, 1, { manaBurn: true }),
      extraTurn({ ifCond: { kind: 'boardAtLeast', color: BaseColor.Blue, n: 13 } }),
    ),
  },
  {
    id: 7364,
    desc: "将一名敌人拉到首位并将之击晕。",
    // 「拉到首位」= reposition front（§12.1）；「之」= lastTarget 跨段绑定
    // Native order CauseStun -> Delay -> TroopOrderFront (rulings/R001, L5-013).
    build: skill(
      inflict('stun', 'enemyChosen'),
      reposition('lastTarget', 'front'),
    ),
  },
  {
    id: 7377,
    desc: "随机爆破 [(魔法 / 2) + 3] 颗宝石。对所有敌人造成 8 点伤害，伤害值因龙族盟友数而增强。获得 15 个灵魂。 [x3]",
    // 「因龙族盟友数而增强 [x3]」= alliesOfRace Dragon ×3（ alliesOfRace 既有来源）
    build: skill(
      explodeRandomGems(3, 0.5),
      dmg('enemyAll', 8, 0, {
    range: 'all',
    modifier: { mod: { kind: 'multiplier', a: 3 }, source: { kind: 'alliesOfRace', race: 'Dragon' } },
  }),
      gainSouls(15),
    ),
  },
  {
    id: 7391,
    desc: "对一名敌人造成 [魔法 + 4] 点伤害，伤害值因白盔国盟友和天使宝石而增强。获得屏障。 [x5]",
    // 【挽救】「因白盔国盟友和天使宝石而增强 [x5]」= alliesOfKingdom（Wave4）+ boardSpecial angelGem 双来源（旧卡点均已落地）
    build: skill(
      dmg('enemyChosen', 4, 1, {
    modifier: {
      mod: { kind: 'multiplier', a: 5 },
      sources: [
        { kind: 'alliesOfKingdom', kingdom: 3014 },
        { kind: 'boardSpecial', gem: 'angelGem' },
      ],
    },
  }),
      inflict('barrier', 'allySelf'),
    ),
  },
  {
    id: 7417,
    desc: "所有盟友盗贼获得 [魔法 + 1] 点攻击力。给予 10 黄金，黄金数量因盟友盗贼数而增强。 [x5]",
    // 「所有盟友盗贼」= targetRace Rogue 逐目标过滤；「因盟友盗贼数 [x5]」= alliesOfRace ×5 挂 gainGold（CountArmyType 500 = ×5，r11 编码）
    build: skill(
      attack('allyAll', 1, 1, { targetRace: 'Rogue' }),
      gainGold(10, 0, {
    modifier: { mod: { kind: 'multiplier', a: 5 }, source: { kind: 'alliesOfRace', race: 'Rogue' } },
  }),
    ),
  },
  {
    id: 7419,
    desc: "对所有敌人造成 [魔法 + 5] 点散射伤害，并因所收集到的黄金数量而增强。 [3:1]",
    // 裸散射 = 全体散射（§0 官方口径）；「因所收集到的黄金 [3:1]」= battleGold（§10 来源）
    build: skill(
      dmg('enemyAll', 5, 1, {
    range: 'all',
    modifier: { mod: { kind: 'ratio', a: 3, b: 1 }, source: { kind: 'battleGold' } },
  }),
    ),
  },
  {
    id: 7422,
    desc: "对 1 名敌人造成 [魔法 + 4] 点伤害，伤害值因收集到的黄金数量而增强。获得 15 黄金。 [2:1]",
    // 「因收集到的黄金 [2:1]」= battleGold ratio 2:1；「获得 15 黄金」= gainGold
    build: skill(
      dmg('enemyChosen', 4, 1, {
    modifier: { mod: { kind: 'ratio', a: 2, b: 1 }, source: { kind: 'battleGold' } },
  }),
      gainGold(15),
    ),
  },
  {
    id: 7428,
    desc: "对 1 名敌人造成 [魔法 + 4] 点伤害，伤害值因收集到的灵魂数量而增强。获得 10 个灵魂。 [2:1]",
    // 「因收集到的灵魂 [2:1]」= battleSouls ratio 2:1；「获得 10 灵魂」= gainSouls
    build: skill(
      dmg('enemyChosen', 4, 1, {
    modifier: { mod: { kind: 'ratio', a: 2, b: 1 }, source: { kind: 'battleSouls' } },
  }),
      gainSouls(10),
    ),
  },
  {
    id: 7443,
    desc: "将黄色宝石转换为紫色。对 1 名敌人造成 [魔法 + 1] 点伤害，伤害值因所获得的灵魂数量而增强。获得 20 个灵魂。 [1:1]",
    // 「因所获得的灵魂数 [1:1]」= battleSouls ratio 1:1；「获得 20 灵魂」= gainSouls
    build: skill(
      // sa-F2 fix round A (R001): native CountMySouls ; Damage ; ConvertGems Yellow>Purple ; GiveSouls 20
      dmg('enemyChosen', 1, 1, {
    modifier: { mod: { kind: 'ratio', a: 1, b: 1 }, source: { kind: 'battleSouls' } },
  }),
      transform(BaseColor.Yellow, BaseColor.Purple),
      gainSouls(20),
    ),
  },
  {
    id: 7473,
    desc: "给予一名盟友 2 点魔力值，给予其自身一半的法力值并赋予法印效果。 [2:1]",
    // 「一半的法力值」= mana halve（§9.6，按其自身 manaCost 现算）；[2:1] = 减半比率序列化（r15 口径）
    // sa-F1 (R001): native CountManaCost → CauseEnchanted → GenerateMana (half cost) → IncreaseSpellPower 2.
    build: skill(
      inflict('enchanted', 'allyChosen'),
      mana('allyChosen', 0, 0, { halve: true }),
      magic('allyChosen', 2, 0),
    ),
  },
  {
    id: 7474,
    desc: "对所有敌人造成 [(魔法 / 2) + 5] 点伤害。赋予一名随机盟友法印效果。",
    // 法印 = enchanted（R10 正面状态批）
    build: skill(
      dmg('enemyAll', 5, 0.5, { range: 'all' }),
      inflict('enchanted', 'allyRandom'),
    ),
  },
  {
    id: 7475,
    desc: "净化一名盟友，赋予他法印效果，并给予 [魔法 + 1] 点生命值。",
    // 「净化、法印、生命」三段同一 chosen 盟友
    build: skill(
      cleanse('allyChosen'),
      inflict('enchanted', 'allyChosen'),
      heal('allyChosen', 1, 1),
    ),
  },
  {
    id: 7476,
    desc: "创造 11 颗指定盟友的法力颜色的宝石并将他杀死。召唤一名随机的骑士。",
    // 【挽救】「指定盟友的法力颜色」= LAST_TARGET 回退；「将其杀死」= sacrifice（即杀己方唯一原语，p39 7408 口径）；「随机骑士」= Knight 全池
    build: skill(
      createGems('LAST_TARGET', 11),
      sacrifice('allyChosen'),
      summonRandom(KNIGHT_REFS),
    ),
  },
  {
    id: 7478,
    desc: "对所有敌人造成 [魔法 + 4] 点伤害，伤害值因选定的颜色数量而增强，然后移除该指定颜色宝石。召唤一只银天龙。 [2:1]",
    // 【挽救】EN 原句顺序「Remove all Gems of a chosen Color」在前——destroyColor(CHOSEN) 前移后 destroyedGems 即「移除的宝石数」；[2:1] = ratio 2:1
    // Native (R001, sa-F1): CountGems chosen 50 → Damage@AllEnemies +count → RemoveColor → summon.
    build: skill(
      dmg('enemyAll', 4, 1, {
    range: 'all',
    modifier: { mod: { kind: 'ratio', a: 2, b: 1 }, source: { kind: 'boardGems', color: 'CHOSEN' } },
  }),
      destroyColor(CHOSEN),
      summonRef('SilverDrakon', 6321),
    ),
  },
  {
    id: 7509,
    desc: "创造 15 颗黄色和绿色宝石。消除所有敌人的正面增益效果。",
    // 「15 颗黄色和绿色宝石」= createMix 逐颗掷色；「消除所有敌人正面增益」= 按正面状态逐一驱散（§6 口径）
    build: skill(
      createMix([BaseColor.Yellow, BaseColor.Green], 15),
      ...dispelPositives('enemyAll'),
    ),
  },
  {
    id: 7513,
    desc: "摧毁一组行跟列。获得 [魔法 + 1] 黄金，黄金数量因摧毁的红色宝石数而增强。 [x10]",
    // 「一组行跟列」= 随机一行 + 随机一列（r17 7433 随机行同款）；[x10] = destroyedGems Red ×10
    build: skill(
      // sa-A r3: native Target Board + BoardTarget RowAndColumn = the chosen cell's row and column (was random row + random col)
      destroyChosenCross(),
      gainGold(1, 1, {
    modifier: { mod: { kind: 'multiplier', a: 10 }, source: { kind: 'destroyedGems', color: BaseColor.Red } },
  }),
    ),
  },
  {
    id: 7515,
    desc: "消除所有敌人的正面增益效果。魅惑一名随机敌人。打乱板面并获得额外的一回合。",
    // 「魅惑」= charm；「弄乱板面」= shuffleBoard（§9.9）
    build: skill(
      ...dispelPositives('enemyAll'),
      inflict('charm', 'enemyRandom'),
      shuffleBoard(),
      extraTurn(),
    ),
  },
  {
    id: 7523,
    desc: "爆破一颗宝石。每摧毁一颗紫色宝石，则赋予一名随机盟友狂怒状态。创造 6 颗骷髅头。 [1:1]",
    // 【挽救】「每摧毁一颗紫色宝石则赋予狂怒」= perDestroyed（Wave4）；狂怒官方步骤 CauseEnrage → enraged（R10 拼写口径）；[1:1] = 驱动比率序列化
    build: skill(
      explodeAt(CELL),
      inflict('enraged', 'allyAll', { perDestroyed: { color: BaseColor.Purple } }),
      createSkulls(6),
    ),
  },
  {
    id: 7528,
    desc: "召唤骸骨风暴。消除所有敌人正面增益效果，并召唤一个随机不死族军队。",
    // 骸骨风暴 = createStorm Brown + dropKind skull（§9.1）；随机不死族 = troopTypes Undead 全池
    build: skill(
      createStorm(BaseColor.Brown, { dropKind: 'skull' }),
      ...dispelPositives('enemyAll'),
      summonRandom(UNDEAD_REFS),
    ),
  },
  {
    id: 7539,
    desc: "对 1 名敌人造成 [魔法 + 4] 点溅射伤害，伤害值因蛮族盟友数而增强。窃取所有受法术伤害的敌人 1  点魔力值，再燃烧所有敌人。 [x6]",
    // 【挽救】「所有受法术伤害的敌人」= 溅射对集拆两段（r11 8485 口径：enemyChosen + enemyChosenAndAdjacent）；「因蛮族盟友数 [x6]」= alliesOfRace Wildfolk
    build: skill(
      dmgSplash('enemyChosen', 4, 1, {
    modifier: { mod: { kind: 'multiplier', a: 6 }, source: { kind: 'alliesOfRace', race: 'Wildfolk' } },
  }),
      steal('enemyChosen', 'magic', 'magic', 1, 0),
      steal('enemyChosenAndAdjacent', 'magic', 'magic', 1, 0),
      inflict('burning', 'enemyAll'),
    ),
  },
  {
    id: 7553,
    desc: "爆破一颗宝石。消除一名随机敌人的所有正面增益效果并造成 [魔法 + 4] 点真实伤害，伤害值因被摧毁的蓝色宝石数而增强。 [x4]",
    // 「消除一名随机敌人…并对其造成」= lastTarget 跨段绑定；[x4] = destroyedGems Blue ×4
    // sa-P P-F2-precount-explode: native CountGems Blue 400 Block3x3 (step 0) -> Dispel -> TrueDamage [counter]
    // -> ExplodeGems SingleGem (last): count the Blue gems in the 3x3 around the chosen cell before the explosion.
    build: skill(
      // sa-F2 fix round A: one random enemy for Dispel + TrueDamage@FromPrevious (the old per-status
      // dispelPositives('enemyRandom') re-rolled the target for every status and skipped holders)
      ...POSITIVE_STATUSES.map((statusId, i) => dispelStatus(statusId, i === 0 ? 'enemyRandom' : 'lastTarget')),
      trueDmg('lastTarget', 4, 1, {
    modifier: { mod: { kind: 'multiplier', a: 4 }, source: { kind: 'chosenCellBlockGems', color: BaseColor.Blue } },
  }),
      explodeAt(CELL),
    ),
  },
  {
    id: 7554,
    desc: "将所有蓝色宝石转换为指定颜色。为一名随机盟友赋予法印效果并给予 3 点魔力值。",
    // 「转换为指定颜色」= transform(Blue, CHOSEN)；「其」= lastTarget
    build: skill(
      transform(BaseColor.Blue, CHOSEN),
      inflict('enchanted', 'allyRandom'),
      magic('lastTarget', 3, 0),
    ),
  },
  {
    id: 7560,
    desc: "消除所有敌人全部正面增益效果，并减除 [(魔法 / 2) + 1] 点随机技能值，数量因蓝色宝石数而增强。爆破所有蓝色宝石。 [4:1]",
    // 「消除随机技能值」= reduce stat random（R12 DecreaseRandom 原语）；[4:1] = boardGems Blue ratio
    build: skill(
      ...dispelPositives('enemyAll'),
      reduce('enemyAll', 'random', 1, 0.5, {
    modifier: { mod: { kind: 'ratio', a: 4, b: 1 }, source: { kind: 'boardGems', color: BaseColor.Blue } },
  }),
      explodeColor(BaseColor.Blue),
    ),
  },
  {
    id: 7562,
    desc: "消除所有敌人的正面增益效果，并对他们造成  [魔法 + 1] 点伤害，伤害值因蓝色宝石数而增强。将第一名敌人打到后方。 [3:1]",
    // 「打到后方」= reposition back（§12.1）；[3:1] = boardGems Blue ratio
    build: skill(
      ...dispelPositives('enemyAll'),
      dmg('enemyAll', 1, 1, {
    range: 'all',
    modifier: { mod: { kind: 'ratio', a: 3, b: 1 }, source: { kind: 'boardGems', color: BaseColor.Blue } },
  }),
      reposition('enemyFront', 'back'),
    ),
  },
  {
    id: 7570,
    desc: "对一名敌人造成 [魔法 + 1] 点伤害，伤害值因拥有法印效果的盟友数而增强。 [x5]",
    // EN 原句含尾句「Enchant a random ally」（ZH 机翻脱落），按 EN 原句补齐（r14 8930 EN 优先口径）；[x5] = allyStatusCount enchanted
    build: skill(
      dmg('enemyChosen', 1, 1, {
    modifier: { mod: { kind: 'multiplier', a: 5 }, source: { kind: 'allyStatusCount', statusId: 'enchanted' } },
  }),
      inflict('enchanted', 'allyRandom'),
    ),
  },
  {
    id: 7572,
    desc: "对一名敌人造成 [魔法 + 4] 点伤害。如果敌人是个魔头，则基于我已晋升的稀有度造成 3 到 5 倍伤害。获得屏障效果。",
    // 「若敌人是魔头则基于晋升 3-5 倍」= BOSS_ASC3 惰性建模（r11 ASC3 口径，区间取下限 3）
    build: skill(
      dmg('enemyChosen', 4, 1, { condMult: BOSS_ASC3 }),
      inflict('barrier', 'allySelf'),
    ),
  },
  {
    id: 7574,
    desc: "将一个指定颜色转换为黄色，并获得下列其一：赋予所有盟友法印效果，或给予所有盟友 [(魔法 / 2) + 1] 点魔力值，或净化所有盟友。",
    // 「下列其一」= 原生 Randomize A+(B-C-D-E-F)：B..F 五支等概率 = Cleanse、Enchant、Magic、
    // Cleanse、Enchant（净化 2/5、法印 2/5、魔力 1/5；L2-6416-branch-weights，非三支各 1/3）
    build: skill(
      transform(CHOSEN, BaseColor.Yellow),
      oneOf(
        [cleanse('allyAll')],
        [inflict('enchanted', 'allyAll')],
        [magic('allyAll', 1, 0.5)],
        [cleanse('allyAll')],
        [inflict('enchanted', 'allyAll')],
      ),
    ),
  },
  {
    id: 7575,
    desc: "对所有敌人造成 [魔法 + 1] 点伤害，伤害值因被赋予法印效果的盟友数而增强。 [x2]",
    // 「因被赋予法印效果的盟友数 [x2]」= allyStatusCount enchanted ×2
    build: skill(
      dmg('enemyAll', 1, 1, {
    range: 'all',
    modifier: { mod: { kind: 'multiplier', a: 2 }, source: { kind: 'allyStatusCount', statusId: 'enchanted' } },
  }),
    ),
  },
  {
    id: 7644,
    desc: "将一名敌人拉到首位。对其造成 [魔法 + 1] 点伤害，伤害值因自身的攻击力、生命值和护甲值而增强。 [3:1]",
    // 「对其」= lastTarget；[3:1] = 官方三来源计数相加（r15 8238 同款）
    build: skill(
      reposition('enemyChosen', 'front'),
      dmg('lastTarget', 1, 1, {
    modifier: {
      mod: { kind: 'ratio', a: 3, b: 1 },
      pooled: true /* CountAttackArmorLife = one native Count step (R007-1) */, sources: [
        { kind: 'selfStat', stat: 'attack' },
        { kind: 'selfStat', stat: 'hp' },
        { kind: 'selfStat', stat: 'armor' },
      ],
    },
  }),
    ),
  },
  {
    id: 7645,
    desc: "对 1 名敌人的生命值和护甲值造成 [魔法 + 1] 点伤害。移出所有蓝色宝石以增强伤害效果值。 [3:1]",
    // 【挽救】EN 原句「Remove all Blue Gems」在前（清除段前移供计数）；「对生命值和护甲值造成伤害」= 标准伤害口径（先甲后血，ZH 逐字直译）
    build: skill(
      // sa-F2 fix round A (R001): native CountGems 34 Blue ; DecreaseArmor ; TrueDamage (both counter-boosted) ;
      // RemoveColor Blue — damage to Life and Armor = armor loss + true Life damage, before the gems go
      reduce('enemyChosen', 'armor', 1, 1, { modifier: { mod: { kind: 'ratio', a: 3, b: 1 }, source: { kind: 'boardGems', color: BaseColor.Blue } } }),
      trueDmg('enemyChosen', 1, 1, { modifier: { mod: { kind: 'ratio', a: 3, b: 1 }, source: { kind: 'boardGems', color: BaseColor.Blue } } }),
      destroyColor(BaseColor.Blue),
    ),
  },
  {
    id: 7666,
    desc: "将所有红色宝石转换成骷髅头，和所有绿色宝石转换成黄色。赋予两名随机盟友法印效果。",
    // 「赋予两名随机盟友法印」= allyRandomN n:2
    build: skill(
      transform(BaseColor.Red, 'SKULL'),
      transform(BaseColor.Green, BaseColor.Yellow),
      inflict('enchanted', 'allyRandomPrefNotPrevN', { n: 2 }),
    ),
  },
  {
    id: 7669,
    desc: "摧毁 8 颗选定颜色的宝石。对每一个使用该颜色的敌人造成 [魔法 + 5] 点真实伤害。",
    // 【挽救】「摧毁 8 颗选定颜色宝石」= destroyRandomGems 限色 CHOSEN；「对每一个使用其颜色的敌人」= enemyAll + trueDamage + CHOSEN_COLOR（r11 8180 动态色口径）
    build: skill(
      destroyRandomGems(8, 0, 'color', CHOSEN),
      trueDmg('enemyAll', 5, 1, { range: 'all', ifCond: CHOSEN_COLOR }),
    ),
  },
  {
    id: 7684,
    desc: "获得 [魔法 + 1] 黄金。摧毁所有黄色宝石以增强效果。有 30% 的几率跑掉。 [1:1]",
    // 「跑掉」= escape（§10.1）；[1:1] = destroyedGems ×1 挂 gainGold（清除段前移，batch-25 口径）
    build: skill(
      destroyColor(BaseColor.Yellow),
      gainGold(1, 1, {
    modifier: { mod: { kind: 'multiplier', a: 1 }, source: { kind: 'destroyedGems' } },
  }),
      escape(0.3),
    ),
  },
  {
    id: 7687,
    desc: "对一名敌人造成 [魔法 + 4] 点伤害。如果敌人是个高塔，则基于我已晋升的稀有度造成 3 到 5 倍伤害。爆破 3 颗棕色宝石。",
    // 「若敌人是高塔则基于晋升 3-5 倍」= CASTLE_ASC3（r16 MultiplyForAscensionCastle 口径）
    build: skill(
      dmg('enemyChosen', 4, 1, { condMult: CASTLE_ASC3 }),
      explodeRandomGems(3, 0, 'color', BaseColor.Brown),
    ),
  },
  {
    id: 7689,
    desc: "对一名敌人造成 [魔法 + 4] 点伤害，伤害值因黄金数而增强。如果敌人是个魔头，则基于我已晋升的稀有度造成 3 到 5 倍伤害。 [3:1]",
    // 「因黄金数 [3:1]」= battleGold ratio 3:1
    build: skill(
      dmg('enemyChosen', 4, 1, {
    modifier: { mod: { kind: 'ratio', a: 3, b: 1 }, source: { kind: 'battleGold' } },
    condMult: BOSS_ASC3,
  }),
    ),
  },
  {
    id: 7691,
    desc: "对一名敌人造成 [魔法 + 4] 点伤害。如果敌人是个魔头，则基于我已晋升的稀有度造成 3 到 5 倍伤害。冻结一名随机敌人。",
    // 魔头晋升惰性建模（r11 口径）
    build: skill(
      dmg('enemyChosen', 4, 1, { condMult: BOSS_ASC3 }),
      inflict('frozen', 'enemyRandom'),
    ),
  },
  {
    id: 7694,
    desc: "对一名敌人造成 [魔法 + 4] 点伤害。如果敌人是个高塔，则基于我已晋升的稀有度造成 3 到 5 倍伤害。获得狂怒状态。",
    // 「获得狂怒」= enraged（官方 CauseEnrage，R10 口径）
    build: skill(
      dmg('enemyChosen', 4, 1, { condMult: CASTLE_ASC3 }),
      inflict('enraged', 'allySelf'),
    ),
  },
  {
    id: 7699,
    desc: "对一名敌人造成 [魔法 + 4] 点伤害。如果敌人是个魔头，则基于我已晋升的稀有度造成 3 到 5 倍伤害。召唤一名随机不死族。",
    // 「召唤一名随机不死族」= Undead 全池（batch-w02 大池先例）
    build: skill(
      dmg('enemyChosen', 4, 1, { condMult: BOSS_ASC3 }),
      summonRandom(UNDEAD_REFS),
    ),
  },
  {
    id: 7701,
    desc: "对一名敌人造成 [魔法 + 4] 点伤害。如果敌人是个高塔，则基于我已晋升的稀有度造成 3 到 5 倍伤害。缠绕一名随机敌人。",
    // 「缠绕一名随机敌人」= entangle
    build: skill(
      dmg('enemyChosen', 4, 1, { condMult: CASTLE_ASC3 }),
      inflict('entangle', 'enemyRandom'),
    ),
  },
  {
    id: 7706,
    desc: "对一名敌人造成 [魔法 + 4] 点伤害。如果敌人是个魔头，则基于我已晋升的稀有度造成 3 到 5 倍伤害。有 50% 的几率召唤伊莎贝拉女王。",
    // 「50% 召唤伊莎贝拉女王」= summonRef + chance
    build: skill(
      dmg('enemyChosen', 4, 1, { condMult: BOSS_ASC3 }),
      summonRef('QueenYsabelle', 6259, { chance: 0.5 }),
    ),
  },
  {
    id: 7709,
    desc: "对一名敌人造成 [魔法 + 4] 点伤害。如果敌人是个高塔，则基于我已晋升的稀有度造成 3 到 5 倍伤害。若自身生命值受损，则赋予所有盟友屏障效果。 ",
    // 「若自身生命值受损」= selfHpDamaged 全局条件
    build: skill(
      dmg('enemyChosen', 4, 1, { condMult: CASTLE_ASC3 }),
      inflict('barrier', 'allyAll', { ifCond: { kind: 'selfHpDamaged' } }),
    ),
  },
  {
    id: 7710,
    desc: "净化所有盟友。击晕所有恶魔与不死族，并消除其所有正面增益效果。获得一个额外回合。",
    // 「恶魔与不死族敌人」= anyOf 种族析取逐目标过滤（r15 7708 同款）
    build: skill(
      cleanse('allyAll'),
      ...dispelPositives('enemyAll', DAEMON_OR_UNDEAD),
      inflict('stun', 'enemyAll', { ifCond: DAEMON_OR_UNDEAD }),
      extraTurn(),
    ),
  },
  {
    id: 7720,
    desc: "对一名敌人造成 [魔法 + 3] 点伤害并消除其所有正面增益效果。获得 4 点魔力值和法印效果。",
    // 原生步骤序 Dispel → Damage → IncreaseSpellPower → CauseEnchanted（R001：先驱散屏障再伤害）
    build: skill(
      ...dispelPositives('enemyChosen'),
      dmg('enemyChosen', 3, 1),
      magic('allySelf', 4, 0),
      inflict('enchanted', 'allySelf'),
    ),
  },
  {
    id: 7725,
    desc: "对一名敌人造成 [魔法 + 4] 点伤害。如果敌人是个魔头，则基于我已晋升的稀有度造成 3 到 5 倍伤害。获得一个额外回合。",
    // 魔头晋升惰性建模（r11 口径）
    build: skill(
      dmg('enemyChosen', 4, 1, { condMult: BOSS_ASC3 }),
      extraTurn(),
    ),
  },
  {
    id: 7727,
    desc: "对一名敌人造成 [魔法 + 4] 点伤害。如果敌人是个高塔，则基于我已晋升的稀有度造成 3 到 5 倍伤害。随机摧毁一行。",
    // 「随机摧毁一行」= destroyRandomRows
    build: skill(
      dmg('enemyChosen', 4, 1, { condMult: CASTLE_ASC3 }),
      destroyRandomRows(1),
    ),
  },
  {
    id: 7731,
    desc: "对一名敌人造成 [魔法 + 4] 点伤害。如果敌人是个魔头，则基于我已晋升的稀有度造成 3 到 5 倍伤害。获得 6 点生命值。",
    // 魔头晋升惰性建模（r11 口径）
    build: skill(
      dmg('enemyChosen', 4, 1, { condMult: BOSS_ASC3 }),
      heal('allySelf', 6, 0),
    ),
  },
  {
    id: 7733,
    desc: "对一名敌人造成 [魔法 + 4] 点伤害。如果敌人是个高塔，则基于我已晋升的稀有度造成 3 到 5 倍伤害。将所有盟友的护甲值提高 8 点。",
    // 「所有盟友护甲 +8」
    build: skill(
      dmg('enemyChosen', 4, 1, { condMult: CASTLE_ASC3 }),
      armor('allyAll', 8, 0),
    ),
  },
  {
    id: 7736,
    desc: "将所有绿色宝石转换成蓝色。给予 [魔法 + 1] 黄金。",
    // 「给予黄金」= gainGold（§10 元经济入账口径）
    build: skill(
      transform(BaseColor.Green, BaseColor.Blue),
      gainGold(1, 1),
    ),
  },
  {
    id: 7737,
    desc: "对一名敌人造成 [魔法 + 4] 点伤害。如果敌人是个魔头，则基于我已晋升的稀有度造成 3 到 5 倍伤害。若敌人身亡，则获得 12 点法力值。",
    // 「若敌人身亡获得 12 法力」= ifTargetDied（官方 AddForKill，单目标精确判定）
    build: skill(
      dmg('enemyChosen', 4, 1, { condMult: BOSS_ASC3 }),
      mana('allySelf', 12, 0, { ifTargetDied: true }),
    ),
  },
  {
    id: 7739,
    desc: "对一名敌人造成 [魔法 + 4] 点伤害。如果敌人是个高塔，则基于我已晋升的稀有度造成 3 到 5 倍伤害。获得 4 点攻击力。",
    // 塔晋升惰性建模（r16 口径）
    build: skill(
      dmg('enemyChosen', 4, 1, { condMult: CASTLE_ASC3 }),
      attack('allySelf', 4, 0),
    ),
  },
  {
    id: 7744,
    desc: "对一名敌人造成 [魔法 + 4] 点伤害。如果敌人是个魔头，则基于我已晋升的稀有度造成 3 到 5 倍伤害。窃取 4 点攻击力并将之转换成魔力值。 [1:1]",
    // 「窃取攻击并转换成魔法」= steal armor→magic；[1:1] = 转换比率序列化（r15 7032 口径）
    build: skill(
      // sa-F3：原生序 CountAttack → DecreaseAttack → IncreaseSpellPower → Damage（R001：伤害吃到偷来的魔法）
      steal('enemyChosen', 'attack', 'magic', 4, 0),
      dmg('enemyChosen', 4, 1, { condMult: BOSS_ASC3 }),
    ),
  },
  {
    id: 7745,
    desc: "对一名敌人造成 [魔法 + 3] 点伤害，伤害值因已方的妖仙和野兽盟友数而增强。获得 5 个灵魂。 [x4]",
    // 「因妖仙和野兽盟友数 [x4]」= 双来源各 ×4（r16 9875 双计数口径）
    build: skill(
      dmg('enemyChosen', 3, 1, {
    modifier: {
      mod: { kind: 'multiplier', a: 4 },
      sources: [
        { kind: 'alliesOfRace', race: 'Fey' },
        { kind: 'alliesOfRace', race: 'Beast' },
      ],
    },
  }),
      gainSouls(5),
    ),
  },
  {
    id: 7746,
    desc: "减除一名敌人全部护甲值，并造成 [魔法 + 2] 点伤害。如果敌人是个高塔，则基于我已晋升的稀有度造成 3 到 5 倍伤害。",
    // 「减除全部护甲」= drainAll（§3）
    build: skill(
      reduce('enemyChosen', 'armor', 0, 0, { drainAll: true }),
      dmg('enemyChosen', 2, 1, { condMult: CASTLE_ASC3 }),
    ),
  },
  {
    id: 7773,
    desc: "对一名敌人造成 [魔法 + 4] 点伤害。如果敌人是个高塔，则基于我已晋升的稀有度造成 3 到 5 倍伤害。窃取 6 点法力值。",
    // 「窃取 6 法力」= steal mana→mana
    // sa-F1 (R001): native s0 StealMana 6 runs before s1 Damage.
    build: skill(
      steal('enemyChosen', 'mana', 'mana', 6, 0),
      dmg('enemyChosen', 4, 1, { condMult: CASTLE_ASC3 }),
    ),
  },
  {
    id: 7777,
    desc: "对一名敌人造成 [魔法 + 4] 点伤害。如果敌人是个魔头，则基于我已晋升的稀有度造成 3 到 5 倍伤害。将所有红色宝石转换成棕色。",
    // 魔头晋升惰性建模（r11 口径）
    build: skill(
      dmg('enemyChosen', 4, 1, { condMult: BOSS_ASC3 }),
      transform(BaseColor.Red, BaseColor.Brown),
    ),
  },
  {
    id: 7779,
    desc: "对一名敌人造成 [(魔法 / 2) + 8] – [魔法 + 16] 点伤害。如果敌人是个高塔，则基于我已晋升的稀有度造成 3 到 5 倍伤害。",
    // 「[(M/2)+8] – [M+16]」= 伤害区间 rangeSpec（§12.2 原语）
    build: skill(
      dmg('enemyChosen', 0, 0, {
    rangeSpec: { min: { base: 8, mult: 0.5 }, max: { base: 16, mult: 1 } },
    condMult: CASTLE_ASC3,
  }),
    ),
  },
  {
    id: 7782,
    desc: "对所有敌人造成 [魔法 + 3] 点伤害。赋予所有恶魔盟友法印效果，也赋予所有秘士盟友屏障效果。",
    // 「所有恶魔盟友法印 / 秘士盟友屏障」= targetRace 逐目标过滤
    build: skill(
      dmg('enemyAll', 3, 1, { range: 'all' }),
      inflict('enchanted', 'allyAll', { targetRace: 'Daemon' }),
      inflict('barrier', 'allyAll', { targetRace: 'Mystic' }),
    ),
  },
  {
    id: 7784,
    desc: "对一名敌人造成 [魔法 + 2] 点伤害，伤害值因自身的生命值而增强。如果敌人是个魔头，则基于我已晋升的稀有度造成 3 到 5 倍伤害。 [3:1]",
    // 「因自身生命值 [3:1]」= selfStat hp
    build: skill(
      dmg('enemyChosen', 2, 1, {
    modifier: { mod: { kind: 'ratio', a: 3, b: 1 }, source: { kind: 'selfStat', stat: 'hp' } },
    condMult: BOSS_ASC3,
  }),
    ),
  },
  {
    id: 7786,
    desc: "对一名敌人造成 [魔法 + 4] 点伤害。如果敌人是个高塔，则基于我已晋升的稀有度造成 3 到 5 倍伤害。赋予两名随机盟友法印效果。",
    // 「赋予两名随机盟友法印」
    build: skill(
      dmg('enemyChosen', 4, 1, { condMult: CASTLE_ASC3 }),
      inflict('enchanted', 'allyRandomPrefNotPrevN', { n: 2 }),
    ),
  },
  {
    id: 7795,
    desc: "对一名敌人造成 [魔法 + 4] 点伤害。如果敌人是个高塔，则基于我已晋升的稀有度造成 3 到 5 倍伤害。爆破 3 颗红色宝石。",
    // 「爆破 3 颗红色宝石」= 随机限色
    build: skill(
      dmg('enemyChosen', 4, 1, { condMult: CASTLE_ASC3 }),
      explodeRandomGems(3, 0, 'color', BaseColor.Red),
    ),
  },
  {
    id: 7809,
    desc: "获得等同于我生命值的黄金。获得 [魔法 + 1] 点生命值。获得一个额外回合。 [1:1]",
    // 「获得等同于我生命值的黄金 [1:1]」= gainGold + selfStat hp（§10 经济来源）
    build: skill(
      gainGold(0, 0, {
    modifier: { mod: { kind: 'multiplier', a: 1 }, source: { kind: 'selfStat', stat: 'hp' } },
  }),
      heal('allySelf', 1, 1),
      extraTurn(),
    ),
  },
  {
    id: 7936,
    desc: "将所有绿色宝石转换成紫色。给予最强大的盟友法印效果。",
    // 「最强大的盟友」= allyHealthiest
    build: skill(
      transform(BaseColor.Green, BaseColor.Purple),
      inflict('enchanted', 'allyHealthiest'),
    ),
  },
  {
    id: 7941,
    desc: "爆破一列。获得 [魔法 + 1] 点生命值。若敌方有军队陷入沉默状态，则给予所有其他盟友法印效果。",
    // 「爆破一行（列）」EN=Explode a column → explodeRandomCols；「若任一敌人沉默」= anyEnemyStatus
    build: skill(
      // sa-F2 fix round A (R001): native IncreaseHealth before ExplodeGems BoardTarget Column (chosen column,
      // English "Explode a column"; was a random column)
      heal('allySelf', 1, 1),
      explodeChosenCol(),
      inflict('enchanted', 'allyOthers', { ifCond: { kind: 'anyEnemyStatus', statusId: 'silence' } }),
    ),
  },
  {
    id: 7946,
    desc: "给予 20 黄金。",
    // 「给予 20 黄金」= gainGold（§10）
    build: skill(
      gainGold(20),
    ),
  },
  {
    id: 7953,
    desc: "摧毁 [(魔法 / 2) + 1] 颗随机宝石，数量因自身的黄金数而增强。获得 10 黄金。召唤龙蛋。 [3:1]",
    // 「数量因自身黄金数 [3:1]」= battleGold ratio 挂随机摧毁数（randomGems count 走 evaluateWithModifier）；「召唤龙蛋」= DragonEggs（troops.json 6230）
    build: skill(
      destroyRandomGems(1, 0.5, 'all', undefined, {
    modifier: { mod: { kind: 'ratio', a: 3, b: 1 }, source: { kind: 'battleGold' } },
  }),
      gainGold(10),
      summonRef('DragonEggs', 6230),
    ),
  },
  {
    id: 7954,
    desc: "对一名敌人造成 [魔法 + 4] 点伤害，伤害值因自身的护甲值而增强。如果敌人是个魔头，则基于我已晋升的稀有度造成 3 到 5 倍伤害。自身一项随机属性获得 3 点。 [3:1]",
    // 「因自身护甲 [3:1]」= selfStat armor；「随机技能值 +3」= randomStat
    build: skill(
      dmg('enemyChosen', 4, 1, {
    modifier: { mod: { kind: 'ratio', a: 3, b: 1 }, source: { kind: 'selfStat', stat: 'armor' } },
    condMult: BOSS_ASC3,
  }),
      randomStat('allySelf', 3, 0, { oneSkill: true }),
    ),
  },
  {
    id: 7957,
    desc: "给予所有盟友 [魔法 + 1] 点生命值和护甲值。创造光风暴并赋予所有人类军队法印效果。",
    // 「光风暴」= createStorm Yellow（§9.1 色表）；「所有人类军队法印」= targetRace Human
    build: skill(
      heal('allyAll', 1, 1),
      armor('allyAll', 1, 1),
      createStorm(BaseColor.Yellow),
      inflict('enchanted', 'allyAll', { targetRace: 'Human' }),
    ),
  },
  {
    id: 7958,
    desc: "对一名敌人造成 [魔法 + 3] 点伤害。爆破 1 颗宝石，数量因自身的黄金数而增强。获得 10 黄金。 [5:1]",
    // 「爆破 1 颗宝石，数量因自身黄金数 [5:1]」= battleGold ratio 挂爆破数
    build: skill(
      dmg('enemyChosen', 3, 1),
      explodeRandomGems(1, 0, 'all', undefined, {
    modifier: { mod: { kind: 'ratio', a: 5, b: 1 }, source: { kind: 'battleGold' } },
  }),
      gainGold(10),
    ),
  },
  {
    id: 7959,
    desc: "对一名敌人造成 [魔法 + 4] 点伤害。如果敌人是个高塔，则基于我已晋升的稀有度造成 3 到 5 倍伤害。减除全部敌人 10 点护甲值。",
    // 「减除全部敌人 10 护甲」= reduce enemyAll
    build: skill(
      dmg('enemyChosen', 4, 1, { condMult: CASTLE_ASC3 }),
      reduce('enemyAll', 'armor', 10, 0),
    ),
  },
  {
    id: 7965,
    desc: "对一名敌人造成 [魔法 + 4] 点伤害，伤害值因陷入织网状态的敌军数量而增强。如果敌人是个魔头，则基于我已晋升的稀有度造成 3 到 5 倍伤害。 [x4]",
    // 「因织网敌军数 [x4]」= enemyStatusCount web ×4
    build: skill(
      dmg('enemyChosen', 4, 1, {
    modifier: { mod: { kind: 'multiplier', a: 4 }, source: { kind: 'enemyStatusCount', statusId: 'web' } },
    condMult: BOSS_ASC3,
  }),
    ),
  },
  {
    id: 7967,
    desc: "爆破 [(魔法 / 2) + 1] 颗绿色宝石，数量因自身的黄金数量而增强。获得 20 黄金。 [10:1]",
    // 「数量因自身黄金 [10:1]」= battleGold ratio 挂限色爆破数
    build: skill(
      explodeRandomGems(1, 0.5, 'color', BaseColor.Green, {
    modifier: { mod: { kind: 'ratio', a: 10, b: 1 }, source: { kind: 'battleGold' } },
  }),
      gainGold(20),
    ),
  },
  {
    id: 7970,
    desc: "对一名敌人造成 [魔法 + 4] 点伤害。如果敌人是个高塔，则基于我已晋升的稀有度造成 3 到 5 倍伤害。创造光风暴。",
    // 「创造光风暴」= createStorm Yellow
    build: skill(
      dmg('enemyChosen', 4, 1, { condMult: CASTLE_ASC3 }),
      createStorm(BaseColor.Yellow),
    ),
  },
  {
    id: 7975,
    desc: "对一名敌人造成 [魔法 + 4] 点伤害，伤害值因自身的攻击力、生命值和护甲值而增强。如果敌人是个魔头，则基于我已晋升的稀有度造成 3 到 5 倍伤害。 [3:1]",
    // 「因自身攻击、生命和护甲 [3:1]」= 三来源计数相加（r15 8238 口径）
    build: skill(
      dmg('enemyChosen', 4, 1, {
    modifier: {
      mod: { kind: 'ratio', a: 3, b: 1 },
      pooled: true /* CountAttackArmorLife = one native Count step (R007-1) */, sources: [
        { kind: 'selfStat', stat: 'attack' },
        { kind: 'selfStat', stat: 'hp' },
        { kind: 'selfStat', stat: 'armor' },
      ],
    },
    condMult: BOSS_ASC3,
  }),
    ),
  },
  {
    id: 7979,
    desc: "对一名敌人造成 [魔法 + 4] 点伤害。如果敌人是个高塔，则基于我已晋升的稀有度造成 3 到 5 倍伤害。魅惑一名随机敌人。",
    // 「魅惑」= charm
    build: skill(
      dmg('enemyChosen', 4, 1, { condMult: CASTLE_ASC3 }),
      inflict('charm', 'enemyRandom'),
    ),
  },
  {
    id: 7995,
    desc: "对所有敌人造成 [魔法 + 4] 点伤害，并获得下列其一：使所有敌人陷入 1 到 2 个负面状态效果，或赋予所有盟友 1 到 2 个正面增益状态效果。",
    // 「1 到 2 个状态」= 官方两步 RandomStatusEffect（100%+50%）结构（r17 9121/9717 口径）；「下列其一」= oneOf
    build: skill(
      dmg('enemyAll', 4, 1, { range: 'all' }),
      oneOf(
    [inflictRandom('enemyAll'), inflictRandom('enemyAll', { chance: 0.5 })],
    [
      inflictRandom('allyAll', { pool: 'positive' }),
      inflictRandom('allyAll', { pool: 'positive', chance: 0.5 }),
    ],
  )
    ),
  },
  {
    id: 8021,
    desc: "对一名敌人造成 [魔法 + 4] 点伤害。如果敌人是个魔头，则基于我已晋升的稀有度造成 3 到 5 倍伤害。创造 8 颗 黄色和 8 颗紫色宝石。",
    // 「8 颗黄色和 8 颗紫色」= 官方两步 CreateGems（步骤实锤）
    build: skill(
      dmg('enemyChosen', 4, 1, { condMult: BOSS_ASC3 }),
      createGems(BaseColor.Yellow, 8),
      createGems(BaseColor.Purple, 8),
    ),
  },
  {
    id: 8026,
    desc: "对一名敌人造成 [魔法 + 4] 点伤害。如果敌人是个高塔，则基于我已晋升的稀有度造成 3 到 5 倍伤害。有 30% 的几率获得一个额外的回合，和 30% 的几率重获所消耗的法力值。",
    // 「重获所消耗的法力」官方步骤 GenerateMana 12 + 30%（ZH「重获所消耗」机翻，固定 12 点）
    build: skill(
      dmg('enemyChosen', 4, 1, { condMult: CASTLE_ASC3 }),
      extraTurn({ chance: 0.3 }),
      mana('allySelf', 12, 0, { chance: 0.3 }),
    ),
  },
  {
    id: 8029,
    desc: "对一名敌人造成 [魔法 + 4] 点伤害，伤害值因骷髅头数量而增强。如果敌人是个魔头，则基于我已晋升的稀有度造成 3 到 5 倍伤害。 [x2]",
    // 「因骷髅头数量 [x2]」= boardSkulls ×2
    build: skill(
      dmg('enemyChosen', 4, 1, {
    modifier: { mod: { kind: 'multiplier', a: 2 }, source: { kind: 'boardSkulls' } },
    condMult: BOSS_ASC3,
  }),
    ),
  },
  {
    id: 8034,
    desc: "对一名敌人造成 [魔法 + 4] 点伤害。如果敌人是个高塔，则基于我已晋升的稀有度造成 3 到 5 倍伤害。创造 7 颗骷髅头。",
    // 「创造 7 颗骷髅头」
    build: skill(
      dmg('enemyChosen', 4, 1, { condMult: CASTLE_ASC3 }),
      createSkulls(7),
    ),
  },
  {
    id: 8036,
    desc: "给予一名盟友 [魔法 + 1] 点生命值，再赋予其法印和赐福效果。",
    // 「赋予法印和赐福」= enchanted + blessed（R10 批）
    build: skill(
      heal('allyChosen', 1, 1),
      inflict('enchanted', 'allyChosen'),
      inflict('blessed', 'allyChosen'),
    ),
  },
  {
    id: 8044,
    desc: "对一名敌人造成 [魔法 + 4] 点伤害，伤害值因被赋予狂怒效果的盟友数而增强。如果敌人是个魔头，则基于我已晋升的稀有度造成 3 到 5 倍伤害。赋予一名随机盟友狂怒效果。 [x2]",
    // 「因狂怒盟友数 [x2]」= allyStatusCount enraged ×2
    build: skill(
      dmg('enemyChosen', 4, 1, {
    modifier: { mod: { kind: 'multiplier', a: 2 }, source: { kind: 'allyStatusCount', statusId: 'enraged' } },
    condMult: BOSS_ASC3,
  }),
      inflict('enraged', 'allyRandom'),
    ),
  },
  {
    id: 8088,
    desc: "对一名敌人造成 [魔法 + 4] 点伤害。如果敌人是个高塔，则基于我已晋升的稀有度造成 3 到 5 倍伤害。获得 2 点法力值，数量因自身的黄金数而增强。 [3:1]",
    // 「获得 2 法力，数量因自身黄金数 [3:1]」= mana 段挂 battleGold ratio（§10 经济来源挂增益段）
    build: skill(
      dmg('enemyChosen', 4, 1, { condMult: CASTLE_ASC3 }),
      mana('allySelf', 2, 0, {
    modifier: { mod: { kind: 'ratio', a: 3, b: 1 }, source: { kind: 'battleGold' } },
  }),
    ),
  },
  {
    id: 8092,
    desc: "对一名敌人造成 [魔法 + 4] 点伤害，伤害值因黄色宝石数而增强。如果敌人是个魔头，则基于我已晋升的稀有度造成 3 到 5 倍伤害。 [2:1]",
    // 「因黄色宝石数 [2:1]」= boardGems Yellow（官方 CountGems 50 = ratio 2:1，r11 编码，尾缀一致）
    build: skill(
      dmg('enemyChosen', 4, 1, {
    modifier: { mod: { kind: 'ratio', a: 2, b: 1 }, source: { kind: 'boardGems', color: BaseColor.Yellow } },
    condMult: BOSS_ASC3,
  }),
    ),
  },
  {
    id: 8095,
    desc: "爆破一颗宝石。每爆破一颗紫色宝石则诅咒一名随机敌人。获得 [魔法 + 1] 点护甲值和 10 黄金。 [1:1]",
    // 「每爆破一颗紫色宝石则诅咒一名随机敌人」= perDestroyed（Wave4）；[1:1] = 驱动比率序列化（r17 特例口径）
    build: skill(
      explodeAt(CELL),
      inflict('curse', 'enemyAll', { perDestroyed: { color: BaseColor.Purple } }),
      armor('allySelf', 1, 1),
      gainGold(10),
    ),
  },
  {
    id: 8096,
    desc: "对一名敌人造成 [魔法 + 4] 点伤害。有 30% 的几率对一名随机敌人造成 [魔法 + 4] 点伤害。如果敌人是个高塔，则基于我已晋升的稀有度造成 3 到 5 倍伤害。",
    // 「30% 对随机敌人再伤害」= 独立段 chance；两段同挂塔晋升惰性条件（官方步骤双 StatusModifier）
    build: skill(
      dmg('enemyChosen', 4, 1, { condMult: CASTLE_ASC3 }),
      dmg('enemyRandom', 4, 1, { chance: 0.3, condMult: CASTLE_ASC3 }),
    ),
  },
  {
    id: 8100,
    desc: "对一名敌人造成 [魔法 + 4] 点伤害。如果敌人是个魔头，则基于我已晋升的稀有度造成 3 到 5 倍伤害。再打乱敌方队伍顺序。",
    // 「打乱敌方队伍顺序」= shuffleTeam enemy（§12.1，官方 TroopOrderJumble@AllEnemies）
    build: skill(
      dmg('enemyChosen', 4, 1, { condMult: BOSS_ASC3 }),
      shuffleTeam('enemy'),
    ),
  },
  {
    id: 8101,
    desc: "摧毁一行和一列。将位于前方的两名敌人的其中一名打回后方，再对前方两位敌人造成 [魔法 + 4] 点伤害，伤害值因被摧毁的绿色宝石数而增强。 [x4]",
    // 【挽救】官方步骤两轮「击退+伤害」（TroopOrderBack Front/Second + Damage FirstTwo）——reposition n 通道（Wave4）落地后可对号；ZH 压缩为一轮，按官方步骤组装
    // sa-R6 L2-6731：原生 BoardTarget RowAndColumn（spell Target Board）= 选定格所在行+列（原为随机行+随机列）；
    // Randomize AB+(CD-EF) = 击退首位敌人 或 击退第二位敌人（各 1/2），之后只打一次前两位（原为两轮全执行）。
    build: skill(
      destroyChosenCross(),
      oneOf(
        [reposition('enemyFront', 'back'), dmg('enemyFirstN', 4, 1, { n: 2, modifier: { mod: { kind: 'multiplier', a: 4 }, source: { kind: 'destroyedGems', color: BaseColor.Green } } })],
        [reposition('enemyNth', 'back', { n: 2 }), dmg('enemyFirstN', 4, 1, { n: 2, modifier: { mod: { kind: 'multiplier', a: 4 }, source: { kind: 'destroyedGems', color: BaseColor.Green } } })],
      ),
    ),
  },
  {
    id: 8104,
    desc: "对一名敌人造成 [魔法 + 4] 点伤害。如果敌人是个高塔，则基于我已晋升的稀有度造成 3 到 5 倍伤害。如果敌人身亡，所有技能值增加 7 点。",
    // 「所有技能值 +7」= 攻/甲/魔/血四段（官方 IncreaseAllStats）；「若敌人身亡」= ifTargetDied（EN 原句条件，ZH 机翻脱落）
    build: skill(
      dmg('enemyChosen', 4, 1, { condMult: CASTLE_ASC3 }),
      // sa-G: ifTargetDied only held for the first self buff -> castEnemyDied (7314 precedent, P-G-ifTargetDied-after-self)
      attack('allySelf', 7, 0, { ifCond: { kind: 'castEnemyDied' } }),
      armor('allySelf', 7, 0, { ifCond: { kind: 'castEnemyDied' } }),
      magic('allySelf', 7, 0, { ifCond: { kind: 'castEnemyDied' } }),
      heal('allySelf', 7, 0, { ifCond: { kind: 'castEnemyDied' } }),
    ),
  },
  {
    id: 8106,
    desc: "摧毁一列。对最后一名敌人造成 [魔法 + 3] 点伤害，伤害值因被摧毁的黄色宝石数而增强。再将敌人拉到首位。 [x4]",
    // sa-A r3: native Target Board + DestroyGems BoardTarget Column = chosen column (not random);
    // [x4] = CountGems 400 = destroyedGems Yellow ×4; TroopOrderFront@LastEnemy resolves at its own step (dead → new last)
    build: skill(
      destroyChosenCol(),
      dmg('enemyLast', 3, 1, {
    modifier: { mod: { kind: 'multiplier', a: 4 }, source: { kind: 'destroyedGems', color: BaseColor.Yellow } },
  }),
      reposition('enemyLast', 'front'),
    ),
  },
  {
    id: 8107,
    desc: "对一名敌人造成 [魔法 + 4] 点伤害。如果敌人是个魔头，则基于我已晋升的稀有度造成 3 到 5 倍伤害。若存在任何风暴，则赐福自身。",
    // 「若存在任何风暴」= stormPresent（§9.2）
    build: skill(
      dmg('enemyChosen', 4, 1, { condMult: BOSS_ASC3 }),
      inflict('blessed', 'allySelf', { ifCond: { kind: 'stormPresent' } }),
    ),
  },
  {
    id: 8111,
    desc: "对一名敌人造成 [魔法 + 4] 点伤害，伤害值因狮心帝国盟友数而增强。如果敌人是个高塔，则基于我已晋升的稀有度造成 3 到 5 倍伤害。 [x4]",
    // 「因狮心帝国盟友数 [x4]」= alliesOfKingdom（Wave4 来源，官方 CountArmyKingdom 3025 = ×4）
    build: skill(
      dmg('enemyChosen', 4, 1, {
    modifier: { mod: { kind: 'multiplier', a: 4 }, source: { kind: 'alliesOfKingdom', kingdom: 3025 } },
    condMult: CASTLE_ASC3,
  }),
    ),
  },
  {
    id: 8114,
    desc: "对一名敌人造成 [魔法 + 7] 点伤害，诅咒他并使其陷入叠加 2-4 倍的出血状态。",
    // 【挽救】「叠加 2-4 层出血」= 官方四步 CauseBleed（100%+100%+50%+25%）→ stacks 2 + 1 + 50% + 25%（叠层累加合并，r17 9121 同族口径）
    build: skill(
      dmg('enemyChosen', 7, 1),
      inflict('curse', 'lastTarget'),
      inflict('bleed', 'lastTarget', { stacks: 2 }),
      inflict('bleed', 'lastTarget'),
      inflict('bleed', 'lastTarget', { chance: 0.5 }),
      inflict('bleed', 'lastTarget', { chance: 0.25 }),
    ),
  },
  {
    id: 8133,
    desc: "召唤尘风暴。再选一名盟友，爆破 [魔法 + 1] 颗盟友其中一个法力颜色的宝石。",
    // 【挽救】「爆破盟友其中一个法力颜色的宝石」= explodeRandomGems 限色 LAST_TARGET（首段回退 chosenTargetId，9745 同口径）；尘风暴 = createStorm Brown
    // sa-F2 fix round A: explicit chosen-ally input (LAST_TARGET had no prior target -> nothing exploded)
    build: targetedSkill('allyChosen',
      createStorm(BaseColor.Brown),
      explodeRandomGems(1, 1, 'color', 'CHOSEN_TARGET'),
    ),
  },
  {
    id: 8144,
    desc: "对一名敌人造成 [魔法 + 4] 点伤害。所有技能值增加 3 点，增加数因自身黄金数而增强。 [5:1]",
    // 「所有技能值 +3，因自身黄金数增强」= 英文及中文 [5:1] = 每5黄金额外+1；CountMyGold Amount:20 是计数系数，非每20黄金+3（参见同快照8142/7958）
    build: skill(
      dmg('enemyChosen', 4, 1),
      attack('allySelf', 3, 0, {
    modifier: { mod: { kind: 'ratio', a: 5, b: 1 }, source: { kind: 'battleGold' } },
  }),
      armor('allySelf', 3, 0, {
    modifier: { mod: { kind: 'ratio', a: 5, b: 1 }, source: { kind: 'battleGold' } },
  }),
      magic('allySelf', 3, 0, {
    modifier: { mod: { kind: 'ratio', a: 5, b: 1 }, source: { kind: 'battleGold' } },
  }),
      heal('allySelf', 3, 0, {
    modifier: { mod: { kind: 'ratio', a: 5, b: 1 }, source: { kind: 'battleGold' } },
  }),
    ),
  },
  {
    id: 8149,
    desc: "对一名敌人造成 [魔法 + 4] 点伤害。如果敌人是个魔头，则基于我已晋升的稀有度造成 3 到 5 倍伤害。若敌人身亡，则缠绕所有敌人。",
    // 「若敌人身亡则缠绕所有敌人」= ifTargetDied（单目标精确判定）
    build: skill(
      dmg('enemyChosen', 4, 1, { condMult: BOSS_ASC3 }),
      inflict('entangle', 'enemyAll', { ifTargetDied: true }),
    ),
  },
  {
    id: 8158,
    desc: "对一名敌人造成 [魔法 + 4] 点伤害。如果敌人是个高塔，则基于我已晋升的稀有度造成 3 到 5 倍伤害。爆破 3 颗红色宝石。",
    // 「爆破 3 颗红色宝石」
    build: skill(
      dmg('enemyChosen', 4, 1, { condMult: CASTLE_ASC3 }),
      explodeRandomGems(3, 0, 'color', BaseColor.Red),
    ),
  },
  {
    id: 8166,
    desc: "对一名敌人造成 [魔法 + 4] 点伤害。如果敌人是个高塔，则基于我已晋升的稀有度造成 3 到 5 倍伤害。从 2 个随机技能消除 [魔法 + 4] 点。",
    // 「从 2 个随机技能消除 [M+4]」= reduce stat random + times 2（R12 DecreaseRandom ×2，官方两步同款）
    build: skill(
      dmg('enemyChosen', 4, 1, { condMult: CASTLE_ASC3 }),
      reduce('lastTarget', 'random', 4, 1, { times: 2 }),
    ),
  },
  {
    id: 8170,
    desc: "对一名敌人造成 [魔法 + 4] 点伤害。如果敌人是个魔头，则基于我已晋升的稀有度造成 3 到 5 倍伤害。击晕第一名敌人并使其陷入猎人标记状态。",
    // 「击晕第一名敌人并使其陷入猎人标记」= enemyFront 双段
    build: skill(
      dmg('enemyChosen', 4, 1, { condMult: BOSS_ASC3 }),
      inflict('stun', 'enemyFront'),
      inflict('marked', 'enemyFront'),
    ),
  },
  {
    id: 8174,
    desc: "对一名敌人造成 [魔法 + 4] 点伤害。如果敌人是个高塔，则基于我已晋升的稀有度造成 3 到 5 倍伤害。获得一个额外回合，再爆破 4 颗宝石，或赋予所有其他盟友法印效果。",
    // 「爆破 4 颗宝石，或赋予所有其他盟友法印」= oneOf（官方两变体步骤，r15 8744 注记口径）
    build: skill(
      dmg('enemyChosen', 4, 1, { condMult: CASTLE_ASC3 }),
      extraTurn(),
      oneOf(
    [explodeRandomGems(4, 0)],
    [inflict('enchanted', 'allyOthers')],
  )
    ),
  },
  {
    id: 8189,
    desc: "爆破一颗宝石。每摧毁一颗骷髅头，则赋予一名盟友反射效果。获得 [魔法 + 1] 点护甲值。 [1:1]",
    // 【挽救】「反射效果」= reflect（R10 落地）；「每摧毁一颗骷髅头」= perDestroyed skull（r17 8493 同款）；[1:1] = 驱动比率序列化
    build: skill(
      explodeAt(CELL),
      inflict('reflect', 'allyAll', { perDestroyed: { color: 'skull' } }),
      armor('allySelf', 1, 1),
    ),
  },
  {
    id: 8192,
    desc: "对一名敌人造成 [魔法 + 4] 点伤害。如果敌人是个魔头，则基于我已晋升的稀有度造成 3 到 5 倍伤害。将绿色宝石转换成末日骷髅头。",
    // 「绿色宝石转换成末日骷髅头」= transformToSpecial
    build: skill(
      dmg('enemyChosen', 4, 1, { condMult: BOSS_ASC3 }),
      transformToSpecial(BaseColor.Green, 'doomSkull'),
    ),
  },
  {
    id: 8194,
    desc: "对一名敌人造成 [魔法 + 4] 点伤害。如果敌人是个魔头，则基于我已晋升的稀有度造成 3 到 5 倍伤害。每有一名敌人中毒，则爆破 2 颗宝石。 [x2]",
    // 「每有一名中毒敌人则爆破 2 颗」= enemyStatusCount 挂 randomGems 数（evaluateWithModifier，r15 8835 同口径）
    build: skill(
      dmg('enemyChosen', 4, 1, { condMult: BOSS_ASC3 }),
      explodeRandomGems(0, 0, 'all', undefined, {
    modifier: { mod: { kind: 'multiplier', a: 2 }, source: { kind: 'enemyStatusCount', statusId: 'poison' } },
  }),
    ),
  },
  {
    id: 8206,
    desc: "窃取 4 点护甲值，并将其转换成攻击力。对一名敌人造成 [魔法 + 4] 点伤害。如果敌人是个高塔，则基于我已晋升的稀有度造成 3 到 5 倍伤害。  [1:1]",
    // 「窃取 4 护甲转换成攻击」= steal armor→attack；[1:1] = 转换比率序列化
    build: skill(
      steal('enemyChosen', 'armor', 'attack', 4, 0),
      dmg('enemyChosen', 4, 1, { condMult: CASTLE_ASC3 }),
    ),
  },
  {
    id: 8209,
    desc: "对一名敌人造成 [魔法 + 4] 点伤害，伤害值因其生命值而增强。如果敌人是个魔头，则基于我已晋升的稀有度造成 3 到 5 倍伤害。 [5:1]",
    // 「因其生命值而增强」= 原生 CountLife@FromTarget 20 = 20%（R003-2，即英文 [5:1]）→ ratio 5:1 targetStat hp（sa-D）
    build: skill(
      dmg('enemyChosen', 4, 1, {
    modifier: { mod: { kind: 'ratio', a: 5, b: 1 }, source: { kind: 'targetStat', stat: 'hp' } },
    condMult: BOSS_ASC3,
  }),
    ),
  },
  {
    id: 8214,
    desc: "对一名敌人造成 [魔法 + 4] 点伤害，伤害值因狂怒的盟友数而增强。如果敌人是个高塔，则基于我已晋升的稀有度造成 3 到 5 倍伤害。窃取 6 点法力值。 [x4]",
    // 「因狂怒盟友数 [x4]」= allyStatusCount enraged；ZH 多出的「窃取 6 点法力值」子句 EN/官方步骤均无（旧版描述残留），按官方现版本组装（r17 7652 同口径）
    build: skill(
      dmg('enemyChosen', 4, 1, {
    modifier: { mod: { kind: 'multiplier', a: 4 }, source: { kind: 'allyStatusCount', statusId: 'enraged' } },
    condMult: CASTLE_ASC3,
  }),
    ),
  },
  {
    id: 8216,
    desc: "给予一名盟友 [(魔法 / 2) + 1] 点随机技能值。创造 9 颗其法力颜色的宝石。然后对随机盟友再重复 2 次。",
    // 【挽救】「其法力颜色」= LAST_TARGET（randomStat buff 段更新跨段追踪）；「再重复 2 次」= 官方三组步骤逐组组装（RandomAlly 独立掷签，可重复）
    // sa-H：原生 IncreaseRandom = 全额给一项随机技能（oneSkill，同 R007-2），原为拆分到多项；ZH「另外 2 名盟友」误，改并加 override 6817
    build: skill(
      randomStat('allyChosen', 1, 0.5, { oneSkill: true }),
      createGems('LAST_TARGET', 9),
      randomStat('allyRandom', 1, 0.5, { oneSkill: true }),
      createGems('LAST_TARGET', 9),
      randomStat('allyRandom', 1, 0.5, { oneSkill: true }),
      createGems('LAST_TARGET', 9),
    ),
  },
  {
    id: 8223,
    desc: "对一名敌人造成 [魔法 + 4] 伤害。如果敌人是个魔头，则基于我已晋升的稀有度造成 3 到 5 倍伤害。若敌人身亡，则净化所有盟友并消除所有敌人正面增益效果。",
    // 「若敌人身亡则净化所有盟友并消除所有敌人正面增益」= ifTargetDied（单目标精确判定）+ 驱散族
    build: skill(
      dmg('enemyChosen', 4, 1, { condMult: BOSS_ASC3 }),
      cleanse('allyAll', undefined, { ifTargetDied: true }),
      // native DispelConditional AddForKill: after the cleanse segment the "last target" is an ally, so
      // ifTargetDied no longer sees the enemy; castEnemyDied = the (only) damaged enemy died this cast.
      ...dispelPositives('enemyAll', { kind: 'castEnemyDied' }),
    ),
  },
  {
    id: 8227,
    desc: "对一名敌人造成 [魔法 + 4] 点伤害，伤害值因下潜的盟友数而增强。如果敌人是个高塔，则基于我已晋升的稀有度造成 3 到 5 倍伤害。 [x4]",
    // 「因下潜盟友数 [x4]」= allyStatusCount submerged ×4
    build: skill(
      dmg('enemyChosen', 4, 1, {
    modifier: { mod: { kind: 'multiplier', a: 4 }, source: { kind: 'allyStatusCount', statusId: 'submerged' } },
    condMult: CASTLE_ASC3,
  }),
    ),
  },
  {
    id: 8244,
    desc: "对一名敌人造成 [魔法 + 4] 点伤害。如果敌人是个魔头，则基于我已晋升的稀有度造成 3 到 5 倍伤害。若敌人身亡，则窃取所有剩余敌人 4 点魔力值。",
    // 「若敌人身亡则窃取所有剩余敌人 4 法力」= ifTargetDied；enemyAll 天然排除阵亡者
    build: skill(
      dmg('enemyChosen', 4, 1, { condMult: BOSS_ASC3 }),
      steal('enemyAll', 'magic', 'magic', 4, 0, { ifTargetDied: true }),
    ),
  },
];

/**
 * 放弃条目分批记账：挽救候选 65 条中 15 条已用现词汇挽救收录（见各条【挽救】注记），其余 50 条
 * 维持放弃——SKIP 记录保留在原批次文件（不重复计数）；「从未组装」149 条中 44 条首次判读后放弃，
 * 记录在本批上方 SKIPPED。全部放弃条目按卡点分组（两处合计）：
 *
 * 【敌方侧种族计数 enemiesOfRace 缺失（等引擎扩族）】
 * - 7459/7546/7547/7598/7646/7698/7797/7798/7981/8102（建造/哥布林/龙/妖仙/野兽/不死/神祗/恶魔）。
 *
 * 【Devour 吞噬（新口径：引擎无成长机制，即杀近似会丢语义，本批起整条留弃）】
 * - 7047/7210/7211/7280/7281/7312/7326/7354/7421/7423/7450/7480/7559/7566/7633/7637/7642/7647/
 *   7724/7781/7810/8056/8086/8211/8237（含条件吞噬/吞噬盟友/oneOf 支）。
 *
 * 【二次缩放来源 / 上限 / 区间】
 * - 7505（[25:1] 无法判读）、7388/7977（被摧毁骷髅细分）、7402（盟友攻击力来源 + 3-8 法力区间）、
 *   7464（missingHp）、7472/8037（manaCost/CountMana）、7808（满血满蓝计数）、8060/8235（CHOSEN 计数）、
 *   7506/7651（「其他盟友」排除句式）、7667/8142（创造上限）、8141（敌方黄金池 + 上限）、
 *   8055（护甲区间——buff 无 rangeSpec）。
 *
 * 【目标偏移 / 交换 / 位置复合】
 * - 7254/7314/7386（50% 打错敌人）、7555/7992（两两交换）、8220（FromPrevious 相邻对集）、
 *   7207（随机分配伤害）、7000/7253（Block3x1 / 限色选定行列）。
 *
 * 【条件域缺口】
 * - 7263/7935（任意状态）、7541（目标相对条件挂无目标段）、7690（跨目标条件绑定）、8182（marked 条件
 *   辖全体段错滤）、8143/8185（多目标任意死亡绑定，r16 9986 口径）、7435（经济阈值条件，已入新 SKIP）。
 *
 * 【复制/变形/经济支出/其他】
 * - 8187/8188/8190（TransformSelf/召唤复制体）、7161（治疗量不明）、7328（Mana Burn 增强量）、
 *   7542（自复活）、7713（窃取重定向 + SKULL mix）、7747（其中一名/另一名绑定）、7987（随机技能转移）、
 *   7812/7670/7960（属性比较方向/逐围计数）、8108（desc 与官方步骤矛盾）、8248（else 分支）、
 *   8060（CHOSEN 计数）。
 */

export const BATCH_R18: CuratedBatch = { batch: 'R18', spells: SPELLS, skipped: SKIPPED };
