# 无人值守车道验收 + 修复 运行手册（2026-09-28 v2）

适用于协调窗口派出的子 agent。角色两种：**车道 agent**（核对＋签收＋改本车道技能自己的定义）和**原语 agent**（独占公共引擎，处理原语队列）。上位规则：[DISPATCH-2026-09-28.md](DISPATCH-2026-09-28.md)、[操作指南](../../../docs/gow-skill-review-operator-guide.md)、裁定 [rulings/](rulings/)。

v2 变更（用户决定）：**不再记录任何文件哈希**；取消全局 `src` 锁；车道 agent 不改公共引擎、不跑全量测试。

## 1. 工具

| 命令 | 用途 |
|---|---|
| `node scripts/gow-review-scaffold.mjs next --lane <L> --count 10` | 取下一批 10 个 key（先返回 requeue，跳过已签收／已被记录的项） |
| `node scripts/gow-signoff.mjs show --keys k1,k2` | 打印对照所需：英文子句、原生步骤、费用颜色、中文、最终原型 |
| `node scripts/gow-signoff.mjs accept --lane <L> --by <agent> --test <测试文件> --keys k1,k2 [--note "…"] [--waive "troop:7501:clause:c2:boss"]` | 签收（每项一行，写入 `lane-<L>/signoffs.jsonl`） |
| `node scripts/gow-signoff.mjs issue --lane <L> --by <agent> --keys k1 --id <问题id> --note "<一句话>"` | 登记有问题的项 |
| `node scripts/gow-signoff.mjs check --lane <L>` | 检查 key、测试文件、豁免是否合法 |
| `node scripts/gow-lock.mjs acquire --name <文件路径> --owner <agent> --wait 300` / `release …` | **单文件**锁，只用于 §4 的技能定义文件 |
| `node scripts/gow-changelog.mjs add …` | 改动留档（必做） |
| `node scripts/audit-gow-skills.mjs` | 重建账本（约 3 秒） |

## 2. 文件归属

