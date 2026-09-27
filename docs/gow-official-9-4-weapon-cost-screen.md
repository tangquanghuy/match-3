# GoW 9.4 武器费用官方公告逐项比对（2026-09-26）

原始独立来源：GoW 官方《Update 9.4 Patch Notes》（2026-09-09）；本地归档 `artifacts/gow-skill-audit/gold-primary-sources/update-9-4-patch-notes.html`。

`node scripts/check-gow-9-4-weapon-costs.mjs --write` 从公告 **Early Weapons** 段抽取 18 条明确包含调整前后费用的武器说明，对仓库 `src/data/weapons.json` 和 2026-09-17 抓取的 gowhead 英文快照逐项关联 ID 对比，并保留每条原文与结果：`artifacts/gow-skill-audit/official-9-4-weapon-cost-screen.json`。

- **17/18** 的公告费用与项目、快照相符（只核对费用，不代表该武器完整技能一致）。
- **1/18 来源/版本冲突**：Sword of Heroes（武器 ID 1166，法术 7585），官方 9.4 公告写费用 **5**；9 月 17 日英文快照、native 原始法术与项目均为 **6**。官方公告的基础伤害 +5 与快照一致。是否有后续改动、原始公告笔误或版本差异尚待独立证明；维持该项待验，不直接覆写运行数据，也不以生成器的 full 标签宣布对齐。
- 官方名称 `Flachion of Kings`、`Khopresh of Misery`、`Lance of the Divine` 与快照名称不同，脚本用显式别名关联，绑定对应武器 ID；不做模糊自动匹配。
- 未含费用改动的武器、其它基础数值、分支、效果和回合结算不在本次费用专项证据范围内；逐实体全技能签收仍为 0/2,518。
