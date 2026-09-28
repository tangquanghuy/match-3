/**
 * 人工核对组装 · 批次 17（池：scripts/curated-pools/pool-17.json）
 * 核对者：agent 批次17
 *
 * 语义裁定备注：
 * - 裸「敌人」按「一名敌人」= enemyChosen（官方语义：施法方指定目标，spell-rules.md §0；
 *   9572/9592 口径，已列入回报供复核）。
 * - 裸「盟友」按全体盟友 allyAll（9522「为盟友带来生命值」；已列入回报供复核）。
 * - 「红宝石/绿宝石」= 红色/绿色宝石（本数据集本地化惯用写法，与 9549「红色宝石」同物）。
 * - 种族中文→英文经 troops.json 抽样核对：巨人=Giant、纳迦=Naga、恶魔=Daemon、
 *   人马族=Centaur、神圣=Divine、仙灵=Fey、金牛座=Tauros；「狮心帝国」是王国名非种族。
 * - 特殊宝石家族（黄龙/鬼魂/末日骷髅头/冻结/元素星/天使/传送门/紫龙/蓝龙/腐烂/石块/
 *   石像鬼/暗影之星）一律 SKIP，不做近似降级。
 */
import { skill, dmg, trueDmg, heal, armor, createGems, createMix, summonRef, inflict,
  drainMana, reduce, steal, destroySpecialGems, transformToSpecial } from '../builders';
import { BaseColor } from '../../types';
import type { CuratedBatch } from './index';

/** 9522「均由红宝石和绿宝石增强 [3:1]」（原生 CountGems Red/Green 34） */
const M9522 = {
  mod: { kind: 'ratio' as const, a: 3, b: 1 },
  sources: [{ kind: 'boardGems' as const, color: BaseColor.Red }, { kind: 'boardGems' as const, color: BaseColor.Green }],
};

const SKIPPED: { id: number; reason: string }[] = [
  { id: 9244, reason: '特殊宝石（「黄龙宝石」无法创造/引用）' },
  { id: 9245, reason: '二次缩放来源不支持（「狮心帝国盟友数」按王国计数，非种族）' },
    { id: 9285, reason: '特殊宝石（「鬼魂宝石」）' },
  { id: 9287, reason: '特殊宝石（「鬼魂宝石」板面计数与触发均不可表达）' },
  { id: 9295, reason: '特殊宝石（「鬼魂宝石」计数与创造均不可表达）' },
  { id: 9297, reason: '特殊宝石（「冻结宝石」非颜色宝石，无对应爆破原语）' },
  { id: 9317, reason: '「将他打回末位」隐匿/位置操作' },
  { id: 9318, reason: '特殊宝石（「元素星」）' },
  { id: 9365, reason: '特殊宝石（「石块」，且制造 1-2 个为数量区间）' },
  { id: 9469, reason: '特殊宝石（「天使宝石」）' },
  { id: 9478, reason: '缺失状态（恐惧）；「传送门宝石」亦为特殊宝石' },
  { id: 9480, reason: '缺失状态（附魔）' },
  { id: 9494, reason: '缺失状态（附魔）；「紫龙宝石」亦为特殊宝石' },
  { id: 9527, reason: '特殊宝石（「蓝龙宝石」）' },
  { id: 9538, reason: '特殊宝石（「腐烂宝石」；且 [魔法 + 1] 一个缩放喂两个属性无法表达）' },
  { id: 9542, reason: '缺失状态（患病）；「击退」亦为隐匿/位置操作' },
  { id: 9546, reason: '特殊宝石（「腐烂宝石」；「击退」亦为隐匿/位置操作）' },
  { id: 9570, reason: '缺失状态（附魔）；「紫色盟友」颜色限定目标亦不可表达' },
  { id: 9638, reason: '特殊宝石（「暗影之星」；且「选定宝石转换」非整板 transform 可表达）' },
  { id: 9639, reason: '二次缩放来源不支持（「石块/石像鬼宝石数」为特殊宝石；且一个缩放喂两个属性）' },
];

