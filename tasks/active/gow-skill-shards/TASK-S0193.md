# 技能验收分片 S0193（5 项）

> 本页分工固定，不随每次验收队列重排；状态与签收实时读取账本及本片记录。本页的“核对完成”不等于整项签收。
> 总任务：[技能核对任务书](../TASK-GOW-SKILL-REVIEW.md) · [操作指南](../../../docs/gow-skill-review-operator-guide.md) · [分片状态](STATUS.md)。

| 实体 | 技能 ID | 参考名称 |
|---|---:|---|
| `weapon:1524` 齿轮手枪 | 8996 | Gearslinger |
| `weapon:1528` 天使之怒 | 8972 | AngelsFury |
| `weapon:1530` 鳞片之刃 | 9019 | ScaledBlade |
| `weapon:1537` 银剑 | 9037 | SilverSaber |
| `weapon:1538` 红宝石猕猴 | 9032 | TheRubyMacaque |

## 交付要求

1. 每项原版英文子句／原始步骤／分支与最终原型逐条对照，复用同构测试但保留独立 ID／预期／真实施法证据。
2. 差异先记录复现和影响范围；共享引擎／生成器的修复交协调窗口串行合并。
3. 单独更新本片状态；汇总窗口合并到 `data/audit/gow-skill-reviews.json` 后运行同指纹全量验证，只有账本 `acceptance.accepted` 才计入签收。
