# sa-Q2 progress: final wrap-up of issued L1/L3/L4b/L5/L6/L7 skills (branch gow/r10-Q2 @ main 0a432c3)
Method: `gow-signoff show` (English + native SpellSteps + zh + prototype) + `gow-golden show` (L10/R10/L0/K), hand-check
at Magic 10, then golden approve + signoff accept (`--by sa-Q2`, test tests/unit/gowFinalQ2.test.ts).
- B01 troop:6076 (L1), 6328 (L1), 6207 (L3), 6970 (L3): accept (P-F1-remove-gems fixed + R010; count before remove, native order; 13 / 19 / 15 / mana-11 verified)
- B01 troop:6387 (L1): accept (P-F1-summon-after-caster-death fixed: self Damage 1 + execute, fresh Sunbird summon)
- B02 troop:6047 (L1), 6326 (L1), 7625 (L3): accept (P-F1-harness-status-leak fixed on main: setupCast deep-copies templates; golden now matches native; 7625 poison x2 drain tested)
- B02 troop:7062 (L3): accept (R012 fixed: K hits E10 above the killed target)
- B02 troop:6410 (L1): FIXED batch-r22 7566 devour enemyAboveTarget/BelowTarget -> enemyNextDown then enemyNextUp (native Consume single troop, native order), accept
- B02 troop:7116 (L1): still issued, P-Q2-chosen-stat-at-cast-start queued (chosenStat of the killed target = 0 -> AboveTarget hit lost in K)
- B03 troop:6483 (L6): accept (P-F3-prehit-target-compare fixed; bigger enemy -> souls 30, dmg 39)
- B03 troop:6587 (L5): accept (P-F3-lasttarget-damaged fixed; +10 on damaged target, Enrage on kill / surviving damaged target; armor-only hit no Enrage)
- B03 troop:6704 (L4b): accept (P-R2-chosen-color-modifier fixed; 11 Red for 11 chosen-colour gems)
- B03 troop:6936, weapon:1427 (L5): accept (P-R3-target-status-count fixed; 3 statuses -> 43, 2 statuses -> 37)
- B04 troop:6982 (L5): accept (P-R3-next-up-target fixed; independent 30% silence chosen / next up / next down; armor 30 -> 23)
- B04 troop:7210 (L4b): accept (P-R2-gargoyle-tier fixed; Bad-only count, also gowFixP-boardSpecial-filters)
- B04 troop:7308, 7309 (L4b): accept per R016-7 (Spirit = Purple spiritGem); other steps verified
- B04 troop:7363 (L3): accept, dispute: native Booty Amount 1 vs English/zh 2, kept 2 (English, as R016 did for 7884/7797/1396/6699/7704)
- B05 troop:7533 (L5): accept (P-R3-precast-compare fixed; Barrier before the hit when my Armor is higher)
- B05 troop:7597 (L4b): accept (P-F2-dead-target-colour fixed; boss/ascension c2 + step 0 waived R000)
- B05 troop:7611, 7626 (L5): accept (P-R3-dragon-gem-count fixed)
- B05 troop:7627 (L5): FIXED zh typo 对人 -> 敌人 (batch-r8 9532 desc + gowSnapshotOverrides troops[7627]), accept
- B06 troop:6210 (L1): FIXED batch-29 7352 native order (armor 1 + boardSkulls before the remove), accept; dispute: native IncreaseArmor has no Amount vs English "Give 1 Armor", kept base 1
- B06 troop:7643 (L7): accept (P-R4-gargoyle-tier-count fixed; boss c2 / step 3 waived R000)
- B06 troop:7791 (L5): accept (P-R3-ally-status-excl-self fixed; 2 Blessed -> 13)
- B06 troop:7797 (L5): accept per R016-2 (30% kill if already Entangled, roll before the hit)
- B06 troop:7818, weapon:1605 (L5): accept (R012 fixed: statuses above/below land after the kill; 7818 boss c2 / step 1 waived)
- done: 32 reviewed; accepted 31 (changed 3: 6410, 7627 zh, 6210); still issued 1 (troop:7116, P-Q2-chosen-stat-at-cast-start queued). Disputes kept: 7363 Booty 2 (English), 6210 Armor base 1 (English); R016 applied: 7797, 7308, 7309.
