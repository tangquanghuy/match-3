/**
 * 人工核对组装 · 批次 07（池：scripts/curated-pools/pool-07.json）
 * 核对者：agent 批次07
 *
 * 语义裁定备注：
 * - 「魔力值」= magic 属性、「法力值」= mana 资源（SOP 措辞裁定；同 batch-06 7465）。
 * - 「真实溅射伤害」= dmgSplash + trueDamage:true（dmgSplash 透传 opts 到 dmg）。
 * - 「以增强」句式（转换宝石以增强伤害）：宝石操作段排在被增强段之前——transformedGems
 *   来源只数「本技能前序段」（batch-04 7002/7010 同款；来源不带色筛选）。
 * - transform 终点可为 'SKULL'（SOP 措辞裁定 + effects/gems.ts transformEndpoint；
 *   batch-04 9061「transform 仅支持色→色」的旧 SKIP 备注已过时）。
 * - 「第一名和最后一名敌人」= 两个确定性目标段（enemyFront + enemyLast）共用同一缩放值
 *   （一个方括号喂双段，batch-04 9667「生命值和护甲」/7027「攻击力和护甲值」同款）。
 * - 「最弱/最强大的两名敌人」= enemyWeakestN/enemyHealthiestN + n（SOP §0 目标措辞表）。
 * - 「与此军队法力颜色相同的 N 颗宝石」= destroyRandomGems 限定色 + CASTER 占位符
 *   （effects/gems.ts randomGems 的 resolveColor 支持 CASTER，从该色池随机取）。
 * - 种族英文名经 troops.json troopTypes 核对：猫族=Raksha（神狮鬃/狮半鬃/虎奇勇士均为
 *   Raksha）、矮人=Dwarf（雷霆锻造器 Dwarf/Construct）、人类=Human（卡迪塔河 Human）。
 * - 「狂怒/妖火/赐福」不在状态白名单；「末日骷髅头」为特殊宝石（厄运家族）。
 */
import { skill, dmg, dmgSplash, trueDmg, heal, armor, attack, magic, mana, reduce, steal,
  inflict, explodeRandomGems, destroyRandomGems, transform, transformToSpecial, CASTER } from '../builders';
import { BaseColor } from '../../types';
import type { CuratedBatch } from './index';

const SKIPPED: { id: number; reason: string }[] = [
  { id: 7672, reason: '语义拿不准（「所有拥有此颜色法力值的盟友」为法力色过滤目标，不在目标措辞表）' },
  { id: 7791, reason: '缺失状态（狂怒）：「若敌人生命值受损，则获得狂怒效果并再造成 10 点伤害」——「再 +10」条件加成现可用 condBonus targetHpDamaged 表达，但「狂怒」仍不在状态白名单（batch-01 7740 同款）' },
    { id: 7808, reason: '二次缩放来源不支持（「生命值和法力值满值的敌军数」无对应来源 kind）' },
  { id: 7812, reason: '语义拿不准（「自身每高于敌方一个技能即窃取 3 点法力值」属性比较条件量无对应机制）' },
  { id: 7935, reason: '语义拿不准（「身负状态效果」为任意状态，不在 condMult 条件域——targetStatus 需具体状态，无「任意状态」条件）' },
    { id: 7960, reason: '语义拿不准（条件倍率：「若其攻击力比较大，则造成双倍伤害」，比较基准不明）' },
  { id: 7987, reason: '语义拿不准（「转换成随机技能值并给予第一位盟友」：窃取转换的目标属性须固定，随机属性给予无对应原语）' },
  { id: 8023, reason: '缺失状态（赐福）' },
  { id: 8025, reason: '语义拿不准（「再对一名随机敌人造成双倍伤害」相对数值口径未在规则手册覆盖，同 batch-04 8944）' },
  { id: 8058, reason: '语义拿不准（跨段目标绑定：「所有被我的法术击到敌人」指回前段溅射目标集）' },
  { id: 8061, reason: '句子式不明（「自身和自身下方的所有盟友」位置目标无对应目标模式，同 batch-06 7668）' },
  { id: 8063, reason: '语义拿不准（「随机负面状态」无对应原语，同 batch-03 8428）' },
  { id: 8089, reason: '二次缩放来源不支持（「紫色的盟友和敌军数量」双侧复合来源无对应 kind，同 batch-06 7479）' },
];

