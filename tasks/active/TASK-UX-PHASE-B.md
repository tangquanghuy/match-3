# 总纲 · UX 阶段 B（视觉重做 + 缺陷修复）多窗口并行计划

> **来源**：`design/ux-audit/UX-AUDIT.md`（阶段 A 审查报告，166 条问题 / P0 57 条）+ `design/ux-audit/DESIGN-SYSTEM.md`（设计系统 v2）+ 逐页报告 `design/ux-audit/pages/01..16-*.md`。
> **本文是索引与共同约定**，每个窗口的执行细节在各自任务书里。开新窗口时发两样：**本文 + 对应任务书路径**。
> 阶段 A 已结束（零代码）；阶段 B 开始动 `src/**`。
> **09-20 执行修订**：原计划的窗口 L 已按用户裁定取消（见 `PARALLEL-WORK.md`），各域窗口自行维护本页样式；下文「L 硬前置/独占」为历史排期，不再阻塞其余窗口。编队与图鉴以官方立绘为视觉主体，浏览卡不得为追求密度堆砌属性，最新验收见 `TASK-COLLECTION.md`。

## 0. 用户已拍板的三条口径（所有窗口必须照此执行）

1. **视觉目标 = 商业级**：不是"把功能修到可用"，而是把页面做到**漂亮、精致、成熟，拿出去不丢人**。
   **允许更改色相、允许换风格**——`design/meta-mockups-v5` 只是当前实现的来处，不是不可动的基准；原页面太丑不达标的部分就该换掉。
2. **美术资产 = 本地 GoW 官方资产**：部队立绘用 `data/raw/gow-2026-09-18/portraits`（1828 张，已 junction 到 `public/meta/assets/portraits`）；
   武器卡面用 `public/gowhead-icons/`（718 张，与 718 目录武器一一对应、零缺失）。程序化剪影 `shell/weaponIcons.ts` 退役。
   首批 20 把 `w_*` 迁移为目录武器（`05-hero.md` H-3 方向 C）。以后是否换自制美术是以后的事。
3. **其余按审查报告的推荐方向执行**（`UX-AUDIT.md` §4/§5）。

## 1. 窗口分派

| 窗口 | 任务书 | 一句话目标 | 前置 |
|---|---|---|---|
| **L · 设计系统与视觉风格** | **`TASK-DS.md`** | 风格定稿（2~3 套样稿→拍板）→ token 底座 → `.btn` 六态基类 → 面板四层 → 稀有度单表 → 滚动三禁则 | 无（**必须先行**） |
| **M · 武器域** | **`TASK-WEAPONS-UI.md`** | 官方贴图统一 + 新屏 `#weapons` 四 tab（我的武器/全部/熔炉/淬炼），收口 UX-1 + UX-2 + UX-3 + 淬炼入口缺失 | L 批次 1~2 |
| **N · 活动域** | **`TASK-EVENTS.md`** | UX-6 活动全开放（per-event 周实例）+ UX-4 六玩法图形化 + UX-5 商店独立页 | L 批次 1~2 |
| **O · 收藏域** | **`TASK-COLLECTION.md`** | UX-10 图鉴浏览层重做 + UX-11 编队 + UX-9 宝箱双页 + UX-7 材料库背包页（含 CH-1 资源损失热修） | L 批次 1~2 |
| **P · 战斗与结算与 PvP** | **`TASK-BATTLE-UI.md`** | 战斗层（施法三段式/卡面/tooltip 体系/胜负面板）+ 结算屏 + 竞技场 + 入侵（含 A-1 热修） | L 批次 1~2（`arena.css` 需 L 先交） |
| **Q · 地图与王国与设置** | **`TASK-MAP-UI.md`** | 地图四条 P0 + 王国弹层 + 设置页 + **M10 王国主线战斗界面**（`TASK-META §9`） | L 批次 1~2 |

## 2. 依赖与时刻表

```
时间 →   T0                T1（L 交付 tokens+按钮+面板）        T2（收尾）
窗口 L   ████ 风格样稿→拍板 → token → .btn → 面板四层 ████
窗口 M                      ████ 官方贴图统一 → #weapons 四 tab ████
窗口 N                      ████ per-event schema → 全开放 → 六玩法图形化 → 商店独立页 ████
窗口 O                      ████ CH-1 热修 → 图鉴浏览层 → 编队 → 宝箱双页 → 材料库 ████
窗口 P                      ████ A-1 热修 → 战斗层 → 结算 → 竞技场/入侵 ████
窗口 Q                      ████ 地图/弹层/设置 → M10 王国主线页 ████
```

