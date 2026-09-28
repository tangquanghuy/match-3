/**
 * 放弃桶回收批 R2（2026-09-17 用户裁定：献祭/兵种转化/随机状态/藏宝图/特定兵种在场五原语落地；
 * 加上状态宝石族（波A）清尾）。核对者：窗口 G，20 条。裁定依据 spell-rules §11。
 * 原批次 skipped 对应条目已同步剪除。
 */
import { skill, dmg, dmgSplash, heal, armor, attack, magic, inflict, randomStat, createGems, createSkulls, createSpecialGems, transformToSpecial, explodeRandomGems, oneOf, summonRef, summonRandom, sacrifice, dispelStatus, inflictRandom, transformTroopRandom, gainMaps } from '../builders';
import { BaseColor } from '../../types';
import type { CuratedBatch } from './index';

// 兵种族引用池（生成器从 troops.json 内联）
const WRAITH_REFS = ["Wraith","IceWraith","FrostfireWraith"];
// sa-R5: raw kingdom 3029 Zhul'Kari (data/raw/troops.gow.en.json KingdomId), all 45 on the roster.
const ZHULKARI_REFS = ["ErendrielDarkweave","KnightOfCups","TheWebbedPrince","DarkWitch","ImmortalMaratus","Scrollweaver","Belcerulea","DuskOwlbear","ShadowBeetle","Mandragora","SplinteredGolem","DarkAlchemist","LeapingSpider","TheSilkenQueen","TheSpiderThrone","SilkenFang","SeekraDarkwood","BoundMage","AceOfCups","Mechweaver","ArchproxyYvendra","AransiTheGuardian","Devourer","NightSpider","ArachnaeanWatcher","Malcandessa","Arachnataur","Tarantella","ArachnaeanWeaver","TheWidowQueen","TombSpider","Spinnerette","Cocoon","Shadowblade","SpiderKnight","TalRae","SpiderSwarm","Dokkalfar","GiantSpider","Tyri","Webspinner","SpiderQueen","NightTerror","DarkMaiden","Reaver"];

const SKIPPED: { id: number; reason: string }[] = [
  // 五族复核后仍弃（理由更新，详见 artifacts/recycle/worklist.md）：
  // 7373 跨段随机目标绑定（「转化为它」指回前段随机敌）；7425 「指定敌人的法力颜色」动态色不支持；
  // 7438/8744 方括号 [2:1]/[x3] 无归属段（数值不明）；7440 转化以强化效果的时序拿不准；
  // 9793 「受流血宝石加成」无 [xN] 倍率标注；9861 「随机减少随机技能点数」无此原语。
];