| 文件 | 谁可以改 | 方式 |
|---|---|---|
| `lane-<L>/`、`tests/unit/gowLane<L>*.test.ts` | 本车道 agent | 直接改 |
| `src/engine/skills/curated/*.ts`、`src/data/gowWeaponReviewedOverrides.json`、`src/data/gowSnapshotOverrides.json`、`scripts/curated-pools/*.json` | 车道 agent（只改本车道技能的条目） | 单文件锁，持锁 ≤ 5 分钟 |
| 其余 `src/engine/**`（effects/*、targeting、prototypes.ts、TurnEngine、builders…）、`scripts/lib/**`、核心单测 | **只有原语 agent** | 独占，无需锁 |
| `requeue.jsonl`、`primitive-queue.jsonl`、`CHANGES.jsonl`、`gold-primary-sources/` 新文件 | 所有人 | 只追加 |
| `data/audit/*`、`verification-receipt.json`、`verify-gow-snapshot.mjs`、git 写操作 | 仅协调窗口 | — |

## 3. 车道 agent：每批（10 项）

**签收记录只写结论**（用户决定 2026-09-28）：通过的项一行 `accept`，有问题的项一行 `issue`（问题 id + 一句话）。不写维度、子句、步骤说明，不用 scaffold 骨架。问题细节写在 `issues.json`。

1. `next --count 10` → `progress.md` 追加 `Bnn start <keys>` → `gow-signoff.mjs show`。requeue 来的 key 处理完追加 `{"key":…,"done":true,…}`。
2. 三方对照：英文子句 ↔ 原生 `SpellSteps`（有序、每个字段）↔ 最终原型；spell id、费用、颜色、中文描述；武器核数字 ID 与 `gw_<referenceName>`。
3. **同形态表驱动**：同一原生步骤形态的项放进一个参数表共用一套断言，每项仍有独立实体 ID 与独立期望值；真实 `TurnEngine.castSkill`、双方阵营、至少一条负例。只写当前一致的行为；差异复现写 `…Repro.test.ts` 且必须 `it.fails`。
4. 判定（测试通过后再写签收行）：
   - 一致 → `gow-signoff.mjs accept`。
   - R000 豁免 → `accept` 加 `--waive "<key>:clause|step:<id>:<mode>"`，其余部分照常验证。
   - 差异只在本技能定义里（顺序、目标、数值、池、缺步骤、中文） → §4 自己修，修完 accept。
   - 差异在公共原语 → 追加一行到 `primitive-queue.jsonl`（`{"id","keys","summary","repro","by","at"}`），该项 `gow-signoff.mjs issue`，**立即继续下一项，不等**。
   - 来源不明 → §6；不能定则 `issue`，`issues.json` 标 `source-dispute`。
5. `npx vitest run tests/unit/gowLane<L>B<NN>*.test.ts` 通过 → `gow-signoff.mjs check` 通过 → `progress.md` 追加 `Bnn done accept=a issue=i waived=w fixed=f`。
   签收后若该技能被任何人改动（`CHANGES.jsonl` 里出现它的技能 ID 或 key，时间晚于签收），签收自动失效，需重新 accept。所以**改技能必须写 changelog**。
6. **不跑全量测试、不跑 tsc 全量**（协调窗口合并时统一跑，失败会退回）。每 3 批跑一次 `npx vitest run tests/unit/gowLane<L>` 确认本车道全部绿。

## 4. 车道 agent：改本车道技能定义

1. `acquire --name <那个文件路径>`（例如 `src/engine/skills/curated/batch-r15.ts`），改前重读文件。
2. 只改相关技能条目；武器同步 `gowWeaponReviewedOverrides.json`，中文改生成源头后重建产物。
3. 跑本技能的 lane 测试 + `npx vitest run tests/unit -t <spellId>`（若有）→ release。持锁 ≤ 5 分钟，超时先 release 再想。
4. `node scripts/gow-changelog.mjs add --by <agent> --issue <id> --kind assembler|data --files "<文件>" --spells <技能ID> --keys <实体> --before "<改前>" --after "<改后>"`。
5. 修完直接对该项 `accept`（签收时间晚于 changelog 条目即有效）。

## 5. 原语 agent

- 按 `primitive-queue.jsonl` 顺序处理（跳过已有 `{"id":…,"done":true}` 行的）。先在 `tests/unit/gowFix<id>.test.ts` 写失败用例，再改，反查调用方。
- 每个修复后：全量 `npx vitest run` 不得新增失败（同步修改断言旧行为的测试，含车道测试中对应的 `it.fails` → `it`），`npx tsc --noEmit` 0 新错误，`audit-gow-skills`，`stale` → requeue，changelog `--kind primitive --affects "<影响面>"`，队列追加 done 行。
- 来源不明的原语问题：按 §5 查证并写 `rulings/R<nn>-<slug>.md` 提议；新增 R006 约定项只能由协调窗口决定。

## 6. 来源查证

先查 `rulings/`、`scripts/spell-rules.md`、`.kiro/specs/combat-mechanics/DECISIONS.md`、`GOW-STATUS-RESEARCH.md`、`gold-primary-sources/`。再联网：官方 > 社区数据库 > 社区讨论。能定案的页面要点存 `gold-primary-sources/`（新文件，复述不照抄）。

## 7. 断点与限流

- 每个动作后立刻追加 `progress.md`；开工先读它，已 done 的批跳过。
- 开工先 `gow-lock.mjs list`，自己持有的锁检查后 release。锁 10 分钟无更新视为失效。
- 命令失败重试 3 次，仍失败记 `env-blocked` 继续。
- 上下文吃紧就在批边界停下汇报，不要硬撑。
- 管道里不要用 `| Select -First`（会杀掉 node 进程导致写文件失败）；写文件用绝对路径。

## 8. 汇报格式

```
<role> <lane> round <n>: reviewed N (accept A / draft D / waived W), own-fixes F, queued-to-primitive Q
fixes: <id>: <文件> <技能ID> <摘要>; changelog entries C
open: <id> <key> <kind> <一句话>
tests: <文件数> files, <通过数> passed
```
