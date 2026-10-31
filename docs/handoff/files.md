# 文件说明、同步范围与继续工作入口

交接基准：2026-10-28，2026-10-31 补充第二轮接手开发的新增文件（见第 10 节）。本文链接以仓库内相对路径为主，复制整个项目或 `docs/handoff` 所在目录结构后可继续使用。用户原话里的 D 盘绝对路径按历史原句保留；仓库外实际文件在本次交接中另留快照。

## 1. 文档权威顺序与推荐阅读

优先核对 [用户逐轮原话](user-dialogue.md) 中后出现的明确修订，再查 [澄清记录](decisions.md)、当前提示词/协议与现有代码。执行进度看 STATUS 最新结论；产品书包含较早方案，局部段落与后续原话冲突时按澄清记录处理。历史审查记录用于追溯当时风险和证据，不会自动覆盖后续决策。

| 文件 | 内容与接手方式 |
| --- | --- |
| [AGENTS.md](../../AGENTS.md) | 本仓库约束，尤其奖励实际入账与本场结算可见性。修改奖励须同步核对发奖、页面和回归。 |
| [当前执行状态](../../tasks/active/STATUS.md) | ST-01～10、最新修复、测试和发布记录。长文件靠前是最新结果，后面有历史切片。 |
| [执行任务书](../../tasks/active/TASK-SILLYTAVERN.md) | 分期任务、依赖、交付物和验收要求。ST-04～09 尚未全部收口。 |
| [产品任务书](../sillytavern-battle-product-plan.md) | 玩家旅程、敌人、魂片、武器、数值、宿主与分期的主设计。部分早期名字/管理入口/结算布局描述需结合本交接修订阅读。 |
| [既有原始需求摘录](../sillytavern-original-requirements.md) | 原先选择性引用的用户需求，供理解历史；本次完整 95 条归档补齐其范围。 |
| [产品方案审查](../sillytavern-product-plan-audit.md) | 早期产品缺口与审查结论，部分问题后来已经纠正，不据此新增已被否定的需求。 |
| [产品验收清单](../sillytavern-product-acceptance.md) | 行为验收项目和数值基线，清单建立不等于逐项通过；结算呈现以最新原生复用规范为准。 |
| [养成桥接调研](../sillytavern-progression-bridge-research.md) | 两项目数值、能力、武器及资源边界的调研。文件明确有旧示例，四维选图等早期判断已被后续修订覆盖。 |
| [奖励结算规范](../battle-settlement-rewards.md) | 真实物品/材料/货币名称数量、胜败、重复提交、旧收据、原生结果页、魂片来源名称等规则。 |

## 2. 运行时 AI、正则和人工安装

| 文件 | 用途及部署位置 |
| --- | --- |
| [运行时 AI 提示词](../sillytavern-runtime-ai-prompt.md) | **实际给角色卡世界书的 EJS 条目**，保留外层模板；AI 接收条件渲染后的任务。 |
| [原生 AIRP 战斗规则](../战斗规则.md) | 原生模式提示词及三消互斥条件；用户指定的提示词组织参考。 |
| [协议说明](../sillytavern-runtime-ai.md) | 面向维护者解释七字段、原消息解析、幂等和战报边界；整篇不应直接塞给运行时 AI。 |
| [正则 JSON](../sillytavern-runtime-regex.json) | 导入 SillyTavern 正则扩展的完整规则。仓库版指向已记录公开站，自建站需换对应模块来源。 |
| [正则替换全文](../sillytavern-runtime-regex-replacement.txt) | 手动编辑替换框时全文粘贴，保留首尾 HTML 代码围栏。JSON 转义后的字符串不是直接粘贴内容。 |
| [人工部署说明](../sillytavern-manual-deployment.md) | 世界书、正则、开局、底栏、MVU 合并位置和可选脚本清单；发布网页与装入角色卡分别验收。 |
| [宿主集成说明](../sillytavern-host-integration.md) | 顶层模块、助手 API、数据库、颜色、剧情/再现、独立管理页与刷新边界。 |
| [真实酒馆人工测试说明](../sillytavern-manual-test.md) | 本地预验收、公开站、真实角色卡、关键机制、故障及奖励核对入口。 |
| [提示词盲审记录](../sillytavern-runtime-ai-blind-test.md) | 早期提示词独立输入和问题；最新 v2 另见组装器记录。 |

