# 技能验收分片 S0090（5 项）

> 本页分工固定，不随每次验收队列重排；状态与签收实时读取账本及本片记录。本页的“核对完成”不等于整项签收。
> 总任务：[技能核对任务书](../TASK-GOW-SKILL-REVIEW.md) · [操作指南](../../../docs/gow-skill-review-operator-guide.md) · [分片状态](STATUS.md)。

| 实体 | 技能 ID | 参考名称 |
|---|---:|---|
| `troop:7827` 中毒的熊科动物 | 9871 | PoisonedUrsidae |
| `troop:7836` 暴风雨 | 10011 | Tempestus |
| `troop:7849` 风暴守卫 | 9908 | StormGuard |
| `weapon:1054` 雅思敏的弓 | 7120 | YasminesBow |
| `weapon:1057` 岩石大锤 | 7123 | TheStonehammer |

## 交付要求

1. 每项原版英文子句／原始步骤／分支与最终原型逐条对照，复用同构测试但保留独立 ID／预期／真实施法证据。
2. 差异先记录复现和影响范围；共享引擎／生成器的修复交协调窗口串行合并。
3. 单独更新本片状态；汇总窗口合并到 `data/audit/gow-skill-reviews.json` 后运行同指纹全量验证，只有账本 `acceptance.accepted` 才计入签收。
