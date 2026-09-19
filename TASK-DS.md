# 任务书 · 窗口 L：设计系统与视觉风格（阶段 B 先行窗口）

> 必读：`TASK-UX-PHASE-B.md`（总纲：口径/所有权/时刻表）、`design/ux-audit/DESIGN-SYSTEM.md`（你的主依据，14 条诊断 + 完整 token/按钮/面板方案）、`PARALLEL-WORK.md`（台账协议）。
> **你是硬前置窗口**：M/N/O/P/Q 五个窗口的视觉迁移都等你交付批次 2~3。你交付得越快，整条流水线越快。

## 0. 目标（用户口径，不要打折）

把这套 UI 从"能用但丑"做到**商业级**：漂亮、精致、成熟，拿出去不丢人。
**允许更改色相、允许换风格**；`design/meta-mockups-v5` 只是当前实现的来处，不是不可动的基准。
`DESIGN-SYSTEM.md` §3 里标着「v5 原值不动」的色值是**保守下限**（保证不比现在差），不是终点——你的批次 0 就是要把它换掉。

**不变的是结构**：4 层表面阶梯 / 六态按钮 / 5 档圆角 / 6 档间距 / 8 档字号 / 7 条阴影 / 3 档动效 / 7 档 Z 轴 / 单一稀有度表 / 滚动容器三禁则。
**可变的是皮肤**：色相、饱和度、材质（纹理/噪点/内发光/描边工艺）、圆角风格、字体搭配、装饰语言（金线/铆钉/纹章/斜切角）。

## 1. 所有权

| 范围 | 文件 |
|---|---|
| L 独占 | `src/meta/shell/styles/**`（新建 `tokens.css`；改 `style.css`/`screens.css`/`troop.css`/`arena.css`/`result.css`/`live.css`/`extras.css`；删 `effect-panels.css`）、`src/meta/shell/chrome.ts`、`src/meta/shell/pageCss.ts`、本任务书 |
| 共享（台账登记） | `src/meta/shell/gameMain.ts`（只为 import `tokens.css` 加一行）、`src/render/traitBadges.ts`（稀有度/效果族图标若需统一） |
| 只读 | `design/ux-audit/**`（依据）、`design/meta-mockups*` 与 `design/meta-style-study`（参考，**绝对不改**）、各屏 `*.ts`（你不改屏逻辑；需要类名替换时由各窗口自己做，你只提供基类与迁移映射表） |
| 不碰 | `src/engine/**`、`src/session/**`、`src/meta/systems/**`、`src/meta/data/**` |

**与其它窗口的协作方式**：你只交付"基类 + token + 迁移映射表"。各窗口在自己的屏里把旧类名换成新类名。
过渡期你必须在 `style.css` 里**保留旧类名作为新类的别名**（`.primary`/`.secondary`/`.ghost` 等），这样五个窗口可以按自己节奏迁移，不会因为你改名而集体变白块。

## 2. 批次

### 批次 0 · 风格定稿（**先做这个，做完等用户拍板再往下**）

产出 `design/ux-audit/STYLE-DIRECTION.md` + 样稿截图 `design/ux-audit/style/`：

1. **出 2~3 套完整风格样稿**，每套覆盖同样的三屏（选 `#map` / `#troop` / `#hero`——分别代表"大图底 + 浮层"、"密集网格"、"复杂表单"）。
   做法：**不改 TS**，用一个独立的 CSS 覆盖层（`design/ux-audit/style/<方案>.css`）+ Playwright 注入后截图。这样样稿零风险、可反复推翻。
