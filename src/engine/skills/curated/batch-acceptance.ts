/** Closing the roster gaps. Explicit project rules; raw desc is the import anchor.
 * Mongo restores native A-B-C-D-E-F branches; shared devour, status and transform rules remain under separate review.
 * Krampus resolves exactly one alternative, never all three sequentially.
 */
import type { CuratedBatch } from './index';
import { skill, targetedSkill, oneOf, dmg, armor, explodeRandomGems, inflictRandom,
  devour, inflict, transformTroopRandom, reposition, attack, magic, gainLife, dmgSplash } from '../builders';
import { RACE_SUMMON_REFS } from '../data/raceRoster';
import sourceTroops from '../../../data/troops.json';

/** Installed original Fey only; eligibility/level rules beyond this roster remain pending. */
export const MONGO_FEY_REFS = sourceTroops.filter(t => t.troopTypes.includes('Fey')).map(t => t.referenceName);

export const BATCH_ACCEPTANCE: CuratedBatch = {
  batch: 'acceptance-2026-09-25',
  spells: [
    { id: 7493, desc: '随机发生任何情况。', build: skill(oneOf(
      devour('enemyRandom', { chance: 1 }),
      transformTroopRandom('allySelf', MONGO_FEY_REFS),
      inflictRandom('enemyAll'),
      explodeRandomGems(10, 0),
      [attack('allyRandom', 10, 1), armor('lastTarget', 10, 1),
        gainLife('lastTarget', 10, 1), magic('lastTarget', 10, 1)],
      dmgSplash('enemyRandom', 2, 1, { splashRatio: 0.75 }),
    )) },
    { id: 7810, desc: '爆破 4 颗敌军法力颜色的宝石。有 20% 的几率吞噬敌军。', build: skill(
      // native Target Enemy: ExplodeColor FromTarget + Consume@FromTarget = the chosen enemy (sa-E L1; was a random enemy)
      explodeRandomGems(4, 0, 'color', 'CHOSEN_TARGET'), devour('enemyChosen', { chance: 0.2 }),
    ) },
    // sa-R5 L1-6808: native Randomize AB-CD-EF = (Damage + Submerge) | (TransformType daemon + TroopOrderBack) |
    // (Consume); the damage belongs to the first branch only (was dealt before every branch).
    { id: 8211, desc: '对一名敌人造成 [魔法 + 8] 点伤害，并或使其下潜，或将其吞噬，或将其转化成一名恶魔并打回末位。', build: targetedSkill('enemyChosen',
      oneOf(
        [dmg('enemyChosen', 8, 1), inflict('submerged', 'lastTarget')],
        [transformTroopRandom('enemyChosen', [...RACE_SUMMON_REFS.Daemon]), reposition('lastTarget', 'back')],
        [devour('enemyChosen', { chance: 1 })],
      ),
    ) },
  ],
  skipped: [],
};
