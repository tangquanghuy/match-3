/**
 * 人工核对组装 · 批次 39（窗口 E · 逃跑+经济批回收批，池：batch-03/05/07/09/13/14/15/17/
 * 18/20/23/24/25/27/29/31/36 SKIPPED 回收——每条注明原批）
 *
 * 背景：2026-09-16 四项拍板（DECISIONS「四项拍板结果」）落地两块引擎能力：
 * - ③逃跑机制：escapeChance 效果段（「有 N% 的几率跑掉」= escape(N/100)）。
 *   判定成功 → 施法者标 fled、从编队 splice 移出（复用 defeat 移出管线但不置 defeated、
 *   不触发死亡召唤/阵亡响应）；全队逃光按败北结算。表现=卡面轻量退场。
 * - ①经济三币种：金币/灵魂/宝石战斗内计数（GameState.economy 共用池）+ gainGold/gainSouls/
 *   gainGems 效果段 + battleGold/battleSouls/battleGems 二次缩放来源 + 赃物宝石（Booty，
 *   摧毁→+10 金币，batch-39 首次用于技能创造）+ 结算上报 economy 字段
 *   + merchant/necromancy 族战后经济特质钩子。
 *
 * 语义裁定备注（本批新增口径，已同步写入 spell-rules §10 / SOP 词汇表）：
 * - 「有 30% 的几率跑掉」= escape(0.3)，恒作用于施法者本人（官方 GoW 语义：兵种自己逃出战斗），
 *   与段级 chance 的"整段概率"管线无关（escapeChance 不经 SegmentOptions，避免双重掷签）。
 * - 「窃取一名敌人 N 点生命值」未写转为何属性 → 同属性回填（batch-01 7141 口径）。
 * - 「获得 [魔法 + 1] 点护甲值和攻击力」= 一个方括号喂双段、modifier 挂最近数值段
 *   （batch-22 8481 口径）；「获得」无目标 → allySelf。
 * - 「数量因地精盟友而增强 [xN]」= alliesOfRace 'Goblin' multiplier（种族计数只数己方存活，SOP §二次缩放；
 *   「召唤一名随机哥布林」才需要名单，本批无此类条目）。
 * - 「伤害值由我的金币加成 [N:M]」= battleGold 来源 ratio（本批新原语；读战场经济池当前金币）。
 * - 「窃取 5 枚金币」= gainGold(5)（金币从（共用）经济池意义上获得，不减敌方的——官方为
 *   元经济句式，本作落战场经济入账）。
 * - 「战利品宝石」= 赃物宝石 Booty Gem 的另一译名（GEMS-SEMANTICS-2 译名表）；createSpecialGems
 *   { kind:'bootyGem' } 合法（不可匹配、被摧毁 +10 金币）。
 * - 「召唤一名随机野兽/龙族」= summonRandom(全兵种数据里该种族 referenceName 名单)
 *   （batch-20 GIANTS 同口径，名单由 SOP §6 查询命令生成）。
 */
import { skill, dmg, steal, armor, attack, createSkulls, createSpecialGems, explodeRandomGems,
  destroyRandomRows, destroyRandomCols, destroyColor, summonRandom, gainGold, escape, CHOSEN } from '../builders';
import type { CuratedBatch } from './index';


