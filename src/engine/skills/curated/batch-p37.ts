/**
 * 人工核对组装 · 批次 P37（池：scripts/curated-pools/pool-37.json 40 条）
 * 核对者：技能组装子agent。组装 32 条 / 放弃 8 条。
 *
 * 语义口径备注：
 * - 9946「对敌人造成…伤害」裸目标句 → enemyChosen（batch-11 9852 同款先例）；
 *   「紫色宝石可提升伤害」→ boardGems（p39 8672/9807 同款）；「蛛化」= web 织网状态
 *   （与「织网状态」同物，兵种「暗织」主题吻合）。
 * - 7427/8924「将所有X宝石转换为Y以增强/强化此效果」→ 转化段前置，transformedGems
 *   来源才数得到（batch-04 7002 / batch-05 7169 同款）。
 * - 8562「获得 [魔法+1] 点攻击力和生命值，因红色和紫色宝石而增强」→ 修饰句未点名类别，
 *   挂最近数值段（= heal，batch-14 8297 口径）；「红色和紫色宝石」双来源计数相加。
 * - 7481「鸟族盟友」→ 种族 Stryx（赫洛娜丝自身 troopTypes 即 Stryx，鹰/鸟人族均属之）。
 * - 7787「召唤 一个随机风暴」→ oneOf 六色风暴等概率掷选（随机风暴无专用原语，见汇报）。
 * - 8560/8562「地狱风暴」→ createStorm(BaseColor.Red)（地狱≈火，「火风暴=Red」p39 7487 同款，见汇报）。
 * - 8745「选择一颗宝石…摧毁宝石的行和列」→ destroyChosenRow+destroyChosenCol 共享
 *   ctx.chosenCell = 选定宝石行+列十字（batch-13/14 口径）。
 * - 8431「有 10% 的几率杀死对方，几率因…而增强」→ execute 段 chance+chanceBoost（§11 追加口径）。
 * - 8137「若有一名敌人陷入疾病状态」→ anyEnemyStatus 全局存在判定（8743 同款）。
 */
import type { CuratedBatch } from './index';
import { skill, dmg, dmgAll, heal, armor, attack, magic, mana, inflict,
  createGems, createSpecialGems, transform, destroyChosenRow, destroyChosenCol,
  createStorm, summonRef, extraTurn, transformTroop, oneOf, scale, CHOSEN } from '../builders';
import { BaseColor } from '../../types';

const SKIPPED: { id: number; reason: string }[] = [
  { id: 10011, reason: '特殊宝石（「闪电宝石」未区分行/列，lightningRow/lightningCol 无法定夺）' },
  { id: 8066, reason: '语义拿不准（「摧毁一整块大小为 5x5 的宝石」无对应范围原语，clear 族仅整行/列/单格3x3）' },
  { id: 8276, reason: '语义拿不准（「若敌人已陷入X状态，则爆破 3 颗宝石」：targetStatus 条件挂无目标宝石段会被整段跳过，无法条件化爆破）' },
  { id: 8289, reason: '比例法力（「给予…4 分之一的法力值」无 1/4 比例法力原语，仅支持半数；且「其他盟友敌人」指代不明）' },
  { id: 8318, reason: '召唤物无法解析（「恶龙巢/Dragonnest」类型在本数据无对应兵种集合，Dragon 族 122 只作候选属超集臆测）' },
  { id: 8362, reason: '二次缩放来源不支持（「因不死族敌人数而增强」无敌方种族计数来源，alliesOfRace 仅施法方）' },
  { id: 8427, reason: '语义拿不准（「每有一名受诅咒的敌人，则赋予一名随机盟友屏障效果」计数驱动施加无原语：status 段不支持 modifier 数值缩放）' },
  { id: 8603, reason: '特殊宝石（法力药水宝石未实现）' },
];

