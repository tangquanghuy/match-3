/**
 * 窗口 K-B · 武器法术批次 W01（池：scripts/curated-pools/pool-w01.json；分保真度绑定）。
 *
 * 来源：artifacts/gowhead-weapons/weapons.json（zh 文本逐字锚定，校验见
 * tests/unit/weaponSpellAudit.test.ts——与部队批次的 troops.json 锚定不同源）。
 * 保真度：本批全部为 full/partial（partial = 可编译子句照常入 build、卡点子句按
 * missingFeatures/skippedClauses 略去；mana-only 占位绑定不进批次，见
 * src/data/weapon-skill-meta.json）。组装规则锚定 scripts/spell-rules.md 与
 * 既有部队批次先例；生成器 scripts/_weapon_pools.mjs gen。
 */
import { armor, attack, cleanse, createGems, createMix, createSkulls, createStorm, destroyAt, destroyChosenCol, destroyChosenRow, destroyColor, destroyRandomGems, destroySkulls, devour, dmg, dmgSplash, drainMana, explodeRandomGems, extraTurn, flat, gainGold, gainMaps, gainSouls, heal, inflict, magic, mana, oneOf, reduce, reposition, scale, skill, steal, stealRandomStat, summonRandom, summonRef, targetedSkill, transformTroop, trueDmg, CHOSEN, CASTER, CELL } from '../builders';
import { BaseColor } from '../../types';
import type { SkillPrototype } from '../prototypes';
import type { CuratedBatch } from './index';

const SKIPPED: { id: number; reason: string }[] = [];

