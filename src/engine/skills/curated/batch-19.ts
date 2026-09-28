/**
 * 人工核对组装 · 批次 19（池：scripts/curated-pools/pool-19.json）
 * 核对者：agent 批次19
 *
 * 语义裁定备注：
 * - 「移除所有红色宝石以增强伤害效果」（7054）：清除段排在被增强段之前（batch-04 7010 /
 *   batch-12 7215 口径，desc 语序为效果在前、宝石操作在后，按先例重排）；来源带色照
 *   batch-12 7160 同款。7360「因被移除的宝石数」无色限定 → 来源不带色（batch-05 7052 同款）。
 * - 7315/7381「将板面上的X宝石数翻倍。再创造 3 颗X宝石。[1:1]」照 batch-12 7258 骷髅版口径：
 *   createGems(3) + [1:1] boardGems（创造 3+板面数 = 翻倍后再造 3，行为精确等价）。
 * - 「摧毁一组行跟列」（7159）= 选定行 + 选定列（无随机字样 → chosen，batch-03 7384 /
 *   batch-12 7298「摧毁 1 列」同口径）。
 * - 7379 一个方括号喂攻/甲两段（batch-05 7152 同款）；modifier 挂最近数值段 = 护甲段
 *   （batch-05 7334 同款）。
 * - 「所有不死族/恶魔」（7442）= 目标模式照常 + targetRace（Undead/Daemon 经 troops.json
 *   troopTypes 核实；Dragon 同）。
 * - 召唤物 referenceName 程序核实：骸骨恶魔=BoneDaemon(6376)、炼狱之王=InfernalKing(6183)、
 *   受膏者=AnointedOne(6152)、残败者=Remnant(6247)（「受膏者或残败者」= 二选一 → summonRandom）。
 * - 7464「因敌方损失的生命值而增强」：secondary.ts 的 targetStat 仅支持 attack/armor/hp/magic
 *   （missingHp 仅 selfStat 有），无法表达 → SKIP（见 SKIPPED）。
 * - 「蓝色/黄色宝石数量而增强」（7297）无「被摧毁」字样 → boardGems 现读棋盘（batch-08 头注口径）；
 *   「因摧毁的黄色宝石数」（7159/7379）→ destroyedGems 带色（batch-12 7298 同款）。
 */
import { skill, dmg, trueDmg, heal, armor, attack, mana,
  createGems, createMix, createSkulls, destroyColor, destroyChosenRow, destroyChosenCol,
  destroyRandomGems, explodeColor, drainMana, inflict, summonRef, summonRandom, transform,
  extraTurn, CHOSEN } from '../builders';
import { BaseColor } from '../../types';
import type { CuratedBatch } from './index';

const SKIPPED: { id: number; reason: string }[] = [
  { id: 7136, reason: '语义拿不准（「随机爆破 10 颗骷髅头」无随机 N 颗骷髅原语，explodeRandomGems 无法限定骷髅）' },
  { id: 7274, reason: '二次缩放来源不支持（「数值因造成的伤害而增强」为 spell-rules.md §1 明确 blocked 的 exotic 来源）' },
  { id: 7323, reason: '语义拿不准（「减除 [魔法 + 1] 点随机技能值」无对应削减原语（随机属性只支持获得），batch-01 7319 同款）' },
  { id: 7328, reason: '语义拿不准（「施放法力灼烧，伤害值因自身魔力值而增强」灼烧清蓝无伤害段可挂、来源无处附着且 meta.modifier 为空）' },
  { id: 7329, reason: '语义拿不准（「爆破一颗法力宝石」为动态颜色句式无对应原语，同 batch-09 8657）' },
  { id: 7346, reason: '语义拿不准（「获得下列其一…或…或…」三选一分支无法表达，同 batch-04 9027）' },
  { id: 7347, reason: '语义拿不准（「[2:1]」无来源子句可绑定，二次缩放来源不明，batch-04 9493 口径）' },
  { id: 7411, reason: '语义拿不准（「以 X 形状摧毁宝石」形状摧毁家族无对应原语，同 batch-03 8205 / batch-12 7253）' },
  { id: 7415, reason: '语义拿不准（「如果敌人使用黄色法力值，则造成双倍伤害」现可用 condMult targetColor 表达，但「如果敌人是恶魔，则获得一个额外回合」为目标相对条件挂无目标段（extraTurn）——无从判定整段跳过，SOP 条件触发裁定不可如此组装）' },
  { id: 7430, reason: '语义拿不准（「每摧毁一颗蓝色宝石，则冻结一名随机敌人 [1:1]」状态数量无二次缩放支持（status 效果不评估 modifier），inflict 仅支持静态 n）' },
  { id: 7438, reason: '语义拿不准（「下列其一」三选一无法表达；「攻击力/魔力值减半」暂无原语（SOP §3）；「转化为一只巨蟾蜍」兵种转化不支持）' },
  { id: 7440, reason: '语义拿不准（「转化为一名村民」兵种转化不支持，SOP 措辞裁定同款）' },
  { id: 7454, reason: '语义拿不准（条件倍率：「若敌人攻击力低于自身，则伤害翻倍」属性比较条件不在 condMult 条件域，同 batch-07 7960）' },
  { id: 7459, reason: '二次缩放来源不支持（「因敌方的建造军队数而增强」敌方侧种族计数无对应 kind，同 batch-15 8784）' },
  { id: 7464, reason: '二次缩放来源不支持（「因敌方损失的生命值而增强」：targetStat 仅支持 attack/armor/hp/magic，无 missingHp）' },
  { id: 7476, reason: '语义拿不准（「指定盟友的法力颜色」为所选盟友的动态颜色，无对应原语，同 batch-12 7182）' },
];

