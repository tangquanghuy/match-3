# 技能验收分片 S0293（5 项）

> 本页分工固定，不随每次验收队列重排；状态与签收实时读取账本及本片记录。本页的“核对完成”不等于整项签收。
> 总任务：[技能核对任务书](../TASK-GOW-SKILL-REVIEW.md) · [操作指南](../../../docs/gow-skill-review-operator-guide.md) · [分片状态](STATUS.md)。

| 实体 | 技能 ID | 参考名称 |
|---|---:|---|
| `weapon:1397` 暗火长枪 | 8518 | DarkfireSpear |
| `weapon:1400` 海盗印戒 | 8487 | PiratesSignet |
| `weapon:1401` 工程师电钻 | 8490 | TheEngineersDrill |
| `weapon:1402` 狂野屠刀 | 8505 | WildCleaver |
| `weapon:1403` 抽你！ | 8506 | Whump! |

## 交付要求

1. 每项原版英文子句／原始步骤／分支与最终原型逐条对照，复用同构测试但保留独立 ID／预期／真实施法证据。
2. 差异先记录复现和影响范围；共享引擎／生成器的修复交协调窗口串行合并。
3. 单独更新本片状态；汇总窗口合并到 `data/audit/gow-skill-reviews.json` 后运行同指纹全量验证，只有账本 `acceptance.accepted` 才计入签收。
