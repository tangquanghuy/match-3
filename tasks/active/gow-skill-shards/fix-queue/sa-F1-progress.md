# sa-F1 progress (fix-queue/F1.md, lanes L1/L2/L3)

- 2026-09-28T00:00:00Z troop:6319 approved Cleanse Amount/SpellPowerMultiplier has no observable effect; cleanse others + 3-8 mana + 3 bombs match
- 2026-09-28T00:09:41Z weapon:1706 fixed IncreaseRandom was allyRandom/Magic-ignored/split; now chosen ally, [Magic+1] one random Skill (+zh)
- 2026-09-28T00:09:41Z weapon:1708 fixed same as 1706 (spell 10005)
- 2026-09-28T00:09:41Z weapon:1709 fixed same as 1706 (spell 10006)
- 2026-09-28T00:09:41Z weapon:1711 fixed same as 1706 (spell 10008)
- 2026-09-28T00:19:38Z troop:6871 approved quarter mana only for Purple allies (none in default team); test gowLaneL3FixsaF1
- 2026-09-28T00:19:38Z troop:7341 approved stale hint: chosen ally +2 Attack now visible; 7%/Yellow extra-turn chance
- 2026-09-28T00:19:38Z troop:7749 approved stale hint: [Magic+1] Attack + Barrier visible; Tauros half mana tested
- 2026-09-28T00:19:38Z weapon:1311 approved stale hint: Enrage + [(M/2)+1] Attack +1/Orc ally tested, Orc summon
- 2026-09-28T00:19:38Z weapon:1377 issue fixed DecreaseRandom target (lastTarget no-op -> chosen enemy); remaining P-random-stat-pool (Life missing from pool)
- 2026-09-28T00:19:38Z troop:6931 fixed added native Dispel@RandomEnemy before the kill (Barrier absorbed it); approved
- 2026-09-28T00:19:38Z troop:6970 issue P-F1-remove-gems: RemoveColor grants mana (engine has no remove mode); order already native
- 2026-09-28T00:19:38Z troop:6207 issue fixed order to native (count, drain, true dmg, then remove); remaining P-F1-remove-gems
- 2026-09-28T00:19:38Z troop:6423 issue fixed order to native (count, DecreaseRandom, steal, then remove); remaining P-F1-remove-gems
- 2026-09-28T00:19:38Z troop:6076 issue fixed order to native (count, life, remove, summon, extra); remaining P-F1-remove-gems
- 2026-09-28T00:19:38Z troop:6328 issue fixed order to native (count, damage, remove, summon); remaining P-F1-remove-gems
