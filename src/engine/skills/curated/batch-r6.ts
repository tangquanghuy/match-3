/**
 * 放弃桶回收批 R6（2026-09-17 用户裁定「做这些东西」）：长尾三类清尾。
 * 新裁定见 spell-rules §13：casterStatBeatsTarget（属性比较 vs 跨段追踪目标）、
 * anyEnemyColor（聚合存在判定超集口径）、'&&' 为合法子句切分符（本就如此，按段顺序组装）。
 */
import { skill, dmg, dmgSplash, trueDmg, heal, armor, mana, inflict, steal,
  createGems, createSpecialGems, summonRef, summonRandom, extraTurn,
  scale } from '../builders';
import { BaseColor } from '../../types';
import type { CuratedBatch } from './index';

// 狐族引用池（生成器从 troops.json 内联）
const FOX_REFS = ["SpiritFox","ArcticFox","VulpineMage","Kitsune","RedFox","FennecThief","FennecMage","VulpphireHunter","VulpineChampion","VulpineWatcher","PhantomFox","ShadowFox","TheFoxfireKing","Foxglove"];

const SKIPPED: { id: number; reason: string }[] = [];

const SPELLS: CuratedBatch['spells'] = [
  {
    id: 8857,
    desc: '&& 给予所有盟友 [魔法 + 1] 点生命值 && 给予所有其他盟友半数法力值',
    build: skill(
      heal('allyAll', 1, 1),
      mana('allyOthers', 0, 0, { halve: true }),
    ),
  },
  {
    id: 8860,
    desc: '&& 给予所有盟友 3 点魔法值 && 造成 [魔法 + 6] 点散射伤害',
    build: skill(
      mana('allyAll', 3, 0),
      dmgSplash('enemyChosen', 6),
    ),
  },
  {
    id: 8862,
    desc: '&& 对一名敌人造成 [魔法 + 4] 点真实伤害，伤害值因蓝色宝石数而增强 && 对一名敌人造成 [魔法 + 4] 点溅射伤害，伤害值因蓝色宝石数而增强 [x2]',
    build: skill(
      trueDmg('enemyChosen', 4, 1, { modifier: { mod: { kind: 'multiplier', a: 2 }, source: { kind: 'boardGems', color: BaseColor.Blue } } }),
      dmgSplash('enemyChosen', 4, 1, { modifier: { mod: { kind: 'multiplier', a: 2 }, source: { kind: 'boardGems', color: BaseColor.Blue } } }),
    ),
  },
  {
    id: 8863,
    desc: '&& 随所有敌人造成 [魔法 + 5] 点真实伤害 && 召唤 1-3 名狐族猎人',
    build: skill(
      trueDmg('enemyAll', 5, 1, { range: 'all' }),
      summonRandom(FOX_REFS, undefined, { countRange: { min: 1, max: 3 } }),
    ),
  },
  {
    id: 8866,
    desc: '&& 对一名敌人造成 [魔法 + 3] 点伤害，伤害只因其敌人攻击力而增强 && 对一名敌人造成 [魔法 + 3] 点伤害，伤害值因敌人护甲值而增强 [3:1]',
    build: skill(
      dmg('enemyChosen', 3, 1, { modifier: { mod: { kind: 'multiplier', a: 1 }, source: { kind: 'targetStat', stat: 'attack' } } }),
      dmg('enemyChosen', 3, 1, { modifier: { mod: { kind: 'ratio', a: 3, b: 1 }, source: { kind: 'enemyStatSum', stat: 'armor' } } }),
    ),
  },
  {
    id: 8868,
    desc: '&& 创造 3 颗冻结宝石，并获得一个额外回合 &&窃取一名随机敌人 [魔法 + 1] 点护甲值',
    build: skill(
      createSpecialGems({ kind: 'freezeGem' }, 3),
      extraTurn(),
      steal('enemyRandom', 'armor', 'armor', 1, 1),
    ),
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
    desc: '对第一名敌人造成 [魔法 + 1] 点伤害并将其冻结。如果敌人的魔法值高于自身，则创造 8 颗蓝色宝石。',
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
    desc: '对首位和末位敌人造成 [魔法 + 2] 点伤害。若其中一个使用蓝色法力，则造成双倍伤害。若其中一个使用紫色法力，则赋予自身屏障效果。',
    build: skill(
      dmg('enemyFront', 2),
      dmg('enemyLast', 2),
      inflict('barrier', 'allySelf', { ifCond: { kind: 'anyEnemyColor', color: BaseColor.Purple } }),
    ),
  },
];

export const BATCH_R6: CuratedBatch = { batch: 'R6', spells: SPELLS, skipped: SKIPPED };
