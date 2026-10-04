/**
 * 人工核对组装 · 批次 10（池：scripts/curated-pools/pool-10.json）
 * 核对者：agent 批次10
 *
 * 语义裁定备注：
 * - 本批大量「巨人宝石/龙宝石/末日骷髅头/万能牌/缠绕宝石/恐怖宝石/石像鬼宝石」
 *   = 特殊宝石家族（SOP §4「特殊宝石」），是本批 SKIP 主因（14 条）。
 * - 「爆破一行」照 batch-01 7016「摧毁 1 行」→ destroyChosenRow 同口径 → explodeChosenRow()。
 * - 「魔力值」= magic 属性（SOP 措辞裁定）：8982 的「3 点魔力值」、9242 的「[魔法+1] 点魔力值」均加 magic。
 * - 种族英文名（troops.json 查询）：狐人 = Wargare、妖仙 = Fey、厄什卡 = Urska、哥布林 = Goblin、机械 = Mech。
 * - 「随机书卷」= 书卷家族三兵种：罪恶宝典 TomeOfEvil / 秘密古卷 BookOfSecrets / 女王之书 BookOfWitches
 *   （排除「滚动编织者」Scrollweaver——野兽，「水生抄书吏」WaterbornScribe——抄书吏非书卷）。
 * - 「给予盟友」（8982，单数未限定）→ allyChosen（「若对方是妖仙」指向单一受益者）。
 * - 「若盟友是 X 则效果翻 N 倍」：raceDouble 仅支持翻倍（×2），×3 一律 SKIP。
 */
import { skill, dmg, dmgAll, dmgSplash, trueDmg, heal, armor, magic, cleanse,
  createGems, createMix, inflict, summonRef, oneOf, extraTurn, explodeChosenRow } from '../builders';
import { BaseColor } from '../../types';
import type { CuratedBatch } from './index';

/** 8969「因我的护甲值而增强 [3:1]」（native CountArmor Self 34） */
const SELF_ARMOR_3_1 = { mod: { kind: 'ratio' as const, a: 3, b: 1 }, source: { kind: 'selfStat' as const, stat: 'armor' as const } };

const SKIPPED: { id: number; reason: string }[] = [
  { id: 8830, reason: '特殊宝石（蓝色巨人宝石）' },
  { id: 8832, reason: '特殊宝石（绿色巨人宝石）' },
  { id: 8834, reason: '特殊宝石（巨型红色宝石）' },
  { id: 8836, reason: '特殊宝石（紫色巨型宝石）' },
  { id: 8837, reason: '特殊宝石（黄色巨型宝石）' },
  { id: 8839, reason: '特殊宝石（棕色巨型宝石）' },
  { id: 8854, reason: '语义拿不准（「由蓝宝石增强」未指明被摧毁/棋盘上，计数口径不明）' },
  { id: 8871, reason: '描述截断不完整（「创建 4 颗骷髅头、4 颗末日骷髅头和 4 颗 [1:1]」末段宝石类型缺失，[1:1] 来源无从绑定）；前两段创造现可表达（createSkulls / createSpecialGems doomSkull）' },
  { id: 8887, reason: '特殊宝石（红色龙宝石）' },
  { id: 8927, reason: '句子式不明（描述截断：「数值因被摧毁的 [x5]」；「摧毁 5x5 圈宝石」亦无对应区域原语）' },
  { id: 8929, reason: '语义拿不准（「对首位和末位敌人」复合目标——目标表只支持单一模式）' },
    { id: 9008, reason: '特殊宝石（蓝龙宝石）' },
  { id: 9023, reason: '特殊宝石（石像鬼宝石）' },
  { id: 9121, reason: '语义拿不准（「1-3 个随机负面状态效果」无随机施加状态原语）' },
  { id: 9241, reason: '语义拿不准（「消除…随机技能值」无对应削减原语；「择期」疑为乱码；狂怒为缺失状态）' },
];

