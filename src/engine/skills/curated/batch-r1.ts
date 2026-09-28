/**
 * 放弃桶回收批 R1（用户裁定 2026-09-17「能做的都要做」；scatter+range 族 23 条）。
 * 核对者：窗口 G。原批次 skipped 的对应条目已同步剪除。
 *
 * 裸散射重裁（2026-09-18，官方 SpellSteps 实锤 ScatterDamage@AllEnemies 16/16，推翻 09-17 旧裁定；
 * 已同步 spell-rules §0 / spell-assembler §3）：
 *   - 裸散射句式（无目标词的「造成…点(真实)散射伤害」）= 全体散射 enemyAll + range:'all'；
 *   - 裸伤害·非散射（「造成…点伤害」无目标词）仍 = enemyChosen（09-17 裁定维持）。
 *   - 燃烧宝石（burningGem，波A）、几率子句（chance）、伤害区间（rangeSpec）原语均已落地，
 *     相关放弃理由作废。
 */
import { skill, dmg, reduce, steal, attack, armor, magic, inflict, createGems,
  createSpecialGems, transformToSpecial, destroyChosenCol, destroyColor, oneOf,
  extraTurn, randomStat, scale, CHOSEN } from '../builders';
import { BaseColor } from '../../types';
import type { CuratedBatch } from './index';

const SKIPPED: { id: number; reason: string }[] = [];

