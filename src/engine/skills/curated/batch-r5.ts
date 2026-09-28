/**
 * 放弃桶回收批 R5（2026-09-17 用户裁定：位置要做、分摊要做、其他要做）。
 * 核对者：窗口 G，23 条。六原语见 spell-rules §12：
 * reposition/shuffleTeam（位置）、dmg split（分摊 {N}）、'lastTarget' 目标模式（跨段绑定）、
 * summon countRange（召唤数量区间）、skillOnce/oncePerBattle、'not' 条件 + selfStat manaCost。
 */
import { skill, dmg, trueDmg, heal, armor, attack, mana, inflict, reduce,
  createGems, createSpecialGems, transformToSpecial, explodeRandomGems, destroyChosenCol,
  destroySkulls, shuffleBoard, summonRef, extraTurn, reposition, shuffleTeam,
  skillOnce, scale } from '../builders';
import { BaseColor } from '../../types';
import type { CuratedBatch } from './index';

const SKIPPED: { id: number; reason: string }[] = [];

const SPELLS: CuratedBatch['spells'] = [
  {
    id: 7043,
    desc: '对 1 名随机的敌人造成 [魔法 + 5] 点伤害，并使其陷入沉默状态。',
    build: skill(dmg('enemyRandom', 5), inflict('silence', 'lastTarget')),
  },
  {
    id: 7363,
    desc: '对一名随机敌人造成 [魔法 + 3] 点伤害，再使他陷入燃烧状态。创造 3 颗燃烧宝石。',
    build: skill(
      dmg('enemyRandom', 3),
      inflict('burning', 'lastTarget'),
      createSpecialGems({ kind: 'burningGem' }, 3),
    ),
  },
  {
    id: 7371,
    desc: '击晕一名随机敌人，并使其陷入中毒和疾病状态。',
    // Native order CauseDisease RandomEnemy -> CausePoison FromPrevious -> CauseStun FromPrevious (rulings/R001, L5-013):
    // Stun disables immunity traits, so applying it first let Disease/Poison bypass immunity.
    build: skill(
      inflict('disease', 'enemyRandom'),
      inflict('poison', 'lastTarget'),
      inflict('stun', 'lastTarget'),
    ),
  },
  {
    id: 7431,
    desc: '冻结一名敌人并使其陷入织网状态。如果板面上有 13 颗或更多蓝色宝石，则自身恢复一半的法力值。',
    // L3-002: native spell Target Enemy + CauseFrozen/CauseWeb FromTarget = chosen enemy;
    // GenerateMana Self StatusAmount 4 AddFor10BlueGems = fixed 4 Mana when 13+ Blue (R003).
    build: skill(
      inflict('frozen', 'enemyChosen'),
      inflict('web', 'lastTarget'),
      mana('allySelf', 4, 0, { ifCond: { kind: 'boardAtLeast', color: BaseColor.Blue, n: 13 } }),
    ),
  },
  {
    id: 9051,
    desc: '对一名随机敌人造成 [魔法 + 2] 点真实伤害。使他陷入中毒状态，再耗掉他 5 点法力值。',
    build: skill(
      trueDmg('enemyRandom', 2),
      inflict('poison', 'lastTarget'),
      // L3-008: native DecreaseMana FromPrevious Amount 5, no SpellPowerMultiplier → fixed 5
      reduce('lastTarget', 'mana', 5, 0),
    ),
  },
  {
    id: 7061,
    desc: '对 1 名敌人造成 [(魔法 / 2) + 4] – [魔法 + 8] 到 {2} 点伤害，伤害值因自身减损的生命值而增强。自身承受 2 点伤害并获得 4 点攻击力。 [2:1]',
    build: skill(
      // sa-F3：EN/原生 RandomHighDamage@FromTarget = 选定敌人单体（zh「到 {2}」为快照残渣，不是分摊 2 名）；
      // IncreaseAttack@Self 4 为定值
      dmg('enemyChosen', 0, 0, {
        rangeSpec: { min: scale(4, 0.5), max: scale(8, 1) },
        modifier: { mod: { kind: 'ratio', a: 2, b: 1 }, source: { kind: 'selfStat', stat: 'missingHp' } },
      }),
      dmg('allySelf', 2, 0),
      attack('allySelf', 4, 0),
    ),
  },
  {
    id: 7640,
    desc: '对 1 名敌人造成  [(魔法 / 2) + 4] – [魔法 + 8] 到 {2} 点伤害。如果敌人身亡，则获得多一回合。 ',
    build: skill(
      dmg('enemyFront', 0, 0, { rangeSpec: { min: scale(4, 0.5), max: scale(8, 1) }, split: 2 }),
      extraTurn({ ifTargetDied: true }),
    ),
  },
  {
    id: 8960,
    desc: '对一名敌人造成 [(魔法 / 2) + 1] – [魔法 + 3] -{2} 点伤害。',
    build: skill(dmg('enemyFront', 0, 0, { rangeSpec: { min: scale(1, 0.5), max: scale(3, 1) }, split: 2 })),
  },
  {
    id: 7774,
    desc: '对一名敌人造成 [魔法 + 1] 点真实伤害并将之击至末位。使自身下潜。',
    build: skill(
      trueDmg('enemyChosen', 1),
      reposition('enemyChosen', 'back'),
      inflict('submerged', 'allySelf'),
    ),
  },
  {
    id: 8020,
    desc: '对最后一位敌人造成 [魔法 + 4] 点伤害并将其击晕，再将其拉至首位。',
    build: skill(
      dmg('enemyLast', 4),
      inflict('stun', 'enemyLast'),
      reposition('enemyLast', 'front'),
    ),
  },
  {
    id: 8483,
    desc: '获得 [魔法 + 1] 点护甲值和屏障效果。再将一名随机敌人击回末位。',
    build: skill(
      armor('allySelf', 1, 1),
      inflict('barrier', 'allySelf'),
      reposition('enemyRandom', 'back'),
    ),
  },
  {
    id: 8695,
    desc: '对一名敌人造成 [(魔法 x 1.5) + 4] 点伤害。缠绕他并将其拉到前方。',
    build: skill(
      dmg('enemyChosen', 4, 1.5),
      inflict('entangle', 'enemyChosen'),
      reposition('enemyChosen', 'front'),
    ),
  },
  {
    id: 9131,
    desc: '将一名敌人打回末位并将其击晕。再将自身移至首位，并获得 [(魔法 x 2) + 1] 点攻击力、生命值和护甲值。',
    build: skill(
      // Native Target Enemy (L5-016): CauseStun FromTarget -> TroopOrderBack FromTarget ->
      // Attack/Life/Armor on Self -> TroopOrderFront Self (R001 native order).
      inflict('stun', 'enemyChosen'),
      reposition('lastTarget', 'back'),
      attack('allySelf', 1, 2),
      heal('allySelf', 1, 2),
      armor('allySelf', 1, 2),
      reposition('allySelf', 'front'),
    ),
  },
  {
    id: 9187,
    desc: '摧毁一列。对末位敌人造成 [魔法 + 3] 点伤害并将其击晕。再将自身和敌人移到首位。',
    build: skill(
      destroyChosenCol(),
      dmg('enemyLast', 3),
      inflict('stun', 'enemyLast'),
      reposition('allySelf', 'front'),
      reposition('enemyLast', 'front'),
    ),
  },
  {
    id: 8027,
    desc: '造成 [魔法 + 12] 点散射伤害，再打乱敌方队伍顺序。',
    // 裸散射重裁（2026-09-18）：官方 ScatterDamage@AllEnemies = 全体散射
    build: skill(dmg('enemyAll', 12, 1, { range: 'all' }), shuffleTeam('enemy')),
  },
  {
    id: 9343,
    desc: '创造 8-11 颗黄色宝石。打乱敌方队伍。',
    build: skill(
      createGems(BaseColor.Yellow, 8, 0, { countRange: { min: 8, max: 11 } }),
      shuffleTeam('enemy'),
    ),
  },
  {
    id: 8666,
    desc: '打乱板面和敌方队伍。板面上每有一颗棕色宝石，则有 7% 的几率获得一个额外回合。 [x7]',
    build: skill(
      shuffleBoard(),
      shuffleTeam('enemy'),
      extraTurn({ chance: 0.07, chanceBoost: { mod: { kind: 'multiplier', a: 7 }, source: { kind: 'boardGems', color: BaseColor.Brown } } }),
    ),
  },
  {
    id: 8546,
    desc: '召唤 1-3 名龙魂。如果自身队伍已有一名龙魂，则爆破 10 颗宝石。',
    // sa-R5 L1-7014-order: native CountArmyTroop 7013 -> CountMax 10 -> ExplodeGems (counted BEFORE the summons, so
    // only a pre-existing Dragon Spirit triggers it) -> SummoningNoError 7013, 7013@50%, 7013@50% (1/2/3 = 25/50/25%).
    build: skill(
      explodeRandomGems(10, 0, 'all', undefined, { ifCond: { kind: 'troopPresent', side: 'ally', name: '龙魂' } }),
      summonRef('DragonSpirit'),
      summonRef('DragonSpirit', undefined, { chance: 0.5 }),
      summonRef('DragonSpirit', undefined, { chance: 0.5 }),
    ),
  },
  {
    id: 8559,
    desc: '创造 5 颗黄色宝石。再将黄色宝石转换成末日骷髅头。召唤 1-3 个瓦格。',
    build: skill(
      createGems(BaseColor.Yellow, 5),
      transformToSpecial(BaseColor.Yellow, 'doomSkull'),
      summonRef('Warg', undefined, { countRange: { min: 1, max: 3 } }),
    ),
  },
  {
    id: 8654,
    desc: '耗掉所有敌人 7 点法力值，并使他们陷入妖火和燃烧状态。再召唤 1-3 只梦魇马。',
    build: skill(
      // L3-008: native DecreaseMana Amount 7, no SpellPowerMultiplier → fixed 7
      reduce('enemyAll', 'mana', 7, 0),
      inflict('faerie-fire', 'enemyAll'),
      inflict('burning', 'enemyAll'),
      summonRef('Nightmare', undefined, { countRange: { min: 1, max: 3 } }),
    ),
  },
  {
    id: 8598,
    desc: '使所有敌人中毒并吸取 7 点法力值。然后移除所有头骨。此咒语只能使用一次。',
    build: skillOnce(
      inflict('poison', 'enemyAll'),
      // L3-007/L3-008: native DecreaseMana AllEnemies Amount 7 = drain a fixed 7 (no refill, no Magic)
      reduce('enemyAll', 'mana', 7, 0),
      destroySkulls(),
    ),
  },
  {
    id: 7457,
    desc: '对一名随机敌人造成 [魔法 + 3] 点真实伤害。板面上没有一颗紫色宝石，则有 6% 的几率重新获得消耗的法力值。 [x6]',
    build: skill(
      trueDmg('enemyRandom', 3),
      mana('allySelf', 0, 0, {
        chance: 0.06,
        ifCond: { kind: 'not', cond: { kind: 'boardAtLeast', color: BaseColor.Purple, n: 1 } },
        modifier: { mod: { kind: 'multiplier', a: 1 }, source: { kind: 'selfStat', stat: 'manaCost' } },
      }),
    ),
  },
  {
    id: 8824,
    desc: '给予一名盟友 4 点护甲值。板面上没有一颗蓝色宝石则有 7% 的几率获得一个额外回合。 [x7]',
    // 修正（2026-09-18 官方复核）：官方 IncreaseArmor@FromTarget = 指定的一名盟友，非自身
    build: skill(
      armor('allyChosen', 4, 0),
      extraTurn({
        chance: 0.07,
        ifCond: { kind: 'not', cond: { kind: 'boardAtLeast', color: BaseColor.Blue, n: 1 } },
        chanceBoost: { mod: { kind: 'multiplier', a: 7 }, source: { kind: 'boardGems', color: BaseColor.Blue } },
      }),
    ),
  },
];

export const BATCH_R5: CuratedBatch = { batch: 'R5', spells: SPELLS, skipped: SKIPPED };
