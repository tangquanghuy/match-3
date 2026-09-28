/**
 * 人工核对组装 · 批次 33（窗口 E · 回收批，池：多池回收——每条注明原池与原放弃原因）
 *
 * 背景：2026-09-16 特殊状态批落地 疾病/诅咒/死亡标记/狂怒/魅惑 状态本体 +
 * allyStatusCount/enemyStatusCount/boardSpecial/teamSize 等来源 kind 已齐 +
 * sources[] 多来源计数先例充分。对放弃桶重新 triage，本批收回 20 条：
 *   - 狂怒族 11 条：inflict('rage') 可表达（7740/7794/7944/8393/7232/8980/8043/7520/8750/9280/7813）
 *   - 患病来源 1 条：enemyStatusCount 'disease' 可表达（9774）
 *   - 双来源复合 8 条：sources[] 计数相加（8366/8217/8626/8692/8713/8674/7479/8570）
 * 各条目旧放弃理由见原批次 SKIPPED 历史（git 记录）；原 SKIPPED 行已同步移除。
 *
 * 语义裁定备注：
 * - 「狂怒的盟友数」→ allyStatusCount { statusId: 'rage' }（2026-09-16 起rage 在状态白名单）。
 * - 「窃取…生命值」= dmg + drain（batch-01 7302 / batch-21 8181 口径）。
 * - 「数字因…而增强」泛指仍挂最近数值段（spell-rules §1 既有口径）；点名类别（伤害值）
 *   则挂点名段，即使修饰子句在描述中位于其它子句内（9774：点名「伤害值」→ 挂伤害段）。
 * - transform 端点 'SKULL'（7135 口径）；转化作为 modifier 来源时段先行（7059 口径，7232）。
 * - 种族英文名：元素 = Elemental、精灵 = Elf、巨人 = Giant（troops.json troopTypes 核对，
 *   batch-11/batch-16 同款）。
 */
import { skill, dmg, dmgSplash, trueDmg, heal, attack, inflict, createGems, createMix, transform } from '../builders';
import { BaseColor } from '../../types';
import type { CuratedBatch } from './index';

const SKIPPED: { id: number; reason: string }[] = [];

/** 8570「数值因元素、精灵和绿色盟友数而增强 [x2]」（原生 CountArmyType elemental/elf + CountArmyColor 1，各 200） */
const M8570 = {
  mod: { kind: 'multiplier' as const, a: 2 },
  sources: [
    { kind: 'alliesOfRace' as const, race: 'Elemental' },
    { kind: 'alliesOfRace' as const, race: 'Elf' },
    { kind: 'alliesOfColor' as const, color: BaseColor.Green },
  ],
};