2. 每套要明确交代六件事：
   - **色相与色温**（暗金？暗蓝金？墨绿金？酒红金？——当前是偏紫的近黑，饱和度 18~25，这是"沉闷"的直接来源，见 DS-1/1.6①②）
   - **表面材质**（纯色 / 微噪点 / 皮革 / 石板 / 羊皮 / 渐变金属；当前是纯色无材质，DS-1.6③）
   - **描边工艺**（单线 / 双线 / 内外双色 / 角饰；当前是 1px 金线 + 四角 L 形金线）
   - **圆角与切角语言**（现在 34 个取值混用，含 `8px 0 12px 0` 斜切角——斜切角其实是个可放大的特征）
   - **字体搭配**（现在 display=Palatino/STZhongsong、body=Segoe/YaHei、数字=Georgia；中文衬线是否换、大标题是否换）
   - **强调色预算**（每屏 1 个饱和实底 CTA + 1 个饱和状态徽章；现在唯一饱和色是**不可点**的绿徽章，DS-1.6②⑤）
3. 每套给一张**同屏对照图**（现状 / 方案 A / 方案 B / 方案 C 四联），以及"这套方案解决了 DS-1.6 五个成因里的哪几个"。
4. 参考锚点（只做气质参考，不抄）：GoW 官方 UI 的暗底 + 金饰 + 立绘卡语言；同类二游卡池/图鉴页的层次处理。
   **注意本作已有一个天然优势**：1828 张官方立绘 + 718 张官方武器卡面（用户已裁定统一使用），视觉重心应该压在这些资产上——
   现在的页面把它们缩得很小（宝箱主视觉是 1024×576 拉大的 JPEG、武器卡面缩在 120px 的 plate 里），这是"不精致"的另一个大头。

**验收**：用户从 2~3 套里选一套（或指定杂交方案）→ 你把它落成 `tokens.css` 的值 → 进批次 1。
**门槛**：本批零 `src/**` 改动（只有 `design/ux-audit/style/**` 与文档）。

### 批次 1 · token 底座（机械批，无预期视觉改动之外的意外）

照 `DESIGN-SYSTEM.md` §3.6 批次 1 执行，**色值用批次 0 拍板的那套**：

| 项 | 落点 | 验收 |
|---|---|---|
| 新建 `src/meta/shell/styles/tokens.css`（纯 `:root`，零选择器规则） | `gameMain.ts` 第一个 import（台账登记这一行） | `u6-token-scan.mjs` 重跑：CSS 变量声明 82 → ≥120 |
| 删 `troop.css:1` 的重复 token 声明（`--display` 回退链与 `style.css:5` 不同源 = 跨屏字体跳动源） | `troop.css` | 字体在 16 屏一致 |
| 删死文件 `effect-panels.css`（211 行零引用，DS-14） | 删文件 | grep 零引用 |
| 拆重复选择器：`.class-grid`(5)/`.perk-slot`(5)/`.perk-unlock`(4)/`.class-expand`(2 套冲突)/`.team-tab`(2 整块)/`.kingdom-band`(2，DS-11 吸顶条半透明的根因) | `screens.css`、`troop.css` | `u6-dup-scan.mjs`：重复选择器 223 → ≤170 |
| Z 轴归 7 档语义；**`.toast` 提到 60**（现在 40，被 5 种弹层盖住 = 弹层内 toast 等于零反馈，DS-7）；`#matVeil` 从 `position:fixed` 挂 body 改 `absolute` 挂 `.stage`（DS-8） | `style.css:484`、`screens.css:1820/2116/2709/923`、`extras.css:91`、`troop.css:11` | 手测：武器库/天赋树/材料库/抽卡演出四处弹层内各触发一次 toast，**四处都要看得见**；1200×700 视口开材料库，遮罩跟着舞台缩放 |

**门槛**：lint / test / build 全绿 + `u6-shots.mjs` 16 屏截图与阶段 A 基线逐屏对照（除吸顶条与 toast 层级两处已知改善外，不应有意外变化）。

### 批次 2 · 组件基类（**这批交付后通知 M/N/O/P/Q 开始视觉迁移**）

