/**
 * 人工核对组装 · 批次 P38（池：scripts/curated-pools/pool-38.json，40 条）
 * 核对者：技能组装子agent。组装 26 条 / 放弃 14 条。
 *
 * 语义口径备注：
 * - 9222「造成 [魔法+8] 点散射伤害」裸散射句式 = enemyChosen 溅射链（spell-rules §0 裸伤害裁定，
 *   batch-r7 9865 同款）。
 * - 8213「再诅咒敌人」/ 9315「再使敌人中毒」→ 'lastTarget' 跨段绑定（§12.3，batch-r7 7791 同款）。
 * - 8665「获得一个额外回合，再创造 2-3 颗许愿宝石，或…，或…」读作：额外回合恒发 +
 *   oneOf 三支（创造/群体伤害/群体治疗，「再 X，或 Y，或 Z」枚举三选一）。
 * - 8569 第三段「每有 1 颗炸弹宝石则再爆破 1 颗宝石」= 随机爆破数量挂 modifier
 *   （base 0 + multiplier 1 × boardSpecial bomb；0 颗时空转，原语批定量随机口径）。
 * - 8661「有 4% 的几率将其杀戮，每有一颗末日骷髅头几率增强 4%」= execute 段 chance + chanceBoost
 *   （boardSpecial doomSkull，batch-r7 9942 同款；段级统一掷签为 §2 固定口径）。
 * - 9168-9173「巨人宝石」、9184「闪电宝石」（未分行/列）→ 特殊宝石 SKIP（见 SKIPPED）。
 * - 种族口径：妖仙 = Fey、秘士 = Mystic（troops.json troopTypes，summonRandom 引用池内联）。
 */
import type { CuratedBatch } from './index';
import { skill, dmg, trueDmg, heal, armor, inflict, createGems, createSkulls, createSpecialGems, createMix, transform, transformToSpecial, explodeSpecialGems, explodeRandomGems, oneOf, createStorm, summonRef, summonRandom, extraTurn, transformTroop, CHOSEN, CELL, explodeAt } from '../builders';
import { BaseColor } from '../../types';

