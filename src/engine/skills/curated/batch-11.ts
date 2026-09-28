/**
 * 人工核对组装 · 批次 11（池：scripts/curated-pools/pool-11.json）
 * 核对者：agent 批次11
 *
 * 语义裁定备注：
 * - 种族英文名经 troops.json troopTypes 核对：金牛座=Tauros、半人马=Centaur、
 *   元素=Elemental、不死族=Undead、神秘=Mystic（均为 troopTypes 取值域内）。
 * - 「魔力值」= magic 属性、「法力值」= mana 资源（SOP 措辞裁定；7022/9732 同口径）。
 * - 「爆破一颗宝石」（无「随机」字样）→ explodeAt(CELL)
 *   （batch-03 头注 + batch-07 7674「爆破 2 颗宝石」同口径）。
 * - 「对首位和末位敌人」= enemyFront + enemyLast 两段共用同一缩放（batch-05 7059/
 *   batch-07 7674「第一名和最后一名敌人」同款）；修饰子句辖本子句内全部同类段
 *   （spell-rules §1 多同类段辖域，2026-09-16 裁定，9344 两段都挂 modifier）。
 * - 多来源 modifier（「纠缠和流血敌人」「红色和黄色宝石」）用 sources 数组计数相加
 *   （SOP §3 + secondary.ts ModifierSpec.sources；本仓库批文件首次使用，请复核 9938/9852）。
 * - 「对敌人造成…」=「对(一名)敌人」，官方汉化省略量词 → enemyChosen
 *   （pool-04 7031 同句式仅因特殊宝石被跳过，未视为阻断；请复核 9852）。
 * - 「有 30% 的几率燃烧敌人」=「燃烧(一名)敌人」→ enemyChosen（batch-04 7006「燃烧一名敌人」
 *   → enemyChosen 同口径；请复核 7041）。
 * - 7050「如果敌人身亡者获得 4 点攻击力」：「者」为「则」之笔误（batch-07 8041 处理笔误同款），
 *   逐字保留原文。
 */
import { skill, dmg, dmgAll, trueDmg, heal, armor, attack, magic, cleanse, reduce, inflict, createGems, createSkulls, oneOf, destroyChosenRow, destroyColor, explodeRandomGems, extraTurn, CELL, explodeAt } from '../builders';
import { BaseColor } from '../../types';
import type { CuratedBatch } from './index';

const SKIPPED: { id: number; reason: string }[] = [
  { id: 7060, reason: '语义拿不准（「冻结敌人」指回前段随机敌人，跨段随机目标绑定不做，同 batch-06 7396）' },
  { id: 9256, reason: '语义拿不准（「使他们陷入中毒状态」跨段指回 2 名随机敌人无法绑定，同 batch-06 7396；「30% 的几率转化成一个蛇怪」兵种转化亦无原语）' },
  { id: 9319, reason: '特殊宝石（冻结宝石），且「其 1 法力颜色」为敌方法力色动态颜色' },
  { id: 9346, reason: '隐匿/位置操作（「再将他打回末位」，同 batch-05 7255）' },
  { id: 9466, reason: '特殊宝石（恶魔传送门宝石），且「1-3 个」区间创造数值不明' },
  { id: 9471, reason: '句子式不明（「造成…散射伤害」未指明目标，batch-02 7265 同款；来源「友方和敌方恶魔和娜迦」双侧复合亦无对应 kind）' },
  { id: 9472, reason: '语义拿不准（「随机状态效果」无对应原语，同 batch-07 7994）' },
  { id: 9534, reason: '语义拿不准（「对 3 名随机敌人…并吸取 8 点法力值」伤害与耗蓝须同一批随机目标，跨段随机绑定不支持，batch-06 7396 同款；「如果敌人中毒，则吸取双倍法力值」条件倍率现已可表达但整条仍卡）' },
  { id: 9540, reason: '语义拿不准（「与其法力颜色相同的宝石」按敌方法力色动态选色，动态颜色不做，同 batch-09 8741）' },
  { id: 9550, reason: '语义拿不准（条件触发：「如果他们使用紫色法力值，则恢复我一半的法力值」；「一半」减半亦无原语）' },
  { id: 9571, reason: '语义拿不准（「并将其作为生命赋予最弱的盟友」跨段绑定伤害值为治疗量，无对应原语）' },
  { id: 9594, reason: '语义拿不准（条件触发：「如果他们是元素生物，则祝福并使其受到屏障效果」；「祝福」无对应机制）' },
  { id: 9731, reason: '语义拿不准（「1-3 个负面状态效果」随机负面状态无对应原语，同 batch-07 8063）' },
  { id: 9734, reason: '语义拿不准（条件触发：「如果该盟友是金牛座，则赋予其一半的法力值」；「一半」减半亦无原语）' },
  { id: 9777, reason: '二次缩放来源不支持（流血宝石为特殊宝石）' },
  { id: 9793, reason: '特殊宝石（流血宝石），且「如果我方队伍中有威廉明娜女王」兵种在场条件触发亦不支持' },
  { id: 9816, reason: '语义拿不准（「给予他们一半的法力值」减半无原语，且「他们」跨段指回随机盟友）' },
  { id: 9851, reason: '语义拿不准（「使其中毒」跨段指回 3 名随机敌人无法绑定，同 batch-06 7396）' },
  { id: 9861, reason: '特殊宝石（毒宝石），且「减少随机技能点数」无对应削减原语（batch-01 7319 同款）' },
  { id: 9942, reason: '二次缩放来源不支持（「每有一颗蛛网宝石，击杀几率提高 3%」蛛网宝石为特殊宝石，且几率加成无原语）' },
];

