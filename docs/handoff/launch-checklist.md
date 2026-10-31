# 上线待办（2026-10-31）

现状：三消酒馆接入在本机真实酒馆（SillyTavern 1.19.0、酒馆助手 4.11.0、MVU、角色卡“创世回廊6.0”）里能走通“AI 出战斗块 → 进入战斗 → 原生结算 → 战报发给 AI → AI 续写”，以及魂片、往昔再现、编队、武器购买等管理页功能。但所有网页都从本机 `127.0.0.1:5185` 加载，代码自 `1a26bb17` 之后没有提交，数值没有平衡，部分养成功能没做。

下面按“上线前必须做 → 应该做 → 已知缺口”排列。每一项写明在哪里改、怎么算完成。

## 一、上线前必须做

### 1. 处理没推送的原游戏改动

- 2026-10-28 至 10-31 的全部改动都还在工作区，没有提交（2026-10-31 交接时 `git status` 共 116 项，其中 48 个未跟踪的新文件或目录，包括本次交接文档）。最后一次提交是 `1a26bb17`。
- 提交前先看一遍 `git status`，不要把 `.tmp/`、`dist-tavern/`、`test-results/` 带进去（已被 `.gitignore` 排除）。
- 2026-10-31 已把酒馆接入、交接文档和原游戏武器中心搜索框修复提交并推送。按用户要求，其余原游戏（三消本体）改动没有提交，留在工作区：
  - `src/render/App.ts`：战斗详情里不显示酒馆敌人内部的区域别名 `region:N`；没有原兵种时用快照里的定位显示职责。
  - `src/render/CharacterDetailPanel.ts`：酒馆快照的等级是纯数字，详情里补成 `Lv.N`。
  - 这两处只影响酒馆战斗的显示，不影响原游戏。没有它们，酒馆战斗详情会出现 `region:12` 这类文字、等级不带“Lv.”。上线前决定是否推送。

### 2. 修好发布构建

- `npm run build:tavern`（先跑 `tsc --noEmit`）在本机会失败，原因都是原有的类型错误，与酒馆接入无关：
  - `worker/` 缺 `@cloudflare/workers-types`（在 `worker/` 下 `npm install` 即可）；
  - 部分单测引用不存在的 `data/raw/gow-2026-09-18`；
  - `tests/unit/exploreRun.test.ts` 的类型错误；
  - `tests/e2e/stPartyDialog.spec.ts` 里两处浏览器内动态 `import('/src/...')` 的路径类型错误（第 146、487 行附近）。
- 本机一直用 `$env:VITE_BASE='/'; npx vite build --mode tavern` 绕过类型检查构建。上线要么修好这些错误，要么在构建脚本里只检查酒馆相关路径，二选一，不要长期绕过。
- `VITE_BASE='/'` 时控制台有一批 `127.0.0.1:8000/assets/*.js` 的 404（模块预加载地址拼错），不影响功能。正式部署按实际子路径设置 `VITE_BASE` 后重新确认。

### 3. 把网页发布到公开地址

- 构建产物是整个 `dist-tavern/`（入口模块、`assets/`、`static/` 素材、`local-card/` 开局页和底栏）。必须整批发布，素材和模块来自同一次构建。
- 入口模块需要 `Access-Control-Allow-Origin: *` 和 `Cache-Control: no-cache`，构建会生成 `_headers`（见 `vite.config.ts` 的 `HEADERS`）。用别的静态托管时要配同样的响应头。新增的 `sillytavern-currency-guard.js` 已加入 `HEADERS`。
- 原来的公开站是 Cloudflare Workers：`https://match3-tavern-playtest.linjiang-workshop.workers.dev/`，配置在 `deploy/sillytavern.wrangler.jsonc`，命令 `npm run deploy:tavern`，需要该 Cloudflare 账号权限。接手人没有权限时，换成自己的静态托管。
- 完成标准：在另一台没有跑本地服务的电脑上，四个地址都能直接打开：`sillytavern-message.js`、`sillytavern-panel.js`、`sillytavern-currency-guard.js`、`sillytavern-battle.html`。

