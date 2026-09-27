# 技能验收分片 S0050（5 项）

> 本页分工固定，不随每次验收队列重排；状态与签收实时读取账本及本片记录。本页的“核对完成”不等于整项签收。
> 总任务：[技能核对任务书](../TASK-GOW-SKILL-REVIEW.md) · [操作指南](../../../docs/gow-skill-review-operator-guide.md) · [分片状态](STATUS.md)。

| 实体 | 技能 ID | 参考名称 |
|---|---:|---|
| `troop:6230` 龙蛋 | 7372 | DragonEggs |
| `troop:6234` 龙蛾 | 7375 | Dragonmoth |
| `troop:6241` 塞凡尼莫拉 | 7384 | Sylvanimora |
| `troop:6243` 野人猎人 | 7386 | SavageHunter |
| `troop:6256` 药剂师 | 7399 | Apothecary |

## 交付要求

1. 每项原版英文子句／原始步骤／分支与最终原型逐条对照，复用同构测试但保留独立 ID／预期／真实施法证据。
2. 差异先记录复现和影响范围；共享引擎／生成器的修复交协调窗口串行合并。
3. 单独更新本片状态；汇总窗口合并到 `data/audit/gow-skill-reviews.json` 后运行同指纹全量验证，只有账本 `acceptance.accepted` 才计入签收。
