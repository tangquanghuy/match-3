# 任务书 · 自动放映测试台 + 截图自审迭代（阶段 2）

> 必读：`TASK-MASTER-PLAN.md`、`PARALLEL-WORK.md`、`.kiro/specs/combat-mechanics/ACCEPTANCE.md` 的「规模化人工验收方案」节（本任务的设计来源）。
> 前置：TASK-STATUS-ACCEPT 完成（主树解冻）。基建部分（阶段 1）可与 TASK-CONTENT 并行——内容没做完也能跑，只是画廊先小后大。

## 背景

用户裁定：技能 ~1800 条、敌人上千种，不可能人工逐个验收；**目标是程序自动放映 + 截图审查迭代**，人工只看汇总报告。现有可依赖的基建：
- 测试台 `skills-test.html` + `window.__testPage`（App 实例暴露，含 setDebugSkill/debugSetGems/debugStormChange/getEngine 调试钩子）
- 组合器/充能/推进回合/事件流日志（SkillTestPage 现成 UI）
- 分拣引擎（tier+种族自动编配敌人，`src/session/assigner.ts`）
- e2e 先例：`tests/e2e/`（Playwright）、`scripts/mobile-acceptance-shots.mjs`（截图脚本先例）
- 环境坑：内嵌浏览器 rAF 冻结 → 动画终态断言不可依赖；Playwright headless 或有头前台可稳定截图。

## 阶段 1 · 技能放映厅 runner（核心交付）

新脚本 `scripts/skill_theater.mjs`（Playwright，`npx playwright` 已在依赖里）：
1. 起 dev 服务（或 build+preview，二选一说明理由），打开 `skills-test.html`。
2. 遍历 curated 技能清单（从 `src/engine/skills/curated/index.ts` 导出集合读）：每条技能——固定种子布盘 → 装配到我方角色 → 充能 → 施放 → 等事件流完成 → 截「施放中」与「结算后」两张图 + 抓取事件流 JSON。
3. 产出 `artifacts/theater/skills/index.html` 画廊：每条一卡（技能 id/官方描述原文/事件流摘要/两张截图）；描述与事件流的**自动对账摘要**（伤害段数/状态施加/宝石操作计数 vs 描述里的关键词粗匹配，标记可疑项红色）。
4. 速率目标 2~4 秒/条；全量 521（及后续增长）挂机可跑完。支持 `--only <id>` / `--batch N,M` 断点续跑。
5. 稳定性：rAF 冻结防御——每步操作设总超时，超时记录为该条 failed 并继续（画廊里可数）。

## 阶段 2 · 敌人千场烟雾 + 敌人图鉴

1. `scripts/enemy_smoke.mjs`（无头，纯引擎）：用 assigner 按 tier×种族批量编配双方 → 固定种子跑整场（左右都写个简单 AI：随机合法交换+满法力施放）→ 断言：不抛异常、终局可达（回合数上限内）、事件流合法（game-over 恰一次）。跑 ≥1000 场，输出崩溃/超限清单。
2. 敌人图鉴：按 tier×种族枚举编配结果，产出 `artifacts/theater/enemies/index.html`（每个编配位：技能/特质清单 + 是否已实现徽章），供内容任务对照补缺。

## 阶段 3 · 截图自审迭代闭环（用户核心诉求）

1. `scripts/visual_review.mjs`：输入截图目录 → 逐图调用视觉模型（API key 走环境变量，缺失时降级为跳过并警告）做审查（主体可见性/棋盘完整/文字乱码/HUD 不重叠等 checklist）→ 输出 `artifacts/theater/review.json`（每图 pass/fail+问题短语）。
2. 与放映厅打通：画廊卡片显示视觉审查结论；可疑卡片聚合成「待修清单」页。
3. 写清楚审查 prompt 的版本管理（`prompts/visual-review-v1.md` 存库），迭代审查标准改版本号。

## 边界与验收

- 你的文件：`scripts/{skill_theater,enemy_smoke,visual_review}.mjs`、`prompts/**`、`artifacts/theater/**`、`tests/e2e/`（如需守护 runner 本身的冒烟用例）。
- **只读**：`src/**`（调试钩子不够用记进报告，协调后由相应窗口加）；不改 SkillTestPage 之外的 render 文件。
- 验收：放映厅全量跑通出画廊（521+ 条、failed 数可解释）；千场烟雾 0 崩溃；视觉审查闭环在 ≥50 张样图上工作。
- 须人工：画廊抽查 10 条对账摘要是否靠谱（用户翻画廊即可）。
