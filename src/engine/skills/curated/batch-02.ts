/**
 * 人工核对组装 · 批次 02（池：scripts/curated-pools/pool-02.json）
 * 核对者：agent 批次02
 *
 * 语义裁定备注：
 * - 「摧毁 1 列」→ destroyChosenCol（照批次 01 的 7016「摧毁 1 行」先例）。
 * - 「宝石」不含骷髅（GoW 术语：Gem=色宝石，Skull=骷髅），随机宝石段 include:'color'。
 * - 「窃取 … 生命值」= 伤害 + drain（批次 01 备注口径）。
 * - 「对所有敌人…散射伤害」散射只是类型词 → dmgAll（SOP 措辞裁定）。
 * - 中文数字（前两名/最后两名）换算为 N（「前 N 名」从队伍顶部数）。
 */
import { skill, dmg, dmgAll, dmgSplash, heal, armor, attack,
  cleanse, reduce, drainMana, randomStat, createGems, transform,
  destroyChosenCol, destroyRandomGems, explodeRandomGems, inflict,
  extraTurn, CHOSEN, CASTER } from '../builders';
import { BaseColor } from '../../types';
import type { CuratedBatch } from './index';

const SKIPPED: { id: number; reason: string }[] = [
  { id: 7000, reason: '「摧毁 1 颗宝石和其两侧的宝石」无对应原语（仅两侧邻格、目标未指明），语义拿不准' },
  { id: 7057, reason: '首句「造成…真实伤害」未指明目标（batch-02 7265 同款先例，句子式不明）；「敌人受伤则 +6」条件加成现已可用 condBonus targetHpDamaged 表达，但目标措辞仍缺' },
  { id: 7137, reason: '「恢复所有生命值」无全额治疗原语，语义拿不准' },
  { id: 7158, reason: '特殊宝石（天使宝石）' },
  { id: 8684, reason: '「消除…随机技能值」无对应削减原语（随机属性只支持获得）' },
  { id: 8736, reason: '伤害区间（3-[魔法 + 2]）' },
  { id: 9000, reason: '创造数量为区间（8-12），数值不明' },
  { id: 9013, reason: '「重组敌人队伍队列」隐匿/位置操作（不做清单）' },
  { id: 9848, reason: '「击退到后排」隐匿/位置操作（不做清单）' },
];