const SPELLS: CuratedBatch['spells'] = [
  {
    id: 7064,
    desc: '对第一名敌人造成 [(魔法 / 2) + 5] 点伤害。',
    build: skill(
      dmg('enemyFront', 5, 0.5),
    ),
  },
  {
    id: 7066,
    desc: '对第 1 名敌人造成 [(魔法 / 2) + 3] 点伤害。',
    build: skill(
      dmg('enemyFront', 3, 0.5),
    ),
  },
  {
    id: 7067,
    desc: '对 1 名敌人造成 [(魔法 / 2) + 4] 点伤害。',
    build: skill(
      dmg('enemyChosen', 4, 0.5),
    ),
  },
  {
    id: 7068,
    desc: '对 1 名随机的敌人造成 [(魔法 / 2) + 6] 点伤害。',
    build: skill(
      dmg('enemyRandom', 6, 0.5),
    ),
  },
  {
    id: 7069,
    desc: '对所有敌人造成 [(魔法 / 2) + 6] 点散射伤害。',
    build: skill(
      dmg('enemyAll', 6, 0.5, { range: 'all' }),
    ),
  },
  {
    id: 7070,
    desc: '对第一名敌人造成 [(魔法 / 2) + 4] 点轻度溅射伤害。',
    build: ({"segments":[{"kind":"damage","target":"enemyFront","scaling":{"base":4,"mult":0.5},"range":"splash","splashRatio":0.25}]} as SkillPrototype),
  },
  {
    id: 7072,
    desc: '对最后一名敌人造成 [魔法 + 6] 点伤害。',
    build: skill(
      dmg('enemyLast', 6, 1),
    ),
  },
  {
    id: 7073,
    desc: '对最健康的敌人造成 [魔法 + 6] 点伤害。',
    build: skill(
      dmg('enemyHealthiest', 6, 1),
    ),
  },
  {
    id: 7074,
    desc: '对前两名敌人造成 [魔法 + 3] 点伤害。',
    build: skill(
      dmg('enemyFirstN', 3, 1, { n: 2 }),
    ),
  },
  {
    id: 7075,
    desc: '对最虚弱的敌人造成 [魔法 + 6] 点伤害。',
    build: skill(
      dmg('enemyWeakest', 6, 1),
    ),
  },
  {
    id: 7076,
    desc: '对第一名敌人造成 [魔法 + 6] 点伤害。',
    build: skill(
      dmg('enemyFront', 6, 1),
    ),
  },
  {
    id: 7077,
    desc: '对 1 名敌人造成 [魔法 + 3] 点真实伤害。',
    build: skill(
      trueDmg('enemyChosen', 3, 1, { trueDamage: true }),
    ),
  },
  {
    id: 7078,
    desc: '对 1 名随机的敌人造成 [魔法 + 5] 点真实伤害。',
    build: skill(
      trueDmg('enemyRandom', 5, 1, { trueDamage: true }),
    ),
  },
  {
    id: 7079,
    desc: '摧毁 1 颗宝石。给予所有盟友 1 点魔力值。',
    build: skill(destroyAt(CELL), magic('allyAll', 1, 0)),
  },
  {
    id: 7080,
    desc: '对 1 名敌人造成 [魔法 + 5] 点伤害。',
    build: skill(
      dmg('enemyChosen', 5, 1),
    ),
  },
  {
    id: 7081,
    desc: '对 1 个随机的敌人造成 3 到 [魔法 + 10] 点伤害。',
    build: skill(
      dmg('enemyRandom', 0, 0, { rangeSpec: { min: flat(3), max: scale(10, 1) } }),
    ),
  },
  {
    id: 7082,
    desc: '对一名敌人造成 [魔法 + 4] 点轻度溅射伤害。',
    build: ({"segments":[{"kind":"damage","target":"enemyChosen","scaling":{"base":4,"mult":1},"range":"splash","splashRatio":0.25}]} as SkillPrototype),
  },
  {
    id: 7083,
    desc: '对第一名敌人造成 [魔法 + 6] 点伤害。',
    build: skill(
      dmg('enemyFront', 6, 1),
    ),
  },
  {
    id: 7084,
    desc: '对所有敌人造成 [魔法 + 1] 点伤害。',
    build: skill(
      dmg('enemyAll', 1, 1, { range: 'all' }),
    ),
  },
  {
    id: 7085,
    desc: '对 1 名随机的敌人造成 [魔法 + 7] 点伤害。',
    build: skill(
      dmg('enemyRandom', 7, 1),
    ),
  },
  {
    id: 7086,
    desc: '对所有敌人造成 [魔法 + 6] 点散射伤害。',
    build: skill(
      dmg('enemyAll', 6, 1, { range: 'all' }),
    ),
  },
  {
    id: 7087,
    desc: '对最后一名敌人造成 [魔法 + 8] 点伤害。',
    build: skill(
      dmg('enemyLast', 8, 1),
    ),
  },
  {
    id: 7088,
    desc: '对最健康的敌人造成 [魔法 + 8] 点伤害。',
    build: skill(
      dmg('enemyHealthiest', 8, 1),
    ),
  },
  {
    id: 7089,
    desc: '对前两名敌人造成 [魔法 + 5] 点伤害。',
    build: skill(
      dmg('enemyFirstN', 5, 1, { n: 2 }),
    ),
  },
  {
    id: 7090,
    desc: '对最虚弱的敌人造成 [魔法 + 8] 点伤害。',
    build: skill(
      dmg('enemyWeakest', 8, 1),
    ),
  },
  {
    id: 7091,
    desc: '对第一名敌人造成 [魔法 + 8] 点伤害。',
    build: skill(
      dmg('enemyFront', 8, 1),
    ),
  },
  {
    id: 7092,
    desc: '对 1 名敌人造成 [魔法 + 5] 点真实伤害。',
    build: skill(
      trueDmg('enemyChosen', 5, 1, { trueDamage: true }),
    ),
  },
  {
    id: 7093,
    desc: '对 1 名随机的敌人造成 [魔法 + 7] 点真实伤害。',
    build: skill(
      trueDmg('enemyRandom', 7, 1, { trueDamage: true }),
    ),
  },
  {
    id: 7094,
    desc: '爆破一颗宝石，并给予所有盟友 2 点魔力值。',
    // sa-F2 fix round A: native 1:IncreaseSpellPower@AllAllies 2 was missing ("give 2 Magic to all Allies")
    build: ({"segments":[{"kind":"gem","params":{"op":"clear","mode":"explode","target":{"kind":"cell","cell":"CELL"}}},{"kind":"buff","target":"allyAll","stat":"magic","scaling":{"base":2,"mult":0}}]} as SkillPrototype),
  },
  {
    id: 7095,
    desc: '对 1 名敌人造成 [魔法 + 7] 点伤害。',
    build: skill(
      dmg('enemyChosen', 7, 1),
    ),
  },
  {
    id: 7096,
    desc: '对第一名敌人造成 3 到 [魔法 + 12] 点伤害。',
    build: skill(
      dmg('enemyFront', 0, 0, { rangeSpec: { min: flat(3), max: scale(12, 1) } }),
    ),
  },
  {
    id: 7097,
    desc: '对一名敌人造成 [魔法 + 6] 点轻度溅射伤害。',
    build: ({"segments":[{"kind":"damage","target":"enemyChosen","scaling":{"base":6,"mult":1},"range":"splash","splashRatio":0.25}]} as SkillPrototype),
  },
  {
    id: 7098,
    desc: '对第一名敌人造成 [魔法 + 8] 点伤害。',
    build: skill(
      dmg('enemyFront', 8, 1),
    ),
  },
  {
    id: 7099,
    desc: '对所有敌人造成 [魔法 + 2] 点伤害。',
    build: skill(
      dmg('enemyAll', 2, 1, { range: 'all' }),
    ),
  },
  {
    id: 7100,
    desc: '对 1 名随机的敌人造成 [魔法 + 9] 点伤害。',
    build: skill(
      dmg('enemyRandom', 9, 1),
    ),
  },
  {
    id: 7101,
    desc: '对所有敌人造成 [魔法 + 8] 点散射伤害。',
    build: skill(
      dmg('enemyAll', 8, 1, { range: 'all' }),
    ),
  },
  {
    id: 7102,
    desc: '对最后一名敌人造成 [魔法 + 3] 点伤害，并移除所有紫色宝石以增强伤害效果。 [3:1]',
    build: skill(
      destroyColor(BaseColor.Purple),
      dmg('enemyLast', 3, 1, { modifier: { mod: { kind: 'ratio', a: 3, b: 1 } } }),
    ),
  },
  {
    id: 7103,
    desc: '对最健康的敌人造成 [魔法 + 4] 点伤害，并移除所有蓝色宝石以增强伤害效果。 [2:1]',
    build: skill(
      destroyColor(BaseColor.Blue),
      dmg('enemyHealthiest', 4, 1, { modifier: { mod: { kind: 'ratio', a: 2, b: 1 } } }),
    ),
  },
  {
    id: 7104,
    desc: '对最虚弱的敌人造成 [魔法 + 2] 点伤害，并移除所有棕色宝石以增强伤害效果。 [3:1]',
    build: skill(
      destroyColor(BaseColor.Brown),
      dmg('enemyWeakest', 2, 1, { modifier: { mod: { kind: 'ratio', a: 3, b: 1 } } }),
    ),
  },
  {
    id: 7105,
    desc: '对第一名敌人造成 [魔法 + 4] 点伤害，并移除所有黄色宝石以增强伤害效果。 [3:1]',
    build: skill(
      destroyColor(BaseColor.Yellow),
      dmg('enemyFront', 4, 1, { modifier: { mod: { kind: 'ratio', a: 3, b: 1 } } }),
    ),
  },
  {
    id: 7106,
    desc: '对 1 名敌人造成 [魔法 + 3] 点真实伤害。',
    build: skill(
      trueDmg('enemyChosen', 3, 1, { trueDamage: true }),
    ),
  },
  {
    id: 7107,
    desc: '对 1 名随机的敌人造成 [魔法 + 4] 点真实伤害。',
    build: skill(
      trueDmg('enemyRandom', 4, 1, { trueDamage: true }),
    ),
  },
  {
    id: 7108,
    desc: '摧毁 1 组行和列。',
    build: ({"segments":[{"kind":"gem","params":{"op":"clear","mode":"destroy","target":{"kind":"chosenCross"}}}]} as SkillPrototype),
  },
  {
    id: 7109,
    desc: '对 1 名敌人造成 [魔法 + 2] 点伤害，并移除所有绿色宝石以增强伤害效果。 [2:1]',
    build: skill(
      destroyColor(BaseColor.Green),
      dmg('enemyChosen', 2, 1, { modifier: { mod: { kind: 'ratio', a: 2, b: 1 } } }),
    ),
  },
  {
    id: 7110,
    desc: '对 1 名敌人造成 3 到 [魔法 + 10] 点伤害。',
    build: skill(
      dmg('enemyChosen', 0, 0, { rangeSpec: { min: flat(3), max: scale(10, 1) } }),
    ),
  },
  {
    id: 7111,
    desc: '对一名敌人造成 [魔法 + 4] 点轻度溅射伤害。',
    build: ({"segments":[{"kind":"damage","target":"enemyChosen","scaling":{"base":4,"mult":1},"range":"splash","splashRatio":0.25}]} as SkillPrototype),
  },
  {
    id: 7112,
    desc: '对第一名敌人造成 [魔法 + 6] 点伤害。',
    build: skill(
      dmg('enemyFront', 6, 1),
    ),
  },
  {
    id: 7113,
    desc: '对所有敌人造成 [魔法 + 2] 点伤害。',
    build: skill(
      dmg('enemyAll', 2, 1, { range: 'all' }),
    ),
  },
  {
    id: 7114,
    desc: '对 1 个随机的敌人造成 [魔法 + 5] 伤害。如果敌人是龙族，则造成 8 点额外伤害。',
    build: skill(
      dmg('enemyRandom', 5, 1, { condBonus: { n: 8, cond: { kind: 'targetRace', race: 'Dragon' } } }),
    ),
  },
  {
    id: 7115,
    desc: '对所有敌人造成 [魔法 + 8] 点散射伤害。',
    build: skill(
      dmg('enemyAll', 8, 1, { range: 'all' }),
    ),
  },
  {
    id: 7116,
    desc: '对 1 个敌人造成 [魔法 + 4] 点伤害，并移除所有红色宝石以增强伤害效果。 [3:1]',
    build: skill(
      destroyColor(BaseColor.Red),
      dmg('enemyChosen', 4, 1, { modifier: { mod: { kind: 'ratio', a: 3, b: 1 } } }),
    ),
  },
  {
    id: 7117,
    desc: '对所有敌人造成 [魔法 + 4] 点伤害。如果有 1 名敌人身亡，则创造 7 颗骷髅头。',
    build: skill(
      dmg('enemyAll', 4, 1, { range: 'all' }),
      createSkulls(7, 0, { ifCond: { kind: 'anyTrackedDied' } }),
    ),
  },
  {
    id: 7118,
    desc: '摧毁选定颜色的所有宝石。',
    build: skill(
      destroyColor(CHOSEN),
    ),
  },
  {
    id: 7119,
    desc: '对 1 名随机的敌人造成 [魔法 + 6] 点伤害，并使其陷入沉默状态。',
    build: skill(
      dmg('enemyRandom', 6, 1),
      inflict('silence', 'lastTarget'),
    ),
  },
  {
    id: 7120,
    desc: '对 1 个敌人造成 [魔法 + 5] 点伤害。创造 6 颗绿色宝石。',
    build: skill(
      dmg('enemyChosen', 5, 1),
      createGems(BaseColor.Green, 6, 0),
    ),
  },
  {
    id: 7121,
    desc: '对最后一名敌人造成 [魔法 + 6] 点伤害。如果该敌人身亡，则随机爆破 1 颗宝石。',
    build: skill(
      dmg('enemyLast', 6, 1),
      explodeRandomGems(1, 0, 'color', undefined, { ifTargetDied: true }),
    ),
  },
  {
    id: 7122,
    desc: '随机爆破 [魔法] 颗棕色宝石。',
    build: skill(
      explodeRandomGems(0, 1, 'color', BaseColor.Brown),
    ),
  },
  {
    id: 7123,
    desc: '对一名敌人造成 [魔法 + 6] 点轻度溅射伤害。打乱板面。',
    build: ({"segments":[{"kind":"damage","target":"enemyChosen","scaling":{"base":6,"mult":1},"range":"splash","splashRatio":0.25},{"kind":"shuffleBoard"}]} as SkillPrototype),
  },
  {
    id: 7124,
    desc: '获得 [魔法 + 1] 点生命值，并移除所有绿色宝石以增强效果。获得屏障效果。 [1:1]',
    build: skill(
      // sa-F2 fix round A (R001): native CountGems Green ; RemoveColor Green ; IncreaseHealth (counter 1:1) ; Barrier.
      // The 1:1 boost had no source (removed gems never counted).
      destroyColor(BaseColor.Green),
      heal('allySelf', 1, 1, { modifier: { mod: { kind: 'ratio', a: 1, b: 1 }, source: { kind: 'destroyedGems', color: BaseColor.Green } } }),
      inflict('barrier', 'allySelf'),
    ),
  },
  {
    id: 7125,
    desc: '对第一名敌人造成 [魔法 + 7] 点伤害。如果敌人身亡，则获得 7 点攻击力。',
    build: skill(
      dmg('enemyFront', 7, 1),
      attack('allySelf', 7, 0, { ifTargetDied: true }),
    ),
  },
  {
    id: 7126,
    desc: '对 1 名敌人造成 [魔法 + 6] 点伤害，并将其冻结。',
    build: skill(
      dmg('enemyChosen', 6, 1),
      inflict('frozen', 'lastTarget'),
    ),
  },
  {
    id: 7127,
    desc: '对所有敌人造成 [魔法 + 2] 点伤害。创造 6 红色宝石。',
    build: skill(
      dmg('enemyAll', 2, 1, { range: 'all' }),
      createGems(BaseColor.Red, 6, 0),
    ),
  },
  {
    id: 7128,
    desc: '对最后一名敌人造成 [魔法 + 4] 点伤害，并使其陷入中毒状态。',
    build: skill(
      dmg('enemyLast', 4, 1),
      inflict('poison', 'lastTarget'),
    ),
  },
  {
    id: 7129,
    desc: '创造 6 颗骷髅。召唤一名亡魂。',
    build: skill(createSkulls(6), summonRef('Revenant', undefined)),
  },
  {
    id: 7170,
    desc: '对 1 名敌人造成 [魔法 + 5] 点伤害。窃取 2 点攻击力。',
    build: skill(
      dmg('enemyChosen', 5, 1),
      steal('lastTarget', 'attack', 'attack', 2, 0),
    ),
  },
  {
    id: 7172,
    desc: '对最后一名敌人造成 [魔法 + 4] 点伤害，并使其陷入沉默状态。',
    build: skill(
      dmg('enemyLast', 4, 1),
      inflict('silence', 'lastTarget'),
    ),
  },
  {
    id: 7174,
    desc: '将 1 颗宝石转换成红色，然后再创造 7 颗红色宝石。随机燃烧一名敌人。',
    build: skill(
      { kind: 'gem', params: { op: 'transform', from: 'ANY', to: BaseColor.Red, count: { base: 1, mult: 0 } } },
      createGems(BaseColor.Red, 7, 0),
      inflict('burning', 'enemyRandom'),
    ),
  },
  {
    id: 7176,
    desc: '窃取第一名敌人 [魔法 + 3] 点生命值，并耗尽该敌人的法力值。',
    build: skill(
      dmg('enemyFront', 3, 1, { drain: true }),
      drainMana('enemyChosen'),
    ),
  },
  {
    id: 7178,
    desc: '摧毁 1 列。对第一名敌人造成 [魔法 + 2] 点伤害，同时每摧毁一颗蓝色宝石则增加 2 点伤害。 [x2]',
    build: skill(
      destroyChosenCol(),
      dmg('enemyFront', 2, 1, { modifier: { mod: { kind: 'multiplier', a: 2 }, source: { kind: 'destroyedGems', color: BaseColor.Blue } } }),
    ),
  },
  {
    id: 7183,
    desc: '为所有盟友提供 [魔法 + 1] 点生命值。',
    build: skill(
      heal('allyAll', 1, 1),
    ),
  },
  {
    id: 7184,
    desc: '对前两名敌人造成 [魔法] 点伤害，并移除所有骷髅头以增强伤害效果效果。 [2:1]',
    build: skill(
      dmg('enemyFirstN', 0, 1, { n: 2, modifier: { mod: { kind: 'ratio', a: 2, b: 1 } } }),
      destroySkulls(),
    ),
  },
  {
    id: 7185,
    desc: '缠绕第一名敌人，并造成 [魔法 + 2] 点真实伤害。',
    // Native 7185: CauseEntangle FrontEnemy -> TrueDamage FrontEnemy M+2 (L5-012: damage step was missing).
    build: skill(
      inflict('entangle', 'enemyFront'),
      trueDmg('enemyFront', 2, 1),
    ),
  },
  {
    id: 7186,
    desc: '对所有敌人造成 [魔法 + 7] 点散射伤害。自身恢复 10 点生命值。',
    build: skill(
      dmg('enemyAll', 7, 1, { range: 'all' }),
      heal('allySelf', 10, 0),
    ),
  },
  {
    id: 7187,
    desc: '创造 7 颗红色宝石，并净化所有盟友。给随机一名盟友 [魔法 + 1] 点生命值。',
    build: skill(createGems(BaseColor.Red, 7, 0), cleanse('allyAll'), heal('allyRandom', 1, 1)),
  },
  {
    id: 7191,
    desc: '对所有敌人造成 [魔法 + 4] 点散射伤害。若敌方有精灵军队，则增加额外 10 点伤害。',
    build: skill(
      dmg('enemyAll', 4, 1, { range: 'all', condBonus: { n: 10, cond: { kind: 'enemyRacePresent', race: 'Elf' } } }),
    ),
  },
  {
    id: 7192,
    desc: '对 1 个敌人造成 [魔法 + 4] 点伤害。如果对方攻击力大于自身，则造成多 12 点伤害。',
    build: skill(dmg('enemyChosen', 4, 1, { condBonus: { n: 12, cond: { kind: 'targetStatBeatsCaster', stat: 'attack' } } })),
  },
  {
    id: 7193,
    desc: '对 1 个敌人造成 [魔法 + 3] 点伤害。如果对方使用红色法力值，则造成双倍伤害。',
    build: skill(
      dmg('enemyChosen', 3, 1, { condMult: { times: 2, cond: { kind: 'targetColor', color: BaseColor.Red } } }),
    ),
  },
  {
    id: 7194,
    desc: '减除一名敌人全部护甲值，在使其中毒，或造成 [魔法 + 2] 点伤害。',
    // sa-F1: native Randomize AB-CD — both branches start with DecreaseArmor 10001, so the armor removal is common;
    // chosen enemy declared (inputTarget) because oneOf branches are not scanned for it.
    build: targetedSkill('enemyChosen',
      reduce('enemyChosen', 'armor', 0, 0, { drainAll: true }),
      oneOf([inflict('poison', 'enemyChosen')], [dmg('enemyChosen', 2, 1)]),
    ),
  },
  {
    id: 7195,
    desc: '对 1 名敌人造成 [魔法 + 10] 点伤害。',
    build: skill(
      dmg('enemyChosen', 10, 1),
    ),
  },
  {
    id: 7196,
    desc: '对 1 个敌人造成 [魔法 + 3] 点伤害。如果对方使用紫色法力值，则造成双倍伤害。',
    build: skill(
      dmg('enemyChosen', 3, 1, { condMult: { times: 2, cond: { kind: 'targetColor', color: BaseColor.Purple } } }),
    ),
  },
  {
    id: 7197,
    desc: '为 1 个盟友提供 [魔法 + 1] 点攻击力和护甲值。',
    build: skill(
      attack('allyChosen', 1, 1),
      armor('allyChosen', 1, 1),
    ),
  },
  {
    id: 7198,
    desc: '耗尽第一名和最后一名敌人的法力值。为所有盟友提供 1 点魔力值。',
    build: ({"segments":[{"kind":"reduce","target":"enemyFront","stat":"mana","scaling":{"base":0,"mult":0},"drainAll":true},{"kind":"reduce","target":"enemyLast","stat":"mana","scaling":{"base":0,"mult":0},"drainAll":true},{"kind":"buff","target":"allyAll","stat":"magic","scaling":{"base":1,"mult":0}}]} as SkillPrototype),
  },
  {
    id: 7200,
    desc: '对最虚弱的敌人造成 [魔法 + 5] 点伤害。获得 1 个额外的回合。',
    build: skill(
      dmg('enemyWeakest', 5, 1),
      extraTurn(),
    ),
  },
  {
    id: 7201,
    desc: '对 1 个敌人造成 [魔法 + 3] 点伤害。如果对方使用蓝色法力值，则造成双倍伤害。',
    build: skill(
      dmg('enemyChosen', 3, 1, { condMult: { times: 2, cond: { kind: 'targetColor', color: BaseColor.Blue } } }),
    ),
  },
  {
    id: 7202,
    desc: '对 1 个敌人造成 [魔法 + 6] 点伤害。获得 10 个灵魂。',
    build: skill(
      dmg('enemyChosen', 6, 1),
      gainSouls(10, 0),
    ),
  },
  {
    id: 7203,
    desc: '恢复自身所有生命值。获得一个额外回合。获得 [魔法 + 1] 灵魂。',
    build: skill(
      heal('allySelf', 0, 0, { full: true }),
      extraTurn(),
      gainSouls(1, 1),
    ),
  },
  {
    id: 7204,
    desc: '创造 8 颗指定盟友的法力颜色的宝石。盟友获得 [魔法] 点护甲值。',
    build: skill(
      createGems('CHOSEN_TARGET', 8, 0),
      armor('allyAll', 0, 1),
    ),
  },
  {
    id: 7218,
    desc: '为所有盟友提供 [魔法 + 1] 点护甲值。',
    build: skill(
      armor('allyAll', 1, 1),
    ),
  },
  {
    id: 7219,
    desc: '创造 7 颗随机的蓝色宝石。自身一项随机属性获得 [魔法 + 1] 点。',
    build: ({"segments":[{"kind":"gem","params":{"op":"create","gem":{"kind":"color","color":"Blue"},"count":{"base":7,"mult":0}}},{"kind":"randomStat","target":"allySelf","scaling":{"base":1,"mult":1},"oneSkill":true}]} as SkillPrototype),
  },
  {
    id: 7220,
    desc: '对 1 名敌人造成 [魔法 + 2] 点伤害并耗尽其法力值。若敌人身亡则获得 5 点生命值。',
    build: skill(
      dmg('enemyChosen', 2, 1),
      drainMana('lastTarget'),
      heal('allySelf', 5, 0, { ifTargetDied: true }),
    ),
  },
  {
    id: 7221,
    desc: '对最后 1 名敌人造成 [魔法 + 4] 点伤害，并窃取 1 点魔力值。',
    build: ({"segments":[{"kind":"damage","target":"enemyLast","scaling":{"base":4,"mult":1}},{"kind":"reduce","target":"lastTarget","stat":"magic","scaling":{"base":1,"mult":0},"gainStat":"magic"}]} as SkillPrototype),
  },
  {
    id: 7222,
    desc: '对 1 名敌人造成 [魔法 + 4] 点轻度溅射伤害。如果敌人已被缠绕，则增加 5 点伤害。',
    build: ({"segments":[{"kind":"damage","target":"enemyChosen","scaling":{"base":4,"mult":1},"range":"splash","condBonus":{"n":5,"cond":{"kind":"targetStatus","statusId":"entangle"}},"splashRatio":0.25}]} as SkillPrototype),
  },
  {
    id: 7223,
    desc: '随机爆破 4 颗选定颜色的宝石。恢复 [魔法 + 4] 点生命值。',
    build: skill(
      explodeRandomGems(4, 0, 'color', CHOSEN),
      heal('allySelf', 4, 1),
    ),
  },
  {
    id: 7226,
    desc: '对所有敌人造成 [魔法] 点伤害并让全体盟友获得 2 点生命值。',
    build: skill(
      dmg('enemyAll', 0, 1, { range: 'all' }),
      heal('allyAll', 2, 0),
    ),
  },
  {
    id: 7227,
    desc: '对所有敌人造成 [魔法] 点伤害并让全体盟友获得 1 点魔力值。',
    build: ({"segments":[{"kind":"damage","target":"enemyAll","scaling":{"base":0,"mult":1},"range":"all"},{"kind":"buff","target":"allyAll","stat":"magic","scaling":{"base":1,"mult":0}}]} as SkillPrototype),
  },
  {
    id: 7228,
    desc: '对所有敌人造成 [魔法] 点伤害并让全体盟友获得 2 点攻击力。',
    build: skill(
      dmg('enemyAll', 0, 1, { range: 'all' }),
      attack('allyAll', 2, 0),
    ),
  },
  {
    id: 7230,
    desc: '对 1 名敌人造成 [魔法] 点伤害。获得 1 点魔力值并移除所有绿色宝石以强化此效果。 [3:1]',
    build: ({"segments":[{"kind":"damage","target":"enemyChosen","scaling":{"base":0,"mult":1}},{"kind":"buff","target":"allySelf","stat":"magic","scaling":{"base":1,"mult":0},"modifier":{"mod":{"kind":"ratio","a":3,"b":1},"source":{"kind":"boardGems","color":"Green"}}},{"kind":"gem","params":{"op":"clear","mode":"destroy","target":{"kind":"color","color":"Green"}}}]} as SkillPrototype),
  },
  {
    id: 7239,
    desc: '对最后两名敌人造成 [魔法 + 2] 点伤害。如果伤害目标是龙族，则造成双倍伤害。',
    build: skill(
      dmg('enemyLast', 2, 1, { condMult: { times: 2, cond: { kind: 'targetRace', race: 'Dragon' } } }),
    ),
  },
  {
    id: 7240,
    desc: '对 1 名敌人造成 [魔法 + 6] 点伤害，并随机窃取 5 点能力值。如果目标是妖仙，则造成三倍伤害。',
    // sa-F1 (R001): native s0 StealRandomStat 5 runs before s1 Damage@FromPrevious.
    build: skill(
      stealRandomStat('enemyChosen', 5, 0),
      dmg('enemyChosen', 6, 1, { condMult: { times: 3, cond: { kind: 'targetRace', race: 'Fey' } } }),
    ),
  },
  {
    id: 7241,
    desc: '对一名敌人造成 [魔法 + 7] 点伤害，伤害值因盖塔尔盟友数而增强。每有一名盖塔尔盟友，则创造 6 颗宝石，所创造的宝石混合紫色和棕色两种颜色。 [x6]',
    build: skill(
      dmg('enemyChosen', 7, 1, { modifier: { mod: { kind: 'multiplier', a: 6 }, source: { kind: 'alliesOfKingdom', kingdom: '盖塔尔' } } }),
      createMix([BaseColor.Purple, BaseColor.Brown], 0, 0, { modifier: { mod: { kind: 'multiplier', a: 6 }, source: { kind: 'alliesOfKingdom', kingdom: '盖塔尔' } } }),
    ),
  },
  {
    id: 7242,
    desc: '对所有敌人造成 [魔法 + 7] 点散射伤害。如果敌方有恶魔军队，则造成额外 8 点伤害。',
    build: skill(
      dmg('enemyAll', 7, 1, { range: 'all', condBonus: { n: 8, cond: { kind: 'enemyRacePresent', race: 'Daemon' } } }),
    ),
  },
  {
    id: 7244,
    desc: '对所有敌人造成 [魔法 + 1] 点伤害。从每名敌人身上窃取 1 点随机技能值。',
    // sa-F1 (R001): native s0 StealRandomStat@AllEnemies runs before s2 Damage@AllEnemies.
    build: skill(
      stealRandomStat('enemyAll', 1, 0),
      dmg('enemyAll', 1, 1, { range: 'all' }),
    ),
  },
  {
    id: 7245,
    desc: '对所有敌人造成 [(魔法 / 2) + 2] 点真实伤害。获得 2 点魔力值。如果敌人身亡，则获得一个额外回合。',
    build: ({"segments":[{"kind":"damage","target":"enemyAll","scaling":{"base":2,"mult":0.5},"range":"all","trueDamage":true},{"kind":"buff","target":"allySelf","stat":"magic","scaling":{"base":2,"mult":0}},{"kind":"extraTurn","ifCond":{"kind":"castEnemyDied"}}]} as SkillPrototype),
  },
  {
    id: 7246,
    desc: '对 1 名敌人造成 [魔法 + 4] 点伤害。如果板面上有 13 颗或更多红色宝石，则额外造成 8 点伤害。',
    build: skill(
      dmg('enemyChosen', 4, 1),
      dmg('enemyChosen', 8, 0, { ifCond: { kind: 'boardAtLeast', color: BaseColor.Red, n: 13 } }),
    ),
  },
  {
    id: 7247,
    desc: '减除一名敌人全部护甲值，再造成 [魔法 + 1] 点伤害。获得等同于减除的护甲值的攻击力。 [1:1]',
    build: skill(
      reduce('enemyChosen', 'armor', 0, 0, { drainAll: true }),
      dmg('enemyChosen', 1, 1),
      attack('allySelf', 0, 0, { modifier: { mod: { kind: 'ratio', a: 1, b: 1 }, source: { kind: 'lastReduce' } } }),
    ),
  },
  {
    id: 7248,
    desc: '对所有敌人造成 [魔法 + 4] 点散射伤害。伤害值因己方神祇和骑士盟友数而增强。 [x5]',
    build: skill(
      dmg('enemyAll', 4, 1, { range: 'all', modifier: { mod: { kind: 'multiplier', a: 5 }, sources: [{ kind: 'alliesOfRace', race: 'Divine' }, { kind: 'alliesOfRace', race: 'Knight' }] } }),
    ),
  },
  {
    id: 7249,
    desc: '给予所有盟友 [魔法 + 3] 点护甲值和 5 点攻击力。如果有 13 颗或更多黄色宝石，则给予所有盟友 4 点生命值和魔力值。',
    build: skill(armor('allyAll', 3, 1), attack('allyAll', 5, 0), heal('allyAll', 4, 0, { ifCond: { kind: 'boardAtLeast', color: BaseColor.Yellow, n: 13 } }), magic('allyAll', 4, 0, { ifCond: { kind: 'boardAtLeast', color: BaseColor.Yellow, n: 13 } })),
  },
  {
    id: 7250,
    desc: '对所有敌人造成 [魔法 + 2] 点伤害，伤害值因敌我双方的黄色军队数量而增强。赋予所有盟友屏障效果。如果有 13 颗或更多红色宝石，则获得 2 点魔力值。 [x2]',
    build: ({"segments":[{"kind":"damage","target":"enemyAll","scaling":{"base":2,"mult":1},"range":"all","modifier":{"mod":{"kind":"multiplier","a":2},"sources":[{"kind":"alliesOfColor","color":"Yellow"},{"kind":"enemiesOfColor","color":"Yellow"}]}},{"kind":"status","target":"allyAll","statusId":"barrier","turns":3},{"kind":"buff","target":"allySelf","stat":"magic","scaling":{"base":2,"mult":0},"ifCond":{"kind":"boardAtLeast","color":"Red","n":13}}]} as SkillPrototype),
  },
  {
    id: 7251,
    desc: '随机爆破 3 颗宝石。对所有敌人造成 [魔法 + 5] 点散射伤害。',
    build: skill(
      explodeRandomGems(3, 0, 'color', undefined),
      dmg('enemyAll', 5, 1, { range: 'all' }),
    ),
  },
  {
    id: 7267,
    desc: '对 1 名敌人造成 [魔法 + 1] 点真实伤害。如果敌人已陷入猎人标记状态，则造成双倍伤害。',
    build: skill(
      trueDmg('enemyChosen', 1, 1, { trueDamage: true, condMult: { times: 2, cond: { kind: 'targetStatus', statusId: 'marked' } } }),
    ),
  },
  {
    id: 7268,
    desc: '对 1 名敌人造成 [魔法 + 4] 点伤害。若自身的生命值受损，则获得 6 点攻击力。',
    build: skill(
      dmg('enemyChosen', 4, 1),
      attack('allySelf', 6, 0, { ifCond: { kind: 'selfHpDamaged' } }),
    ),
  },
  {
    id: 7269,
    desc: '摧毁一组行跟列。对所有敌人造成 [魔法 + 3] 点散射伤害，并因被摧毁的绿色宝石数而增强。 [x3]',
    build: skill(
      destroyChosenRow(),
      destroyChosenCol(),
      dmg('enemyAll', 3, 1, { range: 'all', modifier: { mod: { kind: 'multiplier', a: 3 }, source: { kind: 'boardGems', color: BaseColor.Green } } }),
    ),
  },
  {
    id: 7270,
    desc: '对 1 名敌人造成 [魔法 + 2] 点真实伤害。如果敌人是神祇军队，则额外造成 5 点真实伤害。',
    build: skill(
      trueDmg('enemyChosen', 2, 1, { trueDamage: true, condBonus: { n: 5, cond: { kind: 'enemyRacePresent', race: 'Divine' } } }),
    ),
  },
  {
    id: 7271,
    desc: '对 1 名敌人造成 [魔法 + 4] 点伤害。如果敌方有不死族军队，则对另1 名随机敌人造成 9 点伤害。',
    build: skill(
      dmg('enemyChosen', 4, 1),
      dmg('enemyRandomN', 9, 0, { n: 1, ifCond: { kind: 'enemyRacePresent', race: 'Undead' } }),
    ),
  },
  {
    id: 7272,
    desc: '摧毁 1 列。对 1 名随机敌人造成 [魔法 + 5] 点伤害，伤害值因被摧毁的骷髅头数而增强。 [1:1]',
    build: skill(
      // sa-F2 fix round A: native 0:Damage@FrontEnemy (no Amount) only anchors the following
      // RandomPrefNotPrevEnemy; 1:CountGems Skull BoardTarget Column counts the chosen column (was whole board).
      dmg('enemyFront', 0, 0),
      destroyChosenCol(),
      dmg('enemyRandomPrefNotPrev', 5, 1, { modifier: { mod: { kind: 'ratio', a: 1, b: 1 }, source: { kind: 'chosenColumnAtCastStart', skulls: true } } }),
    ),
  },
  {
    id: 7282,
    desc: '对 1 名敌人造成 [魔法 + 1] 点伤害。如果敌人已下潜则造成三倍伤害。',
    build: skill(
      dmg('enemyChosen', 1, 1, { condMult: { times: 3, cond: { kind: 'targetStatus', statusId: 'submerged' } } }),
    ),
  },
  {
    id: 7283,
    desc: '给予所有盟友 [(魔法 / 2)] 点生命值和护甲值。如果板面上有 13 颗或更多绿色宝石，则获得一个额外回合。',
    build: skill(
      heal('allyAll', 0, 0.5),
      armor('allyAll', 0, 0.5),
      extraTurn({ ifCond: { kind: 'boardAtLeast', color: BaseColor.Green, n: 13 } }),
    ),
  },
  {
    id: 7284,
    desc: '为所有盟友恢复 [魔法 + 5] 点生命值。获得一个额外回合。',
    build: skill(
      heal('allyAll', 5, 1),
      extraTurn(),
    ),
  },
  {
    id: 7285,
    desc: '对所有敌人造成 [(魔法 / 2) + 2] 点伤害。随机燃烧一名敌人，并使另一名敌人陷入疾病状态。',
    build: skill(dmg('enemyAll', 2, 0.5, { range: 'all' }), inflict('burning', 'enemyRandom'), inflict('disease', 'enemyRandomOther')),
  },
  {
    id: 7286,
    desc: '对最后一名敌人造成 [魔法 + 7] 点伤害。如果现有尘风暴，则移除所有绿色的宝石。创造尘风暴。',
    build: skill(
      dmg('enemyLast', 7, 1),
      destroyColor(BaseColor.Green, { ifCond: { kind: 'stormPresent', color: BaseColor.Brown } }),
      createStorm(BaseColor.Brown),
    ),
  },
  {
    id: 7287,
    desc: '将一名敌人拉到首位。减除所有敌人 [魔法 + 1] 点护甲值。',
    build: skill(
      // 原生序 DecreaseArmor@AllEnemies → Delay → TroopOrderFront@FromTarget（R001）
      reduce('enemyAll', 'armor', 1, 1),
      reposition('enemyChosen', 'front'),
    ),
  },
  {
    id: 7291,
    desc: '对 1 名敌人造成 [魔法 + 3] 点伤害。如果敌人是哥布林，造成三倍伤害。',
    build: skill(
      dmg('enemyChosen', 3, 1, { condMult: { times: 3, cond: { kind: 'targetRace', race: 'Goblin' } } }),
    ),
  },
  {
    id: 7292,
    desc: '对所有敌人造成 [魔法 + 7] 点散射伤害。获得 2 点魔力值。',
    build: ({"segments":[{"kind":"damage","target":"enemyAll","scaling":{"base":7,"mult":1},"range":"scatter"},{"kind":"buff","target":"allySelf","stat":"magic","scaling":{"base":2,"mult":0}}]} as SkillPrototype),
  },
  {
    id: 7293,
    desc: '对所有敌人造成 [魔法] 点伤害。有 20% 的几率吞噬一名随机敌人。',
    build: skill(
      // L1-consume-first (R001): native Consume(20%) RandomEnemy -> Damage AllEnemies.
      devour('enemyRandom', { chance: 0.2 }),
      dmg('enemyAll', 0, 1, { range: 'all' }),
    ),
  },
  {
    id: 7294,
    desc: '对 1 名敌人造成 [魔法 + 6] 点伤害。如果敌人身亡，所有技能值增加 10 点。',
    build: skill(
      dmg('enemyChosen', 6, 1),
      attack('allySelf', 10, 0, { ifTargetDied: true }),
      armor('allySelf', 10, 0, { ifTargetDied: true }),
      heal('allySelf', 10, 0, { ifTargetDied: true }),
      magic('allySelf', 10, 0, { ifTargetDied: true }),
    ),
  },
  {
    id: 7295,
    desc: '将一名军队拉到首位。对其造成 [魔法 + 6] 点伤害并将其击晕。',
    build: skill(
      // 原生序 Damage → CauseStun → Delay → TroopOrderFront@FromTarget（R001）
      dmg('enemyChosen', 6, 1),
      inflict('stun', 'lastTarget'),
      reposition('enemyChosen', 'front'),
    ),
  },
  {
    id: 7296,
    desc: '对最后一名敌人造成 [魔法 + 4] 点伤害。如果敌人已被冻结，则造成额外 10 点伤害。冻结敌人。',
    build: skill(
      dmg('enemyLast', 4, 1, { condBonus: { n: 10, cond: { kind: 'targetStatus', statusId: 'frozen' } } }),
      inflict('frozen', 'enemyChosen'),
    ),
  },
  {
    id: 7299,
    desc: '对 1 名敌人和另 1 名随机敌人造成 [魔法 + 2] 点伤害。从敌人身上窃取 1 点魔力值。',
    build: ({"segments":[{"kind":"damage","target":"enemyChosen","scaling":{"base":2,"mult":1}},{"kind":"damage","target":"enemyRandom","scaling":{"base":2,"mult":1}},{"kind":"reduce","target":"enemyChosen","stat":"magic","scaling":{"base":1,"mult":0},"gainStat":"magic"}]} as SkillPrototype),
  },
  {
    id: 7304,
    desc: '对 1 名敌人造成 [魔法 + 5] 点伤害。有 50% 的几率获得下列其一：20 个灵魂、100 黄金或 1 张藏宝图。',
    build: skill(
      dmg('enemyChosen', 5, 1),
      { kind: 'oneOf', options: [[gainSouls(20, 0)], [gainGold(100, 0)], [gainMaps(1, 0)]], chance: 0.5 },
    ),
  },
  {
    id: 7305,
    desc: '对 1 名敌人造成 [魔法 + 2] 点伤害，伤害值因敌人攻击力而增强。 [1:1]',
    build: skill(
      dmg('enemyChosen', 2, 1, { modifier: { mod: { kind: 'ratio', a: 1, b: 1 }, source: { kind: 'targetStat', stat: 'attack' } } }),
    ),
  },
  {
    id: 7306,
    desc: '爆破一颗宝石。对 1 名随机敌人造成 [魔法 + 5] 点伤害并将其燃烧。',
    build: ({"segments":[{"kind":"gem","params":{"op":"clear","mode":"explode","target":{"kind":"cell","cell":"CELL"}}},{"kind":"damage","target":"enemyRandom","scaling":{"base":5,"mult":1}},{"kind":"status","target":"lastTarget","statusId":"burning","turns":3,"magnitude":3}]} as SkillPrototype),
  },
  {
    id: 7307,
    desc: '获得 [魔法 + 1] 点护甲，并移至队伍首位。赋予所有其他盟友屏障效果。',
    build: skill(
      // 原生序 IncreaseArmor@Self → CauseBarrier@AllAlliesButNotSelf → Delay → TroopOrderFront@Self（R001）
      armor('allySelf', 1, 1),
      inflict('barrier', 'allyOthers'),
      reposition('allySelf', 'front'),
    ),
  },
  {
    id: 7308,
    desc: '对 1 名敌人造成 [魔法 + 5] 点伤害，移除所有该军队法力颜色的宝石来强化此效果。 [2:1]',
    build: skill(
      destroyColor(CASTER),
      dmg('enemyChosen', 5, 1, { modifier: { mod: { kind: 'ratio', a: 2, b: 1 } } }),
    ),
  },
  {
    id: 7309,
    desc: '召唤一名随机恶魔',
    build: skill(
      summonRandom(['AncientHorror', 'SpiderQueen', 'Abhorath', 'Webspinner', 'Moloch', 'TheSilentOne', 'Gorgotha', 'Kerberos', 'Cthyryzyx', 'Terraxis', 'Psion', 'Abynissia', 'Quasit', 'Hellhound', 'Succubus', 'HeraldOfChaos', 'InfernalKing', 'Venbarak', 'War', 'Plague', 'Famine', 'Death', 'Marilith', 'Hellcat', 'Creeper', 'KruargTheDread', 'Desdaemona', 'Warg', 'Incubus', 'DarkMonolith', 'Myzmer', 'Elemaugrim', 'CorruptedUrska', 'BoneDaemon', 'Hellspawn', 'Spinnerette', 'Doomclaw', 'YaoGuai', 'Erinyes', 'Tzathoth', 'Gargantaur', 'TomeOfEvil', 'Hellcackle', 'Glaycion', 'Nightmare', 'SirMordayne', 'Umbraxis', 'ThePossessedKing', 'Sloth', 'Envy', 'Greed', 'Gluttony', 'Barghast', 'Pride', 'Wrath', 'Lust', 'SibylOfLust', 'SoldierOfWrath', 'WallOfTentacles', 'Bael', 'VashDagon', 'QueenOfSin', 'Glutmaw', 'Obsidius', 'Lamashtu', 'PossessedUrska', 'BrokerOfGreed', 'EnvoyOfPride', 'MotherOfDarkness', 'GateOfSouls', 'Lucifria', 'Blightwing', 'Deminaga', 'TheInfernalMachine', 'Ironjaw', 'Tartarus', 'Netherhound', 'EldritchGuardian', 'FellDragonEgg', 'FellDragon', 'Nocturnia', 'HeraldOfWoe', 'IndolatorOfSloth', 'ShadeOfKurandara', 'Kurandara', 'EnragedKurandara', 'DaemonGnome', 'Mambasira', 'Arcturion', 'HeraldOfDamnation', 'Baphomet', 'TheScourgeOfHonor', 'DeepGolem', 'NyarMel', 'HoundOfYaoGuai', 'MaidOfEnvy', 'TheArchduke', 'Lemure', 'Fury', 'Charonas', 'JudgeOfTheDead', 'HellclawHunter', 'HellclawMage', 'HellclawWarrior', 'Indrajit', 'HelgorTheGuardian', 'FlamingOni', 'Oneiros', 'RedAhriman', 'AbjectOfDespond', 'Despond', 'BileBlackheart', 'AnimusOfEnvy', 'HornedHag', 'ConsortOfDarkness', 'EldritchMinion', 'Uvhash-Ka', 'WarMachine', 'HellclawRager', 'HeraldOfBlight', 'HellstoneGate', 'HeraldOfTorpor', 'Czernobog', 'Nabassu', 'Xenith', 'Tourmaline', 'Chalcedony', 'Petrahulk', 'StoneMefyt', 'TheElderDragon', 'VrawkDaemon', 'EldritchDisciple', 'Voidcaller', 'TheBaneOfMercy', 'EyeOfArges', 'InfernalVoyager', 'TheIronMaiden', 'TriTerror', 'DaemonChild', 'TheVoidDragon', 'Tempurath', 'DaemonicSentinel', 'Hellborer', 'DarkHerald', 'Groevanga', 'FellHydra', 'Isban', 'Goethite', 'SuccubusQueen', 'Bieska', 'HoundmasterGor', 'BlightHound', 'Astaroth', 'DaeDrak', 'MelekTauss', 'DoomedGuardian', 'StingBat', 'TheBaneOfValor', 'Redreaver', 'LionOfYaoGuai', 'Discordia', 'ImmortalAbaddon', 'BlightedHusk', 'BaneOfAmbition', 'HellclawShadowpriest', 'Polymetis', 'DagoNath', 'FelineOfEnvy', 'Skarn', 'MaidenOfPain', 'HeraldOfWar', 'Azbeel', 'OkraNosTheSleeper', 'Voidjaw', 'ChampionOfRot', 'BloodSpore', 'InfernalTrickster', 'Seditius', 'ImmortalZephaar'], undefined),
    ),
  },
  {
    id: 7317,
    desc: '使最强和最弱的敌人陷入死亡标记状态，并对所有敌人造成 [魔法 + 1] 点伤害。',
    // 原生序：Damage@AllEnemies → Delay → DeathMark@Weakest → DeathMark@Strongest（R001）
    build: skill(
      dmg('enemyAll', 1, 1, { range: 'all' }),
      inflict('death-mark', 'enemyWeakest'),
      inflict('death-mark', 'enemyHealthiest'),
    ),
  },
  {
    id: 7318,
    desc: '净化所有盟友并给予其 [魔法] 点生命值。',
    build: skill(
      // Native 7318: Cleanse@AllAllies → IncreaseHealth@AllAllies [Magic] (was self only).
      cleanse('allyAll'),
      heal('allyAll', 0, 1),
    ),
  },
  {
    id: 7338,
    desc: '科学地使随机敌人陷入燃烧、冻结和沉默状态，并造成 [魔法 + 3] 点伤害。',
    // Native 7338: RandomEnemy Burn → RandomPrefNotPrevEnemy Freeze → …Silence → …Damage M+3 (L5-006).
    build: skill(
      inflict('burning', 'enemyRandom'),
      inflict('frozen', 'enemyRandomPrefNotPrev'),
      inflict('silence', 'enemyRandomPrefNotPrev'),
      dmg('enemyRandomPrefNotPrev', 3, 1),
    ),
  },
  {
    id: 7380,
    desc: '对 1 名敌人造成 [魔法 + 6] 点伤害并使之陷入中毒状态。有 10% 的机率直接杀死敌人，如果敌人已中毒，机率将增加至 20%。 [x10]',
    build: skill(
      dmg('enemyChosen', 6, 1),
      inflict('poison', 'lastTarget'),
      // Native 7380: CountSpecificStatusEffect@FromTarget poison (step 0, before this cast's Poison) -> Lethal 10 (+10 if it was
      // already Poisoned). Was +10 per Poisoned enemy counted after the new Poison (always >= 20%).
      dmg('lastTarget', 0, 0, { execute: true, chance: 0.1, ifCond: { kind: 'not', cond: { kind: 'lastTargetStatusAtCastStart', statusId: 'poison' } } }),
      dmg('lastTarget', 0, 0, { execute: true, chance: 0.2, ifCond: { kind: 'lastTargetStatusAtCastStart', statusId: 'poison' } }),
    ),
  },
  {
    id: 7410,
    desc: '对 1 名敌人造成 [魔法 + 4] 点伤害，耗尽其法力值并使其陷入织网状态。如果敌人已陷入织网状态，则获得一个额外回合。',
    build: skill(
      dmg('enemyChosen', 4, 1),
      drainMana('lastTarget'),
      // sa-R7: native CountSpecificStatusEffect web@FromTarget (step 0) -> ... -> ExtraTurnConditional -> CauseWeb:
      // "already Webbed" = the target itself, judged before this spell's Web (was any enemy, after the Web = always).
      extraTurn({ ifCond: { kind: 'lastTargetStatus', statusId: 'web' } }),
      inflict('web', 'lastTarget'),
    ),
  },
  {
    id: 7412,
    desc: '对 1 名敌人施放法力灼烧，伤害值因自身魔力值而增强。燃烧敌人，如果敌人身亡，则转化成一只随机龙族。',
    build: ({"segments":[{"kind":"damage","target":"enemyChosen","scaling":{"base":0,"mult":1},"manaBurn":true},{"kind":"status","target":"lastTarget","statusId":"burning","turns":3,"magnitude":3},{"kind":"transformTroop","target":"allySelf","randomOf":["Sheggra","Venoxia","ShadowDragon","Emperina","Celestasia","BoneDragon","DrakeRider","Dimetraxia","Wyvern","Venbarak","Borealis","DragonEggs","BabyDragon","Dragonette","Dragotaur","Dragonmoth","Visk","TheDragonSoul","Couatl","Sylvanimora","DRACOS-1337","DragonianRogue","DragonianMonk","SilverDrakon","Krystenax","Drake","Elemaugrim","DragonTurtle","Asha","Leviathan","Penglong","Glitterclaw","TheWorldbreaker","Divinia","LordEmber","LadyGarnetia","Tinseltail","Shimmerscale","Volthrenax","Thaumaris","Droggo","Sylfrostenath","MatronDragotani","UndeadDrake","FellDragonEgg","FellDragon","Nocturnia","Ishtara","DragonianSage","Obregonia","DragonSpirit","Essencia","Huanglong","Veneratus","HornedWyrm","NetherWyrm","TerraWyrm","TheGreatWyrm","Tihamata","RedAhriman","TwinkleBerry","MagmaDragon","Sabellius","Adakite","Obsidiaxas","Sapphirax","Emeraldrin","Rubirath","Topasarth","Amethialas","Garnetaerlin","Diamantina","Aquaria","TheElderDragon","HeraldOfKrystenax","TheGuardianDragon","CobaltDrake","HuntmasterArborius","CrystalEggs","DragonstoneGuardian","TheVoidDragon","Comethalas","Nebuladryx","Meteoridan","Solarithus","Lunarelleon","Eklipsos","Stellarix","DraconicSentinel","Tianlong","BrassDrake","Venerabilax","Chromaticea","Kukulkan","ImmortalAquaria","Leucithrax","TheSlimeDragon","Bahamata","Gingeraxia","Belcerulea","Gladius","Thornaressa","Narcithus","Orrissea","Orchidius","Chrysantherax","Chargrimax","Crackleleaf","Mistmother","DrakeEggs","ImmortalDrakkon","CrimsonWyrmling","Dragonhawk","Amethony","Creteus","Krakynos","Runethius","Hematrax","Vizinium","Demizerius","Amenhotrex","Pandemonia"],"ifTargetDied":true}]} as SkillPrototype),
  },
  {
    id: 7414,
    desc: '一名盟友的一项随机属性获得 [魔法 + 1] 点，然后赋予其屏障效果并给予 3 - 15 点法力值。',
    build: ({"segments":[{"kind":"randomStat","target":"allyChosen","scaling":{"base":1,"mult":1},"oneSkill":true},{"kind":"status","target":"allyChosen","statusId":"barrier","turns":3},{"kind":"buff","target":"allyChosen","stat":"mana","scaling":{"base":0,"mult":0},"rangeSpec":{"min":{"base":3,"mult":0},"max":{"base":15,"mult":0}}}]} as SkillPrototype),
  },
  {
    id: 7444,
    desc: '使一名敌人陷入死亡标记状态。对其下方的所有敌人造成 [魔法 + 1] 点真实伤害，伤害值因陷入死亡标记的敌军数量而增强。 [x3]',
    build: skill(
      inflict('death-mark', 'enemyChosen'),
      // Native step 2 Target:BelowTarget = enemies below the chosen one, chosen excluded (L5-010).
      trueDmg('enemyBelowTarget', 1, 1, { trueDamage: true, modifier: { mod: { kind: 'multiplier', a: 3 }, source: { kind: 'enemyStatusCount', statusId: 'death-mark' } } }),
    ),
  },
  {
    id: 7445,
    desc: '对一名敌人造成 [魔法 + 5] 点溅射伤害。伤害值因敌我双方的巨人军队数而增强。 [x6]',
    build: skill(
      dmgSplash('enemyChosen', 5, 1, { range: 'splash', modifier: { mod: { kind: 'multiplier', a: 6 }, sources: [{ kind: 'alliesOfRace', race: 'Giant' }, { kind: 'enemiesOfRace', race: 'Giant' }] } }),
    ),
  },
  {
    id: 7446,
    desc: '获得 [魔法 + 4] 点生命值。净化和赋予所有其他的盟友法印效果。',
    build: skill(
      heal('allySelf', 4, 1),
      cleanse('allyAll'),
      inflict('enchanted', 'allyAll'),
    ),
  },
  {
    id: 7447,
    desc: '对 1 名敌人造成 [魔法 + 1] 点伤害。随机摧毁 5 颗宝石，摧毁数因收集到的黄金数量而增强。 [4:1]',
    build: skill(
      dmg('enemyChosen', 1, 1),
      destroyRandomGems(5, 0, 'color', undefined, { modifier: { mod: { kind: 'ratio', a: 4, b: 1 }, source: { kind: 'battleGold' } } }),
    ),
  },
  {
    id: 7491,
    desc: '获得 [魔法 + 1] 点生命值。创造 5 颗绿色宝石，宝石数因拥有法印效果的盟友数而增强。 [x3]',
    build: skill(
      heal('allySelf', 1, 1),
      createGems(BaseColor.Green, 5, 0, { modifier: { mod: { kind: 'multiplier', a: 3 }, source: { kind: 'allyStatusCount', statusId: 'enchanted' } } }),
    ),
  },
  {
    id: 7492,
    desc: '给予所有黄色盟友 5 点攻击力。对所有紫色敌人造成 [魔法 + 4] 点伤害。然后召唤一个随机风暴。',
    build: ({"segments":[{"kind":"buff","target":"allyAll","stat":"attack","scaling":{"base":5,"mult":0},"ifCond":{"kind":"targetColor","color":"Yellow"}},{"kind":"damage","target":"enemyAll","scaling":{"base":4,"mult":1},"range":"all","ifCond":{"kind":"targetColor","color":"Purple"}},{"kind":"oneOf","options":[[{"kind":"storm","color":"Red","turns":8}],[{"kind":"storm","color":"Green","turns":8}],[{"kind":"storm","color":"Blue","turns":8}],[{"kind":"storm","color":"Yellow","turns":8}],[{"kind":"storm","color":"Purple","turns":8}],[{"kind":"storm","color":"Brown","turns":8}]]}]} as SkillPrototype),
  },
  {
    id: 7527,
    desc: '对一名敌人造成 [魔法 + 8] 点溅射伤害。赋予第一名盟友狂怒状态。',
    build: skill(
      dmgSplash('enemyChosen', 8, 1, { range: 'splash' }),
      inflict('rage', 'allyFront'),
    ),
  },
  {
    id: 7529,
    desc: '创造 8 颗红色宝石和 8 颗黄色宝石，再召唤一颗龙蛋或恶龙蛋。',
    build: skill(
      // sa-R5 L1-1154: native Randomize ABC-DEF: (CreateGems Red 8, Yellow 8, summon 6230 Dragon Eggs) or
      // (Red 8, Yellow 8, summon 6892 Fell Dragon Egg); plain Red/Yellow gems (was 8 Red Dragon Gems, no summon).
      oneOf(
        [createGems(BaseColor.Red, 8, 0), createGems(BaseColor.Yellow, 8, 0), summonRef('DragonEggs')],
        [createGems(BaseColor.Red, 8, 0), createGems(BaseColor.Yellow, 8, 0), summonRef('FellDragonEgg')],
      ),
    ),
  },
  {
    id: 7531,
    desc: '创造 9 颗红色宝石。召唤一名随机的厄什卡军队。',
    build: skill(
      createGems(BaseColor.Red, 9, 0),
      summonRandom(['Barbearius', 'UrskaWanderer', 'Urskatyr', 'CorruptedUrska', 'KingMikhail', 'UrskaSavage', 'Doomclaw', 'XiongMao', 'PandaskaGuard', 'CrimsonArrow', 'UrskaDragoon', 'Urskula', 'UrskaDruid', 'Berengari', 'PossessedUrska', 'BlackBjörn', 'Defiance', 'Lyrasza', 'PandaskaMage', 'PrinceBarislav', 'Ursuvius', 'SpiritOfRage', 'IronVlasta', 'Ursky', 'Pandazerker', 'Theodorevich', 'Pandallista', 'ShejiShi', 'Bearlock', 'Bieska', 'Emberclaw', 'SkeletalUrska', 'IvarLongclaw', 'VelesStormborn', 'PossessedTeddy', 'PoisonedUrsidae', 'RangerEvgeniy'], undefined),
    ),
  },
  {
    id: 7563,
    desc: '对一名敌人造成 [魔法 + 4] 点溅射伤害，伤害值因下潜的盟友数而增强。 [x7]',
    build: skill(
      // Native 7563: Damage@FromTarget + Damage@AdjacentFromTarget, both the full [Magic + 4] x7 (was 50% splash to neighbours).
      dmg('enemyChosen', 4, 1, { modifier: { mod: { kind: 'multiplier', a: 7 }, source: { kind: 'allyStatusCount', statusId: 'submerged' } } }),
      dmg('enemyChosenAndAdjacent', 4, 1, { modifier: { mod: { kind: 'multiplier', a: 7 }, source: { kind: 'allyStatusCount', statusId: 'submerged' } } }),
    ),
  },
  {
    id: 7567,
    desc: '摧毁 [(魔法 / 2) + 1] 颗宝石。对最后一名敌人转化成一只为法力值满额的幼龙。',
    build: skill(destroyRandomGems(1, 0.5, 'color'), transformTroop('enemyLast', 'BabyDragon', { fullMana: true })),
  },
  {
    id: 7568,
    desc: '对一名敌人造成 [魔法 + 4] 点溅射伤害。敌我双方每有一名棕色军队则爆破一颗随机宝石。 [1:1]',
    build: skill(
      dmgSplash('enemyChosen', 4, 1, { range: 'splash' }),
      // native ExplodeGems (any random gem, no base) x (Brown allies + Brown enemies)
      explodeRandomGems(0, 0, 'all', undefined, { modifier: { mod: { kind: 'ratio', a: 1, b: 1 }, sources: [{ kind: 'alliesOfColor', color: BaseColor.Brown, atCastStart: true }, { kind: 'enemiesOfColor', color: BaseColor.Brown, atCastStart: true }] } }),
    ),
  },
  {
    id: 7577,
    desc: '对两名最强大的敌人造成 [魔法 + 1] 点伤害，并移除所有紫色宝石以增强效果。若任何一名敌人是恶魔军队，则造成双倍伤害。 [4:1]',
    build: skill(
      // sa-F2 fix round A (R001): native CountGems 25 Purple ; Damage@TwoStrongestEnemies ; RemoveColor Purple.
      // The boost had no source (Purple gems never counted).
      dmg('enemyHealthiestN', 1, 1, { n: 2, condMult: { times: 2, cond: { kind: 'enemyRacePresent', race: 'Daemon' } }, modifier: { mod: { kind: 'ratio', a: 4, b: 1 }, source: { kind: 'boardGems', color: BaseColor.Purple } } }),
      destroyColor(BaseColor.Purple),
    ),
  },
  {
    id: 7578,
    desc: '对 1 名敌人造成 [魔法 + 4] 点伤害。如果现有冰风暴则伤害双倍。创造冰风暴。',
    build: skill(
      dmg('enemyChosen', 4, 1, { condMult: { times: 2, cond: { kind: 'stormPresent', color: BaseColor.Blue } } }),
      createStorm(BaseColor.Blue),
    ),
  },
  {
    id: 7579,
    desc: '对 1 名敌人造成 [魔法 + 4] 点伤害。如果现有叶风暴则伤害双倍。创造叶风暴。',
    build: skill(
      dmg('enemyChosen', 4, 1, { condMult: { times: 2, cond: { kind: 'stormPresent', color: BaseColor.Green } } }),
      createStorm(BaseColor.Green),
    ),
  },
  {
    id: 7580,
    desc: '对 1 名敌人造成 [魔法 + 4] 点伤害。如果现有火风暴则伤害双倍。创造火风暴。',
    build: skill(
      dmg('enemyChosen', 4, 1, { condMult: { times: 2, cond: { kind: 'stormPresent', color: BaseColor.Red } } }),
      createStorm(BaseColor.Red),
    ),
  },
  {
    id: 7581,
    desc: '对 1 名敌人造成 [魔法 + 4] 点伤害。如果现有光风暴则伤害双倍。创造光风暴。',
    build: skill(
      dmg('enemyChosen', 4, 1, { condMult: { times: 2, cond: { kind: 'stormPresent', color: BaseColor.Yellow } } }),
      createStorm(BaseColor.Yellow),
    ),
  },
  {
    id: 7582,
    desc: '对 1 名敌人造成 [魔法 + 4] 点伤害。如果现有暗风暴则伤害双倍。创造暗风暴。',
    build: skill(
      dmg('enemyChosen', 4, 1, { condMult: { times: 2, cond: { kind: 'stormPresent', color: BaseColor.Purple } } }),
      createStorm(BaseColor.Purple),
    ),
  },
  {
    id: 7583,
    desc: '对 1 名敌人造成 [魔法 + 4] 点伤害。如果现有尘风暴则伤害双倍。创造尘风暴。',
    build: skill(
      dmg('enemyChosen', 4, 1, { condMult: { times: 2, cond: { kind: 'stormPresent', color: BaseColor.Brown } } }),
      createStorm(BaseColor.Brown),
    ),
  },
  {
    id: 7585,
    desc: '对一名随机敌人造成 [魔法 + 5] 点伤害。',
    build: skill(dmg('enemyRandom', 5, 1)),
  },
  {
    id: 7586,
    desc: '创造选定的 7 颗宝石。随机使一名盟友下潜，并给予他 1 点魔力值。',
    build: ({"segments":[{"kind":"gem","params":{"op":"create","gem":{"kind":"color","color":"CHOSEN"},"count":{"base":7,"mult":0}}},{"kind":"status","target":"allyRandom","statusId":"submerged","turns":3},{"kind":"buff","target":"allySelf","stat":"magic","scaling":{"base":1,"mult":0}}]} as SkillPrototype),
  },
  {
    id: 7587,
    desc: '对第一名敌人造成 [魔法 + 4] 点伤害。如果敌人使用红色法力值，则造成三倍伤害。',
    build: skill(
      dmg('enemyFront', 4, 1, { condMult: { times: 3, cond: { kind: 'targetColor', color: BaseColor.Red } } }),
    ),
  },
  {
    id: 7588,
    desc: '对第一名敌人造成 [魔法 + 4] 点伤害。如果敌人使用棕色法力值，则造成三倍伤害。',
    build: skill(
      dmg('enemyFront', 4, 1, { condMult: { times: 3, cond: { kind: 'targetColor', color: BaseColor.Brown } } }),
    ),
  },
  {
    id: 7589,
    desc: '对第一名敌人造成 [魔法 + 4] 点伤害。如果敌人使用绿色法力值，则造成三倍伤害。',
    build: skill(
      dmg('enemyFront', 4, 1, { condMult: { times: 3, cond: { kind: 'targetColor', color: BaseColor.Green } } }),
    ),
  },
  {
    id: 7590,
    desc: '对第一名敌人造成 [魔法 + 4] 点伤害。如果敌人使用紫色法力值，则造成三倍伤害。',
    build: skill(
      dmg('enemyFront', 4, 1, { condMult: { times: 3, cond: { kind: 'targetColor', color: BaseColor.Purple } } }),
    ),
  },
  {
    id: 7591,
    desc: '对第一名敌人造成 [魔法 + 4] 点伤害。如果敌人使用黄色法力值，则造成三倍伤害。',
    build: skill(
      dmg('enemyFront', 4, 1, { condMult: { times: 3, cond: { kind: 'targetColor', color: BaseColor.Yellow } } }),
    ),
  },
  {
    id: 7592,
    desc: '对第一名敌人造成 [魔法 + 4] 点伤害。如果敌人使用蓝色法力值，则造成三倍伤害。',
    build: skill(
      dmg('enemyFront', 4, 1, { condMult: { times: 3, cond: { kind: 'targetColor', color: BaseColor.Blue } } }),
    ),
  },
  {
    id: 7601,
    desc: '移除所有蓝色宝石。净化所有其他盟友，再给予他们 [魔法 + 1] 点生命值，数值因移除的宝石数而增强。 [3:1]',
    // native: CountGems Blue 34 (board, step 0), Cleanse + IncreaseHealth @AllAlliesButNotSelf, RemoveColor Blue last (sa-R1)
    build: skill(
      cleanse('allyOthers'),
      heal('allyOthers', 1, 1, { modifier: { mod: { kind: 'ratio', a: 3, b: 1 }, source: { kind: 'boardGems', color: BaseColor.Blue } } }),
      destroyColor(BaseColor.Blue),
    ),
  },
  {
    id: 7624,
    desc: '给一名盟友 [魔法 + 2] 点生命值和一半的法力值。将其净化，并赋予其屏障和法印效果。 [2:1]',
    // sa-F1 (R001): native Cleanse → GenerateMana (half mana cost) → IncreaseHealth [Magic + 2] → Barrier → Enchant
    // (cleansing first matters: a Silenced / Frozen ally is cleared before the mana).
    build: skill(
      cleanse('allyChosen'),
      mana('allyChosen', 0, 0, { halve: true, modifier: { mod: { kind: 'ratio', a: 2, b: 1 } } }),
      heal('allyChosen', 2, 1),
      inflict('barrier', 'allyChosen'),
      inflict('enchanted', 'allyChosen'),
    ),
  },
  {
    id: 7625,
    desc: '对所有敌人造成 [(魔法 / 2) + 4] 点伤害。使所有神祇军队陷入死亡标记状态和所有骑士陷入疾病状态。',
    build: skill(
      dmg('enemyAll', 4, 0.5, { range: 'all' }),
      inflict('death-mark', 'enemyAll', { targetRace: 'Divine' }),
      inflict('disease', 'enemyAll', { targetRace: 'Divine' }),
    ),
  },
  {
    id: 7626,
    desc: '对 1 名敌人造成 [魔法 + 1] 点伤害。伤害值因所收集的灵魂数而增强。窃取其法力值。 [3:1]',
    // sa-F1 (R001): native s1 StealMana 100 runs before s2 Damage.
    build: skill(
      steal('enemyChosen', 'mana', 'mana', 0, 0, { drainAll: true }),
      dmg('enemyChosen', 1, 1, { modifier: { mod: { kind: 'ratio', a: 3, b: 1 }, source: { kind: 'battleSouls' } } }),
    ),
  },
  {
    id: 7653,
    desc: '对所有敌人造成 [魔法 + 10] 点散射伤害。伤害值因陷入妖火状态的敌军数量而增强。 [x8]',
    build: skill(
      dmg('enemyAll', 10, 1, { range: 'all', modifier: { mod: { kind: 'multiplier', a: 8 }, source: { kind: 'enemyStatusCount', statusId: 'faerie-fire' } } }),
    ),
  },
  {
    id: 7654,
    desc: '创造 15 颗红色和绿色的宝石。赋予两名随机盟友法印效果。',
    build: skill(
      createMix([BaseColor.Red, BaseColor.Green], 15),
      inflict('enchanted', 'allyRandomPrefNotPrevN', { n: 2 }),
    ),
  },
  {
    id: 7655,
    desc: '造成 [魔法 + 10] 点散射伤害，每锻炼 1 个武器段位则 +4 点伤害值。每有一名蓝色敌人则创造 6 颗混合蓝色和骷髅头的宝石。给予所有盟友 3 点魔力值。如果敌方有劫数，则再增加 5 点。 [x6]',
    build: ({"segments":[{"kind":"damage","target":"enemyAll","scaling":{"base":10,"mult":1},"range":"scatter","modifier":{"mod":{"kind":"multiplier","a":4},"source":{"kind":"tempering"}}},{"kind":"gem","params":{"op":"create","gem":{"kind":"mixAny","entries":["Blue","SKULL"]},"count":{"base":0,"mult":0},"modifier":{"mod":{"kind":"multiplier","a":6},"source":{"kind":"enemiesOfColor","color":"Blue","atCastStart":true}}},"modifier":{"mod":{"kind":"multiplier","a":6},"source":{"kind":"enemiesOfColor","color":"Blue","atCastStart":true}}},{"kind":"buff","target":"allyAll","stat":"magic","scaling":{"base":3,"mult":0},"condBonus":{"n":5,"cond":{"kind":"targetHasDoom"}}}]} as SkillPrototype),
  },
  {
    id: 7656,
    desc: '造成 [魔法 + 10] 点散射伤害，每锻炼 1 个武器段位则 +4 点伤害值。每有一名绿色敌人则创造 6 颗混合绿色和骷髅头的宝石。给予所有盟友 3 点魔力值。如果敌方有劫数，则再增加 5 点。 [x6]',
    build: ({"segments":[{"kind":"damage","target":"enemyAll","scaling":{"base":10,"mult":1},"range":"scatter","modifier":{"mod":{"kind":"multiplier","a":4},"source":{"kind":"tempering"}}},{"kind":"gem","params":{"op":"create","gem":{"kind":"mixAny","entries":["Green","SKULL"]},"count":{"base":0,"mult":0},"modifier":{"mod":{"kind":"multiplier","a":6},"source":{"kind":"enemiesOfColor","color":"Green","atCastStart":true}}},"modifier":{"mod":{"kind":"multiplier","a":6},"source":{"kind":"enemiesOfColor","color":"Green","atCastStart":true}}},{"kind":"buff","target":"allyAll","stat":"magic","scaling":{"base":3,"mult":0},"condBonus":{"n":5,"cond":{"kind":"targetHasDoom"}}}]} as SkillPrototype),
  },
  {
    id: 7657,
    desc: '造成 [魔法 + 10] 点散射伤害，每锻炼 1 个武器段位则 +4 点伤害值。每有一名红色敌人则创造 6 颗混合红色和骷髅头的宝石。给予所有盟友 3 点魔力值。如果敌方有劫数，则再增加 5 点。 [x6]',
    build: ({"segments":[{"kind":"damage","target":"enemyAll","scaling":{"base":10,"mult":1},"range":"scatter","modifier":{"mod":{"kind":"multiplier","a":4},"source":{"kind":"tempering"}}},{"kind":"gem","params":{"op":"create","gem":{"kind":"mixAny","entries":["Red","SKULL"]},"count":{"base":0,"mult":0},"modifier":{"mod":{"kind":"multiplier","a":6},"source":{"kind":"enemiesOfColor","color":"Red","atCastStart":true}}},"modifier":{"mod":{"kind":"multiplier","a":6},"source":{"kind":"enemiesOfColor","color":"Red","atCastStart":true}}},{"kind":"buff","target":"allyAll","stat":"magic","scaling":{"base":3,"mult":0},"condBonus":{"n":5,"cond":{"kind":"targetHasDoom"}}}]} as SkillPrototype),
  },
  {
    id: 7658,
    desc: '造成 [魔法 + 10] 点散射伤害，每锻炼 1 个武器段位则 +4 点伤害值。每有一名黄色敌人则创造 6 颗混合黄色和骷髅头的宝石。给予所有盟友 3 点魔力值。如果敌方有劫数，则再增加 5 点。 [x6]',
    build: ({"segments":[{"kind":"damage","target":"enemyAll","scaling":{"base":10,"mult":1},"range":"scatter","modifier":{"mod":{"kind":"multiplier","a":4},"source":{"kind":"tempering"}}},{"kind":"gem","params":{"op":"create","gem":{"kind":"mixAny","entries":["Yellow","SKULL"]},"count":{"base":0,"mult":0},"modifier":{"mod":{"kind":"multiplier","a":6},"source":{"kind":"enemiesOfColor","color":"Yellow","atCastStart":true}}},"modifier":{"mod":{"kind":"multiplier","a":6},"source":{"kind":"enemiesOfColor","color":"Yellow","atCastStart":true}}},{"kind":"buff","target":"allyAll","stat":"magic","scaling":{"base":3,"mult":0},"condBonus":{"n":5,"cond":{"kind":"targetHasDoom"}}}]} as SkillPrototype),
  },
  {
    id: 7659,
    desc: '造成 [魔法 + 10] 点散射伤害，每锻炼 1 个武器段位则 +4 点伤害值。每有一名紫色敌人则创造 6 颗混合紫色和骷髅头的宝石。给予所有盟友 3 点魔力值。如果敌方有劫数，则再增加 5 点。 [x6]',
    build: ({"segments":[{"kind":"damage","target":"enemyAll","scaling":{"base":10,"mult":1},"range":"scatter","modifier":{"mod":{"kind":"multiplier","a":4},"source":{"kind":"tempering"}}},{"kind":"gem","params":{"op":"create","gem":{"kind":"mixAny","entries":["Purple","SKULL"]},"count":{"base":0,"mult":0},"modifier":{"mod":{"kind":"multiplier","a":6},"source":{"kind":"enemiesOfColor","color":"Purple","atCastStart":true}}},"modifier":{"mod":{"kind":"multiplier","a":6},"source":{"kind":"enemiesOfColor","color":"Purple","atCastStart":true}}},{"kind":"buff","target":"allyAll","stat":"magic","scaling":{"base":3,"mult":0},"condBonus":{"n":5,"cond":{"kind":"targetHasDoom"}}}]} as SkillPrototype),
  },
  {
    id: 7660,
    desc: '造成 [魔法 + 10] 点散射伤害，每锻炼 1 个武器段位则 +4 点伤害值。每有一名棕色敌人则创造 6 颗混合棕色和骷髅头的宝石。给予所有盟友 3 点魔力值。如果敌方有劫数，则再增加 5 点。 [x6]',
    build: ({"segments":[{"kind":"damage","target":"enemyAll","scaling":{"base":10,"mult":1},"range":"scatter","modifier":{"mod":{"kind":"multiplier","a":4},"source":{"kind":"tempering"}}},{"kind":"gem","params":{"op":"create","gem":{"kind":"mixAny","entries":["Brown","SKULL"]},"count":{"base":0,"mult":0},"modifier":{"mod":{"kind":"multiplier","a":6},"source":{"kind":"enemiesOfColor","color":"Brown","atCastStart":true}}},"modifier":{"mod":{"kind":"multiplier","a":6},"source":{"kind":"enemiesOfColor","color":"Brown","atCastStart":true}}},{"kind":"buff","target":"allyAll","stat":"magic","scaling":{"base":3,"mult":0},"condBonus":{"n":5,"cond":{"kind":"targetHasDoom"}}}]} as SkillPrototype),
  },
];

export const BATCH_W01: CuratedBatch = { batch: 'W01', spells: SPELLS, skipped: SKIPPED };
