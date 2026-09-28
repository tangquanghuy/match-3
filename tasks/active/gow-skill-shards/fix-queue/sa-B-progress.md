# sa-B progress (lane L4b, review round 3)
- 2026-09-28T18:14:28 B01 troop:7600,7635,7780,6869,7509,7538,7566,7590,7678,7757 approve=10 fixed=0 issue=0 (special-gem damage boosts + storm x2; boss/tower waived; test gowLaneL4bR3)
- 2026-09-28T18:20:45 B02 troop:7873,weapon:1570,1613,troop:7568,7596,7716,weapon:1713,troop:6318,7595,7848 approve=10 fixed=5 issue=0 (7596/7716/1713 PrefNotPrev chain R007-3 + 7596 any-kill; 7595 R001 order; 1613 zh 噩梦->恶魔)
- 2026-09-28T18:24:17 B03 troop:6167,7632,weapon:1585,troop:7790,7824,6104,7192,7046,weapon:1468,troop:7356 approve=10 fixed=2 issue=0 (6104 Blue not Yellow + zh; 1585 Entangle Gems not status; 6167 convert-first order equivalent)
- 2026-09-28T18:29:22 B04 troop:6354,7490,6480,6762,7789,7751,6274,7903,7000,7641 approve=9 fixed=1(7000 zh, still issue) issue=1 (7000 L4b-7000-countset-order source-dispute; gold/souls/maps counters tested)
- 2026-09-28T18:33:07 B05 troop:7257,6299,7729,7768,7814,7742,6568,6579,7408,6703 approve=10 fixed=2 issue=0 (7257 CountMax counter + zh; 7768 boost moved damage->mix + zh; status counter table tests)
- 2026-09-28T18:38:50 B06 troop:6865,6266,6263,6262,6261,6338,7679,7832,6364,6692 approve=9 fixed=2 issue=1 (6261 Life boost; 7832 global entangle count + zh; 6692 P-B-action-status-self-count)
- 2026-09-28T18:40:08 B07 troop:6933,7263,weapon:1231,troop:6661-6666,7325 approve=8 fixed=0 issue=2 (6933/7325 P-B-action-status-self-count)
- 2026-09-28T18:42:55 B08 weapon:1151,troop:6408,7458,7053,7092,weapon:1526,troop:6362,7184,6697,weapon:1167 approve=9 fixed=2 issue=1 (1167 FromPrevious magic; 7092 SingleGem->CELL; 1151 P-B-action-status-self-count)
- 2026-09-28T18:45:56 B09 troop:6223,6112,weapon:1074,troop:7199,7827,weapon:1507,troop:6890,7082,6302,7020 approve=10 fixed=2 issue=0 (6890 native 25% extra rolls; 7082 native CreateGems 2 Yellow + FromPrevious)
- 2026-09-28T18:52:23 B10 troop:6510,7202,7079,7037,7308,6626,weapon:1428,1417,troop:6080,weapon:1371 approve=9 fixed=6 issue=1 (6510 two creates + zh; 6080 9 not 10 + zh; 6626 order; 1428 four creates; 1417 wildcard tiers; 1371 chosen-target status; 7308 L4b-7308-spirit-colour; 1585 override synced). Note: one accidental full vitest run (empty-string splat) - 14060/14060 passed.

# sa-B round 5 (branch gow/r5-L4b): R013 items 1-4 + lane L4b
- 2026-09-28 R013 weapon:1203 fixed (second hit enemyRandomPrefNotPrev) approve L7; weapon:1404 accepted L4a (Yellow only, already current); troop:7465 accepted L1; troop:7319,6259,7405 accepted L3 (shared roll already current); weapon:1623,troop:7804,6928,weapon:1376 accepted L3 (floor already current: buff.ts floor(manaCost x ratio), no per-target mana roll users found). test gowLaneL4bR5
- 2026-09-28T21:00:16 R5-B01 troop:6945,6239,6413,6070,7403,6065,6270,weapon:1067,1206,1091 approve=10 fixed=3 issue=0 (7403/1067 SingleGem chosen cell; 1091 armor chosen ally only)
- 2026-09-28T21:06:43 R5-B02 weapon:1379-1384,troop:6359,weapon:1549,troop:7461,weapon:1179 approve=10 fixed=7 issue=0 (Doomed x6 armor removal one random enemy; 6359 chosen single hit + create first + zh)
- 2026-09-28T21:10:31 R5-B03 troop:6888,6357,7261,7642,7360,7558,6221,weapon:1489,troop:6321,6348 approve=10 fixed=2 issue=0 (6321 condition inverted; 1489 Blue Giant Gems missing + override)
- 2026-09-28T21:13:10 R5-B04 troop:6880,6411,6560,6573,6773,7175,7238,7240,7241,7243 approve=10 fixed=4 issue=0 (7238/7240/7241/7243 R009 Giant Gems; 6573/6773 R000 boss waived)
- 2026-09-28T21:14:36 R5-B05 troop:7420,7537,7540,7544,7636,7670,7779,weapon:1280,1415,1451 approve=10 fixed=0 issue=0 (FromTarget colour tests; 7540/7670 boss, 7537/7779 tower waived R000)
- 2026-09-28T21:32:00 R5-B05 verified (tsc + 5 suites + signoff check 0 problems) after throttle checkpoint a448c92
- 2026-09-28T21:32:00 R5-B06 weapon:1485,1562,1683,troop:6034,6103,6382,6558,6977,6688,6922 approve=10 fixed=1 issue=0 (6034 create FromTarget colour not CASTER + zh override; 6688/6922 tower waived R000)
- 2026-09-28T22:31:00 R6-B01 troop:7084,7106,7350,7389,7390,7477,7745,7788,weapon:1054,troop:7309 approve=9 fixed=0 issue=1 (7309 Spirit gem colour source-dispute same as 7308; 7389/7477 boss, 7390/7745/7788 tower waived R000) checkpoint f1ff67a