当前查找表达式：

```regex
/<match3>\s*[\s\S]*?\s*<\/match3>/g
```

正则只负责显示入口。消息模块读取原始 assistant 正文，由解析器整体校验；不要先截第一块而漏掉多块/错误输入。`getCurrentMessageId()` 等调用依赖酒馆助手运行环境，普通浏览器空白页不能代替真实渲染验证。

[人工安装历史包](../../artifacts/sillytavern-manual-deploy-20261025/README.md) 及同名 zip 已存在于本机 `artifacts/`，该目录被 Git 忽略，单独 clone 不会获得。历史包不是完整源码、整站图片或最新网页发布；其中说明和文件需按当前源码重新核对。本交接另带角色卡当前快照，避免接手人完全依赖该临时包。

## 3. 敌人组装器、目录、画像与证据

| 文件 | 作用 |
| --- | --- |
| [敌人组装设计准则](../sillytavern-enemy-design-guidelines.md) | 主职责与能力标签分开、源职责分池、完整主动和特质、机制/强度预算、具体效果参数、分层验收。 |
| [实际技能分布审计](../sillytavern-enemy-skill-distribution-20261025.md) | 真实源技能分布及分类纠正依据；不把带伤害或魔力倍率误判成唯一职责。 |
| [分类组装规则](../sillytavern-enemy-assembly-rules.md) | 完整模块、机制约束、内部权重、依赖、保存恢复、团队上下文、覆盖边界。 |
| [组装器 v2 与盲审](../sillytavern-enemy-assembler-v2.md) | 解耦颜色、源职责与画像、盲样问题和修复、模拟结果及版本限制。 |
| [立绘/颜色解绑](../sillytavern-portrait-mana-decoupling.md) | 用户最新纠正、数据模型和旧配置兼容。 |
| [自动结构覆盖](../sillytavern-enemy-assembly-coverage.md) / [JSON](../../data/st-enemy-assembly-coverage.json) | 最新结构统计 1800/1821 及逐稀有度/档位，行为另列；更新后需记录版本和口径。 |
| [历史全量目录覆盖](../sillytavern-enemy-coverage.md) / [目录 JSON](../../data/st-enemy-inventory.json) | 旧目录与逐来源机器证据，保留分母和来源；不能直接当 v2 分类组合通过率。 |
| [历史行为证据规则](../sillytavern-enemy-evidence.md) | 逐来源证据格式、过期检测、独立签收方法；用于历史回归，避免成为手工遍历全部敌人的唯一推进办法。 |
| [画像形态标注](../portrait-forms.md) / [画像运行索引](../../src/sillytavern/data/portraits.json) | 五形态、真实图片数据与可选维度；旧文字中的四维/颜色约束以解绑方案更新。 |

历史 ST-04 复核包括 [总复核](../sillytavern-st04-review.md)、[独立复核](../sillytavern-st04-independent-20261024.md)、[分类复核](../sillytavern-st04-classified-review-20261024.md)、[条件骷髅](../sillytavern-st04-conditional-skull-independent-20261024.md)、[随机家族](../sillytavern-st04-random-family-review-20261024.md)。这些文件解释当时问题和关闭依据，里面的 40 名、1762/1821、经济门禁等数值必须带上当时统计口径。

## 4. 玩家准备、宿主联调与发布记录