// 机械军队引用池（troopTypes 含 Mech，从 troops.json 内联）
const MECH_REFS = ["SteamTurret","FlameCannon","DeepBorer","BlastCannon","Carnex","TANKBOT-2000","GoblinRocket","Bombot","DRACOS-1337","ClockworkKnight","SentryBot","Shocktopus","ClockworkSphinx","TED-1000","TINA-9000","ROVER-300","MechaGnome","P4-NTH4","MechaRat","Smash-o-bot","Detect-o-bot","Destruct-o-Bot","TinkSteamwhistle","S.O.L.A.R","NUTCRKR-1225","Mechataur","Ironhawk","TheSparkinator","Limpet-bot","Mechamare","Mechweaver","BORK-3000","TeslasEngine","Amphib-o-Bot","FIXIT-5000","ImmortalTitanius","MokTheCannon-Rider","WATTS-1927","LOCK-1887","RatchetCogbolt","WEEZL-300","DRIDR-8000","NAV-1057"];
// 秘士引用池（troopTypes 含 Mystic，从 troops.json 内联）
const MYSTIC_REFS = ["Ettin","Acolyte","Warlock","Lamia","GoblinShaman","IceWitch","Aziris","Druid","Dokkalfar","Summoner","Soothsayer","Hag","Faunessa","Tassarion","Runesmith","Famine","SacrificialPriest","TalRae","AnubiteWarrior","MadProphet","TheDragonSoul","LadyAnariel","CorruptSorceress","Apothecary","VoidPortal","NightHag","DragonianMonk","ElvenBard","Enchantress","Unicorn","PrincessElspeth","Heronath","Owleth","Tezca","Sekhma","DarkPriestess","Anthea","Wisp","BabaYaga","Necrezza","Nax","PrincessFizzbang","AncientGolem","Asha","Azura","QueenTitania","Xathenos","SolZara","Spiritmane","Morterra","Viper","Spiritdancer","Caprinicus","Bonebinder","Igneus","Medea","Urskula","Nimue","FallenValdis","Lust","GraveSeer","SilentSentinel","SeaWitch","Tarantella","SibylOfLust","Earthcaller","TianYi","Luna","Nightwing","MoonRabbit","FistOfZorn","SilverOak","LordEhrondil","QueenOfSin","ShamanOfSet","HexRat","VanyaSoulmourn","Grimcorn","Starflower","PavosDawnwind","HarpyMage","QueenXochi","Fungomancer","Aquaticus","CorruptMagus","Ahrimas","GorThrum","Kobra","QueenMoonclaw","Spell-Paw","ShahbanuVespera","Malcandessa","Lyrasza","OgrakShaman","WillOfNysha","MothMage","QueenBeetrix","Patience","VulpineMage","BlindGuardian","Sycorax","Thaumataur","PandaskaMage","KeeperOfLore","BookOfSecrets","GaelSpiritwhisperer","IllithianServitor","StarryMage","Auspecia","Orrery","DragonianSage","DeepMagus","SpringEmissary","Cyrene","Argos","Dao","DarkDjinnBottle","RegentKhalif","DragonSpirit","Essencia","SkyMage","Grimmoira","Leanansidhe","LadyEstelle","Kalika","MoonPhoenix","Leocorn","Stormchaser","Draxxius","IcespireShaman","DarkbornWarlock","WuHao","Ostryx","HornedHag","Saga","TheGemini","LapinaHealer","FakyrTheWise","Carmina","DeathlockDreilak","Morganite","EldritchDisciple","SetauriMage","Harper","FennecMage","SableSpiritbane","Chiron","Spirittooth","Tuzi","TheSilkenQueen","AssessorOfMahat","AravatarsTusk","SeaHag","HauntedDoll","DaemonChild","Feyr","TheMidnightQueen","Half-DaemonKnight","LadyOfBones","TheMydnightKing","BoneHound","VoidManticore","LadyOfRuin","Khronos","MantisMage","DaughterOfTime","Ehecatl","Caprichor","FireJuggler","Ringmaster","ArcaneSabercat","RuneChanter","Unagh","Amatiel","BookOfWitches","TheCartographer","Bearlock","Isban","SuccubusQueen","LioraMistveil","Ignarion","GuardianSpirit","ArchdruidBlackwood","LordDesollatus","Al-Mundhir","SoulSummoner","CrestedAva","AlaAl-Din","Bahamata","CorruptedCrystalem","HeldrTheGrave","Chargrimax","Abraxas","Yue-She","ScoriaGiant-born","ToxicHag","Muireann","Woodseer","LightbornEnchantress","Scrollweaver","Sarathiel","Cosmo","TheDarkOracle","Mayahuel","Astrotaur","Eridana","Ariosa","Amethony","MorZarn","SpiritcallerLila","QueenWilhelmina","BloodSpore","Merneith","Yohaulticetl","CromCruach","MotherMalice","GreenHag","TwistedHag","DarkWitch","TheWebbedPrince","DuskWitch","Ciaran","ErendrielDarkweave","FacelessLord","Jezebel","ImmortalByblios","TheWeepingDuchess","TheBansheeQueen"];

