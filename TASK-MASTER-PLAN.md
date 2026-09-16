# 总纲 · 「全王国大部分敌人可玩」推进计划（2026-09-16 定稿）

> 本文件是任务书索引与共同约定。窗口 D（本窗口）不再直接执行任务，只做：任务书维护、验收把关、结果汇总。
> 每份任务书自包含；新窗口开工前按各自「必读」清单读文件。

## 总目标（用户定义）

**实现全部王国的大部分敌人：包含技能、特质，并且有相应的动画引出和配套音效。**
UI/演出细节由**程序自动截图审查迭代**推进，不依赖人工逐步验收。

## 窗口分派与并发时刻表（2026-09-16 定稿）

窗口编号顺延 A-D（A 特质 / B 技能 / C 宝石 / D 风暴与验收，均已完成或归档）。**新开五个窗口 E~I**：

| 窗口 | 任务书 | 开工条件 | 交付物 | 结束条件 |
|---|---|---|---|---|
| **E · 验收转内容主线** | `TASK-STATUS-ACCEPT.md` → 完成后**同一窗口续做** `TASK-CONTENT.md` | 立即（主树冻结正是它解） | 状态批分块提交 → 内容五阶段 | TASK-CONTENT 验收指标达成 |
| **F · 立绘** | `TASK-PORTRAITS.md` | 立即（零主树依赖）；样板终验=用户跑图确认 | 两波分片 1743 名 override+渲染 | 3674 文件对账零缺零重 |
| **G · 放映厅** | `TASK-THEATER.md` | E 提交状态批后（基建只写 scripts/artifacts，可与 E 的内容阶段全程并行） | 放映厅+千场烟雾+图鉴+视觉自审 | 三件套全量跑通 |
| **H · UX** | `TASK-UX.md` | G 的视觉审查闭环（阶段 3）可用后 | 收起/中文/可点击/技能详情/施法引出 | ux_shots 全场景视觉审查 pass |
| **I · 音效** | `TASK-AUDIO.md` | E 提交状态批后（与 G/H 并行均可） | inventory+接线+缺口素材+BGM 通道 | 缺口 1~4 项有音且接线 |

### 时刻表

```
时间 →   T0(现在)        T1(E提交状态批)      T2(G视觉闭环就绪)     T3(收尾)
窗口 E   ████ 状态验收 ──████████ 特质+技能内容（最高优先，直至收口）████
窗口 F   ██████████ 立绘 P2 波1/波2 ████████████████████（独立到尾）
窗口 G                  ████████ 放映厅基建→烟雾→视觉自审闭环 ██████
窗口 H                                       ████████ UX 改版+自审迭代 ████
窗口 I                  ████████ 音效盘点/接线/素材/BGM ██████████
```

**峰值并发 = 3 个窗口**（E+F+G 或 E+F+I / F+H+I），超过 3 个无收益只加冲突面，不要同时开更多。

### 防撞规则（事故教训沉淀，硬性）

1. **git 提交只 add 自己的路径**：窗口活动期间**禁止 `git add -A`**（已发生过误吞他窗在途改动+误跑 build_traits 覆盖他人 traits.json 两次事故）。例：E 只 `git add src scripts/build_traits.mjs src/data/traits.json tests .kiro`；F 只 `git add assets/prompt artifacts/prompt-overrides`。
2. **生成器独占**：`scripts/build_traits.mjs` + `src/data/traits.json` 只有 **E** 可跑/可写；立绘渲染器只有 **F** 可跑。
3. **dev 服务器端口**：同一时刻只有一个窗口占 5173。G 自管端口（`--port 5175` 起或 preview）；其余窗口要跑页面先看 `netstat` 或直接让 G 的 runner 管。
4. **共享文件**（TurnEngine/CombatResolver/events/types/gems.ts/AudioManager/SkillTestPage）：动前 `PARALLEL-WORK.md` 台账登记，登记在先者先改，后改者重读最新文件再适配。E 的内容批次是共享文件最大用户，G/H/I 尽量「只读 + 自己域内实现」。
5. **主树冻结令**（到 E 完成状态批提交为止）：F 不受限（只新增文件）；G 的基建不碰 src/tests 可先行，但要跑全量门槛/提交的动作等解冻。
6. **验收回流**：G 的放映厅/烟雾发现的敌人内容缺口 → 写进 `artifacts/theater/待修清单`，由 E 消化（不是 G 自己修）；H/I 的视觉审查发现问题各自修自己域。

