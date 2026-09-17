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
import { armor, attack, cleanse, createGems, createSpecialGems, destroyRandomRows, dmg, dmgSplash, explodeRandomGems, extraTurn, inflict, skill, summonRandom, transformToSpecial, trueDmg } from '../builders';
import { BaseColor } from '../../types';
import type { CuratedBatch } from './index';

const SKIPPED: { id: number; reason: string }[] = [];

const SPELLS: CuratedBatch['spells'] = [
  {
    id: 9267,
    desc: '爆破 [魔法 + 1] 颗黄色宝石。使所有白盔国盟友获得一个随机正面增益效果。再召唤一名白盔国军队。',
    build: skill(
      explodeRandomGems(1, 1, 'color', BaseColor.Yellow),
    ),
  },
  {
    id: 9301,
    desc: '爆破 [魔法 + 1] 颗红色宝石。给予所有猫族盟友一个随机正面增益状态效果。再召唤一名猫族军队。 ',
    build: skill(
      explodeRandomGems(1, 1, 'color', BaseColor.Red),
    ),
  },
  {
    id: 9302,
    desc: '对首 2 名敌人造成 [魔法 + 3] 点伤害，伤害值因玉银林地盟友数而增强。 [x3]',
    build: skill(
      dmg('enemyFirstN', 3, 1, { n: 2, modifier: { mod: { kind: 'multiplier', a: 3 }, source: { kind: 'teamSize', side: 'ally' } } }),
    ),
  },
  {
    id: 9303,
    desc: '对一名敌人造成 [魔法 + 4] 点伤害，伤害值因红色和元素盟友数而增强。 [x3]',
    build: skill(
      dmg('enemyChosen', 4, 1, { modifier: { mod: { kind: 'multiplier', a: 3 }, source: { kind: 'alliesOfRace', race: 'Elemental' } } }),
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
    desc: '爆破 [魔法 + 1] 颗蓝色宝石。赋予所有冰封之巅盟友一个随机正面增益状态效果。再召唤一名冰封之巅军队。',
    build: skill(
      explodeRandomGems(1, 1, 'color', BaseColor.Blue),
    ),
  },
  {
    id: 9306,
    desc: '对一名敌人造成 [魔法 + 4] 点伤害，伤害值因蓝色和不死族盟友数量而增强。 [x3]',
    build: skill(
      dmg('enemyChosen', 4, 1, { modifier: { mod: { kind: 'multiplier', a: 3 }, source: { kind: 'alliesOfRace', race: 'Undead' } } }),
    ),
  },
  {
    id: 9307,
    desc: '对一名敌人造成 [魔法 + 4] 点伤害，伤害值因棕色盟友和纳迦盟友数而增强。 [x3]',
    build: skill(
      dmg('enemyChosen', 4, 1, { modifier: { mod: { kind: 'multiplier', a: 3 }, source: { kind: 'alliesOfRace', race: 'Naga' } } }),
    ),
  },
  {
    id: 9349,
    desc: '造成 [魔法 + 8] 点散射伤害，伤害值因缠绕宝石数而增强。再创造 8 颗缠绕宝石。 [x8]',
    build: skill(
      dmg('enemyAll', 8, 1, { range: 'all', modifier: { mod: { kind: 'multiplier', a: 8 }, source: { kind: 'enemyStatusCount', statusId: 'entangle' } } }),
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
    ),
  },
  {
    id: 9352,
    desc: '对一名敌人造成 [魔法 + 4] 点伤害，伤害值因红色和恶魔盟友数而增强。 [x3]',
    build: skill(
      dmg('enemyChosen', 4, 1, { modifier: { mod: { kind: 'multiplier', a: 3 }, source: { kind: 'alliesOfRace', race: 'Daemon' } } }),
    ),
  },
  {
    id: 9353,
    desc: '对首 2 名敌人造成 [魔法 + 3] 点伤害，伤害值因盗贼盟友数而增强。 [x3]',
    build: skill(
      dmg('enemyFirstN', 3, 1, { n: 2, modifier: { mod: { kind: 'multiplier', a: 3 }, source: { kind: 'teamSize', side: 'ally' } } }),
    ),
  },
  {
    id: 9354,
    desc: '对首 2 名敌人造成 [魔法 + 3] 点伤害，伤害值因蛛尔卡里盟友数而增强。 [x3]',
    build: skill(
      dmg('enemyFirstN', 3, 1, { n: 2, modifier: { mod: { kind: 'multiplier', a: 3 }, source: { kind: 'teamSize', side: 'ally' } } }),
    ),
  },
  {
    id: 9355,
    desc: '对一名敌人造成 [魔法 + 4] 点伤害，伤害值因黄色和人马族盟友数而增强。 [x3]',
    build: skill(
      dmg('enemyChosen', 4, 1, { modifier: { mod: { kind: 'multiplier', a: 3 }, source: { kind: 'teamSize', side: 'ally' } } }),
    ),
  },
  {
    id: 9356,
    desc: '赋予一名盟友 [魔法 + 2] 点护甲值，每锻炼 1 个武器段位则 +3 点。赋予所有蓝色盟友屏障效果并击晕所有蓝色敌人。若敌方有劫数，则将 3 颗蓝色宝石转换成巨人蓝色宝石。',
    build: skill(
      inflict('stun', 'allyAll'),
    ),
  },
  {
    id: 9357,
    desc: '赋予一名盟友 [魔法 + 2] 点护甲值，每锻炼 1 个武器段位则 +3 点。赋予所有绿色盟友屏障效果并击晕所有绿色敌人。若敌方有劫数，则将 3 颗绿色宝石转换成巨人绿色宝石。',
    build: skill(
      inflict('stun', 'allyAll'),
    ),
  },
  {
    id: 9358,
    desc: '赋予一名盟友 [魔法 + 2] 点护甲值，每锻炼 1 个武器段位则 +3 点。赋予所有红色盟友屏障效果并击晕所有红色敌人。若敌方有劫数，则将 3 颗红色宝石转换成巨人红色宝石。',
    build: skill(
      inflict('stun', 'allyAll'),
    ),
  },
  {
    id: 9359,
    desc: '赋予一名盟友 [魔法 + 2] 点护甲值，每锻炼 1 个武器段位则 +3 点。赋予所有黄色盟友屏障效果并击晕所有黄色敌人。若敌方有劫数，则将 3 颗黄色宝石转换成巨人黄色宝石。',
    build: skill(
      inflict('stun', 'allyAll'),
    ),
  },
  {
    id: 9360,
    desc: '赋予一名盟友 [魔法 + 2] 点护甲值，每锻炼 1 个武器段位则 +3 点。赋予所有紫色盟友屏障效果并击晕所有紫色敌人。若敌方有劫数，则将 3 颗紫色宝石转换成巨人紫色宝石。',
    build: skill(
      inflict('stun', 'allyAll'),
    ),
  },
  {
    id: 9361,
    desc: '赋予一名盟友 [魔法 + 2] 点护甲值，每锻炼 1 个武器段位则 +3 点。赋予所有棕色盟友屏障效果并击晕所有棕色敌人。若敌方有劫数，则将 3 颗棕色宝石转换成巨人棕色宝石。',
    build: skill(
      inflict('stun', 'allyAll'),
    ),
  },
  {
    id: 9378,
    desc: '消除所有敌人正面增益效果，再创造 9 颗燃烧宝石。若永生神天界在队伍内，则再创造 5 颗燃烧宝石。 [x10]',
    build: skill(
      createSpecialGems({ kind: 'burningGem' }, 9, 0),
    ),
  },
  {
    id: 9379,
    desc: '将所有骷髅头转换成超级末日骷髅头，并获得 [(魔法 / 2) + 1] 点攻击力。若队伍里有永生神奥西弗，则获得一个额外回合。',
    build: skill(
      attack('allySelf', 1, 0.5),
      extraTurn({ ifCond: { kind: 'troopPresent', side: 'ally', name: '永生神奥西弗' } }),
    ),
  },
  {
    id: 9380,
    desc: '对一名敌人造成 [(魔法 x 2) + 3] 点伤害，伤害值因拥有屏障效果的盟友数而增强。若队伍里有永生神路西法，则爆破 3 颗宝石。 [x6]',
    build: skill(
      dmg('enemyChosen', 3, 2, { modifier: { mod: { kind: 'multiplier', a: 6 }, source: { kind: 'allyStatusCount', statusId: 'barrier' } } }),
      explodeRandomGems(3, 0, 'color', undefined, { ifCond: { kind: 'troopPresent', side: 'ally', name: '永生神路西法' } }),
    ),
  },
  {
    id: 9381,
    desc: '给予所有盟友 [(魔法 x 1.5) + 2] 点护甲值。若队伍里有永生神泰拉，则爆破所有击晕宝石。 [x10]',
    build: skill(
      armor('allyAll', 2, 1.5),
    ),
  },
  {
    id: 9382,
    desc: '创造 4 颗蓝龙宝石。若队伍里有永生神阿卡丽亚，则召唤一名随机龙族军队。',
    build: skill(
      createGems(BaseColor.Blue, 4, 0),
      summonRandom(['Sheggra', 'Venoxia', 'ShadowDragon', 'Emperina', 'Celestasia', 'BoneDragon', 'DrakeRider', 'Dimetraxia', 'Wyvern', 'Venbarak', 'Borealis', 'DragonEggs', 'BabyDragon', 'Dragonette', 'Dragotaur', 'Dragonmoth', 'Visk', 'TheDragonSoul', 'Couatl', 'Sylvanimora', 'DRACOS-1337', 'DragonianRogue', 'DragonianMonk', 'SilverDrakon', 'Krystenax', 'Drake', 'Elemaugrim', 'DragonTurtle', 'Asha', 'Leviathan', 'Penglong', 'Glitterclaw', 'TheWorldbreaker', 'Divinia', 'LordEmber', 'LadyGarnetia', 'Tinseltail', 'Shimmerscale', 'Volthrenax', 'Thaumaris', 'Droggo', 'Sylfrostenath', 'MatronDragotani', 'UndeadDrake', 'FellDragonEgg', 'FellDragon', 'Nocturnia', 'Ishtara', 'DragonianSage', 'Obregonia', 'DragonSpirit', 'Essencia', 'Huanglong', 'Veneratus', 'HornedWyrm', 'NetherWyrm', 'TerraWyrm', 'TheGreatWyrm', 'Tihamata', 'RedAhriman', 'TwinkleBerry', 'MagmaDragon', 'Sabellius', 'Adakite', 'Obsidiaxas', 'Sapphirax', 'Emeraldrin', 'Rubirath', 'Topasarth', 'Amethialas', 'Garnetaerlin', 'Diamantina', 'Aquaria', 'TheElderDragon', 'HeraldOfKrystenax', 'TheGuardianDragon', 'CobaltDrake', 'HuntmasterArborius', 'CrystalEggs', 'DragonstoneGuardian', 'TheVoidDragon', 'Comethalas', 'Nebuladryx', 'Meteoridan', 'Solarithus', 'Lunarelleon', 'Eklipsos', 'Stellarix', 'DraconicSentinel', 'Tianlong', 'BrassDrake', 'Venerabilax', 'Chromaticea', 'Kukulkan', 'ImmortalAquaria', 'Leucithrax', 'TheSlimeDragon', 'Bahamata', 'Gingeraxia', 'Belcerulea', 'Gladius', 'Thornaressa', 'Narcithus', 'Orrissea', 'Orchidius', 'Chrysantherax', 'Chargrimax', 'Crackleleaf', 'Mistmother', 'DrakeEggs', 'ImmortalDrakkon', 'CrimsonWyrmling', 'Dragonhawk', 'Amethony', 'Creteus', 'Krakynos', 'Runethius', 'Hematrax', 'Vizinium', 'Demizerius', 'Amenhotrex', 'Pandemonia'], undefined, { ifCond: { kind: 'troopPresent', side: 'ally', name: '永生神阿卡丽亚' } }),
    ),
  },
  {
    id: 9385,
    desc: '对一名敌人造成 [(魔法 x 2.5)] 点伤害，并使其下方所有敌人陷入出血状态。若队伍里有永生神萨克塔利安，则使所有敌人陷入出血状态。',
    build: skill(
      dmg('enemyChosen', 0, 2.5),
      inflict('bleed', 'enemyAll'),
      inflict('bleed', 'enemyAll', { ifCond: { kind: 'troopPresent', side: 'ally', name: '永生神萨克塔利安' } }),
    ),
  },
  {
    id: 9386,
    desc: '将所有绿色宝石转换成妖仙宝石并获得 [魔法 + 2] 点生命值。若队伍里有永生神维拉格，则获得一个额外回合。',
    build: skill(
      transformToSpecial(BaseColor.Green, 'faerieFireGem'),
      extraTurn({ ifCond: { kind: 'troopPresent', side: 'ally', name: '永生神维拉格' } }),
    ),
  },
  {
    id: 9387,
    desc: '对一名敌人造成 [(魔法 x 1.5) + 2] 点真实伤害，伤害值因炸弹宝石数而增强。若队伍里有永生神提泰纽斯，则随机摧毁 2 列。 [x2]',
    build: skill(
      trueDmg('enemyChosen', 2, 1.5, { trueDamage: true, modifier: { mod: { kind: 'multiplier', a: 2 }, source: { kind: 'boardSpecial', gem: 'bomb' } } }),
    ),
  },
  {
    id: 9388,
    desc: '净化所有盟友并创造 9 颗冻结宝石。若队伍里有永生神格拉西亚，则再创造 5 颗冻结宝石。 [x10]',
    build: skill(
      cleanse('allyAll'),
      createSpecialGems({ kind: 'freezeGem' }, 9, 0),
      createSpecialGems({ kind: 'freezeGem' }, 5, 0, { ifCond: { kind: 'troopPresent', side: 'ally', name: '永生神格拉西亚' }, modifier: { mod: { kind: 'multiplier', a: 10 } } }),
    ),
  },
  {
    id: 9484,
    desc: '摧毁 2 个随机行。如果我的队伍中有不朽的拉奇亚，则还摧毁 2 个随机列。 [x2]',
    build: skill(
      destroyRandomRows(2),
    ),
  },
  {
    id: 9486,
    desc: '对一名敌人造成 [魔法 + 3] 点伤害，伤害值因恶魔盟友数量而增强。如果我的队伍中有不朽的阿巴顿，则引爆所有恶魔传送门宝石。 [x4]',
    build: skill(
      dmg('enemyChosen', 3, 1, { modifier: { mod: { kind: 'multiplier', a: 4 }, source: { kind: 'alliesOfRace', race: 'Daemon' } } }),
    ),
  },
  {
    id: 9506,
    desc: '对前 2 名敌人造成 [魔法 + 3] 点伤害，伤害值因狐狸座盟友的数量而增强。 [x3]',
    build: skill(
      dmg('enemyFirstN', 3, 1, { n: 2 }),
    ),
  },
  {
    id: 9507,
    desc: '对敌人造成 [魔法 + 4] 点伤害，伤害值因黄色盟友和神圣盟友的数量而增强。 [x3]',
    build: skill(
      dmg('enemyChosen', 4, 1),
    ),
  },
  {
    id: 9508,
    desc: '引爆 [魔法 + 1] 颗黄色宝石。为所有 Stryx 盟友赋予随机状态效果。然后召唤一支 Stryx 部队。',
    build: skill(
      explodeRandomGems(1, 1, 'color', BaseColor.Yellow),
    ),
  },
  {
    id: 9509,
    desc: '引爆 [魔法 + 1] 颗紫色宝石。为所有马拉杰之罪盟友赋予随机状态效果。然后召唤一支马拉杰之罪部队。',
    build: skill(
      explodeRandomGems(1, 1, 'color', BaseColor.Purple),
    ),
  },
  {
    id: 9510,
    desc: '对敌人造成 [魔法 + 4] 点伤害，伤害值由红色盟友和金牛座盟友增强。 [x3]',
    build: skill(
      dmg('enemyChosen', 4, 1),
    ),
  },
  {
    id: 9511,
    desc: '引爆 [魔法 + 1] 颗紫色宝石。为所有半人马盟友赋予随机状态效果。然后召唤一支半人马部队。',
    build: skill(
      explodeRandomGems(1, 1, 'color', BaseColor.Purple),
    ),
  },
  {
    id: 9523,
    desc: '净化自身，然后随机对敌方队伍造成 9 层流血效果。',
    build: skill(
      cleanse('allySelf'),
    ),
  },
  {
    id: 9564,
    desc: '对最后一名敌人造成 [魔法 + 2] 点伤害，伤害值因紫色宝石数量而增强。如果我的队伍中有永生塞勒涅，则将一半法力值给予所有其他盟友。 [x4]',
    build: skill(
      dmg('enemyLast', 2, 1, { modifier: { mod: { kind: 'multiplier', a: 4 }, source: { kind: 'boardGems', color: BaseColor.Purple } } }),
    ),
  },
  {
    id: 9566,
    desc: '对一名敌人造成 [魔法 + 12] 点溅射伤害，并使所有受影响的敌人流血。如果我的队伍中有不朽双子，则将敌人法力颜色之一的所有宝石转换为紫色。',
    build: skill(
      dmgSplash('enemyChosen', 12, 1, { range: 'splash' }),
    ),
  },
  {
    id: 9574,
    desc: '对前 2 名敌人造成 [魔法 + 3] 点伤害，伤害值因银林地盟友的数量而增强。 [x3]',
    build: skill(
      dmg('enemyFirstN', 3, 1, { n: 2 }),
    ),
  },
  {
    id: 9575,
    desc: '对敌人造成 [魔法 + 4] 点伤害，伤害值因棕色盟友和乌尔斯卡盟友的数量而增强。 [x3]',
    build: skill(
      dmg('enemyChosen', 4, 1),
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
    desc: '引爆 [魔法 + 1] 颗棕色宝石。为所有地狱岩盟友赋予随机状态效果。然后召唤地狱岩部队。',
    build: skill(
      explodeRandomGems(1, 1, 'color', BaseColor.Brown),
    ),
  },
  {
    id: 9578,
    desc: '对敌人造成 [魔法 + 4] 点伤害，伤害值因红色盟友和仙灵盟友的数量而增强。 [x3]',
    build: skill(
      dmg('enemyChosen', 4, 1),
    ),
  },
  {
    id: 9579,
    desc: '对一名敌人造成 [魔法 + 3] 点伤害。每有一个亡灵盟友，则消耗 3 点法力。 [x3]',
    build: skill(
      dmg('enemyChosen', 3, 1),
    ),
  },
  {
    id: 9580,
    desc: '对敌人造成 [魔法 + 3] 点伤害，每级回火 +4 点。如果他们使用蓝色法力，则引爆 3 颗蓝色宝石。如果敌人有毁灭之力，则恢复我四分之一的法力。',
    build: skill(
      dmg('enemyChosen', 3, 1),
    ),
  },
  {
    id: 9581,
    desc: '对敌人造成 [魔法 + 3] 点伤害，每级回火 +4 点。如果敌人使用绿色法力，则引爆 3 颗绿色宝石。如果敌人有毁灭之力，则恢复我四分之一的法力。',
    build: skill(
      dmg('enemyChosen', 3, 1),
    ),
  },
  {
    id: 9582,
    desc: '对敌人造成 [魔法 + 3] 点伤害，每级回火 +4 点。如果敌人使用红色法力，则引爆 3 颗红色宝石。如果敌人有毁灭之力，则恢复我四分之一的法力。',
    build: skill(
      dmg('enemyChosen', 3, 1),
    ),
  },
  {
    id: 9583,
    desc: '对敌人造成 [魔法 + 3] 点伤害，每级回火 +4 点。如果敌人使用黄色法力，则引爆 3 颗黄色宝石。如果敌人有毁灭之力，则恢复我四分之一的法力。',
    build: skill(
      dmg('enemyChosen', 3, 1),
    ),
  },
  {
    id: 9584,
    desc: '对敌人造成 [魔法 + 3] 点伤害，每级回火 +4 点。如果他们使用紫色法力，则引爆 3 颗紫色宝石。如果敌人有毁灭之力，则恢复我四分之一的法力。',
    build: skill(
      dmg('enemyChosen', 3, 1),
    ),
  },
  {
    id: 9585,
    desc: '对敌人造成 [魔法 + 3] 点伤害，每级回火 +4 点。如果他们使用棕色法力，则引爆 3 颗棕色宝石。如果敌人有毁灭之力，则恢复我四分之一的法力。',
    build: skill(
      dmg('enemyChosen', 3, 1),
    ),
  },
  {
    id: 9628,
    desc: '引爆 [魔法 + 1] 颗棕色宝石。为所有 Dhrak-Zum 盟友赋予随机状态效果。然后召唤一支 Dhrak-Zum 部队。',
    build: skill(
      explodeRandomGems(1, 1, 'color', BaseColor.Brown),
    ),
  },
  {
    id: 9629,
    desc: '对敌人造成 [魔法 + 3] 点溅射伤害。创造 7 颗沉没宝石。如果一名敌人死亡，则再创造 4 颗。',
    build: skill(
      dmgSplash('enemyChosen', 3, 1, { range: 'splash' }),
      createSpecialGems({ kind: 'submergeGem' }, 7, 0),
    ),
  },
  {
    id: 9630,
    desc: '对敌人造成 [魔法 + 4] 点伤害，伤害值因棕色盟友和巨型盟友的数量而增强。 [x3]',
    build: skill(
      dmg('enemyChosen', 4, 1),
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
      dmg('enemyFirstN', 3, 1, { n: 2 }),
    ),
  },
  {
    id: 9633,
    desc: '对一名敌人造成 [魔法 + 4] 点伤害，伤害值因蓝色盟友和仙灵盟友的数量而增强。 [x3]',
    build: skill(
      dmg('enemyChosen', 4, 1),
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
    desc: '对前 2 名敌人造成 [魔法 + 3] 点伤害，伤害值因 Merlantis 盟友数量而增强。 [x3]',
    build: skill(
      dmg('enemyFirstN', 3, 1, { n: 2, modifier: { mod: { kind: 'multiplier', a: 3 }, source: { kind: 'teamSize', side: 'ally' } } }),
    ),
  },
  {
    id: 9636,
    desc: '对一名敌人造成 [魔法 + 4] 点伤害，伤害值因绿色盟友和野蛮人盟友的数量而增强。 [x3]',
    build: skill(
      dmg('enemyChosen', 4, 1),
    ),
  },
  {
    id: 9649,
    desc: '造成[魔法 + 8]点散射伤害，伤害值因绿龙宝石数量而增强。如果我的队伍中有不朽的德拉肯，则随机召唤一条龙。 [x4]',
    build: skill(
      dmg('enemyAll', 8, 1, { range: 'all', modifier: { mod: { kind: 'multiplier', a: 4 }, source: { kind: 'boardGems', color: BaseColor.Green } } }),
    ),
  },
  {
    id: 9687,
    desc: '对一名敌人造成[魔法 + 3]点伤害，伤害值因诅咒宝石数量而增强。如果敌人已中毒，则造成双倍伤害。然后使其中毒。 [x3]',
    build: skill(
      dmg('enemyChosen', 3, 1, { modifier: { mod: { kind: 'multiplier', a: 3 }, source: { kind: 'enemyStatusCount', statusId: 'curse' } } }),
    ),
  },
  {
    id: 9688,
    desc: '对前 2 名敌人造成 [魔法 + 3] 点伤害，伤害值因神圣盟友数而增强。 [x3]',
    build: skill(
      dmg('enemyFirstN', 3, 1, { n: 2, modifier: { mod: { kind: 'multiplier', a: 3 }, source: { kind: 'teamSize', side: 'ally' } } }),
    ),
  },
  {
    id: 9689,
    desc: '对前 2 名敌人造成 [魔法 + 3] 点伤害，伤害值因阿达纳盟友的数量而增强。 [x3]',
    build: skill(
      dmg('enemyFirstN', 3, 1, { n: 2 }),
    ),
  },
  {
    id: 9690,
    desc: '对一名敌人造成 [魔法 + 4] 点伤害，伤害值因黄色盟友和骑士盟友的数量而增强。 [x3]',
    build: skill(
      dmg('enemyChosen', 4, 1, { modifier: { mod: { kind: 'multiplier', a: 3 }, source: { kind: 'alliesOfRace', race: 'Knight' } } }),
    ),
  },
  {
    id: 9692,
    desc: '对前 2 名敌人造成 [魔法 + 3] 点伤害，伤害值因流沙盟友的数量而增强。 [x3]',
    build: skill(
      dmg('enemyFirstN', 3, 1, { n: 2 }),
    ),
  },
  {
    id: 9693,
    desc: '对一名敌人造成 [魔法 + 4] 点伤害，伤害值因棕色盟友和矮人盟友的数量而增强。 [x3]',
    build: skill(
      dmg('enemyChosen', 4, 1, { modifier: { mod: { kind: 'multiplier', a: 3 }, source: { kind: 'alliesOfRace', race: 'Dwarf' } } }),
    ),
  },
  {
    id: 9720,
    desc: '引爆5颗宝石，因盟友受到屏障而增强。若我方队伍中有不朽者扎卡利尔，则获得额外回合。 [1:1]',
    build: skill(
      explodeRandomGems(5, 0, 'color', undefined),
    ),
  },
  {
    id: 9722,
    desc: '造成[魔法 + 6]点散射伤害，伤害值因暗影星辰而增强。如果我方队伍中有不朽雷奥，则对所有敌人施加2层流血效果。 [x8]',
    build: skill(
      dmg('enemyAll', 6, 1, { range: 'all' }),
    ),
  },
  {
    id: 9747,
    desc: '对一名敌人造成[魔法 + 3]溅射伤害，伤害值因激怒宝石数量而增强。然后引爆3颗激怒宝石。 [x6]',
    build: skill(
      dmgSplash('enemyChosen', 3, 1, { range: 'splash', modifier: { mod: { kind: 'multiplier', a: 6 }, source: { kind: 'boardSpecial', gem: 'enrageGem' } } }),
    ),
  },
  {
    id: 9749,
    desc: '对前 2 名敌人造成 [魔法 + 3] 点伤害，伤害值因圣力场盟友的数量而增强。 [x3]',
    build: skill(
      dmg('enemyFirstN', 3, 1, { n: 2 }),
    ),
  },
  {
    id: 9750,
    desc: '对一名敌人造成 [魔法 + 4] 点伤害，伤害值因棕色盟友和金牛座盟友的数量而增强。 [x3]',
    build: skill(
      dmg('enemyChosen', 4, 1),
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
      dmg('enemyFirstN', 3, 1, { n: 2 }),
    ),
  },
  {
    id: 9753,
    desc: '对一名敌人造成 [魔法 + 4] 点伤害，伤害值因紫色盟友和龙族盟友的数量而增强。 [x3]',
    build: skill(
      dmg('enemyChosen', 4, 1, { modifier: { mod: { kind: 'multiplier', a: 3 }, source: { kind: 'alliesOfRace', race: 'Dragon' } } }),
    ),
  },
  {
    id: 9754,
    desc: '引爆[魔法 + 1]颗绿色宝石。赋予所有战神盟友随机状态效果。然后召唤一支战神部队。',
    build: skill(
      explodeRandomGems(1, 1, 'color', BaseColor.Green),
    ),
  },
  {
    id: 9809,
    desc: '造成[魔法 + 8]点散射伤害，伤害值因黄色宝石数量而增强。如果我方队伍中有不朽的卡奥玛尼，则引爆所有天使宝石。 [x8]',
    build: skill(
      dmg('enemyAll', 8, 1, { range: 'all', modifier: { mod: { kind: 'multiplier', a: 8 }, source: { kind: 'boardGems', color: BaseColor.Yellow } } }),
    ),
  },
  {
    id: 9811,
    desc: '对一名敌人造成[魔法 + 2]点溅射伤害，伤害值因绿宝石数量而增强。如果我方队伍中有不朽的怪物，则吸取目标的所有法力值。 [x2]',
    build: skill(
      dmgSplash('enemyChosen', 2, 1, { range: 'splash', modifier: { mod: { kind: 'multiplier', a: 2 }, source: { kind: 'boardGems', color: BaseColor.Green } } }),
    ),
  },
  {
    id: 9832,
    desc: '引爆[魔法 + 1]颗绿色宝石。随机赋予所有扎金盟友一个状态效果。然后召唤一个扎金部队。',
    build: skill(
      explodeRandomGems(1, 1, 'color', BaseColor.Green),
    ),
  },
  {
    id: 9833,
    desc: '对敌人造成[魔法 + 4]点伤害，红色盟友和罗刹盟友可提升伤害。 [x3]',
    build: skill(
      dmg('enemyChosen', 4, 1),
    ),
  },
  {
    id: 9834,
    desc: '对前 2 个敌人造成 [魔法 + 3] 点伤害，由构装体盟友加成。 [x3]',
    build: skill(
      dmg('enemyFirstN', 3, 1, { n: 2 }),
    ),
  },
  {
    id: 9835,
    desc: '引爆1颗黄色宝石。随机赋予所有日冠盟友一个状态效果。然后召唤一支日冠部队。',
    build: skill(
      explodeRandomGems(1, 0, 'color', BaseColor.Yellow),
    ),
  },
  {
    id: 9836,
    desc: '对一名敌人造成[魔法 + 4]点伤害，蓝色盟友和人类盟友可提升伤害。 [x3]',
    build: skill(
      dmg('enemyChosen', 4, 1),
    ),
  },
  {
    id: 9840,
    desc: '对一名敌人造成[魔法 + 2]点真实伤害，并使其燃烧。如果我方队伍中有不朽巨龟，则引爆4颗许愿宝石。 [x4]',
    build: skill(
      trueDmg('enemyChosen', 2, 1, { trueDamage: true }),
    ),
  },
  {
    id: 9842,
    desc: '对所有敌人造成[魔法 + 2]点伤害，被蛛网束缚的敌人伤害加成。如果我方队伍中有不朽玛拉图斯，则将所有红色宝石转化为蛛网宝石。 [x3]',
    build: skill(
      dmg('enemyAll', 2, 1, { range: 'all' }),
    ),
  },
  {
    id: 9876,
    desc: '对前 2 个敌人造成 [魔法 + 3] 点伤害，受到地狱峭壁盟友的加成。 [x3]',
    build: skill(
      dmg('enemyFirstN', 3, 1, { n: 2 }),
    ),
  },
  {
    id: 9902,
    desc: '对一名敌人造成[魔法 + 11]点伤害。然后将该敌人一种法力颜色的4颗宝石转化为恐惧宝石。',
    build: skill(
      dmg('enemyChosen', 11, 1),
    ),
  },
  {
    id: 9903,
    desc: '对 3 个随机敌人造成 [魔法 + 2] 点伤害。然后生成 3 个流血宝石。如果一个敌人死亡，则再生成 3 个流血宝石。',
    build: skill(
      dmg('enemyRandomN', 2, 1, { n: 3 }),
    ),
  },
  {
    id: 9904,
    desc: '对所有敌人造成[(魔法 x 1.75) + 5]点伤害。生成3个流血宝石、3个恐惧宝石、3个中毒宝石。如果敌人死亡，则额外生成3个流血宝石和3个恐惧宝石。',
    build: skill(
      dmg('enemyAll', 5, 1.75, { range: 'all' }),
    ),
  },
  {
    id: 9912,
    desc: '对一名敌人造成[魔法 + 4]点伤害，红色盟友和兽人盟友可提升伤害。 [x3]',
    build: skill(
      dmg('enemyChosen', 4, 1),
    ),
  },
  {
    id: 9913,
    desc: '对前 2 个敌人造成 [魔法 + 3] 点伤害，骑士盟友可提升伤害。 [x3]',
    build: skill(
      dmg('enemyFirstN', 3, 1, { n: 2 }),
    ),
  },
  {
    id: 9915,
    desc: '对敌人造成[魔法 + 4]点伤害，受到绿色盟友和乌尔斯卡盟友的加成。 [x3]',
    build: skill(
      dmg('enemyChosen', 4, 1),
    ),
  },
  {
    id: 9916,
    desc: '引爆1颗蓝色宝石。随机赋予所有美人鱼盟友一个状态效果。然后召唤一支美人鱼部队。',
    build: skill(
      explodeRandomGems(1, 0, 'color', BaseColor.Blue),
    ),
  },
  {
    id: 9934,
    desc: '对一名敌人造成[(魔法 x 2) + 3]点伤害，并施加2层流血效果。如果我方队伍中有不朽者克维尔杜夫，则额外施加1层流血效果和狼人诅咒效果。',
    build: skill(
      dmg('enemyChosen', 3, 2),
    ),
  },
  {
    id: 9936,
    desc: '对一名敌人造成1点溅射伤害，并使自身狂暴。如果我方队伍中有不朽牛头怪，则所有友方单位获得5点攻击力、生命值和护甲值。 [x5]',
    build: skill(
      dmgSplash('enemyChosen', 1, 0, { range: 'splash' }),
    ),
  },
  {
    id: 9971,
    desc: '对所有敌人造成[魔法 + 3]点伤害。然后生成8个蛛网宝石。',
    build: skill(
      dmg('enemyAll', 3, 1, { range: 'all' }),
    ),
  },
  {
    id: 9972,
    desc: '对敌人造成[魔法 + 4]点伤害，绿色盟友和神秘盟友可提升伤害。 [x3]',
    build: skill(
      dmg('enemyChosen', 4, 1),
    ),
  },
  {
    id: 9974,
    desc: '对前 2 个敌人造成 [魔法 + 3] 点伤害，受到德拉克-祖姆盟友的加成。 [x3]',
    build: skill(
      dmg('enemyFirstN', 3, 1, { n: 2 }),
    ),
  },
  {
    id: 9975,
    desc: '对敌人造成[魔法 + 4]点伤害，黄色盟友和机械盟友可提升伤害。 [x3]',
    build: skill(
      dmg('enemyChosen', 4, 1),
    ),
  },
  {
    id: 9977,
    desc: '对前 2 个敌人造成 [魔法 + 3] 点伤害，受到荒野平原盟友的加成。 [x3]',
    build: skill(
      dmg('enemyFirstN', 3, 1, { n: 2 }),
    ),
  },
  {
    id: 9983,
    desc: '对一名敌人造成[魔法 + 3]点伤害，骷髅头可提升伤害。如果我方队伍中有不朽泽法尔，则引爆所有死亡印记宝石。 [x2]',
    build: skill(
      dmg('enemyChosen', 3, 1),
    ),
  },
  {
    id: 10003,
    desc: '随机给予一名盟友1点技能点数，每提升一级强化等级额外增加3点。祝福所有蓝色盟友，诅咒所有蓝色敌人。如果敌人带有厄运效果，则获得额外回合。',
    build: skill(
      inflict('curse', 'enemyAll'),
    ),
  },
  {
    id: 10005,
    desc: '随机给予一名盟友1点技能点数，每提升一级强化等级额外增加3点。祝福所有红色盟友，诅咒所有红色敌人。如果敌人带有厄运效果，则获得额外回合。',
    build: skill(
      inflict('curse', 'enemyAll'),
    ),
  },
  {
    id: 10006,
    desc: '随机给予一名盟友1点技能点数，每提升一级强化等级额外增加3点。祝福所有黄色盟友，诅咒所有黄色敌人。如果敌人带有厄运效果，则获得额外回合。',
    build: skill(
      inflict('curse', 'enemyAll'),
    ),
  },
  {
    id: 10008,
    desc: '随机给予一名盟友1点技能点数，每提升一级强化等级额外增加3点。祝福所有棕色盟友，诅咒所有棕色敌人。如果敌人带有厄运效果，则获得额外回合。',
    build: skill(
      inflict('curse', 'enemyAll'),
    ),
  },
  {
    id: 10015,
    desc: '对一名敌人造成[魔法 + 4]点伤害，绿色盟友和哥布林盟友可提升伤害。 [x3]',
    build: skill(
      dmg('enemyChosen', 4, 1),
    ),
  },
  {
    id: 10047,
    desc: '对前 2 个敌人造成 [魔法 + 3] 点伤害，受到荆棘森林盟友的加成。 [x3]',
    build: skill(
      dmg('enemyFirstN', 3, 1, { n: 2 }),
    ),
  },
  {
    id: 10048,
    desc: '对敌人造成[魔法 + 4]点伤害，黄色盟友和野人盟友可提升伤害。 [x3]',
    build: skill(
      dmg('enemyChosen', 4, 1),
    ),
  },
  {
    id: 10049,
    desc: '对前 2 个敌人造成 [魔法 + 3] 点伤害，野兽盟友可提升伤害。 [x3]',
    build: skill(
      dmg('enemyFirstN', 3, 1, { n: 2 }),
    ),
  },
];

export const BATCH_W04: CuratedBatch = { batch: 'W04', spells: SPELLS, skipped: SKIPPED };
