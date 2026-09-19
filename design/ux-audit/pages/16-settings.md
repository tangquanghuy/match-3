## 16. 设置 `#settings`
> 计数：P0 4 / P1 5 / P2 2

走查方式：Playwright 无头 chromium，视口 1600×900。
除常态外，把**每条危险路径都真跑了一遍**（导入合法档 / 导入非存档 JSON / 导入垃圾串 / 空导入 / 重置双确认 / 调试开关），
并用 `getBoundingClientRect` 量了面板裁切。脚本：`artifacts/ux-audit-scripts/u1-settings.mjs`、`u1-settings-danger.mjs`、`u1-settings-clip.mjs`、`u1-panel-clip.mjs`。
console 错误 **0 条**——本页最严重的两个问题都是"静默"的，不报错，这正是它们危险的原因。

### 截图

| 截图 | 状态 | 说明 |
|---|---|---|
| `shots/settings-default.png` | 常态 | 三块面板；「导入（覆盖当前存档）」在文本框下方只剩一条 4px 绿线；「重置」面板的警告文案完全不可见 |
| `shots/settings-savedata-crop.png` / `settings-import-button-clipped.png` | 存档管理面板特写 | 按钮被面板 `overflow:hidden` 裁掉 94% |
| `shots/settings-import-button-only.png` | 按钮本体（脱离裁切） | 证明按钮确实是 1100×51 有完整文案，只是在页面上看不到 |
| `shots/settings-export-filled.png` | 导出后 | 9,261 字符单行 JSON 塞进 196px 文本框，可见 194/1425px（13%） |
| `shots/settings-import-notasave-before.png` | 导入前（粘了 `{"hello":"world"}`） | 顶栏 Lv.12 / 黄金 38,800 / 宝石 4,500 |
| `shots/settings-import-notasave-after.png` | 导入后 | 顶栏 Lv.1 / 黄金 2,000 / 宝石 150——**存档被清空，无确认、无提示、无报错** |
| `shots/settings-import-error.png` | 导入垃圾串 | toast「导入失败：不是合法 JSON」（这一条是对的） |
| `shots/settings-import-wrongshape.png` / `settings-import-done.png` | 导入成功后 | 界面上没有任何成功反馈（toast 被 `refresh()` 冲掉） |
| `shots/settings-debug-on.png` | 调试开关打开 | 原生白色复选框；说明文字被裁掉看不见 |
| `shots/settings-reset-dismissed.png` | 重置确认（已取消） | 确认用的是浏览器原生 `confirm()`，截图截不到——这本身就是证据 |
| `shots/settings-dangerzone-crop.png` | DANGER ZONE 面板特写 | 边框/底色与另两块面板完全一致；警告文案 0% 可见 |
| `shots/settings-scrolled-bottom.png` | 滚到底 | 页面溢出 85px，无滚动条提示 |

### 问题清单

