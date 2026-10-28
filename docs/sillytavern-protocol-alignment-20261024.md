# SillyTavern 协议对齐审查（2026-10-24）

**快照说明：**以下静态审查记录早于本日新增开局/底栏接入。后续实施已经定位 DNF 源码，并统一字段为 `系统配置.三消战斗模式`（默认 false）；文中 `独立三消模式` 仅为审查时的建议名。新增入口的实施与真实验证见 [角色卡接入记录](sillytavern-user-integration-20261024.md)。本轮已补正文协议、可导入正则与消息入口；完整 AI 可见过程仍是缺口。

## 实施后的当前状态

开局/底栏/MVU 开关及非战斗编队管理已实施，本页后文“新增交互要求尚未落地”是实施前审查快照，不是当前状态。正式入口已直接加载公开面板模块；独立存档助手脚本不再是角色卡正式入口依赖。本机真实酒馆的验证边界见上方接入记录。

正文块解析、可导入显示正则、原消息远端遭遇卡，以及按消息身份受理与复用已实施。消息卡进入既有准备与覆盖层战场，当前不把棋盘本身嵌在正文高度内。协议与安装说明见 [运行时 AI 协议](sillytavern-runtime-ai.md)。完整过程永久留存及下一轮 AI 上下文注入仍属缺口；模型自动生成遭遇尚未联测。以下缺口描述均保留为实施前快照。

## 实施前静态审查快照

本次以用户原始需求、2026-10-24 新增交互要求和工作区当前源码为准，审查范围限于“AI 正文结构化遭遇 → 正则替换远端 iframe → 按参数战斗 → 完整战报回到 AI”。只新增本文；未修改引擎、产品代码、其他任务文档，未逐敌人验证，未读取账号数据或密钥。以下文件行号对应审查时工作区，含已有未提交实现；文档中的发布记录属于既有证据，本次未重新进行真实酒馆或模型联测。

**给主线程的主要结论**

- **已实现的是变量驱动的战斗闭环**：聊天 `match3.encounter` / `handle.playStory(plan)` → 编译敌人 → 队伍准备 → 远端 iframe 真实战斗 → 结算收据 → MVU 生命与聚合事实回写、聊天事实镜像。真实发布记录明确：遭遇由变量 API 写入，尚未联测模型对话自动提交。见证据 E2、E3、E7、E10。
- **原需求的正文正则入口尚缺实现证据**：当前安装产物是独立助手脚本；源码入口没有读取 AI 正文、识别战斗块、导入正则规则或把该块替换成远端 iframe 的逻辑。已经存在的战场 iframe 是点击宿主按钮后动态创建的全屏覆盖层内页面。产品方案中的正文卡与正则职责仍是计划。见 E1、E2、E4。
- **已有“聚合事实战报”，尚未交付“完整过程反馈供 AI 演绎”**：终局确实传回事件流，且临时进入持久队列；正式收据和回写记录没有保存完整行动过程，成功同步后队列清理。MVU/聊天变量落盘也尚未证明下一次模型请求收到了报告。既有变量中还缺本场实际奖励清单。见 E5～E8。
- **新增交互要求尚未落地**：MVU `系统配置` 没有独立三消开关，现有 `战斗数值模式` 仅选择经典/新版换算；当前“存档”悬浮按钮和助手脚本按钮未接入开局配置页或底部状态栏。应由既有 MVU/状态栏的集成生命周期加载共享桥接模块，保留宿主 IndexedDB 存档能力，取消对单独安装存档助手脚本的产品依赖。见 E9。

**原要求 / 现有证据 / 实际缺口 / 具体建议**

