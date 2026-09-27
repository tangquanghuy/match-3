# GoW 技能同构复核工作台

按原版快照的顶层目标及有序原生步骤类型分组；**同组不等于技能相同，更不等于自动签收**。先核实共享规则，再对组内每个实体分别检查文本、参数、费用/颜色、绑定、分支、真实施法及独立证据。

当前同指纹整项签收 **19/2,518**；可推进 **2482** 项，待证据 **15** 项，待修复 **2** 项。
可推进项分成 **1744** 组；其中 **929** 项处于 **191** 个多人组。

优先批次（按可复用实体数排序，原生细节请参阅 `artifacts/gow-skill-audit/review-cohorts.json`）：

| 顺位 | 顶层目标 | 有序步骤类型 | 实体数 | 前三个独立实体 |
|---:|---|---|---:|---|
| 1 | Enemy | CountGems → RemoveColor → Damage | 40 | troop:6010、weapon:1038、weapon:1044 |
| 2 | Enemy | CountArmyKingdom → Damage → CreateGems2Colors | 37 | weapon:1191、weapon:1234、weapon:1105 |
| 3 | Enemy | CountArmyType → Damage → CreateGems | 33 | troop:7212、troop:7274、troop:7290 |
| 4 | None | Damage | 31 | troop:7159、troop:7164、troop:7335 |
| 5 | Enemy | CountArmyColor → CountArmyType → Damage | 29 | weapon:1431、weapon:1466、weapon:1483 |
| 6 | Enemy | CountArmyType → Damage → CreateGems2Colors | 28 | weapon:1232、weapon:1235、weapon:1187 |
| 7 | None | ExplodeColor → RandomPositiveStatusEffect → SummoningKingdom | 22 | weapon:1364、weapon:1410、weapon:1412 |
| 8 | Enemy | Damage → ConvertGems | 20 | troop:7175、troop:7234、troop:7236 |
| 9 | Enemy | Damage | 19 | weapon:1001、weapon:1029、weapon:1082 |
| 10 | None | CountGems → Damage → ConvertGems → ExtraTurnConditional | 19 | troop:7245、troop:7246、troop:7247 |
| 11 | None | ExplodeColor → RandomPositiveStatusEffect → SummoningType | 18 | weapon:1393、weapon:1462、weapon:1463 |
| 12 | Enemy | Damage → CreateGems | 15 | troop:6034、troop:6382、troop:7084 |
| 13 | None | CountArmyType → Damage | 15 | weapon:1205、weapon:1540、weapon:1543 |
| 14 | None | ExplodeColor → RandomPositiveStatusEffect → SummoningTypeNoError | 15 | weapon:1354、weapon:1375、weapon:1386 |
| 15 | None | CountArmyKingdom → Damage | 14 | weapon:1580、weapon:1590、weapon:1614 |
| 16 | Enemy | CountGems → Damage | 12 | troop:7379、weapon:1539、troop:6683 |
| 17 | Enemy | Damage → ExplodeColor | 10 | troop:6234、troop:6597、troop:7166 |
| 18 | None | Damage → CreateGems | 9 | troop:6058、troop:6103、troop:6558 |
| 19 | Board | CountGems → DestroyGems → Damage | 9 | troop:6089、troop:6245、troop:6267 |
| 20 | None | CountGems → CountGems → CreateGems2Colors | 9 | troop:6564、troop:6733、troop:6743 |
| 21 | None | ExplodeColor → RandomPositiveStatusEffect → SummoningKingdomNoError | 9 | weapon:1388、weapon:1402、weapon:1407 |
| 22 | None | IncreaseAttack → IncreaseHealth → CauseBlessed | 9 | weapon:1653、weapon:1659、weapon:1680 |
| 23 | Enemy | CountGems → Damage → CreateGems | 8 | troop:7538、troop:7590、troop:7757 |
| 24 | Enemy | CountDrainableMana → CountMax → DecreaseMana → CreateGems | 8 | troop:6317、troop:6424、troop:6710 |
| 25 | None | ScatterDamage | 7 | troop:7386、weapon:1004、weapon:1020 |
| 26 | None | CountGems → CreateGems → ExtraTurnConditional | 7 | troop:7305、troop:7346、troop:7363 |
| 27 | None | GiveGold | 6 | troop:6614、troop:6615、troop:6616 |
| 28 | Enemy | TrueDamage | 6 | weapon:1026、weapon:1041、troop:6057 |
| 29 | None | CountGems → Damage | 6 | troop:7051、troop:7087、troop:7230 |
| 30 | Enemy | Damage → CauseSpecificStatusEffectConditional | 6 | weapon:1378、troop:6737、troop:6764 |
| 31 | Board | ExplodeGems → IncreaseHealth → CreateGems | 6 | troop:7447、troop:7448、troop:7449 |
| 32 | None | CreateGems → IncreaseArmor → DecreaseArmor | 6 | weapon:1379、weapon:1380、weapon:1381 |
| 33 | None | CountGems → Damage → LethalDamageConditional | 6 | weapon:1454、weapon:1455、weapon:1456 |
| 34 | None | IncreaseSpellPower → IncreaseArmor → IncreaseAttack | 6 | weapon:1517、weapon:1518、weapon:1519 |
| 35 | Enemy | CountArmyType → CountArmyColor → Damage | 6 | weapon:1530、weapon:1542、weapon:1554 |
| 36 | Enemy | ExplodeColor → GenerateQuarterManaConditional → Damage | 6 | weapon:1632、weapon:1633、weapon:1634 |
| 37 | None | CountGems → CreateGems → Delay → CreateGems | 6 | troop:6144、troop:6176、troop:6238 |
| 38 | None | CountArmyColor → ScatterDamage → CreateGems2Colors → IncreaseSpellPower | 6 | weapon:1180、weapon:1181、weapon:1182 |
| 39 | Enemy | SplashHeavyDamage → CauseStun → Cleanse → ExplodeGems | 6 | weapon:1297、weapon:1298、weapon:1299 |
| 40 | Ally | IncreaseArmor → CauseBarrier → CauseStun → ConvertGems | 6 | weapon:1592、weapon:1593、weapon:1594 |

验收入口：`node scripts/verify-gow-snapshot.mjs` → `node scripts/build-gow-acceptance-queue.mjs` → `node scripts/build-gow-review-cohorts.mjs`。需逐实体真实施法测试和同指纹全量通过，分组报告只负责安排复核次序。