| # | 级别 | 问题 | 证据（截图/代码 file:line/console） | 用户在哪一步会卡或误解 | 修法指针（文件） |
|---|---|---|---|---|---|
| S-1 | **P0** | **每块面板底部被裁掉 63px，关键控件与唯一的危险警告都看不见**。实测：「导入（覆盖当前存档）」按钮 **67px 高只露 4px（6%）**，文案完全读不到；「重置立即写盘并覆盖旧档；需要留档请先导出。」**0% 可见**；调试开关的说明 **0% 可见** | 三面板 `innerOverflowPx` 全部 = 63（`u1-panel-clip.mjs` 输出）。根因：`screens.css:9-19` `.panel { height:100%; overflow:hidden }` + `screens.css:33` `.panel-inner { height:100% }`，而 `settingsScreen.ts:18/32/39` 把 `.panel-head` 放成 `.panel-inner` 的**同级兄弟**——head 53px + `margin-bottom:10px`（`screens.css:201`）= 正好 63px 溢出并被裁掉。截图 `settings-default.png`、`settings-import-button-clipped.png` 对照 `settings-import-button-only.png` | 玩家（或开发者）想导入存档，粘好 JSON 后**在页面上找不到导入按钮**——他只看到文本框下面一条绿线。运气好他误点到那条 4px 的线，于是在不知道自己按了什么的情况下触发了不可撤销的覆盖；运气不好他以为功能没做完就走了。同时"重置会立刻覆盖旧档，请先导出"这句**全页唯一的风险警告**，在 1600×900 下永远读不到 | `src/meta/shell/styles/screens.css:9-19,33`（`.panel` 的 100% 高度模型对"head 在 panel 内"的用法不成立）；`src/meta/screens/settingsScreen.ts:16-50`（或改用 `.panel { display:flex; flex-direction:column }` 让 head + inner 共享高度） |
| S-2 | **P0** | **导入无二次确认，且任何"合法 JSON 对象"都被当成存档吞下，静默清档**：粘 `{"hello":"world"}` 点导入 → 整档被替换成全新档并立即写盘 | 实测（`u1-settings-danger.mjs`）：导入前 `Lv.12 / 黄金 38,800 / 收藏 85 张 / 王国 5 个`；粘 `{"hello":"world"}` 点导入后 `Lv.1 / 黄金 2,000 / 收藏 0 张 / 王国 0 个`；全程 **dialog 数 0**（`[导入 · 有无确认弹窗] dialogsSoFar:[]`）。根因：`save.ts:119` `typeof raw.version === 'number' ? ... : -1` → 非存档对象拿到 version `-1`，`:120` 的版本上限校验轻松通过，随后 `migrateSave` 把每一节都补成默认值 = 一份崭新存档。`mockGateway.ts:101-104` 紧接着 `store.persist()`。截图 `settings-import-notasave-before/after.png` | 玩家想把手机上的存档搬到电脑，剪贴板里其实是别的东西（复制错了、多复制了半段、复制的是分享链接的 JSON 片段）。他粘进去、点导入——**Lv.12 的档、85 张收藏、5 个王国的进度当场归零并落盘**，没有确认、没有备份、没有撤销、界面也不告诉他发生了什么（见 S-3）。这是全项目最容易造成不可恢复损失的一次点击 | `src/meta/state/save.ts:116-124`（`migrateSave` 需要对"根本不是存档"的对象拒绝，例如校验必需节的存在）；`src/meta/screens/settingsScreen.ts:74-87`（导入前需确认 + 自动备份当前档） |
| S-3 | **P0** | **导入成功零反馈**：`toast('导入成功，已覆盖当前存档。')` 之后立刻 `ctx.refresh()` 重建整个 stage，新建的 `#toast` 是空的——玩家看不到任何提示 | `settingsScreen.ts:82-83` 连续两行 `toast(...)` → `this.ctx.refresh()`；`gameMain.ts:render()` 用 `stage.innerHTML = screen.html(...)` 整屏重建。实测导入成功后 `toast 文本 ""`、`classList.contains('show') === false`（`u1-settings-danger.mjs`）。截图 `settings-import-done.png`、`settings-import-notasave-after.png` | 玩家点了导入，屏幕上唯一的变化是文本框被清空、顶栏数字换了。他不知道导入成功了、失败了、还是自己点漏了，于是**很可能再点一次**（而每一次都是一次覆盖）。对照之下，失败路径的 toast 反而是可见的——成功比失败更让人困惑 | `src/meta/screens/settingsScreen.ts:81-86`（反馈应在 refresh 之后，或改为页内局部更新） |
| S-4 | **P0** | **视觉权重与风险完全反着**：不可撤销的「导入（覆盖当前存档）」是 1100×51 的绿色 primary（全页最大最亮）；两个重置是 41px 高的灰 secondary；标着 `DANGER ZONE` 的面板边框/底色与另两块**完全相同** | 实测（`u1-settings.mjs` `[按钮视觉权重]`）：`#importBtn` `primary` 1100×51 绿渐变 `rgb(71,116,84)`；`#resetDemo/#resetNew` `secondary` 250/268×41 灰 `rgb(48,40,56)`；`#exportBtn`（只读操作）与重置**同款样式**。三块面板 `border` 全部 `rgb(242,234,216)`（`[DANGER ZONE 视觉]`）。`settingsScreen.ts:27,42,43`；`DANGER ZONE` 只是 `:39` 的一行英文 `<small>` | 玩家在一屏之内看到：一个最大最绿、写着"导入"的按钮（危险），两个不起眼的灰按钮（也危险），一个和灰按钮长得一样的"导出"（安全）。**按钮长相完全不携带风险信息**，他只能靠逐字读文案来避险——而最该读的那句警告被裁掉了（S-1） | `src/meta/screens/settingsScreen.ts:16-50`；`src/meta/shell/styles/extras.css:.settings-row`（需要 danger 按钮样式与危险区面板样式） |
| S-5 | P1 | **重置用浏览器原生 `confirm()`**：跳出 1600×900 舞台的暗金美术体系，出现在屏幕顶部；两条确认文案只差两个字，且默认焦点在"确定" | `settingsScreen.ts:97` `if (!confirm(\`确定重置为${label}吗？当前存档将被覆盖。\`)) return;`。实测两条文案：`确定重置为演示档吗？当前存档将被覆盖。` / `确定重置为全新档吗？当前存档将被覆盖。`（`u1-settings.mjs`，截图 `settings-reset-dismissed.png` 里对话框不在画面内——原生弹窗不属于页面） | 玩家已经被训练成"对话框一律回车确认"。两条只差两字的文案不构成有效区分，他可能想重置成演示档、结果清成了全新档。而且原生弹窗和游戏的视觉体系割裂，看起来像"网页出错了"而不是"游戏在确认" | `src/meta/screens/settingsScreen.ts:94-101`（改用页内 `.modal-veil` 确认层，复用 `style.css:.money-tip/.cancel` 体系；危险操作要求键入或二次点击） |
| S-6 | P1 | **「战斗调试」开关暴露给玩家，而且自己的说明承认它还没接上** | `settingsScreen.ts:31-37`，说明原文「开关写进存档 settings.battleDebug；**战斗层接入读取后可开放调试钩子**」。实测打开后 toast「战斗调试已开启。」，除写存档外无任何可观察效果（`[调试开关]`）。复选框是原生 `<input type=checkbox>`（`extras.css:.check-row input` 只设了 18px 与 accent-color），白色方块，与全页暗金体系无关 | 玩家打开一个叫"战斗调试"的开关，期待看到什么（伤害数字？日志？），结果什么都没有。他会怀疑游戏有 bug，或者反复开关寻找效果。**一个按了不产生任何效果的开关，比没有这个开关更糟** | `src/meta/screens/settingsScreen.ts:31-37`（玩家档位下应隐藏，或明确标注"开发者选项 · 暂未生效"） |
| S-7 | P1 | **开发者口径直接写给玩家看**：「mock（localStorage 双槽防损）」「存档结构 MetaSave v1」「将来可整体切 Cloudflare D1（网关接口已按远端 RPC 形状设计）」「开关写进存档 settings.battleDebug」；底部导航提示也是「存档双槽防损」 | `settingsScreen.ts:20`（`当前后端：mock…` 整句）、`:35`、`:52` `bottomNavHtml('', '存档双槽防损')`。截图 `settings-default.png` | 玩家读到"mock""RPC""D1""MetaSave v1"，得到的信息是"这游戏还没做完/我在用测试版"。这段文字占了存档面板正文的全部篇幅，而玩家真正需要的信息（存档存在哪儿？会不会丢？换设备怎么办？）一句没有 | `src/meta/screens/settingsScreen.ts:20,35,52` |
| S-8 | P1 | **一整页叫「设置」，却没有任何玩家设置**：音量/音乐/音效、语言、动画减弱、画质、操作与快捷键全部缺失；三块面板全是存档运维与调试 | 实测面板清单只有 `SAVE DATA / DEBUG / DANGER ZONE` 三块（`[设置页结构]`）；页标题 `设 置`（`gameMain.ts:PAGE_TITLES.settings`）。项目里已存在 `@media (prefers-reduced-motion: reduce)`（`style.css` 末尾）却没有页内开关 | 玩家点齿轮的动机 9 成是"把音乐关小"或"换语言"。他进来看到三块讲存档 JSON 的面板，会认为**这个游戏没有设置**，然后去系统层面静音整个浏览器标签。这是玩家预期与页面内容的正面冲突 | `src/meta/screens/settingsScreen.ts:14-51`（需要音频/显示/语言分区）；`src/meta/state/schema.ts:settings` |
| S-9 | P1 | **导出不可用**：9,261 字符压成一行塞进 196px 文本框（可见 194/1425px ≈ 13%，且不换行），没有"下载为文件"；剪贴板失败只给一句"请手动从文本框复制"；任何重渲染都把文本框清空 | 实测 `[导出] {len:9261, lines:1, scrollH:1425, clientH:194}`；`settingsScreen.ts:58` 直接把 `exportSaveJson()` 赛进 textarea，无 `JSON.stringify(...,2)`、无下载。文本框清空实测：粘入内容后点顶栏齿轮 → `""`；离开再回来 → `""`（`u1-settings-danger.mjs`），根因 `gameMain.ts:ctx.navigate` 同 hash 也会 `render()` 重建 stage。截图 `settings-export-filled.png` | 玩家想在重置前留个档（这正是页面自己要求他做的事）。他点导出，看到一团看不完的字符，没法确认导出对不对、也没法存成文件；好不容易全选复制了，一个误触齿轮就把文本框清空。**"留档"这条安全网实际上不成立**，而重置/导入都以它为前提 | `src/meta/screens/settingsScreen.ts:57-67`（加 Blob 下载 + 文件选择导入 + 格式化输出）；`src/meta/shell/gameMain.ts:ctx.navigate`（同 hash 无需重建） |
| S-10 | P2 | 页面在 1600×900 下溢出 85px 且没有滚动条提示；最下面那块正是「重置」面板 | 实测 `scrollHeight 807 / clientHeight 722 / hiddenPx 85`（`u1-extra.mjs`）；`extras.css:.settings-screen { padding: 24px 40px 90px; overflow:auto }`。截图 `settings-scrolled-bottom.png` | 玩家在默认视口下看不到页面还有内容，也不知道"重置"面板下面还有话（叠加 S-1，那句话在任何滚动位置都读不到） | `src/meta/shell/styles/extras.css:.settings-screen` |
| S-11 | P2 | 底部导航无高亮、页面无返回按钮，设置页像孤儿页；「导出存档 JSON」的图标（`bag`）在小尺寸下读作挂锁 | `[设置页结构] activeNav:[] / hasBackButton:false`；`gameMain.ts:NAV_OF` 不含 settings（设计如此，但没有替代的返回可供性）。`settingsScreen.ts:22` `<span data-icon="bag">`，`chrome.ts:iconPaths.bag` 上半是拱形提手。截图 `settings-default.png` | 玩家进了设置想回去，底部五个导航项没有一个亮着，他得自己猜"我刚才是从地图来的吗"；另外一个只读操作（导出）挂了个看起来"被锁"的图标，增加犹豫 | `src/meta/screens/settingsScreen.ts:22,52`；`src/meta/shell/chrome.ts:bottomNavHtml/iconPaths` |

