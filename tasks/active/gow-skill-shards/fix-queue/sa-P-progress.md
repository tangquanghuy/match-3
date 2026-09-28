# sa-P progress (fix round A)

- 2026-09-28T08:00:00Z P-counter-per-step queued start: modifierBonus per-source floor (R007-1)
- 2026-09-28T08:20:00Z P-counter-per-step fixed secondary.ts modifierBonus: ratio multi-source floors per source then sums (R007-1); `pooled: true` kept for community Lianka/YeLuo; 46 prototypes affected; golden diff 0 lines; tests gowFixP-counter-per-step + L3B05Repro it.fails->it, L7B01/L7B06 7470 pool values updated
  - re-review (signed, non-default scenario changed): troop:6320 / 7470 (armor 10+40: 25->24; L7 test updated). troop:7198 / 8785 not signed.
- 2026-09-28T08:40:00Z P-random-stat-pool fixed debuff.ts 4-Skill pool (R007-2), StealRandom Life -> caster Life+max; golden diff 0 lines; L2B01 6775 / L2B04 7817 assertions updated (unsigned)
- 2026-09-28T09:15:00Z P-prefnotprev-semantics fixed (R007-3): damage.ts random waves + enemyRandomN splash avoid only previous centre (8160 keeps notHit per R006-C3); new allyRandomPrefNotPrevN used by 7666 7786 8024 8390 8650 9199 8970 9528-9531 9641 9776 9874 7654; 7945 -> allyRandomPrefNotPrev; 9641 damage randomWaves 2; weapon:1142 already correct; golden diff 0 lines; tests updated: L4bB05, L5B05, gowMultiTargetDamageAudit, gowSplashDifferences
  - re-review (signed, non-default scenarios changed): troop:7862 / 9937 (third centre may return to first; 2 alive -> A-B-A); troop:6678 / 8024 and troop:6479 / 7666 (lone caster: two status applications)
- 2026-09-28T09:40:00Z P-steal-to-life fixed: reduce modifierAfterCap + gainLifeMode 'gain'; 8597 counter = min(front Attack, M+1) + 2xGreen, Life+max; reverse-check of all steal->hp: 9139/9223 also IncreaseHealth (and wrong [100:1] targetStat modifier removed: stole whole stat); golden diff 0 lines; L7B08 / L7B08Repro updated (none signed)
