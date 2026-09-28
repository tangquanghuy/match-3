/**
 * 人工核对组装 · 批次 27（池：scripts/curated-pools/pool-27.json）
 * 核对者：agent 批次27
 *
 * 语义裁定备注：
 * - 「爆破一颗宝石」（无「随机」字样）→ explodeAt(CELL)
 *   （batch-11/12/14 头注同款）。
 * - 「耗掉/耗尽…（上至/最多）N 点法力值」= reduce('enemyChosen','mana',N,0)（夹零后至多 N）；
 *   「创造X（宝石/骷髅头），数量与所耗尽的法力值等同」= 基数 0 + [1:1] drainedMana
 *   （batch-25 7467/7206 同款）。
 * - 「&&」为 spell-rules.md §0.1 认可的子句分隔符，desc 逐字保留原文（batch-23 8855/8867 同款）。
 * - 「数量因蓝色盟友数而增强」= alliesOfColor（SOP 来源计数表原文句式）。
 * - 「几率因X宝石数而增强/每颗X宝石有 7% 几率」条目经 chanceBoost 回收（8522/8595/8759/8780）；
 *   其余「召唤 1-3 名」（数量区间）、「半数/充满法力值」（比例法力）、「跑掉」「自毁」「只能使用一次」（无对应原语）、
 *   「击回末位/打乱」（位置操作）、「妖火/激怒」（缺失状态）、「石像鬼宝石」（特殊宝石）、
 *   「敌我双方兽人数/任意状态敌人数/其所有技能值」（二次缩放来源不支持）→ 各按既有批次口径
 *   SKIP（见下，均注先例）。
 */
import { chooseSkill, skill, dmg, heal, armor, magic, reduce, trueDmg, createGems, createSkulls, destroyChosenRow, destroyRandomGems, explodeRandomGems, inflict, extraTurn, summonRef, CELL, explodeAt } from '../builders';
import { BaseColor } from '../../types';
import type { CuratedBatch } from './index';

const SKIPPED: { id: number; reason: string }[] = [
  { id: 8228, reason: '二次缩放来源不支持（「伤害值因其所有技能值而增强」——目标全属性计数无对应 kind，targetStat 仅支持单一属性）' },
  { id: 8238, reason: '语义拿不准（「对一名敌人和一名随机敌人」共用一段缩放的复合目标，batch-23 9220 同款；「若敌人使用红色法力值，则造成双倍伤害」条件倍率现可表达但整条仍卡）' },
  { id: 8272, reason: '二次缩放来源不支持（「数量因敌我双方的兽人军队数量而增强」——敌方侧种族计数无对应 kind，batch-23 8915 / batch-13 7546 同款）' },
  { id: 8282, reason: '句子式不明（「造成…真实散射伤害」未指明目标，batch-02 7265 同款）；「半数法力值」比例法力不做（batch-23 9179 同款）、「几率因棕色宝石数而增强」现可用 chanceBoost 表达但整条仍卡' },
  { id: 8291, reason: '隐匿/位置操作（「将一名敌人击回末位」，batch-01 7439/7534 同款）' },
  { id: 8408, reason: '语义拿不准（「召唤 1-3 名」数量区间无原语，batch-25 7501 同款）' },
  { id: 8489, reason: '语义拿不准（「爆破敌人的法力颜色之一的所有宝石」按敌方动态法力色选色无对应原语，动态颜色族暂不支持）' },
  { id: 8498, reason: '比例法力（「充满他们的法力值」按法力条回满无对应原语，batch-14 8292 同族）；「此咒语只能使用一次」使用次数限制亦无原语' },
  { id: 8499, reason: '语义拿不准（「消除…随机技能值」无对应削减原语，随机属性只支持获得，batch-01 7319 同款）；「摧毁8种宝石的法力颜色之一」「可在任何敌人身上重复使用两次」亦无法表达' },
  { id: 8500, reason: '语义拿不准（「消除敌人的…随机技能」无对应削减原语，batch-01 7319 同款）；「由紫色宝石增强」未指明来源口径亦不明' },
  { id: 8523, reason: '句子式不明（「给予…第一名同盟所以技能」「每个蓝色宝石都有7％的额外几率旋转」机翻残缺无法解析）' },
  { id: 8581, reason: '二次缩放来源不支持（「每有一名敌人陷入状态效果」——任意状态计数无对应 kind，enemyStatusCount 仅支持单一状态，batch-25 9055 同族）' },
  { id: 8747, reason: '语义拿不准（「召唤 1-3 名」数量区间无原语，batch-25 7501 同款）' },
  { id: 8751, reason: '隐匿/位置操作（「将首位敌人打回末位」，batch-23 9131 同款）' },
  { id: 8791, reason: '语义拿不准（「每爆破一颗棕色宝石则赋予一名随机盟友屏障效果」——数量加成需挂状态段，状态段无 modifier 原语）' },
  { id: 8796, reason: '特殊宝石（石像鬼宝石，batch-23 头注同族）' },
  { id: 8835, reason: '缺失状态（激怒不在状态词表）' },
];