### 重设计提案

#### P0 · S-1 面板高度模型修掉（这一条不改，其他都白改）
`.panel { height:100%; overflow:hidden }` 假设"panel 里只有 panel-inner"，但设置页（以及任何把 `.panel-head` 放进 `.panel` 的页面）会让 inner 溢出正好一个 head 的高度并被裁掉。
建议改 `.panel` 为 `display:flex; flex-direction:column`，`.panel-head { flex:none }`、`.panel-inner { flex:1; min-height:0; height:auto }`。
这是全局共享组件，阶段 B 需**顺带回归所有用 `.panel` 的屏**（team / hero / arena / events / invasion / result），不能只改设置页。

#### P0 · S-2/S-3/S-4 存档管理重做（线框）
原则：**只读操作显眼、破坏性操作费力**；导入必须"看得见要覆盖成什么"再确认。

```
┌─ 存档 ────────────────────────────────────────────────────────────────┐
│ 你的进度保存在这台设备的浏览器里。清理浏览器数据会一并清掉存档，      │← 玩家语言，无 mock/D1/RPC
│ 换设备前请先「导出存档文件」。                    最近保存：3 分钟前   │
│                                                                       │
│ ┌──────────────────────────┐  ┌──────────────────────────┐            │
│ │ ⬇ 导出存档文件 (.json)   │  │ 📋 复制存档文本          │            │← 只读操作，主色亮金
│ └──────────────────────────┘  └──────────────────────────┘            │
│                                                                       │
│ ── 导入存档（会覆盖现在的进度）────────────────────────────────────── │
│ ┌──────────────────────────┐  或 把 .json 文件拖到这里                │
│ │ 📂 选择存档文件…         │                                          │
│ └──────────────────────────┘                                          │
│ ┌───────────────────────────────────────────────────────────────────┐ │
│ │ 已读取：Lv.28 · 收藏 412 张 · 黄金 1,203,400 · 保存于 9/18 21:04  │ │← 导入前预览，
│ │ 将覆盖：Lv.12 · 收藏 85 张  · 黄金 38,800                         │ │  两边并排对照
│ │ ⚠ 覆盖前会自动把当前进度另存一份「导入前备份」                   │ │
│ │                            [ 取消 ]   [ 确认覆盖 ]                │ │← 危险按钮：暗红描边
│ └───────────────────────────────────────────────────────────────────┘ │
└───────────────────────────────────────────────────────────────────────┘
```
配套三条硬要求：
1. `migrateSave` 必须拒绝"不含任何存档必需节"的对象（现在 `{"hello":"world"}` 能通过，S-2）；导入前先校验并把校验结果作为上面那块预览卡的内容。
2. 导入成功的反馈放在 `refresh()` **之后**（或改成页内局部刷新），并且用一块留在页面上的成功卡（写清"已导入 Lv.28 存档，备份已保存"），不用一闪而过的 toast（S-3）。
3. 「确认覆盖」用暗红描边 + 需要两次点击（第一次变成"再点一次确认"），只读按钮才用亮金主色（S-4）。

