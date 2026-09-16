/**
 * 人工核对组装 · 批次 35（池：scripts/curated-pools/pool-35.json）
 * 核对者：窗口 E（2026-09-16 · TASK-CONTENT 阶段4 第二波）
 *
 * 语义裁定备注：
 * - 「使他们」指回前段 enemyWeakestN 等状态性目标 → 跨段绑定 SKIP（前段伤害会改变
 *   「最弱」集合，重算语义拿不准，8752）；指回 enemyFront/enemyLast/chosen 等静态目标合法。
 * - 「X 或 Y 状态/宝石」二选一：~~仍 SKIP~~ **2026-09-16 原语批已落 oneOf**（spell-rules §9.3，
 *   8472/8675/7934 已移入 batch-37）；多色池（「绿色或紫色宝石」并集随机取）不是二选一（8429 维持）。
 *   「A 和 B 状态」加算 sources[] 或双 inflict 段合法。
 * - 「被摧毁的织网宝石数」来源不支持：destroyedGems 仅按色筛，特殊宝石无色不可计（7014）。
 * - ~~「创造/发起一场X风暴」无技能原语~~ → **2026-09-16 原语批已落 createStorm**（spell-rules §9.1），
 *   7494-7499/7530/7934/8718 共 8 条移入 batch-37；7482 因「随机一项技能值降低」维持 SKIP。
 * - 「承受 3 点伤害」= 对自身 reduce hp（直接扣血夹零，7392）。
 */
import { skill, dmg, dmgAll, heal, armor, mana, inflict, reduce, summonRandom, createSpecialGems, transformToSpecial, transform } from '../builders';
import { BaseColor } from '../../types';
import type { CuratedBatch } from './index';

const SKIPPED: { id: number; reason: string }[] = [
  { id: 8429, reason: '「爆破…绿色或紫色宝石」是多色池随机取（并集池），不是二选一分支——oneOf 不适用（count 池仅单色，destroyRandomGems 仅单色）' },
  { id: 8752, reason: '「使他们」指回前段 enemyWeakestN——状态性目标跨段绑定（前段窃取改变最弱集合），语义拿不准' },
  { id: 8943, reason: '「对上下相邻的敌人」=「前后各一名」的相邻语义与「其下方」（enemyChosenAndBelow，原语批已落）不同读法，且主语混乱（「对…也获得」），语义拿不准' },
  { id: 9675, reason: '「诅咒宝石」不在窗口 C 已实现特殊宝石清单（等美术/裁定）' },
  { id: 9844, reason: '「潜入」状态语义不明（submerged 为己方下潜，此处施于敌人语义拿不准）；「已处于潜入状态」自身状态条件亦不在 condMult 域' },
  { id: 7469, reason: '「给予他们 3-8 点法力值」数值型区间（非数量区间），nRange/countRange 不辖，数值不明' },
  { id: 7482, reason: '「召唤暗风暴」已由 createStorm 落地（batch-37 口径）；「将所有敌人的随机一项技能值降低」削减版随机原语仍缺，整条维持' },
  { id: 7541, reason: '「则再加 10 点伤害并获得一个额外回合」——条件化额外回合（ifCond 目标相对条件挂无目标段整段跳过）不可表达' },
  { id: 7629, reason: '「再转化成暗魄狼或蝙蝠群」兵种转化无对应原语（SOP 措辞裁定；「若现有暗风暴」已由 stormPresent 落地，仅剩此卡点）' },
  { id: 7631, reason: '「再转化成诺斯费拉图」兵种转化无对应原语' },
];