const SPELLS: CuratedBatch['spells'] = [
  {
    id: 7054,
    desc: '对 1 名敌人造成 [魔法 + 1] 点真实伤害，并移除所有红色宝石以增强伤害效果。获得 4 点生命值。 [2:1]',
    build: skill(
      // 「移除…以增强」句式：清除段先执行，destroyedGems 来源才数得到（batch-04 7010 同款，重排见头注）
      // sa-F2 fix round A (R001): native CountGems Red ; TrueDamage ; RemoveColor Red ; IncreaseHealth 4
      trueDmg('enemyChosen', 1, 1, {
        modifier: { mod: { kind: 'ratio', a: 2, b: 1 }, source: { kind: 'boardGems', color: BaseColor.Red } },
      }),
      destroyColor(BaseColor.Red),
      heal('allySelf', 4, 0),
    ),
  },
  {
    id: 7133,
    desc: '摧毁一列。每摧毁一颗紫色宝石，则创造 4 颗骷髅头。 [x4]',
    build: skill(
      destroyChosenCol(),
      // spell-rules.md §1 核对样例原文：4×被摧毁紫色数；来源带色（batch-12 7298 同款）
      createSkulls(4, 0, {
        modifier: { mod: { kind: 'multiplier', a: 4 }, source: { kind: 'destroyedGems', color: BaseColor.Purple } },
      }),
    ),
  },
  {
    id: 7159,
    desc: '摧毁一组行跟列。对 1 名随机敌人造成 [魔法 + 6] 点伤害，伤害值因被摧毁的黄色宝石数而增强。 [x7]',
    build: skill(
      // 「一组行跟列」= 选定行 + 选定列（头注口径）
      destroyChosenRow(),
      destroyChosenCol(),
      dmg('enemyRandom', 6, 1, {
        modifier: { mod: { kind: 'multiplier', a: 7 }, source: { kind: 'destroyedGems', color: BaseColor.Yellow } },
      }),
    ),
  },
  {
    id: 7179,
    desc: '对所有敌人造成 [(魔法 x 1.5) + 2] 点散射伤害。伤害值因自身生命值而增强。 [1:1]',
    build: skill(
      // 「对所有敌人…散射」：散射只是类型词，全体目标各自结算（SOP 措辞裁定）
      dmg('enemyAll', 2, 1.5, {
        range: 'all',
        modifier: { mod: { kind: 'ratio', a: 1, b: 1 }, source: { kind: 'selfStat', stat: 'hp' } },
      }),
    ),
  },
  {
    id: 7180,
    desc: '将指定的法力颜色转换为紫色。召唤一个蜘蛛群。',
    build: skill(
      // 回收：「将指定的法力颜色转换为X」= transform(CHOSEN, X)（SOP 措辞裁定，7062 先例）；
      // 召唤物 referenceName 程序核实：蜘蛛群=SpiderSwarm(6136)
      transform(CHOSEN, BaseColor.Purple),
      summonRef('SpiderSwarm', 6136),
    ),
  },
  {
    id: 7181,
    desc: '将选定的法力宝石转换成骷髅头。如果板面上有 13 或更多颗紫色宝石，则获得 6 点法力值。',
    build: skill(
      transform(CHOSEN, 'SKULL'),
      // 回收：ifCond 现支持条件触发（SOP「通用条件触发 / 条件加成」节）；boardAtLeast 为全局
      // 条件、增益段整段判定（SOP 节内示例同款）
      mana('allySelf', 6, 0, { ifCond: { kind: 'boardAtLeast', color: BaseColor.Purple, n: 13 } }),
    ),
  },
  {
    id: 7233,
    desc: '给予所有盟友 [(魔法 / 2) + 3] 点生命值。召唤一名骸骨恶魔。',
    build: skill(
      heal('allyAll', 3, 0.5),
      summonRef('BoneDaemon', 6376),
    ),
  },
  {
    id: 7260,
    desc: '随机摧毁 [魔法 + 4] 颗宝石。承受 2 点伤害。如果板面上有 13 颗或更多红色宝石，则获得一个额外回合。',
    build: skill(
      destroyRandomGems(4, 1, 'color'),
      // 「承受 2 点伤害」= 对自身造成 2 点伤害（SOP §0「自身」= allySelf，常数 mult=0）
      dmg('allySelf', 2, 0),
      // 回收：ifCond 现支持条件触发（SOP「通用条件触发 / 条件加成」节，boardAtLeast 全局条件示例同款）
      extraTurn({ ifCond: { kind: 'boardAtLeast', color: BaseColor.Red, n: 13 } }),
    ),
  },
  {
    id: 7297,
    desc: '对所有敌人造成 [魔法 + 4] 点真实散射伤害，伤害值因蓝色宝石数量而增强。若有敌人身亡，则冻结所有敌人。 [x2]',
    build: skill(
      // 「对所有敌人…散射」= 类型词；「蓝色宝石数量」无「被摧毁」字样 → boardGems 现读棋盘（batch-08 头注）
      trueDmg('enemyAll', 4, 1, {
        range: 'all',
        modifier: { mod: { kind: 'multiplier', a: 2 }, source: { kind: 'boardGems', color: BaseColor.Blue } },
      }),
      // 「若有敌人身亡」= 死亡条件判最近产目标段（dmg）主目标（spell-rules.md §4）
      inflict('frozen', 'enemyAll', { ifTargetDied: true }),
    ),
  },
  {
    id: 7301,
    desc: '对 1 名敌人造成 [魔法 + 3] 点伤害。如果敌人是恶魔，则造成两倍伤害。如果敌人身亡，则给予 1 名随机盟友 8 点生命值。',
    build: skill(
      // 「如果敌人是恶魔，则两倍伤害」= raceDouble 逐受击目标判定（batch-05 7209 同款）
      dmg('enemyChosen', 3, 1, { raceDouble: 'Daemon' }),
      heal('allyRandom', 8, 0, { ifTargetDied: true }),
    ),
  },
  {
    id: 7303,
    desc: '爆破指定颜色的所有宝石。召唤一名炼狱之王。',
    build: skill(
      explodeColor(CHOSEN),
      summonRef('InfernalKing', 6183),
    ),
  },
  {
    id: 7311,
    desc: '对最虚弱的敌人造成 [魔法 + 4] 点伤害，伤害值因蓝色盟友数量而增强。如果敌人身亡，则创造 8 颗蓝色宝石。 [x4]',
    build: skill(
      // 「蓝色盟友数量」= alliesOfColor（batch-09 8672 / batch-15 8526 同款）
      dmg('enemyWeakest', 4, 1, {
        modifier: { mod: { kind: 'multiplier', a: 4 }, source: { kind: 'alliesOfColor', color: BaseColor.Blue } },
      }),
      createGems(BaseColor.Blue, 8, 0, { ifTargetDied: true }),
    ),
  },
  {
    id: 7315,
    desc: '将板面上的蓝色宝石数翻倍。再创造 3 颗蓝色宝石。 [1:1]',
    build: skill(
      // 翻倍 = 按现有蓝宝石数逐颗补造：创造 3+板面蓝数 = 翻倍后再造 3（batch-12 7258 骷髅版同款）
      createGems(BaseColor.Blue, 3, 0, {
        modifier: { mod: { kind: 'ratio', a: 1, b: 1 }, source: { kind: 'boardGems', color: BaseColor.Blue } },
      }),
    ),
  },
  {
    id: 7341,
    desc: '耗尽所有敌人的法力值。对 1 名敌人造成 [魔法 + 5] 点伤害，伤害值因所耗尽的法力值而增强。 [x2]',
    build: skill(
      drainMana('enemyAll'),
      // 来源 drainedMana = 前序段耗掉的敌方法力总和（batch-05 7142 同款）
      dmg('enemyChosen', 5, 1, {
        modifier: { mod: { kind: 'multiplier', a: 2 }, source: { kind: 'drainedMana' } },
      }),
    ),
  },
  {
    id: 7360,
    desc: '移除指定颜色的所有宝石。对第一名敌人造成 [魔法 + 2] 点真实伤害，伤害值因被移除的宝石数而增强。 [3:1]',
    build: skill(
      // 「被移除的宝石数」无色限定 → 来源不带色（batch-05 7052 同款）
      // sa-F2 fix round A (R001): native CountGems FromTarget ; TrueDamage@FrontEnemy ; RemoveColor FromTarget
      trueDmg('enemyFront', 2, 1, {
        modifier: { mod: { kind: 'ratio', a: 3, b: 1 }, source: { kind: 'boardGems', color: 'CHOSEN' } },
      }),
      destroyColor(CHOSEN),
    ),
  },
  {
    id: 7379,
    desc: '摧毁 1 列。为所有龙族盟友增加 [魔法] 点攻击力和护甲值，所增加的点数因摧毁的黄色宝石数而增强。 [x2]',
    build: skill(
      destroyChosenCol(),
      // 一个方括号喂攻/甲两段（batch-05 7152 同款）；「所有龙族盟友」= targetRace（SOP 措辞裁定）
      attack('allyAll', 0, 1, { targetRace: 'Dragon' }),
      // modifier 挂最近数值段 = 护甲段（batch-05 7334 同款）
      armor('allyAll', 0, 1, {
        targetRace: 'Dragon',
        modifier: { mod: { kind: 'multiplier', a: 2 }, source: { kind: 'destroyedGems', color: BaseColor.Yellow } },
      }),
    ),
  },
  {
    id: 7381,
    desc: '将板面上的棕色宝石数翻倍。再创造 3 颗棕色宝石。 [1:1]',
    build: skill(
      // 翻倍 = 按现有棕宝石数逐颗补造（7315 同款，batch-12 7258 口径）
      createGems(BaseColor.Brown, 3, 0, {
        modifier: { mod: { kind: 'ratio', a: 1, b: 1 }, source: { kind: 'boardGems', color: BaseColor.Brown } },
      }),
    ),
  },
  {
    id: 7389,
    desc: '创造 9 颗红色宝石。召唤一名受膏者或残败者。',
    build: skill(
      createGems(BaseColor.Red, 9, 0),
      // 「受膏者或残败者」= 二者随机其一 → summonRandom（referenceName 已核实）
      summonRandom(['AnointedOne', 'Remnant']),
    ),
  },
  {
    id: 7405,
    desc: '创造 15 颗宝石，所创造的宝石混合绿色和一种选定类型。所有其他盟友获得 [魔法 + 1] 点生命值，点数因被缠绕的敌军数量而增强。 [x4]',
    build: skill(
      // 「混合绿色和一种选定类型」= createMix([color, CHOSEN])（SOP §3）
      createMix([BaseColor.Green, CHOSEN], 15, 0),
      // 「被缠绕的敌军数量」= enemyStatusCount（batch-06 7652 同款）
      heal('allyOthers', 1, 1, {
        modifier: { mod: { kind: 'multiplier', a: 4 }, source: { kind: 'enemyStatusCount', statusId: 'entangle' } },
      }),
    ),
  },
  {
    id: 7409,
    desc: '创造 15 颗宝石，所创造的宝石混合棕色和一种选定类型。所有其他盟友获得 [魔法 + 3] 点护甲值，点数因被击晕的敌军数量而增强。 [x4]',
    build: skill(
      createMix([BaseColor.Brown, CHOSEN], 15, 0),
      armor('allyOthers', 3, 1, {
        modifier: { mod: { kind: 'multiplier', a: 4 }, source: { kind: 'enemyStatusCount', statusId: 'stun' } },
      }),
    ),
  },
  {
    id: 7442,
    desc: '对所有敌人造成 [魔法 + 2] 点伤害，伤害值因自身的护甲值而增强。燃烧所有不死族并沉默所有恶魔。 [2:1]',
    build: skill(
      dmg('enemyAll', 2, 1, {
        range: 'all',
        modifier: { mod: { kind: 'ratio', a: 2, b: 1 }, source: { kind: 'selfStat', stat: 'armor' } },
      }),
      // 「所有不死族/恶魔」= 目标模式照常 + targetRace（种族英文经 troopTypes 核实）
      inflict('burning', 'enemyAll', { targetRace: 'Undead' }),
      inflict('silence', 'enemyAll', { targetRace: 'Daemon' }),
    ),
  },
];

export const BATCH_19: CuratedBatch = { batch: '19', spells: SPELLS, skipped: SKIPPED };
