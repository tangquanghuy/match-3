# SillyTavern 宿主接入与再现战斗

更新日期：2026-10-26。执行入口见 [当前状态](../tasks/active/STATUS.md)。

## 当前实现与交付门槛

已实现酒馆宿主适配器、宿主 IndexedDB 仓库、三个聊天独立槽位、颜色读写、默认队伍准备、剧情与再现的独立真实战场，以及跨刷新战果暂存。剧情结算先存原档，再按冻结的消息/角色状态回写生命与事实战报；回写失败保留待处理结果，本场已入账奖励仍可见。

本地完整流程入口为 `/sillytavern-playtest.html`，使用示例酒馆数据和正式宿主界面/三消引擎，无需控制台预置胜利。操作与边界见 [人工测试说明](sillytavern-manual-test.md)。本地自动化中的酒馆 API 由夹具模拟；本轮另外运行官方 SillyTavern 1.19.0、酒馆助手 4.11.3 与 MVU 的真实组合，发布后实测范围见 [部署联调记录](sillytavern-release-20261024.md)。临时 HP 吸收池、原生技能/词缀、武器淬炼与数值标定仍在后续范围。正式剧情入口使用 `<match3>` 消息及显示正则，玩家点击后直接复用原生战前加载和战场；集成方也可调用 `handle.playStory(plan)`。编队与养成页通过底栏单独打开。

## 独立编队与养成页（2026-10-26）

底栏显式唤起后，以独立全屏页面呈现编队、魂片收藏、往昔再现、战斗记录、存档五个分页。编队工作区与选中成员详情直接调用 `src/meta/screens/teamWorkspace.ts` 的共享模板，三消本体 `TeamScreen` 也调用该模板：左侧四个出战卡位，右侧名册和详情。单击名册查看详情，加入／移出及卡位拖拽沿用原生交互；颜色、能力装配、武器登记仅显示当前选中成员的配置。密集站位按顺序编入；已有成员只交换已占卡位。名册复用原生分页，每页最多 12 名，桌面六列、手机四列；搜索／类型切换返回首页，短屏可滚动到详情与能力配置，手机拖拽支持外层管理区边缘滚动。页面复用本体样式、导航图标、卡框、宝石、字体和已有立绘；图片及字体保持部署站点的绝对来源，以适应酒馆助手 iframe。

技能名称只保留动作与目标，随机数量放在详情中显示；技能机械公式由共享显示层按当前魔力转为数值，依赖目标／棋盘的部分保留中文规则；计算复用引擎的取整和非负限制。战斗详情同步接入该显示层，内部配方与指纹保持原定义。页面显示实际聊天角色姓名，验收截图中的角色由隔离夹具提供。

消息初始化、刷新和重新渲染保持静默。消息开战只显示原生加载、战场和原生结算；重开已结算消息只显示原生结算，继续后关闭。从管理页发起往昔再现时，退出再现返回原管理页。浏览战斗记录和结算只读取原收据，展示真实已获得奖励。

消息按钮按持久化记录显示“进入战斗”“继续本场战斗”或“查看本场战果”。重新渲染会收起该消息残留的已结算浮层，保留正在进行的战斗；已结算消息只有显式点击才打开原收据。读取入口状态不绑定 MVU、不更新存档、不发奖。结算继续使用原生页面；奖励名称隐藏末尾机械指纹，完整收据的身份、名称和数量原样留存。长名称在原生奖励卡内换行，奖励区紧随标题，短屏可滚动且继续按钮可达。

更新部署后刷新整个酒馆网页，使顶层已加载的模块更新。此次入口与 `<match3>` 格式保持一致，正则替换内容无须重新导入。

## 正式角色卡入口（2026-10-24）

MVU 开关固定为 `stat_data.系统配置.三消战斗模式`，布尔值默认 false。DNF 的 `开局.html` 负责开局选择、预设和导入导出；`底部状态栏.html` 的系统设置负责游玩中切换，开启时显示“三消”快捷入口。

