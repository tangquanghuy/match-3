# 车道验收第 4 轮（2026-09-28，基线 gow-review-base-6，已验收 1512/2518）

规则同 [REVIEW-ROUND-3.md](REVIEW-ROUND-3.md)。并发 4 个 agent。

| agent | worktree | 分支 | 任务 |
|---|---|---|---|
| sa-P | `D:\Code\m3-gow-P` | `gow/r4-P` | 原语队列：`primitive-queue/sa-A.jsonl`、`sa-B.jsonl`、`sa-D.jsonl`、`sa-R5.jsonl`、`sa-R6.jsonl`、`sa-R7.jsonl` 中未完成项 + sa-C 的 L5-C-self-submerged-timing（troop:6624，与 P-B-action-status-self-count 同源） |
| sa-A | `D:\Code\m3-gow-F1` | `gow/r4-L4a` | L4a 继续 |
| sa-C | `D:\Code\m3-gow-F3` | `gow/r4-L5` | L5 继续 |
| sa-E | `D:\Code\m3-gow-R5` | `gow/r4-L1` | L1 召唤／变形／吞噬 |

原语 agent 修完一项后：写对应 `gowFix<ID>.test.ts`，跑 golden diff，受影响且已签收的 golden 键用 `approve --lane <所在车道> --by sa-P` 重批（写明原因），未签收的在 progress 里列为 re-review；在 `primitive-queue` 对应行后追加 `{"id":…,"done":true,…}`。
