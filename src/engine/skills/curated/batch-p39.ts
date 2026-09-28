/**
 * 人工核对组装 · 批次 P39（池：scripts/curated-pools/pool-39.json 9 条 +
 * pool-40.json 40 条，共 49 条合并；条目按 id 升序混排）
 * 核对者：技能组装子agent。组装 33 条 / 放弃 16 条。
 *
 * 语义口径备注：
 * - 9517/9807 等条目中文「红宝石/蓝宝石」按颜色宝石处理（BaseColor.Red/…，与 r4「红色宝石」同物）。
 * - 8380/8381「因末日骷髅头数而增强」→ boardSpecial{gem:'doomSkull'}（文本点名末日族，精确计数）。
 * - 8466「使一名随机敌人陷入中毒和织网状态」→ 第二状态段 'lastTarget' 跨段绑定同一随机敌人（§12.3）。
 * - 8672「如果我的攻击力较低」→ not(casterStatBeatsTarget)（§13.2 取反口径）。
 * - 7408「杀死最后一名盟友」→ sacrifice('allyLast')（即杀己方目标唯一原语）。
 */
import type { CuratedBatch } from './index';
import { skill, dmg, dmgAll, trueDmg, armor, magic, inflict,
  reduce, drainMana, createGems, createSpecialGems, createMix, transform, transformToSpecial,
  destroyChosenCol, destroySpecialGems, explodeSpecialGems, explodeRandomGems,
  createStorm, summonRef, extraTurn, sacrifice, reposition, CHOSEN, dispelStatus } from '../builders';
import { BaseColor } from '../../types';
import { POSITIVE_STATUS_IDS } from '../effects/status';

const SKIPPED: { id: number; reason: string }[] = [
  { id: 9017, reason: '语义拿不准（「对其他所有敌人」无 enemyOthers 目标模式，enemyAll 会重复命中选定敌人）' },
  { id: 9193, reason: '特殊宝石（「蓝色闪电宝石」行列与颜色均无法表达）' },
  { id: 9367, reason: '语义拿不准（「若在中央尖塔内使用」地点/王国条件族）' },
  { id: 9473, reason: '晋升度条件（「基于我已晋升的稀有度造成 3 到 5 倍伤害」）' },
  { id: 9483, reason: '语义拿不准（「如果在玛拉吉扩张区使用」地点/王国条件族）' },
  { id: 9595, reason: '晋升度条件（「基于我已晋升的稀有度造成 3 到 5 倍伤害」）' },
  { id: 9640, reason: '语义拿不准（目标数 [魔法+2] 带魔法缩放无原语；「消除随机技能点」无随机属性削减原语）' },
  { id: 9745, reason: '特殊宝石（「精神宝石」未实现）' },
  { id: 9839, reason: '语义拿不准（「若在破碎之地使用」地点/王国条件族）' },
  { id: 9982, reason: '语义拿不准（「若在玛拉吉广袤区域使用」地点/王国条件族）' },
  { id: 9984, reason: '语义拿不准（「若在远古凯特使用」地点/王国条件族）' },
  { id: 8232, reason: '召唤物无法解析（「狼人森林野兽」无法对应具体兵种；且 transformTroop 不支持 N 目标数「将其（前 2 位）转化」）' },
  { id: 8601, reason: '特殊宝石（法力药水宝石未实现）' },
  { id: 8604, reason: '特殊宝石（法力药水宝石未实现）' },
  { id: 8894, reason: '语义拿不准（「使一名盟友…」后「对其下位所有敌人」指代不明：盟友纵队下方无从对应敌人）' },
];

