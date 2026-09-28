# sa-F2 progress (fix round A, lanes L4a+L4b, queue F2.md 65 items)

- 2026-09-28T08:20:00Z troop:6607 fixed steal Attack was mult 0 -> [Magic + 1]
- 2026-09-28T08:20:00Z troop:6991 fixed explode count mult 0 -> [(Magic / 2) + 1]; zh corrected
- 2026-09-28T08:20:00Z troop:7009 approved above-self ally not in default scenario; covered by gowLaneL4aFixF2.test.ts
- 2026-09-28T08:20:00Z troop:7830 fixed Life mult 0 -> [Magic + 1]; zh corrected
- 2026-09-28T08:20:00Z weapon:1092 approved ExplodeGems SpellPowerMultiplier has no Amount/English magic term (false positive)
- 2026-09-28T08:20:00Z troop:6974 approved no Brown allies in default scenario; count/targets covered by gowLaneL4bFixF2.test.ts
- 2026-09-28T08:20:00Z weapon:1028 fixed missing "give 2 Magic to all Allies"; override + zh synced
- 2026-09-28T08:20:00Z troop:6265 fixed Dispel@LastAlly before the kill (Barrier blocked sacrifice); test in gowLaneL4bFixF2
- 2026-09-28T08:40:00Z troop:6398 issue P-F2-precount-explode (random dispel target fixed; count-before-explode needs primitive/ruling)
- 2026-09-28T08:20:00Z troop:6457 fixed Dispel@Self before self-kill; test in gowLaneL4aFixF2
- 2026-09-28T08:20:00Z troop:6529 fixed Dispel@FromTarget before the kill; test in gowLaneL4bFixF2
- 2026-09-28T08:20:00Z troop:7728 fixed dispel+true damage on chosen enemy (no damage before)
- 2026-09-28T08:20:00Z troop:6355 fixed native step order (skulls, attack, damage 1, true damage, barrier)
- 2026-09-28T08:20:00Z troop:6754 fixed chosen-ally input so the colour explode fires
- 2026-09-28T08:20:00Z troop:7338 fixed row+column cross, boost per Skull destroyed; zh corrected
- 2026-09-28T08:20:00Z weapon:1277 approved storm branch not in default scenario; covered by gowLaneL4aFixF2.test.ts
- 2026-09-28T08:20:00Z troop:7321 fixed chosen-enemy input so explode + knock back fire (item #18, done early with #14)
