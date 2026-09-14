/**
 * 人工核对组装 · 批次 10（池：scripts/curated-pools/pool-10.json）
 * 核对者：agent 批次10
 *
 * 语义裁定备注：
 * - 本批大量「巨人宝石/龙宝石/末日骷髅头/万能牌/缠绕宝石/恐怖宝石/石像鬼宝石」
 *   = 特殊宝石家族（SOP §4「特殊宝石」），是本批 SKIP 主因（14 条）。
 * - 「爆破一行」照 batch-01 7016「摧毁 1 行」→ destroyChosenRow 同口径 → explodeChosenRow()。
 * - 「魔法值」= magic 属性（SOP 措辞裁定）：8982 的「3 点魔法值」、9242 的「[魔法+1] 点魔法值」均加 magic。
 * - 种族英文名（troops.json 查询）：狼族 = Wargare、妖仙 = Fey、厄什卡 = Urska、哥布林 = Goblin、机械 = Mech。
 * - 「随机书卷」= 书卷家族三兵种：罪恶宝典 TomeOfEvil / 秘密古卷 BookOfSecrets / 女王之书 BookOfWitches
 *   （排除「滚动编织者」Scrollweaver——野兽，「水生抄书吏」WaterbornScribe——抄书吏非书卷）。
 * - 「给予盟友」（8982，单数未限定）→ allyChosen（「若对方是妖仙」指向单一受益者）。
 * - 「若盟友是 X 则效果翻 N 倍」：raceDouble 仅支持翻倍（×2），×3 一律 SKIP。
 */
import { skill, dmg, dmgAll, dmgSplash, trueDmg, heal, armor, magic, cleanse,
  createGems, createMix, inflict, summonRandom, extraTurn, explodeChosenRow } from '../builders';
import { BaseColor } from '../../types';
import type { CuratedBatch } from './index';

const SKIPPED: { id: number; reason: string }[] = [
  { id: 8830, reason: '特殊宝石（蓝色巨人宝石）' },
  { id: 8832, reason: '特殊宝石（绿色巨人宝石）' },
  { id: 8834, reason: '特殊宝石（巨型红色宝石）' },
  { id: 8836, reason: '特殊宝石（紫色巨型宝石）' },
  { id: 8837, reason: '特殊宝石（黄色巨型宝石）' },
  { id: 8839, reason: '特殊宝石（棕色巨型宝石）' },
  { id: 8841, reason: '语义拿不准（「若自身队伍有梁帝」队伍含特定兵种条件不支持；「爆破一颗宝石」与「散射伤害」的对象均未指明）' },
  { id: 8854, reason: '语义拿不准（「由蓝宝石增强」未指明被摧毁/棋盘上，计数口径不明）' },
  { id: 8871, reason: '描述截断不完整（「创建 4 颗骷髅头、4 颗末日骷髅头和 4 颗 [1:1]」末段宝石类型缺失，[1:1] 来源无从绑定）；前两段创造现可表达（createSkulls / createSpecialGems doomSkull）' },
  { id: 8887, reason: '特殊宝石（红色龙宝石）' },
  { id: 8901, reason: '定量转换（「将一个选定的法力颜色宝石转换成一颗超级末日骷髅头」一进一出仅 1 颗）无原语（transform/transformToSpecial 为全棋盘全色转换，非 7062「将指定的法力颜色转换为X」全量句式）' },
  { id: 8927, reason: '句子式不明（描述截断：「数值因被摧毁的 [x5]」；「摧毁 5x5 圈宝石」亦无对应区域原语）' },
  { id: 8929, reason: '语义拿不准（「对首位和末位敌人」复合目标——目标表只支持单一模式）' },
  { id: 8945, reason: '特殊宝石（缠绕宝石）' },
  { id: 8960, reason: '伤害区间（[(魔法 / 2) + 1] – [魔法 + 3] -{2}；尾缀 -{2} 亦不明）' },
  { id: 8963, reason: '创造数量区间（「创建 3-6 x3 万能牌」3-6 颗）无原语，且「x3 万能牌」指代不明（tier 还是倍率增强无法裁定），语义拿不准' },
  { id: 8980, reason: '缺失状态（狂怒）；「若自身已受伤害」条件触发亦不支持' },
  { id: 9008, reason: '特殊宝石（蓝龙宝石）' },
  { id: 9023, reason: '特殊宝石（石像鬼宝石）' },
  { id: 9051, reason: '语义拿不准（「使他陷入中毒状态，再耗掉他 5 点法力值」跨段指回前段随机目标——跨段随机目标绑定不支持）' },
  { id: 9054, reason: '缺失状态（恐怖）' },
  { id: 9067, reason: '缺失状态（恐怖）' },
  { id: 9121, reason: '语义拿不准（「1-3 个随机负面状态效果」无随机施加状态原语）' },
  { id: 9126, reason: '隐匿/位置操作（「其下方所有敌人」按位置取目标）' },
  { id: 9163, reason: '特殊宝石（恐怖宝石）' },
  { id: 9165, reason: '二次缩放来源不支持（恐怖宝石数）' },
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
    desc: '对一名敌人造成 [魔法 + 4] 点伤害，再创造 2 颗绿色宝石，数量因狼族盟友数而增强。 [x2]',
    build: skill(
      dmg('enemyChosen', 4),
      // 「数量因狼族盟友数而增强」：modifier 点名「创造/宝石数」→ 挂创造段（狼族 = Wargare）
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
      dmgSplash('enemyRandomN', 3, 1, {
        n: 3,
        modifier: { mod: { kind: 'multiplier', a: 3 }, source: { kind: 'allyStatusCount', statusId: 'submerged' } },
      }),
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
      dmg('enemyRandomN', 2, 1, {
        n: 4,
        modifier: { mod: { kind: 'ratio', a: 3, b: 1 }, source: { kind: 'selfStat', stat: 'armor' } },
      }),
    ),
  },
  {
    id: 8982,
    desc: '给予盟友 [魔法 + 1] 点生命值和 3 点魔法值。若对方是妖仙，则效果翻倍。',
    build: skill(
      // 「给予盟友」单数未限定 → allyChosen（「若对方是妖仙」指向单一受益者）
      heal('allyChosen', 1, 1, { raceDouble: 'Fey' }),
      // 「魔法值」= magic 属性（SOP 措辞裁定）；「效果翻倍」两段各自挂 raceDouble（妖仙 = Fey）
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
    build: skill(
      // 厄什卡 = Urska（troops.json 查询）
      trueDmg('allyRandomN', 2, 1, {
        n: 2,
        modifier: { mod: { kind: 'multiplier', a: 3 }, source: { kind: 'alliesOfRace', race: 'Urska' } },
      }),
    ),
  },
  {
    id: 9242,
    desc: '给予一名随机盟友 [魔法 + 1] 点魔法值。再召唤一个随机书卷。',
    build: skill(
      // 「魔法值」= magic 属性（SOP 措辞裁定）
      magic('allyRandom', 1),
      // 「随机书卷」= 书卷家族三兵种（troops.json 查询，排除滚动编织者/水生抄书吏）
      summonRandom(['TomeOfEvil', 'BookOfSecrets', 'BookOfWitches']),
    ),
  },
];

export const BATCH_10: CuratedBatch = { batch: '10', spells: SPELLS, skipped: SKIPPED };
