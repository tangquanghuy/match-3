/**
 * 人工核对组装 · 批次 37（窗口 E · 引擎原语批回收批，池：batch-34/35/36 SKIPPED 回收——每条注明原批）
 *
 * 背景：2026-09-16 引擎原语批（DECISIONS 翻案记录②，spell-rules.md §9）落地：
 * createStorm 效果段（复用 TurnEngine 全场唯一/顶替裁定）、stormPresent / anyEnemyStatus /
 * anyAllyStatus 条件、oneOf 随机多选一、定量转换（transform count/'ANY'+特殊宝石端点）、
 * dispelStatus 定向驱散单一状态、reduce/buff halve（比例法力）、目标 nRange 与创造/爆破
 * countRange 数量区间、shuffleBoard 打乱板面、enemyChosenAndBelow 位置复合目标。
 * 据此从 batch-34（8 条）/batch-35（11 条）/batch-36（13 条）SKIPPED 收回 32 条；
 * 原 SKIPPED 行已同步移除，理由由新原语消解。
 *
 * 语义裁定备注（均为本批新增口径，已写入 spell-rules §9 / SOP 词汇表）：
 * - 「或」二/三选一 = oneOf 掷签（8222/8472/8675/8756/7934/9192/8722）；多色池（「绿色或紫色
 *   宝石」随机取一池）不是二选一，仍 blocked（batch-35 8429 维持）。
 * - 「获得半数法力值」= mana halve（半条法力 floor(manaCost/2)，8743）。
 * - 「若有(一名)敌人陷入X状态」= anyEnemyStatus 全局存在判定（8743/8138），与逐目标过滤的
 *   targetStatus 区分。
 * - 骸骨风暴 = createStorm(Brown, { dropKind: 'skull' })；「如果现有骸骨风暴」=
 *   stormPresent { dropKind: 'skull' }（7530）。
 * - 「对其/他们」指回前段静态指定目标（enemyChosen/enemyFront）→ 多段同目标合法
 *   （batch-34 头注口径）；oneOf 分支内的多段同目标同理（8472）。
 * - 「使其获得死亡标记」类条件追加段挂 ifCond targetStatus（9784：流血才驱散+诅咒+偷蓝）。
 * - 窃取未写转为何属性 → 同属性回填（batch-01 7141 口径，7212）。
 * - 「吸取其 3 点法力值」= steal mana→mana（9784）。
 * - 「施魔法于所有的精灵同盟」与首句「5 点魔法」共享常数 5（batch-35 原判「本可表达」，8718）。
 * - 「对(一名敌人)和其下方的所有敌人」= enemyChosenAndBelow + range 'all'（名单内全额，
 *   8065；「上下相邻」另一读法仍 blocked，batch-35 8943 维持）。
 */
import { skill, dmg, dmgAll, trueDmg, heal, armor, magic, mana, inflict, reduce, steal,
  createGems, createSpecialGems, transform, transformToSpecial, dispelStatus, createStorm,
  oneOf, explodeRandomGems, explodeSpecialGems, destroySpecialGems, targetedSkill } from '../builders';
import { BaseColor } from '../../types';
import { POSITIVE_STATUS_IDS } from '../effects/status';
import type { CuratedBatch } from './index';

const SKIPPED: { id: number; reason: string }[] = [];