#### P0 · S-4 危险区可视化（线框）
```
┌─ ⚠ 危险操作 ─────────────────────────────────────────────┐ ← 面板边框改暗红 #7a3a34
│   （面板底色叠一层极淡的红，与另两块面板一眼区分）        │
│                                                           │
│ 重置进度                                                  │
│ 会立刻删掉当前全部进度并写盘，不可撤销。                  │← 警告在按钮之上，不在下面
│ 需要留档请先「导出存档文件」。                            │
│                                                           │
│ ┌────────────────────────┐  ┌────────────────────────┐   │
│ │ 重置为全新档           │  │ 重置为演示档（调试用） │   │← 暗红描边按钮
│ └────────────────────────┘  └────────────────────────┘   │
└───────────────────────────────────────────────────────────┘
```
确认层改成页内 `.modal-veil`（复用 `style.css:.money-tip` 的美术），文案里**必须复述将要发生的具体损失**
（"将删除：Lv.12 · 收藏 85 张 · 黄金 38,800"），默认焦点在「取消」。

### 五问自查

1. **3 秒问题**：不过关，而且是反向的。三秒内我看到的是一块讲 mock/D1/RPC 的说明、一个巨大的空文本框、和一条看不出是什么的 4px 绿线。这页**根本没有主行动按钮**——从功能上说它也不该有（设置页不需要一个"主要操作"），但现在的结果是唯一被做成 primary 的恰好是最危险的那个（S-4），而它还看不见（S-1）。玩家进来最想干的事（调音量）这里没有（S-8）。
2. **信息主次**：颠倒。存档面板正文 100% 篇幅给了后端实现细节（S-7），玩家真正需要的"存哪儿、会不会丢、换设备怎么办"一句没写；面积最大的元素是空文本框（1100×196）；唯一的风险警告被裁成 0% 可见（S-1）。
3. **视觉语言**：面板外框/金角装饰/`SAVE DATA` 英文眉题是和全局一致的，这部分成立。但内容区全部掉出体系：原生白色复选框（S-6）、`ui-monospace` 12px 的代码风文本框（`extras.css:#saveText`，圆角 12px + `#ffffff22` 描边，与全项目的直角金线不同源）、原生 `confirm()` 弹窗（S-5）。危险与安全共用同一套按钮样式，`DANGER ZONE` 只是一行 11px 英文小字（S-4）。
4. **操作路径**：导出 1 步、导入 2 步、重置 2 步，步数不长但全是坑：导入按钮实际看不见（S-1）；导入成功没有反馈（S-3）；导出结果没法验证也没法存成文件（S-9）；文本框一被重渲染就清空（S-9）。"先导出再重置"这条官方推荐路径，因为导出不可用而**实际走不通**。返回路径也缺：底部导航无高亮、无返回按钮（S-11）。
5. **极端态**：逐条实跑过——
 - **空文本框点导入**：toast「先导出或粘贴一份存档 JSON。」——设计过了，这条是对的。
 - **垃圾字符串**：toast「导入失败：不是合法 JSON」（`save.ts:462`）——设计过了。
 - **合法 JSON 但不是存档**：**没有设计**，被当成合法存档吞掉并静默清档（S-2）。这是本页最严重的一条。
 - **版本号过高的存档**：`save.ts:120-122` 有 `存档版本 N 高于当前支持的 M` 分支——设计过了；但版本号**缺失**时会退化成 `-1` 从而绕过这条校验（S-2 的根因）。
 - **剪贴板不可用**：实测落到 `.catch` → toast「剪贴板不可用，请手动从文本框复制。」（非安全上下文/无权限时触发）——设计过了，降级文案合格。
 - **重置带 warning 的返回**：`settingsScreen.ts:99` 有 `snapshot.warning ? '已重置：…' : …` 分支——设计过了。
 - **窗口高度不足**：页面溢出 85px，`overflow:auto` 能滚，但无滚动提示，且叠加 S-1 导致底部警告在任何滚动位置都读不到（S-10）。
