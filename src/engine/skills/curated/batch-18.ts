/**
 * 人工核对组装 · 批次 18（池：scripts/curated-pools/pool-18.json）
 * 核对者：agent 批次18
 *
 * 语义裁定备注：
 * - 「由X盟友提供增益 / 由X盟友强化 / 受到X盟友的增益」=「数量因X盟友数而增强」同族
 *   （batch-17 9245「数量由金牛座盟友增强」同款）→ createGems + modifier alliesOfRace。
 * - 种族中文→英文经 troops.json 核对：骑士=Knight、矮人=Dwarf、金牛座=Tauros（batch-17 先例）、
 *   龙族=Dragon、罗刹=Raksha、人类=Human、兽人=Orc、乌尔斯卡=Urska（batch-10 9190「厄什卡」
 *   同物）、神秘=Mystic（batch-16 9240「秘士」同物）、机械=Mech；
 *   「野蛮人」无 troopTypes 白名单对应（蛮族=Wildfolk 先例措辞不同）→ 9643 SKIP。
 * - 裸「造成…散射伤害」未指明目标 → SKIP 句子式不明（batch-02 7265 / 09 8639 / 12 7353 /
 *   13 7470 / 14 8459 同款，无先例破例）。
 * - 「摧毁一排敌人 / 摧毁一列敌人」带宾语「敌人」的清行/清列无任何先例覆盖 → SKIP 句子式不明。
 * - 特殊宝石家族（恐怖/石像鬼/剧毒/网状/愤怒/流血/衰败/毒/狼人/屏障/冰冻/蛛网/幽灵/
 *   元素之星/暗影星辰/战利品）一律 SKIP，不做近似降级；作为二次缩放来源出现时按 SOP
 *   挂「二次缩放来源不支持」。
 * - 「每有一名流血的敌人，回复2点法力值」= mana('allySelf') + modifier enemyStatusCount('bleed')
 *   （bleed 在状态白名单内，batch-01 8531 先例）。
 */
import { skill, dmg, trueDmg, heal, mana, reduce, inflict, createGems, transform,
  destroyChosenRow, destroyChosenCol, CHOSEN } from '../builders';
import { BaseColor } from '../../types';
import type { CuratedBatch } from './index';

const SKIPPED: { id: number; reason: string }[] = [
  { id: 9643, reason: '语义拿不准（「野蛮人盟友」无 troopTypes 白名单对应；蛮族=Wildfolk 先例措辞不同，禁止猜）' },
  { id: 9656, reason: '特殊宝石（邪恶石像鬼宝石/剧毒宝石）' },
  { id: 9666, reason: '特殊宝石（网状宝石）' },
  { id: 9717, reason: '二次缩放来源不支持（「因暗影星辰而增强」——暗影之星/Umbral Star 为 GEMS-SEMANTICS-2 D2，状态宝石波A未含）；「赋予所有盟友1-3个随机增益效果」亦无对应原语' },
  { id: 9737, reason: '特殊宝石（愤怒宝石）' },
  { id: 9740, reason: '语义拿不准（[100:1] 二次缩放在描述中无来源子句，来源无法判读）' },
  { id: 9780, reason: '特殊宝石（流血宝石）' },
  { id: 9787, reason: '特殊宝石（流血宝石/衰败宝石）' },
  { id: 9790, reason: '句子式不明（「摧毁一排敌人」带宾语清行无先例覆盖，batch-18 池内首见）' },
  { id: 9857, reason: '缺失状态（祝福）；「受祝福盟友加成」计数亦不可表达' },
  { id: 9865, reason: '句子式不明（「造成…散射伤害」未指明目标，batch-02 7265 同款）' },
  { id: 9881, reason: '隐匿/位置操作（「击退到后方」）' },
  { id: 9905, reason: '句子式不明（「摧毁一列敌人」带宾语清列无先例覆盖，同 9790）' },
  { id: 9907, reason: '特殊宝石（狼人宝石；「屏障宝石」亦为特殊宝石）' },
  { id: 9947, reason: '特殊宝石（冰冻宝石/蛛网宝石）' },
  { id: 9954, reason: '特殊宝石（幽灵宝石/屏障宝石）' },
  { id: 9957, reason: '特殊宝石（毒宝石）；「该敌人的一种法力颜色」动态颜色亦不做' },
  { id: 10057, reason: '特殊宝石（元素之星）；「施加以下效果之一」四选一亦无对应原语' },
];

