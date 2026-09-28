# 车道验收第 2 轮（2026-09-28，基线 gow-review-base-4 之后）

规则同 [REVIEW-ROUND-1.md](REVIEW-ROUND-1.md)（车道流程、原语流程、汇报格式）与 [FIX-ROUND-A.md](FIX-ROUND-A.md) 的通用规则。新裁定：R010（移除不给法力、不触发特殊宝石，现状即正确）、R011（祝福只挡负面）、R012（相对目标按目标被杀前位置）。trace 表已在本轮基线刷新。

为避免接口限流，本轮只并发 4 个 agent。

| agent | worktree | 分支 | 任务 |
|---|---|---|---|
| sa-P | `D:\Code\m3-gow-P` | `gow/r2-P` | 实现 R011、R012；处理 `primitive-queue/sa-R1..R5.jsonl` 中未撤回的项 |
| sa-R5 | `D:\Code\m3-gow-R5` | `gow/r2-L1` | L1 召唤／变形／吞噬（先做 16 个魅惑技能） |
| sa-R6 | `D:\Code\m3-gow-F1` | `gow/r2-L2` | L2 随机分支／随机状态 |
| sa-R7 | `D:\Code\m3-gow-F2` | `gow/r2-L3` | L3 回合／法力 |

补充说明：
- `requeue.jsonl` 里有 18 个签收失效的项（技能在签收后又被改过），`next` 会先返回它们；属于别的车道的也请顺手重审（approve 时 `--lane` 用该项所在车道），处理完追加 `{"key":…,"done":true,…}`。
- R012 落地前，“目标被杀后其下方／上方敌人”相关的项先 `issue`（id 写 `R012-pending`），不要按旧行为签收。R011 同理（`R011-pending`）。
- PowerShell 里用 `2>&1 |` 管道跑 approve 会返回退出码 1 但实际成功，不要因此重试（会产生重复签收行）；用 `*> $null` 或看输出文字判断。
