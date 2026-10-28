# 2026-10-24 用户酒馆与角色卡入口接入

## 产品入口

正式入口使用现有 DNF 角色卡页面，不要求玩家另外安装“创建存档”助手脚本。

| 位置 | 行为 |
| --- | --- |
| `D:/Code/dnf/code/开局.html` | 在开局确认页配置三消开关，随预设、JSON 导入导出和最终开局 MVU 一起保存 |
| `D:/Code/dnf/变量/mvuzod.js` | `stat_data.系统配置.三消战斗模式`，布尔，缺省 false；与经典/新版战斗数值模式独立 |
| `D:/Code/dnf/code/底部状态栏.html` | 系统设置切换模式；开启后导航显示“三消”，点击懒加载公开面板模块 |
| `D:/Code/dnf/code/三消面板.js` | 可选独立注入包装，提供 `match3_panel_open()`；底栏已经可以直接加载同一公开模块 |
| `src/sillytavern/panelEntry.ts` | 公开 `openStPanel()` / `hasPendingStBattle()`，在酒馆顶层持有单例，消息 iframe 卸载不丢失管理服务 |
| 管理面板 | 首次打开自动将当前聊天绑定一个存档；最多三份聊天，满槽展示手动删除；编队与能力装配保存不启动战斗 |

底栏关闭模式前查询当前聊天的 pending 战斗和待同步结算；刷新后还没有面板句柄时，使用隐藏状态查询。状态查询不显示管理 UI，也不创建存档。查询失败时保持原开关值，避免丢失未结算流程。

独立助手安装页保留兼容与联调用途。正式角色卡入口不依赖该独立脚本。面板管理仍复用现有宿主、IndexedDB、编队和战场服务；本轮未修改 `src/engine/`。

## 真实酒馆联调范围

环境：用户已启动的 `http://127.0.0.1:8000/`，SillyTavern 1.18.0，真实 TavernHelper 与 MVU。目标角色为“创世回廊5.3”。本轮新建隔离聊天“三消接入验证-20261024”；原聊天不写入测试变量或战果。

新版底栏源码以临时同源 iframe 预览，面板通过公开 HTTPS 模块加载。此方式验证真实宿主 API、聊天变量、MVU、跨来源模块与存档绑定，不等于已经持久升级现有角色卡 CDN。

已获得的实际证据：

- `.tmp/st-user-integration/isolated-chat.json`：原聊天与隔离测试聊天身份。
- `bottom-mode-off.png` / `real-bottom-enabled.json`：模式关闭时无三消入口；从系统设置开启后真实 MVU 变为 true，入口出现。
- `real-panel-public.json` / `public-panel-in-user-tavern.png`：底栏调用公开模块、自动绑定聊天、无独立悬浮启动按钮、显示编队管理。
- `real-management-save.json`：`hasParty=true`，仅保存 `partyPreparation`，`pendingStory=false`、`pendingReplay=false`。
- `real-initial-enabled.json` / `real-initial-enabled.png`：原样底栏在全新 srcdoc iframe 中，模式初始为 true，首次点击成功，面板单例且无页面脚本异常。
- `real-reload-persistence.json` / `panel-reloaded.png`：消息 iframe 移除后服务保留；整页刷新并重开测试聊天，模式仍 true、saveId 完全一致，首次底栏点击成功。
- `real-mode-roundtrip.json`：先销毁顶层 handle，再通过底栏关闭模式，隐藏 pending 查询成功；入口隐藏、不新建档；重新开启后恢复相同 saveId。
- `original-chat-restored.json`：结束时切回原聊天，无三消绑定、无三消开关字段，临时预览与面板均清理。隔离测试聊天保留供复核。

诊断期间使用 `document.write` 重载同一测试 document 曾导致运行闭包中的 `app` 与可见 DOM 脱节，所有导航监听均丢失。该装载方式不计作正式入口验收。最终改用全新 iframe 加载原样源码，初始开启及整页刷新两条路径均通过；未因此改写原底栏的通用事件或战斗引擎。

底栏原有相对资源/字体请求有 404，三消公开模块正常加载；本轮页面脚本异常列表为空。隔离回归覆盖 pending=true、缺导出和查询异常时禁止关闭；真实 8000 本轮仅对无 pending 状态切换做了直接验证，未伪造战斗来扩大真实通过范围。

## 独立浏览器验收

子 agent 独立执行 `npx playwright test tests/e2e/stPanelEntry.spec.ts --workers=1`，最终 9/9 通过（29.4 秒）。覆盖关闭模式不建档、首次自动绑定、双消息 iframe 单例和卸载保留、三槽与手动删除、无存档隐藏查询、刷新恢复 pending、账号切换后重开、即时跨账号打开/查询和安装失败重试。测试文件的 ESLint 与 TypeScript 同样通过。