| 原要求或新增要求 | 现有证据与状态 | 实际缺口 | 具体建议（均为后续工作） |
| --- | --- | --- | --- |
| AI 在叙事正文中间输出包含敌人信息的结构化小块 | 原话见 E1；已有 `StoryPlan`、语义设计词表和 `enemyDesignPrompt()`，可经函数或聊天变量提交，见 E2、E3 | 语义编译器已经存在；正文的块定界、版本、提取、来源绑定和提示词实际安装尚无入口。旧任务书五字段示例也尚非当前 `EnemyDesignInput` 完整输入 | 冻结一个正文封装格式，解析后转换成已有 `StoryPlan`；复用共享词表与校验器。AI 只填写有语义的遭遇设计，消息/块引用、战斗 ID、蓝图、立绘及内部敌人 ID 由宿主生成 |
| 外部正则匹配战斗块，替换远端链接并内嵌展示 | 产品方案写明正则/渲染钩子负责入口；安装器实际仅导出助手脚本，见 E1、E4 | 在本次范围内未找到可安装正则规则、正文解析器、正文内 iframe 入口或该入口调用桥接模块的测试 | 交付一份可导入的正则/消息渲染规则及远端入口页；保留原消息原始块，渲染为远端 iframe 遭遇卡。为普通正文包围、多个块、重新渲染和无效块建立验收 |
| 按传入参数启动真实战斗 | `playStory` 已编译 1～4 名敌人、准备我方队伍并冻结 `BattleRequest`；iframe 走 ready/start/result/ack，见 E2～E4 | 已实现的参数通道是父宿主发送 `start.request`；现有战场 URL 只携带握手信息。直接把敌人 JSON 拼入现有页面 URL 尚无对应解析逻辑 | 正文入口解析一次后走同一编译/准备/冻结链路，由宿主通过既有握手发送请求。正文内卡片和底部面板共享一个控制器与本场状态 |
| 同一正文遭遇重开时保持参数与结算身份 | 现有待完成请求已落盘，同 battleId 结算去重；见 E2、E6、E7 | `StoryPlan` 尚无正文来源绑定；每次新开 `playStory` 生成新的战斗/请求 ID。现有去重保障尚未覆盖“同一正文块再次点击被当作新剧情战” | 宿主用聊天、原消息、swipe 和块序号建立受理键，在首次受理时固定设计/种子/引用映射；重渲染与回点返回原准备、待完成战斗或原收据 |
| 战后反馈完整过程，AI 按事实演绎 | 终局发送 `result + events`；报告保留胜败、初末 HP、倒下/复起次数及累计生命变化，见 E5～E7 | 正式报告没有按行动排序的施法、目标、状态、护甲、召唤/变形和选择记录；底层摘要/哈希只证明摘要信息，尚不足以还原每个行动的过程 | 新增版本化的永久行动档案和中立机械过程投影；终态/聚合事实保留。短战全部发送有意义行动，长战分块并标记覆盖范围，完整档案可展开、导出和补发 |
| 报告实际反馈给运行时 AI | 已写消息 MVU `stat_data.三消战果[battleId]`，并镜像聊天 `match3.storyResults[battleId]`；见 E7、E8 | 这两处都是变量持久化。当前助手接口没有报告消息/上下文注入能力，也没有下一次模型输入的检查证据。即使现有 MVU 提示词偶然包含聚合字段，完整过程字段仍缺失 | 选定并实现一个明确的模型可见投递位置，例如本聊天持久化的结果消息或既有 MVU 上下文构建器；按 battleId/reportVersion 去重，界面分别显示“战果已保存”和“报告已投递” |
| AI 演绎时遵从本场实际收益 | 本地收据有 `grants`，结算页逐项显示名称×数量；见 E6、E8 | `StoryWritebackRecord` 只取 `result/report/actors` 等，省略 `grants`。`result.economy` 与可选资源审计属于战场收支，尚非实际持久发奖清单 | AI 报告直接复制已提交收据的 `grants` 和学会能力事实；所有已实际发放的材料/货币，包括本场首胜、里程碑和活动收益，都与结算卡一致。报告重试复用收据，零收益明确写零 |
| 新增：独立三消模式开关位于 MVU 系统配置，由开局配置页设置 | MVU 系统配置现有字段及准备页读取见 E9；任务书已有战斗方式选择设想，见 E1 | 没有三消模式字段，也未见开局配置页对此字段的写入。`activeCombat.mode` 仍为产品方案描述，未见本次范围内实现 | 增加独立布尔字段，建议 `stat_data.系统配置.独立三消模式`；开局页写入并读回，同一字段供正文入口和状态栏使用。经典/新版计算仍使用原 `战斗数值模式`。默认值及旧档迁移作为显式产品决定，建议缺省关闭 |
| 新增：底部状态栏唤起面板，不依赖独立存档助手脚本 | 现有 `handle.open()` 可打开面板；安装器、加载器及悬浮按钮见 E4、E9 | 当前必须先运行独立助手脚本获得 handle；右下角悬浮按钮与助手按钮都不是底部状态栏接线。本次范围未定位到开局页/底部状态栏的实际源码 | 从既有 MVU/状态栏集成启动桥接控制器；底部状态栏调用其面板打开接口。拆分控制器与默认悬浮按钮挂载，复用原存档服务；以停用独立存档助手脚本后的完整流程作为验收条件 |