| 文件 | 用途 |
| --- | --- |
| [队伍准备](../sillytavern-party-preparation.md) / [原生准备弹窗](../sillytavern-party-dialog.md) | 1～4 成员、主角默认武器、颜色、能力兼容和准备页面。 |
| [2026-10-24 用户环境接入](../sillytavern-user-integration-20261024.md) | 开局/底栏、用户本机酒馆以及已测边界。 |
| [2026-10-24 发布记录](../sillytavern-release-20261024.md) | 当时部署、真实宿主组合与联调证据；后续版本看 STATUS 最新修复记录。 |
| [原始需求/协议对齐审查](../sillytavern-protocol-alignment-20261024.md) | 解释当时消息入口和战报等链路缺口；后续实现不自动回写每段历史文字。 |

## 5. 代码维护地图

| 入口/模块 | 维护职责 |
| --- | --- |
| [runtimeProtocol.ts](../../src/sillytavern/runtimeProtocol.ts)、[runtimeRegex.ts](../../src/sillytavern/runtimeRegex.ts)、[messageSource.ts](../../src/sillytavern/messageSource.ts) | AI 原消息格式、七字段验证、入口正则与消息读取。 |
| [messageEntry.ts](../../src/sillytavern/messageEntry.ts)、[encounterCard.ts](../../src/sillytavern/encounterCard.ts) | 正则正文入口、状态查询、点击、消息重渲染与卸载。避免入口查询产生存档写入或开战。 |
| [panelEntry.ts](../../src/sillytavern/panelEntry.ts)、[hostEntry.ts](../../src/sillytavern/hostEntry.ts)、[managementPage.ts](../../src/sillytavern/managementPage.ts) | 底栏唤起、酒馆顶层服务、独立编队/收藏/再现/记录/存档界面。 |
| [hostAdapter.ts](../../src/sillytavern/hostAdapter.ts)、[hostService.ts](../../src/sillytavern/hostService.ts)、[saveRepository.ts](../../src/sillytavern/saveRepository.ts) | 助手/MVU、身份、聊天绑定、宿主本地 IndexedDB、账号隔离、导入导出和持久待办。 |
| [save.ts](../../src/sillytavern/save.ts)、[storySession.ts](../../src/sillytavern/storySession.ts)、[storyWriteback.ts](../../src/sillytavern/storyWriteback.ts)、[battleReport.ts](../../src/sillytavern/battleReport.ts) | 遭遇与收据、魂片/图鉴/学习、剧情结果、生命和战报回写、重复结算与同步恢复。 |
| [enemyDesign.ts](../../src/sillytavern/enemyDesign.ts)、[enemyAssemblyPolicy.ts](../../src/sillytavern/enemyAssemblyPolicy.ts)、[enemyMechanismRules.ts](../../src/sillytavern/enemyMechanismRules.ts)、[enemyBudget.ts](../../src/sillytavern/enemyBudget.ts) | 职责候选、加权组合、机制准入、强度与整队危险组合。 |
| [enemyBlueprint.ts](../../src/sillytavern/enemyBlueprint.ts)、[enemyFormation.ts](../../src/sillytavern/enemyFormation.ts)、[enemyAssemblyCoverage.ts](../../src/sillytavern/enemyAssemblyCoverage.ts)、[portraits.ts](../../src/sillytavern/portraits.ts) | 原生能力适配、蓝图冻结/恢复、整队快照、结构覆盖和真实画像查询。 |
| [derivedFormPreflight.ts](../../src/sillytavern/derivedFormPreflight.ts)、[derivedFormPreview.ts](../../src/sillytavern/derivedFormPreview.ts)、[environmentScaling.ts](../../src/sillytavern/environmentScaling.ts) | 召唤/变形闭包、派生体预检与展示、等级和环境换算。 |
| [partyPreparation.ts](../../src/sillytavern/partyPreparation.ts)、[partyDialog.ts](../../src/sillytavern/partyDialog.ts) | 酒馆我方快照、武器与颜色、能力和原生准备弹窗。 |
| [battleRuntime.ts](../../src/sillytavern/battleRuntime.ts)、[replayLauncher.ts](../../src/sillytavern/replayLauncher.ts)、[replayFrame.ts](../../src/sillytavern/replayFrame.ts) | 复用正式引擎的剧情/再现场、启动/退出、行动结果和保存。 |
| [settlementView.ts](../../src/sillytavern/settlementView.ts)、[fragmentRewards.ts](../../src/sillytavern/fragmentRewards.ts)、[abilityName.ts](../../src/sillytavern/abilityName.ts) | 原生结算薄适配、魂片原来源命名、可读名称与旧收据只读展示。 |
| [abilityDescription.ts](../../src/sillytavern/abilityDescription.ts)、[traitDescription.ts](../../src/sillytavern/traitDescription.ts)、[abilityDisplay.ts](../../src/render/abilityDisplay.ts) | 实际效果说明、特质说明、按当前属性计算可读数值；隐藏内部公式与指纹。 |
| [teamWorkspace.ts](../../src/meta/screens/teamWorkspace.ts)、[battleLoadingView.ts](../../src/meta/shell/battleLoadingView.ts)、[resultScreen.ts](../../src/meta/screens/resultScreen.ts) | 本体与酒馆共享编队工作区、战前加载和战后结算。改动须检查本体复用方。 |
| [src/engine](../../src/engine) / [src/data](../../src/data) / [src/render](../../src/render) | 原有战斗、部队/武器/技能数据和渲染基础。接入以复用为先；不要因为接入另建一套底层结算逻辑。 |
| [installer.ts](../../src/sillytavern/installer.ts)、[installPage.ts](../../src/sillytavern/installPage.ts)、[vite.config.ts](../../vite.config.ts) | 下载产物生成、安装页和 tavern 构建入口、稳定模块名、静态资源。 |

