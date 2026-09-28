/**
 * 人工核对组装 · 批次 04（池：scripts/curated-pools/pool-04.json）
 * 核对者：agent 批次04
 *
 * 语义裁定备注：
 * - 「散射伤害」→ dmgSplash('enemyChosen', …)（跟 batch-01 7778 金样本口径，含「对所有敌人…散射」句式）。
 * - 「移除/转换所有X宝石以增强…」句式：宝石操作段排在被增强段之前——destroyedGems/transformedGems
 *   来源只数「本技能前序段」（tests/unit/spellMechanics.test.ts「术士句式」同款）；
 *   来源不带色筛选，色限定由宝石操作段本身承担（同测试口径）。
 * - 「窃取 X 名敌人生命值」= 伤害段 + drain（batch-01 7302 同款）。
 * - 一个方括号喂双属性：「赋予 [魔法+1] 点生命值和护甲」= heal + armor 共用同一缩放值（9667/7027）。
 * - 「获得攻击力和护甲值，并移除所有X宝石以增强效果」：7027 原始 CountGems + 两个 UseCounterForAmount：护甲、攻击均按移除棕宝石数获得 [4:1] 加成
 *   （7027 以 native 步骤为准，不能套用单修饰段启发式）。
 * - 7025「赋予其屏障效果」的「其」= 前文盟友（自指会用「自己/自身」，如 7145「净化自身」）。
 */
import { skill, dmg, dmgAll, dmgSplash, heal, armor, attack, randomStat, inflict,
  createGems, transform, destroyColor, destroyRandomGems, destroyRandomCols,
  explodeRandomGems, summonRef } from '../builders';
import { BaseColor } from '../../types';
import type { CuratedBatch } from './index';

const SKIPPED: { id: number; reason: string }[] = [
  { id: 7031, reason: '特殊宝石（天使宝石）' },
  { id: 7039, reason: '「弄乱板面」无对应原语，隐匿/位置操作' },
  { id: 8819, reason: '「移除其法力颜色之一的所有宝石」为动态颜色（敌方法力色），无对应原语，语义拿不准' },
  { id: 8918, reason: '特殊宝石（灵力宝石）' },
  { id: 8919, reason: '缺失状态（反射）' },
  { id: 8921, reason: '特殊宝石（灵力宝石）' },
  { id: 8944, reason: '「对所有敌人造成造成半数伤害」数值口径未在规则手册覆盖（常数需凭空推导），语义拿不准' },
  { id: 9022, reason: '特殊宝石（善石像鬼宝石）' },
  { id: 9027, reason: '「或…或…」三选一语义无法表达，语义拿不准' },
  { id: 9258, reason: '「使其下方所有敌人」为位置操作，隐匿/位置操作' },
  { id: 9292, reason: '特殊宝石（鬼魂宝石）' },
  { id: 9664, reason: '缺失状态（附魔）' },
  { id: 9725, reason: '「爆破 2-4 颗宝石」数量区间无法表达，数值不明' },
  { id: 9906, reason: '「随机颜色的宝石」选色语义不明（随机单色 vs 随机宝石），语义拿不准' },
];

