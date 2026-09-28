# sa-C lane L5 review round 3 progress (branch gow/r3-L5, test tests/unit/gowLaneL5C.test.ts)
- B01 troop:6800,6791,7900,7581,7578,7901,6624,6414,7553,6748 approve=9 fixed=4 (7900/7578 randomWaves 3 prefNotPrev + per-step roll; 7553 Boss not Tower + zh override; 6791 Hunter's Mark checked at cast start) issue=1 (6624 L5-C-self-submerged-timing) waived=6414/7553 c2 boss
- B02 troop:7003,7783,7710,6007,weapon:1250,1695,1442,1443,1444 approve=9 fixed=6 (1250 Bleed both first 2; 1695 Lycanthropy not Curse; 1442/1443/1444 FirstLast/LastTwo/FirstTwo + Tempering on every hit, zh 1443/1444; 6007 Burn random enemy) issue=0 (6800 requeue done)
- B03 troop:6856,7512,6744,6788,7331,6184,6389,weapon:1124,1550,1176 approve=10 fixed=1 (1176 Disease Knight not Divine) issue=0 waived=6856 c2 boss

# sa-C lane L5 review round 4 (branch gow/r4-L5)
- B04 troop:6567,6324,6578,6582,6505,6511,weapon:1398,troop:7146,7432,weapon:1060 approve=10 fixed=1 (7432 Freeze BelowTarget excludes the target) issue=0 waived=6582/6505/6511 c2 tower
- B05 weapon:1132,troop:7131,6388,weapon:1062,troop:6051,6586,7756,weapon:1053,1066,troop:6377 approve=10 fixed=4 (1132 Freeze the last enemy not the chosen; 7131 Freeze and Death Mark + zh override; 6051 FromPrevious after kill; 6377 NextUp/NextDown own 50% rolls) issue=0 waived=6586/7756 c2 boss
- B06 troop:6724,6737,6764,7002,7180,7711,weapon:1378,troop:7352,weapon:1294,1405 approve=10 fixed=2 (1294 target's own Frozen/Burning not any enemy; 1405 last enemy's own Poison + Bleed on it) issue=0 waived=6737/6764 c2 boss, 7711 c2 tower
- B07 troop:6750,6997,6780,7142,6674,7482,7407,7409,6395,7355 (+ re-approve weapon:1132/1405: LastEnemy re-resolved per step like troop:6674) approve=10 fixed=1 (7142 RandomPrefNotPrev waves) issue=0 waived=6780 c2 boss, 7482 c2 tower
- B08 troop:7826,6819,6937,6602,6708,6174,6286,6145,6503,6108 approve=9 fixed=5 (6819 Dispel on kill never fired; 6602 NextDown only; 6708 only chosen doubled/Death Marked; 6108 3 Magic + zh override; 6937 damage per-target Blue) issue=1 (6937 P-C-firstlast-army-color) waived=7826/6819/6503 c2 boss

# sa-C lane L5 review round 6 (branch gow/r6-L5)
- B09 troop:6517,6301,6208,6235,7023,7589,6460,6821,weapon:1668,1669 approve=10 fixed=3 (1668/1669 Doomed blades: Doom armor break before each hit, Tempering + own-colour Bleed on both hits, RandomPrefNotPrev - family 9825-9830 via doomedBlade(); 7589 2 Magic not Mana) issue=0 waived=6517 c2 tower, 7589 c2 boss

# sa-C lane L5 review round 9 (branch gow/r9-L5, base gow-review-base-12)
- weapon:1670 accept (doomedBlade Red 9827)
- weapon:1671 accept (doomedBlade Yellow 9828)
- weapon:1672 accept (doomedBlade Purple 9829)
- weapon:1673 accept (doomedBlade Brown 9830)
- troop:6571 accept (7775 armor strip all -> 2M+7 -> Submerge self)
- B10 weapon:1670,1671,1672,1673,troop:6571 approve=5 fixed=0 issue=0
- troop:6785 accept (8175 armor chosen ally, Barrier all below)
- troop:7203 accept (8790 Barrier Daemons only)
- weapon:1527 accept (8971 Barrier Whitehelm 3014 only)
- troop:7191 accept (8772 others Barrier with any Storm)
- troop:6980 accept (8483 RandomEnemy back)
- B11 troop:6785,7203,weapon:1527,troop:7191,6980 approve=5 fixed=0 issue=0
- troop:7703 fixed (9664 Barrier+Enchant the chosen ally, not the caster twice)
- troop:7706 fixed (9667 armor@WeakestAlly first, Life/Barrier FromPrevious)
- troop:7666 accept (9594 Bless+Barrier Elemental only; Blessed cleanses on apply)
- troop:6695 accept (8041)
- troop:6335 fixed (7485 native order Attack -> Life -> Cleanse -> Red Magic)
- B12 troop:7703,7706,7666,6695,6335 approve=5 fixed=3 issue=0
- troop:6450 accept (7628)
- troop:6690 fixed (8036 native order Health -> Blessed -> Enchanted)
- troop:7323 accept (8935)
- weapon:1149 fixed (7446 Cleanse/Enchant allyOthers not allyAll; override entry added)
- troop:7797 fixed+issue L5-C-7797-chance (9817 kill roll first on already Entangled only; DISPUTE English 30% vs native 25, 30 kept)
- B13 troop:6450,6690,7323,weapon:1149,troop:7797 approve=4 fixed=3 issue=1
- weapon:1446 accept (8702 scatter + Tempering, Bless Purple allies, Curse Purple enemies)
- troop:6150 fixed zh (7264 '所有人' -> '所有敌人' + snapshot override; one 75% roll)
- troop:6158 accept (7278)
- troop:7718 fixed (9710 RandomEnemy burn + RandomPrefNotPrev burn 50%)
- troop:7013 accept (8545 one 75% roll)
- B14 weapon:1446,troop:6150,6158,7718,7013 approve=5 fixed=2 issue=0
