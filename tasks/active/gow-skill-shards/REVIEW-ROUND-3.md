# 车道验收第 3 轮（2026-09-28，基线 gow-review-base-5，已验收 1232/2518）

规则同 [REVIEW-ROUND-1.md](REVIEW-ROUND-1.md)（车道流程、原语流程、汇报格式）与 [FIX-ROUND-A.md](FIX-ROUND-A.md) 的通用规则。裁定 R000–R012 全部有效，R010/R011/R012 已在基线落地。

为避免接口限流，本轮只并发 4 个 agent。

| agent | worktree | 分支 | 车道 | 剩余 |
|---|---|---|---|---|
| sa-A | `D:\Code\m3-gow-F1` | `gow/r3-L4a` | L4a 爆炸／摧毁 | 278 |
| sa-B | `D:\Code\m3-gow-F2` | `gow/r3-L4b` | L4b 创造／转换 | 229 |
| sa-C | `D:\Code\m3-gow-F3` | `gow/r3-L5` | L5 状态 | 143 |
| sa-D | `D:\Code\m3-gow-R4` | `gow/r3-L7` | L7 伤害 | 120 |

补充说明：
- 开工先跑 `npx vite-node scripts/gow-trace.ts --lane <L>` 刷新 trace 表（基线行为已变：R012 被杀前位置、计数按原生步骤时刻）。
- `requeue.jsonl` 里签收失效的项 `next` 会先返回；属于别的车道也请顺手重审（approve 用该项所在车道）。
- 需要改公共原语（secondary.ts / targeting.ts / prototypes.ts 等）的，不要自己改，写入 `primitive-queue/sa-<你>.jsonl` 并对该技能 `issue`，下一轮由原语 agent 统一处理。只改 curated 批次和该技能的测试。
- 中文描述与英文／原生不符时，改 curated desc，并在 `src/data/gowSnapshotOverrides.json` 的 `troops[<troopId>]` 加同文覆盖（武器改 `scripts/curated-pools/pool-w*.json`），否则 spellData 测试会失败。
- 每个改动的技能都要 `node scripts/gow-changelog.mjs add` 留档。
- 每 20–30 个技能就 commit 一次（不要提交 src/data/troops.json / weapons.json / traits.json），防止中断丢进度。
- PowerShell：approve 用 `*> $null` 而不是 `2>&1 |`；不要对 node 写文件的命令用 `| Select -First`；`[IO.File]` 只用绝对路径。
