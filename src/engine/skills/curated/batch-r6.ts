/**
 * 放弃桶回收批 R6（2026-09-17 用户裁定「做这些东西」）：长尾三类清尾。
 * 新裁定见 spell-rules §13：casterStatBeatsTarget（属性比较 vs 跨段追踪目标）、
 * anyEnemyColor（聚合存在判定超集口径）、'&&' 为合法子句切分符（本就如此，按段顺序组装）。
 */
import { chooseSkill, skill, dmg, dmgSplash, trueDmg, heal, armor, magic, mana, inflict, steal,
  createGems, createSpecialGems, summonRef, extraTurn,
  scale } from '../builders';
import { BaseColor } from '../../types';
import type { CuratedBatch } from './index';


const SKIPPED: { id: number; reason: string }[] = [];

const SPELLS: CuratedBatch['spells'] = [
  {
    id: 8857,
    desc: '&& 给予所有盟友 [魔法 + 1] 点生命值 && 给予所有其他盟友半数法力值',
    build: skill(chooseSkill(['给予所有盟友［魔法＋1］生命', '给予其他盟友半数法力'], [heal('allyAll', 1, 1)], [mana('allyOthers', 0, 0, { halve: true })])),
  },
  {
    id: 8860,
    desc: '&& 给予所有盟友 3 点魔力值 && 造成 [魔法 + 6] 点散射伤害',
    // 修正（2026-09-18 官方复核）：「魔力值」= magic（官方 IncreaseSpellPower@AllAllies），非 mana；
    // 裸散射重裁：官方 ScatterDamage@AllEnemies = 全体散射
    build: skill(chooseSkill(["给予所有盟友3点魔法","造成［魔法＋6］点散射伤害"], [magic('allyAll', 3, 0)], [dmg('enemyAll', 6, 1, { range: 'all' })])),
  },
  {
    id: 8862,
    desc: '&& 对一名敌人造成 [魔法 + 4] 点真实伤害，伤害值因蓝色宝石数而增强 && 对一名敌人造成 [魔法 + 4] 点溅射伤害，伤害值因蓝色宝石数而增强 [x2]',
    build: skill(chooseSkill(["对一名敌人造成［魔法＋4］真实伤害，蓝色宝石每颗增加2点","对一名敌人造成［魔法＋4］溅射伤害，蓝色宝石每颗增加2点"], [trueDmg('enemyChosen', 4, 1, { modifier: { mod: { kind: 'multiplier', a: 2 }, source: { kind: 'boardGems', color: BaseColor.Blue } } })], [dmgSplash('enemyChosen', 4, 1, { modifier: { mod: { kind: 'multiplier', a: 2 }, source: { kind: 'boardGems', color: BaseColor.Blue } } })])),
  },
  {
    id: 8863,
    desc: '&& 随所有敌人造成 [魔法 + 5] 点真实伤害 && 召唤 1-3 名狐族猎人',
    build: skill(chooseSkill(["对所有敌人造成［魔法＋5］真实伤害","召唤1–3名狐族猎人"], [trueDmg('enemyAll', 5, 1, { range: 'all' })], [summonRef('VulpphireHunter', 7288), summonRef('VulpphireHunter', 7288, { chance: 0.5 }), summonRef('VulpphireHunter', 7288, { chance: 0.5 })])),
  },
  {
    id: 8866,
    desc: '&& 对一名敌人造成 [魔法 + 3] 点伤害，伤害只因其敌人攻击力而增强 && 对一名敌人造成 [魔法 + 3] 点伤害，伤害值因敌人护甲值而增强 [3:1]',
    build: skill(chooseSkill(["对一名敌人造成［魔法＋3］伤害，每3攻击增强1点","对一名敌人造成［魔法＋3］伤害，每3护甲增强1点"], [dmg('enemyChosen', 3, 1, { modifier: { mod: { kind: 'ratio', a: 3, b: 1 }, source: { kind: 'targetStat', stat: 'attack' } } })], [dmg('enemyChosen', 3, 1, { modifier: { mod: { kind: 'ratio', a: 3, b: 1 }, source: { kind: 'targetStat', stat: 'armor' } } })])),
  },
  {
    id: 8868,
    desc: '&& 创造 3 颗冻结宝石，并获得一个额外回合 &&窃取一名随机敌人 [魔法 + 1] 点护甲值',
    build: skill(chooseSkill(["创造3颗冻结宝石并获得额外回合","窃取一名随机敌人［魔法＋1］护甲"], [createSpecialGems({ kind: 'freezeGem' }, 3), extraTurn()], [steal('enemyRandom', 'armor', 'armor', 1, 1)])),
  },
  {
    id: 7458,
    desc: '对 1 名敌人造成 [魔法 + 6] 点伤害。若自身护甲值较高，则造成三倍伤害。获得 5 点护甲值。',
    build: skill(
      dmg('enemyChosen', 6, 1, { condMult: { times: 3, cond: { kind: 'casterStatBeatsTarget', stat: 'armor' } } }),
      armor('allySelf', 5, 0),
    ),
  },
  {
    id: 7471,
    desc: '对第一名敌人造成 [魔法 + 1] 点伤害并将其冻结。如果敌人的魔力值高于自身，则创造 8 颗蓝色宝石。',
    build: skill(
      dmg('enemyFront', 1),
      inflict('frozen', 'enemyFront'),
      createGems(BaseColor.Blue, 8, 0, { ifCond: { kind: 'casterStatBeatsTarget', stat: 'magic' } }),
    ),
  },
  {
    id: 7511,
    desc: '对 1 名敌人造成 [(魔法 / 2) + 6] – [魔法 + 13] 到 {2} 点伤害。如果自身攻击力较高，则创造 8 颗红色宝石。',
    build: skill(
      dmg('enemyFront', 0, 0, { rangeSpec: { min: scale(6, 0.5), max: scale(13, 1) }, split: 2 }),
      createGems(BaseColor.Red, 8, 0, { ifCond: { kind: 'casterStatBeatsTarget', stat: 'attack' } }),
    ),
  },
  {
    id: 7985,
    desc: '对一名敌人造成 [魔法 + 15] 点严重的溅射伤害，并击晕所有受到伤害的敌人。若自身攻击力较高，则造成双倍伤害。召唤 1-3 个美猴王。',
    build: skill(
      dmgSplash('enemyChosen', 15),
      inflict('stun', 'enemyAll', { ifCond: { kind: 'targetHpDamaged' } }),
      summonRef('MonkeyDisciple', undefined, { countRange: { min: 1, max: 3 } }),
    ),
  },
  {
    id: 8418,
    desc: '对首位和末位敌人造成 [魔法 + 2] 点伤害。若其中一个使用蓝色法力值，则造成双倍伤害。若其中一个使用紫色法力值，则赋予自身屏障效果。',
    // 修正（2026-09-18 官方复核）：官方 Damage@FirstLastEnemies 带条件倍率——补漏
    // 「若其中一个使用蓝色法力值，则双倍伤害」（anyEnemyColor Blue ×2 辖两段伤害，§13.3 超集口径）
    build: skill(
      // native Damage@FirstLastEnemies MultiplyForBlueTarget: each of the two targets doubled on its own Blue mana
      // (sa-C r4). Barrier (CountArmyColor@FirstLastEnemies Purple before the damage) still reads any enemy:
      // primitive queued as P-C-firstlast-army-color.
      dmg('enemyFront', 2, 1, { condMult: { times: 2, cond: { kind: 'targetColor', color: BaseColor.Blue } } }),
      dmg('enemyLast', 2, 1, { condMult: { times: 2, cond: { kind: 'targetColor', color: BaseColor.Blue } } }),
      inflict('barrier', 'allySelf', { ifCond: { kind: 'anyEnemyColor', color: BaseColor.Purple } }),
    ),
  },
];

export const BATCH_R6: CuratedBatch = { batch: 'R6', spells: SPELLS, skipped: SKIPPED };
