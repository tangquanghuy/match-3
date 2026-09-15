# 任务书 · 特殊状态批验收与提交（阶段 0，最先执行）

> 必读：`TASK-MASTER-PLAN.md`（总纲+共同约定）、`PARALLEL-WORK.md`。
> 你是本任务唯一窗口；完成后在 `PARALLEL-WORK.md` 台账登记，并在文末验收记录节填结果。

## 背景

另一窗口已实现「特殊状态批次」（死亡标记/诅咒等 GoW 状态研究落地），**改动完整在工作区但零提交**。窗口 D 已做过初验：lint 0 错、57 文件/613 用例全绿、build 通过。你的任务：深审 → 分逻辑块提交 → 更新文档口径 → 解冻主树。

在途改动清单（`git status`）：
- 引擎：`CombatResolver/GravitySystem/ManaDistributor/TurnEngine/events/skills/effects/{damage,status}/traits/types`
- 渲染：`App/EventStreamPlayer/SkillTestPage/StormIndicator/TeamView/statusBadges`
- 数据与生成器：`scripts/build_traits.mjs`、`src/data/traits.json`（268 code，含 battleStartStorm 5 code）
- 会话：`BattleSession.ts`
- 测试：7 个既有文件修改 + `tests/unit/combatSpecialStatus.test.ts`（新）
- 新增：`.kiro/specs/combat-mechanics/GOW-STATUS-RESEARCH.md`（状态研究）、`ASSET-GENERATION-PROMPTS.md`、`assets/音效/`（未盘点的新音效资产）、`assets/prompt/`（立绘提示词，**不归你管，不提交**）

## 阶段 1 · 内容深审（只读）

1. 读 `GOW-STATUS-RESEARCH.md` 与 `DECISIONS.md` 的状态相关小节，梳理本批实现了哪些状态（预期含死亡标记/诅咒族；`traits.ts` 里已有 `MARK_STATUS_ID='marked'` 纯标记态先例）。
2. 逐状态核对实现三件套：引擎语义（施加/结算/到期）、`statusBadges` 图标、测试覆盖（`combatSpecialStatus.test.ts` + controlStatus/ManaDistributor 等改动）。
3. 检查我方窗口 D 的既有资产是否被误伤：风暴（stormEngine/stormIndicator 测试也改了——diff 看改了什么、为何）；TURN HUD 横幅几何（`createTurnBanner`）与 refill 生成线（`setRefillSpawnTopPx`）是否仍在。
4. `assets/音效/` 盘点：文件清单、命名、是否已被 AudioManager 引用；产出 `artifacts/audio-inventory.txt`（给 TASK-AUDIO 用）。
5. 发现问题分级：必须修（阻塞提交）/ 可顺延（记录进验收记录节）。

## 阶段 2 · 提交（分逻辑块，不要一锅端）

建议切分（按实际内容调整，禁止把 `assets/prompt/` 混入）：
1. 引擎+数据：状态引擎 + build_traits + traits.json（+268 code 口径）
2. 渲染+音效资产：statusBadges/演出 + `assets/音效/`
3. 测试与文档：测试改动 + GOW-STATUS-RESEARCH.md + DECISIONS 增补
每块提交前跑一次门槛；全部提交后主树解冻，在 `TASK-MASTER-PLAN.md` 现状快照里把「主树冻结令」改为已解除。

## 阶段 3 · 口径修正（小改动，顺手做）

- `ASSET-GAPS.md` / `DECISIONS.md` 里「songoflight 开局风暴未实现」「死亡标记/诅咒待做」的表述按实际更新（battleStartStorm 已落地；死亡标记/诅咒以本批实际实现为准）。
- 缺口脚本 `scripts/_gap_analysis.mjs` 重跑一次，把新数字写进 DECISIONS 覆盖率小节。

## 验收标准

- 全部门槛绿；工作区只剩 `assets/prompt/`（立绘，归 TASK-PORTRAITS）。
- 台账登记完成；验收记录节列出：实现了哪些状态（含各自测试数）、必须修/可顺延清单、audio-inventory 路径。
