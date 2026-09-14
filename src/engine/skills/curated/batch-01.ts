/**
 * 人工核对组装 · 批次 01（池：scripts/curated-pools/pool-01.json）
 * 核对者：窗口 B（金样本批，供后续批次对照）
 *
 * 语义裁定备注：
 * - 「(1/一名)敌人」按官方语义 = 施法方指定目标 → enemyChosen（spell-rules.md §0）；
 *   早期手写库 7004/7132/7155 用的 enemyFront 行为保留在 SKILL_OVERRIDES，本批不重复配。
 * - 「宝石」不含骷髅（GoW 术语：Gem=色宝石，Skull=骷髅），随机宝石段 include:'color'。
 * - 「窃取 X 生命」= 伤害（drain 收尾治疗施法者）；「窃取护甲/攻击」= reduce + 同属性自身获得。
 * - 「减除全部护甲值」= reduce stat:'armor' + drainAll（取目标当前值）。
 */
import { skill, dmg, dmgAll, dmgSplash, armor, attack,
  cleanse, reduce, drainMana, steal, randomStat, inflict,
  explodeRandomGems, destroyRandomGems, destroyChosenRow, CHOSEN } from '../builders';
import type { CuratedBatch } from './index';

const SKIPPED: { id: number; reason: string }[] = [
  { id: 7004, reason: '已有手写 override（SKILL_OVERRIDES 保留既有行为）' },
  { id: 7132, reason: '已有手写 override（SKILL_OVERRIDES 保留既有行为）' },
  { id: 7155, reason: '已有手写 override（SKILL_OVERRIDES 保留既有行为）' },
  { id: 7161, reason: '「然后净化和治疗他」治疗量原文未给出，语义拿不准' },
  { id: 7319, reason: '「减除随机技能值」无对应削减原语（随机属性只支持获得）' },
  { id: 7348, reason: '「窃取生命，或窃取法力」二选一语义无法表达，语义拿不准' },
  { id: 7439, reason: '「拉至首位」隐匿/位置操作（不做清单）' },
  { id: 7534, reason: '「击至末位」隐匿/位置操作（不做清单）' },
  { id: 7740, reason: '缺失状态（狂怒）' },
  { id: 8027, reason: '「打乱敌方队伍顺序」隐匿/位置操作（不做清单）' },
];

