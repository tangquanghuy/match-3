# 技能验收分片 S0258（5 项）

> 本页分工固定，不随每次验收队列重排；状态与签收实时读取账本及本片记录。本页的“核对完成”不等于整项签收。
> 总任务：[技能核对任务书](../TASK-GOW-SKILL-REVIEW.md) · [操作指南](../../../docs/gow-skill-review-operator-guide.md) · [分片状态](STATUS.md)。

| 实体 | 技能 ID | 参考名称 |
|---|---:|---|
| `troop:7589` 怒爪 | 9468 | Ragepaw |
| `troop:7590` 神圣射手 | 9469 | HolyArcher |
| `troop:7591` 游隼 | 9470 | Peregrine |
| `troop:7598` 红掠夺者 | 9477 | Redreaver |
| `troop:7605` 不朽的亚巴顿 | 9485 | ImmortalAbaddon |

## 交付要求

1. 每项原版英文子句／原始步骤／分支与最终原型逐条对照，复用同构测试但保留独立 ID／预期／真实施法证据。
2. 差异先记录复现和影响范围；共享引擎／生成器的修复交协调窗口串行合并。
3. 单独更新本片状态；汇总窗口合并到 `data/audit/gow-skill-reviews.json` 后运行同指纹全量验证，只有账本 `acceptance.accepted` 才计入签收。