底栏直接导入公开的 `sillytavern-panel.js`，调用 `openStPanel({runtimeWindow:window,hostWindow:酒馆顶层})`。可选 `三消面板.js` 仅提供同一入口的 IIFE 包装，无须另行安装存档管理助手脚本。首次打开自动绑定当前聊天；第四份聊天展示手动删档管理，不替换旧档。

模块在酒馆顶层运行并持有 IndexedDB 服务，跨消息 iframe 共享 `window.match3Panel`，底栏重绘/卸载不销毁管理器。`hasPendingStBattle(options)` 只隐藏初始化并检查持久化待办，不打开面板或创建新档；底栏关闭模式前用此方法检查刷新前留下的战斗与待保存结果。`match3Panel.destroy()` 清理顶层界面及服务。

面板中的“编队与能力装配”独立保存配置，确认不开始战斗。当前提供魂片收藏、往昔再现、战斗记录和存档管理；完整武器淬炼仍在后续任务中。

用户本机真实 8000 环境的源码预览与公开模块验证见 [角色卡接入记录](sillytavern-user-integration-20261024.md)。这次更改本地 DNF 源码，不会自动替换角色卡中已配置的 CDN 资源。本轮已补正文正则遭遇入口；完整过程进入模型上下文仍保留明确缺口，见 [协议对齐审查](sillytavern-protocol-alignment-20261024.md)。

## 运行时 AI 与正文正则

安装页提供“下载运行时 AI 协议”和“下载正文正则 JSON”。前者是 EJS 模板，原样并入现有世界书，由现有提示词模板扩展读取消息变量并按模式开关决定是否注入；原生《战斗规则》同步使用互斥条件；后者导入 ST 正则扩展，仅处理 AI 输出的显示，不改变原消息及模型上下文。正则模板由部署目录生成，迁移站点后重新下载。

`<match3>` 与 `</match3>` 各占一行，块内顶层只填 `enemyDesigns`，配置 1–4 名敌人；每名敌人只填颜色、档位、形态、职责、等级五项。组装方式、具体效果、权重及数值浮动由程序处理。协议字段和值域见 [完整说明](sillytavern-runtime-ai.md)，枚举从正式编译器词表生成。

显示正则渲染消息内远端遭遇卡，点击调用顶层单例 `playMessageStory(source)`，首次自动绑定聊天，读取已保存的编队，直接进入原生战前加载与战场。战斗 ID 根据存档、角色、聊天、楼层、时间和 swipe 生成；请求摘要根据解析后的配置生成。同一消息重复进入复用待完成 ticket，已有结算展示原收据；已有记录后修改配置会提示冲突，不重新发奖。新战斗要求最新 AI 消息，准备确认前后检查来源、模式与聊天。

远端卡通过限定来源、origin 与 nonce 的 postMessage 取得摘要；原 JSON 不插入 HTML。战场继续使用现有酒馆覆盖层及全屏操作。完整行动过程永久保存、送入后续模型请求及模型实际续写仍待完成，下载协议与正则不等于这部分已验收。

## 独立联调站点与安装产物

交付人工测试的前提是部署后的网页经过真实酒馆助手与 MVU 联调。本地示例宿主、API 夹具及构建 smoke 仅提供各自范围的证据。

`npm run build:tavern` 生成独立 `dist-tavern/`，包含安装页、组装预览、宿主 ESM、战场与静态资源。`npm run deploy:tavern` 使用 `deploy/sillytavern.wrangler.jsonc` 发布独立联调 Worker。已发布站点及真实环境测试记录见 `docs/sillytavern-release-20261024.md`。

打开已部署站点的 `/sillytavern-install.html`，下载原生酒馆助手脚本 JSON，在助手脚本库导入并启用。下载内容已使用当前站点的部署地址，可保留子路径。也可复制页面中的加载器。脚本选择实际酒馆父窗口，等待 MVU；脚本重载或卸载时清理旧宿主界面、监听器及数据库连接。

