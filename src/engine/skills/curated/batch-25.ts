/**
 * 人工核对组装 · 批次 25（池：scripts/curated-pools/pool-25.json）
 * 核对者：agent 批次25
 *
 * 语义裁定备注：
 * - 「随机一名敌人」= enemyRandom（SOP §0 目标表）；「我的护甲值/自身攻击力」= selfStat 来源
 *   （SOP 来源计数表口径）。
 * - 「造成真实伤害，移除所有X宝石。伤害值因移除的宝石数而增强」：清除段前移、来源
 *   destroyedGems 不带色筛选（色限定由宝石操作段本身承担，batch-04 7010 同款）。
 * - 「创造蓝色宝石，数量与所耗尽的法力值等同」= createGems 基数 0 + [1:1] drainedMana
 *   （base 0 + modifier 为 batch-04 7010 / batch-14 8251 同款口径）。
 * - 「受兽人盟友加成」= alliesOfRace（batch-17 9592「因巨人盟友」同款；Orc 已核 troopTypes）。
 * - 尾缀 [xN]/[N:M] 标记逐字保留；本池大量「防御塔/升华/升阶」「毒素/传送门/沉没等
 *   特殊宝石」「棋盘计数条件触发」「随机状态」句式 → 各按标准原因 SKIP（见下）。
 */
import { skill, dmg, trueDmg, armor, reduce, drainMana, inflict,
  createGems, createSkulls, createMix, randomStat, extraTurn, destroyColor,
  summonRef, CHOSEN } from '../builders';
import { BaseColor } from '../../types';
import type { CuratedBatch } from './index';

const SKIPPED: { id: number; reason: string }[] = [
  { id: 7032, reason: '数值不明（[1:1] 未在文本中说明二次缩放来源，batch-16 9223 同款）' },
  { id: 7207, reason: '语义拿不准（「再造成 8 点伤害，随机分配给所有敌人」伤害随机分配无对应原语）' },
  { id: 7231, reason: '二次缩放来源不支持（「数量因被减除的护甲值而增强」，SOP 措辞裁定明示）' },
  { id: 7314, reason: '语义拿不准（「有 50% 的几率打错敌人」目标偏移无对应机制；「如果对方使用黄色法力值，则造成三倍伤害」条件倍率现可表达但整条仍卡）' },
  { id: 7332, reason: '语义拿不准（「若板面有 13+ 蓝宝石则获得一个额外回合」条件触发现可用 ifCond boardAtLeast 表达，但「法力灼烧，伤害值因自身魔力值而增强」灼烧清蓝无伤害段可挂、且无 [xN] 标记 meta.modifier 为空，增强量数值不明，batch-19 7328 同款）' },
  { id: 7394, reason: '句子式不明（「摧毁自身」即死无对应原语，batch-06 7635 同款）' },
  { id: 7429, reason: '语义拿不准（「将敌方攻击力减半」暂无原语（SOP §3）；「如果对方使用绿色法力值，则造成两倍伤害」条件倍率现可表达但整条仍卡）' },
  { id: 7433, reason: '二次缩放来源不支持（「每摧毁一个骷髅头，便使一名随机敌人陷入中毒」= 状态施加数量随来源增强，状态段无 modifier 挂点；另注：destroyedGems 无色来源实际含骷髅——引擎 secondary.ts 口径，7052 审计确认）' },
  { id: 7463, reason: '语义拿不准（「以 X 形状摧毁宝石」形状摧毁家族无对应原语，batch-19 7411 同款）' },
  { id: 7478, reason: '二次缩放来源不支持（「因选定的颜色数量而增强」——选色计数无对应 kind，boardGems 仅支持棋盘色宝石，batch-16 8798 同款）' },
  { id: 7501, reason: '语义拿不准（「召唤 1 到 3 名」数量区间无对应原语，batch-22 8546 同款）' },
  { id: 7539, reason: '语义拿不准（「窃取所有受法术伤害的敌人」按「受本技能伤害」过滤目标无法表达）' },
  { id: 9846, reason: '语义拿不准（「施加一个随机状态效果」随机状态无对应原语，batch-07 7994 同款）' },
  { id: 9849, reason: '特殊宝石（恶魔传送门宝石，batch-11 9466 同款）；「消除随机技能值」亦无削减原语（batch-01 7319 同款）' },
  { id: 9859, reason: '特殊宝石（毒素宝石，batch-18 9871 同款）；「如果敌人中毒，则造成双倍伤害」条件倍率现可表达但整条仍卡' },
  { id: 9866, reason: '晋升度条件（「如果该敌人是防御塔，则基于我已晋升的稀有度造成 3 到 5 倍伤害」，batch-20 7790 同款）；毒宝石/腐朽宝石亦为特殊宝石' },
  { id: 9868, reason: '特殊宝石（毒素宝石）；「扰乱敌方队伍」亦无对应原语' },
  { id: 9875, reason: '晋升度条件（「如果敌人是防御塔，则基于我已晋升的稀有度造成 3 到 5 倍伤害」，batch-20 7790 同款）' },
  { id: 9955, reason: '晋升度条件（防御塔/升阶等级，batch-20 7790 同款）' },
  { id: 9956, reason: '特殊宝石（恐惧宝石）；「所有该颜色敌人」目标语义亦不明' },
  { id: 9958, reason: '句子式不明（「引爆一排敌人」带宾语清行无先例覆盖，batch-18 9790 同款）' },
  { id: 9986, reason: '缺失状态（恐惧，batch-17 9478 同款）；「对一名敌人和三名随机敌人」双目标共用一次缩放亦存疑' },
  { id: 10061, reason: '隐匿/位置操作（「将其拉到后方」，batch-01 7439 同款）；「击杀几率受其护甲值提升」现可用 chanceBoost targetStat 表达但整条仍卡' },
];

