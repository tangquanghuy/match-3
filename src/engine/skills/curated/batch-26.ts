/**
 * 人工核对组装 · 批次 26（池：scripts/curated-pools/pool-26.json）
 * 核对者：agent 批次26
 *
 * 语义裁定备注：
 * - 「对其/这两名敌人」确定性目标回指 → 复用同一 TargetMode（非随机绑定，batch-05「对其」口径）。
 * - 「魔法值」= magic 属性、「法力值」= mana 资源（SOP 措辞裁定）：7576「窃取 4 点魔法值」
 *   = steal magic→magic（batch-01 8278 同款）；「耗掉/耗尽…法力值」= reduce stat:'mana'（batch-15 头注）。
 * - 「耗尽上至/最多 12 点法力值。创造X宝石，数量与所耗尽的法力值等同 [1:1]」=
 *   reduce mana 12 + createGems 基数 0 + [1:1] drainedMana（batch-25 7467/7206 同款）。
 * - 「爆破一颗宝石」= explodeRandomGems(1,0,'color')（batch-14 头注同口径）；「宝石」不含骷髅。
 * - 「因被摧毁的骷髅头数而增强」：爆破/摧毁行列混色，destroyedGems 无法筛骷髅 → SKIP（batch-14 8090 同款）。
 * - 「因敌军/敌我双方的X族·X色数量而增强」：来源计数仅支持己方（alliesOfRace/alliesOfColor）→ SKIP。
 * - 「召唤一名荆棘森林/鳞雾沼泽军队」按王国随机，无法用种族列表表达（batch-16 8831 同款）→ SKIP。
 * - 几率召唤/死亡条件召唤：SummonSegment 继承 SegmentOptions，展开挂载
 *   （batch-17 9348 / batch-13 三土狼先例）。
 * - 「奥眼能」= Ocularen（6608，batch-08 头注口径；非后出的 OcularenEgg）。
 * - 「生命值和攻击力」共用一个 modifier 子句：挂最近数值段（batch-15 头注 / batch-14 8297 同款）。
 * - 8184「屏障效果。  [x3]」双空格逐字保留（对号入座锚）。
 */
import { skill, dmg, trueDmg, heal, armor, attack, reduce, drainMana, steal, inflict,
  createGems, createMix, createSkulls, explodeRandomGems, summonRef, summonRandom, transform,
  destroyChosenRow, destroyChosenCol } from '../builders';
import { BaseColor } from '../../types';
import type { CuratedBatch } from './index';

/** troopTypes 含 Dwarf 的全部兵种 referenceName（SOP §6 查询命令得出） */
const DWARFS = [
  'DwarvenMiner', 'Bombardier', 'DeepBorer', 'Sparkgrinder', 'Keghammer', 'DwarfLord',
  'Runesmith', 'DwarvenSlayer', 'LordIronbeard', 'Apothecary', 'LadyIronbeard', 'Stonehammer',
  'DwarvenGate', 'KingHighforge', 'DwarvenHunter', 'DwarvenZombie', 'SlayerGhost', 'Bonebinder',
  'Gemhammer', 'KingBloodhammer', 'GimletStormbrew', 'ZhakBoomgrizzle', 'GriffStonefeather',
  'Thunderforge', 'Excavator', 'MortlachStoutbeard', 'MoiraCragheart', 'Destruct-o-Bot',
  'TinkSteamwhistle', 'BoneboundDredge', 'DurganIronfall', 'DeepDwarf', 'DarkSmith',
  'FrozenShieldbreaker', 'DarkSmithDrenza', 'TinkerDwarf', 'DhrakSmith', 'KrisKrinkle',
  'RuneChanter', 'LostWarrior', 'DwarvenVanguard', 'GhostKingGrimhorn', 'DarkMason',
  'DwarvenMerchant', 'DwarvenOverseer', 'DugallRamhorn', 'ParagonStatue', 'MydnightInnovator',
  'KhormacTheRestless', 'RatchetCogbolt', 'Mrs.Krinkle', 'FlinthammersTower', 'MineCart',
  'RhonaBittershield',
];