const SPELLS: CuratedBatch['spells'] = [
  {
    id: 7212,
    desc: '窃取一名敌人 [魔法 + 3] 点护甲值，再造成 [魔法 + 3] 点真实伤害。创造 1-2 颗炸弹宝石。',
    build: skill(
      // 未写转为何属性 → 同属性回填（batch-01 7141 口径）
      steal('enemyChosen', 'armor', 'armor', 3, 1),
      trueDmg('enemyChosen', 3, 1),
      // 数量区间（原语批 §9.8）
      createSpecialGems({ kind: 'bomb' }, 1, 0, { countRange: { min: 1, max: 2 } }),
    ),
  },
  {
    id: 7494,
    desc: '对 1 名敌人造成 [魔法 + 3] 点伤害。如果有 13 颗或更多蓝色宝石，则造成三倍伤害。创造冰风暴。',
    build: skill(
      dmg('enemyChosen', 3, 1, { condMult: { times: 3, cond: { kind: 'boardAtLeast', color: BaseColor.Blue, n: 13 } } }),
      createStorm(BaseColor.Blue),
    ),
  },
  {
    id: 7495,
    desc: '对 1 名敌人造成 [魔法 + 3] 点伤害。如果有 13 颗或更多绿色宝石，则造成三倍伤害。创造叶风暴。',
    build: skill(
      dmg('enemyChosen', 3, 1, { condMult: { times: 3, cond: { kind: 'boardAtLeast', color: BaseColor.Green, n: 13 } } }),
      createStorm(BaseColor.Green),
    ),
  },
  {
    id: 7496,
    desc: '对 1 名敌人造成 [魔法 + 3] 点伤害。如果有 13 颗或更多红色宝石，则造成三倍伤害。创造火风暴。',
    build: skill(
      dmg('enemyChosen', 3, 1, { condMult: { times: 3, cond: { kind: 'boardAtLeast', color: BaseColor.Red, n: 13 } } }),
      createStorm(BaseColor.Red),
    ),
  },
  {
    id: 7497,
    desc: '对 1 名敌人造成 [魔法 + 3] 点伤害。如果有 13 颗或更多黄色宝石，则造成三倍伤害。创造光风暴。',
    build: skill(
      dmg('enemyChosen', 3, 1, { condMult: { times: 3, cond: { kind: 'boardAtLeast', color: BaseColor.Yellow, n: 13 } } }),
      createStorm(BaseColor.Yellow),
    ),
  },
  {
    id: 7498,
    desc: '对 1 名敌人造成 [魔法 + 3] 点伤害。如果有 13 颗或更多紫色宝石，则造成三倍伤害。创造暗风暴。',
    build: skill(
      dmg('enemyChosen', 3, 1, { condMult: { times: 3, cond: { kind: 'boardAtLeast', color: BaseColor.Purple, n: 13 } } }),
      createStorm(BaseColor.Purple),
    ),
  },
  {
    id: 7499,
    desc: '对 1 名敌人造成 [魔法 + 3] 点伤害。如果有 13 颗或更多棕色宝石，则造成三倍伤害。创造尘风暴。',
    build: skill(
      dmg('enemyChosen', 3, 1, { condMult: { times: 3, cond: { kind: 'boardAtLeast', color: BaseColor.Brown, n: 13 } } }),
      createStorm(BaseColor.Brown),
    ),
  },
  {
    id: 7530,
    desc: '对 1 名敌人造成 [魔法 + 4] 点伤害。如果现有骸骨风暴则伤害双倍。创造骸骨风暴。',
    build: skill(
      // 「现有骸骨风暴」= stormPresent dropKind 筛骷髅系（原语批 §9.2）
      dmg('enemyChosen', 4, 1, { condMult: { times: 2, cond: { kind: 'stormPresent', dropKind: 'skull' } } }),
      // 骸骨风暴 = 骷髅系掉落加权，Brown 仅为指示器主色（DECISIONS 骷髅系风暴回填）
      createStorm(BaseColor.Brown, { dropKind: 'skull' }),
    ),
  },
  {
    id: 7788,
    desc: '对所有敌人造成  [魔法 + 10] 点散射伤害。若正在进行任何风暴，则造成三倍伤害。',
    build: skill(
      dmg('enemyAll', 10, 1, { range: 'all', condMult: { times: 3, cond: { kind: 'stormPresent' } } }),
    ),
  },
  {
    id: 7934,
    desc: '召唤暗风暴，并使所有敌人陷入疾病状态，或冻结所有敌人，或击晕所有敌人。',
    build: skill(
      createStorm(BaseColor.Purple),
      // 三选一（原语批 §9.3）：掷签一支
      oneOf(
        [inflict('disease', 'enemyAll')],
        [inflict('frozen', 'enemyAll')],
        [inflict('stun', 'enemyAll')],
      ),
    ),
  },
  {
    id: 8065,
    desc: '对一名敌人和其下方的所有敌人造成 [魔法 + 2] 点伤害。若敌人已陷入诅咒状态，则对其造成双倍伤害并再使其陷入死亡标记状态。',
    build: skill(
      // enemyChosenAndBelow：指定者 + 编队更靠后的全部存活敌人；名单内全额 → range 'all'（原语批 §9.10）
      // native: FromTarget [MultiplyForCursed 2] ; BelowTarget plain ; FromTarget Death Mark [AddForCursed].
      // Only the chosen enemy is checked, doubled and Death Marked.
      dmg('enemyChosen', 2, 1, { condMult: { times: 2, cond: { kind: 'targetStatus', statusId: 'curse' } } }),
      dmg('enemyBelowTarget', 2, 1, { range: 'all' }),
      inflict('death-mark', 'enemyChosen', { ifCond: { kind: 'targetStatus', statusId: 'curse' } }),
    ),
  },
  {
    id: 8093,
    desc: '将红色宝石转换成蓝色。召唤冰风暴。',
    build: skill(
      transform(BaseColor.Red, BaseColor.Blue),
      createStorm(BaseColor.Blue),
    ),
  },
  {
    id: 8094,
    desc: '对所有敌人造成 [魔法 + 4] 点伤害。若存在冰风暴，则诅咒所有敌人。',
    build: skill(
      dmgAll(4, 1),
      // 「若存在冰风暴」= stormPresent color 筛色（原语批 §9.2）
      inflict('curse', 'enemyAll', { ifCond: { kind: 'stormPresent', color: BaseColor.Blue } }),
    ),
  },
  {
    id: 8131,
    desc: '给予所有盟友 [魔法 + 1] 点生命值。若存在风暴，则耗掉所有敌人 4 点法力值。',
    build: skill(
      heal('allyAll', 1, 1),
      reduce('enemyAll', 'mana', 4, 0, { ifCond: { kind: 'stormPresent' } }),
    ),
  },
  {
    id: 8132,
    desc: '对一名敌人造成 [魔法 + 4] 点伤害。若存在一种风暴，则有 20% 的几率杀死对方。',
    build: skill(
      dmg('enemyChosen', 4, 1),
      // 「杀死」= execute（即杀，SOP 措辞裁定）+ chance 0.2 + 风暴在场条件
      dmg('enemyChosen', 0, 0, { execute: true, chance: 0.2, ifCond: { kind: 'stormPresent' } }),
    ),
  },
  {
    id: 8134,
    desc: '对所有敌人造成 [魔法 + 3] 点伤害。若存在一种风暴，则爆破 5 颗宝石。',
    build: skill(
      dmgAll(3, 1),
      // native ExplodeGems [AddForAnyStorm 5]: any gem, Skulls included (R013-5)
      explodeRandomGems(5, 0, 'all', undefined, { ifCond: { kind: 'stormPresent' } }),
    ),
  },
  {
    id: 8138,
    desc: '爆破 [(魔法 / 2) + 1] 颗宝石。若有一名敌人陷入疾病状态，则使 1 到 4 名敌人中毒。',
    build: skill(
      explodeRandomGems(1, 0.5, 'all'),
      // 「若有一名敌人陷入疾病状态」= anyEnemyStatus 存在判定。sa-A r4: native 「1 到 4 名」= four conditional
      // Poison@RandomEnemy steps at 100% / 50% / 25% / 25%, each a fresh random pick (ResetTargets, may repeat);
      // was nRange 1-4 distinct enemies, uniform.
      inflict('poison', 'enemyRandom', { ifCond: { kind: 'anyEnemyStatus', statusId: 'disease' } }),
      inflict('poison', 'enemyRandom', { chance: 0.5, ifCond: { kind: 'anyEnemyStatus', statusId: 'disease' } }),
      inflict('poison', 'enemyRandom', { chance: 0.25, ifCond: { kind: 'anyEnemyStatus', statusId: 'disease' } }),
      inflict('poison', 'enemyRandom', { chance: 0.25, ifCond: { kind: 'anyEnemyStatus', statusId: 'disease' } }),
    ),
  },
  {
    id: 8222,
    desc: '召唤叶风暴，再使所有敌人陷入或疾病或缠绕或中毒效果。',
    build: skill(
      createStorm(BaseColor.Green),
      oneOf(
        [inflict('disease', 'enemyAll')],
        [inflict('entangle', 'enemyAll')],
        [inflict('poison', 'enemyAll')],
      ),
    ),
  },
  {
    id: 8277,
    desc: '将棕色宝石转换成红色。召唤火风暴。',
    build: skill(
      transform(BaseColor.Brown, BaseColor.Red),
      createStorm(BaseColor.Red),
    ),
  },
  {
    id: 8303,
    desc: '对首位敌人造成 [魔法 + 2] 点伤害，并使其陷入猎人标记状态。创造 8-12 颗紫色宝石。',
    build: skill(
      dmg('enemyFront', 2, 1),
      inflict('marked', 'enemyFront'),
      createGems(BaseColor.Purple, 8, 0, { countRange: { min: 8, max: 12 } }),
    ),
  },
  {
    id: 8317,
    desc: '爆破 4 颗宝石并召唤一个骸骨风暴。',
    build: skill(
      // native ExplodeGems 4 (colourless): any gem incl. Skulls (R013-5)
      explodeRandomGems(4, 0, 'all'),
      createStorm(BaseColor.Brown, { dropKind: 'skull' }),
    ),
  },
  {
    id: 8472,
    desc: '对一名敌人造成 [魔法 + 1] 点真实伤害，再使他们陷入燃烧状态。或摧毁所有炸弹宝石。',
    build: targetedSkill('enemyChosen',
      // 「或」= 二选一掷签；第一支含两段（真实伤害+燃烧，同目标）
      // sa-F1: native Target Enemy; declare the chosen enemy (inputTarget) — oneOf branches are not scanned for it.
      oneOf(
        [trueDmg('enemyChosen', 1, 1), inflict('burning', 'enemyChosen')],
        destroySpecialGems('bomb'),
      ),
    ),
  },
  {
    id: 8675,
    desc: '对一名敌人造成 [魔法 + 2] 点伤害。再使他们陷入冻结和死亡标记状态。',
    // English "Then Freeze and Death Mark them"; native CauseFrozen + CauseDeathMark, both always (not one of).
    build: skill(
      dmg('enemyChosen', 2, 1),
      inflict('frozen', 'enemyChosen'),
      inflict('death-mark', 'enemyChosen'),
    ),
  },
  {
    id: 8718,
    desc: '给予所有盟友 [魔法 + 3] 点生命值和 5 点魔法。然后发起一场烈火风暴，并赋予所有仙灵盟友法印效果。',
    build: skill(
      heal('allyAll', 3, 1),
      magic('allyAll', 5, 0),
      createStorm(BaseColor.Red),
      // native CauseEnchanted@AllyType fey: Enchant all Fey allies (was +5 Magic to Elf allies)
      inflict('enchanted', 'allyAll', { targetRace: 'Fey' }),
    ),
  },
  {
    id: 8722,
    desc: '将一颗宝石转换成炸弹宝石。再创造 3 颗炸弹宝石或爆破所有炸弹宝石。',
    build: skill(
      // 原生 ConvertGems BoardTarget SingleGem + Color1 FromTarget（spell Target Board）= 玩家选定的
      // 那颗宝石 → 炸弹宝石（L2-singlegem-cell；原 'ANY' 为随机一颗）
      transformToSpecial('CELL', 'bomb', { count: 1 }),
      oneOf(
        [createSpecialGems({ kind: 'bomb' }, 3, 0)],
        [explodeSpecialGems('bomb')],
      ),
    ),
  },
  {
    id: 8743,
    desc: '将所有棕色宝石转换成紫色。若有敌人陷入诅咒状态，则获得半数法力值。',
    build: skill(
      transform(BaseColor.Brown, BaseColor.Purple),
      // 「获得半数法力值」= mana halve（半条法力 floor(manaCost/2)，原语批 §9.6）；
      // 「若有敌人陷入诅咒状态」= anyEnemyStatus（原语批 §9.7）
      mana('allySelf', 0, 0, { halve: true, ifCond: { kind: 'anyEnemyStatus', statusId: 'curse' } }),
    ),
  },
  {
    id: 8756,
    desc: '耗掉一名敌人 7 点法力值，再使所有敌人陷入死亡标记，或沉默，或诅咒状态。',
    build: skill(
      // 英文 Drain 7 Mana from an Enemy / 原生 DecreaseMana@FromTarget（施法目标 Enemy）：选定敌人；三分支共用，先耗蓝再上状态（sa-H：原 allyChosen 误）
      reduce('enemyChosen', 'mana', 7, 0),
      oneOf(
        [inflict('death-mark', 'enemyAll')],
        [inflict('silence', 'enemyAll')],
        [inflict('curse', 'enemyAll')],
      ),
    ),
  },
  {
    id: 8772,
    desc: '获得 [(魔法 x 1.5) + 2] 点护甲值，和屏障效果。若有风暴进行中，则给予其他盟友屏障效果。',
    build: skill(
      armor('allySelf', 2, 1.5),
      inflict('barrier', 'allySelf'),
      // 「其他盟友」= allyOthers（措辞表）
      inflict('barrier', 'allyOthers', { ifCond: { kind: 'stormPresent' } }),
    ),
  },
  {
    id: 8981,
    desc: '将红色宝石转换成绿色。召唤叶风暴。',
    build: skill(
      transform(BaseColor.Red, BaseColor.Green),
      createStorm(BaseColor.Green),
    ),
  },
  {
    id: 9192,
    desc: '获得屏障效果。创造 11 颗蓝色闪电宝石或 11 颗黄色闪电宝石。',
    build: skill(
      inflict('barrier', 'allySelf'),
      // 蓝色闪电 = lightningRow、黄色 = lightningCol（SPECIAL_MATCH_COLOR 词表）；
      // 「蓝色或黄色」= oneOf 二选一（颜色即行列区分，batch-34 9908 的「未区分行列」不适用）
      oneOf(
        [createSpecialGems({ kind: 'lightningRow' }, 11, 0)],
        [createSpecialGems({ kind: 'lightningCol' }, 11, 0)],
      ),
    ),
  },
  {
    id: 9726,
    desc: '赋予一名盟友[魔法 + 1]生命值和护甲。若风暴生效，效果加倍。',
    build: skill(
      // 「效果加倍」辖同句两段 → 两段各挂同值 condMult（「一个方括号喂双段」8372 口径扩展）
      heal('allyChosen', 1, 1, { condMult: { times: 2, cond: { kind: 'stormPresent' } } }),
      armor('allyChosen', 1, 1, { condMult: { times: 2, cond: { kind: 'stormPresent' } } }),
    ),
  },
  {
    id: 9784,
    desc: '对一名敌人造成 [魔法 + 4] 点伤害。如果该敌人处于流血状态，则驱散并诅咒该敌人，再吸取其 3 点法力值。',
    build: skill(
      // sa-F: native order DispelConditional -> Curse -> DecreaseMana 3 (all AddForBleed) -> Damage (R001).
      // Dispel = remove the target's positive statuses (Bleed is negative and stays).
      ...POSITIVE_STATUS_IDS.map(statusId => dispelStatus(statusId, 'enemyChosen', { ifCond: { kind: 'targetStatus', statusId: 'bleed' } })),
      inflict('curse', 'enemyChosen', { ifCond: { kind: 'targetStatus', statusId: 'bleed' } }),
      // L3-007: 「吸取其 3 点法力值」native DecreaseMana (drain) — no refill to the caster
      reduce('enemyChosen', 'mana', 3, 0, { ifCond: { kind: 'targetStatus', statusId: 'bleed' } }),
      dmg('enemyChosen', 4, 1),
    ),
  },
];

export const BATCH_37: CuratedBatch = { batch: '37', spells: SPELLS, skipped: SKIPPED };