/** 全兵种数据 troopTypes 含 'Beast' 的 referenceName（SOP §6 查询命令生成） */
const BEASTS = [
  'Rhynax', 'Pegasus', 'Owlbear', 'SacredGuardian', 'BoarRider', 'BlackBeast', 'SabertoothLion',
  'GriffonKnight', 'Serpent', 'Warhound', 'Hippogryph', 'GiantSpider', 'DireWolf', 'Kerberos',
  'SpiderSwarm', 'Roc', 'Fenrir', 'Salamander', 'Hellhound', 'BunniNog', 'Jackelope', 'Yeti',
  'WinterWolf', 'SpiritFox', 'Hellcat', 'Moa', 'FireLizard', 'LionPrince', 'SandCobra',
  'Dragonmoth', 'WingedBison', 'ArmoredBoar', 'WarGoat', 'Sunsail', 'Warg', 'Frostling',
  'BoneScorpion', 'SnowyOwl', 'GiantToad', 'Werewolf', 'ForestGuardian', 'Wulfgarok', 'Minogor',
  'Unicorn', 'Penguin', 'Aurai', 'FrostLizard', 'Drake', 'QueenAurora', 'Parrot', 'Cocoon',
  'RiftLynx', 'Valraven', 'Falconer', 'Warhawk', 'Sunbird', 'DragonTurtle', 'Spinnerette',
  'GiantCrab', 'Hippocampus', 'Merlion', 'Zhenniao', 'CatSith', 'BatSwarm', 'Umberwolf',
  'Bulette', 'Hyena', 'Mammoth', 'OwlRider', 'Stone-Shaker', 'PharaohHound', 'TombSpider',
  'Willow', 'Gorbil', 'DireBoar', 'CuSith', 'Nightmare', 'MidgeSwarm', 'FestivalCow',
  'ArcticFox', 'Barghast', 'GriffStonefeather', 'Rhynaggor', 'TurtleCannon', 'Bunnicorn',
  'Nightwing', 'Plainsjumper', 'MoonRabbit', 'Qilin', 'VineMarten', 'WoodRhynax', 'SnowPanther',
  'UrskayanBlue', 'HornedAsp', 'Necrocorn', 'Glutmaw', 'CorpseMare', 'ROVER-300', 'Frostfeather',
  'Grimcorn', 'HarpyEagle', 'Droggo', 'Kryshound', 'WarWolf', 'GuardianOfTheFields', 'Amaru',
  'DireCub', 'Tutankhatmun', 'DandyLion', 'Crysturtle', 'Werebird', 'Werebear', 'Werecat',
  'BeastmasterTorbern', 'SirQuentinHadley', 'ChaosHound', 'P4-NTH4', 'MechaRat', 'Blightwing',
  'DynamiteGoat', 'Netherhound', 'SwampRat', 'Basilisk', 'WarElephant', 'Axolotl', 'Doombat',
  'DreadSteed', 'LordBelanor', 'Amarok', 'ArmoredBoarlet', 'DeepHuntsman', 'FlameOfAnu',
  'NightSpider', 'Kharybdis', 'Pan', 'CarrionCrow', 'SnowyOwlbear', 'Baihu', 'UlfsMascot',
  'Hatir&Skroll', 'HatirAscendant', 'SkrollReborn', 'Wereraven', 'Werebat', 'Wereverine',
  'TheWerestag', 'Devourer', 'IceOrca', 'Wererat', 'Swanmay', 'Wereshark', 'SkyScorpion',
  'AransiTheGuardian', 'NaturebornWolf', 'FirebornEagle', 'WaterbornOwl', 'StonebornLion',
  'MoonPhoenix', 'Leocorn', 'Catterfly', 'BrianTheClucky', 'Narwhale', 'SteelCobra', 'SkyGoat',
  'Shadowbeast', 'LavaScorpion', 'Kitsune', 'Crystalynx', 'Mechamare', 'LordArchimedus',
  'Mechweaver', 'Deathclaw', 'Tauraeus', 'EagleOwl', 'FloraFawn', 'CryptHound', 'FlameRhynax',
  'FireBeetle', 'StoneViper', 'Leio', 'Craghound', 'Anglerfin', 'BORK-3000', 'Scoprio',
  'HoundOfLiang', 'RedFox', 'Vulperus', 'Inari', 'Zhuque', 'Negasus', 'DeadParrot', 'AxeBeak',
  'Deathgaunt', 'FeyHound', 'SandCat', 'CobaltDrake', 'StonePanther', 'MantaRaider', 'SkellyCat',
  'Grimfeather', 'Werehound', 'RatSwarm', 'LeapingSpider', 'BoneHound', 'TheBestialFey', 'Egris',
  'Caribou', 'ArcaneSabercat', 'DeephornBeetle', 'Bloodfang', 'GiantBadger', 'Adelwing',
  'BrassDrake', 'UndeadLion', 'Valhawk', 'ManeCourser', 'Weresnake', 'FirebornLynx',
  'Amphib-o-Bot', 'MidwinterLycan', 'Mistlark', 'WargSpirit', 'Moonfeather', 'YetiCub',
  'DeepSpider', 'BlightHound', 'ShadowBeetle', 'DuskOwlbear', 'WingedDonkey', 'Foxglove',
  'Peregrine', 'LionOfYaoGuai', 'ImmortalScoprio', 'ZombieGoat', 'RottingSerpent', 'Treviamus',
  'Reavnarokkr', 'Yue-She', 'BloomManatee', 'FelineOfEnvy', 'Azaleus', 'Xuanwu', 'Scrollweaver',
  'ImmortalLeio', 'Cosmo', 'Dragonhawk', 'WEEZL-300', 'Rockraptor', 'CaravanCamel', 'Gindibu',
  'Yohaulticetl', 'Warmadillo', 'ToxicPuffer', 'Warfang', 'GriffonCaptain', 'PoisonedUrsidae',
  'CaveMole', 'ManedWolf', 'FrostSpider', 'CaveCrawler', 'RagingBull', 'Tetramorph',
];

