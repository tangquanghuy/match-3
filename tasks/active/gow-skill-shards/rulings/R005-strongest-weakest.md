# R005 最强／最弱目标口径（协调裁定，2026-09-28）

原生 `StrongestEnemy`、`WeakestEnemy`、`TwoStrongestEnemies`、`TwoWeakestEnemies`、`StrongestAlly`、`WeakestAlly` 等目标：
- 强弱按**当前生命 + 当前护甲之和**比较（“有效生命”），不看攻击或魔法。
- 同分时随机取其一。为保证测试可复现，引擎用当前 RNG 在同分者中抽取；测试固定种子。
- 取 N 个时依次取最大（最小）的 N 个存活目标；存活数不足 N 时全部命中。

依据：已入库 `gold-primary-sources/community-2018-08-02-weakest-life-plus-armor.json`（t/43465），另一处社区回答 https://community.gemsofwar.com/t/does-shadow-hunter-have-a-glitched/74294 说法相同（最强＝护甲与生命合计，同分时命中其一）。无官方反例。

现行实现只比较生命，属于公共原语差异（`targeting.ts`、`scripts/spell-rules.md`）。修复后要反查全部约 70 个使用这些目标的原生步骤；受影响的已签收项写入 requeue。

来源问题：L7-6352-b、L5-008（最弱部分）、L4b-strongest-metric。
