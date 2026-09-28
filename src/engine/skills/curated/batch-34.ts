/**
 * 人工核对组装 · 批次 34（池：scripts/curated-pools/pool-34.json）
 * 核对者：窗口 E（2026-09-16 · TASK-CONTENT 阶段4 第一波）
 *
 * 语义裁定备注：
 * - 新状态组装口径（spell-rules §6，2026-09-16 词表）：死亡标记='death-mark'、疾病='disease'、
 *   诅咒='curse'、魅惑='charm'、猎人标记='marked'。WEB_GEM 织网='web'。
 * - 「中毒或死亡标记状态的敌军数量」用 sources[] 计数相加（8181「缠绕和出血」同款，加算近似并集）。
 * - 「对其/他/使 其」指回前段**静态指定**目标（chosen/front）→ 同目标多段合法；
 *   指回前段**随机**目标仍 SKIP（跨段随机绑定，7371/7381 族）。
 * - 本批 SKIP 大头（22 条，其中 8 条已于 2026-09-16 引擎原语批后移入 batch-37：
 *   7212/7788/8094/8131/8132/8134/8303/9726——风暴在场条件 stormPresent、数量区间
 *   nRange/countRange 落地消解了它们的受阻理由）：
 *   · 「若(存在/正在进行)风暴」条件族 6 条（8934/9726/7788/8094/8131/8132/8134）——
 *     stormPresent 条件 kind 已落地（spell-rules §9.2），仅 8934 因散射目标不明维持 SKIP；
 *   · 「造成…散射伤害」未指明目标 2 条（7007/8934，7265 同款）；
 *   · 燃烧宝石 3 条（8746/8757/7363，不在窗口 C 十种内）；
 *   · 创造数量区间 3 条（8114 叠层数区间/9908/7212/8303）——countRange 已落地，9908 剩
 *     闪电行列不明、8114 叠层数区间不在数量区间辖域；
 *   · 「消除/减除随机技能值」2 条（8165/7340，无对应削减原语）；
 *   · 兵种转化（8187）、动态颜色（8215「其法力颜色」）、跨段随机绑定（7320/7371）。
 */
import { skill, dmg, dmgAll, attack, inflict, reduce, drainMana, destroyRandomGems, explodeRandomGems, createSpecialGems, transformToSpecial } from '../builders';
import { BaseColor } from '../../types';
import type { CuratedBatch } from './index';

const SKIPPED: { id: number; reason: string }[] = [
  { id: 8165, reason: '「从其 2 个随机技能值消除 N 点」无对应削减原语（batch-25 9241 同款）' },
  { id: 7320, reason: '「使敌人陷入燃烧或疾病状态」二选一虽已有一选一原语（oneOf），但「敌人」指回前段随机敌人——跨段随机绑定仍不做（batch-24 9630 同款）' },
  { id: 8114, reason: '「叠加 2-4 倍的出血状态」叠层数为区间，数值不明（数量区间 nRange/countRange 不辖叠层数）' },
  { id: 8187, reason: '「转化成一名敌人」兵种转化无对应原语（SOP 措辞裁定）' },
  { id: 9197, reason: '「再造成 [魔法 + 6] 点散射伤害」未指明目标（batch-02 7265 同款）——「将一名宝石转换成黄色闪电宝石」单颗转换已由定量转换落地（batch-37 回收批），仅剩此卡点' },
  { id: 9908, reason: '「生成 4-10 颗闪电宝石」数量区间已可表达，但闪电宝石文本未区分行列仍不可表达（SOP 特殊宝石节）' },
  { id: 7340, reason: '「减除全部敌人 N 点随机技能值」无对应削减原语（batch-25 9241 同款）' },
];