### 各窗口给你的最小派发话术

> 开新窗口时发两样：`TASK-MASTER-PLAN.md` + 对应任务书路径，附一句：
> 「你是窗口 {E/F/G/H/I}，先读总纲的『窗口分派与并发时刻表』和『共同约定』，再读你的任务书，按必读清单补上下文后开工。」

## 现状快照（2026-09-16，任务书内的数字以本表为准）

## 共同约定（每份任务书不再重复）

1. **必读**：`PARALLEL-WORK.md`（共享文件台账协议，动共享文件前登记）、本文件。
2. **门槛**（每阶段结束）：`npm run lint && npm test -- --run && npm run build` 全绿。全量测试是共享护栏：跑挂先修自己的，不许跳过/注释既有用例。
3. **提交纪律**：每阶段独立提交，注明阶段号；在途他人改动不混入自己的提交。**窗口并发期间禁止 `git add -A`，只 add 自己任务书名下的路径**（见防撞规则）。
4. **边界**：逻辑层 `src/engine/**` 禁 DOM/pixi/gsap；随机一律种子化 RNG；`src/data/troops.json` 只读（build_troops 唯一入口）；测试文件名前缀（trait*/spell*/gem*/storm*）防撞名。
5. **主树冻结令**：~~特殊状态批提交前（阶段 0 完成），任何窗口不得改 `src/**`、`tests/**`、`scripts/build_traits.mjs`、`src/data/traits.json`~~ **已解除（2026-09-16 窗口E，特殊状态批三块提交完成：6b1079a 引擎+数据 / 2cd8e3e 渲染+音效 / 5ced37c 测试+文档）**。此后共享文件改动仍按防撞规则 4 的台账协议执行。`TASK-PORTRAITS` 一直不受此限（只新增 `assets/prompt/立绘/**` 与 `artifacts/prompt-overrides/**`）。
6. **验收方式**：优先程序自验（测试/对账脚本/截图审查）；需要人工的只在任务书里标注「须人工」。

## 现状快照（2026-09-16，任务书内的数字以本表为准）

- **基线**：特殊状态批**已提交**（2026-09-16 窗口E 三块：`6b1079a` 引擎+数据 / `2cd8e3e` 渲染+音效 / `5ced37c` 测试+文档；提交前门槛复跑：lint 0 错、57 文件/613 用例全绿、build 通过）。工作区仅剩 `assets/prompt/` + `scripts/build_portrait_prompts.mjs`（F 名下，随 F 首次波次提交入库）。
- **特质**：main 361/785 code（72% 出场，3890/5394 次）；含开局风暴 5 code、战后经济钩子 4 code（merchant/necromancy/necromaster/moneybags）。
- **技能**：647 已核对组装 / 716 放弃 / 435 待核对 = 1798 行。经济三币种/织网通配对齐/逃跑机制/状态宝石波A 全部落地（batch-33~39 回收 77 条）；剩余放弃大头=复杂行为宝石（波B：龙/巨人/石像鬼/元素星/天使/灵力/传送门/药水/火山/陷阱）+动态颜色+散射无目标+藏宝图。
- **立绘提示词**：脚手架完成（`scripts/build_portrait_prompts.mjs`，6 标签极简模板，单文件 ~1070 字符）；破碎尖塔 47/47 样板已过四轮修正并按 2026-09-16 用户更正重渲（风格行去 dark fantasy、侧面视角锚改 `, from side`，见 `artifacts/prompt-overrides/_authoring-guidelines.md`）；风格行 `wlopk2style, western fantasy style, DnD monster manual illustration, painterly fantasy,`（wlopk2style 是管线必需 tag，不许删）。剩 41 王国 ~1743 名。CDN 存量抽样 0/30 → 按全量新生产规划。
- **音效**：战斗基础音齐（35 wav + 变体）。缺口：状态施加音、特殊宝石触发音、胜负结算 stinger、BGM（零音乐文件）、黄色技能音。`assets/音效/` 已盘点（窗口E → `artifacts/audio-inventory.txt`）：仅 `中毒.wav` 一个文件、未接线、命名不合既有约定。
- **测试台**：面板过长不可收起、区块名英文、状态/特质图标不可点击、技能释放与详情粗糙。
- **环境坑**：内嵌浏览器页签 rAF 会间歇冻结（visible 但 0 帧）→ gsap 时间线挂起。自动化截图走 Playwright/前台浏览器，勿依赖内嵌浏览器做动画终态断言。
