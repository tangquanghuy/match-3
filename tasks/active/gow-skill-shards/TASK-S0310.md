# 技能验收分片 S0310（5 项）

> 本页分工固定，不随每次验收队列重排；状态与签收实时读取账本及本片记录。本页的“核对完成”不等于整项签收。
> 总任务：[技能核对任务书](../TASK-GOW-SKILL-REVIEW.md) · [操作指南](../../../docs/gow-skill-review-operator-guide.md) · [分片状态](STATUS.md)。

| 实体 | 技能 ID | 参考名称 |
|---|---:|---|
| `weapon:1637` 注定失败的索特雷尔 | 9585 | DoomedSauterelle |
| `weapon:1638` 唤石者 | 9628 | Stonecaller |
| `weapon:1658` 卡格莱克斯之斧 | 9747 | AxeOfKragRax |
| `weapon:1665` 狐狸牙 | 9754 | VulpineFangs |
| `weapon:1675` 死胡同 | 9832 | DeadEnd |

## 交付要求

1. 每项原版英文子句／原始步骤／分支与最终原型逐条对照，复用同构测试但保留独立 ID／预期／真实施法证据。
2. 差异先记录复现和影响范围；共享引擎／生成器的修复交协调窗口串行合并。
3. 单独更新本片状态；汇总窗口合并到 `data/audit/gow-skill-reviews.json` 后运行同指纹全量验证，只有账本 `acceptance.accepted` 才计入签收。
