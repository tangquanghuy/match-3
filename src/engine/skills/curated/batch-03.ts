/**
 * 人工核对组装 · 批次 03（池：scripts/curated-pools/pool-03.json）
 * 核对者：agent 批次03
 *
 * 语义裁定备注：
 * - 「摧毁/爆破 N 颗宝石」（无颜色、无选定字样）→ 随机宝石段 include:'color'
 *   （宝石不含骷髅；batch-04 9020「摧毁 8 颗宝石」同款）。
 * - 「爆破一列」→ explodeChosenCol（batch-01 7016「摧毁 1 行」→ chosen 同款，无随机字样）。
 * - 「窃取 X 点生命值」= 伤害段 + drain（batch-01 7302 / batch-04 9016 同款）；
 *   「窃取 X 点攻击力/魔法值」= steal 同属性自身获得（batch-01 7141 同款）。
 * - 一个方括号喂双段：「获得护甲值和生命值」= armor + heal 共用同一缩放值
 *   （batch-04 9667「生命值和护甲」同款）。
 * - 「有 10% 的几率处死敌人」= execute 段挂 chance:0.1（概率只辖所在子句，spell-rules.md §2）。
 * - 「出血 bleed」在状态白名单内（tests/unit/spellData.test.ts STATUS_WHITELIST + batch-01 8531 同款）。
 * - 「随机女巫」不是种族（troopTypes 无 Witch）→ 按名称含「女巫」的兵种 referenceName
 *   列表做 summonRandom（排除「女巫猎人」——猎人不是女巫）。
 */
import { skill, dmg, dmgAll, dmgSplash, trueDmg, heal, armor, attack,
  cleanse, reduce, steal, createGems, transform, destroyChosenRow,
  explodeChosenCol, destroyRandomGems, explodeRandomGems, explodeColor,
  inflict, summonRandom } from '../builders';
import { BaseColor } from '../../types';
import type { CuratedBatch } from './index';

const SKIPPED: { id: number; reason: string }[] = [
  { id: 7373, reason: '「转化为一只随机龙族」兵种转化无对应原语，语义拿不准' },
  { id: 7378, reason: '「随机单色的宝石」选色语义不明（随机单色 vs 随机宝石），语义拿不准' },
  { id: 7555, reason: '「使他们交换位置」隐匿/位置操作（不做清单）' },
  { id: 7673, reason: '「只能施放一次」施法限制无对应原语，语义拿不准' },
  { id: 7751, reason: '「有 30% 的几率跑掉」跑掉无对应机制，语义拿不准' },
  { id: 8020, reason: '「将其拉至首位」隐匿/位置操作（不做清单）' },
  { id: 8196, reason: '「有 30%  的几率跑掉」跑掉无对应机制，语义拿不准' },
  { id: 8205, reason: '「以 X 形摧毁宝石」无对应原语，语义拿不准' },
  { id: 8250, reason: '「或…或…」三选一语义无法表达，语义拿不准' },
  { id: 8252, reason: '「或…或…」三选一无法表达，且「打乱板面」为位置操作，语义拿不准' },
  { id: 8387, reason: '「赋予其一半的法力值」口径不明（语义拿不准），且「祝福」为缺失状态' },
    { id: 8428, reason: '「陷入 3 个随机状态效果」随机状态无对应原语，语义拿不准' },
  { id: 8483, reason: '「击回末位」隐匿/位置操作（不做清单）' },
  { id: 8557, reason: '特殊宝石（黄龙宝石）' },
  { id: 8627, reason: '特殊宝石（元素星）' },
];