const SPELLS: CuratedBatch['spells'] = [
  {
    id: 7002,
    desc: '为所有盟友提供 [魔法] 点护甲值，并将所有红色宝石转换成绿色以增强效果。 [2:1]',
    build: skill(
      // 「以增强」句式：转化段先执行，transformedGems 来源才数得到（文件头备注）
      transform(BaseColor.Red, BaseColor.Green),
      armor('allyAll', 0, 1, { modifier: { mod: { kind: 'ratio', a: 2, b: 1 }, source: { kind: 'transformedGems' } } }),
    ),
  },
  {
    id: 7006,
    desc: '对所有敌人造成 [魔法 + 1] 点伤害。有 20% 几率燃烧一名敌人。',
    build: skill(
      dmgAll(1),
      inflict('burning', 'enemyRandom', { chance: 0.2 }), // sa-C r3: native CauseBurning@RandomEnemy 20%
    ),
  },
  {
    id: 7010,
    desc: '对 1 个敌人造成 [魔法] 点伤害，并移除所有紫色宝石以增强伤害效果。 [2:1]',
    build: skill(
      destroyColor(BaseColor.Purple),
      dmg('enemyChosen', 0, 1, { modifier: { mod: { kind: 'ratio', a: 2, b: 1 }, source: { kind: 'destroyedGems' } } }),
    ),
  },
  {
    id: 7011,
    desc: "对 1 名敌人造成 [魔法 + 3] 点伤害。如果该敌人身亡，自身一项随机属性获得 6 点。",
    build: skill(
      dmg('enemyChosen', 3),
      randomStat('allySelf', 6, 0, { ifTargetDied: true, oneSkill: true }),
    ),
  },
  {
    id: 7017,
    desc: '给予 1 名盟友 [魔法] 点攻击力，并移除所有蓝色宝石以增强效果。 [1:1]',
    build: skill(
      destroyColor(BaseColor.Blue),
      attack('allyChosen', 0, 1, { modifier: { mod: { kind: 'ratio', a: 1, b: 1 }, source: { kind: 'destroyedGems' } } }),
    ),
  },
  {
    id: 7024,
    desc: '对 1 个敌人造成 [魔法 + 1] 点伤害，并移除所有绿色宝石以增强伤害效果。 [3:1]',
    build: skill(
      // sa-F2 fix round A (R001): native CountGems Green ; Damage ; RemoveColor Green
      dmg('enemyChosen', 1, 1, { modifier: { mod: { kind: 'ratio', a: 3, b: 1 }, source: { kind: 'boardGems', color: BaseColor.Green } } }),
      destroyColor(BaseColor.Green),
    ),
  },
  {
    id: 7025,
    desc: '给予盟友 5 点生命值，并恢复  [魔法 + 1]  点生命值。赋予其屏障效果，并创造 8 颗绿色宝石。',
    build: skill(
      heal('allyChosen', 5, 0),
      heal('allyChosen', 1), // Native Heal Target=FromTarget: same selected Ally as the Life gain.
      // sa-F2 fix round A (R001): native CreateGems 8 Green before CauseBarrier@FromTarget
      createGems(BaseColor.Green, 8, 0),
      inflict('barrier', 'allyChosen'), // 「其」= 前文盟友
    ),
  },
  {
    id: 7027,
    desc: '获得 [魔法] 点攻击力和护甲值，并移除所有棕色宝石以增强效果。 [4:1]',
    build: skill(
      destroyColor(BaseColor.Brown),
      armor('allySelf', 0, 1, { modifier: { mod: { kind: 'ratio', a: 4, b: 1 }, source: { kind: 'destroyedGems', color: BaseColor.Brown } } }),
      attack('allySelf', 0, 1, { modifier: { mod: { kind: 'ratio', a: 4, b: 1 }, source: { kind: 'destroyedGems', color: BaseColor.Brown } } }),
    ),
  },
  {
    id: 7029,
    desc: '对 1 名敌人造成 [魔法] 点伤害，伤害值因自身的护甲值而增强。 [1:1]',
    build: skill(
      dmg('enemyChosen', 0, 1, { modifier: { mod: { kind: 'ratio', a: 1, b: 1 }, source: { kind: 'selfStat', stat: 'armor' } } }),
    ),
  },
  {
    id: 7030,
    desc: '对最健康的敌人造成 [魔法 + 3] 点伤害。若自身的生命值受损，则可多造成 8 点伤害。',
    build: skill(
      // 回收：condBonus 现支持「+N 点」条件加成（SOP「通用条件触发 / 条件加成」节）；
      // selfHpDamaged 为全局条件、整段判定（SOP 示例同款）
      dmg('enemyHealthiest', 3, 1, { condBonus: { n: 8, cond: { kind: 'selfHpDamaged' } } }),
    ),
  },
  {
    id: 8793,
    desc: '创造 10 颗棕色宝石。再爆破 [魔法 + 1] 颗宝石。',
    build: skill(
      createGems(BaseColor.Brown, 10, 0),
      explodeRandomGems(1, 1, 'all'),
    ),
  },
  {
    id: 8833,
    desc: '对最后一个敌人造成[魔法 + 4]点伤害。创造7颗红色宝石。',
    build: skill(
      dmg('enemyLast', 4),
      createGems(BaseColor.Red, 7, 0),
    ),
  },
  {
    id: 8840,
    desc: '对一名敌人造成 [魔法 + 3] 点轻微溅射伤害，并摧毁 3 颗随机宝石。',
    build: skill(
      dmgSplash('enemyChosen', 3),
      // native DestroyGems 3 (colourless): any gem incl. Skulls (R013-5)
      destroyRandomGems(3, 0, 'all'),
    ),
  },
  {
    id: 8957,
    desc: '随机摧毁 8 颗宝石。使首位盟友获得屏障。',
    build: skill(
      destroyRandomGems(8, 0, 'all'), // English 'Destroy 8 random Gems' (native DestroyColor 8, no colour): any gem (R013-5)
      inflict('barrier', 'allyFront'),
    ),
  },
  {
    id: 8959,
    desc: '对所有敌人造成 [魔法 + 6] 点散射伤害。获得 5 点护甲值。',
    build: skill(
      // 「对所有敌人…散射」：散射只是类型词，全体目标各自结算（SOP 措辞裁定）
      dmg('enemyAll', 6, 1, { range: 'all' }),
      armor('allySelf', 5, 0),
    ),
  },
  {
    id: 9016,
    desc: '窃取 4 名随机敌人 [魔法 + 2] 点生命值，并召唤莫桑尼的意志。',
    // 原生 StealLife@RandomEnemy + 3 × StealLife@RandomPrefNotPrevEnemy：每步只避开上一目标，可回到更早目标
    // （R007-3；sa-H：原为 4 名不重复随机敌人）
    build: skill(
      dmg('enemyRandom', 2, 1, { drain: true }),
      dmg('enemyRandomPrefNotPrev', 2, 1, { drain: true }),
      dmg('enemyRandomPrefNotPrev', 2, 1, { drain: true }),
      dmg('enemyRandomPrefNotPrev', 2, 1, { drain: true }),
      summonRef('MorthanisWill', 6205),
    ),
  },
  {
    id: 9020,
    desc: '摧毁 8 颗宝石。再对一名敌人造成 [魔法 + 2] 点伤害。',
    build: skill(
      destroyRandomGems(8, 0, 'all'), // native DestroyGems 8: any gem (R013-5)
      dmg('enemyChosen', 2),
    ),
  },
  {
    id: 9028,
    desc: '对所有敌人造成 [(魔法 / 2) + 2] 点散射伤害。',
    build: skill(
      dmg('enemyAll', 2, 0.5, { range: 'all' }),
    ),
  },
  {
    id: 9061,
    desc: '将所有棕色宝石转换成骷髅头。给予一名盟友 [魔法 + 1] 点护甲值。',
    build: skill(
      // 回收：transform 端点现支持 'SKULL'（SOP 措辞裁定，batch-05 7135 / batch-07 头注同款）
      transform(BaseColor.Brown, 'SKULL'),
      armor('allyChosen', 1),
    ),
  },
  {
    id: 9250,
    desc: '随机摧毁 3 个列。',
    build: skill(
      destroyRandomCols(3, 0),
    ),
  },
  {
    id: 9667,
    desc: '为最弱的盟友赋予[魔法 + 1]点生命值和护甲。然后为他们设置屏障。',
    build: skill(
      // sa-C r9 native: IncreaseArmor@WeakestAlly -> IncreaseHealth@FromPrevious -> CauseBarrier@FromPrevious
      armor('allyWeakest', 1),
      heal('lastTarget', 1),
      inflict('barrier', 'lastTarget'),
    ),
  },
  {
    id: 9937,
    desc: '击晕所有敌人。然后对3个随机敌人造成[魔法 + 5]点溅射伤害。',
    build: skill(
      inflict('stun', 'enemyAll'),
      dmgSplash('enemyRandomN', 5, 1, { n: 3 }),
    ),
  },
];

export const BATCH_04: CuratedBatch = { batch: '04', spells: SPELLS, skipped: SKIPPED };
