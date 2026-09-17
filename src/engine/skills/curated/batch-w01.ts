/**
 * 窗口 K-B · 武器法术批次 W01（池：scripts/curated-pools/pool-w01.json）。
 *
 * 来源：artifacts/gowhead-weapons/weapons.json（zh 文本逐字锚定，校验见
 * tests/unit/weaponSpellAudit.test.ts——与部队批次的 troops.json 锚定不同源）。
 * 组装规则全部锚定 scripts/spell-rules.md 与既有部队批次先例（详见各 skipped 原因
 * 与 artifacts/weapon-spell-triage.md 的家族分布/原语请求节）。
 * 生成器：scripts/_weapon_pools.mjs gen（规则表 + 人工裁定；机器不猜语义）。
 */
import { armor, attack, cleanse, createGems, createStorm, destroyChosenCol, destroyChosenRow, destroyColor, destroyRandomGems, destroySkulls, dmg, dmgSplash, drainMana, explodeRandomGems, extraTurn, flat, gainSouls, heal, inflict, magic, randomStat, reduce, reposition, scale, shuffleBoard, skill, steal, summonRandom, trueDmg, CHOSEN } from '../builders';
import { BaseColor } from '../../types';
import type { CuratedBatch } from './index';

const SKIPPED: { id: number; reason: string }[] = [
  { id: 7071, reason: '译文异常（模板占位符 {N} 未填充）' },
  { id: 7117, reason: '未识别子句「如果有 1 名敌人身亡，则创造 7 颗骷髅头」（「有 N 名敌人身亡」为任意阵亡口径，与 ifTargetDied（追踪主目标）不一致（语义拿不准）→ 原语请求：anyEnemyDied 条件）' },
  { id: 7129, reason: '译文异常（模板占位符 {N} 未填充）' },
  { id: 7178, reason: '未识别子句「对第一名敌人造成 [魔法 + 2] 点伤害，同时每摧毁一颗蓝色宝石则增加 2 点伤害」（伤害句残留无法解析「同时每摧毁一颗蓝色宝石则增加 2 点伤害」）' },
  { id: 7188, reason: '未识别子句「使 1 名盟友的护甲值翻倍」（「使护甲值翻倍」无对应原语（减半有 halve、翻倍无）→ 原语请求：stat 翻倍 buff）' },
  { id: 7190, reason: '未识别子句「对 1 名敌人造成等同于其攻击力的伤害」（「等同于其攻击力的伤害」基数取目标属性无对应原语 → 原语请求：dmg base = targetStat）' },
  { id: 7192, reason: '未识别子句「如果对方攻击力大于自身，则造成多 12 点伤害」（无匹配规则）' },
  { id: 7194, reason: '未识别子句「减除一名敌人全部护甲值，在使其中毒，或造成 [魔法 + 2] 点伤害」（无匹配规则）' },
  { id: 7199, reason: '未识别子句「使 1 名盟友的攻击力翻倍，并为其提供 [魔法 + 1] 点生命值」（「使攻击力翻倍」无对应原语（减半有 halve、翻倍无）→ 原语请求：stat 翻倍 buff）' },
  { id: 7204, reason: '未识别子句「创造 8 颗指定盟友的法力颜色的宝石」（创造目标无法识别「指定盟友的法力颜」）' },
  { id: 7217, reason: '未识别子句「爆破一颗宝石，并摧毁该行」（「摧毁该行」绑定被爆破宝石的位置，无对应清除原语 → 原语请求：clear line-of-gem）' },
  { id: 7240, reason: '未识别子句「对 1 名敌人造成 [魔法 + 6] 点伤害，并随机窃取 5 点能力值」（伤害句残留无法解析「并随机窃取 5 点能力值」）' },
  { id: 7241, reason: '未识别子句「每有一名盖塔尔盟友，则创造 6 颗宝石，所创造的宝石混合紫色和棕色两种颜色」（按王国（盖塔尔）计数无对应来源 kind（batch-08 8365 / batch-15 8723 同款）→ 原语请求：kingdom 计数）' },
  { id: 7244, reason: '未识别子句「从每名敌人身上窃取 1 点随机技能值」（随机属性削减无对应原语（batch-01 7319 同款））' },
  { id: 7247, reason: '未识别子句「获得等同于减除的护甲值的攻击力」（增益数值无法解析「等同于减除的护甲值的攻击力」）' },
  { id: 7250, reason: '未识别子句「对所有敌人造成 [魔法 + 2] 点伤害，伤害值因敌我双方的黄色军队数量而增强」（修饰来源无法解析「敌我双方的黄色军队数量」）' },
  { id: 7286, reason: '未识别子句「如果现有尘风暴，则移除所有绿色的宝石」（风暴条件 payload：条件子句内含不支持 opts 挂载的段（destroyColor(BaseColor.Green)…）→ 原语请求：条件化清除段/条件化原始段）' },
  { id: 7293, reason: '未识别子句「有 20% 的几率吞噬一名随机敌人」（无匹配规则）' },
  { id: 7294, reason: '未识别子句「如果敌人身亡，所有技能值增加 10 点」（无匹配规则）' },
  { id: 7295, reason: '未识别子句「将一名军队拉到首位」（无匹配规则）' },
  { id: 7304, reason: '未识别子句「有 50% 的几率获得下列其一：20 个灵魂、100 黄金或 1 张藏宝图」（无匹配规则）' },
  { id: 7308, reason: '未识别子句「对 1 名敌人造成 [魔法 + 5] 点伤害，移除所有该军队法力颜色的宝石来强化此效果」（伤害句残留无法解析「移除所有该军队法力颜色的宝石来强化此效果」）' },
  { id: 7380, reason: '未识别子句「有 10% 的机率直接杀死敌人，如果敌人已中毒，机率将增加至 20%」（无匹配规则）' },
  { id: 7412, reason: '未识别子句「对 1 名敌人施放法力灼烧，伤害值因自身魔法值而增强」（数值公式无法解析）' },
  { id: 7414, reason: '未识别子句「给予一名盟友 [魔法 + 1] 点随机技能值，然后赋予其屏障效果并给予 3 - 15 点法力值」（数值型区间（§9.8：数值不明）不做）' },
  { id: 7445, reason: '未识别子句「伤害值因敌我双方的巨人军队数而增强」（修饰来源无法解析「敌我双方的巨人军队数」）' },
  { id: 7446, reason: '缺失状态（法印，不在 spell-rules §6 状态词表，batch-03 8387 / batch-04 8919 同款）' },
  { id: 7447, reason: '未识别子句「随机摧毁 5 颗宝石，摧毁数因收集到的黄金数量而增强」（无匹配规则）' },
  { id: 7491, reason: '缺失状态（法印，不在 spell-rules §6 状态词表，batch-03 8387 / batch-04 8919 同款）' },
  { id: 7492, reason: '未识别子句「给予所有黄色盟友 5 点攻击力」（按法力色限定盟友目标无对应 TargetMode（batch-14 8465 同款）→ 原语请求：allyOfColor 目标）' },
  { id: 7531, reason: '未识别子句「召唤一名随机的厄什卡军队」（群体名称无法可靠映射到种族/王国「厄什卡」（语义拿不准））' },
  { id: 7567, reason: '未识别子句「对最后一名敌人转化成一只为法力值满额的幼龙」（数值公式无法解析）' },
  { id: 7568, reason: '未识别子句「敌我双方每有一名棕色军队则爆破一颗随机棕色宝石」（无匹配规则）' },
  { id: 7624, reason: '缺失状态（法印，不在 spell-rules §6 状态词表，batch-03 8387 / batch-04 8919 同款）' },
  { id: 7625, reason: '未识别子句「使所有神祇军队陷入死亡标记状态和所有骑士陷入疾病状态」（状态目标无法解析「使所有神祇军队陷入死亡标记状态和所有骑士陷入疾病状态」）' },
  { id: 7654, reason: '缺失状态（法印，不在 spell-rules §6 状态词表，batch-03 8387 / batch-04 8919 同款）' },
];

