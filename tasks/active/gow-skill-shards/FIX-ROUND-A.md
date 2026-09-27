# 修复轮 A（2026-09-28，基线 `gow-review-base-2` = 7fab5f3）

4 个子 agent，各自一个 git worktree + 分支，**互不共享文件、不用锁**。协调窗口最后把分支合回 `main`，重新生成产物并跑全量验证。

| agent | worktree | 分支 | 任务 |
|---|---|---|---|
| sa-P | `D:\Code\m3-gow-P` | `gow/P` | 公共原语：`tasks/active/gow-skill-shards/primitive-queue.jsonl` 7 项 |
| sa-F1 | `D:\Code\m3-gow-F1` | `gow/F1` | `fix-queue/F1.md`（车道 L1+L2+L3，75 项） |
| sa-F2 | `D:\Code\m3-gow-F2` | `gow/F2` | `fix-queue/F2.md`（车道 L4a+L4b，65 项） |
| sa-F3 | `D:\Code\m3-gow-F3` | `gow/F3` | `fix-queue/F3.md`（车道 L5+L6+L7，38 项） |

## 通用规则

- 所有命令在自己的 worktree 里跑（工具的 `cwd` 参数设为 worktree 路径，不用 `cd`）；写文件用绝对路径，且路径必须在自己的 worktree 内。**不要碰 `D:\Code\match-3` 主目录。**
- 必读：`tasks/active/gow-skill-shards/RUNBOOK-UNATTENDED.md` §3（签收＝`gow-golden.ts approve`）、`rulings/` 全部（R000–R007）。
- 不记录任何文件哈希；签收只写结论（accept 或 issue）。
- **每个运行时改动都要留档**：`node scripts/gow-changelog.mjs add --by <agent> --issue <id> --kind primitive|assembler|data --files "…" --spells <技能ID> --keys <实体> --before "…" --after "…"`，它写到 `changes/<agent>.jsonl`（各 agent 独立文件，合并不冲突）。
- 不要运行 `scripts/gow-trace.ts`（会重写全部车道的 trace 表，合并时冲突）。看某项的 4 个场景用 `npx vite-node scripts/gow-golden.ts show --keys k`。改完技能后先跑 `node scripts/audit-gow-skills.mjs` 刷新本地账本（`artifacts/` 不入库）。
- 不要提交生成产物 `src/data/troops.json`、`src/data/weapons.json`、`src/data/traits.json`：本地可以重建用于测试，提交前 `git checkout -- <这些文件>`。改中文描述只改源头（`src/data/gowSnapshotOverrides.json`、curated 描述、`scripts/curated-pools/*`），协调窗口合并后统一重建。
- 已知环境问题：`invasionRanks.test.ts`、`troopPortrait.test.ts` 在 worktree 里因缺少未入库图片而失败，与技能无关，忽略。
- 断点：在 `tasks/active/gow-skill-shards/fix-queue/<agent>-progress.md` 每处理一项追加一行（`- <ISO> <key> fixed|approved|issue|queued <一句话>`）。开工先读它。
- **每处理完约 10 项就在自己的分支上提交一次**（只 `git add` 自己改的具体文件，`git commit -m "gow(<agent>): …"`；不 push、不 merge、不改 git 配置）。上下文吃紧时先提交再停下汇报。

## 修复 agent（sa-F1/F2/F3）

可改：`src/engine/skills/curated/*.ts`、`src/data/gowWeaponReviewedOverrides.json`（武器改动必须同步这里，否则生成器会回滚）、`src/data/gowSnapshotOverrides.json`、`scripts/curated-pools/*.json`、自己车道的 `tasks/active/gow-skill-shards/lane-<L>/`、`tests/unit/gowLane<L>*.test.ts`、自己的 `changes/`、`primitive-queue/<agent>.jsonl`、`fix-queue/<agent>-progress.md`。
**不可改**：`src/engine/**` 中 curated 以外的文件、`scripts/lib/**`、核心单测、别的车道目录。

逐项（按队列顺序）：
1. `gow-golden.ts show` + 队列表里的英文/原生步骤，判断提示是真差异还是误报（条件未触发、默认场景看不出来、随机分支）。
2. 误报且行为与英文+原生一致 → 直接 `npx vite-node scripts/gow-golden.ts approve --lane <该项车道> --by <agent> --keys <key>`。
3. 技能自身定义的差异（步骤顺序 R001、目标、数值、缺步骤、池、击杀分支、中文）→ 改 curated/覆盖文件 → changelog → `audit-gow-skills` → `show` 复核 → 跑引用该技能 ID 的测试文件（`Select-String -Path tests\unit\*.ts -Pattern "<spellId>" -List`）和 `tests/unit/gowCastGolden.test.ts` → approve。旧测试断言了旧行为就改成新行为。
4. 公共原语问题 → 追加到 `tasks/active/gow-skill-shards/primitive-queue/<agent>.jsonl`（`{"id","keys","summary","repro"}`），该项 `node scripts/gow-signoff.mjs issue --lane <L> --by <agent> --keys <key> --id <id> --note "…"`，继续下一项。
5. 来源不明且 rulings 未覆盖 → `issue`（note 写清疑点），继续。
6. 签收前如果默认场景显示不出某个加成（种族/颜色/王国计数、阈值），用 `tests/helpers/gowCast.ts` 的 `castSpell({key, allies:[…], board:…})` 写表驱动小测试放进 `tests/unit/gowLane<L>Fix<agent>.test.ts`，approve 时加 `--test <该文件>`。

## 原语 agent（sa-P）

可改 `src/engine/**`、`scripts/lib/**`、任何测试（为新行为更新旧断言）。按 `primitive-queue.jsonl` 顺序处理（P-charm-instant 先查证，来源一致才实现，否则写 `rulings/R008-charm.md` 提议并跳过）。每条：先写 `tests/unit/gowFix<id>.test.ts` 失败用例 → 修 → 全量 `npx vitest run`（除上面两条环境失败外必须全绿）+ `npx tsc --noEmit` → `audit-gow-skills` → `npx vite-node scripts/gow-golden.ts diff`，把行为变化的已签项列进 `fix-queue/sa-P-progress.md`（它们要重审，不要自己 approve）→ changelog（`--kind primitive --affects "…"`）→ 提交。

## 汇报格式

```
<agent>: processed N / queue M; approved A; fixed F (changelog C); issues I; queued-to-primitive Q; commits K
fixes: <key>/<spellId>: <一句话>
open: <key> <issue id> <一句话>
```