- **L 是硬前置**：它交付前其它窗口**只做不动样式的活**（读代码、写方案、数据层/系统层改动、`*.ts` 里的结构调整）。
  L 交付后各窗口才做视觉迁移（换类名、按新 token 调版式）。
- **峰值并发建议 ≤ 3 个窗口**（事故教训，见 `TASK-MASTER-PLAN.md`）。推荐两种排法：
  - **排法甲（稳）**：L → 然后 M + O + P 三窗并行 → 再 N + Q 两窗并行。
  - **排法乙（快）**：L → M + N + O 三窗并行（域完全不相交）→ P + Q 两窗并行。
- **P 有一项可提前**：`src/render/**` 与 meta 域零交集，战斗层那一批（B-1~B-11）可在 L 期间并行，但**`arena.css`/`result.css` 的视觉迁移要等 L**。

## 3. 文件所有权（硬边界）

| 范围 | 归属 | 说明 |
|---|---|---|
| `src/meta/shell/styles/**`（含新建 `tokens.css`、删 `effect-panels.css`） | **L 独占** | 其它窗口**不得直接改这些文件**；需要新页样式时向 L 提"样式需求"，由 L 加基类/变量，各窗口只在自己的屏 CSS 段里用 |
| `src/meta/shell/chrome.ts` / `pageCss.ts` | **L 独占** | 顶栏/底部导航/页 CSS 注入机制 |
| `src/meta/shell/gameMain.ts` | **共享**（台账登记） | O 要退役材料库弹层、N 要加商店路由、Q 要加 quest 路由、M 要加 weapons 路由——**四个窗口都要动，动前登记，登记在先者先改** |
| `src/meta/shell/screen.ts`（`ScreenName`） | **共享**（台账登记） | 同上，新增屏名 |
| `src/meta/state/schema.ts` + `state/save.ts` | **共享**（台账登记，**顺序 N → M**） | N 做 per-event 周实例（schema +1），M 做武器 id 迁移（schema +1）。**N 先落，M rebase 后接** |
| `src/meta/gateway/**`（types/mockGateway/demo） | **共享**（台账登记） | 各窗口按需加端点；签名即未来 D1 契约，加性为主 |
| `src/meta/screens/heroScreen.ts`、新 `weaponsScreen.ts`、`data/weapon*`、`data/soulforge.ts`、`systems/forge*.ts`、`shell/weaponIcons.ts`、`src/render/WeaponCodexPage.ts`、`weapons-codex.html`、`src/codex-main.ts` | **M 独占** | 武器域全部 |
| `src/meta/screens/eventsScreen.ts`、新 `eventShopScreen.ts`、`data/events.ts`、`systems/events.ts` | **N 独占** | 活动域全部 |
| `src/meta/screens/{troopScreen,teamScreen,chestsScreen}.ts`、新 `bagScreen.ts`、`data/materials.ts` | **O 独占** | 收藏域全部 |
| `src/render/**`、`src/meta/screens/{resultScreen,arenaScreen,invasionScreen}.ts`、`shell/battleLauncher.ts` | **P 独占** | 战斗与结算与 PvP |
| `src/meta/screens/{mapScreen,mapData,settingsScreen}.ts`、新 `questScreen.ts`、`systems/{tribute,kingdomOps}.ts` | **Q 独占** | 地图域 |
| `src/engine/**`、`src/session/**` | **不碰** | 本阶段是屏层工作；确需引擎/契约改动先在台账提案 |
| `design/ux-audit/**` | **只读** | 审查报告是依据，不在阶段 B 修改（新发现写进自己任务书的工作记录） |
| `design/meta-mockups*` | **只读** | 用户视觉领地 |

**台账协议**（沿用 `PARALLEL-WORK.md`）：动共享文件前在 `PARALLEL-WORK.md` 文末登记（窗口/文件/动机/期望形态），登记在先者先改，后改者重读最新代码再适配。

## 4. 共同约定