const SPELLS: CuratedBatch['spells'] = [
  {
    id: 7674,
    desc: '爆破 2 颗宝石。对第一名和最后一名敌人造成 [魔法 + 2] 点伤害。',
    build: skill(
      explodeRandomGems(2, 0, 'all'),
      // 「第一名和最后一名敌人」= enemyFront + enemyLast 两段共用同一缩放（文件头备注）
      dmg('enemyFront', 2),
      dmg('enemyLast', 2),
    ),
  },
  {
    id: 7686,
    desc: '给予一名盟友 [魔法 + 1] 点攻击力和 2 点魔力值。若盟友是一名猫族军队，则效果翻倍。',
    build: skill(
      // 「魔力值」= magic 属性（SOP 措辞裁定）；猫族 = Raksha（troopTypes 核对）
      attack('allyChosen', 1, 1, { raceDouble: 'Raksha' }),
      magic('allyChosen', 2, 0, { raceDouble: 'Raksha' }),
    ),
  },
  {
    id: 7719,
    desc: '对一名敌人造成 [魔法 + 4] 点伤害并将之冻结。若敌人已被冻结，则窃取 5 点法力值。',
    build: skill(
      dmg('enemyChosen', 4),
      inflict('frozen', 'enemyChosen'),
      // 回收：ifCond 现支持条件触发（SOP「通用条件触发 / 条件加成」节）；
      // 「窃取法力值」= steal mana→mana（batch-08 先例，SOP ifCond 示例的 reduce 为简化写法）
      steal('enemyChosen', 'mana', 'mana', 5, 0, { ifCond: { kind: 'targetStatus', statusId: 'frozen' } }),
    ),
  },
  {
    id: 7741,
    desc: '对最弱的两名敌人造成 [魔法 + 4] 点伤害。获得 10 点生命值和攻击力。',
    build: skill(
      dmg('enemyWeakestN', 4, 1, { n: 2 }),
      // 「获得 10 点生命值和攻击力」常数喂双属性（batch-04 9667 同款）
      heal('allySelf', 10, 0),
      attack('allySelf', 10, 0),
    ),
  },
  {
    id: 7762,
    desc: '对最虚弱的敌人造成 [魔法 + 3] 点伤害。将所有骷髅头转换成末日骷髅头。',
    build: skill(
      dmg('enemyWeakest', 3),
      // 回收（第六遍）：窗口 C 落地特殊宝石——骷髅→末日骷髅头 = transformToSpecial('SKULL','doomSkull')
      // （SOP「特殊宝石」节原例；末日骷髅头 = doomSkull）
      transformToSpecial('SKULL', 'doomSkull'),
    ),
  },
  {
    id: 7766,
    desc: '对一名敌人造成 [魔法 + 4] 点伤害，并减除其 5 点攻击力。若敌人是怪兽，则造成 3 倍伤害。',
    build: skill(
      // 回收：condMult 现支持 targetRace 条件倍率（SOP「如果敌人是恶魔/怪兽（族），则造成 3 倍伤害」同款；
      // 怪兽 = Monster，troopTypes 全集核实）
      dmg('enemyChosen', 4, 1, { condMult: { times: 3, cond: { kind: 'targetRace', race: 'Monster' } } }),
      reduce('enemyChosen', 'attack', 5, 0),
    ),
  },
  {
    id: 7768,
    desc: '对最强大的两名敌人造成 [魔法 + 4] 点伤害，并将所有蓝色宝石转换成末日骷髅头以增强效果。 [3:1]',
    build: skill(
      // 回收（第六遍）：转化终点为特殊宝石 → transformToSpecial；「以增强」句式转化段前置，
      // transformedGems 来源才数得到（batch-07 7932/7933 头注同款）
      // sa-F2 fix round A (R001): native CountGems Blue ; Damage ; ConvertGems Blue>Doomskull
      dmg('enemyHealthiestN', 4, 1, {
        n: 2,
        modifier: { mod: { kind: 'ratio', a: 3, b: 1 }, source: { kind: 'boardGems', color: BaseColor.Blue } },
      }),
      transformToSpecial(BaseColor.Blue, 'doomSkull'),
    ),
  },
  {
    id: 7817,
    desc: '对一名敌人造成 [魔法 + 1] 点真实伤害，伤害值因其护甲值而增强。 [3:1]',
    build: skill(
      // 「其护甲值」= 本段主目标护甲（lastTarget 在段效果求值前已写入，prototypes.ts）
      trueDmg('enemyChosen', 1, 1, {
        modifier: { mod: { kind: 'ratio', a: 3, b: 1 }, source: { kind: 'targetStat', stat: 'armor' } },
      }),
    ),
  },
  {
    id: 7932,
    desc: '对最弱的两名敌人造成 [魔法 + 2] 点伤害，并将所有棕色宝石转换成绿色以增强效果。 [1:1]',
    build: skill(
      // 「以增强」句式：转化段先执行，transformedGems 来源才数得到（batch-04 头注同款）
      // sa-F2 fix round A (R001): native CountGems Brown ; Damage ; ConvertGems Brown>Green
      dmg('enemyWeakestN', 2, 1, {
        n: 2,
        modifier: { mod: { kind: 'ratio', a: 1, b: 1 }, source: { kind: 'boardGems', color: BaseColor.Brown } },
      }),
      transform(BaseColor.Brown, BaseColor.Green),
    ),
  },
  {
    id: 7933,
    desc: '对前两名敌人造成 [魔法 + 3] 点伤害，并将所有黄色宝石转换成骷髅头以增强效果。 [1:1]',
    build: skill(
      // 转化段前置（同 7932）；骷髅端点 'SKULL' 为 transform 合法端点（SOP 措辞裁定）
      // sa-F2 fix round A (R001): native CountGems Yellow ; Damage ; ConvertGems Yellow>Skull
      dmg('enemyFirstN', 3, 1, {
        n: 2,
        modifier: { mod: { kind: 'ratio', a: 1, b: 1 }, source: { kind: 'boardGems', color: BaseColor.Yellow } },
      }),
      transform(BaseColor.Yellow, 'SKULL'),
    ),
  },
  {
    id: 7942,
    desc: '对一名敌人造成 [魔法 + 2]  点真实溅射伤害，伤害值因下潜的盟友数而增强。 [x2]',
    build: skill(
      // 「因下潜的盟友数」= allyStatusCount('submerged')（SOP 来源计数表原例）
      dmgSplash('enemyChosen', 2, 1, {
        trueDamage: true,
        modifier: { mod: { kind: 'multiplier', a: 2 }, source: { kind: 'allyStatusCount', statusId: 'submerged' } },
      }),
    ),
  },
  {
    id: 7945,
    desc: '对两名随机敌人造成 [魔法 + 2] 点真实溅射伤害。使自身和一名随机盟友下潜。',
    build: skill(
      dmgSplash('enemyRandomN', 2, 1, { n: 2, trueDamage: true }),
      inflict('submerged', 'allySelf'),
      inflict('submerged', 'allyRandomPrefNotPrev'),
    ),
  },
  {
    id: 7962,
    desc: '对一名敌人造成 [魔法 + 4] 点严重的溅射伤害。若敌人身亡，则获得 12 点法力值。',
    build: skill(
      dmgSplash('enemyChosen', 4),
      // 「严重的溅射」同为溅射链；死亡条件可挂增益段（spell-rules.md §4）
      // sa-F: EN 'If an enemy dies' + native AddForKill = any enemy killed by the cast, splash included (7802 castEnemyDied precedent)
      mana('allySelf', 12, 0, { ifCond: { kind: 'castEnemyDied' } }),
    ),
  },
  {
    id: 7969,
    desc: '对一名敌人造成 [魔法 + 2] 点真实伤害。摧毁与此军队法力颜色相同的 5 颗宝石。',
    build: skill(
      trueDmg('enemyChosen', 2),
      // 「此军队法力颜色」= CASTER 占位符；限定色 N 颗 = randomGems 从该色池随机取
      destroyRandomGems(5, 0, 'color', CASTER),
    ),
  },
  {
    id: 7974,
    desc: '对一名敌人造成 [魔法 + 1] 点真实伤害，伤害值因红色宝石数而增强。 [3:1]',
    build: skill(
      trueDmg('enemyChosen', 1, 1, {
        modifier: { mod: { kind: 'ratio', a: 3, b: 1 }, source: { kind: 'boardGems', color: BaseColor.Red } },
      }),
    ),
  },
  {
    id: 7989,
    desc: '对一名敌人造成 [魔法 + 4] 点溅射伤害，伤害值因被缠绕的敌人数而增强。 [x6]',
    build: skill(
      // 「被缠绕的敌人数」= enemyStatusCount('entangle')（batch-06 7461 同款）
      dmgSplash('enemyChosen', 4, 1, {
        modifier: { mod: { kind: 'multiplier', a: 6 }, source: { kind: 'enemyStatusCount', statusId: 'entangle' } },
      }),
    ),
  },
  {
    id: 8041,
    desc: '给予一名盟友 [(魔法 / 2) + 1] 点攻击力和护甲值，在赋予其屏障效果。',
    build: skill(
      // 一个方括号喂双属性（batch-04 9667/7027 同款）；「在赋予」为原文笔误，逐字保留
      attack('allyChosen', 1, 0.5),
      armor('allyChosen', 1, 0.5),
      inflict('barrier', 'allyChosen'),
    ),
  },
  {
    id: 8098,
    desc: '给予一名盟友 [魔法 + 4] 点护甲值和 4 点攻击力。若盟友是一名矮人，则效果翻倍。',
    build: skill(
      // 矮人 = Dwarf（troopTypes 核对）
      // sa-G (R001): native IncreaseAttack before IncreaseArmor
      attack('allyChosen', 4, 0, { raceDouble: 'Dwarf' }),
      armor('allyChosen', 4, 1, { raceDouble: 'Dwarf' }),
    ),
  },
  {
    id: 8110,
    desc: '给予一名盟友 [魔法 + 1] 点生命值和 5 点攻击力。若盟友是一名人类，则效果翻倍。',
    build: skill(
      // 人类 = Human（troopTypes 核对）
      heal('allyChosen', 1, 1, { raceDouble: 'Human' }),
      attack('allyChosen', 5, 0, { raceDouble: 'Human' }),
    ),
  },
];

export const BATCH_07: CuratedBatch = { batch: '07', spells: SPELLS, skipped: SKIPPED };
