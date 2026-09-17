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
import { armor, attack, createGems, createSpecialGems, createStorm, destroyChosenCol, destroyChosenRow, destroyColor, dmg, dmgSplash, explodeRandomGems, extraTurn, gainGold, heal, inflict, inflictRandom, magic, mana, shuffleTeam, skill, steal, summonRandom, transform, transformToSpecial, trueDmg, CHOSEN } from '../builders';
import { BaseColor } from '../../types';
import type { CuratedBatch } from './index';

const SKIPPED: { id: number; reason: string }[] = [];

const SPELLS: CuratedBatch['spells'] = [
  {
    id: 8440,
    desc: '消除 [魔法 + 1] 点随机技能值，再使一名敌人陷入诅咒、死亡标记和疾病状态。',
    build: skill(
      inflict('death-mark', 'enemyRandomN'),
    ),
  },
  {
    id: 8441,
    desc: '对一名敌人造成 [魔法 + 6] 点伤害。若敌人使用紫色法力，则使其陷入死亡标记状态。',
    build: skill(
      dmg('enemyChosen', 6, 1),
    ),
  },
  {
    id: 8442,
    desc: '创造 4 颗绿色宝石，每锻炼 1 个武器段位则 +1 颗宝石。给予所有蓝色盟友 [魔法 + 2] 点护甲值。若敌方有劫数，则消除一位随机敌人所有护甲值。',
    build: skill(
      createGems(BaseColor.Green, 4, 0),
    ),
  },
  {
    id: 8443,
    desc: '创造 4 颗蓝色宝石，每锻炼 1 个武器段位则 +1 颗宝石。给予所有绿色盟友 [魔法 + 1] 点护甲值。若敌方有劫数，则消除一位随机敌人所有护甲值。',
    build: skill(
      createGems(BaseColor.Blue, 4, 0),
    ),
  },
  {
    id: 8444,
    desc: '创造 4 颗黄色宝石，每锻炼 1 个武器段位则 +1 颗宝石。给予所有红色盟友 [魔法 + 1] 点护甲值。若敌方有劫数，则消除一位随机敌人所有护甲值。',
    build: skill(
      createGems(BaseColor.Yellow, 4, 0),
    ),
  },
  {
    id: 8445,
    desc: '创造 4 颗红色宝石，每锻炼 1 个武器段位则 +1 颗宝石。给予所有黄色盟友 [魔法 + 1] 点护甲值。若敌方有劫数，则消除一位随机敌人所有护甲值。',
    build: skill(
      createGems(BaseColor.Red, 4, 0),
    ),
  },
  {
    id: 8446,
    desc: '创造 4 颗棕色宝石，每锻炼 1 个武器段位则 +1 颗宝石。给予所有紫色盟友 [魔法 + 1] 点护甲值。若敌方有劫数，则消除一位随机敌人所有护甲值。',
    build: skill(
      createGems(BaseColor.Brown, 4, 0),
    ),
  },
  {
    id: 8447,
    desc: '创造 4 颗紫色宝石，每锻炼 1 个武器段位则 +1 颗宝石。给予所有棕色盟友 [魔法 + 1] 点护甲值。若敌方有劫数，则消除一位随机敌人所有护甲值。',
    build: skill(
      createGems(BaseColor.Purple, 4, 0),
    ),
  },
  {
    id: 8448,
    desc: '爆破 1 行或 1 列。对第一位敌人造成 [魔法 + 4] 点伤害。打乱敌方队伍队形。',
    build: skill(
      dmg('enemyFront', 4, 1),
    ),
  },
  {
    id: 8449,
    desc: '爆破 [魔法 + 1] 颗红色宝石。赋予所有纳迦盟友一个随机状态效果。召唤一名纳迦军队。',
    build: skill(
      explodeRandomGems(1, 1, 'color', BaseColor.Red),
      inflictRandom('allyAll', { targetRace: 'Naga' }),
      summonRandom(['ScaleGuard', 'PoisonMaster', 'Lamia', 'Marilith', 'NagaQueen', 'BoneNaga', 'Euryali', 'Viper', 'Tai-Pan', 'Fangblade', 'SkulkFang', 'Vassara', 'HornedAsp', 'Setauri', 'ShamanOfSet', 'ChiefDargon', 'Kobra', 'AlgorakTheSlayer', 'Treachery', 'Deminaga', 'Mambasira', 'RoyalAssassin', 'Kobold', 'KoboldKnight', 'KoboldMagi', 'Emperinazara', 'WrathNaga', 'Medusa', 'Stheno', 'KoboldEmissary', 'SetauriGladius', 'SetauriMage', 'Salamandria', 'Takshaka', 'Weresnake', 'Slitherling', 'KoboldThief', 'MelekTauss', 'Cascabel', 'Bothros', 'SetauriSkulk', 'Manasa'], undefined),
    ),
  },
  {
    id: 8450,
    desc: '对一名敌人造成 [魔法 + 4] 点伤害。若敌人攻击力高于自身，则有 20% 的几率杀死对方。',
    build: skill(
      dmg('enemyChosen', 4, 1),
    ),
  },
  {
    id: 8451,
    desc: '爆破 [魔法 + 1] 颗黄色宝石。赋予所有卜筮之原盟友一个随机状态效果。再召唤一名卜筮之原军队。',
    build: skill(
      explodeRandomGems(1, 1, 'color', BaseColor.Yellow),
    ),
  },
  {
    id: 8452,
    desc: '对一名敌人造成 [魔法 + 7] 点伤害，伤害值因龙爪盟友数而增强。每有一名龙爪盟友则创造 6 颗混合红色和紫色的宝石。 [x6]',
    build: skill(
      dmg('enemyChosen', 7, 1, { modifier: { mod: { kind: 'multiplier', a: 6 }, source: { kind: 'alliesOfRace', race: 'Dragon' } } }),
    ),
  },
  {
    id: 8453,
    desc: '对敌人造成[魔法 + 7]点伤害，由风暴峡湾盟友激发。然后给每个风暴峡湾盟友制造6颗混合的蓝色和黄色宝石。 [x6]',
    build: skill(
      dmg('enemyChosen', 7, 1),
    ),
  },
  {
    id: 8454,
    desc: '对最后一个敌人造成 [魔法 + 2] 真实伤害，伤害值因红色和紫色宝石而增强。召唤地狱风暴。 [x2]',
    build: skill(
      trueDmg('enemyLast', 2, 1, { trueDamage: true, modifier: { mod: { kind: 'multiplier', a: 2 }, sources: [{ kind: 'boardGems', color: BaseColor.Red }, { kind: 'boardGems', color: BaseColor.Purple }] } }),
      createStorm(BaseColor.Red),
    ),
  },
  {
    id: 8455,
    desc: '爆破 [魔法 + 1] 颗棕色宝石。赋予所有厄什卡盟友一个随机正面增益效果。再召唤一名厄什卡军队。',
    build: skill(
      explodeRandomGems(1, 1, 'color', BaseColor.Brown),
    ),
  },
  {
    id: 8456,
    desc: '爆破 [魔法 + 1] 颗紫色宝石。赋予所有不死族盟友一个随机正面增益效果。再召唤一名不死族军队。',
    build: skill(
      explodeRandomGems(1, 1, 'color', BaseColor.Purple),
      inflictRandom('allyAll', { targetRace: 'Undead' }),
    ),
  },
  {
    id: 8461,
    desc: '对最末位的敌人造成 [魔法 + 4] 点伤害。再获得一个额外回合或召唤一名随机科博。',
    build: skill(
      dmg('enemyLast', 4, 1),
      extraTurn(),
    ),
  },
  {
    id: 8487,
    desc: '对一名敌人造成 [魔法 + 7] 点伤害，伤害值因黑鹰盟友数而增强。每有一位黑鹰盟友则创造 6 颗混合蓝色和红色的宝石。 [x6]',
    build: skill(
      dmg('enemyChosen', 7, 1, { modifier: { mod: { kind: 'multiplier', a: 6 }, source: { kind: 'teamSize', side: 'ally' } } }),
    ),
  },
  {
    id: 8490,
    desc: '爆破 [魔法 + 1] 颗棕色宝石。赋予所有机械盟友一个随机状态效果。再召唤一名机械军队。',
    build: skill(
      explodeRandomGems(1, 1, 'color', BaseColor.Brown),
      inflictRandom('allyAll', { targetRace: 'Mech' }),
    ),
  },
  {
    id: 8505,
    desc: '爆破 [魔法 + 1] 颗绿色宝石。赋予所有狂野平原盟友一个随机状态效果。再召唤一名狂野平原军队。',
    build: skill(
      explodeRandomGems(1, 1, 'color', BaseColor.Green),
    ),
  },
  {
    id: 8506,
    desc: '对一名敌人造成 [魔法 + 7] 点伤害，伤害值因破碎尖塔盟友数而增强。每有一位破碎尖塔盟友则创造 6 颗混合红色和棕色的宝石。 [x6]',
    build: skill(
      dmg('enemyChosen', 7, 1, { modifier: { mod: { kind: 'multiplier', a: 6 }, source: { kind: 'teamSize', side: 'ally' } } }),
    ),
  },
  {
    id: 8507,
    desc: '移除所有紫色宝石。创造等同于被移除的紫色宝石数的黄色宝石。给予一名盟友 [魔法 + 1] 点生命值，数量因板面上现有的黄色宝石数而增强。 [1:1]',
    build: skill(
      destroyColor(BaseColor.Purple),
      heal('allyAll', 1, 1, { modifier: { mod: { kind: 'ratio', a: 1, b: 1 }, source: { kind: 'boardGems', color: BaseColor.Yellow } } }),
    ),
  },
  {
    id: 8508,
    desc: '对最后一位敌人造成 [魔法 + 3] 点伤害。若对方已陷入中毒状态，则使其陷入叠加 4 倍的出血状态',
    build: skill(
      dmg('enemyLast', 3, 1),
    ),
  },
  {
    id: 8509,
    desc: '爆破 [魔法 + 1] 颗紫色宝石。赋予所有秘士盟友一个随机状态效果。再召唤一名秘士军队。',
    build: skill(
      explodeRandomGems(1, 1, 'color', BaseColor.Purple),
      inflictRandom('allyAll', { targetRace: 'Mystic' }),
    ),
  },
  {
    id: 8510,
    desc: '爆破 [魔法 + 1] 颗蓝色宝石。赋予所有冰峰之巅盟友一个随机状态效果。再召唤一名冰峰之巅军队。',
    build: skill(
      explodeRandomGems(1, 1, 'color', BaseColor.Blue),
    ),
  },
  {
    id: 8511,
    desc: '选定一个颜色以移除所有同色宝石。造成 [魔法 + 6] 点散射伤害，伤害值因被移除的宝石数而增强。 [x2]',
    build: skill(
      dmg('enemyAll', 6, 1, { range: 'all', modifier: { mod: { kind: 'multiplier', a: 2 }, source: { kind: 'destroyedGems' } } }),
    ),
  },
  {
    id: 8513,
    desc: '爆破 [魔法 + 1] 颗红色宝石。赋予所有破碎尖塔盟友一个随机正面增益效果。再召唤一名破碎尖塔军队。',
    build: skill(
      explodeRandomGems(1, 1, 'color', BaseColor.Red),
    ),
  },
  {
    id: 8514,
    desc: '爆破 [魔法 + 1] 颗红色宝石。赋予所有葛洛什奈克盟友一个随机正面增益效果。再召唤一名葛洛什奈克军队。',
    build: skill(
      explodeRandomGems(1, 1, 'color', BaseColor.Red),
    ),
  },
  {
    id: 8515,
    desc: '爆破[魔法 + 1]颗紫色宝石。给予所有卡拉科斯盟友一个随机状态效果。然后召唤一支卡拉科斯部队。',
    build: skill(
      explodeRandomGems(1, 1, 'color', BaseColor.Purple),
    ),
  },
  {
    id: 8516,
    desc: '给予一名盟友 [魔法 + 1] 点护甲值和 4 点法力值。',
    build: skill(
      armor('allyAll', 1, 1),
      mana('allyAll', 4, 0),
    ),
  },
  {
    id: 8517,
    desc: '获得 [魔法 + 1] 点生命值。再创造 7 颗红色宝石或获得一个额外回合，或爆破一颗随机宝石。',
    build: skill(
      heal('allySelf', 1, 1),
      createGems(BaseColor.Red, 7, 0),
    ),
  },
  {
    id: 8518,
    desc: '摧毁一行。每摧毁一颗紫色宝石则燃烧一名随机敌人。 [1:1]',
    build: skill(
      destroyChosenRow(),
    ),
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
      createGems(BaseColor.Blue, 7, 0),
    ),
  },
  {
    id: 8554,
    desc: '对一名敌人造成 [魔法 + 4] 点伤害。再将他其中一个法力颜色的 3 颗宝石转换成狼化宝石。',
    build: skill(
      dmg('enemyChosen', 4, 1),
    ),
  },
  {
    id: 8576,
    desc: '爆破 [魔法 + 1] 颗绿色宝石。赋予所有野兽盟友一个随机的状态效果。召唤一名野兽军队。',
    build: skill(
      explodeRandomGems(1, 1, 'color', BaseColor.Green),
      inflictRandom('allyAll', { targetRace: 'Beast' }),
      summonRandom(['Rhynax', 'Pegasus', 'Owlbear', 'SacredGuardian', 'BoarRider', 'BlackBeast', 'SabertoothLion', 'GriffonKnight', 'Serpent', 'Warhound', 'Hippogryph', 'GiantSpider', 'DireWolf', 'Kerberos', 'SpiderSwarm', 'Roc', 'Fenrir', 'Salamander', 'Hellhound', 'BunniNog', 'Jackelope', 'Yeti', 'WinterWolf', 'SpiritFox', 'Hellcat', 'Moa', 'FireLizard', 'LionPrince', 'SandCobra', 'Dragonmoth', 'WingedBison', 'ArmoredBoar', 'WarGoat', 'Sunsail', 'Warg', 'Frostling', 'BoneScorpion', 'SnowyOwl', 'GiantToad', 'Werewolf', 'ForestGuardian', 'Wulfgarok', 'Minogor', 'Unicorn', 'Penguin', 'Aurai', 'FrostLizard', 'Drake', 'QueenAurora', 'Parrot', 'Cocoon', 'RiftLynx', 'Valraven', 'Falconer', 'Warhawk', 'Sunbird', 'DragonTurtle', 'Spinnerette', 'GiantCrab', 'Hippocampus', 'Merlion', 'Zhenniao', 'CatSith', 'BatSwarm', 'Umberwolf', 'Bulette', 'Hyena', 'Mammoth', 'OwlRider', 'Stone-Shaker', 'PharaohHound', 'TombSpider', 'Willow', 'Gorbil', 'DireBoar', 'CuSith', 'Nightmare', 'MidgeSwarm', 'FestivalCow', 'ArcticFox', 'Barghast', 'GriffStonefeather', 'Rhynaggor', 'TurtleCannon', 'Bunnicorn', 'Nightwing', 'Plainsjumper', 'MoonRabbit', 'Qilin', 'VineMarten', 'WoodRhynax', 'SnowPanther', 'UrskayanBlue', 'HornedAsp', 'Necrocorn', 'Glutmaw', 'CorpseMare', 'ROVER-300', 'Frostfeather', 'Grimcorn', 'HarpyEagle', 'Droggo', 'Kryshound', 'WarWolf', 'GuardianOfTheFields', 'Amaru', 'DireCub', 'Tutankhatmun', 'DandyLion', 'Crysturtle', 'Werebird', 'Werebear', 'Werecat', 'BeastmasterTorbern', 'SirQuentinHadley', 'ChaosHound', 'P4-NTH4', 'MechaRat', 'Blightwing', 'DynamiteGoat', 'Netherhound', 'SwampRat', 'Basilisk', 'WarElephant', 'Axolotl', 'Doombat', 'DreadSteed', 'LordBelanor', 'Amarok', 'ArmoredBoarlet', 'DeepHuntsman', 'FlameOfAnu', 'NightSpider', 'Kharybdis', 'Pan', 'CarrionCrow', 'SnowyOwlbear', 'Baihu', 'UlfsMascot', 'Hatir&Skroll', 'HatirAscendant', 'SkrollReborn', 'Wereraven', 'Werebat', 'Wereverine', 'TheWerestag', 'Devourer', 'IceOrca', 'Wererat', 'Swanmay', 'Wereshark', 'SkyScorpion', 'AransiTheGuardian', 'NaturebornWolf', 'FirebornEagle', 'WaterbornOwl', 'StonebornLion', 'MoonPhoenix', 'Leocorn', 'Catterfly', 'BrianTheClucky', 'Narwhale', 'SteelCobra', 'SkyGoat', 'Shadowbeast', 'LavaScorpion', 'Kitsune', 'Crystalynx', 'Mechamare', 'LordArchimedus', 'Mechweaver', 'Deathclaw', 'Tauraeus', 'EagleOwl', 'FloraFawn', 'CryptHound', 'FlameRhynax', 'FireBeetle', 'StoneViper', 'Leio', 'Craghound', 'Anglerfin', 'BORK-3000', 'Scoprio', 'HoundOfLiang', 'RedFox', 'Vulperus', 'Inari', 'Zhuque', 'Negasus', 'DeadParrot', 'AxeBeak', 'Deathgaunt', 'FeyHound', 'SandCat', 'CobaltDrake', 'StonePanther', 'MantaRaider', 'SkellyCat', 'Grimfeather', 'Werehound', 'RatSwarm', 'LeapingSpider', 'BoneHound', 'TheBestialFey', 'Egris', 'Caribou', 'ArcaneSabercat', 'DeephornBeetle', 'Bloodfang', 'GiantBadger', 'Adelwing', 'BrassDrake', 'UndeadLion', 'Valhawk', 'ManeCourser', 'Weresnake', 'FirebornLynx', 'Amphib-o-Bot', 'MidwinterLycan', 'Mistlark', 'WargSpirit', 'Moonfeather', 'YetiCub', 'DeepSpider', 'BlightHound', 'ShadowBeetle', 'DuskOwlbear', 'WingedDonkey', 'Foxglove', 'Peregrine', 'LionOfYaoGuai', 'ImmortalScoprio', 'ZombieGoat', 'RottingSerpent', 'Treviamus', 'Reavnarokkr', 'Yue-She', 'BloomManatee', 'FelineOfEnvy', 'Azaleus', 'Xuanwu', 'Scrollweaver', 'ImmortalLeio', 'Cosmo', 'Dragonhawk', 'WEEZL-300', 'Rockraptor', 'CaravanCamel', 'Gindibu', 'Yohaulticetl', 'Warmadillo', 'ToxicPuffer', 'Warfang', 'GriffonCaptain', 'PoisonedUrsidae', 'CaveMole', 'ManedWolf', 'FrostSpider', 'CaveCrawler', 'RagingBull', 'Tetramorph'], undefined),
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
    desc: '获得 [魔法 + 1] 点生命值，并赋予一名选定盟友 2 点魔法值。',
    build: skill(
      heal('allySelf', 1, 1),
    ),
  },
  {
    id: 8618,
    desc: '对一名敌人造成 [魔法 + 1] 点伤害。再使其陷入中毒或死亡标记状态。',
    build: skill(
      dmg('enemyChosen', 1, 1),
    ),
  },
  {
    id: 8619,
    desc: '对一名随机敌人造成 [魔法 + 1] 点真实伤害，并随机摧毁一列。',
    build: skill(
      trueDmg('enemyRandom', 1, 1, { trueDamage: true }),
    ),
  },
  {
    id: 8620,
    desc: '对敌人造成 [魔法 + 7] 点伤害，由古尔瓦尼亚盟友增强。然后为每位古尔瓦尼亚盟友创造 6 颗混合红色和紫色宝石。 [x6]',
    build: skill(
      dmg('enemyChosen', 7, 1),
    ),
  },
  {
    id: 8621,
    desc: '爆炸[魔法 + 1]枚棕色宝石。赋予所有怪物盟友一个随机状态效果。然后召唤一支怪物军团。',
    build: skill(
      explodeRandomGems(1, 1, 'color', BaseColor.Brown),
      inflictRandom('allyAll', { targetRace: 'Monster' }),
    ),
  },
  {
    id: 8622,
    desc: '爆炸[魔法 + 1]枚黄色宝石。赋予所有冥河盟友一个随机状态效果。然后召唤一支猎鹰军团。',
    build: skill(
      explodeRandomGems(1, 1, 'color', BaseColor.Yellow),
    ),
  },
  {
    id: 8623,
    desc: '&& 创造 6 颗元素星。赐福所有盟友。&&创造 7 颗临界星。诅咒所有敌人。',
    build: skill(
      inflict('curse', 'enemyAll'),
    ),
  },
  {
    id: 8640,
    desc: '对一名敌人造成 [魔法 + 3] 点伤害，敌人每陷入以下一个状态效果则再造成 12 点伤害：缠绕、燃烧、冻结、击晕。 [x12]',
    build: skill(
      dmg('enemyChosen', 3, 1),
    ),
  },
  {
    id: 8642,
    desc: '移除所有棕色宝石。对一名敌人造成l [魔法 + 5] 点伤害，伤害值因被移除的宝石数而增强。若敌人来自诺斯，或战斗发生在诺斯，则造成双倍伤害。 [3:1]',
    build: skill(
      destroyColor(BaseColor.Brown),
      dmg('enemyChosen', 5, 1, { modifier: { mod: { kind: 'ratio', a: 3, b: 1 }, source: { kind: 'destroyedGems' } } }),
    ),
  },
  {
    id: 8644,
    desc: '对一名敌人造成 [魔法 + 4] 点伤害，伤害值因绿色和元素盟友而增强。 [x3]',
    build: skill(
      dmg('enemyChosen', 4, 1, { modifier: { mod: { kind: 'multiplier', a: 3 }, source: { kind: 'alliesOfRace', race: 'Elemental' } } }),
    ),
  },
  {
    id: 8645,
    desc: '对一名敌人造成 [魔法 + 7] 点伤害，伤害值因诺斯盟友数而增强。每有一名诺斯盟友，则创建 6 颗混合红色和棕色的宝石。 [x6]',
    build: skill(
      dmg('enemyChosen', 7, 1, { modifier: { mod: { kind: 'multiplier', a: 6 }, source: { kind: 'teamSize', side: 'ally' } } }),
    ),
  },
  {
    id: 8646,
    desc: '每有一名蓝色盟友或元素盟友，则爆破 4 颗宝石。 [x4]',
    build: skill(
      explodeRandomGems(4, 0, 'color', undefined, { modifier: { mod: { kind: 'multiplier', a: 4 }, sources: [{ kind: 'alliesOfColor', color: BaseColor.Blue }, { kind: 'teamSize', side: 'ally' }] } }),
    ),
  },
  {
    id: 8647,
    desc: '击晕所有敌人，再创造 3 颗元素星。',
    build: skill(
      inflict('stun', 'enemyAll'),
    ),
  },
  {
    id: 8669,
    desc: '对一名敌人造成 [魔法 + 7] 点伤害，伤害值因齐埃金盟友数而增强。每有一名齐埃金盟友则创建 6 颗混合绿色和棕色的宝石。 [x6]',
    build: skill(
      dmg('enemyChosen', 7, 1, { modifier: { mod: { kind: 'multiplier', a: 6 }, source: { kind: 'teamSize', side: 'ally' } } }),
    ),
  },
  {
    id: 8670,
    desc: '爆破 [魔法 + 1] 颗紫色宝石。赋予所有玉银林地盟友一个随机正面增益效果。再召唤一名玉银林地军队。',
    build: skill(
      explodeRandomGems(1, 1, 'color', BaseColor.Purple),
    ),
  },
  {
    id: 8680,
    desc: '对所有敌人造成 [魔法 + 1] 点伤害，伤害值因临界星而增强。 [x4]',
    build: skill(
      dmg('enemyAll', 1, 1, { range: 'all' }),
    ),
  },
  {
    id: 8696,
    desc: '爆破 3 颗宝石，再创造一颗许愿宝石。',
    build: skill(
      explodeRandomGems(3, 0, 'color', undefined),
    ),
  },
  {
    id: 8697,
    desc: '对一名敌人造成 [魔法 + 6] 点严重溅射伤害，伤害值因诅咒宝石数量而增强。若自身队伍里有暗黑铁匠迪恩扎，则创造 4 颗诅咒宝石。 [x4]',
    build: skill(
      dmgSplash('enemyChosen', 6, 1, { range: 'splash', modifier: { mod: { kind: 'multiplier', a: 4 }, source: { kind: 'enemyStatusCount', statusId: 'curse' } } }),
      createSpecialGems({ kind: 'curseGem' }, 4, 0, { ifCond: { kind: 'troopPresent', side: 'ally', name: '暗黑铁匠迪恩扎' } }),
    ),
  },
  {
    id: 8698,
    desc: '对首位和末位敌人造成 [魔法 + 8] 点伤害，每锻炼 1 个武器段位则 +4 点伤害值。赐福所有蓝色盟友并诅咒所有蓝色敌人。',
    build: skill(
      inflict('curse', 'enemyAll'),
    ),
  },
  {
    id: 8699,
    desc: '对首位和末位敌人造成 [魔法 + 8] 点伤害，每锻炼 1 个武器段位则 +4 点伤害值。赐福所有绿色盟友并诅咒所有绿色敌人。',
    build: skill(
      inflict('curse', 'enemyAll'),
    ),
  },
  {
    id: 8700,
    desc: '对首位和末位敌人造成 [魔法 + 8] 点伤害，每锻炼 1 个武器段位则 +4 点伤害值。赐福所有红色盟友并诅咒所有红色敌人。',
    build: skill(
      inflict('curse', 'enemyAll'),
    ),
  },
  {
    id: 8701,
    desc: '对首位和末位敌人造成 [魔法 + 8] 点伤害，每锻炼 1 个武器段位则 +4 点伤害值。赐福所有黄色盟友并诅咒所有黄色敌人。',
    build: skill(
      inflict('curse', 'enemyAll'),
    ),
  },
  {
    id: 8702,
    desc: '对首位和末位敌人造成 [(魔法 x 2) + 16] 点伤害，每锻炼 1 个武器段位则 +4 点伤害值。赐福所有紫色盟友并诅咒所有紫色敌人。',
    build: skill(
      inflict('curse', 'enemyAll'),
    ),
  },
  {
    id: 8703,
    desc: '对首位和末位敌人造成 [魔法 + 8] 点伤害，每锻炼 1 个武器段位则 +4 点伤害值。赐福所有棕色盟友并诅咒所有棕色敌人。',
    build: skill(
      inflict('curse', 'enemyAll'),
    ),
  },
  {
    id: 8706,
    desc: '爆破 [魔法 + 1] 颗绿色宝石。赋予所有哥布林盟友一个随机状态效果。再召唤一名哥布林军队。',
    build: skill(
      explodeRandomGems(1, 1, 'color', BaseColor.Green),
      inflictRandom('allyAll', { targetRace: 'Goblin' }),
    ),
  },
  {
    id: 8707,
    desc: '爆破 [魔法 + 1] 颗紫色宝石。赋予所有盖塔尔盟友一个随机正面增益效果。再召唤一名盖塔尔军队。',
    build: skill(
      explodeRandomGems(1, 1, 'color', BaseColor.Purple),
    ),
  },
  {
    id: 8708,
    desc: '爆破 [魔法 + 1] 颗棕色宝石。赋予所有建造盟友一个随机正面增益效果。再召唤一名建造军队。',
    build: skill(
      explodeRandomGems(1, 1, 'color', BaseColor.Brown),
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
    build: skill(
      createSpecialGems({ kind: 'bomb' }, 6, 0),
      dmg('enemyAll', 6, 1, { range: 'all' }),
    ),
  },
  {
    id: 8725,
    desc: '爆破 [魔法 + 1] 颗黄色宝石。赋予所有阿达纳盟友一个随机正面增益状态效果。再召唤一名阿达纳军队。',
    build: skill(
      explodeRandomGems(1, 1, 'color', BaseColor.Yellow),
    ),
  },
  {
    id: 8726,
    desc: '对最后一名敌人造成[魔法 + 4]点伤害，伤害力由蓝色宝石而增强。如果他们有末日，可造成双倍伤害。每个回火等级有3%的几率杀死敌人。 [1:1]',
    build: skill(
      dmg('enemyLast', 4, 1),
    ),
  },
  {
    id: 8727,
    desc: '对最后一名敌人造成[魔法 + 4]点伤害值，伤害值由绿色宝石而增强。如果他们有末日，造成双倍伤害。每个回火等级有 3% 的几率杀死敌人。 [1:1]',
    build: skill(
      dmg('enemyLast', 4, 1),
    ),
  },
  {
    id: 8728,
    desc: '对最后一名敌人造成[魔法 + 4]点伤害值，伤害值由红色宝石而增强。如果他们有末日，造成双倍伤害。每个回火等级有 3% 的几率杀死敌人。 [1:1]',
    build: skill(
      dmg('enemyLast', 4, 1),
    ),
  },
  {
    id: 8729,
    desc: '对最后一名敌人造成[魔法 + 4]点伤害值，伤害值由黄色宝石而增强。如果他们有末日，造成双倍伤害。每个回火等级有 3% 的几率杀死敌人。 [1:1]',
    build: skill(
      dmg('enemyLast', 4, 1),
    ),
  },
  {
    id: 8730,
    desc: '对最后一名敌人造成[魔法 + 4]点伤害值，伤害值由紫色宝石而增强。如果他们有末日，造成双倍伤害。每个回火等级有 3% 的几率杀死敌人。 [1:1]',
    build: skill(
      dmg('enemyLast', 4, 1),
    ),
  },
  {
    id: 8731,
    desc: '对最后一名敌人造成[魔法 + 4]点伤害值，伤害值由棕色宝石而增强。如果他们有末日，造成双倍伤害。每个回火等级有 3% 的几率杀死敌人。 [1:1]',
    build: skill(
      dmg('enemyLast', 4, 1),
    ),
  },
  {
    id: 8761,
    desc: '赋予自身屏障效果。再给予所有盟友 [魔法 + 4] 点护甲值，数量因燃烧宝石数而增强。若自身陷入燃烧状态，则获得一个额外回合。 [1:1]',
    build: skill(
      inflict('barrier', 'allyAll'),
    ),
  },
  {
    id: 8762,
    desc: '将所有向上或向下斜方宝石转换成燃烧宝石。造成 [魔法 + 8] 点散射伤害。',
    build: skill(
      dmg('enemyAll', 8, 1, { range: 'all' }),
    ),
  },
  {
    id: 8763,
    desc: '爆破 [魔法 + 1] 颗绿色宝石。赋予所有精灵盟友一个随机正面增益状态效果。再召唤一名精灵军队。',
    build: skill(
      explodeRandomGems(1, 1, 'color', BaseColor.Green),
      inflictRandom('allyAll', { targetRace: 'Elf' }),
    ),
  },
  {
    id: 8764,
    desc: '爆破 [魔法 + 1] 颗蓝色宝石。给予所有骑士盟友一个随机正面增益效果。再召唤一名骑士盟友。',
    build: skill(
      explodeRandomGems(1, 1, 'color', BaseColor.Blue),
      inflictRandom('allyAll', { targetRace: 'Knight' }),
    ),
  },
  {
    id: 8765,
    desc: '爆破 [魔法 + 1] 颗绿色宝石。给予所有潘神之谷盟友一个随机正面增益效果。再召唤一名潘神之谷盟友。',
    build: skill(
      explodeRandomGems(1, 1, 'color', BaseColor.Green),
    ),
  },
  {
    id: 8766,
    desc: '爆破 [魔法 + 1] 颗蓝色宝石。给予所有剑锋崖盟友一个随机正面增益效果。再召唤一名剑锋崖盟友。',
    build: skill(
      explodeRandomGems(1, 1, 'color', BaseColor.Blue),
    ),
  },
  {
    id: 8767,
    desc: '对一名敌人造成 [魔法 + 4] 点伤害，伤害值因紫色和不死族盟友数而增强。 [x3]',
    build: skill(
      dmg('enemyChosen', 4, 1, { modifier: { mod: { kind: 'multiplier', a: 3 }, source: { kind: 'alliesOfRace', race: 'Undead' } } }),
    ),
  },
  {
    id: 8768,
    desc: '给予所有盟友 [魔法 + 1] 点生命值。再将 3 颗蓝色宝石转换成善石像鬼宝石。获得一个额外的回合。',
    build: skill(
      heal('allyAll', 1, 1),
      extraTurn(),
    ),
  },
  {
    id: 8769,
    desc: '对一名敌人造成 [魔法 + 3] 点真实伤害，伤害值因石块数量而增强。再创建 4 颗石块。 [x2]',
    build: skill(
      trueDmg('enemyChosen', 3, 1, { trueDamage: true }),
    ),
  },
  {
    id: 8770,
    desc: '爆破 [魔法 + 1] 颗蓝色宝石。赋予所有巨人盟友一个随机正面增益效果。再召唤一名巨人军队。',
    build: skill(
      explodeRandomGems(1, 1, 'color', BaseColor.Blue),
      inflictRandom('allyAll', { targetRace: 'Giant' }),
    ),
  },
  {
    id: 8771,
    desc: '爆破[魔法 + 1]颗蓝色宝石。给予所有罗格盟友一个随机状态效果。然后召唤一支罗格部队。',
    build: skill(
      explodeRandomGems(1, 1, 'color', BaseColor.Blue),
    ),
  },
  {
    id: 8773,
    desc: '对一名敌人造成 [魔法 + 3] 点伤害。若自身队伍中有阿卡卢斯，则使自身获得法印效果。',
    build: skill(
      dmg('enemyChosen', 3, 1),
    ),
  },
  {
    id: 8774,
    desc: '造成 [魔法 + 7] 点散射伤害。若自身队伍中有泽菲罗斯，则爆破 5 颗宝石。 [x5]',
    build: skill(
      dmg('enemyAll', 7, 1, { range: 'all', modifier: { mod: { kind: 'multiplier', a: 5 } } }),
      explodeRandomGems(5, 0, 'color', undefined, { ifCond: { kind: 'troopPresent', side: 'ally', name: '泽菲罗斯' } }),
    ),
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
    ),
  },
  {
    id: 8777,
    desc: '赋予所有盟友 [魔法 + 1] 点生命值。若自身队伍中有鳞光，则获得一个额外回合。',
    build: skill(
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
    build: skill(
      destroyChosenCol(),
    ),
  },
  {
    id: 8806,
    desc: '爆破 1 颗宝石。创造 1 颗石像鬼宝石。每摧毁一颗石像鬼宝石，则再创造一颗 2。 [x2]',
    build: skill(
      explodeRandomGems(1, 0, 'color', undefined),
    ),
  },
  {
    id: 8807,
    desc: '移除所有棕色宝石。对一名敌人造成 [魔法 + 5] 点伤害，数值因移除的宝石数而增强。若敌人来自地狱悬崖或战斗位于地狱悬崖，则造成双倍伤害。 [3:1]',
    build: skill(
      destroyColor(BaseColor.Brown),
      dmg('enemyChosen', 5, 1, { modifier: { mod: { kind: 'ratio', a: 3, b: 1 }, source: { kind: 'destroyedGems' } } }),
    ),
  },
  {
    id: 8809,
    desc: '对一名敌人造成 [魔法 + 7] 点伤害，数值因地域悬崖盟友数而增强。每有一名地狱悬崖盟友，则创造 6 颗混合红色和棕色的宝石。 [x6]',
    build: skill(
      dmg('enemyChosen', 7, 1, { modifier: { mod: { kind: 'multiplier', a: 6 }, source: { kind: 'teamSize', side: 'ally' } } }),
    ),
  },
  {
    id: 8810,
    desc: '对一名敌人造成 [魔法 + 3] 点真实伤害，数值因石像鬼宝石数而增强。 [x6]',
    build: skill(
      trueDmg('enemyChosen', 3, 1, { trueDamage: true }),
    ),
  },
  {
    id: 8811,
    desc: '对一名敌人造成 [魔法 + 4] 点伤害，伤害值因棕色盟友和建造盟友数二增强。 [x5]',
    build: skill(
      dmg('enemyChosen', 4, 1),
    ),
  },
  {
    id: 8816,
    desc: '爆破 [魔法 + 1] 颗宝石。再召唤一名黑曜石深渊军队。',
    build: skill(
      explodeRandomGems(1, 1, 'color'),
    ),
  },
  {
    id: 8829,
    desc: '对一名敌人造成 [魔法 + 4] 点伤害。再将 8 颗黄色宝石转换成极度末日骷髅头。',
    build: skill(
      dmg('enemyChosen', 4, 1),
    ),
  },
  {
    id: 8843,
    desc: '创造 2 颗蓝色、绿色、红色、棕色龙族宝石，并获得一个额外回合。',
    build: skill(
      createGems(BaseColor.Red, 2, 0),
      extraTurn(),
    ),
  },
  {
    id: 8869,
    desc: '&& 给予所有盟友 [魔法 + 1] 点护甲值 &&给予所有其他盟友屏障效果',
    build: skill(
      armor('allyAll', 1, 1),
      inflict('barrier', 'allyOthers'),
    ),
  },
  {
    id: 8874,
    desc: '对所有敌人造成 [魔法 + 1] 点伤害。对所有敌人造成 陷入冻结和燃烧状态。再创造 3 颗蓝色巨人宝石和 3 颗红色巨人宝石。',
    build: skill(
      dmg('enemyAll', 1, 1, { range: 'all' }),
      createGems(BaseColor.Red, 3, 0),
    ),
  },
  {
    id: 8875,
    desc: '移除所有绿色宝石。对一名敌人造成 [魔法 + 5] 点伤害，伤害值因被移除的宝石数而增强。若敌人来自沃尔帕克，或战斗位于沃尔帕克，则造成双倍伤害。 [3:1]',
    build: skill(
      destroyColor(BaseColor.Green),
      dmg('enemyChosen', 5, 1, { modifier: { mod: { kind: 'ratio', a: 3, b: 1 }, source: { kind: 'destroyedGems' } } }),
    ),
  },
  {
    id: 8876,
    desc: '&& 将所有绿色宝石转换成一个选定颜色 && 爆破一颗宝石。创造 10 颗绿色宝石',
    build: skill(
      transform(BaseColor.Green, CHOSEN),
      explodeRandomGems(1, 0, 'color', undefined),
      createGems(BaseColor.Green, 10, 0),
    ),
  },
  {
    id: 8877,
    desc: '对一名敌人造成 [魔法 + 7] 点伤害，伤害只因沃尔帕克盟友数而增强。每有一名沃尔帕克盟友，则创造 6 颗混合蓝色和绿色的宝石。 [x6]',
    build: skill(
      dmg('enemyChosen', 7, 1),
    ),
  },
  {
    id: 8878,
    desc: '对一名敌人造成 [魔法 + 4] 点伤害，伤害值因绿色盟友和狼族盟友数而增强。 [x3]',
    build: skill(
      dmg('enemyChosen', 4, 1, { modifier: { mod: { kind: 'multiplier', a: 3 }, source: { kind: 'teamSize', side: 'ally' } } }),
    ),
  },
  {
    id: 8879,
    desc: '&& 对末位敌人造成 [魔法 + 3] 点伤害，并窃取 3 点魔法值 && 对末位敌人造成 [魔法 + 3] 点伤害，并窃取 6 点法力值',
    build: skill(
      steal('lastTarget', 'magic', 'magic', 3, 0),
    ),
  },
  {
    id: 8900,
    desc: '&& 选定敌人一个法力颜色，将所有此法力颜色的宝石转换成灵力宝石。&&对一名敌人造成 [魔法 + 2] 点伤害，伤害值因灵力宝石数而增强。  [x4]',
    build: skill(
      dmg('enemyChosen', 2, 1),
    ),
  },
  {
    id: 8905,
    desc: '爆破 [魔法 + 1] 颗紫色宝石。赋予所有迈纳杰之罪盟友一个随机正面增益状态效果。再召唤一名迈纳杰之罪军队。',
    build: skill(
      explodeRandomGems(1, 1, 'color', BaseColor.Purple),
    ),
  },
  {
    id: 8906,
    desc: '爆破 [魔法 + 1] 颗蓝色宝石。赋予所有人类盟友一个随机正面增益状态效果。再召唤一名人类军队。',
    build: skill(
      explodeRandomGems(1, 1, 'color', BaseColor.Blue),
      inflictRandom('allyAll', { targetRace: 'Human' }),
    ),
  },
  {
    id: 8907,
    desc: '爆破 [魔法 + 1] 颗绿色宝石。赋予所有蛮族盟友一个随机正面增益状态效果。再召唤一名蛮族军队。',
    build: skill(
      explodeRandomGems(1, 1, 'color', BaseColor.Green),
    ),
  },
  {
    id: 8908,
    desc: '对一名敌人造成 [魔法 + 4] 点伤害，伤害值因紫色盟友数和精灵盟友数而增强。 [x3]',
    build: skill(
      dmg('enemyChosen', 4, 1, { modifier: { mod: { kind: 'multiplier', a: 3 }, source: { kind: 'alliesOfRace', race: 'Elf' } } }),
    ),
  },
  {
    id: 8909,
    desc: '爆破 [魔法 + 1] 颗红色宝石。赋予所有兽人盟友一个随机正面增益效果。再召唤一名兽人军队。',
    build: skill(
      explodeRandomGems(1, 1, 'color', BaseColor.Red),
      inflictRandom('allyAll', { targetRace: 'Orc' }),
    ),
  },
  {
    id: 8910,
    desc: '爆破 [魔法 + 1] 颗棕色宝石。赋予所有矮人盟友一个随机正面增益效果。再召唤一名矮人军队。',
    build: skill(
      explodeRandomGems(1, 1, 'color', BaseColor.Brown),
      inflictRandom('allyAll', { targetRace: 'Dwarf' }),
    ),
  },
  {
    id: 8911,
    desc: '爆破 [魔法 + 1] 颗绿色宝石。赋予所有荆棘森林盟友一个随机正面增益效果。再召唤一名荆棘森林军队。',
    build: skill(
      explodeRandomGems(1, 1, 'color', BaseColor.Green),
    ),
  },
  {
    id: 8946,
    desc: '对一名敌人造成 [魔法 + 4] 点伤害，伤害值因陷入织网和中毒状态的敌人数而增强。再使他们陷入织网和中毒状态。 [x3]',
    build: skill(
      dmg('enemyChosen', 4, 1, { modifier: { mod: { kind: 'multiplier', a: 3 }, source: { kind: 'enemyStatusCount', statusId: 'poison' } } }),
    ),
  },
  {
    id: 8947,
    desc: '创建 6 颗织网宝石，并获得一个额外回合。',
    build: skill(
      extraTurn(),
    ),
  },
  {
    id: 8948,
    desc: '创造 6 颗红色宝石。再将所有红色宝石转换成灵力宝石。',
    build: skill(
      createGems(BaseColor.Red, 6, 0),
    ),
  },
  {
    id: 8951,
    desc: '&& 创建 8 颗灵力宝石，并获得一个额外回合 && 对一名随机敌人造成 [(魔法 x 2) + 3] 点真实伤害',
    build: skill(
      extraTurn(),
      trueDmg('enemyRandom', 3, 2, { trueDamage: true }),
    ),
  },
  {
    id: 8952,
    desc: '对一名敌人造成 [魔法 + 2] 点伤害。若对方陷入猎人标记状态，则窃取其 6 点生命值。',
    build: skill(
      dmg('enemyChosen', 2, 1),
    ),
  },
  {
    id: 8954,
    desc: '爆破 [魔法 + 1] 颗绿色宝石。赋予所有妖仙盟友一个随机正面增益效果。再召唤一名妖仙军队。',
    build: skill(
      explodeRandomGems(1, 1, 'color', BaseColor.Green),
      inflictRandom('allyAll', { targetRace: 'Fey' }),
    ),
  },
  {
    id: 8955,
    desc: '爆破 [魔法 + 1] 颗棕色宝石。赋予所有厄什卡亚盟友一个随机正面增益效果。再召唤一名厄什卡亚军队。',
    build: skill(
      explodeRandomGems(1, 1, 'color', BaseColor.Brown),
    ),
  },
  {
    id: 8956,
    desc: '爆破 [魔法 + 1] 颗紫色宝石。赋予所有龙族盟友一个随机正面增益效果。再召唤一名龙族军队。',
    build: skill(
      explodeRandomGems(1, 1, 'color', BaseColor.Purple),
      inflictRandom('allyAll', { targetRace: 'Dragon' }),
    ),
  },
  {
    id: 8971,
    desc: '为所有盟友提供 [魔法 + 5] 护甲。如果盟友来自白盔国，则为他们提供屏障。',
    build: skill(
      armor('allyAll', 5, 1),
    ),
  },
  {
    id: 8972,
    desc: '对敌人造成 [魔法 + 5] 点伤害，伤害值因天使宝石和具有屏障的盟友的数量而增强。 [x5]',
    build: skill(
      dmg('enemyChosen', 5, 1, { modifier: { mod: { kind: 'multiplier', a: 5 }, source: { kind: 'allyStatusCount', statusId: 'barrier' } } }),
    ),
  },
  {
    id: 8988,
    desc: '爆破一列。所选列每有一颗骷髅头或紫色宝石，则创造一个死亡标记宝石。 [1:1]',
    build: skill(
      destroyChosenCol(),
    ),
  },
  {
    id: 8989,
    desc: '给予所有盟友 2 点魔法值，每锻炼 1 个武器段位则 +1 魔法值。给予蓝色盟友 [魔法 + 2] 点护甲值。若敌人拥有一个劫数，则获得 10 点攻击力。',
    build: skill(
      magic('allyAll', 2, 0),
    ),
  },
  {
    id: 8990,
    desc: '给予所有盟友 2 点魔法值，每锻炼 1 个武器段位则 +1 魔法值。给予绿色盟友 [魔法 + 2] 点护甲值。若敌人拥有一个劫数，则获得 10 点攻击力。',
    build: skill(
      magic('allyAll', 2, 0),
    ),
  },
  {
    id: 8991,
    desc: '给予所有盟友 2 点魔法值，每锻炼 1 个武器段位则 +1 魔法值。给予红色盟友 [魔法 + 2] 点护甲值。若敌人拥有一个劫数，则获得 10 点攻击力。',
    build: skill(
      magic('allyAll', 2, 0),
    ),
  },
  {
    id: 8992,
    desc: '给予所有盟友 2 点魔法值，每锻炼 1 个武器段位则 +1 魔法值。给予黄色盟友 [魔法 + 2] 点护甲值。若敌人拥有一个劫数，则获得 10 点攻击力。',
    build: skill(
      magic('allyAll', 2, 0),
    ),
  },
  {
    id: 8993,
    desc: '给予所有盟友 2 点魔法值，每锻炼 1 个武器段位则 +1 魔法值。给予紫色盟友 [魔法 + 2] 点护甲值。若敌人拥有一个劫数，则获得 10 点攻击力。',
    build: skill(
      magic('allyAll', 2, 0),
    ),
  },
  {
    id: 8994,
    desc: '给予所有盟友 2 点魔法值，每锻炼 1 个武器段位则 +1 魔法值。给予棕色盟友 [魔法 + 2] 点护甲值。若敌人拥有一个劫数，则获得 10 点攻击力。',
    build: skill(
      magic('allyAll', 2, 0),
    ),
  },
  {
    id: 8995,
    desc: '爆破一颗宝石。给予所有盟友 [魔法 + 1] 点护甲值，数值因被摧毁的炸弹宝石数而增强。 [x2]',
    build: skill(
      explodeRandomGems(1, 0, 'color', undefined),
      armor('allyAll', 1, 1, { modifier: { mod: { kind: 'multiplier', a: 2 }, source: { kind: 'boardSpecial', gem: 'bomb' } } }),
    ),
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
    desc: '对一名敌人造成 [魔法 + 3] 点轻量溅射伤害。再创造 7 颗绿色宝石。',
    build: skill(
      createGems(BaseColor.Green, 7, 0),
    ),
  },
  {
    id: 9018,
    desc: '对一名敌人造成 [魔法 + 3] 点伤害，伤害值因赃物宝石数而增强。再爆破 4 颗宝石。 [x5]',
    build: skill(
      dmg('enemyChosen', 3, 1, { modifier: { mod: { kind: 'multiplier', a: 5 }, source: { kind: 'boardSpecial', gem: 'bootyGem' } } }),
    ),
  },
  {
    id: 9019,
    desc: '对一名敌人造成 [魔法 + 4] 点伤害，伤害值因红色盟友和龙族盟友数而增强。 [x3]',
    build: skill(
      dmg('enemyChosen', 4, 1, { modifier: { mod: { kind: 'multiplier', a: 3 }, source: { kind: 'alliesOfRace', race: 'Dragon' } } }),
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
    id: 9032,
    desc: '对所有敌人造成 [魔法 + 2] 点真实伤害。再创造 3 颗赃物宝石，并爆破 5 颗宝石。',
    build: skill(
      dmg('enemyAll', 2, 1, { range: 'all', trueDamage: true }),
      createSpecialGems({ kind: 'bootyGem' }, 3, 0),
    ),
  },
  {
    id: 9033,
    desc: '爆破 [魔法 + 1] 颗绿色宝石。赋予所有哥布林盟友一个随机状态效果。',
    build: skill(
      explodeRandomGems(1, 1, 'color', BaseColor.Green),
      inflictRandom('allyAll', { targetRace: 'Goblin' }),
    ),
  },
  {
    id: 9034,
    desc: '爆破 [魔法 + 1] 颗棕色宝石。赋予所有诺斯盟友一个随机正面增益状态效果。再召唤一名诺斯军队。',
    build: skill(
      explodeRandomGems(1, 1, 'color', BaseColor.Brown),
    ),
  },
  {
    id: 9035,
    desc: '爆破 [魔法 + 1] 颗红色宝石。赋予所有恶魔盟友一个随机正面增益状态效果。再召唤一名恶魔军队。',
    build: skill(
      explodeRandomGems(1, 1, 'color', BaseColor.Red),
      inflictRandom('allyAll', { targetRace: 'Daemon' }),
    ),
  },
  {
    id: 9036,
    desc: '爆破 [魔法 + 1] 颗蓝色宝石。赋予所有梅兰堤斯盟友一个随机正面增益效果。再召唤一名梅兰堤斯军队。',
    build: skill(
      explodeRandomGems(1, 1, 'color', BaseColor.Blue),
    ),
  },
  {
    id: 9037,
    desc: '对一名敌人造成 [魔法 + 4] 点伤害，数值因蓝色盟友数和骑士盟友数而增强。 [x3]',
    build: skill(
      dmg('enemyChosen', 4, 1, { modifier: { mod: { kind: 'multiplier', a: 3 }, source: { kind: 'alliesOfRace', race: 'Knight' } } }),
    ),
  },
  {
    id: 9110,
    desc: '创造 15 颗混合蓝色和骷髅头的宝石。有 25% 的几率获得一个额外回合，几率因陷入恐怖状态的敌人数而增强。 [x2]',
    build: skill(
      extraTurn({ chance: 0.25 }),
    ),
  },
  {
    id: 9111,
    desc: '移除所有棕色宝石。对一名敌人造成 [魔法 + 5] 点伤害，伤害值因被移除的宝石数而增强。若敌人来自午夜城市或战斗位于午夜城市，则伤害翻倍。 [3:1]',
    build: skill(
      destroyColor(BaseColor.Brown),
      dmg('enemyChosen', 5, 1, { modifier: { mod: { kind: 'ratio', a: 3, b: 1 }, source: { kind: 'destroyedGems' } } }),
    ),
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
    ),
  },
  {
    id: 9143,
    desc: '对一名敌人造成 [魔法 + 4] 点伤害，伤害值因绿色盟友和人马族盟友数而增强。 [x3]',
    build: skill(
      dmg('enemyChosen', 4, 1, { modifier: { mod: { kind: 'multiplier', a: 3 }, source: { kind: 'teamSize', side: 'ally' } } }),
    ),
  },
  {
    id: 9144,
    desc: '对首 2 位敌人造成 [魔法 + 3] 点伤害，伤害值因妖仙盟友数而增强。 [x3]',
    build: skill(
      dmg('enemyFirstN', 3, 1, { n: 2, modifier: { mod: { kind: 'multiplier', a: 3 }, source: { kind: 'alliesOfRace', race: 'Fey' } } }),
    ),
  },
  {
    id: 9145,
    desc: '爆破 [魔法 + 1] 颗绿色宝石。赋予所有蛛尔卡里盟友一个随机正面增益效果。再召唤一名蛛尔卡里军队。',
    build: skill(
      explodeRandomGems(1, 1, 'color', BaseColor.Green),
    ),
  },
  {
    id: 9146,
    desc: '对一名敌人造成 [魔法 + 4] 点伤害，伤害值因黄色盟友和鸟族盟友数而增强 。 [x3]',
    build: skill(
      dmg('enemyChosen', 4, 1, { modifier: { mod: { kind: 'multiplier', a: 3 }, source: { kind: 'teamSize', side: 'ally' } } }),
    ),
  },
  {
    id: 9158,
    desc: '对一名敌人造成 [魔法 + 3] 点伤害，伤害值因沙漏宝石数而增强。 [x8]',
    build: skill(
      dmg('enemyChosen', 3, 1, { modifier: { mod: { kind: 'multiplier', a: 8 }, source: { kind: 'boardSpecial', gem: 'hourglass' } } }),
    ),
  },
  {
    id: 9159,
    desc: '将所有红色宝石转换成诅咒宝石。再对一名敌人造成 [魔法 + 6] 点伤害。',
    build: skill(
      transformToSpecial(BaseColor.Red, 'curseGem'),
    ),
  },
  {
    id: 9161,
    desc: '将所有红色宝石转换成诅咒宝石，并将所有紫色宝石转换成末日骷髅头。打乱敌方队伍。',
    build: skill(
      transformToSpecial(BaseColor.Red, 'curseGem'),
      shuffleTeam('enemy'),
    ),
  },
  {
    id: 9162,
    desc: '对一名敌人造成 [魔法 + 4] 点伤害。再使其上方所有敌人陷入诅咒和恐怖状态。',
    build: skill(
      dmg('enemyChosen', 4, 1),
      inflict('curse', 'enemyAll'),
    ),
  },
  {
    id: 9167,
    desc: '创造 14 颗混合骷髅头和恐怖宝石。使一名敌人陷入叠加 3 的出血状态。',
    build: skill(
      inflict('bleed', 'enemyChosen'),
    ),
  },
  {
    id: 9203,
    desc: '爆破 [魔法 + 1] 颗棕色宝石。赋予所有巨人盟友一个随机正面增益效果。再召唤一个巨人军队。',
    build: skill(
      explodeRandomGems(1, 1, 'color', BaseColor.Brown),
      inflictRandom('allyAll', { targetRace: 'Giant' }),
    ),
  },
  {
    id: 9204,
    desc: '&& 创造 8 颗蓝色闪电宝石，并对一名敌人造成 [魔法 + 3] 点溅射伤害  && 创造 8 颗黄色闪电宝石，并对一名敌人造成 [魔法 + 3] 点溅射伤害',
    build: skill(
      createGems(BaseColor.Blue, 8, 0),
      dmgSplash('enemyChosen', 3, 1, { range: 'splash' }),
      createGems(BaseColor.Yellow, 8, 0),
      dmgSplash('enemyChosen', 3, 1, { range: 'splash' }),
    ),
  },
  {
    id: 9205,
    desc: '爆破 [魔法 + 1] 颗绿色宝石。赋予所有沃尔帕克盟友一个正面增益状态效果。再召唤一名沃尔帕克军队。',
    build: skill(
      explodeRandomGems(1, 1, 'color', BaseColor.Green),
    ),
  },
  {
    id: 9206,
    desc: '对一名敌人造成 [魔法 + 4] 点伤害，伤害值因棕色盟友和野兽盟友数而增强。 [x3]',
    build: skill(
      dmg('enemyChosen', 4, 1, { modifier: { mod: { kind: 'multiplier', a: 3 }, source: { kind: 'alliesOfRace', race: 'Beast' } } }),
    ),
  },
  {
    id: 9207,
    desc: '爆破 [魔法 + 1] 颗棕色宝石。赋予所有厄什卡盟友一个正面增益状态效果。再召唤一名厄什卡军队。',
    build: skill(
      explodeRandomGems(1, 1, 'color', BaseColor.Brown),
    ),
  },
  {
    id: 9208,
    desc: '爆破 [魔法 + 1] 颗蓝色宝石。赋予所有剑锋崖盟友一个正面增益状态效果。再召唤一名剑锋崖军队。',
    build: skill(
      explodeRandomGems(1, 1, 'color', BaseColor.Blue),
    ),
  },
  {
    id: 9209,
    desc: '对一名敌人造成 [魔法 + 4] 点伤害，伤害值因紫色盟友和狼族盟友数而增强。 [x3]',
    build: skill(
      dmg('enemyChosen', 4, 1, { modifier: { mod: { kind: 'multiplier', a: 3 }, source: { kind: 'teamSize', side: 'ally' } } }),
    ),
  },
  {
    id: 9210,
    desc: '爆破 [魔法 + 1] 颗棕色宝石。赋予所有怪兽盟友一个正面增益状态效果。再召唤一名怪兽军队。',
    build: skill(
      explodeRandomGems(1, 1, 'color', BaseColor.Brown),
    ),
  },
  {
    id: 9211,
    desc: '对首 2 位敌人造成 [魔法 + 5] 点伤害，每锻炼 1 个武器段位则 +2 点伤害值。每有一名蓝色盟友和敌人则创造 2 颗蓝色宝石。若敌方有劫数则获得一个随机正面增益状态效果。 [x2]',
    build: skill(
      dmg('enemyFirstN', 5, 1, { n: 2 }),
    ),
  },
  {
    id: 9212,
    desc: '对首 2 位敌人造成 [魔法 + 5] 点伤害，每锻炼 1 个武器段位则 +2 点伤害值。每有一名绿色盟友和敌人则创造 2 颗绿色宝石。若敌方有劫数则获得一个随机正面增益状态效果。 [x2]',
    build: skill(
      dmg('enemyFirstN', 5, 1, { n: 2 }),
    ),
  },
  {
    id: 9213,
    desc: '对首 2 位敌人造成 [魔法 + 5] 点伤害，每锻炼 1 个武器段位则 +2 点伤害值。每有一名红色盟友和敌人则创造 2 颗红色宝石。若敌方有劫数则获得一个随机正面增益状态效果。 [x2]',
    build: skill(
      dmg('enemyFirstN', 5, 1, { n: 2 }),
    ),
  },
  {
    id: 9214,
    desc: '对首 2 位敌人造成 [魔法 + 5] 点伤害，每锻炼 1 个武器段位则 +2 点伤害值。每有一名黄色盟友和敌人则创造 2 颗黄色宝石。若敌方有劫数则获得一个随机正面增益状态效果。 [x2]',
    build: skill(
      dmg('enemyFirstN', 5, 1, { n: 2 }),
    ),
  },
  {
    id: 9215,
    desc: '对首 2 位敌人造成 [魔法 + 5] 点伤害，每锻炼 1 个武器段位则 +2 点伤害值。每有一名紫色盟友和敌人则创造 2 颗紫色宝石。若敌方有劫数则获得一个随机正面增益状态效果。 [x2]',
    build: skill(
      dmg('enemyFirstN', 5, 1, { n: 2 }),
    ),
  },
  {
    id: 9216,
    desc: '对首 2 位敌人造成 [魔法 + 5] 点伤害，每锻炼 1 个武器段位则 +2 点伤害值。每有一名棕色盟友和敌人则创造 2 颗棕色宝石。若敌方有劫数则获得一个随机正面增益状态效果。 [x2]',
    build: skill(
      dmg('enemyFirstN', 5, 1, { n: 2 }),
    ),
  },
  {
    id: 9235,
    desc: '爆破 [魔法 + 1] 颗紫色宝石。赋予所有黑石盟友一个随机正面增益状态效果。再召唤一名黑石军队。',
    build: skill(
      explodeRandomGems(1, 1, 'color', BaseColor.Purple),
    ),
  },
  {
    id: 9261,
    desc: '对一名敌人造成 [魔法 + 3] 点伤害，伤害值因天使宝石数而增强。再创造 2 颗天使宝石。 [x5]',
    build: skill(
      dmg('enemyChosen', 3, 1),
    ),
  },
  {
    id: 9262,
    desc: '对一名敌人造成 [魔法 + 4] 点伤害，伤害值因紫色盟友和秘士盟友数而增强。 [x3]',
    build: skill(
      dmg('enemyChosen', 4, 1, { modifier: { mod: { kind: 'multiplier', a: 3 }, source: { kind: 'alliesOfRace', race: 'Mystic' } } }),
    ),
  },
  {
    id: 9264,
    desc: '爆破 [魔法 + 1] 颗蓝色宝石。赋予所有狮心帝国盟友一个随机正面增益状态效果。再召唤一名随机狮心帝国军队。',
    build: skill(
      explodeRandomGems(1, 1, 'color', BaseColor.Blue),
    ),
  },
  {
    id: 9265,
    desc: '对一名敌人造成 [魔法 + 4] 点伤害，伤害值因蓝色盟友和巨人盟友数而增强。 [x3]',
    build: skill(
      dmg('enemyChosen', 4, 1, { modifier: { mod: { kind: 'multiplier', a: 3 }, source: { kind: 'alliesOfRace', race: 'Giant' } } }),
    ),
  },
  {
    id: 9266,
    desc: '爆破 [魔法 + 1] 颗绿色宝石。使所有蛮族盟友获得一个随机正面增益效果。再召唤一名蛮族军队。',
    build: skill(
      explodeRandomGems(1, 1, 'color', BaseColor.Green),
    ),
  },
];

export const BATCH_W03: CuratedBatch = { batch: 'W03', spells: SPELLS, skipped: SKIPPED };
