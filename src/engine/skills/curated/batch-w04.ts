/**
 * 窗口 K-B · 武器法术批次 W04（池：scripts/curated-pools/pool-w01.json；分保真度绑定）。
 *
 * 来源：artifacts/gowhead-weapons/weapons.json（zh 文本逐字锚定，校验见
 * tests/unit/weaponSpellAudit.test.ts——与部队批次的 troops.json 锚定不同源）。
 * 保真度：本批全部为 full/partial（partial = 可编译子句照常入 build、卡点子句按
 * missingFeatures/skippedClauses 略去；mana-only 占位绑定不进批次，见
 * src/data/weapon-skill-meta.json）。组装规则锚定 scripts/spell-rules.md 与
 * 既有部队批次先例；生成器 scripts/_weapon_pools.mjs gen。
 */
import { CHOSEN, armor, attack, chooseSkill, cleanse, createGems, createGemsMixAny, createSkulls, createSpecialGems, destroyRandomCols, destroyRandomRows, dmg, dmgSplash, drainMana, explodeRandomGems, explodeRandomSpecialGems, explodeSpecialGems, extraTurn, heal, inflict, inflictRandom, mana, randomStat, reduce, reposition, scale, shuffleTeam, skill, summonRandom, transform, transformToSpecial, trueDmg } from '../builders';
import { BaseColor } from '../../types';
import type { SkillPrototype } from '../prototypes';
import type { CuratedBatch } from './index';
import { rawKingdomPool } from './gowKingdomPools';

const SKIPPED: { id: number; reason: string }[] = [];
/**
 * sa-C L5 (9825-9830 Doomed blades), native per hit: DecreaseArmor [AddIfEnemyHasDoom 1000] ->
 * Damage 3 +M [AddForTempering 2] -> Bleed [AddFor<Color>Target]; first on FromTarget, then on
 * RandomPrefNotPrevEnemy / FromPrevious. The random hit's armor break must precede its damage, so
 * with a Doom the random enemy is picked by the armor step (damage on lastTarget), otherwise by the damage.
 */
const TEMPERING_2 = { mod: { kind: 'multiplier', a: 2 }, source: { kind: 'tempering' } } as const;
const ENEMY_DOOM = { kind: 'targetHasDoom' } as const;
function doomedBlade(color: BaseColor): SkillPrototype {
  const bleed = { ifCond: { kind: 'targetColor', color } } as const;
  return skill(
    reduce('enemyChosen', 'armor', 0, 0, { drainAll: true, ifCond: ENEMY_DOOM }),
    dmg('enemyChosen', 3, 1, { modifier: TEMPERING_2 }),
    inflict('bleed', 'enemyChosen', bleed),
    reduce('enemyRandomPrefNotPrev', 'armor', 0, 0, { drainAll: true, ifCond: ENEMY_DOOM }),
    dmg('lastTarget', 3, 1, { modifier: TEMPERING_2, ifCond: ENEMY_DOOM }),
    dmg('enemyRandomPrefNotPrev', 3, 1, { modifier: TEMPERING_2, ifCond: { kind: 'not', cond: ENEMY_DOOM } }),
    inflict('bleed', 'lastTarget', bleed),
  );
}