const SKIPPED: { id: number; reason: string }[] = [
  { id: 7596, reason: '语义拿不准（「减除…随机技能值」无对应削减原语（随机属性只支持获得），batch-01 7319 同款）' },
  { id: 7598, reason: '二次缩放来源不支持（「因敌军的妖仙数量而增强」敌方种族计数无对应 kind，alliesOfRace 仅己方）' },
  { id: 7599, reason: '缺失状态（妖火，batch-08 8433 同款）' },
  { id: 7600, reason: '二次缩放来源不支持（「因敌我双方的红色军队数量而增强」——alliesOfColor 仅己方、无敌方色计数 kind）' },
  { id: 7602, reason: '语义拿不准（「窃取…一半魔法值」按当前值减半无原语，batch-11 9816 同款）；「召唤 1 到 3 名」数量区间亦无原语（batch-22 8546 同款）' },
  { id: 7651, reason: '语义拿不准（「因其他所有盟友的法力值而增强」——allyStatSum 为己方全体含自身，手册未覆盖「其他盟友」句式，batch-20 7506 同款）' },
  { id: 7797, reason: '二次缩放来源「神祗敌军数量」无对应 kind（敌方侧种族计数不支持，仅 alliesOfRace 己方，batch-13 7546/7547 同款）；「爆破 3 颗末日骷髅头」与沉默段现可表达（explodeRandomSpecialGems doomSkull / targetRace Divine）' },
  { id: 7798, reason: '二次缩放来源不支持（「因敌我双方的恶魔军队数量而增强」无敌方种族计数 kind）；「转化成一名恶魔」兵种转化亦不做（SOP 措辞裁定）' },
  { id: 7977, reason: '二次缩放来源不支持（「因被摧毁的骷髅头数而增强」——爆破段混色无法筛骷髅，batch-14 8090 同款）' },
  { id: 7985, reason: '语义拿不准（「击晕所有受到伤害的敌人」按受击集合选目标无原语）；「若自身攻击力较高则双倍」比较条件不在 condMult 条件域、「召唤 1-3 个」数量区间亦无原语' },
  { id: 8031, reason: '语义拿不准（「召唤一名荆棘森林军队」按王国随机无法用种族列表表达，batch-16 8831 同款）' },
  { id: 8039, reason: '二次缩放来源不支持（「因被摧毁的骷髅头数而增强」——行+列混色无法筛骷髅，batch-14 8090 同款）' },
  { id: 8055, reason: '伤害区间（[魔法 + 4] – [(魔法 x 2) + 8]，batch-25 7213 同款）' },
  { id: 8101, reason: '隐匿/位置操作（「打回后方」，batch-05 7255 同款）' },
  { id: 8108, reason: '语义拿不准（「有 50% 的几率伤害值会打中另一名随机敌人」弹射二段随机绑定无原语，batch-25 7314 同款）；「若敌人使用紫色法力则 3 倍伤害」条件倍率现可表达但整条仍卡' },
  { id: 8116, reason: '句子式不明（「摧毁一整块大小为 5x5 的宝石」无对应面积清除原语，batch-08 8164 同款）' },
  { id: 8163, reason: '语义拿不准（「将敌人的护甲值和生命值减半」减半无原语，batch-11 9816 同款）；「创造 9 - 13 颗」数量区间亦无原语' },
  { id: 8168, reason: '二次缩放来源不支持（「因被摧毁的骷髅头数量而增强」——爆破段混色无法筛骷髅，batch-14 8090 同款）' },
  { id: 8193, reason: '语义拿不准（「召唤 1 到 2 位鳞雾沼泽军队」数量区间无原语，batch-21 8042 同款；按王国随机亦无法表达，batch-16 8831 同款）' },
  { id: 8216, reason: '语义拿不准（「创造 9 颗其法力颜色的宝石」按目标法力色动态选色，batch-11 9540 同款）；「为另外 2 名盟友重复相同操作」重复执行亦无原语（batch-16 8831 同款）' },
];

