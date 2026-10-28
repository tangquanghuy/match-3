# 本地部署与真实酒馆联调

更新日期：2026-10-28。接手人可在自己的电脑上构建并运行三消网页，再由本机酒馆加载，整个流程无需 Cloudflare 账号、Token 或原站发布权限。外部角色卡的开局和底栏也可切到本地副本。下文命令均在项目根目录的 PowerShell 执行，示例路径 `D:\Code\match-3` 按接手人的实际目录调整。

## 1. 两个服务与需要带走的文件

| 服务 | 本文地址 | 用途 |
| --- | --- | --- |
| 接手人自己的 SillyTavern | `http://127.0.0.1:8000/` | 加载角色卡、聊天、酒馆助手、MVU 和 EJS，运行角色卡开局页与底栏。沿用接手人的酒馆启动方式。 |
| 本地三消静态服务 | `http://127.0.0.1:5185/` | 提供构建后的模块、战场、图片、安装页，以及可选的本地角色卡 HTML 副本。由本仓库启动。 |

两者运行在不同端口。本地三消服务只监听本机回环地址；保持两个服务运行，使用同一台电脑上的浏览器访问酒馆。手机访问自己设备的 `127.0.0.1` 会指向手机；跨设备测试需另行配置主机局域网地址和监听范围，本文配置适用于同机联调。

接手材料至少包括实际工作区源码、根目录的 `package.json` / `package-lock.json`、[本地预览配置](../../deploy/sillytavern.local.vite.config.ts)、`game-assets/bundled/`、`game-assets/public/`，以及 [角色卡文件快照](external/README.md)。需要已有真实角色卡、酒馆助手、MVU 变量框架和 EJS 模板扩展；仅启动三消网页只完成静态服务这一环。