const SPELLS: CuratedBatch['spells'] = [
  {
    id: 8226,
    desc: '爆破一颗宝石。获得 [魔法 + 1] 点生命值，数值因被摧毁的蓝色宝石而增强。使自身下潜并获得屏障效果。 [x2]',
    build: skill(
      explodeAt(CELL),
      // 「数值因被摧毁的蓝色宝石而增强」点名生命值段 → destroyedGems 筛蓝色（batch-11 7008 同款）
      heal('allySelf', 1, 1, {
        modifier: { mod: { kind: 'multiplier', a: 2 }, source: { kind: 'destroyedGems', color: BaseColor.Blue } },
      }),
      inflict('submerged', 'allySelf'),
      inflict('barrier', 'allySelf'),
    ),
  },
  {
    id: 8271,
    desc: '耗尽一名敌人上至 12 点法力值。创颗棕色宝石，数量与所耗尽的法力值等同。 [1:1]',
    build: skill(
      // 「上至 12 点」= 削减 12（夹零后至多 12）；「数量与所耗尽的法力值等同」= 基数 0 + [1:1] drainedMana
      // （batch-25 7467 同款）
      reduce('enemyChosen', 'mana', 12, 0),
      createGems(BaseColor.Brown, 0, 0, {
        modifier: { mod: { kind: 'ratio', a: 1, b: 1 }, source: { kind: 'drainedMana' } },
      }),
    ),
  },
  {
    id: 8300,
    desc: '&& 创造 9 颗绿色宝石 && 摧毁 9 颗绿色宝石',
    build: skill(chooseSkill(['创造9颗绿色宝石', '摧毁9颗绿色宝石'], [createGems(BaseColor.Green, 9, 0)], [destroyRandomGems(9, 0, 'color', BaseColor.Green)])),
  },
  {
    id: 8301,
    desc: '耗掉一名敌人最多 10 点法力值。每耗掉 1 点法力值则爆破 1 可宝石。 [1:1]',
    build: skill(
      reduce('enemyChosen', 'mana', 10, 0),
      // 「每耗掉 1 点法力值则爆破 1 颗宝石」= 基数 0 + [1:1] drainedMana（batch-25 7206 同款）
      explodeRandomGems(0, 0, 'color', undefined, {
        modifier: { mod: { kind: 'ratio', a: 1, b: 1 }, source: { kind: 'drainedMana' } },
      }),
    ),
  },
  {
    id: 8422,
    desc: '创造 4 颗棕色宝石，数量因蓝色盟友数而增强。冻结一名随机敌人。 [x3]',
    build: skill(
      // 「数量因蓝色盟友数而增强」= alliesOfColor（SOP 来源计数表「因蓝色盟友数而增强」）
      createGems(BaseColor.Brown, 4, 0, {
        modifier: { mod: { kind: 'multiplier', a: 3 }, source: { kind: 'alliesOfColor', color: BaseColor.Blue } },
      }),
      inflict('frozen', 'enemyRandom'),
    ),
  },
  {
    id: 8522,
    desc: '给予所有盟友 [(魔法 / 2) + 3] 点生命值。每有一颗黄色宝石则有 7% 的几率获得一个额外回合。 [x7]',
    build: skill(
      heal('allyAll', 3, 0.5),
      // 回收：chanceBoost 现支持「每颗X宝石 7% 几率」（SOP 示例句式；boardGems Yellow）
      extraTurn({ chanceBoost: { mod: { kind: 'multiplier', a: 7 }, source: { kind: 'boardGems', color: BaseColor.Yellow } } }),
    ),
  },
  {
    id: 8536,
    desc: '对 3 名随机敌人造成 [魔法 + 3] 点真实伤害。若敌人已受伤，则造成额外 10 点伤害。再召唤尔福小宠。',
    build: skill(
      // 回收：condBonus 现支持「+N 点」条件加成（SOP「通用条件触发 / 条件加成」节），
      // targetHpDamaged 为目标相对条件、逐目标判定（batch-02 7012 同款）
      trueDmg('enemyRandomN', 3, 1, { n: 3, condBonus: { n: 10, cond: { kind: 'targetHpDamaged' } } }),
      // 尔福小宠 = UlfsMascot（troops.json 7007，§6 命令核实）
      summonRef('UlfsMascot', 7007),
    ),
  },
  {
    id: 8588,
    desc: '耗掉一名敌人最多 12 点法力值。创造黄色宝石，数量等同于所耗掉的法力值。 [1:1]',
    build: skill(
      reduce('enemyChosen', 'mana', 12, 0),
      createGems(BaseColor.Yellow, 0, 0, {
        modifier: { mod: { kind: 'ratio', a: 1, b: 1 }, source: { kind: 'drainedMana' } },
      }),
    ),
  },
  {
    id: 8595,
    desc: '将 [(魔法 / 2) + 1] 点魔法值赋予一名随机盟友。每有一颗黄色宝石则有 7% 的几率获得一个额外回合。 [x7]',
    build: skill(
      // sa-R7: EN "Give ... Magic" / native IncreaseSpellPower = the Magic skill, not Mana (was mana()).
      magic('allyRandom', 1, 0.5),
      // 回收：chanceBoost 现支持「每颗X宝石 7% 几率」（SOP 示例句式；boardGems Yellow）
      extraTurn({ chanceBoost: { mod: { kind: 'multiplier', a: 7 }, source: { kind: 'boardGems', color: BaseColor.Yellow } } }),
    ),
  },
  {
    id: 8613,
    desc: '耗掉一名敌人 12 点法力值。创造等同于所耗掉的法力值的骷髅头数。 [1:1]',
    build: skill(
      reduce('enemyChosen', 'mana', 12, 0),
      // 「创造等同于所耗掉的法力值的骷髅头数」= createSkulls 基数 0 + [1:1] drainedMana
      createSkulls(0, 0, {
        modifier: { mod: { kind: 'ratio', a: 1, b: 1 }, source: { kind: 'drainedMana' } },
      }),
    ),
  },
  {
    id: 8688,
    desc: '摧毁一行。给予所有盟友 [魔法 + 1] 点护甲值，数值因被摧毁的黄色宝石而增强。若有一名秘士盟友，则给予其 3 点魔力值。 [x3]',
    build: skill(
      // 「摧毁一行」照 batch-01 7016 / batch-03 先例 → 选定行；护甲段同 batch-11 7056 结构
      destroyChosenRow(),
      armor('allyAll', 1, 1, {
        modifier: { mod: { kind: 'multiplier', a: 3 }, source: { kind: 'destroyedGems', color: BaseColor.Yellow } },
      }),
      // 回收（第五遍）：「若有一名X族盟友，则给予其N点」裁定——「其」= 该族盟友本人（自动指定）
      // → N 段挂 allyWeakest（最危族员）+ targetRace（秘士 = Mystic，batch-16 9240 先例）；
      // 无秘士存活盟友时段自动跳过 = 「若有一名」语义；禁用 allyChosen + targetRace（选定后过滤、不感知种族）
      magic('allyWeakest', 3, 0, { targetRace: 'Mystic' }),
    ),
  },
  {
    id: 8759,
    desc: '给予一名盟友 1 点魔力值。板面上每有一颗红色宝石，则有 7% 的几率获得一个额外回合。 [x7]',
    build: skill(
      // 「魔力值」= magic 属性（SOP 措辞裁定）；缩放为空 → 常数（mult=0）
      magic('allyChosen', 1, 0),
      // 回收：chanceBoost 现支持「每颗X宝石 7% 几率」（SOP 示例句式；boardGems Red）
      extraTurn({ chanceBoost: { mod: { kind: 'multiplier', a: 7 }, source: { kind: 'boardGems', color: BaseColor.Red } } }),
    ),
  },
  {
    id: 8780,
    desc: '完全医治一名盟友。板面上每有一颗绿色宝石，则有 7% 的几率获得一个额外回合。 [x7]',
    build: skill(
      // 「完全医治」= 全额治疗 full（SOP §3「恢复所有生命值」同款）
      heal('allyChosen', 0, 0, { full: true }),
      // 回收：chanceBoost 现支持「每颗X宝石 7% 几率」（SOP 示例句式；boardGems Green）
      extraTurn({ chanceBoost: { mod: { kind: 'multiplier', a: 7 }, source: { kind: 'boardGems', color: BaseColor.Green } } }),
    ),
  },
  {
    id: 8851,
    desc: '对一名敌人造成[(魔法 x 2) + 3]点真实伤害。对敌人造成中毒和流血3次叠加。如果他们已经中毒，有 50% 的几率杀死他们。',
    build: skill(
      trueDmg('enemyChosen', 3, 2),
      // 回收（第四遍）：「中毒和流血3次叠加」按邻接解析 = 普通中毒 + 3 层流血
      //（双子座 8752「诅咒和叠加 3 倍的出血状态」同构句式；中毒非叠层状态）；
      // 「对敌人」= 裸敌人回指 enemyChosen（batch-18 9775 / batch-03 7789 先例）
      inflict('poison', 'enemyChosen'),
      inflict('bleed', 'enemyChosen', { stacks: 3 }),
      // 「如果他们已经中毒，有 50% 的几率杀死他们」= execute + chance + ifCond targetStatus
      //（batch-18 9817 / batch-03 7789 先例）；「他们」= 同一指定敌人
      dmg('enemyChosen', 0, 0, { execute: true, chance: 0.5, ifCond: { kind: 'targetStatus', statusId: 'poison' } }),
    ),
  },
];

export const BATCH_27: CuratedBatch = { batch: '27', spells: SPELLS, skipped: SKIPPED };
