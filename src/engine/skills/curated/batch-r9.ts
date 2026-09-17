/**
 * 放弃桶回收批 R9（2026-09-17）：全量放弃条目 × 官方 SpellSteps 对照清洗。
 *
 * 方法：对全部现存 skipped（610 条去重，扣除历批已回收后 483 条待定）逐条拉取
 * data/raw/spells.gow.en.json 的 RawData.SpellSteps，按步骤 Type/Target/Amount/Color
 * 判定「全部步骤是否落在现有组装词汇内」，不只看中文翻译。
 *
 * 本批口径（沿 R8 实锤 + 本批新裁）：
 * - 机翻术语真身：元素星/法力药水/石像鬼/天使/灵力/腐烂/狼人/恶魔门户/石块 等均为
 *   CreateGems/ConvertGems/CountGems 无基础色步骤的机翻外壳 → 无原语，整条 SKIP；
 *   巨人/龙宝石带基础色（GiantRed/DragonGreen 等）→ 按 ZH 色名恢复基础色组装（R8 先例）。
 * - 状态搬运宝石（Freeze/Poison/Bleed/Barrier/Burning/Enrage/Terror/FaerieFire/Web/Cursed）
 *   = SpecialGemKind 已落地家族 → createSpecialGems/transformToSpecial/boardSpecial 可组装。
 * - CountGems 骷髅头「被摧毁的骷髅（头）数」→ destroyedGems 无色（R8 9639 先例）；
 *   无「摧毁」字样的骷髅头计数 → boardSkulls。
 * - 「被打错的敌人/打错人」（MisspellTarget）、DecreaseRandom（随机削减属性）、
 *   CauseBlessed/CauseMirror/CauseEnchanted/CauseEnraged（缺失状态）、FromManaColorEnemy/
 *   AllyColor/EnemyColor（颜色限定目标）、MostUsedMana（动态使用最多色）、面积清除
 *   （5x5/3x3/X 形）、Summ­onKingdom 以外的召唤变体（复制兵种 SummoningTarget/随机风暴
 *   StormRandom）、王国条件/晋升度（Boss/防御塔 3-5 倍）、数值区间（3-8 点法力/2-4 层）、
 *   状态段上的 UseCounterForAmount（引擎状态段无缩放位）→ SKIP。
 * - 机翻事故新实锤（按官方步骤组装，详见批内注释）：9776「对受屏障保护的 2 名盟友造成伤害」
 *   实为「给 2 名随机盟友屏障」；9844「潜入」= 下潜 submerged；8160「溅射上海」= 溅射伤害。
 * - 本批只收录回收成功条目；仍不可表达条目的 SKIP 记录保留在原批次文件（避免覆盖报告重复计数）。
 */
import type { CuratedBatch } from './index';
import {
  skill, dmg, dmgSplash, trueDmg, heal, armor, attack, magic, mana, inflict, reduce, steal,
  randomStat, createGems, createSkulls, createMix, transform, transformToSpecial, createSpecialGems,
  destroySpecialGems, destroyColor, destroyChosenRow, destroyChosenCol, destroySkulls,
  explodeRandomGems, oneOf, extraTurn, summonRandom, summonRef, reposition, shuffleTeam, CHOSEN,
} from '../builders';
import { BaseColor } from '../../types';

// 王国引用池（troops.gow.en.json KingdomId × troops.json referenceName 取交集，batch-r7 龙族同法）
const K3015 = ["Wisterina","ImmortalMonstera","Vinepyre","LadyFlorella","QueenOfSwords","TheDecayingQueen","Gladius","ImmortalVirago","Adelwing","GiantBadger","ElementalSentinel","Grimfeather","Virago","DaughterOfYasmine","Treekin","TheEmeraldGiant","LordArchimedus","Crystalynx","ThornScout","TheWerestag","EarthDreamer","LordBelanor","Faemark","DandyLion","KingBloodwood","WoodRhynax","KingAvelorn","VineMarten","Ironbark","OwlRider","ForestTroll","YasminesChosen","Aurai","Archdruid","Sylvanimora","ThornKnight","LadyAnariel","GreenSeer","Hippogryph","Rowanne","GloomLeaf","Treant","Owlbear","Dryad","GladeWarden"];
const K3016 = ["Manasa","Demizerius","Bothros","Cascabel","MelekTauss","Slitherling","Weresnake","Takshaka","Eyestalker","StoneViper","TheWorld","Medusa","SteelCobra","Wererat","Nagatrap","RoyalAssassin","Mambasira","Basilisk","SwampRat","Amaru","AlgorakTheSlayer","Kobra","Vassara","SkulkFang","Fangblade","Tai-Pan","Viper","Euryali","BoneNaga","Bogstrider","MarshStrangler","NagaQueen","Marilith","MarshRaptor","Swamplash","Terraxis","Raven","Venoxia","Lamia","MistStalker","PoisonMaster","ScaleGuard"];
const K3008 = ["ImmortalKveldulf","ManedWolf","Woodseer","Reavnarokkr","WargSpirit","MidwinterLycan","KeeperOfThePaths","Timberwolf","Lunarelleon","Caribou","Inari","AncestorBrodir","Kitsune","MeiraDawn","CrimsonAgent","Wereraven","SkrollReborn","HatirAscendant","TheMoon","Hatir&Skroll","FrekiTheWild","DireCub","Krampus","WargareBrute","UlfrHuntsmaster","Moonsinger","Tracker","SirWulfric","Spiritdancer","TotemGuardian","Wulfgarok","ForestGuardian","Wayfinder","Warg","SpiritFox","Fenrir","Barbearius","Kerberos","Scarlett","Druid","Ranger","Cockatrice","DireWolf"];
const K3011 = ["Fionnuala","FrostSpider","Helilya","Boudicca","Muireann","ImmortalGlaycia","YetiCub","Moonfeather","FeyDragoon","TheBestialFey","DaughterOfTime","Rukh","TheHighPriestess","KingOfRavens","Sapphirax","Saga","IceOrca","Grimmoira","Ullor","Cernunnos","Frostfeather","DaughterOfIce","SnowPanther","DoomOfIce","Freya","FrostArcher","Skadi","Snow-Hunter","FrostLizard","SnowGuardian","Frostling","IceGolem","WinterWolf","Borealis","QueenMab","Tassarion","Yeti","WinterKnight","Jackelope","SnowSprite"];
const K3024 = ["Voidjaw","TheSandstoneSentinel","DenwenTheWanderer","DesertOx","TheCragMaw","ImmortalScoprio","Al-Mundhir","MonstrousSentinel","Hornwing","MantisMage","TheHermit","Khronos","Stoneshell","Scoprio","Topasarth","FakyrTheWise","SkyScorpion","Obregonia","Bahir","DesertWorm","TyranAndRex","Trihorn","ShahbanuVespera","Scarabi","Sharptooth","Sandrunner","Agave","Saguaro","Senita","SandScuttler","Scorpius","AncientGolem","DesertTroll","RockSpirit","MadProphet","DragonCruncher","SandShark","TheGreatMaw","Marid","Ifrit","Djinn","DustDevil","Roc"];
const K3035 = ["RhonaBittershield","CaveCrawler","CaveMole","Mrs.Krinkle","KhormacTheRestless","ForsakenGuardian","KingOfRunes","Gormungandr","DugallRamhorn","IcyPortal","GhostKingGrimhorn","LostWarrior","LivingRime","Garnetaerlin","DhrakSmith","FrozenShieldbreaker","BoneboundDredge","Arcturion","MoiraCragheart","Kryshound","Obsidius","BlackfireCannon","CursedEffigy","DoomOfStone","GriffStonefeather","FallenValdis","KingBloodhammer","Glaycion","IceTroll","Gemhammer","Bonebinder","IceGoblin","SlayerGhost","DwarvenZombie","IceWorm"];
const K3045 = ["Amphib-o-Bot","TinkSteamwhistle","Destruct-o-Bot","Detect-o-bot","Smash-o-bot"];
const K3061 = ["FellHydra","Nocturnia","FellDragon","FellDragonEgg","UndeadDrake"];
const K3085 = ["TheWeepingDuchess","Jezebel","FacelessLord","Runethius","CromCruach","MydnightInnovator","PossessedTeddy","ImmortalOssifer","TheHierophant","ArchdruidBlackwood","LadyOfRuin","VoidManticore","DeathTrapMimic","BoneHound","TheVoidDragon","TheMydnightKing","QueenOfWands","LadyOfBones","Half-DaemonKnight","TheMidnightQueen","Feyr","DaemonChild","LostHunter","HauntedDoll"];
const K3091 = ["DarkAcrobat","Ringmaster","FireJuggler","Strongman","FireLion"];
// 机械族引用池（troops.json troopTypes='Mech'）
const MECH_REFS = ["SteamTurret","FlameCannon","DeepBorer","BlastCannon","Carnex","TANKBOT-2000","GoblinRocket","Bombot","DRACOS-1337","ClockworkKnight","SentryBot","Shocktopus","ClockworkSphinx","TED-1000","TINA-9000","ROVER-300","MechaGnome","P4-NTH4","MechaRat","Smash-o-bot","Detect-o-bot","Destruct-o-Bot","TinkSteamwhistle","S.O.L.A.R","NUTCRKR-1225","Mechataur","Ironhawk","TheSparkinator","Limpet-bot","Mechamare","Mechweaver","BORK-3000","TeslasEngine","Amphib-o-Bot","FIXIT-5000","ImmortalTitanius","MokTheCannon-Rider","WATTS-1927","LOCK-1887","RatchetCogbolt","WEEZL-300","DRIDR-8000","NAV-1057"];