const SPELLS: CuratedBatch['spells'] = [
  {
    id: 7064,
    desc: '对第一名敌人造成 [(魔法 / 2) + 5] 点伤害。',
    build: skill(
      dmg('enemyFront', 5, 0.5),
    ),
  },
  {
    id: 7066,
    desc: '对第 1 名敌人造成 [(魔法 / 2) + 3] 点伤害。',
    build: skill(
      dmg('enemyFront', 3, 0.5),
    ),
  },
  {
    id: 7067,
    desc: '对 1 名敌人造成 [(魔法 / 2) + 4] 点伤害。',
    build: skill(
      dmg('enemyChosen', 4, 0.5),
    ),
  },
  {
    id: 7068,
    desc: '对 1 名随机的敌人造成 [(魔法 / 2) + 6] 点伤害。',
    build: skill(
      dmg('enemyRandomN', 6, 0.5, { n: 1 }),
    ),
  },
  {
    id: 7069,
    desc: '对所有敌人造成 [(魔法 / 2) + 6] 点散射伤害。',
    build: skill(
      dmg('enemyAll', 6, 0.5, { range: 'all' }),
    ),
  },
  {
    id: 7070,
    desc: '对第一名敌人造成 [(魔法 / 2) + 4] 点轻微溅射伤害。',
    build: skill(
      dmgSplash('enemyFront', 4, 0.5, { range: 'splash' }),
    ),
  },
  {
    id: 7072,
    desc: '对最后一名敌人造成 [魔法 + 6] 点伤害。',
    build: skill(
      dmg('enemyLast', 6, 1),
    ),
  },
  {
    id: 7073,
    desc: '对最健康的敌人造成 [魔法 + 6] 点伤害。',
    build: skill(
      dmg('enemyHealthiest', 6, 1),
    ),
  },
  {
    id: 7074,
    desc: '对 1 名随机的敌人造成 [魔法 + 3] 点伤害，并移除所有红色宝石以增强伤害效果。',
    build: skill(
      destroyColor(BaseColor.Red),
      dmg('enemyRandomN', 3, 1, { n: 1 }),
    ),
  },
  {
    id: 7075,
    desc: '对最虚弱的敌人造成 [魔法 + 6] 点伤害。',
    build: skill(
      dmg('enemyWeakest', 6, 1),
    ),
  },
  {
    id: 7076,
    desc: '对第一名敌人造成 [魔法 + 6] 点伤害。',
    build: skill(
      dmg('enemyFront', 6, 1),
    ),
  },
  {
    id: 7077,
    desc: '对 1 名敌人造成 [魔法 + 3] 点真实伤害。',
    build: skill(
      trueDmg('enemyChosen', 3, 1, { trueDamage: true }),
    ),
  },
  {
    id: 7078,
    desc: '对 1 名随机的敌人造成 [魔法 + 5] 点真实伤害。',
    build: skill(
      trueDmg('enemyRandomN', 5, 1, { trueDamage: true, n: 1 }),
    ),
  },
  {
    id: 7079,
    desc: '摧毁 1 颗宝石。',
    build: skill(
      destroyRandomGems(1, 0, 'color', undefined),
    ),
  },
  {
    id: 7080,
    desc: '对 1 名敌人造成 [魔法 + 5] 点伤害。',
    build: skill(
      dmg('enemyChosen', 5, 1),
    ),
  },
  {
    id: 7081,
    desc: '对 1 个随机的敌人造成 3 到 [魔法 + 10] 点伤害。',
    build: skill(
      dmg('enemyRandomN', 0, 0, { rangeSpec: { min: flat(3), max: scale(10, 1) }, n: 1 }),
    ),
  },
  {
    id: 7082,
    desc: '对一名敌人造成 [魔法 + 4] 点轻微溅射伤害。',
    build: skill(
      dmgSplash('enemyChosen', 4, 1, { range: 'splash' }),
    ),
  },
  {
    id: 7083,
    desc: '对第一名敌人造成 [魔法 + 6] 点伤害。',
    build: skill(
      dmg('enemyFront', 6, 1),
    ),
  },
  {
    id: 7084,
    desc: '对所有敌人造成 [魔法 + 1] 点伤害。',
    build: skill(
      dmg('enemyAll', 1, 1, { range: 'all' }),
    ),
  },
  {
    id: 7085,
    desc: '对 1 名随机的敌人造成 [魔法 + 7] 点伤害。',
    build: skill(
      dmg('enemyRandomN', 7, 1, { n: 1 }),
    ),
  },
  {
    id: 7086,
    desc: '对所有敌人造成 [魔法 + 6] 点散射伤害。',
    build: skill(
      dmg('enemyAll', 6, 1, { range: 'all' }),
    ),
  },
  {
    id: 7087,
    desc: '对最后一名敌人造成 [魔法 + 8] 点伤害。',
    build: skill(
      dmg('enemyLast', 8, 1),
    ),
  },
  {
    id: 7088,
    desc: '对最健康的敌人造成 [魔法 + 8] 点伤害。',
    build: skill(
      dmg('enemyHealthiest', 8, 1),
    ),
  },
  {
    id: 7089,
    desc: '对第一名敌人造成 [魔法 + 5] 点伤害，并移除所有红色宝石以增强伤害效果。',
    build: skill(
      destroyColor(BaseColor.Red),
      dmg('enemyFront', 5, 1),
    ),
  },
  {
    id: 7090,
    desc: '对最虚弱的敌人造成 [魔法 + 8] 点伤害。',
    build: skill(
      dmg('enemyWeakest', 8, 1),
    ),
  },
  {
    id: 7091,
    desc: '对第一名敌人造成 [魔法 + 8] 点伤害。',
    build: skill(
      dmg('enemyFront', 8, 1),
    ),
  },
  {
    id: 7092,
    desc: '对 1 名敌人造成 [魔法 + 5] 点真实伤害。',
    build: skill(
      trueDmg('enemyChosen', 5, 1, { trueDamage: true }),
    ),
  },
  {
    id: 7093,
    desc: '对 1 名随机的敌人造成 [魔法 + 7] 点真实伤害。',
    build: skill(
      trueDmg('enemyRandomN', 7, 1, { trueDamage: true, n: 1 }),
    ),
  },
  {
    id: 7094,
    desc: '爆破一颗宝石。',
    build: skill(
      explodeRandomGems(1, 0, 'color', undefined),
    ),
  },
  {
    id: 7095,
    desc: '对 1 名敌人造成 [魔法 + 7] 点伤害。',
    build: skill(
      dmg('enemyChosen', 7, 1),
    ),
  },
  {
    id: 7096,
    desc: '对第一名敌人造成 3 到 [魔法 + 12] 点伤害。',
    build: skill(
      dmg('enemyFront', 0, 0, { rangeSpec: { min: flat(3), max: scale(12, 1) } }),
    ),
  },
  {
    id: 7097,
    desc: '对一名敌人造成 [魔法 + 6] 点轻微溅射伤害。',
    build: skill(
      dmgSplash('enemyChosen', 6, 1, { range: 'splash' }),
    ),
  },
  {
    id: 7098,
    desc: '对第一名敌人造成 [魔法 + 8] 点伤害。',
    build: skill(
      dmg('enemyFront', 8, 1),
    ),
  },
  {
    id: 7099,
    desc: '对所有敌人造成 [魔法 + 2] 点伤害。',
    build: skill(
      dmg('enemyAll', 2, 1, { range: 'all' }),
    ),
  },
  {
    id: 7100,
    desc: '对 1 名随机的敌人造成 [魔法 + 9] 点伤害。',
    build: skill(
      dmg('enemyRandomN', 9, 1, { n: 1 }),
    ),
  },
  {
    id: 7101,
    desc: '对所有敌人造成 [魔法 + 8] 点散射伤害。',
    build: skill(
      dmg('enemyAll', 8, 1, { range: 'all' }),
    ),
  },
  {
    id: 7102,
    desc: '对最后一名敌人造成 [魔法 + 3] 点伤害，并移除所有紫色宝石以增强伤害效果。 [3:1]',
    build: skill(
      destroyColor(BaseColor.Purple),
      dmg('enemyLast', 3, 1, { modifier: { mod: { kind: 'ratio', a: 3, b: 1 } } }),
    ),
  },
  {
    id: 7103,
    desc: '对最健康的敌人造成 [魔法 + 4] 点伤害，并移除所有蓝色宝石以增强伤害效果。 [2:1]',
    build: skill(
      destroyColor(BaseColor.Blue),
      dmg('enemyHealthiest', 4, 1, { modifier: { mod: { kind: 'ratio', a: 2, b: 1 } } }),
    ),
  },
  {
    id: 7104,
    desc: '对最虚弱的敌人造成 [魔法 + 2] 点伤害，并移除所有棕色宝石以增强伤害效果。 [3:1]',
    build: skill(
      destroyColor(BaseColor.Brown),
      dmg('enemyWeakest', 2, 1, { modifier: { mod: { kind: 'ratio', a: 3, b: 1 } } }),
    ),
  },
  {
    id: 7105,
    desc: '对第一名敌人造成 [魔法 + 4] 点伤害，并移除所有黄色宝石以增强伤害效果。 [3:1]',
    build: skill(
      destroyColor(BaseColor.Yellow),
      dmg('enemyFront', 4, 1, { modifier: { mod: { kind: 'ratio', a: 3, b: 1 } } }),
    ),
  },
  {
    id: 7106,
    desc: '对 1 名敌人造成 [魔法 + 3] 点真实伤害。',
    build: skill(
      trueDmg('enemyChosen', 3, 1, { trueDamage: true }),
    ),
  },
  {
    id: 7107,
    desc: '对 1 名随机的敌人造成 [魔法 + 4] 点真实伤害。',
    build: skill(
      trueDmg('enemyRandomN', 4, 1, { trueDamage: true, n: 1 }),
    ),
  },
  {
    id: 7108,
    desc: '摧毁 1 组行和列。',
    build: skill(
      destroyChosenRow(),
      destroyChosenCol(),
    ),
  },
  {
    id: 7109,
    desc: '对 1 名敌人造成 [魔法 + 2] 点伤害，并移除所有绿色宝石以增强伤害效果。 [2:1]',
    build: skill(
      destroyColor(BaseColor.Green),
      dmg('enemyChosen', 2, 1, { modifier: { mod: { kind: 'ratio', a: 2, b: 1 } } }),
    ),
  },
  {
    id: 7110,
    desc: '对 1 名敌人造成 3 到 [魔法 + 10] 点伤害。',
    build: skill(
      dmg('enemyChosen', 0, 0, { rangeSpec: { min: flat(3), max: scale(10, 1) } }),
    ),
  },
  {
    id: 7111,
    desc: '对一名敌人造成 [魔法 + 4] 点轻微溅射伤害。',
    build: skill(
      dmgSplash('enemyChosen', 4, 1, { range: 'splash' }),
    ),
  },
  {
    id: 7112,
    desc: '对第一名敌人造成 [魔法 + 6] 点伤害。',
    build: skill(
      dmg('enemyFront', 6, 1),
    ),
  },
  {
    id: 7113,
    desc: '对所有敌人造成 [魔法 + 2] 点伤害。',
    build: skill(
      dmg('enemyAll', 2, 1, { range: 'all' }),
    ),
  },
  {
    id: 7114,
    desc: '对 1 个随机的敌人造成 [魔法 + 5] 伤害。如果敌人是龙族，则造成 8 点额外伤害。',
    build: skill(
      dmg('enemyRandomN', 5, 1, { n: 1, condBonus: { n: 8, cond: { kind: 'targetRace', race: 'Dragon' } } }),
    ),
  },
  {
    id: 7115,
    desc: '对所有敌人造成 [魔法 + 8] 点散射伤害。',
    build: skill(
      dmg('enemyAll', 8, 1, { range: 'all' }),
    ),
  },
  {
    id: 7116,
    desc: '对 1 个敌人造成 [魔法 + 4] 点伤害，并移除所有红色宝石以增强伤害效果。 [3:1]',
    build: skill(
      destroyColor(BaseColor.Red),
      dmg('enemyChosen', 4, 1, { modifier: { mod: { kind: 'ratio', a: 3, b: 1 } } }),
    ),
  },
  {
    id: 7118,
    desc: '摧毁选定颜色的所有宝石。',
    build: skill(
      destroyColor(CHOSEN),
    ),
  },
  {
    id: 7119,
    desc: '对 1 名随机的敌人造成 [魔法 + 6] 点伤害，并使其陷入沉默状态。',
    build: skill(
      dmg('enemyRandomN', 6, 1, { n: 1 }),
      inflict('silence', 'lastTarget'),
    ),
  },
  {
    id: 7120,
    desc: '对 1 个敌人造成 [魔法 + 5] 点伤害。创造 6 颗绿色宝石。',
    build: skill(
      dmg('enemyChosen', 5, 1),
      createGems(BaseColor.Green, 6, 0),
    ),
  },
  {
    id: 7121,
    desc: '对最后一名敌人造成 [魔法 + 6] 点伤害。如果该敌人身亡，则随机爆破 1 颗宝石。',
    build: skill(
      dmg('enemyLast', 6, 1),
      explodeRandomGems(1, 0, 'color', undefined, { ifTargetDied: true }),
    ),
  },
  {
    id: 7122,
    desc: '随机爆破 [魔法] 颗棕色宝石。',
    build: skill(
      explodeRandomGems(0, 1, 'color', BaseColor.Brown),
    ),
  },
  {
    id: 7123,
    desc: '对一名敌人造成 [魔法 + 6] 点轻微溅射伤害。打乱板面。',
    build: skill(
      dmgSplash('enemyChosen', 6, 1, { range: 'splash' }),
      shuffleBoard(),
    ),
  },
  {
    id: 7124,
    desc: '获得 [魔法 + 1] 点生命值，并移除所有绿色宝石以增强效果。获得屏障效果。 [1:1]',
    build: skill(
      heal('allySelf', 1, 1, { modifier: { mod: { kind: 'ratio', a: 1, b: 1 } } }),
      destroyColor(BaseColor.Green),
      inflict('barrier', 'allySelf'),
    ),
  },
  {
    id: 7125,
    desc: '对第一名敌人造成 [魔法 + 7] 点伤害。如果敌人身亡，则获得 7 点攻击力。',
    build: skill(
      dmg('enemyFront', 7, 1),
      attack('allySelf', 7, 0, { ifTargetDied: true }),
    ),
  },
  {
    id: 7126,
    desc: '对 1 名敌人造成 [魔法 + 6] 点伤害，并将其冻结。',
    build: skill(
      dmg('enemyChosen', 6, 1),
      inflict('frozen', 'lastTarget'),
    ),
  },
  {
    id: 7127,
    desc: '对所有敌人造成 [魔法 + 2] 点伤害。创造 6 红色宝石。',
    build: skill(
      dmg('enemyAll', 2, 1, { range: 'all' }),
      createGems(BaseColor.Red, 6, 0),
    ),
  },
  {
    id: 7128,
    desc: '对最后一名敌人造成 [魔法 + 4] 点伤害，并使其陷入中毒状态。',
    build: skill(
      dmg('enemyLast', 4, 1),
      inflict('poison', 'lastTarget'),
    ),
  },
  {
    id: 7170,
    desc: '对 1 名敌人造成 [魔法 + 5] 点伤害。窃取 2 点攻击力。',
    build: skill(
      dmg('enemyChosen', 5, 1),
      steal('lastTarget', 'attack', 'attack', 2, 0),
    ),
  },
  {
    id: 7172,
    desc: '对最后一名敌人造成 [魔法 + 4] 点伤害，并使其陷入沉默状态。',
    build: skill(
      dmg('enemyLast', 4, 1),
      inflict('silence', 'lastTarget'),
    ),
  },
  {
    id: 7174,
    desc: '将 1 颗宝石转换成红色，然后再创造 7 颗红色宝石。随机燃烧一名敌人。',
    build: skill(
      { kind: 'gem', params: { op: 'transform', from: 'ANY', to: BaseColor.Red, count: { base: 1, mult: 0 } } },
      createGems(BaseColor.Red, 7, 0),
      inflict('burning', 'enemyRandom'),
    ),
  },
  {
    id: 7176,
    desc: '窃取第一名敌人 [魔法 + 3] 点生命值，并耗尽该敌人的法力值。',
    build: skill(
      dmg('enemyFront', 3, 1, { drain: true }),
      drainMana('enemyChosen'),
    ),
  },
  {
    id: 7183,
    desc: '为所有盟友提供 [魔法 + 1] 点生命值。',
    build: skill(
      heal('allyAll', 1, 1),
    ),
  },
  {
    id: 7184,
    desc: '对前两名敌人造成 [魔法] 点伤害，并移除所有骷髅头以增强伤害效果效果。 [2:1]',
    build: skill(
      dmg('enemyFirstN', 0, 1, { n: 2, modifier: { mod: { kind: 'ratio', a: 2, b: 1 } } }),
      destroySkulls(),
    ),
  },
  {
    id: 7185,
    desc: '缠绕第一名敌人，并造成 [魔法 + 2] 点真实伤害。',
    build: skill(
      inflict('entangle', 'enemyFront'),
    ),
  },
  {
    id: 7186,
    desc: '对所有敌人造成 [魔法 + 7] 点散射伤害。自身恢复 10 点生命值。',
    build: skill(
      dmg('enemyAll', 7, 1, { range: 'all' }),
      heal('allySelf', 10, 0),
    ),
  },
  {
    id: 7187,
    desc: '创造 7 颗红色宝石，并净化所有盟友。给随机一名盟友 [魔法 + 1] 点生命值。',
    build: skill(
      createGems(BaseColor.Red, 7, 0),
      cleanse('allyAll'),
      heal('allyRandom', 1, 1),
    ),
  },
  {
    id: 7189,
    desc: '减除一名敌人全部魔法值。',
    build: skill(
      reduce('lastTarget', 'magic', 0, 0, { drainAll: true }),
    ),
  },
  {
    id: 7191,
    desc: '对所有敌人造成 [魔法 + 4] 点散射伤害。若敌方有精灵军队，则增加额外 10 点伤害。',
    build: skill(
      dmg('enemyAll', 4, 1, { range: 'all', condBonus: { n: 10, cond: { kind: 'enemyRacePresent', race: 'Elf' } } }),
    ),
  },
  {
    id: 7193,
    desc: '对 1 个敌人造成 [魔法 + 3] 点伤害。如果对方使用红色法力值，则造成双倍伤害。',
    build: skill(
      dmg('enemyChosen', 3, 1, { condMult: { times: 2, cond: { kind: 'targetColor', color: BaseColor.Red } } }),
    ),
  },
  {
    id: 7195,
    desc: '对 1 名敌人造成 [魔法 + 10] 点伤害。',
    build: skill(
      dmg('enemyChosen', 10, 1),
    ),
  },
  {
    id: 7196,
    desc: '对 1 个敌人造成 [魔法 + 3] 点伤害。如果对方使用紫色法力值，则造成双倍伤害。',
    build: skill(
      dmg('enemyChosen', 3, 1, { condMult: { times: 2, cond: { kind: 'targetColor', color: BaseColor.Purple } } }),
    ),
  },
  {
    id: 7197,
    desc: '为 1 个盟友提供 [魔法 + 1] 点攻击力和护甲值。',
    build: skill(
      attack('allyAll', 1, 1),
      armor('allyAll', 1, 1),
    ),
  },
  {
    id: 7198,
    desc: '耗尽第一名和最后一名敌人的法力值。为所有盟友提供 1 点魔法值。',
    build: skill(
      drainMana('enemyFront'),
      drainMana('enemyLast'),
      magic('allyAll', 1, 0),
    ),
  },
  {
    id: 7200,
    desc: '对最虚弱的敌人造成 [魔法 + 5] 点伤害。获得 1 个额外的回合。',
    build: skill(
      dmg('enemyWeakest', 5, 1),
      extraTurn(),
    ),
  },
  {
    id: 7201,
    desc: '对 1 个敌人造成 [魔法 + 3] 点伤害。如果对方使用蓝色法力值，则造成双倍伤害。',
    build: skill(
      dmg('enemyChosen', 3, 1, { condMult: { times: 2, cond: { kind: 'targetColor', color: BaseColor.Blue } } }),
    ),
  },
  {
    id: 7202,
    desc: '对 1 个敌人造成 [魔法 + 6] 点伤害。获得 10 个灵魂。',
    build: skill(
      dmg('enemyChosen', 6, 1),
      gainSouls(10, 0),
    ),
  },
  {
    id: 7203,
    desc: '恢复自身所有生命值。获得一个额外回合。获得 [魔法 + 1] 灵魂。',
    build: skill(
      heal('allySelf', 0, 0, { full: true }),
      extraTurn(),
      gainSouls(1, 1),
    ),
  },
  {
    id: 7218,
    desc: '为所有盟友提供 [魔法 + 1] 点护甲值。',
    build: skill(
      armor('allyAll', 1, 1),
    ),
  },
  {
    id: 7219,
    desc: '创造 7 颗随机的蓝色宝石。获得 [魔法 + 1] 点随机技能值。',
    build: skill(
      createGems(BaseColor.Blue, 7, 0),
      randomStat('allySelf', 1, 1),
    ),
  },
  {
    id: 7220,
    desc: '对 1 名敌人造成 [魔法 + 2] 点伤害并耗尽其法力值。若敌人身亡则获得 5 点生命值。',
    build: skill(
      dmg('enemyChosen', 2, 1),
      drainMana('lastTarget'),
      heal('allySelf', 5, 0, { ifTargetDied: true }),
    ),
  },
  {
    id: 7221,
    desc: '对最后 1 名敌人造成 [魔法 + 4] 点伤害，并窃取 1 点魔法值。',
    build: skill(
      dmg('enemyLast', 4, 1),
      steal('lastTarget', 'magic', 'magic', 1, 0),
    ),
  },
  {
    id: 7222,
    desc: '对 1 名敌人造成 [魔法 + 4] 点轻微溅射伤害。如果敌人已被缠绕，则增加 5 点伤害。',
    build: skill(
      dmgSplash('enemyChosen', 4, 1, { range: 'splash', condBonus: { n: 5, cond: { kind: 'targetStatus', statusId: 'entangle' } } }),
    ),
  },
  {
    id: 7223,
    desc: '随机爆破 4 颗选定颜色的宝石。恢复 [魔法 + 4] 点生命值。',
    build: skill(
      explodeRandomGems(4, 0, 'color', CHOSEN),
      heal('allySelf', 4, 1),
    ),
  },
  {
    id: 7226,
    desc: '对所有敌人造成 [魔法] 点伤害并让全体盟友获得 2 点生命值。',
    build: skill(
      dmg('enemyAll', 0, 1, { range: 'all' }),
      heal('allyAll', 2, 0),
    ),
  },
  {
    id: 7227,
    desc: '对所有敌人造成 [魔法] 点伤害并让全体盟友获得 1 点魔法值。',
    build: skill(
      dmg('enemyAll', 0, 1, { range: 'all' }),
      magic('allyAll', 1, 0),
    ),
  },
  {
    id: 7228,
    desc: '对所有敌人造成 [魔法] 点伤害并让全体盟友获得 2 点攻击力。',
    build: skill(
      dmg('enemyAll', 0, 1, { range: 'all' }),
      attack('allyAll', 2, 0),
    ),
  },
  {
    id: 7230,
    desc: '对 1 名敌人造成 [魔法] 点伤害。获得 1 点魔法值并移除所有绿色宝石以强化此效果。 [3:1]',
    build: skill(
      dmg('enemyChosen', 0, 1),
      magic('allySelf', 1, 0, { modifier: { mod: { kind: 'ratio', a: 3, b: 1 } } }),
      destroyColor(BaseColor.Green),
    ),
  },
  {
    id: 7239,
    desc: '对最后两名敌人造成 [魔法 + 2] 点伤害。如果伤害目标是龙族，则造成双倍伤害。',
    build: skill(
      dmg('enemyLast', 2, 1, { condMult: { times: 2, cond: { kind: 'targetRace', race: 'Dragon' } } }),
    ),
  },
  {
    id: 7242,
    desc: '对所有敌人造成 [魔法 + 7] 点散射伤害。如果敌方有恶魔军队，则造成额外 8 点伤害。',
    build: skill(
      dmg('enemyAll', 7, 1, { range: 'all', condBonus: { n: 8, cond: { kind: 'enemyRacePresent', race: 'Daemon' } } }),
    ),
  },
  {
    id: 7245,
    desc: '对所有敌人造成 [(魔法 / 2) + 2] 点真实伤害。获得 2 点魔法值。如果敌人身亡，则获得一个额外回合。',
    build: skill(
      dmg('enemyAll', 2, 0.5, { range: 'all', trueDamage: true }),
      magic('allySelf', 2, 0),
      extraTurn({ ifTargetDied: true }),
    ),
  },
  {
    id: 7246,
    desc: '对 1 名敌人造成 [魔法 + 4] 点伤害。如果板面上有 13 颗或更多红色宝石，则额外造成 8 点伤害。',
    build: skill(
      dmg('enemyChosen', 4, 1),
      dmg('enemyChosen', 8, 0, { ifCond: { kind: 'boardAtLeast', color: BaseColor.Red, n: 13 } }),
    ),
  },
  {
    id: 7248,
    desc: '对所有敌人造成 [魔法 + 4] 点散射伤害。伤害值因己方神祇和骑士盟友数而增强。 [x5]',
    build: skill(
      dmg('enemyAll', 4, 1, { range: 'all', modifier: { mod: { kind: 'multiplier', a: 5 }, source: { kind: 'alliesOfRace', race: 'Divine' } } }),
    ),
  },
  {
    id: 7249,
    desc: '给予所有盟友 [魔法 + 3] 点护甲值和 5 点攻击力。如果有 13 颗或更多黄色宝石，则给予所有盟友 4 点生命值和魔法值。',
    build: skill(
      armor('allyAll', 3, 1),
      attack('allyAll', 5, 0),
      heal('allyAll', 4, 0, { ifCond: { kind: 'boardAtLeast', color: BaseColor.Yellow, n: 13 } }),
      magic('allyAll', 4, 0, { ifCond: { kind: 'boardAtLeast', color: BaseColor.Yellow, n: 13 } }),
    ),
  },
  {
    id: 7251,
    desc: '随机爆破 3 颗宝石。对所有敌人造成 [魔法 + 5] 点散射伤害。',
    build: skill(
      explodeRandomGems(3, 0, 'color', undefined),
      dmg('enemyAll', 5, 1, { range: 'all' }),
    ),
  },
  {
    id: 7267,
    desc: '对 1 名敌人造成 [魔法 + 1] 点真实伤害。如果敌人已陷入猎人标记状态，则造成双倍伤害。',
    build: skill(
      trueDmg('enemyChosen', 1, 1, { trueDamage: true, condMult: { times: 2, cond: { kind: 'targetStatus', statusId: 'marked' } } }),
    ),
  },
  {
    id: 7268,
    desc: '对 1 名敌人造成 [魔法 + 4] 点伤害。若自身的生命值受损，则获得 6 点攻击力。',
    build: skill(
      dmg('enemyChosen', 4, 1),
      attack('allySelf', 6, 0, { ifCond: { kind: 'selfHpDamaged' } }),
    ),
  },
  {
    id: 7269,
    desc: '摧毁一组行跟列。对所有敌人造成 [魔法 + 3] 点散射伤害，并因被摧毁的绿色宝石数而增强。 [x3]',
    build: skill(
      destroyChosenRow(),
      destroyChosenCol(),
      dmg('enemyAll', 3, 1, { range: 'all', modifier: { mod: { kind: 'multiplier', a: 3 }, source: { kind: 'boardGems', color: BaseColor.Green } } }),
    ),
  },
  {
    id: 7270,
    desc: '对 1 名敌人造成 [魔法 + 2] 点真实伤害。如果敌人是神祇军队，则额外造成 5 点真实伤害。',
    build: skill(
      trueDmg('enemyChosen', 2, 1, { trueDamage: true, condBonus: { n: 5, cond: { kind: 'enemyRacePresent', race: 'Divine' } } }),
    ),
  },
  {
    id: 7271,
    desc: '对 1 名敌人造成 [魔法 + 4] 点伤害。如果敌方有不死族军队，则对另1 名随机敌人造成 9 点伤害。',
    build: skill(
      dmg('enemyChosen', 4, 1),
      dmg('enemyRandomN', 9, 0, { n: 1, ifCond: { kind: 'enemyRacePresent', race: 'Undead' } }),
    ),
  },
  {
    id: 7272,
    desc: '摧毁 1 列。对 1 名随机敌人造成 [魔法 + 5] 点伤害，伤害值因被摧毁的骷髅头数而增强。 [1:1]',
    build: skill(
      destroyChosenCol(),
      dmg('enemyRandomN', 5, 1, { n: 1, modifier: { mod: { kind: 'ratio', a: 1, b: 1 }, source: { kind: 'boardSkulls' } } }),
    ),
  },
  {
    id: 7282,
    desc: '对 1 名敌人造成  [魔法 + 1]  点伤害。如果敌人已下潜则造成三倍伤害。',
    build: skill(
      dmg('enemyChosen', 1, 1, { condMult: { times: 3, cond: { kind: 'targetStatus', statusId: 'submerged' } } }),
    ),
  },
  {
    id: 7283,
    desc: '给予所有盟友 [(魔法 / 2)] 点生命值和护甲值。如果板面上有 13 颗或更多绿色宝石，则获得一个额外回合。',
    build: skill(
      heal('allyAll', 0, 0.5),
      armor('allyAll', 0, 0.5),
      extraTurn({ ifCond: { kind: 'boardAtLeast', color: BaseColor.Green, n: 13 } }),
    ),
  },
  {
    id: 7284,
    desc: '为所有盟友恢复 [魔法 + 5] 点生命值。获得一个额外回合。',
    build: skill(
      heal('allyAll', 5, 1),
      extraTurn(),
    ),
  },
  {
    id: 7285,
    desc: '对所有敌人造成 [(魔法 / 2) + 2] 点伤害。随机燃烧一名敌人，并使另一名敌人陷入疾病状态。',
    build: skill(
      dmg('enemyAll', 2, 0.5, { range: 'all' }),
      inflict('disease', 'enemyRandomN'),
    ),
  },
  {
    id: 7287,
    desc: '将一名敌人拉到首位。减除所有敌人 [魔法 + 1] 点护甲值。',
    build: skill(
      reposition('enemyChosen', 'front'),
      reduce('enemyAll', 'armor', 1, 1),
    ),
  },
  {
    id: 7291,
    desc: '对 1 名敌人造成 [魔法 + 3] 点伤害。如果敌人是哥布林，造成三倍伤害。',
    build: skill(
      dmg('enemyChosen', 3, 1, { condMult: { times: 3, cond: { kind: 'targetRace', race: 'Goblin' } } }),
    ),
  },
  {
    id: 7292,
    desc: '对所有敌人造成 [魔法 + 7] 点散射伤害。获得 2 点魔法值。',
    build: skill(
      dmg('enemyAll', 7, 1, { range: 'all' }),
      magic('allySelf', 2, 0),
    ),
  },
  {
    id: 7296,
    desc: '对最后一名敌人造成 [魔法 + 4] 点伤害。如果敌人已被冻结，则造成额外 10 点伤害。冻结敌人。',
    build: skill(
      dmg('enemyLast', 4, 1, { condBonus: { n: 10, cond: { kind: 'targetStatus', statusId: 'frozen' } } }),
      inflict('frozen', 'enemyChosen'),
    ),
  },
  {
    id: 7299,
    desc: '对 1 名敌人和另 1 名随机敌人造成 [魔法 + 2] 点伤害。从敌人身上窃取 1 点魔法值。',
    build: skill(
      dmg('enemyChosen', 2, 1),
      dmg('enemyRandom', 2, 1),
      steal('enemyChosen', 'magic', 'magic', 1, 0),
    ),
  },
  {
    id: 7305,
    desc: '对 1 名敌人造成 [魔法 + 2] 点伤害，伤害值因敌人攻击力而增强。 [1:1]',
    build: skill(
      dmg('enemyChosen', 2, 1, { modifier: { mod: { kind: 'ratio', a: 1, b: 1 }, source: { kind: 'targetStat', stat: 'attack' } } }),
    ),
  },
  {
    id: 7306,
    desc: '爆破一颗宝石。对 1 名随机敌人造成 [魔法 + 5] 点伤害并将其燃烧。',
    build: skill(
      explodeRandomGems(1, 0, 'color', undefined),
      dmg('enemyRandomN', 5, 1, { n: 1 }),
      inflict('burning', 'lastTarget'),
    ),
  },
  {
    id: 7307,
    desc: '获得 [魔法 + 1] 点护甲，并移至队伍首位。赋予所有其他盟友屏障效果。',
    build: skill(
      armor('allySelf', 1, 1),
      reposition('allySelf', 'front'),
      inflict('barrier', 'allyOthers'),
    ),
  },
  {
    id: 7309,
    desc: '召唤一名随机恶魔',
    build: skill(
      summonRandom(['AncientHorror', 'SpiderQueen', 'Abhorath', 'Webspinner', 'Moloch', 'TheSilentOne', 'Gorgotha', 'Kerberos', 'Cthyryzyx', 'Terraxis', 'Psion', 'Abynissia', 'Quasit', 'Hellhound', 'Succubus', 'HeraldOfChaos', 'InfernalKing', 'Venbarak', 'War', 'Plague', 'Famine', 'Death', 'Marilith', 'Hellcat', 'Creeper', 'KruargTheDread', 'Desdaemona', 'Warg', 'Incubus', 'DarkMonolith', 'Myzmer', 'Elemaugrim', 'CorruptedUrska', 'BoneDaemon', 'Hellspawn', 'Spinnerette', 'Doomclaw', 'YaoGuai', 'Erinyes', 'Tzathoth', 'Gargantaur', 'TomeOfEvil', 'Hellcackle', 'Glaycion', 'Nightmare', 'SirMordayne', 'Umbraxis', 'ThePossessedKing', 'Sloth', 'Envy', 'Greed', 'Gluttony', 'Barghast', 'Pride', 'Wrath', 'Lust', 'SibylOfLust', 'SoldierOfWrath', 'WallOfTentacles', 'Bael', 'VashDagon', 'QueenOfSin', 'Glutmaw', 'Obsidius', 'Lamashtu', 'PossessedUrska', 'BrokerOfGreed', 'EnvoyOfPride', 'MotherOfDarkness', 'GateOfSouls', 'Lucifria', 'Blightwing', 'Deminaga', 'TheInfernalMachine', 'Ironjaw', 'Tartarus', 'Netherhound', 'EldritchGuardian', 'FellDragonEgg', 'FellDragon', 'Nocturnia', 'HeraldOfWoe', 'IndolatorOfSloth', 'ShadeOfKurandara', 'Kurandara', 'EnragedKurandara', 'DaemonGnome', 'Mambasira', 'Arcturion', 'HeraldOfDamnation', 'Baphomet', 'TheScourgeOfHonor', 'DeepGolem', 'NyarMel', 'HoundOfYaoGuai', 'MaidOfEnvy', 'TheArchduke', 'Lemure', 'Fury', 'Charonas', 'JudgeOfTheDead', 'HellclawHunter', 'HellclawMage', 'HellclawWarrior', 'Indrajit', 'HelgorTheGuardian', 'FlamingOni', 'Oneiros', 'RedAhriman', 'AbjectOfDespond', 'Despond', 'BileBlackheart', 'AnimusOfEnvy', 'HornedHag', 'ConsortOfDarkness', 'EldritchMinion', 'Uvhash-Ka', 'WarMachine', 'HellclawRager', 'HeraldOfBlight', 'HellstoneGate', 'HeraldOfTorpor', 'Czernobog', 'Nabassu', 'Xenith', 'Tourmaline', 'Chalcedony', 'Petrahulk', 'StoneMefyt', 'TheElderDragon', 'VrawkDaemon', 'EldritchDisciple', 'Voidcaller', 'TheBaneOfMercy', 'EyeOfArges', 'InfernalVoyager', 'TheIronMaiden', 'TriTerror', 'DaemonChild', 'TheVoidDragon', 'Tempurath', 'DaemonicSentinel', 'Hellborer', 'DarkHerald', 'Groevanga', 'FellHydra', 'Isban', 'Goethite', 'SuccubusQueen', 'Bieska', 'HoundmasterGor', 'BlightHound', 'Astaroth', 'DaeDrak', 'MelekTauss', 'DoomedGuardian', 'StingBat', 'TheBaneOfValor', 'Redreaver', 'LionOfYaoGuai', 'Discordia', 'ImmortalAbaddon', 'BlightedHusk', 'BaneOfAmbition', 'HellclawShadowpriest', 'Polymetis', 'DagoNath', 'FelineOfEnvy', 'Skarn', 'MaidenOfPain', 'HeraldOfWar', 'Azbeel', 'OkraNosTheSleeper', 'Voidjaw', 'ChampionOfRot', 'BloodSpore', 'InfernalTrickster', 'Seditius', 'ImmortalZephaar']),
    ),
  },
  {
    id: 7317,
    desc: '使最强和最弱的敌人陷入死亡标记状态，并对所有敌人造成 [魔法 + 1] 点伤害。',
    build: skill(
      inflict('death-mark', 'enemyHealthiest'),
      inflict('death-mark', 'enemyWeakest'),
    ),
  },
  {
    id: 7318,
    desc: '净化所有盟友并给予其 [魔法] 点生命值。',
    build: skill(
      cleanse('allyAll'),
      heal('allySelf', 0, 1),
    ),
  },
  {
    id: 7338,
    desc: '科学地使随机敌人陷入燃烧、冻结和沉默状态，并造成 [魔法 + 3] 点伤害。',
    build: skill(
      inflict('burning', 'enemyRandomN'),
    ),
  },
  {
    id: 7410,
    desc: '对 1 名敌人造成 [魔法 + 4] 点伤害，耗尽其法力值并使其陷入织网状态。如果敌人已陷入织网状态，则获得一个额外回合。',
    build: skill(
      dmg('enemyChosen', 4, 1),
      drainMana('lastTarget'),
      inflict('web', 'lastTarget'),
      extraTurn({ ifCond: { kind: 'anyEnemyStatus', statusId: 'web' } }),
    ),
  },
  {
    id: 7444,
    desc: '使一名敌人陷入死亡标记状态。对其下方的所有敌人造成 [魔法 + 1] 点真实伤害，伤害值因陷入死亡标记的敌军数量而增强。 [x3]',
    build: skill(
      inflict('death-mark', 'enemyChosen'),
      trueDmg('enemyChosenAndBelow', 1, 1, { trueDamage: true, modifier: { mod: { kind: 'multiplier', a: 3 }, source: { kind: 'enemyStatusCount', statusId: 'death-mark' } } }),
    ),
  },
  {
    id: 7527,
    desc: '对一名敌人造成 [魔法 + 8] 点溅射伤害。赋予第一名盟友狂怒状态。',
    build: skill(
      dmgSplash('enemyChosen', 8, 1, { range: 'splash' }),
      inflict('rage', 'allyFront'),
    ),
  },
  {
    id: 7529,
    desc: '创造 8 颗红色宝石和 8 颗黄色宝石，再召唤一颗龙蛋或恶龙蛋。',
    build: skill(
      createGems(BaseColor.Red, 8, 0),
      summonRandom(['DragonEggs', 'FellDragonEgg']),
    ),
  },
  {
    id: 7563,
    desc: '对一名敌人造成 [魔法 + 4] 点溅射伤害，伤害值因下潜的盟友数而增强。 [x7]',
    build: skill(
      dmgSplash('enemyChosen', 4, 1, { range: 'splash', modifier: { mod: { kind: 'multiplier', a: 7 }, source: { kind: 'allyStatusCount', statusId: 'submerged' } } }),
    ),
  },
  {
    id: 7577,
    desc: '对两名最强大的敌人造成 [魔法 + 1] 点伤害，并移除所有紫色宝石以增强效果。若任何一名敌人是恶魔军队，则造成双倍伤害。 [4:1]',
    build: skill(
      destroyColor(BaseColor.Purple),
      dmg('enemyHealthiestN', 1, 1, { n: 2, condMult: { times: 2, cond: { kind: 'enemyRacePresent', race: 'Daemon' } }, modifier: { mod: { kind: 'ratio', a: 4, b: 1 } } }),
    ),
  },
  {
    id: 7578,
    desc: '对 1 名敌人造成  [魔法 + 4] 点伤害。如果现有冰风暴则伤害双倍。创造冰风暴。',
    build: skill(
      dmg('enemyChosen', 4, 1, { condMult: { times: 2, cond: { kind: 'stormPresent', color: BaseColor.Blue } } }),
      createStorm(BaseColor.Blue),
    ),
  },
  {
    id: 7579,
    desc: '对 1 名敌人造成  [魔法 + 4] 点伤害。如果现有叶风暴则伤害双倍。创造叶风暴。',
    build: skill(
      dmg('enemyChosen', 4, 1, { condMult: { times: 2, cond: { kind: 'stormPresent', color: BaseColor.Green } } }),
      createStorm(BaseColor.Green),
    ),
  },
  {
    id: 7580,
    desc: '对 1 名敌人造成  [魔法 + 4] 点伤害。如果现有火风暴则伤害双倍。创造火风暴。',
    build: skill(
      dmg('enemyChosen', 4, 1, { condMult: { times: 2, cond: { kind: 'stormPresent', color: BaseColor.Red } } }),
      createStorm(BaseColor.Red),
    ),
  },
  {
    id: 7581,
    desc: '对 1 名敌人造成  [魔法 + 4] 点伤害。如果现有光风暴则伤害双倍。创造光风暴。',
    build: skill(
      dmg('enemyChosen', 4, 1, { condMult: { times: 2, cond: { kind: 'stormPresent', color: BaseColor.Yellow } } }),
      createStorm(BaseColor.Yellow),
    ),
  },
  {
    id: 7582,
    desc: '对 1 名敌人造成  [魔法 + 4] 点伤害。如果现有暗风暴则伤害双倍。创造暗风暴。',
    build: skill(
      dmg('enemyChosen', 4, 1, { condMult: { times: 2, cond: { kind: 'stormPresent', color: BaseColor.Purple } } }),
      createStorm(BaseColor.Purple),
    ),
  },
  {
    id: 7583,
    desc: '对 1 名敌人造成  [魔法 + 4] 点伤害。如果现有尘风暴则伤害双倍。创造尘风暴。',
    build: skill(
      dmg('enemyChosen', 4, 1, { condMult: { times: 2, cond: { kind: 'stormPresent', color: BaseColor.Brown } } }),
      createStorm(BaseColor.Brown),
    ),
  },
  {
    id: 7585,
    desc: '对第一名敌人造成 [魔法 + 5] 点伤害。',
    build: skill(
      dmg('enemyFront', 5, 1),
    ),
  },
  {
    id: 7586,
    desc: '创造选定的 7 颗宝石。随机使一名盟友下潜，并给予他 1 点魔法值。',
    build: skill(
      createGems(CHOSEN, 7, 0),
      inflict('submerged', 'allyRandom'),
      magic('allySelf', 1, 0),
    ),
  },
  {
    id: 7587,
    desc: '对第一名敌人造成 [魔法 + 4] 点伤害。如果敌人使用红色法力，则造成三倍伤害。',
    build: skill(
      dmg('enemyFront', 4, 1, { condMult: { times: 3, cond: { kind: 'targetColor', color: BaseColor.Red } } }),
    ),
  },
  {
    id: 7588,
    desc: '对第一名敌人造成 [魔法 + 4] 点伤害。如果敌人使用棕色法力，则造成三倍伤害。',
    build: skill(
      dmg('enemyFront', 4, 1, { condMult: { times: 3, cond: { kind: 'targetColor', color: BaseColor.Brown } } }),
    ),
  },
  {
    id: 7589,
    desc: '对第一名敌人造成 [魔法 + 4] 点伤害。如果敌人使用绿色法力，则造成三倍伤害。',
    build: skill(
      dmg('enemyFront', 4, 1, { condMult: { times: 3, cond: { kind: 'targetColor', color: BaseColor.Green } } }),
    ),
  },
  {
    id: 7590,
    desc: '对第一名敌人造成 [魔法 + 4] 点伤害。如果敌人使用紫色法力，则造成三倍伤害。',
    build: skill(
      dmg('enemyFront', 4, 1, { condMult: { times: 3, cond: { kind: 'targetColor', color: BaseColor.Purple } } }),
    ),
  },
  {
    id: 7591,
    desc: '对第一名敌人造成 [魔法 + 4] 点伤害。如果敌人使用黄色法力，则造成三倍伤害。',
    build: skill(
      dmg('enemyFront', 4, 1, { condMult: { times: 3, cond: { kind: 'targetColor', color: BaseColor.Yellow } } }),
    ),
  },
  {
    id: 7592,
    desc: '对第一名敌人造成 [魔法 + 4] 点伤害。如果敌人使用蓝色法力，则造成三倍伤害。',
    build: skill(
      dmg('enemyFront', 4, 1, { condMult: { times: 3, cond: { kind: 'targetColor', color: BaseColor.Blue } } }),
    ),
  },
  {
    id: 7601,
    desc: '净化所有盟友。给予他们 [魔法 + 1] 点生命值， 并移除所有蓝色宝石以增强效果 [3:1]',
    build: skill(
      cleanse('allyAll'),
      heal('allySelf', 1, 1, { modifier: { mod: { kind: 'ratio', a: 3, b: 1 } } }),
      destroyColor(BaseColor.Blue),
    ),
  },
  {
    id: 7626,
    desc: '对 1 名敌人造成 [魔法 + 1] 点伤害。伤害值因所收集的灵魂数而增强。窃取其法力值。 [3:1]',
    build: skill(
      dmg('enemyChosen', 1, 1, { modifier: { mod: { kind: 'ratio', a: 3, b: 1 }, source: { kind: 'battleSouls' } } }),
      steal('lastTarget', 'mana', 'mana', 0, 0, { drainAll: true }),
    ),
  },
  {
    id: 7653,
    desc: '对所有敌人造成 [魔法 + 10] 点散射伤害。伤害值因陷入妖火状态的敌军数量而增强。 [x8]',
    build: skill(
      dmg('enemyAll', 10, 1, { range: 'all', modifier: { mod: { kind: 'multiplier', a: 8 }, source: { kind: 'enemyStatusCount', statusId: 'faerie-fire' } } }),
    ),
  },
];

export const BATCH_W01: CuratedBatch = { batch: 'W01', spells: SPELLS, skipped: SKIPPED };
