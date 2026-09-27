# 技能验收分片 S0160（5 项）

> 本页分工固定，不随每次验收队列重排；状态与签收实时读取账本及本片记录。本页的“核对完成”不等于整项签收。
> 总任务：[技能核对任务书](../TASK-GOW-SKILL-REVIEW.md) · [操作指南](../../../docs/gow-skill-review-operator-guide.md) · [分片状态](STATUS.md)。

| 实体 | 技能 ID | 参考名称 |
|---|---:|---|
| `troop:6842` 玛坎迪沙 | 8247 | Malcandessa |
| `troop:6846` 疯狂巨魔 | 8251 | CrazedTroll |
| `troop:6854` 利益亚特 | 8273 | Lyriath |
| `troop:6864` 思霜德纳特 | 8286 | Sylfrostenath |
| `troop:6880` 阴犬 | 8303 | Netherhound |

## 交付要求

1. 每项原版英文子句／原始步骤／分支与最终原型逐条对照，复用同构测试但保留独立 ID／预期／真实施法证据。
2. 差异先记录复现和影响范围；共享引擎／生成器的修复交协调窗口串行合并。
3. 单独更新本片状态；汇总窗口合并到 `data/audit/gow-skill-reviews.json` 后运行同指纹全量验证，只有账本 `acceptance.accepted` 才计入签收。