const SKIPPED: { id: number; reason: string }[] = [];

const SPELLS: CuratedBatch['spells'] = [
  {
    id: 8025,
    desc: '对第一位和最后一位敌人造成 [(魔法 / 2) + 4] 点伤害，再对一名随机敌人造成双倍伤害。',
    // FirstLastEnemies → front+last 两段共用 scaling；「双倍」= 官方 Amount 8（= 2×前段值）
    build: skill(
      dmg('enemyFront', 4, 0.5),
      dmg('enemyLast', 4, 0.5),
      dmg('enemyRandom', 8, 1),
    ),
  },
  {
    id: 8031,
    desc: '对所有敌人造成 [魔法 + 1] 点伤害，伤害值因精灵、元素和野兽盟友数而增强。召唤一名荆棘森林军队。 [x3]',
    // CountArmyType ×3（elf/elemental/beast 各 Amount 300）→ sources 计数相加 ×3；王国 3015 召唤
    build: skill(
      dmg('enemyAll', 1, 1, {
        range: 'all',
        modifier: {
          mod: { kind: 'multiplier', a: 3 },
          sources: [
            { kind: 'alliesOfRace', race: 'Elf' },
            { kind: 'alliesOfRace', race: 'Elemental' },
            { kind: 'alliesOfRace', race: 'Beast' },
          ],
        },
      }),
      summonRandom(K3015),
    ),
  },
  {
    id: 8039,
    desc: '摧毁 1 行和 1 列。创造 5 颗红色宝石，数量因被摧毁的骷髅头数而增强。 [x2]',
    // CountGems Skull + DestroyGems → 「被摧毁的骷髅头数」= destroyedGems 无色（R8 9639 先例）
    build: skill(
      destroyChosenRow(),
      destroyChosenCol(),
      createGems(BaseColor.Red, 5, 0, {
        modifier: { mod: { kind: 'multiplier', a: 2 }, source: { kind: 'destroyedGems' } },
      }),
    ),
  },
  {
    id: 8090,
    desc: '摧毁一行。窃取第一位敌人 [魔法 + 1] 点生命值，数量因被摧毁的骷髅头数而增强。 [x2]',
    // StealLife = 伤害吸血（drain）；骷髅计数同 8039 → destroyedGems 无色
    build: skill(
      destroyChosenRow(),
      dmg('enemyFront', 1, 1, {
        drain: true,
        modifier: { mod: { kind: 'multiplier', a: 2 }, source: { kind: 'destroyedGems' } },
      }),
    ),
  },
  {
    id: 8109,
    desc: '将一名敌人打回末位。爆破 [(魔法 / 2) + 1] 颗其法力颜色的宝石。',
    // TroopOrderBack → reposition back；ExplodeColor FromTarget = 定量爆破跨段目标法力色
    build: skill(
      reposition('enemyChosen', 'back'),
      explodeRandomGems(1, 0.5, 'color', 'LAST_TARGET'),
    ),
  },
  {
    id: 8160,
    desc: '对 3 名随机敌人造成 [魔法 + 8] 点轻微溅射上海。爆破板面上半数蓝色宝石。 [2:1]',
    // 机翻事故：「溅射上海」= 溅射伤害；[2:1] = 官方 CountGems Amount 50（每 2 颗爆破 1 颗）
    build: skill(
      dmgSplash('enemyRandomN', 8, 1, { n: 3 }),
      explodeRandomGems(0, 0, 'color', BaseColor.Blue, {
        modifier: { mod: { kind: 'ratio', a: 1, b: 2 }, source: { kind: 'boardGems', color: BaseColor.Blue } },
      }),
    ),
  },
  {
    id: 8163,
    desc: '将敌人的护甲值和生命值减半。创造 9 - 13 颗蓝色宝石。 [2:1]',
    // CountArmor/CountLife Amount 50 → 减半族（[2:1] 即「每 2 取 1」的减半语义）；CreateGemsRange 9-13
    build: skill(
      reduce('enemyChosen', 'armor', 0, 0, { halve: true }),
      reduce('enemyChosen', 'hp', 0, 0, { halve: true }),
      createGems(BaseColor.Blue, 0, 0, { countRange: { min: 9, max: 13 } }),
    ),
  },
  {
    id: 8168,
    desc: '爆破一颗宝石。创造 4 颗红色宝石，数量因被摧毁的骷髅头数量而增强。 [x3]',
    // 「被摧毁的骷髅头数量」= destroyedGems 无色（8039/8090 同批口径）
    build: skill(
      explodeRandomGems(1),
      createGems(BaseColor.Red, 4, 0, {
        modifier: { mod: { kind: 'multiplier', a: 3 }, source: { kind: 'destroyedGems' } },
      }),
    ),
  },
  {
    id: 8193,
    desc: '对一名敌人造成 [魔法 + 4] 点伤害，伤害值因陷入中毒状态的敌人数而增强。召唤 1 到 2 位鳞雾沼泽军队。 [x3]',
    // CountSpecificStatusEffect poison → enemyStatusCount；王国 3016 ×2 步 → countRange {1,2}
    build: skill(
      dmg('enemyChosen', 4, 1, {
        modifier: { mod: { kind: 'multiplier', a: 3 }, source: { kind: 'enemyStatusCount', statusId: 'poison' } },
      }),
      summonRandom(K3016, undefined, { countRange: { min: 1, max: 2 } }),
    ),
  },
  {
    id: 8225,
    desc: '对一名敌人造成 [魔法 + 4] 伤害。若敌人已下潜，则杀掉他们。若未下潜，则使其下潜。',
    // LethalDamageConditional = execute + targetStatus submerged；「若未下潜」= not 否定条件（§12.6）
    build: skill(
      dmg('enemyChosen', 4, 1),
      dmg('lastTarget', 0, 0, { execute: true, ifCond: { kind: 'targetStatus', statusId: 'submerged' } }),
      inflict('submerged', 'lastTarget', {
        ifCond: { kind: 'not', cond: { kind: 'targetStatus', statusId: 'submerged' } },
      }),
    ),
  },
  {
    id: 8269,
    desc: '对首位敌人造成 [(魔法 / 2) + 3] 点伤害，再将其打回末位。再重复 2 次。',
    // (Damage Front → TroopOrderBack Front) ×3：推回后新队首顶上，故三段同为 enemyFront
    build: skill(
      dmg('enemyFront', 3, 0.5),
      reposition('enemyFront', 'back'),
      dmg('enemyFront', 3, 0.5),
      reposition('enemyFront', 'back'),
      dmg('enemyFront', 3, 0.5),
      reposition('enemyFront', 'back'),
    ),
  },
  {
    id: 8282,
    desc: '创造 9 颗绿色宝石和 9 颗棕色宝石，再造成 [(魔法 x 2) + 6] 点真实散射伤害。有 40% 个别几率获得一个额外回合和半数法力值，几率因棕色宝石数而增强。',
    // TrueScatterDamage Target=AllEnemies → trueDmg enemyAll range all（8639 口径）；
    // 官方步骤无棕色宝石计数步（ZH「几率因棕色宝石数」无 [xN] 且官方无 UseCounter）→ 不挂 chanceBoost
    build: skill(
      createGems(BaseColor.Green, 9),
      createGems(BaseColor.Brown, 9),
      trueDmg('enemyAll', 6, 2, { range: 'all' }),
      extraTurn({ chance: 0.4 }),
      mana('allySelf', 0, 0, { halve: true, chance: 0.4 }),
    ),
  },
  {
    id: 8287,
    desc: '创造 6 颗蓝色宝石，数量因被冻结的敌人数而增强。再对第一位和最后一位敌人造成 [魔法 + 3] 点伤害，伤害值因蓝色宝石数而增强。 [x2]',
    // 创造段 ×2（官方 CountSpecificStatusEffect frozen Amount 200）；伤害两段同子句共用 [x2]（§1 多同类段）
    build: skill(
      createGems(BaseColor.Blue, 6, 0, {
        modifier: { mod: { kind: 'multiplier', a: 2 }, source: { kind: 'enemyStatusCount', statusId: 'frozen' } },
      }),
      dmg('enemyFront', 3, 1, {
        modifier: { mod: { kind: 'multiplier', a: 2 }, source: { kind: 'boardGems', color: BaseColor.Blue } },
      }),
      dmg('enemyLast', 3, 1, {
        modifier: { mod: { kind: 'multiplier', a: 2 }, source: { kind: 'boardGems', color: BaseColor.Blue } },
      }),
    ),
  },
  {
    id: 8318,
    desc: '使一名随机敌人陷入疾病状态。召唤一名随机恶龙巢军队。',
    // CauseDisease → disease；王国 3061（恶龙巢）召唤
    build: skill(
      inflict('disease', 'enemyRandom'),
      summonRandom(K3061),
    ),
  },
  {
    id: 8408,
    desc: '给予所有盟友 [魔法 + 1] 点护甲值和生命值，数值因红色宝石数而增强。召唤 1-3 名修补匠小镇机器。 [1:1]',
    // 单方括号管两段（R4 §11）；王国 3045（修补匠机器）×3 步 → countRange {1,3}
    build: skill(
      armor('allyAll', 1, 1, {
        modifier: { mod: { kind: 'multiplier', a: 1 }, source: { kind: 'boardGems', color: BaseColor.Red } },
      }),
      heal('allyAll', 1, 1, {
        modifier: { mod: { kind: 'multiplier', a: 1 }, source: { kind: 'boardGems', color: BaseColor.Red } },
      }),
      summonRandom(K3045, undefined, { countRange: { min: 1, max: 3 } }),
    ),
  },
  {
    id: 8414,
    desc: '对一名敌人造成 [魔法 + 7] 点伤害，并将之击回末位。耗掉位于其下的所有敌人 7 点法力值。获得一个额外回合。',
    // 「将之」= 跨段 lastTarget；「其下的所有敌人」= enemyChosenAndBelow（§9.10）
    build: skill(
      dmg('enemyChosen', 7, 1),
      reposition('lastTarget', 'back'),
      reduce('enemyChosenAndBelow', 'mana', 7, 0),
      extraTurn(),
    ),
  },
  {
    id: 8416,
    desc: '对一名敌人造成 [魔法 + 2] 点伤害。若自身有狂怒效果，并将之击回末位。',
    // TroopOrderBackConditional → selfStatus rage 条件击退（§11 R4 selfStatus 条件）
    build: skill(
      dmg('enemyChosen', 2, 1),
      reposition('lastTarget', 'back', { ifCond: { kind: 'selfStatus', statusId: 'rage' } }),
    ),
  },
  {
    id: 8424,
    desc: '以 3x3 交叉队列方式爆破宝石。获得 [魔法 + 1] 点护甲值和屏障效果。',
    // ExplodeGems ×2（交叉两次爆破）= 随机爆破 2 颗（§11 裸单颗宝石操作口径）
    build: skill(
      explodeRandomGems(2),
      armor('allySelf', 1, 1),
      inflict('barrier', 'allySelf'),
    ),
  },
  {
    id: 8637,
    desc: '摧毁一行。对首位敌人造成 [魔法 + 3] 点伤害，伤害值因被摧毁的绿色盟友和绿色宝石而增强。 [x3]',
    // CountGems Green + CountArmyColor allies green → sources 计数相加（boardGems + alliesOfColor）
    build: skill(
      destroyChosenRow(),
      dmg('enemyFront', 3, 1, {
        modifier: {
          mod: { kind: 'multiplier', a: 3 },
          sources: [
            { kind: 'boardGems', color: BaseColor.Green },
            { kind: 'alliesOfColor', color: BaseColor.Green },
          ],
        },
      }),
    ),
  },
  {
    id: 8747,
    desc: '创造 8 颗蓝色宝石和 8 颗绿色宝石。再召唤 1-3 名毛格瑞姆森林军队。',
    // 王国 3008 ×3 步 → countRange {1,3}
    build: skill(
      createGems(BaseColor.Blue, 8),
      createGems(BaseColor.Green, 8),
      summonRandom(K3008, undefined, { countRange: { min: 1, max: 3 } }),
    ),
  },
  {
    id: 8752,
    desc: '窃取最弱的 2 名敌人 [魔法 + 1] 点生命值。并使他们陷入诅咒和叠加 3 倍的出血状态。',
    // TwoWeakestEnemies → enemyWeakestN n:2；CauseBleed ×3 步 = 叠加 3 层（机翻「3 倍」实为 3 次叠加）
    build: skill(
      dmg('enemyWeakestN', 1, 1, { n: 2, drain: true }),
      inflict('curse', 'enemyWeakestN', { n: 2 }),
      inflict('bleed', 'enemyWeakestN', { n: 2, stacks: 3 }),
    ),
  },
  {
    id: 8502,
    desc: '结果 [魔法 + 8] 分散的伤害，由燃烧的敌人激活。点燃1-3个随机的敌人。 [x8]',
    // ScatterDamage Target=AllEnemies → enemyAll range all（8639 口径）；燃烧敌人数 = enemyStatusCount；
    // 「点燃 1-3 个随机敌人」= nRange 目标区间（§9.8，r8 8606 先例）
    build: skill(
      dmg('enemyAll', 8, 1, {
        range: 'all',
        modifier: { mod: { kind: 'multiplier', a: 8 }, source: { kind: 'enemyStatusCount', statusId: 'burning' } },
      }),
      inflict('burning', 'enemyRandomN', { nRange: { min: 1, max: 3 } }),
    ),
  },
  {
    id: 8819,
    desc: '对一名敌人造成 [魔法 + 3] 点真实伤害，并移除其法力颜色之一的所有宝石。',
    // 官方 TrueSplashHighDamage → 真实溅射（官方步骤优先于 ZH 省略「溅射」）；RemoveColor FromTarget
    build: skill(
      dmg('enemyChosen', 3, 1, { range: 'splash', trueDamage: true }),
      destroyColor('LAST_TARGET'),
    ),
  },
  {
    id: 8831,
    desc: '给予一名盟友 [魔法 + 1] 点随机技能值，并重复一次。再召唤一名随机聚沙之地军队。',
    // IncreaseRandom = randomStat（「随机技能值」口径）；王国 3024 召唤
    build: skill(
      randomStat('allyChosen', 1, 1),
      randomStat('allyChosen', 1, 1),
      summonRandom(K3024),
    ),
  },
  {
    id: 8834,
    desc: '对一名敌人造成[魔法 + 4]点伤害。然后将5颗蓝色宝石转化成巨型红色宝石。',
    // GiantRed → ZH 色名「红」恢复基础色（R8 8830 先例）
    build: skill(
      dmg('enemyChosen', 4, 1),
      transform(BaseColor.Blue, BaseColor.Red, { count: 5 }),
    ),
  },
  {
    id: 8836,
    desc: '对一名敌人造成[魔法 + 4]点伤害。然后将5枚黄宝石转化成紫色巨型宝石。',
    build: skill(
      dmg('enemyChosen', 4, 1),
      transform(BaseColor.Yellow, BaseColor.Purple, { count: 5 }),
    ),
  },
  {
    id: 8837,
    desc: '对一名敌人造成[魔法 + 4]点伤害。然后将5枚紫色宝石转化成黄色巨型宝石。',
    build: skill(
      dmg('enemyChosen', 4, 1),
      transform(BaseColor.Purple, BaseColor.Yellow, { count: 5 }),
    ),
  },
  {
    id: 8839,
    desc: '对一名敌人造成[魔法 + 4]点伤害。然后将5枚绿宝石转化成棕色巨型宝石。',
    build: skill(
      dmg('enemyChosen', 4, 1),
      transform(BaseColor.Green, BaseColor.Brown, { count: 5 }),
    ),
  },
  {
    id: 8852,
    desc: '对一名敌人造成[(魔法 x 2) + 4]点真实伤害。然后从敌人那里偷取魔力值10，或者生命值20，或者盔甲魔力值20。',
    // 「或者」= oneOf 掷签三选一（§9.3）；「盔甲魔力值」机翻 = 护甲（官方 StealArmor）
    build: skill(
      trueDmg('enemyChosen', 4, 2),
      oneOf(
        [steal('lastTarget', 'mana', 'mana', 10, 0)],
        [dmg('lastTarget', 20, 0, { drain: true })],
        [steal('lastTarget', 'armor', 'armor', 20, 0)],
      ),
    ),
  },
  {
    id: 8854,
    desc: '对2名随机敌人造成[魔法 + 5]大量溅射伤害，由蓝宝石增强。 [1:1]',
    // SplashHeavyDamage ×2 步（ResetTargets）→ enemyRandomN n:2 溅射；CountGems Blue 100 → boardGems ×1
    build: skill(
      dmgSplash('enemyRandomN', 5, 1, {
        n: 2,
        modifier: { mod: { kind: 'multiplier', a: 1 }, source: { kind: 'boardGems', color: BaseColor.Blue } },
      }),
    ),
  },
  {
    id: 8884,
    desc: '创造 5 颗蓝色龙族宝石。再获得一个额外回合，或创造 3 颗宝石。',
    // DragonBlue → 基础色 Blue（R8 口径）；「或」= oneOf 二选一
    build: skill(
      createGems(BaseColor.Blue, 5),
      oneOf([extraTurn()], [createGems(BaseColor.Blue, 3)]),
    ),
  },
  {
    id: 8929,
    desc: '对首位和末位敌人造成 [魔法 + 1] 点真实伤害，伤害值因蓝宝石数而增强。 [x3]',
    // FirstLastEnemies → front+last 两段；修饰子句点名伤害值 → 两段同挂（§1 多同类段）
    build: skill(
      trueDmg('enemyFront', 1, 1, {
        modifier: { mod: { kind: 'multiplier', a: 3 }, source: { kind: 'boardGems', color: BaseColor.Blue } },
      }),
      trueDmg('enemyLast', 1, 1, {
        modifier: { mod: { kind: 'multiplier', a: 3 }, source: { kind: 'boardGems', color: BaseColor.Blue } },
      }),
    ),
  },
  {
    id: 8941,
    desc: '消除 4 点魔法值或耗掉 4 点法力值，或窃取一名敌人 [魔法 + 1] 点生命值，数值因织网宝石数而增强。 [x2]',
    // 三选一（官方三组 CountGems Web + UseCounter 变体）；「魔法值」= magic 属性、「法力值」= mana
    build: skill(
      oneOf(
        [reduce('enemyChosen', 'magic', 4, 0, {
          modifier: { mod: { kind: 'multiplier', a: 2 }, source: { kind: 'boardSpecial', gem: 'web' } },
        })],
        [reduce('enemyChosen', 'mana', 4, 0, {
          modifier: { mod: { kind: 'multiplier', a: 2 }, source: { kind: 'boardSpecial', gem: 'web' } },
        })],
        [dmg('enemyChosen', 1, 1, {
          drain: true,
          modifier: { mod: { kind: 'multiplier', a: 2 }, source: { kind: 'boardSpecial', gem: 'web' } },
        })],
      ),
    ),
  },
  {
    id: 8944,
    desc: '对首位敌人造成 [魔法 + 2] 点伤害，有 20% 的几率对所有敌人造成造成半数伤害。',
    // 「半数伤害」= 官方 Amount 1 × 0.5（[M/2+1]，约前段半值）；20% 概率辖全体段
    build: skill(
      dmg('enemyFront', 2, 1),
      dmg('enemyAll', 1, 0.5, { range: 'all', chance: 0.2 }),
    ),
  },
  {
    id: 8961,
    desc: '摧毁一行或一列。造成 [魔法 + 4] 点散射伤害，伤害值因摧毁的骷髅数而增强。 [x6]',
    // 「一行或一列」= oneOf（§9.3）；「摧毁的骷髅数」= destroyedGems 无色（R8 9639 先例）；
    // ScatterDamage Target=AllEnemies → range all（8639 口径）
    build: skill(
      oneOf([destroyChosenRow()], [destroyChosenCol()]),
      dmg('enemyAll', 4, 1, {
        range: 'all',
        modifier: { mod: { kind: 'multiplier', a: 6 }, source: { kind: 'destroyedGems' } },
      }),
    ),
  },
  {
    id: 8962,
    desc: '对敌人造成 [魔法 + 7] 点伤害。将自己移至前方。然后创建 3 x2 万能牌。',
    // TroopOrderFront Self → reposition allySelf front；WildCard2 = tier 2 通配宝石
    build: skill(
      dmg('enemyChosen', 7, 1),
      reposition('allySelf', 'front'),
      createSpecialGems({ kind: 'wildcard', tier: 2 }, 3),
    ),
  },
  {
    id: 8964,
    desc: '给予盟友 2 次攻击力。棋盘上每有一颗黄色宝石，就有 7% 的几率获得额外回合。 [x7]',
    // 几率子句 → chanceBoost boardGems Yellow（SOP §3 概率增强样例原句）
    build: skill(
      attack('allyChosen', 2, 0),
      extraTurn({
        chanceBoost: { mod: { kind: 'multiplier', a: 7 }, source: { kind: 'boardGems', color: BaseColor.Yellow } },
      }),
    ),
  },
  {
    id: 8976,
    desc: '移除所有骷髅头。每移除一颗骷髅头，则给所有其他盟友 1 点魔法值。再创造等同于移除骷髅头数的骷髅头。 [1:1]',
    // RemoveColor Skull → destroySkulls；「每移除一颗…」来源 = destroyedGems 无色（前段仅摧毁骷髅）
    build: skill(
      destroySkulls(),
      magic('allyOthers', 0, 0, {
        modifier: { mod: { kind: 'multiplier', a: 1 }, source: { kind: 'destroyedGems' } },
      }),
      createSkulls(0, 0, {
        modifier: { mod: { kind: 'multiplier', a: 1 }, source: { kind: 'destroyedGems' } },
      }),
    ),
  },
  {
    id: 9006,
    desc: '爆破一颗宝石。再创造 1 个 x3 通配符卡牌。每摧毁一颗棕色宝石，则再创造多 2 个卡牌。 [x2]',
    // WildCard3 = tier 3；「每摧毁一颗棕色宝石 +2」→ destroyedGems Brown 来源计数
    build: skill(
      explodeRandomGems(1),
      createSpecialGems({ kind: 'wildcard', tier: 3 }, 1),
      createSpecialGems({ kind: 'wildcard', tier: 3 }, 0, 0, {
        modifier: { mod: { kind: 'multiplier', a: 2 }, source: { kind: 'destroyedGems', color: BaseColor.Brown } },
      }),
    ),
  },
  {
    id: 9049,
    desc: '对一名敌人造成 [魔法 + 4] 点伤害。再创造 2 颗蓝色宝石，数值因骑士盟友数而增强。召唤一颗水晶龙蛋。 [x2]',
    // CountArmyType knight → alliesOfRace Knight；Summoning 7374 = CrystalEggs（水晶蛋）
    build: skill(
      dmg('enemyChosen', 4, 1),
      createGems(BaseColor.Blue, 2, 0, {
        modifier: { mod: { kind: 'multiplier', a: 2 }, source: { kind: 'alliesOfRace', race: 'Knight' } },
      }),
      summonRef('CrystalEggs'),
    ),
  },
  {
    id: 9063,
    desc: '使最弱的 2 名敌人陷入恐怖状态，再造成 [魔法 + 3] 点伤害，伤害值因秘士盟友数而增强。召唤一名午夜城市军队。 [x6]',
    // CauseTerror → terror（白名单）；CountArmyType mystic → alliesOfRace Mystic；王国 3085
    build: skill(
      inflict('terror', 'enemyWeakestN', { n: 2 }),
      dmg('enemyWeakestN', 3, 1, {
        n: 2,
        modifier: { mod: { kind: 'multiplier', a: 6 }, source: { kind: 'alliesOfRace', race: 'Mystic' } },
      }),
      summonRandom(K3085),
    ),
  },
  {
    id: 9166,
    desc: '创造 5 颗骷髅头，数值因恐怖宝石数而增强。召唤一名夜魇马戏团军队。 [1:1]',
    // CountGems Terror → boardSpecial terrorGem（恐怖宝石）；王国 3091（夜魇马戏团）
    build: skill(
      createSkulls(5, 0, {
        modifier: { mod: { kind: 'multiplier', a: 1 }, source: { kind: 'boardSpecial', gem: 'terrorGem' } },
      }),
      summonRandom(K3091),
    ),
  },
  {
    id: 9220,
    desc: '对一名选定敌人和一名随机敌人造成 [(魔法 x 2) + 4] 点真实伤害。再创造 20 颗混合蓝色和绿色的宝石。',
    // 单方括号管两段（R4 §11）；CreateGems2Colors 双基础色 → createMix（r8 9613 先例）
    build: skill(
      trueDmg('enemyChosen', 4, 2),
      trueDmg('enemyRandom', 4, 2),
      createMix([BaseColor.Blue, BaseColor.Green], 20),
    ),
  },
  {
    id: 9516,
    desc: '对所有敌人造成 [(魔法 x 2.75) + 6] 点伤害。将 5 颗绿宝石转换为精灵火宝石。有 10% 的几率获得额外回合，绿宝石数量越多，几率越大。 [x3]',
    // FaerieFire → transformToSpecial faerieFireGem（R8 术语表：妖仙宝石=精灵火宝石）
    build: skill(
      dmg('enemyAll', 6, 2.75, { range: 'all' }),
      transformToSpecial(BaseColor.Green, 'faerieFireGem', { count: 5 }),
      extraTurn({
        chance: 0.1,
        chanceBoost: { mod: { kind: 'multiplier', a: 3 }, source: { kind: 'boardGems', color: BaseColor.Green } },
      }),
    ),
  },
  {
    id: 9518,
    desc: '对所有敌人造成 [(魔法 x 2.75) + 6] 点伤害。将 5 颗黄色宝石转换为屏障宝石。有 10% 的几率额外增加一回合，几率随黄色宝石数量增加而增加。 [x3]',
    build: skill(
      dmg('enemyAll', 6, 2.75, { range: 'all' }),
      transformToSpecial(BaseColor.Yellow, 'barrierGem', { count: 5 }),
      extraTurn({
        chance: 0.1,
        chanceBoost: { mod: { kind: 'multiplier', a: 3 }, source: { kind: 'boardGems', color: BaseColor.Yellow } },
      }),
    ),
  },
  {
    id: 9520,
    desc: '对所有敌人造成 [(魔法 x 2.75) + 6] 点伤害。将 5 颗棕色宝石转换为眩晕宝石。有 10% 的几率额外发动一轮，棕色宝石数量越多，几率越大。 [x3]',
    build: skill(
      dmg('enemyAll', 6, 2.75, { range: 'all' }),
      transformToSpecial(BaseColor.Brown, 'stunGem', { count: 5 }),
      extraTurn({
        chance: 0.1,
        chanceBoost: { mod: { kind: 'multiplier', a: 3 }, source: { kind: 'boardGems', color: BaseColor.Brown } },
      }),
    ),
  },
  {
    id: 9528,
    desc: '给予 3 名盟友 2 点魔法值。板面上每有一颗红色宝石则有 7% 的几率获得一个额外回合。 [x7]',
    // IncreaseSpellPower RandomAlly ×3（RandomPrefNotPrev）→ allyRandomN n:3
    build: skill(
      magic('allyRandomN', 2, 0, { n: 3 }),
      extraTurn({
        chanceBoost: { mod: { kind: 'multiplier', a: 7 }, source: { kind: 'boardGems', color: BaseColor.Red } },
      }),
    ),
  },
  {
    id: 9529,
    desc: '给予 3 名盟友 8 点生命值。板面上每有一颗绿色宝石则有 7% 的几率获得一个额外回合。 [x7]',
    build: skill(
      heal('allyRandomN', 8, 0, { n: 3 }),
      extraTurn({
        chanceBoost: { mod: { kind: 'multiplier', a: 7 }, source: { kind: 'boardGems', color: BaseColor.Green } },
      }),
    ),
  },
  {
    id: 9530,
    desc: '给予 3 名盟友 8 点护甲值。板面上每有一颗蓝色宝石则有 7% 的几率获得一个额外回合。 [x7]',
    build: skill(
      armor('allyRandomN', 8, 0, { n: 3 }),
      extraTurn({
        chanceBoost: { mod: { kind: 'multiplier', a: 7 }, source: { kind: 'boardGems', color: BaseColor.Blue } },
      }),
    ),
  },
  {
    id: 9531,
    desc: '给予 3 名盟友 4 点攻击力。板面上每有一颗黄色宝石则有 7% 的几率获得一个额外回合。 [x7]',
    build: skill(
      attack('allyRandomN', 4, 0, { n: 3 }),
      extraTurn({
        chanceBoost: { mod: { kind: 'multiplier', a: 7 }, source: { kind: 'boardGems', color: BaseColor.Yellow } },
      }),
    ),
  },
  {
    id: 9534,
    desc: '对 3 名随机敌人造成 [魔法 + 3] 真实伤害，并吸取 8 点法力。如果敌人中毒，则吸取双倍法力。',
    // 「吸取双倍」= condMult targetStatus poison ×2（削减族段支持，§5）
    build: skill(
      trueDmg('enemyRandomN', 3, 1, { n: 3 }),
      steal('enemyRandomN', 'mana', 'mana', 8, 0, {
        n: 3,
        condMult: { times: 2, cond: { kind: 'targetStatus', statusId: 'poison' } },
      }),
    ),
  },
  {
    id: 9537,
    desc: '给予所有盟友 4 次攻击力。棋盘上每颗黄色宝石有 7% 的几率获得额外回合。 [x7]',
    build: skill(
      attack('allyAll', 4, 0),
      extraTurn({
        chanceBoost: { mod: { kind: 'multiplier', a: 7 }, source: { kind: 'boardGems', color: BaseColor.Yellow } },
      }),
    ),
  },
  {
    id: 9540,
    desc: '对敌人造成 [魔法 + 3] 点伤害。然后将 6 颗与其法力颜色相同的宝石转换为骷髅。',
    // ConvertGems FromTarget → 跨段目标法力色定量转换（§11 LAST_TARGET）
    build: skill(
      dmg('enemyChosen', 3, 1),
      transform('LAST_TARGET', 'SKULL', { count: 6 }),
    ),
  },
  {
    id: 9542,
    desc: '使敌人患病并晕眩，然后将其击退。引爆 2 颗与其法力颜色相同的宝石。',
    // 「击退」= 击回末位（§12.1）；ExplodeColor FromTarget Amount 2 = 定量爆破其法力色
    build: skill(
      inflict('disease', 'enemyChosen'),
      inflict('stun', 'enemyChosen'),
      reposition('enemyChosen', 'back'),
      explodeRandomGems(2, 0, 'color', 'LAST_TARGET'),
    ),
  },
  {
    id: 9587,
    desc: '制造 6 颗冰冻宝石。然后召唤一支 Dhrak-Zum 部队。',
    // Freeze → freezeGem（波A 状态宝石）；王国 3035（ZH 未译的 Dhrak-Zum/卓克祖）
    build: skill(
      createSpecialGems({ kind: 'freezeGem' }, 6),
      summonRandom(K3035),
    ),
  },
  {
    id: 9589,
    desc: '对 4 名随机敌人造成 [魔法 + 4] 点伤害，伤害值因沉没宝石数而增强。有 50% 的几率使敌方队伍混乱。 [x3]',
    // Submerge → boardSpecial submergeGem；TroopOrderJumble = shuffleTeam（§12.1）
    build: skill(
      dmg('enemyRandomN', 4, 1, {
        n: 4,
        modifier: { mod: { kind: 'multiplier', a: 3 }, source: { kind: 'boardSpecial', gem: 'submergeGem' } },
      }),
      shuffleTeam('enemy', { chance: 0.5 }),
    ),
  },
  {
    id: 9599,
    desc: '制造 3 颗冰冻宝石和 3 颗精灵火宝石。召唤一支随机冰峰部队。然后获得额外回合。',
    // 王国 3011（冰峰之巅）
    build: skill(
      createSpecialGems({ kind: 'freezeGem' }, 3),
      createSpecialGems({ kind: 'faerieFireGem' }, 3),
      summonRandom(K3011),
      extraTurn(),
    ),
  },
  {
    id: 9643,
    desc: '对一名敌人造成[魔法 + 4]点伤害。然后创造 2 颗绿色宝石，数量因野蛮人盟友数而增强。 [x2]',
    // CountArmyType wildfolk（野蛮人）→ alliesOfRace Wildfolk
    build: skill(
      dmg('enemyChosen', 4, 1),
      createGems(BaseColor.Green, 2, 0, {
        modifier: { mod: { kind: 'multiplier', a: 2 }, source: { kind: 'alliesOfRace', race: 'Wildfolk' } },
      }),
    ),
  },
  {
    id: 9660,
    desc: '对一名敌人造成[魔法 + 3]点伤害，伤害值因敌人攻击力而增强，并叠加2层流血效果。如果敌人死亡，则恢复一半法力值。 [x1.5]',
    // CountAttack 150 → targetStat attack ×1.5；GenerateHalfManaConditional = halve + ifTargetDied
    build: skill(
      dmg('enemyChosen', 3, 1, {
        modifier: { mod: { kind: 'multiplier', a: 1.5 }, source: { kind: 'targetStat', stat: 'attack' } },
      }),
      inflict('bleed', 'lastTarget', { stacks: 2 }),
      mana('allySelf', 0, 0, { halve: true, ifTargetDied: true }),
    ),
  },
  {
    id: 9666,
    desc: '将 6 颗指定颜色的宝石转换为网状宝石。然后再制作 4 颗网状宝石。',
    // ConvertGems FromTarget → CHOSEN 色定量转换；Web → web 织网宝石
    build: skill(
      transformToSpecial(CHOSEN, 'web', { count: 6 }),
      createSpecialGems({ kind: 'web' }, 4),
    ),
  },
  {
    id: 9711,
    desc: '对一名敌人和 2 名随机敌人造成 [魔法 + 4] 点伤害，伤害值因友方机甲数量而增强。召唤 2 个随机机甲。 [x7]',
    // CountArmyType mech → alliesOfRace Mech；SummoningType mech ×2 → countRange {2,2}
    build: skill(
      dmg('enemyChosen', 4, 1, {
        modifier: { mod: { kind: 'multiplier', a: 7 }, source: { kind: 'alliesOfRace', race: 'Mech' } },
      }),
      dmg('enemyRandomN', 4, 1, {
        n: 2,
        modifier: { mod: { kind: 'multiplier', a: 7 }, source: { kind: 'alliesOfRace', race: 'Mech' } },
      }),
      summonRandom(MECH_REFS, undefined, { countRange: { min: 2, max: 2 } }),
    ),
  },
  {
    id: 9737,
    desc: '摧毁所有愤怒宝石。赋予所有盟友 [魔法 + 1] 点生命值，数值因摧毁的宝石数量而增强。 [x2]',
    // Enrage → destroySpecialGems enrageGem；「因摧毁的宝石数量」= destroyedGems 无色
    build: skill(
      destroySpecialGems('enrageGem'),
      heal('allyAll', 1, 1, {
        modifier: { mod: { kind: 'multiplier', a: 2 }, source: { kind: 'destroyedGems' } },
      }),
    ),
  },
  {
    id: 9742,
    desc: '对一名敌人造成[魔法 + 1]点伤害，伤害值因愤怒宝石数量而增强。如果敌人死亡，则生成4颗愤怒宝石。 [x2]',
    // Enrage 宝石计数/创造双可表达；「如果敌人死亡」= ifTargetDied（§4）
    build: skill(
      dmg('enemyChosen', 1, 1, {
        modifier: { mod: { kind: 'multiplier', a: 2 }, source: { kind: 'boardSpecial', gem: 'enrageGem' } },
      }),
      createSpecialGems({ kind: 'enrageGem' }, 4, 0, { ifTargetDied: true }),
    ),
  },
  {
    id: 9744,
    desc: '赋予一名盟友[魔法 + 1]生命值和护甲值，数值因愤怒宝石数量而增强。若其已处于愤怒状态，则为其施加屏障。 [x3]',
    // CauseSpecificStatusEffectConditional barrier + targetStatus rage（「其」= 跨段所选盟友）
    build: skill(
      heal('allyChosen', 1, 1, {
        modifier: { mod: { kind: 'multiplier', a: 3 }, source: { kind: 'boardSpecial', gem: 'enrageGem' } },
      }),
      armor('allyChosen', 1, 1, {
        modifier: { mod: { kind: 'multiplier', a: 3 }, source: { kind: 'boardSpecial', gem: 'enrageGem' } },
      }),
      inflict('barrier', 'lastTarget', { ifCond: { kind: 'targetStatus', statusId: 'rage' } }),
    ),
  },
  {
    id: 9776,
    desc: '对一名敌人造成 [魔法 + 3] 点伤害，伤害值因受屏障保护的盟友数量而增强。然后对受屏障保护的 2 名盟友造成伤害。 [x4]',
    // ⚠️ 机翻事故：尾句官方为 CauseBarrier RandomAlly ×2（给 2 名随机盟友屏障），非「造成伤害」
    build: skill(
      dmg('enemyChosen', 3, 1, {
        modifier: { mod: { kind: 'multiplier', a: 4 }, source: { kind: 'allyStatusCount', statusId: 'barrier' } },
      }),
      inflict('barrier', 'allyRandomN', { n: 2 }),
    ),
  },
  {
    id: 9790,
    desc: '摧毁一排敌人。对随机一名敌人造成[魔法 + 3]点伤害，伤害值根据摧毁的蓝色宝石数量提升。 [x3]',
    // 「摧毁一排」= destroyChosenRow；「因摧毁的蓝色宝石」= destroyedGems Blue
    build: skill(
      destroyChosenRow(),
      dmg('enemyRandom', 3, 1, {
        modifier: { mod: { kind: 'multiplier', a: 3 }, source: { kind: 'destroyedGems', color: BaseColor.Blue } },
      }),
    ),
  },
  {
    id: 9793,
    desc: '如果我方队伍中有威廉明娜女王，则将所有棕色宝石转化为流血宝石。引爆[魔法 + 1]颗宝石，受流血宝石加成。',
    // troopPresent 中文名条件（§11.5）；ConvertGems UseCounter（计数 10000）= 条件成立全量转换；
    // 官方 ExplodeGems 无 UseCounter → 「受流血宝石加成」为机翻噪声，不挂 modifier
    build: skill(
      transformToSpecial(BaseColor.Brown, 'bleedGem', {
        ifCond: { kind: 'troopPresent', side: 'ally', name: '威廉明娜女王' },
      }),
      explodeRandomGems(1, 1),
    ),
  },
  {
    id: 9843,
    desc: '对一名敌人和另一名随机敌人造成[(魔法 x 1.5) + 5]点大量溅射伤害。如果一名敌人死亡，则恢复我的法力值。',
    // 单方括号管两段；GenerateFullManaConditional = 重获全部法力（§12.7 manaCost 来源）+ ifTargetDied
    build: skill(
      dmgSplash('enemyChosen', 5, 1.5),
      dmgSplash('enemyRandom', 5, 1.5),
      mana('allySelf', 0, 0, {
        modifier: { mod: { kind: 'multiplier', a: 1 }, source: { kind: 'selfStat', stat: 'manaCost' } },
        ifTargetDied: true,
      }),
    ),
  },
  {
    id: 9844,
    desc: '魅惑、潜入并窃取敌人的[魔法 + 1]点生命值。如果敌人已经处于潜入状态，则有50%的几率将其杀死。',
    // 机翻事故：「潜入」= 下潜 submerged；LethalDamageConditional = execute + 潜入条件 + 50%
    build: skill(
      inflict('charm', 'enemyChosen'),
      inflict('submerged', 'enemyChosen'),
      dmg('enemyChosen', 1, 1, { drain: true }),
      dmg('enemyChosen', 0, 0, {
        execute: true,
        chance: 0.5,
        ifCond: { kind: 'targetStatus', statusId: 'submerged' },
      }),
    ),
  },
  {
    id: 9848,
    desc: '对前 2 个敌人造成 [魔法 + 2] 点伤害，并将他们击退到后排。',
    // 官方 TroopOrderBack SecondEnemy + FrontEnemy：先推首位后（新）首位顶上再推，两段等效
    build: skill(
      dmg('enemyFirstN', 2, 1, { n: 2 }),
      reposition('enemyFront', 'back'),
      reposition('enemyFront', 'back'),
    ),
  },
  {
    id: 9851,
    desc: '对 3 名随机敌人造成 [(魔法 x 0.75) + 2] 点伤害并使其中毒。',
    // Damage + CausePoison FromPrevious ×3 → N 随机伤害 + N 随机中毒（batch-03 8112 先例）
    build: skill(
      dmg('enemyRandomN', 2, 0.75, { n: 3 }),
      inflict('poison', 'enemyRandomN', { n: 3 }),
    ),
  },
  {
    id: 9859,
    desc: '对 4 个随机敌人造成 [魔法 + 4] 点伤害，毒素宝石可提升伤害。如果敌人中毒，则造成双倍伤害。 [1:1]',
    // Poison 宝石计数 + 逐目标 condMult（§5 目标相对条件倍率）
    build: skill(
      dmg('enemyRandomN', 4, 1, {
        n: 4,
        modifier: { mod: { kind: 'multiplier', a: 1 }, source: { kind: 'boardSpecial', gem: 'poisonGem' } },
        condMult: { times: 2, cond: { kind: 'targetStatus', statusId: 'poison' } },
      }),
    ),
  },
  {
    id: 9868,
    desc: '造成[魔法 + 8]点散射伤害，毒素宝石可提升伤害，并扰乱敌方队伍。然后将4颗绿色宝石转化为毒素宝石。 [x8]',
    // 裸散射句式但官方 Target=AllEnemies → enemyAll range all（8639 口径）；TroopOrderJumble = shuffleTeam
    build: skill(
      dmg('enemyAll', 8, 1, {
        range: 'all',
        modifier: { mod: { kind: 'multiplier', a: 8 }, source: { kind: 'boardSpecial', gem: 'poisonGem' } },
      }),
      shuffleTeam('enemy'),
      transformToSpecial(BaseColor.Green, 'poisonGem', { count: 4 }),
    ),
  },
  {
    id: 9881,
    desc: '对一名敌人造成[魔法 + 4]点大量溅射伤害，伤害值受我的护甲加成。然后将其击晕并击退到后方。 [1:1]',
    // CountArmor Self 100 → selfStat armor ×1；SplashHeavyDamage = dmgSplash
    build: skill(
      dmgSplash('enemyChosen', 4, 1, {
        modifier: { mod: { kind: 'multiplier', a: 1 }, source: { kind: 'selfStat', stat: 'armor' } },
      }),
      inflict('stun', 'lastTarget'),
      reposition('lastTarget', 'back'),
    ),
  },
  {
    id: 9905,
    desc: '摧毁一列敌人。对最后一个敌人造成[魔法 + 3]点伤害，伤害值根据摧毁的紫色宝石数量增加。 [x2]',
    build: skill(
      destroyChosenCol(),
      dmg('enemyLast', 3, 1, {
        modifier: { mod: { kind: 'multiplier', a: 2 }, source: { kind: 'destroyedGems', color: BaseColor.Purple } },
      }),
    ),
  },
  {
    id: 9906,
    desc: '引爆3颗随机颜色的宝石。',
    // ExplodeColor ×6（六色各 3）实为「引爆 3 颗（非骷髅）宝石」机翻展开 → explodeRandomGems color
    build: skill(
      explodeRandomGems(3, 0, 'color'),
    ),
  },
  {
    id: 9949,
    desc: '摧毁一排。对随机一名敌人造成[魔法 + 2]点伤害。然后生成3颗棕色宝石，宝石数量受摧毁的骷髅数量加成。 [x3]',
    // 「受摧毁的骷髅数量加成」= destroyedGems 无色（R8 9639 先例，前段整排摧毁含骷髅）
    build: skill(
      destroyChosenRow(),
      dmg('enemyRandom', 2, 1),
      createGems(BaseColor.Brown, 3, 0, {
        modifier: { mod: { kind: 'multiplier', a: 3 }, source: { kind: 'destroyedGems' } },
      }),
    ),
  },
];

export const BATCH_R9: CuratedBatch = { batch: 'R9', spells: SPELLS, skipped: SKIPPED };