const SPELLS: CuratedBatch['spells'] = [
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
      inflictRandom('allyAll', { targetKingdom: 3029, pool: 'positive' }),
      summonRandom(rawKingdomPool(3029), undefined) /* native SummoningKingdom 3029 (zh '蛛尔卡里' adds faction troops) */,
    ),
  },
  {
    id: 9146,
    desc: '对一名敌人造成 [魔法 + 4] 点伤害，伤害值因黄色盟友和鸟族盟友数而增强。 [x3]',
    build: skill(
      dmg('enemyChosen', 4, 1, { modifier: { mod: { kind: 'multiplier', a: 3 }, sources: [{ kind: 'alliesOfColor', color: BaseColor.Yellow }, { kind: 'alliesOfRace', race: 'Stryx' }] } }),
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
      dmg('enemyChosen', 6, 1),
    ),
  },
  {
    id: 9160,
    desc: '将所有紫色宝石转换成末日骷髅头。再对一名敌人造成 [魔法 + 6] 点伤害。',
    build: skill(
      transformToSpecial(BaseColor.Purple, 'doomSkull'),
      dmg('enemyChosen', 6, 1),
    ),
  },
  {
    id: 9161,
    desc: '将所有红色宝石转换成诅咒宝石，并将所有紫色宝石转换成末日骷髅头。打乱敌方队伍。',
    build: skill(
      // Native ConvertGems 100 Red>Cursed ; ConvertGems 100 Purple>Doomskull (sa-R2 L4b-1548-steps).
      transformToSpecial(BaseColor.Red, 'curseGem'),
      transformToSpecial(BaseColor.Purple, 'doomSkull'),
      shuffleTeam('enemy'),
    ),
  },
  {
    id: 9162,
    desc: '对一名敌人造成 [魔法 + 4] 点伤害。再使其上方所有敌人陷入诅咒和恐怖状态。',
    build: skill(
      dmg('enemyChosen', 4, 1),
      inflict('curse', 'enemyAboveTarget'),
      inflict('terror', 'enemyAboveTarget'),
    ),
  },
  {
    id: 9167,
    desc: '创造 14 颗混合骷髅头和恐怖宝石。使一名敌人陷入叠加 3 的出血状态。',
    build: skill(
      createGemsMixAny(['SKULL', { kind: 'terrorGem' }], 14, 0),
      inflict('bleed', 'enemyChosen', { stacks: 3 }),
    ),
  },
  {
    id: 9203,
    desc: '爆破 [魔法 + 1] 颗棕色宝石。赋予所有巨人盟友一个随机正面增益效果。再召唤一个巨人军队。',
    build: ({"segments":[{"kind":"gem","params":{"op":"clear","mode":"explode","target":{"kind":"randomGems","count":{"base":1,"mult":1},"include":"color","color":"Brown"}}},{"kind":"randomStatus","pool":"positive","target":"allyAll","targetRace":"Giant"},{"kind":"summon","params":{"source":{"randomOf":["Ogre","Ettin","StoneGiant","FrostGiant","Berserker","JarlFiremantle","Elf-Eater","Cyclops","Zephyros","Gob-Chomper","SeaTroll","DragonCruncher","RockTroll","DarkTroll","GogAndGud","JotnarStormshield","Ogryn","DesertTroll","ForestTroll","FireGiant","MonsterMuncher","FlameTroll","SkrymirTheLofty","HyndlaFrostcrown","IceTroll","Igneus","HalfgrimHalf-Giant","Sledgepaw","LavaTroll","Stone-Biter","CorruptTroll","Fomorian","FrostfireTroll","CrazedTroll","OgrakShaman","Bone-Biter","IllithianColossus","Smashedmouth","StormKnight","FlameMaiden","Kharybdis","Ogress","Baldr","VidarrTheVast","IcespireShaman","DarkForestTroll","TheOnyxGiant","TheSapphireGiant","TheEmeraldGiant","TheRubyGiant","TheAmethystGiant","TheTopazGiant","TheUmbralGiant","TheGraveGiant","Ogretaur","GiantSentinel","EarthGiant","Jordrin","Kolfrysti","Jarnvisa","GhostOgre","MazeCyclops","GrimbornBloodeye","HeldrTheGrave","Polymetis","SteamTroll","ScoriaGiant-born","VenomousTroll","LavaEttin","AbominableTroll","StormOracle","ToxAndSion","StormGuard","AsbjornTheMountain","ImmortalGirthrok"]}}}]} as SkillPrototype), // +ImmortalGirthrok (raw TroopType Giant; sa-E L1)
  },
  {
    id: 9204,
    desc: '选择一项：创造 8 颗蓝色闪电宝石，对一名敌人造成 [魔法 + 3] 点溅射伤害；或创造 8 颗黄色闪电宝石，对一名敌人造成 [魔法 + 3] 点溅射伤害。',
    build: skill(chooseSkill(['创造8颗蓝色闪电宝石，对一名敌人造成［魔法＋3］溅射伤害', '创造8颗黄色闪电宝石，对一名敌人造成［魔法＋3］溅射伤害'], [createSpecialGems({ kind: 'lightningRow' }, 8, 0), dmgSplash('enemyChosen', 3, 1)], [createSpecialGems({ kind: 'lightningCol' }, 8, 0), dmgSplash('enemyChosen', 3, 1)])),
  },
  {
    id: 9205,
    desc: '爆破 [魔法 + 1] 颗绿色宝石。赋予所有沃尔帕克盟友一个随机正面增益状态效果。再召唤一名沃尔帕克军队。',
    build: skill(
      explodeRandomGems(1, 1, 'color', BaseColor.Green),
      inflictRandom('allyAll', { targetKingdom: 3084, pool: 'positive' }),
      summonRandom(rawKingdomPool(3084), undefined) /* native SummoningKingdom 3084 (zh '沃尔帕克' adds faction troops) */,
    ),
  },
  {
    id: 9206,
    desc: '对一名敌人造成 [魔法 + 4] 点伤害，伤害值因棕色盟友和野兽盟友数而增强。 [x3]',
    build: skill(
      dmg('enemyChosen', 4, 1, { modifier: { mod: { kind: 'multiplier', a: 3 }, sources: [{ kind: 'alliesOfColor', color: BaseColor.Brown }, { kind: 'alliesOfRace', race: 'Beast' }] } }),
    ),
  },
  {
    id: 9207,
    desc: '爆破 [魔法 + 1] 颗棕色宝石。赋予所有厄什卡盟友一个随机正面增益状态效果。再召唤一名厄什卡军队。',
    build: skill(
      explodeRandomGems(1, 1, 'color', BaseColor.Brown),
      inflictRandom('allyAll', { targetRace: 'Urska', pool: 'positive' }),
      summonRandom(['Barbearius', 'UrskaWanderer', 'Urskatyr', 'CorruptedUrska', 'KingMikhail', 'UrskaSavage', 'Doomclaw', 'XiongMao', 'PandaskaGuard', 'CrimsonArrow', 'UrskaDragoon', 'Urskula', 'UrskaDruid', 'Berengari', 'PossessedUrska', 'BlackBjörn', 'Defiance', 'Lyrasza', 'PandaskaMage', 'PrinceBarislav', 'Ursuvius', 'SpiritOfRage', 'IronVlasta', 'Ursky', 'Pandazerker', 'Theodorevich', 'Pandallista', 'ShejiShi', 'Bearlock', 'Bieska', 'Emberclaw', 'SkeletalUrska', 'IvarLongclaw', 'VelesStormborn', 'PossessedTeddy', 'PoisonedUrsidae', 'RangerEvgeniy'], undefined),
    ),
  },
  {
    id: 9208,
    desc: '爆破 [魔法 + 1] 颗蓝色宝石。赋予所有剑锋崖盟友一个随机正面增益状态效果。再召唤一名剑锋崖军队。',
    build: skill(
      explodeRandomGems(1, 1, 'color', BaseColor.Blue),
      inflictRandom('allyAll', { targetKingdom: 3006, pool: 'positive' }),
      summonRandom(rawKingdomPool(3006), undefined) /* native SummoningKingdom 3006 (zh '剑锋崖' adds faction troops) */,
    ),
  },
  {
    id: 9209,
    desc: '对一名敌人造成 [魔法 + 4] 点伤害，伤害值因紫色盟友和狐人盟友数而增强。 [x3]',
    build: skill(
      dmg('enemyChosen', 4, 1, { modifier: { mod: { kind: 'multiplier', a: 3 }, sources: [{ kind: 'alliesOfColor', color: BaseColor.Purple }, { kind: 'alliesOfRace', race: 'Wargare' }] } }),
    ),
  },
  {
    id: 9210,
    desc: '爆破 [魔法 + 1] 颗棕色宝石。赋予所有怪兽盟友一个随机正面增益状态效果。再召唤一名怪兽军队。',
    build: skill(
      explodeRandomGems(1, 1, 'color', BaseColor.Brown),
      inflictRandom('allyAll', { targetRace: 'Monster', pool: 'positive' }),
      summonRandom(['Golem', 'NightTerror', 'MistStalker', 'Owlbear', 'WarSphinx', 'Chimera', 'Behemoth', 'CrimsonBat', 'RockWorm', 'Cockatrice', 'Gorgon', 'Hydra', 'Swamplash', 'Watcher', 'TheGreatMaw', 'SandShark', 'GreenSlime', 'MarshRaptor', 'AnubiteWarrior', 'SettiteWarrior', 'Creeper', 'Manticore', 'EmperorKhorvash', 'KruargTheDread', 'Kraken', 'Mimic', 'GiantToadstool', 'Werewolf', 'Villager', 'BastitePriestess', 'DesertMantis', 'Bogstrider', 'Chupacabra', 'Peryton', 'Myzmer', 'Troglodyte', 'Scavenger', 'Lamprey', 'Mosasaurus', 'Scylla', 'Bulette', 'Scorpius', 'SandScuttler', 'ArachnaeanWeaver', 'IceWorm', 'Glaycion', 'Megavore', 'Pyggra', 'GelatinousCube', 'WatchMother', 'OcularenLeech', 'Ocularen', 'Xerodar', 'Hammerclaw', 'Sandrunner', 'Sharptooth', 'Apophisis', 'Mervorax', 'ChiefDargon', 'Arachnataur', 'Ridgeback', 'Scarabi', 'CrabMan', 'TheWendigo', 'Krampus', 'Dementicore', 'Trihorn', 'TyranAndRex', 'Lasher', 'BlindGuardian', 'Basilisk', 'ManticoreCub', 'ManticoreProtector', 'Doombat', 'MindEater', 'IllithianColossus', 'IllithianServitor', 'HiveMind', 'DesertWorm', 'Ankhnum', 'SnowyOwlbear', 'Pyrohydra', 'Bahir', 'RockSquid', 'Cloakmantle', 'OchreJelly', 'Shoggorath', 'Wereraven', 'Werebat', 'Wereverine', 'TheWerestag', 'Nagatrap', 'Wererat', 'Wereshark', 'Kelpie', 'Sluagh', 'TheFleshHorror', 'VoidWisp', 'Centuragon', 'SulfurSlime', 'HoardMimic', 'LordArchimedus', 'BurningOcularen', 'Medusa', 'ChromiteSphinx', 'ClamLasher', 'LavaWorm', 'Stoneshell', 'SeaScavenger', 'Vulperus', 'Cantur', 'Geryon', 'Grimfeather', 'DeathTrapMimic', 'VoidManticore', 'Eyestalker', 'Hornwing', 'MonstrousSentinel', 'Bloodfang', 'Gynosphinx', 'TawaritePriestess', 'FellHydra', 'CrystalIntellect', 'Ghulemoth', 'Necroshale', 'CryptWorm', 'ShadowBeetle', 'DuskOwlbear', 'BlackOoze', 'OcularenEgg', 'TheCragMaw', 'TheSlimeDragon', 'Mantichoras', 'Gormungandr', 'HorusiteChampion', 'SekhitePriestess', 'DesertOx', 'ForsakenGuardian', 'Voidjaw', 'GloomOcularen', 'GraveWorm', 'ImmortalMaratus', 'TwistedHag', 'SirGeoffreyTheFallen', 'CorruptedCycad', 'CaveMole', 'CannonMimic', 'CaveCrawler'], undefined),
    ),
  },
  {
    id: 9211,
    desc: '对首 2 位敌人造成 [魔法 + 5] 点伤害，每锻炼 1 个武器段位则 +2 点伤害值。每有一名蓝色盟友和敌人则创造 2 颗蓝色宝石。若敌方有劫数则获得一个随机正面增益状态效果。 [x2]',
    build: skill(
      dmg('enemyFirstN', 5, 1, { n: 2, modifier: { mod: { kind: 'multiplier', a: 2 }, source: { kind: 'tempering' } } }),
      createGems(BaseColor.Blue, 0, 0, { modifier: { mod: { kind: 'multiplier', a: 2 }, sources: [{ kind: 'alliesOfColor', color: BaseColor.Blue, atCastStart: true }, { kind: 'enemiesOfColor', color: BaseColor.Blue, atCastStart: true }] } }),
      inflictRandom('allySelf', { pool: 'positive', ifCond: { kind: 'targetHasDoom' } }),
    ),
  },
  {
    id: 9212,
    desc: '对首 2 位敌人造成 [魔法 + 5] 点伤害，每锻炼 1 个武器段位则 +2 点伤害值。每有一名绿色盟友和敌人则创造 2 颗绿色宝石。若敌方有劫数则获得一个随机正面增益状态效果。 [x2]',
    build: skill(
      dmg('enemyFirstN', 5, 1, { n: 2, modifier: { mod: { kind: 'multiplier', a: 2 }, source: { kind: 'tempering' } } }),
      createGems(BaseColor.Green, 0, 0, { modifier: { mod: { kind: 'multiplier', a: 2 }, sources: [{ kind: 'alliesOfColor', color: BaseColor.Green, atCastStart: true }, { kind: 'enemiesOfColor', color: BaseColor.Green, atCastStart: true }] } }),
      inflictRandom('allySelf', { pool: 'positive', ifCond: { kind: 'targetHasDoom' } }),
    ),
  },
  {
    id: 9213,
    desc: '对首 2 位敌人造成 [魔法 + 5] 点伤害，每锻炼 1 个武器段位则 +2 点伤害值。每有一名红色盟友和敌人则创造 2 颗红色宝石。若敌方有劫数则获得一个随机正面增益状态效果。 [x2]',
    build: skill(
      dmg('enemyFirstN', 5, 1, { n: 2, modifier: { mod: { kind: 'multiplier', a: 2 }, source: { kind: 'tempering' } } }),
      createGems(BaseColor.Red, 0, 0, { modifier: { mod: { kind: 'multiplier', a: 2 }, sources: [{ kind: 'alliesOfColor', color: BaseColor.Red, atCastStart: true }, { kind: 'enemiesOfColor', color: BaseColor.Red, atCastStart: true }] } }),
      inflictRandom('allySelf', { pool: 'positive', ifCond: { kind: 'targetHasDoom' } }),
    ),
  },
  {
    id: 9214,
    desc: '对首 2 位敌人造成 [魔法 + 5] 点伤害，每锻炼 1 个武器段位则 +2 点伤害值。每有一名黄色盟友和敌人则创造 2 颗黄色宝石。若敌方有劫数则获得一个随机正面增益状态效果。 [x2]',
    build: skill(
      dmg('enemyFirstN', 5, 1, { n: 2, modifier: { mod: { kind: 'multiplier', a: 2 }, source: { kind: 'tempering' } } }),
      createGems(BaseColor.Yellow, 0, 0, { modifier: { mod: { kind: 'multiplier', a: 2 }, sources: [{ kind: 'alliesOfColor', color: BaseColor.Yellow, atCastStart: true }, { kind: 'enemiesOfColor', color: BaseColor.Yellow, atCastStart: true }] } }),
      inflictRandom('allySelf', { pool: 'positive', ifCond: { kind: 'targetHasDoom' } }),
    ),
  },
  {
    id: 9215,
    desc: '对首 2 位敌人造成 [魔法 + 5] 点伤害，每锻炼 1 个武器段位则 +2 点伤害值。每有一名紫色盟友和敌人则创造 2 颗紫色宝石。若敌方有劫数则获得一个随机正面增益状态效果。 [x2]',
    build: skill(
      dmg('enemyFirstN', 5, 1, { n: 2, modifier: { mod: { kind: 'multiplier', a: 2 }, source: { kind: 'tempering' } } }),
      createGems(BaseColor.Purple, 0, 0, { modifier: { mod: { kind: 'multiplier', a: 2 }, sources: [{ kind: 'alliesOfColor', color: BaseColor.Purple, atCastStart: true }, { kind: 'enemiesOfColor', color: BaseColor.Purple, atCastStart: true }] } }),
      inflictRandom('allySelf', { pool: 'positive', ifCond: { kind: 'targetHasDoom' } }),
    ),
  },
  {
    id: 9216,
    desc: '对首 2 位敌人造成 [魔法 + 5] 点伤害，每锻炼 1 个武器段位则 +2 点伤害值。每有一名棕色盟友和敌人则创造 2 颗棕色宝石。若敌方有劫数则获得一个随机正面增益状态效果。 [x2]',
    build: skill(
      dmg('enemyFirstN', 5, 1, { n: 2, modifier: { mod: { kind: 'multiplier', a: 2 }, source: { kind: 'tempering' } } }),
      createGems(BaseColor.Brown, 0, 0, { modifier: { mod: { kind: 'multiplier', a: 2 }, sources: [{ kind: 'alliesOfColor', color: BaseColor.Brown, atCastStart: true }, { kind: 'enemiesOfColor', color: BaseColor.Brown, atCastStart: true }] } }),
      inflictRandom('allySelf', { pool: 'positive', ifCond: { kind: 'targetHasDoom' } }),
    ),
  },
  {
    id: 9235,
    desc: '爆破 [魔法 + 1] 颗紫色宝石。赋予所有黑石盟友一个随机正面增益状态效果。再召唤一名黑石军队。',
    build: skill(
      explodeRandomGems(1, 1, 'color', BaseColor.Purple),
      inflictRandom('allyAll', { targetKingdom: 3022, pool: 'positive' }),
      summonRandom(rawKingdomPool(3022), undefined) /* native SummoningKingdom 3022 (zh '黑石' adds faction troops) */,
    ),
  },
  {
    id: 9261,
    desc: '对一名敌人造成 [魔法 + 3] 点伤害，伤害值因天使宝石数而增强。再创造 2 颗天使宝石。 [x5]',
    build: skill(
      dmg('enemyChosen', 3, 1, { modifier: { mod: { kind: 'multiplier', a: 5 }, source: { kind: 'boardSpecial', gem: 'angelGem' } } }),
      createSpecialGems({ kind: 'angelGem' }, 2, 0),
    ),
  },
  {
    id: 9262,
    desc: '对一名敌人造成 [魔法 + 4] 点伤害，伤害值因紫色盟友和秘士盟友数而增强。 [x3]',
    build: skill(
      // 英文写「紫色盟友」，原生第 0 步为 CountGems Purple（R001：以原生步骤为准）→ 紫色宝石 + 秘士盟友
      dmg('enemyChosen', 4, 1, { modifier: { mod: { kind: 'multiplier', a: 3 }, sources: [{ kind: 'boardGems', color: BaseColor.Purple }, { kind: 'alliesOfRace', race: 'Mystic' }] } }),
    ),
  },
  {
    id: 9263,
    desc: '对首位 2 名敌人造成 [魔法 + 3] 点伤害，伤害值因恶魔盟友数而增强。 [x3]',
    build: skill(
      dmg('enemyFirstN', 3, 1, { n: 2, modifier: { mod: { kind: 'multiplier', a: 3 }, source: { kind: 'alliesOfRace', race: 'Daemon' } } }),
    ),
  },
  {
    id: 9264,
    desc: '爆破 [魔法 + 1] 颗蓝色宝石。赋予所有狮心帝国盟友一个随机正面增益状态效果。再召唤一名随机狮心帝国军队。',
    build: skill(
      explodeRandomGems(1, 1, 'color', BaseColor.Blue),
      inflictRandom('allyAll', { targetKingdom: 3025, pool: 'positive' }),
      summonRandom(rawKingdomPool(3025), undefined) /* native SummoningKingdom 3025 (zh '狮心帝国' adds faction troops) */,
    ),
  },
  {
    id: 9265,
    desc: '对一名敌人造成 [魔法 + 4] 点伤害，伤害值因蓝色盟友和巨人盟友数而增强。 [x3]',
    build: skill(
      dmg('enemyChosen', 4, 1, { modifier: { mod: { kind: 'multiplier', a: 3 }, sources: [{ kind: 'alliesOfColor', color: BaseColor.Blue }, { kind: 'alliesOfRace', race: 'Giant' }] } }),
    ),
  },
  {
    id: 9266,
    desc: '爆破 [魔法 + 1] 颗绿色宝石。使所有蛮族盟友获得一个随机正面增益效果。再召唤一名蛮族军队。',
    build: skill(
      explodeRandomGems(1, 1, 'color', BaseColor.Green),
      inflictRandom('allyAll', { targetRace: 'Wildfolk', pool: 'positive' }),
      summonRandom(['Satyr', 'BladeDancer', 'Sylvasi', 'Ragnagord', 'Faunessa', 'BunniNog', 'SatyrMusician', 'Tuskar', 'DesertMantis', 'Tezca', 'Nax', 'KingSilenus', 'MonkeyDisciple', 'TheWildQueen', 'Senita', 'Saguaro', 'Agave', 'Piper', 'Caprinicus', 'TianYi', 'Trickster', 'Bunnicorn', 'LapinaKnight', 'Luna', 'Rattigar', 'PlagueRat', 'HexRat', 'Sledgepaw', 'QuickpawJack', 'LapinaExplorer', 'Starflower', 'SatyrHunter', 'Rubitressa', 'BeetleBlade', 'MothMage', 'ScarabKnight', 'QueenBeetrix', 'Tuskor', 'SileniGuard', 'Argos', 'Pan', 'Rhinotaur', 'TheScourgeOfHonor', 'PoxHare', 'TheBurrowWarden', 'TheWildKing', 'LapinaHealer', 'VoicelessGolem', 'RattigarCutpurse', 'Mumakus', 'Tuzi', 'Beltane', 'Aravatar', 'FallenSatyr', 'AravatarsTusk', 'MantisMage', 'SatyrTrickster', 'Caprichor', 'DeephornBeetle', 'Badgerkin', 'DoeStoneshatter', 'ImmortalTerra', 'ImmortalCaprichor', 'LapinaLancer', 'Sonata', 'LapinaCharlatan', 'Ariosa', 'LapinaPirate', 'Lapitaur', 'RattigarGladiator'], undefined),
    ),
  },
  {
    id: 9267,
    desc: '爆破 [魔法 + 1] 颗黄色宝石。使所有白盔国盟友获得一个随机正面增益效果。再召唤一名白盔国军队。',
    build: skill(
      explodeRandomGems(1, 1, 'color', BaseColor.Yellow),
      inflictRandom('allyAll', { targetKingdom: 3014, pool: 'positive' }),
      summonRandom(rawKingdomPool(3014), undefined) /* native SummoningKingdom 3014 (zh '白盔国' adds faction troops) */,
    ),
  },
  {
    id: 9300,
    desc: '创造 16 颗混合鬼魂宝石和冻结宝石。再爆破一颗宝石。',
    build: ({"segments":[{"kind":"gem","params":{"op":"create","gem":{"kind":"mixAny","entries":[{"kind":"ghost"},{"kind":"freezeGem"}]},"count":{"base":16,"mult":0}}},{"kind":"gem","params":{"op":"clear","mode":"explode","target":{"kind":"randomGems","count":{"base":1,"mult":0},"include":"all"}}}]} as SkillPrototype),
  },
  {
    id: 9301,
    desc: '爆破 [魔法 + 1] 颗红色宝石。给予所有猫族盟友一个随机正面增益状态效果。再召唤一名猫族军队。',
    build: skill(
      explodeRandomGems(1, 1, 'color', BaseColor.Red),
      inflictRandom('allyAll', { targetRace: 'Raksha', pool: 'positive' }),
      summonRandom(['PrideHunter', 'RexWarrior', 'Tau', 'Shadow-Hunter', 'Rakshanin', 'PrideGuard', 'JaguarWarrior', 'Sekhma', 'Snow-Hunter', 'ClawDancer', 'Spiritmane', 'Ubastet', 'TigrakiWarrior', 'RakshaFree-Blood', 'KartekTheClimber', 'Half-Mane', 'CatBurglar', 'Spell-Paw', 'Night-Slayer', 'Umenath', 'Cunning', 'SecondClawAnhur', 'HellclawHunter', 'HellclawMage', 'HellclawWarrior', 'Indrajit', 'Troubadour', 'HellclawRager', 'Leio', 'RakshaSwabbie', 'CaptainSaltclaw', 'FirstClawMaahes', 'CattauriWarrior', 'TheCattauriKing', 'LionCommander', 'Shadowhisker', 'HellclawShadowpriest', 'Pridestalker', 'BlackmaneMontu', 'DenwenTheWanderer', 'AqenBloodclaw', 'RakshaUrchin', 'ImmortalKhaomani', 'Onouris'], undefined),
    ),
  },
  {
    id: 9302,
    desc: '对首 2 名敌人造成 [魔法 + 3] 点伤害，伤害值因玉银林地盟友数而增强。 [x3]',
    build: ({"segments":[{"kind":"damage","target":"enemyFirstN","scaling":{"base":3,"mult":1},"n":2,"modifier":{"mod":{"kind":"multiplier","a":3},"source":{"kind":"alliesOfKingdom","kingdom":3009}}}]} as SkillPrototype),
  },
  {
    id: 9303,
    desc: '对一名敌人造成 [魔法 + 4] 点伤害，伤害值因红色和元素盟友数而增强。 [x3]',
    build: skill(
      dmg('enemyChosen', 4, 1, { modifier: { mod: { kind: 'multiplier', a: 3 }, sources: [{ kind: 'alliesOfColor', color: BaseColor.Red }, { kind: 'alliesOfRace', race: 'Elemental' }] } }),
    ),
  },
  {
    id: 9304,
    desc: '对首 2 名敌人造成 [魔法 + 3] 点伤害，伤害值因怪兽盟友数而增强。 [x3]',
    build: skill(
      dmg('enemyFirstN', 3, 1, { n: 2, modifier: { mod: { kind: 'multiplier', a: 3 }, source: { kind: 'alliesOfRace', race: 'Monster' } } }),
    ),
  },
  {
    id: 9305,
    desc: '爆破 [魔法 + 1] 颗蓝色宝石。赋予所有冰峰之巅盟友一个随机正面增益状态效果。再召唤一名冰峰之巅军队。',
    build: skill(
      explodeRandomGems(1, 1, 'color', BaseColor.Blue),
      inflictRandom('allyAll', { targetKingdom: 3011, pool: 'positive' }),
      summonRandom(rawKingdomPool(3011), undefined) /* native SummoningKingdom 3011 (zh '冰峰之巅' adds faction troops) */,
    ),
  },
  {
    id: 9306,
    desc: '对一名敌人造成 [魔法 + 4] 点伤害，伤害值因蓝色和不死族盟友数量而增强。 [x3]',
    build: skill(
      dmg('enemyChosen', 4, 1, { modifier: { mod: { kind: 'multiplier', a: 3 }, sources: [{ kind: 'alliesOfColor', color: BaseColor.Blue }, { kind: 'alliesOfRace', race: 'Undead' }] } }),
    ),
  },
  {
    id: 9307,
    desc: '对一名敌人造成 [魔法 + 4] 点伤害，伤害值因棕色盟友和纳迦盟友数而增强。 [x3]',
    build: skill(
      dmg('enemyChosen', 4, 1, { modifier: { mod: { kind: 'multiplier', a: 3 }, sources: [{ kind: 'alliesOfColor', color: BaseColor.Brown }, { kind: 'alliesOfRace', race: 'Naga' }] } }),
    ),
  },
  {
    id: 9349,
    desc: '造成 [魔法 + 8] 点散射伤害，伤害值因缠绕宝石数而增强。再创造 8 颗缠绕宝石。 [x8]',
    build: skill(
      // Native CountGems 800 Entangle: Entangle Gems on the board, not Entangled enemies.
      dmg('enemyAll', 8, 1, { range: 'all', modifier: { mod: { kind: 'multiplier', a: 8 }, source: { kind: 'boardSpecial', gem: 'entangleGem' } } }),
      createSpecialGems({ kind: 'entangleGem' }, 8, 0),
    ),
  },
  {
    id: 9350,
    desc: '对首 2 位敌人造成 [魔法 + 3] 点伤害，伤害值因秘士盟友数而增强。 [x3]',
    build: skill(
      dmg('enemyFirstN', 3, 1, { n: 2, modifier: { mod: { kind: 'multiplier', a: 3 }, source: { kind: 'alliesOfRace', race: 'Mystic' } } }),
    ),
  },
  {
    id: 9351,
    desc: '爆破 [魔法 + 1] 颗蓝色宝石。赋予所有盖塔尔盟友一个随机正面增益状态效果。再召唤一名盖塔尔军队。',
    build: skill(
      explodeRandomGems(1, 1, 'color', BaseColor.Blue),
      inflictRandom('allyAll', { targetKingdom: 3020, pool: 'positive' }),
      summonRandom(rawKingdomPool(3020), undefined) /* native SummoningKingdom 3020 (zh '盖塔尔' adds faction troops) */,
    ),
  },
  {
    id: 9352,
    desc: '对一名敌人造成 [魔法 + 4] 点伤害，伤害值因红色和恶魔盟友数而增强。 [x3]',
    build: skill(
      dmg('enemyChosen', 4, 1, { modifier: { mod: { kind: 'multiplier', a: 3 }, sources: [{ kind: 'alliesOfColor', color: BaseColor.Red }, { kind: 'alliesOfRace', race: 'Daemon' }] } }),
    ),
  },
  {
    id: 9353,
    desc: '对首 2 名敌人造成 [魔法 + 3] 点伤害，伤害值因盗贼盟友数而增强。 [x3]',
    build: skill(
      dmg('enemyFirstN', 3, 1, { n: 2, modifier: { mod: { kind: 'multiplier', a: 3 }, source: { kind: 'alliesOfRace', race: 'Rogue' } } }),
    ),
  },
  {
    id: 9354,
    desc: '对首 2 名敌人造成 [魔法 + 3] 点伤害，伤害值因蛛尔卡里盟友数而增强。 [x3]',
    build: skill(
      dmg('enemyFirstN', 3, 1, { n: 2, modifier: { mod: { kind: 'multiplier', a: 3 }, source: { kind: 'alliesOfKingdom', kingdom: 3029 } } }),
    ),
  },
  {
    id: 9355,
    desc: '对一名敌人造成 [魔法 + 4] 点伤害，伤害值因黄色和人马族盟友数而增强。 [x3]',
    build: skill(
      dmg('enemyChosen', 4, 1, { modifier: { mod: { kind: 'multiplier', a: 3 }, sources: [{ kind: 'alliesOfColor', color: BaseColor.Yellow }, { kind: 'alliesOfRace', race: 'Centaur' }] } }),
    ),
  },
  {
    id: 9356,
    desc: '赋予一名盟友 [魔法 + 2] 点护甲值，每锻炼 1 个武器段位则 +3 点。赋予所有蓝色盟友屏障效果并击晕所有蓝色敌人。若敌方有劫数，则将 3 颗蓝色宝石转换成巨人蓝色宝石。',
    build: skill(
      armor('allyChosen', 2, 1, { modifier: { mod: { kind: 'multiplier', a: 3 }, source: { kind: 'tempering' } } }),
      inflict('barrier', 'allyAll', { ifCond: { kind: 'targetColor', color: BaseColor.Blue } }),
      inflict('stun', 'enemyAll', { ifCond: { kind: 'targetColor', color: BaseColor.Blue } }),
      transformToSpecial(BaseColor.Blue, { kind: 'giantGem', color: BaseColor.Blue }, { count: 3, ifCond: { kind: 'targetHasDoom' } }), // R009 Giant Blue
    ),
  },
  {
    id: 9357,
    desc: '赋予一名盟友 [魔法 + 2] 点护甲值，每锻炼 1 个武器段位则 +3 点。赋予所有绿色盟友屏障效果并击晕所有绿色敌人。若敌方有劫数，则将 3 颗绿色宝石转换成巨人绿色宝石。',
    build: skill(
      armor('allyChosen', 2, 1, { modifier: { mod: { kind: 'multiplier', a: 3 }, source: { kind: 'tempering' } } }),
      inflict('barrier', 'allyAll', { ifCond: { kind: 'targetColor', color: BaseColor.Green } }),
      inflict('stun', 'enemyAll', { ifCond: { kind: 'targetColor', color: BaseColor.Green } }),
      transformToSpecial(BaseColor.Green, { kind: 'giantGem', color: BaseColor.Green }, { count: 3, ifCond: { kind: 'targetHasDoom' } }), // R009 Giant Green
    ),
  },
  {
    id: 9358,
    desc: '赋予一名盟友 [魔法 + 2] 点护甲值，每锻炼 1 个武器段位则 +3 点。赋予所有红色盟友屏障效果并击晕所有红色敌人。若敌方有劫数，则将 3 颗红色宝石转换成巨人红色宝石。',
    build: skill(
      armor('allyChosen', 2, 1, { modifier: { mod: { kind: 'multiplier', a: 3 }, source: { kind: 'tempering' } } }),
      inflict('barrier', 'allyAll', { ifCond: { kind: 'targetColor', color: BaseColor.Red } }),
      inflict('stun', 'enemyAll', { ifCond: { kind: 'targetColor', color: BaseColor.Red } }),
      transformToSpecial(BaseColor.Red, { kind: 'giantGem', color: BaseColor.Red }, { count: 3, ifCond: { kind: 'targetHasDoom' } }), // R009 Giant Red
    ),
  },
  {
    id: 9359,
    desc: '赋予一名盟友 [魔法 + 2] 点护甲值，每锻炼 1 个武器段位则 +3 点。赋予所有黄色盟友屏障效果并击晕所有黄色敌人。若敌方有劫数，则将 3 颗黄色宝石转换成巨人黄色宝石。',
    build: skill(
      armor('allyChosen', 2, 1, { modifier: { mod: { kind: 'multiplier', a: 3 }, source: { kind: 'tempering' } } }),
      inflict('barrier', 'allyAll', { ifCond: { kind: 'targetColor', color: BaseColor.Yellow } }),
      inflict('stun', 'enemyAll', { ifCond: { kind: 'targetColor', color: BaseColor.Yellow } }),
      transformToSpecial(BaseColor.Yellow, { kind: 'giantGem', color: BaseColor.Yellow }, { count: 3, ifCond: { kind: 'targetHasDoom' } }), // R009 Giant Yellow
    ),
  },
  {
    id: 9360,
    desc: '赋予一名盟友 [魔法 + 2] 点护甲值，每锻炼 1 个武器段位则 +3 点。赋予所有紫色盟友屏障效果并击晕所有紫色敌人。若敌方有劫数，则将 3 颗紫色宝石转换成巨人紫色宝石。',
    build: skill(
      armor('allyChosen', 2, 1, { modifier: { mod: { kind: 'multiplier', a: 3 }, source: { kind: 'tempering' } } }),
      inflict('barrier', 'allyAll', { ifCond: { kind: 'targetColor', color: BaseColor.Purple } }),
      inflict('stun', 'enemyAll', { ifCond: { kind: 'targetColor', color: BaseColor.Purple } }),
      transformToSpecial(BaseColor.Purple, { kind: 'giantGem', color: BaseColor.Purple }, { count: 3, ifCond: { kind: 'targetHasDoom' } }), // R009 Giant Purple
    ),
  },
  {
    id: 9361,
    desc: '赋予一名盟友 [魔法 + 2] 点护甲值，每锻炼 1 个武器段位则 +3 点。赋予所有棕色盟友屏障效果并击晕所有棕色敌人。若敌方有劫数，则将 3 颗棕色宝石转换成巨人棕色宝石。',
    build: skill(
      armor('allyChosen', 2, 1, { modifier: { mod: { kind: 'multiplier', a: 3 }, source: { kind: 'tempering' } } }),
      inflict('barrier', 'allyAll', { ifCond: { kind: 'targetColor', color: BaseColor.Brown } }),
      inflict('stun', 'enemyAll', { ifCond: { kind: 'targetColor', color: BaseColor.Brown } }),
      transformToSpecial(BaseColor.Brown, { kind: 'giantGem', color: BaseColor.Brown }, { count: 3, ifCond: { kind: 'targetHasDoom' } }), // R009 Giant Brown
    ),
  },
  {
    id: 9378,
    desc: '消除所有敌人正面增益效果，再创造 9 颗燃烧宝石。若永生神天界在队伍内，则再创造 5 颗燃烧宝石。 [x10]',
    build: ({"segments":[{"kind":"dispel","target":"enemyAll","statusId":"barrier"},{"kind":"dispel","target":"enemyAll","statusId":"blessed"},{"kind":"dispel","target":"enemyAll","statusId":"enchanted"},{"kind":"dispel","target":"enemyAll","statusId":"enraged"},{"kind":"dispel","target":"enemyAll","statusId":"rage"},{"kind":"dispel","target":"enemyAll","statusId":"reflect"},{"kind":"dispel","target":"enemyAll","statusId":"submerged"},{"kind":"gem","params":{"op":"create","gem":{"kind":"special","spec":{"kind":"burningGem"}},"count":{"base":9,"mult":0}}},{"kind":"gem","params":{"op":"create","gem":{"kind":"special","spec":{"kind":"burningGem"}},"count":{"base":5,"mult":0}},"ifCond":{"kind":"troopPresent","side":"ally","name":"永生神天界"}}]} as SkillPrototype),
  },
  {
    id: 9379,
    desc: '将所有骷髅头转换成超级末日骷髅头，并获得 [(魔法 / 2) + 1] 点攻击力。若队伍里有永生神奥西弗，则获得一个额外回合。',
    build: skill(
      transformToSpecial('SKULL', 'uberDoomSkull'),
      attack('allySelf', 1, 0.5),
      extraTurn({ ifCond: { kind: 'troopPresent', side: 'ally', name: '永生神奥西弗' } }),
    ),
  },
  {
    id: 9380,
    desc: '对一名敌人造成 [(魔法 x 2) + 3] 点伤害，伤害值因拥有屏障效果的盟友数而增强。若队伍里有永生神路西法，则爆破 3 颗宝石。 [x6]',
    build: ({"segments":[{"kind":"gem","params":{"op":"clear","mode":"explode","target":{"kind":"randomGems","count":{"base":3,"mult":0},"include":"all"}},"ifCond":{"kind":"troopPresent","side":"ally","name":"永生神路西法"}},{"kind":"damage","target":"enemyChosen","scaling":{"base":3,"mult":2},"modifier":{"mod":{"kind":"multiplier","a":6},"source":{"kind":"allyStatusCount","statusId":"barrier"}}}]} as SkillPrototype),
  },
  {
    id: 9381,
    desc: '给予所有盟友 [(魔法 x 1.5) + 2] 点护甲值。若队伍里有永生神泰拉，则爆破所有击晕宝石。 [x10]',
    build: skill(
      armor('allyAll', 2, 1.5, { modifier: { mod: { kind: 'multiplier', a: 10 } } }),
      explodeSpecialGems('stunGem', { ifCond: { kind: 'troopPresent', side: 'ally', name: '永生神泰拉' } }),
    ),
  },
  {
    id: 9382,
    desc: '创造 4 颗蓝龙宝石。若队伍里有永生神阿卡丽亚，则召唤一名随机龙族军队。',
    build: skill(
      createSpecialGems({ kind: 'dragonGem', color: BaseColor.Blue }, 4, 0),
      summonRandom(['Sheggra', 'Venoxia', 'ShadowDragon', 'Emperina', 'Celestasia', 'BoneDragon', 'DrakeRider', 'Dimetraxia', 'Wyvern', 'Venbarak', 'Borealis', 'DragonEggs', 'BabyDragon', 'Dragonette', 'Dragotaur', 'Dragonmoth', 'Visk', 'TheDragonSoul', 'Couatl', 'Sylvanimora', 'DRACOS-1337', 'DragonianRogue', 'DragonianMonk', 'SilverDrakon', 'Krystenax', 'Drake', 'Elemaugrim', 'DragonTurtle', 'Asha', 'Leviathan', 'Penglong', 'Glitterclaw', 'TheWorldbreaker', 'Divinia', 'LordEmber', 'LadyGarnetia', 'Tinseltail', 'Shimmerscale', 'Volthrenax', 'Thaumaris', 'Droggo', 'Sylfrostenath', 'MatronDragotani', 'UndeadDrake', 'FellDragonEgg', 'FellDragon', 'Nocturnia', 'Ishtara', 'DragonianSage', 'Obregonia', 'DragonSpirit', 'Essencia', 'Huanglong', 'Veneratus', 'HornedWyrm', 'NetherWyrm', 'TerraWyrm', 'TheGreatWyrm', 'Tihamata', 'RedAhriman', 'TwinkleBerry', 'MagmaDragon', 'Sabellius', 'Adakite', 'Obsidiaxas', 'Sapphirax', 'Emeraldrin', 'Rubirath', 'Topasarth', 'Amethialas', 'Garnetaerlin', 'Diamantina', 'Aquaria', 'TheElderDragon', 'HeraldOfKrystenax', 'TheGuardianDragon', 'CobaltDrake', 'HuntmasterArborius', 'CrystalEggs', 'DragonstoneGuardian', 'TheVoidDragon', 'Comethalas', 'Nebuladryx', 'Meteoridan', 'Solarithus', 'Lunarelleon', 'Eklipsos', 'Stellarix', 'DraconicSentinel', 'Tianlong', 'BrassDrake', 'Venerabilax', 'Chromaticea', 'Kukulkan', 'ImmortalAquaria', 'Leucithrax', 'TheSlimeDragon', 'Bahamata', 'Gingeraxia', 'Belcerulea', 'Gladius', 'Thornaressa', 'Narcithus', 'Orrissea', 'Orchidius', 'Chrysantherax', 'Chargrimax', 'Crackleleaf', 'Mistmother', 'DrakeEggs', 'ImmortalDrakkon', 'CrimsonWyrmling', 'Dragonhawk', 'Amethony', 'Creteus', 'Krakynos', 'Runethius', 'Hematrax', 'Vizinium', 'Demizerius', 'Amenhotrex', 'Pandemonia'], undefined, { ifCond: { kind: 'troopPresent', side: 'ally', name: '永生神阿卡丽亚' } }),
    ),
  },
  {
    id: 9383,
    desc: '对一名敌人造成 [(魔法 x 2) + 3] 点轻度溅射伤害。若队伍里有永生神卡普里乔尔，则将敌人打回末位。',
    build: skill(
      dmgSplash('enemyChosen', 3, 2, { range: 'splash' }),
      reposition('lastTarget', 'back', { ifCond: { kind: 'troopPresent', side: 'ally', name: '永生神卡普里乔尔' } }),
    ),
  },
  {
    id: 9384,
    desc: '对首位和末位敌人造成 [(魔法 x 1.5) + 2] 点伤害，伤害值因天使宝石数而增强。若队伍里有永生神利贝拉，则赐福所有盟友。 [x3]',
    build: skill(
      dmg('enemyLast', 2, 1.5, { modifier: { mod: { kind: 'multiplier', a: 3 }, source: { kind: 'boardSpecial', gem: 'angelGem' } } }),
      dmg('enemyFront', 2, 1.5, { modifier: { mod: { kind: 'multiplier', a: 3 }, source: { kind: 'boardSpecial', gem: 'angelGem' } } }),
      inflict('blessed', 'allyAll', { ifCond: { kind: 'troopPresent', side: 'ally', name: '永生神利贝拉' } }),
    ),
  },
  {
    id: 9385,
    desc: '对一名敌人造成 [(魔法 x 2.5)] 点伤害，并使其下方所有敌人陷入出血状态。若队伍里有永生神萨克塔利安，则使所有敌人陷入出血状态。',
    build: skill(
      dmg('enemyChosen', 0, 2.5),
      inflict('bleed', 'enemyBelowTarget'),
      inflict('bleed', 'enemyAll', { ifCond: { kind: 'troopPresent', side: 'ally', name: '永生神萨克塔利安' } }),
    ),
  },
  {
    id: 9386,
    desc: '将所有绿色宝石转换成妖仙宝石并获得 [魔法 + 2] 点生命值。若队伍里有永生神维拉格，则获得一个额外回合。',
    build: skill(
      transformToSpecial(BaseColor.Green, 'faerieFireGem'),
      heal('allySelf', 2, 1),
      extraTurn({ ifCond: { kind: 'troopPresent', side: 'ally', name: '永生神维拉格' } }),
    ),
  },
  {
    id: 9387,
    desc: '对一名敌人造成 [(魔法 x 1.5) + 2] 点真实伤害，伤害值因炸弹宝石数而增强。若队伍里有永生神提泰纽斯，则随机摧毁 2 列。 [x2]',
    build: skill(
      // native order (R001): DestroyColumn, then CountGems Bomb, then TrueDamage (sa-R1)
      destroyRandomCols(2, 0, { ifCond: { kind: 'troopPresent', side: 'ally', name: '永生神提泰纽斯' } }),
      trueDmg('enemyChosen', 2, 1.5, { trueDamage: true, modifier: { mod: { kind: 'multiplier', a: 2 }, source: { kind: 'boardSpecial', gem: 'bomb' } } }),
    ),
  },
  {
    id: 9388,
    desc: '净化所有盟友并创造 9 颗冻结宝石。若队伍里有永生神格拉西亚，则再创造 5 颗冻结宝石。 [x10]',
    build: skill(
      // Native order: CreateGems 9 Freeze (+5 with Immortal Glaycia, CountMax 5) before Cleanse@AllAllies.
      createSpecialGems({ kind: 'freezeGem' }, 9, 0),
      createSpecialGems({ kind: 'freezeGem' }, 5, 0, { ifCond: { kind: 'troopPresent', side: 'ally', name: '永生神格拉西亚' } }),
      cleanse('allyAll'),
    ),
  },
  {
    id: 9484,
    desc: '摧毁 2 个随机行。如果我的队伍中有不朽的拉奇亚，则还摧毁 2 个随机列。 [x2]',
    build: skill(
      destroyRandomRows(2),
      destroyRandomCols(2, 0, { ifCond: { kind: 'troopPresent', side: 'ally', name: '不朽的拉基亚' }, modifier: { mod: { kind: 'multiplier', a: 2 } } }),
    ),
  },
  {
    id: 9486,
    desc: '对一名敌人造成 [魔法 + 3] 点伤害，伤害值因恶魔盟友数量而增强。如果我的队伍中有不朽的阿巴顿，则引爆所有恶魔传送门宝石。 [x4]',
    build: skill(
      // native order (R001): explode Portal gems (may summon Daemons), then CountArmyType Daemon, then Damage (sa-R1)
      explodeSpecialGems('daemonicPortalGem', { ifCond: { kind: 'troopPresent', side: 'ally', name: '不朽的亚巴顿' } }),
      dmg('enemyChosen', 3, 1, { modifier: { mod: { kind: 'multiplier', a: 4 }, source: { kind: 'alliesOfRace', race: 'Daemon' } } }),
    ),
  },
  {
    id: 9488,
    desc: '制造 4 个骷髅，数量受中毒敌人影响。如果我的队伍中有永生的 Scoprio，则再制造 2 个骷髅。 [x2]',
    build: skill(
      // Native order: CreateGems Skull (2 with Immortal Scoprio) first, then 4 + 2 per Poisoned enemy.
      createSkulls(2, 0, { ifCond: { kind: 'troopPresent', side: 'ally', name: '不朽的天蝎座' } }),
      createSkulls(4, 0, { modifier: { mod: { kind: 'multiplier', a: 2 }, source: { kind: 'enemyStatusCount', statusId: 'poison' } } }),
    ),
  },
  {
    id: 9490,
    desc: '制作 8-12 个骷髅。如果我的队伍中有 Immortal Furnax，则将 4 个黄色宝石转换为末日骷髅。 [x4]',
    build: skill(
      createSkulls(0, 0, { countRange: { min: 8, max: 12 }, modifier: { mod: { kind: 'multiplier', a: 4 } } }),
      transformToSpecial(BaseColor.Yellow, 'doomSkull', { count: 4, ifCond: { kind: 'troopPresent', side: 'ally', name: '不朽熔炉' } }),
    ),
  },
  {
    id: 9505,
    desc: '对首位 2 名敌人造成 [魔法 + 3] 点伤害，伤害值因恶魔传送门宝石数而增强。创造 2 颗恶魔传送门宝石。 [x3]',
    build: skill(
      dmg('enemyFirstN', 3, 1, { n: 2, modifier: { mod: { kind: 'multiplier', a: 3 }, source: { kind: 'boardSpecial', gem: 'daemonicPortalGem' } } }),
      createSpecialGems({ kind: 'daemonicPortalGem' }, 2, 0),
    ),
  },
  {
    id: 9506,
    desc: '对前 2 名敌人造成 [魔法 + 3] 点伤害，伤害值因狐狸座盟友的数量而增强。 [x3]',
    build: skill(
      dmg('enemyFirstN', 3, 1, { n: 2, modifier: { mod: { kind: 'multiplier', a: 3 }, source: { kind: 'alliesOfKingdom', kingdom: 3084 } } }),
    ),
  },
  {
    id: 9507,
    desc: '对敌人造成 [魔法 + 4] 点伤害，伤害值因黄色盟友和神圣盟友的数量而增强。 [x3]',
    build: skill(
      dmg('enemyChosen', 4, 1, { modifier: { mod: { kind: 'multiplier', a: 3 }, sources: [{ kind: 'alliesOfColor', color: BaseColor.Yellow }, { kind: 'alliesOfRace', race: 'Divine' }] } }),
    ),
  },
  {
    id: 9508,
    desc: '爆破 [魔法 + 1] 颗黄色宝石。赋予所有鸟族盟友一个随机正面增益效果。再召唤一名鸟族军队。',
    build: skill(
      explodeRandomGems(1, 1, 'color', BaseColor.Yellow),
      inflictRandom('allyAll', { targetRace: 'Stryx', pool: 'positive' }),
      summonRandom(['Heronath', 'Owleth', 'Sylph', 'Garuda', 'PrinceAzquila', 'Strygik', 'Stormsinger', 'Taloca', 'WindArcher', 'Ixchel', 'Phoenicia', 'PavosDawnwind', 'Harpy', 'Bladewing', 'HarpyMage', 'QueenXochi', 'CaptainMacaw', 'Finesse', 'Lyriath', 'Zilopochtli', 'Quetzalma', 'HighPriestessChazka', 'Metztli', 'Ostryx', 'Totec', 'KingOfRavens', 'Stormcrow', 'HarpyNightsong', 'Ehecatl', 'Egris', 'SparrowKnight', 'Kukulkan', 'FisherKing', 'CrestedAva', 'Mayahuel', 'Cinereous', 'Cassoryx'], undefined),
    ),
  },
  {
    id: 9509,
    desc: '爆破 [魔法 + 1] 颗紫色宝石。赋予所有迈纳杰之罪盟友一个随机正面增益效果。再召唤一名迈纳杰之罪军队。',
    build: skill(
      explodeRandomGems(1, 1, 'color', BaseColor.Purple),
      inflictRandom('allyAll', { targetKingdom: 3037, pool: 'positive' }),
      summonRandom(rawKingdomPool(3037), undefined) /* native SummoningKingdom 3037 (zh '迈纳杰之罪' adds faction troops) */,
    ),
  },
  {
    id: 9510,
    desc: '对敌人造成 [魔法 + 4] 点伤害，伤害值由红色盟友和金牛座盟友增强。 [x3]',
    build: skill(
      dmg('enemyChosen', 4, 1, { modifier: { mod: { kind: 'multiplier', a: 3 }, sources: [{ kind: 'alliesOfColor', color: BaseColor.Red }, { kind: 'alliesOfRace', race: 'Tauros' }] } }),
    ),
  },
  {
    id: 9511,
    desc: '引爆 [魔法 + 1] 颗紫色宝石。为所有半人马盟友赋予随机状态效果。然后召唤一支半人马部队。',
    build: skill(
      explodeRandomGems(1, 1, 'color', BaseColor.Purple),
      inflictRandom('allyAll', { targetRace: 'Centaur', pool: 'positive' }),
      summonRandom(['CentaurScout', 'StarGazer', 'Herdmaster', 'Orion', 'BulTauros', 'AstralSpirit', 'Dragotaur', 'Anthea', 'Artema', 'Hind', 'TheWorldbreaker', 'Vanguard', 'OrionsHerald', 'Herne', 'HorseLord', 'BorGakk', 'MatronDragotani', 'Thaumataur', 'Auspecia', 'Baphomet', 'AstralMother', 'Oneiros', 'Centuragon', 'Sagittarian', 'Chiron', 'CattauriWarrior', 'TheCattauriKing', 'Ogretaur', 'Hippolyta', 'WingedDonkey', 'Zebrataur', 'ImmortalSagittarian', 'Astaroth', 'Discordia', 'CentaurElder', 'Astrotaur', 'Eridana', 'KingEquustis', 'Lapitaur', 'Giraffataur', 'DuskWitch', 'Ciaran'], undefined),
    ),
  },
  {
    id: 9523,
    desc: '净化自身，然后随机对敌方队伍造成 9 层流血效果。',
    build: skill(
      // Native InflictEffectOnRandomTroops AllEnemies Amount 2,2,2,2,1 (L2-1620-random-bleed):
      // each step = Amount distinct random living enemies (all survivors when fewer), 9 applications
      // in total; Bleed stacks per application (cap 4). Not 9 stacks on every enemy.
      cleanse('allySelf'),
      inflict('bleed', 'enemyRandomN', { n: 2 }),
      inflict('bleed', 'enemyRandomN', { n: 2 }),
      inflict('bleed', 'enemyRandomN', { n: 2 }),
      inflict('bleed', 'enemyRandomN', { n: 2 }),
      inflict('bleed', 'enemyRandomN', { n: 1 }),
    ),
  },
  {
    id: 9524,
    desc: '随机对敌方队伍造成 2 次精灵之火和 2 次缠绕。然后对一名敌人造成 [(魔法 / 2) + 4] – [魔法 + 9] -{2} 点伤害。',
    // R001 native order: RandomHighDamage FromTarget first, then InflictEffectOnRandomTroops
    // faeriefire Amount 2 and entangle Amount 2 (2 distinct random enemies each; L2-1620-random-bleed family)
    build: skill(
      dmg('enemyChosen', 0, 0, { rangeSpec: { min: scale(4, 0.5), max: scale(9, 1) } }),
      inflict('faerie-fire', 'enemyRandomN', { n: 2 }),
      inflict('entangle', 'enemyRandomN', { n: 2 }),
    ),
  },
  {
    id: 9525,
    desc: '对敌方队伍随机施加 8 层流血、2 层精灵之火和 2 层缠绕。然后对一名敌人造成 [魔法 + 2] – [(魔法 x 2) + 4] -{2} 点伤害。',
    // Native order: faeriefire 2, entangle 2, bleed 3, bleed 3, bleed 2 (distinct random enemies per
    // step; L2-1620-random-bleed family), then RandomHighDamage FromTarget.
    build: skill(
      inflict('faerie-fire', 'enemyRandomN', { n: 2 }),
      inflict('entangle', 'enemyRandomN', { n: 2 }),
      inflict('bleed', 'enemyRandomN', { n: 3 }),
      inflict('bleed', 'enemyRandomN', { n: 3 }),
      inflict('bleed', 'enemyRandomN', { n: 2 }),
      dmg('enemyChosen', 0, 0, { rangeSpec: { min: scale(2, 1), max: scale(4, 2) } }),
    ),
  },
  {
    id: 9564,
    desc: '对最后一名敌人造成 [魔法 + 2] 点伤害，伤害值因紫色宝石数量而增强。如果我的队伍中有永生塞勒涅，则将一半法力值给予所有其他盟友。 [x4]',
    build: skill(
      dmg('enemyLast', 2, 1, { modifier: { mod: { kind: 'multiplier', a: 4 }, source: { kind: 'boardGems', color: BaseColor.Purple } } }),
      mana('allyOthers', 0, 0, { halve: true, ifCond: { kind: 'troopPresent', side: 'ally', name: '不朽的塞勒涅' } }),
    ),
  },
  {
    id: 9566,
    desc: '对一名敌人造成 [魔法 + 12] 点溅射伤害，并使所有受影响的敌人流血。如果我的队伍中有不朽双子，则将敌人法力颜色之一的所有宝石转换为紫色。',
    build: skill(
      dmgSplash('enemyChosen', 12, 1, { range: 'splash' }),
      inflict('bleed', 'lastDamaged'),
      transform('LAST_TARGET', BaseColor.Purple, { ifCond: { kind: 'troopPresent', side: 'ally', name: '不朽的双子座' } }),
    ),
  },
  {
    id: 9573,
    desc: '将所选颜色的所有宝石转换为腐烂宝石。',
    build: skill(
      // Native ConvertGems 100 FromTarget>Decay: only the chosen colour (sa-R2 L4b-1625-any).
      transformToSpecial(CHOSEN, 'decayGem'),
    ),
  },
  {
    id: 9574,
    desc: '对前 2 名敌人造成 [魔法 + 3] 点伤害，伤害值因银林地盟友的数量而增强。 [x3]',
    build: ({"segments":[{"kind":"damage","target":"enemyFirstN","scaling":{"base":3,"mult":1},"n":2,"modifier":{"mod":{"kind":"multiplier","a":3},"source":{"kind":"alliesOfKingdom","kingdom":3009}}}]} as SkillPrototype),
  },
  {
    id: 9575,
    desc: '对敌人造成 [魔法 + 4] 点伤害，伤害值因棕色盟友和乌尔斯卡盟友的数量而增强。 [x3]',
    build: skill(
      dmg('enemyChosen', 4, 1, { modifier: { mod: { kind: 'multiplier', a: 3 }, sources: [{ kind: 'alliesOfColor', color: BaseColor.Brown }, { kind: 'alliesOfRace', race: 'Urska' }] } }),
    ),
  },
  {
    id: 9576,
    desc: '对前 2 名敌人造成 [魔法 + 3] 点伤害，伤害值因巨人盟友的数量而增强。 [x3]',
    build: skill(
      dmg('enemyFirstN', 3, 1, { n: 2, modifier: { mod: { kind: 'multiplier', a: 3 }, source: { kind: 'alliesOfRace', race: 'Giant' } } }),
    ),
  },
  {
    id: 9577,
    desc: '爆破 [魔法 + 1] 颗棕色宝石。赋予所有地狱悬崖盟友一个随机正面增益效果。再召唤一名地狱悬崖军队。',
    build: skill(
      explodeRandomGems(1, 1, 'color', BaseColor.Brown),
      inflictRandom('allyAll', { targetKingdom: 3082, pool: 'positive' }),
      summonRandom(rawKingdomPool(3082), undefined) /* native SummoningKingdom 3082 (zh '地狱悬崖' adds faction troops) */,
    ),
  },
  {
    id: 9578,
    desc: '对敌人造成 [魔法 + 4] 点伤害，伤害值因红色盟友和仙灵盟友的数量而增强。 [x3]',
    build: skill(
      dmg('enemyChosen', 4, 1, { modifier: { mod: { kind: 'multiplier', a: 3 }, sources: [{ kind: 'alliesOfColor', color: BaseColor.Red }, { kind: 'alliesOfRace', race: 'Fey' }] } }),
    ),
  },
  {
    id: 9579,
    // sa-R7: native DecreaseMana@FromTarget UseCounterForAmount, no Amount = 3 x Undead allies only (was 3 + 3 x count)
    desc: '对一名敌人造成 [魔法 + 3] 点伤害。每有一个亡灵盟友，则消耗 3 点法力值。 [x3]',
    build: ({"segments":[{"kind":"damage","target":"enemyChosen","scaling":{"base":3,"mult":1}},{"kind":"reduce","target":"lastTarget","stat":"mana","scaling":{"base":0,"mult":0},"modifier":{"mod":{"kind":"multiplier","a":3},"sources":[{"kind":"alliesOfRace","race":"Undead"}]}}]} as SkillPrototype),
  },
  {
    id: 9580,
    desc: '对敌人造成 [魔法 + 3] 点伤害，每级回火 +4 点。如果他们使用蓝色法力值，则引爆 3 颗蓝色宝石。如果敌人有毁灭之力，则恢复我四分之一的法力值。',
    build: skill(
      // sa-F: native order ExplodeColor -> GenerateQuarterManaConditional -> Damage (R001)
      explodeRandomGems(3, 0, 'color', BaseColor.Blue, { ifCond: { kind: 'chosenTargetColor', color: BaseColor.Blue } }),
      mana('allySelf', 0, 0, { fraction: 0.25, ifCond: { kind: 'targetHasDoom' } }),
      dmg('enemyChosen', 3, 1, { modifier: { mod: { kind: 'multiplier', a: 4 }, source: { kind: 'tempering' } } }),
    ),
  },
  {
    id: 9581,
    desc: '对敌人造成 [魔法 + 3] 点伤害，每级回火 +4 点。如果敌人使用绿色法力值，则引爆 3 颗绿色宝石。如果敌人有毁灭之力，则恢复我四分之一的法力值。',
    build: skill(
      // sa-F: native order ExplodeColor -> GenerateQuarterManaConditional -> Damage (R001)
      explodeRandomGems(3, 0, 'color', BaseColor.Green, { ifCond: { kind: 'chosenTargetColor', color: BaseColor.Green } }),
      mana('allySelf', 0, 0, { fraction: 0.25, ifCond: { kind: 'targetHasDoom' } }),
      dmg('enemyChosen', 3, 1, { modifier: { mod: { kind: 'multiplier', a: 4 }, source: { kind: 'tempering' } } }),
    ),
  },
  {
    id: 9582,
    desc: '对敌人造成 [魔法 + 3] 点伤害，每级回火 +4 点。如果敌人使用红色法力值，则引爆 3 颗红色宝石。如果敌人有毁灭之力，则恢复我四分之一的法力值。',
    build: skill(
      // sa-F: native order ExplodeColor -> GenerateQuarterManaConditional -> Damage (R001)
      explodeRandomGems(3, 0, 'color', BaseColor.Red, { ifCond: { kind: 'chosenTargetColor', color: BaseColor.Red } }),
      mana('allySelf', 0, 0, { fraction: 0.25, ifCond: { kind: 'targetHasDoom' } }),
      dmg('enemyChosen', 3, 1, { modifier: { mod: { kind: 'multiplier', a: 4 }, source: { kind: 'tempering' } } }),
    ),
  },
  {
    id: 9583,
    desc: '对敌人造成 [魔法 + 3] 点伤害，每级回火 +4 点。如果敌人使用黄色法力值，则引爆 3 颗黄色宝石。如果敌人有毁灭之力，则恢复我四分之一的法力值。',
    build: skill(
      // sa-F: native order ExplodeColor -> GenerateQuarterManaConditional -> Damage (R001)
      explodeRandomGems(3, 0, 'color', BaseColor.Yellow, { ifCond: { kind: 'chosenTargetColor', color: BaseColor.Yellow } }),
      mana('allySelf', 0, 0, { fraction: 0.25, ifCond: { kind: 'targetHasDoom' } }),
      dmg('enemyChosen', 3, 1, { modifier: { mod: { kind: 'multiplier', a: 4 }, source: { kind: 'tempering' } } }),
    ),
  },
  {
    id: 9584,
    desc: '对敌人造成 [魔法 + 3] 点伤害，每级回火 +4 点。如果他们使用紫色法力值，则引爆 3 颗紫色宝石。如果敌人有毁灭之力，则恢复我四分之一的法力值。',
    build: skill(
      // sa-F: native order ExplodeColor -> GenerateQuarterManaConditional -> Damage (R001)
      explodeRandomGems(3, 0, 'color', BaseColor.Purple, { ifCond: { kind: 'chosenTargetColor', color: BaseColor.Purple } }),
      mana('allySelf', 0, 0, { fraction: 0.25, ifCond: { kind: 'targetHasDoom' } }),
      dmg('enemyChosen', 3, 1, { modifier: { mod: { kind: 'multiplier', a: 4 }, source: { kind: 'tempering' } } }),
    ),
  },
  {
    id: 9585,
    desc: '对敌人造成 [魔法 + 3] 点伤害，每级回火 +4 点。如果他们使用棕色法力值，则引爆 3 颗棕色宝石。如果敌人有毁灭之力，则恢复我四分之一的法力值。',
    build: skill(
      // sa-F: native order ExplodeColor -> GenerateQuarterManaConditional -> Damage (R001)
      explodeRandomGems(3, 0, 'color', BaseColor.Brown, { ifCond: { kind: 'chosenTargetColor', color: BaseColor.Brown } }),
      mana('allySelf', 0, 0, { fraction: 0.25, ifCond: { kind: 'targetHasDoom' } }),
      dmg('enemyChosen', 3, 1, { modifier: { mod: { kind: 'multiplier', a: 4 }, source: { kind: 'tempering' } } }),
    ),
  },
  {
    id: 9628,
    desc: '爆破 [魔法 + 1] 颗棕色宝石。赋予所有卓克祖盟友一个随机正面增益效果。再召唤一名卓克祖军队。',
    build: skill(
      explodeRandomGems(1, 1, 'color', BaseColor.Brown),
      inflictRandom('allyAll', { targetKingdom: 3035, pool: 'positive' }),
      summonRandom(rawKingdomPool(3035), undefined) /* native SummoningKingdom 3035 (zh '卓克祖' adds faction troops) */,
    ),
  },
  {
    id: 9629,
    desc: '对敌人造成 [魔法 + 3] 点溅射伤害。创造 7 颗沉没宝石。如果一名敌人死亡，则再创造 4 颗。',
    build: skill(
      dmgSplash('enemyChosen', 3, 1, { range: 'splash' }),
      createSpecialGems({ kind: 'submergeGem' }, 7, 0),
      createSpecialGems({ kind: 'submergeGem' }, 4, 0, { ifCond: { kind: 'anyTrackedDied' } }),
    ),
  },
  {
    id: 9630,
    desc: '对敌人造成 [魔法 + 4] 点伤害，伤害值因棕色盟友和巨型盟友的数量而增强。 [x3]',
    build: skill(
      dmg('enemyChosen', 4, 1, { modifier: { mod: { kind: 'multiplier', a: 3 }, sources: [{ kind: 'alliesOfColor', color: BaseColor.Brown }, { kind: 'alliesOfRace', race: 'Giant' }] } }),
    ),
  },
  {
    id: 9631,
    desc: '对前 2 名敌人造成 [魔法 + 3] 点伤害，伤害值因元素盟友而增强。 [x3]',
    build: skill(
      dmg('enemyFirstN', 3, 1, { n: 2, modifier: { mod: { kind: 'multiplier', a: 3 }, source: { kind: 'alliesOfRace', race: 'Elemental' } } }),
    ),
  },
  {
    id: 9632,
    desc: '对前 2 名敌人造成 [魔法 + 3] 点伤害，伤害值因暗石盟友的数量而增强。 [x3]',
    build: skill(
      dmg('enemyFirstN', 3, 1, { n: 2, modifier: { mod: { kind: 'multiplier', a: 3 }, source: { kind: 'alliesOfKingdom', kingdom: 3022 } } }),
    ),
  },
  {
    id: 9633,
    desc: '对一名敌人造成 [魔法 + 4] 点伤害，伤害值因蓝色盟友和仙灵盟友的数量而增强。 [x3]',
    build: skill(
      dmg('enemyChosen', 4, 1, { modifier: { mod: { kind: 'multiplier', a: 3 }, sources: [{ kind: 'alliesOfColor', color: BaseColor.Blue }, { kind: 'alliesOfRace', race: 'Fey' }] } }),
    ),
  },
  {
    id: 9634,
    desc: '对前 2 名敌人造成 [魔法 + 3] 点伤害，伤害值因哥布林盟友的数量而增强。 [x3]',
    build: skill(
      dmg('enemyFirstN', 3, 1, { n: 2, modifier: { mod: { kind: 'multiplier', a: 3 }, source: { kind: 'alliesOfRace', race: 'Goblin' } } }),
    ),
  },
  {
    id: 9635,
    desc: '对前 2 名敌人造成 [魔法 + 3] 点伤害，伤害值因梅兰堤斯盟友数量而增强。 [x3]',
    build: skill(
      dmg('enemyFirstN', 3, 1, { n: 2, modifier: { mod: { kind: 'multiplier', a: 3 }, source: { kind: 'alliesOfKingdom', kingdom: 3036 } } }),
    ),
  },
  {
    id: 9636,
    desc: '对一名敌人造成 [魔法 + 4] 点伤害，伤害值因绿色盟友和野蛮人盟友的数量而增强。 [x3]',
    build: skill(
      dmg('enemyChosen', 4, 1, { modifier: { mod: { kind: 'multiplier', a: 3 }, sources: [{ kind: 'alliesOfColor', color: BaseColor.Green }, { kind: 'alliesOfRace', race: 'Wildfolk' }] } }),
    ),
  },
  {
    id: 9647,
    desc: '对4名随机敌人造成流血效果。然后制造9颗激怒宝石。如果我的队伍中有不朽的安格拉克，则再制造4颗。 [x4]',
    build: skill(
      // Native CauseBleed@RandomEnemy + 3 x CauseBleed@RandomPrefNotPrevEnemy (R007-3: avoid only the previous pick).
      inflict('bleed', 'enemyRandom'),
      inflict('bleed', 'enemyRandomPrefNotPrev'),
      inflict('bleed', 'enemyRandomPrefNotPrev'),
      inflict('bleed', 'enemyRandomPrefNotPrev'),
      createSpecialGems({ kind: 'enrageGem' }, 9, 0),
      createSpecialGems({ kind: 'enrageGem' }, 4, 0, { ifCond: { kind: 'troopPresent', side: 'ally', name: '不朽的安格拉克' } }),
    ),
  },
  {
    id: 9649,
    desc: '造成[魔法 + 8]点散射伤害，伤害值因绿龙宝石数量而增强。如果我的队伍中有不朽的德拉肯，则随机召唤一条龙。 [x4]',
    build: skill(
      dmg('enemyAll', 8, 1, { range: 'all', modifier: { mod: { kind: 'multiplier', a: 4 }, source: { kind: 'boardSpecial', gem: 'dragonGem', color: BaseColor.Green } } }), // native CountGems DragonGreen (P-R3-dragon-gem-count)
      summonRandom(['Sheggra', 'Venoxia', 'ShadowDragon', 'Emperina', 'Celestasia', 'BoneDragon', 'DrakeRider', 'Dimetraxia', 'Wyvern', 'Venbarak', 'Borealis', 'DragonEggs', 'BabyDragon', 'Dragonette', 'Dragotaur', 'Dragonmoth', 'Visk', 'TheDragonSoul', 'Couatl', 'Sylvanimora', 'DRACOS-1337', 'DragonianRogue', 'DragonianMonk', 'SilverDrakon', 'Krystenax', 'Drake', 'Elemaugrim', 'DragonTurtle', 'Asha', 'Leviathan', 'Penglong', 'Glitterclaw', 'TheWorldbreaker', 'Divinia', 'LordEmber', 'LadyGarnetia', 'Tinseltail', 'Shimmerscale', 'Volthrenax', 'Thaumaris', 'Droggo', 'Sylfrostenath', 'MatronDragotani', 'UndeadDrake', 'FellDragonEgg', 'FellDragon', 'Nocturnia', 'Ishtara', 'DragonianSage', 'Obregonia', 'DragonSpirit', 'Essencia', 'Huanglong', 'Veneratus', 'HornedWyrm', 'NetherWyrm', 'TerraWyrm', 'TheGreatWyrm', 'Tihamata', 'RedAhriman', 'TwinkleBerry', 'MagmaDragon', 'Sabellius', 'Adakite', 'Obsidiaxas', 'Sapphirax', 'Emeraldrin', 'Rubirath', 'Topasarth', 'Amethialas', 'Garnetaerlin', 'Diamantina', 'Aquaria', 'TheElderDragon', 'HeraldOfKrystenax', 'TheGuardianDragon', 'CobaltDrake', 'HuntmasterArborius', 'CrystalEggs', 'DragonstoneGuardian', 'TheVoidDragon', 'Comethalas', 'Nebuladryx', 'Meteoridan', 'Solarithus', 'Lunarelleon', 'Eklipsos', 'Stellarix', 'DraconicSentinel', 'Tianlong', 'BrassDrake', 'Venerabilax', 'Chromaticea', 'Kukulkan', 'ImmortalAquaria', 'Leucithrax', 'TheSlimeDragon', 'Bahamata', 'Gingeraxia', 'Belcerulea', 'Gladius', 'Thornaressa', 'Narcithus', 'Orrissea', 'Orchidius', 'Chrysantherax', 'Chargrimax', 'Crackleleaf', 'Mistmother', 'DrakeEggs', 'ImmortalDrakkon', 'CrimsonWyrmling', 'Dragonhawk', 'Amethony', 'Creteus', 'Krakynos', 'Runethius', 'Hematrax', 'Vizinium', 'Demizerius', 'Amenhotrex', 'Pandemonia'], undefined, { ifCond: { kind: 'troopPresent', side: 'ally', name: '不朽的德拉肯' } }),
    ),
  },
  {
    id: 9687,
    desc: '对一名敌人造成[魔法 + 3]点伤害，伤害值因诅咒宝石数量而增强。如果敌人已中毒，则造成双倍伤害。然后使其中毒。 [x3]',
    build: skill(
      // Native 9687: CountGems 300 Cursed = Curse gems on the board (was Cursed enemies).
      dmg('enemyChosen', 3, 1, { modifier: { mod: { kind: 'multiplier', a: 3 }, source: { kind: 'boardSpecial', gem: 'curseGem' } }, condMult: { times: 2, cond: { kind: 'targetStatus', statusId: 'poison' } } }),
      inflict('poison', 'lastTarget'),
    ),
  },
  {
    id: 9688,
    desc: '对前 2 名敌人造成 [魔法 + 3] 点伤害，伤害值因神圣盟友数而增强。 [x3]',
    build: skill(
      dmg('enemyFirstN', 3, 1, { n: 2, modifier: { mod: { kind: 'multiplier', a: 3 }, source: { kind: 'alliesOfRace', race: 'Divine' } } }),
    ),
  },
  {
    id: 9689,
    desc: '对前 2 名敌人造成 [魔法 + 3] 点伤害，伤害值因阿达纳盟友的数量而增强。 [x3]',
    build: skill(
      dmg('enemyFirstN', 3, 1, { n: 2, modifier: { mod: { kind: 'multiplier', a: 3 }, source: { kind: 'alliesOfKingdom', kingdom: 3001 } } }),
    ),
  },
  {
    id: 9690,
    desc: '对一名敌人造成 [魔法 + 4] 点伤害，伤害值因黄色盟友和骑士盟友的数量而增强。 [x3]',
    build: skill(
      dmg('enemyChosen', 4, 1, { modifier: { mod: { kind: 'multiplier', a: 3 }, sources: [{ kind: 'alliesOfColor', color: BaseColor.Yellow }, { kind: 'alliesOfRace', race: 'Knight' }] } }),
    ),
  },
  {
    id: 9691,
    desc: '赋予所有怪物盟友[魔法 + 1]点攻击力和生命值。然后祝福他们。',
    build: skill(
      attack('allyAll', 1, 1, { targetRace: 'Monster' }),
      heal('allyAll', 1, 1, { targetRace: 'Monster' }),
      inflict('blessed', 'allyAll', { targetRace: 'Monster' }),
    ),
  },
  {
    id: 9692,
    desc: '对前 2 名敌人造成 [魔法 + 3] 点伤害，伤害值因流沙盟友的数量而增强。 [x3]',
    build: skill(
      dmg('enemyFirstN', 3, 1, { n: 2, modifier: { mod: { kind: 'multiplier', a: 3 }, source: { kind: 'alliesOfKingdom', kingdom: 3024 } } }),
    ),
  },
  {
    id: 9693,
    desc: '对一名敌人造成 [魔法 + 4] 点伤害，伤害值因棕色盟友和矮人盟友的数量而增强。 [x3]',
    build: skill(
      dmg('enemyChosen', 4, 1, { modifier: { mod: { kind: 'multiplier', a: 3 }, sources: [{ kind: 'alliesOfColor', color: BaseColor.Brown }, { kind: 'alliesOfRace', race: 'Dwarf' }] } }),
    ),
  },
  {
    id: 9720,
    desc: '引爆5颗宝石，因盟友受到屏障而增强。若我方队伍中有不朽者扎卡利尔，则获得额外回合。 [1:1]',
    build: skill(
      explodeRandomGems(5, 0, 'all', undefined, { modifier: { mod: { kind: 'ratio', a: 1, b: 1 }, source: { kind: 'allyStatusCount', statusId: 'barrier' } } }),
      extraTurn({ ifCond: { kind: 'troopPresent', side: 'ally', name: '不朽的扎卡利尔' } }),
    ),
  },
  {
    id: 9722,
    desc: '造成[魔法 + 6]点散射伤害，伤害值因暗影星辰而增强。如果我方队伍中有不朽雷奥，则对所有敌人施加2层流血效果。 [x8]',
    build: skill(
      // Native 9722: conditional Bleed x2 (steps 1-2) before the scatter damage (step 5) (R001).
      inflict('bleed', 'enemyAll', { stacks: 2, ifCond: { kind: 'troopPresent', side: 'ally', name: '不朽的雷奥' } }),
      dmg('enemyAll', 6, 1, { range: 'all', modifier: { mod: { kind: 'multiplier', a: 8 }, source: { kind: 'boardSpecial', gem: 'umbralStar' } } }),
    ),
  },
  {
    id: 9747,
    desc: '对一名敌人造成[魔法 + 3]溅射伤害，伤害值因激怒宝石数量而增强。然后引爆3颗激怒宝石。 [x6]',
    build: skill(
      dmgSplash('enemyChosen', 3, 1, { range: 'splash', modifier: { mod: { kind: 'multiplier', a: 6 }, source: { kind: 'boardSpecial', gem: 'enrageGem' } } }),
      explodeRandomSpecialGems('enrageGem', 3, 0),
    ),
  },
  {
    id: 9748,
    desc: '赋予所有恶魔盟友[魔法 + 1]攻击力和生命值。然后祝福他们。',
    build: skill(
      attack('allyAll', 1, 1, { targetRace: 'Daemon' }),
      heal('allyAll', 1, 1, { targetRace: 'Daemon' }),
      inflict('blessed', 'allyAll', { targetRace: 'Daemon' }),
    ),
  },
  {
    id: 9749,
    desc: '对前 2 名敌人造成 [魔法 + 3] 点伤害，伤害值因圣力场盟友的数量而增强。 [x3]',
    build: skill(
      dmg('enemyFirstN', 3, 1, { n: 2, modifier: { mod: { kind: 'multiplier', a: 3 }, source: { kind: 'alliesOfKingdom', kingdom: 3028 } } }),
    ),
  },
  {
    id: 9750,
    desc: '对一名敌人造成 [魔法 + 4] 点伤害，伤害值因棕色盟友和金牛座盟友的数量而增强。 [x3]',
    build: skill(
      dmg('enemyChosen', 4, 1, { modifier: { mod: { kind: 'multiplier', a: 3 }, sources: [{ kind: 'alliesOfColor', color: BaseColor.Brown }, { kind: 'alliesOfRace', race: 'Tauros' }] } }),
    ),
  },
  {
    id: 9751,
    desc: '对前 2 名敌人造成 [魔法 + 3] 点伤害，伤害值因精灵盟友的数量而增强。 [x3]',
    build: skill(
      dmg('enemyFirstN', 3, 1, { n: 2, modifier: { mod: { kind: 'multiplier', a: 3 }, source: { kind: 'alliesOfRace', race: 'Elf' } } }),
    ),
  },
  {
    id: 9752,
    desc: '对前 2 名敌人造成 [魔法 + 3] 点伤害，伤害值因潘之谷盟友的数量而增强。 [x3]',
    build: skill(
      dmg('enemyFirstN', 3, 1, { n: 2, modifier: { mod: { kind: 'multiplier', a: 3 }, source: { kind: 'alliesOfKingdom', kingdom: 3003 } } }),
    ),
  },
  {
    id: 9753,
    desc: '对一名敌人造成 [魔法 + 4] 点伤害，伤害值因紫色盟友和龙族盟友的数量而增强。 [x3]',
    build: skill(
      dmg('enemyChosen', 4, 1, { modifier: { mod: { kind: 'multiplier', a: 3 }, sources: [{ kind: 'alliesOfColor', color: BaseColor.Purple }, { kind: 'alliesOfRace', race: 'Dragon' }] } }),
    ),
  },
  {
    id: 9754,
    desc: '爆破 [魔法 + 1] 颗绿色宝石。赋予所有狐人盟友一个随机正面增益效果。再召唤一名狐人军队。',
    build: skill(
      explodeRandomGems(1, 1, 'color', BaseColor.Green),
      inflictRandom('allyAll', { targetRace: 'Wargare', pool: 'positive' }),
      summonRandom(['WolfKnight', 'Ranger', 'Druid', 'Gnoll', 'Fenrir', 'WildFang', 'Amira', 'SavageHunter', 'Wayfinder', 'Wulfgarok', 'TotemGuardian', 'Spiritdancer', 'SirWulfric', 'ScurvySeadog', 'Tracker', 'BaneJaw', 'Moonsinger', 'UlfrHuntsmaster', 'QueenMoonclaw', 'WargareBrute', 'Persistence', 'VulpineMage', 'Bullygnoll', 'TheLordOfSlaughter', 'FrekiTheWild', 'AncestorBrodir', 'Harper', 'Voidcaller', 'FennecThief', 'FennecMage', 'VulpphireHunter', 'Fenix', 'ToddGreenwood', 'SableSpiritbane', 'Duelist', 'VulpineChampion', 'VulpineWatcher', 'CourtHerald', 'PhantomFox', 'ShadowFox', 'TheFoxfireKing', 'Inari', 'Spirittooth', 'KitTheSly', 'Timberwolf', 'KeeperOfThePaths', 'Aguara', 'SoulSummoner', 'Ragepaw', 'ExiledWargare', 'DragonknightAmira', 'Reavnarokkr', 'Woodseer', 'SpiritOfLuck', 'CourtWitch', 'SpiritcallerLila', 'WulfGheist', 'Kumiko', 'GorrMurktooth', 'Velosia', 'ImmortalKveldulf', 'BokSingefur'], undefined),
    ),
  },
  {
    id: 9809,
    desc: '造成[魔法 + 8]点散射伤害，伤害值因黄色宝石数量而增强。如果我方队伍中有不朽的卡奥玛尼，则引爆所有天使宝石。 [x8]',
    build: skill(
      // native order (R001): explode Angel gems, then CountGems Yellow, then ScatterDamage (sa-R1)
      explodeSpecialGems('angelGem', { ifCond: { kind: 'troopPresent', side: 'ally', name: '不朽的考马尼' } }),
      dmg('enemyAll', 8, 1, { range: 'all', modifier: { mod: { kind: 'multiplier', a: 8 }, source: { kind: 'boardGems', color: BaseColor.Yellow } } }),
    ),
  },
  {
    id: 9811,
    desc: '对一名敌人造成[魔法 + 2]点溅射伤害，伤害值因绿宝石数量而增强。如果我方队伍中有不朽的怪物，则吸取目标的所有法力值。 [x2]',
    build: skill(
      // sa-R7 (R001): native DecreaseMana@FromTarget [CountArmyTroop Immortal Monstera] precedes SplashHighDamage
      drainMana('enemyChosen', { ifCond: { kind: 'troopPresent', side: 'ally', name: '不朽的龟背竹' } }),
      dmgSplash('enemyChosen', 2, 1, { range: 'splash', modifier: { mod: { kind: 'multiplier', a: 2 }, source: { kind: 'boardGems', color: BaseColor.Green } } }),
    ),
  },
  {
    id: 9825,
    desc: '对一名敌人和一名随机敌人造成[魔法 + 3]点伤害，每级回火+2点。如果敌人使用蓝色法力值，则使其流血。如果敌人拥有末日效果，则先破坏其护甲。',
    build: doomedBlade(BaseColor.Blue),
  },
  {
    id: 9826,
    desc: '对一名敌人和一名随机敌人造成[魔法 + 3]点伤害，每级回火+2点。如果敌人使用绿色法力值，则使其流血。如果敌人拥有末日效果，则优先破坏其护甲。',
    build: doomedBlade(BaseColor.Green),
  },
  {
    id: 9827,
    desc: '对一名敌人和一名随机敌人造成[魔法 + 3]点伤害，每级回火+2点。如果敌人使用了红色法力值，则使其流血。如果敌人拥有末日效果，则先破坏其护甲。',
    build: doomedBlade(BaseColor.Red),
  },
  {
    id: 9828,
    desc: '对一名敌人和一名随机敌人造成[魔法 + 3]点伤害，每级回火+2点。如果敌人使用黄色法力值，则使其流血。如果敌人拥有末日效果，则先破坏其护甲。',
    build: doomedBlade(BaseColor.Yellow),
  },
  {
    id: 9829,
    desc: '对一名敌人和一名随机敌人造成[魔法 + 3]点伤害，每级回火+2点。如果敌人使用紫色法力值，则使其流血。如果敌人拥有末日效果，则先破坏其护甲。',
    build: doomedBlade(BaseColor.Purple),
  },
  {
    id: 9830,
    desc: '对一名敌人和一名随机敌人造成[魔法 + 3]点伤害，每级回火+2点。如果敌人使用棕色法力值，则使其流血。如果敌人拥有末日效果，则先破坏其护甲。',
    build: doomedBlade(BaseColor.Brown),
  },
  {
    id: 9831,
    desc: '将指定颜色的所有宝石转化为流血宝石。灼烧并流血所有该颜色的敌人。',
    build: skill(
      // Native ConvertGems 100 FromTarget>Bleed: only the chosen colour (sa-R2 L4b-1674-any).
      transformToSpecial(CHOSEN, 'bleedGem'),
      inflict('burning', 'enemyAll', { ifCond: { kind: 'targetColor', color: 'CHOSEN' } }),
      inflict('bleed', 'enemyAll', { ifCond: { kind: 'targetColor', color: 'CHOSEN' } }),
    ),
  },
  {
    id: 9832,
    desc: '爆破 [魔法 + 1] 颗绿色宝石。赋予所有齐埃金盟友一个随机正面增益效果。再召唤一名齐埃金军队。',
    build: skill(
      explodeRandomGems(1, 1, 'color', BaseColor.Green),
      inflictRandom('allyAll', { targetKingdom: 3004, pool: 'positive' }),
      summonRandom(rawKingdomPool(3004), undefined) /* native SummoningKingdom 3004 (zh '齐埃金' adds faction troops) */,
    ),
  },
  {
    id: 9833,
    desc: '对敌人造成[魔法 + 4]点伤害，红色盟友和罗刹盟友可提升伤害。 [x3]',
    build: skill(
      dmg('enemyChosen', 4, 1, { modifier: { mod: { kind: 'multiplier', a: 3 }, sources: [{ kind: 'alliesOfColor', color: BaseColor.Red }, { kind: 'alliesOfRace', race: 'Raksha' }] } }),
    ),
  },
  {
    id: 9834,
    desc: '对前 2 个敌人造成 [魔法 + 3] 点伤害，由构装体盟友加成。 [x3]',
    build: skill(
      dmg('enemyFirstN', 3, 1, { n: 2, modifier: { mod: { kind: 'multiplier', a: 3 }, source: { kind: 'alliesOfRace', race: 'Construct' } } }),
    ),
  },
  {
    id: 9835,
    desc: '爆破 [魔法 + 1] 颗黄色宝石。赋予所有日冕盟友一个随机正面增益效果。再召唤一名日冕军队。',
    build: ({"segments":[{"kind":"gem","params":{"op":"clear","mode":"explode","target":{"kind":"randomGems","count":{"base":1,"mult":1},"include":"color","color":"Yellow"}}},{"kind":"randomStatus","target":"allyAll","targetKingdom":3023,"pool":"positive"},{"kind":"summon","params":{"source":{"randomOf":rawKingdomPool(3023)}}}]} as SkillPrototype),
  },
  {
    id: 9836,
    desc: '对一名敌人造成[魔法 + 4]点伤害，蓝色盟友和人类盟友可提升伤害。 [x3]',
    build: skill(
      dmg('enemyChosen', 4, 1, { modifier: { mod: { kind: 'multiplier', a: 3 }, sources: [{ kind: 'alliesOfColor', color: BaseColor.Blue }, { kind: 'alliesOfRace', race: 'Human' }] } }),
    ),
  },
  {
    id: 9837,
    desc: '给予所有亡灵盟友 [魔法 + 1] 点攻击力和生命值，然后祝福这些盟友。',
    build: skill(attack('allyAll', 1, 1, { targetRace: 'Undead' }), heal('allyAll', 1, 1, { targetRace: 'Undead' }), inflict('blessed', 'allyAll', { targetRace: 'Undead' })),
  },
  {
    id: 9840,
    desc: '对一名敌人造成[魔法 + 2]点真实伤害，并使其燃烧。如果我方队伍中有不朽的穴居人，则爆破 4 颗许愿宝石。 [x4]',
    build: skill(
      trueDmg('enemyChosen', 2, 1, { trueDamage: true }),
      inflict('burning', 'lastTarget'),
      // native CountArmyTroop 7800 @AllAllies x400 -> ExplodeColor Wish UseCounterForAmount = 4 per Immortal Trogolin ally
      explodeRandomSpecialGems('wish', 0, 0, { modifier: { mod: { kind: 'multiplier', a: 4 }, source: { kind: 'alliesNamed', name: '不朽的穴居人' } } }),
    ),
  },
  {
    id: 9842,
    desc: '对所有敌人造成[魔法 + 2]点伤害，被蛛网束缚的敌人伤害加成。如果我方队伍中有不朽玛拉图斯，则将所有红色宝石转化为蛛网宝石。 [x3]',
    build: skill(
      // Native order: ConvertGems Red>Web (if Immortal Maratus) before the Webbed count and Damage.
      transformToSpecial(BaseColor.Red, 'web', { ifCond: { kind: 'troopPresent', side: 'ally', name: '不朽的马拉图斯' } }),
      dmg('enemyAll', 2, 1, { range: 'all', modifier: { mod: { kind: 'multiplier', a: 3 }, source: { kind: 'enemyStatusCount', statusId: 'web' } } }),
    ),
  },
  {
    id: 9876,
    desc: '对前 2 个敌人造成 [魔法 + 3] 点伤害，受到地狱峭壁盟友的加成。 [x3]',
    build: skill(
      dmg('enemyFirstN', 3, 1, { n: 2, modifier: { mod: { kind: 'multiplier', a: 3 }, source: { kind: 'alliesOfKingdom', kingdom: 3082 } } }),
    ),
  },
  {
    id: 9902,
    desc: '对一名敌人造成[魔法 + 11]点伤害。然后将该敌人一种法力颜色的4颗宝石转化为恐惧宝石。',
    build: skill(
      dmg('enemyChosen', 11, 1),
      transformToSpecial('LAST_TARGET', 'terrorGem', { count: 4 }),
    ),
  },
  {
    id: 9903,
    desc: '对 3 个随机敌人造成 [魔法 + 2] 点伤害。然后生成 3 个流血宝石。如果一个敌人死亡，则再生成 3 个流血宝石。',
    build: skill(
      // native Damage@RandomEnemy → 2 × Damage@RandomPrefNotPrevEnemy (R007-3: avoid only the previous hit)
      dmg('enemyRandom', 2, 1),
      dmg('enemyRandomPrefNotPrev', 2, 1),
      dmg('enemyRandomPrefNotPrev', 2, 1),
      createSpecialGems({ kind: 'bleedGem' }, 3, 0),
      createSpecialGems({ kind: 'bleedGem' }, 3, 0, { ifCond: { kind: 'anyTrackedDied' } }),
    ),
  },
  {
    id: 9904,
    desc: '对所有敌人造成[(魔法 x 1.75) + 5]点伤害。生成3个流血宝石、3个恐惧宝石、3个中毒宝石。如果敌人死亡，则每种宝石额外生成3个。',
    build: skill(
      dmg('enemyAll', 5, 1.75, { range: 'all' }),
      // native: CreateGems 3 Bleed / Terror / Poison, each [AddForKill 3] (R001 order)
      createSpecialGems({ kind: 'bleedGem' }, 3, 0),
      createSpecialGems({ kind: 'bleedGem' }, 3, 0, { ifTargetDied: true }),
      createSpecialGems({ kind: 'terrorGem' }, 3, 0),
      createSpecialGems({ kind: 'terrorGem' }, 3, 0, { ifTargetDied: true }),
      createSpecialGems({ kind: 'poisonGem' }, 3, 0),
      createSpecialGems({ kind: 'poisonGem' }, 3, 0, { ifTargetDied: true }),
    ),
  },
  {
    id: 9910,
    desc: '制作10颗毒宝石。然后对所有敌人施加1-2种随机状态效果。',
    build: ({"segments":[{"kind":"gem","params":{"op":"create","gem":{"kind":"special","spec":{"kind":"poisonGem"}},"count":{"base":10,"mult":0}}},{"kind":"randomStatus","target":"enemyAll"},{"kind":"randomStatus","target":"enemyAll","chance":0.5}]} as SkillPrototype),
  },
  {
    id: 9911,
    desc: '给予所有黑石盟友 [魔法 + 1] 点攻击力和生命值，然后祝福这些盟友。',
    build: skill(attack('allyAll', 1, 1, { targetKingdom: 3022 }), heal('allyAll', 1, 1, { targetKingdom: 3022 }), inflict('blessed', 'allyAll', { targetKingdom: 3022 })),
  },
  {
    id: 9912,
    desc: '对一名敌人造成[魔法 + 4]点伤害，红色盟友和兽人盟友可提升伤害。 [x3]',
    build: skill(
      dmg('enemyChosen', 4, 1, { modifier: { mod: { kind: 'multiplier', a: 3 }, sources: [{ kind: 'alliesOfColor', color: BaseColor.Red }, { kind: 'alliesOfRace', race: 'Orc' }] } }),
    ),
  },
  {
    id: 9913,
    desc: '对前 2 个敌人造成 [魔法 + 3] 点伤害，骑士盟友可提升伤害。 [x3]',
    build: skill(
      dmg('enemyFirstN', 3, 1, { n: 2, modifier: { mod: { kind: 'multiplier', a: 3 }, source: { kind: 'alliesOfRace', race: 'Knight' } } }),
    ),
  },
  {
    id: 9914,
    desc: '给予所有沃尔帕克盟友 [魔法 + 1] 点攻击力和生命值，然后祝福这些盟友。',
    build: skill(attack('allyAll', 1, 1, { targetKingdom: 3084 }), heal('allyAll', 1, 1, { targetKingdom: 3084 }), inflict('blessed', 'allyAll', { targetKingdom: 3084 })),
  },
  {
    id: 9915,
    desc: '对敌人造成[魔法 + 4]点伤害，受到绿色盟友和乌尔斯卡盟友的加成。 [x3]',
    build: skill(
      dmg('enemyChosen', 4, 1, { modifier: { mod: { kind: 'multiplier', a: 3 }, sources: [{ kind: 'alliesOfColor', color: BaseColor.Green }, { kind: 'alliesOfRace', race: 'Urska' }] } }),
    ),
  },
  {
    id: 9916,
    desc: '爆破 [魔法 + 1] 颗蓝色宝石。赋予所有海族盟友一个随机正面增益效果。再召唤一名海族部队。',
    build: ({"segments":[{"kind":"gem","params":{"op":"clear","mode":"explode","target":{"kind":"randomGems","count":{"base":1,"mult":1},"include":"color","color":"Blue"}}},{"kind":"randomStatus","pool":"positive","target":"allyAll","targetRace":"Merfolk"},{"kind":"summon","params":{"source":{"randomOf":["Sharkey","Troglodyte","Hammerhead","Hippocampus","Kuotani","Merlion","Azura","Waverider","Leviathan","Scylla","Shocktopus","Undine","MantisShrimp","Megavore","Nimue","Mermaid","Mershark","Hammerclaw","SeaWitch","TheDeepKing","Mervorax","Merknight","Nereida","Axolotl","Tuskor","Cyrene","Piscea","Anglerfin","Triton","ClamLasher","SeaScavenger","SeaHag","MantaRaider","TritonGuardMera","Treviamus","DagoNath","BloomManatee","Caspian","MaelstromDagoNath","Jellymaid","Sironia","ToxicPuffer","TidalDancer","Balearic","Ipanema","ImmortalThalassa"]}}}]} as SkillPrototype),
  },
  {
    id: 9934,
    desc: '对一名敌人造成[(魔法 x 2) + 3]点伤害，并施加2层流血效果。如果我方队伍中有不朽者克维尔杜夫，则额外施加1层流血效果和狼人诅咒效果。',
    build: skill(
      dmg('enemyChosen', 3, 2),
      inflict('bleed', 'lastTarget', { stacks: 2 }),
      inflict('bleed', 'lastTarget', { stacks: 1, ifCond: { kind: 'troopPresent', side: 'ally', name: '不朽的克维尔杜尔夫' } }),
      // sa-C r3: native CauseSpecificStatusEffectConditional Data lycanthropy (was Curse)
      inflict('lycanthropy', 'lastTarget', { ifCond: { kind: 'troopPresent', side: 'ally', name: '不朽的克维尔杜尔夫' } }),
    ),
  },
  {
    id: 9936,
    desc: '对一名敌人造成 [魔法 + 3] 点溅射伤害，并使自身狂暴。如果我方队伍中有不朽的陶拉乌斯，则所有友方单位获得 5 点攻击力、生命值和护甲值。 [x5]',
    build: ({"segments":[{"kind":"damage","target":"enemyChosen","scaling":{"base":3,"mult":1},"range":"splash","splashRatio":0.5},{"kind":"status","target":"allySelf","statusId":"rage","turns":3},{"kind":"buff","target":"allyAll","stat":"attack","scaling":{"base":5,"mult":0},"ifCond":{"kind":"troopPresent","side":"ally","name":"不朽的陶拉乌斯"}},{"kind":"buff","target":"allyAll","stat":"hp","scaling":{"base":5,"mult":0},"ifCond":{"kind":"troopPresent","side":"ally","name":"不朽的陶拉乌斯"},"lifeMode":"gain"},{"kind":"buff","target":"allyAll","stat":"armor","scaling":{"base":5,"mult":0},"ifCond":{"kind":"troopPresent","side":"ally","name":"不朽的陶拉乌斯"}}]} as SkillPrototype),
  },
  {
    id: 9971,
    desc: '对所有敌人造成[魔法 + 3]点伤害。然后生成8个蛛网宝石。',
    build: skill(
      dmg('enemyAll', 3, 1, { range: 'all' }),
      createSpecialGems({ kind: 'web' }, 8, 0),
    ),
  },
  {
    id: 9972,
    desc: '对敌人造成[魔法 + 4]点伤害，绿色盟友和神秘盟友可提升伤害。 [x3]',
    build: skill(
      dmg('enemyChosen', 4, 1, { modifier: { mod: { kind: 'multiplier', a: 3 }, sources: [{ kind: 'alliesOfColor', color: BaseColor.Green }, { kind: 'alliesOfRace', race: 'Mystic' }] } }),
    ),
  },
  {
    id: 9973,
    desc: '赋予所有元素盟友[魔法 + 1]点攻击力和生命值。然后祝福他们。',
    build: skill(
      attack('allyAll', 1, 1, { targetRace: 'Elemental' }),
      heal('allyAll', 1, 1, { targetRace: 'Elemental' }),
      inflict('blessed', 'allyAll', { targetRace: 'Elemental' }),
    ),
  },
  {
    id: 9974,
    desc: '对前 2 个敌人造成 [魔法 + 3] 点伤害，受到德拉克-祖姆盟友的加成。 [x3]',
    build: skill(
      dmg('enemyFirstN', 3, 1, { n: 2, modifier: { mod: { kind: 'multiplier', a: 3 }, source: { kind: 'alliesOfKingdom', kingdom: 3035 } } }),
    ),
  },
  {
    id: 9975,
    desc: '对敌人造成[魔法 + 4]点伤害，黄色盟友和机械盟友可提升伤害。 [x3]',
    build: skill(
      dmg('enemyChosen', 4, 1, { modifier: { mod: { kind: 'multiplier', a: 3 }, sources: [{ kind: 'alliesOfColor', color: BaseColor.Yellow }, { kind: 'alliesOfRace', race: 'Mech' }] } }),
    ),
  },
  {
    id: 9976,
    desc: '给予所有神秘盟友 [魔法 + 1] 点攻击力和生命值，然后祝福这些盟友。',
    build: skill(attack('allyAll', 1, 1, { targetRace: 'Mystic' }), heal('allyAll', 1, 1, { targetRace: 'Mystic' }), inflict('blessed', 'allyAll', { targetRace: 'Mystic' })),
  },
  {
    id: 9977,
    desc: '对前 2 个敌人造成 [魔法 + 3] 点伤害，受到荒野平原盟友的加成。 [x3]',
    build: skill(
      dmg('enemyFirstN', 3, 1, { n: 2, modifier: { mod: { kind: 'multiplier', a: 3 }, source: { kind: 'alliesOfKingdom', kingdom: 3027 } } }),
    ),
  },
  {
    id: 9983,
    desc: '对一名敌人造成[魔法 + 3]点伤害，骷髅头可提升伤害。如果我方队伍中有不朽泽法尔，则引爆所有死亡印记宝石。 [x2]',
    build: skill(
      // native order (R001): explode Death Mark gems, then CountGems Skull, then Damage (sa-R1)
      explodeSpecialGems('deathMarkGem', { ifCond: { kind: 'troopPresent', side: 'ally', name: '不朽的泽法尔' } }),
      dmg('enemyChosen', 3, 1, { modifier: { mod: { kind: 'multiplier', a: 2 }, source: { kind: 'boardSkulls' } } }),
    ),
  },
  {
    id: 9985,
    desc: '若我方队伍中有不朽的拜布利奥斯，使选定敌人陷入沉默。削减该敌人 [魔法 + 1] 点攻击力和 4 点魔法，两项削减均因被诅咒的敌人数而增强。 [x3]',
    build: skill(inflict('silence', 'enemyChosen', { ifCond: { kind: 'troopPresent', side: 'ally', name: '不朽的拜布利奥斯' } }), reduce('enemyChosen', 'attack', 1, 1, { modifier: { mod: { kind: 'multiplier', a: 3 }, source: { kind: 'enemyStatusCount', statusId: 'curse' } } }), reduce('lastTarget', 'magic', 4, 0, { modifier: { mod: { kind: 'multiplier', a: 3 }, source: { kind: 'enemyStatusCount', statusId: 'curse' } } })),
  },
  {
    id: 10003,
    desc: '给予一名盟友 [魔法 + 1] 点随机技能值，每提升一级强化等级额外增加3点。祝福所有蓝色盟友，诅咒所有蓝色敌人。如果敌人带有厄运效果，则获得额外回合。',
    build: skill(
      randomStat('allyChosen', 1, 1, { oneSkill: true, modifier: { mod: { kind: 'multiplier', a: 3 }, source: { kind: 'tempering' } } }),
      inflict('blessed', 'allyAll', { ifCond: { kind: 'targetColor', color: BaseColor.Blue } }),
      inflict('curse', 'enemyAll', { ifCond: { kind: 'targetColor', color: BaseColor.Blue } }),
      extraTurn({ ifCond: { kind: 'targetHasDoom' } }),
    ),
  },
  {
    id: 10005,
    desc: '给予一名盟友 [魔法 + 1] 点随机技能值，每提升一级强化等级额外增加3点。祝福所有红色盟友，诅咒所有红色敌人。如果敌人带有厄运效果，则获得额外回合。',
    build: skill(
      randomStat('allyChosen', 1, 1, { oneSkill: true, modifier: { mod: { kind: 'multiplier', a: 3 }, source: { kind: 'tempering' } } }),
      inflict('blessed', 'allyAll', { ifCond: { kind: 'targetColor', color: BaseColor.Red } }),
      inflict('curse', 'enemyAll', { ifCond: { kind: 'targetColor', color: BaseColor.Red } }),
      extraTurn({ ifCond: { kind: 'targetHasDoom' } }),
    ),
  },
  {
    id: 10006,
    desc: '给予一名盟友 [魔法 + 1] 点随机技能值，每提升一级强化等级额外增加3点。祝福所有黄色盟友，诅咒所有黄色敌人。如果敌人带有厄运效果，则获得额外回合。',
    build: skill(
      randomStat('allyChosen', 1, 1, { oneSkill: true, modifier: { mod: { kind: 'multiplier', a: 3 }, source: { kind: 'tempering' } } }),
      inflict('blessed', 'allyAll', { ifCond: { kind: 'targetColor', color: BaseColor.Yellow } }),
      inflict('curse', 'enemyAll', { ifCond: { kind: 'targetColor', color: BaseColor.Yellow } }),
      extraTurn({ ifCond: { kind: 'targetHasDoom' } }),
    ),
  },
  {
    id: 10008,
    desc: '给予一名盟友 [魔法 + 1] 点随机技能值，每提升一级强化等级额外增加3点。祝福所有棕色盟友，诅咒所有棕色敌人。如果敌人带有厄运效果，则获得额外回合。',
    build: skill(
      randomStat('allyChosen', 1, 1, { oneSkill: true, modifier: { mod: { kind: 'multiplier', a: 3 }, source: { kind: 'tempering' } } }),
      inflict('blessed', 'allyAll', { ifCond: { kind: 'targetColor', color: BaseColor.Brown } }),
      inflict('curse', 'enemyAll', { ifCond: { kind: 'targetColor', color: BaseColor.Brown } }),
      extraTurn({ ifCond: { kind: 'targetHasDoom' } }),
    ),
  },
  {
    id: 10015,
    desc: '对一名敌人造成[魔法 + 4]点伤害，绿色盟友和哥布林盟友可提升伤害。 [x3]',
    build: skill(
      dmg('enemyChosen', 4, 1, { modifier: { mod: { kind: 'multiplier', a: 3 }, sources: [{ kind: 'alliesOfColor', color: BaseColor.Green }, { kind: 'alliesOfRace', race: 'Goblin' }] } }),
    ),
  },
  {
    id: 10046,
    desc: '给予所有构装体盟友 [魔法 + 1] 点攻击力和生命值，然后祝福这些盟友。',
    build: skill(attack('allyAll', 1, 1, { targetRace: 'Construct' }), heal('allyAll', 1, 1, { targetRace: 'Construct' }), inflict('blessed', 'allyAll', { targetRace: 'Construct' })),
  },
  {
    id: 10047,
    desc: '对前 2 个敌人造成 [魔法 + 3] 点伤害，受到荆棘森林盟友的加成。 [x3]',
    build: skill(
      dmg('enemyFirstN', 3, 1, { n: 2, modifier: { mod: { kind: 'multiplier', a: 3 }, source: { kind: 'alliesOfKingdom', kingdom: 3015 } } }),
    ),
  },
  {
    id: 10048,
    desc: '对敌人造成[魔法 + 4]点伤害，黄色盟友和野人盟友可提升伤害。 [x3]',
    build: skill(
      dmg('enemyChosen', 4, 1, { modifier: { mod: { kind: 'multiplier', a: 3 }, sources: [{ kind: 'alliesOfColor', color: BaseColor.Yellow }, { kind: 'alliesOfRace', race: 'Wildfolk' }] } }),
    ),
  },
  {
    id: 10049,
    desc: '对前 2 个敌人造成 [魔法 + 3] 点伤害，野兽盟友可提升伤害。 [x3]',
    build: skill(
      dmg('enemyFirstN', 3, 1, { n: 2, modifier: { mod: { kind: 'multiplier', a: 3 }, source: { kind: 'alliesOfRace', race: 'Beast' } } }),
    ),
  },
  {
    id: 10050,
    desc: '给予所有聚沙之地盟友 [魔法 + 1] 点攻击力和生命值，然后祝福这些盟友。',
    build: skill(attack('allyAll', 1, 1, { targetKingdom: 3024 }), heal('allyAll', 1, 1, { targetKingdom: 3024 }), inflict('blessed', 'allyAll', { targetKingdom: 3024 })),
  },
];

export const BATCH_W04: CuratedBatch = { batch: 'W04', spells: SPELLS, skipped: SKIPPED };
