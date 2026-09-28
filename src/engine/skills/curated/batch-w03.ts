/**
 * 窗口 K-B · 武器法术批次 W03（池：scripts/curated-pools/pool-w01.json；分保真度绑定）。
 *
 * 来源：artifacts/gowhead-weapons/weapons.json（zh 文本逐字锚定，校验见
 * tests/unit/weaponSpellAudit.test.ts——与部队批次的 troops.json 锚定不同源）。
 * 保真度：本批全部为 full/partial（partial = 可编译子句照常入 build、卡点子句按
 * missingFeatures/skippedClauses 略去；mana-only 占位绑定不进批次，见
 * src/data/weapon-skill-meta.json）。组装规则锚定 scripts/spell-rules.md 与
 * 既有部队批次先例；生成器 scripts/_weapon_pools.mjs gen。
 */
import { armor, attack, chooseSkill, cleanse, createGems, createGemsMixAny, createMix, createSpecialGems, createSpecialGems2, createStorm, destroyColor, destroyRandomCols, destroyRandomGems, dmg, dmgSplash, explodeAt, explodeChosenCol, explodeChosenRow, explodeRandomGems, extraTurn, gainGold, heal, inflict, inflictRandom, mana, oneOf, reduce, reposition, shuffleTeam, skill, summonRandom, targetedSkill, transform, transformToSpecial, trueDmg, CHOSEN, CELL } from '../builders';
import { BaseColor } from '../../types';
import type { SkillPrototype } from '../prototypes';
import type { CuratedBatch } from './index';
import { rawKingdomPool } from './gowKingdomPools';

const SKIPPED: { id: number; reason: string }[] = [];