const SPELLS: CuratedBatch['spells'] = [
  {
    id: 8822,
    desc: '给予一名盟友 [魔法 + 1] 点护甲值。若盟友是机械，则效果翻 3 倍。',
    build: skill(
      // 回收：raceTimes 现支持「翻 3 倍」（builders SegmentOpts：raceDouble 默认 ×2，raceTimes 覆写；
      // 机械 = Mech，troopTypes 核实；batch-22 8748「神祇 3 倍」同族）
      armor('allyChosen', 1, 1, { raceDouble: 'Mech', raceTimes: 3 }),
    ),
  },
  {
    id: 8864,
    desc: '对一名敌人造成 [魔法 + 4] 点伤害，再创造 2 颗绿色宝石，数量因狐人盟友数而增强。 [x2]',
    build: skill(
      dmg('enemyChosen', 4),
      // 「数量因狐人盟友数而增强」：modifier 点名「创造/宝石数」→ 挂创造段（狐人 = Wargare）
      createGems(BaseColor.Green, 2, 0, {
        modifier: { mod: { kind: 'multiplier', a: 2 }, source: { kind: 'alliesOfRace', race: 'Wargare' } },
      }),
    ),
  },
  {
    id: 8881,
    desc: '对 3 名随机敌人造成 [魔法 + 3] 点溅射伤害，伤害值因下潜的盟友数而增强。 [x3]',
    build: skill(
      // 「溅射伤害」+ 随机多名目标（batch-01 7208 同构）；「因下潜的盟友数」= allyStatusCount(submerged)
      // Native 8881: SplashHighDamage@RandomEnemy + 2 x @RandomPrefNotPrevEnemy (R007-3; was 3 distinct centres).
      ...(['enemyRandom', 'enemyRandomPrefNotPrev', 'enemyRandomPrefNotPrev'] as const).map(t => dmgSplash(t, 3, 1, {
        modifier: { mod: { kind: 'multiplier', a: 3 }, source: { kind: 'allyStatusCount', statusId: 'submerged' } },
      })),
    ),
  },
  {
    id: 8888,
    desc: '给予所有盟友 [魔法 + 1] 点生命值，并赋予所有哥布林盟友屏障效果。获得一个额外回合。',
    build: skill(
      heal('allyAll', 1),
      // 「所有哥布林盟友」= 目标模式照常 + targetRace（SOP 措辞裁定；哥布林 = Goblin）
      inflict('barrier', 'allyAll', { targetRace: 'Goblin' }),
      extraTurn(),
    ),
  },
  {
    id: 8969,
    desc: '对 4 名随机敌人造成 [魔法 + 2] 点伤害，伤害值因我的护甲值而增强。 [3:1]',
    build: skill(
      // 「因我的护甲值而增强」= selfStat(armor)（SOP 措辞裁定）
      // L7-7344 (sa-L76): native = RandomEnemy + 3 x RandomPrefNotPrevEnemy separate hits, so
      // 2 living enemies still take 4 hits (alternating); one segment per native step.
      dmg('enemyRandom', 2, 1, { modifier: SELF_ARMOR_3_1 }),
      dmg('enemyRandomPrefNotPrev', 2, 1, { modifier: SELF_ARMOR_3_1 }),
      dmg('enemyRandomPrefNotPrev', 2, 1, { modifier: SELF_ARMOR_3_1 }),
      dmg('enemyRandomPrefNotPrev', 2, 1, { modifier: SELF_ARMOR_3_1 }),
    ),
  },
  {
    id: 8982,
    desc: '给予盟友 [魔法 + 1] 点生命值和 3 点魔力值。若对方是妖仙，则效果翻倍。',
    build: skill(
      // 「给予盟友」单数未限定 → allyChosen（「若对方是妖仙」指向单一受益者）
      heal('allyChosen', 1, 1, { raceDouble: 'Fey' }),
      // 「魔力值」= magic 属性（SOP 措辞裁定）；「效果翻倍」两段各自挂 raceDouble（妖仙 = Fey）
      magic('allyChosen', 3, 0, { raceDouble: 'Fey' }),
    ),
  },
  {
    id: 8983,
    desc: '对一名敌人造成 [魔法 + 3] 点伤害。若对方是一名恶魔，则造成 3 倍伤害，再净化自身。',
    build: skill(
      // 回收：condMult 现支持 targetRace 条件倍率（SOP「如果敌人是恶魔/怪兽（族），则造成 3 倍伤害」同款）
      dmg('enemyChosen', 3, 1, { condMult: { times: 3, cond: { kind: 'targetRace', race: 'Daemon' } } }),
      cleanse('allySelf'),
    ),
  },
  {
    id: 9021,
    desc: '对一名敌人造成 [魔法 + 2] 点伤害，伤害值因骷髅头数而增强。 [1:1]',
    build: skill(
      // 「因骷髅头数而增强」= boardSkulls（spell-rules §1 来源表）
      dmg('enemyChosen', 2, 1, {
        modifier: { mod: { kind: 'ratio', a: 1, b: 1 }, source: { kind: 'boardSkulls' } },
      }),
    ),
  },
  {
    id: 9045,
    desc: '爆破一行。获得一个额外回合。',
    build: skill(
      // 「爆破一行」照 batch-01 7016「摧毁 1 行」→ 选定行同口径
      explodeChosenRow(),
      extraTurn(),
    ),
  },
  {
    id: 9119,
    desc: '创造 8 颗棕色宝石和 8 颗黄色宝石。',
    build: skill(
      createGems(BaseColor.Brown, 8, 0),
      createGems(BaseColor.Yellow, 8, 0),
    ),
  },
  {
    id: 9182,
    desc: '对所有敌人造成 [魔法 + 2] 点伤害。创造 16 颗混合红色和黄色的宝石。',
    build: skill(
      dmgAll(2),
      createMix([BaseColor.Red, BaseColor.Yellow], 16, 0),
    ),
  },
  {
    id: 9190,
    desc: '对 2 名随机盟友造成 [魔法 + 2] 点真实伤害，伤害值因厄什卡盟友数而增强。 [x3]',
    // 敌我颠倒修正（2026-09-18 官方复核）：官方 TrueDamage@RandomEnemy 打随机敌人，非盟友（中文机翻误译）
    build: skill(
      // 厄什卡 = Urska（troops.json 查询）
      trueDmg('enemyRandomN', 2, 1, {
        n: 2, randomWaves: 2,
        modifier: { mod: { kind: 'multiplier', a: 3 }, source: { kind: 'alliesOfRace', race: 'Urska' } },
      }),
    ),
  },
  {
    id: 9242,
    desc: '给予一名随机盟友 [魔法 + 1] 点魔力值。再召唤一个随机书卷。',
    build: skill(
      // 「魔力值」= magic 属性（SOP 措辞裁定）
      magic('allyRandom', 1),
      // 原生 A+(B-C-D-E-F)：Summoning 7494 | 6908 | 7494 | 6475 | 6908 五选一 → 女巫之书 2/5、秘密之书 2/5、
      // 邪恶之书 1/5（sa-H：原为三者等概率）
      oneOf(...['BookOfWitches', 'BookOfSecrets', 'BookOfWitches', 'TomeOfEvil', 'BookOfSecrets'].map(r => [summonRef(r)])),
    ),
  },
];

export const BATCH_10: CuratedBatch = { batch: '10', spells: SPELLS, skipped: SKIPPED };
