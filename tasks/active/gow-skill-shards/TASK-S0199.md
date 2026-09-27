# 技能验收分片 S0199（5 项）

> 本页分工固定，不随每次验收队列重排；状态与签收实时读取账本及本片记录。本页的“核对完成”不等于整项签收。
> 总任务：[技能核对任务书](../TASK-GOW-SKILL-REVIEW.md) · [操作指南](../../../docs/gow-skill-review-operator-guide.md) · [分片状态](STATUS.md)。

| 实体 | 技能 ID | 参考名称 |
|---|---:|---|
| `weapon:1655` 被遗忘的螺栓 | 9693 | ForgottenBolt |
| `weapon:1659` 地狱血红宝石 | 9748 | InfernalBloodruby |
| `weapon:1661` 布尔克利弗 | 9750 | Bullcleaver |
| `weapon:1664` 龙之威力 | 9753 | DraconicMight |
| `weapon:1674` 血红的奉献 | 9831 | SanguineDevotion |

## 交付要求

1. 每项原版英文子句／原始步骤／分支与最终原型逐条对照，复用同构测试但保留独立 ID／预期／真实施法证据。
2. 差异先记录复现和影响范围；共享引擎／生成器的修复交协调窗口串行合并。
3. 单独更新本片状态；汇总窗口合并到 `data/audit/gow-skill-reviews.json` 后运行同指纹全量验证，只有账本 `acceptance.accepted` 才计入签收。
