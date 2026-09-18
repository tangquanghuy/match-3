/**
 * 窗口 K-B · 武器法术批次 W02（池：scripts/curated-pools/pool-w01.json；分保真度绑定）。
 *
 * 来源：artifacts/gowhead-weapons/weapons.json（zh 文本逐字锚定，校验见
 * tests/unit/weaponSpellAudit.test.ts——与部队批次的 troops.json 锚定不同源）。
 * 保真度：本批全部为 full/partial（partial = 可编译子句照常入 build、卡点子句按
 * missingFeatures/skippedClauses 略去；mana-only 占位绑定不进批次，见
 * src/data/weapon-skill-meta.json）。组装规则锚定 scripts/spell-rules.md 与
 * 既有部队批次先例；生成器 scripts/_weapon_pools.mjs gen。
 */
import { armor, attack, cleanse, createGems, createGemsMixAny, createMix, createSkulls, createStorm, destroyChosenCol, destroyColor, dmg, dmgSplash, drainMana, explodeColor, explodeRandomGems, extraTurn, gainGold, heal, inflict, inflictRandom, magic, mana, oneOf, reduce, reposition, skill, steal, summonRandom, summonRandomOfKingdom, transformToSpecial, trueDmg, CHOSEN } from '../builders';
import { BaseColor } from '../../types';
import type { CuratedBatch } from './index';

const SKIPPED: { id: number; reason: string }[] = [];