const SKIPPED: { id: number; reason: string }[] = [
  { id: 8070, reason: '语义拿不准（「每摧毁一颗骷髅头则使一名随机敌人陷入死亡标记」按来源数量重复施加状态无原语——status 段 modifier 无法驱动施加次数，batch-28 8885 同款）' },
  { id: 8320, reason: '语义拿不准（「使所有被伤害的敌人陷入燃烧和疾病状态」——被前段溅射命中的敌人集合无对应目标模式，lastTarget 仅首目标）' },
  { id: 8758, reason: '句子式不明（「爆破 3x3 块宝石」无面积清除原语，batch-15 8541/batch-30 8585 同款）；「每有一名红色盟友或敌人」缺敌方按色计数来源（仅 alliesOfColor）' },
  { id: 9168, reason: '特殊宝石（「蓝色巨人宝石」= 巨人宝石族，GEMS-SEMANTICS-2 后续波未落地；爆破一列+治疗两段本身可表达，整条安全跳过）' },
  { id: 9169, reason: '特殊宝石（「绿色巨人宝石」，9168 同款）' },
  { id: 9170, reason: '特殊宝石（「红色巨人宝石」，9168 同款）' },
  { id: 9171, reason: '特殊宝石（「黄色巨人宝石」，9168 同款）' },
  { id: 9172, reason: '特殊宝石（「紫色巨人宝石」，9168 同款）' },
  { id: 9173, reason: '特殊宝石（「棕色巨人宝石」，9168 同款）' },
  { id: 9598, reason: '晋升度条件（「如果敌人是 Boss，则基于我已晋升的稀有度造成 3 到 5 倍伤害」）' },
  { id: 9730, reason: '晋升度条件（「如果敌人是塔，则基于我已晋升的稀有度造成 3 到 5 倍伤害」）' },
  { id: 9909, reason: '语义拿不准（「随机减少一名敌人的[魔法+1]点技能点数」——随机技能值仅有获得原语 randomStat，无随机削减原语；「诅咒和蛛网束缚的敌人可提升」modifier enemyStatusCount curse+web 可表达，仅缺主体）' },
];