/** 全兵种数据 troopTypes 含 'Dragon' 的 referenceName（SOP §6 查询命令生成） */
const DRAGONS = [
  'Sheggra', 'Venoxia', 'ShadowDragon', 'Emperina', 'Celestasia', 'BoneDragon', 'DrakeRider',
  'Dimetraxia', 'Wyvern', 'Venbarak', 'Borealis', 'DragonEggs', 'BabyDragon', 'Dragonette',
  'Dragotaur', 'Dragonmoth', 'Visk', 'TheDragonSoul', 'Couatl', 'Sylvanimora', 'DRACOS-1337',
  'DragonianRogue', 'DragonianMonk', 'SilverDrakon', 'Krystenax', 'Drake', 'Elemaugrim',
  'DragonTurtle', 'Asha', 'Leviathan', 'Penglong', 'Glitterclaw', 'TheWorldbreaker', 'Divinia',
  'LordEmber', 'LadyGarnetia', 'Tinseltail', 'Shimmerscale', 'Volthrenax', 'Thaumaris',
  'Droggo', 'Sylfrostenath', 'MatronDragotani', 'UndeadDrake', 'FellDragonEgg', 'FellDragon',
  'Nocturnia', 'Ishtara', 'DragonianSage', 'Obregonia', 'DragonSpirit', 'Essencia', 'Huanglong',
  'Veneratus', 'HornedWyrm', 'NetherWyrm', 'TerraWyrm', 'TheGreatWyrm', 'Tihamata', 'RedAhriman',
  'TwinkleBerry', 'MagmaDragon', 'Sabellius', 'Adakite', 'Obsidiaxas', 'Sapphirax', 'Emeraldrin',
  'Rubirath', 'Topasarth', 'Amethialas', 'Garnetaerlin', 'Diamantina', 'Aquaria',
  'TheElderDragon', 'HeraldOfKrystenax', 'TheGuardianDragon', 'CobaltDrake',
  'HuntmasterArborius', 'CrystalEggs', 'DragonstoneGuardian', 'TheVoidDragon', 'Comethalas',
  'Nebuladryx', 'Meteoridan', 'Solarithus', 'Lunarelleon', 'Eklipsos', 'Stellarix',
  'DraconicSentinel', 'Tianlong', 'BrassDrake', 'Venerabilax', 'Chromaticea', 'Kukulkan',
  'ImmortalAquaria', 'Leucithrax', 'TheSlimeDragon', 'Bahamata', 'Gingeraxia', 'Belcerulea',
  'Gladius', 'Thornaressa', 'Narcithus', 'Orrissea', 'Orchidius', 'Chrysantherax', 'Chargrimax',
  'Crackleleaf', 'Mistmother', 'DrakeEggs', 'ImmortalDrakkon', 'CrimsonWyrmling', 'Dragonhawk',
  'Amethony', 'Creteus', 'Krakynos', 'Runethius', 'Hematrax', 'Vizinium', 'Demizerius',
  'Amenhotrex', 'Pandemonia',
];

const SKIPPED: { id: number; reason: string }[] = [];

