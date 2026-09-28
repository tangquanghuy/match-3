# 车道验收第 1 轮（2026-09-28，基线 = main 最新提交）

每个 agent 一个 worktree + 分支，不用锁。协调窗口按完成顺序把分支合回 `main`，合并后统一重建产物并跑全量验证。规则继承 [FIX-ROUND-A.md](FIX-ROUND-A.md) 的“通用规则”（worktree 内工作、changelog 留档、不跑 gow-trace、不提交生成产物、每约 10 项提交一次、断点文件）。新增裁定：R008（魅惑＝暂时负面状态）、R009（巨人/龙宝石已存在）。

| agent | worktree | 分支 | 车道 |
|---|---|---|---|
| sa-P | `D:\Code\m3-gow-P` | `gow/r1-P` | 原语队列 `primitive-queue/*.jsonl` |
| sa-R1 | `D:\Code\m3-gow-F1` | `gow/r1-L4a` | L4a 爆破／摧毁／风暴 |
| sa-R2 | `D:\Code\m3-gow-F2` | `gow/r1-L4b` | L4b 创造／转换 |
| sa-R3 | `D:\Code\m3-gow-F3` | `gow/r1-L5` | L5 状态 |
| sa-R4 | `D:\Code\m3-gow-R4` | `gow/r1-L7` | L7 纯伤害（再做 L6） |
| sa-R5 | `D:\Code\m3-gow-R5` | `gow/r1-L1` | L1 召唤／变形／吞噬（含 16 个魅惑技能） |

## 车道 agent 流程

1. 取批：`node scripts/gow-review-scaffold.mjs next --lane <L> --count 10`（自动跳过已有签收或 issue 的项）。
2. 对照：`tasks/active/gow-skill-shards/trace/<L>.md` 对应行（英文、原生步骤、实际 L10、击杀 K）；要看 R10/L0 或刷新后的结果用 `npx vite-node scripts/gow-golden.ts show --keys k1,k2,…`（修改技能后必须用 show，trace 表不会更新）。
   - **逐项核对数值**：伤害/增益 = 公式按魔法 10 手算；目标（最强＝生命+护甲 R005、队首、随机不重复 R007）；数量；状态；宝石颜色与数量；顺序（R001）；击杀分支。没有提示不等于正确。
   - 默认场景看不出的（按种族/颜色/王国盟友增强、阈值、免疫、特殊棋盘）：用 `tests/helpers/gowCast.ts` 的 `castSpell({key, allies:[…], board:…})` 写表驱动测试到 `tests/unit/gowLane<L>R1.test.ts`，approve 时 `--test` 带上该文件。
3. 结论（一批一条命令）：
   - 一致 → `npx vite-node scripts/gow-golden.ts approve --lane <L> --by <agent> --keys k1,k2,… [--test …] [--waive "k:clause:c2:boss"]`
   - 技能定义错 → 改 `src/engine/skills/curated/*.ts`（武器同步 `src/data/gowWeaponReviewedOverrides.json`；中文改源头）→ `node scripts/gow-changelog.mjs add …` → `node scripts/audit-gow-skills.mjs` → `show` 复核 → 跑引用该技能 ID 的测试文件 → approve。
   - 公共原语问题 → 追加 `tasks/active/gow-skill-shards/primitive-queue/<agent>.jsonl`，该项 `node scripts/gow-signoff.mjs issue --lane <L> --by <agent> --keys k --id <id> --note "…"`，继续。
   - 来源不明 → `issue`，note 写疑点。
4. 每批后在 `tasks/active/gow-skill-shards/fix-queue/<agent>-progress.md` 追加一行（`Bnn keys… approve=a fixed=f issue=i`），每 1–2 批在分支上提交一次。
5. 目标：本轮尽量多，上下文吃紧就提交并停下汇报。

## 原语 agent（sa-P）

处理 `primitive-queue/sa-F1.jsonl`、`sa-F2.jsonl`、`sa-F3.jsonl`（`P-F1-giant-dragon-gems` 按 R009 撤回；`P-F1-harness-status-leak` / `P-F2-harness-shared-statuses` 已在 main 修复，撤回）。另：按 R008 处理 `tests/unit/gowLaneL1B02Repro.test.ts` 中 L1-charm-instant 的 `it.fails`，确认魅惑在 R004 可自愈负面状态集合内。每项：失败用例 → 修 → 全量 vitest（除 invasionRanks/troopPortrait 缺图外全绿）+ tsc → `gow-golden.ts diff` 列出变化项（写进 progress，不自己 approve）→ changelog → 提交。

## 汇报格式

```
<agent> <lane>: reviewed N; approved A; fixed F (changelog C); issues I; queued Q; commits K
fixes: <key>/<spellId>: <一句话>
open: <key> <id> <一句话>
```
