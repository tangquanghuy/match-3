# R000 未实现模式豁免（用户裁定，2026-09-28）

项目未实现以下模式／目标类别，引用它们的子句与原生步骤**不实现、视为验收通过**，但必须单独记录：

| mode | 覆盖 | 典型原文／原生 |
|---|---|---|
| `boss` | 魔头／Boss 目标 | "If they are a Boss…", `MultiplyForAscensionBoss` |
| `tower` | 塔／城堡（Tower、Castle 种族） | "If they are a Tower…", `MultiplyForAscensionCastle` |
| `ascension` | 晋升度 | "based on my Ascensions", `…Ascension…` |
| `delve` | 地城／派系 | Delve、Faction |
| `treasure-hunt` | 淘金／寻宝 | Treasure Hunt、Gold Rush |
| `event` | 竞技场、突袭、入侵、公会战、世界事件、旅途、赏金、宠物救援、末日塔 | Arena、Raid、Invasion、Guild Wars、World Event、Journey、Bounty、Pet Rescue、Doom |

记录方式：该子句／步骤 `status: "excluded"`，`exclusion: {"kind": "user-waived-mode", "mode": "<上表 mode>"}`，`note` 写明被豁免的具体内容，`evidenceIds` 引用本文件证据（role `user-ruling`）。校验器要求原文／原生步骤确实含该模式关键字，否则拒绝。

- 同一子句／步骤里的**基础效果**（普通伤害、普通状态）如果与模式修饰分开存在于其他子句／步骤，仍须正常验证；只有引用模式的子句／步骤可以豁免。
- 豁免不需要写实现，也不需要删除现有的近似实现。
- 合并脚本把所有豁免项汇总到 `data/audit/gow-waived-modes.json`，账本 `acceptance.waived` 同步列出。