const SPELLS: CuratedBatch['spells'] = [
  {
    id: 7007,
    desc: '造成 [魔法 + 3] 点散射伤害，再创造 2 颗炸弹宝石。',
    build: skill(dmg('enemyAll', 3, 1, { range: 'all' }), createSpecialGems({ kind: 'bomb' }, 2)),
  },
  {
    id: 7035,
    desc: '造成 [魔法 + 4] 点散射伤害，伤害值因所有敌人的护甲值而增强。窃取一名随机敌人 4 点魔力值。 [2:1]',
    build: skill(
      dmg('enemyAll', 4, 1, { range: 'all', modifier: { mod: { kind: 'ratio', a: 2, b: 1 }, source: { kind: 'enemyStatSum', stat: 'armor' } } }),
      // L3-018: native StealMagic RandomEnemy 4 (Magic, not Mana)
      steal('enemyRandom', 'magic', 'magic', 4, 0),
    ),
  },
  {
    id: 7265,
    desc: '造成 [魔法 + 6] 点真实的散射伤害。耗掉所有敌人 7 点法力值。',
    build: skill(
      dmg('enemyAll', 6, 1, { range: 'all', trueDamage: true }),
      // L3-008: native DecreaseMana Amount 7, no SpellPowerMultiplier → fixed 7
      reduce('enemyAll', 'mana', 7, 0),
    ),
  },
  {
    id: 7470,
    desc: '造成 8 点真实散射伤害，伤害值因敌我双方的护甲值而增强。 [3:1]',
    build: skill(dmg('enemyAll', 8, 0, {
      trueDamage: true,
      range: 'all',
      modifier: { mod: { kind: 'ratio', a: 3, b: 1 }, sources: [{ kind: 'allyStatSum', stat: 'armor' }, { kind: 'enemyStatSum', stat: 'armor' }] },
    })),
  },
  {
    id: 7792,
    desc: '造成  [魔法 + 10] 点散射伤害，伤害值因狂怒的盟友数而增强。赋予所有盟友狂怒效果，并给予他们 6 点攻击力。 [x8]',
    build: skill(
      dmg('enemyAll', 10, 1, { range: 'all', modifier: { mod: { kind: 'multiplier', a: 8 }, source: { kind: 'allyStatusCount', statusId: 'rage' } } }),
      inflict('rage', 'allyAll'),
      attack('allyAll', 6),
    ),
  },
  {
    id: 8459,
    desc: '摧毁一列。造成 [魔法 + 7] 点散射伤害。再获得一个额外回合或获得 12 点魔力值。',
    build: skill(
      destroyChosenCol(),
      dmg('enemyAll', 7, 1, { range: 'all' }),
      // 原生 C-D-E-F = ExtraTurn | IncreaseSpellPower 12 | ExtraTurn | IncreaseSpellPower 12（各 1/2）；
      // 英文 gain 12 Magic = 魔法属性，非法力（sa-H：原为 mana）
      oneOf([extraTurn()], [magic('allySelf', 12, 0)]),
    ),
  },
  {
    id: 8586,
    desc: '移除所有一个选定颜色的宝石。造成 [魔法 + 10] 点真实散射伤害，伤害值因移除的宝石数而增强。 [x10]',
    build: skill(
      // sa-F2 fix round A (R001): native CountGems FromTarget ; TrueScatterDamage ; RemoveColor FromTarget
      dmg('enemyAll', 10, 1, { range: 'all', trueDamage: true, modifier: { mod: { kind: 'multiplier', a: 10 }, source: { kind: 'boardGems', color: 'CHOSEN' } } }),
      destroyColor(CHOSEN),
    ),
  },
  {
    id: 8656,
    desc: '对 2 名随机敌人造成 [(魔法 / 2) + 3] 点轻微散射伤害，伤害值因蓝色盟友和蓝色敌人数而增强。 [x3]',
    // 敌我颠倒修正（2026-09-18 官方复核）：官方 SplashDamage@RandomEnemy ×2 打敌人，非盟友（中文机翻误译）
    build: skill(dmg('enemyRandomN', 3, 0.5, {
      range: 'splash',
      n: 2,
      modifier: { mod: { kind: 'multiplier', a: 3 }, sources: [{ kind: 'alliesOfColor', color: BaseColor.Blue }, { kind: 'enemiesOfColor', color: BaseColor.Blue }] },
    })),
  },
  {
    id: 8678,
    desc: '造成 [魔法 + 8] 点散射伤害，伤害值因紫色宝石和紫色盟友数而增强。 [x4]',
    build: skill(dmg('enemyAll', 8, 1, { range: 'all', modifier: { mod: { kind: 'multiplier', a: 4 }, sources: [{ kind: 'boardGems', color: BaseColor.Purple }, { kind: 'alliesOfColor', color: BaseColor.Purple }] } })),
  },
  {
    id: 8827,
    desc: '造成 [(魔法 x 2) + 22] 点散射伤害。再将 8 颗选定颜色的宝石转换成极度末日骷髅头。',
    build: skill(
      dmg('enemyAll', 22, 2, { range: 'all' }),
      transformToSpecial(CHOSEN, 'uberDoomSkull', { count: 8 }),
    ),
  },
  {
    id: 8934,
    desc: '造成 [魔法 + 5] 点真实散射伤害。若存在风暴，则造成双倍伤害。',
    build: skill(dmg('enemyAll', 5, 1, { range: 'all', trueDamage: true, condMult: { times: 2, cond: { kind: 'stormPresent' } } })),
  },
  {
    id: 9175,
    desc: '造成 [魔法 + 20] 点散射伤害，伤害值因陷入织网状态的敌人数而增强。创造 10 颗紫色宝石。 [x10]',
    build: skill(
      dmg('enemyAll', 20, 1, { range: 'all', modifier: { mod: { kind: 'multiplier', a: 10 }, source: { kind: 'enemyStatusCount', statusId: 'web' } } }),
      createGems(BaseColor.Purple, 10),
    ),
  },
  {
    id: 9493,
    desc: '造成 [魔法 + 8] 点散射伤害，由绿宝石增强两次。 [x2]',
    build: skill(
      dmg('enemyAll', 8, 1, { range: 'scatter', modifier: { mod: { kind: 'multiplier', a: 2 }, source: { kind: 'boardGems', color: BaseColor.Green } } }),
      dmg('enemyAll', 8, 1, { range: 'scatter', modifier: { mod: { kind: 'multiplier', a: 2 }, source: { kind: 'boardGems', color: BaseColor.Green } } }),
    ),
  },
  {
    id: 9673,
    desc: '造成[魔法 + 4]点散射伤害，伤害值因红宝石和骷髅宝石数量而增强。然后燃烧一名随机敌人。 [1:1]',
    build: skill(
      dmg('enemyAll', 4, 1, { range: 'all', modifier: { mod: { kind: 'ratio', a: 1, b: 1 }, sources: [{ kind: 'boardGems', color: BaseColor.Red }, { kind: 'boardSkulls' }] } }),
      inflict('burning', 'enemyRandom'),
    ),
  },
  {
    id: 9710,
    desc: '造成[魔法 + 6]点散射伤害。然后燃烧1-2名随机敌人。',
    build: skill(
      dmg('enemyAll', 6, 1, { range: 'all' }),
      inflict('burning', 'enemyRandomN', { nRange: { min: 1, max: 2 } }),
    ),
  },
  {
    id: 7213,
    desc: "对随机敌人造成 [(魔法 / 2) + 5] – [魔法 + 10] 点伤害。自身一项随机属性获得 12 点。然后有 50% 的几率获得额外回合。",
    build: skill(
      dmg('enemyRandom', 0, 0, { rangeSpec: { min: scale(5, 0.5), max: scale(10, 1) } }),
      randomStat('allySelf', 12, 0, { oneSkill: true }),
      extraTurn({ chance: 0.5 }),
    ),
  },
  {
    id: 8203,
    desc: '对一名敌人造成 [(魔法 / 2) + 1] – [魔法 + 3] 点伤害，伤害值因自身的攻击力、生命值和护甲值而增强。若敌人身亡，则获得狂怒效果。 [3:1]',
    build: skill(
      dmg('enemyChosen', 0, 0, {
        rangeSpec: { min: scale(1, 0.5), max: scale(3, 1) },
        modifier: { mod: { kind: 'ratio', a: 3, b: 1 }, pooled: true /* CountAttackArmorLife = one native Count step (R007-1) */, sources: [{ kind: 'selfStat', stat: 'attack' }, { kind: 'selfStat', stat: 'hp' }, { kind: 'selfStat', stat: 'armor' }] },
      }),
      inflict('rage', 'allySelf', { ifTargetDied: true }),
    ),
  },
  {
    id: 8410,
    desc: '对 6 名随机敌人造成 [(魔法 x 0.625) + 1] – [(魔法 x 1.25) + 2] 伤害。',
    build: skill(dmg('enemyRandomN', 0, 0, { n: 6, randomWaves: 6, rangeSpec: { min: scale(1, 0.625), max: scale(2, 1.25) } })),
  },
  {
    id: 8563,
    desc: '对 4 名随机敌人造成 [(魔法 / 2) + 1] – [魔法 + 3] 点伤害，由红色和紫色宝石增强。 [1:1]',
    // 原生 RandomEnemy + 3 x RandomPrefNotPrevEnemy：4 次独立掷骰、只避开上一目标（randomWaves）
    build: skill(dmg('enemyRandomN', 0, 0, {
      n: 4,
      randomWaves: 4,
      rangeSpec: { min: scale(1, 0.5), max: scale(3, 1) },
      modifier: { mod: { kind: 'ratio', a: 1, b: 1 }, sources: [{ kind: 'boardGems', color: BaseColor.Red }, { kind: 'boardGems', color: BaseColor.Purple }] },
    })),
  },
  {
    id: 8624,
    desc: '对一名随机敌人造成 [(魔法 / 2) + 1] – [魔法 + 2] 伤害，伤害值因绿色宝石和盟友数而增强。 [1:1]',
    build: skill(dmg('enemyRandom', 0, 0, {
      rangeSpec: { min: scale(1, 0.5), max: scale(2, 1) },
      modifier: { mod: { kind: 'ratio', a: 1, b: 1 }, sources: [{ kind: 'boardGems', color: BaseColor.Green }, { kind: 'alliesOfColor', color: BaseColor.Green }] },
    })),
  },
  {
    id: 8625,
    desc: '燃烧 2-4 名随机敌人。获得 [魔法 + 1] 点护甲值，数值因红色宝石和盟友数而增强。 [x2]',
    // sa-F1 (R001): native CountGems Red 200 + CountArmyColor@AllAllies 200 Data 2 (= Red allies, not all allies)
    // → IncreaseArmor → burn 2 random enemies → 50% one more → 25% one more (RandomPrefNotPrevEnemy), not uniform 2-4.
    build: skill(
      armor('allySelf', 1, 1, { modifier: { mod: { kind: 'multiplier', a: 2 }, sources: [{ kind: 'boardGems', color: BaseColor.Red }, { kind: 'alliesOfColor', color: BaseColor.Red }] } }),
      inflict('burning', 'enemyRandomN', { n: 2 }),
      inflict('burning', 'enemyRandomPrefNotPrev', { chance: 0.5 }),
      inflict('burning', 'enemyRandomPrefNotPrev', { chance: 0.25 }),
    ),
  },
  {
    id: 8735,
    desc: '对第一名敌人造成 [(魔法 / 2) + 1] – [魔法 + 2] 点伤害。',
    build: skill(dmg('enemyFront', 0, 0, { rangeSpec: { min: scale(1, 0.5), max: scale(2, 1) } })),
  },
  {
    id: 9064,
    desc: '对所有敌人造成 [魔法 + 2] 点伤害，伤害值因蓝色和紫色宝石而加强。创造 9-13 颗紫色宝石。 [1:1]',
    build: skill(
      dmg('enemyAll', 2, 1, { range: 'all', modifier: { mod: { kind: 'ratio', a: 1, b: 1 }, sources: [{ kind: 'boardGems', color: BaseColor.Blue }, { kind: 'boardGems', color: BaseColor.Purple }] } }),
      createGems(BaseColor.Purple, 9, 0, { countRange: { min: 9, max: 13 } }),
    ),
  },
];

export const BATCH_R1: CuratedBatch = { batch: 'R1', spells: SPELLS, skipped: SKIPPED };