const SPELLS: CuratedBatch['spells'] = [
  {
    id: 7367,
    desc: '击晕一名敌人并耗掉其 7 点法力值。获得 [魔法 + 1] 点攻击力。',
    build: skill(
      // 「其」= 同句前文敌人（batch-01 7033 同款）
      inflict('stun', 'enemyChosen'),
      reduce('enemyChosen', 'mana', 7, 0),
      attack('allySelf', 1),
    ),
  },
  {
    id: 7384,
    desc: '爆破一列。对所有敌人造成 [魔法 + 3] 点伤害。',
    build: skill(
      explodeChosenCol(),
      dmgAll(3),
    ),
  },
  {
    id: 7537,
    desc: '对一名敌人造成 [魔法 + 2] 点伤害。创造 7 颗紫色宝石。',
    build: skill(
      dmg('enemyChosen', 2),
      createGems(BaseColor.Purple, 7, 0),
    ),
  },
  {
    id: 7557,
    desc: '对一名敌人造成 [魔法 + 3] 点溅射伤害。再使自己下潜。',
    build: skill(
      // 「对 1 名敌人…溅射」才是溅射链（SOP 措辞裁定）
      dmgSplash('enemyChosen', 3),
      inflict('submerged', 'allySelf'),
    ),
  },
  {
    id: 7628,
    desc: '给自身增加 [魔法 + 5] 点生命值和屏障，再对 1 名敌人造成 8 点伤害。',
    build: skill(
      heal('allySelf', 5),
      inflict('barrier', 'allySelf'),
      dmg('enemyChosen', 8, 0),
    ),
  },
  {
    id: 7649,
    desc: '爆破 18 颗板面上的宝石。对所有敌人造成 [魔法 + 5] 点伤害。',
    build: skill(
      // 无颜色/选定字样 → 随机色宝石（文件头备注）
      explodeRandomGems(18, 0, 'color'),
      dmgAll(5),
    ),
  },
  {
    id: 7734,
    desc: '爆破所有红色宝石。净化所有盟友，并给予他们 [魔法 + 1] 生命值。',
    build: skill(
      explodeColor(BaseColor.Red),
      cleanse('allyAll'),
      heal('allyAll', 1),
    ),
  },
  {
    id: 7738,
    desc: '摧毁一行。对前两名敌人造成 [魔法 + 3] 点伤害。',
    build: skill(
      destroyChosenRow(),
      dmg('enemyFirstN', 3, 1, { n: 2 }),
    ),
  },
  {
    id: 7748,
    desc: '窃取最虚弱的两名敌人 [魔法 + 3] 点生命值，并窃取最强大的两名敌人 8 点魔法值。',
    build: skill(
      // 「窃取生命」= 伤害 + drain；「窃取魔法值」= steal 同属性（文件头备注）
      dmg('enemyWeakestN', 3, 1, { n: 2, drain: true }),
      steal('enemyHealthiestN', 'mana', 'mana', 8, 0, { n: 2 }),
    ),
  },
  {
    id: 7760,
    desc: '对最后一名敌人造成 [魔法 + 2] 点伤害。创造 7 颗蓝色宝石。',
    build: skill(
      dmg('enemyLast', 2),
      createGems(BaseColor.Blue, 7, 0),
    ),
  },
  {
    id: 7789,
    desc: '对一名敌人造成 [魔法 + 4] 点伤害。有 10% 的几率处死敌人。',
    build: skill(
      dmg('enemyChosen', 4),
      // 「处死」= 即杀，概率只辖本子句（spell-rules.md §2 + SOP 措辞裁定）
      dmg('enemyChosen', 0, 0, { execute: true, chance: 0.1 }),
    ),
  },
  {
    id: 7927,
    desc: '对一名敌人造成 [魔法 + 2] 点伤害。爆破 2 颗蓝色宝石。',
    build: skill(
      dmg('enemyChosen', 2),
      explodeRandomGems(2, 0, 'color', BaseColor.Blue),
    ),
  },
  {
    id: 7931,
    desc: '爆破 4 颗宝石。窃取第一名敌人 [魔法 + 1] 点攻击力。',
    build: skill(
      explodeRandomGems(4, 0, 'color'),
      steal('enemyFront', 'attack', 'attack', 1, 0),
    ),
  },
  {
    id: 8022,
    desc: '摧毁 8 颗宝石。对第一位敌人造成 [魔法 + 3] 点伤害。',
    build: skill(
      // batch-04 9020 同款句式 → 随机宝石
      destroyRandomGems(8, 0, 'color'),
      dmg('enemyFront', 3),
    ),
  },
  {
    id: 8033,
    desc: '将绿色宝石转换成骷髅头。给予第一位盟友 [魔法 + 1] 点生命值。',
    build: skill(
      // transform 两端可为 'SKULL'（SOP 措辞裁定）
      transform(BaseColor.Green, 'SKULL'),
      heal('allyFront', 1),
    ),
  },
  {
    id: 8112,
    desc: '对 2 个随机敌人造成 [魔法 + 3] 点伤害，再击晕他们并使他们陷入中毒状态。',
    build: skill(
      dmg('enemyRandomN', 3, 1, { n: 2 }),
      inflict('stun', 'enemyRandomN', { n: 2 }),
      inflict('poison', 'enemyRandomN', { n: 2 }),
    ),
  },
  {
    id: 8126,
    desc: '对第一位和最后一位敌人造成  [魔法 + 4] 点伤害，再使其陷入出血状态。',
    build: skill(
      // 「第一位和最后一位」= 两段各自结算，共用同一方括号（batch-01 7778 同款）
      dmg('enemyFront', 4),
      dmg('enemyLast', 4),
      // 「其」承接前文两位目标（batch-04 7025「其」=前文目标同款）
      inflict('bleed', 'enemyFront'),
      inflict('bleed', 'enemyLast'),
    ),
  },
  {
    id: 8288,
    desc: '对 6 名随机敌人造成 [(魔法 / 2) + 4] 点伤害。',
    build: skill(
      dmg('enemyRandomN', 4, 0.5, { n: 6 }),
    ),
  },
  {
    id: 8372,
    desc: '耗掉所有敌人 4 点法力值。获得 [魔法 + 1] 点护甲值和生命值。',
    build: skill(
      reduce('enemyAll', 'mana', 4, 0),
      // 一个方括号喂双属性（batch-04 9667 同款）
      armor('allySelf', 1),
      heal('allySelf', 1),
    ),
  },
  {
    id: 8425,
    desc: '对最后一位敌人造成 [魔法 + 6] 点伤害。创造 7 颗黄色宝石。',
    build: skill(
      dmg('enemyLast', 6),
      createGems(BaseColor.Yellow, 7, 0),
    ),
  },
  {
    id: 8685,
    desc: '摧毁一行。对末位敌人造成 [魔法 + 2] 点真实伤害，再使自身下潜。',
    build: skill(
      destroyChosenRow(),
      trueDmg('enemyLast', 2),
      inflict('submerged', 'allySelf'),
    ),
  },
  {
    id: 8689,
    desc: '对一名敌人造成 [魔法 + 4] 点真实伤害，再召唤一名随机女巫。',
    build: skill(
      trueDmg('enemyChosen', 4),
      // 「女巫」非种族，按名称族列表（文件头备注；排除「女巫猎人」）
      summonRandom(['Hag', 'FrostfireWitch', 'HornedHag', 'LightbornEnchantress', 'CourtWitch', 'DarkWitch', 'DuskWitch']),
    ),
  },
  {
    id: 8738,
    desc: ' 将绿色宝石转换成骷髅头。',
    build: skill(
      transform(BaseColor.Green, 'SKULL'),
    ),
  },
  {
    id: 8739,
    desc: '对所有敌人造成 [(魔法 / 2) + 4] 点伤害。',
    build: skill(
      dmgAll(4, 0.5),
    ),
  },
];

export const BATCH_03: CuratedBatch = { batch: '03', spells: SPELLS, skipped: SKIPPED };
