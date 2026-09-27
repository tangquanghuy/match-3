# 技能验收分片 S0485（5 项）

> 本页分工固定，不随每次验收队列重排；状态与签收实时读取账本及本片记录。本页的“核对完成”不等于整项签收。
> 总任务：[技能核对任务书](../TASK-GOW-SKILL-REVIEW.md) · [操作指南](../../../docs/gow-skill-review-operator-guide.md) · [分片状态](STATUS.md)。

| 实体 | 技能 ID | 参考名称 |
|---|---:|---|
| `troop:6930` 丁克·蒸汽吹哨 | 8408 | TinkSteamwhistle |
| `troop:6957` 科博 | 8457 | Kobold |
| `troop:6959` 科博法师 | 8459 | KoboldMagi |
| `troop:6960` 埃佩里娜莎拉 | 8460 | Emperinazara |
| `troop:6971` 腐恩地格斯 | 8474 | Fundingus |

## 交付要求

1. 每项原版英文子句／原始步骤／分支与最终原型逐条对照，复用同构测试但保留独立 ID／预期／真实施法证据。
2. 差异先记录复现和影响范围；共享引擎／生成器的修复交协调窗口串行合并。
3. 单独更新本片状态；汇总窗口合并到 `data/audit/gow-skill-reviews.json` 后运行同指纹全量验证，只有账本 `acceptance.accepted` 才计入签收。