| 项 | 要点 |
|---|---|
| `.btn` 六态基类 | 主/次/幽灵/危险/禁用/**加载**（现在加载态全系统零覆盖，DS-6）+ 3 档尺寸 + `.btn--icon`；**`.btn--ghost` 基类必须进 `style.css` 全局**（修 DS-3 的 UA 白块机制）；disabled 改 `filter: saturate(.35) brightness(.7)` + 描边降级（不用 `opacity`，DS-5/TM-4） |
| 旧类别名 | `.primary`/`.secondary`/`.ghost`/`.chip`/`.chest-btn`/`.ev-fight`/`.inv-attack`/`.class-btn`/`.perk-unlock` 等**保留为新类的别名**，过渡期各窗口按自己节奏迁移 |
| 面板四层 | L0 底 / L1 面板 / L2 卡片 / L3 弹层，**相邻档明度差 ≥3.5 L、严格单调**（现在卡片比面板更暗，DS-2）；删 `.slot{box-shadow:none}` |
| 选中态四信号 | 明度抬档 + 描边加粗 + 位移 + 方向标记，**禁止只换 `border-color`**（TM-4 的支点） |
| 滚动容器三禁则 | ①固定高 + `overflow:hidden` 且内层无滚动容器 ②`margin-top:auto` 推动作按钮 ③固定高容器内放 `aspect-ratio` 图。25 条 `overflow:hidden` 按 §3.4 四类处置 |
| 稀有度单表 | 4 套色板（`--rc`/`--r-*`/`--rarity-*`/codex `RARITY_COLOR`）合一；**注意 `screens.css:1271-1276` 的类名与档位错位一档**，必须 CSS 与各屏 TS 同批改，用 `.r-0..r-5` 数字别名做迁移锚点（DS-9） |
| 字号/圆角/间距/阴影/动效收敛 | 73→8 / 34→5 / 43+169→6 / 147→7 / 16→3+2；72 处裸写 `Georgia` → `--ds-font-num` |

**交付给各窗口的东西**（写进本任务书的"交付附录"）：
1. token 清单（最终值）；2. `.btn`/`.surface-l*` 用法示例；3. **33 行"旧类 → 新类"迁移映射表**（`DESIGN-SYSTEM.md` §3.3 已有草表，你按拍板后的实现更新）；4. 22 条检查清单的最终版。

**门槛**：`u6-btn-digest.mjs` 重跑：去重写法 52 → ≤14、每屏 `distinctButtonShapes` ≤6；
**回归断言**：新写一个裸 `<button class="btn btn--ghost">` 塞进 16 屏任意容器，**外观必须一致**（DS-3 的机制性验收）。

### 批次 3 · 收尾与守护

- `u6-runtime-probe.mjs`：每屏主表面 L 阶梯严格单调、相邻差 ≥3.5。
- 把 22 条检查清单固化成一个可跑的脚本（能自动查的项：token 合规、按钮形状数、明度阶梯、z 轴、滚动可达性），放 `artifacts/ux-audit-scripts/ds-lint.mjs`，供各窗口收尾自查。
- 视觉抽查：16 屏改前/改后对照图交用户过一遍。

## 3. 验收标准

1. 用户在批次 0 拍板了风格方向，批次 2 的实现与拍板样稿**观感一致**（不是"token 换了但看起来没变"）。
2. 量化护栏全部达标：变量 ≥120 / 重复选择器 ≤170 / 按钮写法 ≤14 / 每屏形状 ≤6 / 字号 ≤12 / 圆角 ≤7 / 阴影 ≤20 / 明度阶梯单调。
3. DS-3（`.ghost` 白块）、DS-7（toast 被盖）、DS-8（弹层逃出舞台）、DS-2（层级非单调）四条机制性缺陷关闭，且有回归断言。
4. 门槛全绿；16 屏对照截图归档 `design/ux-audit/shots/after/`。

## 4. 工作记录（新记录追加在顶部）

| 日期 | 批次 | 内容 | 验证 |
|---|---|---|---|
| — | — | 待开工 | — |