const SPELLS: CuratedBatch['spells'] = [
  {
    id: 7016,
    desc: '摧毁 1 行，并对第 1 名敌人造成 [魔法 + 1] 点伤害。',
    build: skill(
      destroyChosenRow(),
      dmg('enemyFront', 1),
    ),
  },
  {
    id: 7026,
    desc: '对一名敌人造成 [魔法 + 3] 点伤害，并减除其 2 点攻击力',
    build: skill(
      dmg('enemyChosen', 3),
      reduce('enemyChosen', 'attack', 2, 0),
    ),
  },
  {
    id: 7028,
    desc: '净化一名盟友，并为他提供 [魔法 + 1] 点护甲值和屏障效果。',
    build: skill(
      cleanse('allyChosen'),
      armor('allyChosen', 1),
      inflict('barrier', 'allyChosen'),
    ),
  },
  {
    id: 7033,
    desc: '缠绕一名敌人并减除他 [魔法 + 1] 点护甲值。',
    build: skill(
      inflict('entangle', 'enemyChosen'),
      reduce('enemyChosen', 'armor', 1),
    ),
  },
  {
    id: 7048,
    desc: '对第 一名敌人造成 [魔法 + 2] 点伤害，并使其陷入沉默状态。',
    build: skill(
      dmg('enemyFront', 2),
      inflict('silence', 'enemyFront'),
    ),
  },
  {
    id: 7141,
    desc: '窃取所有敌人的 [魔法] 护甲值和 5 点攻击力。',
    build: skill(
      steal('enemyAll', 'armor', 'armor', 0, 1),
      steal('enemyAll', 'attack', 'attack', 5, 0),
    ),
  },
  {
    id: 7145,
    desc: '随机爆破 [魔法 + 3] 颗宝石并净化自身。',
    build: skill(
      explodeRandomGems(3, 1, 'color'),
      cleanse('allySelf'),
    ),
  },
  {
    id: 7153,
    desc: '对最后一名敌人造成 [魔法 + 5] 点伤害，并耗尽其法力值。',
    build: skill(
      dmg('enemyLast', 5),
      drainMana('enemyLast'),
    ),
  },
  {
    id: 7162,
    desc: '所有盟友获得 [魔法 + 1] 点随机技能值。',
    build: skill(
      randomStat('allyAll', 1),
    ),
  },
  {
    id: 7171,
    desc: '随机爆破 [魔法 + 2] 颗选定颜色的宝石。',
    build: skill(
      explodeRandomGems(2, 1, 'color', CHOSEN),
    ),
  },
  {
    id: 7175,
    desc: '减除一名敌人全部护甲值，并造成 [魔法 + 4] 点伤害。',
    build: skill(
      reduce('enemyChosen', 'armor', 0, 0, { drainAll: true }),
      dmg('enemyChosen', 4),
    ),
  },
  {
    id: 7208,
    desc: '对 2 名随机敌人造成 [魔法 + 2] 点轻微溅射伤害。',
    build: skill(
      dmgSplash('enemyRandomN', 2, 1, { n: 2 }),
    ),
  },
  {
    id: 7238,
    desc: '使 1 名敌人陷入中毒状态并造成 [魔法 + 2] 点伤害。',
    build: skill(
      inflict('poison', 'enemyChosen'),
      dmg('enemyChosen', 2),
    ),
  },
  {
    id: 7290,
    desc: '对 1 名敌人造成 [魔法 + 4] 点伤害，并将其燃烧。',
    build: skill(
      dmg('enemyChosen', 4),
      inflict('burning', 'enemyChosen'),
    ),
  },
  {
    id: 7302,
    desc: '窃取所有敌人 [魔法 + 5] 点生命值。',
    build: skill(
      dmg('enemyAll', 5, 1, { range: 'all', drain: true }),
    ),
  },
  {
    id: 7327,
    desc: '对 1 名敌人造成 [魔法 + 1] 点伤害并将其冻结。',
    build: skill(
      dmg('enemyChosen', 1),
      inflict('frozen', 'enemyChosen'),
    ),
  },
  {
    id: 7351,
    desc: '对 1 名敌人造成 [魔法 + 2] 点伤害并使其陷入织网状态。',
    build: skill(
      dmg('enemyChosen', 2),
      inflict('web', 'enemyChosen'),
    ),
  },
  {
    id: 7361,
    desc: '对 1 名敌人造成 [魔法 + 3] 点伤害并将之击晕。',
    build: skill(
      dmg('enemyChosen', 3),
      inflict('stun', 'enemyChosen'),
    ),
  },
  {
    id: 7362,
    desc: '对所有敌人造成 [魔法 + 2] 点伤害，再使他们陷入燃烧状态。',
    build: skill(
      dmgAll(2),
      inflict('burning', 'enemyAll'),
    ),
  },
  {
    id: 7390,
    desc: '随机爆破两颗宝石并获得 [魔法 + 1] 点随机技能值。',
    build: skill(
      explodeRandomGems(2, 0, 'color'),
      randomStat('allySelf', 1),
    ),
  },
  {
    id: 7401,
    desc: '给予其他盟友 [魔法 + 1] 点攻击力，但减除他们 1 点魔法值。',
    build: skill(
      attack('allyOthers', 1),
      // 「魔法值」= magic 属性（SOP 措辞裁定；与 7465 同口径）
      reduce('allyOthers', 'magic', 1, 0),
    ),
  },
  {
    id: 7418,
    desc: '对 3 名随机敌人造成 [魔法 + 1] 点伤害。',
    build: skill(
      dmg('enemyRandomN', 1, 1, { n: 3 }),
    ),
  },
  {
    id: 7462,
    desc: '摧毁 [魔法 + 1] 颗宝石并缠绕一名随机敌人。',
    build: skill(
      destroyRandomGems(1, 1, 'color'),
      inflict('entangle', 'enemyRandom'),
    ),
  },
  {
    id: 7548,
    desc: '对第一名敌人造成  [魔法 + 6] 点伤害，再使自己下潜。',
    build: skill(
      dmg('enemyFront', 6),
      inflict('submerged', 'allySelf'),
    ),
  },
  {
    id: 7561,
    desc: '增加一个盟友 [魔法 + 3] 点护甲值，赋予其屏障效果，并使其下潜。',
    build: skill(
      armor('allyChosen', 3),
      inflict('barrier', 'allyChosen'),
      inflict('submerged', 'allyChosen'),
    ),
  },
  {
    id: 7778,
    desc: '对所有敌人造成两次 [魔法 + 8] 点散射伤害。',
    build: skill(
      // 「对所有敌人…散射」：散射只是类型词，全体目标各自结算（SOP 措辞裁定）
      dmgAll(8),
      dmgAll(8),
    ),
  },
  {
    id: 7978,
    desc: '对最虚弱的敌人造成 [魔法 + 2] 点伤害，并使之陷入中毒状态。',
    build: skill(
      dmg('enemyWeakest', 2),
      inflict('poison', 'enemyWeakest'),
    ),
  },
  {
    id: 8128,
    desc: '对所有敌人造成  [魔法 + 2] 点伤害，并将他们击晕。',
    build: skill(
      dmgAll(2),
      inflict('stun', 'enemyAll'),
    ),
  },
  {
    id: 8278,
    desc: '窃取所有敌人 3 点魔法值，再对他们造成 [魔法 + 1] 伤害。',
    build: skill(
      // 「魔法值」= magic 属性（SOP 措辞裁定）
      steal('enemyAll', 'magic', 'magic', 3, 0),
      dmgAll(1),
    ),
  },
  {
    id: 8531,
    desc: '对所有敌人造成 [魔法 + 2] 点伤害，并使他们陷入出血状态。',
    build: skill(
      dmgAll(2),
      inflict('bleed', 'enemyAll'),
    ),
  },
];

export const BATCH_01: CuratedBatch = { batch: '01', spells: SPELLS, skipped: SKIPPED };