const SPELLS: CuratedBatch['spells'] = [
  {
    id: 7261,
    desc: "对 1 名敌人造成一项随机状态效果。一名随机盟友的一项随机属性获得 [魔法 + 1] 点。",
    build: skill(inflictRandom('enemyChosen'), randomStat('allyRandom', 1, 1, { oneSkill: true })),
  },
  {
    id: 7279,
    desc: '对 1 名敌人造成 [魔法 + 5] 点伤害并造成一项随机状态效果。有 20% 的几率获得一张藏宝图。',
    build: skill(
      dmg('enemyChosen', 5),
      inflictRandom('enemyChosen'),
      gainMaps(1, 0, { chance: 0.2 }),
    ),
  },
  {
    id: 7343,
    desc: '献祭一名盟友。对所有敌人造成 12 点散射伤害，并因献祭军队的攻击力而增强。有 30% 的几率召唤阿伯拉瑟。 [1:1]',
    build: skill(
      // sa-R5 L1-6201: native CountAttack/Dispel/Damage 10000 all FromTarget = the chosen ally; Dispel first so a
      // Barrier (or Reflect) cannot stop the sacrifice.
      ...['barrier', 'blessed', 'enchanted', 'enraged', 'rage', 'reflect', 'submerged'].map(id => dispelStatus(id, 'allyChosen')),
      sacrifice('allyChosen'),
      dmg('enemyAll', 12, 0, { range: 'all', modifier: { mod: { kind: 'ratio', a: 1, b: 1 }, source: { kind: 'sacrificedStat', stat: 'attack' } } }),
      { ...summonRef('Abhorath'), chance: 0.3 },
    ),
  },
  {
    id: 7413,
    desc: '对所有敌人造成 [魔法 + 9] 点散射伤害，并获得下列其一：将一名随机敌人转化为怨灵，或所有盟友获得 3 点魔力值。',
    build: skill(
      dmg('enemyAll', 9, 1, { range: 'all' }),
      oneOf(
        [transformTroopRandom('enemyRandom', WRAITH_REFS)],
        [magic('allyAll', 3, 0)],
      ),
    ),
  },
  {
    id: 7420,
    desc: '创造 8 颗骷髅头，每收集到一张藏宝图，额外创造 4 颗。有 20% 的几率获得一张藏宝图。 [x4]',
    build: skill(
      createSkulls(8, 0, { modifier: { mod: { kind: 'multiplier', a: 4 }, source: { kind: 'battleMaps' } } }),
      gainMaps(1, 0, { chance: 0.2 }),
    ),
  },
  {
    id: 7466,
    desc: '创造 5 颗骷髅头，骷髅头数因所收集的藏宝图数量而增强。然后爆破 [(魔法 / 2) + 1] 颗宝石。 [x3]',
    build: skill(
      createSkulls(5, 0, { modifier: { mod: { kind: 'multiplier', a: 3 }, source: { kind: 'battleMaps' } } }),
      explodeRandomGems(1, 0.5),
    ),
  },
  {
    id: 7704,
    desc: '献祭一名盟友。对所有敌人造成 [(魔法 / 2) + 1] 点伤害，伤害值因被献祭的盟友的生命值而增强。召唤一名随机蛛尔卡里军队。 [3:1]',
    build: skill(
      // sa-R5 L1-6513: native CountLife/Dispel/Damage 10000 FromTarget = the chosen ally (Dispel so a Barrier
      // cannot stop the sacrifice); SummoningKingdomNoError 3029 = Zhul'Kari (was the Urska pool).
      ...['barrier', 'blessed', 'enchanted', 'enraged', 'rage', 'reflect', 'submerged'].map(id => dispelStatus(id, 'allyChosen')),
      sacrifice('allyChosen'),
      dmg('enemyAll', 1, 0.5, { range: 'all', modifier: { mod: { kind: 'ratio', a: 3, b: 1 }, source: { kind: 'sacrificedStat', stat: 'hp' } } }),
      summonRandom(ZHULKARI_REFS),
    ),
  },
  {
    id: 7780,
    desc: '给予所有其他盟友 [魔法 + 1] 点生命值、5 点护甲值、3 点攻击力和 2 点魔力值。献祭自身。',
    build: skill(
      heal('allyOthers', 1),
      armor('allyOthers', 5, 0),
      attack('allyOthers', 3, 0),
      // 原生 IncreaseSpellPower = 魔法（Magic），不是法力
      magic('allyOthers', 2, 0),
      // 原生 Dispel@Self → LethalDamage@Self：先驱散自身正面状态（屏障不再挡住献祭）
      ...['barrier', 'submerged', 'blessed', 'enchanted', 'reflect', 'enraged', 'rage'].map((id) => dispelStatus(id, 'allySelf', { ifCond: { kind: 'selfStatus', statusId: id } })),
      sacrifice('allySelf'),
    ),
  },
  {
    id: 8555,
    desc: '对一名敌人造成 [魔法 + 2] 点伤害，获得一个藏宝图，再召唤一只鹦鹉。',
    build: skill(dmg('enemyChosen', 2), gainMaps(1), summonRef('Parrot')),
  },
  {
    id: 8704,
    desc: '对一名敌人造成 [魔法 + 3] 点伤害。若敌人身亡，则使所有敌人陷入一个随机状态。',
    build: skill(
      dmg('enemyChosen', 3),
      { ...inflictRandom('enemyAll'), ifTargetDied: true },
    ),
  },
  {
    id: 8535,
    desc: '对末位敌人造成 [魔法 + 1] 点伤害。若队伍里有尔福·哈利干，则使对方陷入叠加 2 次的出血状态。',
    build: skill(
      // Native 8535: conditional Bleed x2 on LastEnemy (steps 1-2) before the damage (step 3) (R001).
      inflict('bleed', 'enemyLast', { stacks: 2, ifCond: { kind: 'troopPresent', side: 'ally', name: '尔福·哈利干' } }),
      dmg('enemyLast', 1),
    ),
  },
  {
    id: 8841,
    desc: '爆破一颗宝石并造成 [魔法 + 6] 点散射伤害。若自身队伍有梁帝，则赋予首 2 位盟友屏障效果。',
    build: skill(
      explodeRandomGems(1, 0), // native ExplodeGems 1: a random gem, not the chosen cell (sa-R1)
      // 裸散射重裁（2026-09-18）：官方 ScatterDamage@AllEnemies = 全体散射
      dmg('enemyAll', 6, 1, { range: 'all' }),
      inflict('barrier', 'allyFirstN', { n: 2, ifCond: { kind: 'troopPresent', side: 'ally', name: '梁帝' } }),
    ),
  },
  {
    id: 8939,
    desc: '对一名敌人造成 [魔法 + 3] 点伤害，伤害值因陷入织网效果的敌人数而增强。若队伍有丝绸女王，则再造成 10 点伤害。 [x3]',
    build: skill(dmg('enemyChosen', 3, 1, {
      modifier: { mod: { kind: 'multiplier', a: 3 }, source: { kind: 'enemyStatusCount', statusId: 'web' } },
      // TheSilkenQueen (troop:7329) is named 丝绸女皇 locally; 丝绸女王 never matched (R3-B02).
      condBonus: { n: 10, cond: { kind: 'troopPresent', side: 'ally', name: '丝绸女皇' } },
    })),
  },
  {
    id: 9002,
    desc: '对所有敌人造成 [魔法 + 2] 点伤害，伤害值因赃物宝石和藏宝图数而增强。再创造 3 颗赃物宝石，并获得 2 张藏宝图。 [x3]',
    build: skill(
      dmg('enemyAll', 2, 1, { range: 'all', modifier: { mod: { kind: 'multiplier', a: 3 }, sources: [{ kind: 'boardSpecial', gem: 'bootyGem' }, { kind: 'battleMaps' }] } }),
      createSpecialGems({ kind: 'bootyGem' }, 3),
      gainMaps(2),
    ),
  },
  {
    id: 9779,
    desc: '从敌人身上窃取[魔法 + 1]点生命值。将4个紫色宝石转化为流血宝石。',
    build: skill(
      dmg('enemyChosen', 1, 1, { drain: true }),
      transformToSpecial(BaseColor.Purple, 'bleedGem', { count: 4 }),
    ),
  },
  {
    id: 9786,
    desc: '对敌人造成[魔法 + 3]点伤害，伤害值受流血宝石加成。如果敌人死亡，则将所有绿色宝石转化为流血宝石。 [x4]',
    build: skill(
      dmg('enemyChosen', 3, 1, { modifier: { mod: { kind: 'multiplier', a: 4 }, source: { kind: 'boardSpecial', gem: 'bleedGem' } } }),
      { ...transformToSpecial(BaseColor.Green, 'bleedGem'), ifTargetDied: true },
    ),
  },
  {
    id: 9871,
    desc: '制作5颗绿色宝石。然后将所有绿色宝石转化为毒宝石。',
    build: skill(createGems(BaseColor.Green, 5), transformToSpecial(BaseColor.Green, 'poisonGem')),
  },
  {
    id: 9873,
    desc: '选项一：对随机一名敌人造成[魔法 + 4]点大量溅射伤害，伤害值受毒宝石加成。或者，将所有黄色宝石转化为毒宝石。 [x3]',
    build: skill(oneOf(
      // sa-R6：原生 SplashHeavyDamage = 邻位 75%（原为默认 50%）
      [dmgSplash('enemyRandom', 4, 1, { splashRatio: 0.75, modifier: { mod: { kind: 'multiplier', a: 3 }, source: { kind: 'boardSpecial', gem: 'poisonGem' } } })],
      [transformToSpecial(BaseColor.Yellow, 'poisonGem')],
    )),
  },
  {
    id: 9874,
    desc: '随机给 2 名盟友赋予 [魔法 + 1] 点生命值。然后将 5 个绿色宝石转化为沉没宝石。',
    build: skill(
      // native IncreaseHealth Amount 1 SpellPowerMultiplier 1 = [Magic + 1] (sa-F2); RandomPrefNotPrevAlly target (sa-P R007-3)
      heal('allyRandomPrefNotPrevN', 1, 1, { n: 2 }),
      transformToSpecial(BaseColor.Green, 'submergeGem', { count: 5 }),
    ),
  },
  {
    id: 9939,
    desc: '对所有敌人造成[魔法 + 2]点伤害，被纠缠的敌人可获得额外伤害。然后将所有棕色宝石转化为纠缠宝石。 [x2]',
    build: skill(
      dmg('enemyAll', 2, 1, { range: 'all', condMult: { times: 2, cond: { kind: 'targetStatus', statusId: 'entangle' } } }),
      transformToSpecial(BaseColor.Brown, 'entangleGem'),
    ),
  },
];

export const BATCH_R2: CuratedBatch = { batch: 'R2', spells: SPELLS, skipped: SKIPPED };