**关键证据与文件行号**

- **E1｜原始要求与方案边界**：[原需求 L7～11](sillytavern-original-requirements.md#L7) 明确游客本地存档、正文中结构化遭遇、外部正则、远端内嵌和完整战报；[原需求 L122～134](sillytavern-original-requirements.md#L122) 反对协议示例里的无意义内部引用。[产品方案 L24～26](sillytavern-battle-product-plan.md#L24)、[L44～61](sillytavern-battle-product-plan.md#L44)、[L106～120](sillytavern-battle-product-plan.md#L106) 描述正文入口、冻结及五字段设计示例；[L307](sillytavern-battle-product-plan.md#L307) 单独规划 `activeCombat.mode`；[L376～405](sillytavern-battle-product-plan.md#L376) 要求完整过程及 AI 输出层；[L425～436](sillytavern-battle-product-plan.md#L425) 将正则、桥接和注入报告分别列为职责。以上方案文字均需用源码确认交付。
- **E2｜真实剧情入口及参数冻结**：[hostEntry.ts L30～34](../src/sillytavern/hostEntry.ts#L30) 定义 `StoryPlan` 和公开 handle；[L73～94](../src/sillytavern/hostEntry.ts#L73) 校验并读取聊天变量 `match3.encounter`，展示确认；[L107～123](../src/sillytavern/hostEntry.ts#L107) 编译阵容、准备队伍、创建请求并进入 iframe。`seed` 缺省时预览用 0（L89），实际开战用随机数（L113）；首次受理时统一种子与配置还可避免预览和实际阵容选取不同。
- **E3｜已有语义设计能力**：[enemyDesign.ts L88～92](../src/sillytavern/enemyDesign.ts#L88) 当前输入除等级/四维外还有每名敌人的数值 `difficulty` 和 `effects` 数组；[L147～160](../src/sillytavern/enemyDesign.ts#L147) 校验这些字段；[L167～174](../src/sillytavern/enemyDesign.ts#L167) 生成设计说明；[L636～640](../src/sillytavern/enemyDesign.ts#L636) 按阵容序号生成种子和 `enemy-1` 等内部 ID。无需让 AI 编写 troop/portrait/recipe ID。顶层 `StoryPlan.difficulty` 是难度名称，成员 `difficulty` 是显式面板倍率，两者类型不同。
- **E4｜安装产物与实际 iframe**：[installer.ts L3～8](../src/sillytavern/installer.ts#L3) 生成单独助手脚本及“三消存档”按钮；[installPage.ts L11～16](../src/sillytavern/installPage.ts#L11) 下载/复制该产物；[加载器 L35～58](../scripts/sillytavern-loader.js#L35) 导入 ESM、安装 handle 并绑定助手按钮。[replayLauncher.ts L27～39](../src/sillytavern/replayLauncher.ts#L27) 构造握手 URL 和动态战场 iframe，容器是 fixed 覆盖层；[L57～65](../src/sillytavern/replayLauncher.ts#L57) 校验窗口、origin、nonce 后发送 `start.request`。[replayFrame.ts L6～27](../src/sillytavern/replayFrame.ts#L6) 从查询参数取握手信息，收到 start 后调用真实 App；这段未从查询参数提取敌人设计。
- **E5｜终局确有事件流，聚合报告不等于过程档案**：[replayFrame.ts L11～26](../src/sillytavern/replayFrame.ts#L11) 在终局提交 `events: app.exportEvents()`；[App.ts L888～890](../src/render/App.ts#L888) 返回会话事件快照。[battleReport.ts L5～15](../src/sillytavern/battleReport.ts#L5) 列出报告字段，全部是单位聚合事实或名单；[L17～48](../src/sillytavern/battleReport.ts#L17) 由事件累计计算后返回聚合对象。[contract.ts L237～255](../src/session/contract.ts#L237) 说明 combatants 仅含请求原始角色，另有召唤数、经济审计、行动摘要哈希和事件计数；这些字段尚无完整逐行动表示。可选经济审计保留资源收支片段，仍不足以表示全部战斗过程。
- **E6｜正式收据保存与显示的内容**：[save.ts L34](../src/sillytavern/save.ts#L34) 的 `SettlementReceipt` 有 request/result/report/grants，没有完整 events/actions；[L134～136](../src/sillytavern/save.ts#L134) 同 battleId 返回原收据并校验冲突；[L161～170](../src/sillytavern/save.ts#L161) 保存实际魂片及明确奖励后创建收据。[settlementView.ts L27～55](../src/sillytavern/settlementView.ts#L27) 显示实际奖励、可选经济记录和生命聚合事实，没有逐行动过程展开。
- **E7｜事件队列生命周期**：[saveRepository.ts L9](../src/sillytavern/saveRepository.ts#L9) 的 `ReplayOutcome` 包含 events；[hostService.ts L73～74](../src/sillytavern/hostService.ts#L73) 将终局和事件一起暂存；[replayLauncher.ts L42～54](../src/sillytavern/replayLauncher.ts#L42) 先暂存、结算、显示收据再同步；[hostService.ts L91～102](../src/sillytavern/hostService.ts#L91) 在剧情写回成功后清理队列；[saveRepository.ts L107～111](../src/sillytavern/saveRepository.ts#L107) 实际删除 outbox 条目。故 events 在待同步阶段持久化成立，正常成功后的永久完整档案尚缺。战果导出按钮见 [replayLauncher.ts L82](../src/sillytavern/replayLauncher.ts#L82)，属于玩家显式导出的本场备份，未见自动转存永久过程档案。
- **E8｜回写内容、AI 可见性与实际奖励**：[storyWriteback.ts L15～22](../src/sillytavern/storyWriteback.ts#L15) 的写回记录类型没有过程或 grants；[L118～130](../src/sillytavern/storyWriteback.ts#L118) 构造记录并写 MVU 三消战果。[hostAdapter.ts L20～26](../src/sillytavern/hostAdapter.ts#L20) 的助手能力仅含上下文、变量及 MVU 读写；[L187～208](../src/sillytavern/hostAdapter.ts#L187) 确认 MVU 后写聊天镜像并读回校验，没有插入叙事报告消息或模型提示词的调用。[mvuzod.js L387～399](mvuzod.js#L387) 同样只定义聚合报告/结果写回。`writeback` 成功代表变量回写确认，尚非模型接收确认。
- **E9｜新增 UI 要求的现状**：[mvuzod.js L729～746](mvuzod.js#L729) 系统配置没有三消开关；[partyPreparation.ts L276～280](../src/sillytavern/partyPreparation.ts#L276) 仅据 `系统配置.战斗数值模式` 选择 classic/new 面板。[hostEntry.ts L60～69](../src/sillytavern/hostEntry.ts#L60) 创建独立根节点、右下角悬浮入口及存档面板；[L189～206](../src/sillytavern/hostEntry.ts#L189) 提供 `open()` 并管理生命周期，未绑定底部状态栏。源码中的 `mode:'story'/'replay'` 表示剧情/再现用途，亦非新增模式开关。独立脚本依赖见 E4。
- **E10｜真实环境既有证据的限度**：[宿主接入 L7～9](sillytavern-host-integration.md#L7) 概述已接能力与变量入口；[L72～97](sillytavern-host-integration.md#L72) 给出当前接入契约与镜像内容；[L103～105](sillytavern-host-integration.md#L103) 明示未终局恢复开局、逐行动/选择恢复待实现。[发布记录 L52](sillytavern-release-20261024.md#L52) 明确未配置模型，使用真实变量 API 提交遭遇；证据覆盖配置后的战斗/写回链路。
- **E11｜任务与验收文字仍需补齐协议缺口**：[推进计划 L94～122](../tasks/active/TASK-SILLYTAVERN.md#L94) 将消息入口、插入报告、遭遇卡和行动持久化列入 ST-05～07；[当前状态 L103～105](../tasks/active/STATUS.md#L103) 保持进行中。[产品验收 L18](sillytavern-product-acceptance.md#L18) 要求最近行动恢复，但 [L32](sillytavern-product-acceptance.md#L32) 战报行只列聚合事实，尚未单列完整过程及模型实际可读验收。2026-10-20 的 [旧方案审核 L22～24](sillytavern-product-plan-audit.md#L22) 有接线未落地的历史判断，现时进度须以上述源码与最新记录为准。
- **E12｜现有测试的证明范围**：[stSemanticStory.spec.ts L22～26](../tests/e2e/stSemanticStory.spec.ts#L22) 经 handle 直接提交语义阵容；[stHostEmbedding.spec.ts L79～105](../tests/e2e/stHostEmbedding.spec.ts#L79) 验证聊天变量入口/跨来源战场；[stBattleReport.test.ts L13～38](../tests/unit/stBattleReport.test.ts#L13) 验证聚合生命事实；[stStoryWriteback.test.ts L88～108](../tests/unit/stStoryWriteback.test.ts#L88) 验证 MVU/聊天镜像；[stInstaller.test.ts L5～12](../tests/unit/stInstaller.test.ts#L5) 验证脚本下载与按钮。以上测试存在本身不证明正文正则、完整行动反馈或模型上下文投递已完成；本次只阅读，未重跑。

**具体落地契约建议：下述格式、字段及入口均为建议，尚未实施**

正文建议使用单一显式定界块；例如下例完整成员输入可以交给已有设计编译器，但外层定界与 `version` 解析仍需新增。顶层不要求 AI 提供 battleId、unitRef 或 blueprintRef，宿主按消息位置登记叙事对象映射。

```text
叙事正文……
<match3-encounter>
{"enemyDesigns":[{"level":18,"manaColors":["Blue","Purple"],"rank":"首领","form":"人形","role":"Defender","effects":[]}]}
</match3-encounter>
后续叙事等待本场战果。
```

正则的职责限于定位定界块和产生远端 iframe 展示入口；JSON 使用解析器和共享 schema 校验。宿主从原消息读取原始块，将聊天/消息/swipe/块序号与本场固定种子、受理状态一起保存。完整 JSON 经握手传送，避免把原始正文 JSON 直接插进 HTML 属性或 URL。新增远端遭遇卡收到数据后呈现准备入口，点击后复用已有编译、队伍准备与战斗会话；战场显示容器可接正文卡或现有覆盖层。仅正则替换出一个现有 `sillytavern-battle.html` 链接仍缺父宿主 start 请求，尚未构成该入口的完整交付。

完整反馈建议拆成三个持久对象：

| 对象 | 建议最小内容 | 数据归属与使用 |
| --- | --- | --- |
| 遭遇受理记录 | 协议版本、原消息/swipe/块序号、内部受理键、固定种子、编译后的请求和内部引用映射 | 宿主 IndexedDB；重开同一正文块复用，AI 输入只保留语义设计 |
| 完整行动档案 | battleId、规则/报告版本、顺序号、行动者/派生对象、行动与目标/颜色/分支/格子选择、因果事件、实际前后状态及效果、终态、报告完整性标记 | 宿主永久保存。终局 events 作为已有事实源；行动/选择及缺失因果信息需在后续会话接入工作中补齐。本次仅记录缺口，不涉及引擎修改 |
| AI 过程投影与投递状态 | 同一场终态、逐行动中立过程、初末 HP/倒下/复起、实际奖励名称数量、已覆盖行动区间/总区间、分块引用、投递键和确认状态 | 由持久事实生成，送进当前聊天实际参与下一次生成的消息或 MVU 提示词。过滤内部源部队/立绘/技能身份，保留叙事编号映射；再现仅进本地档案 |

保留现有“本地结算优先、MVU 幂等写回”链路；新增报告投递有单独重试状态。只完成变量回写时保留“报告待投递”，投递重试复用同一报告且保持本场发奖不变。完整行动档案应在临时队列删除前永久保存；成功清理 outbox 后仍可从历史战报展开/导出。长战斗需在没有额外读取工具的情况下提供完整发送或分段发送操作，并让模型看到覆盖范围。

新增模式的建议接线顺序：

1. 在 MVU `系统配置` schema 增加 `独立三消模式` 布尔字段，开局配置页写入、保存和读回。旧档缺字段的迁移默认建议为 false；最终字段名和默认值在实施时统一到提示词、配置页与状态栏。
2. 既有 MVU/状态栏集成的启动生命周期导入共享宿主 ESM，持有一个聊天感知的控制器。拆分当前 `installStHost` 的默认按钮挂载与服务初始化，使既有底部状态栏能唤起同一面板。现有 `handle.open()` 可复用；仅从状态栏调用一个由独立助手脚本创建的全局 handle 仍保留旧依赖。
3. 底部状态栏显示三消状态及面板入口；面板可查看队伍、图鉴/再现、历史战报和存档管理。模式开关由 MVU 配置持有，存档继续保存在宿主 IndexedDB。正文入口、状态栏和宿主 API 都检查该模式，避免三个入口状态各自漂移。
4. 模式关闭时保留已有存档；尚未开始的剧情遭遇走原生 AIRP。已有受理/战斗/待同步结果保持原模式和原请求，结算后再切换，按既有战斗锁计划补跨模式互斥与 HP 写回约束。
5. 本次审查目录未定位到开局配置页/底部状态栏源码；主线程需在实际角色卡前端或宿主集成项目落实这两个触点。本报告不推定外部组件已实现，也不虚构仓库文件路径。酒馆助手/MVU 的既有技术依赖与“玩家额外安装一个存档管理脚本”的产品依赖分别验收。

**建议主线程补充的验收切片**

| 切片 | 明确通过条件 |
| --- | --- |
| 正文主入口 | 在真实 AI 消息的两段普通正文之间输出一个合规遭遇块，导入交付正则后在原消息位置出现远端 iframe；点击后按该块参数进入准备及战斗。记录原文、渲染结果、请求快照与来源绑定 |
| 块生命周期 | 同消息多块、swipe、旧消息重渲染、重复点击分别得到正确的受理状态；同一块不因重渲染新建剧情战或重复入账。无效块在开战前显示具体原因 |
| 参数一致 | 省略种子时也在首次受理固定；卡片预览、准备、开战及刷新使用相同阵容与种子。顶层难度名称、成员倍率与经典/新版面板模式各自正确 |
| 完整过程永久化 | 用固定小阵容覆盖一次施法、状态、护甲/HP 变化、倒下/复起或召唤等代表事件；核对动作顺序与实际数值。清理成功队列并刷新后仍可展开完整过程；逐行动恢复单独保留 ST-07 验收 |
| AI 实际输入 | 检查下一次生成的真实请求上下文含本场过程投影、引用映射、完整性/覆盖标记和实际奖励；保留脱敏证据。短战过程完整，长战可分段补齐；只检视变量 JSON 尚不足以通过此项 |
| 新模式与入口 | 停用独立存档助手脚本，由开局页设置 MVU 三消模式；刷新及聊天切换后读回一致，底部状态栏能唤起同一面板并完成正文开战、结算、报告投递 |
| 账实一致与失败重试 | 胜利/败北和零收益的结算卡、持久收据及 AI 报告逐项一致；MVU 回写失败与报告投递失败分别可重试，重复提交保持原数量。再现战果保持本地用途 |

本次为有界静态审查：核对了源文档、协议入口、安装产物、战场握手、聚合战报、暂存/正式存储、变量写回、MVU schema 与相关测试断言；未执行构建、引擎/敌人测试或外部模型调用。交付完成度应分别记录“变量到真实战斗”“正文正则入口”“完整过程永久保存”“AI 可见投递”“MVU 开关及既有状态栏入口”，逐项提供证据。