const SPELLS: CuratedBatch['spells'] = [
  {
    id: 7023,
    desc: '魅惑一名随机敌人。若敌人身亡，则获得 8 点法力值。',
    build: skill(
      inflict('charm', 'enemyRandom'),
      // 「若敌人身亡」判定=前段魅惑段主目标（spell-rules §4；非随机绑定问题——判定读追踪）
      mana('allySelf', 8, 0, { ifTargetDied: true }),
    ),
  },
  {
    id: 7038,
    desc: '对最后一名敌人造成 [魔法 + 5] 点伤害，伤害值因骷髅头数而增强。使敌人陷入死亡标记状态。 [3:1]',
    build: skill(
      dmg('enemyLast', 5, 1, { modifier: { mod: { kind: 'ratio', a: 3, b: 1 }, source: { kind: 'boardSkulls' } } }),
      inflict('death-mark', 'enemyLast'),
    ),
  },
  {
    id: 7392,
    desc: '使第一个和最后一个敌人陷入死亡标记状态。承受 3 点伤害。',
    build: skill(
      inflict('death-mark', 'enemyFront'),
      inflict('death-mark', 'enemyLast'),
      // 「承受 3 点伤害」= 对自身直接扣血（reduce hp 夹零，阵亡走 defeat）
      reduce('allySelf', 'hp', 3, 0),
    ),
  },
  {
    id: 7393,
    desc: '给予所有盟友 [魔法 + 5] 点护甲值。召唤一名随机机械军队，再创造 3 颗炸弹宝石。',
    build: skill(
      armor('allyAll', 5, 1),
      summonRandom(['SteamTurret', 'FlameCannon', 'DeepBorer', 'BlastCannon', 'Carnex', 'TANKBOT-2000', 'GoblinRocket', 'Bombot', 'DRACOS-1337', 'ClockworkKnight', 'SentryBot', 'Shocktopus', 'ClockworkSphinx', 'TED-1000', 'TINA-9000', 'ROVER-300', 'MechaGnome', 'P4-NTH4', 'MechaRat', 'Smash-o-bot', 'Detect-o-bot', 'Destruct-o-Bot', 'TinkSteamwhistle', 'S.O.L.A.R', 'NUTCRKR-1225', 'Mechataur', 'Ironhawk', 'TheSparkinator', 'Limpet-bot', 'Mechamare', 'Mechweaver', 'BORK-3000', 'TeslasEngine', 'Amphib-o-Bot', 'FIXIT-5000', 'ImmortalTitanius', 'MokTheCannon-Rider', 'WATTS-1927', 'LOCK-1887', 'RatchetCogbolt', 'WEEZL-300', 'DRIDR-8000', 'NAV-1057']),
      createSpecialGems({ kind: 'bomb' }, 3, 0),
    ),
  },
  {
    id: 7468,
    desc: '获得 [魔法 + 5] 点护甲值，数值因炸弹宝石数而增强。将所有绿色宝石转换成黄色宝石。 [x3]',
    build: skill(
      armor('allySelf', 5, 1, { modifier: { mod: { kind: 'multiplier', a: 3 }, source: { kind: 'boardSpecial', gem: 'bomb' } } }),
      transform(BaseColor.Green, BaseColor.Yellow),
    ),
  },
  {
    id: 7544,
    desc: '对 1 名敌人造成 [魔法 + 2] 点伤害并和使其陷入疾病状态。如果他已陷入死亡标记状态，则造成三倍伤害。',
    build: skill(
      dmg('enemyChosen', 2, 1, { condMult: { times: 3, cond: { kind: 'targetStatus', statusId: 'death-mark' } } }),
      inflict('disease', 'enemyChosen'),
    ),
  },
  {
    id: 8319,
    desc: '对一名敌人造成 [魔法 + 5] 点伤害，伤害值因陷入燃烧和疾病状态的敌人数而增强。 [x6]',
    build: skill(
      dmg('enemyChosen', 5, 1, {
        modifier: {
          mod: { kind: 'multiplier', a: 6 },
          sources: [{ kind: 'enemyStatusCount', statusId: 'burning' }, { kind: 'enemyStatusCount', statusId: 'disease' }],
        },
      }),
    ),
  },
  {
    id: 8430,
    desc: '对所有敌人造成 [(魔法 / 2) + 1] 点伤害，再使他们全部陷入诅咒和织网状态。',
    build: skill(
      dmgAll(1, 0.5),
      inflict('curse', 'enemyAll'),
      inflict('web', 'enemyAll'),
    ),
  },
  {
    id: 8649,
    desc: '对所有敌人造成 [魔法 + 6] 点伤害。再创建 3 颗 x4 通配宝石。',
    build: skill(
      dmgAll(6, 1),
      createSpecialGems({ kind: 'wildcard', tier: 4 }, 3, 0),
    ),
  },
  {
    id: 8825,
    desc: '对所有敌人造成 [魔法 + 2] 点伤害，伤害值因炸弹宝石数而增强。 [1:1]',
    build: skill(
      dmg('enemyAll', 2, 1, { range: 'all', modifier: { mod: { kind: 'ratio', a: 1, b: 1 }, source: { kind: 'boardSpecial', gem: 'bomb' } } }),
    ),
  },
  {
    id: 8926,
    desc: '对一名敌人造成 [魔法 + 2] 点真实伤害，再使他陷入诅咒状态。若敌人使用紫色法力，则造成双倍伤害。',
    build: skill(
      // 「若敌人使用紫色法力」= condMult targetColor（条件子句辖伤害段）
      dmg('enemyChosen', 2, 1, { trueDamage: true, condMult: { times: 2, cond: { kind: 'targetColor', color: BaseColor.Purple } } }),
      inflict('curse', 'enemyChosen'),
    ),
  },
  {
    id: 8935,
    desc: '给予前 2 位盟友 [魔法 + 1] 点生命值。使后 2 位敌人陷入疾病状态。',
    build: skill(
      heal('allyFirstN', 1, 1, { n: 2 }),
      inflict('disease', 'enemyLastN', { n: 2 }),
    ),
  },
  {
    id: 9114,
    desc: '对所有敌人造成 [魔法 + 5] 点伤害。再将所有蓝色宝石转换成沙漏宝石。',
    build: skill(
      dmgAll(5, 1),
      transformToSpecial(BaseColor.Blue, 'hourglass'),
    ),
  },
  {
    id: 9298,
    desc: '下潜自身，并使 2 名随机敌人陷入死亡标记状态。',
    build: skill(
      inflict('submerged', 'allySelf'),
      inflict('death-mark', 'enemyRandomN', { n: 2 }),
    ),
  },
];

export const BATCH_35: CuratedBatch = { batch: '35', spells: SPELLS, skipped: SKIPPED };
