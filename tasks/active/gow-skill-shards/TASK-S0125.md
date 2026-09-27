# 技能验收分片 S0125（5 项）

> 本页分工固定，不随每次验收队列重排；状态与签收实时读取账本及本片记录。本页的“核对完成”不等于整项签收。
> 总任务：[技能核对任务书](../TASK-GOW-SKILL-REVIEW.md) · [操作指南](../../../docs/gow-skill-review-operator-guide.md) · [分片状态](STATUS.md)。

| 实体 | 技能 ID | 参考名称 |
|---|---:|---|
| `troop:7640` 墓穴之赫尔德 | 9544 | HeldrTheGrave |
| `troop:7648` 芙洛蕾拉夫人 | 9552 | LadyFlorella |
| `troop:7651` 不朽的双子座 | 9565 | ImmortalGemini |
| `troop:7660` 杜加尔·拉姆霍恩 | 9588 | DugallRamhorn |
| `troop:7665` 西伯恩骑士 | 9593 | SeabornKnight |

## 交付要求

1. 每项原版英文子句／原始步骤／分支与最终原型逐条对照，复用同构测试但保留独立 ID／预期／真实施法证据。
2. 差异先记录复现和影响范围；共享引擎／生成器的修复交协调窗口串行合并。
3. 单独更新本片状态；汇总窗口合并到 `data/audit/gow-skill-reviews.json` 后运行同指纹全量验证，只有账本 `acceptance.accepted` 才计入签收。
