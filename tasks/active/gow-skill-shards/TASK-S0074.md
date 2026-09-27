# 技能验收分片 S0074（5 项）

> 本页分工固定，不随每次验收队列重排；状态与签收实时读取账本及本片记录。本页的“核对完成”不等于整项签收。
> 总任务：[技能核对任务书](../TASK-GOW-SKILL-REVIEW.md) · [操作指南](../../../docs/gow-skill-review-operator-guide.md) · [分片状态](STATUS.md)。

| 实体 | 技能 ID | 参考名称 |
|---|---:|---|
| `troop:7187` 火焰犀首兽 | 8757 | FlameRhynax |
| `troop:7194` 赛布利斯 | 8781 | Sabellius |
| `troop:7195` 提克娜拉 | 8782 | TrkNala |
| `troop:7199` 石化毒蛇 | 8786 | StoneViper |
| `troop:7206` 切尔诺伯格 | 8793 | Czernobog |

## 交付要求

1. 每项原版英文子句／原始步骤／分支与最终原型逐条对照，复用同构测试但保留独立 ID／预期／真实施法证据。
2. 差异先记录复现和影响范围；共享引擎／生成器的修复交协调窗口串行合并。
3. 单独更新本片状态；汇总窗口合并到 `data/audit/gow-skill-reviews.json` 后运行同指纹全量验证，只有账本 `acceptance.accepted` 才计入签收。
