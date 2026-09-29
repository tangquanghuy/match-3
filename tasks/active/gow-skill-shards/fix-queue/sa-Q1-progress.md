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
