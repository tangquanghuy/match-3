/**
 * 窗口 K-B · 武器法术批次 W05（池：scripts/curated-pools/pool-w01.json）。
 *
 * 回收原 8 条 mana-only 占位：补齐 buff.double / lastDestroyedLine 后手写组装；
 * 三把 EN-only 武器按英文名与描述译出中文效果。desc 与 weapons.json / pool-w01 逐字锚定。
 */
import { anyEnemyDied, armor, attack, boostPer, createSpecialGems, destroyLineOfLastGem, dmg, explodeRandomGems, heal, inflict, reposition, skill, CELL, explodeAt } from '../builders';
import type { CuratedBatch } from './index';

const SKIPPED: { id: number; reason: string }[] = [];

const SPELLS: CuratedBatch['spells'] = [
  {
    id: 7071,
    desc: '?????????',
    build: skill(
      explodeRandomGems(1, 0),
    ),
  },
  {
    id: 7188,
    desc: '使 1 名盟友的护甲值翻倍。 [1:1]',
    build: skill(
      armor('allyChosen', 0, 0, { double: true }),
    ),
  },
  {
    id: 7189,
    desc: '减除一名敌人全部魔力值。',
    build: skill({ kind: 'reduce', target: 'enemyChosen', stat: 'magic', scaling: { base: 0, mult: 0 }, drainAll: true }),
  },
  {
    id: 7190,
    desc: '对 1 名敌人造成等同于其攻击力的伤害。 [1:1]',
    build: skill(
      dmg('enemyChosen', 0, 0, { modifier: boostPer({ kind: 'targetStat', stat: 'attack' }, 1) }),
    ),
  },
  {
    id: 7199,
    desc: '使 1 名盟友的攻击力翻倍，并为其提供 [魔法 + 1] 点生命值。 [1:1]',
    build: skill(
      attack('allyChosen', 0, 0, { double: true }),
      heal('lastTarget', 1, 1),
    ),
  },
  {
    id: 7217,
    desc: '爆破一颗宝石，并摧毁该行。',
    build: skill(
      explodeAt(CELL),
      destroyLineOfLastGem('row'),
    ),
  },
  {
    id: 10045,
    desc: '对 3 名随机敌人造成 [魔法 + 3] 点伤害，伤害值因火山宝石数而增强。若有敌人死亡，创造 12 颗火山宝石。[x4]',
    build: skill(
      dmg('enemyRandomN', 3, 1, { n: 3, modifier: boostPer({ kind: 'boardSpecial', gem: 'volcanoGem' }, 4) }),
      createSpecialGems({ kind: 'volcanoGem' }, 12, 0, { ifCond: anyEnemyDied() }),
    ),
  },
  {
    id: 10063,
    desc: '对 2 名随机敌人造成 [魔法 + 3] 点伤害，并将他们击至末位。若队伍中有不朽的塔拉萨，使所有盟友陷入下潜并获得法印。',
    build: skill(
      dmg('enemyRandomN', 3, 1, { n: 2 }),
      reposition('lastTargets', 'back'),
      inflict('submerged', 'allyAll', { ifCond: { kind: 'troopPresent', side: 'ally', name: '不朽的塔拉萨' } }),
      inflict('enchanted', 'allyAll', { ifCond: { kind: 'troopPresent', side: 'ally', name: '不朽的塔拉萨' } }),
    ),
  },
  {
    id: 10065,
    desc: '对首 2 位敌人造成 [魔法 + 4] 点伤害。若队伍中有不朽的格思洛克，为所有盟友提供 12 点生命值。',
    build: skill(
      dmg('enemyFirstN', 4, 1, { n: 2 }),
      heal('allyAll', 12, 0, { ifCond: { kind: 'troopPresent', side: 'ally', name: '不朽的格思洛克' } }),
    ),
  },
];

export const BATCH_W05: CuratedBatch = { batch: 'W05', spells: SPELLS, skipped: SKIPPED };