const SPELLS: CuratedBatch['spells'] = [
  {
    id: 7009,
    desc: "创造 9 颗棕色宝石。自身一项随机属性获得 [魔法] 点。",
    build: skill(
      createGems(BaseColor.Brown, 9, 0),
      randomStat('allySelf', 0, 1, { oneSkill: true }),
    ),
  },
  {
    id: 7012,
    desc: '对前 2 名敌人造成 [魔法 + 1] 点伤害，若敌人陷入织网状态，则伤害增加 8 点。',
    build: skill(
      // 回收：condBonus 现支持「+N 点」条件加成（SOP「通用条件触发 / 条件加成」节），
      // targetStatus 为目标相对条件、逐目标判定；web 在状态白名单
      dmg('enemyFirstN', 1, 1, { n: 2, condBonus: { n: 8, cond: { kind: 'targetStatus', statusId: 'web' } } }),
    ),
  },
  {
    id: 7015,
    desc: '减除一名敌人 [魔法 + 1] 点护甲值，使他他陷入织网状态并耗掉他所有法力值。',
    build: skill(
      reduce('enemyChosen', 'armor', 1),
      inflict('web', 'enemyChosen'),
      // 「耗掉他所有法力值」= 清空语义
      drainMana('enemyChosen'),
    ),
  },
  {
    id: 7019,
    desc: '随机爆破 [魔法 + 1] 颗黄色宝石。净化所有的盟友。',
    build: skill(
      explodeRandomGems(1, 1, 'color', BaseColor.Yellow),
      // 「所有的盟友」含施法者自身（spell-rules §0）
      cleanse('allyAll'),
    ),
  },
  {
    id: 7021,
    desc: '随机爆破 [魔法 + 1] 颗绿色宝石，并使 2 名随机敌人陷入中毒状态。',
    build: skill(
      explodeRandomGems(1, 1, 'color', BaseColor.Green),
      inflict('poison', 'enemyRandomN', { n: 2 }),
    ),
  },
  {
    id: 7034,
    desc: '对 1 名敌人造成 [魔法 + 1] 点伤害，并创造 9 颗具有该军队法力颜色的宝石。',
    build: skill(
      dmg('enemyChosen', 1),
      // 「该军队法力颜色」= CASTER 占位符（builders 口径）
      createGems(CASTER, 9, 0),
    ),
  },
  {
    id: 7042,
    desc: '摧毁 1 列。创造 9 颗棕色宝石并获得 [魔法 + 1] 点护甲值。',
    build: skill(
      // 「摧毁 1 列」照批次 01 的 7016「摧毁 1 行」先例 → 选定列
      destroyChosenCol(),
      createGems(BaseColor.Brown, 9, 0),
      armor('allySelf', 1),
    ),
  },
  {
    id: 7044,
    desc: '对 1 名敌人造成 [魔法 + 2] 伤害。获得一个额外回合。',
    build: skill(
      dmg('enemyChosen', 2),
      extraTurn(),
    ),
  },
  {
    id: 7051,
    desc: '对最健康的敌人造成 [魔法 + 3] 点伤害，并使其陷入中毒和燃烧状态。',
    build: skill(
      dmg('enemyHealthiest', 3),
      inflict('poison', 'lastTarget'), // native FromPrevious: the damaged enemy, no re-pick after a kill
      inflict('burning', 'lastTarget'),
    ),
  },
  {
    id: 7058,
    desc: '对 1 名随机的敌人造成 [魔法 + 4] 点伤害，并创造 7 颗黄色宝石。',
    build: skill(
      dmg('enemyRandom', 4),
      createGems(BaseColor.Yellow, 7, 0),
    ),
  },
  {
    id: 7140,
    desc: '创造 9 颗绿色宝石和 9 颗蓝色宝石，然后对所有敌人造成 [魔法 + 4] 点真实伤害。',
    build: skill(
      createGems(BaseColor.Green, 9, 0),
      createGems(BaseColor.Blue, 9, 0),
      // 真实伤害 = trueDamage（跳护甲）
      dmgAll(4, 1, true),
    ),
  },
  {
    id: 7143,
    desc: '使所有敌人和自身陷入沉默状态。',
    build: skill(
      inflict('silence', 'enemyAll'),
      inflict('silence', 'allySelf'),
    ),
  },
  {
    id: 7144,
    desc: '将选定颜色的所有宝石转换成骷髅头。',
    build: skill(
      // transform 两端可为 'SKULL'（SOP 措辞裁定）
      transform(CHOSEN, 'SKULL'),
    ),
  },
  {
    id: 7147,
    desc: '对所有敌人造成 [魔法 + 5] 点伤害。摧毁 12 个随机的宝石。',
    build: skill(
      dmgAll(5),
      // 「宝石」不含骷髅 → include:'color'
      destroyRandomGems(12, 0, 'color'),
    ),
  },
  {
    id: 7148,
    desc: '对所有敌人造成 [魔法 + 1] 点真实伤害。获得 16 点生命值。',
    build: skill(
      dmgAll(1, 1, true),
      // 「获得 X 点生命」= heal('allySelf')；16 为常数（mult=0）
      heal('allySelf', 16, 0),
    ),
  },
  {
    id: 7150,
    desc: '创造 9 颗红色宝石和 9 颗黄色宝石，然后对 1 名敌人造成 [魔法 + 4] 点伤害。',
    build: skill(
      // EN + native CreateGems 9 Red ; CreateGems 9 Yellow (Chinese snapshot said 10).
      createGems(BaseColor.Red, 9, 0),
      createGems(BaseColor.Yellow, 9, 0),
      dmg('enemyChosen', 4),
    ),
  },
  {
    id: 7151,
    desc: '为所有盟友提供 [魔法 + 2] 点攻击力。再赋予首位盟友屏障效果。',
    build: skill(
      attack('allyAll', 2),
      // 「首位盟友」= 队首盟友
      inflict('barrier', 'allyFront'),
    ),
  },
  {
    id: 7168,
    desc: '对最后一名敌人造成 [魔法 + 2] 点伤害。创造 7 棕色宝石。',
    build: skill(
      dmg('enemyLast', 2),
      createGems(BaseColor.Brown, 7, 0),
    ),
  },
  {
    id: 7278,
    desc: '对所有敌人造成 [魔法 + 8] 点散射伤害。随机燃烧一名敌人。',
    build: skill(
      // 「对所有敌人…散射」：散射只是类型词，全体目标各自结算（SOP 措辞裁定）
      dmgAll(8),
      inflict('burning', 'enemyRandom'),
    ),
  },
  {
    id: 7313,
    desc: '对前两名敌人造成 [魔法 + 5] 点伤害并使最后两名敌人陷入中毒状态。',
    build: skill(
      // 中文数字换算：前两名/最后两名 → N=2（从队伍顶部数）
      dmg('enemyFirstN', 5, 1, { n: 2 }),
      inflict('poison', 'enemyLastN', { n: 2 }),
    ),
  },
  {
    id: 7333,
    desc: '冻结所有敌人。对最虚弱的敌人造成 [魔法 + 18] 点伤害。',
    build: skill(
      inflict('frozen', 'enemyAll'),
      dmg('enemyWeakest', 18),
    ),
  },
  {
    id: 7357,
    desc: '创造 8 颗蓝色宝石。获得 [魔法 + 1] 点攻击力。',
    build: skill(
      // sa-F2 fix round A (R001): native IncreaseAttack@Self before CreateGems 8 Blue
      attack('allySelf', 1),
      createGems(BaseColor.Blue, 8, 0),
    ),
  },
  {
    id: 8734,
    desc: '对 1 名随机的敌人造成 [魔法 + 2] 点伤害。',
    build: skill(
      dmg('enemyRandom', 2),
    ),
  },
  {
    id: 8790,
    desc: '获得 [魔法 + 1] 点护甲值，并赋予所有恶魔屏障效果。',
    build: skill(
      armor('allySelf', 1),
      // 回收：targetRace 早已实现（SOP §3）；原跳过理由过时（审计发现）
      inflict('barrier', 'allyAll', { targetRace: 'Daemon' }),
    ),
  },
  {
    id: 8958,
    desc: '对一名随机敌人造成 [魔法 + 5] 点伤害。',
    build: skill(
      dmg('enemyRandom', 5),
    ),
  },
  {
    id: 9116,
    desc: '窃取一名敌人 [魔法 + 1] 点生命值，并使他陷入织网状态。',
    build: skill(
      // 「窃取 … 生命值」= 伤害 + drain（批次 01 备注口径）
      dmg('enemyChosen', 1, 1, { drain: true }),
      inflict('web', 'enemyChosen'),
    ),
  },
  {
    id: 9176,
    desc: '击晕一名敌人，并对其造成 [魔法 + 2] 点严重溅射伤害。',
    build: skill(
      inflict('stun', 'enemyChosen'),
      // 「严重溅射」= 溅射（dmgSplash）
      dmgSplash('enemyChosen', 2),
    ),
  },
];

export const BATCH_02: CuratedBatch = { batch: '02', spells: SPELLS, skipped: SKIPPED };