const SPELLS: CuratedBatch['spells'] = [
  {
    id: 7139,
    desc: '对 1 名敌人造成 [(魔法 / 2) + 4] – [魔法 + 9] 伤害，并使其陷入猎人标记状态。获得 +5 点魔力值。',
    build: skill(
      // 原生序 RandomHighDamage → IncreaseSpellPower@Self → CauseHuntersMark@FromTarget（R001）
      dmg('enemyChosen', 0, 0, { rangeSpec: { min: scale(4, 0.5), max: scale(9, 1) } }),
      magic('allySelf', 5, 0),
      inflict('marked', 'enemyChosen'),
    ),
  },
  {
    id: 7205,
    desc: '使第一名敌人陷入缠绕和猎人标记状态。对其造成  [魔法 + 2] 点伤害。如果板面上有 13 颗或更多绿色宝石，则获得一个额外回合。',
    build: skill(
      inflict('entangle', 'enemyFront'),
      inflict('marked', 'enemyFront'),
      dmg('enemyFront', 2),
      extraTurn({ ifCond: { kind: 'boardAtLeast', color: BaseColor.Green, n: 13 } }),
    ),
  },
  {
    id: 7214,
    desc: '创造 8 颗绿色宝石和 4 颗织网宝石。召唤 1-3 只巨型蜘蛛。',
    build: skill(
      createGems(BaseColor.Green, 8, 0),
      createSpecialGems({ kind: 'web' }, 4),
      summonRef('GiantSpider', undefined, { countRange: { min: 1, max: 3 } }),
    ),
  },
  {
    id: 7337,
    desc: '冻结第一名敌人并使其陷入猎人标记状态。对其造成 [魔法 + 4] 点伤害。如果板面上有 13 颗或更多蓝色宝石，则再创造 5 颗蓝色宝石。',
    build: skill(
      inflict('frozen', 'enemyFront'),
      inflict('marked', 'enemyFront'),
      dmg('enemyFront', 4),
      createGems(BaseColor.Blue, 5, 0, { ifCond: { kind: 'boardAtLeast', color: BaseColor.Blue, n: 13 } }),
    ),
  },
  {
    id: 7342,
    desc: '让所有敌人陷入死亡标记状态。对所有敌人造成 [魔法 + 25] 点散射伤害，并因自身生命值而增强。 [2:1]',
    build: skill(
      inflict('death-mark', 'enemyAll'),
      dmg('enemyAll', 25, 1, { range: 'all', modifier: { mod: { kind: 'ratio', a: 2, b: 1 }, source: { kind: 'selfStat', stat: 'hp' } } }),
    ),
  },
  {
    id: 7427,
    desc: '使 1 名敌人陷入疾病状态并造成 [魔法 + 1] 点伤害。将所有黄色宝石转换为棕色宝石以强化此效果。 [3:1]',
    build: skill(
      inflict('disease', 'enemyChosen'),
      // 「以强化此效果」句式：转化段前置，transformedGems 来源才数得到（batch-04 7002 同款）
      transform(BaseColor.Yellow, BaseColor.Brown),
      dmg('enemyChosen', 1, 1, { modifier: { mod: { kind: 'ratio', a: 3, b: 1 }, source: { kind: 'transformedGems' } } }),
    ),
  },
  {
    id: 7449,
    desc: '将绿色宝石转换为紫色。如果有一名盟友或敌军陷入死亡标记状态，则同时将黄色宝石转换为骷髅头。',
    build: skill(
      transform(BaseColor.Green, BaseColor.Purple),
      transform(BaseColor.Yellow, 'SKULL', {
        ifCond: { kind: 'anyOf', of: [{ kind: 'anyAllyStatus', statusId: 'death-mark' }, { kind: 'anyEnemyStatus', statusId: 'death-mark' }] },
      }),
    ),
  },
  {
    id: 7481,
    desc: '召唤叶风暴。所有盟友获得 [魔法 + 1] 点护甲值，点数因鸟族盟友数而增强。 [x4]',
    build: skill(
      createStorm(BaseColor.Green),
      armor('allyAll', 1, 1, { modifier: { mod: { kind: 'multiplier', a: 4 }, source: { kind: 'alliesOfRace', race: 'Stryx' } } }),
    ),
  },
  {
    id: 7486,
    desc: '召唤光风暴。对 1 名敌人造成 [魔法 + 5] 点伤害。如果敌人身亡，所有盟友获得 5 点攻击力。',
    build: skill(
      createStorm(BaseColor.Yellow),
      dmg('enemyChosen', 5),
      attack('allyAll', 5, 0, { ifTargetDied: true }),
    ),
  },
  {
    id: 7540,
    desc: '使 1 名敌人陷入猎人标记状态。召唤一只战鹰并创造 7 颗红色宝石。',
    build: skill(
      inflict('marked', 'enemyChosen'),
      summonRef('Warhawk'),
      createGems(BaseColor.Red, 7, 0),
    ),
  },
  {
    id: 7543,
    desc: '对 1 名敌人造成 [魔法 + 4] 点伤害。如果敌人已陷入猎人标记状态，则造成三倍伤害。使敌人陷入猎人标记状态。',
    build: skill(
      dmg('enemyChosen', 4, 1, { condMult: { times: 3, cond: { kind: 'targetStatus', statusId: 'marked' } } }),
      inflict('marked', 'enemyChosen'),
    ),
  },
  {
    id: 7639,
    desc: '对所有敌人造成 [魔法 + 8] 点散射伤害，并因黄色宝石数而增强。召唤光风暴。 [x3]',
    build: skill(
      dmg('enemyAll', 8, 1, { range: 'all', modifier: { mod: { kind: 'multiplier', a: 3 }, source: { kind: 'boardGems', color: BaseColor.Yellow } } }),
      createStorm(BaseColor.Yellow),
    ),
  },
  {
    id: 7661,
    desc: '召唤一个地狱再生魔。使一名随机敌人陷入死亡标记状态。',
    build: skill(
      summonRef('Hellspawn'),
      inflict('death-mark', 'enemyRandom'),
    ),
  },
  {
    id: 7665,
    desc: '对所有敌人造成 [魔法 + 1] 点伤害，伤害值因陷入疾病和中毒状态的敌军数量而增强。使所有敌人陷入疾病和中毒状态。 [x2]',
    build: skill(
      dmg('enemyAll', 1, 1, { range: 'all', modifier: { mod: { kind: 'multiplier', a: 2 }, sources: [{ kind: 'enemyStatusCount', statusId: 'disease' }, { kind: 'enemyStatusCount', statusId: 'poison' }] } }),
      inflict('disease', 'enemyAll'),
      inflict('poison', 'enemyAll'),
    ),
  },
  {
    id: 7785,
    desc: '对一名敌人造成 [魔法 + 4] 点伤害。如果自身攻击力高于敌方，则再造成 15 点伤害。如果敌方陷入猎人标记状态，则再造成 15 点伤害。',
    build: skill(
      dmg('enemyChosen', 4),
      dmg('enemyChosen', 15, 0, { ifCond: { kind: 'casterStatBeatsTarget', stat: 'attack' } }),
      dmg('enemyChosen', 15, 0, { ifCond: { kind: 'targetStatus', statusId: 'marked' } }),
    ),
  },
  {
    id: 7787,
    desc: '将指定法力的颜色转换为蓝色。召唤 一个随机风暴。',
    build: skill(
      transform(CHOSEN, BaseColor.Blue),
      // 「随机风暴」无专用原语 → oneOf 六色风暴等概率掷选（等价于随机取一种，见汇报）
      oneOf(
        [createStorm(BaseColor.Green)],
        [createStorm(BaseColor.Red)],
        [createStorm(BaseColor.Blue)],
        [createStorm(BaseColor.Yellow)],
        [createStorm(BaseColor.Purple)],
        [createStorm(BaseColor.Brown)],
      ),
    ),
  },
  {
    id: 7938,
    desc: '给予一名盟友等同于其护甲值的攻击力。创造光风暴。 [1:1]',
    build: skill(
      attack('allyChosen', 0, 0, { modifier: { mod: { kind: 'ratio', a: 1, b: 1 }, source: { kind: 'targetStat', stat: 'armor' } } }),
      createStorm(BaseColor.Yellow),
    ),
  },
  {
    id: 8137,
    desc: '对一名敌人造成 [魔法 + 3] 伤害。若有一名敌人陷入疾病状态，则有 50% 的几率使其转化成一名蘑菇人。再使其陷入疾病状态。',
    build: skill(
      dmg('enemyChosen', 3),
      transformTroop('enemyChosen', 'MushroomMan', { chance: 0.5, ifCond: { kind: 'anyEnemyStatus', statusId: 'disease' } }),
      inflict('disease', 'enemyChosen'),
    ),
  },
  {
    id: 8239,
    desc: '对一名敌人和一名随机敌人造成 [魔法 + 3] 点伤害，。若敌人使用黄色法力值则造成双倍伤害。若存在任一风暴则给予所有其他盟友 6 点法力值。',
    build: skill(
      dmg('enemyChosen', 3, 1, { condMult: { times: 2, cond: { kind: 'targetColor', color: BaseColor.Yellow } } }),
      dmg('enemyRandom', 3, 1, { condMult: { times: 2, cond: { kind: 'targetColor', color: BaseColor.Yellow } } }),
      mana('allyOthers', 6, 0, { ifCond: { kind: 'stormPresent' } }),
    ),
  },
  {
    id: 8361,
    desc: '对第一名敌人造成 [魔法 + 1] 点伤害。若对方使用紫色法力值，则造成双倍伤害。如果对方是恶魔或野兽，则使对方陷入猎人标记和出血状态。',
    build: skill(
      dmg('enemyFront', 1, 1, { condMult: { times: 2, cond: { kind: 'targetColor', color: BaseColor.Purple } } }),
      inflict('marked', 'enemyFront', { ifCond: { kind: 'anyOf', of: [{ kind: 'targetRace', race: 'Daemon' }, { kind: 'targetRace', race: 'Beast' }] } }),
      inflict('bleed', 'enemyFront', { ifCond: { kind: 'anyOf', of: [{ kind: 'targetRace', race: 'Daemon' }, { kind: 'targetRace', race: 'Beast' }] } }),
    ),
  },
  {
    id: 8379,
    desc: '对一名敌人造成 [魔法 + 3] 点伤害，数值因末日骷髅头数而增强。召唤末日骷髅头风暴。 [x4]',
    build: skill(
      dmg('enemyChosen', 3, 1, { modifier: { mod: { kind: 'multiplier', a: 4 }, source: { kind: 'boardSpecial', gem: 'doomSkull' } } }),
      createStorm(BaseColor.Brown, { dropKind: 'doomSkull' }),
    ),
  },
  {
    id: 8412,
    desc: '对一名敌人造成 [魔法 + 6] 点伤害，伤害值因陷入死亡标记的敌人数而增强。使所有敌人陷入诅咒和疾病状态。 [x10]',
    build: skill(
      dmg('enemyChosen', 6, 1, { modifier: { mod: { kind: 'multiplier', a: 10 }, source: { kind: 'enemyStatusCount', statusId: 'death-mark' } } }),
      inflict('curse', 'enemyAll'),
      inflict('disease', 'enemyAll'),
    ),
  },
  {
    id: 8417,
    desc: '对一名敌人造成 [魔法 + 3] 点伤害。敌人每陷入中毒、疾病、击晕或诅咒状态的其中一个，则造成多 10 点伤害。 [x10]',
    build: skill(
      dmg('enemyChosen', 3, 1, {
        modifier: { mod: { kind: 'multiplier', a: 10 }, sources: [{ kind: 'enemyStatusCount', statusId: 'poison' }, { kind: 'enemyStatusCount', statusId: 'disease' }, { kind: 'enemyStatusCount', statusId: 'stun' }, { kind: 'enemyStatusCount', statusId: 'curse' }] },
      }),
    ),
  },
  {
    id: 8431,
    desc: '对一名敌人造成 [魔法 + 4] 点伤害。有 10% 的几率杀死对方，几率因陷入诅咒和织网状态的敌人数量而增强。 [x4]',
    build: skill(
      dmg('enemyChosen', 4),
      dmg('enemyChosen', 0, 0, {
        execute: true,
        chance: 0.1,
        chanceBoost: { mod: { kind: 'multiplier', a: 4 }, sources: [{ kind: 'enemyStatusCount', statusId: 'curse' }, { kind: 'enemyStatusCount', statusId: 'web' }] },
      }),
    ),
  },
  {
    id: 8488,
    desc: '对所有敌人造成 [魔法 + 4] 点真实伤害。每有一名陷入诅咒或疾病效果的敌人，则收回 2 点法力值。 [x2]',
    build: skill(
      // sa-R7: native counts Cursed / Diseased enemies at steps 0-1, before the true damage; the self-mana gain is
      // placed first so enemies killed by the hit still count (the mana gain does not affect the damage).
      mana('allySelf', 0, 0, { modifier: { mod: { kind: 'multiplier', a: 2 }, sources: [{ kind: 'enemyStatusCount', statusId: 'curse' }, { kind: 'enemyStatusCount', statusId: 'disease' }] } }),
      dmgAll(4, 1, true),
    ),
  },
  {
    id: 8560,
    desc: '对一名敌人造成 [魔法 + 2] 点伤害，伤害值因红色和紫色宝石而增强。召唤地狱风暴。 [1:1]',
    build: skill(
      dmg('enemyChosen', 2, 1, { modifier: { mod: { kind: 'ratio', a: 1, b: 1 }, sources: [{ kind: 'boardGems', color: BaseColor.Red }, { kind: 'boardGems', color: BaseColor.Purple }] } }),
      createStorm(BaseColor.Red),
    ),
  },
  {
    id: 8562,
    desc: '获得 [魔法 + 1] 点攻击力和生命值，因红色和紫色宝石而增强。然后召唤地狱风暴。 [1:1]',
    build: skill(
      // native: IncreaseAttack and IncreaseHealth both UseCounterForAmount (Red + Purple gems) (sa-R1)
      attack('allySelf', 1, 1, { modifier: { mod: { kind: 'ratio', a: 1, b: 1 }, sources: [{ kind: 'boardGems', color: BaseColor.Red }, { kind: 'boardGems', color: BaseColor.Purple }] } }),
      heal('allySelf', 1, 1, { modifier: { mod: { kind: 'ratio', a: 1, b: 1 }, sources: [{ kind: 'boardGems', color: BaseColor.Red }, { kind: 'boardGems', color: BaseColor.Purple }] } }),
      createStorm(BaseColor.Red),
    ),
  },
  {
    id: 8651,
    desc: '造成 [魔法 + 8] 点散射伤害，伤害值因通配宝石和紫色敌人数而增强。若有敌人身亡，则创建 4 颗 x2 通配宝石。 [x4]',
    // 裸散射重裁（2026-09-18）：官方 ScatterDamage@AllEnemies = 全体散射
    build: skill(
      dmg('enemyAll', 8, 1, { range: 'all', modifier: { mod: { kind: 'multiplier', a: 4 }, sources: [{ kind: 'boardSpecial', gem: 'wildcard' }, { kind: 'enemiesOfColor', color: BaseColor.Purple }] } }), // sa-R2 L4b-7108: CountArmyColor@AllEnemies (Purple enemies)
      createSpecialGems({ kind: 'wildcard', tier: 2 }, 4, 0, { ifTargetDied: true }),
    ),
  },
  {
    id: 8745,
    desc: '选择一颗宝石。创造 3 颗炸弹宝石。再摧毁宝石的行和列。',
    build: skill(
      // 「选择一颗宝石」由 chosenLine 选择器承担：两条 chosenLine 读同一 ctx.chosenCell = 行+列十字（batch-13/14 口径）
      createSpecialGems({ kind: 'bomb' }, 3),
      destroyChosenRow(),
      destroyChosenCol(),
    ),
  },
  {
    id: 8783,
    desc: '摧毁一行。使首 2 位敌人陷入诅咒和疾病状态，在对他们造成 [魔法 + 3] 点伤害，伤害值因被摧毁的绿色宝石数而增强。 [x3]',
    build: skill(
      // sa-F2 fix round A (R001): native CountGems Green (row) ; CauseCursed ; CauseDisease ; DestroyGems Row ; Damage
      inflict('curse', 'enemyFirstN', { n: 2 }),
      inflict('disease', 'enemyFirstN', { n: 2 }),
      destroyChosenRow(),
      dmg('enemyFirstN', 3, 1, { n: 2, modifier: { mod: { kind: 'multiplier', a: 3 }, source: { kind: 'destroyedGems', color: BaseColor.Green } } }),
    ),
  },
  {
    id: 8924,
    desc: '给予第一位盟友 [魔法 + 1] 点攻击力，将所有黄色宝石转换成紫色宝石以增强效果。使所有敌人陷入诅咒状态。 [3:1]',
    build: skill(
      // 「以增强效果」句式：转化段前置，transformedGems 来源才数得到（batch-04 7002 同款）
      // sa-F2 fix round A (R001): native CountGems Yellow ; IncreaseAttack@FrontAlly ; ConvertGems ; CauseCursed
      attack('allyFront', 1, 1, { modifier: { mod: { kind: 'ratio', a: 3, b: 1 }, source: { kind: 'boardGems', color: BaseColor.Yellow } } }),
      transform(BaseColor.Yellow, BaseColor.Purple),
      inflict('curse', 'enemyAll'),
    ),
  },
  {
    id: 9946,
    desc: '对敌人造成[魔法 + 3]点伤害，紫色宝石可提升伤害。然后诅咒并蛛化该敌人。 [1:1]',
    build: skill(
      dmg('enemyChosen', 3, 1, { modifier: { mod: { kind: 'ratio', a: 1, b: 1 }, source: { kind: 'boardGems', color: BaseColor.Purple } } }),
      inflict('curse', 'enemyChosen'),
      inflict('web', 'enemyChosen'),
    ),
  },
];

export const BATCH_P37: CuratedBatch = { batch: 'p37', spells: SPELLS, skipped: SKIPPED };
