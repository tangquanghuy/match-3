# 技能验收分片 S0051（5 项）

> 本页分工固定，不随每次验收队列重排；状态与签收实时读取账本及本片记录。本页的“核对完成”不等于整项签收。
> 总任务：[技能核对任务书](../TASK-GOW-SKILL-REVIEW.md) · [操作指南](../../../docs/gow-skill-review-operator-guide.md) · [分片状态](STATUS.md)。

| 实体 | 技能 ID | 参考名称 |
|---|---:|---|
| `troop:6273` 大鲨 | 7419 | Sharkey |
| `troop:6279` 巨大毒菌 | 7425 | GiantToadstool |
| `troop:6289` 虚空传送门 | 7435 | VoidPortal |
| `troop:6311` 沼泽扼杀者 | 7461 | MarshStrangler |
| `troop:6315` 德鲁伊教士长 | 7465 | Archdruid |

## 交付要求

1. 每项原版英文子句／原始步骤／分支与最终原型逐条对照，复用同构测试但保留独立 ID／预期／真实施法证据。
2. 差异先记录复现和影响范围；共享引擎／生成器的修复交协调窗口串行合并。
3. 单独更新本片状态；汇总窗口合并到 `data/audit/gow-skill-reviews.json` 后运行同指纹全量验证，只有账本 `acceptance.accepted` 才计入签收。
