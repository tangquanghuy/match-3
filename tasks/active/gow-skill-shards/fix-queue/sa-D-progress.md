# sa-D progress (review round 3, lane L7 then L6; branch gow/r3-L7)
- B01 troop:6138,6304,6644,6833,6613,weapon:1262,1454,1455,1456,1457 approve=10 fixed=0 issue=0 waived boss c2/step1 x1 (6644); requeued 6138/6304/6644/6833 re-checked (pooled CountAttackArmorLife, 34%/13%)
- B02 weapon:1458,1459,troop:7117,7119,weapon:1435,troop:7104,7610,7259,6360,7153 approve=9 fixed=1 issue=1 (1435 slay chance counted all Skulls -> Doomskulls; issued P-D-lethal-first-lasttarget for native Lethal-before-damage order)
- B03 troop:7651,7771,6643,7317,weapon:1531,troop:7575,7579,7801,7860,7726 approve=10 fixed=1 (7575 zh "all enemies below") issue=0; region x2 not exercisable
- B04 troop:7571,7604,7932,6106,6195,6580,6806,7753,6835,6109 approve=10 fixed=1 (6806 CountLife 20 read as 20:1 -> 5:1 = 20%; zh 因其生命值) issue=0 waived boss x2 tower x1
- B05 troop:6781,7933,6143,6501,6273,7025,weapon:1366,troop:7463,6117,6189 approve=10 fixed=1 (6117 Beast x2 -> x3 + zh 三倍) issue=0 waived boss x1; test tests/unit/gowLaneL7R3.test.ts
- B06 troop:6860,weapon:1000,1006,1007,1009,1021,1022,1024,1025,1029 approve=10 fixed=1 (1000 first -> strongest enemy + zh; weapon zh via pool-w01 + gowWeaponReviewedOverrides description) issue=0
- B07 weapon:1032,1033,1034,1047,1048,1049,1079,1080,1082,1083 approve=10 fixed=0 issue=0 (1049 Dragon +8, 1079 Attack greater +12 tested)
- B08 weapon:1088,1109,1121,1127,1166,1168,1169,1170,1171,1172 approve=10 fixed=1 (1109 second 8-dmg hit -> single hit +8) issue=0
- B09 weapon:1173,troop:6012,6726,7332,6956,6866,6470,6257,weapon:1103,1119 approve=10 fixed=4 (6956 randomWaves notHit; 1103 missing second-last hit; 1119 PrefNotPrev; 6470 lethal on lastTargets) issue=0 waived tower x1