## 原有通用构建与安装

1. 执行 `npm run build`。普通构建和 remote 构建均包含根目录的 `sillytavern-host.js` 与 `sillytavern-battle.html`，以及它们依赖的 `assets/`。
2. 将完整 `dist/` 发布到 HTTP/HTTPS 静态站点。入口文件采用 `Cache-Control: no-cache`，带哈希的依赖采用长期缓存。酒馆跨站导入时，入口与依赖均须响应 `Access-Control-Allow-Origin: *`；构建生成的 `_headers` 已包含这些规则，并跟随 `VITE_BASE` 子路径。
3. 同步当前仓库的 `docs/mvuzod.js` 变量结构，其中羁绊角色包含可选的 `三消.颜色`，顶层包含 `三消战果` 完整记录字段。已有角色保持未初始化，首次由桥接脚本写入后保留。
4. 将 [加载器](../scripts/sillytavern-loader.js) 放入酒馆助手脚本，设置其中的 `MATCH3_BASE` 为部署目录，保留末尾斜杠。加载器等待 `Mvu`，再传入实际酒馆窗口与助手函数。
5. 打开已有消息且已经初始化 MVU 人物变量的聊天，点击“三消存档”，创建该聊天的存档。

静态服务器若未使用 `_headers`，需把等价响应头配置到服务器。开发服务器的 CORS 配置保持项目默认；生产跨站检查使用生成文件和独立 HTTP 来源验证。

## 宿主 API 与存储归属

`installStHost({hostWindow, helpers, hostId?, battleUrl?, prepareReplay?})` 接收实际酒馆窗口。IndexedDB 从 `hostWindow.indexedDB` 打开，即使入口代码由助手 iframe 导入，存档仍归酒馆来源。

- `getContext()`：读取当前聊天、角色卡 avatar、群聊 ID、最后一条消息及 swipe。
- `getVariables({type:'chat'})` 与 `updateVariablesWith(updater,{type:'chat'})`：使用同步版本读写聊天级引用。
- `Mvu.getMvuData({type:'message',message_id})`：同步读取消息变量；`replaceMvuData(data,options)`：异步写入，再读回核对。
- 支持 `accountStorage` 的真实酒馆使用数据库 `match3.sillytavern.v1.account.${encodeURIComponent(accountId)}`；旧宿主无账号存储时保留 `match3.sillytavern.v1`。数据库版本 2；对象仓库 `root`（键 `state`）与 `replayOutbox`（按 battleId）。升级保留已有存档。每次变更在同一读写事务内验证完整存档，版本冲突要求重读。

聊天变量中的引用结构：

```json
{"match3":{"version":1,"saveId":"SAVE_ID","chat":{"hostId":"HOST_ID","characterId":"avatar:CARD_AVATAR","chatId":"CHAT_ID"}}}
```

一个槽位只绑定这份聊天。三个槽位满后要求玩家手动删除；切回旧聊天继续使用旧档；复制聊天继承的旧引用与当前身份不符时忽略，创建独立新档。删除另一份存档保持当前聊天引用。导入仅接受当前聊天的备份，且要求先手动删除当前旧档。

默认宿主 ID 保存在酒馆来源的 localStorage `match3.host-instance.v1`。安装侧可传入稳定的 `hostId` 区分身份。适配器在酒馆 `accountStorage` 中持久化 `match3.host-account.v1`，账号对应的三槽和待保存战果使用独立数据库；账号切换销毁旧入口。旧宿主缺少 `accountStorage` 时使用兼容数据库，该路径未保证账号隔离。聊天改名、删除后复用名称、群聊及跨设备迁移的身份稳定性仍需真实环境验证。

## 同伴颜色