完整的同步范围见 [文件说明与同步清单](files.md#8-同步项目必须带走什么)。集成源码已随本次用户要求的交接提交纳入版本控制；接手人应拉取包含本指南的最新版本，旧 HEAD 不含完整接入实现。依赖可由 `npm ci` 重装，完整 `dist-tavern/` 也可由交付方一并提供。

准备 Node.js、npm 和 Git，并先确认：

```powershell
Set-Location 'D:\Code\match-3'
node --version
npm --version
git --version
git rev-parse --short=12 HEAD
```

本次实际验证环境为 Node `v24.18.0`、npm `11.16.0`、Git `2.43.0.windows.1`，依赖锁解析出的 Vite 为 `6.4.3`；这些是实测版本，项目尚未声明 Node 的最低版本。

当前 [主构建配置](../../vite.config.ts) 会读取 Git 的 HEAD 作为立绘缓存版本键，因此从源码构建需要有效的 Git 提交。若收到的是完全没有 Git 元数据的源码压缩包，可在解压后的独立副本里执行下列初始化；已有仓库直接保留原历史并跳过：

```powershell
git init
git -c user.name=LocalHandoff -c user.email=local-handoff@example.invalid commit --allow-empty -m 'Local handoff build marker'
```

这个空提交仅提供本地缓存版本键，不代表已提交交接源码。使用交付方提供的完整 `dist-tavern/` 时可以跳过源码构建；下文专用预览配置自身不读取 Git HEAD。

## 2. 准备本地开局页和底栏副本

如果接手人的角色卡已装好这些页面，也需要确认实际底栏加载的是本机三消模块。交接快照里的地址仍是原公开站；修改本地副本，再装进自己的角色卡即可。

以下命令从原始快照生成便于本地加载的副本，原始快照与哈希清单保持原样。若接手人维护了更新的角色卡文件，应将输入路径换成自己的最新文件。

```powershell
$localCardDirectory = Join-Path (Get-Location) 'game-assets\public\local-card'
New-Item -ItemType Directory -Force -Path $localCardDirectory | Out-Null
$localCardEncoding = [System.Text.UTF8Encoding]::new($false)
$oldMatch3Base = 'https://match3-tavern-playtest.linjiang-workshop.workers.dev/'
$localMatch3Base = 'http://127.0.0.1:5185/'

$startupSource = Get-Content -Raw -Encoding UTF8 'docs\handoff\external\dnf-code\开局.html'
[System.IO.File]::WriteAllText((Join-Path $localCardDirectory 'startup.html'), $startupSource, $localCardEncoding)

$statusbarSource = Get-Content -Raw -Encoding UTF8 'docs\handoff\external\dnf-code\底部状态栏.html'
$statusbarSource = $statusbarSource.Replace($oldMatch3Base, $localMatch3Base)
[System.IO.File]::WriteAllText((Join-Path $localCardDirectory 'statusbar.html'), $statusbarSource, $localCardEncoding)
```

底栏中应得到：

```javascript
const MATCH3_PANEL_MODULE_URL = 'http://127.0.0.1:5185/sillytavern-panel.js';
```

本地副本放在 Vite 的静态资源目录，下一步构建会将其复制到 `dist-tavern/local-card/`。后续改动副本后需重新构建。

若选择可选的独立 [三消面板.js](external/dnf-code/三消面板.js) 包装，也把它的 `MODULE_URL` 换成同一个本机模块地址，再粘贴到自己酒馆的脚本中。正式底栏已直接加载模块时省略这个包装；存档绑定仍由现有开局与底栏流程进入。

## 3. 构建并启动本地三消服务

安装根目录依赖，构建酒馆专用页面：

```powershell
npm ci
$env:VITE_BASE = '/'
npm run build:tavern
```

输出目录为 `dist-tavern/`。若交付方已经给出完整构建，可省略 `npm run build:tavern`；本地预览仍需要根目录依赖。源码包缺少游戏图片、字体或音效时应先补齐运行资源，再构建。

随后运行：

```powershell
npm run preview -- --config deploy/sillytavern.local.vite.config.ts
```

终端应打印 `http://127.0.0.1:5185/`。保持该终端运行；需要停止时按 `Ctrl+C`。端口占用时命令会直接报错，便于保持地址一致。需要更换端口可追加 `--port 5186`，并同步本文所有本机地址、角色卡页面和下载的正则。

[专用配置](../../deploy/sillytavern.local.vite.config.ts) 读取 `dist-tavern/`，固定根路径 `/`，启用跨域响应，适配酒馆跨端口导入模块和隔离 iframe 的 `Origin: null`。Vite 普通预览的默认跨域范围与此不同。构建生成的 `_headers` 是静态平台配置，普通文件服务器不会自动应用其中规则，因此本流程直接使用已配好的 Vite 预览服务。

页面通过 HTTP 服务访问，保留构建目录结构；直接双击本地 HTML 会绕过本节的资源与跨域配置。本文按本机 HTTP 酒馆联调，其他协议或远程酒馆部署需核对浏览器的跨域与资源加载策略。

打开以下地址：

- 安装页：`http://127.0.0.1:5185/sillytavern-install.html`。
- 若执行了上一步：`http://127.0.0.1:5185/local-card/startup.html` 与 `http://127.0.0.1:5185/local-card/statusbar.html` 用于确认文件已被托管；正式使用仍通过酒馆助手渲染。
- `http://127.0.0.1:5185/sillytavern.html` 用于独立设计预览。

`tavern` 精简构建没有本体首页 `index.html` 和 `sillytavern-playtest.html`。请使用安装页的完整路径。正式 `sillytavern-battle.html` 由酒馆关联本场会话后进入；单独打开 URL 不会自动创建剧情战斗。

本地操作使用根目录 npm 依赖和静态构建即可。`npm run deploy:tavern`、Cloudflare 登录和 `worker/` 下的 Wrangler 属于公开站发布流程，接手人按本流程运行时跳过这些操作。

## 4. 在自己的酒馆安装本地入口

先备份接手人自己的角色卡、世界书和正则。下面修改的是接手环境中的副本。

1. 启动自己的 SillyTavern，在 `http://127.0.0.1:8000/` 打开角色卡。保持使用相同的酒馆地址和浏览器配置。
2. 在本地安装页下载“正文正则 JSON”，得到 `runtime-regex.json`。在酒馆正则扩展里导入，替换同名“三消·正文战斗入口 v1”，每个匹配位置保留一条有效规则。下载的替换内容应包含 `http://127.0.0.1:5185/sillytavern-message.js`。仓库中现成的正则 JSON 仍绑定公开站，本地安装以本机安装页下载的文件为准。
3. 如采用手工编辑，下载本机安装页的 `runtime-regex-replacement.txt` 全文，保留 HTML 代码围栏；原查找式为 `/<match3>\s*[\s\S]*?\s*<\/match3>/g`，用于 AI 消息显示，保持 `markdownOnly: true`、`promptOnly: false` 和 `runOnEdit: true`。
4. 下载同页 `runtime-ai.md`，或使用 [当前三消提示词](../sillytavern-runtime-ai-prompt.md)，更新角色绑定的三消世界书条目，保留外层 EJS。原生 AIRP 条目同步 [战斗规则](../战斗规则.md) 的互斥条件。EJS 根据当前 MVU 变量决定注入规则。
5. 对照 [人工部署说明的 MVU 合并位置](../sillytavern-manual-deployment.md#mvu-结构合并位置)，将 [mvuzod.js](../mvuzod.js) 中三消 schema 合入接手角色的现有 MVU 结构脚本，保留该角色其他字段。包括模式开关、同伴颜色和战果结构。
6. 将角色卡原开局页、底栏的 HTML 加载地址分别指向 `http://127.0.0.1:5185/local-card/startup.html` 与 `http://127.0.0.1:5185/local-card/statusbar.html`。保留原有匹配规则、酒馆助手 HTML 渲染包装和调用方式，只替换其中对应的原 CDN URL。如果现有入口直接内联 HTML，则粘贴本地副本全文。这里继续采用已有开局/底栏入口；独立三消战斗正则在第 2 步安装。
7. 整页刷新酒馆，让旧入口与缓存的模块引用重新加载。在测试聊天的开局页或底栏系统设置中开启三消，确认 `stat_data.系统配置.三消战斗模式` 为布尔 `true`，再点击底栏“三消”按钮。

HTML 页面应由现有酒馆助手入口执行。将底栏 HTML 作为另一个域的普通独立 iframe 打开，会失去它需要的宿主上下文；只在独立标签能看到页面也尚未完成角色卡接入。

安装页中的“兼容加载器”和“三消战斗与魂片.json”是可选联调入口。正式角色卡使用本节开局与底栏接入时省略安装，单独创建存档脚本也无需额外添加。

角色卡快照仍引用部分字体、图标及其他地图等外部资源。本流程把三消模块、游戏运行资源和上述角色卡 HTML 放到本地，完整角色卡的其余外部依赖按各自配置处理；这与 Cloudflare 发布权限无关。

## 5. 修改、重启与存档

`preview` 服务提供已经构建好的文件，源码修改后执行 `npm run build:tavern`，再整页刷新酒馆。修改本地开局/底栏时编辑 `game-assets/public/local-card/` 的副本后重建；直接修改 `dist-tavern/` 会在下次构建时被覆盖。

开发期可用 `npm run dev` 查看源码页面与测试台，但正式正则和底栏引用的是构建后的稳定文件名 `sillytavern-message.js` / `sillytavern-panel.js`，本地酒馆联调继续使用上述专用预览服务。预览端口应固定，避免每次重新安装入口。

存档由酒馆宿主窗口下的本地 IndexedDB 管理，配合聊天级变量绑定。酒馆从 `127.0.0.1` 换成 `localhost`、更换端口、浏览器配置或清理站点数据，都会改变或清除对应来源的本地存储视图。切换部署来源前先从管理页导出需要保留的三消存档，保存原聊天备份。单独更换三消资源地址与更换酒馆宿主地址应分开判断。

一槽绑定一个聊天，最多三个绑定；切换酒馆聊天不会把三个槽位合成一份数据。已有存档和图鉴继续遵循当前实现的迁移与导入逻辑。

## 6. 本地联调验收与排查

| 现象 | 优先检查 |
| --- | --- |
| 本地安装页打不开 | 三消预览进程是否运行、5185 是否被占用、是否访问了完整页面路径。酒馆 8000 服务与三消 5185 服务分别检查。 |
| 底栏点开仍请求公开站 | 检查实际装进角色卡的底栏版本及 `MATCH3_PANEL_MODULE_URL`；确认加载地址已替换；整页刷新酒馆。 |
| 正文入口仍请求公开站 | 从本地安装页重新下载正则并替换旧规则；用浏览器网络面板检查 `sillytavern-message.js` 的实际请求 URL。 |
| CORS 或模块 MIME 报错 | 使用本文专用 preview 配置；检查模块与其 `assets/` 依赖均返回 200 和 JavaScript MIME。普通 `python -m http.server` 不自动提供本文所需的 CORS 设置。 |
| 页面提示缺少酒馆助手或 MVU | 从真实酒馆的现有底栏进入，确认扩展和变量结构脚本已初始化，查看控制台首个错误。 |
| 战斗块显示原始文本 | 核对 `<match3>` 标签、正则是否启用、AI 消息显示位置和助手 HTML 渲染是否启用；排查重复或旧规则。 |
| 图片/字体 404 | 检查完整 `game-assets/` 是否交接、整个 `dist-tavern/` 是否来自同次构建；保留 `assets/`、`static/` 层级。 |
| 更改后还是旧页面 | 确认重建成功、服务指向 `dist-tavern`，再整页刷新酒馆；旧模块 promise 会留在当前酒馆页面生命周期内。 |
| `git rev-parse` 构建报错 | 核对 Git 可用且目录有有效 HEAD；源码压缩包按第 1 节处理，或使用完整预构建目录。 |

正式人工测试应在接手人的测试聊天中逐项记录：

- 开局配置与底栏能读写同一三消模式开关，关闭后 EJS 注入原生 AIRP 规则。
- 底栏独立管理页能创建聊天绑定存档、编队、查看养成与图鉴；刷新仍对应同一聊天。
- AI 正文 `<match3>` 经显示正则渲染，用本地模块进入已有战前准备页与战斗页，姓名、种族及详情正确。
- 实际完成胜利、失败和重复渲染，结算页显示本场实际获得奖励的真实名称与数量，入账与收据一致，刷新后的已结算消息保持完成状态。
- 只有已战胜敌人进入图鉴；魂片可先收藏；同能力跨来源共享学会状态；往昔再现沿用原战斗配置，学会后停止对应重复获取。
- 检查战果回写、实际提供给运行时 AI 的战报，以及后续剧情是否确实接收到本场结果。完整行动记录和奖励明细自动进入后续模型请求仍是待补齐/验证项，应单独记录结果。

本地托管解决页面与资源来源。ST-04–ST-09 仍在推进，ST-10 仍待真实酒馆验收，详见 [当前状态](../../tasks/active/STATUS.md) 与 [交接目标](README.md)；托管验证通过不等于整套功能已验收。

## 7. 本次实际验证范围

本次执行了 `npm run build:tavern`，TypeScript 检查和静态构建通过；现有大数据 chunk 提示仍存在。随后使用本文专用配置启动本地服务，以 Chromium 验证安装页下载的正则、替换文本和提示词，验证跨来源导入宿主、面板与消息入口模块，并验证 `Origin: null` 隔离 iframe 下的面板与消息模块导入。

页面、模块、样式和图片访问结果及浏览器错误记录见 [本地部署验证结果](local-deployment-verification.json)。测试使用独立探针页面，未操作真实玩家聊天；本次没有新增完整战斗、发奖、真实 MVU 或后续模型请求验收。
