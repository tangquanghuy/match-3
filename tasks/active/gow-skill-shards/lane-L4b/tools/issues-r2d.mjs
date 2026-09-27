const at = '2026-09-27T20:04:00Z';
const fixed = (id, note) => ({ id, status: 'fixed', fixedBy: 'sa-L4b', fixedAt: at, fixNote: note });
export default [
  fixed('L4b-7138-onecolour', 'gems.ts resolveCreateSpec: CHOSEN_TARGET/ENEMY/TRACKED_ENEMY/LAST_TARGET/MOST_USED placeholders resolved once per cast; repro tests/unit/gowLaneL4bB05Repro.test.ts (36 cases); accepted troop:7162 requeued'),
  fixed('L4b-7200-rage-alias', 'secondary.ts sameStatus(): allyStatusCount/enemyStatusCount/targetStatus/anyEnemyStatus/anyAllyStatus/selfStatus/lastTargetStatus accept rage<->enraged; accepted troop:6548 requeued'),
  { id: 'L4b-7200-noop', status: 'closed-no-difference', closedBy: 'sa-L4b', closedAt: at, fixNote: 'rulings/RL4b-01-two-colour-overwrite.md (ingested gold-primary-sources/community-2019-08-12-two-colour-create-overwrite.json): same-colour overwrite allowed; B01 test flipped to assert 22 distinct cells / endpoint types' },
  { id: 'L4b-6196-threshold', status: 'closed-ruled', closedBy: 'sa-L4b', closedAt: at, fixNote: 'rulings/R003 item 1: AddFor10<Color>Gems threshold is 13 (English snapshot frozen evidence); runtime boardAtLeast 13 matches' },
  fixed('L4b-6068-order', 'batch-05 7138: poison then damage (R001); B02 binding/lethal tests updated, it.fails flipped'),
  fixed('L4b-6751-zh', 'gowSnapshotOverrides.json troop 6751 + batch-36 desc + pool-36; build_troops.mjs'),
  fixed('L4b-7138-zh', 'gowSnapshotOverrides.json troop 7138 + batch-r20 desc; build_troops.mjs'),
  fixed('L4b-7030-dragon', 'batch-r8 8557 transformToSpecial Red -> dragonGem Yellow'),
  fixed('L4b-7276-singlegem', "batch-r4 8901 transformToSpecial('CELL', uberDoomSkull); related family (6111/7092/7169/7480/weapon:1067) still to review"),
  fixed('L4b-7195-order', 'batch-36 8782 transform before inflict marked'),
  fixed('L4b-6824-random-ally', 'batch-14 8234 barrier allyRandom + submerged lastTarget; zh via gowSnapshotOverrides.json troop 6824 + pool-14'),
  fixed('L4b-6841-prefnotprev', 'batch-08 8246 dmg enemyRandom + dmg enemyRandomPrefNotPrev'),
  fixed('L4b-7068-potion-colour', 'batch-r21 8596 manaPotionGem color Purple'),
  fixed('L4b-7270-dragon', 'batch-r8 8889 createSpecialGems dragonGem Brown x3'),
  fixed('L4b-7071-base', 'batch-r13 8599 createSkulls base 2'),
  fixed('L4b-7499-dragon', 'batch-r11 9244 transformToSpecial Brown -> dragonGem Yellow'),
  { id: 'L4b-6340-mix-stun', status: 'source-dispute', note2: 'Round 2: 2-colour part settled by RL4b-01; CauseStun Amount 4 / CauseBurning Amount 3 still undocumented (web search found nothing) -> stays source-dispute' },
];
