# 角色卡“创世回廊6.0”：三消接入改了什么、怎么更新

角色卡 PNG（约 29 MB）和世界书 JSON（约 10 MB）太大，不放进仓库。本目录只保存三消接入相关的可读文本，以及更新和导出的方法。完整角色卡以本机酒馆 `G:\SillyTavern-release\data\default-user\` 下的文件为准（`characters\创世回廊6.0.png`、`worlds\创世回廊6.0.json`）。

| 本目录文件 | 内容 |
| --- | --- |
| `local-card/startup.html`、`local-card/statusbar.html` | 卡里“开局”“状态栏”两条正则加载的开局页和底栏（含三消开关和“三消”按钮）。仓库里对应的 `game-assets/public/local-card/` 被 `.gitignore` 排除，所以在这里另存一份。 |
| `extracted/scripts/` | 2026-10-31 时卡内 8 个酒馆助手脚本的正文，按酒馆中的顺序编号。 |
| `extracted/regex/` | 2026-10-31 时卡内 17 条局部正则的完整 JSON，按顺序编号。 |
| `manifest.json` | 脚本和正则清单、卡内本机地址、导出时两份主文件的 SHA-256（用于确认手上的卡是不是同一版）。 |

## 相比原版卡，三消接入改了哪些地方

| 位置 | 改动 | 源文件 |
| --- | --- | --- |
| 脚本 `MVU_ZOD` | 新增：同伴 `三消.颜色`（1～3 色）、可选 `三消.稀有度`、`系统配置.三消战斗模式`、`三消已购武器`、`通用币校验`。卡内内容与仓库 `docs/mvuzod.js` 完全一致。 | [docs/mvuzod.js](../../mvuzod.js) |
| 脚本 `通用币校验` | 新增，排在“辅助计算脚本”之后，内容只有一行：`import '<三消站点>/sillytavern-currency-guard.js?v=3';` | [04-通用币校验.js](extracted/scripts/04-通用币校验.js) |
| 正则 `开局`、`状态栏` | 改为加载 `<站点>/local-card/startup.html`、`<站点>/local-card/statusbar.html`。 | [05-开局.json](extracted/regex/05-开局.json)、[11-状态栏.json](extracted/regex/11-状态栏.json) |
| 正则 `三消·战斗块移出正文美化` | 新增，排在“正文美化”之前，只作用于显示：把 `<now_plot>` 里的 `<match3>` 块挪到 `</now_plot>` 之后，否则正文美化会截断战斗入口。 | [09-三消·战斗块移出正文美化.json](extracted/regex/09-三消·战斗块移出正文美化.json) |
| 正则 `三消·正文战斗入口 v1` | 新增，排在最后，把 `<match3>…</match3>` 换成战斗入口，加载 `<三消站点>/sillytavern-message.js`。 | [17-三消·正文战斗入口_v1.json](extracted/regex/17-三消·正文战斗入口_v1.json) |
| 世界书 | 新增条目“⚙️三消战斗规则”（uid 759042，内容即运行时提示词）；“⚙️战斗规则【新】”“⚙️敌人设定【新】”加互斥条件，开启三消模式时不注入。 | [运行时提示词](../../sillytavern-runtime-ai-prompt.md)、[原生战斗规则](../../战斗规则.md) |

当前卡里的站点都是本机 `http://127.0.0.1:5185/`（共 4 处，见 `manifest.json` 的 `localUrls`），上线前要换成公开地址，见 [上线待办](../launch-checklist.md)。其余脚本仍从原 CDN 加载，没有改。

## 怎么更新角色卡

改动前先整页刷新酒馆并关掉其他酒馆标签页：在旧页面里编辑卡片会用旧数据覆盖新改动，2026-10-28 发生过一次。改之前先备份 `characters\创世回廊6.0.png` 和 `worlds\创世回廊6.0.json`。

| 要改的内容 | 怎么改 |
| --- | --- |
| MVU 结构（新增字段） | 先改仓库的 `docs/mvuzod.js`，再在酒馆助手 → 角色脚本里把 `MVU_ZOD` 的内容整体换成它。整体替换前确认它和卡内现有内容只差你要加的字段（导出时两者完全一致）。 |
| 运行时提示词 | 改 `docs/sillytavern-runtime-ai-prompt.md`，再更新世界书“⚙️三消战斗规则”条目的内容。用酒馆助手 API 写入时，先确认新内容非空且包含“三消战斗规则”，否则会把条目清空（发生过一次）。 |
| 三消网页（战斗、管理页、通用币校验） | 改源码后重新构建、重新发布网页即可，卡片不用动。只有通用币校验脚本要把卡内 `?v=` 加一，避免浏览器缓存旧版。 |
| 开局页、底栏 | 改 `game-assets/public/local-card/` 下的两份文件，重新构建（会复制到 `dist-tavern/local-card/`），再把本目录 `local-card/` 的副本同步更新。正式上线后改为发布到角色卡自己的 CDN。 |
| 站点地址（本机 → 公开） | 在酒馆“局部正则”里改上表 3 条正则的地址，在酒馆助手里改“通用币校验”脚本的地址。 |

改完后在酒馆里实际开一局确认，然后更新本目录的副本：

```powershell
node scripts/st-card-backup.cjs "G:/SillyTavern-release/data/default-user/characters/创世回廊6.0.png" "G:/SillyTavern-release/data/default-user/worlds/创世回廊6.0.json" .tmp/card-backup
```

这个脚本只读酒馆文件，在输出目录生成：清理过的角色卡 PNG（清空 `chat`，去掉测试时保存的开局预设 `start_presets`）、世界书副本、`extracted/` 和 `manifest.json`。把 `extracted/` 和 `manifest.json` 复制回本目录提交；PNG 和世界书留在 `.tmp/`（已被忽略），需要发给别人时单独传。

## 发卡前同步角色卡源文件

三消改动目前只在本机酒馆和本仓库里，角色卡作者维护的源文件（`D:/Code/dnf/变量/mvuzod.js`、`D:/Code/dnf/code/开局.html`、`D:/Code/dnf/code/底部状态栏.html`、世界书源文件）还是旧版。从源文件重新发卡前必须先合入，否则三消改动会丢失。逐项见 [上线待办](../launch-checklist.md) 第 5 项。