const SPELLS: CuratedBatch['spells'] = [
  {
    id: 9248,
    desc: '对一名敌人造成 [魔法 + 4] 点伤害。再创造 2 颗蓝色宝石，数值因巨人盟友数而增强。 [x2]',
    build: skill(
      dmg('enemyChosen', 4),
      // 「数值因巨人盟友数而增强」辖创造段（点名创造/宝石数，spell-rules.md §1）
      createGems(BaseColor.Blue, 2, 0, {
        modifier: { mod: { kind: 'multiplier', a: 2 }, source: { kind: 'alliesOfRace', race: 'Giant' } },
      }),
    ),
  },
  {
    id: 9253,
    desc: '对一名敌人造成 [魔法 + 3] 点伤害，伤害值因拥有屏障效果的盟友数而增强。获得屏障效果。 [x10]',
    build: skill(
      // 「伤害值因…盟友数而增强」点名伤害段
      dmg('enemyChosen', 3, 1, {
        modifier: { mod: { kind: 'multiplier', a: 10 }, source: { kind: 'allyStatusCount', statusId: 'barrier' } },
      }),
      inflict('barrier', 'allySelf'),
    ),
  },
  {
    id: 9257,
    desc: '对一名敌人造成 [魔法 + 4] 点伤害。再创造 2 颗棕色宝石，数量因纳迦盟友数而增加。 [x2]',
    build: skill(
      dmg('enemyChosen', 4),
      createGems(BaseColor.Brown, 2, 0, {
        modifier: { mod: { kind: 'multiplier', a: 2 }, source: { kind: 'alliesOfRace', race: 'Naga' } },
      }),
    ),
  },
  {
    id: 9294,
    desc: '消除一名敌人所有护甲值。摧毁所有末日骷髅头。',
    build: skill(
      // 「消除…所有护甲值」= reduce armor + drainAll（batch-01 7175 同款）
      reduce('enemyChosen', 'armor', 0, 0, { drainAll: true }),
      // 回收（第六遍）：摧毁特殊宝石全量 = destroySpecialGems（SOP「特殊宝石」节原例）
      destroySpecialGems('doomSkull'),
    ),
  },
  {
    id: 9340,
    desc: '对一名敌人造成 [魔法 + 4] 点伤害。再创造 2 颗红色宝石，数量因恶魔盟友数而增强。 [x2]',
    build: skill(
      dmg('enemyChosen', 4),
      createGems(BaseColor.Red, 2, 0, {
        modifier: { mod: { kind: 'multiplier', a: 2 }, source: { kind: 'alliesOfRace', race: 'Daemon' } },
      }),
    ),
  },
  {
    id: 9347,
    desc: '对一名敌人造成 [魔法 + 4] 点伤害。再创造 2 颗黄色宝石，数量因人马族盟友数而增强。 [x2]',
    build: skill(
      dmg('enemyChosen', 4),
      createGems(BaseColor.Yellow, 2, 0, {
        modifier: { mod: { kind: 'multiplier', a: 2 }, source: { kind: 'alliesOfRace', race: 'Centaur' } },
      }),
    ),
  },
  {
    id: 9348,
    desc: '给予首 2 位盟友 [魔法 + 2] 点护甲值。有 40% 的几率召唤一只 FIXIT-5000。',
    build: skill(
      // 「给予前 N 位盟友」= buff 构造函数 opts { n }（SOP §3）
      armor('allyFirstN', 2, 1, { n: 2 }),
      // 概率只辖召唤子句；SummonSegment 继承 SegmentOptions，用展开挂载（SOP §3）
      { ...summonRef('FIXIT-5000'), chance: 0.4 },
    ),
  },
  {
    id: 9363,
    desc: '对首 2 名敌人造成 [魔法 + 2] 点真实伤害。将所有黄色宝石转换成末日骷髅头以增强效果。 [x2]',
    build: skill(
      // 回收（第六遍）：转化终点为特殊宝石 → transformToSpecial；「以增强」句式转化段前置，
      // transformedGems 来源才数得到（batch-07 7933 同款句式）
      transformToSpecial(BaseColor.Yellow, 'doomSkull'),
      trueDmg('enemyFirstN', 2, 1, {
        n: 2,
        modifier: { mod: { kind: 'multiplier', a: 2 }, source: { kind: 'transformedGems' } },
      }),
    ),
  },
  {
    id: 9470,
    desc: '对一名敌人造成 [魔法 + 4] 点伤害。然后创造 2 颗黄色宝石，数量因神圣盟友而增强。 [x2]',
    build: skill(
      dmg('enemyChosen', 4),
      createGems(BaseColor.Yellow, 2, 0, {
        modifier: { mod: { kind: 'multiplier', a: 2 }, source: { kind: 'alliesOfRace', race: 'Divine' } },
      }),
    ),
  },
  {
    id: 9477,
    desc: '对一名敌人造成 [魔法 + 4] 点伤害。然后创造 2 颗红宝石，数量由金牛座盟友增强。 [x2]',
    build: skill(
      dmg('enemyChosen', 4),
      // 「红宝石」= 红色宝石（本地化惯用写法）
      createGems(BaseColor.Red, 2, 0, {
        modifier: { mod: { kind: 'multiplier', a: 2 }, source: { kind: 'alliesOfRace', race: 'Tauros' } },
      }),
    ),
  },
  {
    id: 9522,
    desc: '对所有敌人造成 [魔法 + 1] 点伤害，并为盟友带来 [魔法 + 1] 点生命值，伤害值均由红宝石和绿宝石增强。 [3:1]',
    build: skill(
      // 「对所有敌人」伤害段带 range:'all'；多来源计数相加（SOP §3）
      // L7-7615（sa-L76）：EN「both boosted」+ 原生 Damage 与 IncreaseHealth 都 UseCounterForAmount →
      // 两段同挂 modifier（原先只挂伤害段）；两段都不改棋盘，现读宝石数与原生先计数等价。
      dmg('enemyAll', 1, 1, { range: 'all', modifier: M9522 }),
      // 裸「盟友」按全体盟友（spell-rules.md §6「给予盟友」）
      heal('allyAll', 1, 1, { modifier: M9522 }),
    ),
  },
  {
    id: 9549,
    desc: '对一名敌人造成 [魔法 + 4] 点伤害。然后创造 2 颗红色宝石，数量因仙灵盟友而增强。 [x2]',
    build: skill(
      dmg('enemyChosen', 4),
      createGems(BaseColor.Red, 2, 0, {
        modifier: { mod: { kind: 'multiplier', a: 2 }, source: { kind: 'alliesOfRace', race: 'Fey' } },
      }),
    ),
  },
  {
    id: 9572,
    desc: '吸取敌人的所有法力值。为最弱的盟友赋予 [魔法 + 1] 点生命值，生命值因吸取的法力值而增强。 [1:1]',
    build: skill(
      // 裸「敌人」= 一名敌人（官方语义：施法方指定目标，同 9592 口径）
      drainMana('enemyChosen'),
      // 「生命值因吸取的法力值而增强」点名治疗段，来源 drainedMana
      heal('allyWeakest', 1, 1, {
        modifier: { mod: { kind: 'ratio', a: 1, b: 1 }, source: { kind: 'drainedMana' } },
      }),
    ),
  },
  {
    id: 9592,
    desc: '对敌人造成 [魔法 + 4] 点伤害。然后创造 2 颗棕色宝石，数量因巨人盟友而增强。 [x2]',
    build: skill(
      // 裸「敌人」= 一名敌人（官方语义：施法方指定目标，同 9572 口径）
      dmg('enemyChosen', 4),
      createGems(BaseColor.Brown, 2, 0, {
        modifier: { mod: { kind: 'multiplier', a: 2 }, source: { kind: 'alliesOfRace', race: 'Giant' } },
      }),
    ),
  },
  {
    id: 9597,
    desc: '创建与板上当前紫色和棕色宝石数量相等的紫色和棕色宝石混合。 [1:1]',
    build: skill(
      // 数量 = 板上紫数 + 棕数：基值 0 + [1:1] 多来源计数相加（SOP §3 sources）
      createMix([BaseColor.Purple, BaseColor.Brown], 0, 0, {
        modifier: {
          mod: { kind: 'ratio', a: 1, b: 1 },
          sources: [{ kind: 'boardGems', color: BaseColor.Purple }, { kind: 'boardGems', color: BaseColor.Brown }],
        },
      }),
    ),
  },
  {
    id: 9600,
    desc: '对一名敌人造成 [魔法 + 4] 点伤害。然后创造 2 颗蓝色宝石，数量因仙灵盟友而增强。 [x2]',
    build: skill(
      dmg('enemyChosen', 4),
      createGems(BaseColor.Blue, 2, 0, {
        modifier: { mod: { kind: 'multiplier', a: 2 }, source: { kind: 'alliesOfRace', race: 'Fey' } },
      }),
    ),
  },
  {
    id: 9616,
    desc: '对敌人造成 [魔法 + 3] 点伤害并窃取 2 点魔力值，并有 5% 的几率杀死他们，每个末日骷髅增加 5%。 [x5]',
    build: skill(
      // 裸「敌人」= enemyChosen（batch-17 头注 9572/9592 口径）
      // 原生序 StealMagic → LethalDamageConditional → Damage（R001）
      // 「魔力值」= magic 属性（SOP 措辞裁定）
      steal('enemyChosen', 'magic', 'magic', 2, 0),
      // 回收（第六遍）：「杀死他们」= 即杀 execute；几率增强 = chanceBoost + boardSpecial
      // （文本明说『每个末日骷髅』→ boardSpecial 精确计数；『因骷髅头数』才用 boardSkulls）
      dmg('enemyChosen', 0, 0, {
        execute: true,
        chance: 0.05,
        chanceBoost: { mod: { kind: 'multiplier', a: 5 }, source: { kind: 'boardSpecial', gem: 'doomSkull' } },
      }),
      dmg('enemyChosen', 3),
    ),
  },
];

export const BATCH_17: CuratedBatch = { batch: '17', spells: SPELLS, skipped: SKIPPED };