const SPELLS: CuratedBatch['spells'] = [
  {
    id: 7660,
    desc: '造成 [魔法 + 10] 点散射伤害，每锻炼 1 个武器段位则 +4 点伤害值。每有一名棕色敌人则创造 6 颗混合棕色和骷髅头的宝石。给予所有盟友 3 点魔法值。如果敌方有劫数，则再增加 5 点。 [x6]',
    build: skill(
      dmg('enemyAll', 10, 1, { range: 'all', modifier: { mod: { kind: 'multiplier', a: 4 }, source: { kind: 'tempering' } } }),
      createGemsMixAny([BaseColor.Brown, 'SKULL'], 0, 0, { modifier: { mod: { kind: 'multiplier', a: 6 }, source: { kind: 'enemiesOfColor', color: BaseColor.Brown } } }),
      magic('allyAll', 3, 0, { condBonus: { n: 5, cond: { kind: 'targetHasDoom' } } }),
    ),
  },
  {
    id: 7662,
    desc: '对一名敌人造成 [魔法 + 7] 点伤害，伤害值因潘神之谷友数而增强。每有一名潘神之谷盟友，则创造混合绿色和黄色的 6 颗宝石。 [x6]',
    build: skill(
      dmg('enemyChosen', 7, 1, { modifier: { mod: { kind: 'multiplier', a: 6 }, source: { kind: 'alliesOfKingdom', kingdom: '潘神之谷' } } }),
      createMix([BaseColor.Green, BaseColor.Yellow], 6, 0, { modifier: { mod: { kind: 'multiplier', a: 6 }, source: { kind: 'alliesOfKingdom', kingdom: '潘神之谷' } } }),
    ),
  },
  {
    id: 7688,
    desc: '对一名敌人造成 [魔法 + 7] 点伤害，伤害值因野兽盟友数而增强。每有一名野兽盟友，则创造 6 颗宝石，所创造的宝石混合绿色和黄色两种颜色。 [x6]',
    build: skill(
      dmg('enemyChosen', 7, 1, { modifier: { mod: { kind: 'multiplier', a: 6 }, source: { kind: 'alliesOfRace', race: 'Beast' } } }),
      createMix([BaseColor.Green, BaseColor.Yellow], 6, 0, { modifier: { mod: { kind: 'multiplier', a: 6 }, sources: [{ kind: 'alliesOfRace', race: 'Beast' }] } }),
    ),
  },
  {
    id: 7692,
    desc: '对一名敌人造成 [魔法 + 7] 点伤害，伤害值因冰峰之巅盟友数而增强。每有一名冰峰之巅盟友，则创造 6 颗宝石，所创造的宝石混合蓝色和紫色两种颜色。 [x6]',
    build: skill(
      dmg('enemyChosen', 7, 1, { modifier: { mod: { kind: 'multiplier', a: 6 }, source: { kind: 'alliesOfKingdom', kingdom: '冰峰之巅' } } }),
      createMix([BaseColor.Blue, BaseColor.Purple], 6, 0, { modifier: { mod: { kind: 'multiplier', a: 6 }, source: { kind: 'alliesOfKingdom', kingdom: '冰峰之巅' } } }),
    ),
  },
  {
    id: 7695,
    desc: '对一名敌人造成 [魔法 + 7] 点伤害，伤害值因机械盟友数而增强。每有一名机械盟友，则创造 6 颗宝石，所创造的宝石混合红色和蓝色两种颜色。 [x6]',
    build: skill(
      dmg('enemyChosen', 7, 1, { modifier: { mod: { kind: 'multiplier', a: 6 }, source: { kind: 'alliesOfRace', race: 'Mech' } } }),
      createMix([BaseColor.Red, BaseColor.Blue], 6, 0, { modifier: { mod: { kind: 'multiplier', a: 6 }, sources: [{ kind: 'alliesOfRace', race: 'Mech' }] } }),
    ),
  },
  {
    id: 7702,
    desc: '对一名敌人造成 [魔法 + 7] 点伤害，伤害值因元素盟友数而增强。每有一名元素盟友，则创造 6 颗宝石，所创造的宝石混合蓝色和绿色两种颜色。 [x6]',
    build: skill(
      dmg('enemyChosen', 7, 1, { modifier: { mod: { kind: 'multiplier', a: 6 }, source: { kind: 'alliesOfRace', race: 'Elemental' } } }),
      createMix([BaseColor.Blue, BaseColor.Green], 6, 0, { modifier: { mod: { kind: 'multiplier', a: 6 }, sources: [{ kind: 'alliesOfRace', race: 'Elemental' }] } }),
    ),
  },
  {
    id: 7707,
    desc: '对一名敌人造成 [魔法 + 7] 点伤害，伤害值因剑锋崖盟友数而增强。每有一名剑锋崖盟友，则创造 6 颗宝石，所创造的宝石混合蓝色和黄色两种颜色。 [x6]',
    build: skill(
      dmg('enemyChosen', 7, 1, { modifier: { mod: { kind: 'multiplier', a: 6 }, source: { kind: 'alliesOfKingdom', kingdom: '剑锋崖' } } }),
      createMix([BaseColor.Blue, BaseColor.Yellow], 6, 0, { modifier: { mod: { kind: 'multiplier', a: 6 }, source: { kind: 'alliesOfKingdom', kingdom: '剑锋崖' } } }),
    ),
  },
  {
    id: 7711,
    desc: '对一名敌人造成 [魔法 + 7] 点伤害，伤害值因神祇盟友数而增强。每有一名神祇盟友，则创造 6 颗宝石，所创造的宝石混合红色和黄色两种颜色。 [x6]',
    build: skill(
      dmg('enemyChosen', 7, 1, { modifier: { mod: { kind: 'multiplier', a: 6 }, source: { kind: 'alliesOfRace', race: 'Divine' } } }),
      createMix([BaseColor.Red, BaseColor.Yellow], 6, 0, { modifier: { mod: { kind: 'multiplier', a: 6 }, sources: [{ kind: 'alliesOfRace', race: 'Divine' }] } }),
    ),
  },
  {
    id: 7722,
    desc: '对一名敌人造成 [魔法 + 7] 点伤害，伤害值因盛唐盟友数而增强。每有一名盛唐盟友，则创造 6 颗宝石，所创造的宝石混合红色和黄色两种颜色。色 [x6]',
    build: skill(
      dmg('enemyChosen', 7, 1, { modifier: { mod: { kind: 'multiplier', a: 6 }, source: { kind: 'alliesOfKingdom', kingdom: '盛唐' } } }),
      createMix([BaseColor.Red, BaseColor.Yellow], 6, 0, { modifier: { mod: { kind: 'multiplier', a: 6 }, source: { kind: 'alliesOfKingdom', kingdom: '盛唐' } } }),
    ),
  },
  {
    id: 7752,
    desc: '减除一名敌人全部护甲值，并造成 [魔法 + 4] 点伤害，数量因被减除的护甲值数而增强。 [3:1]',
    build: skill(
      reduce('enemyChosen', 'armor', 0, 0, { drainAll: true }),
      dmg('enemyChosen', 4, 1, { modifier: { mod: { kind: 'ratio', a: 3, b: 1 }, source: { kind: 'lastReduce' } } }),
    ),
  },
  {
    id: 7753,
    desc: '消除所有敌人全部正面增益效果。对一名敌人造成 [魔法 + 5] 点伤害，并使其攻击力减半。 [2:1]',
    build: skill(
      dmg('enemyChosen', 5, 1),
      reduce('lastTarget', 'attack', 0, 0, { halve: true }),
    ),
  },
  {
    id: 7754,
    desc: '窃取一名敌人全部护甲值。如果敌人是个魔头，则使其他所有敌人陷入死亡标记状态。',
    build: skill(
      steal('enemyChosen', 'armor', 'armor', 0, 0, { drainAll: true }),
    ),
  },
  {
    id: 7755,
    desc: '减除一名敌人全部护甲值，并造成 [魔法 + 5] 点伤害。若敌人生命值高于自身，则造成 3 倍伤害。',
    build: skill(
      reduce('enemyChosen', 'armor', 0, 0, { drainAll: true }),
      dmg('enemyChosen', 5, 1),
    ),
  },
  {
    id: 7756,
    desc: '减除一名敌人全部护甲值。获得生命值，数量等同于被减除的护甲值。使所有盟友下潜。 [1:1]',
    build: skill(
      reduce('enemyChosen', 'armor', 0, 0, { drainAll: true }),
      armor('allySelf', 0, 0, { modifier: { mod: { kind: 'ratio', a: 1, b: 1 }, source: { kind: 'lastReduce' } } }),
      inflict('submerged', 'allyAll'),
    ),
  },
  {
    id: 7757,
    desc: '减除一名敌人全部护甲值，并造成 [魔法 + 5] 点伤害。给予所有盟友 2 点攻击力，数量因被减除的护甲值数而增强。 [3:1]',
    build: skill(
      reduce('enemyChosen', 'armor', 0, 0, { drainAll: true }),
      dmg('enemyChosen', 5, 1),
      attack('allyAll', 2, 0, { modifier: { mod: { kind: 'ratio', a: 3, b: 1 }, source: { kind: 'lastReduce' } } }),
    ),
  },
  {
    id: 7758,
    desc: '减除一名敌人全部护甲值。给予所有盟友 [魔法 + 1] 点生命值，数量因被减除的护甲值数而增强。 [3:1]',
    build: skill(
      reduce('enemyChosen', 'armor', 0, 0, { drainAll: true }),
      heal('allyAll', 1, 1, { modifier: { mod: { kind: 'ratio', a: 3, b: 1 }, source: { kind: 'lastReduce' } } }),
    ),
  },
  {
    id: 7759,
    desc: '减除一名敌人全部护甲值，并造成 [魔法 + 3] 点伤害。获得 2 点魔法值，数量因被减除的护甲值数而增强。 [3:1]',
    build: skill(
      reduce('enemyChosen', 'armor', 0, 0, { drainAll: true }),
      dmg('enemyChosen', 3, 1),
      magic('allySelf', 2, 0, { modifier: { mod: { kind: 'ratio', a: 3, b: 1 }, source: { kind: 'lastReduce' } } }),
    ),
  },
  {
    id: 7769,
    desc: '摧毁 1 列。对最强大的敌人造成 [魔法 + 2] 点伤害，伤害值因被摧毁的骷髅头和棕色宝石数而增强。 [x2]',
    build: skill(
      destroyChosenCol(),
      dmg('enemyHealthiest', 2, 1, { modifier: { mod: { kind: 'multiplier', a: 2 }, source: { kind: 'boardSkulls' } } }),
    ),
  },
  {
    id: 7770,
    desc: '对一名敌人造成 [魔法 + 2] 点伤害。如果敌方有恶魔军队，则对另一名随机敌人造成 12 点伤害。',
    build: skill(
      dmg('enemyChosen', 2, 1),
      dmg('enemyRandom', 12, 0, { ifCond: { kind: 'enemyRacePresent', race: 'Daemon' } }),
    ),
  },
  {
    id: 7799,
    desc: '减除一名敌人全部护甲值。获得 [魔法 + 1] 黄金，数量因被减除的护甲值而增强。 [3:1]',
    build: skill(
      reduce('enemyChosen', 'armor', 0, 0, { drainAll: true }),
      gainGold(1, 1, { modifier: { mod: { kind: 'ratio', a: 3, b: 1 }, source: { kind: 'lastReduce' } } }),
    ),
  },
  {
    id: 7800,
    desc: '对所有敌人造成 [(魔法 / 2) + 2] 点伤害，伤害值因敌方高塔数量而增强。 [x8]',
    build: skill(
      dmg('enemyAll', 2, 0.5, { range: 'all' }),
    ),
  },
  {
    id: 7801,
    desc: '创造 10 颗红色宝石。对一名敌人造成 [魔法 + 2] 点伤害，伤害值因红色宝石数量而增强。 [2:1]',
    build: skill(
      createGems(BaseColor.Red, 10, 0),
      dmg('enemyChosen', 2, 1, { modifier: { mod: { kind: 'ratio', a: 2, b: 1 }, source: { kind: 'boardGems', color: BaseColor.Red } } }),
    ),
  },
  {
    id: 7802,
    desc: '对一名敌人造成 [魔法 + 4] 点溅射伤害。创造 4 颗红色宝石，宝石数量因牛头族盟友数而增强。 [x3]',
    build: skill(
      dmgSplash('enemyChosen', 4, 1, { range: 'splash' }),
      createGems(BaseColor.Red, 4, 0, { modifier: { mod: { kind: 'multiplier', a: 3 }, source: { kind: 'alliesOfRace', race: 'Tauros' } } }),
    ),
  },
  {
    id: 7803,
    desc: '窃取一名敌人 [魔法 + 1] 点攻击力和护甲值。若敌军是一名魔头，则冻结所有敌人并赋予所有盟友屏障效果。',
    build: skill(
      steal('enemyChosen', 'attack', 'attack', 1, 1),
      steal('enemyChosen', 'armor', 'armor', 1, 1),
      inflict('frozen', 'enemyAll', { ifCond: { kind: 'targetRace', race: 'Boss' } }),
      inflict('barrier', 'allyAll', { ifCond: { kind: 'targetRace', race: 'Boss' } }),
    ),
  },
  {
    id: 7804,
    desc: '摧毁一列。每摧毁一颗黄宝石则创造 4 颗红色宝石。 [x4]',
    build: skill(
      destroyChosenCol(),
      createGems(BaseColor.Red, 4, 0, { modifier: { mod: { kind: 'multiplier', a: 4 }, source: { kind: 'destroyedGems', color: BaseColor.Yellow } } }),
    ),
  },
  {
    id: 7805,
    desc: '对一名敌人造成 [魔法 + 4] 点伤害，并窃取其半数攻击力。 [2:1]',
    build: skill(
      dmg('enemyChosen', 4, 1),
      steal('lastTarget', 'attack', 'attack', 0, 0, { halve: true, modifier: { mod: { kind: 'ratio', a: 2, b: 1 } } }),
    ),
  },
  {
    id: 7806,
    desc: '所有盟友获得 [魔法 + 2] 点护甲值。同时，敌方每一拥有屏障效果的军队，已方盟友即各得 8 点攻击力和 2 点法力值。 [x2]',
    build: skill(
      armor('allyAll', 2, 1),
      attack('allyAll', 8, 0, { modifier: { mod: { kind: 'multiplier', a: 2 }, source: { kind: 'enemyStatusCount', statusId: 'barrier' } } }),
      mana('allyAll', 2, 0, { modifier: { mod: { kind: 'multiplier', a: 2 }, source: { kind: 'enemyStatusCount', statusId: 'barrier' } } }),
    ),
  },
  {
    id: 7815,
    desc: '对一名敌人造成 [魔法 + 4] 点伤害，伤害值因敌人所需的法力值而增强。若敌人是神祗，则再造成 10 点伤害。如果敌人使用黄色法力，则再添 10 点伤害。 [1:1]',
    build: skill(
      dmg('enemyChosen', 4, 1, { modifier: { mod: { kind: 'ratio', a: 1, b: 1 }, source: { kind: 'targetStat', stat: 'manaCost' } }, condBonus: { n: 10, cond: { kind: 'targetRace', race: 'Divine' } } }),
    ),
  },
  {
    id: 7816,
    desc: '对一名敌人造成 [魔法 + 4] 点伤害。如果板面上有 13 颗或更多紫色宝石，则召唤 1 到 3 名迈纳杰之罪军队。',
    build: skill(
      dmg('enemyChosen', 4, 1),
      summonRandomOfKingdom('迈纳杰之罪', undefined, { countRange: { min: 1, max: 3 }, ifCond: { kind: 'boardAtLeast', color: BaseColor.Purple, n: 13 } }),
    ),
  },
  {
    id: 7861,
    desc: '对第一名和最后一名敌人造成 [魔法 + 3] 点伤害，伤害值因自身黄金数量而增强。若有一名敌人身亡，则获得一个额外回合。 [3:1]',
    build: skill(
      dmg('enemyLast', 3, 1, { modifier: { mod: { kind: 'ratio', a: 3, b: 1 }, source: { kind: 'battleGold' } } }),
      dmg('enemyFront', 3, 1, { modifier: { mod: { kind: 'ratio', a: 3, b: 1 }, source: { kind: 'battleGold' } } }),
      extraTurn({ ifCond: { kind: 'anyTrackedDied' } }),
    ),
  },
  {
    id: 7862,
    desc: '选定一颗法力宝石。对使用所选定法力宝石颜色的每一名敌人造成 [魔法 + 1] 点伤害，并使其陷入燃烧状态。给予所有同色盟友 4 点攻击力。',
    build: skill(
      dmg('enemyAll', 1, 1, { ifCond: { kind: 'targetColor', color: 'CHOSEN' } }),
      inflict('burning', 'enemyAll', { ifCond: { kind: 'targetColor', color: 'CHOSEN' } }),
      attack('allyAll', 4, 0, { ifCond: { kind: 'targetColor', color: 'CHOSEN' } }),
    ),
  },
  {
    id: 7863,
    desc: '对一名敌人造成 [魔法 + 7] 点伤害，伤害值因骑士盟友的数量而增强。每有一名骑士盟友，则创造混合蓝色和红色的 6 颗宝石。 [x6]',
    build: skill(
      dmg('enemyChosen', 7, 1, { modifier: { mod: { kind: 'multiplier', a: 6 }, source: { kind: 'alliesOfRace', race: 'Knight' } } }),
      createMix([BaseColor.Blue, BaseColor.Red], 6, 0, { modifier: { mod: { kind: 'multiplier', a: 6 }, sources: [{ kind: 'alliesOfRace', race: 'Knight' }] } }),
    ),
  },
  {
    id: 7864,
    desc: '对所有敌人造成 [魔法 + 6] 点散射伤害，伤害值因自身的攻击力、生命值和护甲值而增强。所有盟友全部技能值增加 2 点。 [3:1]',
    build: skill(
      dmg('enemyAll', 6, 1, { range: 'all', modifier: { mod: { kind: 'ratio', a: 3, b: 1 }, source: { kind: 'selfStat', stat: 'attack' } } }),
      attack('allyAll', 2, 0),
      armor('allyAll', 2, 0),
      heal('allyAll', 2, 0),
      magic('allyAll', 2, 0),
    ),
  },
  {
    id: 7865,
    desc: '对所有敌人造成 [魔法 + 1] 点伤害。每有一名冻结敌人则再添 5 点伤害。  [x5]',
    build: skill(
      dmg('enemyAll', 1, 1, { range: 'all', modifier: { mod: { kind: 'multiplier', a: 5 }, source: { kind: 'enemyStatusCount', statusId: 'frozen' } } }),
    ),
  },
  {
    id: 7866,
    desc: '耗尽一名敌人最高 12 点法力值，并造成 [魔法 + 4] 点伤害。创造与所耗尽法力值数等数的宝石，创建的宝石色与敌人法力颜色相同。 [1:1]',
    build: skill(
      reduce('enemyChosen', 'mana', 12, 0),
      dmg('enemyChosen', 4, 1),
      createGems('LAST_TARGET', 0, 0, { modifier: { mod: { kind: 'ratio', a: 1, b: 1 }, source: { kind: 'drainedMana' } } }),
    ),
  },
  {
    id: 7928,
    desc: '使一名敌人陷入所有负面状态效果。爆破 [魔法 + 1] 颗其法力颜色的宝石。',
    build: skill(
      inflict('poison', 'enemyChosen'),
      inflict('burning', 'enemyChosen'),
      inflict('bleed', 'enemyChosen'),
      inflict('silence', 'enemyChosen'),
      inflict('frozen', 'enemyChosen'),
      inflict('stun', 'enemyChosen'),
      inflict('entangle', 'enemyChosen'),
      inflict('web', 'enemyChosen'),
      inflict('disease', 'enemyChosen'),
      inflict('curse', 'enemyChosen'),
      inflict('death-mark', 'enemyChosen'),
      inflict('charm', 'enemyChosen'),
      explodeRandomGems(1, 1, 'color', 'LAST_TARGET'),
    ),
  },
  {
    id: 7929,
    desc: '给予一名盟友 [魔法 + 1] 点护甲值，数值因所有敌人攻击力数而增强。再赋予其狂怒和屏障效果。 [2:1]',
    build: skill(
      armor('allyChosen', 1, 1, { modifier: { mod: { kind: 'ratio', a: 2, b: 1 }, source: { kind: 'targetStat', stat: 'attack' } } }),
      inflict('rage', 'lastTarget'),
      inflict('barrier', 'lastTarget'),
    ),
  },
  {
    id: 7947,
    desc: '爆破 [(魔法 / 2) + 1] 颗棕色宝石。召唤一名随机全视之眼军队。',
    build: skill(
      explodeRandomGems(1, 0.5, 'color', BaseColor.Brown),
      summonRandom(['OcularenLeech', 'Ocularen', 'BurningOcularen', 'GloomOcularen'], undefined),
    ),
  },
  {
    id: 7948,
    desc: '净化自身。获得 [(魔法 x 2) + 1] 点生命值和护甲值。使自身转移至首位。',
    build: skill(
      cleanse('allySelf'),
      heal('allySelf', 1, 2),
      armor('allySelf', 1, 2),
      reposition('allySelf', 'front'),
    ),
  },
  {
    id: 7949,
    desc: '从最弱的两名敌人窃取 [魔法 + 1] 点生命值。召唤一名随机不死族军队。',
    build: skill(
      dmg('enemyWeakestN', 1, 1, { n: 2, drain: true }),
      summonRandom(['Skeleton', 'Wight', 'Revenant', 'Zombie', 'Banshee', 'VampireLord', 'FleshGolem', 'Ghoul', 'KeeperOfSouls', 'CrimsonBat', 'LadySapphira', 'Alastair', 'GraveKnight', 'Aziris', 'BoneDragon', 'Sunweaver', 'Skeleros', 'Draakulis', 'TwistedHero', 'Death', 'MorthanisWill', 'Wraith', 'AstralSpirit', 'Remnant', 'MummifiedKing', 'BoneScorpion', 'NightHag', 'Pharos-Ra', 'CaptainSkullbeard', 'BoneNaga', 'BoneDaemon', 'Valraven', 'Xathenos', 'Nosferatu', 'Umberwolf', 'WallOfBones', 'IceWraith', 'Vargouille', 'Carmella', 'DwarvenZombie', 'SlayerGhost', 'KingBloodhammer', 'FallenValdis', 'Xerodar', 'Nightshade', 'SpectralKnight', 'GraveSeer', 'LadyMorana', 'Apophisis', 'Ankhekt', 'Draugr', 'Necrocorn', 'BoneGolem', 'VanyaSoulmourn', 'Sanguinia', 'CorpseMare', 'BaneJaw', 'ShadeOfZorn', 'DrownedSailor', 'VladTheUnsated', 'Dullahan', 'TheGrayKing', 'Tutankhatmun', 'FrostfireWraith', 'ChaosHound', 'Zilopochtli', 'UndeadDrake', 'DreadSteed', 'ShadeOfKurandara', 'BoneboundDredge', 'HauntedGuardian', 'PharaohNefertani', 'TombKnight', 'Metztli', 'CarrionCrow', 'TheGhostQueen', 'Charonas', 'JudgeOfTheDead', 'FrozenShieldbreaker', 'JakalTheGuardian', 'TheFleshHorror', 'Draxxius', 'VaultGuard', 'SpectralColossus', 'FlamingSkeleton', 'Deathclaw', 'AncestorBrodir', 'TheGemini', 'CryptHound', 'StoneZombie', 'DhrakSmith', 'Carmina', 'DeathlockDreilak', 'Rath-Amon', 'BoundMage', 'RelicKnight', 'Negasus', 'DrownedCaptain', 'DeadParrot', 'Deathgaunt', 'AssessorOfMahat', 'FallenSatyr', 'TheGraveGiant', 'DreadCaptainGrim', 'MorthanisDarkness', 'SkellyCat', 'DeathTrapMimic', 'BloodElf', 'BoneCatapult', 'UndeadSentinel', 'UndeadLion', 'AnointedChampion', 'Valhawk', 'LostWarrior', 'PharaohKhafru', 'AldricTheFrostbound', 'Gloomhob', 'Ghulemoth', 'Shadowhisker', 'TheFallenKnight', 'GhostOgre', 'Necroshale', 'CryptWorm', 'WargSpirit', 'DraugrKnight', 'DrownedWanderer', 'BarrowLord', 'GhostKingGrimhorn', 'ImmortalOssifer', 'BlightedHusk', 'TheDecayingQueen', 'WoodRot', 'SkeletalUrska', 'ZombieGoat', 'RottingSerpent', 'ShadowWraith', 'Abraxas', 'ImmortalGemini', 'ToxicHag', 'Helilya', 'DesertOx', 'ForsakenGuardian', 'KhormacTheRestless', 'VigilantShade', 'Bothros', 'QueenWilhelmina', 'Vinepyre', 'CountGobula', 'LordGobthe', 'AqenBloodclaw', 'Sanguinette', 'TheTombkeeper', 'Merneith', 'Cinereous', 'LordHarker', 'GraveWorm', 'CryptboundWight', 'MoonveilWarden', 'CursedSailor', 'DarkSpirit', 'RhonaBittershield', 'TheSoulKnight', 'TheBansheeQueen'], undefined),
    ),
  },
  {
    id: 7950,
    desc: '对所有敌人造成 [魔法 + 13] 点散射伤害。创造 8 颗骷髅头。缠绕第一位敌人。',
    build: skill(
      dmg('enemyAll', 13, 1, { range: 'all' }),
      createSkulls(8, 0),
      inflict('entangle', 'enemyFront'),
    ),
  },
  {
    id: 7952,
    desc: '对所有敌人造成 [魔法 + 3] 点伤害，每锻炼 1 个武器段位则 +1 点伤害值。将红色宝石转换成末日骷髅头。如果敌方有劫数，则再创造 5 颗。每有一名蓝色敌人则获得 3 点法力值。 [x3]',
    build: skill(
      dmg('enemyAll', 3, 1, { range: 'all', modifier: { mod: { kind: 'multiplier', a: 1 }, source: { kind: 'tempering' } } }),
      transformToSpecial(BaseColor.Red, 'doomSkull'),
      createSkulls(5, 0, { ifCond: { kind: 'targetHasDoom' } }),
      mana('allySelf', 3, 0, { modifier: { mod: { kind: 'multiplier', a: 3 }, source: { kind: 'enemiesOfColor', color: BaseColor.Blue } } }),
    ),
  },
  {
    id: 7955,
    desc: '给予一名盟友 [魔法 + 1] 点护甲值。若盟友使用红色法力，则效果翻倍。若敌方有魔头，则爆破所有红色宝石。',
    build: skill(
      armor('allyChosen', 1, 1, { condMult: { times: 2, cond: { kind: 'targetColor', color: BaseColor.Red } } }),
      explodeColor(BaseColor.Red, { ifCond: { kind: 'enemyRacePresent', race: 'Boss' } }),
    ),
  },
  {
    id: 7961,
    desc: '减除一名敌人全部护甲值，并造成 [魔法 + 3] 点伤害。再将其拉到首位。',
    build: skill(
      reduce('enemyChosen', 'armor', 0, 0, { drainAll: true }),
      dmg('enemyChosen', 3, 1),
      reposition('lastTarget', 'front'),
    ),
  },
  {
    id: 7963,
    desc: '对所有敌人造成 [魔法 + 3] 点伤害，每锻炼 1 个武器段位则 +1 点伤害值。将绿色宝石转换成末日骷髅头。如果敌方有劫数，则再创造 5 颗。每有一名棕色敌人则获得 3 点法力值。 [x3]',
    build: skill(
      dmg('enemyAll', 3, 1, { range: 'all', modifier: { mod: { kind: 'multiplier', a: 1 }, source: { kind: 'tempering' } } }),
      transformToSpecial(BaseColor.Green, 'doomSkull'),
      createSkulls(5, 0, { ifCond: { kind: 'targetHasDoom' } }),
      mana('allySelf', 3, 0, { modifier: { mod: { kind: 'multiplier', a: 3 }, source: { kind: 'enemiesOfColor', color: BaseColor.Brown } } }),
    ),
  },
  {
    id: 7964,
    desc: '对一名敌人造成 [魔法 + 5] 点伤害。若对方是一名元素军队则造成双倍伤害。移除所有棕色宝石以增强效果。 [3:1]',
    build: skill(
      dmg('enemyChosen', 5, 1, { condMult: { times: 2, cond: { kind: 'targetRace', race: 'Elemental' } }, modifier: { mod: { kind: 'ratio', a: 3, b: 1 } } }),
      destroyColor(BaseColor.Brown),
    ),
  },
  {
    id: 7966,
    desc: '对一名敌人造成 [魔法 + 2] 点伤害。创造 5 颗紫色宝石，宝石数因陷入织网状态的敌军数量而增强。 [x3]',
    build: skill(
      dmg('enemyChosen', 2, 1),
      createGems(BaseColor.Purple, 5, 0, { modifier: { mod: { kind: 'multiplier', a: 3 }, source: { kind: 'enemyStatusCount', statusId: 'web' } } }),
    ),
  },
  {
    id: 7971,
    desc: '对一名敌人造成 [魔法 + 7] 点伤害，伤害值因鸟族盟友的数量而增强。每有一名鸟族盟友，则创造混合蓝色和黄色的 6 颗宝石。 [x6]',
    build: skill(
      dmg('enemyChosen', 7, 1, { modifier: { mod: { kind: 'multiplier', a: 6 }, source: { kind: 'alliesOfRace', race: 'Stryx' } } }),
      createMix([BaseColor.Blue, BaseColor.Yellow], 6, 0, { modifier: { mod: { kind: 'multiplier', a: 6 }, sources: [{ kind: 'alliesOfRace', race: 'Stryx' }] } }),
    ),
  },
  {
    id: 7973,
    desc: '对所有敌人造成 [魔法 + 3] 点伤害，每锻炼 1 个武器段位则 +1 点伤害值。将蓝色宝石转换成末日骷髅头。如果敌方有劫数，则再创造 5 颗。每有一名红色敌人则获得 3 点法力值。 [x3]',
    build: skill(
      dmg('enemyAll', 3, 1, { range: 'all', modifier: { mod: { kind: 'multiplier', a: 1 }, source: { kind: 'tempering' } } }),
      transformToSpecial(BaseColor.Blue, 'doomSkull'),
      createSkulls(5, 0, { ifCond: { kind: 'targetHasDoom' } }),
      mana('allySelf', 3, 0, { modifier: { mod: { kind: 'multiplier', a: 3 }, source: { kind: 'enemiesOfColor', color: BaseColor.Red } } }),
    ),
  },
  {
    id: 7976,
    desc: '对一名敌人造成 [魔法 + 7] 点伤害，伤害值因狂野平原盟友的数量而增强。每有一名狂野平原盟友，则创造混合绿色和红色的 6 颗宝石。 [x6]',
    build: skill(
      dmg('enemyChosen', 7, 1, { modifier: { mod: { kind: 'multiplier', a: 6 }, source: { kind: 'alliesOfKingdom', kingdom: '狂野平原' } } }),
      createMix([BaseColor.Green, BaseColor.Red], 6, 0, { modifier: { mod: { kind: 'multiplier', a: 6 }, source: { kind: 'alliesOfKingdom', kingdom: '狂野平原' } } }),
    ),
  },
  {
    id: 7980,
    desc: '对一名敌人造成 [魔法 + 7] 点伤害，伤害值因纳迦盟友的数量而增强。每有一名纳迦盟友，则创造混合绿色和红色的 6 颗宝石。 [x6]',
    build: skill(
      dmg('enemyChosen', 7, 1, { modifier: { mod: { kind: 'multiplier', a: 6 }, source: { kind: 'alliesOfRace', race: 'Naga' } } }),
      createMix([BaseColor.Green, BaseColor.Red], 6, 0, { modifier: { mod: { kind: 'multiplier', a: 6 }, sources: [{ kind: 'alliesOfRace', race: 'Naga' }] } }),
    ),
  },
  {
    id: 7982,
    desc: '给予所有盟友 [魔法 + 1] 点生命值，每锻炼 1 个武器段位则 +2 点生命值。给予所有其他盟友 5 点法力值。如果敌方有劫数，则再给予 4 点法力值。每有一名紫色敌人则给予所有盟友 2 点魔法值。 [x4]',
    build: skill(
      heal('allyAll', 1, 1, { modifier: { mod: { kind: 'multiplier', a: 2 }, source: { kind: 'tempering' } } }),
      mana('allyOthers', 5, 0, { condBonus: { n: 4, cond: { kind: 'targetHasDoom' } } }),
      magic('allyAll', 2, 0, { modifier: { mod: { kind: 'multiplier', a: 4 }, source: { kind: 'enemiesOfColor', color: BaseColor.Purple } } }),
    ),
  },
  {
    id: 7986,
    desc: '使一名敌人陷入 1 到 4 个状态效果，并爆破 4 颗与其法力颜色同色的宝石。',
    build: skill(
      explodeRandomGems(4, 0, 'color', 'LAST_TARGET'),
    ),
  },
  {
    id: 7991,
    desc: '对一名敌人造成 [魔法 + 5] 点伤害。召唤一名随机小鬼。',
    build: skill(
      dmg('enemyChosen', 5, 1),
      summonRandom(['SummerImp', 'AutumnalImp', 'WinterImp', 'SpringImp', 'SpookyImp'], undefined),
    ),
  },
  {
    id: 7996,
    desc: '对所有敌人造成 [魔法 + 8] 点散射伤害。赋予所有盟友 1 到 2 个状态效果。',
    build: skill(
      dmg('enemyAll', 8, 1, { range: 'all' }),
    ),
  },
  {
    id: 8045,
    desc: '对一名敌人造成 [魔法 + 7] 点伤害，伤害值因卜筮之原的盟友数而增强。每有一名卜筮之原盟友，则创造混合蓝色和黄色的 6 颗宝石。 [x6]',
    build: skill(
      dmg('enemyChosen', 7, 1, { modifier: { mod: { kind: 'multiplier', a: 6 }, source: { kind: 'alliesOfKingdom', kingdom: '卜筮之原' } } }),
      createMix([BaseColor.Blue, BaseColor.Yellow], 6, 0, { modifier: { mod: { kind: 'multiplier', a: 6 }, source: { kind: 'alliesOfKingdom', kingdom: '卜筮之原' } } }),
    ),
  },
  {
    id: 8046,
    desc: '对一名敌人造成 [魔法 + 7] 点伤害，伤害值因怪兽盟友的数量而增强。每有一名怪兽盟友，则创造混合绿色和棕色的 6 颗宝石。 [x6]',
    build: skill(
      dmg('enemyChosen', 7, 1, { modifier: { mod: { kind: 'multiplier', a: 6 }, source: { kind: 'alliesOfRace', race: 'Monster' } } }),
      createMix([BaseColor.Green, BaseColor.Brown], 6, 0, { modifier: { mod: { kind: 'multiplier', a: 6 }, sources: [{ kind: 'alliesOfRace', race: 'Monster' }] } }),
    ),
  },
  {
    id: 8047,
    desc: '给予所有盟友 [魔法 + 1] 点生命值，每锻炼 1 个武器段位则 +2 点生命值。给予所有其他盟友 5 点法力值。如果敌方有劫数，则再给予 4 点法力值。每有一名棕色敌人则给予所有盟友 2 点魔法值。 [x4]',
    build: skill(
      heal('allyAll', 1, 1, { modifier: { mod: { kind: 'multiplier', a: 2 }, source: { kind: 'tempering' } } }),
      mana('allyOthers', 5, 0, { condBonus: { n: 4, cond: { kind: 'targetHasDoom' } } }),
      magic('allyAll', 2, 0, { modifier: { mod: { kind: 'multiplier', a: 4 }, source: { kind: 'enemiesOfColor', color: BaseColor.Brown } } }),
    ),
  },
  {
    id: 8048,
    desc: '对一名敌人造成 [魔法 + 7] 点伤害，伤害值因葛洛什奈克盟友的数量而增强。每有一名葛洛什奈克盟友，则创造混合红色和棕色的 6 颗宝石。 [x6]',
    build: skill(
      dmg('enemyChosen', 7, 1, { modifier: { mod: { kind: 'multiplier', a: 6 }, source: { kind: 'alliesOfKingdom', kingdom: '葛洛什奈克' } } }),
      createMix([BaseColor.Red, BaseColor.Brown], 6, 0, { modifier: { mod: { kind: 'multiplier', a: 6 }, source: { kind: 'alliesOfKingdom', kingdom: '葛洛什奈克' } } }),
    ),
  },
  {
    id: 8049,
    desc: '对一名敌人造成 [魔法 + 7] 点伤害，伤害值因不死族盟友的数量而增强。每有一名不死族盟友，则创造混合蓝色和紫色的 6 颗宝石。 [x6]',
    build: skill(
      dmg('enemyChosen', 7, 1, { modifier: { mod: { kind: 'multiplier', a: 6 }, source: { kind: 'alliesOfRace', race: 'Undead' } } }),
      createMix([BaseColor.Blue, BaseColor.Purple], 6, 0, { modifier: { mod: { kind: 'multiplier', a: 6 }, sources: [{ kind: 'alliesOfRace', race: 'Undead' }] } }),
    ),
  },
  {
    id: 8050,
    desc: '给予所有盟友 [魔法 + 1] 点生命值，每锻炼 1 个武器段位则 +2 点生命值。给予所有其他盟友 5 点法力值。如果敌方有劫数，则再给予 4 点法力值。每有一名黄色敌人则给予所有盟友 2 点魔法值。 [x4]',
    build: skill(
      heal('allyAll', 1, 1, { modifier: { mod: { kind: 'multiplier', a: 2 }, source: { kind: 'tempering' } } }),
      mana('allyOthers', 5, 0, { condBonus: { n: 4, cond: { kind: 'targetHasDoom' } } }),
      magic('allyAll', 2, 0, { modifier: { mod: { kind: 'multiplier', a: 4 }, source: { kind: 'enemiesOfColor', color: BaseColor.Yellow } } }),
    ),
  },
  {
    id: 8051,
    desc: '对一名敌人造成 [魔法 + 7] 点伤害，伤害值因玉银林地盟友的数量而增强。每有一名玉银林地盟友，则创造混合紫色和黄色的 6 颗宝石。 [x6]',
    build: skill(
      dmg('enemyChosen', 7, 1, { modifier: { mod: { kind: 'multiplier', a: 6 }, source: { kind: 'alliesOfKingdom', kingdom: '玉玉玉银林地' } } }),
      createMix([BaseColor.Purple, BaseColor.Yellow], 6, 0, { modifier: { mod: { kind: 'multiplier', a: 6 }, source: { kind: 'alliesOfKingdom', kingdom: '玉玉玉银林地' } } }),
    ),
  },
  {
    id: 8052,
    desc: '对所有敌人造成 [魔法 + 1]  点伤害，伤害值因恶魔盟友数而加强。然后诅咒和燃烧所有敌人。 [x3]',
    build: skill(
      dmg('enemyAll', 1, 1, { range: 'all', modifier: { mod: { kind: 'multiplier', a: 3 }, source: { kind: 'alliesOfRace', race: 'Daemon' } } }),
      inflict('curse', 'enemyAll'),
    ),
  },
  {
    id: 8053,
    desc: '对所有敌人造成 [魔法 + 3] 点伤害，每锻炼 1 个武器段位则 +1 点伤害值。将棕色宝石转换成末日骷髅头。如果敌方有劫数，则再创造 5 颗。每有一名绿色敌人则获得 3 点法力值。 [x3]',
    build: skill(
      dmg('enemyAll', 3, 1, { range: 'all', modifier: { mod: { kind: 'multiplier', a: 1 }, source: { kind: 'tempering' } } }),
      transformToSpecial(BaseColor.Brown, 'doomSkull'),
      createSkulls(5, 0, { ifCond: { kind: 'targetHasDoom' } }),
      mana('allySelf', 3, 0, { modifier: { mod: { kind: 'multiplier', a: 3 }, source: { kind: 'enemiesOfColor', color: BaseColor.Green } } }),
    ),
  },
  {
    id: 8054,
    desc: '对一名敌人造成 [魔法 + 7] 点伤害，伤害值因厄什卡亚盟友的数量而增强。每有一名厄什卡亚盟友，则创造混合绿色和棕色的 6 颗宝石。 [x6]',
    build: skill(
      dmg('enemyChosen', 7, 1, { modifier: { mod: { kind: 'multiplier', a: 6 }, source: { kind: 'alliesOfKingdom', kingdom: '厄什卡亚' } } }),
      createMix([BaseColor.Green, BaseColor.Brown], 6, 0, { modifier: { mod: { kind: 'multiplier', a: 6 }, source: { kind: 'alliesOfKingdom', kingdom: '厄什卡亚' } } }),
    ),
  },
  {
    id: 8062,
    desc: '对首 2 位敌人造成 [魔法 + 4] 点伤害，并使其陷入出血状态。',
    build: skill(
      dmg('enemyFirstN', 4, 1, { n: 2 }),
      inflict('bleed', 'enemyFirstN'),
    ),
  },
  {
    id: 8067,
    desc: '对最后一位敌人造成 [魔法 + 6] 点伤害，诅咒他并耗尽其所有法力值。',
    build: skill(
      dmg('enemyLast', 6, 1),
      inflict('curse', 'lastTarget'),
      drainMana('lastTarget'),
    ),
  },
  {
    id: 8072,
    desc: '窃取最后两名敌人 [魔法 + 1]  点生命值并使其陷入死亡标记状态。再赐福自身。',
    build: skill(
      dmg('enemyLastN', 1, 1, { n: 2, drain: true }),
      inflict('death-mark', 'enemyLastN'),
      inflict('blessed', 'allySelf'),
    ),
  },
  {
    id: 8073,
    desc: '对 2 个随机敌人造成 [魔法 + 3] 点伤害，伤害值因敌我双方的黄金数而增强。 [2:1]',
    build: skill(
      dmg('enemyRandomN', 3, 1, { n: 2, modifier: { mod: { kind: 'ratio', a: 2, b: 1 }, source: { kind: 'battleGold' } } }),
    ),
  },
  {
    id: 8074,
    desc: '对所有敌人造成 [魔法 + 5] 点伤害，将 1-2 位敌人由首位打到末位。',
    build: skill(
      dmg('enemyAll', 5, 1, { range: 'all' }),
    ),
  },
  {
    id: 8075,
    desc: '造成 [魔法 + 12] 点真实散射伤害，伤害值因敌我双方的妖仙数量而增强。若有一名敌人身亡，则给予所有盟友 2 个随机的正面增益效果。 [x8]',
    build: skill(
      dmg('enemyAll', 12, 1, { range: 'all', trueDamage: true, modifier: { mod: { kind: 'multiplier', a: 8 }, sources: [{ kind: 'alliesOfRace', race: 'Fey' }, { kind: 'enemiesOfRace', race: 'Fey' }] } }),
      inflictRandom('allyAll', { times: 2, pool: 'positive', ifCond: { kind: 'anyTrackedDied' } }),
    ),
  },
  {
    id: 8076,
    desc: '对一名敌人造成 [魔法 + 5] 点严重溅射伤害，伤害值因所有蓝色盟友和敌人数而增强。若有敌人身亡，则给予所有盟友 3 点魔法值并使他们下潜。 [x4]',
    build: skill(
      dmgSplash('enemyChosen', 5, 1, { range: 'splash', modifier: { mod: { kind: 'multiplier', a: 4 }, source: { kind: 'alliesOfColor', color: BaseColor.Blue } } }),
      magic('allyAll', 3, 0, { ifCond: { kind: 'anyTrackedDied' } }),
      inflict('submerged', 'allyAll', { ifCond: { kind: 'anyTrackedDied' } }),
    ),
  },
  {
    id: 8077,
    desc: '对所有敌人造成 [魔法 + 3] 点伤害，每锻炼 1 个武器段位则 +1 点伤害值。将紫色宝石转换成末日骷髅头。如果敌方有劫数，则再创造 5 颗。每有一名黄色敌人则获得 3 点法力值。 [x3]',
    build: skill(
      dmg('enemyAll', 3, 1, { range: 'all', modifier: { mod: { kind: 'multiplier', a: 1 }, source: { kind: 'tempering' } } }),
      transformToSpecial(BaseColor.Purple, 'doomSkull'),
      createSkulls(5, 0, { ifCond: { kind: 'targetHasDoom' } }),
      mana('allySelf', 3, 0, { modifier: { mod: { kind: 'multiplier', a: 3 }, source: { kind: 'enemiesOfColor', color: BaseColor.Yellow } } }),
    ),
  },
  {
    id: 8078,
    desc: '对所有敌人造成 [魔法 + 3] 点伤害，每锻炼 1 个武器段位则 +1 点伤害值。将黄色宝石转换成末日骷髅头。如果敌方有劫数，则再创造 5 颗。每有一名紫色敌人则获得 3 点法力值。 [x3]',
    build: skill(
      dmg('enemyAll', 3, 1, { range: 'all', modifier: { mod: { kind: 'multiplier', a: 1 }, source: { kind: 'tempering' } } }),
      transformToSpecial(BaseColor.Yellow, 'doomSkull'),
      createSkulls(5, 0, { ifCond: { kind: 'targetHasDoom' } }),
      mana('allySelf', 3, 0, { modifier: { mod: { kind: 'multiplier', a: 3 }, source: { kind: 'enemiesOfColor', color: BaseColor.Purple } } }),
    ),
  },
  {
    id: 8079,
    desc: '给予所有盟友 [魔法 + 1] 点生命值，每锻炼 1 个武器段位则 +2 点生命值。给予所有其他盟友 5 点法力值。如果敌方有劫数，则再给予 4 点法力值。每有一名蓝色敌人则给予所有盟友 2 点魔法值。 [x4]',
    build: skill(
      heal('allyAll', 1, 1, { modifier: { mod: { kind: 'multiplier', a: 2 }, source: { kind: 'tempering' } } }),
      mana('allyOthers', 5, 0, { condBonus: { n: 4, cond: { kind: 'targetHasDoom' } } }),
      magic('allyAll', 2, 0, { modifier: { mod: { kind: 'multiplier', a: 4 }, source: { kind: 'enemiesOfColor', color: BaseColor.Blue } } }),
    ),
  },
  {
    id: 8080,
    desc: '给予所有盟友 [魔法 + 1] 点生命值，每锻炼 1 个武器段位则 +2 点生命值。给予所有其他盟友 5 点法力值。如果敌方有劫数，则再给予 4 点法力值。每有一名绿色敌人则给予所有盟友 2 点魔法值。 [x4]',
    build: skill(
      heal('allyAll', 1, 1, { modifier: { mod: { kind: 'multiplier', a: 2 }, source: { kind: 'tempering' } } }),
      mana('allyOthers', 5, 0, { condBonus: { n: 4, cond: { kind: 'targetHasDoom' } } }),
      magic('allyAll', 2, 0, { modifier: { mod: { kind: 'multiplier', a: 4 }, source: { kind: 'enemiesOfColor', color: BaseColor.Green } } }),
    ),
  },
  {
    id: 8081,
    desc: '给予所有盟友 [魔法 + 1] 点生命值，每锻炼 1 个武器段位则 +2 点生命值。给予所有其他盟友 5 点法力值。如果敌方有劫数，则再给予 4 点法力值。每有一名红色敌人则给予所有盟友 2 点魔法值。 [x4]',
    build: skill(
      heal('allyAll', 1, 1, { modifier: { mod: { kind: 'multiplier', a: 2 }, source: { kind: 'tempering' } } }),
      mana('allyOthers', 5, 0, { condBonus: { n: 4, cond: { kind: 'targetHasDoom' } } }),
      magic('allyAll', 2, 0, { modifier: { mod: { kind: 'multiplier', a: 4 }, source: { kind: 'enemiesOfColor', color: BaseColor.Red } } }),
    ),
  },
  {
    id: 8083,
    desc: '对一名敌人造成 [魔法 + 6] 点伤害。若敌人陷入出血状态，则伤害翻倍。有 10% 的几率直接杀死敌人，几率因末日骷髅头的数量而增强。  [x2]',
    build: skill(
      dmg('enemyChosen', 6, 1, { condMult: { times: 2, cond: { kind: 'targetStatus', statusId: 'bleed' } } }),
      dmg('lastTarget', 0, 0, { execute: true, chance: 0.1, chanceBoost: { mod: { kind: 'multiplier', a: 2 }, source: { kind: 'boardSkulls' } } }),
    ),
  },
  {
    id: 8084,
    desc: '赋予一名盟友所有状态效果，再爆破 [(魔法 / 2) + 1] 颗其法力颜色的宝石。',
    build: skill(
      explodeRandomGems(1, 0.5, 'color', 'LAST_TARGET'),
    ),
  },
  {
    id: 8118,
    desc: '对一名敌人造成 [魔法 + 7] 点伤害，伤害值因盗贼盟友的数量而增强。每有一名盗贼盟友，则创造混合红色和蓝色的 6 颗宝石。 [x6]',
    build: skill(
      dmg('enemyChosen', 7, 1, { modifier: { mod: { kind: 'multiplier', a: 6 }, source: { kind: 'alliesOfRace', race: 'Rogue' } } }),
      createMix([BaseColor.Red, BaseColor.Blue], 6, 0, { modifier: { mod: { kind: 'multiplier', a: 6 }, sources: [{ kind: 'alliesOfRace', race: 'Rogue' }] } }),
    ),
  },
  {
    id: 8119,
    desc: '对一名敌人造成 [魔法 + 7] 点伤害，伤害值因阿达纳盟友的数量而增强。每有一名阿达纳盟友，则创造混合红色和黄色的 6 颗宝石。 [x6]',
    build: skill(
      dmg('enemyChosen', 7, 1, { modifier: { mod: { kind: 'multiplier', a: 6 }, source: { kind: 'alliesOfKingdom', kingdom: '阿达纳' } } }),
      createMix([BaseColor.Red, BaseColor.Yellow], 6, 0, { modifier: { mod: { kind: 'multiplier', a: 6 }, source: { kind: 'alliesOfKingdom', kingdom: '阿达纳' } } }),
    ),
  },
  {
    id: 8120,
    desc: '对一名敌人造成 [魔法 + 7] 点伤害，伤害值因建造盟友的数量而增强。每有一名建造盟友，则创造混合紫色和棕色的 6 颗宝石。 [x6]',
    build: skill(
      dmg('enemyChosen', 7, 1, { modifier: { mod: { kind: 'multiplier', a: 6 }, source: { kind: 'alliesOfRace', race: 'Construct' } } }),
      createMix([BaseColor.Purple, BaseColor.Brown], 6, 0, { modifier: { mod: { kind: 'multiplier', a: 6 }, sources: [{ kind: 'alliesOfRace', race: 'Construct' }] } }),
    ),
  },
  {
    id: 8121,
    desc: '对一名敌人造成 [魔法 + 7] 点伤害，伤害值因卡其尔盟友的数量而增强。每有一名卡其尔盟友，则创造混合红色和棕色的 6 颗宝石。 [x6]',
    build: skill(
      dmg('enemyChosen', 7, 1, { modifier: { mod: { kind: 'multiplier', a: 6 }, source: { kind: 'alliesOfKingdom', kingdom: '卡其尔' } } }),
      createMix([BaseColor.Red, BaseColor.Brown], 6, 0, { modifier: { mod: { kind: 'multiplier', a: 6 }, source: { kind: 'alliesOfKingdom', kingdom: '卡其尔' } } }),
    ),
  },
  {
    id: 8122,
    desc: '对一名敌人造成 [魔法 + 7] 点伤害，伤害值因巨人盟友的数量而增强。每有一名巨人盟友，则创造混合蓝色和棕色的 6 颗宝石。 [x6]',
    build: skill(
      dmg('enemyChosen', 7, 1, { modifier: { mod: { kind: 'multiplier', a: 6 }, source: { kind: 'alliesOfRace', race: 'Giant' } } }),
      createMix([BaseColor.Blue, BaseColor.Brown], 6, 0, { modifier: { mod: { kind: 'multiplier', a: 6 }, sources: [{ kind: 'alliesOfRace', race: 'Giant' }] } }),
    ),
  },
  {
    id: 8123,
    desc: '对一名敌人造成 [魔法 + 7] 点伤害，伤害值因日冕盟友的数量而增强。每有一名日冕盟友，则创造混合紫色和黄色的 6 颗宝石。 [x6]',
    build: skill(
      dmg('enemyChosen', 7, 1, { modifier: { mod: { kind: 'multiplier', a: 6 }, source: { kind: 'alliesOfKingdom', kingdom: '日冕' } } }),
      createMix([BaseColor.Purple, BaseColor.Yellow], 6, 0, { modifier: { mod: { kind: 'multiplier', a: 6 }, source: { kind: 'alliesOfKingdom', kingdom: '日冕' } } }),
    ),
  },
  {
    id: 8124,
    desc: '对一名敌人造成 [魔法 + 7] 点伤害，伤害值因人类盟友的数量而增强。每有一名人类盟友，则创造混合蓝色和黄色的 6 颗宝石。 [x6]',
    build: skill(
      dmg('enemyChosen', 7, 1, { modifier: { mod: { kind: 'multiplier', a: 6 }, source: { kind: 'alliesOfRace', race: 'Human' } } }),
      createMix([BaseColor.Blue, BaseColor.Yellow], 6, 0, { modifier: { mod: { kind: 'multiplier', a: 6 }, sources: [{ kind: 'alliesOfRace', race: 'Human' }] } }),
    ),
  },
  {
    id: 8125,
    desc: '对一名敌人造成 [魔法 + 7] 点伤害，伤害值因皓彩森林盟友的数量而增强。每有一名皓彩森林盟友，则创造混合红色和绿色的 6 颗宝石。 [x6]',
    build: skill(
      dmg('enemyChosen', 7, 1, { modifier: { mod: { kind: 'multiplier', a: 6 }, source: { kind: 'alliesOfKingdom', kingdom: '皓彩森林' } } }),
      createMix([BaseColor.Red, BaseColor.Green], 6, 0, { modifier: { mod: { kind: 'multiplier', a: 6 }, source: { kind: 'alliesOfKingdom', kingdom: '皓彩森林' } } }),
    ),
  },
  {
    id: 8130,
    desc: '对第一位敌人造成  [魔法 + 7] 点伤害，伤害值因末日骷髅头数而增强。如果敌人是元素军队，则造成双倍伤害。将其打回末位。 [x3]',
    build: skill(
      dmg('enemyFront', 7, 1, { modifier: { mod: { kind: 'multiplier', a: 3 }, source: { kind: 'boardSkulls' } }, condMult: { times: 2, cond: { kind: 'targetRace', race: 'Elemental' } } }),
      reposition('lastTarget', 'back'),
    ),
  },
  {
    id: 8135,
    desc: '对一名敌人造成 [魔法 + 6] 点溅射伤害。若存在一种风暴，则伤害翻倍。',
    build: skill(
      dmgSplash('enemyChosen', 6, 1, { range: 'splash', condMult: { times: 2, cond: { kind: 'stormPresent' } } }),
    ),
  },
  {
    id: 8140,
    desc: '造成 [魔法 + 10] 点散射伤害，伤害值因毒菇林盟友数而增强。每有一名毒菇林盟友，则爆破 3 颗宝石。召唤一名毒菇林军队。 [x3]',
    build: skill(
      dmg('enemyAll', 10, 1, { range: 'all', modifier: { mod: { kind: 'multiplier', a: 3 }, source: { kind: 'alliesOfKingdom', kingdom: '齐埃金' } } }),
      explodeRandomGems(3, 0, 'color', undefined, { modifier: { mod: { kind: 'multiplier', a: 3 }, source: { kind: 'alliesOfKingdom', kingdom: '齐埃金' } } }),
      summonRandomOfKingdom('齐埃金', undefined),
    ),
  },
  {
    id: 8145,
    desc: '对最后一名敌人造成 [魔法 + 4] 点伤害。若敌人使用黄色法力，则造成 3 倍伤害。召唤暗风暴。',
    build: skill(
      dmg('enemyLast', 4, 1, { condMult: { times: 3, cond: { kind: 'targetColor', color: BaseColor.Yellow } } }),
      createStorm(BaseColor.Purple),
    ),
  },
  {
    id: 8152,
    desc: '爆破选定颜色的 4 颗宝石。对所有使用此颜色的敌人造成 [魔法 + 1] 点伤害。',
    build: skill(
      explodeRandomGems(4, 0, 'color', CHOSEN),
      dmg('enemyAll', 1, 1, { ifCond: { kind: 'targetColor', color: 'CHOSEN' } }),
    ),
  },
  {
    id: 8153,
    desc: '对一名敌人造成 [魔法 + 4] 点真实伤害。若存在一个风暴，对所有敌人造成  15  点真实伤害，再终止风暴。 ',
    build: skill(
      trueDmg('enemyChosen', 4, 1, { trueDamage: true }),
      dmg('enemyAll', 15, 0, { range: 'all', trueDamage: true, ifCond: { kind: 'stormPresent' } }),
    ),
  },
  {
    id: 8154,
    desc: '对一名敌人和其下方的敌人造成 [魔法 + 1] 点溅射伤害。使目标敌人陷入击晕和出血状态。',
    build: skill(
      dmgSplash('enemyChosenAndBelow', 1, 1, { range: 'splash' }),
      inflict('stun', 'enemyChosen'),
      inflict('bleed', 'enemyChosen'),
    ),
  },
  {
    id: 8155,
    desc: '对一名敌人造成 [魔法 + 4] 点严重溅射伤害，伤害值因骷髅头数而增强。击晕所有受到伤害的敌人。 [1:1]',
    build: skill(
      dmgSplash('enemyChosen', 4, 1, { range: 'splash', modifier: { mod: { kind: 'ratio', a: 1, b: 1 }, source: { kind: 'boardSkulls' } } }),
      inflict('stun', 'enemyAll'),
    ),
  },
  {
    id: 8156,
    desc: '对所有敌人造成 [(魔法 / 2) + 1] 点伤害。将黄色宝石转换成末日骷髅头。',
    build: skill(
      dmg('enemyAll', 1, 0.5, { range: 'all' }),
      transformToSpecial(BaseColor.Yellow, 'doomSkull'),
    ),
  },
  {
    id: 8161,
    desc: '对一名敌人造成 [魔法 + 7] 点伤害，伤害值因龙族盟友数而增强。每有一名龙族盟友，则创造 6 颗混合红色和紫色的宝石。 [x6]',
    build: skill(
      dmg('enemyChosen', 7, 1, { modifier: { mod: { kind: 'multiplier', a: 6 }, source: { kind: 'alliesOfRace', race: 'Dragon' } } }),
      createMix([BaseColor.Red, BaseColor.Purple], 6, 0, { modifier: { mod: { kind: 'multiplier', a: 6 }, sources: [{ kind: 'alliesOfRace', race: 'Dragon' }] } }),
    ),
  },
  {
    id: 8176,
    desc: '对一名敌人造成 [魔法 + 7] 点伤害，伤害值因卓克祖盟友的数量而增强。每有一名卓克祖盟友，则创造混合棕色和蓝色的 6 颗宝石。 [x6]',
    build: skill(
      dmg('enemyChosen', 7, 1, { modifier: { mod: { kind: 'multiplier', a: 6 }, source: { kind: 'alliesOfKingdom', kingdom: '卓克祖' } } }),
      createMix([BaseColor.Brown, BaseColor.Blue], 6, 0, { modifier: { mod: { kind: 'multiplier', a: 6 }, source: { kind: 'alliesOfKingdom', kingdom: '卓克祖' } } }),
    ),
  },
  {
    id: 8177,
    desc: '对一名敌人造成 [魔法 + 7] 点伤害，伤害值因秘士盟友的数量而增强。每有一名秘士盟友，则创造混合黄色和紫色的 6 颗宝石。 [x6]',
    build: skill(
      dmg('enemyChosen', 7, 1, { modifier: { mod: { kind: 'multiplier', a: 6 }, source: { kind: 'alliesOfRace', race: 'Mystic' } } }),
      createMix([BaseColor.Yellow, BaseColor.Purple], 6, 0, { modifier: { mod: { kind: 'multiplier', a: 6 }, sources: [{ kind: 'alliesOfRace', race: 'Mystic' }] } }),
    ),
  },
  {
    id: 8178,
    desc: '对一名敌人造成 [魔法 + 7] 点伤害，伤害值因毛格瑞姆森林盟友的数量而增强。每有一名毛格瑞姆森林盟友，则创造混合绿色和蓝色的 6 颗宝石。 [x6]',
    build: skill(
      dmg('enemyChosen', 7, 1, { modifier: { mod: { kind: 'multiplier', a: 6 }, source: { kind: 'alliesOfKingdom', kingdom: '毛格瑞姆森林' } } }),
      createMix([BaseColor.Green, BaseColor.Blue], 6, 0, { modifier: { mod: { kind: 'multiplier', a: 6 }, source: { kind: 'alliesOfKingdom', kingdom: '毛格瑞姆森林' } } }),
    ),
  },
  {
    id: 8179,
    desc: '对一名敌人造成 [魔法 + 7] 点伤害，伤害值因哥布林盟友的数量而增强。每有一名哥布林盟友，则创造混合红色和绿色的 6 颗宝石。 [x6]',
    build: skill(
      dmg('enemyChosen', 7, 1, { modifier: { mod: { kind: 'multiplier', a: 6 }, source: { kind: 'alliesOfRace', race: 'Goblin' } } }),
      createMix([BaseColor.Red, BaseColor.Green], 6, 0, { modifier: { mod: { kind: 'multiplier', a: 6 }, sources: [{ kind: 'alliesOfRace', race: 'Goblin' }] } }),
    ),
  },
  {
    id: 8186,
    desc: '对一名敌人造成 [魔法 + 3] 点真实伤害，若敌人陷入猎人标记状态，则造成 3 倍伤害。再使其陷入陷入猎人标记状态。',
    build: skill(
      trueDmg('enemyChosen', 3, 1, { trueDamage: true, condMult: { times: 3, cond: { kind: 'targetStatus', statusId: 'marked' } } }),
      inflict('marked', 'lastTarget'),
    ),
  },
  {
    id: 8191,
    desc: '赋予一名盟友反射教过，给予其 [(魔法 / 2) + 1] 点生命值，数值因自身的生命值而加强。 [3:1]',
    build: skill(
      inflict('reflect', 'allyChosen'),
      heal('allyChosen', 1, 0.5, { modifier: { mod: { kind: 'ratio', a: 3, b: 1 }, source: { kind: 'selfStat', stat: 'hp' } } }),
    ),
  },
  {
    id: 8197,
    desc: '对一名敌人造成 [魔法 + 7] 点伤害，伤害值因鳞雾沼泽盟友的数量而增强。每有一名鳞雾沼泽盟友，则创造混合蓝色和红色的 6 颗宝石。 [x6]',
    build: skill(
      dmg('enemyChosen', 7, 1, { modifier: { mod: { kind: 'multiplier', a: 6 }, source: { kind: 'alliesOfKingdom', kingdom: '鳞雾沼泽' } } }),
      createMix([BaseColor.Blue, BaseColor.Red], 6, 0, { modifier: { mod: { kind: 'multiplier', a: 6 }, source: { kind: 'alliesOfKingdom', kingdom: '鳞雾沼泽' } } }),
    ),
  },
  {
    id: 8198,
    desc: '对一名敌人造成 [魔法 + 7] 点伤害，伤害值因蛮族盟友的数量而增强。每有一名蛮族盟友，则创造混合绿色和黄色的 6 颗宝石。 [x6]',
    build: skill(
      dmg('enemyChosen', 7, 1, { modifier: { mod: { kind: 'multiplier', a: 6 }, source: { kind: 'alliesOfRace', race: 'Wildfolk' } } }),
      createMix([BaseColor.Green, BaseColor.Yellow], 6, 0, { modifier: { mod: { kind: 'multiplier', a: 6 }, sources: [{ kind: 'alliesOfRace', race: 'Wildfolk' }] } }),
    ),
  },
  {
    id: 8199,
    desc: '对一名敌人造成 [魔法 + 7] 点伤害，伤害值因荣耀之地盟友的数量而增强。每有一名荣耀之地盟友，则创造混合绿色和红色的 6 颗宝石。 [x6]',
    build: skill(
      dmg('enemyChosen', 7, 1, { modifier: { mod: { kind: 'multiplier', a: 6 }, source: { kind: 'alliesOfKingdom', kingdom: '荣耀之地' } } }),
      createMix([BaseColor.Green, BaseColor.Red], 6, 0, { modifier: { mod: { kind: 'multiplier', a: 6 }, source: { kind: 'alliesOfKingdom', kingdom: '荣耀之地' } } }),
    ),
  },
  {
    id: 8200,
    desc: '对一名敌人造成 [魔法 + 7] 点伤害，伤害值因厄什卡盟友的数量而增强。每有一名厄什卡盟友，则创造混合绿色和棕色的 6 颗宝石。 [x6]',
    build: skill(
      dmg('enemyChosen', 7, 1, { modifier: { mod: { kind: 'multiplier', a: 6 }, source: { kind: 'alliesOfRace', race: 'Urska' } } }),
      createMix([BaseColor.Green, BaseColor.Brown], 6, 0, { modifier: { mod: { kind: 'multiplier', a: 6 }, sources: [{ kind: 'alliesOfRace', race: 'Urska' }] } }),
    ),
  },
  {
    id: 8201,
    desc: '对一名敌人造成 [魔法 + 7] 点伤害，伤害值因荆棘森林盟友的数量而增强。每有一名荆棘森林盟友，则创造混合绿色和黄色的 6 颗宝石。 [x6]',
    build: skill(
      dmg('enemyChosen', 7, 1, { modifier: { mod: { kind: 'multiplier', a: 6 }, source: { kind: 'alliesOfKingdom', kingdom: '荆棘森林' } } }),
      createMix([BaseColor.Green, BaseColor.Yellow], 6, 0, { modifier: { mod: { kind: 'multiplier', a: 6 }, source: { kind: 'alliesOfKingdom', kingdom: '荆棘森林' } } }),
    ),
  },
  {
    id: 8202,
    desc: '对一名敌人造成 [魔法 + 7] 点伤害，伤害值因海族盟友的数量而增强。每有一名海族盟友，则创造混合蓝色和棕色的 6 颗宝石。 [x6]',
    build: skill(
      dmg('enemyChosen', 7, 1, { modifier: { mod: { kind: 'multiplier', a: 6 }, source: { kind: 'alliesOfRace', race: 'Merfolk' } } }),
      createMix([BaseColor.Blue, BaseColor.Brown], 6, 0, { modifier: { mod: { kind: 'multiplier', a: 6 }, sources: [{ kind: 'alliesOfRace', race: 'Merfolk' }] } }),
    ),
  },
  {
    id: 8221,
    desc: '对一名敌人造成 [魔法 + 6] 点伤害，若敌人已被冻结，则诅咒敌人。若敌人陷入燃烧状态，则再使其陷入死亡标记状态。',
    build: skill(
      dmg('enemyChosen', 6, 1),
      inflict('curse', 'enemyChosen', { ifCond: { kind: 'anyEnemyStatus', statusId: 'frozen' } }),
      inflict('death-mark', 'lastTarget', { ifCond: { kind: 'anyEnemyStatus', statusId: 'burning' } }),
    ),
  },
  {
    id: 8233,
    desc: '对前 2 位敌人造成 [魔法 + 2] 点伤害，伤害值因野兽盟友数而增强。召唤一名野兽。 [x4]',
    build: skill(
      dmg('enemyFirstN', 2, 1, { n: 2, modifier: { mod: { kind: 'multiplier', a: 4 }, source: { kind: 'alliesOfRace', race: 'Beast' } } }),
      summonRandom(['Rhynax', 'Pegasus', 'Owlbear', 'SacredGuardian', 'BoarRider', 'BlackBeast', 'SabertoothLion', 'GriffonKnight', 'Serpent', 'Warhound', 'Hippogryph', 'GiantSpider', 'DireWolf', 'Kerberos', 'SpiderSwarm', 'Roc', 'Fenrir', 'Salamander', 'Hellhound', 'BunniNog', 'Jackelope', 'Yeti', 'WinterWolf', 'SpiritFox', 'Hellcat', 'Moa', 'FireLizard', 'LionPrince', 'SandCobra', 'Dragonmoth', 'WingedBison', 'ArmoredBoar', 'WarGoat', 'Sunsail', 'Warg', 'Frostling', 'BoneScorpion', 'SnowyOwl', 'GiantToad', 'Werewolf', 'ForestGuardian', 'Wulfgarok', 'Minogor', 'Unicorn', 'Penguin', 'Aurai', 'FrostLizard', 'Drake', 'QueenAurora', 'Parrot', 'Cocoon', 'RiftLynx', 'Valraven', 'Falconer', 'Warhawk', 'Sunbird', 'DragonTurtle', 'Spinnerette', 'GiantCrab', 'Hippocampus', 'Merlion', 'Zhenniao', 'CatSith', 'BatSwarm', 'Umberwolf', 'Bulette', 'Hyena', 'Mammoth', 'OwlRider', 'Stone-Shaker', 'PharaohHound', 'TombSpider', 'Willow', 'Gorbil', 'DireBoar', 'CuSith', 'Nightmare', 'MidgeSwarm', 'FestivalCow', 'ArcticFox', 'Barghast', 'GriffStonefeather', 'Rhynaggor', 'TurtleCannon', 'Bunnicorn', 'Nightwing', 'Plainsjumper', 'MoonRabbit', 'Qilin', 'VineMarten', 'WoodRhynax', 'SnowPanther', 'UrskayanBlue', 'HornedAsp', 'Necrocorn', 'Glutmaw', 'CorpseMare', 'ROVER-300', 'Frostfeather', 'Grimcorn', 'HarpyEagle', 'Droggo', 'Kryshound', 'WarWolf', 'GuardianOfTheFields', 'Amaru', 'DireCub', 'Tutankhatmun', 'DandyLion', 'Crysturtle', 'Werebird', 'Werebear', 'Werecat', 'BeastmasterTorbern', 'SirQuentinHadley', 'ChaosHound', 'P4-NTH4', 'MechaRat', 'Blightwing', 'DynamiteGoat', 'Netherhound', 'SwampRat', 'Basilisk', 'WarElephant', 'Axolotl', 'Doombat', 'DreadSteed', 'LordBelanor', 'Amarok', 'ArmoredBoarlet', 'DeepHuntsman', 'FlameOfAnu', 'NightSpider', 'Kharybdis', 'Pan', 'CarrionCrow', 'SnowyOwlbear', 'Baihu', 'UlfsMascot', 'Hatir&Skroll', 'HatirAscendant', 'SkrollReborn', 'Wereraven', 'Werebat', 'Wereverine', 'TheWerestag', 'Devourer', 'IceOrca', 'Wererat', 'Swanmay', 'Wereshark', 'SkyScorpion', 'AransiTheGuardian', 'NaturebornWolf', 'FirebornEagle', 'WaterbornOwl', 'StonebornLion', 'MoonPhoenix', 'Leocorn', 'Catterfly', 'BrianTheClucky', 'Narwhale', 'SteelCobra', 'SkyGoat', 'Shadowbeast', 'LavaScorpion', 'Kitsune', 'Crystalynx', 'Mechamare', 'LordArchimedus', 'Mechweaver', 'Deathclaw', 'Tauraeus', 'EagleOwl', 'FloraFawn', 'CryptHound', 'FlameRhynax', 'FireBeetle', 'StoneViper', 'Leio', 'Craghound', 'Anglerfin', 'BORK-3000', 'Scoprio', 'HoundOfLiang', 'RedFox', 'Vulperus', 'Inari', 'Zhuque', 'Negasus', 'DeadParrot', 'AxeBeak', 'Deathgaunt', 'FeyHound', 'SandCat', 'CobaltDrake', 'StonePanther', 'MantaRaider', 'SkellyCat', 'Grimfeather', 'Werehound', 'RatSwarm', 'LeapingSpider', 'BoneHound', 'TheBestialFey', 'Egris', 'Caribou', 'ArcaneSabercat', 'DeephornBeetle', 'Bloodfang', 'GiantBadger', 'Adelwing', 'BrassDrake', 'UndeadLion', 'Valhawk', 'ManeCourser', 'Weresnake', 'FirebornLynx', 'Amphib-o-Bot', 'MidwinterLycan', 'Mistlark', 'WargSpirit', 'Moonfeather', 'YetiCub', 'DeepSpider', 'BlightHound', 'ShadowBeetle', 'DuskOwlbear', 'WingedDonkey', 'Foxglove', 'Peregrine', 'LionOfYaoGuai', 'ImmortalScoprio', 'ZombieGoat', 'RottingSerpent', 'Treviamus', 'Reavnarokkr', 'Yue-She', 'BloomManatee', 'FelineOfEnvy', 'Azaleus', 'Xuanwu', 'Scrollweaver', 'ImmortalLeio', 'Cosmo', 'Dragonhawk', 'WEEZL-300', 'Rockraptor', 'CaravanCamel', 'Gindibu', 'Yohaulticetl', 'Warmadillo', 'ToxicPuffer', 'Warfang', 'GriffonCaptain', 'PoisonedUrsidae', 'CaveMole', 'ManedWolf', 'FrostSpider', 'CaveCrawler', 'RagingBull', 'Tetramorph'], undefined),
    ),
  },
  {
    id: 8253,
    desc: '耗掉所有敌人 5 点法力值，或给予所有其他盟友 [(魔法 / 3) + 1] 点魔法值，或创造 12 颗紫色宝石。',
    build: skill(
      oneOf([reduce('enemyAll', 'mana', 5, 0)], [magic('allyOthers', 1, 0.3333)], [createGems(BaseColor.Purple, 12, 0)]),
    ),
  },
  {
    id: 8254,
    desc: '对一名敌人造成 [魔法 + 5] 点严重溅射伤害，每锻炼 1 个武器段位则 +4 点伤害值。击晕所有蓝色敌人并净化所有蓝色盟友。爆破 4 颗宝石，如果敌方有劫数，则再爆破 3 颗宝石。',
    build: skill(
      dmgSplash('enemyChosen', 5, 1, { range: 'splash', modifier: { mod: { kind: 'multiplier', a: 4 }, source: { kind: 'tempering' } } }),
      inflict('stun', 'allyAll'),
      explodeRandomGems(4, 0, 'color', undefined),
      explodeRandomGems(3, 0, 'color', undefined, { ifCond: { kind: 'targetHasDoom' } }),
    ),
  },
  {
    id: 8255,
    desc: '对一名敌人造成 [魔法 + 5] 点严重溅射伤害，每锻炼 1 个武器段位则 +4 点伤害值。击晕所有绿色敌人并净化所有绿色盟友。爆破 4 颗宝石，如果敌方有劫数，则再爆破 3 颗宝石。',
    build: skill(
      dmgSplash('enemyChosen', 5, 1, { range: 'splash', modifier: { mod: { kind: 'multiplier', a: 4 }, source: { kind: 'tempering' } } }),
      inflict('stun', 'allyAll'),
      explodeRandomGems(4, 0, 'color', undefined),
      explodeRandomGems(3, 0, 'color', undefined, { ifCond: { kind: 'targetHasDoom' } }),
    ),
  },
  {
    id: 8256,
    desc: '对一名敌人造成 [魔法 + 5] 点严重溅射伤害，每锻炼 1 个武器段位则 +4 点伤害值。击晕所有红色敌人并净化所有红色盟友。爆破 4 颗宝石，如果敌方有劫数，则再爆破 3 颗宝石。',
    build: skill(
      dmgSplash('enemyChosen', 5, 1, { range: 'splash', modifier: { mod: { kind: 'multiplier', a: 4 }, source: { kind: 'tempering' } } }),
      inflict('stun', 'allyAll'),
      explodeRandomGems(4, 0, 'color', undefined),
      explodeRandomGems(3, 0, 'color', undefined, { ifCond: { kind: 'targetHasDoom' } }),
    ),
  },
  {
    id: 8257,
    desc: '对一名敌人造成 [魔法 + 5] 点严重溅射伤害，每锻炼 1 个武器段位则 +4 点伤害值。击晕所有黄色敌人并净化所有黄色盟友。爆破 4 颗宝石，如果敌方有劫数，则再爆破 3 颗宝石。',
    build: skill(
      dmgSplash('enemyChosen', 5, 1, { range: 'splash', modifier: { mod: { kind: 'multiplier', a: 4 }, source: { kind: 'tempering' } } }),
      inflict('stun', 'allyAll'),
      explodeRandomGems(4, 0, 'color', undefined),
      explodeRandomGems(3, 0, 'color', undefined, { ifCond: { kind: 'targetHasDoom' } }),
    ),
  },
  {
    id: 8258,
    desc: '对一名敌人造成 [魔法 + 5] 点严重溅射伤害，每锻炼 1 个武器段位则 +4 点伤害值。击晕所有紫色敌人并净化所有紫色盟友。爆破 4 颗宝石，如果敌方有劫数，则再爆破 3 颗宝石。',
    build: skill(
      dmgSplash('enemyChosen', 5, 1, { range: 'splash', modifier: { mod: { kind: 'multiplier', a: 4 }, source: { kind: 'tempering' } } }),
      inflict('stun', 'allyAll'),
      explodeRandomGems(4, 0, 'color', undefined),
      explodeRandomGems(3, 0, 'color', undefined, { ifCond: { kind: 'targetHasDoom' } }),
    ),
  },
  {
    id: 8259,
    desc: '对一名敌人造成 [魔法 + 5] 点严重溅射伤害，每锻炼 1 个武器段位则 +4 点伤害值。击晕所有棕色敌人并净化所有棕色盟友。爆破 4 颗宝石，如果敌方有劫数，则再爆破 3 颗宝石。',
    build: skill(
      dmgSplash('enemyChosen', 5, 1, { range: 'splash', modifier: { mod: { kind: 'multiplier', a: 4 }, source: { kind: 'tempering' } } }),
      inflict('stun', 'allyAll'),
      explodeRandomGems(4, 0, 'color', undefined),
      explodeRandomGems(3, 0, 'color', undefined, { ifCond: { kind: 'targetHasDoom' } }),
    ),
  },
  {
    id: 8260,
    desc: '对一名敌人造成 [魔法 + 7] 点伤害，伤害值因迈纳杰之罪盟友数而增强。每有一名迈纳杰之罪盟友，则创造 6 颗混合红色和紫色的宝石。 [x6]',
    build: skill(
      dmg('enemyChosen', 7, 1, { modifier: { mod: { kind: 'multiplier', a: 6 }, source: { kind: 'alliesOfKingdom', kingdom: '迈纳杰之罪' } } }),
      createMix([BaseColor.Red, BaseColor.Purple], 6, 0, { modifier: { mod: { kind: 'multiplier', a: 6 }, source: { kind: 'alliesOfKingdom', kingdom: '迈纳杰之罪' } } }),
    ),
  },
  {
    id: 8261,
    desc: '对一名敌人造成 [魔法 + 7] 点伤害，伤害值因聚沙之地盟友数而增强。每有一名聚沙之地盟友，则创造 6 颗混合黄色和棕色的宝石。 [x6]',
    build: skill(
      dmg('enemyChosen', 7, 1, { modifier: { mod: { kind: 'multiplier', a: 6 }, source: { kind: 'alliesOfKingdom', kingdom: '聚沙之地' } } }),
      createMix([BaseColor.Yellow, BaseColor.Brown], 6, 0, { modifier: { mod: { kind: 'multiplier', a: 6 }, source: { kind: 'alliesOfKingdom', kingdom: '聚沙之地' } } }),
    ),
  },
  {
    id: 8262,
    desc: '对一名敌人造成 [魔法 + 7] 点伤害，伤害值因荒芜之地盟友数而增强。每有一名荒芜之地盟友，则创造 6 颗混合红色和紫色的宝石。 [x6]',
    build: skill(
      dmg('enemyChosen', 7, 1, { modifier: { mod: { kind: 'multiplier', a: 6 }, source: { kind: 'alliesOfKingdom', kingdom: '荒芜之地' } } }),
      createMix([BaseColor.Red, BaseColor.Purple], 6, 0, { modifier: { mod: { kind: 'multiplier', a: 6 }, source: { kind: 'alliesOfKingdom', kingdom: '荒芜之地' } } }),
    ),
  },
  {
    id: 8263,
    desc: '对一名敌人造成 [魔法 + 7] 点伤害，伤害值因白盔国盟友数而增强。每有一名白盔国盟友，则创造 6 颗混合黄色和棕色的宝石。 [x6]',
    build: skill(
      dmg('enemyChosen', 7, 1, { modifier: { mod: { kind: 'multiplier', a: 6 }, source: { kind: 'alliesOfKingdom', kingdom: '白盔国' } } }),
      createMix([BaseColor.Yellow, BaseColor.Brown], 6, 0, { modifier: { mod: { kind: 'multiplier', a: 6 }, source: { kind: 'alliesOfKingdom', kingdom: '白盔国' } } }),
    ),
  },
  {
    id: 8264,
    desc: '对一名敌人造成 [魔法 + 7] 点伤害，伤害值因精灵盟友数而增强。每有一名精灵盟友，则创造 6 颗混合绿色和紫色的宝石。 [x6]',
    build: skill(
      dmg('enemyChosen', 7, 1, { modifier: { mod: { kind: 'multiplier', a: 6 }, source: { kind: 'alliesOfRace', race: 'Elf' } } }),
      createMix([BaseColor.Green, BaseColor.Purple], 6, 0, { modifier: { mod: { kind: 'multiplier', a: 6 }, sources: [{ kind: 'alliesOfRace', race: 'Elf' }] } }),
    ),
  },
  {
    id: 8265,
    desc: '对一名敌人造成 [魔法 + 7] 点伤害，伤害值因兽人盟友数而增强。每有一名兽人盟友，则创造 6 颗混合绿色和红色的宝石。 [x6]',
    build: skill(
      dmg('enemyChosen', 7, 1, { modifier: { mod: { kind: 'multiplier', a: 6 }, source: { kind: 'alliesOfRace', race: 'Orc' } } }),
      createMix([BaseColor.Green, BaseColor.Red], 6, 0, { modifier: { mod: { kind: 'multiplier', a: 6 }, sources: [{ kind: 'alliesOfRace', race: 'Orc' }] } }),
    ),
  },
  {
    id: 8266,
    desc: '对一名敌人造成 [魔法 + 7] 点伤害，伤害值因妖仙盟友数而增强。每有一名妖仙盟友，则创造 6 颗混合绿色和紫色的宝石。 [x6]',
    build: skill(
      dmg('enemyChosen', 7, 1, { modifier: { mod: { kind: 'multiplier', a: 6 }, source: { kind: 'alliesOfRace', race: 'Fey' } } }),
      createMix([BaseColor.Green, BaseColor.Purple], 6, 0, { modifier: { mod: { kind: 'multiplier', a: 6 }, sources: [{ kind: 'alliesOfRace', race: 'Fey' }] } }),
    ),
  },
  {
    id: 8283,
    desc: '对一名敌人造成 [魔法 + 2] 点伤害，并魅惑敌人。有 30% 个别几率获得一个额外回合和半数法力值，几率因棕色宝石数而增强。',
    build: skill(
      dmg('enemyChosen', 2, 1),
      inflict('charm', 'enemyChosen'),
      extraTurn({ chance: 0.3, chanceBoost: { mod: { kind: 'ratio', a: 1, b: 1 }, source: { kind: 'boardGems', color: BaseColor.Brown } } }),
      mana('allySelf', 0, 0, { halve: true, chance: 0.3, chanceBoost: { mod: { kind: 'ratio', a: 1, b: 1 }, source: { kind: 'boardGems', color: BaseColor.Brown } } }),
    ),
  },
  {
    id: 8284,
    desc: '赋予一名盟友狂怒效果，再给予其 [(魔法 / 2) + 1] 点攻击力，数值因兽人盟友数而增强。召唤一名兽人。 [1:1]',
    build: skill(
      inflict('rage', 'allyChosen'),
      attack('allyChosen', 1, 0.5, { modifier: { mod: { kind: 'ratio', a: 1, b: 1 }, source: { kind: 'alliesOfRace', race: 'Orc' } } }),
      summonRandom(['Orc', 'Summoner', 'Cyclops', 'DrakeRider', 'DarkSong', 'GarNok', 'FelDras', 'Bugbear', 'Ogryn', 'OrcVeteran', 'Gargantaur', 'SolZara', 'VorKarn', 'FistOfZorn', 'BorGakk', 'ShadeOfZorn', 'GorThrum', 'FirstMateAxelubber', 'BrawlmasterBurNakh', 'WarDrok', 'TuskRaider', 'RokGarTheGuardian', 'Pyrophemus', 'TrkNala', 'EyeOfArges', 'MouthOfZorn', 'OrcRogue', 'MazeCyclops', 'DaeDrak', 'ImmortalAngRak', 'KragRaxBloodskull', 'MorZarn', 'Warfang', 'Shargral'], undefined),
    ),
  },
  {
    id: 8285,
    desc: '对一名敌人造成 [魔法 + 7] 点伤害，伤害值因卡拉考斯盟友数而增强。每有一名卡拉考斯盟友，则创建 6 颗混合紫色和棕色的宝石。 [x6]',
    build: skill(
      dmg('enemyChosen', 7, 1, { modifier: { mod: { kind: 'multiplier', a: 6 }, source: { kind: 'alliesOfKingdom', kingdom: '卡拉考斯' } } }),
      createMix([BaseColor.Purple, BaseColor.Brown], 6, 0, { modifier: { mod: { kind: 'multiplier', a: 6 }, source: { kind: 'alliesOfKingdom', kingdom: '卡拉考斯' } } }),
    ),
  },
  {
    id: 8299,
    desc: '将一名敌人和自身拉到首位。创建 6 颗骷髅头。若自身生命值高于敌人，则再创造 8 颗骷髅头。',
    build: skill(
      reposition('enemyChosen', 'front'),
      reposition('allySelf', 'front'),
      createSkulls(6, 0),
      createSkulls(8, 0, { ifCond: { kind: 'casterStatBeatsTarget', stat: 'hp' } }),
    ),
  },
  {
    id: 8313,
    desc: '对一名敌人造成 [魔法 + 7] 伤害，伤害值因梅兰堤斯盟友数而增强。每有一名梅兰堤斯盟友，则创建 6 颗混合蓝色和绿色的宝石。 [x6]',
    build: skill(
      dmg('enemyChosen', 7, 1, { modifier: { mod: { kind: 'multiplier', a: 6 }, source: { kind: 'alliesOfKingdom', kingdom: '梅兰堤斯' } } }),
      createMix([BaseColor.Blue, BaseColor.Green], 6, 0, { modifier: { mod: { kind: 'multiplier', a: 6 }, source: { kind: 'alliesOfKingdom', kingdom: '梅兰堤斯' } } }),
    ),
  },
  {
    id: 8314,
    desc: '对一名敌人造成 [魔法 + 7] 伤害，伤害值因恶魔盟友数而增强。每有一名恶魔盟友，则创建 6 颗混合红色和紫色的宝石。 [x6]',
    build: skill(
      dmg('enemyChosen', 7, 1, { modifier: { mod: { kind: 'multiplier', a: 6 }, source: { kind: 'alliesOfRace', race: 'Daemon' } } }),
      createMix([BaseColor.Red, BaseColor.Purple], 6, 0, { modifier: { mod: { kind: 'multiplier', a: 6 }, sources: [{ kind: 'alliesOfRace', race: 'Daemon' }] } }),
    ),
  },
  {
    id: 8315,
    desc: '对一名敌人造成 [魔法 + 7] 伤害，伤害值因人马盟友数而增强。每有一名人马盟友，则创建 6 颗混合绿色和黄色的宝石。 [x6]',
    build: skill(
      dmg('enemyChosen', 7, 1, { modifier: { mod: { kind: 'multiplier', a: 6 }, source: { kind: 'alliesOfRace', race: 'Centaur' } } }),
      createMix([BaseColor.Green, BaseColor.Yellow], 6, 0, { modifier: { mod: { kind: 'multiplier', a: 6 }, sources: [{ kind: 'alliesOfRace', race: 'Centaur' }] } }),
    ),
  },
  {
    id: 8321,
    desc: '获得 [魔法 + 1] 点护甲值，数值因陷入燃烧和疾病状态的敌人数而增强。再使所有敌人陷入燃烧或疾病状态。 [x5]',
    build: skill(
      armor('allySelf', 1, 1, { modifier: { mod: { kind: 'multiplier', a: 5 }, source: { kind: 'enemyStatusCount', statusId: 'burning' } } }),
      inflict('burning', 'enemyAll'),
    ),
  },
  {
    id: 8322,
    desc: '移除所有黄色宝石。对一名敌人造成l [魔法 + 5] 点伤害，伤害值因被移除的宝石数而增强。若敌人来自阿达纳，或战斗发生在阿达纳，则造成双倍伤害。 [3:1]',
    build: skill(
      destroyColor(BaseColor.Yellow),
      dmg('enemyChosen', 5, 1, { modifier: { mod: { kind: 'ratio', a: 3, b: 1 }, source: { kind: 'destroyedGems' } }, condMult: { times: 2, cond: { kind: 'anyOf', of: [{ kind: 'kingdomOf', side: 'enemy', kingdom: '阿达纳' }, { kind: 'kingdomPresent', kingdom: '阿达纳' }] } } }),
    ),
  },
  {
    id: 8323,
    desc: '移除所有紫色宝石。对一名敌人造成l [魔法 + 5] 点伤害，伤害值因被移除的宝石数而增强。若敌人来自卡拉考斯，或战斗发生在卡拉考斯，则造成双倍伤害。 [3:1]',
    build: skill(
      destroyColor(BaseColor.Purple),
      dmg('enemyChosen', 5, 1, { modifier: { mod: { kind: 'ratio', a: 3, b: 1 }, source: { kind: 'destroyedGems' } }, condMult: { times: 2, cond: { kind: 'anyOf', of: [{ kind: 'kingdomOf', side: 'enemy', kingdom: '卡拉考斯' }, { kind: 'kingdomPresent', kingdom: '卡拉考斯' }] } } }),
    ),
  },
  {
    id: 8324,
    desc: '移除所有紫色宝石。对一名敌人造成l [魔法 + 5] 点伤害，伤害值因被移除的宝石数而增强。若敌人来自蛛尔卡里，或战斗发生在蛛尔卡里，则造成双倍伤害。 [3:1]',
    build: skill(
      destroyColor(BaseColor.Purple),
      dmg('enemyChosen', 5, 1, { modifier: { mod: { kind: 'ratio', a: 3, b: 1 }, source: { kind: 'destroyedGems' } }, condMult: { times: 2, cond: { kind: 'anyOf', of: [{ kind: 'kingdomOf', side: 'enemy', kingdom: '蛛尔卡里' }, { kind: 'kingdomPresent', kingdom: '蛛尔卡里' }] } } }),
    ),
  },
  {
    id: 8325,
    desc: '移除所有黄色宝石。对一名敌人造成l [魔法 + 5] 点伤害，伤害值因被移除的宝石数而增强。若敌人来自卜筮之原，或战斗发生在卜筮之原，则造成双倍伤害。 [3:1]',
    build: skill(
      destroyColor(BaseColor.Yellow),
      dmg('enemyChosen', 5, 1, { modifier: { mod: { kind: 'ratio', a: 3, b: 1 }, source: { kind: 'destroyedGems' } }, condMult: { times: 2, cond: { kind: 'anyOf', of: [{ kind: 'kingdomOf', side: 'enemy', kingdom: '卜筮之原' }, { kind: 'kingdomPresent', kingdom: '卜筮之原' }] } } }),
    ),
  },
  {
    id: 8326,
    desc: '移除所有绿色宝石。对一名敌人造成l [魔法 + 5] 点伤害，伤害值因被移除的宝石数而增强。若敌人来自鳞雾沼泽，或战斗发生在鳞雾沼泽，则造成双倍伤害。 [3:1]',
    build: skill(
      destroyColor(BaseColor.Green),
      dmg('enemyChosen', 5, 1, { modifier: { mod: { kind: 'ratio', a: 3, b: 1 }, source: { kind: 'destroyedGems' } }, condMult: { times: 2, cond: { kind: 'anyOf', of: [{ kind: 'kingdomOf', side: 'enemy', kingdom: '鳞雾沼泽' }, { kind: 'kingdomPresent', kingdom: '鳞雾沼泽' }] } } }),
    ),
  },
  {
    id: 8327,
    desc: '移除所有绿色宝石。对一名敌人造成l [魔法 + 5] 点伤害，伤害值因被移除的宝石数而增强。若敌人来自荆棘森林，或战斗发生在荆棘森林，则造成双倍伤害。 [3:1]',
    build: skill(
      destroyColor(BaseColor.Green),
      dmg('enemyChosen', 5, 1, { modifier: { mod: { kind: 'ratio', a: 3, b: 1 }, source: { kind: 'destroyedGems' } }, condMult: { times: 2, cond: { kind: 'anyOf', of: [{ kind: 'kingdomOf', side: 'enemy', kingdom: '荆棘森林' }, { kind: 'kingdomPresent', kingdom: '荆棘森林' }] } } }),
    ),
  },
  {
    id: 8328,
    desc: '移除所有黄色宝石。对一名敌人造成l [魔法 + 5] 点伤害，伤害值因被移除的宝石数而增强。若敌人来自白盔国，或战斗发生在白盔国，则造成双倍伤害。 [3:1]',
    build: skill(
      destroyColor(BaseColor.Yellow),
      dmg('enemyChosen', 5, 1, { modifier: { mod: { kind: 'ratio', a: 3, b: 1 }, source: { kind: 'destroyedGems' } }, condMult: { times: 2, cond: { kind: 'anyOf', of: [{ kind: 'kingdomOf', side: 'enemy', kingdom: '白盔国' }, { kind: 'kingdomPresent', kingdom: '白盔国' }] } } }),
    ),
  },
  {
    id: 8329,
    desc: '移除所有绿色宝石。对一名敌人造成l [魔法 + 5] 点伤害，伤害值因被移除的宝石数而增强。若敌人来自潘神之谷，或战斗发生在潘神之谷，则造成双倍伤害。 [3:1]',
    build: skill(
      destroyColor(BaseColor.Green),
      dmg('enemyChosen', 5, 1, { modifier: { mod: { kind: 'ratio', a: 3, b: 1 }, source: { kind: 'destroyedGems' } }, condMult: { times: 2, cond: { kind: 'anyOf', of: [{ kind: 'kingdomOf', side: 'enemy', kingdom: '潘神之谷' }, { kind: 'kingdomPresent', kingdom: '潘神之谷' }] } } }),
    ),
  },
  {
    id: 8330,
    desc: '移除所有棕色宝石。对一名敌人造成l [魔法 + 5] 点伤害，伤害值因被移除的宝石数而增强。若敌人来自卡其尔，或战斗发生在卡其尔，则造成双倍伤害。 [3:1]',
    build: skill(
      destroyColor(BaseColor.Brown),
      dmg('enemyChosen', 5, 1, { modifier: { mod: { kind: 'ratio', a: 3, b: 1 }, source: { kind: 'destroyedGems' } }, condMult: { times: 2, cond: { kind: 'anyOf', of: [{ kind: 'kingdomOf', side: 'enemy', kingdom: '卡其尔' }, { kind: 'kingdomPresent', kingdom: '卡其尔' }] } } }),
    ),
  },
  {
    id: 8331,
    desc: '移除所有紫色宝石。对一名敌人造成l [魔法 + 5] 点伤害，伤害值因被移除的宝石数而增强。若敌人来自盖塔尔，或战斗发生在盖塔尔，则造成双倍伤害。 [3:1]',
    build: skill(
      destroyColor(BaseColor.Purple),
      dmg('enemyChosen', 5, 1, { modifier: { mod: { kind: 'ratio', a: 3, b: 1 }, source: { kind: 'destroyedGems' } }, condMult: { times: 2, cond: { kind: 'anyOf', of: [{ kind: 'kingdomOf', side: 'enemy', kingdom: '盖塔尔' }, { kind: 'kingdomPresent', kingdom: '盖塔尔' }] } } }),
    ),
  },
  {
    id: 8332,
    desc: '移除所有绿色宝石。对一名敌人造成l [魔法 + 5] 点伤害，伤害值因被移除的宝石数而增强。若敌人来自齐埃金，或战斗发生在齐埃金，则造成双倍伤害。 [3:1]',
    build: skill(
      destroyColor(BaseColor.Green),
      dmg('enemyChosen', 5, 1, { modifier: { mod: { kind: 'ratio', a: 3, b: 1 }, source: { kind: 'destroyedGems' } }, condMult: { times: 2, cond: { kind: 'anyOf', of: [{ kind: 'kingdomOf', side: 'enemy', kingdom: '齐埃金' }, { kind: 'kingdomPresent', kingdom: '齐埃金' }] } } }),
    ),
  },
  {
    id: 8333,
    desc: '移除所有红色宝石。对一名敌人造成l [魔法 + 5] 点伤害，伤害值因被移除的宝石数而增强。若敌人来自荣耀之地，或战斗发生在荣耀之地，则造成双倍伤害。 [3:1]',
    build: skill(
      destroyColor(BaseColor.Red),
      dmg('enemyChosen', 5, 1, { modifier: { mod: { kind: 'ratio', a: 3, b: 1 }, source: { kind: 'destroyedGems' } }, condMult: { times: 2, cond: { kind: 'anyOf', of: [{ kind: 'kingdomOf', side: 'enemy', kingdom: '荣耀之地' }, { kind: 'kingdomPresent', kingdom: '荣耀之地' }] } } }),
    ),
  },
  {
    id: 8334,
    desc: '移除所有紫色宝石。对一名敌人造成l [魔法 + 5] 点伤害，伤害值因被移除的宝石数而增强。若敌人来自加尔凡尼亚，或战斗发生在加尔凡尼亚，则造成双倍伤害。 [3:1]',
    build: skill(
      destroyColor(BaseColor.Purple),
      dmg('enemyChosen', 5, 1, { modifier: { mod: { kind: 'ratio', a: 3, b: 1 }, source: { kind: 'destroyedGems' } }, condMult: { times: 2, cond: { kind: 'anyOf', of: [{ kind: 'kingdomOf', side: 'enemy', kingdom: '加尔凡尼亚' }, { kind: 'kingdomPresent', kingdom: '加尔凡尼亚' }] } } }),
    ),
  },
  {
    id: 8335,
    desc: '移除所有蓝色宝石。对一名敌人造成l [魔法 + 5] 点伤害，伤害值因被移除的宝石数而增强。若敌人来自剑锋崖，或战斗发生在剑锋崖，则造成双倍伤害。 [3:1]',
    build: skill(
      destroyColor(BaseColor.Blue),
      dmg('enemyChosen', 5, 1, { modifier: { mod: { kind: 'ratio', a: 3, b: 1 }, source: { kind: 'destroyedGems' } }, condMult: { times: 2, cond: { kind: 'anyOf', of: [{ kind: 'kingdomOf', side: 'enemy', kingdom: '剑锋崖' }, { kind: 'kingdomPresent', kingdom: '剑锋崖' }] } } }),
    ),
  },
  {
    id: 8336,
    desc: '移除所有蓝色宝石。对一名敌人造成l [魔法 + 5] 点伤害，伤害值因被移除的宝石数而增强。若敌人来自风暴峡湾，或战斗发生在风暴峡湾，则造成双倍伤害。 [3:1]',
    build: skill(
      destroyColor(BaseColor.Blue),
      dmg('enemyChosen', 5, 1, { modifier: { mod: { kind: 'ratio', a: 3, b: 1 }, source: { kind: 'destroyedGems' } }, condMult: { times: 2, cond: { kind: 'anyOf', of: [{ kind: 'kingdomOf', side: 'enemy', kingdom: '风暴峡湾' }, { kind: 'kingdomPresent', kingdom: '风暴峡湾' }] } } }),
    ),
  },
  {
    id: 8337,
    desc: '移除所有绿色宝石。对一名敌人造成l [魔法 + 5] 点伤害，伤害值因被移除的宝石数而增强。若敌人来自毛格瑞姆森林，或战斗发生在毛格瑞姆森林，则造成双倍伤害。 [3:1]',
    build: skill(
      destroyColor(BaseColor.Green),
      dmg('enemyChosen', 5, 1, { modifier: { mod: { kind: 'ratio', a: 3, b: 1 }, source: { kind: 'destroyedGems' } }, condMult: { times: 2, cond: { kind: 'anyOf', of: [{ kind: 'kingdomOf', side: 'enemy', kingdom: '毛格瑞姆森林' }, { kind: 'kingdomPresent', kingdom: '毛格瑞姆森林' }] } } }),
    ),
  },
  {
    id: 8338,
    desc: '移除所有红色宝石。对一名敌人造成l [魔法 + 5] 点伤害，伤害值因被移除的宝石数而增强。若敌人来自葛洛什奈克，或战斗发生在葛洛什奈克，则造成双倍伤害。 [3:1]',
    build: skill(
      destroyColor(BaseColor.Red),
      dmg('enemyChosen', 5, 1, { modifier: { mod: { kind: 'ratio', a: 3, b: 1 }, source: { kind: 'destroyedGems' } }, condMult: { times: 2, cond: { kind: 'anyOf', of: [{ kind: 'kingdomOf', side: 'enemy', kingdom: '葛洛什奈克' }, { kind: 'kingdomPresent', kingdom: '葛洛什奈克' }] } } }),
    ),
  },
  {
    id: 8339,
    desc: '移除所有棕色宝石。对一名敌人造成l [魔法 + 5] 点伤害，伤害值因被移除的宝石数而增强。若敌人来自狂野平原，或战斗发生在狂野平原，则造成双倍伤害。 [3:1]',
    build: skill(
      destroyColor(BaseColor.Brown),
      dmg('enemyChosen', 5, 1, { modifier: { mod: { kind: 'ratio', a: 3, b: 1 }, source: { kind: 'destroyedGems' } }, condMult: { times: 2, cond: { kind: 'anyOf', of: [{ kind: 'kingdomOf', side: 'enemy', kingdom: '狂野平原' }, { kind: 'kingdomPresent', kingdom: '狂野平原' }] } } }),
    ),
  },
  {
    id: 8340,
    desc: '移除所有紫色宝石。对一名敌人造成l [魔法 + 5] 点伤害，伤害值因被移除的宝石数而增强。若敌人来自黑石，或战斗发生在黑石，则造成双倍伤害。 [3:1]',
    build: skill(
      destroyColor(BaseColor.Purple),
      dmg('enemyChosen', 5, 1, { modifier: { mod: { kind: 'ratio', a: 3, b: 1 }, source: { kind: 'destroyedGems' } }, condMult: { times: 2, cond: { kind: 'anyOf', of: [{ kind: 'kingdomOf', side: 'enemy', kingdom: '黑石' }, { kind: 'kingdomPresent', kingdom: '黑石' }] } } }),
    ),
  },
  {
    id: 8341,
    desc: '移除所有黄色宝石。对一名敌人造成l [魔法 + 5] 点伤害，伤害值因被移除的宝石数而增强。若敌人来自聚沙之地，或战斗发生在聚沙之地，则造成双倍伤害。 [3:1]',
    build: skill(
      destroyColor(BaseColor.Yellow),
      dmg('enemyChosen', 5, 1, { modifier: { mod: { kind: 'ratio', a: 3, b: 1 }, source: { kind: 'destroyedGems' } }, condMult: { times: 2, cond: { kind: 'anyOf', of: [{ kind: 'kingdomOf', side: 'enemy', kingdom: '聚沙之地' }, { kind: 'kingdomPresent', kingdom: '聚沙之地' }] } } }),
    ),
  },
  {
    id: 8342,
    desc: '移除所有红色宝石。对一名敌人造成l [魔法 + 5] 点伤害，伤害值因被移除的宝石数而增强。若敌人来自荒芜之地，或战斗发生在荒芜之地，则造成双倍伤害。 [3:1]',
    build: skill(
      destroyColor(BaseColor.Red),
      dmg('enemyChosen', 5, 1, { modifier: { mod: { kind: 'ratio', a: 3, b: 1 }, source: { kind: 'destroyedGems' } }, condMult: { times: 2, cond: { kind: 'anyOf', of: [{ kind: 'kingdomOf', side: 'enemy', kingdom: '荒芜之地' }, { kind: 'kingdomPresent', kingdom: '荒芜之地' }] } } }),
    ),
  },
  {
    id: 8343,
    desc: '移除所有蓝色宝石。对一名敌人造成l [魔法 + 5] 点伤害，伤害值因被移除的宝石数而增强。若敌人来自冰峰之巅，或战斗发生在冰峰之巅，则造成双倍伤害。 [3:1]',
    build: skill(
      destroyColor(BaseColor.Blue),
      dmg('enemyChosen', 5, 1, { modifier: { mod: { kind: 'ratio', a: 3, b: 1 }, source: { kind: 'destroyedGems' } }, condMult: { times: 2, cond: { kind: 'anyOf', of: [{ kind: 'kingdomOf', side: 'enemy', kingdom: '冰峰之巅' }, { kind: 'kingdomPresent', kingdom: '冰峰之巅' }] } } }),
    ),
  },
  {
    id: 8344,
    desc: '移除所有蓝色宝石。对一名敌人造成l [魔法 + 5] 点伤害，伤害值因被移除的宝石数而增强。若敌人来自狮心帝国，或战斗发生在狮心帝国，则造成双倍伤害。 [3:1]',
    build: skill(
      destroyColor(BaseColor.Blue),
      dmg('enemyChosen', 5, 1, { modifier: { mod: { kind: 'ratio', a: 3, b: 1 }, source: { kind: 'destroyedGems' } }, condMult: { times: 2, cond: { kind: 'anyOf', of: [{ kind: 'kingdomOf', side: 'enemy', kingdom: '狮心帝国' }, { kind: 'kingdomPresent', kingdom: '狮心帝国' }] } } }),
    ),
  },
  {
    id: 8345,
    desc: '移除所有红色宝石。对一名敌人造成l [魔法 + 5] 点伤害，伤害值因被移除的宝石数而增强。若敌人来自龙爪，或战斗发生在龙爪，则造成双倍伤害。 [3:1]',
    build: skill(
      destroyColor(BaseColor.Red),
      dmg('enemyChosen', 5, 1, { modifier: { mod: { kind: 'ratio', a: 3, b: 1 }, source: { kind: 'destroyedGems' } }, condMult: { times: 2, cond: { kind: 'anyOf', of: [{ kind: 'kingdomOf', side: 'enemy', kingdom: '龙爪' }, { kind: 'kingdomPresent', kingdom: '龙爪' }] } } }),
    ),
  },
  {
    id: 8346,
    desc: '移除所有蓝色宝石。对一名敌人造成l [魔法 + 5] 点伤害，伤害值因被移除的宝石数而增强。若敌人来自黑鹰，或战斗发生在黑鹰，则造成双倍伤害。 [3:1]',
    build: skill(
      destroyColor(BaseColor.Blue),
      dmg('enemyChosen', 5, 1, { modifier: { mod: { kind: 'ratio', a: 3, b: 1 }, source: { kind: 'destroyedGems' } }, condMult: { times: 2, cond: { kind: 'anyOf', of: [{ kind: 'kingdomOf', side: 'enemy', kingdom: '黑鹰' }, { kind: 'kingdomPresent', kingdom: '黑鹰' }] } } }),
    ),
  },
  {
    id: 8347,
    desc: '移除所有紫色宝石。对一名敌人造成l [魔法 + 5] 点伤害，伤害值因被移除的宝石数而增强。若敌人来自玉银林地，或战斗发生在玉银林地，则造成双倍伤害。 [3:1]',
    build: skill(
      destroyColor(BaseColor.Purple),
      dmg('enemyChosen', 5, 1, { modifier: { mod: { kind: 'ratio', a: 3, b: 1 }, source: { kind: 'destroyedGems' } }, condMult: { times: 2, cond: { kind: 'anyOf', of: [{ kind: 'kingdomOf', side: 'enemy', kingdom: '玉玉银林地' }, { kind: 'kingdomPresent', kingdom: '玉玉银林地' }] } } }),
    ),
  },
  {
    id: 8348,
    desc: '移除所有黄色宝石。对一名敌人造成l [魔法 + 5] 点伤害，伤害值因被移除的宝石数而增强。若敌人来自日冕，或战斗发生在日冕，则造成双倍伤害。 [3:1]',
    build: skill(
      destroyColor(BaseColor.Yellow),
      dmg('enemyChosen', 5, 1, { modifier: { mod: { kind: 'ratio', a: 3, b: 1 }, source: { kind: 'destroyedGems' } }, condMult: { times: 2, cond: { kind: 'anyOf', of: [{ kind: 'kingdomOf', side: 'enemy', kingdom: '日冕' }, { kind: 'kingdomPresent', kingdom: '日冕' }] } } }),
    ),
  },
  {
    id: 8349,
    desc: '移除所有棕色宝石。对一名敌人造成l [魔法 + 5] 点伤害，伤害值因被移除的宝石数而增强。若敌人来自厄什卡亚，或战斗发生在厄什卡亚，则造成双倍伤害。 [3:1]',
    build: skill(
      destroyColor(BaseColor.Brown),
      dmg('enemyChosen', 5, 1, { modifier: { mod: { kind: 'ratio', a: 3, b: 1 }, source: { kind: 'destroyedGems' } }, condMult: { times: 2, cond: { kind: 'anyOf', of: [{ kind: 'kingdomOf', side: 'enemy', kingdom: '厄什卡亚' }, { kind: 'kingdomPresent', kingdom: '厄什卡亚' }] } } }),
    ),
  },
  {
    id: 8350,
    desc: '移除所有蓝色宝石。对一名敌人造成l [魔法 + 5] 点伤害，伤害值因被移除的宝石数而增强。若敌人来自梅兰堤斯，或战斗发生在梅兰堤斯，则造成双倍伤害。 [3:1]',
    build: skill(
      destroyColor(BaseColor.Blue),
      dmg('enemyChosen', 5, 1, { modifier: { mod: { kind: 'ratio', a: 3, b: 1 }, source: { kind: 'destroyedGems' } }, condMult: { times: 2, cond: { kind: 'anyOf', of: [{ kind: 'kingdomOf', side: 'enemy', kingdom: '梅兰堤斯' }, { kind: 'kingdomPresent', kingdom: '梅兰堤斯' }] } } }),
    ),
  },
  {
    id: 8351,
    desc: '移除所有绿色宝石。对一名敌人造成l [魔法 + 5] 点伤害，伤害值因被移除的宝石数而增强。若敌人来自皓彩森林，或战斗发生在皓彩森林，则造成双倍伤害。 [3:1]',
    build: skill(
      destroyColor(BaseColor.Green),
      dmg('enemyChosen', 5, 1, { modifier: { mod: { kind: 'ratio', a: 3, b: 1 }, source: { kind: 'destroyedGems' } }, condMult: { times: 2, cond: { kind: 'anyOf', of: [{ kind: 'kingdomOf', side: 'enemy', kingdom: '皓彩森林' }, { kind: 'kingdomPresent', kingdom: '皓彩森林' }] } } }),
    ),
  },
  {
    id: 8352,
    desc: '移除所有黄色宝石。对一名敌人造成l [魔法 + 5] 点伤害，伤害值因被移除的宝石数而增强。若敌人来自圣唐，或战斗发生在圣唐，则造成双倍伤害。 [3:1]',
    build: skill(
      destroyColor(BaseColor.Yellow),
      dmg('enemyChosen', 5, 1, { modifier: { mod: { kind: 'ratio', a: 3, b: 1 }, source: { kind: 'destroyedGems' } }, condMult: { times: 2, cond: { kind: 'anyOf', of: [{ kind: 'kingdomOf', side: 'enemy', kingdom: '圣唐' }, { kind: 'kingdomPresent', kingdom: '圣唐' }] } } }),
    ),
  },
  {
    id: 8353,
    desc: '移除所有棕色宝石。对一名敌人造成l [魔法 + 5] 点伤害，伤害值因被移除的宝石数而增强。若敌人来自卓克祖，或战斗发生在卓克祖，则造成双倍伤害。 [3:1]',
    build: skill(
      destroyColor(BaseColor.Brown),
      dmg('enemyChosen', 5, 1, { modifier: { mod: { kind: 'ratio', a: 3, b: 1 }, source: { kind: 'destroyedGems' } }, condMult: { times: 2, cond: { kind: 'anyOf', of: [{ kind: 'kingdomOf', side: 'enemy', kingdom: '卓克祖' }, { kind: 'kingdomPresent', kingdom: '卓克祖' }] } } }),
    ),
  },
  {
    id: 8354,
    desc: '移除所有红色宝石。对一名敌人造成l [魔法 + 5] 点伤害，伤害值因被移除的宝石数而增强。若敌人来自迈纳杰之罪，或战斗发生在迈纳杰之罪，则造成双倍伤害。 [3:1]',
    build: skill(
      destroyColor(BaseColor.Red),
      dmg('enemyChosen', 5, 1, { modifier: { mod: { kind: 'ratio', a: 3, b: 1 }, source: { kind: 'destroyedGems' } }, condMult: { times: 2, cond: { kind: 'anyOf', of: [{ kind: 'kingdomOf', side: 'enemy', kingdom: '迈纳杰之罪' }, { kind: 'kingdomPresent', kingdom: '迈纳杰之罪' }] } } }),
    ),
  },
  {
    id: 8357,
    desc: '净化所有盟友，并给予所有盟友 [魔法 + 1] 点生命值。召唤一名全视之眼军队。',
    build: skill(
      cleanse('allyAll'),
      heal('allyAll', 1, 1),
      summonRandom(['OcularenLeech', 'Ocularen', 'BurningOcularen', 'GloomOcularen'], undefined),
    ),
  },
  {
    id: 8378,
    desc: '窃取一名敌人 [魔法 + 1] 点魔法值，并将之转换成攻击力。使自身获得狂怒效果。 [100:1]',
    build: skill(
      steal('enemyChosen', 'magic', 'attack', 1, 1, { modifier: { mod: { kind: 'ratio', a: 100, b: 1 } } }),
      inflict('rage', 'allySelf'),
    ),
  },
  {
    id: 8383,
    desc: '对一名敌人造成 [魔法 + 7] 点伤害，伤害值因蛛尔卡里盟友数而增强。每有一名蛛尔卡里盟友，则创造混合绿色和紫色的 6 颗宝石。 [x6]',
    build: skill(
      dmg('enemyChosen', 7, 1, { modifier: { mod: { kind: 'multiplier', a: 6 }, source: { kind: 'alliesOfKingdom', kingdom: '蛛尔卡里' } } }),
      createMix([BaseColor.Green, BaseColor.Purple], 6, 0, { modifier: { mod: { kind: 'multiplier', a: 6 }, source: { kind: 'alliesOfKingdom', kingdom: '蛛尔卡里' } } }),
    ),
  },
  {
    id: 8384,
    desc: '爆破 [魔法 + 1] 颗绿色宝石。赋予所有元素盟友一个随机的状态效果，再召唤一个元素军队。',
    build: skill(
      explodeRandomGems(1, 1, 'color', BaseColor.Green),
      inflictRandom('allyAll', { targetRace: 'Elemental' }),
      summonRandom(['Rhynax', 'StoneGiant', 'Dryad', 'Treant', 'Nymph', 'Siren', 'FrostGiant', 'Sheggra', 'GloomLeaf', 'JarlFiremantle', 'Rowanne', 'SummerImp', 'Swamplash', 'AutumnalImp', 'DustDevil', 'Djinn', 'Ifrit', 'GreenSlime', 'Salamander', 'WinterImp', 'Zephyros', 'SeaTroll', 'ImpOfLove', 'SpringImp', 'WinterWolf', 'LavaElemental', 'FireLizard', 'RockTroll', 'Justice', 'Loyalty', 'Courage', 'Humility', 'Sacrifice', 'Honor', 'SpookyImp', 'IceGolem', 'Frostling', 'DarkTroll', 'RockSpirit', 'ObsidianTitan', 'MarshStrangler', 'Bogstrider', 'Archdruid', 'Nyx', 'Garuda', 'FrostLizard', 'DesertTroll', 'Infernus', 'Leshy', 'Vodyanoi', 'Sunbird', 'ForestTroll', 'Florian', 'FireGiant', 'FlameTroll', 'FireBomb', 'CoralGolem', 'FeyCap', 'SkrymirTheLofty', 'HyndlaFrostcrown', 'Ironbark', 'TheWildQueen', 'IceWraith', 'Willow', 'Senita', 'Saguaro', 'Agave', 'IceTroll', 'Stormsinger', 'Taloca', 'UrskaDruid', 'Rhynaggor', 'Phoenicia', 'DarkDryad', 'GreenGolem', 'Redthorn', 'Alderfather', 'VineMarten', 'WoodRhynax', 'SilverOak', 'Frostfeather', 'LavaTroll', 'CorruptTroll', 'Obsidius', 'CrabMan', 'DrownedSailor', 'WaterElemental', 'TheMarajiQueen', 'MushroomMan', 'Fungomancer', 'Exploadstool', 'KingGobtruffle', 'Birchthorn', 'Aquaticus', 'KingBloodwood', 'FrostfireWraith', 'FrostfireWitch', 'FrostfireTroll', 'TheFrostfireKing', 'ShahbanuVespera', 'DandyLion', 'Crysturtle', 'CrazedTroll', 'Lasher', 'Mistralus', 'SwampRat', 'Sycorax', 'Amarok', 'Arcturion', 'FlameMaiden', 'Fundingus', 'VolcanicGolem', 'Ursuvius', 'Dao', 'Pyrohydra', 'Obregonia', 'ServantOfTheDao', 'RockSquid', 'Cloakmantle', 'OchreJelly', 'Shoggorath', 'Hatir&Skroll', 'EarthDreamer', 'Nagatrap', 'IceOrca', 'LivingQuartz', 'NaturebornWarden', 'FirebornWarrior', 'WaterbornPriestess', 'Shayle', 'NexusPortal', 'KingHeliodor', 'Kalika', 'NaturebornWolf', 'FirebornEagle', 'WaterbornOwl', 'StonebornLion', 'ValiantPyrea', 'Hawthorn', 'WaterWeird', 'NatureWeird', 'Tihamata', 'VoidWisp', 'LightbornPaladin', 'DarkbornWarlock', 'UmbralPortal', 'SulfurSlime', 'Tannenbaum', 'FireSpirit', 'LavaScorpion', 'WrathNaga', 'MagmaDragon', 'FlamingSkeleton', 'BurningOcularen', 'FlameRhynax', 'FireBeetle', 'Pyrophemus', 'NaturebornHunter', 'DarkForestTroll', 'TheOnyxGiant', 'TheSapphireGiant', 'TheEmeraldGiant', 'LavaWorm', 'TheRubyGiant', 'TheAmethystGiant', 'TheTopazGiant', 'TheUmbralGiant', 'Aquaria', 'DoomedGargoyle', 'QueenAsh', 'VulpphireHunter', 'Cantur', 'Lifecap', 'Treekin', 'DaughterOfYasmine', 'SunSprite', 'FrostfireGoblin', 'WaterbornScribe', 'Virago', 'PetrifiedTreant', 'PrinceBasalt', 'CinderhandGoblin', 'Eyestalker', 'LivingRime', 'SplinteredGolem', 'ElementalSentinel', 'FireLion', 'Salamandria', 'Mandragora', 'EarthGiant', 'Jordrin', 'Timberwolf', 'KeeperOfThePaths', 'Kolfrysti', 'Jarnvisa', 'FirebornLynx', 'MidwinterLycan', 'FirebornPaladin', 'Ignarion', 'Emberclaw', 'ArchdruidBlackwood', 'Al-Mundhir', 'BlackOoze', 'Foxglove', 'AlaAl-Din', 'TheCragMaw', 'Belcerulea', 'Gladius', 'Thornaressa', 'Narcithus', 'Orrissea', 'Orchidius', 'Chrysantherax', 'GrimbornBloodeye', 'MapleGoldbark', 'IcyPortal', 'SteamTroll', 'WaterbornTemplar', 'TempestBallista', 'VenomousTroll', 'LavaEttin', 'LightbornEnchantress', 'TheSandstoneSentinel', 'AbominableTroll', 'Vinepyre', 'Hollioke', 'ImmortalMonstera', 'AssassinVine', 'CursedSailor', 'StormOracle', 'CorruptedCycad', 'Wisterina', 'Tempestus', 'StormGuard', 'Blackthorn', 'FrostSpider', 'Fionnuala', 'LavaGates', 'Tetramorph', 'Liekki'], undefined),
    ),
  },
  {
    id: 8385,
    desc: '对一名敌人造成 [魔法 + 7] 点伤害，伤害值因狮心帝国盟友数而增强。每有一名狮心帝国盟友，则创造混合黄色和棕色的 6 颗宝石。 [x6]',
    build: skill(
      dmg('enemyChosen', 7, 1, { modifier: { mod: { kind: 'multiplier', a: 6 }, source: { kind: 'alliesOfKingdom', kingdom: '狮心帝国' } } }),
      createMix([BaseColor.Yellow, BaseColor.Brown], 6, 0, { modifier: { mod: { kind: 'multiplier', a: 6 }, source: { kind: 'alliesOfKingdom', kingdom: '狮心帝国' } } }),
    ),
  },
  {
    id: 8386,
    desc: '对一名敌人造成 [魔法 + 7] 点伤害，伤害值因狼族盟友数而增强。每有一名狼族盟友，则创造混合绿色和红色的 6 颗宝石。 [x6]',
    build: skill(
      dmg('enemyChosen', 7, 1, { modifier: { mod: { kind: 'multiplier', a: 6 }, source: { kind: 'alliesOfRace', race: 'Wargare' } } }),
      createMix([BaseColor.Green, BaseColor.Red], 6, 0, { modifier: { mod: { kind: 'multiplier', a: 6 }, sources: [{ kind: 'alliesOfRace', race: 'Wargare' }] } }),
    ),
  },
  {
    id: 8391,
    desc: '对敌人造成 [魔法 + 4] 点伤害。有 4% 的几率直接杀死对方，几率因恶魔敌人数而增强。 [x4]',
    build: skill(
      dmg('enemyChosen', 4, 1),
      dmg('lastTarget', 0, 0, { execute: true, chance: 0.04, chanceBoost: { mod: { kind: 'multiplier', a: 4 }, source: { kind: 'enemiesOfRace', race: 'Daemon' } } }),
    ),
  },
  {
    id: 8392,
    desc: '对敌人造成 [魔法 + 4] 点伤害。有 4% 的几率直接杀死对方，几率因元素敌人数而增强。 [x4]',
    build: skill(
      dmg('enemyChosen', 4, 1),
      dmg('lastTarget', 0, 0, { execute: true, chance: 0.04, chanceBoost: { mod: { kind: 'multiplier', a: 4 }, source: { kind: 'enemiesOfRace', race: 'Elemental' } } }),
    ),
  },
  {
    id: 8394,
    desc: '对一名敌人造成 [魔法 + 7] 点伤害，伤害值因猫族盟友数而增强。每有一位猫族盟友则创造 6 颗混合红色和棕色的宝石。 [x6]',
    build: skill(
      dmg('enemyChosen', 7, 1, { modifier: { mod: { kind: 'multiplier', a: 6 }, source: { kind: 'alliesOfRace', race: 'Raksha' } } }),
      createMix([BaseColor.Red, BaseColor.Brown], 6, 0, { modifier: { mod: { kind: 'multiplier', a: 6 }, sources: [{ kind: 'alliesOfRace', race: 'Raksha' }] } }),
    ),
  },
  {
    id: 8395,
    desc: '对一名敌人造成 [魔法 + 4] 点真实伤害。若敌人是不死族，则消除其全部护甲值。',
    build: skill(
      trueDmg('enemyChosen', 4, 1, { trueDamage: true }),
      reduce('lastTarget', 'armor', 0, 0, { drainAll: true, ifCond: { kind: 'targetRace', race: 'Undead' } }),
    ),
  },
  {
    id: 8396,
    desc: '没有一名恶魔敌人则获得 [魔法 + 1] 点护甲值并赋予一名随机盟友屏障效果。 [1:1]',
    build: skill(
      armor('allySelf', 1, 1, { ifCond: { kind: 'not', cond: { kind: 'enemyRacePresent', race: 'Daemon' } }, modifier: { mod: { kind: 'ratio', a: 1, b: 1 } } }),
      inflict('barrier', 'allyRandom', { ifCond: { kind: 'not', cond: { kind: 'enemyRacePresent', race: 'Daemon' } } }),
    ),
  },
  {
    id: 8397,
    desc: '耗掉一名敌人所有法力值。对 2 名随机敌人造成 [魔法 + 3] 点伤害，伤害值因耗掉的法力值数而增强。 [2:1]',
    build: skill(
      drainMana('enemyChosen'),
      dmg('enemyRandomN', 3, 1, { n: 2, modifier: { mod: { kind: 'ratio', a: 2, b: 1 }, source: { kind: 'drainedMana' } } }),
    ),
  },
  {
    id: 8398,
    desc: '死亡标记一名敌人，造成[魔法 + 3]点伤害，由黄宝石激发。 [2:1]',
    build: skill(
      inflict('death-mark', 'enemyChosen'),
      dmg('enemyChosen', 3, 1, { modifier: { mod: { kind: 'ratio', a: 2, b: 1 }, source: { kind: 'boardGems', color: BaseColor.Yellow } } }),
    ),
  },
  {
    id: 8399,
    desc: '爆破 [魔法 + 1] 颗红色宝石。赋予所有圣唐盟友一个随机状态效果。召唤一名圣唐军队。',
    build: skill(
      explodeRandomGems(1, 1, 'color', BaseColor.Red),
      inflictRandom('allyAll', { targetKingdom: '圣唐' }),
      summonRandomOfKingdom('圣唐', undefined),
    ),
  },
];

export const BATCH_W02: CuratedBatch = { batch: 'W02', spells: SPELLS, skipped: SKIPPED };
