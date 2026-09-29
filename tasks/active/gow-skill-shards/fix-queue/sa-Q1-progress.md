# sa-Q1 progress (final wrap-up, branch gow/r10-Q1)

Scope: final-queue.json cat "issue", lanes L2 + L4a (32 keys; skip troop:6857 weapon:1413 troop:7001 = sa-P). Each accept = golden approve + signoff (`--by sa-Q1`, test tests/unit/gowFinalQ1.test.ts).

- B01 troop:6134 (L2): accept (P-random-stat-pool fixed, R007-2)
- B01 troop:6171 (L2): accept (P-random-stat-pool fixed; StealRandom before damage)
- B01 troop:6182 (L2): FIXED batch-r12 7323 native order (chosenRowAtCastStart Blue x2, destroy row last), accept
- B01 troop:6398 (L4a): accept (P-F2-precount-explode fixed)
- B01 troop:6423 (L2): accept (P-F1-remove-gems fixed; P-random-stat-pool fixed)
- B02 troop:6593 (L4a): accept (P-R1-count-at-native-step fixed)
- B02 troop:6621 (L2): accept; dispute: native IncreaseAttack UseCounterForAmount vs English [Magic + 1], kept English [M+1]
- B02 troop:6776 (L2): accept (P-random-stat-pool fixed; Tower clause c2 waived R000)
- B02 troop:6864 (L2): accept; dispute: native InflictEffectOnRandomTroops may repeat vs English distinct, kept distinct 1-4 enemies
- B02 troop:6964 (L4a): accept (P-R1-chosen-target-color-cond fixed)
- B03 troop:7036, troop:7038 (L4a): accept (P-R1-dual-storm fixed)
- B03 troop:7057 (L2): FIXED batch-r21 8585 native order (armor before the explode), accept; dispute: native counts Skulls in Block5x5 but explodes Block3x3, kept barrier per Skull destroyed in the 3x3
- B03 troop:7316 (L4a): accept (P-R1-row-count-at-cast-start fixed)
- B03 troop:7492 (L4a): accept (P-R1-count-at-native-step fixed)
- B04 troop:7739 (L2): accept (R011 fixed)
- B04 troop:7850 (L2): accept; dispute: native counts webbed ALLIES vs English webbed Enemies, kept webbed enemies
- B04 troop:7851 (L4a): accept (P-R1-gargoyle-tier-filter fixed; Boss c2 waived R000)
- B04 troop:7884 (L4a): accept per R016-1 (uniform 2-5; Boss c2 waived R000)
- B04 weapon:1102 (L4a): accept (P-F1-remove-gems fixed)
- B05 weapon:1104, weapon:1107 (L2): accept (P-random-stat-pool fixed)
- B05 weapon:1158 (L4a): accept (P-R1-count-at-native-step fixed; zh already says any random gem in pool-w01 / batch-w01, ledger text stale)
- B05 weapon:1174, weapon:1230 (L4a): accept (P-F1-remove-gems fixed; 1174 zh already fixed in pool-w01)
- B06 weapon:1255 (L2): accept (R011 fixed)
- B06 weapon:1377 (L2): accept (P-random-stat-pool fixed)
- B06 weapon:1391 (L4a): accept (P-R1-dual-storm fixed)
- B06 weapon:1396 (L2): accept per R016-3
- done: 29 reviewed (skipped troop:6857 weapon:1413 troop:7001 = sa-P); accepted 29; changed 2 (6182 / 7323 row count + order, 7057 / 8585 order); still issued 0; primitive-queue/sa-Q1.jsonl not needed. Disputes kept: 6621 Attack [M+1] (English), 6864 distinct frozen targets (English), 7057 3x3 skull count (English), 7850 webbed enemies (English); R016 applied: 7884, 1396.
