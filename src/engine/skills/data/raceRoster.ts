/**
 * 种族 → 兵种 referenceName 名册（batch-r28 · 种族召唤通道的数据底座）。
 *
 * 背景：`summonRandomOfKingdom` 依赖 TurnEngine 注入的王国兵册解析器
 * （resolveKingdomSummonRefs），种族维度没有对应注入口——本表在**构建期**从
 * `src/data/troops.json` 静态提取（troopTypes 含该族的全部存活兵种
 * referenceName，与召唤引用白名单同一字段口径），技能子系统内自持，
 * 效果段直接把名册喂给 summonRandom 的 randomOf 池（种子化均匀掷选，
 * 官方语义 = 该族全兵册随机，参照王国召唤的「整册均匀」口径）。
 *
 * 再生成命令（troops.json 更新后重跑覆盖本文件）：
 *   node -e "const t=require('./src/data/troops.json');console.log(JSON.stringify(t.filter(x=>(x.troopTypes||[]).includes('Daemon')).map(x=>x.referenceName)))"
 *
 * 仅收录已被技能句式消费的种族（随回收批扩容）：Daemon（恶魔，
 * 「召唤一位随机恶魔」7435/8056、「转化成一名恶魔」8211 族）。
 */
export const RACE_SUMMON_REFS: Readonly<Record<string, readonly string[]>> = {
  Daemon: [
    'AncientHorror', 'SpiderQueen', 'Abhorath', 'Webspinner', 'Moloch', 'TheSilentOne', 'Gorgotha',
    'Kerberos', 'Cthyryzyx', 'Terraxis', 'Psion', 'Abynissia', 'Quasit', 'Hellhound', 'Succubus',
    'HeraldOfChaos', 'InfernalKing', 'Venbarak', 'War', 'Plague', 'Famine', 'Death', 'Marilith',
    'Hellcat', 'Creeper', 'KruargTheDread', 'Desdaemona', 'Warg', 'Incubus', 'DarkMonolith',
    'Myzmer', 'Elemaugrim', 'CorruptedUrska', 'BoneDaemon', 'Hellspawn', 'Spinnerette', 'Doomclaw',
    'YaoGuai', 'Erinyes', 'Tzathoth', 'Gargantaur', 'TomeOfEvil', 'Hellcackle', 'Glaycion',
    'Nightmare', 'SirMordayne', 'Umbraxis', 'ThePossessedKing', 'Sloth', 'Envy', 'Greed',
    'Gluttony', 'Barghast', 'Pride', 'Wrath', 'Lust', 'SibylOfLust', 'SoldierOfWrath',
    'WallOfTentacles', 'Bael', 'VashDagon', 'QueenOfSin', 'Glutmaw', 'Obsidius', 'Lamashtu',
    'PossessedUrska', 'BrokerOfGreed', 'EnvoyOfPride', 'MotherOfDarkness', 'GateOfSouls',
    'Lucifria', 'Blightwing', 'Deminaga', 'TheInfernalMachine', 'Ironjaw', 'Tartarus',
    'Netherhound', 'EldritchGuardian', 'FellDragonEgg', 'FellDragon', 'Nocturnia', 'HeraldOfWoe',
    'IndolatorOfSloth', 'ShadeOfKurandara', 'Kurandara', 'EnragedKurandara', 'DaemonGnome',
    'Mambasira', 'Arcturion', 'HeraldOfDamnation', 'Baphomet', 'TheScourgeOfHonor', 'DeepGolem',
    'NyarMel', 'HoundOfYaoGuai', 'MaidOfEnvy', 'TheArchduke', 'Lemure', 'Fury', 'Charonas',
    'JudgeOfTheDead', 'HellclawHunter', 'HellclawMage', 'HellclawWarrior', 'Indrajit',
    'HelgorTheGuardian', 'FlamingOni', 'Oneiros', 'RedAhriman', 'AbjectOfDespond', 'Despond',
    'BileBlackheart', 'AnimusOfEnvy', 'HornedHag', 'ConsortOfDarkness', 'EldritchMinion',
    'Uvhash-Ka', 'WarMachine', 'HellclawRager', 'HeraldOfBlight', 'HellstoneGate',
    'HeraldOfTorpor', 'Czernobog', 'Nabassu', 'Xenith', 'Tourmaline', 'Chalcedony', 'Petrahulk',
    'StoneMefyt', 'TheElderDragon', 'VrawkDaemon', 'EldritchDisciple', 'Voidcaller',
    'TheBaneOfMercy', 'EyeOfArges', 'InfernalVoyager', 'TheIronMaiden', 'TriTerror',
    'DaemonChild', 'TheVoidDragon', 'Tempurath', 'DaemonicSentinel', 'Hellborer', 'DarkHerald',
    'Groevanga', 'FellHydra', 'Isban', 'Goethite', 'SuccubusQueen', 'Bieska', 'HoundmasterGor',
    'BlightHound', 'Astaroth', 'DaeDrak', 'MelekTauss', 'DoomedGuardian', 'StingBat',
    'TheBaneOfValor', 'Redreaver', 'LionOfYaoGuai', 'Discordia', 'ImmortalAbaddon',
    'BlightedHusk', 'BaneOfAmbition', 'HellclawShadowpriest', 'Polymetis', 'DagoNath',
    'FelineOfEnvy', 'Skarn', 'MaidenOfPain', 'HeraldOfWar', 'Azbeel', 'OkraNosTheSleeper',
    'Voidjaw', 'ChampionOfRot', 'BloodSpore', 'InfernalTrickster', 'Seditius', 'ImmortalZephaar',
  ],
  Goblin: [
    'Goblin', 'GoblinShaman', 'BoarRider', 'GoblinKing', 'Hobgoblin', 'GoblinRocket', 'NobendBrothers',
    'SirSnothelm', 'Bugbear', 'PrincessFizzbang', 'QueenGrapplepot', 'Hellcackle', 'IceGoblin', 'HighKingIrongut',
    'KingGobtruffle', 'Stringfiddler', 'Toadsqueezer', 'Goblette', 'Rogueling', 'Smashedmouth', 'Kobold',
    'KoboldKnight', 'KoboldMagi', 'Emperinazara', 'Fundingus', 'WilliTheAnchor', 'FlamingOni', 'FaerieGobmother',
    'GoblinBomber', 'KoboldEmissary', 'PriestOfNilbog', 'FrostfireGoblin', 'Slughoarder', 'BombRider', 'CinderhandGoblin',
    'Murk,Lurk,AndDurk', 'Gloomhob', 'KoboldThief', 'GoblinPickpocket', 'MokTheCannon-Rider', 'Skulker', 'ZargsBoomPile',
    'CountGobula', 'LordGobthe', 'ImmortalTrogolin',
  ],
};