const SPELLS: CuratedBatch['spells'] = [
  {
    id: 7408,
    desc: '创造 15 颗宝石，所创造的宝石混合紫色和一种选定类型。杀死最后一名盟友。所有其他盟友获得 [(魔法 / 2) + 1] 点魔力值，点数因陷入死亡标记状态的敌军数量而增强。 [x4]',
    build: skill(
      createMix([BaseColor.Purple, CHOSEN], 15),
      // sa-F2 fix round A: native 2:Dispel@LastAlly precedes 3:Damage@LastAlly 10000 (a Barrier must not save the ally)
      ...POSITIVE_STATUS_IDS.map(statusId => dispelStatus(statusId, 'allyLast')),
      sacrifice('allyLast'),
      magic('allyOthers', 1, 0.5, { modifier: { mod: { kind: 'multiplier', a: 4 }, source: { kind: 'enemyStatusCount', statusId: 'death-mark' } } }),
    ),
  },
  {
    id: 7487,
    desc: '召唤火风暴。对所有敌人造成 [魔法 + 4] 点伤害。获得 1 点魔力值，点数因红色宝石数而增强。 [3:1]',
    build: skill(
      createStorm(BaseColor.Red),
      dmgAll(4),
      magic('allySelf', 1, 0, { modifier: { mod: { kind: 'ratio', a: 3, b: 1 }, source: { kind: 'boardGems', color: BaseColor.Red } } }),
    ),
  },
  {
    id: 7685,
    desc: '将最后一名敌人拉至首位。魅惑一名随机敌人。召唤 1 到 3 个炸弹机器人。',
    build: skill(
      reposition('enemyLast', 'front'),
      inflict('charm', 'enemyRandom'),
      summonRef('Bombot', undefined, { countRange: { min: 1, max: 3 } }),
    ),
  },
  {
    id: 7998,
    desc: '对一名敌人造成 [魔法 + 4] 点伤害，伤害值因陷入死亡标记状态的敌军数量而增强。使所有敌人都陷入死亡标记状态。创造 8 颗蓝色宝石。 [x6]',
    build: skill(
      dmg('enemyChosen', 4, 1, { modifier: { mod: { kind: 'multiplier', a: 6 }, source: { kind: 'enemyStatusCount', statusId: 'death-mark' } } }),
      inflict('death-mark', 'enemyAll'),
      createGems(BaseColor.Blue, 8, 0),
    ),
  },
  {
    id: 7999,
    desc: '对一名敌人造成 [魔法 + 4] 点伤害，伤害值因陷入死亡标记状态的敌军数量而增强。使所有敌人都陷入死亡标记状态。创造 8 颗绿色宝石。 [x6]',
    build: skill(
      dmg('enemyChosen', 4, 1, { modifier: { mod: { kind: 'multiplier', a: 6 }, source: { kind: 'enemyStatusCount', statusId: 'death-mark' } } }),
      inflict('death-mark', 'enemyAll'),
      createGems(BaseColor.Green, 8, 0),
    ),
  },
  {
    id: 8000,
    desc: '对一名敌人造成 [魔法 + 4] 点伤害，伤害值因陷入死亡标记状态的敌军数量而增强。使所有敌人都陷入死亡标记状态。创造 8 颗红色宝石。 [x6]',
    build: skill(
      dmg('enemyChosen', 4, 1, { modifier: { mod: { kind: 'multiplier', a: 6 }, source: { kind: 'enemyStatusCount', statusId: 'death-mark' } } }),
      inflict('death-mark', 'enemyAll'),
      createGems(BaseColor.Red, 8, 0),
    ),
  },
  {
    id: 8001,
    desc: '对一名敌人造成 [魔法 + 4] 点伤害，伤害值因陷入死亡标记状态的敌军数量而增强。使所有敌人都陷入死亡标记状态。创造 8 颗黄色宝石。 [x6]',
    build: skill(
      dmg('enemyChosen', 4, 1, { modifier: { mod: { kind: 'multiplier', a: 6 }, source: { kind: 'enemyStatusCount', statusId: 'death-mark' } } }),
      inflict('death-mark', 'enemyAll'),
      createGems(BaseColor.Yellow, 8, 0),
    ),
  },
  {
    id: 8002,
    desc: '对一名敌人造成 [魔法 + 4] 点伤害，伤害值因陷入死亡标记状态的敌军数量而增强。使所有敌人都陷入死亡标记状态。创造 8 颗紫色宝石。 [x6]',
    build: skill(
      dmg('enemyChosen', 4, 1, { modifier: { mod: { kind: 'multiplier', a: 6 }, source: { kind: 'enemyStatusCount', statusId: 'death-mark' } } }),
      inflict('death-mark', 'enemyAll'),
      createGems(BaseColor.Purple, 8, 0),
    ),
  },
  {
    id: 8003,
    desc: '对一名敌人造成 [魔法 + 4] 点伤害，伤害值因陷入死亡标记状态的敌军数量而增强。使所有敌人都陷入死亡标记状态。创造 8 颗棕色宝石。 [x6]',
    build: skill(
      dmg('enemyChosen', 4, 1, { modifier: { mod: { kind: 'multiplier', a: 6 }, source: { kind: 'enemyStatusCount', statusId: 'death-mark' } } }),
      inflict('death-mark', 'enemyAll'),
      createGems(BaseColor.Brown, 8, 0),
    ),
  },
  {
    id: 8127,
    desc: '将黄色宝石转换成蓝色。有 20% 的几率使最后两名敌人陷入死亡标记状态，几率因被转换的宝石数而增强。 [1:1]',
    build: skill(
      transform(BaseColor.Yellow, BaseColor.Blue),
      inflict('death-mark', 'enemyLastN', { n: 2, chance: 0.2, chanceBoost: { mod: { kind: 'ratio', a: 1, b: 1 }, source: { kind: 'transformedGems' } } }),
    ),
  },
  {
    id: 8316,
    desc: '创造 6 颗棕色宝石。再将所有棕色宝石转换成末日骷髅头。再随机使 1-2 个敌人陷入出血状态和 1-2 个敌人陷入死亡标记状态。',
    build: skill(
      createGems(BaseColor.Brown, 6, 0),
      transformToSpecial(BaseColor.Brown, 'doomSkull'),
      inflict('bleed', 'enemyRandomN', { nRange: { min: 1, max: 2 } }),
      inflict('death-mark', 'enemyRandomN', { nRange: { min: 1, max: 2 } }),
    ),
  },
  {
    id: 8380,
    desc: '对一名敌人造成 [魔法 + 5] 点伤害，伤害值因末日骷髅头数而加强。将黄色宝石转换成末日骷髅头。召唤末日风暴。 [x10]',
    build: skill(
      dmg('enemyChosen', 5, 1, { modifier: { mod: { kind: 'multiplier', a: 10 }, source: { kind: 'boardSpecial', gem: 'doomSkull' } } }),
      transformToSpecial(BaseColor.Yellow, 'doomSkull'),
      createStorm(BaseColor.Brown, { dropKind: 'doomSkull' }),
    ),
  },
  {
    id: 8381,
    desc: '对所有敌人造成 [魔法 + 5] 点伤害。数值因末日骷髅头数而增强。将黄色宝石转换成末日骷髅头。召唤末日骷髅头风暴。 [x10]',
    build: skill(
      dmg('enemyAll', 5, 1, { range: 'all', modifier: { mod: { kind: 'multiplier', a: 10 }, source: { kind: 'boardSpecial', gem: 'doomSkull' } } }),
      transformToSpecial(BaseColor.Yellow, 'doomSkull'),
      createStorm(BaseColor.Brown, { dropKind: 'doomSkull' }),
    ),
  },
  {
    id: 8423,
    desc: '摧毁一列。每摧毁一颗绿色宝石则创造 2 可末日骷髅头。召唤骷髅头风暴。 [x2]',
    build: skill(
      destroyChosenCol(),
      // native CreateGems Doomskull has no Amount: 2 per Green destroyed, no base (sa-R1)
      createSpecialGems({ kind: 'doomSkull' }, 0, 0, { modifier: { mod: { kind: 'multiplier', a: 2 }, source: { kind: 'destroyedGems', color: BaseColor.Green } } }),
      createStorm(BaseColor.Brown, { dropKind: 'skull' }),
    ),
  },
  {
    id: 8466,
    desc: '创造 3 颗蓝色宝石和 3 颗织网宝石，数量因盗贼盟友数而增强。使一名随机敌人陷入中毒和织网状态。 [x3]',
    build: skill(
      createGems(BaseColor.Blue, 3, 0, { modifier: { mod: { kind: 'multiplier', a: 3 }, source: { kind: 'alliesOfRace', race: 'Rogue' } } }),
      createSpecialGems({ kind: 'web' }, 3, 0, { modifier: { mod: { kind: 'multiplier', a: 3 }, source: { kind: 'alliesOfRace', race: 'Rogue' } } }),
      inflict('poison', 'enemyRandom'),
      inflict('web', 'lastTarget'),
    ),
  },
  {
    id: 8478,
    desc: '耗掉一名敌人所有法力值。若存在风暴，则使他陷入死亡标记效果。在召唤暗风暴。',
    build: skill(
      drainMana('enemyChosen'),
      inflict('death-mark', 'enemyChosen', { ifCond: { kind: 'stormPresent' } }),
      createStorm(BaseColor.Purple),
    ),
  },
  {
    id: 8672,
    desc: '对一名敌人造成[魔法 + 3]点伤害，红色宝石可提升伤害。如果我的攻击力较低，则使其陷入纠缠状态。如果我的护甲值较低，则使其陷入疾病状态。 [3:1]',
    build: skill(
      dmg('enemyChosen', 3, 1, { modifier: { mod: { kind: 'ratio', a: 3, b: 1 }, source: { kind: 'boardGems', color: BaseColor.Red } } }),
      inflict('entangle', 'enemyChosen', { ifCond: { kind: 'not', cond: { kind: 'casterStatBeatsTarget', stat: 'attack' } } }),
      inflict('disease', 'enemyChosen', { ifCond: { kind: 'not', cond: { kind: 'casterStatBeatsTarget', stat: 'armor' } } }),
    ),
  },
  {
    id: 8682,
    desc: '给予所有盟友 [(魔法 x 1.5) + 3] 点护甲值。对一名敌人造成 [(魔法 x 1.5) + 3] 点伤害，伤害值因诅咒宝石而增强。再摧毁所有诅咒宝石。 [x10]',
    build: skill(
      armor('allyAll', 3, 1.5),
      dmg('enemyChosen', 3, 1.5, { modifier: { mod: { kind: 'multiplier', a: 10 }, source: { kind: 'boardSpecial', gem: 'curseGem' } } }),
      destroySpecialGems('curseGem'),
    ),
  },
  {
    id: 9115,
    desc: '创造 2 颗沙漏宝石。板面上每有一颗黄色宝石，则有 7% 的几率获得一个额外回合。 [x7]',
    build: skill(
      createSpecialGems({ kind: 'hourglass' }, 2),
      extraTurn({ chance: 0.07, chanceBoost: { mod: { kind: 'multiplier', a: 7 }, source: { kind: 'boardGems', color: BaseColor.Yellow } } }),
    ),
  },
  {
    id: 9174,
    desc: '爆破所有燃烧宝石。对首 2 位敌人造成 [(魔法 x 1.5) + 2] 点真实伤害，伤害值因被摧毁的燃烧宝石数而增强。 [x5]',
    build: skill(
      explodeSpecialGems('burningGem'),
      trueDmg('enemyFirstN', 2, 1.5, { n: 2, modifier: { mod: { kind: 'multiplier', a: 5 }, source: { kind: 'destroyedGems' } } }),
    ),
  },
  {
    id: 9321,
    desc: '摧毁一列。对一名随机敌人造成 [魔法 + 3] 点伤害，伤害值因被摧毁的黄色宝石数而增强。再召唤光风暴。 [1:1]',
    build: skill(
      destroyChosenCol(),
      dmg('enemyRandom', 3, 1, { modifier: { mod: { kind: 'ratio', a: 1, b: 1 }, source: { kind: 'destroyedGems', color: BaseColor.Yellow } } }),
      createStorm(BaseColor.Yellow),
    ),
  },
  {
    id: 9362,
    desc: '对所有敌人造成 [魔法 + 2] 点伤害，伤害值因冻结宝石数而增强。若存在风暴，则造成双倍伤害。再创造 3 颗冻结宝石。 [x2]',
    build: skill(
      dmg('enemyAll', 2, 1, {
        range: 'all',
        modifier: { mod: { kind: 'multiplier', a: 2 }, source: { kind: 'boardSpecial', gem: 'freezeGem' } },
        condMult: { times: 2, cond: { kind: 'stormPresent' } },
      }),
      createSpecialGems({ kind: 'freezeGem' }, 3),
    ),
  },
  {
    id: 9513,
    desc: '吸取一名敌人的 4 点法力值，因患病敌人而增强。对他们造成疾病。 [x2]',
    build: skill(
      // L3-007: native DecreaseMana (drain) — no refill to the caster
      reduce('enemyChosen', 'mana', 4, 0, { modifier: { mod: { kind: 'multiplier', a: 2 }, source: { kind: 'enemyStatusCount', statusId: 'disease' } } }),
      inflict('disease', 'lastTarget'),
    ),
  },
  {
    id: 9517,
    desc: '对所有敌人造成 [(魔法 x 2.75) + 6] 点伤害。将 5 颗红宝石转换为燃烧宝石。有 10% 的几率额外获得一轮，红宝石数量越多，几率越大。 [x3]',
    build: skill(
      dmgAll(6, 2.75),
      transformToSpecial(BaseColor.Red, 'burningGem', { count: 5 }),
      extraTurn({ chance: 0.1, chanceBoost: { mod: { kind: 'multiplier', a: 3 }, source: { kind: 'boardGems', color: BaseColor.Red } } }),
    ),
  },
  {
    id: 9771,
    desc: '选择一种法力颜色。将 6 颗该颜色的宝石转化为炸弹宝石。然后引爆一颗宝石。',
    build: skill(
      transformToSpecial(CHOSEN, 'bomb', { count: 6 }),
      explodeRandomGems(1, 0),
    ),
  },
  {
    id: 9807,
    desc: '造成[(魔法 x 1.5) + 12]点散射伤害，紫色宝石可提升伤害。若存在风暴，则生成4颗黄色宝石，然后将所有黄色宝石转化为紫色宝石。 [x5]',
    // 裸散射重裁（2026-09-18）：官方 ScatterDamage@AllEnemies = 全体散射
    build: skill(
      dmg('enemyAll', 12, 1.5, { range: 'all', modifier: { mod: { kind: 'multiplier', a: 5 }, source: { kind: 'boardGems', color: BaseColor.Purple } } }),
      createGems(BaseColor.Yellow, 4, 0, { ifCond: { kind: 'stormPresent' } }),
      transform(BaseColor.Yellow, BaseColor.Purple, { ifCond: { kind: 'stormPresent' } }),
    ),
  },
  {
    id: 9895,
    desc: '对所有敌人造成[(魔法 x 2) + 3]点伤害，蓝色宝石可提升伤害，并附加诅咒和冰冻效果。有10%的几率获得额外回合，蓝色宝石可提升额外回合数。 [x2]',
    build: skill(
      dmg('enemyAll', 3, 2, { range: 'all', modifier: { mod: { kind: 'multiplier', a: 2 }, source: { kind: 'boardGems', color: BaseColor.Blue } } }),
      inflict('curse', 'enemyAll'),
      inflict('frozen', 'enemyAll'),
      extraTurn({ chance: 0.1, chanceBoost: { mod: { kind: 'multiplier', a: 2 }, source: { kind: 'boardGems', color: BaseColor.Blue } } }),
    ),
  },
  {
    id: 9896,
    desc: '对所有敌人造成[(魔法 x 2) + 3]点伤害，紫色宝石可提升伤害，并附加诅咒和死亡标记。有10%的几率获得额外回合，紫色宝石可提升额外回合数。 [x2]',
    build: skill(
      dmg('enemyAll', 3, 2, { range: 'all', modifier: { mod: { kind: 'multiplier', a: 2 }, source: { kind: 'boardGems', color: BaseColor.Purple } } }),
      inflict('curse', 'enemyAll'),
      inflict('death-mark', 'enemyAll'),
      extraTurn({ chance: 0.1, chanceBoost: { mod: { kind: 'multiplier', a: 2 }, source: { kind: 'boardGems', color: BaseColor.Purple } } }),
    ),
  },
  {
    id: 9897,
    desc: '对所有敌人造成[(魔法 x 2) + 3]点伤害，红色宝石可提升伤害，并附加诅咒和2层流血效果。有10%的几率获得额外回合，红色宝石可提升额外回合数。 [x2]',
    build: skill(
      dmg('enemyAll', 3, 2, { range: 'all', modifier: { mod: { kind: 'multiplier', a: 2 }, source: { kind: 'boardGems', color: BaseColor.Red } } }),
      inflict('curse', 'enemyAll'),
      inflict('bleed', 'enemyAll', { stacks: 2 }),
      extraTurn({ chance: 0.1, chanceBoost: { mod: { kind: 'multiplier', a: 2 }, source: { kind: 'boardGems', color: BaseColor.Red } } }),
    ),
  },
  {
    id: 9898,
    desc: '对所有敌人造成[(魔法 x 2) + 3]点伤害，黄色宝石可提升伤害，并附加诅咒和沉默效果。有10%的几率获得额外回合，黄色宝石可提升额外回合数。 [x2]',
    build: skill(
      dmg('enemyAll', 3, 2, { range: 'all', modifier: { mod: { kind: 'multiplier', a: 2 }, source: { kind: 'boardGems', color: BaseColor.Yellow } } }),
      inflict('curse', 'enemyAll'),
      inflict('silence', 'enemyAll'),
      extraTurn({ chance: 0.1, chanceBoost: { mod: { kind: 'multiplier', a: 2 }, source: { kind: 'boardGems', color: BaseColor.Yellow } } }),
    ),
  },
  {
    id: 9899,
    desc: '对所有敌人造成[(魔法 x 2) + 3]点伤害，棕色宝石可提升伤害，并附加诅咒和疾病效果。有10%的几率获得额外回合，棕色宝石可提升额外回合数。 [x2]',
    build: skill(
      dmg('enemyAll', 3, 2, { range: 'all', modifier: { mod: { kind: 'multiplier', a: 2 }, source: { kind: 'boardGems', color: BaseColor.Brown } } }),
      inflict('curse', 'enemyAll'),
      inflict('disease', 'enemyAll'),
      extraTurn({ chance: 0.1, chanceBoost: { mod: { kind: 'multiplier', a: 2 }, source: { kind: 'boardGems', color: BaseColor.Brown } } }),
    ),
  },
  {
    id: 9900,
    desc: '对所有敌人造成[(魔法 x 2) + 3]点伤害，绿色宝石可提升伤害，并附加诅咒和眩晕效果。有10%的几率获得额外回合，绿色宝石可提升额外回合数。 [x2]',
    build: skill(
      dmg('enemyAll', 3, 2, { range: 'all', modifier: { mod: { kind: 'multiplier', a: 2 }, source: { kind: 'boardGems', color: BaseColor.Green } } }),
      inflict('curse', 'enemyAll'),
      inflict('stun', 'enemyAll'),
      extraTurn({ chance: 0.1, chanceBoost: { mod: { kind: 'multiplier', a: 2 }, source: { kind: 'boardGems', color: BaseColor.Green } } }),
    ),
  },
];

export const BATCH_P39: CuratedBatch = { batch: 'p39', spells: SPELLS, skipped: SKIPPED };