const SPELLS: CuratedBatch['spells'] = [
  {
    id: 7206,
    desc: '缠绕一名敌人，并耗尽其法力值。创造 6 颗棕色宝石，宝石数因耗尽的法力值数而增强。 [4:1]',
    build: skill(
      // 「其」= 前文「一名敌人」（自指目标确定，batch-01 7153 同款）
      inflict('entangle', 'enemyChosen'),
      drainMana('enemyChosen'),
      createGems(BaseColor.Brown, 6, 0, {
        modifier: { mod: { kind: 'ratio', a: 4, b: 1 }, source: { kind: 'drainedMana' } },
      }),
    ),
  },
  {
    id: 7339,
    desc: '燃烧所有敌人。对 1 名敌人造成 [魔法 + 1] 点伤害，伤害值因自身攻击力而增强。如果敌人身亡，则获得一个额外回合。 [1:1]',
    // sa-F1 (R001): native CountAttack → Damage → CauseBurning@AllEnemies → ExtraTurnConditional AddForKill.
    build: skill(
      dmg('enemyChosen', 1, 1, {
        modifier: { mod: { kind: 'ratio', a: 1, b: 1 }, source: { kind: 'selfStat', stat: 'attack' } },
      }),
      inflict('burning', 'enemyAll'),
      extraTurn({ ifCond: { kind: 'castEnemyDied' } }),
    ),
  },
  {
    id: 7349,
    desc: '耗尽一名敌人 7 点法力值。造成 [魔法 + 1] 点真实伤害，移除所有黄色宝石。伤害值因移除的宝石数而增强。 [2:1]',
    build: skill(
      // Native (R001, sa-F1): CountGems Yellow 50 → DecreaseMana 7 → TrueDamage +count → RemoveColor Yellow.
      // The count is the Yellow gems on the board before the removal, so the removal stays last.
      reduce('enemyChosen', 'mana', 7, 0),
      trueDmg('enemyChosen', 1, 1, {
        modifier: { mod: { kind: 'ratio', a: 2, b: 1 }, source: { kind: 'boardGems', color: BaseColor.Yellow } },
      }),
      destroyColor(BaseColor.Yellow),
    ),
  },
  {
    id: 7403,
    desc: '对 1 名敌人造成 [魔法 + 1] 点伤害，伤害值因敌方全体魔力值而增强。如果有 13 颗或更多红色宝石，则召唤一只装甲野猪。 [2:1]',
    build: skill(
      dmg('enemyChosen', 1, 1, {
        modifier: { mod: { kind: 'ratio', a: 2, b: 1 }, source: { kind: 'enemyStatSum', stat: 'magic' } },
      }),
      // 回收：ifCond 现支持条件触发（SOP「通用条件触发 / 条件加成」节）；boardAtLeast 为全局
      // 条件、召唤段整段判定；summonRef 无 opts 参 → 展开补挂（batch-13 7643 同款写法）；
      // 装甲野猪 = ArmoredBoar（troops.json 6245，§6 命令核实）
      { ...summonRef('ArmoredBoar', 6245), ifCond: { kind: 'boardAtLeast', color: BaseColor.Red, n: 13 } },
    ),
  },
  {
    id: 7407,
    desc: "创造 15 颗宝石，所创造的宝石混合黄色和一种选定类型。所有其他盟友各有一项随机属性获得 [魔法 + 2] 点，点数因陷入沉默状态的敌军数量而增强。 [x4]",
    build: skill(
      // 「混合黄色和一种选定类型」= createMix([color, CHOSEN])（batch-19 同款）
      createMix([BaseColor.Yellow, CHOSEN], 15, 0),
      randomStat('allyOthers', 2, 1, { oneSkill: true,
        modifier: { mod: { kind: 'multiplier', a: 4 }, source: { kind: 'enemyStatusCount', statusId: 'silence' } },
      }),
    ),
  },
  {
    id: 7467,
    desc: '耗尽一名敌人上至 12 点法力值。创造蓝色宝石，数量与所耗尽的法力值等同。 [1:1]',
    build: skill(
      // 「上至 12 点」= 削减 12（夹零后至多 12）；「数量与所耗尽的法力值等同」= 基数 0 + [1:1] drainedMana
      reduce('enemyChosen', 'mana', 12, 0),
      createGems(BaseColor.Blue, 0, 0, {
        modifier: { mod: { kind: 'ratio', a: 1, b: 1 }, source: { kind: 'drainedMana' } },
      }),
    ),
  },
  {
    id: 7488,
    desc: '对 1 名敌人造成 [魔法 + 6] 点伤害，伤害值因被冻结的敌人数而增强。冻结敌人。如敌人身亡，则创造 10 颗蓝色宝石。 [x4]',
    build: skill(
      dmg('enemyChosen', 6, 1, {
        modifier: { mod: { kind: 'multiplier', a: 4 }, source: { kind: 'enemyStatusCount', statusId: 'frozen' } },
      }),
      inflict('frozen', 'enemyChosen'),
      createGems(BaseColor.Blue, 10, 0, { ifTargetDied: true }),
    ),
  },
  {
    id: 9850,
    desc: '对随机一名敌人造成[魔法 + 3]点伤害，伤害值因我的护甲值而增强。如果敌人死亡，则获得10点护甲值。 [4:1]',
    build: skill(
      dmg('enemyRandom', 3, 1, {
        modifier: { mod: { kind: 'ratio', a: 4, b: 1 }, source: { kind: 'selfStat', stat: 'armor' } },
      }),
      armor('allySelf', 10, 0, { ifTargetDied: true }),
    ),
  },
  {
    id: 9863,
    desc: '对一名敌人造成[魔法 + 3]点伤害，受兽人盟友加成。然后生成7个骷髅头，如果敌人死亡，则额外生成5个。 [x3]',
    build: skill(
      // 「受兽人盟友加成」= alliesOfRace（batch-17 9592「因巨人盟友」同款）
      dmg('enemyChosen', 3, 1, {
        modifier: { mod: { kind: 'multiplier', a: 3 }, source: { kind: 'alliesOfRace', race: 'Orc' } },
      }),
      createSkulls(7, 0),
      createSkulls(5, 0, { ifTargetDied: true }),
    ),
  },
  {
    id: 9882,
    desc: '对3名随机敌人造成[魔法 + 3]点伤害，伤害值受我的攻击力、生命值和护甲值加成。如果他们使用了红色法力值，则造成双倍伤害。 [4:1]',
    build: skill(
      // 回收：condMult 现支持 targetColor 条件倍率（按目标 manaColors 含该色判定，逐受击目标）；
      // 「我的攻击力、生命值和护甲值」三来源 → sources 计数相加（SOP §3）
      dmg('enemyRandomN', 3, 1, {
        n: 3, randomWaves: 3,
        modifier: {
          mod: { kind: 'ratio', a: 4, b: 1 }, pooled: true, // 原生单步 CountAttackArmorLife：三项合计后一次取整
          sources: [{ kind: 'selfStat', stat: 'attack' }, { kind: 'selfStat', stat: 'hp' }, { kind: 'selfStat', stat: 'armor' }],
        },
        condMult: { times: 2, cond: { kind: 'targetColor', color: BaseColor.Red } },
      }),
    ),
  },
];

export const BATCH_25: CuratedBatch = { batch: '25', spells: SPELLS, skipped: SKIPPED };