const SPELLS: CuratedBatch['spells'] = [
  {
    id: 7003,
    desc: '对 1 名敌人造成 [魔法 + 3] 点伤害。如果敌人已陷入猎人标记状态，则造成三倍伤害。',
    build: skill(
      dmg('enemyChosen', 3, 1, { condMult: { times: 3, cond: { kind: 'targetStatus', statusId: 'marked' } } }),
    ),
  },
  {
    id: 7321,
    desc: '耗掉一名敌人 [魔法 + 1] 点法力值，并使其陷入死亡标记状态。',
    build: skill(
      reduce('enemyChosen', 'mana', 1, 1),
      inflict('death-mark', 'enemyChosen'),
    ),
  },
  {
    id: 7325,
    desc: '对所有敌人造成 [魔法 + 3] 点伤害。有 75% 的几率让所有敌人陷入疾病状态。',
    build: skill(
      dmgAll(3, 1),
      inflict('disease', 'enemyAll', { chance: 0.75 }),
    ),
  },
  {
    id: 7359,
    desc: '对 1 名敌人造成 [魔法 + 3] 点伤害并使其陷入疾病状态。',
    // Native order CauseDisease -> Delay -> Damage (rulings/R001, L5-013).
    build: skill(
      inflict('disease', 'enemyChosen'),
      dmg('enemyChosen', 3, 1),
    ),
  },
  {
    id: 7432,
    desc: '对 1 名敌人造成 [魔法 + 8] 点伤害。使一名随机盟友陷入死亡标记状态。',
    build: skill(
      dmg('enemyChosen', 8, 1),
      // 官方原文即「随机盟友」上死亡标记（自伤面），照录
      inflict('death-mark', 'allyRandom'),
    ),
  },
  {
    id: 7455,
    desc: '魅惑两名随机敌人。',
    // L1-6305-repeat: native two independent Charm@RandomEnemy steps (the same enemy may be picked twice).
    build: skill(
      inflict('charm', 'enemyRandom'),
      inflict('charm', 'enemyRandom'),
    ),
  },
  {
    id: 7502,
    desc: '对所有敌人造成 [魔法 + 6] 点散射伤害，伤害值因陷入中毒或死亡标记状态的敌军数量而增强。 [x7]',
    build: skill(
      // 「对所有敌人…散射伤害」= dmg enemyAll + range all（SOP 措辞裁定）；
      // 「中毒或死亡标记…数量」= sources[] 计数相加（8181 加算口径）
      dmg('enemyAll', 6, 1, {
        range: 'all',
        modifier: {
          mod: { kind: 'multiplier', a: 7 },
          sources: [{ kind: 'enemyStatusCount', statusId: 'poison' }, { kind: 'enemyStatusCount', statusId: 'death-mark' }],
        },
      }),
    ),
  },
  {
    id: 7703,
    desc: '使首位敌人陷入织网、猎人标记和死亡标记状态。对其造成 [魔法 + 3] 点伤害。',
    build: skill(
      // 「对其」= 首位敌人（静态指定，多段同目标合法）
      inflict('web', 'enemyFront'),
      inflict('marked', 'enemyFront'),
      inflict('death-mark', 'enemyFront'),
      dmg('enemyFront', 3, 1),
    ),
  },
  {
    id: 7728,
    desc: '对一名敌人造成 [魔法 + 7] 点伤害。魅惑敌人并使其陷入中毒状态。',
    build: skill(
      // L1-6534-order (R001): native Charm -> Damage -> CausePoison.
      inflict('charm', 'enemyChosen'),
      dmg('enemyChosen', 7, 1),
      inflict('poison', 'enemyChosen'),
    ),
  },
  {
    id: 7771,
    desc: '对一名敌人造成 [魔法 + 2] 点伤害，并使其陷入疾病和中毒状态。',
    build: skill(
      dmg('enemyChosen', 2, 1),
      inflict('disease', 'enemyChosen'),
      inflict('poison', 'enemyChosen'),
    ),
  },
  {
    id: 8064,
    desc: '爆破 [魔法 + 1] 颗棕色宝石，再使 2 名随机敌人陷入中毒和疾病状态。',
    build: skill(
      explodeRandomGems(1, 1, 'color', BaseColor.Brown),
      // 两组随机目标各自独立抽取（文本即「2 名随机敌人」两状态各自结算面）
      inflict('poison', 'enemyRandomN', { n: 2 }),
      inflict('disease', 'enemyRandomN', { n: 2 }),
    ),
  },
  {
    id: 8097,
    desc: '对一名敌人造成  [魔法 + 4] 点伤害。若敌人受诅咒，则造成双倍伤害，并再诅咒敌人。',
    build: skill(
      dmg('enemyChosen', 4, 1, { condMult: { times: 2, cond: { kind: 'targetStatus', statusId: 'curse' } } }),
      // 原生 CauseCursed@FromTarget 无条件（EN "Then Curse them"）
      inflict('curse', 'enemyChosen'),
    ),
  },
  {
    id: 8136,
    desc: '赋予自身狂怒效果，并获得 [魔法 + 1] 点攻击力，数值因陷入疾病状态的敌人而增强。 [x2]',
    build: skill(
      inflict('rage', 'allySelf'),
      // 泛指「数值」→ 挂最近（唯一）数值段 = attack；来源 enemyStatusCount disease（新状态计数）
      attack('allySelf', 1, 1, {
        modifier: { mod: { kind: 'multiplier', a: 2 }, source: { kind: 'enemyStatusCount', statusId: 'disease' } },
      }),
    ),
  },
  {
    id: 8195,
    desc: '对一名敌人造成 [魔法 + 4] 点伤害。再使其陷入诅咒、击晕和中毒状态。',
    build: skill(
      dmg('enemyChosen', 4, 1),
      inflict('curse', 'enemyChosen'),
      inflict('stun', 'enemyChosen'),
      inflict('poison', 'enemyChosen'),
    ),
  },
  {
    id: 8207,
    desc: '对一名敌人造成 [魔法 + 3] 点伤害。若敌人是一名不死族或恶魔，则耗尽其所有法力值并诅咒他。',
    build: skill(
      dmg('enemyChosen', 3, 1),
      // 析取条件 anyOf（SOP 条件组合节）；「耗尽法力」= drainMana、「诅咒他」= inflict curse
      drainMana('enemyChosen', { ifCond: { kind: 'anyOf', of: [{ kind: 'targetRace', race: 'Undead' }, { kind: 'targetRace', race: 'Daemon' }] } }),
      inflict('curse', 'enemyChosen', { ifCond: { kind: 'anyOf', of: [{ kind: 'targetRace', race: 'Undead' }, { kind: 'targetRace', race: 'Daemon' }] } }),
    ),
  },
  {
    id: 8308,
    desc: '魅惑首位敌人并耗掉他 3 点法力值。',
    build: skill(
      inflict('charm', 'enemyFront'),
      reduce('enemyFront', 'mana', 3, 0),
    ),
  },
  {
    id: 8823,
    desc: '摧毁 [魔法 + 1] 颗宝石。再创造 3 颗炸弹宝石。',
    build: skill(
      // 「宝石」不含骷髅 → include 'color'（8614 口径）
      destroyRandomGems(1, 1, 'color'),
      createSpecialGems({ kind: 'bomb' }, 3, 0),
    ),
  },
  {
    id: 8940,
    desc: '将所有棕色宝石转换成织网宝石。',
    build: skill(
      transformToSpecial(BaseColor.Brown, 'web'),
    ),
  },
];

export const BATCH_34: CuratedBatch = { batch: '34', spells: SPELLS, skipped: SKIPPED };
