# 当前任务状态：仅技能一致性验收

截至 2026-09-27，唯一 active 任务书：[`TASK-GOW-SKILL-REVIEW.md`](TASK-GOW-SKILL-REVIEW.md)。其他 11 份已退出执行，保留在 [`tasks/reference/`](../reference/)；未完成事项是历史待办，不代表完成。

| 指标 | 当前快照 | 判定 |
|---|---:|---|
| 原版实体 | 2,518（部队 1,800／武器 718） | 范围固定；13 项自设单列 |
| 整项验收 | 26 / 2,518 | 仅当前指纹完整证据计数 |
| 已知差异 | 2 项 | `troop:7468`／9185；`weapon:1498`／8869 |
| 未决 | 2,490 项 | 不将单段形状或单测通过视为验收 |
| 最近全量凭证 | `artifacts/gow-skill-audit/verification-receipt.json` | 2026-09-27，8,560 通过，0 失败，类型检查通过；每次改动后重验 |

分片执行：固定 **504 片**，每片 5 项（末片 3 项）；多个窗口各领 1／2 片。进度见[分片看板](gow-skill-shards/STATUS.md)，逐片状态见[机器账](gow-skill-shards/STATUS.json)；人工核对和整项签收分开统计。

下一批：先以当前源码和快照复核剩余溅射／散射多段（`docs/gow-damage-family-check.md`）及两个已确认差异；然后按有序原始步骤的同构组逐实体扩大验收。详见[操作指南](../../docs/gow-skill-review-operator-guide.md)。

本批四子窗口完成 S0001–S0016 共 80 项先导核对，并对 18 项补逐实体签收记录；协调窗口新增两份真实施法测试并完成全量验证。新增签收 `troop:6614`、`troop:6615`、`troop:6616`、`weapon:1001`、`weapon:1002`、`weapon:1004`、`weapon:1017`，**19 → 26**；验证指纹 `fdfdf8e0b23dbd9d61966385f1c9482341c69f0bddb4d0f671e5f8df7ad2ed5d`。本批技能实现无修改，发现的待修及缺证项见 [批次报告](gow-skill-shards/REPORT-2026-09-27-fast-batch.md)。

更新本表时同步写明当批实体 ID、修复文件、复现／负例、全量凭证指纹及最终签收增量；对无来源依据的规则保留已记录裁定。