`src/sillytavern` 的 JSON、CSS 和数据目录也属于源码交付，不要只挑 TypeScript 文件复制。技能数据及原有引擎和 meta 组件是依赖，单拷这个目录不足以运行。

## 6. 页面入口和构建/检查

接手人没有原站 Cloudflare 发布权限时，按 [本地部署与真实酒馆联调](local-deployment.md) 操作即可。该指南提供本机静态服务、开局/底栏副本、指向本机的正文正则及真实酒馆接入步骤；专用配置为 [sillytavern.local.vite.config.ts](../../deploy/sillytavern.local.vite.config.ts)，验证结果在 [本地部署验证记录](local-deployment-verification.json)。

| 页面 | 使用场景 |
| --- | --- |
| [sillytavern-install.html](../../sillytavern-install.html) | 安装说明、提示词和正则下载；不替代正式角色卡开局/底栏。 |
| [sillytavern-encounter.html](../../sillytavern-encounter.html) | 消息入口兼容/独立加载页，实际正文通过消息模块启动。 |
| [sillytavern-battle.html](../../sillytavern-battle.html) | 酒馆剧情及再现使用的正式战场。 |
| [sillytavern.html](../../sillytavern.html) | 本地设计预览、规则调试与编队，不当作玩家的正式底栏管理页。 |
| [sillytavern-playtest.html](../../sillytavern-playtest.html) | 示例宿主数据的本地预验收；tavern 精简构建不含此页。 |
| [game.html](../../game.html)、[index.html](../../index.html)、[skills-test.html](../../skills-test.html) | 原三消本体、独立战斗与技能测试；共享修改的回归参考。 |

从仓库根目录执行（需 Node.js/npm；依赖锁定见 [package-lock.json](../../package-lock.json)）：

```powershell
npm ci
npm run dev
# 发布构建，包含 TypeScript 检查；产物在 dist-tavern/
npm run build:tavern
# 本体全部页面构建
npm run build
```