const SPELLS: CuratedBatch['spells'] = [
  {
    id: 7013,
    desc: '将所有黄色宝石转换成指定的颜色。给予第一名盟友 [魔法 + 1] 点生命值，点数因转换的宝石数而增强。 [3:1]',
    build: skill(
      transform(BaseColor.Yellow, CHOSEN),
      heal('allyFront', 1, 1, {
        modifier: { mod: { kind: 'ratio', a: 3, b: 1 }, source: { kind: 'transformedGems' } },
      }),
    ),
  },
  {
    id: 9642,
    desc: '摧毁一行。对 2 名随机敌人造成 [魔法 + 3] 点伤害，伤害值因摧毁的绿色宝石数量而增强。 [x3]',
    build: skill(
      destroyChosenRow(),
      dmg('enemyRandomN', 3, 1, {
        n: 2,
        modifier: { mod: { kind: 'multiplier', a: 3 }, source: { kind: 'destroyedGems', color: BaseColor.Green } },
      }),
    ),
  },
  {
    id: 9670,
    desc: '对一名敌人造成[魔法 + 4]点伤害。然后创造 2 颗黄色宝石，数量因骑士盟友数而增强。 [x2]',
    build: skill(
      dmg('enemyChosen', 4),
      createGems(BaseColor.Yellow, 2, 0, {
        modifier: { mod: { kind: 'multiplier', a: 2 }, source: { kind: 'alliesOfRace', race: 'Knight' } },
      }),
    ),
  },
  {
    id: 9671,
    desc: '对一名敌人造成[魔法 + 3]点伤害。如果其正在流血，则造成双倍伤害。然后使其叠加2层流血效果。',
    build: skill(
      // 回收（第四遍）：「如果其正在流血，则造成双倍伤害」= condMult targetStatus bleed
      //（逐受击目标判定，batch-12 7350「如果敌人已陷入织网状态，则造成双倍伤害」同款）；
      // 「使其叠加2层流血效果」= inflict stacks（SOP「条件组合 / 己方种族在场 / 状态叠层」节，
      // bleed 每层 1 → 2 层 magnitude 2）；「其」= enemyChosen 指定目标跨段复用（9817 同款）
      dmg('enemyChosen', 3, 1, { condMult: { times: 2, cond: { kind: 'targetStatus', statusId: 'bleed' } } }),
      inflict('bleed', 'enemyChosen', { stacks: 2 }),
    ),
  },
  {
    id: 9678,
    desc: '对一名敌人造成[魔法 + 4]点伤害。然后创造 2 颗棕色宝石，数量因矮人盟友数量而增强。 [x2]',
    build: skill(
      dmg('enemyChosen', 4),
      createGems(BaseColor.Brown, 2, 0, {
        modifier: { mod: { kind: 'multiplier', a: 2 }, source: { kind: 'alliesOfRace', race: 'Dwarf' } },
      }),
    ),
  },
  {
    id: 9735,
    desc: '对一名敌人造成[魔法 + 4]点伤害。然后创造 2 颗棕色宝石，数量因金牛座盟友数而增强。 [x2]',
    build: skill(
      dmg('enemyChosen', 4),
      // 金牛座 = Tauros（batch-17 9245 同款先例）
      createGems(BaseColor.Brown, 2, 0, {
        modifier: { mod: { kind: 'multiplier', a: 2 }, source: { kind: 'alliesOfRace', race: 'Tauros' } },
      }),
    ),
  },
  {
    id: 9743,
    desc: '对一名敌人造成[魔法 + 4]点伤害。然后创造 2 颗紫色宝石，数量因龙族盟友而增强。 [x2]',
    build: skill(
      dmg('enemyChosen', 4),
      createGems(BaseColor.Purple, 2, 0, {
        modifier: { mod: { kind: 'multiplier', a: 2 }, source: { kind: 'alliesOfRace', race: 'Dragon' } },
      }),
    ),
  },
  {
    id: 9775,
    desc: '将所有棕色宝石转换为紫色。消除敌人的 [魔法 + 1] 次攻击，效果因转换的宝石数而增强。 [3:1]',
    build: skill(
      transform(BaseColor.Brown, BaseColor.Purple),
      // 裸「敌人」= enemyChosen（官方指定语义，spell-rules.md §0）
      reduce('enemyChosen', 'attack', 1, 1, {
        modifier: { mod: { kind: 'ratio', a: 3, b: 1 }, source: { kind: 'transformedGems' } },
      }),
    ),
  },
  {
    id: 9782,
    desc: '对一名敌人造成[魔法 + 4]点伤害。然后生成2颗红色宝石，由罗刹盟友提供增益。 [x2]',
    build: skill(
      dmg('enemyChosen', 4),
      // 「由罗刹盟友提供增益」=「数量因罗刹盟友数而增强」同族
      createGems(BaseColor.Red, 2, 0, {
        modifier: { mod: { kind: 'multiplier', a: 2 }, source: { kind: 'alliesOfRace', race: 'Raksha' } },
      }),
    ),
  },
  {
    id: 9791,
    desc: '对一名敌人造成[魔法 + 4]点伤害。然后生成2颗蓝色宝石，由人类盟友强化。 [x2]',
    build: skill(
      dmg('enemyChosen', 4),
      createGems(BaseColor.Blue, 2, 0, {
        modifier: { mod: { kind: 'multiplier', a: 2 }, source: { kind: 'alliesOfRace', race: 'Human' } },
      }),
    ),
  },
  {
    id: 9817,
    desc: '对一名敌人造成[魔法 + 3]点伤害。使其纠缠并流血。如果敌人已被纠缠，则有30%的几率将其击杀。',
    build: skill(
      dmg('enemyChosen', 3),
      inflict('entangle', 'enemyChosen'),
      // bleed 在状态白名单（tests STATUS_WHITELIST，batch-01 8531 先例）
      inflict('bleed', 'enemyChosen'),
      // 回收：ifCond 现支持条件触发（SOP「通用条件触发 / 条件加成」节）；「击杀」= 即杀 execute
      // + 概率只辖本子句（batch-03 7789 先例，原跳过理由过时）
      dmg('enemyChosen', 0, 0, { execute: true, chance: 0.3, ifCond: { kind: 'targetStatus', statusId: 'entangle' } }),
    ),
  },
  {
    id: 9847,
    desc: '对一名敌人造成[魔法 + 2]点真实伤害。每有一名流血的敌人，回复2点法力值。 [x2]',
    build: skill(
      trueDmg('enemyChosen', 2),
      mana('allySelf', 2, 0, {
        modifier: { mod: { kind: 'multiplier', a: 2 }, source: { kind: 'enemyStatusCount', statusId: 'bleed' } },
      }),
    ),
  },
  {
    id: 9864,
    desc: '对一名敌人造成[魔法 + 4]点伤害。然后生成2颗红色宝石，由兽人盟友提供增益。 [x2]',
    build: skill(
      dmg('enemyChosen', 4),
      createGems(BaseColor.Red, 2, 0, {
        modifier: { mod: { kind: 'multiplier', a: 2 }, source: { kind: 'alliesOfRace', race: 'Orc' } },
      }),
    ),
  },
  {
    id: 9867,
    desc: '摧毁一列。对随机一名敌人造成[魔法 + 1]点真实伤害，伤害值受被摧毁的黄色宝石数量提升。 [x2]',
    build: skill(
      destroyChosenCol(),
      // 清除段在前，destroyedGems 才数得到（batch-13 同款）
      trueDmg('enemyRandom', 1, 1, {
        modifier: { mod: { kind: 'multiplier', a: 2 }, source: { kind: 'destroyedGems', color: BaseColor.Yellow } },
      }),
    ),
  },
  {
    id: 9872,
    desc: '对一名敌人造成[魔法 + 4]点伤害。然后生成2颗绿色宝石，由乌尔斯卡盟友提供增益。 [x2]',
    build: skill(
      dmg('enemyChosen', 4),
      // 乌尔斯卡 = Urska（batch-10 9190「厄什卡」同物）
      createGems(BaseColor.Green, 2, 0, {
        modifier: { mod: { kind: 'multiplier', a: 2 }, source: { kind: 'alliesOfRace', race: 'Urska' } },
      }),
    ),
  },
  {
    id: 9945,
    desc: '对一名敌人造成[魔法 + 4]点伤害。然后生成2颗绿色宝石，由神秘盟友强化。 [x2]',
    build: skill(
      dmg('enemyChosen', 4),
      // 神秘 = Mystic（batch-16 9240「秘士」同物）
      createGems(BaseColor.Green, 2, 0, {
        modifier: { mod: { kind: 'multiplier', a: 2 }, source: { kind: 'alliesOfRace', race: 'Mystic' } },
      }),
    ),
  },
  {
    id: 9953,
    desc: '对一名敌人造成[魔法 + 4]点伤害。然后生成2颗黄色宝石，并受到机械盟友的增益。 [x2]',
    build: skill(
      dmg('enemyChosen', 4),
      createGems(BaseColor.Yellow, 2, 0, {
        modifier: { mod: { kind: 'multiplier', a: 2 }, source: { kind: 'alliesOfRace', race: 'Mech' } },
      }),
    ),
  },
];

export const BATCH_18: CuratedBatch = { batch: '18', spells: SPELLS, skipped: SKIPPED };
