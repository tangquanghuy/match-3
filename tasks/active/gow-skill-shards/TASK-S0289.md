# 技能验收分片 S0289（5 项）

> 本页分工固定，不随每次验收队列重排；状态与签收实时读取账本及本片记录。本页的“核对完成”不等于整项签收。
> 总任务：[技能核对任务书](../TASK-GOW-SKILL-REVIEW.md) · [操作指南](../../../docs/gow-skill-review-operator-guide.md) · [分片状态](STATUS.md)。

| 实体 | 技能 ID | 参考名称 |
|---|---:|---|
| `weapon:1364` 钴蓝魔法棒 | 8399 | CobaltineWand |
| `weapon:1367` 酒锤子 | 8402 | KegsCrusher |
| `weapon:1370` 修补匠齿轮刃 | 8409 | TinkersBuzzblade |
| `weapon:1371` 艾达扎尓魔法棒 | 8432 | EldraziWand |
| `weapon:1372` 尖叫鬼卷 | 8434 | ScreamingTome |

## 交付要求

1. 每项原版英文子句／原始步骤／分支与最终原型逐条对照，复用同构测试但保留独立 ID／预期／真实施法证据。
2. 差异先记录复现和影响范围；共享引擎／生成器的修复交协调窗口串行合并。
3. 单独更新本片状态；汇总窗口合并到 `data/audit/gow-skill-reviews.json` 后运行同指纹全量验证，只有账本 `acceptance.accepted` 才计入签收。