const SPELLS: CuratedBatch['spells'] = [
  {
    id: 7001,
    desc: '减除第一位敌人 [(魔法 / 2) + 1] 点攻击力。则爆破 2 颗随机宝石。',
    build: skill(
      reduce('enemyFront', 'attack', 1, 0.5),
      explodeRandomGems(2, 0, 'color'),
    ),
  },
  {
    id: 7008,
    desc: '爆破一颗宝石。减除所有敌人 [魔法 + 1] 点护甲值，数值因被摧毁的棕色宝石而增强。 [1:1]',
    build: skill(
      explodeAt(CELL),
      // 「因被摧毁的棕色宝石而增强」= destroyedGems 筛棕色（SOP 来源计数表）
      reduce('enemyAll', 'armor', 1, 1, {
        modifier: { mod: { kind: 'ratio', a: 1, b: 1 }, source: { kind: 'destroyedGems', color: BaseColor.Brown } },
      }),
    ),
  },
  {
    id: 7020,
    desc: '对 1 名敌人造成 [魔法 + 3] 点伤害。如果敌人已中毒，则造成双倍伤害。使其陷入中毒状态。',
    build: skill(
      // 回收：condMult 现支持 targetStatus 条件倍率（batch-05 7330 同款）
      dmg('enemyChosen', 3, 1, { condMult: { times: 2, cond: { kind: 'targetStatus', statusId: 'poison' } } }),
      inflict('poison', 'enemyChosen'),
    ),
  },
  {
    id: 7022,
    desc: '对最虚弱的敌人造成 [魔法 + 3] 点真实伤害，并使其陷入中毒状态。如果该敌人身亡，则获得 3 点魔力值。',
    build: skill(
      trueDmg('enemyWeakest', 3),
      // 原生 CausePoison@FromPrevious：只毒同一目标（已阵亡则无目标）
      inflict('poison', 'lastTarget'),
      // 「魔力值」= magic 属性（SOP 措辞裁定，batch-05 7049 同款）；死亡条件只辖本段
      magic('allySelf', 3, 0, { ifTargetDied: true }),
    ),
  },
  {
    id: 7036,
    desc: '创造 7 颗骷髅头。获得 [魔法 + 2] 点护甲值。获得一个额外回合。',
    build: skill(
      createSkulls(7, 0),
      armor('allySelf', 2),
      extraTurn(),
    ),
  },
  {
    id: 7041,
    desc: '爆破一颗宝石。对 1 名随机的敌人造成 [魔法 + 1] 点伤害。有 30% 的几率燃烧敌人。',
    build: skill(
      explodeAt(CELL),
      dmg('enemyRandom', 1),
      // 「燃烧敌人」=「燃烧(一名)敌人」→ enemyChosen（batch-04 7006 同口径，见文件头备注）
      inflict('burning', 'enemyChosen', { chance: 0.3 }),
    ),
  },
  {
    id: 7045,
    desc: '创造 7 颗绿色宝石。给随机一名盟友 [魔法] 点生命值。获得一个额外回合。',
    build: skill(
      createGems(BaseColor.Green, 7, 0),
      heal('allyRandom', 0, 1),
      extraTurn(),
    ),
  },
  {
    id: 7050,
    desc: '净化自身。对 1 名敌人造成 [魔法 + 2] 点伤害。如果敌人身亡者获得 4 点攻击力。',
    build: skill(
      // 原生序 Damage → Delay → Cleanse@Self → IncreaseAttack [AddForKill 4]（R001）；
      // 净化自身会改写 lastTarget → 击杀判定用 castEnemyDied（只有选定敌人受伤害）
      dmg('enemyChosen', 2),
      cleanse('allySelf'),
      attack('allySelf', 4, 0, { ifCond: { kind: 'castEnemyDied' } }),
    ),
  },
  {
    id: 7056,
    desc: '摧毁 1 行。获得 [魔法 + 1] 点护甲值，护甲值因被摧毁的所有绿色宝石数而增强。 [x2]',
    build: skill(
      destroyChosenRow(),
      armor('allySelf', 1, 1, {
        modifier: { mod: { kind: 'multiplier', a: 2 }, source: { kind: 'destroyedGems', color: BaseColor.Green } },
      }),
    ),
  },
  {
    id: 7134,
    desc: '摧毁所有棕色宝石。对一名随机敌人造成 [魔法 + 3] 点伤害，伤害值因被移除的宝石数而增强。 [3:1]',
    build: skill(
      // 清除段先行，destroyedGems 来源才数得到（batch-04/05 口径）；「被移除的宝石数」不筛色
      destroyColor(BaseColor.Brown),
      dmg('enemyRandom', 3, 1, {
        modifier: { mod: { kind: 'ratio', a: 3, b: 1 }, source: { kind: 'destroyedGems' } },
      }),
    ),
  },
  {
    id: 9260,
    desc: '为一名盟友赋予 [魔法 + 1] 点生命和攻击力。如果盟友是金牛座，则效果加倍。',
    build: skill(
      // 金牛座 = Tauros（troopTypes 核对）；raceDouble 逐受益者判定，数值段逐段挂
      heal('allyChosen', 1, 1, { raceDouble: 'Tauros' }),
      attack('allyChosen', 1, 1, { raceDouble: 'Tauros' }),
    ),
  },
  {
    id: 9290,
    desc: '对一名敌人造成 [魔法 + 4] 点伤害，再创造 2 颗红色宝石，数量因元素盟友数而增强。 [x2]',
    build: skill(
      dmg('enemyChosen', 4),
      // 「数量因元素盟友数而增强」点名创造段；元素 = Elemental（troopTypes 核对）
      createGems(BaseColor.Red, 2, 0, {
        modifier: { mod: { kind: 'multiplier', a: 2 }, source: { kind: 'alliesOfRace', race: 'Elemental' } },
      }),
    ),
  },
  {
    id: 9299,
    desc: '对一名敌人造成 [魔法 + 4] 点伤害，再创造 2 颗蓝色宝石，数量因不死族盟友数而增强。 [x2]',
    build: skill(
      dmg('enemyChosen', 4),
      // 不死族 = Undead（troopTypes 核对）
      createGems(BaseColor.Blue, 2, 0, {
        modifier: { mod: { kind: 'multiplier', a: 2 }, source: { kind: 'alliesOfRace', race: 'Undead' } },
      }),
    ),
  },
  {
    id: 9313,
    desc: '对所有敌人造成 [魔法 + 2] 点伤害。然后创造 13 颗蓝色、绿色、红色、黄色或紫色的宝石。',
    build: skill(
      dmgAll(2),
      // sa-R6 L2-7523-one-colour：原生 A+(B-C-D-E-F) = 五色之一创造 13 颗同色，各 1/5（原为五色逐颗混合）
      oneOf(...[BaseColor.Blue, BaseColor.Green, BaseColor.Red, BaseColor.Yellow, BaseColor.Purple].map(c => [createGems(c, 13)])),
    ),
  },
  {
    id: 9344,
    desc: '对首位和末位敌人造成 [魔法 + 2] 点伤害，伤害值因紫色宝石数而增强。 [3:1]',
    build: skill(
      // 「首位和末位」= enemyFront + enemyLast 两段共用同一缩放（batch-05 7059 同款）；
      // 修饰子句辖本子句内全部同类段（spell-rules §1 多同类段辖域，2026-09-16 裁定）：
      // 两段伤害都挂同一 modifier（boardGems 无跨段棋盘变化，同源同值）
      dmg('enemyFront', 2, 1, {
        modifier: { mod: { kind: 'ratio', a: 3, b: 1 }, source: { kind: 'boardGems', color: BaseColor.Purple } },
      }),
      dmg('enemyLast', 2, 1, {
        modifier: { mod: { kind: 'ratio', a: 3, b: 1 }, source: { kind: 'boardGems', color: BaseColor.Purple } },
      }),
    ),
  },
  {
    id: 9732,
    desc: '赋予一名盟友[魔法 + 1]生命值和2点魔力值。如果该盟友是半人马，则效果加倍。',
    build: skill(
      // 半人马 = Centaur（troopTypes 核对）；「魔力值」= magic 属性（SOP 措辞裁定）
      heal('allyChosen', 1, 1, { raceDouble: 'Centaur' }),
      magic('allyChosen', 2, 0, { raceDouble: 'Centaur' }),
    ),
  },
  {
    id: 9789,
    desc: '对敌人造成[魔法 + 3]点伤害，并使其流血。如果敌人已经处于流血状态，则造成双倍伤害。',
    build: skill(
      // 回收：condMult 现支持 targetStatus 条件倍率（batch-05 7330 同款；bleed 在状态白名单）；
      // 「对敌人」=「对(一名)敌人」→ enemyChosen（见文件头备注，9852 同款）
      dmg('enemyChosen', 3, 1, { condMult: { times: 2, cond: { kind: 'targetStatus', statusId: 'bleed' } } }),
      inflict('bleed', 'enemyChosen'),
    ),
  },
  {
    id: 9852,
    desc: '对敌人造成[魔法 + 2]点伤害，红色和黄色宝石可提升伤害。 [4:1]',
    build: skill(
      // 「对敌人」=「对(一名)敌人」→ enemyChosen（见文件头备注，请复核）；
      // 「红色和黄色宝石」双来源 → sources 计数相加（SOP §3，请复核）
      dmg('enemyChosen', 2, 1, {
        modifier: {
          mod: { kind: 'ratio', a: 4, b: 1 },
          sources: [{ kind: 'boardGems', color: BaseColor.Red }, { kind: 'boardGems', color: BaseColor.Yellow }],
        },
      }),
    ),
  },
  {
    id: 9938,
    desc: '对所有敌人造成[魔法 + 2]点伤害，受到纠缠和流血敌人的伤害加成。 [x2]',
    build: skill(
      // 「纠缠和流血敌人」双状态来源 → sources 计数相加（SOP §3，请复核）；
      // bleed 在状态白名单（tests STATUS_WHITELIST）
      dmg('enemyAll', 2, 1, {
        range: 'all',
        modifier: {
          mod: { kind: 'multiplier', a: 2 },
          sources: [{ kind: 'enemyStatusCount', statusId: 'entangle' }, { kind: 'enemyStatusCount', statusId: 'bleed' }],
        },
      }),
    ),
  },
  {
    id: 9944,
    desc: '对 2 个随机敌人造成 [魔法 + 3] 点伤害，受到神秘盟友的加成。 [x2]',
    build: skill(
      // 神秘 = Mystic（troopTypes 核对）；modifier 挂本伤害段
      dmg('enemyRandomN', 3, 1, {
        n: 2, randomWaves: 2,
        modifier: { mod: { kind: 'multiplier', a: 2 }, source: { kind: 'alliesOfRace', race: 'Mystic' } },
      }),
    ),
  },
];

export const BATCH_11: CuratedBatch = { batch: '11', spells: SPELLS, skipped: SKIPPED };