1. **必读**：本文 + `PARALLEL-WORK.md`（台账协议）+ `design/ux-audit/UX-AUDIT.md`（总报告）+ 自己负责页面的逐页报告。
2. **门槛**（每批结束）：`npm run lint`（零 error）→ `npm test -- --run`（全绿）→ `npm run build`（通过）。全量测试是共享护栏，跑挂先修自己的，不许跳过/注释既有用例。
3. **提交纪律**：每批独立提交，注明窗口与批次号；**并发期间禁止 `git add -A`**，只 add 自己任务书名下的路径。
4. **视觉验收是硬门槛**：每批结束必须出**改前/改后对照截图**（复用 `scripts/ux_shots.mjs` 的 helper 与各页探针脚本 `artifacts/ux-audit-scripts/u*.mjs`），
   并照 `DESIGN-SYSTEM.md` §4 的 **22 条一致性检查清单**逐条自查（前 6 条是硬门槛）。
   dev server 同一时刻只一个窗口占端口（helper 默认 `http://localhost:5180`，可用 `UX_BASE` 指定）。
5. **回归口径**：改完某页，复跑该页阶段 A 的探针脚本，**把阶段 A 记录的坏数值打成断言**（例：武器库 `fullyUnreachable` 必须为 0、竞技场 `▲▼` 命中测试必须命中按钮本身、图鉴筛选后 `scrollTop` 必须为 0）。
6. **禁止 playwright MCP 浏览器工具**做并行截图（单实例会互抢）；用 node + `playwright` npm 包起自己的无头 chromium。
7. **问题编号是唯一索引**：任务书与提交信息里引用阶段 A 的编号（M-1 / T-3 / H-2 / F-1 / C-2 / CH-1 / E-4 / S-1 / MT-2 / A-1 / I-3 / B-4 / R-1 / DS-3 …），便于回查证据。

## 5. 批次总表（跨窗口视图）

| 批 | 窗口 | 内容 | 覆盖的阶段 A 编号 |
|---|---|---|---|
| **B0 热修** | O / P / M / Q 各自 | 资源损失与 0% 可用四条 + rail 死链 + 两处错误文案 | CH-1、A-1、H-2、H-1、M-1、I-1、I-2 |
| **B1 风格定稿** | L | 2~3 套样稿 → 用户拍板 | UX-13 |
| **B2 token 底座** | L | `tokens.css` + 拆 223 个重复选择器 + Z 轴归档 + 删死样式 | DS-1、DS-7、DS-8、DS-10、DS-11、DS-14 |
| **B3 组件基类** | L | `.btn` 六态 + 面板四层 + 选中态四信号 + 滚动三禁则 + 稀有度单表 | DS-2~DS-6、DS-9、DS-12、DS-13 |
| **B4 武器屏** | M | 官方贴图统一 + `#weapons` 四 tab | UX-1/2/3、H-1~H-12、F-1~F-7、C-1~C-10 |
| **B5 活动域** | N | 全开放 + 六玩法图形化 + 商店独立页 | UX-4/5/6、E-1~E-13、S-1~S-7 |
| **B6 收藏域** | O | 图鉴浏览层 + 编队 + 宝箱双页 + 背包页 | UX-7/9/10/11、T-1~T-16、TM-1~TM-11、CH-1~CH-9、MT-1~MT-8 |
| **B7 战斗与结算** | P | 施法三段式 + 卡面 + tooltip 体系 + 胜负面板 + 结算屏 + 竞技场 + 入侵 | B-1~B-11、R-1~R-9、A-1~A-9、I-1~I-9 |
| **B8 地图与主线页** | Q | 地图四条 P0 + 弹层 + 设置 + M10 | M-1~M-12、K-*（弹层）、S-*（设置）、`TASK-META §9` |

## 6. 阶段 B 完成的判据

1. 阶段 A 的 **57 条 P0 全部关闭或经用户裁定降级/延后**（逐条在各窗口任务书的工作记录里给结论 + 回归证据）。
2. `DESIGN-SYSTEM.md` §4 的 22 条检查清单在 **16 屏逐屏通过**（前 6 条硬门槛无例外）。
3. 视觉抽查：用户看改后截图认可"商业级、不丢人"——这是本阶段唯一的最终验收标准，量化指标（明度阶梯/按钮形状数/token 收敛数）只是过程护栏。
4. 门槛全绿：lint / test / build。
# 当前状态（2026-09-20 基线）

本文件是阶段 B 总纲，不是实时完成清单。窗口 L 已取消；收藏、活动、战斗/PvP、武器、地图各域自行维护样式。实时状态见 `STATUS.md`。旧的 L 硬前置、批次排期和未更新的完成数字只保留作历史参考，不能阻塞当前域。