const SPELLS: CuratedBatch['spells'] = [
  // ───── 逃跑机制回收（原「跑掉无对应机制」条目；语义裁定见头注） ─────
  {
    id: 7751,
    desc: '窃取一名敌人 [魔法 + 2] 点生命值。有 30% 的几率跑掉。',
    build: skill(
      // 未写转为何属性 → 同属性回填（batch-01 7141 口径）；
      // 「一名敌人」= 指定单敌（SOP §0；2026-09-18 与 8196/8594/9736 同批校正，官方同族均 FromTarget）
      steal('enemyChosen', 'hp', 'hp', 2, 1),
      escape(0.3),
    ),
  },
  {
    id: 8196,
    desc: '窃取一名敌人 [魔法 + 2]  点护甲值。有 30%  的几率跑掉。',
    // 修正（2026-09-18 官方复核）：官方 StealArmor@FromTarget = 指定的敌人，非随机
    build: skill(
      steal('enemyChosen', 'armor', 'armor', 2, 1),
      escape(0.3),
    ),
  },
  {
    id: 7536,
    desc: '爆破 5 颗宝石。有 30% 的几率跑掉。',
    build: skill(
      explodeRandomGems(5, 0),
      escape(0.3),
    ),
  },
  {
    id: 7818,
    desc: '摧毁一行。有 30% 的几率跑掉。',
    build: skill(
      destroyRandomRows(1, 0),
      escape(0.3),
    ),
  },
  {
    id: 8010,
    desc: '移除所有选定颜色的宝石。有 30% 的几率跑掉。',
    build: skill(
      destroyColor(CHOSEN),
      escape(0.3),
    ),
  },
  {
    id: 8593,
    desc: '获得 [魔法 + 1] 点护甲值和攻击力，数量因地精盟友而增强。有 30% 的几率跑掉。 [x4]',
    build: skill(
      // 一个方括号喂双段；modifier 挂最近数值段（batch-22 8481 口径）
      armor('allySelf', 1, 1),
      attack('allySelf', 1, 1, { modifier: { mod: { kind: 'multiplier', a: 4 }, source: { kind: 'alliesOfRace', race: 'Goblin' } } }),
      escape(0.3),
    ),
  },
  {
    id: 8594,
    desc: '对一名敌人造成 [魔法 + 2] 点伤害，数量因地精盟友而增强。有 30% 的几率跑掉。 [x6]',
    // 修正（2026-09-18 官方复核）：官方 Damage@FromTarget = 指定的敌人，非随机
    build: skill(
      dmg('enemyChosen', 2, 1, { modifier: { mod: { kind: 'multiplier', a: 6 }, source: { kind: 'alliesOfRace', race: 'Goblin' } } }),
      escape(0.3),
    ),
  },
  {
    id: 9255,
    desc: '随机摧毁一列。有 30% 的几率跑掉。',
    build: skill(
      destroyRandomCols(1, 0),
      escape(0.3),
    ),
  },
  {
    id: 7750,
    desc: '召唤一名随机野兽。有 30% 的几率跑掉。',
    build: skill(
      summonRandom(BEASTS),
      escape(0.3),
    ),
  },
  {
    id: 8949,
    desc: '召唤一名随机龙族。有 30% 的几率跑掉。',
    build: skill(
      summonRandom(DRAGONS),
      escape(0.3),
    ),
  },
  {
    id: 8591,
    desc: '爆破 4 颗宝石，数量因地精盟友而增强。有 30% 的几率跑掉。 [x2]',
    build: skill(
      explodeRandomGems(4, 0, 'all', undefined, { modifier: { mod: { kind: 'multiplier', a: 2 }, source: { kind: 'alliesOfRace', race: 'Goblin' } } }),
      escape(0.3),
    ),
  },
  {
    id: 8592,
    desc: '创建 3 颗骷髅头，数量因地精盟友而增强。有 30% 的几率跑掉。 [x3]',
    build: skill(
      createSkulls(3, 0, { modifier: { mod: { kind: 'multiplier', a: 3 }, source: { kind: 'alliesOfRace', race: 'Goblin' } } }),
      escape(0.3),
    ),
  },
  {
    id: 8683,
    desc: '创建 6 颗诅咒宝石。有 20% 的几率跑掉。',
    build: skill(
      createSpecialGems({ kind: 'curseGem' }, 6, 0),
      escape(0.2),
    ),
  },

  // ───── 经济三币种回收（battleGold 来源 + gainGold + 赃物宝石创造） ─────
  {
    id: 9783,
    desc: '对随机一名敌人造成1点伤害，伤害值由我的金币加成。然后窃取5枚金币。 [10:1]',
    build: skill(
      dmg('enemyRandom', 1, 0, { modifier: { mod: { kind: 'ratio', a: 10, b: 1 }, source: { kind: 'battleGold' } } }),
      gainGold(5),
    ),
  },
  {
    id: 9736,
    desc: '对一名敌人造成[魔法 + 3]点伤害，伤害值因我的金币而增强。创造3颗战利品宝石。 [4:1]',
    // 修正（2026-09-18 官方复核）：官方 Damage@FromTarget = 指定的敌人，非随机
    build: skill(
      dmg('enemyChosen', 3, 1, { modifier: { mod: { kind: 'ratio', a: 4, b: 1 }, source: { kind: 'battleGold' } } }),
      // 「战利品宝石」= 赃物宝石 Booty Gem 译名（GEMS-SEMANTICS-2）；不可匹配、被摧毁 +10 金币
      createSpecialGems({ kind: 'bootyGem' }, 3, 0),
    ),
  },
];

export const BATCH_39: CuratedBatch = { batch: '39', spells: SPELLS, skipped: SKIPPED };