### 4. 角色卡改用公开地址

卡里有 4 个本机地址（`docs/handoff/card/manifest.json` 的 `localUrls`），各自所在位置见 [角色卡改动说明](card/README.md#相比原版卡三消接入改了哪些地方)：

| 卡内位置 | 现在 | 上线后 |
| --- | --- | --- |
| 正则“三消·正文战斗入口 v1” | `http://127.0.0.1:5185/sillytavern-message.js` | 公开站的同名文件 |
| 脚本“通用币校验” | `http://127.0.0.1:5185/sillytavern-currency-guard.js?v=3` | 公开站同名文件，每次更新改 `?v=` |
| 正则“开局” | `http://127.0.0.1:5185/local-card/startup.html` | 角色卡原 CDN 上的新版开局页（见第 5 项） |
| 正则“状态栏” | `http://127.0.0.1:5185/local-card/statusbar.html` | 角色卡原 CDN 上的新版底栏（见第 5 项） |

- `docs/sillytavern-runtime-regex.json` 和安装页下载的正则里写的还是旧公开站地址，发布到新地址时一起改，并重新生成安装页下载文件。
- 改完后按 [角色卡更新方法](card/README.md#怎么更新角色卡) 重新导出，`manifest.json` 的 `localUrls` 应为空数组。

### 5. 同步角色卡自己的源文件

三消的改动目前只在本机酒馆和本仓库里，角色卡作者维护的源文件还是旧版。以后从源文件重新发布角色卡时，这些改动会丢失。

| 源文件（角色卡仓库） | 要合入的内容 | 参考 |
| --- | --- | --- |
| `D:/Code/dnf/变量/mvuzod.js` | `match3CharacterSchema` 等三消 schema、同伴 `三消` 字段、`系统配置.三消战斗模式`、`三消已购武器`、`通用币校验` | [docs/mvuzod.js](../mvuzod.js)（与卡内脚本完全一致） |
| `D:/Code/dnf/code/开局.html` | 三消开关 | [card/local-card/startup.html](card/local-card/startup.html) |
| `D:/Code/dnf/code/底部状态栏.html` | 三消开关、“三消”按钮、加载 `sillytavern-panel.js` 的地址 | [card/local-card/statusbar.html](card/local-card/statusbar.html) |
| 世界书源文件 | “⚙️三消战斗规则”条目，及“⚙️战斗规则【新】”“⚙️敌人设定【新】”的互斥条件 | [运行时提示词](../sillytavern-runtime-ai-prompt.md) |
| 角色卡正则与脚本 | 上表第 4 项的 4 处，以及正则“三消·战斗块移出正文美化” | [card/extracted/](card/extracted) |

- 开局页和底栏发布到 `cdn.jsdelivr.net/gh/tangquanghuy/dnf@latest/...` 后，jsDelivr 的 `@latest` 有缓存，需要清缓存或改用带版本号的地址。
- 合并 MVU schema 时不要整段覆盖，保留角色卡其他字段。

### 6. 去掉临时测试功能

| 功能 | 代码位置 | 处理 |
| --- | --- | --- |
| 正文入口的“重置本场（测试）”按钮：撤回本场战果，同一楼重打 | `src/sillytavern/encounterCard.ts`（`#reset` 按钮）、`messageEntry.ts` 的 `resetForTesting`、`hostEntry.ts` 的 `resetMessageStoryForTesting`、`hostAdapter.ts` 的 `clearStoryResultForTesting`、`save.ts` 的 `revertStorySettlement` | 上线前删除按钮和调用链，或只在开发构建中显示。相关测试一并调整。 |

### 7. 在真实环境完整走一遍

用公开地址和重新导入的角色卡，在没装本地服务的浏览器里完整走一遍 [人工测试清单](manual-test-checklist.md)。重点：

- 新建聊天 → 开局开启三消 → AI 出块 → 进入战斗 → 胜利/失败/放弃 → 战报 → AI 续写；
- 往昔再现刷魂片 → 学会 → 装配；武器购买扣通用币 → 登记 → 出战；
- 在变量管理器里手改通用币，2 秒内被改回；在改过的楼层上让 AI 正常加减通用币，结果正确（“生成开始前检查”这一步还没在真实生成中测过）；
- 手机宽度、短屏、刷新与重新渲染、切换聊天、第 4 个聊天。

## 二、应该做（影响体验或维护）

- **数值平衡（ST-10）**：敌我强弱和战斗时长都没标定。2026-10-28 联调时 20 级主角打两头狼 26 回合后败北。武器价格（传说 60 万、史诗 120 万、神话 200 万、末日 300 万）是用户定的，没有按 AIRP 通用币收入核算过。
- **特质说明改写**：技能说明已按原游戏风味重写，特质说明还是旧格式。用户说过“特性等处理完技能再说”，尚未开始。
- **技能名旧存档**：技能名改为原游戏名称后，旧存档里已保存的名字（魂片来源、结算收据、往昔记录的敌人快照）仍是旧的生成名，不迁移（用户决定）。新开存档没有这个问题。
- **战斗记录增长**：每场结算收据都保存在存档里（防重复结算、重置、战果队列都要用），刷再现越多存档越大。现在只是显示上精简，数据没有清理。
- **通用币校验的边界**：只防在变量管理器里手改数字；懂行的人能从脚本里找到密钥，或者把旧楼层的“余额 + 校验码”整对复制过来。以后新增任何会改通用币的脚本或功能，都要接入校验（盖码），否则它的改动会被当成手改改回去。关闭校验脚本期间 AI 发的钱，重新打开后会被改回。
- **测试基线**：以下失败在原提交 `1a26bb17` 上同样存在，与本轮无关，建议逐步修掉，避免掩盖新问题：
  - 单测：`stEnemyNativeParity`（1857 项，levelLabel，且单文件运行超过 30 分钟）、`stEnemyBoardManaDesign` 7、`stEnemyDesignReviewRegression` 2、`stEnemyConditionalSkullDesign` 2、`stEnemyClassifiedAssembly` 1、`stEnemyWeightedAssembly` 1、`stEnemyCastingColors` legacy 夹具 1、`stNativeEconomyIntegration` 2；`stEnemyDirectDamage`、`stEnemyRandomTarget`、`stEnemyRandomDamageAcceptance` 缺 `data/raw/gow-2026-09-18`。
  - 浏览器：`stMessageEntry` 两个短屏用例（320×568、667×375）、`stEnemyAssemblyPreview:86`、`stPreview:119`。
  - 多个浏览器测试并行时有少量超时，单独重跑能过。
- **原游戏搜索框**：本轮修了武器中心的中文输入法问题，并测了职业、愿望单、部队图鉴、编队、宝石商店的搜索框（正常）。原游戏的整套 e2e 按约定没有跑。

## 三、已知缺口（产品功能未完成）

| 缺口 | 现状 | 来源 |
| --- | --- | --- |
| 淬炼与材料（ST-09） | 剧情胜利只发魂片，没有淬炼材料和淬炼流程。 | 产品方案 §6.4 |
| 临时 HP | 角色有临时 HP 时不能开剧情战斗。 | STATUS |
| 逐行动恢复 | 战斗中途刷新后从开局重来。 | ST-07 |
| 敌人组装行为与平衡验收 | 结构覆盖 1800/1821（98.85%），21 个立绘缺口；关键机制交互、职责实际收益、五档平衡未验收。 | ST-04 |
| 主角职业与特质 | 原游戏主角有职业、天赋和族群，酒馆里的主角只有武器技能。原始需求没有涉及这部分，是否要做需产品决定。 | U167–U169 |
| 多支队伍 | 用户看过方案后决定不做（U166）。 | — |
| 同伴稀有度 | 角色卡没有现成字段，读可选的 `三消.稀有度`，没有就取已穿装备最高品质。 | STATUS 2026-10-28 |

更完整的分阶段任务见 [执行任务书](../../tasks/active/TASK-SILLYTAVERN.md) 和 [执行状态](../../tasks/active/STATUS.md)。