本次已执行 `npm run build:tavern` 及专用本地预览的页面、下载与跨来源模块检查，详见本地指南；下方功能用例本次没有重跑。当前依赖版本以锁文件为准，项目未在 package.json 中单独锁定 Node engines。

按改动选择相关用例，以下是有实际文件的定向入口：

```powershell
npx vitest run tests/unit/stRuntimeProtocol.test.ts tests/unit/stRuntimeRegex.test.ts
npx vitest run tests/unit/stEnemyClassifiedAssembly.test.ts tests/unit/stEnemyWeightedAssembly.test.ts tests/unit/stPortraitIndependence.test.ts
npx vitest run tests/unit/stSave.test.ts tests/unit/stStoryWriteback.test.ts
npx playwright test tests/e2e/stMessageEntry.spec.ts tests/e2e/stMessageStory.spec.ts tests/e2e/stSettlement.spec.ts --workers=1
npx playwright test tests/e2e/stHostPanel.spec.ts tests/e2e/stReplay.spec.ts tests/e2e/stEconomyReceipt.spec.ts --workers=1
```

Playwright 默认指向 `http://localhost:5173`，配置会拉起 `npm run dev`。复用其他端口时先启动该端口服务，再设置 `$env:PLAYWRIGHT_BASE_URL='http://127.0.0.1:端口'`；配置中的启动命令默认不会自动追加这个端口。

数据与构建检查：

```powershell
node scripts/portrait-forms.mjs check
node scripts/build-st-portraits.mjs --check
node scripts/st-enemy-inventory.mjs --check
node scripts/st-enemy-assembly-coverage.mjs --check
node scripts/st-host-dist-smoke.mjs dist-tavern
```

注意 `st-enemy-assembly-coverage.mjs --check` 仍会重写 JSON/Markdown 结构报告后检查门槛；它没有执行机制行为或平衡验收。需要保留旧证据时先另存版本。`st-enemy-inventory --check` 依赖本机历史行为证据，缺少被忽略的证据目录时不要为追求通过随意删条目或缩分母。脚本可读 [覆盖生成器](../../scripts/st-enemy-assembly-coverage.mjs)、[目录生成器](../../scripts/st-enemy-inventory.mjs)、[行为证据执行](../../scripts/st-enemy-acceptance.mjs)、[静态构建 smoke](../../scripts/st-host-dist-smoke.mjs)。

公开站发布是独立的可选流程。接手人本地联调使用 `npx vite preview --config deploy/sillytavern.local.vite.config.ts`（PowerShell 下 `npm run preview -- --config …` 会吞掉参数，不要用），无需 Cloudflare 权限或 `worker/` 依赖。2026-10-31 注：`npm run build:tavern` 会因原有类型错误失败，本机一直用 `$env:VITE_BASE='/'; npx vite build --mode tavern` 构建，详见 [上线待办](launch-checklist.md)。

公开站发布配置在 [deploy/sillytavern.wrangler.jsonc](../../deploy/sillytavern.wrangler.jsonc)，发布 `dist-tavern` 静态产物。有发布权限的维护者配置目标 Cloudflare 账号；完整静态模块与 `assets/static` 同批发布，资源头由 [vite.config.ts](../../vite.config.ts) 的 `HEADERS` 常量在构建时生成 `_headers`。正式发布命令 `npm run deploy:tavern` 还依赖 `worker/` 的 Wrangler，需先在该目录安装依赖。无需为纯本地进度增加业务数据库服务器。

## 7. 仓库外依赖、历史参考与角色卡快照

本次已将以下四个外部文件按 2026-10-28 的本地实际内容原样复制到 [external/dnf-code](external/dnf-code)，见 [快照说明](external/README.md) 和 [哈希清单](external/manifest.json)：