const SPELLS: CuratedBatch['spells'] = [
  {
    id: 7232,
    desc: '获得 [魔法 + 1] 点攻击力，将绿色宝石转换为棕色宝石以强化此效果。赋予自身狂怒状态。 [4:1]',
    build: skill(
      // 转化段作为来源先行（7059 清除段先行同口径）；transformedGems 计数
      // sa-F2 fix round A (R001): native CountGems Green ; IncreaseAttack@Self ; ConvertGems ; CauseEnraged
      attack('allySelf', 1, 1, { modifier: { mod: { kind: 'ratio', a: 4, b: 1 }, source: { kind: 'boardGems', color: BaseColor.Green } } }),
      transform(BaseColor.Green, BaseColor.Brown),
      inflict('rage', 'allySelf'),
    ),
  },
  {
    id: 7479,
    desc: '对 1 名敌人造成 [魔法 + 5] 点真实伤害，伤害值因具有屏障效果的盟友和巨人盟友数而增强。 [x7]',
    build: skill(
      // sources[] 双来源：allyStatusCount barrier + alliesOfRace Giant（2026-09-16 回收）
      trueDmg('enemyChosen', 5, 1, {
        modifier: {
          mod: { kind: 'multiplier', a: 7 },
          sources: [{ kind: 'allyStatusCount', statusId: 'barrier' }, { kind: 'alliesOfRace', race: 'Giant' }],
        },
      }),
    ),
  },
  {
    id: 7520,
    desc: '获得 [魔法 + 1] 点生命值和攻击力，点数因红色宝石数而增强。赋予自身狂怒状态。 [3:1]',
    build: skill(
      // 一个方括号喂双段（batch-03 8372 口径）；泛指「点数」→ modifier 挂最近数值段 = attack
      // Native 7520: IncreaseHealth and IncreaseAttack both UseCounterForAmount (Red gems [3:1]); Life was unboosted.
      heal('allySelf', 1, 1, { modifier: { mod: { kind: 'ratio', a: 3, b: 1 }, source: { kind: 'boardGems', color: BaseColor.Red } } }),
      attack('allySelf', 1, 1, { modifier: { mod: { kind: 'ratio', a: 3, b: 1 }, source: { kind: 'boardGems', color: BaseColor.Red } } }),
      inflict('rage', 'allySelf'),
    ),
  },
  {
    id: 7740,
    desc: '对最后一名敌人造成 [魔法 + 6] 点真实伤害，并使其获得狂怒状态。',
    // Native order CauseEnraged LastEnemy -> TrueDamage LastEnemy (rulings/R001, L5-013).
    build: skill(
      inflict('rage', 'enemyLast'),
      trueDmg('enemyLast', 6, 1),
    ),
  },
  {
    id: 7794,
    desc: '将所有绿色宝石转换成棕色。赋予第一名盟友狂怒效果，并给予其 [魔法 + 1] 点生命值。',
    build: skill(
      transform(BaseColor.Green, BaseColor.Brown),
      // 「其」= 第一名盟友（静态目标，非跨段随机绑定）
      inflict('rage', 'allyFront'),
      heal('allyFront', 1, 1),
    ),
  },
  {
    id: 7813,
    desc: '将所有蓝色宝石转换成棕色，和所有黄色宝石转换成骷髅头。赋予所有盟友狂怒效果并使所有敌人陷入燃烧状态。',
    build: skill(
      transform(BaseColor.Blue, BaseColor.Brown),
      // transform 端点 'SKULL'（batch-05 7135 口径）
      transform(BaseColor.Yellow, 'SKULL'),
      inflict('rage', 'allyAll'),
      inflict('burning', 'enemyAll'),
    ),
  },
  {
    id: 7944,
    desc: '创造 8 颗蓝色宝石和 8 颗棕色宝石。使一名盟友下潜并给予其狂怒效果和 [魔法 + 1] 点生命值。',
    build: skill(
      createGems(BaseColor.Blue, 8, 0),
      createGems(BaseColor.Brown, 8, 0),
      // 「一名盟友」= allyChosen（措辞表己方同构）；三段同目标
      inflict('submerged', 'allyChosen'),
      inflict('rage', 'allyChosen'),
      heal('allyChosen', 1, 1),
    ),
  },
  {
    id: 8043,
    desc: '创造 9 颗红色宝石。有 50% 的几率赋予所有盟友狂怒效果。',
    build: skill(
      createGems(BaseColor.Red, 9, 0),
      inflict('rage', 'allyAll', { chance: 0.5 }),
    ),
  },
  {
    id: 8217,
    desc: '窃取第一名敌人 [魔法 + 2] 点生命值，数值因陷入冻结和燃烧状态的敌人数而增强。 [x2]',
    build: skill(
      // 「窃取生命」= dmg + drain（batch-01 7302 口径）；sources[] 双状态计数（2026-09-16 回收）
      dmg('enemyFront', 2, 1, {
        drain: true,
        modifier: {
          mod: { kind: 'multiplier', a: 2 },
          sources: [{ kind: 'enemyStatusCount', statusId: 'frozen' }, { kind: 'enemyStatusCount', statusId: 'burning' }],
        },
      }),
    ),
  },
  {
    id: 8366,
    desc: '对一名敌人造成 [魔法 + 3] 点伤害，伤害值因蓝色盟友数和蓝色宝石数而增强。 [x2]',
    build: skill(
      // sources[] 双来源：alliesOfColor + boardGems（2026-09-16 回收）
      dmg('enemyChosen', 3, 1, {
        modifier: {
          mod: { kind: 'multiplier', a: 2 },
          sources: [{ kind: 'alliesOfColor', color: BaseColor.Blue }, { kind: 'boardGems', color: BaseColor.Blue }],
        },
      }),
    ),
  },
  {
    id: 8393,
    desc: '赋予所有敌人和盟友狂怒效果。',
    // Native order CauseEnraged AllAllies -> AllEnemies (rulings/R001, L5-013).
    build: skill(
      inflict('rage', 'allyAll'),
      inflict('rage', 'enemyAll'),
    ),
  },
  {
    id: 8570,
    desc: '给予第一位盟友 [魔法 + 1] 点攻击力和生命值，数值因元素、精灵和绿色盟友数而增强。 [x2]',
    build: skill(
      // 一个方括号喂双段（8372 口径）；sources[] 三重来源：Elemental + Elf + alliesOfColor Green（2026-09-16 回收）
      // L7-7045（sa-L76）：原生 IncreaseAttack 与 IncreaseHealth 两步都 UseCounterForAmount →
      // 攻击段与生命段同挂 modifier（原先只挂 heal）。
      attack('allyFront', 1, 1, { modifier: M8570 }),
      heal('allyFront', 1, 1, { modifier: M8570 }),
    ),
  },
  {
    id: 8626,
    desc: '给予所有盟友 [魔法 + 1] 点生命值，数值因蓝色宝石和盟友数而增强。 [1:1]',
    build: skill(
      // sources[] 双来源：boardGems Blue + teamSize ally（「盟友数」含自身，SOP 来源表）
      heal('allyAll', 1, 1, {
        modifier: {
          mod: { kind: 'ratio', a: 1, b: 1 },
          sources: [{ kind: 'boardGems', color: BaseColor.Blue }, { kind: 'teamSize', side: 'ally' }],
        },
      }),
    ),
  },
  {
    id: 8674,
    desc: '对一名敌人造成 [魔法 + 3] 点伤害，伤害值因缠绕宝石和棕色宝石数而增强。 [2:1]',
    build: skill(
      // 缠绕宝石 = web（窗口 C 十种特殊宝石内）→ boardSpecial；sources[] 双来源（2026-09-16 回收）
      dmg('enemyChosen', 3, 1, {
        modifier: {
          mod: { kind: 'ratio', a: 2, b: 1 },
          sources: [{ kind: 'boardSpecial', gem: 'web' }, { kind: 'boardGems', color: BaseColor.Brown }],
        },
      }),
    ),
  },
  {
    id: 8692,
    desc: '对所有敌人造成 [魔法 + 1] 点伤害，伤害值因蓝色和冻结敌人数而增强。 [x3]',
    build: skill(
      // sources[] 双来源：boardGems Blue + enemyStatusCount frozen（2026-09-16 回收）
      dmg('enemyAll', 1, 1, {
        range: 'all',
        modifier: {
          mod: { kind: 'multiplier', a: 3 },
          // Native 8692: CountArmyColor@AllEnemies Blue = Blue enemies (was Blue gems on the board).
          sources: [{ kind: 'enemiesOfColor', color: BaseColor.Blue }, { kind: 'enemyStatusCount', statusId: 'frozen' }],
        },
      }),
    ),
  },
  {
    id: 8713,
    desc: '对所有敌人造成 [魔法 + 1] 点伤害，伤害值因红色和棕色宝石数而增强。 [2:1]',
    build: skill(
      // sources[] 双色宝石计数相加（boardGems 单 kind 单色，两色用两个 kind；2026-09-16 回收）
      dmg('enemyAll', 1, 1, {
        range: 'all',
        modifier: {
          mod: { kind: 'ratio', a: 2, b: 1 },
          sources: [{ kind: 'boardGems', color: BaseColor.Red }, { kind: 'boardGems', color: BaseColor.Brown }],
        },
      }),
    ),
  },
  {
    id: 8750,
    desc: '对一名敌人造成 [魔法 + 3] 点伤害，若对方是一名元素，则造成 3 倍伤害。若对方身亡，则使自身获得狂怒效果。',
    build: skill(
      dmg('enemyChosen', 3, 1, { condMult: { times: 3, cond: { kind: 'targetRace', race: 'Elemental' } } }),
      // 「若对方身亡」→ ifTargetDied（判定=最近产目标段的主目标，spell-rules §4）
      inflict('rage', 'allySelf', { ifTargetDied: true }),
    ),
  },
  {
    id: 8980,
    desc: '对一名敌人造成 [魔法 + 4] 点伤害。若自身已受伤害，则赋予自身狂怒和屏障效果。',
    build: skill(
      dmg('enemyChosen', 4, 1),
      // 「若自身已受伤害」= ifCond selfHpDamaged（全局条件整段判定，SOP 通用条件触发）
      inflict('rage', 'allySelf', { ifCond: { kind: 'selfHpDamaged' } }),
      inflict('barrier', 'allySelf', { ifCond: { kind: 'selfHpDamaged' } }),
    ),
  },
  {
    id: 9280,
    desc: '对 3 名随机敌人造成 [魔法 + 3] 点溅射伤害，伤害值因狂怒盟友数而增强。获得狂怒效果。 [x2]',
    build: skill(
      // dmgSplash + enemyRandomN 先例（batch-01 7387 口径）；「狂怒的盟友数」= allyStatusCount rage
      // Native 9280: SplashHighDamage@RandomEnemy + 2 x @RandomPrefNotPrevEnemy (R007-3; was 3 distinct centres).
      ...(['enemyRandom', 'enemyRandomPrefNotPrev', 'enemyRandomPrefNotPrev'] as const).map(t => dmgSplash(t, 3, 1, {
        modifier: { mod: { kind: 'multiplier', a: 2 }, source: { kind: 'allyStatusCount', statusId: 'rage' } },
      })),
      inflict('rage', 'allySelf'),
    ),
  },
  {
    id: 9774,
    desc: '对所有敌人造成[(魔法 x 1.5) + 3]点伤害。创造16颗绿色和红色宝石，伤害值会因敌人患病和中毒数量而增强。 [1:1]',
    build: skill(
      // 修饰子句点名「伤害值」→ 挂伤害段（spell-rules §1 修饰段归属，点名跨子句有效）；
      // 患病 = disease（2026-09-16 特殊状态批落地）；sources[] 双状态计数
      dmg('enemyAll', 3, 1.5, {
        range: 'all',
        modifier: {
          mod: { kind: 'ratio', a: 1, b: 1 },
          sources: [{ kind: 'enemyStatusCount', statusId: 'disease' }, { kind: 'enemyStatusCount', statusId: 'poison' }],
        },
      }),
      // 「16 颗绿色和红色宝石」= 绿红混色 16 颗（batch-21 8219 createMix 口径）
      createMix([BaseColor.Green, BaseColor.Red], 16, 0),
    ),
  },
];

export const BATCH_33: CuratedBatch = { batch: '33', spells: SPELLS, skipped: SKIPPED };
