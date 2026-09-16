/**
 * 人工核对组装 · 批次 13（池：scripts/curated-pools/pool-13.json）
 * 核对者：agent 批次 13
 *
 * 语义裁定备注：
 * - 「(1/一名)敌人」按官方语义 = 施法方指定目标 → enemyChosen（spell-rules.md §0）。
 * - 「对所有敌人…散射伤害」= dmg('enemyAll', …, { range: 'all' })（SOP 措辞裁定）。
 * - 「宝石」不含骷髅（随机宝石段 include:'color'）；transform 终点可为 'SKULL'。
 * - 「魔法值」= magic 属性；「法力值」= mana（SOP 措辞裁定）。
 * - 「致命伤害」= 即杀 execute（batch-03 7789「处死」同款）；「摧毁一组行跟列」= 选定行 + 选定列
 *   （batch-01 7016「摧毁 1 行」同口径）；「爆破一行」= explodeChosenRow（batch-05/10 先例）。
 * - 种族核对（troops.json troopTypes）：野兽 = Beast、狼族 = Wargare（batch-10 8864 先例）、
 *   人马 = Centaur（batch-11 9732 先例）、蛮族 = Wildfolk（6383 纳克斯特质 wildfolkbond「蛮族族亲」）。
 * - 召唤物核对（§6 命令）：雅嘎的小屋 = YagasHut(6373)、土狼 = Hyena(6465)、俄里翁 = Orion(6069)。
 * - 「召唤 3 只土狼」：summonRef 无数量参数 → 三个召唤段各召 1 只，死亡条件逐段挂（展开写法）。
 */
import { skill, dmg, dmgSplash, heal, armor, attack, magic,
  cleanse, randomStat, inflict, createGems, createMix, transform,
  destroyColor, destroyRandomGems, destroyChosenRow, destroyChosenCol,
  explodeChosenRow, summonRef, extraTurn, transformToSpecial, CHOSEN } from '../builders';
import { BaseColor } from '../../types';
import type { CuratedBatch } from './index';

const SKIPPED: { id: number; reason: string }[] = [
  { id: 7436, reason: '语义拿不准（「伤害值因敌方攻击力而增强」来源无法裁定：主目标 targetStat 还是敌方全体 enemyStatSum，手册未覆盖「敌方X」句式）' },
  { id: 7441, reason: '语义拿不准（「转化为一名狼人」兵种转化无原语，同 batch-06 7413）' },
  { id: 7542, reason: '语义拿不准（「凤凰涅槃浴火重生」无可识别机制）' },
  { id: 7545, reason: '语义拿不准（「爆破所有绿色宝石或为一名随机盟友的一项技能增加…」「或」二选一分支无法表达，同 batch-08 8458）' },
  { id: 7546, reason: '二次缩放来源不支持（「因我方和敌方的哥布林数」——敌方侧种族计数无对应 kind，仅支持 alliesOfRace 己方）' },
  { id: 7547, reason: '二次缩放来源不支持（「因敌方龙族军队数」——敌方侧种族计数无对应 kind，仅支持 alliesOfRace 己方）' },
  { id: 7690, reason: '语义拿不准（「如果该敌人已被冻结，则再造成5点伤害」条件触发现可用 ifCond targetStatus 表达，但「冻结其上下左右的敌人」相邻位置目标无对应目标模式，batch-06 7532 同款）' },
  { id: 7696, reason: '隐匿/位置操作（「将其移至队伍首位」，同 batch-01 7439）' },
  { id: 7708, reason: '特殊宝石（天使宝石，同 batch-02 7158）' },
  { id: 7743, reason: '语义拿不准（[1:1] 二次缩放在描述中无来源子句，无法人工判读挂 modifier）' },
];