| 原位置 | 交接用途 |
| --- | --- |
| `D:/Code/dnf/code/开局.html` | 已有角色卡开局配置页，含三消模式开关。 |
| `D:/Code/dnf/code/底部状态栏.html` | 游玩中的系统设置与三消管理入口。 |
| `D:/Code/dnf/code/外置状态栏.js` | 用户指定的独立页面注入方式参考，不是三消必须额外安装的脚本。 |
| `D:/Code/dnf/code/三消面板.js` | 可选三消管理包装，与底栏直接导入模块二选一。 |

当前角色卡 MVU 合并参考 [docs/mvuzod.js](../mvuzod.js)。`D:/Code/dnf/变量/mvuzod.js` 是外部实际 schema 来源之一，部署时按人工说明合并当前角色其它字段，不用只覆盖三消一段而丢失已有结构。历史人工包里的合并脚本另有版本，需比较再替换。

用户最初提供的 [辅助计算脚本](../辅助计算脚本.js)、[单次激活](../单次激活)、[酒馆变量](../酒馆变量)、[mvuzod.js](../mvuzod.js) 在本仓库仍存在，是分析 AIRP 现状的参考，不等于全部已经按最新三消协议更新。历史跑图提示词 `D:/Code/dnf/comfyui_batch/立绘提示词汇总.txt` 在本机仍存在，用于早期关联与打标；运行时使用已生成画像索引和实际资源，不要求将原始提示词发给 AI。

这些 HTML/JS 原文件含角色卡其它产品内容，快照保留原样只作为交接基线。本次未替接手方安装整个角色卡、修改世界书或发布外部 CDN。

## 8. 同步项目必须带走什么

| 类别 | 同步内容与原因 |
| --- | --- |
| 工作区实际源码 | `src/`、根 HTML、`docs/`、`tasks/`、`scripts/`、`tests/`、数据 JSON、构建配置及包锁；本次新建 `docs/handoff/`。 |
| 游戏运行资源 | `game-assets/bundled/` 与 `game-assets/public/static/`、静态头等。参考 [资源说明](../../game-assets/README.md)，检查文字/图片/字体/音频能在新来源加载。 |
| 外部角色卡 | 本次 external 快照、最新 MVU 合并及已有角色卡世界书/正则的安装方式。只拷三消仓库不会自动更新角色卡 CDN。 |
| 运行环境 | Node/npm，浏览器/Playwright 所需 Chromium；真实 SillyTavern、酒馆助手、MVU、EJS 模板扩展与已装角色卡。 |
| 发布产物 | 若直接交付可运行网页，另外带完整 `dist-tavern/`；若交付源码则重建。`artifacts/` 历史 zip 只作安装参考。 |
| 验收证据 | 若需接手复核，额外选择 `.tmp/st-assembler-coverage/`、`.tmp/st-fragment-rewards/` 等小报告/截图与对应版本。它们在本机有记录，但不在普通 Git 交付中。 |

初次整理时分支 `main`，HEAD 为 `40b43df531ec9800cf8f90dee879a9d6e4327b40`，当时大量酒馆集成源码尚未跟踪，单独交付该旧提交会漏文件。用户随后明确要求提交推送，当前交接提交纳入实际集成源码、测试、数据、文档及既有清理删除；接手人应拉取包含本交接文档的最新提交。`.tmp/` 本地浏览器资料、缓存与临时报告通过忽略规则留在本机；运行资源和正式验收数据仍按上表交接。

`node_modules`、浏览器登录资料、本地玩家存档和账号凭据不属于源码交接必需文件。原图生成源和 `.tmp` 回归证据可按需要另拷，正式运行资源必须齐全。本次已提取用户截图作为需求证据保存在版本化 handoff 目录，接手人无需拿整套本机浏览器资料。

## 9. 已知证据和文档局限

