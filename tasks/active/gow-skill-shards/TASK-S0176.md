# 技能验收分片 S0176（5 项）

> 本页分工固定，不随每次验收队列重排；状态与签收实时读取账本及本片记录。本页的“核对完成”不等于整项签收。
> 总任务：[技能核对任务书](../TASK-GOW-SKILL-REVIEW.md) · [操作指南](../../../docs/gow-skill-review-operator-guide.md) · [分片状态](STATUS.md)。

| 实体 | 技能 ID | 参考名称 |
|---|---:|---|
| `troop:7487` 塔克沙克 | 9220 | Takshaka |
| `troop:7494` 女王之书 | 9239 | BookOfWitches |
| `troop:7496` 贝尔洛克 | 9241 | Bearlock |
| `troop:7524` 法老哈夫鲁 | 9314 | PharaohKhafru |
| `troop:7561` 有翼驴 | 9346 | WingedDonkey |

## 交付要求

1. 每项原版英文子句／原始步骤／分支与最终原型逐条对照，复用同构测试但保留独立 ID／预期／真实施法证据。
2. 差异先记录复现和影响范围；共享引擎／生成器的修复交协调窗口串行合并。
3. 单独更新本片状态；汇总窗口合并到 `data/audit/gow-skill-reviews.json` 后运行同指纹全量验证，只有账本 `acceptance.accepted` 才计入签收。
