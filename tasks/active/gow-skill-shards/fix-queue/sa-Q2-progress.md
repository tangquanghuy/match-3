# sa-Q2 progress: final wrap-up of issued L1/L3/L4b/L5/L6/L7 skills (branch gow/r10-Q2 @ main 0a432c3)
Method: `gow-signoff show` (English + native SpellSteps + zh + prototype) + `gow-golden show` (L10/R10/L0/K), hand-check
at Magic 10, then golden approve + signoff accept (`--by sa-Q2`, test tests/unit/gowFinalQ2.test.ts).
- B01 troop:6076 (L1), 6328 (L1), 6207 (L3), 6970 (L3): accept (P-F1-remove-gems fixed + R010; count before remove, native order; 13 / 19 / 15 / mana-11 verified)
- B01 troop:6387 (L1): accept (P-F1-summon-after-caster-death fixed: self Damage 1 + execute, fresh Sunbird summon)
- B02 troop:6047 (L1), 6326 (L1), 7625 (L3): accept (P-F1-harness-status-leak fixed on main: setupCast deep-copies templates; golden now matches native; 7625 poison x2 drain tested)
- B02 troop:7062 (L3): accept (R012 fixed: K hits E10 above the killed target)
- B02 troop:6410 (L1): FIXED batch-r22 7566 devour enemyAboveTarget/BelowTarget -> enemyNextDown then enemyNextUp (native Consume single troop, native order), accept
- B02 troop:7116 (L1): still issued, P-Q2-chosen-stat-at-cast-start queued (chosenStat of the killed target = 0 -> AboveTarget hit lost in K)