const SPELLS: CuratedBatch['spells'] = [
  {
    id: 7424,
    desc: '对 1 名敌人造成 [魔法 + 3] 点伤害。使其陷入织网和缠绕状态。获得一个额外回合。',
    build: skill(
      dmg('enemyChosen', 3),
      inflict('web', 'enemyChosen'),
      inflict('entangle', 'enemyChosen'),
      extraTurn(),
    ),
  },
  {
    id: 7426,
    desc: '对 1 名敌人造成 [魔法 + 1] 点伤害，伤害值因自身生命值而增强。获得 5 点生命值。 [2:1]',
    build: skill(
      // 「因自身生命值」= selfStat hp 当前值（batch-08 8171 同款）；「伤害值」点名伤害段
      dmg('enemyChosen', 1, 1, { modifier: { mod: { kind: 'ratio', a: 2, b: 1 }, source: { kind: 'selfStat', stat: 'hp' } } }),
      heal('allySelf', 5, 0),
    ),
  },
  {
    id: 7448,
    desc: '将紫色宝石转换为骷髅头，并将棕色宝石转换为绿色。赋予野兽盟友屏障效果。',
    build: skill(
      transform(BaseColor.Purple, 'SKULL'),
      transform(BaseColor.Brown, BaseColor.Green),
      // 「野兽盟友」= 种族限定目标 → targetRace（SOP 措辞裁定；野兽 = Beast）
      inflict('barrier', 'allyAll', { targetRace: 'Beast' }),
    ),
  },
  {
    id: 7451,
    desc: '对 1 名敌人造成 [魔法 + 4] 点伤害。如果敌人已被击晕，则造成两倍伤害。击晕敌人。',
    build: skill(
      // 回收：condMult 现支持 targetStatus 条件倍率（batch-05 7330 同款）
      dmg('enemyChosen', 4, 1, { condMult: { times: 2, cond: { kind: 'targetStatus', statusId: 'stun' } } }),
      inflict('stun', 'enemyChosen'),
    ),
  },
  {
    id: 7453,
    desc: '摧毁一组行跟列。对所有敌人造成 [魔法 + 4] 点散射伤害，并因被摧毁的棕色宝石数而增强。 [x4]',
    build: skill(
      // 「一组行跟列」= 选定行 + 选定列（batch-01 7016「摧毁 1 行」同口径）
      destroyChosenRow(),
      destroyChosenCol(),
      // 「对所有敌人…散射」= range all（SOP 措辞裁定）；清除段在前，destroyedGems 才数得到
      dmg('enemyAll', 4, 1, {
        range: 'all',
        modifier: { mod: { kind: 'multiplier', a: 4 }, source: { kind: 'destroyedGems', color: BaseColor.Brown } },
      }),
    ),
  },
  {
    id: 7485,
    desc: '给予一名盟友 [魔法 + 1] 点生命值和攻击力。净化该盟友。如果盟友使用红色法力，给予 3 点魔法值。',
    build: skill(
      heal('allyChosen', 1),
      attack('allyChosen', 1),
      cleanse('allyChosen'),
      // 回收：ifCond 现支持条件触发（SOP「通用条件触发 / 条件加成」节）；targetColor 为
      // 目标相对条件、按该段自己的目标（该盟友）判定其法力色
      magic('allyChosen', 3, 0, { ifCond: { kind: 'targetColor', color: BaseColor.Red } }),
    ),
  },
  {
    id: 7489,
    desc: '对一名敌人造成 [魔法 + 4] 点溅射伤害。伤害值因自身的攻击力、生命力和护甲值而增强。 [2:1]',
    build: skill(
      // 多来源计数相加（SOP §3 sources 数组）；「生命力」= hp
      dmgSplash('enemyChosen', 4, 1, {
        modifier: {
          mod: { kind: 'ratio', a: 2, b: 1 },
          sources: [
            { kind: 'selfStat', stat: 'attack' },
            { kind: 'selfStat', stat: 'hp' },
            { kind: 'selfStat', stat: 'armor' },
          ],
        },
      }),
    ),
  },
  {
    id: 7490,
    desc: '击晕并燃烧所有敌人。创造 22 颗红色和棕色宝石。获得 [魔法 + 5] 点生命值。',
    build: skill(
      inflict('stun', 'enemyAll'),
      inflict('burning', 'enemyAll'),
      // 「红色和棕色宝石」= 混色逐颗随机（batch-05 7322 createMix 同款）
      createMix([BaseColor.Red, BaseColor.Brown], 22, 0),
      heal('allySelf', 5),
    ),
  },
  {
    id: 7510,
    desc: '爆破一行。对两名最虚弱的敌人造成 [魔法 + 5] 点伤害，伤害值因人马盟友数而增强。 [x6]',
    build: skill(
      // 「爆破一行」= explodeChosenRow（batch-05/10 先例，无随机字样）
      explodeChosenRow(),
      dmg('enemyWeakestN', 5, 1, {
        n: 2,
        // 人马 = Centaur（troopTypes 核对）
        modifier: { mod: { kind: 'multiplier', a: 6 }, source: { kind: 'alliesOfRace', race: 'Centaur' } },
      }),
    ),
  },
  {
    id: 7512,
    desc: '对一名敌人造成 [魔法 + 2] 点溅射伤害。伤害值因红色宝石数而增强。 [3:1]',
    build: skill(
      // 「因红色宝石数」= boardGems（棋盘现场计数，spell-rules §1 来源表）
      dmgSplash('enemyChosen', 2, 1, {
        modifier: { mod: { kind: 'ratio', a: 3, b: 1 }, source: { kind: 'boardGems', color: BaseColor.Red } },
      }),
    ),
  },
  {
    id: 7514,
    desc: '创造 7 颗指定颜色的宝石。盟友狼族获得屏障效果。',
    build: skill(
      createGems(CHOSEN, 7, 0),
      // 狼族 = Wargare（batch-10 8864「狼族盟友数」同款核对）
      inflict('barrier', 'allyAll', { targetRace: 'Wargare' }),
    ),
  },
  {
    id: 7519,
    desc: '缠绕所有盟友和敌军。摧毁所有绿色宝石。',
    build: skill(
      inflict('entangle', 'allyAll'),
      inflict('entangle', 'enemyAll'),
      destroyColor(BaseColor.Green),
    ),
  },
  {
    id: 7526,
    desc: '对最后两名敌人造成 [魔法 + 4] 点伤害，并使其陷入沉默状态。然后召唤雅嘎的小屋。',
    build: skill(
      dmg('enemyLastN', 4, 1, { n: 2 }),
      inflict('silence', 'enemyLastN', { n: 2 }),
      // 雅嘎的小屋 = YagasHut（troops.json 6373）
      summonRef('YagasHut', 6373),
    ),
  },
  {
    id: 7538,
    desc: '净化一名盟友。给予 [魔法 + 1] 点随机技能值和 2 点魔法值。如果盟友是蛮族，则效果两倍。',
    build: skill(
      cleanse('allyChosen'),
      // 蛮族 = Wildfolk（troops.json 6383 纳克斯特质 wildfolkbond「蛮族族亲」核对）；
      // raceDouble 逐受益者判定，数值段逐段挂（batch-04 7686 同款）
      randomStat('allyChosen', 1, 1, { raceDouble: 'Wildfolk' }),
      // 「魔法值」= magic 属性（SOP 措辞裁定）
      magic('allyChosen', 2, 0, { raceDouble: 'Wildfolk' }),
    ),
  },
  {
    id: 7550,
    desc: '对所有敌人造成  [(魔法 / 2) + 7] 点伤害。随机使一名敌人陷入织网状态。',
    build: skill(
      // [(魔法 / 2) + 7] → base 7 / mult 0.5（scaling 原样对号入座）
      dmg('enemyAll', 7, 0.5, { range: 'all' }),
      inflict('web', 'enemyRandom'),
    ),
  },
  {
    id: 7594,
    desc: '随机摧毁 7 颗宝石。创造 7 颗紫色宝石。',
    build: skill(
      // 「宝石」不含骷髅 → include 'color'
      destroyRandomGems(7, 0, 'color'),
      createGems(BaseColor.Purple, 7, 0),
    ),
  },
  {
    id: 7638,
    desc: '对最后一名敌人造成 [魔法 + 8] 点伤害。有 25% 几率造成致命伤害。使所有其他盟友下潜。',
    build: skill(
      dmg('enemyLast', 8),
      // 「致命伤害」= 即杀 execute，概率只辖本子句（batch-03 7789「处死」同款）
      dmg('enemyLast', 0, 0, { execute: true, chance: 0.25 }),
      inflict('submerged', 'allyOthers'),
    ),
  },
  {
    id: 7643,
    desc: '对 1 名敌人造成 [魔法 + 4] 伤害。如果敌人身亡，则召唤 3 只土狼。',
    build: skill(
      dmg('enemyChosen', 4),
      // 土狼 = Hyena（troops.json 6465）；「3 只」= 三个召唤段各 1 只；
      // summon 无 opts 参 → 展开挂 ifTargetDied（batch-06 7483 同款写法）
      { ...summonRef('Hyena', 6465), ifTargetDied: true },
      { ...summonRef('Hyena', 6465), ifTargetDied: true },
      { ...summonRef('Hyena', 6465), ifTargetDied: true },
    ),
  },
  {
    id: 7693,
    desc: '摧毁所有指定颜色的宝石。给予所有盟友 [魔法 + 2] 点护甲值，点数因被摧毁的宝石数而增强。 [2:1]',
    build: skill(
      destroyColor(CHOSEN),
      // 「点数」点名护甲段；「被摧毁的宝石数」不筛色（batch-11 9410 同款）
      armor('allyAll', 2, 1, {
        modifier: { mod: { kind: 'ratio', a: 2, b: 1 }, source: { kind: 'destroyedGems' } },
      }),
    ),
  },
  {
    id: 7700,
    desc: '创造 8 颗紫色和红色宝石。赋予一名随机盟友屏障效果。',
    build: skill(
      createMix([BaseColor.Purple, BaseColor.Red], 8, 0),
      inflict('barrier', 'allyRandom'),
    ),
  },
  {
    id: 7721,
    desc: '摧毁 1 行。对所有敌人造成 [魔法 + 2] 点伤害，伤害值因被摧毁的棕色宝石数而增强。 [x3]',
    build: skill(
      destroyChosenRow(),
      dmg('enemyAll', 2, 1, {
        range: 'all',
        modifier: { mod: { kind: 'multiplier', a: 3 }, source: { kind: 'destroyedGems', color: BaseColor.Brown } },
      }),
    ),
  },
  {
    id: 7726,
    desc: '召唤俄里翁。给予所有盟友 [(魔法 / 2) + 1] 点生命值。',
    build: skill(
      // 俄里翁 = Orion（troops.json 6069）
      summonRef('Orion', 6069),
      heal('allyAll', 1, 0.5),
    ),
  },
  {
    id: 7729,
    desc: '将所有棕色宝石转换成红色。使一名随机敌人陷入中毒状态。',
    build: skill(
      transform(BaseColor.Brown, BaseColor.Red),
      inflict('poison', 'enemyRandom'),
    ),
  },
  {
    id: 7735,
    desc: '将指定的法力颜色转换为红色。给予所有其他盟友 1 点魔法值。',
    build: skill(
      // 「指定的法力颜色」= 选定颜色 → CHOSEN 占位符（builders.ts「指定/选定颜色」语义）
      transform(CHOSEN, BaseColor.Red),
      // 「魔法值」= magic 属性（SOP 措辞裁定）
      magic('allyOthers', 1, 0),
    ),
  },
  {
    id: 7767,
    desc: '将黄色宝石转换为蓝色，并将红色宝石转换为末日骷髅头。冻结最强大的敌人。',
    build: skill(
      transform(BaseColor.Yellow, BaseColor.Blue),
      // 回收（第六遍）：红色→末日骷髅头 = transformToSpecial（SOP「特殊宝石」节转化端点）
      transformToSpecial(BaseColor.Red, 'doomSkull'),
      // 「最强大的敌人」= enemyHealthiest（spell-rules.md §0 目标措辞表）
      inflict('frozen', 'enemyHealthiest'),
    ),
  },
];

export const BATCH_13: CuratedBatch = { batch: '13', spells: SPELLS, skipped: SKIPPED };
