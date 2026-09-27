# 技能验收分片 S0287（5 项）

> 本页分工固定，不随每次验收队列重排；状态与签收实时读取账本及本片记录。本页的“核对完成”不等于整项签收。
> 总任务：[技能核对任务书](../TASK-GOW-SKILL-REVIEW.md) · [操作指南](../../../docs/gow-skill-review-operator-guide.md) · [分片状态](STATUS.md)。

| 实体 | 技能 ID | 参考名称 |
|---|---:|---|
| `weapon:1314` 琥珀长枪 | 8313 | AmberPartizan |
| `weapon:1315` 炼狱镰枪 | 8314 | InfernalVoulge |
| `weapon:1316` 萤火虫之坠 | 8315 | Firefly |
| `weapon:1353` 亚兰之花 | 8383 | AranaeanBloom |
| `weapon:1354` 绿植水晶 | 8384 | ArborealCrystal |

## 交付要求

1. 每项原版英文子句／原始步骤／分支与最终原型逐条对照，复用同构测试但保留独立 ID／预期／真实施法证据。
2. 差异先记录复现和影响范围；共享引擎／生成器的修复交协调窗口串行合并。
3. 单独更新本片状态；汇总窗口合并到 `data/audit/gow-skill-reviews.json` 后运行同指纹全量验证，只有账本 `acceptance.accepted` 才计入签收。