const SPELLS: CuratedBatch['spells'] = [
  {
    id: 7552,
    desc: '击晕最后两名敌人并对其造成 [魔法 + 3] 点伤害，伤害值因矮人盟友数而增强。召唤一名随机矮人。 [x6]',
    build: skill(
      inflict('stun', 'enemyLastN', { n: 2 }),
      // 「对其」回指「最后两名敌人」（确定性目标，非随机绑定）→ 复用 enemyLastN
      dmg('enemyLastN', 3, 1, {
        n: 2,
        modifier: { mod: { kind: 'multiplier', a: 6 }, source: { kind: 'alliesOfRace', race: 'Dwarf' } },
      }),
      summonRandom(DWARFS),
    ),
  },
  {
    id: 7556,
    desc: '摧毁 1 行。给一个随机的盟友增加 [魔法 + 1] 点生命值，点数因被摧毁的黄色宝石数而增强。如果盟友使用蓝色法力则效果双倍。 [x3]',
    build: skill(
      destroyChosenRow(),
      // 回收：condMult 现支持 targetColor 条件倍率（按受益目标 manaColors 含该色判定）；
      // 「被摧毁的黄色宝石数」= 前序摧行段的直接摧毁数（destroyedGems 带色）
      heal('allyRandom', 1, 1, {
        modifier: { mod: { kind: 'multiplier', a: 3 }, source: { kind: 'destroyedGems', color: BaseColor.Yellow } },
        condMult: { times: 2, cond: { kind: 'targetColor', color: BaseColor.Blue } },
      }),
    ),
  },
  {
    id: 7565,
    desc: '对所有敌人造成 [魔法 + 2] 点真实伤害，伤害值因纳迦和不死族盟友数而增强。召唤一名骸骨纳迦。 [x3]',
    build: skill(
      trueDmg('enemyAll', 2, 1, {
        range: 'all',
        // 「纳迦和不死族盟友数」双来源 → sources 计数相加（SOP §3）
        modifier: {
          mod: { kind: 'multiplier', a: 3 },
          sources: [{ kind: 'alliesOfRace', race: 'Naga' }, { kind: 'alliesOfRace', race: 'Undead' }],
        },
      }),
      summonRef('BoneNaga', 6350),
    ),
  },
  {
    id: 7576,
    desc: '对前两名敌人造成 [魔法 + 2] 点伤害，伤害值因自身生命值而增强。窃取这两名敌人 4 点魔法值。将所有紫色宝石转换成红色。 [3:1]',
    build: skill(
      dmg('enemyFirstN', 2, 1, {
        n: 2,
        // 「因自身生命值」= selfStat hp 当前值（batch-08 8171 同款）
        modifier: { mod: { kind: 'ratio', a: 3, b: 1 }, source: { kind: 'selfStat', stat: 'hp' } },
      }),
      // 「这两名敌人」回指「前两名敌人」；「魔法值」= magic 属性（batch-01 8278 同款）
      steal('enemyFirstN', 'magic', 'magic', 4, 0, { n: 2 }),
      transform(BaseColor.Purple, BaseColor.Red),
    ),
  },
  {
    id: 7597,
    desc: '耗尽一名敌人上至 12 点法力值。创造绿色宝石，数量与所耗尽的法力值等同。 [1:1]',
    build: skill(
      // batch-25 7467 同款：「上至 12 点」= 削减 12（夹零后至多 12）；「数量与所耗尽的法力值等同」= 基数 0 + [1:1] drainedMana
      reduce('enemyChosen', 'mana', 12, 0),
      createGems(BaseColor.Green, 0, 0, {
        modifier: { mod: { kind: 'ratio', a: 1, b: 1 }, source: { kind: 'drainedMana' } },
      }),
    ),
  },
  {
    id: 7705,
    desc: '摧毁 1 行。创造 6 颗黄色宝石，创造的宝石数因被摧毁的蓝色宝石数而增强。 [x2]',
    build: skill(
      destroyChosenRow(),
      // 「创造的宝石数」点名创造段；被摧毁的蓝色宝石来自前序摧行段（batch-14 7951 同款）
      createGems(BaseColor.Yellow, 6, 0, {
        modifier: { mod: { kind: 'multiplier', a: 2 }, source: { kind: 'destroyedGems', color: BaseColor.Blue } },
      }),
    ),
  },
  {
    id: 7730,
    desc: '随机爆破 4 颗宝石。击晕一名敌人。如果敌人是一名神祇军队，则窃取 8 点生命值。',
    build: skill(
      explodeRandomGems(4, 0, 'color'),
      inflict('stun', 'enemyChosen'),
      // 回收：ifCond 现支持条件触发（SOP「通用条件触发 / 条件加成」节）；「窃取 X 点生命值」
      // = dmg + drain（batch-01 7302 / batch-08 头注口径）；神祇 = Divine（batch-20 头注核实）
      dmg('enemyChosen', 8, 0, { drain: true, ifCond: { kind: 'targetRace', race: 'Divine' } }),
    ),
  },
  {
    id: 7776,
    desc: '创造 7 颗红色宝石。再爆破 [(魔法 / 2) + 1] 颗红色宝石。有 30% 的几率召唤一只贝格拉。',
    build: skill(
      createGems(BaseColor.Red, 7, 0),
      // [(魔法 / 2) + 1] = scale(1, 0.5)（与 pool scalings 一致）；限定红色、仅色宝石
      explodeRandomGems(1, 0.5, 'color', BaseColor.Red),
      // 概率只辖召唤子句；SummonSegment 继承 SegmentOptions，展开挂载（batch-17 9348 同款）
      { ...summonRef('Pyggra', 6572), chance: 0.3 },
    ),
  },
  {
    id: 7793,
    desc: '缠绕一名敌人。创造 6 颗绿宝石，宝石数量因被缠绕的敌人数量而增强。 [x3]',
    build: skill(
      inflict('entangle', 'enemyChosen'),
      // 「宝石数量因…增强」点名创造段；「被缠绕的敌人数量」= enemyStatusCount('entangle')
      createGems(BaseColor.Green, 6, 0, {
        modifier: { mod: { kind: 'multiplier', a: 3 }, source: { kind: 'enemyStatusCount', statusId: 'entangle' } },
      }),
    ),
  },
  {
    id: 7807,
    desc: '耗尽所有盟友和敌军的法力值。获得等同于所耗尽的法力值的生命值。 [1:1]',
    build: skill(
      // 「所有盟友和敌军」→ 两个耗蓝段（allyAll 含自身）；drainedMana 跨段追踪累计双方耗蓝总量
      drainMana('allyAll'),
      drainMana('enemyAll'),
      // 「获得等同于所耗尽的法力值的生命值」= 基数 0 + [1:1] drainedMana（batch-25 7206 口径）
      heal('allySelf', 0, 0, {
        modifier: { mod: { kind: 'ratio', a: 1, b: 1 }, source: { kind: 'drainedMana' } },
      }),
    ),
  },
  {
    id: 7930,
    desc: '给予所有其他盟友 [魔法 + 1] 点生命值，数值因绿色宝石和骷髅头数而增强。召唤一名奥眼能血蛭或一名奥眼能。 [3:1]',
    build: skill(
      heal('allyOthers', 1, 1, {
        // 「绿色宝石和骷髅头数」无「被摧毁」字样 → 棋盘现读双来源（batch-07 7974 口径）
        modifier: {
          mod: { kind: 'ratio', a: 3, b: 1 },
          sources: [{ kind: 'boardGems', color: BaseColor.Green }, { kind: 'boardSkulls' }],
        },
      }),
      // 文本点名两选一 → randomOf 两项；「奥眼能」= Ocularen（batch-08 头注口径）
      summonRandom(['OcularenLeech', 'Ocularen']),
    ),
  },
  {
    id: 8035,
    desc: '冻结一名敌人。创造 6 颗蓝色宝石，数量因被冻结的敌军数而增强。 [x3]',
    build: skill(
      inflict('frozen', 'enemyChosen'),
      // 「数量因…增强」点名创造段；「被冻结的敌军数」= enemyStatusCount('frozen')（batch-25 7488 同款）
      createGems(BaseColor.Blue, 6, 0, {
        modifier: { mod: { kind: 'multiplier', a: 3 }, source: { kind: 'enemyStatusCount', statusId: 'frozen' } },
      }),
    ),
  },
  {
    id: 8059,
    desc: '创造 6 颗骷髅头，数量因陷入出血状态的敌人而增强。使一名随机敌人陷入出血状态。 [x2]',
    build: skill(
      createSkulls(6, 0, {
        // 「陷入出血状态的敌人」= enemyStatusCount('bleed')；bleed 在状态白名单
        modifier: { mod: { kind: 'multiplier', a: 2 }, source: { kind: 'enemyStatusCount', statusId: 'bleed' } },
      }),
      inflict('bleed', 'enemyRandom'),
    ),
  },
  {
    id: 8068,
    desc: '耗尽一名敌人上至 12 点法力值。创造紫色宝石，数量与所耗尽的法力值等同。 [1:1]',
    build: skill(
      // batch-25 7467 同款（紫色版）
      reduce('enemyChosen', 'mana', 12, 0),
      createGems(BaseColor.Purple, 0, 0, {
        modifier: { mod: { kind: 'ratio', a: 1, b: 1 }, source: { kind: 'drainedMana' } },
      }),
    ),
  },
  {
    id: 8099,
    desc: '摧毁一列。创建 5 颗红宝石，创建数因被摧毁的棕色宝石数而增强。 [x2]',
    build: skill(
      destroyChosenCol(),
      // 「红宝石」= 红色宝石（batch-17 头注）；「创建数」点名创造段（batch-16 8831 前同款句式）
      createGems(BaseColor.Red, 5, 0, {
        modifier: { mod: { kind: 'multiplier', a: 2 }, source: { kind: 'destroyedGems', color: BaseColor.Brown } },
      }),
    ),
  },
  {
    id: 8115,
    desc: '获得 [(魔法 x 2) + 8] 点护甲值。若有 13 或更多颗骷髅头，则护甲值翻倍。创造 22 颗混合蓝色和红色的宝石。',
    build: skill(
      // 回收：condMult 现支持 boardAtLeast 条件倍率（batch-08 8279 同款）；
      // boardAtLeast 不带 color 时按骷髅头计数（effects/secondary.ts conditionMet 口径）
      armor('allySelf', 8, 2, { condMult: { times: 2, cond: { kind: 'boardAtLeast', n: 13 } } }),
      // 「混合蓝色和红色」= createMix（SOP §3）
      createMix([BaseColor.Blue, BaseColor.Red], 22, 0),
    ),
  },
  {
    id: 8117,
    desc: '对一名敌人造成 [魔法 + 5] 点伤害，伤害值因红色盟友和骷髅头数而增强。若敌人身亡，则召唤两名卓恩拳。 [x4]',
    build: skill(
      dmg('enemyChosen', 5, 1, {
        // 「红色盟友」= alliesOfColor（batch-09/14 口径）；「骷髅头数」= boardSkulls 棋盘现读
        modifier: {
          mod: { kind: 'multiplier', a: 4 },
          sources: [{ kind: 'alliesOfColor', color: BaseColor.Red }, { kind: 'boardSkulls' }],
        },
      }),
      // 「两名」→ 两个召唤段各召 1 名（batch-13 三土狼同款）；死亡条件展开挂载
      { ...summonRef('FistOfZorn', 6682), ifTargetDied: true },
      { ...summonRef('FistOfZorn', 6682), ifTargetDied: true },
    ),
  },
  {
    id: 8183,
    desc: '耗掉一名敌人最多 12 点法力值。创造红色宝石，数量等同于所耗掉的法力值。 [1:1]',
    build: skill(
      // 「最多 12 点」= 削减 12（夹零后至多 12）；「数量等同于所耗掉的法力值」= 基数 0 + [1:1] drainedMana
      reduce('enemyChosen', 'mana', 12, 0),
      createGems(BaseColor.Red, 0, 0, {
        modifier: { mod: { kind: 'ratio', a: 1, b: 1 }, source: { kind: 'drainedMana' } },
      }),
    ),
  },
  {
    id: 8184,
    desc: '爆破一颗宝石。获得 [魔法 + 1] 点生命值和攻击力，数值因被摧毁的绿色宝石而增强。获得屏障效果。  [x3]',
    build: skill(
      // 「爆破一颗宝石」→ 随机色宝石（batch-14 头注口径）
      explodeRandomGems(1, 0, 'color'),
      // 一个方括号喂双段（batch-03 8372 同款）；modifier 挂最近数值段（batch-14 8297 / batch-15 头注口径）
      heal('allySelf', 1),
      attack('allySelf', 1, 1, {
        modifier: { mod: { kind: 'multiplier', a: 3 }, source: { kind: 'destroyedGems', color: BaseColor.Green } },
      }),
      inflict('barrier', 'allySelf'),
    ),
  },
];

export const BATCH_26: CuratedBatch = { batch: '26', spells: SPELLS, skipped: SKIPPED };