const SPELLS: CuratedBatch['spells'] = [
  {
    id: 7671,
    desc: '对所有敌人造成 [魔法 + 6] 点散射伤害。伤害值因妖仙盟友数量而增强。有 50% 的几率使一名随机敌人陷入疾病状态。 [x4]',
    build: skill(
      dmg('enemyAll', 6, 1, { range: 'all', modifier: { mod: { kind: 'multiplier', a: 4 }, source: { kind: 'alliesOfRace', race: 'Fey' } } }),
      inflict('disease', 'enemyRandom', { chance: 0.5 }),
    ),
  },
  {
    id: 7983,
    desc: '对所有敌人造成 [魔法 + 1] 点伤害。伤害值因红色宝石数和燃烧的敌人数而增强。若存在火风暴，则伤害双倍。 [1:1]',
    build: skill(
      dmg('enemyAll', 1, 1, {
        range: 'all',
        modifier: { mod: { kind: 'ratio', a: 1, b: 1 }, sources: [{ kind: 'boardGems', color: BaseColor.Red }, { kind: 'enemyStatusCount', statusId: 'burning' }] },
        condMult: { times: 2, cond: { kind: 'stormPresent', color: BaseColor.Red } },
      }),
    ),
  },
  {
    id: 8139,
    desc: '对所有敌人造成 [魔法 + 2] 点伤害. 创造 14 颗宝石，所创造的宝石混合棕色宝石和绿色宝石，伤害值因陷入中毒和疾病状态的敌人而增强。获得一个额外的回合。 [1:1]',
    build: skill(
      dmg('enemyAll', 2, 1, { range: 'all', modifier: { mod: { kind: 'ratio', a: 1, b: 1 }, sources: [{ kind: 'enemyStatusCount', statusId: 'poison' }, { kind: 'enemyStatusCount', statusId: 'disease' }] } }),
      createMix([BaseColor.Brown, BaseColor.Green], 14),
      extraTurn(),
    ),
  },
  {
    id: 8213,
    desc: '爆破一颗宝石。对第一位敌人造成 [魔法 + 3] 点伤害，伤害值因被摧毁的紫色宝石而增强。再诅咒敌人。 [x3]',
    build: skill(
      explodeAt(CELL),
      dmg('enemyFront', 3, 1, { modifier: { mod: { kind: 'multiplier', a: 3 }, source: { kind: 'destroyedGems', color: BaseColor.Purple } } }),
      inflict('curse', 'lastTarget'),
    ),
  },
  {
    id: 8293,
    desc: '对一名敌人造成 [魔法 + 7] 点伤害，伤害值因紫色宝石而增强。若存在一个风暴，则伤害双倍。若敌人身亡，则创造 12 颗骷髅头。 [1:1]',
    build: skill(
      dmg('enemyChosen', 7, 1, {
        modifier: { mod: { kind: 'ratio', a: 1, b: 1 }, source: { kind: 'boardGems', color: BaseColor.Purple } },
        condMult: { times: 2, cond: { kind: 'stormPresent' } },
      }),
      createSkulls(12, 0, { ifTargetDied: true }),
    ),
  },
  {
    id: 8363,
    desc: '使一名敌人陷入死亡标记状态。创造 6 颗紫色宝石，数量因陷入死亡标记状态的敌人数而增强。 [x3]',
    build: skill(
      inflict('death-mark', 'enemyChosen'),
      createGems(BaseColor.Purple, 6, 0, { modifier: { mod: { kind: 'multiplier', a: 3 }, source: { kind: 'enemyStatusCount', statusId: 'death-mark' } } }),
    ),
  },
  {
    id: 8569,
    desc: '给予首 2 位盟友 [魔法 + 1] 点护甲值。爆破 2 颗宝石。每有 1 颗炸弹宝石则再爆破 1 颗宝石。 [1:1]',
    build: skill(
      armor('allyFirstN', 1, 1, { n: 2 }),
      explodeRandomGems(2, 0),
      // 「每有 1 颗炸弹宝石则再爆破 1 颗」：爆破数量 = 0 + 1×场上炸弹宝石数（base 0，无炸弹时空转）
      explodeRandomGems(0, 0, 'all', undefined, { modifier: { mod: { kind: 'multiplier', a: 1 }, source: { kind: 'boardSpecial', gem: 'bomb' } } }),
    ),
  },
  {
    id: 8661,
    desc: '使所有敌人陷入疾病状态，有 4% 的几率将其杀戮。每有一颗末日骷髅头则几率增强 4%。 [x4]',
    // 修正（2026-09-18 官方复核）：官方 LethalDamageConditional@RandomEnemy = 杀 1 名随机敌人，
    // 非对全体敌人各掷一次即杀（期望伤害显著偏高）
    build: skill(
      inflict('disease', 'enemyAll'),
      dmg('enemyRandom', 0, 0, {
        execute: true,
        chance: 0.04,
        chanceBoost: { mod: { kind: 'multiplier', a: 4 }, source: { kind: 'boardSpecial', gem: 'doomSkull' } },
      }),
    ),
  },
  {
    id: 8665,
    desc: '获得一个额外回合，再创造 2-3 颗许愿宝石，或对所有敌人造成 [魔法 + 1] 点伤害，伤害值因许愿宝石数而增强，或给予所有其他盟友 [魔法 + 1] 点生命值，数值因许愿宝石数而增强。 [x5]',
    build: skill(
      extraTurn(),
      // sa-R6 L2-7125-branches：原生 Randomize AB+(C-D-E-F) = 2 颗 | 伤害 | 治疗 | 3 颗，各 1/4
      // （原为三选一、创造分支内再 2-3 掷签：创造 1/3、伤害 1/3、治疗 1/3）
      oneOf(
        [createSpecialGems({ kind: 'wish' }, 2)],
        [dmg('enemyAll', 1, 1, { range: 'all', modifier: { mod: { kind: 'multiplier', a: 5 }, source: { kind: 'boardSpecial', gem: 'wish' } } })],
        [heal('allyOthers', 1, 1, { modifier: { mod: { kind: 'multiplier', a: 5 }, source: { kind: 'boardSpecial', gem: 'wish' } } })],
        [createSpecialGems({ kind: 'wish' }, 3)],
      ),
    ),
  },
  {
    id: 8667,
    desc: '诅咒 2 名随机敌人。板面上每有一颗红色宝石则有 7% 几率获得一个额外回合。 [x7]',
    build: skill(
      inflict('curse', 'enemyRandomN', { n: 2 }),
      extraTurn({ chance: 0.07, chanceBoost: { mod: { kind: 'multiplier', a: 7 }, source: { kind: 'boardGems', color: BaseColor.Red } } }),
    ),
  },
  {
    id: 8973,
    desc: '对一名敌人造成 [魔法 + 4] 点真实伤害，伤害值因自身生命值而增强。若敌人身亡，则爆破所有死亡标记宝石。 [2:1]',
    build: skill(
      trueDmg('enemyChosen', 4, 1, { modifier: { mod: { kind: 'ratio', a: 2, b: 1 }, source: { kind: 'selfStat', stat: 'hp' } } }),
      { ...explodeSpecialGems('deathMarkGem'), ifTargetDied: true },
    ),
  },
  {
    id: 8977,
    desc: '创造 3 颗炸弹宝石。再爆破 4 颗宝石，并召唤一个随机机械军队。',
    build: skill(
      createSpecialGems({ kind: 'bomb' }, 3),
      explodeRandomGems(4, 0),
      summonRandom(MECH_REFS),
    ),
  },
  {
    id: 8978,
    desc: '对一名敌人造成 [魔法 + 2] 点伤害。若敌人陷入死亡标记状态，则造成双倍伤害。再创造 2 颗死亡标记宝石。',
    build: skill(
      dmg('enemyChosen', 2, 1, { condMult: { times: 2, cond: { kind: 'targetStatus', statusId: 'death-mark' } } }),
      createSpecialGems({ kind: 'deathMarkGem' }, 2),
    ),
  },
  {
    id: 8984,
    desc: '对一名敌人造成 [魔法 + 2] 点伤害，伤害值因自身生命值而增强。若敌人身亡，则创造 8 颗死亡标记宝石和 8 颗骷髅头。 [3:1]',
    build: skill(
      dmg('enemyChosen', 2, 1, { modifier: { mod: { kind: 'ratio', a: 3, b: 1 }, source: { kind: 'selfStat', stat: 'hp' } } }),
      createSpecialGems({ kind: 'deathMarkGem' }, 8, 0, { ifTargetDied: true }),
      createSkulls(8, 0, { ifTargetDied: true }),
    ),
  },
  {
    id: 9026,
    desc: '对一名敌人造成 [魔法 + 3] 点伤害。若敌人陷入猎人标记状态，则造成 3 倍伤害。有 25% 的几率转化成杜尔本。',
    build: skill(
      dmg('enemyChosen', 3, 1, { condMult: { times: 3, cond: { kind: 'targetStatus', statusId: 'marked' } } }),
      transformTroop('allySelf', 'BeastmasterTorbern', { chance: 0.25 }),
    ),
  },
  {
    id: 9123,
    desc: '对一名敌人造成 [魔法 + 3] 点伤害，伤害值因沙漏宝石数而增强。若敌人身亡，则创造 4 颗沙漏宝石，并获得一个额外回合。 [x3]',
    build: skill(
      dmg('enemyChosen', 3, 1, { modifier: { mod: { kind: 'multiplier', a: 3 }, source: { kind: 'boardSpecial', gem: 'hourglass' } } }),
      createSpecialGems({ kind: 'hourglass' }, 4, 0, { ifTargetDied: true }),
      extraTurn({ ifTargetDied: true }),
    ),
  },
  {
    id: 9127,
    desc: '将所有红色宝石转换成织网宝石。再召唤一名暗夜蜘蛛。',
    build: skill(
      transformToSpecial(BaseColor.Red, 'web'),
      summonRef('NightSpider'),
    ),
  },
  {
    id: 9129,
    desc: '将所有蓝色宝石转换成黄色。再召唤光风暴。',
    build: skill(
      transform(BaseColor.Blue, BaseColor.Yellow),
      createStorm(BaseColor.Yellow),
    ),
  },
  {
    id: 9222,
    desc: '造成 [魔法 + 8] 点散射伤害，伤害值因染疾病的敌人数而增强。使 1-3 名随机敌人染上疾病。 [x8]',
    // 裸散射重裁（2026-09-18）：官方 ScatterDamage@AllEnemies = 全体散射
    build: skill(
      dmg('enemyAll', 8, 1, { range: 'all', modifier: { mod: { kind: 'multiplier', a: 8 }, source: { kind: 'enemyStatusCount', statusId: 'disease' } } }),
      // Native 9222: CauseDisease@RandomEnemy + 2 x @RandomPrefNotPrevEnemy (three rolls, each avoids only the previous; was 1-3 distinct).
      inflict('disease', 'enemyRandom'),
      inflict('disease', 'enemyRandomPrefNotPrev'),
      inflict('disease', 'enemyRandomPrefNotPrev'),
    ),
  },
  {
    id: 9239,
    desc: '诅咒 2 名随机敌人。召唤一名随机秘士。',
    build: skill(
      inflict('curse', 'enemyRandomN', { n: 2 }),
      summonRandom(MYSTIC_REFS),
    ),
  },
  {
    id: 9279,
    desc: '魅惑一名敌人并窃取其 [(魔法 x 2) + 1] 点生命值。召唤 1-3 名魅妖或魅魔。',
    build: skill(
      inflict('charm', 'enemyChosen'),
      dmg('enemyChosen', 1, 2, { drain: true }),
      // L1-7515-summon-dist: native Summoning 6305 Incubus, 6180 Succubus 50%, 6305 Incubus 25% (independent).
      summonRef('Incubus'),
      summonRef('Succubus', undefined, { chance: 0.5 }),
      summonRef('Incubus', undefined, { chance: 0.25 }),
    ),
  },
  {
    id: 9314,
    desc: '将所有选定颜色的宝石转换成诅咒宝石。将 3 颗骷髅头转换成死亡标记宝石，再将其他的骷髅头转换成末日骷髅头。',
    // 修正（2026-09-18 官方复核）：官方 ConvertGems(Skull→UberDoomskull) = 极度末日骷髅头
    //（中文漏译「极度」，普通末日为降一级误装）
    build: skill(
      transformToSpecial(CHOSEN, 'curseGem'),
      transformToSpecial('SKULL', 'deathMarkGem', { count: 3 }),
      transformToSpecial('SKULL', 'uberDoomSkull'),
    ),
  },
  {
    id: 9315,
    desc: '对一名敌人造成 [魔法 + 3] 点伤害，伤害值因陷入诅咒和织网状态的敌人数而增强。再使敌人中毒。 [x3]',
    build: skill(
      dmg('enemyChosen', 3, 1, { modifier: { mod: { kind: 'multiplier', a: 3 }, sources: [{ kind: 'enemyStatusCount', statusId: 'curse' }, { kind: 'enemyStatusCount', statusId: 'web' }] } }),
      inflict('poison', 'lastTarget'),
    ),
  },
  {
    id: 9856,
    desc: '对随机一名敌人造成[魔法 + 3]点伤害，伤害效果受棕色宝石加成。如果任何敌人被诅咒，则获得额外回合。 [3:1]',
    build: skill(
      dmg('enemyRandom', 3, 1, { modifier: { mod: { kind: 'ratio', a: 3, b: 1 }, source: { kind: 'boardGems', color: BaseColor.Brown } } }),
      extraTurn({ ifCond: { kind: 'anyEnemyStatus', statusId: 'curse' } }),
    ),
  },
  {
    id: 9858,
    desc: '给予一名盟友[魔法 + 1]件护甲，该护甲效果受诅咒盟友和敌人的影响。然后将黄色宝石转化为诅咒宝石。 [x3]',
    build: skill(
      armor('allyChosen', 1, 1, { modifier: { mod: { kind: 'multiplier', a: 3 }, sources: [{ kind: 'allyStatusCount', statusId: 'curse' }, { kind: 'enemyStatusCount', statusId: 'curse' }] } }),
      transformToSpecial(BaseColor.Yellow, 'curseGem'),
    ),
  },
  {
    id: 9995,
    desc: '获得[魔法 + 3]点护甲。焚烧所有敌人，并生成2个燃烧宝石，每有一个红色盟友，额外生成2个燃烧宝石。 [x2]',
    build: skill(
      armor('allySelf', 3, 1),
      inflict('burning', 'enemyAll'),
      // modifier 点名「生成宝石数」→ 只挂创造段
      createSpecialGems({ kind: 'burningGem' }, 2, 0, { modifier: { mod: { kind: 'multiplier', a: 2 }, source: { kind: 'alliesOfColor', color: BaseColor.Red } } }),
    ),
  },
];

export const BATCH_P38: CuratedBatch = { batch: 'p38', spells: SPELLS, skipped: SKIPPED };