const SPELLS: CuratedBatch['spells'] = [
  {
    id: 8401,
    desc: '对一名敌人造成 [魔法 + 2] 点伤害，伤害值因自身灵魂数而增强。 [1:1]',
    build: skill(
      dmg('enemyChosen', 2, 1, { modifier: { mod: { kind: 'ratio', a: 1, b: 1 }, source: { kind: 'battleSouls' } } }),
    ),
  },
  {
    id: 8402,
    desc: '对一名敌人造成 [魔法 + 7] 点伤害，伤害值因矮人盟友数而增强。每有一位矮人盟友则创造 6 颗混合蓝色和棕色的宝石。 [x6]',
    build: skill(
      dmg('enemyChosen', 7, 1, { modifier: { mod: { kind: 'multiplier', a: 6 }, source: { kind: 'alliesOfRace', race: 'Dwarf' } } }),
      createMix([BaseColor.Blue, BaseColor.Brown], 0, 0, { modifier: { mod: { kind: 'multiplier', a: 6 }, sources: [{ kind: 'alliesOfRace', race: 'Dwarf' }] } }),
    ),
  },
  {
    id: 8403,
    desc: '获得屏障效果。对一名敌人造成 [魔法 + 3] 点伤害并使其陷入沉默状态。',
    build: skill(
      inflict('barrier', 'allySelf'),
      dmg('enemyChosen', 3, 1),
      inflict('silence', 'lastTarget'),
    ),
  },
  {
    id: 8404,
    desc: '获得屏障效果。给予一名盟友 [(魔法 x 1.5) + 1] 点生命值，并将其净化和赋予其法印效果。',
    build: skill(
      inflict('barrier', 'allySelf'),
      heal('allyChosen', 1, 1.5),
      cleanse('lastTarget'),
      inflict('enchanted', 'lastTarget'),
    ),
  },
  {
    id: 8409,
    desc: '对一名敌人造成 [魔法 + 6] 点伤害。若有机械盟友，则先消除敌人 30 点护甲值。召唤一个电风暴。',
    build: skill(
      dmg('enemyChosen', 6, 1),
      reduce('enemyChosen', 'armor', 30, 0, { ifCond: { kind: 'allyRacePresent', race: 'Mech' } }),
      createStorm(BaseColor.Yellow),
    ),
  },
  {
    id: 8432,
    desc: '对一名敌人造成 [魔法 + 3] 点伤害。若敌人已被诅咒，则创造 8 颗绿色宝石。若敌人已陷入织网状态，则创造 8 颗紫色宝石。',
    build: skill(
      // Native 8432: CreateGems@FromTarget Green {AddForCursed 8} ; Purple {AddForWeb 8} ; then Damage@FromTarget.
      // Condition = the chosen enemy's status before the cast (damage first is equivalent: creates never touch statuses).
      dmg('enemyChosen', 3, 1),
      createGems(BaseColor.Green, 8, 0, { ifCond: { kind: 'lastTargetStatusAtCastStart', statusId: 'curse' } }),
      createGems(BaseColor.Purple, 8, 0, { ifCond: { kind: 'lastTargetStatusAtCastStart', statusId: 'web' } }),
    ),
  },
  {
    id: 8434,
    desc: '对一名敌人造成 [魔法 + 7] 点伤害，伤害值因黑石盟友数而增强。每有一名黑石盟友，则创造 6 颗混合蓝色和紫色的宝石。 [x6]',
    build: skill(
      dmg('enemyChosen', 7, 1, { modifier: { mod: { kind: 'multiplier', a: 6 }, source: { kind: 'alliesOfKingdom', kingdom: '黑石' } } }),
      createMix([BaseColor.Blue, BaseColor.Purple], 0, 0, { modifier: { mod: { kind: 'multiplier', a: 6 }, source: { kind: 'alliesOfKingdom', kingdom: '黑石' } } }),
    ),
  },
  {
    id: 8435,
    desc: '对一名敌人造成 [魔法 + 7] 点伤害，伤害值因牛头族盟友数而增强。每有一名牛头族盟友，则创造 6 颗混合绿色和棕色的宝石。 [x6]',
    build: skill(
      dmg('enemyChosen', 7, 1, { modifier: { mod: { kind: 'multiplier', a: 6 }, source: { kind: 'alliesOfRace', race: 'Tauros' } } }),
      createMix([BaseColor.Green, BaseColor.Brown], 0, 0, { modifier: { mod: { kind: 'multiplier', a: 6 }, sources: [{ kind: 'alliesOfRace', race: 'Tauros' }] } }),
    ),
  },
  {
    id: 8436,
    desc: '对所有敌人造成 [魔法 + 2] 点伤害，伤害值因紫色盟友和敌人数而增强。使所有敌人陷入死亡标记状态。若有 13 或更多颗棕色宝石，则获得 2 点魔力值。 [x2]',
    build: ({"segments":[{"kind":"damage","target":"enemyAll","scaling":{"base":2,"mult":1},"range":"all","modifier":{"mod":{"kind":"multiplier","a":2},"sources":[{"kind":"alliesOfColor","color":"Purple"},{"kind":"enemiesOfColor","color":"Purple"}]}},{"kind":"status","target":"enemyAll","statusId":"death-mark","turns":3},{"kind":"buff","target":"allySelf","stat":"magic","scaling":{"base":2,"mult":0},"ifCond":{"kind":"boardAtLeast","color":"Brown","n":13}}]} as SkillPrototype),
  },
  {
    id: 8437,
    desc: '爆破 [魔法 + 1] 颗黄色宝石。赋予所有神祇盟友一个随机状态效果。召唤一名神祇军队。',
    build: skill(
      explodeRandomGems(1, 1, 'color', BaseColor.Yellow),
      inflictRandom('allyAll', { targetRace: 'Divine', pool: 'positive' }),
      summonRandom(['StarGazer', 'Priestess', 'Paladin', 'ArchonStatue', 'SacredGuardian', 'Valkyrie', 'Celestasia', 'Mercy', 'Valor', 'MorthanisWill', 'TheDevoted', 'GrandInquisitor', 'GaardsAvatar', 'Pharos-Ra', 'ForestGuardian', 'BastitePriestess', 'JotnarStormshield', 'KetrasTheBull', 'Stonehammer', 'Bishop', 'HighPaladin', 'QueenAurora', 'Infernus', 'YasminesChosen', 'Euryali', 'MonkeyDisciple', 'XiongMao', 'Diviner', 'Penglong', 'VoiceOfOrpheus', 'Skadi', 'DivineIshbaala', 'WarCleric', 'StatueOfSt.Veritas', 'SisterSuperior', 'Undine', 'Divinia', 'Ubastet', 'Suna', 'Nightshade', 'HolySt.Astra', 'Qilin', 'Gravitas', 'Umenath', 'WillOfNysha', 'Solari', 'Patience', 'Virtue', 'Ishtara', 'Ankhnum', 'FlameOfAnu', 'Quetzalma', 'HighPriestessChazka', 'TheArchdeva', 'Baihu', 'Vernalis', 'Huanglong', 'Veneratus', 'Ullor', 'AstralMother', 'UrielleTheGuardian', 'ArchproxyYvendra', 'WaterbornPriestess', 'Ascendance', 'Libara', 'Sagittarian', 'PriestessOfLight', 'Rath-Amon', 'PriestOfNilbog', 'Fenix', 'Zhuque', 'OrpheusPriestess', 'HighCleric', 'CommanderDawnheart', 'Aravatar', 'MouthOfZorn', 'Dominion', 'Virago', 'MorthanisDarkness', 'GuardianOfLaw', 'TheTurquoiseEmperor', 'TawaritePriestess', 'Takshaka', 'Amatiel', 'TheBlessedMaiden', 'Retribution', 'HolyArcher', 'Peregrine', 'Gormungandr', 'Xuanwu', 'HanXin', 'HorusiteChampion', 'SekhitePriestess', 'ImmortalZachariel', 'Raquel', 'Sarathiel', 'Cascabel', 'Onouris'], undefined),
    ),
  },
  {
    id: 8439,
    desc: '给予一位盟友 [魔法 + 1] 点生命值，数值因棕色宝石而增强。再给予其四分之一的法力值。 [x2]',
    build: skill(
      // sa-R7: native spell Target Ally, both steps FromTarget = the one chosen ally (was allyAll).
      heal('allyChosen', 1, 1, { modifier: { mod: { kind: 'multiplier', a: 2 }, source: { kind: 'boardGems', color: BaseColor.Brown } } }),
      mana('allyChosen', 0, 0, { fraction: 0.25 }),
    ),
  },
  {
    id: 8440,
    desc: '消除 [魔法 + 1] 点随机技能值，再使一名敌人陷入诅咒、死亡标记和疾病状态。',
    build: skill(
      reduce('enemyChosen', 'random', 1, 1),
      inflict('curse', 'enemyChosen'),
      inflict('death-mark', 'enemyChosen'),
      inflict('disease', 'enemyChosen'),
    ),
  },
  {
    id: 8441,
    desc: '对一名敌人造成 [魔法 + 6] 点伤害。若敌人使用紫色法力值，则使其陷入死亡标记状态。',
    build: skill(
      dmg('enemyChosen', 6, 1),
      inflict('death-mark', 'lastTarget', { ifCond: { kind: 'targetColor', color: BaseColor.Purple } }),
    ),
  },
  {
    id: 8442,
    desc: '创造 4 颗绿色宝石，每锻炼 1 个武器段位则 +1 颗宝石。给予所有蓝色盟友 [魔法 + 2] 点护甲值。若敌方有劫数，则消除一位随机敌人所有护甲值。',
    build: skill(
      createGems(BaseColor.Green, 4, 0, { modifier: { mod: { kind: 'multiplier', a: 1 }, source: { kind: 'tempering' } } }),
      armor('allyAll', 2, 1, { ifCond: { kind: 'targetColor', color: BaseColor.Blue } }),
      reduce('enemyAll', 'armor', 0, 0, { drainAll: true, ifCond: { kind: 'targetHasDoom' } }),
    ),
  },
  {
    id: 8443,
    desc: '创造 4 颗蓝色宝石，每锻炼 1 个武器段位则 +1 颗宝石。给予所有绿色盟友 [魔法 + 1] 点护甲值。若敌方有劫数，则消除一位随机敌人所有护甲值。',
    build: skill(
      createGems(BaseColor.Blue, 4, 0, { modifier: { mod: { kind: 'multiplier', a: 1 }, source: { kind: 'tempering' } } }),
      armor('allyAll', 1, 1, { ifCond: { kind: 'targetColor', color: BaseColor.Green } }),
      reduce('enemyAll', 'armor', 0, 0, { drainAll: true, ifCond: { kind: 'targetHasDoom' } }),
    ),
  },
  {
    id: 8444,
    desc: '创造 4 颗黄色宝石，每锻炼 1 个武器段位则 +1 颗宝石。给予所有红色盟友 [魔法 + 1] 点护甲值。若敌方有劫数，则消除一位随机敌人所有护甲值。',
    build: skill(
      createGems(BaseColor.Yellow, 4, 0, { modifier: { mod: { kind: 'multiplier', a: 1 }, source: { kind: 'tempering' } } }),
      armor('allyAll', 1, 1, { ifCond: { kind: 'targetColor', color: BaseColor.Red } }),
      reduce('enemyAll', 'armor', 0, 0, { drainAll: true, ifCond: { kind: 'targetHasDoom' } }),
    ),
  },
  {
    id: 8445,
    desc: '创造 4 颗红色宝石，每锻炼 1 个武器段位则 +1 颗宝石。给予所有黄色盟友 [魔法 + 1] 点护甲值。若敌方有劫数，则消除一位随机敌人所有护甲值。',
    build: skill(
      createGems(BaseColor.Red, 4, 0, { modifier: { mod: { kind: 'multiplier', a: 1 }, source: { kind: 'tempering' } } }),
      armor('allyAll', 1, 1, { ifCond: { kind: 'targetColor', color: BaseColor.Yellow } }),
      reduce('enemyAll', 'armor', 0, 0, { drainAll: true, ifCond: { kind: 'targetHasDoom' } }),
    ),
  },
  {
    id: 8446,
    desc: '创造 4 颗棕色宝石，每锻炼 1 个武器段位则 +1 颗宝石。给予所有紫色盟友 [魔法 + 1] 点护甲值。若敌方有劫数，则消除一位随机敌人所有护甲值。',
    build: skill(
      createGems(BaseColor.Brown, 4, 0, { modifier: { mod: { kind: 'multiplier', a: 1 }, source: { kind: 'tempering' } } }),
      armor('allyAll', 1, 1, { ifCond: { kind: 'targetColor', color: BaseColor.Purple } }),
      reduce('enemyAll', 'armor', 0, 0, { drainAll: true, ifCond: { kind: 'targetHasDoom' } }),
    ),
  },
  {
    id: 8447,
    desc: '创造 4 颗紫色宝石，每锻炼 1 个武器段位则 +1 颗宝石。给予所有棕色盟友 [魔法 + 1] 点护甲值。若敌方有劫数，则消除一位随机敌人所有护甲值。',
    build: skill(
      createGems(BaseColor.Purple, 4, 0, { modifier: { mod: { kind: 'multiplier', a: 1 }, source: { kind: 'tempering' } } }),
      armor('allyAll', 1, 1, { ifCond: { kind: 'targetColor', color: BaseColor.Brown } }),
      reduce('enemyAll', 'armor', 0, 0, { drainAll: true, ifCond: { kind: 'targetHasDoom' } }),
    ),
  },
  {
    id: 8448,
    desc: '爆破 1 行或 1 列。对第一位敌人造成 [魔法 + 4] 点伤害。打乱敌方队伍队形。',
    build: skill(
      oneOf([explodeChosenRow()], [explodeChosenCol()]),
      dmg('enemyFront', 4, 1),
      shuffleTeam('enemy'),
    ),
  },
  {
    id: 8449,
    desc: '爆破 [魔法 + 1] 颗红色宝石。赋予所有纳迦盟友一个随机状态效果。召唤一名纳迦军队。',
    build: skill(
      explodeRandomGems(1, 1, 'color', BaseColor.Red),
      inflictRandom('allyAll', { targetRace: 'Naga', pool: 'positive' }),
      summonRandom(['ScaleGuard', 'PoisonMaster', 'Lamia', 'Marilith', 'NagaQueen', 'BoneNaga', 'Euryali', 'Viper', 'Tai-Pan', 'Fangblade', 'SkulkFang', 'Vassara', 'HornedAsp', 'Setauri', 'ShamanOfSet', 'ChiefDargon', 'Kobra', 'AlgorakTheSlayer', 'Treachery', 'Deminaga', 'Mambasira', 'RoyalAssassin', 'Kobold', 'KoboldKnight', 'KoboldMagi', 'Emperinazara', 'WrathNaga', 'Medusa', 'Stheno', 'KoboldEmissary', 'SetauriGladius', 'SetauriMage', 'Salamandria', 'Takshaka', 'Weresnake', 'Slitherling', 'KoboldThief', 'MelekTauss', 'Cascabel', 'Bothros', 'SetauriSkulk', 'Manasa'], undefined),
    ),
  },
  {
    id: 8450,
    desc: '对一名敌人造成 [魔法 + 4] 点伤害。若敌人攻击力高于自身，则有 20% 的几率杀死对方。',
    build: skill(dmg('enemyChosen', 4, 1), dmg('lastTarget', 0, 0, { execute: true, chance: 0.2, ifCond: { kind: 'targetStatBeatsCaster', stat: 'attack' } })),
  },
  {
    id: 8451,
    desc: '爆破 [魔法 + 1] 颗黄色宝石。赋予所有卜筮之原盟友一个随机状态效果。再召唤一名卜筮之原军队。',
    build: skill(
      explodeRandomGems(1, 1, 'color', BaseColor.Yellow),
      inflictRandom('allyAll', { targetKingdom: '卜筮之原', pool: 'positive' }),
      summonRandom(rawKingdomPool(3028), undefined) /* native SummoningKingdom 3028 (zh '卜筮之原' adds faction troops) */,
    ),
  },
  {
    id: 8452,
    desc: '对一名敌人造成 [魔法 + 7] 点伤害，伤害值因龙爪盟友数而增强。每有一名龙爪盟友则创造 6 颗混合红色和紫色的宝石。 [x6]',
    build: skill(
      dmg('enemyChosen', 7, 1, { modifier: { mod: { kind: 'multiplier', a: 6 }, source: { kind: 'alliesOfKingdom', kingdom: '龙爪' } } }),
      createMix([BaseColor.Red, BaseColor.Purple], 0, 0, { modifier: { mod: { kind: 'multiplier', a: 6 }, source: { kind: 'alliesOfKingdom', kingdom: '龙爪' } } }),
    ),
  },
  {
    id: 8453,
    desc: '对敌人造成[魔法 + 7]点伤害，由风暴峡湾盟友激发。然后给每个风暴峡湾盟友制造6颗混合的蓝色和黄色宝石。 [x6]',
    build: skill(
      dmg('enemyChosen', 7, 1, { modifier: { mod: { kind: 'multiplier', a: 6 }, source: { kind: 'alliesOfKingdom', kingdom: '风暴峡湾' } } }),
      createMix([BaseColor.Blue, BaseColor.Yellow], 0, 0, { modifier: { mod: { kind: 'multiplier', a: 6 }, source: { kind: 'alliesOfKingdom', kingdom: '风暴峡湾' } } }),
    ),
  },
  {
    id: 8454,
    desc: '对最后一个敌人造成 [魔法 + 2] 真实伤害，伤害值因红色和紫色宝石而增强。召唤地狱风暴。 [x2]',
    build: skill(
      trueDmg('enemyLast', 2, 1, { trueDamage: true, modifier: { mod: { kind: 'multiplier', a: 2 }, sources: [{ kind: 'boardGems', color: BaseColor.Red }, { kind: 'boardGems', color: BaseColor.Purple }] } }),
      // native StormRedPurple (Hellstorm): two-colour storm (P-R1-dual-storm)
      createStorm(BaseColor.Red, { color2: BaseColor.Purple }),
    ),
  },
  {
    id: 8455,
    desc: '爆破 [魔法 + 1] 颗棕色宝石。赋予所有厄什卡盟友一个随机正面增益效果。再召唤一名厄什卡军队。',
    build: skill(
      explodeRandomGems(1, 1, 'color', BaseColor.Brown),
      inflictRandom('allyAll', { targetRace: 'Urska', pool: 'positive' }),
      summonRandom(['Barbearius', 'UrskaWanderer', 'Urskatyr', 'CorruptedUrska', 'KingMikhail', 'UrskaSavage', 'Doomclaw', 'XiongMao', 'PandaskaGuard', 'CrimsonArrow', 'UrskaDragoon', 'Urskula', 'UrskaDruid', 'Berengari', 'PossessedUrska', 'BlackBjörn', 'Defiance', 'Lyrasza', 'PandaskaMage', 'PrinceBarislav', 'Ursuvius', 'SpiritOfRage', 'IronVlasta', 'Ursky', 'Pandazerker', 'Theodorevich', 'Pandallista', 'ShejiShi', 'Bearlock', 'Bieska', 'Emberclaw', 'SkeletalUrska', 'IvarLongclaw', 'VelesStormborn', 'PossessedTeddy', 'PoisonedUrsidae', 'RangerEvgeniy'], undefined),
    ),
  },
  {
    id: 8456,
    desc: '爆破 [魔法 + 1] 颗紫色宝石。赋予所有不死族盟友一个随机正面增益效果。再召唤一名不死族军队。',
    build: skill(
      explodeRandomGems(1, 1, 'color', BaseColor.Purple),
      inflictRandom('allyAll', { targetRace: 'Undead', pool: 'positive' }),
      summonRandom(['Skeleton', 'Wight', 'Revenant', 'Zombie', 'Banshee', 'VampireLord', 'FleshGolem', 'Ghoul', 'KeeperOfSouls', 'CrimsonBat', 'LadySapphira', 'Alastair', 'GraveKnight', 'Aziris', 'BoneDragon', 'Sunweaver', 'Skeleros', 'Draakulis', 'TwistedHero', 'Death', 'MorthanisWill', 'Wraith', 'AstralSpirit', 'Remnant', 'MummifiedKing', 'BoneScorpion', 'NightHag', 'Pharos-Ra', 'CaptainSkullbeard', 'BoneNaga', 'BoneDaemon', 'Valraven', 'Xathenos', 'Nosferatu', 'Umberwolf', 'WallOfBones', 'IceWraith', 'Vargouille', 'Carmella', 'DwarvenZombie', 'SlayerGhost', 'KingBloodhammer', 'FallenValdis', 'Xerodar', 'Nightshade', 'SpectralKnight', 'GraveSeer', 'LadyMorana', 'Apophisis', 'Ankhekt', 'Draugr', 'Necrocorn', 'BoneGolem', 'VanyaSoulmourn', 'Sanguinia', 'CorpseMare', 'BaneJaw', 'ShadeOfZorn', 'DrownedSailor', 'VladTheUnsated', 'Dullahan', 'TheGrayKing', 'Tutankhatmun', 'FrostfireWraith', 'ChaosHound', 'Zilopochtli', 'UndeadDrake', 'DreadSteed', 'ShadeOfKurandara', 'BoneboundDredge', 'HauntedGuardian', 'PharaohNefertani', 'TombKnight', 'Metztli', 'CarrionCrow', 'TheGhostQueen', 'Charonas', 'JudgeOfTheDead', 'FrozenShieldbreaker', 'JakalTheGuardian', 'TheFleshHorror', 'Draxxius', 'VaultGuard', 'SpectralColossus', 'FlamingSkeleton', 'Deathclaw', 'AncestorBrodir', 'TheGemini', 'CryptHound', 'StoneZombie', 'DhrakSmith', 'Carmina', 'DeathlockDreilak', 'Rath-Amon', 'BoundMage', 'RelicKnight', 'Negasus', 'DrownedCaptain', 'DeadParrot', 'Deathgaunt', 'AssessorOfMahat', 'FallenSatyr', 'TheGraveGiant', 'DreadCaptainGrim', 'MorthanisDarkness', 'SkellyCat', 'DeathTrapMimic', 'BloodElf', 'BoneCatapult', 'UndeadSentinel', 'UndeadLion', 'AnointedChampion', 'Valhawk', 'LostWarrior', 'PharaohKhafru', 'AldricTheFrostbound', 'Gloomhob', 'Ghulemoth', 'Shadowhisker', 'TheFallenKnight', 'GhostOgre', 'Necroshale', 'CryptWorm', 'WargSpirit', 'DraugrKnight', 'DrownedWanderer', 'BarrowLord', 'GhostKingGrimhorn', 'ImmortalOssifer', 'BlightedHusk', 'TheDecayingQueen', 'WoodRot', 'SkeletalUrska', 'ZombieGoat', 'RottingSerpent', 'ShadowWraith', 'Abraxas', 'ImmortalGemini', 'ToxicHag', 'Helilya', 'DesertOx', 'ForsakenGuardian', 'KhormacTheRestless', 'VigilantShade', 'Bothros', 'QueenWilhelmina', 'Vinepyre', 'CountGobula', 'LordGobthe', 'AqenBloodclaw', 'Sanguinette', 'TheTombkeeper', 'Merneith', 'Cinereous', 'LordHarker', 'GraveWorm', 'CryptboundWight', 'MoonveilWarden', 'CursedSailor', 'DarkSpirit', 'RhonaBittershield', 'TheSoulKnight', 'TheBansheeQueen'], undefined),
    ),
  },
  {
    id: 8461,
    desc: '对最末位的敌人造成 [魔法 + 4] 点伤害。再获得一个额外回合或召唤一名随机科博。',
    build: skill(
      dmg('enemyLast', 4, 1),
      // native SummoningKingdomNoError 3051 = raw KingdomId 3051 (KoboldEmissary is kingdom 3012, not in the pool)
      oneOf([extraTurn()], [summonRandom(['Kobold', 'KoboldKnight', 'KoboldMagi', 'KoboldThief', 'Emperinazara'], undefined)]),
    ),
  },
  {
    id: 8487,
    desc: '对一名敌人造成 [魔法 + 7] 点伤害，伤害值因黑鹰盟友数而增强。每有一位黑鹰盟友则创造 6 颗混合蓝色和红色的宝石。 [x6]',
    build: skill(
      dmg('enemyChosen', 7, 1, { modifier: { mod: { kind: 'multiplier', a: 6 }, source: { kind: 'alliesOfKingdom', kingdom: '黑鹰' } } }),
      createMix([BaseColor.Blue, BaseColor.Red], 0, 0, { modifier: { mod: { kind: 'multiplier', a: 6 }, source: { kind: 'alliesOfKingdom', kingdom: '黑鹰' } } }),
    ),
  },
  {
    id: 8490,
    desc: '爆破 [魔法 + 1] 颗棕色宝石。赋予所有机械盟友一个随机状态效果。再召唤一名机械军队。',
    build: skill(
      explodeRandomGems(1, 1, 'color', BaseColor.Brown),
      inflictRandom('allyAll', { targetRace: 'Mech', pool: 'positive' }),
      summonRandom(['SteamTurret', 'FlameCannon', 'DeepBorer', 'BlastCannon', 'Carnex', 'TANKBOT-2000', 'GoblinRocket', 'Bombot', 'DRACOS-1337', 'ClockworkKnight', 'SentryBot', 'Shocktopus', 'ClockworkSphinx', 'TED-1000', 'TINA-9000', 'ROVER-300', 'MechaGnome', 'P4-NTH4', 'MechaRat', 'Smash-o-bot', 'Detect-o-bot', 'Destruct-o-Bot', 'TinkSteamwhistle', 'S.O.L.A.R', 'NUTCRKR-1225', 'Mechataur', 'Ironhawk', 'TheSparkinator', 'Limpet-bot', 'Mechamare', 'Mechweaver', 'BORK-3000', 'TeslasEngine', 'Amphib-o-Bot', 'FIXIT-5000', 'ImmortalTitanius', 'MokTheCannon-Rider', 'WATTS-1927', 'LOCK-1887', 'RatchetCogbolt', 'WEEZL-300', 'DRIDR-8000', 'NAV-1057'], undefined),
    ),
  },
  {
    id: 8505,
    desc: '爆破 [魔法 + 1] 颗绿色宝石。赋予所有狂野平原盟友一个随机状态效果。再召唤一名狂野平原军队。',
    build: skill(
      explodeRandomGems(1, 1, 'color', BaseColor.Green),
      inflictRandom('allyAll', { targetKingdom: '狂野平原', pool: 'positive' }),
      summonRandom(rawKingdomPool(3027), undefined) /* native SummoningKingdom 3027 (zh '狂野平原' adds faction troops) */,
    ),
  },
  {
    id: 8506,
    desc: '对一名敌人造成 [魔法 + 7] 点伤害，伤害值因破碎尖塔盟友数而增强。每有一位破碎尖塔盟友则创造 6 颗混合红色和棕色的宝石。 [x6]',
    build: skill(
      dmg('enemyChosen', 7, 1, { modifier: { mod: { kind: 'multiplier', a: 6 }, source: { kind: 'alliesOfKingdom', kingdom: '破碎尖塔' } } }),
      createMix([BaseColor.Red, BaseColor.Brown], 0, 0, { modifier: { mod: { kind: 'multiplier', a: 6 }, source: { kind: 'alliesOfKingdom', kingdom: '破碎尖塔' } } }),
    ),
  },
  {
    id: 8507,
    desc: '移除所有紫色宝石。创造等同于被移除的紫色宝石数的黄色宝石。给予一名盟友 [魔法 + 1] 点生命值，数量因板面上现有的黄色宝石数而增强。 [1:1]',
    build: skill(
      destroyColor(BaseColor.Purple),
      createGems(BaseColor.Yellow, 0, 0, { modifier: { mod: { kind: 'ratio', a: 1, b: 1 }, source: { kind: 'destroyedGems', color: BaseColor.Purple } } }),
      heal('allyChosen', 1, 1, { modifier: { mod: { kind: 'ratio', a: 1, b: 1 }, source: { kind: 'boardGems', color: BaseColor.Yellow } } }),
    ),
  },
  {
    id: 8508,
    desc: '对最后一位敌人造成 [魔法 + 3] 点伤害。若对方已陷入中毒状态，则使其陷入叠加 4 倍的出血状态',
    build: skill(
      dmg('enemyLast', 3, 1),
      // native LastEnemy AddForPoison x4: the last enemy itself must be Poisoned, and it gets the Bleed
      inflict('bleed', 'enemyLast', { stacks: 4, ifCond: { kind: 'targetStatus', statusId: 'poison' } }),
    ),
  },
  {
    id: 8509,
    desc: '爆破 [魔法 + 1] 颗紫色宝石。赋予所有秘士盟友一个随机状态效果。再召唤一名秘士军队。',
    build: skill(
      explodeRandomGems(1, 1, 'color', BaseColor.Purple),
      inflictRandom('allyAll', { targetRace: 'Mystic', pool: 'positive' }),
      summonRandom(['Ettin', 'Acolyte', 'Warlock', 'Lamia', 'GoblinShaman', 'IceWitch', 'Aziris', 'Druid', 'Dokkalfar', 'Summoner', 'Soothsayer', 'Hag', 'Faunessa', 'Tassarion', 'Runesmith', 'Famine', 'SacrificialPriest', 'TalRae', 'AnubiteWarrior', 'MadProphet', 'TheDragonSoul', 'LadyAnariel', 'CorruptSorceress', 'Apothecary', 'VoidPortal', 'NightHag', 'DragonianMonk', 'ElvenBard', 'Enchantress', 'Unicorn', 'PrincessElspeth', 'Heronath', 'Owleth', 'Tezca', 'Sekhma', 'DarkPriestess', 'Anthea', 'Wisp', 'BabaYaga', 'Necrezza', 'Nax', 'PrincessFizzbang', 'AncientGolem', 'Asha', 'Azura', 'QueenTitania', 'Xathenos', 'SolZara', 'Spiritmane', 'Morterra', 'Viper', 'Spiritdancer', 'Caprinicus', 'Bonebinder', 'Igneus', 'Medea', 'Urskula', 'Nimue', 'FallenValdis', 'Lust', 'GraveSeer', 'SilentSentinel', 'SeaWitch', 'Tarantella', 'SibylOfLust', 'Earthcaller', 'TianYi', 'Luna', 'Nightwing', 'MoonRabbit', 'FistOfZorn', 'SilverOak', 'LordEhrondil', 'QueenOfSin', 'ShamanOfSet', 'HexRat', 'VanyaSoulmourn', 'Grimcorn', 'Starflower', 'PavosDawnwind', 'HarpyMage', 'QueenXochi', 'Fungomancer', 'Aquaticus', 'CorruptMagus', 'Ahrimas', 'GorThrum', 'Kobra', 'QueenMoonclaw', 'Spell-Paw', 'ShahbanuVespera', 'Malcandessa', 'Lyrasza', 'OgrakShaman', 'WillOfNysha', 'MothMage', 'QueenBeetrix', 'Patience', 'VulpineMage', 'BlindGuardian', 'Sycorax', 'Thaumataur', 'PandaskaMage', 'KeeperOfLore', 'BookOfSecrets', 'GaelSpiritwhisperer', 'IllithianServitor', 'StarryMage', 'Auspecia', 'Orrery', 'DragonianSage', 'DeepMagus', 'SpringEmissary', 'Cyrene', 'Argos', 'Dao', 'DarkDjinnBottle', 'RegentKhalif', 'DragonSpirit', 'Essencia', 'SkyMage', 'Grimmoira', 'Leanansidhe', 'LadyEstelle', 'Kalika', 'MoonPhoenix', 'Leocorn', 'Stormchaser', 'Draxxius', 'IcespireShaman', 'DarkbornWarlock', 'WuHao', 'Ostryx', 'HornedHag', 'Saga', 'TheGemini', 'LapinaHealer', 'FakyrTheWise', 'Carmina', 'DeathlockDreilak', 'Morganite', 'EldritchDisciple', 'SetauriMage', 'Harper', 'FennecMage', 'SableSpiritbane', 'Chiron', 'Spirittooth', 'Tuzi', 'TheSilkenQueen', 'AssessorOfMahat', 'AravatarsTusk', 'SeaHag', 'HauntedDoll', 'DaemonChild', 'Feyr', 'TheMidnightQueen', 'Half-DaemonKnight', 'LadyOfBones', 'TheMydnightKing', 'BoneHound', 'VoidManticore', 'LadyOfRuin', 'Khronos', 'MantisMage', 'DaughterOfTime', 'Ehecatl', 'Caprichor', 'FireJuggler', 'Ringmaster', 'ArcaneSabercat', 'RuneChanter', 'Unagh', 'Amatiel', 'BookOfWitches', 'TheCartographer', 'Bearlock', 'Isban', 'SuccubusQueen', 'LioraMistveil', 'Ignarion', 'GuardianSpirit', 'ArchdruidBlackwood', 'LordDesollatus', 'Al-Mundhir', 'SoulSummoner', 'CrestedAva', 'AlaAl-Din', 'Bahamata', 'CorruptedCrystalem', 'HeldrTheGrave', 'Chargrimax', 'Abraxas', 'Yue-She', 'ScoriaGiant-born', 'ToxicHag', 'Muireann', 'Woodseer', 'LightbornEnchantress', 'Scrollweaver', 'Sarathiel', 'Cosmo', 'TheDarkOracle', 'Mayahuel', 'Astrotaur', 'Eridana', 'Ariosa', 'Amethony', 'MorZarn', 'SpiritcallerLila', 'QueenWilhelmina', 'BloodSpore', 'Merneith', 'Yohaulticetl', 'CromCruach', 'MotherMalice', 'GreenHag', 'TwistedHag', 'DarkWitch', 'TheWebbedPrince', 'DuskWitch', 'Ciaran', 'ErendrielDarkweave', 'FacelessLord', 'Jezebel', 'ImmortalByblios', 'TheWeepingDuchess', 'TheBansheeQueen'], undefined),
    ),
  },
  {
    id: 8510,
    desc: '爆破 [魔法 + 1] 颗蓝色宝石。赋予所有冰峰之巅盟友一个随机状态效果。再召唤一名冰峰之巅军队。',
    build: skill(
      explodeRandomGems(1, 1, 'color', BaseColor.Blue),
      inflictRandom('allyAll', { targetKingdom: '冰峰之巅', pool: 'positive' }),
      summonRandom(rawKingdomPool(3011), undefined) /* native SummoningKingdom 3011 (zh '冰峰之巅' adds faction troops) */,
    ),
  },
  {
    id: 8511,
    desc: '选定一个颜色以移除所有同色宝石。造成 [魔法 + 6] 点散射伤害，伤害值因被移除的宝石数而增强。 [x2]',
    build: skill(
      destroyColor(CHOSEN),
      dmg('enemyAll', 6, 1, { range: 'all', modifier: { mod: { kind: 'multiplier', a: 2 }, source: { kind: 'destroyedGems' } } }),
    ),
  },
  {
    id: 8512,
    desc: '结果 [魔法 + 3] 给予一名敌人重击。摧毁8枚宝石的法力颜色之一。',
    build: skill(
      dmgSplash('enemyChosen', 3, 1, { range: 'splash' }),
      explodeRandomGems(8, 0, 'color', 'LAST_TARGET'),
    ),
  },
  {
    id: 8513,
    desc: '爆破 [魔法 + 1] 颗红色宝石。赋予所有破碎尖塔盟友一个随机正面增益效果。再召唤一名破碎尖塔军队。',
    build: skill(
      explodeRandomGems(1, 1, 'color', BaseColor.Red),
      inflictRandom('allyAll', { targetKingdom: '破碎尖塔', pool: 'positive' }),
      summonRandom(rawKingdomPool(3000), undefined), // native SummoningKingdom 3000 (raw ids; zh name adds faction troops)
    ),
  },
  {
    id: 8514,
    desc: '爆破 [魔法 + 1] 颗红色宝石。赋予所有葛洛什奈克盟友一个随机正面增益效果。再召唤一名葛洛什奈克军队。',
    build: skill(
      explodeRandomGems(1, 1, 'color', BaseColor.Red),
      inflictRandom('allyAll', { targetKingdom: '葛洛什奈克', pool: 'positive' }),
      summonRandom(rawKingdomPool(3018), undefined), // native SummoningKingdomNoError 3018 (raw ids; zh name adds Dripping Caverns 3058 etc.)
    ),
  },
  {
    id: 8515,
    desc: '爆破[魔法 + 1]颗紫色宝石。给予所有卡拉科斯盟友一个随机状态效果。然后召唤一支卡拉科斯部队。',
    build: skill(
      explodeRandomGems(1, 1, 'color', BaseColor.Purple),
      inflictRandom('allyAll', { targetKingdom: '卡拉考斯', pool: 'positive' }),
      summonRandom(rawKingdomPool(3017), undefined), // native SummoningKingdom 3017 (raw ids; zh name adds faction troops)
    ),
  },
  {
    id: 8516,
    desc: '给予一名盟友 [魔法 + 1] 点护甲值和 4 点法力值。',
    build: skill(
      armor('allyChosen', 1, 1),
      mana('allyChosen', 4, 0),
    ),
  },
  {
    id: 8517,
    desc: '获得 [魔法 + 1] 点生命值。再创造 7 颗红色宝石或获得一个额外回合，或爆破一颗随机宝石。',
    build: skill(oneOf([heal('allySelf', 1, 1), createGems(BaseColor.Red, 7, 0)], [heal('allySelf', 1, 1), extraTurn()], [heal('allySelf', 1, 1), explodeRandomGems(1, 0, 'color')])),
  },
  {
    id: 8518,
    desc: '摧毁一行。每摧毁一颗紫色宝石则燃烧一名随机敌人。 [1:1]',
    build: ({"segments":[{"kind":"gem","params":{"op":"clear","mode":"destroy","target":{"kind":"chosenLine","orientation":"row"}}},{"kind":"status","target":"enemyAll","statusId":"burning","turns":3,"magnitude":3,"perDestroyed":{"color":"Purple"}}]} as SkillPrototype),
  },
  {
    id: 8519,
    desc: '对一名敌人造成 [魔法 + 3] 点伤害并将其缠绕。',
    build: skill(
      dmg('enemyChosen', 3, 1),
      inflict('entangle', 'lastTarget'),
    ),
  },
  {
    id: 8520,
    desc: '窃取第一位敌人 [(魔法 / 2) + 2] 点生命值，并创造 7 颗蓝色宝石。',
    build: skill(
      dmg('enemyFront', 2, 0.5, { drain: true }),
      createGems(BaseColor.Blue, 7, 0),
    ),
  },
  {
    id: 8521,
    desc: '结果 [魔法 + 3] 给予一名敌人超级重击。如果敌人被打昏，炸毁四枚宝石。',
    build: ({"segments":[{"kind":"damage","target":"enemyChosen","scaling":{"base":3,"mult":1},"range":"splash","splashRatio":0.75},{"kind":"gem","params":{"op":"clear","mode":"explode","target":{"kind":"randomGems","count":{"base":4,"mult":0},"include":"color"}},"ifCond":{"kind":"anyEnemyStatus","statusId":"stun"}}]} as SkillPrototype),
  },
  {
    id: 8529,
    desc: '摧毁 [魔法 + 1] 颗敌人队伍使用最多的颜色宝石。召唤一名随机滴答洞穴军队。',
    build: skill(
      destroyRandomGems(1, 1, 'color', 'ENEMY_MOST_USED'),
      summonRandom(rawKingdomPool(3058), undefined), // native SummoningKingdom 3058 Dripping Caverns (zh name = parent Grosh-Nak)
    ),
  },
  {
    id: 8554,
    desc: '对一名敌人造成 [魔法 + 4] 点伤害。再将他其中一个法力颜色的 3 颗宝石转换成狼化宝石。',
    build: skill(
      dmg('enemyChosen', 4, 1),
      transformToSpecial('LAST_TARGET', 'lycanthropyGem', { count: 3 }),
    ),
  },
  {
    id: 8576,
    desc: '爆破 [魔法 + 1] 颗绿色宝石。赋予所有野兽盟友一个随机的状态效果。召唤一名野兽军队。',
    build: skill(
      explodeRandomGems(1, 1, 'color', BaseColor.Green),
      inflictRandom('allyAll', { targetRace: 'Beast', pool: 'positive' }),
      summonRandom(['Rhynax', 'Pegasus', 'Owlbear', 'SacredGuardian', 'BoarRider', 'BlackBeast', 'SabertoothLion', 'GriffonKnight', 'Serpent', 'Warhound', 'Hippogryph', 'GiantSpider', 'DireWolf', 'Kerberos', 'SpiderSwarm', 'Roc', 'Fenrir', 'Salamander', 'Hellhound', 'BunniNog', 'Jackelope', 'Yeti', 'WinterWolf', 'SpiritFox', 'Hellcat', 'Moa', 'FireLizard', 'LionPrince', 'SandCobra', 'Dragonmoth', 'WingedBison', 'ArmoredBoar', 'WarGoat', 'Sunsail', 'Warg', 'Frostling', 'BoneScorpion', 'SnowyOwl', 'GiantToad', 'Werewolf', 'ForestGuardian', 'Wulfgarok', 'Minogor', 'Unicorn', 'Penguin', 'Aurai', 'FrostLizard', 'Drake', 'QueenAurora', 'Parrot', 'Cocoon', 'RiftLynx', 'Valraven', 'Falconer', 'Warhawk', 'Sunbird', 'DragonTurtle', 'Spinnerette', 'GiantCrab', 'Hippocampus', 'Merlion', 'Zhenniao', 'CatSith', 'BatSwarm', 'Umberwolf', 'Bulette', 'Hyena', 'Mammoth', 'OwlRider', 'Stone-Shaker', 'PharaohHound', 'TombSpider', 'Willow', 'Gorbil', 'DireBoar', 'CuSith', 'Nightmare', 'MidgeSwarm', 'FestivalCow', 'ArcticFox', 'Barghast', 'GriffStonefeather', 'Rhynaggor', 'TurtleCannon', 'Bunnicorn', 'Nightwing', 'Plainsjumper', 'MoonRabbit', 'Qilin', 'VineMarten', 'WoodRhynax', 'SnowPanther', 'UrskayanBlue', 'HornedAsp', 'Necrocorn', 'Glutmaw', 'CorpseMare', 'ROVER-300', 'Frostfeather', 'Grimcorn', 'HarpyEagle', 'Droggo', 'Kryshound', 'WarWolf', 'GuardianOfTheFields', 'Amaru', 'DireCub', 'Tutankhatmun', 'DandyLion', 'Crysturtle', 'Werebird', 'Werebear', 'Werecat', 'BeastmasterTorbern', 'SirQuentinHadley', 'ChaosHound', 'P4-NTH4', 'MechaRat', 'Blightwing', 'DynamiteGoat', 'Netherhound', 'SwampRat', 'Basilisk', 'WarElephant', 'Axolotl', 'Doombat', 'DreadSteed', 'LordBelanor', 'Amarok', 'ArmoredBoarlet', 'DeepHuntsman', 'FlameOfAnu', 'NightSpider', 'Kharybdis', 'Pan', 'CarrionCrow', 'SnowyOwlbear', 'Baihu', 'UlfsMascot', 'Hatir&Skroll', 'HatirAscendant', 'SkrollReborn', 'Wereraven', 'Werebat', 'Wereverine', 'TheWerestag', 'Devourer', 'IceOrca', 'Wererat', 'Swanmay', 'Wereshark', 'SkyScorpion', 'AransiTheGuardian', 'NaturebornWolf', 'FirebornEagle', 'WaterbornOwl', 'StonebornLion', 'MoonPhoenix', 'Leocorn', 'Catterfly', 'BrianTheClucky', 'Narwhale', 'SteelCobra', 'SkyGoat', 'Shadowbeast', 'LavaScorpion', 'Kitsune', 'Crystalynx', 'Mechamare', 'LordArchimedus', 'Mechweaver', 'Deathclaw', 'Tauraeus', 'EagleOwl', 'FloraFawn', 'CryptHound', 'FlameRhynax', 'FireBeetle', 'StoneViper', 'Leio', 'Craghound', 'Anglerfin', 'BORK-3000', 'Scoprio', 'HoundOfLiang', 'RedFox', 'Vulperus', 'Inari', 'Zhuque', 'Negasus', 'DeadParrot', 'AxeBeak', 'Deathgaunt', 'FeyHound', 'SandCat', 'CobaltDrake', 'StonePanther', 'MantaRaider', 'SkellyCat', 'Grimfeather', 'Werehound', 'RatSwarm', 'LeapingSpider', 'BoneHound', 'TheBestialFey', 'Egris', 'Caribou', 'ArcaneSabercat', 'DeephornBeetle', 'Bloodfang', 'GiantBadger', 'Adelwing', 'BrassDrake', 'UndeadLion', 'Valhawk', 'ManeCourser', 'Weresnake', 'FirebornLynx', 'Amphib-o-Bot', 'MidwinterLycan', 'Mistlark', 'WargSpirit', 'Moonfeather', 'YetiCub', 'DeepSpider', 'BlightHound', 'ShadowBeetle', 'DuskOwlbear', 'WingedDonkey', 'Foxglove', 'Peregrine', 'LionOfYaoGuai', 'ImmortalScoprio', 'ZombieGoat', 'RottingSerpent', 'Treviamus', 'Reavnarokkr', 'Yue-She', 'BloomManatee', 'FelineOfEnvy', 'Azaleus', 'Xuanwu', 'Scrollweaver', 'ImmortalLeio', 'Cosmo', 'Dragonhawk', 'WEEZL-300', 'Rockraptor', 'CaravanCamel', 'Gindibu', 'Yohaulticetl', 'Warmadillo', 'ToxicPuffer', 'Warfang', 'GriffonCaptain', 'PoisonedUrsidae', 'CaveMole', 'ManedWolf', 'FrostSpider', 'CaveCrawler', 'RagingBull', 'Tetramorph'], undefined),
    ),
  },
  {
    id: 8577,
    desc: '创建 3-8 颗拥有各种翻倍量的通配宝石。',
    build: skill(
      // Native 8577: 3 x2 ; x3 50% ; x4 50% ; x2 25% ; x3 25% ; x4 25%  -> 3-8 Wildcards.
      createSpecialGems({ kind: 'wildcard', tier: 2 }, 3, 0),
      createSpecialGems({ kind: 'wildcard', tier: 3 }, 1, 0, { chance: 0.5 }),
      createSpecialGems({ kind: 'wildcard', tier: 4 }, 1, 0, { chance: 0.5 }),
      createSpecialGems({ kind: 'wildcard', tier: 2 }, 1, 0, { chance: 0.25 }),
      createSpecialGems({ kind: 'wildcard', tier: 3 }, 1, 0, { chance: 0.25 }),
      createSpecialGems({ kind: 'wildcard', tier: 4 }, 1, 0, { chance: 0.25 }),
    ),
  },
  {
    id: 8578,
    desc: '制造 3 种药水，蓝色、绿色、红色、黄色或紫色。可获得额外的回合。',
    build: skill(
      createGemsMixAny([{ kind: 'manaPotionGem', color: BaseColor.Blue }, { kind: 'manaPotionGem', color: BaseColor.Green }, { kind: 'manaPotionGem', color: BaseColor.Red }, { kind: 'manaPotionGem', color: BaseColor.Yellow }, { kind: 'manaPotionGem', color: BaseColor.Purple }], 3, 0),
      extraTurn(),
    ),
  },
  {
    id: 8616,
    desc: '对首 2 位敌人造成 [魔法 + 3] 点伤害，伤害值因骷髅头数而增强。 [2:1]',
    build: skill(
      dmg('enemyFirstN', 3, 1, { n: 2, modifier: { mod: { kind: 'ratio', a: 2, b: 1 }, source: { kind: 'boardSkulls' } } }),
    ),
  },
  {
    id: 8617,
    desc: '获得 [魔法 + 1] 点生命值，并赋予一名选定盟友 2 点魔力值。',
    build: ({"segments":[{"kind":"buff","target":"allySelf","stat":"hp","scaling":{"base":1,"mult":1},"lifeMode":"gain"},{"kind":"buff","target":"allyChosen","stat":"magic","scaling":{"base":2,"mult":0}}]} as SkillPrototype),
  },
  {
    id: 8618,
    desc: '对一名敌人造成 [魔法 + 1] 点伤害。再使其陷入中毒或死亡标记状态。',
    build: skill(
      // sa-R6 L2-1420-branches：原生 AB-CD = 伤害 + 中毒 或 伤害 + 死亡标记，各 1/2（原为只有死亡标记）
      dmg('enemyChosen', 1, 1),
      oneOf([inflict('poison', 'lastTarget')], [inflict('death-mark', 'lastTarget')]),
    ),
  },
  {
    id: 8619,
    desc: '对一名随机敌人造成 [魔法 + 1] 点真实伤害，并随机摧毁一列。',
    build: skill(
      trueDmg('enemyRandom', 1, 1, { trueDamage: true }),
      destroyRandomCols(1, 0),
    ),
  },
  {
    id: 8620,
    desc: '对敌人造成 [魔法 + 7] 点伤害，由古尔瓦尼亚盟友增强。然后为每位古尔瓦尼亚盟友创造 6 颗混合红色和紫色宝石。 [x6]',
    build: skill(
      dmg('enemyChosen', 7, 1, { modifier: { mod: { kind: 'multiplier', a: 6 }, source: { kind: 'alliesOfKingdom', kingdom: '加尔凡尼亚' } } }),
      createMix([BaseColor.Red, BaseColor.Purple], 0, 0, { modifier: { mod: { kind: 'multiplier', a: 6 }, source: { kind: 'alliesOfKingdom', kingdom: '加尔凡尼亚' } } }),
    ),
  },
  {
    id: 8621,
    desc: '爆炸[魔法 + 1]枚棕色宝石。赋予所有怪物盟友一个随机状态效果。然后召唤一支怪物军团。',
    build: skill(
      explodeRandomGems(1, 1, 'color', BaseColor.Brown),
      inflictRandom('allyAll', { targetRace: 'Monster', pool: 'positive' }),
      summonRandom(['Golem', 'NightTerror', 'MistStalker', 'Owlbear', 'WarSphinx', 'Chimera', 'Behemoth', 'CrimsonBat', 'RockWorm', 'Cockatrice', 'Gorgon', 'Hydra', 'Swamplash', 'Watcher', 'TheGreatMaw', 'SandShark', 'GreenSlime', 'MarshRaptor', 'AnubiteWarrior', 'SettiteWarrior', 'Creeper', 'Manticore', 'EmperorKhorvash', 'KruargTheDread', 'Kraken', 'Mimic', 'GiantToadstool', 'Werewolf', 'Villager', 'BastitePriestess', 'DesertMantis', 'Bogstrider', 'Chupacabra', 'Peryton', 'Myzmer', 'Troglodyte', 'Scavenger', 'Lamprey', 'Mosasaurus', 'Scylla', 'Bulette', 'Scorpius', 'SandScuttler', 'ArachnaeanWeaver', 'IceWorm', 'Glaycion', 'Megavore', 'Pyggra', 'GelatinousCube', 'WatchMother', 'OcularenLeech', 'Ocularen', 'Xerodar', 'Hammerclaw', 'Sandrunner', 'Sharptooth', 'Apophisis', 'Mervorax', 'ChiefDargon', 'Arachnataur', 'Ridgeback', 'Scarabi', 'CrabMan', 'TheWendigo', 'Krampus', 'Dementicore', 'Trihorn', 'TyranAndRex', 'Lasher', 'BlindGuardian', 'Basilisk', 'ManticoreCub', 'ManticoreProtector', 'Doombat', 'MindEater', 'IllithianColossus', 'IllithianServitor', 'HiveMind', 'DesertWorm', 'Ankhnum', 'SnowyOwlbear', 'Pyrohydra', 'Bahir', 'RockSquid', 'Cloakmantle', 'OchreJelly', 'Shoggorath', 'Wereraven', 'Werebat', 'Wereverine', 'TheWerestag', 'Nagatrap', 'Wererat', 'Wereshark', 'Kelpie', 'Sluagh', 'TheFleshHorror', 'VoidWisp', 'Centuragon', 'SulfurSlime', 'HoardMimic', 'LordArchimedus', 'BurningOcularen', 'Medusa', 'ChromiteSphinx', 'ClamLasher', 'LavaWorm', 'Stoneshell', 'SeaScavenger', 'Vulperus', 'Cantur', 'Geryon', 'Grimfeather', 'DeathTrapMimic', 'VoidManticore', 'Eyestalker', 'Hornwing', 'MonstrousSentinel', 'Bloodfang', 'Gynosphinx', 'TawaritePriestess', 'FellHydra', 'CrystalIntellect', 'Ghulemoth', 'Necroshale', 'CryptWorm', 'ShadowBeetle', 'DuskOwlbear', 'BlackOoze', 'OcularenEgg', 'TheCragMaw', 'TheSlimeDragon', 'Mantichoras', 'Gormungandr', 'HorusiteChampion', 'SekhitePriestess', 'DesertOx', 'ForsakenGuardian', 'Voidjaw', 'GloomOcularen', 'GraveWorm', 'ImmortalMaratus', 'TwistedHag', 'SirGeoffreyTheFallen', 'CorruptedCycad', 'CaveMole', 'CannonMimic', 'CaveCrawler'], undefined),
    ),
  },
  {
    id: 8622,
    desc: '爆破 [魔法 + 1] 颗黄色宝石。赋予所有鸟族盟友一个随机正面增益效果。再召唤一名鸟族军队。',
    build: skill(
      explodeRandomGems(1, 1, 'color', BaseColor.Yellow),
      inflictRandom('allyAll', { targetRace: 'Stryx', pool: 'positive' }),
      summonRandom(['Heronath', 'Owleth', 'Sylph', 'Garuda', 'PrinceAzquila', 'Strygik', 'Stormsinger', 'Taloca', 'WindArcher', 'Ixchel', 'Phoenicia', 'PavosDawnwind', 'Harpy', 'Bladewing', 'HarpyMage', 'QueenXochi', 'CaptainMacaw', 'Finesse', 'Lyriath', 'Zilopochtli', 'Quetzalma', 'HighPriestessChazka', 'Metztli', 'Ostryx', 'Totec', 'KingOfRavens', 'Stormcrow', 'HarpyNightsong', 'Ehecatl', 'Egris', 'SparrowKnight', 'Kukulkan', 'FisherKing', 'CrestedAva', 'Mayahuel', 'Cinereous', 'Cassoryx'], undefined),
    ),
  },
  {
    id: 8623,
    desc: '选择一项：创造 6 颗元素之星，祝福所有盟友；或创造 7 颗暗影之星，诅咒所有敌人。',
    build: skill(chooseSkill(["创造6颗元素之星，祝福所有盟友","创造7颗幽影之星，诅咒所有敌人"], [createSpecialGems({ kind: 'elementalStar' }, 6, 0), inflict('blessed', 'allyAll')], [createSpecialGems({ kind: 'umbralStar' }, 7, 0), inflict('curse', 'enemyAll')])),
  },
  {
    id: 8640,
    desc: '对一名敌人造成 [魔法 + 3] 点伤害，敌人每陷入以下一个状态效果则再造成 12 点伤害：缠绕、燃烧、冻结、击晕。 [x12]',
    build: skill(
      // native 4 x CountSpecificStatusEffect@FromTarget 1200: +12 per listed status on the target (P-R3-target-status-count)
      dmg('enemyChosen', 3, 1, { modifier: { mod: { kind: 'multiplier', a: 12 }, source: { kind: 'targetStatusCount', statusIds: ['entangle', 'burning', 'frozen', 'stun'] } } }),
    ),
  },
  {
    id: 8641,
    desc: '创建 8 颗绿色宝石，再创建 8 颗红色宝石，再创建 8 颗蓝色宝石，再创建 8 颗棕色宝石。',
    build: skill(
      // Native 8641: CreateGems 8 Green ; 8 Red ; 8 Blue ; 8 Brown (was Red only).
      createGems(BaseColor.Green, 8, 0),
      createGems(BaseColor.Red, 8, 0),
      createGems(BaseColor.Blue, 8, 0),
      createGems(BaseColor.Brown, 8, 0),
    ),
  },
  {
    id: 8642,
    desc: '移除所有棕色宝石。对一名敌人造成 [魔法 + 5] 点伤害，伤害值因被移除的宝石数而增强。若敌人来自诺斯，或战斗发生在诺斯，则造成双倍伤害。 [3:1]',
    build: skill(
      destroyColor(BaseColor.Brown),
      dmg('enemyChosen', 5, 1, { modifier: { mod: { kind: 'ratio', a: 3, b: 1 }, source: { kind: 'destroyedGems' } }, condMult: { times: 2, cond: { kind: 'anyOf', of: [{ kind: 'targetKingdom', kingdom: '诺斯' }, { kind: 'kingdomPresent', kingdom: '诺斯' }] } } }),
    ),
  },
  {
    id: 8643,
    desc: '造成 [(魔法 x 2) + 6] 点真实散射伤害，再将末位敌人拉到前方。',
    build: skill(
      dmg('enemyAll', 6, 2, { range: 'all', trueDamage: true }),
      reposition('enemyLast', 'front'),
    ),
  },
  {
    id: 8644,
    desc: '对一名敌人造成 [魔法 + 4] 点伤害，伤害值因绿色和元素盟友而增强。 [x3]',
    build: skill(
      dmg('enemyChosen', 4, 1, { modifier: { mod: { kind: 'multiplier', a: 3 }, sources: [{ kind: 'alliesOfColor', color: BaseColor.Green }, { kind: 'alliesOfRace', race: 'Elemental' }] } }),
    ),
  },
  {
    id: 8645,
    desc: '对一名敌人造成 [魔法 + 7] 点伤害，伤害值因诺斯盟友数而增强。每有一名诺斯盟友，则创建 6 颗混合红色和棕色的宝石。 [x6]',
    build: skill(
      dmg('enemyChosen', 7, 1, { modifier: { mod: { kind: 'multiplier', a: 6 }, source: { kind: 'alliesOfKingdom', kingdom: '诺斯' } } }),
      createMix([BaseColor.Red, BaseColor.Brown], 0, 0, { modifier: { mod: { kind: 'multiplier', a: 6 }, source: { kind: 'alliesOfKingdom', kingdom: '诺斯' } } }),
    ),
  },
  {
    id: 8646,
    desc: '每有一名蓝色盟友或元素盟友，则爆破 4 颗宝石。 [x4]',
    build: skill(
      // native CountArmyColor@AllAllies 400 + CountArmyType@AllAllies 400 (Elemental) + ExplodeGems: 4 per Blue ally + 4 per Elemental ally, no base
      explodeRandomGems(0, 0, 'all', undefined, { modifier: { mod: { kind: 'multiplier', a: 4 }, sources: [{ kind: 'alliesOfColor', color: BaseColor.Blue }, { kind: 'alliesOfRace', race: 'Elemental' }] } }),
    ),
  },
  {
    id: 8647,
    desc: '击晕所有敌人，再创造 3 颗元素星。',
    build: skill(
      inflict('stun', 'enemyAll'),
      createSpecialGems({ kind: 'elementalStar' }, 3, 0),
    ),
  },
  {
    id: 8664,
    desc: '对末位敌人造成 [魔法 + 3] 点真实伤害，有 6% 的几率将其杀戮。每有一颗末日骷髅头则几率增强 6%。 [x6]',
    build: skill(
      // 原生 CountGems Doomskull → 只计末日骷髅头（sa-D）。原生顺序 LethalDamageConditional@LastEnemy →
      // TrueDamage@LastEnemy（R001）；掷骰失败也记录 lastTarget（P-D-lethal-first-lasttarget），被杀则伤害段无目标
      dmg('enemyLast', 0, 0, { execute: true, chance: 0.06, chanceBoost: { mod: { kind: 'multiplier', a: 6 }, source: { kind: 'boardSpecial', gem: 'doomSkull' } } }),
      trueDmg('lastTarget', 3, 1, { trueDamage: true }),
    ),
  },
  {
    id: 8668,
    desc: '使一名敌人陷入所有负面状态效果，并赋予自身所有正面状态效果。',
    build: ({"segments":[{"kind":"status","target":"enemyChosen","statusId":"curse","turns":3},{"kind":"status","target":"enemyChosen","statusId":"poison","turns":3,"magnitude":3},{"kind":"status","target":"enemyChosen","statusId":"burning","turns":3,"magnitude":3},{"kind":"status","target":"enemyChosen","statusId":"bleed","turns":3,"magnitude":1},{"kind":"status","target":"enemyChosen","statusId":"silence","turns":3},{"kind":"status","target":"enemyChosen","statusId":"frozen","turns":3},{"kind":"status","target":"enemyChosen","statusId":"stun","turns":3},{"kind":"status","target":"enemyChosen","statusId":"entangle","turns":3},{"kind":"status","target":"enemyChosen","statusId":"web","turns":3},{"kind":"status","target":"enemyChosen","statusId":"disease","turns":3},{"kind":"status","target":"enemyChosen","statusId":"death-mark","turns":3},{"kind":"status","target":"enemyChosen","statusId":"faerie-fire","turns":3},{"kind":"status","target":"enemyChosen","statusId":"marked","turns":3},{"kind":"status","target":"enemyChosen","statusId":"terror","turns":3},{"kind":"status","target":"enemyChosen","statusId":"lycanthropy","turns":3},{"kind":"randomStatus","target":"allySelf","allPositive":true}]} as SkillPrototype),
    // L5-007: negative set = official status guide list (Bleed, Burning, Cursed, Death Mark, Disease,
    // Entangle, Faerie Fire, Frozen, Hunter's Mark, Lycanthropy, Poison, Silence, Stun, Terror, Web);
    // Charm is not a GoW status and was dropped.
  },
  {
    id: 8669,
    desc: '对一名敌人造成 [魔法 + 7] 点伤害，伤害值因齐埃金盟友数而增强。每有一名齐埃金盟友则创建 6 颗混合绿色和棕色的宝石。 [x6]',
    build: skill(
      dmg('enemyChosen', 7, 1, { modifier: { mod: { kind: 'multiplier', a: 6 }, source: { kind: 'alliesOfKingdom', kingdom: '齐埃金' } } }),
      createMix([BaseColor.Green, BaseColor.Brown], 0, 0, { modifier: { mod: { kind: 'multiplier', a: 6 }, source: { kind: 'alliesOfKingdom', kingdom: '齐埃金' } } }),
    ),
  },
  {
    id: 8670,
    desc: '爆破 [魔法 + 1] 颗紫色宝石。赋予所有玉银林地盟友一个随机正面增益效果。再召唤一名玉银林地军队。',
    build: ({"segments":[{"kind":"gem","params":{"op":"clear","mode":"explode","target":{"kind":"randomGems","count":{"base":1,"mult":1},"include":"color","color":"Purple"}}},{"kind":"randomStatus","pool":"positive","target":"allyAll","targetKingdom":"玉银林地"},{"kind":"summon","params":{"source":{"randomOf":rawKingdomPool(3009)}}}]} as SkillPrototype),
  },
  {
    id: 8680,
    desc: '对所有敌人造成 [魔法 + 1] 点伤害，伤害值因临界星而增强。 [x4]',
    build: skill(
      dmg('enemyAll', 1, 1, { range: 'all', modifier: { mod: { kind: 'multiplier', a: 4 }, source: { kind: 'boardSpecial', gem: 'umbralStar' } } }),
    ),
  },
  {
    id: 8696,
    desc: '爆破 3 颗宝石，再创造一颗许愿宝石。',
    build: ({"segments":[{"kind":"gem","params":{"op":"clear","mode":"explode","target":{"kind":"randomGems","count":{"base":3,"mult":0},"include":"color"}}},{"kind":"gem","params":{"op":"create","gem":{"kind":"special","spec":{"kind":"wish"}},"count":{"base":1,"mult":0}}}]} as SkillPrototype),
  },
  {
    id: 8697,
    desc: '对一名敌人造成 [魔法 + 6] 点重度溅射伤害，伤害值因诅咒宝石数量而增强。若自身队伍里有暗黑铁匠迪恩扎，则创造 4 颗诅咒宝石。 [x4]',
    build: skill(
      // Native: CreateGems Cursed (4 with Dark Smith Drenza) ; CountGems 400 Cursed (board Cursed Gems x4) ; SplashHeavyDamage.
      createSpecialGems({ kind: 'curseGem' }, 4, 0, { ifCond: { kind: 'troopPresent', side: 'ally', name: '暗黑铁匠迪恩扎' } }),
      dmgSplash('enemyChosen', 6, 1, { range: 'splash', modifier: { mod: { kind: 'multiplier', a: 4 }, source: { kind: 'boardSpecial', gem: 'curseGem' } } }),
    ),
  },
  {
    id: 8698,
    desc: '对首位和末位敌人造成 [魔法 + 8] 点伤害，每锻炼 1 个武器段位则 +4 点伤害值。赐福所有蓝色盟友并诅咒所有蓝色敌人。',
    build: skill(
      // sa-C r3: native Damage@FirstLastEnemies, +4 per Tempering on both hits
      dmg('enemyFront', 8, 1, { modifier: { mod: { kind: 'multiplier', a: 4 }, source: { kind: 'tempering' } } }),
      dmg('enemyLast', 8, 1, { modifier: { mod: { kind: 'multiplier', a: 4 }, source: { kind: 'tempering' } } }),
      inflict('blessed', 'allyAll', { ifCond: { kind: 'targetColor', color: BaseColor.Blue } }),
      inflict('curse', 'enemyAll', { ifCond: { kind: 'targetColor', color: BaseColor.Blue } }),
    ),
  },
  {
    id: 8699,
    desc: '对最后 2 位敌人造成 [魔法 + 8] 点伤害，每锻炼 1 个武器段位则 +4 点伤害值。赐福所有绿色盟友并诅咒所有绿色敌人。',
    build: skill(
      // sa-C r3: native Damage@LastTwoEnemies (was first + last), +4 per Tempering
      dmg('enemyLastN', 8, 1, { n: 2, modifier: { mod: { kind: 'multiplier', a: 4 }, source: { kind: 'tempering' } } }),
      inflict('blessed', 'allyAll', { ifCond: { kind: 'targetColor', color: BaseColor.Green } }),
      inflict('curse', 'enemyAll', { ifCond: { kind: 'targetColor', color: BaseColor.Green } }),
    ),
  },
  {
    id: 8700,
    desc: '对首 2 位敌人造成 [魔法 + 8] 点伤害，每锻炼 1 个武器段位则 +4 点伤害值。赐福所有红色盟友并诅咒所有红色敌人。',
    build: skill(
      // sa-C r3: native Damage@FirstTwoEnemies (was first + last), +4 per Tempering
      dmg('enemyFirstN', 8, 1, { n: 2, modifier: { mod: { kind: 'multiplier', a: 4 }, source: { kind: 'tempering' } } }),
      inflict('blessed', 'allyAll', { ifCond: { kind: 'targetColor', color: BaseColor.Red } }),
      inflict('curse', 'enemyAll', { ifCond: { kind: 'targetColor', color: BaseColor.Red } }),
    ),
  },
  {
    id: 8701,
    desc: '对首位和末位敌人造成 [魔法 + 8] 点伤害，每锻炼 1 个武器段位则 +4 点伤害值。赐福所有黄色盟友并诅咒所有黄色敌人。',
    build: skill(
      dmg('enemyLast', 8, 1),
      dmg('enemyFront', 8, 1, { modifier: { mod: { kind: 'multiplier', a: 4 }, source: { kind: 'tempering' } } }),
      inflict('blessed', 'allyAll', { ifCond: { kind: 'targetColor', color: BaseColor.Yellow } }),
      inflict('curse', 'enemyAll', { ifCond: { kind: 'targetColor', color: BaseColor.Yellow } }),
    ),
  },
  {
    id: 8702,
    desc: '对所有敌人造成 [(魔法 x 2) + 16] 点散射伤害，每锻炼 1 个武器段位则 +4 点伤害值。赐福所有紫色盟友并诅咒所有紫色敌人。',
    build: ({"segments":[{"kind":"damage","target":"enemyAll","scaling":{"base":16,"mult":2},"range":"scatter","modifier":{"mod":{"kind":"multiplier","a":4},"source":{"kind":"tempering"}}},{"kind":"status","target":"allyAll","statusId":"blessed","turns":3,"ifCond":{"kind":"targetColor","color":"Purple"}},{"kind":"status","target":"enemyAll","statusId":"curse","turns":3,"ifCond":{"kind":"targetColor","color":"Purple"}}]} as SkillPrototype),
  },
  {
    id: 8703,
    desc: '对一名敌人造成 [魔法 + 8] 点普通溅射伤害，每锻炼 1 个武器段位则 +4 点伤害值。赐福所有棕色盟友并诅咒所有棕色敌人。',
    build: ({"segments":[{"kind":"damage","target":"enemyChosen","scaling":{"base":8,"mult":1},"range":"splash","splashRatio":0.5,"modifier":{"mod":{"kind":"multiplier","a":4},"source":{"kind":"tempering"}}},{"kind":"status","target":"allyAll","statusId":"blessed","turns":3,"ifCond":{"kind":"targetColor","color":"Brown"}},{"kind":"status","target":"enemyAll","statusId":"curse","turns":3,"ifCond":{"kind":"targetColor","color":"Brown"}}]} as SkillPrototype),
  },
  {
    id: 8706,
    desc: '爆破 [魔法 + 1] 颗绿色宝石。赋予所有哥布林盟友一个随机状态效果。再召唤一名哥布林军队。',
    build: skill(
      explodeRandomGems(1, 1, 'color', BaseColor.Green),
      inflictRandom('allyAll', { targetRace: 'Goblin', pool: 'positive' }),
      summonRandom(['Goblin', 'GoblinShaman', 'BoarRider', 'GoblinKing', 'Hobgoblin', 'GoblinRocket', 'NobendBrothers', 'SirSnothelm', 'Bugbear', 'PrincessFizzbang', 'QueenGrapplepot', 'Hellcackle', 'IceGoblin', 'HighKingIrongut', 'KingGobtruffle', 'Stringfiddler', 'Toadsqueezer', 'Goblette', 'Rogueling', 'Smashedmouth', 'Kobold', 'KoboldKnight', 'KoboldMagi', 'Emperinazara', 'Fundingus', 'WilliTheAnchor', 'FlamingOni', 'FaerieGobmother', 'GoblinBomber', 'KoboldEmissary', 'PriestOfNilbog', 'FrostfireGoblin', 'Slughoarder', 'BombRider', 'CinderhandGoblin', 'Murk,Lurk,AndDurk', 'Gloomhob', 'KoboldThief', 'GoblinPickpocket', 'MokTheCannon-Rider', 'Skulker', 'ZargsBoomPile', 'CountGobula', 'LordGobthe', 'ImmortalTrogolin'], undefined),
    ),
  },
  {
    id: 8707,
    desc: '爆破 [魔法 + 1] 颗紫色宝石。赋予所有盖塔尔盟友一个随机正面增益效果。再召唤一名盖塔尔军队。',
    build: skill(
      explodeRandomGems(1, 1, 'color', BaseColor.Purple),
      inflictRandom('allyAll', { targetKingdom: '盖塔尔', pool: 'positive' }),
      summonRandom(rawKingdomPool(3020), undefined) /* native SummoningKingdom 3020 (zh '盖塔尔' adds faction troops) */,
    ),
  },
  {
    id: 8708,
    desc: '爆破 [魔法 + 1] 颗棕色宝石。赋予所有建造盟友一个随机正面增益效果。再召唤一名建造军队。',
    build: skill(
      explodeRandomGems(1, 1, 'color', BaseColor.Brown),
      inflictRandom('allyAll', { targetRace: 'Construct', pool: 'positive' }),
      summonRandom(['Golem', 'ArchonStatue', 'FleshGolem', 'FortressGate', 'Justice', 'Loyalty', 'Courage', 'Humility', 'Sacrifice', 'Honor', 'ShipCannon', 'Mimic', 'IceGolem', 'VoidPortal', 'DarkMonolith', 'ObsidianTitan', 'SnowGuardian', 'TotemGuardian', 'YagasHut', 'DwarvenGate', 'AncientGolem', 'CoralGolem', 'TomeOfEvil', 'WallOfBones', 'CoinPurse', 'GoldRing', 'PriestsChalice', 'KingsCrown', 'GeniesLamp', 'SacredTreasure', 'EtherealSentry', 'ArcaneGolem', 'Gargoyle', 'SilentSentinel', 'TurtleCannon', 'WallOfTentacles', 'GreenGolem', 'BoneGolem', 'CursedEffigy', 'BlackfireCannon', 'Thunderforge', 'TheMarajiQueen', 'Kryshound', 'GlassGolem', 'Treachery', 'Persistence', 'Ferocity', 'Finesse', 'Cunning', 'Defiance', 'GateOfSouls', 'TheInfernalMachine', 'Ironjaw', 'EldritchGuardian', 'TheLordOfSlaughter', 'BookOfSecrets', 'HeartOfRage', 'Orrery', 'VolcanicGolem', 'HornedGuardian', 'DeepGolem', 'Ironhawk', 'DarkDjinnBottle', 'TheSun', 'TheEmperor', 'Quatramanus', 'TheMoon', 'Mithrilion', 'TheStar', 'FountainOfStars', 'TheDevil', 'NexusPortal', 'TheLovers', 'TheMagician', 'UmbralPortal', 'TheFool', 'SteelCobra', 'Ahries', 'HoardMimic', 'TheChariot', 'WarMachine', 'AceOfWands', 'TheWorld', 'StoneViper', 'GuardianPillar', 'HellstoneGate', 'PetrifiedGolem', 'Czernobog', 'Nabassu', 'EternalSentinel', 'TheTower', 'Xenith', 'Chalcedony', 'Adakite', 'StoneZombie', 'Petrahulk', 'Craghound', 'StoneMefyt', 'DarkGolem', 'OnyxGargoyle', 'ChromiteSphinx', 'Obsidiaxas', 'AceOfRunes', 'Strength', 'AceOfCups', 'TheEmpress', 'VoicelessGolem', 'Morganite', 'DoomedGargoyle', 'TheWheelOfFortune', 'VulpineWatcher', 'TheHighPriestess', 'TheColossus', 'TheSpiderThrone', 'AceOfSwords', 'DeathTarot', 'TheHangedMan', 'JeweledGolem', 'StonePanther', 'InfernalVoyager', 'PetrifiedTreant', 'DragonstoneGuardian', 'TwoOfWands', 'HauntedDoll', 'QueenOfWands', 'TheHermit', 'BoneCatapult', 'SplinteredGolem', 'GiantSentinel', 'ElementalSentinel', 'DaemonicSentinel', 'DraconicSentinel', 'UndeadSentinel', 'MonstrousSentinel', 'Hellborer', 'Theodorevich', 'Judgement', 'Pandallista', 'MazeGuardian', 'Groevanga', 'Temperance', 'BookOfWitches', 'Goethite', 'JusticeTarot', 'TheHierophant', 'TwoOfSwords', 'Gingeraxia', 'ImmortalFurnax', 'TenOfWands', 'TenOfCups', 'TenOfRunes', 'TenOfSwords', 'QueenOfSwords', 'CorruptedCrystalem', 'ClayFiend', 'Mudwalker', 'IcyPortal', 'KingOfCups', 'TempestBallista', 'ParagonStatue', 'AlabasterKnight', 'PossessedTeddy', 'Skarn', 'KingOfRunes', 'MaidenOfPain', 'ZargsBoomPile', 'TheSandstoneSentinel', 'TheDarkOracle', 'KingOfSwords', 'OkraNosTheSleeper', 'Rockraptor', 'SaviorStatue', 'QueenOfCups', 'Sanguinette', 'TheTombkeeper', 'QueenOfRunes', 'FlinthammersTower', 'CannonMimic', 'Seditius', 'KnightOfCups', 'MineCart', 'LavaGates'], undefined),
    ),
  },
  {
    id: 8714,
    desc: '对一名敌人造成 [魔法 + 3] 点伤害，将所有蓝色宝石转换成燃烧宝石。',
    build: skill(
      dmg('enemyChosen', 3, 1),
      transformToSpecial(BaseColor.Blue, 'burningGem'),
    ),
  },
  {
    id: 8721,
    desc: '选择一宝石，摧毁其行和列。再创造 6 颗炸弹宝石，并造成 [魔法 + 6] 点散射伤害。',
    build: ({"segments":[{"kind":"gem","params":{"op":"clear","mode":"destroy","target":{"kind":"chosenCross"}}},{"kind":"gem","params":{"op":"create","gem":{"kind":"special","spec":{"kind":"bomb"}},"count":{"base":6,"mult":0}}},{"kind":"damage","target":"enemyAll","scaling":{"base":6,"mult":1},"range":"scatter"}]} as SkillPrototype),
  },
  {
    id: 8725,
    desc: '爆破 [魔法 + 1] 颗黄色宝石。赋予所有阿达纳盟友一个随机正面增益状态效果。再召唤一名阿达纳军队。',
    build: skill(
      explodeRandomGems(1, 1, 'color', BaseColor.Yellow),
      inflictRandom('allyAll', { targetKingdom: '阿达纳', pool: 'positive' }),
      summonRandom(rawKingdomPool(3001), undefined) /* native SummoningKingdom 3001 (zh '阿达纳' adds faction troops) */,
    ),
  },
  {
    id: 8726,
    desc: '对最后一名敌人造成[魔法 + 4]点伤害，伤害力由蓝色宝石而增强。如果他们有末日，可造成双倍伤害。每个回火等级有3%的几率杀死敌人。 [1:1]',
    build: skill(
      dmg('enemyLast', 4, 1, { modifier: { mod: { kind: 'ratio', a: 1, b: 1 }, source: { kind: 'boardGems', color: BaseColor.Blue } }, condMult: { times: 2, cond: { kind: 'targetHasDoom' } } }),
      dmg('lastTarget', 0, 0, { execute: true, chanceBoost: { mod: { kind: 'multiplier', a: 3 }, source: { kind: 'tempering' } } }),
    ),
  },
  {
    id: 8727,
    desc: '对最后一名敌人造成[魔法 + 4]点伤害值，伤害值由绿色宝石而增强。如果他们有末日，造成双倍伤害。每个回火等级有 3% 的几率杀死敌人。 [1:1]',
    build: skill(
      dmg('enemyLast', 4, 1, { modifier: { mod: { kind: 'ratio', a: 1, b: 1 }, source: { kind: 'boardGems', color: BaseColor.Green } }, condMult: { times: 2, cond: { kind: 'targetHasDoom' } } }),
      dmg('lastTarget', 0, 0, { execute: true, chanceBoost: { mod: { kind: 'multiplier', a: 3 }, source: { kind: 'tempering' } } }),
    ),
  },
  {
    id: 8728,
    desc: '对最后一名敌人造成[魔法 + 4]点伤害值，伤害值由红色宝石而增强。如果他们有末日，造成双倍伤害。每个回火等级有 3% 的几率杀死敌人。 [1:1]',
    build: skill(
      dmg('enemyLast', 4, 1, { modifier: { mod: { kind: 'ratio', a: 1, b: 1 }, source: { kind: 'boardGems', color: BaseColor.Red } }, condMult: { times: 2, cond: { kind: 'targetHasDoom' } } }),
      dmg('lastTarget', 0, 0, { execute: true, chanceBoost: { mod: { kind: 'multiplier', a: 3 }, source: { kind: 'tempering' } } }),
    ),
  },
  {
    id: 8729,
    desc: '对最后一名敌人造成[魔法 + 4]点伤害值，伤害值由黄色宝石而增强。如果他们有末日，造成双倍伤害。每个回火等级有 3% 的几率杀死敌人。 [1:1]',
    build: skill(
      dmg('enemyLast', 4, 1, { modifier: { mod: { kind: 'ratio', a: 1, b: 1 }, source: { kind: 'boardGems', color: BaseColor.Yellow } }, condMult: { times: 2, cond: { kind: 'targetHasDoom' } } }),
      dmg('lastTarget', 0, 0, { execute: true, chanceBoost: { mod: { kind: 'multiplier', a: 3 }, source: { kind: 'tempering' } } }),
    ),
  },
  {
    id: 8730,
    desc: '对最后一名敌人造成[魔法 + 4]点伤害值，伤害值由紫色宝石而增强。如果他们有末日，造成双倍伤害。每个回火等级有 3% 的几率杀死敌人。 [1:1]',
    build: skill(
      dmg('enemyLast', 4, 1, { modifier: { mod: { kind: 'ratio', a: 1, b: 1 }, source: { kind: 'boardGems', color: BaseColor.Purple } }, condMult: { times: 2, cond: { kind: 'targetHasDoom' } } }),
      dmg('lastTarget', 0, 0, { execute: true, chanceBoost: { mod: { kind: 'multiplier', a: 3 }, source: { kind: 'tempering' } } }),
    ),
  },
  {
    id: 8731,
    desc: '对最后一名敌人造成[魔法 + 4]点伤害值，伤害值由棕色宝石而增强。如果他们有末日，造成双倍伤害。每个回火等级有 3% 的几率杀死敌人。 [1:1]',
    build: skill(
      dmg('enemyLast', 4, 1, { modifier: { mod: { kind: 'ratio', a: 1, b: 1 }, source: { kind: 'boardGems', color: BaseColor.Brown } }, condMult: { times: 2, cond: { kind: 'targetHasDoom' } } }),
      dmg('lastTarget', 0, 0, { execute: true, chanceBoost: { mod: { kind: 'multiplier', a: 3 }, source: { kind: 'tempering' } } }),
    ),
  },
  {
    id: 8761,
    desc: '赋予自身屏障效果。再给予所有盟友 [魔法 + 4] 点护甲值，数量因燃烧宝石数而增强。若自身陷入燃烧状态，则获得一个额外回合。 [1:1]',
    build: skill(
      inflict('barrier', 'allySelf'),
      // sa-R7: native CountSpecificStatusEffect burning@Self -> CauseBarrier -> ExtraTurnConditional -> CountSet ->
      // CountGems Burning 100 -> IncreaseArmor: boosted by Burning GEMS on the board (was burning enemies).
      extraTurn({ ifCond: { kind: 'selfStatus', statusId: 'burning' } }),
      armor('allyAll', 4, 1, { modifier: { mod: { kind: 'ratio', a: 1, b: 1 }, source: { kind: 'boardSpecial', gem: 'burningGem' } } }),
    ),
  },
  {
    id: 8762,
    desc: '将所有向上或向下斜方宝石转换成燃烧宝石。造成 [魔法 + 8] 点散射伤害。',
    build: ({"segments":[{"kind":"oneOf","options":[[{"kind":"gem","params":{"op":"transform","from":"ANY","to":"Red","toSpecial":"burningGem","diagonal":"left"}},{"kind":"damage","target":"enemyAll","scaling":{"base":8,"mult":1},"range":"scatter"}],[{"kind":"gem","params":{"op":"transform","from":"ANY","to":"Red","toSpecial":"burningGem","diagonal":"right"}},{"kind":"damage","target":"enemyAll","scaling":{"base":8,"mult":1},"range":"scatter"}]]}]} as SkillPrototype),
  },
  {
    id: 8763,
    desc: '爆破 [魔法 + 1] 颗绿色宝石。赋予所有精灵盟友一个随机正面增益状态效果。再召唤一名精灵军队。',
    build: skill(
      explodeRandomGems(1, 1, 'color', BaseColor.Green),
      inflictRandom('allyAll', { targetRace: 'Elf', pool: 'positive' }),
      summonRandom(['Reaver', 'DarkMaiden', 'SpiderQueen', 'GladeWarden', 'Tyri', 'Dokkalfar', 'Tassarion', 'TalRae', 'SpiderKnight', 'LadyAnariel', 'ThornKnight', 'Shadowblade', 'Archdruid', 'Swordmaster', 'ElvenBard', 'Enchantress', 'PrincessElspeth', 'TheSilvermaiden', 'DarkPriestess', 'Spellblade', 'Spearmaster', 'Diviner', 'YaoGuai', 'PrinceEthoras', 'OwlRider', 'EmperorLiang', 'TheWidowQueen', 'Arcanus', 'KendralaBloodjewel', 'ArachnaeanWeaver', 'SifuYuan', 'Tarantella', 'KingAvelorn', 'LordEhrondil', 'Draugr', 'Arachnataur', 'FrostfireWitch', 'TheFrostfireKing', 'Faemark', 'Tuliao', 'Malcandessa', 'ArachnaeanWatcher', 'SapphireKnight', 'LordBelanor', 'StarryMage', 'DeepElvenRogue', 'DeepHuntsman', 'DeepMagus', 'MatronVelenne', 'Forgemistress', 'SkyMage', 'MoshuTheGuardian', 'ArchproxyYvendra', 'Nightarrow', 'Plaguecrafter', 'Deathblade', 'ThornScout', 'WuHao', 'SwordMaiden', 'MoonMage', 'CorbenHalf-Elf', 'BoundMage', 'SeekraDarkwood', 'SilkenFang', 'TheSpiderThrone', 'TheSilkenQueen', 'DaughterOfYasmine', 'SirAiluin', 'TheTurquoiseEmperor', 'BloodElf', 'DarkAlchemist', 'LioraMistveil', 'TheRedCorsair', 'ImmortalLucifa', 'TheDecayingQueen', 'LadyFlorella', 'HanXin', 'ElvenNoble', 'Siobhan', 'KingElbormor', 'MoonveilWarden', 'DarkWitch', 'TheWebbedPrince', 'ErendrielDarkweave', 'DRIDR-8000'], undefined),
    ),
  },
  {
    id: 8764,
    desc: '爆破 [魔法 + 1] 颗蓝色宝石。给予所有骑士盟友一个随机正面增益效果。再召唤一名骑士盟友。',
    build: skill(
      explodeRandomGems(1, 1, 'color', BaseColor.Blue),
      inflictRandom('allyAll', { targetRace: 'Knight', pool: 'positive' }),
      summonRandom(['Paladin', 'LanceKnight', 'WolfKnight', 'GriffonKnight', 'KnightCoronet', 'Luther', 'Alastair', 'BrianTheLucky', 'Templar', 'GraveKnight', 'Scarlett', 'DarkMaster', 'Valor', 'HeraldOfChaos', 'WinterKnight', 'Rakshanin', 'War', 'SpiderKnight', 'SettiteWarrior', 'LionPrince', 'PrideGuard', 'Visk', 'ThornKnight', 'DragonKnight', 'QueenYsabelle', 'SirSnothelm', 'UrskaWanderer', 'GaardsAvatar', 'LadyIronbeard', 'ClockworkKnight', 'Swordmaster', 'TheSilvermaiden', 'PrinceAzquila', 'SirGwayne', 'HighPaladin', 'Urskatyr', 'KingMikhail', 'SummerKnight', 'PrinceEthoras', 'SerCygnea', 'Strygik', 'ChampionOfAnu', 'Vanguard', 'QueensHerald', 'Arcanus', 'SirWulfric', 'LordEmber', 'Fangblade', 'SirMordayne', 'UrskaDragoon', 'TigrakiWarrior', 'SpectralKnight', 'LadyMorana', 'LadyGarnetia', 'LapinaKnight', 'SirEbonheart', 'Man-at-Arms', 'ChampionOfGaard', 'Lamashtu', 'Dullahan', 'GuardianOfTheFields', 'WildKnight', 'Gravitas', 'Merknight', 'KnightCaptain', 'SirQuentinHadley', 'ScarabKnight', 'ManticoreProtector', 'WarElephant', 'ArachnaeanWatcher', 'SileniGuard', 'SapphireKnight', 'HeraldOfWoe', 'IndolatorOfSloth', 'PrinceBarislav', 'HauntedGuardian', 'SirAlamir', 'TombKnight', 'HeraldOfDamnation', 'StormKnight', 'NUTCRKR-1225', 'UlfsMascot', 'UlfHarrigan', 'SecondClawAnhur', 'CrimsonAgent', 'MeiraDawn', 'DarkKnight', 'JakalTheGuardian', 'HelgorTheGuardian', 'UrielleTheGuardian', 'MoshuTheGuardian', 'RokGarTheGuardian', 'AransiTheGuardian', 'FirebornWarrior', 'LightbornPaladin', 'AnimusOfEnvy', 'VaultGuard', 'BrianTheClucky', 'SpectralColossus', 'Totec', 'HeraldOfBlight', 'HeraldOfTorpor', 'Tourmaline', 'Libara', 'HeraldOfKrystenax', 'RelicKnight', 'FirstClawMaahes', 'SilkenFang', 'KnightErrant', 'Eleanor', 'Militiaman', 'CommanderDawnheart', 'IronVlasta', 'Dominion', 'MirrorKnight', 'GuardianOfLaw', 'TritonGuardMera', 'SirAiluin', 'Half-DaemonKnight', 'DarkHerald', 'DragonCommander', 'LionCommander', 'Belladonnus', 'TheBlessedMaiden', 'DwarvenVanguard', 'AldricTheFrostbound', 'TheFallenKnight', 'FirebornPaladin', 'FeyDragoon', 'DraugrKnight', 'DrownedWanderer', 'SparrowKnight', 'BarrowLord', 'ImmortalEmpyrion', 'ImmortalLibara', 'DoomedGuardian', 'ExiledWargare', 'DragonlordLuther', 'DragonknightAmira', 'SeabornKnight', 'WaterbornTemplar', 'AlabasterKnight', 'SirHector', 'AngelicaTheSeeker', 'PrisonerLuther', 'Raquel', 'HeraldOfWar', 'Siobhan', 'ChampionOfRot', 'CryptboundWight', 'PixieKnight', 'RattigarGladiator', 'SirGeoffreyTheFallen', 'GriffonCaptain', 'Balearic', 'TheSoulKnight'], undefined),
    ),
  },
  {
    id: 8765,
    desc: '爆破 [魔法 + 1] 颗绿色宝石。给予所有潘神之谷盟友一个随机正面增益效果。再召唤一名潘神之谷盟友。',
    build: skill(
      explodeRandomGems(1, 1, 'color', BaseColor.Green),
      inflictRandom('allyAll', { targetKingdom: '潘神之谷', pool: 'positive' }),
      summonRandom(rawKingdomPool(3003), undefined) /* native SummoningKingdom 3003 (zh '潘神之谷' adds faction troops) */,
    ),
  },
  {
    id: 8766,
    desc: '爆破 [魔法 + 1] 颗蓝色宝石。给予所有剑锋崖盟友一个随机正面增益效果。再召唤一名剑锋崖盟友。',
    build: skill(
      explodeRandomGems(1, 1, 'color', BaseColor.Blue),
      inflictRandom('allyAll', { targetKingdom: '剑锋崖', pool: 'positive' }),
      summonRandom(rawKingdomPool(3006), undefined) /* native SummoningKingdom 3006 (zh '剑锋崖' adds faction troops) */,
    ),
  },
  {
    id: 8767,
    desc: '对一名敌人造成 [魔法 + 4] 点伤害，伤害值因紫色和不死族盟友数而增强。 [x3]',
    build: skill(
      dmg('enemyChosen', 4, 1, { modifier: { mod: { kind: 'multiplier', a: 3 }, sources: [{ kind: 'alliesOfColor', color: BaseColor.Purple }, { kind: 'alliesOfRace', race: 'Undead' }] } }),
    ),
  },
  {
    id: 8768,
    desc: '给予所有盟友 [魔法 + 1] 点生命值。再将 3 颗蓝色宝石转换成善石像鬼宝石。获得一个额外的回合。',
    build: skill(
      heal('allyAll', 1, 1),
      transformToSpecial(BaseColor.Blue, 'gargoyleGem', { count: 3 }),
      extraTurn(),
    ),
  },
  {
    id: 8769,
    desc: '对一名敌人造成 [魔法 + 3] 点真实伤害，伤害值因石块数量而增强。再创建 4 颗石块。 [x2]',
    build: skill(
      trueDmg('enemyChosen', 3, 1, { trueDamage: true, modifier: { mod: { kind: 'multiplier', a: 2 }, source: { kind: 'boardSpecial', gem: 'stoneBlock' } } }),
      createSpecialGems({ kind: 'stoneBlock' }, 4, 0),
    ),
  },
  {
    id: 8770,
    desc: '爆破 [魔法 + 1] 颗蓝色宝石。赋予所有巨人盟友一个随机正面增益效果。再召唤一名巨人军队。',
    build: ({"segments":[{"kind":"gem","params":{"op":"clear","mode":"explode","target":{"kind":"randomGems","count":{"base":1,"mult":1},"include":"color","color":"Blue"}}},{"kind":"randomStatus","pool":"positive","target":"allyAll","targetRace":"Giant"},{"kind":"summon","params":{"source":{"randomOf":["Ogre","Ettin","StoneGiant","FrostGiant","Berserker","JarlFiremantle","Elf-Eater","Cyclops","Zephyros","Gob-Chomper","SeaTroll","DragonCruncher","RockTroll","DarkTroll","GogAndGud","JotnarStormshield","Ogryn","DesertTroll","ForestTroll","FireGiant","MonsterMuncher","FlameTroll","SkrymirTheLofty","HyndlaFrostcrown","IceTroll","Igneus","HalfgrimHalf-Giant","Sledgepaw","LavaTroll","Stone-Biter","CorruptTroll","Fomorian","FrostfireTroll","CrazedTroll","OgrakShaman","Bone-Biter","IllithianColossus","Smashedmouth","StormKnight","FlameMaiden","Kharybdis","Ogress","Baldr","VidarrTheVast","IcespireShaman","DarkForestTroll","TheOnyxGiant","TheSapphireGiant","TheEmeraldGiant","TheRubyGiant","TheAmethystGiant","TheTopazGiant","TheUmbralGiant","TheGraveGiant","Ogretaur","GiantSentinel","EarthGiant","Jordrin","Kolfrysti","Jarnvisa","GhostOgre","MazeCyclops","GrimbornBloodeye","HeldrTheGrave","Polymetis","SteamTroll","ScoriaGiant-born","VenomousTroll","LavaEttin","AbominableTroll","StormOracle","ToxAndSion","StormGuard","AsbjornTheMountain","ImmortalGirthrok"]}}}]} as SkillPrototype),
  },
  {
    id: 8771,
    desc: '爆破 [魔法 + 1] 颗蓝色宝石。赋予所有盗贼盟友一个随机正面增益效果。再召唤一名盗贼军队。',
    build: skill(
      explodeRandomGems(1, 1, 'color', BaseColor.Blue),
      inflictRandom('allyAll', { targetRace: 'Rogue', pool: 'positive' }),
      summonRandom(['Satyr', 'Ferit', 'Tyri', 'Atlanta', 'Raven', 'Shadow-Hunter', 'Marid', 'NobendBrothers', 'Amira', 'DragonianRogue', 'Desdaemona', 'DeckHand', 'Pirate', 'Sharkey', 'LilJohnnyBronze', 'BonnieRose', 'Wayfinder', 'Shadowblade', 'CaptainSkullbeard', 'Bandit', 'Snow-Hunter', 'ClawDancer', 'SisterOfShadows', 'ScurvySeadog', 'KendralaBloodjewel', 'CrimsonArrow', 'EggThief', 'SkulkFang', 'Trickster', 'QuickpawJack', 'RedCharlotte', 'Bladewing', 'StreetThief', 'CatBurglar', 'TombRobber', 'KingOfThieves', 'FirstMateAxelubber', 'CaptainMacaw', 'BrokerOfGreed', 'MotherOfDarkness', 'Lucifria', 'Rogueling', 'RoyalAssassin', 'SisterEbony', 'DeepElvenRogue', 'NightSpider', 'WilliTheAnchor', 'Freebooter', 'SisterOfNightmares', 'Nightarrow', 'Plaguecrafter', 'Deathblade', 'BileBlackheart', 'ConsortOfDarkness', 'Shadowbeast', 'CorbenHalf-Elf', 'Sabellius', 'RakshaSwabbie', 'CaptainSaltclaw', 'RattigarCutpurse', 'FennecThief', 'DreadCaptainGrim', 'BoatswainBart', 'OrcRogue', 'TheRedCorsair', 'TheBaneOfValor', 'ImmortalSelene', 'GoblinPickpocket', 'Skulker', 'CommodoreMaryka', 'LapinaCharlatan', 'LapinaPirate', 'SetauriSkulk', 'InfernalTrickster'], undefined),
    ),
  },
  {
    id: 8773,
    desc: '对一名敌人造成 [魔法 + 3] 点伤害。若自身队伍中有阿卡卢斯，则使自身获得法印效果。',
    build: skill(
      dmg('enemyChosen', 3, 1),
      inflict('enchanted', 'allySelf', { ifCond: { kind: 'troopPresent', side: 'ally', name: '阿卡卢斯' } }),
    ),
  },
  {
    id: 8774,
    desc: '造成 [魔法 + 7] 点散射伤害。若自身队伍中有泽菲罗斯，则爆破 5 颗宝石。 [x5]',
    build: ({"segments":[{"kind":"damage","target":"enemyAll","scaling":{"base":7,"mult":1},"range":"scatter","modifier":{"mod":{"kind":"multiplier","a":5}}},{"kind":"gem","params":{"op":"clear","mode":"explode","target":{"kind":"randomGems","count":{"base":5,"mult":0},"include":"color"}},"ifCond":{"kind":"troopPresent","side":"ally","name":"泽菲罗斯"}}]} as SkillPrototype),
  },
  {
    id: 8775,
    desc: '对一名敌人造成 [魔法 + 1] 点真实伤害。若自身队伍中有红玫瑰，则获得 40 黄金。',
    build: skill(
      trueDmg('enemyChosen', 1, 1, { trueDamage: true }),
      gainGold(40, 0, { ifCond: { kind: 'troopPresent', side: 'ally', name: '红玫瑰' } }),
    ),
  },
  {
    id: 8776,
    desc: '对一名敌人造成 [魔法 + 3] 点伤害。若自身队伍中有黛希德莫娜， 则使对方陷入叠加 2 次的出血状态。',
    build: skill(
      dmg('enemyChosen', 3, 1),
      // Native 8776: two conditional Bleed steps = 2 stacks (was 1).
      inflict('bleed', 'lastTarget', { stacks: 2, ifCond: { kind: 'troopPresent', side: 'ally', name: '黛希德莫娜' } }),
    ),
  },
  {
    id: 8777,
    desc: '赋予所有盟友 [魔法 + 1] 点生命值。若自身队伍中有鳞光，则获得一个额外回合。',
    build: skill(
      heal('allyAll', 1, 1),
      extraTurn({ ifCond: { kind: 'troopPresent', side: 'ally', name: '鳞光' } }),
    ),
  },
  {
    id: 8778,
    desc: '对首 2 名敌人造成 [魔法 + 1] 点伤害。若自身队伍中有暗影猎手，则获得 5 点攻击力。',
    build: skill(
      dmg('enemyFirstN', 1, 1, { n: 2 }),
      attack('allySelf', 5, 0, { ifCond: { kind: 'troopPresent', side: 'ally', name: '暗影猎手' } }),
    ),
  },
  {
    id: 8805,
    desc: '爆破一列。所选的列每有一颗红色或棕色宝石，则创造一颗石像鬼宝石。 [1:1]',
    build: skill(explodeChosenCol(), createSpecialGems2([{ kind: 'gargoyleGem', tier: 1 }, { kind: 'gargoyleGem', tier: 2 }], 0, 0, { modifier: { mod: { kind: 'multiplier', a: 1 }, sources: [{ kind: 'chosenColumnAtCastStart', color: BaseColor.Red }, { kind: 'chosenColumnAtCastStart', color: BaseColor.Brown }] } })),
  },
  {
    id: 8806,
    desc: '爆破 1 颗宝石。创造 1 颗石像鬼宝石。每摧毁一颗石像鬼宝石，则再创造一颗 2。 [x2]',
    build: ({"segments":[{"kind":"gem","params":{"op":"clear","mode":"explode","target":{"kind":"cell","cell":"CELL"},"countAdjacentSpecial":"gargoyleGem"}},{"kind":"gem","params":{"op":"create","gem":{"kind":"mixSpecial","specs":[{"kind":"gargoyleGem","tier":1},{"kind":"gargoyleGem","tier":2}]},"count":{"base":1,"mult":0},"modifier":{"mod":{"kind":"multiplier","a":2},"source":{"kind":"countedAdjacentSpecial"}}}}]} as SkillPrototype),
  },
  {
    id: 8807,
    desc: '移除所有棕色宝石。对一名敌人造成 [魔法 + 5] 点伤害，数值因移除的宝石数而增强。若敌人来自地狱悬崖或战斗位于地狱悬崖，则造成双倍伤害。 [3:1]',
    // sa-F2 fix round A (R001): native CountGems 34 Brown ; Damage ; RemoveColor Brown
    build: ({"segments":[{"kind":"damage","target":"enemyChosen","scaling":{"base":5,"mult":1},"modifier":{"mod":{"kind":"ratio","a":3,"b":1},"source":{"kind":"boardGems","color":"Brown"}},"condMult":{"times":2,"cond":{"kind":"anyOf","of":[{"kind":"targetKingdom","kingdom":"地狱悬崖"},{"kind":"kingdomPresent","kingdom":"地狱悬崖"}]}}},{"kind":"gem","params":{"op":"clear","mode":"destroy","target":{"kind":"color","color":"Brown"}}}]} as SkillPrototype),
  },
  {
    id: 8808,
    desc: '创造 4 颗石像鬼宝石，或爆破 [魔法 + 1] 颗宝石。',
    build: skill(oneOf([createSpecialGems2([{ kind: 'gargoyleGem', tier: 1 }, { kind: 'gargoyleGem', tier: 2 }], 4, 0)], [explodeRandomGems(1, 1, 'all')])),
  },
  {
    id: 8809,
    desc: '对一名敌人造成 [魔法 + 7] 点伤害，数值因地域悬崖盟友数而增强。每有一名地狱悬崖盟友，则创造 6 颗混合红色和棕色的宝石。 [x6]',
    build: skill(
      dmg('enemyChosen', 7, 1, { modifier: { mod: { kind: 'multiplier', a: 6 }, source: { kind: 'alliesOfKingdom', kingdom: '地狱悬崖' } } }),
      createMix([BaseColor.Red, BaseColor.Brown], 0, 0, { modifier: { mod: { kind: 'multiplier', a: 6 }, source: { kind: 'alliesOfKingdom', kingdom: '地狱悬崖' } } }),
    ),
  },
  {
    id: 8810,
    desc: '对一名敌人造成 [魔法 + 3] 点真实伤害，数值因石像鬼宝石数而增强。 [x6]',
    build: skill(
      trueDmg('enemyChosen', 3, 1, { trueDamage: true, modifier: { mod: { kind: 'multiplier', a: 6 }, source: { kind: 'boardSpecial', gem: 'gargoyleGem' } } }),
    ),
  },
  {
    id: 8811,
    desc: '对一名敌人造成 [魔法 + 4] 点伤害，伤害值因棕色盟友和建造盟友数二增强。 [x5]',
    build: skill(
      dmg('enemyChosen', 4, 1, { modifier: { mod: { kind: 'multiplier', a: 5 }, sources: [{ kind: 'alliesOfColor', color: BaseColor.Brown }, { kind: 'alliesOfRace', race: 'Construct' }] } }),
    ),
  },
  {
    id: 8816,
    desc: '爆破 [魔法 + 1] 颗宝石。再召唤一名黑曜石深渊军队。',
    build: skill(
      explodeRandomGems(1, 1, 'color'),
      summonRandom(rawKingdomPool(3083), undefined) /* native SummoningKingdom 3083 (zh '地狱悬崖' adds faction troops) */,
    ),
  },
  {
    id: 8829,
    desc: '对一名敌人造成 [魔法 + 4] 点伤害。再将 8 颗黄色宝石转换成极度末日骷髅头。',
    build: skill(
      dmg('enemyChosen', 4, 1),
      transformToSpecial(BaseColor.Yellow, 'uberDoomSkull', { count: 8 }),
    ),
  },
  {
    id: 8842,
    desc: '获得 [魔法 + 1] 点护甲值和反射效果。若自身已有反射效果，则赋予所有盟友反射效果。',
    build: skill(
      // sa-R5 L1-1486 (R001): native CountSpecificStatusEffect mirror@Self -> IncreaseArmor -> Reflect@AllAlliesButNotSelf
      // only if I ALREADY had Reflect -> CauseMirror@Self. Old order gave myself Reflect first, so the condition always held.
      armor('allySelf', 1, 1),
      inflict('reflect', 'allyOthers', { ifCond: { kind: 'selfStatus', statusId: 'reflect' } }),
      inflict('reflect', 'allySelf'),
    ),
  },
  {
    id: 8843,
    desc: '创造 2 颗蓝色、绿色、红色、棕色龙族宝石，并获得一个额外回合。',
    build: skill(createSpecialGems({ kind: 'dragonGem', color: BaseColor.Blue }, 2, 0), createSpecialGems({ kind: 'dragonGem', color: BaseColor.Green }, 2, 0), createSpecialGems({ kind: 'dragonGem', color: BaseColor.Red }, 2, 0), createSpecialGems({ kind: 'dragonGem', color: BaseColor.Brown }, 2, 0), extraTurn()),
  },
  {
    id: 8869,
    desc: '&& 给予所有盟友 [魔法 + 1] 点护甲值 &&给予所有其他盟友屏障效果',
    build: ({"segments":[{"kind":"choose","labels":["全体盟友增加护甲","其他盟友获得屏障"],"options":[[{"kind":"buff","target":"allyAll","stat":"armor","scaling":{"base":1,"mult":1}}],[{"kind":"status","target":"allyOthers","statusId":"barrier","turns":3}]]}]} as SkillPrototype),
  },
  {
    id: 8872,
    desc: '每有一名蓝色敌人则创造 1 颗蓝色巨人宝石。再对所有蓝色敌人造成 [魔法 + 1] 点伤害，并使他们陷入冻结状态。 [1:1]',
    build: skill(
      // Native CreateGems GiantBlue has no base amount: exactly 1 per Blue enemy (sa-R2 L4b-1487-1488-base).
      createSpecialGems({ kind: 'giantGem', color: BaseColor.Blue }, 0, 0, { modifier: { mod: { kind: 'ratio', a: 1, b: 1 }, source: { kind: 'enemiesOfColor', color: BaseColor.Blue } } }),
      dmg('enemyAll', 1, 1, { range: 'all', ifCond: { kind: 'targetColor', color: BaseColor.Blue } }),
      // Native CauseFrozen@EnemyColor: every Blue enemy (lastTarget held only one of them).
      inflict('frozen', 'enemyAll', { ifCond: { kind: 'targetColor', color: BaseColor.Blue } }),
    ),
  },
  {
    id: 8873,
    desc: '每有一名红色敌人则创造 1 颗红色巨人宝石。再对所有红色敌人造成 [魔法 + 1] 点伤害，并使他们陷入燃烧状态。 [1:1]',
    build: skill(
      // Native CreateGems GiantRed has no base amount: exactly 1 per Red enemy (sa-R2 L4b-1487-1488-base).
      createSpecialGems({ kind: 'giantGem', color: BaseColor.Red }, 0, 0, { modifier: { mod: { kind: 'ratio', a: 1, b: 1 }, source: { kind: 'enemiesOfColor', color: BaseColor.Red } } }),
      dmg('enemyAll', 1, 1, { range: 'all', ifCond: { kind: 'targetColor', color: BaseColor.Red } }),
      // Native CauseBurning@EnemyColor: every Red enemy (lastTarget held only one of them).
      inflict('burning', 'enemyAll', { ifCond: { kind: 'targetColor', color: BaseColor.Red } }),
    ),
  },
  {
    id: 8874,
    desc: '对所有敌人造成 [魔法 + 1] 点伤害。对所有敌人造成陷入冻结和燃烧状态。再创造 3 颗蓝色巨人宝石和 3 颗红色巨人宝石。',
    build: skill(
      dmg('enemyAll', 1, 1, { range: 'all' }),
      inflict('frozen', 'enemyAll'),
      inflict('burning', 'enemyAll'),
      createSpecialGems({ kind: 'giantGem', color: BaseColor.Red }, 3, 0),
    ),
  },
  {
    id: 8875,
    desc: '移除所有绿色宝石。对一名敌人造成 [魔法 + 5] 点伤害，伤害值因被移除的宝石数而增强。若敌人来自沃尔帕克，或战斗位于沃尔帕克，则造成双倍伤害。 [3:1]',
    build: skill(
      destroyColor(BaseColor.Green),
      dmg('enemyChosen', 5, 1, { modifier: { mod: { kind: 'ratio', a: 3, b: 1 }, source: { kind: 'destroyedGems' } }, condMult: { times: 2, cond: { kind: 'anyOf', of: [{ kind: 'targetKingdom', kingdom: '沃尔帕克' }, { kind: 'kingdomPresent', kingdom: '沃尔帕克' }] } } }),
    ),
  },
  {
    id: 8876,
    desc: '选择一项：将所有绿色宝石转化为选定颜色；或爆破一颗选定宝石，再创造 10 颗绿色宝石。',
    build: skill(chooseSkill(["将所有绿色宝石转化为所选颜色","爆破所选宝石，创造10颗绿色宝石"], [transform(BaseColor.Green, CHOSEN)], [explodeAt(CELL), createGems(BaseColor.Green, 10, 0)])),
  },
  {
    id: 8877,
    desc: '对一名敌人造成 [魔法 + 7] 点伤害，伤害只因沃尔帕克盟友数而增强。每有一名沃尔帕克盟友，则创造 6 颗混合蓝色和绿色的宝石。 [x6]',
    build: skill(
      dmg('enemyChosen', 7, 1, { modifier: { mod: { kind: 'multiplier', a: 6 }, source: { kind: 'alliesOfKingdom', kingdom: '沃尔帕克' } } }),
      createMix([BaseColor.Blue, BaseColor.Green], 0, 0, { modifier: { mod: { kind: 'multiplier', a: 6 }, source: { kind: 'alliesOfKingdom', kingdom: '沃尔帕克' } } }),
    ),
  },
  {
    id: 8878,
    desc: '对一名敌人造成 [魔法 + 4] 点伤害，伤害值因绿色盟友和狼族盟友数而增强。 [x3]',
    build: skill(
      dmg('enemyChosen', 4, 1, { modifier: { mod: { kind: 'multiplier', a: 3 }, sources: [{ kind: 'alliesOfColor', color: BaseColor.Green }, { kind: 'alliesOfRace', race: 'Wargare' }] } }),
    ),
  },
  {
    id: 8879,
    desc: '&& 对末位敌人造成 [魔法 + 3] 点伤害，并窃取 3 点魔力值 && 对末位敌人造成 [魔法 + 3] 点伤害，并窃取 6 点法力值',
    build: ({"segments":[{"kind":"choose","labels":["窃取末位敌人魔法并造成伤害","窃取末位敌人法力并造成伤害"],"options":[[{"kind":"reduce","target":"enemyLast","stat":"magic","scaling":{"base":3,"mult":0},"gainStat":"magic"},{"kind":"damage","target":"enemyLast","scaling":{"base":3,"mult":1}}],[{"kind":"reduce","target":"enemyLast","stat":"mana","scaling":{"base":6,"mult":0},"gainStat":"mana"},{"kind":"damage","target":"enemyLast","scaling":{"base":3,"mult":1}}]]}]} as SkillPrototype),
  },
  {
    id: 8900,
    desc: '选择一项：将选定敌人一种法力颜色的所有宝石转化为灵魂宝石；或对一名敌人造成 [魔法 + 2] 点伤害，每颗灵魂宝石增加 4 点伤害。',
    build: targetedSkill('enemyChosen', chooseSkill(["将所选敌人一种法力颜色的宝石转化为灵魂宝石","对所选敌人造成［魔法＋2］伤害，每颗灵魂宝石增强4点"], [transformToSpecial('CHOSEN_TARGET', 'spiritGem')], [dmg('enemyChosen', 2, 1, { modifier: { mod: { kind: 'multiplier', a: 4 }, source: { kind: 'boardSpecial', gem: 'spiritGem' } } })])),
  },
  {
    id: 8905,
    desc: '爆破 [魔法 + 1] 颗紫色宝石。赋予所有迈纳杰之罪盟友一个随机正面增益状态效果。再召唤一名迈纳杰之罪军队。',
    build: skill(
      explodeRandomGems(1, 1, 'color', BaseColor.Purple),
      inflictRandom('allyAll', { targetKingdom: '迈纳杰之罪', pool: 'positive' }),
      summonRandom(rawKingdomPool(3037), undefined) /* native SummoningKingdom 3037 (zh '迈纳杰之罪' adds faction troops) */,
    ),
  },
  {
    id: 8906,
    desc: '爆破 [魔法 + 1] 颗蓝色宝石。赋予所有人类盟友一个随机正面增益状态效果。再召唤一名人类军队。',
    build: skill(
      explodeRandomGems(1, 1, 'color', BaseColor.Blue),
      inflictRandom('allyAll', { targetRace: 'Human', pool: 'positive' }),
      summonRandom(['Musketeer', 'Alchemist', 'Acolyte', 'Warlock', 'Priestess', 'LanceKnight', 'KnightCoronet', 'Luther', 'Ferit', 'Atlanta', 'Raven', 'Elwyn', 'BrianTheLucky', 'Finley', 'Avina', 'Peasant', 'Templar', 'Scarlett', 'Thrall', 'Hag', 'DarkMaster', 'AnointedOne', 'Marid', 'Ghiralee', 'SacrificialPriest', 'MadProphet', 'Northrender', 'Khopeshi', 'TheDevoted', 'EmperorKhorvash', 'CorruptSorceress', 'GrandInquisitor', 'Penitent', 'RoyalEngineer', 'DragonKnight', 'Innkeeper', 'QueenYsabelle', 'DeckHand', 'Pirate', 'LilJohnnyBronze', 'BonnieRose', 'Villager', 'WanderingMonk', 'Tesla', 'SirGwayne', 'Bishop', 'Bandit', 'MerchantPrince', 'Necrezza', 'SnakeCharmer', 'Falconer', 'SerCygnea', 'VoiceOfOrpheus', 'SisterOfShadows', 'Magnus', 'DivineIshbaala', 'Moneylender', 'ChampionOfAnu', 'Wazir', 'Morterra', 'QueensHerald', 'WarCleric', 'SisterSuperior', 'Medea', 'HalfgrimHalf-Giant', 'Executioner', 'ThePossessedKing', 'EggThief', 'AngryMob', 'HolySt.Astra', 'CourtJester', 'Man-at-Arms', 'CarlsonMarshall', 'KhatibTahir', 'GeneralSuladin', 'GruzTheUndefeated', 'ChampionOfGaard', 'StreetThief', 'TombRobber', 'KingOfThieves', 'CorruptMagus', 'BeastmasterTorbern', 'KnightCaptain', 'TyranAndRex', 'VanKane', 'KeeperOfLore', 'GaelSpiritwhisperer', 'SisterEbony', 'SirAlamir', 'TheArchdeva', 'UlfHarrigan', 'RegentKhalif', 'Freebooter', 'Researcher', 'SisterOfNightmares', 'Swanmay', 'Yarrow', 'CrimsonAgent', 'MeiraDawn', 'Southrender', 'GameWarden', 'GeneralEdison', 'FakyrTheWise', 'PriestessOfLight', 'OrpheusPriestess', 'Fence', 'KnightErrant', 'Eleanor', 'MysteriousHero', 'Militiaman', 'Witchfinder', 'HighCleric', 'BoatswainBart', 'DragonCommander', 'TheCartographer', 'LordDesollatus', 'ImmortalRaqiyah', 'DragonlordLuther', 'SeabornKnight', 'SirHector', 'AngelicaTheSeeker', 'PrisonerLuther', 'CommodoreMaryka', 'SaviorStatue', 'Gindibu'], undefined),
    ),
  },
  {
    id: 8907,
    desc: '爆破 [魔法 + 1] 颗绿色宝石。赋予所有蛮族盟友一个随机正面增益状态效果。再召唤一名蛮族军队。',
    build: skill(
      explodeRandomGems(1, 1, 'color', BaseColor.Green),
      inflictRandom('allyAll', { targetRace: 'Wildfolk', pool: 'positive' }),
      summonRandom(['Satyr', 'BladeDancer', 'Sylvasi', 'Ragnagord', 'Faunessa', 'BunniNog', 'SatyrMusician', 'Tuskar', 'DesertMantis', 'Tezca', 'Nax', 'KingSilenus', 'MonkeyDisciple', 'TheWildQueen', 'Senita', 'Saguaro', 'Agave', 'Piper', 'Caprinicus', 'TianYi', 'Trickster', 'Bunnicorn', 'LapinaKnight', 'Luna', 'Rattigar', 'PlagueRat', 'HexRat', 'Sledgepaw', 'QuickpawJack', 'LapinaExplorer', 'Starflower', 'SatyrHunter', 'Rubitressa', 'BeetleBlade', 'MothMage', 'ScarabKnight', 'QueenBeetrix', 'Tuskor', 'SileniGuard', 'Argos', 'Pan', 'Rhinotaur', 'TheScourgeOfHonor', 'PoxHare', 'TheBurrowWarden', 'TheWildKing', 'LapinaHealer', 'VoicelessGolem', 'RattigarCutpurse', 'Mumakus', 'Tuzi', 'Beltane', 'Aravatar', 'FallenSatyr', 'AravatarsTusk', 'MantisMage', 'SatyrTrickster', 'Caprichor', 'DeephornBeetle', 'Badgerkin', 'DoeStoneshatter', 'ImmortalTerra', 'ImmortalCaprichor', 'LapinaLancer', 'Sonata', 'LapinaCharlatan', 'Ariosa', 'LapinaPirate', 'Lapitaur', 'RattigarGladiator'], undefined),
    ),
  },
  {
    id: 8908,
    desc: '对一名敌人造成 [魔法 + 4] 点伤害，伤害值因紫色盟友数和精灵盟友数而增强。 [x3]',
    build: skill(
      dmg('enemyChosen', 4, 1, { modifier: { mod: { kind: 'multiplier', a: 3 }, sources: [{ kind: 'alliesOfColor', color: BaseColor.Purple }, { kind: 'alliesOfRace', race: 'Elf' }] } }),
    ),
  },
  {
    id: 8909,
    desc: '爆破 [魔法 + 1] 颗红色宝石。赋予所有兽人盟友一个随机正面增益效果。再召唤一名兽人军队。',
    build: skill(
      explodeRandomGems(1, 1, 'color', BaseColor.Red),
      inflictRandom('allyAll', { targetRace: 'Orc', pool: 'positive' }),
      summonRandom(['Orc', 'Summoner', 'Cyclops', 'DrakeRider', 'DarkSong', 'GarNok', 'FelDras', 'Bugbear', 'Ogryn', 'OrcVeteran', 'Gargantaur', 'SolZara', 'VorKarn', 'FistOfZorn', 'BorGakk', 'ShadeOfZorn', 'GorThrum', 'FirstMateAxelubber', 'BrawlmasterBurNakh', 'WarDrok', 'TuskRaider', 'RokGarTheGuardian', 'Pyrophemus', 'TrkNala', 'EyeOfArges', 'MouthOfZorn', 'OrcRogue', 'MazeCyclops', 'DaeDrak', 'ImmortalAngRak', 'KragRaxBloodskull', 'MorZarn', 'Warfang', 'Shargral'], undefined),
    ),
  },
  {
    id: 8910,
    desc: '爆破 [魔法 + 1] 颗棕色宝石。赋予所有矮人盟友一个随机正面增益效果。再召唤一名矮人军队。',
    build: skill(
      explodeRandomGems(1, 1, 'color', BaseColor.Brown),
      inflictRandom('allyAll', { targetRace: 'Dwarf', pool: 'positive' }),
      summonRandom(['DwarvenMiner', 'Bombardier', 'DeepBorer', 'Sparkgrinder', 'Keghammer', 'DwarfLord', 'Runesmith', 'DwarvenSlayer', 'LordIronbeard', 'Apothecary', 'LadyIronbeard', 'Stonehammer', 'DwarvenGate', 'KingHighforge', 'DwarvenHunter', 'DwarvenZombie', 'SlayerGhost', 'Bonebinder', 'Gemhammer', 'KingBloodhammer', 'GimletStormbrew', 'ZhakBoomgrizzle', 'GriffStonefeather', 'Thunderforge', 'Excavator', 'MortlachStoutbeard', 'MoiraCragheart', 'Destruct-o-Bot', 'TinkSteamwhistle', 'BoneboundDredge', 'DurganIronfall', 'DeepDwarf', 'DarkSmith', 'FrozenShieldbreaker', 'DarkSmithDrenza', 'TinkerDwarf', 'DhrakSmith', 'KrisKrinkle', 'RuneChanter', 'LostWarrior', 'DwarvenVanguard', 'GhostKingGrimhorn', 'DarkMason', 'DwarvenMerchant', 'DwarvenOverseer', 'DugallRamhorn', 'ParagonStatue', 'MydnightInnovator', 'KhormacTheRestless', 'RatchetCogbolt', 'Mrs.Krinkle', 'FlinthammersTower', 'MineCart', 'RhonaBittershield'], undefined),
    ),
  },
  {
    id: 8911,
    desc: '爆破 [魔法 + 1] 颗绿色宝石。赋予所有荆棘森林盟友一个随机正面增益效果。再召唤一名荆棘森林军队。',
    build: skill(
      explodeRandomGems(1, 1, 'color', BaseColor.Green),
      inflictRandom('allyAll', { targetKingdom: '荆棘森林', pool: 'positive' }),
      summonRandom(rawKingdomPool(3015), undefined) /* native SummoningKingdom 3015 (zh '荆棘森林' adds faction troops) */,
    ),
  },
  {
    id: 8946,
    desc: '对一名敌人造成 [魔法 + 4] 点伤害，伤害值因陷入织网和中毒状态的敌人数而增强。再使他们陷入织网和中毒状态。 [x3]',
    build: skill(
      // Native 8946: two CountSpecificStatusEffect@AllEnemies (Webbed, Poisoned) x3 each (Webbed was missing).
      dmg('enemyChosen', 4, 1, { modifier: { mod: { kind: 'multiplier', a: 3 }, sources: [{ kind: 'enemyStatusCount', statusId: 'web' }, { kind: 'enemyStatusCount', statusId: 'poison' }] } }),
      inflict('web', 'lastTarget'),
      inflict('poison', 'lastTarget'),
    ),
  },
  {
    id: 8947,
    desc: '创建 6 颗织网宝石，并获得一个额外回合。',
    build: skill(createSpecialGems({ kind: 'web' }, 6, 0), extraTurn()),
  },
  {
    id: 8948,
    desc: '创造 6 颗红色宝石。再将所有红色宝石转换成灵力宝石。',
    build: skill(
      createGems(BaseColor.Red, 6, 0),
      transformToSpecial(BaseColor.Red, 'spiritGem'),
    ),
  },
  {
    id: 8951,
    desc: '选择一项：创造 8 颗灵魂宝石并获得一个额外回合；或对一名随机敌人造成 [魔法 × 2 + 3] 点真实伤害。',
    build: skill(chooseSkill(["创造8颗灵魂宝石并获得额外回合","对一名随机敌人造成［魔法×2＋3］真实伤害"], [createSpecialGems({ kind: 'spiritGem', color: BaseColor.Purple }, 8, 0), extraTurn()], [trueDmg('enemyRandom', 3, 2, { trueDamage: true })])),
  },
  {
    id: 8952,
    desc: '对一名敌人造成 [魔法 + 2] 点伤害。若对方陷入猎人标记状态，则窃取其 6 点生命值。',
    build: skill(
      dmg('enemyChosen', 2, 1),
      // 原生 StealLife@FromTarget [AddForHuntersMark 6]：看该目标本身是否被猎人标记（不是任一敌人；sa-D）
      dmg('lastTarget', 6, 0, { drain: true, ifCond: { kind: 'targetStatus', statusId: 'marked' } }),
    ),
  },
  {
    id: 8954,
    desc: '爆破 [魔法 + 1] 颗绿色宝石。赋予所有妖仙盟友一个随机正面增益效果。再召唤一名妖仙军队。',
    build: skill(
      explodeRandomGems(1, 1, 'color', BaseColor.Green),
      inflictRandom('allyAll', { targetRace: 'Fey', pool: 'positive' }),
      summonRandom(['Dryad', 'Treant', 'Nymph', 'Siren', 'Banshee', 'Orion', 'GloomLeaf', 'Rowanne', 'Sylvasi', 'IceWitch', 'GreenSeer', 'SnowSprite', 'WinterKnight', 'QueenMab', 'Plague', 'SpiritFox', 'Nyx', 'Sylph', 'SnowGuardian', 'Aurai', 'Wisp', 'Leshy', 'Domovoi', 'Vodyanoi', 'YagasHut', 'BabaYaga', 'YasminesChosen', 'Zhenniao', 'Pixie', 'Brownie', 'SummerKnight', 'CatSith', 'Florian', 'Glitterclaw', 'QueenTitania', 'Hind', 'Skadi', 'FeyCap', 'FrostArcher', 'Freya', 'CuSith', 'OldManOakroot', 'Suna', 'Leprechaun', 'Tinseltail', 'DarkDryad', 'Alderfather', 'DaughterOfIce', 'Birchthorn', 'Shimmerscale', 'KingBloodwood', 'RedCap', 'Puka', 'WildKnight', 'TheWendigo', 'Doppelganger', 'Copycat', 'GlassGolem', 'TheMirrorQueen', 'ChildOfSummer', 'Mistralus', 'Cernunnos', 'EirStoneshatter', 'SpringEmissary', 'Vernalis', 'Ullor', 'Grimmoira', 'EarthDreamer', 'Kelpie', 'Sluagh', 'DarkKnight', 'Leanansidhe', 'FountainOfStars', 'LadyEstelle', 'FaerieGobmother', 'Catterfly', 'Saga', 'Tannenbaum', 'TwinkleBerry', 'KingOberron', 'Stheno', 'SpiritOfRage', 'Scoprio', 'HoundOfLiang', 'CourtHerald', 'PhantomFox', 'ShadowFox', 'TheFoxfireKing', 'KingOfRavens', 'Rukh', 'Treekin', 'SunSprite', 'FeyHound', 'MirrorKnight', 'Firenza', 'ForestGremlin', 'LostHunter', 'Feyr', 'TheMidnightQueen', 'LadyOfBones', 'TheMydnightKing', 'LadyOfRuin', 'DaughterOfTime', 'TheBestialFey', 'FireLion', 'Strongman', 'FireJuggler', 'Ringmaster', 'Mandragora', 'Unagh', 'Belladonnus', 'Mistlark', 'FeyDragoon', 'Moonfeather', 'GuardianSpirit', 'ImmortalVirago', 'ImmortalGlaycia', 'Aguara', 'WoodRot', 'MapleGoldbark', 'Crackleleaf', 'BloodflowerDuchess', 'Muireann', 'Boudicca', 'Mistmother', 'Azaleus', 'Helilya', 'MydnightInnovator', 'SpiritOfLuck', 'CourtWitch', 'DarkAcrobat', 'WulfGheist', 'Hollioke', 'Kumiko', 'CromCruach', 'PixieKnight', 'MotherMalice', 'GreenHag', 'DarkSpirit', 'Wisterina', 'Fionnuala', 'FacelessLord', 'Jezebel', 'TheWeepingDuchess', 'Liekki'], undefined),
    ),
  },
  {
    id: 8955,
    desc: '爆破 [魔法 + 1] 颗棕色宝石。赋予所有厄什卡亚盟友一个随机正面增益效果。再召唤一名厄什卡亚军队。',
    build: skill(
      explodeRandomGems(1, 1, 'color', BaseColor.Brown),
      inflictRandom('allyAll', { targetKingdom: '厄什卡亚', pool: 'positive' }),
      summonRandom(rawKingdomPool(3010), undefined) /* native SummoningKingdom 3010 (zh '厄什卡亚' adds faction troops) */,
    ),
  },
  {
    id: 8956,
    desc: '爆破 [魔法 + 1] 颗紫色宝石。赋予所有龙族盟友一个随机正面增益效果。再召唤一名龙族军队。',
    build: skill(
      explodeRandomGems(1, 1, 'color', BaseColor.Purple),
      inflictRandom('allyAll', { targetRace: 'Dragon', pool: 'positive' }),
      summonRandom(['Sheggra', 'Venoxia', 'ShadowDragon', 'Emperina', 'Celestasia', 'BoneDragon', 'DrakeRider', 'Dimetraxia', 'Wyvern', 'Venbarak', 'Borealis', 'DragonEggs', 'BabyDragon', 'Dragonette', 'Dragotaur', 'Dragonmoth', 'Visk', 'TheDragonSoul', 'Couatl', 'Sylvanimora', 'DRACOS-1337', 'DragonianRogue', 'DragonianMonk', 'SilverDrakon', 'Krystenax', 'Drake', 'Elemaugrim', 'DragonTurtle', 'Asha', 'Leviathan', 'Penglong', 'Glitterclaw', 'TheWorldbreaker', 'Divinia', 'LordEmber', 'LadyGarnetia', 'Tinseltail', 'Shimmerscale', 'Volthrenax', 'Thaumaris', 'Droggo', 'Sylfrostenath', 'MatronDragotani', 'UndeadDrake', 'FellDragonEgg', 'FellDragon', 'Nocturnia', 'Ishtara', 'DragonianSage', 'Obregonia', 'DragonSpirit', 'Essencia', 'Huanglong', 'Veneratus', 'HornedWyrm', 'NetherWyrm', 'TerraWyrm', 'TheGreatWyrm', 'Tihamata', 'RedAhriman', 'TwinkleBerry', 'MagmaDragon', 'Sabellius', 'Adakite', 'Obsidiaxas', 'Sapphirax', 'Emeraldrin', 'Rubirath', 'Topasarth', 'Amethialas', 'Garnetaerlin', 'Diamantina', 'Aquaria', 'TheElderDragon', 'HeraldOfKrystenax', 'TheGuardianDragon', 'CobaltDrake', 'HuntmasterArborius', 'CrystalEggs', 'DragonstoneGuardian', 'TheVoidDragon', 'Comethalas', 'Nebuladryx', 'Meteoridan', 'Solarithus', 'Lunarelleon', 'Eklipsos', 'Stellarix', 'DraconicSentinel', 'Tianlong', 'BrassDrake', 'Venerabilax', 'Chromaticea', 'Kukulkan', 'ImmortalAquaria', 'Leucithrax', 'TheSlimeDragon', 'Bahamata', 'Gingeraxia', 'Belcerulea', 'Gladius', 'Thornaressa', 'Narcithus', 'Orrissea', 'Orchidius', 'Chrysantherax', 'Chargrimax', 'Crackleleaf', 'Mistmother', 'DrakeEggs', 'ImmortalDrakkon', 'CrimsonWyrmling', 'Dragonhawk', 'Amethony', 'Creteus', 'Krakynos', 'Runethius', 'Hematrax', 'Vizinium', 'Demizerius', 'Amenhotrex', 'Pandemonia'], undefined),
    ),
  },
  {
    id: 8965,
    desc: '摧毁 X 形宝石。每摧毁一颗黄色宝石，即可祝福一名随机盟友。 [1:1]',
    build: ({"segments":[{"kind":"status","target":"allyAll","statusId":"blessed","turns":3,"perCount":{"mod":{"kind":"multiplier","a":1},"source":{"kind":"diagonalGems","color":"Yellow"}}},{"kind":"gem","params":{"op":"clear","mode":"destroy","target":{"kind":"area","shape":"x"}}}]} as SkillPrototype),
  },
  {
    id: 8966,
    desc: '将选定的法力宝石转换为 x3 通配宝石。',
    build: skill(
      transformToSpecial('CELL', { kind: 'wildcard', tier: 3 }),
    ),
  },
  {
    id: 8971,
    desc: '为所有盟友提供 [魔法 + 5] 护甲。如果盟友来自白盔国，则为他们提供屏障。',
    build: skill(
      armor('allyAll', 5, 1),
      inflict('barrier', 'allyAll', { targetKingdom: '白盔国' }),
    ),
  },
  {
    id: 8972,
    desc: '对敌人造成 [魔法 + 5] 点伤害，伤害值因天使宝石和具有屏障的盟友的数量而增强。 [x5]',
    build: skill(
      // Native 8972: CountGems 500 Angel + CountSpecificStatusEffect@AllAllies 500 barrier (Angel gems were missing).
      dmg('enemyChosen', 5, 1, { modifier: { mod: { kind: 'multiplier', a: 5 }, sources: [{ kind: 'boardSpecial', gem: 'angelGem' }, { kind: 'allyStatusCount', statusId: 'barrier' }] } }),
    ),
  },
  {
    id: 8988,
    desc: '爆破一列。所选列每有一颗骷髅头或紫色宝石，则创造一个死亡标记宝石。 [1:1]',
    build: skill(explodeChosenCol(), createSpecialGems({ kind: 'deathMarkGem' }, 0, 0, { modifier: { mod: { kind: 'multiplier', a: 1 }, sources: [{ kind: 'chosenColumnAtCastStart', skulls: true }, { kind: 'chosenColumnAtCastStart', color: BaseColor.Purple }] } })),
  },
  {
    id: 8989,
    desc: '给予所有盟友 2 点魔力值，每锻炼 1 个武器段位则 +1 魔力值。给予蓝色盟友 [魔法 + 2] 点护甲值。若敌人拥有一个劫数，则获得 10 点攻击力。',
    build: ({"segments":[{"kind":"buff","target":"allyAll","stat":"magic","scaling":{"base":2,"mult":0},"modifier":{"mod":{"kind":"multiplier","a":1},"source":{"kind":"tempering"}}},{"kind":"buff","target":"allyAll","stat":"armor","scaling":{"base":2,"mult":1},"ifCond":{"kind":"targetColor","color":"Blue"}},{"kind":"buff","target":"allySelf","stat":"attack","scaling":{"base":10,"mult":0},"ifCond":{"kind":"targetHasDoom"}}]} as SkillPrototype),
  },
  {
    id: 8990,
    desc: '给予所有盟友 2 点魔力值，每锻炼 1 个武器段位则 +1 魔力值。给予绿色盟友 [魔法 + 2] 点护甲值。若敌人拥有一个劫数，则获得 10 点攻击力。',
    build: ({"segments":[{"kind":"buff","target":"allyAll","stat":"magic","scaling":{"base":2,"mult":0},"modifier":{"mod":{"kind":"multiplier","a":1},"source":{"kind":"tempering"}}},{"kind":"buff","target":"allyAll","stat":"armor","scaling":{"base":2,"mult":1},"ifCond":{"kind":"targetColor","color":"Green"}},{"kind":"buff","target":"allySelf","stat":"attack","scaling":{"base":10,"mult":0},"ifCond":{"kind":"targetHasDoom"}}]} as SkillPrototype),
  },
  {
    id: 8991,
    desc: '给予所有盟友 2 点魔力值，每锻炼 1 个武器段位则 +1 魔力值。给予红色盟友 [魔法 + 2] 点护甲值。若敌人拥有一个劫数，则获得 10 点攻击力。',
    build: ({"segments":[{"kind":"buff","target":"allyAll","stat":"magic","scaling":{"base":2,"mult":0},"modifier":{"mod":{"kind":"multiplier","a":1},"source":{"kind":"tempering"}}},{"kind":"buff","target":"allyAll","stat":"armor","scaling":{"base":2,"mult":1},"ifCond":{"kind":"targetColor","color":"Red"}},{"kind":"buff","target":"allySelf","stat":"attack","scaling":{"base":10,"mult":0},"ifCond":{"kind":"targetHasDoom"}}]} as SkillPrototype),
  },
  {
    id: 8992,
    desc: '给予所有盟友 2 点魔力值，每锻炼 1 个武器段位则 +1 魔力值。给予黄色盟友 [魔法 + 2] 点护甲值。若敌人拥有一个劫数，则获得 10 点攻击力。',
    build: ({"segments":[{"kind":"buff","target":"allyAll","stat":"magic","scaling":{"base":2,"mult":0},"modifier":{"mod":{"kind":"multiplier","a":1},"source":{"kind":"tempering"}}},{"kind":"buff","target":"allyAll","stat":"armor","scaling":{"base":2,"mult":1},"ifCond":{"kind":"targetColor","color":"Yellow"}},{"kind":"buff","target":"allySelf","stat":"attack","scaling":{"base":10,"mult":0},"ifCond":{"kind":"targetHasDoom"}}]} as SkillPrototype),
  },
  {
    id: 8993,
    desc: '给予所有盟友 2 点魔力值，每锻炼 1 个武器段位则 +1 魔力值。给予紫色盟友 [魔法 + 2] 点护甲值。若敌人拥有一个劫数，则获得 10 点攻击力。',
    build: ({"segments":[{"kind":"buff","target":"allyAll","stat":"magic","scaling":{"base":2,"mult":0},"modifier":{"mod":{"kind":"multiplier","a":1},"source":{"kind":"tempering"}}},{"kind":"buff","target":"allyAll","stat":"armor","scaling":{"base":2,"mult":1},"ifCond":{"kind":"targetColor","color":"Purple"}},{"kind":"buff","target":"allySelf","stat":"attack","scaling":{"base":10,"mult":0},"ifCond":{"kind":"targetHasDoom"}}]} as SkillPrototype),
  },
  {
    id: 8994,
    desc: '给予所有盟友 2 点魔力值，每锻炼 1 个武器段位则 +1 魔力值。给予棕色盟友 [魔法 + 2] 点护甲值。若敌人拥有一个劫数，则获得 10 点攻击力。',
    build: ({"segments":[{"kind":"buff","target":"allyAll","stat":"magic","scaling":{"base":2,"mult":0},"modifier":{"mod":{"kind":"multiplier","a":1},"source":{"kind":"tempering"}}},{"kind":"buff","target":"allyAll","stat":"armor","scaling":{"base":2,"mult":1},"ifCond":{"kind":"targetColor","color":"Brown"}},{"kind":"buff","target":"allySelf","stat":"attack","scaling":{"base":10,"mult":0},"ifCond":{"kind":"targetHasDoom"}}]} as SkillPrototype),
  },
  {
    id: 8995,
    desc: '爆破一颗宝石。给予所有盟友 [魔法 + 1] 点护甲值，数值因被摧毁的炸弹宝石数而增强。 [x2]',
    build: ({"segments":[{"kind":"gem","params":{"op":"clear","mode":"explode","target":{"kind":"cell","cell":"CELL"}}},{"kind":"buff","target":"allyAll","stat":"armor","scaling":{"base":1,"mult":1},"modifier":{"mod":{"kind":"multiplier","a":2},"source":{"kind":"destroyedGems","special":"bomb"}}}]} as SkillPrototype),
    // sa-A r3: native CountGems Bomb Block3x3 before the explosion → Bombs cleared by it (was Bombs left on the board after)
  },
  {
    id: 8996,
    desc: '对 2 名随机敌人造成 [魔法 + 2] 点真实伤害。再创造 5 颗炸弹宝石。',
    build: skill(
      trueDmg('enemyRandomN', 2, 1, { trueDamage: true, n: 2 }),
      createSpecialGems({ kind: 'bomb' }, 5, 0),
    ),
  },
  {
    id: 8997,
    desc: '对首位敌人造成 [魔法 + 5] 点伤害。再创造 7 颗红色宝石。',
    build: skill(
      dmg('enemyFront', 5, 1),
      createGems(BaseColor.Red, 7, 0),
    ),
  },
  {
    id: 8998,
    desc: '对一名敌人造成 [魔法 + 4] 点伤害。再创造 7 颗蓝色宝石。',
    build: skill(
      dmg('enemyChosen', 4, 1),
      createGems(BaseColor.Blue, 7, 0),
    ),
  },
  {
    id: 8999,
    desc: '对一名敌人造成 [魔法 + 3] 点轻度溅射伤害。再创造 7 颗绿色宝石。',
    build: skill(
      dmgSplash('enemyChosen', 3, 1, { range: 'splash' }),
      createGems(BaseColor.Green, 7, 0),
    ),
  },
  {
    id: 9018,
    desc: '对一名敌人造成 [魔法 + 3] 点伤害，伤害值因赃物宝石数而增强。再爆破 4 颗宝石。 [x5]',
    build: ({"segments":[{"kind":"damage","target":"enemyChosen","scaling":{"base":3,"mult":1},"modifier":{"mod":{"kind":"multiplier","a":5},"source":{"kind":"boardSpecial","gem":"bootyGem"}}},{"kind":"gem","params":{"op":"clear","mode":"explode","target":{"kind":"randomGems","count":{"base":4,"mult":0},"include":"color"}}}]} as SkillPrototype),
  },
  {
    id: 9019,
    desc: '对一名敌人造成 [魔法 + 4] 点伤害，伤害值因红色盟友和龙族盟友数而增强。 [x3]',
    build: skill(
      dmg('enemyChosen', 4, 1, { modifier: { mod: { kind: 'multiplier', a: 3 }, sources: [{ kind: 'alliesOfColor', color: BaseColor.Red }, { kind: 'alliesOfRace', race: 'Dragon' }] } }),
    ),
  },
  {
    id: 9030,
    desc: '对首 2 位敌人造成 [魔法 + 2] 点真实伤害，伤害值因赃物宝石数而增强。 [x3]',
    build: skill(
      trueDmg('enemyFirstN', 2, 1, { trueDamage: true, n: 2, modifier: { mod: { kind: 'multiplier', a: 3 }, source: { kind: 'boardSpecial', gem: 'bootyGem' } } }),
    ),
  },
  {
    id: 9031,
    desc: '将 3 颗绿色宝石转换成赃物宝石。再将所有黄色宝石转换成末日骷髅头。',
    build: skill(
      transformToSpecial(BaseColor.Green, 'bootyGem', { count: 3 }),
      transformToSpecial(BaseColor.Yellow, 'doomSkull'),
    ),
  },
  {
    id: 9032,
    desc: '对所有敌人造成 [魔法 + 2] 点真实伤害。再创造 3 颗赃物宝石，并爆破 5 颗宝石。',
    build: skill(
      dmg('enemyAll', 2, 1, { range: 'all', trueDamage: true }),
      createSpecialGems({ kind: 'bootyGem' }, 3, 0),
      explodeRandomGems(5, 0, 'all'),
    ),
  },
  {
    id: 9033,
    desc: '爆破 [魔法 + 1] 颗绿色宝石。赋予所有哥布林盟友一个随机状态效果。再召唤一名哥布林部队。',
    build: skill(
      explodeRandomGems(1, 1, 'color', BaseColor.Green),
      inflictRandom('allyAll', { targetRace: 'Goblin', pool: 'positive' }),
      summonRandom(['Goblin', 'GoblinShaman', 'BoarRider', 'GoblinKing', 'Hobgoblin', 'GoblinRocket', 'NobendBrothers', 'SirSnothelm', 'Bugbear', 'PrincessFizzbang', 'QueenGrapplepot', 'Hellcackle', 'IceGoblin', 'HighKingIrongut', 'KingGobtruffle', 'Stringfiddler', 'Toadsqueezer', 'Goblette', 'Rogueling', 'Smashedmouth', 'Kobold', 'KoboldKnight', 'KoboldMagi', 'Emperinazara', 'Fundingus', 'WilliTheAnchor', 'FlamingOni', 'FaerieGobmother', 'GoblinBomber', 'KoboldEmissary', 'PriestOfNilbog', 'FrostfireGoblin', 'Slughoarder', 'BombRider', 'CinderhandGoblin', 'Murk,Lurk,AndDurk', 'Gloomhob', 'KoboldThief', 'GoblinPickpocket', 'MokTheCannon-Rider', 'Skulker', 'ZargsBoomPile', 'CountGobula', 'LordGobthe', 'ImmortalTrogolin'], undefined),
    ),
  },
  {
    id: 9034,
    desc: '爆破 [魔法 + 1] 颗棕色宝石。赋予所有诺斯盟友一个随机正面增益状态效果。再召唤一名诺斯军队。',
    build: skill(
      explodeRandomGems(1, 1, 'color', BaseColor.Brown),
      inflictRandom('allyAll', { targetKingdom: '诺斯', pool: 'positive' }),
      summonRandom(rawKingdomPool(3080), undefined) /* native SummoningKingdom 3080 (zh '诺斯' adds faction troops) */,
    ),
  },
  {
    id: 9035,
    desc: '爆破 [魔法 + 1] 颗红色宝石。赋予所有恶魔盟友一个随机正面增益状态效果。再召唤一名恶魔军队。',
    build: skill(
      explodeRandomGems(1, 1, 'color', BaseColor.Red),
      inflictRandom('allyAll', { targetRace: 'Daemon', pool: 'positive' }),
      summonRandom(['AncientHorror', 'SpiderQueen', 'Abhorath', 'Webspinner', 'Moloch', 'TheSilentOne', 'Gorgotha', 'Kerberos', 'Cthyryzyx', 'Terraxis', 'Psion', 'Abynissia', 'Quasit', 'Hellhound', 'Succubus', 'HeraldOfChaos', 'InfernalKing', 'Venbarak', 'War', 'Plague', 'Famine', 'Death', 'Marilith', 'Hellcat', 'Creeper', 'KruargTheDread', 'Desdaemona', 'Warg', 'Incubus', 'DarkMonolith', 'Myzmer', 'Elemaugrim', 'CorruptedUrska', 'BoneDaemon', 'Hellspawn', 'Spinnerette', 'Doomclaw', 'YaoGuai', 'Erinyes', 'Tzathoth', 'Gargantaur', 'TomeOfEvil', 'Hellcackle', 'Glaycion', 'Nightmare', 'SirMordayne', 'Umbraxis', 'ThePossessedKing', 'Sloth', 'Envy', 'Greed', 'Gluttony', 'Barghast', 'Pride', 'Wrath', 'Lust', 'SibylOfLust', 'SoldierOfWrath', 'WallOfTentacles', 'Bael', 'VashDagon', 'QueenOfSin', 'Glutmaw', 'Obsidius', 'Lamashtu', 'PossessedUrska', 'BrokerOfGreed', 'EnvoyOfPride', 'MotherOfDarkness', 'GateOfSouls', 'Lucifria', 'Blightwing', 'Deminaga', 'TheInfernalMachine', 'Ironjaw', 'Tartarus', 'Netherhound', 'EldritchGuardian', 'FellDragonEgg', 'FellDragon', 'Nocturnia', 'HeraldOfWoe', 'IndolatorOfSloth', 'ShadeOfKurandara', 'Kurandara', 'EnragedKurandara', 'DaemonGnome', 'Mambasira', 'Arcturion', 'HeraldOfDamnation', 'Baphomet', 'TheScourgeOfHonor', 'DeepGolem', 'NyarMel', 'HoundOfYaoGuai', 'MaidOfEnvy', 'TheArchduke', 'Lemure', 'Fury', 'Charonas', 'JudgeOfTheDead', 'HellclawHunter', 'HellclawMage', 'HellclawWarrior', 'Indrajit', 'HelgorTheGuardian', 'FlamingOni', 'Oneiros', 'RedAhriman', 'AbjectOfDespond', 'Despond', 'BileBlackheart', 'AnimusOfEnvy', 'HornedHag', 'ConsortOfDarkness', 'EldritchMinion', 'Uvhash-Ka', 'WarMachine', 'HellclawRager', 'HeraldOfBlight', 'HellstoneGate', 'HeraldOfTorpor', 'Czernobog', 'Nabassu', 'Xenith', 'Tourmaline', 'Chalcedony', 'Petrahulk', 'StoneMefyt', 'TheElderDragon', 'VrawkDaemon', 'EldritchDisciple', 'Voidcaller', 'TheBaneOfMercy', 'EyeOfArges', 'InfernalVoyager', 'TheIronMaiden', 'TriTerror', 'DaemonChild', 'TheVoidDragon', 'Tempurath', 'DaemonicSentinel', 'Hellborer', 'DarkHerald', 'Groevanga', 'FellHydra', 'Isban', 'Goethite', 'SuccubusQueen', 'Bieska', 'HoundmasterGor', 'BlightHound', 'Astaroth', 'DaeDrak', 'MelekTauss', 'DoomedGuardian', 'StingBat', 'TheBaneOfValor', 'Redreaver', 'LionOfYaoGuai', 'Discordia', 'ImmortalAbaddon', 'BlightedHusk', 'BaneOfAmbition', 'HellclawShadowpriest', 'Polymetis', 'DagoNath', 'FelineOfEnvy', 'Skarn', 'MaidenOfPain', 'HeraldOfWar', 'Azbeel', 'OkraNosTheSleeper', 'Voidjaw', 'ChampionOfRot', 'BloodSpore', 'InfernalTrickster', 'Seditius', 'ImmortalZephaar'], undefined),
    ),
  },
  {
    id: 9036,
    desc: '爆破 [魔法 + 1] 颗蓝色宝石。赋予所有梅兰堤斯盟友一个随机正面增益效果。再召唤一名梅兰堤斯军队。',
    build: skill(
      explodeRandomGems(1, 1, 'color', BaseColor.Blue),
      inflictRandom('allyAll', { targetKingdom: '梅兰堤斯', pool: 'positive' }),
      summonRandom(rawKingdomPool(3036), undefined) /* native SummoningKingdom 3036 (zh '梅兰堤斯' adds faction troops) */,
    ),
  },
  {
    id: 9037,
    desc: '对一名敌人造成 [魔法 + 4] 点伤害，数值因蓝色盟友数和骑士盟友数而增强。 [x3]',
    build: skill(
      dmg('enemyChosen', 4, 1, { modifier: { mod: { kind: 'multiplier', a: 3 }, sources: [{ kind: 'alliesOfColor', color: BaseColor.Blue }, { kind: 'alliesOfRace', race: 'Knight' }] } }),
    ),
  },
  {
    id: 9110,
    desc: '创造 15 颗混合蓝色和骷髅头的宝石。有 25% 的几率获得一个额外回合，几率因陷入恐怖状态的敌人数而增强。 [x2]',
    build: skill(
      createGemsMixAny([BaseColor.Blue, 'SKULL'], 15, 0),
      extraTurn({ chance: 0.25, chanceBoost: { mod: { kind: 'multiplier', a: 2 }, source: { kind: 'enemyStatusCount', statusId: 'terror' } } }),
    ),
  },
  {
    id: 9111,
    desc: '移除所有棕色宝石。对一名敌人造成 [魔法 + 5] 点伤害，伤害值因被移除的宝石数而增强。若敌人来自午夜城市或战斗位于午夜城市，则伤害翻倍。 [3:1]',
    build: ({"segments":[{"kind":"gem","params":{"op":"clear","mode":"destroy","target":{"kind":"color","color":"Brown"}}},{"kind":"damage","target":"enemyChosen","scaling":{"base":5,"mult":1},"modifier":{"mod":{"kind":"ratio","a":3,"b":1},"source":{"kind":"destroyedGems"}},"condMult":{"times":2,"cond":{"kind":"anyOf","of":[{"kind":"targetKingdom","kingdom":"午夜城市"},{"kind":"kingdomPresent","kingdom":"午夜城市"}]}}}]} as SkillPrototype),
  },
  {
    id: 9112,
    desc: '对一名敌人造成 [魔法 + 3] 点重度溅射伤害。对一名随机敌人造成 [魔法 + 3] 点轻度溅射伤害。',
    build: ({"segments":[{"kind":"damage","target":"enemyChosen","scaling":{"base":3,"mult":1},"range":"splash","splashRatio":0.75},{"kind":"damage","target":"enemyRandom","scaling":{"base":3,"mult":1},"range":"splash","splashRatio":0.25}]} as SkillPrototype),
  },
  {
    id: 9113,
    desc: '对所有敌人造成 [魔法 + 2] 点伤害。若敌人身亡，则将所有红色宝石转换成沙漏宝石。',
    build: skill(
      dmg('enemyAll', 2, 1, { range: 'all' }),
      transformToSpecial(BaseColor.Red, 'hourglass', { ifTargetDied: true }),
    ),
  },
  {
    id: 9141,
    desc: '对首 2 位敌人造成 [魔法 + 3] 点伤害，伤害值因不死族盟友数而增强。 [x4]',
    build: skill(
      dmg('enemyFirstN', 3, 1, { n: 2, modifier: { mod: { kind: 'multiplier', a: 4 }, source: { kind: 'alliesOfRace', race: 'Undead' } } }),
    ),
  },
  {
    id: 9142,
    desc: '爆破 [魔法 + 1] 颗棕色宝石。赋予所有聚沙之地盟友一个随机正面增益效果。再召唤一名聚沙之地军队。',
    build: skill(
      explodeRandomGems(1, 1, 'color', BaseColor.Brown),
      inflictRandom('allyAll', { targetKingdom: '聚沙之地', pool: 'positive' }),
      summonRandom(rawKingdomPool(3024), undefined) /* native SummoningKingdom 3024 (zh '聚沙之地' adds faction troops) */,
    ),
  },
  {
    id: 9143,
    desc: '对一名敌人造成 [魔法 + 4] 点伤害，伤害值因绿色盟友和人马族盟友数而增强。 [x3]',
    build: skill(
      dmg('enemyChosen', 4, 1, { modifier: { mod: { kind: 'multiplier', a: 3 }, sources: [{ kind: 'alliesOfColor', color: BaseColor.Green }, { kind: 'alliesOfRace', race: 'Centaur' }] } }),
    ),
  },
];

export const BATCH_W03: CuratedBatch = { batch: 'W03', spells: SPELLS, skipped: SKIPPED };
