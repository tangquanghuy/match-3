# sa-P progress (fix round A)

- 2026-09-28T08:00:00Z P-counter-per-step queued start: modifierBonus per-source floor (R007-1)
- 2026-09-28T08:20:00Z P-counter-per-step fixed secondary.ts modifierBonus: ratio multi-source floors per source then sums (R007-1); `pooled: true` kept for community Lianka/YeLuo; 46 prototypes affected; golden diff 0 lines; tests gowFixP-counter-per-step + L3B05Repro it.fails->it, L7B01/L7B06 7470 pool values updated
  - re-review (signed, non-default scenario changed): troop:6320 / 7470 (armor 10+40: 25->24; L7 test updated). troop:7198 / 8785 not signed.
- 2026-09-28T08:40:00Z P-random-stat-pool fixed debuff.ts 4-Skill pool (R007-2), StealRandom Life -> caster Life+max; golden diff 0 lines; L2B01 6775 / L2B04 7817 assertions updated (unsigned)
- 2026-09-28T09:15:00Z P-prefnotprev-semantics fixed (R007-3): damage.ts random waves + enemyRandomN splash avoid only previous centre (8160 keeps notHit per R006-C3); new allyRandomPrefNotPrevN used by 7666 7786 8024 8390 8650 9199 8970 9528-9531 9641 9776 9874 7654; 7945 -> allyRandomPrefNotPrev; 9641 damage randomWaves 2; weapon:1142 already correct; golden diff 0 lines; tests updated: L4bB05, L5B05, gowMultiTargetDamageAudit, gowSplashDifferences
  - re-review (signed, non-default scenarios changed): troop:7862 / 9937 (third centre may return to first; 2 alive -> A-B-A); troop:6678 / 8024 and troop:6479 / 7666 (lone caster: two status applications)
- 2026-09-28T09:40:00Z P-steal-to-life fixed: reduce modifierAfterCap + gainLifeMode 'gain'; 8597 counter = min(front Attack, M+1) + 2xGreen, Life+max; reverse-check of all steal->hp: 9139/9223 also IncreaseHealth (and wrong [100:1] targetStat modifier removed: stole whole stat); golden diff 0 lines; L7B08 / L7B08Repro updated (none signed)
- 2026-09-28T10:05:00Z P-chooser-native-restrictions fixed (engine only): gowChoiceRules.ts (75 spell ids from native Target) + AiColorChooser/AiCellChooser honour it via TurnEngine; golden diff 0 (golden uses fixed choosers); open UI note: src/render/App.ts player palette/board pick still unrestricted
- 2026-09-28T10:40:00Z P-create-interleave fixed: root cause = gems.ts create/transform/shuffle call ctx.resolveBoardChange immediately; TurnEngine.castSkill now defers the settle of pure rewrites (destroyed=[]) to the spell end, removals still settle at once; L1B02Repro it.fails->it, gowWorker02Completion 7425 extra-turn assertion made board-independent
  - re-review (golden-signed, behaviour changed, NOT approved; gowCastGolden.test.ts fails for exactly these 12 until re-approved): accepted-base troop:6009 troop:6063 troop:6612 troop:6779 troop:6941 troop:7097 troop:7098 troop:7099 troop:7100 troop:7425 troop:7446 troop:7453 (cascade moves after the remaining native steps; 6009/6941/7446/7453 random picks shift with rng order)
- 2026-09-28T10:55:00Z P-charm-instant issue (skipped, not implemented): sources agree Charm is instant/not a status, but disagree on the effect (neighbours above+below vs the charmed troop itself; armor/Barrier unknown); proposal written to rulings/R008-charm.md for the coordinator

# sa-P progress (review round 1, branch gow/r1-P)

- withdrawn per REVIEW-ROUND-1: P-F1-giant-dragon-gems (R009, lane fix), P-F1-harness-status-leak / P-F2-harness-shared-statuses (fixed on main)
- 2026-09-28T12:00:00Z L1-charm-instant closed per R008 (no runtime change): charm already in AUTO_RECOVER set (R004 shared cumulative roll, reset on new negative, Blessed blocks); gowFixL1-charm-instant.test.ts; L1B02Repro it.fails -> it (asserts lasting charm); golden diff 0 lines
- 2026-09-28T12:10:00Z P-F1-oneof-chosen-target fixed: targetChooser.ts prototypeChosenTargetMode recurses into oneOf branches; registry scan found spell 7460 (troop:6310) branch-only enemyChosen with no inputTarget -> previously no effect; golden diff 0 lines
  - re-review (unsigned, behaviour changed): troop:6310 / 7460
- 2026-09-28T12:20:00Z P-F1-summon-after-caster-death fixed: summon.ts summon/summonCopy fall back to ctx.casterSide (captured at cast start); curated 7542 -> native self-kill + summonRef('Sunbird', 6387) (selfRevive dropped); golden diff 0 lines
  - re-review (unsigned, behaviour changed): troop:6387 / 7542 (caster really dies, fresh Sunbird appended at the back)
