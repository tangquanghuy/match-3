# 技能验收分片 S0388（5 项）

> 本页分工固定，不随每次验收队列重排；状态与签收实时读取账本及本片记录。本页的“核对完成”不等于整项签收。
> 总任务：[技能核对任务书](../TASK-GOW-SKILL-REVIEW.md) · [操作指南](../../../docs/gow-skill-review-operator-guide.md) · [分片状态](STATUS.md)。

| 实体 | 技能 ID | 参考名称 |
|---|---:|---|
| `troop:7624` 格里姆博恩·血眼 | 9533 | GrimbornBloodeye |
| `troop:7634` 木材腐烂 | 9538 | WoodRot |
| `troop:7639` 腐烂的蛇 | 9543 | RottingSerpent |
| `troop:7641` 查格里麦克斯 | 9545 | Chargrimax |
| `troop:7643` 泥行者 | 9547 | Mudwalker |

## 交付要求

1. 每项原版英文子句／原始步骤／分支与最终原型逐条对照，复用同构测试但保留独立 ID／预期／真实施法证据。
2. 差异先记录复现和影响范围；共享引擎／生成器的修复交协调窗口串行合并。
3. 单独更新本片状态；汇总窗口合并到 `data/audit/gow-skill-reviews.json` 后运行同指纹全量验证，只有账本 `acceptance.accepted` 才计入签收。