- STATUS 的最新结论与中部任务表有不同时间切片：ST-04 表格仍写最初自由出块失败，顶部已记 v2 修复通过；总任务状态仍进行中。
- 部分产品书仍写名字不进协议、战斗页附管理入口、结算固定展示技术报表；后续原话已纠正。本次提供明确索引，没有把历史设计全文伪改成已通过版本。
- 公开站最近记录版本和人工包日期不同；仅在安装页看见下载文件不证明用户当前角色卡已装入同版本。
- 最新魂片命名公开验证是实际酒馆文档下的隔离旧收据测试；完整用户实聊和整场战斗没有在该次修复里重做。
- 现有战果镜像没有完整收据奖励列表及永久完整行动事件，自动进入下一次模型请求尚未验证；原始完整战报反馈目标仍待补齐。
- 本次完成文档整理、原文和附件提取、外部快照、路径与完整性检查，并增加本地静态部署和跨来源模块验证。功能验收范围沿用已有记录，不能用交接文档写成“整版已通过”。

## 10. 2026-10-31 第二轮接手新增的文件

交接文档：

| 文件 | 内容 |
| --- | --- |
| [launch-checklist.md](launch-checklist.md) | 上线待办：必须做、应该做、已知缺口。 |
| [card/](card/README.md) | 三消接入对角色卡的改动、更新方法；开局页和底栏副本，卡内脚本与正则的可读副本，`manifest.json`（含 SHA-256 和卡内本机地址）。角色卡本体不在仓库。 |
| [session-20261028/](session-20261028/user-dialogue.md) | U096–U171 用户原话、完整会话记录（`transcript.md`）、机器可读原文（`user-turns.json`）；截图在 `attachments/`。 |

脚本：

| 文件 | 用途 |
| --- | --- |
| [scripts/st-card-backup.cjs](../../scripts/st-card-backup.cjs) | 从酒馆数据目录导出清理过的角色卡、世界书和脚本/正则副本（只读酒馆文件；角色卡和世界书太大，不进仓库）。 |
| [scripts/handoff-export-session.cjs](../../scripts/handoff-export-session.cjs) | 把 Kiro 会话的 `messages.jsonl` 导出成原话、会话记录和 JSON。 |

酒馆接入源码（`src/sillytavern/`）：

| 文件 | 职责 |
| --- | --- |
| [abilityNames.ts](../../src/sillytavern/abilityNames.ts) | 技能名覆盖表（27 条），保证一名一效果；`enemyBlueprint.skillNameForTroop()` 使用它。 |
| [weaponPicker.ts](../../src/sillytavern/weaponPicker.ts) | 编队页“更换武器”的选择窗口（仿原武器中心，筛选、购买）。 |
| [weaponShop.ts](../../src/sillytavern/weaponShop.ts) | 武器价格、`三消已购武器` 读取、扣款纯函数。写 MVU 的是 `hostAdapter.purchaseWeapon`。 |
| [currencySeal.ts](../../src/sillytavern/currencySeal.ts)、[currencyGuard.ts](../../src/sillytavern/currencyGuard.ts)、[currencyGuardEntry.ts](../../src/sillytavern/currencyGuardEntry.ts) | 通用币校验码、检查与改回、角色卡脚本入口（构建为 `sillytavern-currency-guard.js`）。 |
| [battleRecords.ts](../../src/sillytavern/battleRecords.ts) | 战斗记录按对手分组（只影响显示）。 |
| [storyReportMessage.ts](../../src/sillytavern/storyReportMessage.ts) | 生成“【三消战报】”聊天消息并通过酒馆输入框发送。 |

改动过的原游戏文件：`src/meta/screens/weaponsScreen.ts`（搜索框中文输入法，经用户同意，已推送）；`src/render/App.ts`、`src/render/CharacterDetailPanel.ts`（酒馆战斗详情的显示，按用户要求未推送，留在工作区）。

新增测试：`stAbilityNames`、`stWeaponShop`、`stCurrencyGuard`、`stBattleRecords`、`stStoryReport` 等单测；`stPartyDialog`、`stHostPanel`、`stMessageStory` 中的武器购买、中文输入法、战斗记录、魂片背面、战后无变量楼层等浏览器用例。