此前宿主面板浏览器 15/15 通过，包含独立编队管理不创建 pending；这两组与历史其他回归有重叠，不相加成独立产品验收总数。引擎 142 文件与本轮基线哈希一致（`engine-check.json`）。真实 8000 底栏验证按上一节单独记录。

## 发布验证

最终公开版本 `6e51881a-bb1f-4705-85be-286c26d9e34c`。`build:tavern`、TypeScript 和定向 ESLint 通过；七个公开入口均 HTTP 200，host/panel ESM 跨来源导入、JSON 下载、CORS、缓存策略检查通过，探针无浏览器异常。对应日志为 `.tmp/st-user-integration/{build-final.log,tsc-final.log,lint-final.log,deploy-final.log,published-final-verify.json}`。公开资源检查不代替真实酒馆或模型联测。

## 发布与本地角色卡的边界

公开模块地址为 `https://match3-tavern-playtest.linjiang-workshop.workers.dev/sillytavern-panel.js`，战场及资源位于同一独立联调站点。

本地 DNF 四份源文件已经接入；用户现有角色卡仍引用原 CDN 内容。本轮没有持久修改角色卡脚本、原 CDN 或其他角色。将更新后的开局页、schema、底栏发布到角色卡实际使用的位置，才会让现有玩家卡片获得新入口。可选的 `三消面板.js` 包装不是创建存档的必装依赖。

## 战斗协议与原始需求对照

| 用户需求 | 目前实际行为 | 状态与验收边界 |
| --- | --- | --- |
| AI 按语义设计敌人，程序分类组装 | `StoryPlan` / `EnemyDesignInput` → 分类编译器 → 冻结请求 | 已实现；本轮不增加逐敌人工拼装 |
| AI 在正文指定位置输出战斗块 | 原始 assistant 消息内单个 `[match3]` JSON 块，经严格解析与分类编译 | 已实现并在真实酒馆用助手 API 写入块联调；真实模型自动生成待验 |
| 外部正则将块替换为远端 iframe | 可导入显示正则在消息原位渲染远端遭遇卡，点击打开现有战场覆盖层 | 真实 8000 已通过；消息原位是卡片，棋盘使用现有覆盖层 |
| 参数启动真实三消 | iframe `ready/start/result/ack`，宿主传冻结 `BattleRequest` | 已有真实发布后胜利、败北、全屏与再现证据；本轮新入口另测 |
| 同正文块重渲染仍是同一场 | 存档、角色、聊天、消息与 swipe 派生稳定 battleId；requestId 额外含配置摘要 | 原消息来源校验、pending/receipt 复用与配置冲突检查已实现；每消息最多一个块 |
| 记录击败、同伴倒下、生命损伤 | 持久聚合战报与 MVU/聊天变量回写 | 已有基础记录和真实胜败证据，临时 HP 与复杂复起组合仍单列验收 |
| 完整过程供 AI 演绎 | 事件流传回并暂存 outbox，现有永久回写主要为聚合事实 | 完整行动流永久留存、实际奖励清单和下一轮模型请求注入仍待完成 |
| 开局独立开关、底栏管理入口 | 本轮新增 MVU 字段、开局/底栏接入与共享顶层面板 | 按本页真实入口验证记录，不提升整版任务状态 |

细项与源码依据见 [协议审查](sillytavern-protocol-alignment-20261024.md)。整版仍保留 ST-04～ST-09 进行中、ST-10 未验收；完整学习、武器淬炼、临时 HP、战斗中途逐行动恢复均不因本轮入口接入而标记完成。未配置模型账号，真实 AIRP 自动生成遭遇未联测。

## 本轮正文协议最终验证

最新发布 `fd66f3d5-5802-44ee-a5c7-658225608bf6`，用户真实酒馆隔离聊天已通过原消息→显示正则→真实助手 HTML 渲染→公开遭遇卡→准备→实际战场加载。测试结束手动放弃未结算战斗并恢复原聊天；临时正则未持久改写全局设置。测试未调用真实模型，不作为完整 AIRP 自动生成/续写通过证据。

提示词与正则现可直接取用：[提示词](sillytavern-runtime-ai-prompt.md)、[正则 JSON](sillytavern-runtime-regex.json)；安装步骤与字段词表见 [运行时协议](sillytavern-runtime-ai.md)。本轮测试记录见 `.tmp/st-runtime-protocol/real-message-integration.json` 与 `published-delivery.log`。原角色卡 CDN 仍未持久升级，需按现有角色卡发布流程更新。