字段位置是 `stat_data.羁绊列表[角色名].三消.颜色`，内容为 `Red / Blue / Green / Yellow / Purple / Brown` 中一种或两种不同颜色。

`handle.service.initializeCompanions([{name,colors}])` 在宿主聊天写入锁内核对消息、swipe 与完整变量指纹，写入后读回确认。已有颜色保留；MVU 若剥离字段则报错，存档镜像只接受实际读回的颜色。人物 HP、临时 HP 及其他变量原样保留。默认准备页提供一色或双色选择，写入后重开不重抽；取消准备也保留已确认的颜色。

## 再现启动、提交与结算

默认使用内置准备页；安装方可选传 `prepareReplay(save,encounter)` 返回当前已准备好的 `{party, playerContext?}`；`party` 是当前装备和队伍的 1～4 名角色快照，`playerContext` 可带当前玩家旗帜与法力精通。已有准备模块也可直接调用：

```ts
await handle.playReplay(encounterId, {party, playerContext});
```

流程如下：

1. `service.beginReplay` 读取当前聊天的档案，将完整请求写入 `pendingReplay`。敌方、种子、战场和规则来自原场胜利记录，我方生成独立满血快照。已有待完成挑战时先继续或手动放弃。
2. 打开 `sillytavern-battle.html` 独立 iframe。每场隔离引擎注册表及召唤相关全局状态。双向消息核对窗口、来源和本场随机 nonce。
3. 战斗页面使用 `prepareStBattle` 和真实 `App`，结束时提交实际 `BattleResult` 与事件流。
4. `service.completeReplay(saveId,result,events)` 使用已入库的原请求核验，写入魂片、能力、完整收据和战报，并清除待完成记录。切换酒馆聊天后仍结算到原存档，酒馆变量保持原值。
5. 结果先持久化至 `replayOutbox`，再结算；事务成功后发送确认，结算页面显示完整实际收据。队列清理失败也保留奖励展示。未暂存成功时提供结果导出并保护离开；已暂存后可返回、刷新并从面板重试。重复结果返回原收据，冲突结果被拦截。放弃、删除、开始与队列校验使用一致事务约束。

再现仅累计未学会能力的魂片，败北没有发奖；同源多只只计一次。任何来源学会同一能力后，全档对应来源关闭收集；整场全部学会后保留图鉴和记录，关闭新挑战。既有待完成记录仍可完成，已学会能力保持零新增。

## 剧情遭遇与回写

管理页已移除“剧情挑战”与本场配置确认入口。正式消息由 `<match3>` 协议解析，内部调用 `handle.playStory(plan)` 使用下方 `StoryPlan` 结构；输入损坏或组装失败时返回原因，尚未建立待战斗记录。当前已保存编队直接用于战斗。创建／解除存档引用时保留既有 `storyResults`。


```ts
await handle.playStory({
  enemyDesigns: [{
    assembly: 'classified',
    manaColors: ['Red'], rank: '杂兵', form: '人形', role: 'Striker',
    level: 20, difficulty: 1,
    effects: [{effect: 'damage', requirement: 'required'}],
  }],
  difficulty: '普通', seed: 42,
});
```

立绘按档位、形态和视觉职责选择，颜色独立用于机械配置；缺同职责图片时回退到同档同形态。当前分类组装规则见 [敌人组装器 v2](sillytavern-enemy-assembler-v2.md)。

assistant 消息使用精简 [运行时协议](sillytavern-runtime-ai.md)：只提交 `enemyDesigns`，效果填写字符串数组；版本、基础倍率与组装方式由解析器补齐。三消独立难度和血量倍率留待后续，当前不接入 AIRP 难度。下面为宿主直接调用的内部 API，旧格式继续兼容。

