/**
 * 放弃桶回收批 R4（2026-09-17 用户裁定「接着做」）：几率/状态/经典宝石三大族二次过筛。
 * 核对者：窗口 G，59 条。新增裁定见 spell-rules §11 追加（selfStatus 条件、
 * 并列段共用 scaling、裸单颗宝石操作=随机、自毁=sacrifice allySelf）。
 */
import type { CuratedBatch } from './index';
import { skill, dmg, dmgSplash, dmgAll, trueDmg, heal, armor, attack, magic, mana, inflict,
  inflictRandom, reduce, steal, drainMana, createGems, createSkulls, createSpecialGems,
  createMix, transform, transformToSpecial, explodeRandomGems, explodeColor, explodeChosenRow,
  destroySpecialGems, destroyRandomGems, oneOf, summonRef, summonRandom, extraTurn, sacrifice, transformTroop,
  transformTroopRandom, CHOSEN, targetedSkill } from '../builders';
import { BaseColor } from '../../types';
// 蜘蛛族引用池（生成器从 troops.json 内联）

const SKIPPED: { id: number; reason: string }[] = [];

const SPELLS: CuratedBatch['spells'] = [
  {
    id: 7014,
    desc: '摧毁所有织网宝石。对最弱的敌人造成 [魔法 + 1] 点伤害，伤害值因被摧毁的织网宝石数而增强。 [x2]',
    build: skill(
      // native: CountGems Web x2 (step 0), Damage@WeakestEnemy, then DestroyColor Web (R001) (sa-R1)
      dmg('enemyWeakest', 1, 1, { modifier: { mod: { kind: 'multiplier', a: 2 }, source: { kind: 'boardSpecial', gem: 'web' } } }),
      destroySpecialGems('web'),
    ),
  },
  {
    id: 7376,
    desc: '对 1 名敌人造成 [魔法 + 1] 点伤害。对所有使用黄色法力值的敌人造成 [魔法 + 1] 点额外伤害，并将其燃烧。',
    build: skill(
      dmg('enemyChosen', 1),
      dmg('enemyAll', 1, 1, { range: 'all', ifCond: { kind: 'targetColor', color: BaseColor.Yellow } }),
      inflict('burning', 'enemyAll', { ifCond: { kind: 'targetColor', color: BaseColor.Yellow } }),
    ),
  },
  {
    id: 7524,
    desc: '爆破一行。对所有敌人造成 [魔法 + 4] 点伤害。如果自身身处狂怒状态，则造成额外 9 点伤害。 [x9]',
    build: skill(
      explodeChosenRow(),
      dmg('enemyAll', 4, 1, { range: 'all', condBonus: { n: 9, cond: { kind: 'selfStatus', statusId: 'rage' } } }),
    ),
  },
  {
    id: 7533,
    desc: '使一名随机敌人陷入织网状态。召唤一只随机蜘蛛。',
    // L1-6378-pool: native Randomize A+(B-C-D-E-F) over Summoning 6136/6110/6395/6512/6068.
    build: skill(inflict('web', 'enemyRandom'), summonRandom(['SpiderSwarm', 'GiantSpider', 'Spinnerette', 'TombSpider', 'Webspinner'])),
  },
  {
    id: 7593,
    desc: '使一名敌人陷入妖火状态。获得一个额外回合。',
    build: skill(inflict('faerie-fire', 'enemyChosen'), extraTurn()),
  },
  {
    id: 7668,
    desc: '耗尽一名敌人的法力值，并将其击晕和使其陷入沉默状态。对其和其下方的所有敌人造成 [魔法 + 6] 点伤害。',
    build: skill(
      // L3-010: native CauseStun -> CauseSilence -> DecreaseMana 100 (R001; Stun disables Mana Shield)
      inflict('stun', 'enemyChosen'),
      inflict('silence', 'enemyChosen'),
      drainMana('enemyChosen'),
      dmg('enemyChosenAndBelow', 6, 1, { range: 'all' }),
    ),
  },
  {
    id: 7712,
    desc: '对一名敌人和其下方的敌人造成  [魔法 + 5] 点伤害，伤害值因已方海族和下潜的盟友数而增强。下潜所有蓝色盟友，并使所有敌方蓝色军队陷入沉默状态。 [x8]',
    build: skill(
      // Native 7712: Damage@FromTarget + Damage@NextDownFromTarget = chosen and the one enemy below (was all below).
      dmg('enemyChosenAndNextDown', 5, 1, {
        range: 'all',
        modifier: { mod: { kind: 'multiplier', a: 8 }, sources: [{ kind: 'alliesOfRace', race: 'Merfolk' }, { kind: 'allyStatusCount', statusId: 'submerged' }] },
      }),
      inflict('submerged', 'allyAll', { ifCond: { kind: 'targetColor', color: BaseColor.Blue } }),
      inflict('silence', 'enemyAll', { ifCond: { kind: 'targetColor', color: BaseColor.Blue } }),
    ),
  },
  {
    id: 7742,
    desc: '对一名敌人造成 [魔法 + 4] 点伤害。若敌人身处狂怒状态，则造成双倍伤害。',
    build: skill(dmg('enemyChosen', 4, 1, { condMult: { times: 2, cond: { kind: 'targetStatus', statusId: 'rage' } } })),
  },
  {
    id: 7811,
    desc: '对一名敌人及其下方军队造成 [魔法 + 3] 点伤害。使两名敌人都陷入燃烧和妖火状态。',
    build: skill(
      // native FromTarget + NextDownFromTarget: the target and only the next enemy below it
      dmg('enemyChosenAndNextDown', 3, 1, { range: 'all' }),
      inflict('burning', 'enemyChosenAndNextDown'),
      inflict('faerie-fire', 'enemyChosenAndNextDown'),
    ),
  },
  {
    id: 7814,
    desc: '魅惑一名敌人。有 40% 的几率将其转化成一名魅妖或魅魔。',
    build: skill(
      inflict('charm', 'enemyChosen'),
      transformTroopRandom('enemyChosen', ['Succubus', 'Incubus'], { chance: 0.4 }),
    ),
  },
  {
    id: 7956,
    desc: '摧毁 [魔法 + 1] 颗随机宝石并燃烧一名随机敌人。并获得下列其一：召唤一名暴民，或对第一名敌人造成 [魔法 + 1] 点伤害。',
    build: skill(
      destroyRandomGems(1, 1),
      inflict('burning', 'enemyRandom'),
      oneOf([summonRef('AngryMob')], [dmg('enemyFront', 1, 1)]),
    ),
  },
  {
    id: 7968,
    desc: '给予所有盟友 4 点魔法，并各有 50% 的几率触发以下效果：对所有敌人造成 [魔法 + 1] 点伤害；爆破 8 颗随机宝石；给予所有盟友 [魔法 + 1] 点生命值。',
    // native: IncreaseSpellPower@AllAllies 4 (Magic, not mana) ; then three independent 50% steps
    // (Damage@AllEnemies, ExplodeGems 8 incl. Skulls, IncreaseHealth@AllAllies), not one 50% oneOf
    build: skill(
      magic('allyAll', 4, 0),
      { ...dmgAll(1), chance: 0.5 },
      { ...explodeRandomGems(8, 0, 'all'), chance: 0.5 },
      { ...heal('allyAll', 1, 1), chance: 0.5 },
    ),
  },
  {
    id: 8173,
    desc: '使一名敌人陷入沉默状态。爆破其法力颜色  [(魔法 / 4) + 1]  颗宝石。获得一个额外回合。',
    // 修正（2026-09-18 官方复核）：官方 ExplodeColor(FromTarget) = 爆破（辐射一圈），非静默摧毁
    build: skill(
      inflict('silence', 'enemyChosen'),
      explodeRandomGems(1, 0.25, 'color', 'LAST_TARGET'),
      extraTurn(),
    ),
  },
  {
    id: 8215,
    desc: '使最强大的敌人陷入诅咒和死亡标记效果。再摧毁 [魔法 + 1] 颗其法力颜色的宝石。',
    build: skill(
      inflict('curse', 'enemyHealthiest'),
      // native CauseDeathMark@FromPrevious: same enemy as the Curse (a re-pick could differ on strongest ties)
      inflict('death-mark', 'lastTarget'),
      destroyRandomGems(1, 1, 'color', 'LAST_TARGET'),
    ),
  },
  {
    id: 8218,
    desc: '对一名敌人造成 [魔法 + 3] 点伤害，数值因蓝色与红色宝石数而增强。再冻结或燃烧敌人。 [2:1]',
    build: skill(
      dmg('enemyChosen', 3, 1, { modifier: { mod: { kind: 'ratio', a: 2, b: 1 }, sources: [{ kind: 'boardGems', color: BaseColor.Blue }, { kind: 'boardGems', color: BaseColor.Red }] } }),
      // 原生 Randomize ABC+(D-E-F)：D 冻结 / E 燃烧 / F 冻结 → 冻结 2/3、燃烧 1/3
      oneOf([inflict('frozen', 'enemyChosen')], [inflict('burning', 'enemyChosen')], [inflict('frozen', 'enemyChosen')]),
    ),
  },
  {
    id: 8229,
    desc: '对一名敌人造成 [魔法 + 3] 点伤害，伤害值因红色宝石数而增强。有 15% 的几率转化成杜尔本。 [3:1]',
    build: skill(
      // sa-R5 L1-6827: native Damage Amount 3 (English [Magic + 3]); was base 4.
      dmg('enemyChosen', 3, 1, { modifier: { mod: { kind: 'ratio', a: 3, b: 1 }, source: { kind: 'boardGems', color: BaseColor.Red } } }),
      transformTroop('allySelf', 'BeastmasterTorbern', { chance: 0.15 }),
    ),
  },
  {
    id: 8230,
    desc: '爆破 [(魔法 / 2) + 1] 颗红色宝石。赋予自身狂怒效果。有 20% 的几率转化成杜尔本。',
    build: skill(
      explodeRandomGems(1, 0.5, 'color', BaseColor.Red),
      inflict('rage', 'allySelf'),
      transformTroop('allySelf', 'BeastmasterTorbern', { chance: 0.2 }),
    ),
  },
  {
    id: 8231,
    desc: '对一名敌人造成 [魔法 + 4] 点伤害。若板面上有 13 或更多颗红色宝石，则造成 3 倍伤害并再创造 8 颗红色宝石。有 25% 的几率转化成杜尔本。 ',
    build: skill(
      dmg('enemyChosen', 4, 1, { condMult: { times: 3, cond: { kind: 'boardAtLeast', color: BaseColor.Red, n: 13 } } }),
      createGems(BaseColor.Red, 8, 0, { ifCond: { kind: 'boardAtLeast', color: BaseColor.Red, n: 13 } }),
      transformTroop('allySelf', 'BeastmasterTorbern', { chance: 0.25 }),
    ),
  },
  {
    id: 8236,
    desc: '对一名敌人和一名随机敌人造成 [魔法 + 3] 点伤害，伤害值因中毒的敌人数而增强。若敌人使用蓝色法力值，则造成双倍伤害。 [x5]',
    build: skill(
      dmg('enemyChosen', 3, 1, {
        modifier: { mod: { kind: 'multiplier', a: 5 }, source: { kind: 'enemyStatusCount', statusId: 'poison' } },
        condMult: { times: 2, cond: { kind: 'targetColor', color: BaseColor.Blue } },
      }),
      // Native: second hit Damage@RandomPrefNotPrevEnemy (never the chosen enemy while another lives; was enemyRandom).
      dmg('enemyRandomPrefNotPrev', 3, 1, {
        modifier: { mod: { kind: 'multiplier', a: 5 }, source: { kind: 'enemyStatusCount', statusId: 'poison' } },
        condMult: { times: 2, cond: { kind: 'targetColor', color: BaseColor.Blue } },
      }),
    ),
  },
  {
    id: 8241,
    desc: '对一名敌人和一名随机敌人造成 [魔法 + 3] 点伤害，伤害值因狂怒盟友数而增强。若敌人使用棕色法力值，则造成双倍伤害。 [x5]',
    build: skill(
      dmg('enemyChosen', 3, 1, {
        modifier: { mod: { kind: 'multiplier', a: 5 }, source: { kind: 'allyStatusCount', statusId: 'rage' } },
        condMult: { times: 2, cond: { kind: 'targetColor', color: BaseColor.Brown } },
      }),
      // Native: second hit Damage@RandomPrefNotPrevEnemy (never the chosen enemy while another lives; was enemyRandom).
      dmg('enemyRandomPrefNotPrev', 3, 1, {
        modifier: { mod: { kind: 'multiplier', a: 5 }, source: { kind: 'allyStatusCount', statusId: 'rage' } },
        condMult: { times: 2, cond: { kind: 'targetColor', color: BaseColor.Brown } },
      }),
    ),
  },
  {
    id: 8249,
    desc: '创造 7 到 10 颗骷髅头，或创造 6 到 8 颗末日骷髅头，或召唤一只混乱猎犬。',
    build: skill(oneOf(
      [createSkulls(7, 0, { countRange: { min: 7, max: 10 } })],
      [createSpecialGems({ kind: 'doomSkull' }, 6, 0, { countRange: { min: 6, max: 8 } })],
      [summonRef('ChaosHound')],
    )),
  },
  {
    id: 8250,
    desc: '耗尽一名敌人所有法力值，或窃取一名敌人 [魔法 + 1] 点攻击力，或使一名敌人陷入沉默状态。',
    // sa-F1: native Target Enemy; declare the chosen enemy (inputTarget) — oneOf branches are not scanned for it.
    build: targetedSkill('enemyChosen', oneOf(
      [drainMana('enemyChosen')],
      [steal('enemyChosen', 'attack', 'attack', 1, 1)],
      [inflict('silence', 'enemyChosen')],
    )),
  },
  {
    id: 8280,
    desc: '对所有敌人造成 [(魔法 / 2) + 4] 点伤害。有 25% 个别几率获得一个额外回合和半数法力值，几率因棕色宝石数而增强。 [x2]',
    build: skill(
      dmg('enemyAll', 4, 0.5, { range: 'all' }),
      extraTurn({ chance: 0.25, chanceBoost: { mod: { kind: 'multiplier', a: 2 }, source: { kind: 'boardGems', color: BaseColor.Brown } } }),
      mana('allySelf', 0, 0, { halve: true, chance: 0.25, chanceBoost: { mod: { kind: 'multiplier', a: 2 }, source: { kind: 'boardGems', color: BaseColor.Brown } } }),
    ),
  },
  {
    id: 8281,
    desc: '获得屏障效果和 [魔法 + 1] 点护甲值。有 25% 个别几率获得一个额外回合和半数法力值，几率因棕色宝石数而增强。 [x2]',
    build: skill(
      inflict('barrier', 'allySelf'),
      armor('allySelf', 1, 1),
      extraTurn({ chance: 0.25, chanceBoost: { mod: { kind: 'multiplier', a: 2 }, source: { kind: 'boardGems', color: BaseColor.Brown } } }),
      mana('allySelf', 0, 0, { halve: true, chance: 0.25, chanceBoost: { mod: { kind: 'multiplier', a: 2 }, source: { kind: 'boardGems', color: BaseColor.Brown } } }),
    ),
  },
  {
    id: 8371,
    desc: '对一名敌人造成 [魔法 + 3] 点伤害。若敌人是恶魔，则有 50% 的几率将其转化成一名怨灵。',
    build: skill(
      dmg('enemyChosen', 3),
      // native TransformConditional Data 6206 = Wraith only (not Ice/Frostfire Wraith)
      transformTroop('enemyChosen', 'Wraith', { chance: 0.5, ifCond: { kind: 'targetRace', race: 'Daemon' } }),
    ),
  },
  {
    id: 8405,
    desc: '爆破所有红色宝石。对第一名敌人造成 [魔法 + 2] 点伤害，伤害值因自身的护甲值而增强。有 15% 的几率自毁。 [3:1]',
    build: skill(
      explodeColor(BaseColor.Red),
      dmg('enemyFront', 2, 1, { modifier: { mod: { kind: 'ratio', a: 3, b: 1 }, source: { kind: 'selfStat', stat: 'armor' } } }),
      sacrifice('allySelf', { chance: 0.15 }),
    ),
  },
  {
    id: 8407,
    desc: '对一名敌人造成 [魔法 + 3] 点伤害，有 50% 的几率造成三倍伤害。有 15% 的几率自毁。',
    // sa-F1: native Randomize AB-CD: A = Damage [Magic + 3]; B = the same Damage x3 (MultiplyIfIHaveMech 3), each followed by
    // a 15% self LethalDamage. Triple damage is 3 x (Magic + 3) (was base 3 + 3 x Magic). Chosen enemy declared (inputTarget).
    build: targetedSkill('enemyChosen',
      oneOf([dmg('enemyChosen', 3, 1, { condMult: { times: 3, cond: { kind: 'allyRacePresent', race: 'Mech' } } })], [dmg('enemyChosen', 3, 1)]),
      sacrifice('allySelf', { chance: 0.15 }),
    ),
  },
  {
    id: 8415,
    desc: '对第一位敌人造成 [魔法 + 4] 点伤害，伤害值因其攻击力而增强。若自身有狂怒效果，则使第一位敌人出血 2 次。 [3:1]',
    build: skill(
      // Native 8415: CountAttack@FrontEnemy 34 = the first enemy's Attack [3:1] (was the caster's Attack).
      dmg('enemyFront', 4, 1, { modifier: { mod: { kind: 'ratio', a: 3, b: 1 }, source: { kind: 'targetStat', stat: 'attack' } } }),
      inflict('bleed', 'enemyFront', { stacks: 2, ifCond: { kind: 'selfStatus', statusId: 'rage' } }),
    ),
  },
  {
    id: 8433,
    desc: '对前 2 位敌人造成 [魔法 + 4] 点伤害，伤害值因陷入燃烧和妖火的敌人数而增强。 [x5]',
    build: skill(dmg('enemyFirstN', 4, 1, {
      n: 2,
      modifier: { mod: { kind: 'multiplier', a: 5 }, sources: [{ kind: 'enemyStatusCount', statusId: 'burning' }, { kind: 'enemyStatusCount', statusId: 'faerie-fire' }] },
    })),
  },
  {
    id: 8458,
    desc: '对前 2 位敌人造成 [魔法 + 2] 点伤害，再将他们击晕。再获得一个额外回合或获得 12 点护甲值。',
    build: skill(
      // R001: native CauseStun precedes Damage (Stun suppresses the targets' traits before the hit)
      inflict('stun', 'enemyFirstN', { n: 2 }),
      dmg('enemyFirstN', 2, 1, { n: 2 }),
      oneOf([extraTurn()], [armor('allySelf', 12, 0)]),
    ),
  },
  {
    id: 8547,
    desc: '对一名敌人造成 [(魔法 x 1.5) + 7] 点伤害。有等同于自身魔力值的几率摧毁敌人。若敌人身亡则召唤一名勒梅尔。 [1:1]',
    build: skill(
      dmg('enemyChosen', 7, 1.5),
      dmg('enemyChosen', 0, 0, { execute: true, chance: 0, chanceBoost: { mod: { kind: 'multiplier', a: 1 }, source: { kind: 'selfStat', stat: 'magic' } } }),
      { ...summonRef('Lemure'), ifTargetDied: true },
    ),
  },
  {
    id: 8572,
    desc: '对最后 2 位敌人造成 [魔法 + 1] 点伤害，并使他们陷入一个随机的状态效果。再使他们中毒。',
    build: skill(
      dmg('enemyLastN', 1, 1, { n: 2 }),
      // 官方 RandomStatusEffect@LastTwoEnemies：最后 2 名各掷一个随机负面状态。randomStatus 段无 n，
      // 拆成倒数第二名 + 末位两段（按编队顺序掷签；仅剩 1 名时倒数第二段为空、末位段命中）——sa-H
      inflictRandom('enemySecondLast'),
      inflictRandom('enemyLastN'),
      inflict('poison', 'enemyLastN', { n: 2 }),
    ),
  },
  {
    id: 8710,
    desc: '将所有选定颜色的宝石转换成燃烧宝石。',
    build: skill(transformToSpecial(CHOSEN, 'burningGem')),
  },
  {
    id: 8712,
    desc: '对一名敌人造成 [魔法 + 3] 点溅射伤害，数值因燃烧宝石的数量而增强。 [x3]',
    build: skill(dmgSplash('enemyChosen', 3, 1, { modifier: { mod: { kind: 'multiplier', a: 3 }, source: { kind: 'boardSpecial', gem: 'burningGem' } } })),
  },
  {
    id: 8746,
    desc: '对一名敌人造成 [魔法 + 3] 点伤害，再将 3 颗红色宝石转换成燃烧宝石。',
    build: skill(dmg('enemyChosen', 3), transformToSpecial(BaseColor.Red, 'burningGem', { count: 3 })),
  },
  {
    id: 8757,
    desc: '对一名敌人造成 [魔法 + 2] 点轻微溅射伤害，再创造 3 颗燃烧宝石。',
    build: skill(dmgSplash('enemyChosen', 2), createSpecialGems({ kind: 'burningGem' }, 3)),
  },
  {
    id: 8760,
    desc: '对一名敌人造成 [魔法 + 2] 点伤害，伤害值因燃烧宝石、燃烧盟友和燃烧敌人数而增强。 [x3]',
    build: skill(dmg('enemyChosen', 2, 1, {
      modifier: { mod: { kind: 'multiplier', a: 3 }, sources: [{ kind: 'boardSpecial', gem: 'burningGem' }, { kind: 'allyStatusCount', statusId: 'burning' }, { kind: 'enemyStatusCount', statusId: 'burning' }] },
    })),
  },
  {
    id: 8787,
    desc: '使所有盟友获得狂怒效果，并给予他们 [魔法 + 1] 点攻击力。再创建 22 颗混合骷髅头和黄色宝石。',
    build: skill(
      inflict('rage', 'allyAll'),
      attack('allyAll', 1, 1),
      createMix(['SKULL', BaseColor.Yellow], 22),
    ),
  },
  {
    id: 8850,
    desc: '对所有敌人造成 [(魔法 x 2) + 6] 点伤害，伤害值因骷髅头数而增强。将 5 颗骷髅头转换成末日骷髅头。有 10% 的几率获得一个额外回合，几率因骷髅头数而增强。 [x3]',
    build: skill(
      dmg('enemyAll', 6, 2, { range: 'all', modifier: { mod: { kind: 'multiplier', a: 3 }, source: { kind: 'boardSkulls' } } }),
      // sa-R7: native CountGems is step 0 -> extra-turn chance counted before the gem change (R001).
      extraTurn({ chance: 0.1, chanceBoost: { mod: { kind: 'multiplier', a: 3 }, source: { kind: 'boardSkulls' } } }),
      transformToSpecial('SKULL', 'doomSkull', { count: 5 }),
    ),
  },
  {
    id: 8901,
    desc: '将一个选定的法力颜色宝石转换成一颗超级末日骷髅头。',
    // Native ConvertGems FromTarget BoardTarget SingleGem Amount 1: only the chosen cell (L4b-7276-singlegem).
    build: skill(transformToSpecial('CELL', 'uberDoomSkull')),
  },
  {
    id: 8903,
    desc: '使一名敌人陷入妖火状态。再对他造成 [(魔法 x 0.8) + 3] 点伤害，伤害值因陷入出血状态的敌人数而增强。 [x3]',
    build: skill(
      inflict('faerie-fire', 'enemyChosen'),
      dmg('enemyChosen', 3, 0.8, { modifier: { mod: { kind: 'multiplier', a: 3 }, source: { kind: 'enemyStatusCount', statusId: 'bleed' } } }),
    ),
  },
  {
    id: 8945,
    desc: '获得 [魔法 + 1] 点护甲值和攻击力。将 4 颗棕色宝石转换成缠绕宝石。',
    build: skill(
      armor('allySelf', 1, 1),
      attack('allySelf', 1, 1),
      transformToSpecial(BaseColor.Brown, 'entangleGem', { count: 4 }),
    ),
  },
  {
    id: 8963,
    desc: '对 3 名随机敌人造成 [魔法 + 6] 点伤害。然后创建 3-6 颗 x3 通配宝石。',
    build: skill(
      // native Damage@RandomEnemy → 2 × Damage@RandomPrefNotPrevEnemy (R007-3: avoid only the previous hit)
      dmg('enemyRandom', 6, 1),
      dmg('enemyRandomPrefNotPrev', 6, 1),
      dmg('enemyRandomPrefNotPrev', 6, 1),
      createSpecialGems({ kind: 'wildcard', tier: 3 }, 3, 0, { countRange: { min: 3, max: 6 } }),
    ),
  },
  {
    id: 8970,
    desc: '为 2 名盟友提供 3 点护甲。棋盘上每有一颗黄色宝石，就有 7% 的几率获得额外回合。 [x7]',
    build: skill(
      armor('allyRandomPrefNotPrevN', 3, 0, { n: 2 }),
      // sa-R7: ExtraTurnConditional has no base Amount -> 7% x Yellow gems only (was 7% base + boost).
      extraTurn({ chanceBoost: { mod: { kind: 'multiplier', a: 7 }, source: { kind: 'boardGems', color: BaseColor.Yellow } } }),
    ),
  },
  {
    id: 8974,
    desc: '创造 2 颗死亡印记宝石。板面上每有一颗紫色宝石，则有 7% 的几率获得一个额外回合。 [x7]',
    build: skill(
      // sa-R7: native CountGems Purple 700 is step 0 and ExtraTurnConditional has no base Amount:
      // chance = 7% x Purple gems counted before the creation (was 7% base + boost, counted after).
      extraTurn({ chanceBoost: { mod: { kind: 'multiplier', a: 7 }, source: { kind: 'boardGems', color: BaseColor.Purple } } }),
      createSpecialGems({ kind: 'deathMarkGem' }, 2),
    ),
  },
  {
    id: 9003,
    desc: '创造 2 颗赃物宝石。板面上每有一颗蓝色宝石则有 7% 的几率获得一个额外回合。 [x7]',
    build: skill(
      // sa-R7: native CountGems Blue 700 is step 0 and ExtraTurnConditional has no base Amount:
      // chance = 7% x Blue gems counted before the creation (was 7% base + boost, counted after).
      // Native CreateGems Booty Amount 1 vs English "2 Booty Gems": kept 2, issue L3-7363-booty-count.
      extraTurn({ chanceBoost: { mod: { kind: 'multiplier', a: 7 }, source: { kind: 'boardGems', color: BaseColor.Blue } } }),
      createSpecialGems({ kind: 'bootyGem' }, 2),
    ),
  },
  {
    id: 9024,
    desc: '对所有敌人造成 [魔法 + 1] 点伤害，伤害值因妖火宝石数而增强。再召唤一名炽夏骑士。 [x3]',
    build: skill(
      dmg('enemyAll', 1, 1, { range: 'all', modifier: { mod: { kind: 'multiplier', a: 3 }, source: { kind: 'boardSpecial', gem: 'faerieFireGem' } } }),
      summonRef('SummerKnight'),
    ),
  },
  {
    id: 9053,
    desc: '创建一颗妖火宝石，并对末位敌人造成 [魔法 + 3] 点伤害。',
    // Native Target Board + CreateGems 1 FaerieFire BoardTarget SingleGem = the chosen cell (L4b-7276 / 7092 convention).
    build: skill(transformToSpecial('CELL', 'faerieFireGem'), dmg('enemyLast', 3)),
  },
  {
    id: 9054,
    desc: '爆破 [魔法 + 1] 颗紫色宝石。再恢复全部生命值，并使所有敌人陷入恐怖状态。',
    build: skill(
      // native ExplodeColor Purple (1 + M): Purple gems only, not any gem
      explodeRandomGems(1, 1, 'color', BaseColor.Purple),
      heal('allySelf', 0, 0, { full: true }),
      inflict('terror', 'enemyAll'),
    ),
  },
  {
    id: 9056,
    desc: '对一名敌人造成 [魔法 + 2] 点伤害，并使其陷入恐怖状态。',
    build: skill(dmg('enemyChosen', 2), inflict('terror', 'enemyChosen')),
  },
  {
    id: 9057,
    desc: '创造 7 颗蓝色宝石，数量因陷入恐怖状态的敌人数而增强。 [x2]',
    build: skill(createGems(BaseColor.Blue, 7, 0, { modifier: { mod: { kind: 'multiplier', a: 2 }, source: { kind: 'enemyStatusCount', statusId: 'terror' } } })),
  },
  {
    id: 9058,
    desc: '对一名敌人造成 [魔法 + 4] 点伤害。若敌人已陷入恐怖状态，则伤害翻倍。再使敌人陷入恐怖状态。',
    build: skill(
      dmg('enemyChosen', 4, 1, { condMult: { times: 2, cond: { kind: 'targetStatus', statusId: 'terror' } } }),
      inflict('terror', 'enemyChosen'),
    ),
  },
  {
    id: 9059,
    desc: '将所有红色宝石转换成紫色。将所有蓝色宝石转换成末日骷髅头。使最强的敌人陷入恐怖状态。',
    build: skill(
      transform(BaseColor.Red, BaseColor.Purple),
      transformToSpecial(BaseColor.Blue, 'doomSkull'),
      inflict('terror', 'enemyHealthiest'),
    ),
  },
  {
    id: 9067,
    desc: '使一名敌人陷入恐怖状态。再窃取他 [魔法 + 1] 点攻击力并耗掉他 7 点法力值。',
    build: skill(
      inflict('terror', 'enemyChosen'),
      steal('enemyChosen', 'attack', 'attack', 1, 1),
      // L3-008: native DecreaseMana Amount 7, no SpellPowerMultiplier → fixed 7
      reduce('enemyChosen', 'mana', 7, 0),
    ),
  },
  {
    id: 9069,
    desc: '创造 2 颗许愿石。获得额外回合，以及以下其中之一：对最后 2 名敌人造成 [魔法 + 1] 真实伤害，或为所有盟友带来 [魔法 + 1] 生命，或引爆 [魔法 + 1] 颗棕色宝石。',
    build: skill(
      createSpecialGems({ kind: 'wish' }, 2),
      extraTurn(),
      // sa-R6 L2-7406-branch-weights：原生 AB+(C-D-E-F)，C 与 F 都是末 2 名真实伤害 → 伤害 1/2、治疗 1/4、爆破 1/4（原为各 1/3）
      oneOf(
        [trueDmg('enemyLastN', 1, 1, { n: 2 })],
        [heal('allyAll', 1, 1)],
        [explodeRandomGems(1, 1, 'color', BaseColor.Brown)],
        [trueDmg('enemyLastN', 1, 1, { n: 2 })],
      ),
    ),
  },
  {
    id: 9126,
    desc: '对一名敌人造成 [魔法 + 4] 点伤害。有 50% 的几率冻结其下方所有敌人。',
    build: skill(
      dmg('enemyChosen', 4),
      inflict('frozen', 'enemyBelowTarget', { chance: 0.5 }), // native BelowTarget: target itself excluded
    ),
  },
  {
    id: 9163,
    desc: '将所有绿色宝石转换成恐怖宝石。对一名随机敌人造成 [魔法 + 2] 点伤害。',
    build: skill(transformToSpecial(BaseColor.Green, 'terrorGem'), dmg('enemyRandom', 2)),
  },
  {
    id: 9164,
    desc: '获得 [魔法 + 1] 点攻击力和生命值，再将 1 颗紫色宝石转换成恐怖宝石。',
    build: skill(
      attack('allySelf', 1, 1),
      heal('allySelf', 1, 1),
      transformToSpecial(BaseColor.Purple, 'terrorGem', { count: 1 }),
    ),
  },
  {
    id: 9179,
    desc: '对首位敌人造成 [魔法 + 3] 点真实伤害。有 25% 独立几率获得一个额外回合和半数法力值，几率因棕色宝石数而增强。 [x2]',
    build: skill(
      trueDmg('enemyFront', 3),
      extraTurn({ chance: 0.25, chanceBoost: { mod: { kind: 'multiplier', a: 2 }, source: { kind: 'boardGems', color: BaseColor.Brown } } }),
      mana('allySelf', 0, 0, { halve: true, chance: 0.25, chanceBoost: { mod: { kind: 'multiplier', a: 2 }, source: { kind: 'boardGems', color: BaseColor.Brown } } }),
    ),
  },
];

export const BATCH_R4: CuratedBatch = { batch: 'R4', spells: SPELLS, skipped: SKIPPED };
