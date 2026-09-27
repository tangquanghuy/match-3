# 技能验收分片 S0296（5 项）

> 本页分工固定，不随每次验收队列重排；状态与签收实时读取账本及本片记录。本页的“核对完成”不等于整项签收。
> 总任务：[技能核对任务书](../TASK-GOW-SKILL-REVIEW.md) · [操作指南](../../../docs/gow-skill-review-operator-guide.md) · [分片状态](STATUS.md)。

| 实体 | 技能 ID | 参考名称 |
|---|---:|---|
| `weapon:1437` 乱砍一通 | 8669 | HackJob |
| `weapon:1438` 翡翠刃 | 8670 | EmeraldBlade |
| `weapon:1448` 食匕首 | 8706 | Gobsticker |
| `weapon:1449` 墓地领主勾仗 | 8707 | TombLordsCrook |
| `weapon:1450` 发光内核 | 8708 | GlowingCore |

## 交付要求

1. 每项原版英文子句／原始步骤／分支与最终原型逐条对照，复用同构测试但保留独立 ID／预期／真实施法证据。
2. 差异先记录复现和影响范围；共享引擎／生成器的修复交协调窗口串行合并。
3. 单独更新本片状态；汇总窗口合并到 `data/audit/gow-skill-reviews.json` 后运行同指纹全量验证，只有账本 `acceptance.accepted` 才计入签收。