运行时可提交 `enemyDesigns` 语义阵容，使用 `assembly: 'classified'` 按共享词表选择真实立绘、完整主动和独立特质；内部配方标识由程序管理。旧输入省略 `assembly` 时保持 `native` 整套原配方模式，保证保存结果可复现。`enemyDesignPrompt()` 提供同一词表生成的设计说明。每个位置以全场种子派生独立且可复现的选择，并分配唯一站位标识；整队任一设计失败时在准备弹窗前返回具体错误。已有本地蓝图仍可传 `enemies: validatedEnemyBlueprints`；两种输入择一，阵容均为 1～4 人。弹窗准备当前角色和装备；确认时以及异步存档事务前核对聊天、消息、swipe、存档绑定与完整变量指纹。`pendingStory` 冻结请求、来源及 `origin`；只有实际三消胜利建立图鉴，败北保留战报并回写实际生命，魂片为零。

遭遇可附带 `budgetPolicy: {version: 1, id: '场景预算版本', maxMemberPower, maxTeamPower, maxMembers}`；三项上限至少提供一项，人数限制为 1～4，战力上限为非负安全整数。省略策略时保持原有设计行为。参考分直接复用原生 `combatPower`，按最终等级／难度、面板、法力消耗和特质计算；它不证明技能组合、先手或武器克制已经平衡。语义路径先从预算内候选按种子选择，再检查完整整队；蓝图路径恢复后检查同一策略。任一超限在队伍准备之前报出实际值与上限，不调整配置来凑预算。编队没有满足总额时本轮直接返回错误，不自动重搜组合。

往昔再现仍冻结原场完整敌方配置与规则，不按新的预算策略改变旧遭遇。预算策略本身带版本，评分报告另列 `native-combat-power-v1` 和 `uncalibrated`，不与五档平衡标定版本混用。

已提交剧情收据包含 `storyOrigin`。按最终生命百分比换算至原始酒馆生命上限，HP 与完整事实记录同次写入 `stat_data.三消战果[battleId]`，随后同步聊天级 `match3.storyResults[battleId]`。后者记录击败、倒下/复起、初末 HP 和百分比、净损耗与累计伤害/治疗。MVU 标记用于重试防重放；镜像确认成功后才移除队列。更换聊天、消息或变量冲突时保留结果，不覆盖新的状态；切回原聊天/消息后重试。已入账奖励在该场结算保留显示。

往昔再现使用当前准备配置的独立满血快照，原场完整敌方和规则保持；本模式不调用剧情回写，不更改酒馆当前 HP 或临时 HP。剧情临时 HP 大于零时准备页暂时拦截；再现可正常使用同一人物。

## 刷新与版本边界

已入库的待完成开局快照可在刷新后重新打开；目前从本场开局重新挑战。手动放弃清除该待完成记录，魂片与战果不变。

跨刷新结果队列已交付，面板提供保存、导出与导入本场战果，恢复后显示真实收据。逐行动记录及目标/颜色/分支/格子选择恢复仍待实现，尚未产生终局时只恢复开局快照。规则版本变化会拦下旧配置；历史完整技能定义封存与旧版目录保持尚待实现，目录内容变化后的精确历史重现不列为已通过。

## 可复现检查

```powershell
npm run build
node scripts/st-host-dist-smoke.mjs
npx vitest run tests/unit/stSave.test.ts tests/unit/stHostAdapter.test.ts tests/unit/stBattleRuntime.test.ts
npx playwright test tests/e2e/stHost.spec.ts tests/e2e/stReplay.spec.ts tests/e2e/stSaveRepository.spec.ts tests/e2e/stSettlement.spec.ts
node scripts/build-st-portraits.mjs --check
node scripts/st-enemy-inventory.mjs --check
```

生产烟雾脚本实际打开生成的 ESM，并从另一个来源导入它及其依赖，检查公开导出、聊天绑定、宿主 IndexedDB 和面板。浏览器再现测试运行真实战斗页面，验证原档入账、奖励可见、重复确认、暂时写入失败后的重试、满血快照、酒馆 HP 保留、待完成记录重开及手动放弃。
