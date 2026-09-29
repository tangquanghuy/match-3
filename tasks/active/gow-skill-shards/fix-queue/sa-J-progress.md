# sa-J progress (final wrap-up round, branch gow/r10-J)

Keys: final-queue.json cat=unreviewed (39) + cat=not-eligible with a real lane (28). Tests: tests/unit/gowFinalJ.test.ts.

- B01 troop:6005 accept (L4b; transform chosen->Yellow, gold 3+M) ; troop:6006 accept (L4b; scatter 3+M total, 2 bombs) ; troop:6017 accept (L4a; remove Blue, atk M+removed 1:1; zh uses the shared "移除…以增强效果" phrasing) ; troop:6018 accept (L3; dmg 2+M, floor quarter mana to other allies) ; troop:6028 accept (L5; cleanse, armor 1+M, barrier) -> approve=5 fixed=0 issue=0
- B02 troop:6034 re-accept (L4b; dmg 1+M, 9 gems of a target colour) ; troop:6062 accept (L4b; chooser honours NotBlueOrSkullGems, souls 1+M; test with Red) ; troop:6075 re-accept (L4a; R015 explode 3+M random 'all', cleanse self) ; troop:6153 re-accept (L4a; scatter 3+M, magic+8 on kill before destroy 10 'all' per native order) ; troop:6160 FIXED zh "8 颗黄色宝石和 8 颗棕色宝石" (batch-r22 + gowSnapshotOverrides) then accept (L1) -> approve=5 fixed=1 issue=0
