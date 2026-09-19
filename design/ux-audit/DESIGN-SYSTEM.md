# 全局视觉语言 · 设计系统 v2（UX-13）

> **对象**：`game.html` 外壳的全部 meta 屏（地图/编队/图鉴/英雄/宝箱/竞技场/活动/入侵/结算/设置）。
> **用户原话**：「总体过于沉闷单调而且各种方框按钮也不美观」（TASK-UX §0 UX-13，P0 体系）。
> **定位**：本文是**阶段 B 所有页面改动的公共底座**。阶段 B 每页的视觉修改都应先落 token/按钮/面板基类，再逐页迁移。
> **红线遵守声明**：本轮**零 `src/**` 改动**、零 `tests/**` 改动，未触碰 `design/meta-mockups*` 与 `design/meta-style-study`（只读对标）。
> **目标口径（2026-09-19 用户更正，以此为准）**：本任务**不是"把功能修到可用"，而是把页面做到漂亮、精致、成熟——商业级实用页面，拿出去不丢人**。
> 因此：**允许更改色相、允许换风格**。`design/meta-mockups-v5` 只是当前实现的来处，不是不可动的基准；原页面太丑、不达标的部分就该换掉。
> 本文 §1/§2 的盘点与诊断（token 现状、按钮 52 种写法、明度阶梯、`.ghost` 作用域陷阱等）是**事实层，不受口径变化影响**；
> §3 的 token 值是**"沿用现有色板的保守版"**，作为下限而非终点——阶段 B 先定视觉风格方向（详见 `TASK-DS.md` 的风格定稿流程：出 2~3 套样稿 → 用户拍板 → 再落 token 表），
> 拍板后 §3 的具体色值可整表替换，结构（4 层表面 / 六态按钮 / 5 档圆角 / 8 档字号 / 7 条阴影 / 7 档 Z 轴 / 单一稀有度表）保持不变。
> **美术资产口径（同批裁定）**：部队与武器贴图**统一使用已拉到本地的 GoW 官方美术资产**（`data/raw/gow-2026-09-18/portraits` 1828 张立绘 + `public/gowhead-icons/` 718 张武器卡面）；
> 程序化剪影（`shell/weaponIcons.ts`）退役。以后是否替换为自制美术是以后的事。

## 取证来源

| 类型 | 文件 |
|---|---|
| 跨屏对比截图（9 屏） | `shots/ds-{map,team,troop,hero,chests,arena,events,events-world,invasion,settings}.png` |
| 局部特写（15 张） | `shots/ds-crop-{chests-dock,events-fight,events-tabs,hero-classexpand,hero-ghosts,hero-weapon-actions,invasion-attack,settings-danger,settings-secondary,team-buttons,team-inspect-buttons,team-savebar,team-surface-ladder,troop-cards,troop-filter}.png` |
| 弹层越出舞台取证 | `shots/ds-overlay-matveil-1200x700.png` |
| Token 静态扫描 | `artifacts/ux-audit-scripts/u6-token-scan.txt`（8 文件 / 870 规则块） |
| 按钮运行时清单 | `artifacts/ux-audit-scripts/u6-btn-digest.txt`（335 实例 / 52 写法） |
| 重复/冲突规则 | `artifacts/ux-audit-scripts/u6-dup-scan.txt`（223 选择器重复 / 487 规则块） |
| 运行时 computed style 取样 | `artifacts/ux-audit-scripts/u6-runtime-probe.json`（9 屏表面 HSL + 按钮逐个 computed） |
| 可复跑脚本 | `u6-{token-scan,btn-digest,dup-scan,layer-probe,runtime-probe,crops,shots}.mjs` |

同批页面报告的量化实证在本文直接引用，不重复劳动：`pages/03-team.md` TM-4、`pages/04-troop.md` T-6/T-7、`pages/05-hero.md` H-1/H-2/H-3、`pages/06-forge.md` F-1/F-7、`pages/07-weapons-codex.md` C-1/C-6、`pages/01-map.md` M-11/M-12。

---

## 1. 现状盘点（事实层）

### 1.1 样式文件与加载机制

| 文件 | 行数 | 加载方式 | 加载位置 |
|---|---|---|---|
| `style.css` | 682 | 全局 `import`（`gameMain.ts:7`） | head 常驻 |
| `screens.css` | 2825 | 全局 `import`（`gameMain.ts:8`） | head 常驻 |
| `extras.css` | 117 | 全局 `import`（`gameMain.ts:9`） | head 常驻 |
| `troop.css` | 182 | `pageCss.ts` 按屏注入 | **插入 head 首**（先于全局，被全局压回） |
| `arena.css` | 539 | `pageCss.ts` 按屏注入 | 追加 head 尾（覆盖全局） |
| `result.css` | 368 | `pageCss.ts` 按屏注入 | 追加 head 尾 |
| `live.css` | 191 | `pageCss.ts` 按屏注入（events + invasion 共用） | 追加 head 尾 |
| `effect-panels.css` | 211 | **零引用** | 未加载（死样式） |

`pageCss.ts:20-26` 的映射与 `TASK-META` 2026-09-18「第二批·用户反馈修差」①的裁定一致：小样各页级联顺序不同，`troop` 必须插 head 首、`arena/result` 必须追加尾，与小样逐字节同序。**本文的所有提案都建立在这个机制不变的前提上**（见 §3.2）。

规则块总数 **870**；重复定义选择器 **223 个**、涉及 **487 个规则块**（= 全部规则块的 56%）。重复最重的两个文件：

- `screens.css`：629 个选择器里 **148 个**被重复定义（323 个块）。最高 `.class-grid` **5 次**（:1761/2270/2314/2319/2325）、`.perk-slot` **5 次**、`.perk-slots` 4 次、`.class-vault > .career-perks` 4 次。
- `troop.css`：361 个选择器里 **62 个**被重复定义（137 个块）。`.heading-center:before/:after` 3 次、`.growth` 3 次、`.collection-card .magic-badge` 3 次。

### 1.2 Token 实际使用值统计

| 维度 | 去重取值数 | 出现次数 | 最高频前三 | 判读 |
|---|---|---|---|---|
| 颜色字面量 | **1343** | 2106 | `#000`×30、`#ffd77a`×19、`rgba(239,217,158,.82)`×16 | 平均每个色值只用 1.57 次 → **无色板** |
| `border-radius` | **34** | — | `50%`×32、`6px`×16、`4px`×16、`3px`×14 | 含 9 条四角分写的畸形值 |
| `font-size`（含 `font` 简写） | **73** | — | `11px`×61、`10px`×58、`13px`×38、`12px`×37 | 9→14px 之间挤了 6 个档 |
| 字体族写法 | **23** | — | `var(--display)`×90、**裸 `Georgia`×72**、`var(--body)`×10 | 72 处绕过变量直写 |
| 描边宽度 | **11** | 1px solid ×261 | `1px solid`、`2px solid`×14、`1px dashed`×4 | 另有 4 条 `1px 0 0 1px` 式分边写法 |
| `box-shadow` | **147** | — 最高复用仅 **3 次** | `.panel` 三层框（3 次）、`inset 0 1px 0 rgba(255,255,255,.04)`（3 次） | 145 条是一次性的 |
| `gap` | **43** | — | `10px`×33、`12px`×31、`8px`×27 | 4/5/6/7/9/10/11/12 八档并存 |
| `padding` | **169** | — | `0`×19、`5px`×5、`0 22px`×4 | 无节律 |
| `transition` | **16** | 只有 2 条被复用 | 时长档 `.15/.16/.18/.2/.25/.3/.5` **7 档** | 同类交互不同速 |
| `z-index` | **30** | — | `2`×20、`6`×10、`4`×9 | 1~90，无语义分层（见 1.4） |
| `letter-spacing` | **43** | — | `2px`×39、`1px`×31、`4px`×15 | px 与 em 两套单位混用 |
| CSS 变量声明 | **82** | — | — | 其中**全局设计 token 只有 8 个** |

**8 个真正的全局 token**（`style.css:1-9`）：`--gold #d8c290`、`--light #f4e2b4`、`--ink #f2ead8`、`--display`、`--body`、`--map-w`、`--map-h`。其余 74 个变量声明全是局部的稀有度/职业/纸面色，并且**同名重复声明**：

- `--gold/--light/--ink/--display/--body` 在 `troop.css:1` 又声明了一份（`--display` 的字体回退链还少一项：`style.css:5` 有 `"SimSun"`，`troop.css:1` 的列表不同源）。
- 稀有度变量共 **4 套、命名 3 种**：`--rarity-*`（`screens.css:1068-1071` 4 档 + `arena.css:252-254` 另 4 档）、`--r-*`（`screens.css:1271-1276` 6 档）、`--rc`（`troop.css:170-171` 6 档）；外加独立页 `WeaponCodexPage.ts:47 RARITY_COLOR` 第 4 套 8 档。详见 1.5 与 §3.4。
- 纸面 token 两套：`screens.css:1498-1507`（`--paper #17181c` / `--ink #ded9d0` / `--accent #f3deaf` …）与**未加载**的 `effect-panels.css:2-6`（`--effect-text` / `--effect-gold` …）。

### 1.3 按钮体系现状

运行时清单：**335 个按钮实例**，按「底色 + 渐变 + 描边 + 圆角 + 高度 + 字体」联合去重后 **52 种写法**；`u6-token-scan` 侧统计到 **101 条按钮相关选择器**。

每屏「形状种数」（`u6-runtime-probe.json` `distinctButtonShapes`）：

| 屏 | 按钮数 | 形状种数 | 高度取值 | 最大/最小高度比 |
|---|---|---|---|---|
| `#map` | 65 | 10 | 8 种 `33,42,48,78,81,87,128,140` | 4.24× |
| `#team` | 43 | **19** | **11 种** `28,31,32,36,38,42,46,48,81,121,238` | **8.50×** |
| `#troop` | 113 | 11 | 8 种 `24,26,41,42,48,52,81,196` | 8.17× |
| `#hero` | 26 | 9 | 7 种 `23,28,32,42,48,81,86` | 3.74× |
| `#chests` | 18 | 10 | 5 种 `17,42,45,48,81` | 4.76× |
| `#arena` | 16 | 6 | 5 种 | 1.93× |
| `#events/worldEvent` | 20 | 7 | 6 种 | 2.45× |
| `#invasion` | 17 | 4 | 4 种 | 2.45× |
| `#settings` | 17 | 5 | 5 种 | 1.98× |

**按钮类清单与状态齐备度**（✔=有 / — =无 / ≈=只改颜色不改形）：

| 类 | 定义位置 | 出现屏 | 主 | 次 | 危险 | 禁用 | 加载 | 备注 |
|---|---|---|---|---|---|---|---|---|
| `button`（裸基类） | `style.css:17-29` | 全部 | — | — | — | ✔ `opacity:.42` | — | 只有 `filter:brightness(1.14)` hover + `translateY(1px)` active，**无底色无描边** → 没有专属类的按钮渲染成 UA 白块 |
| `.primary` | `style.css:631-652` | map 弹层 / arena / settings / vault | ✔ 绿实底 + 金框 + 菱钉 | — | — | 继承 `.42` | — | 全系统**唯一**实底 CTA；被 4 处父选择器改写（见下表） |
| `.secondary` | `style.css:654-662` | team / troop / hero / settings / result | — | ✔ 紫灰渐变 + 金框 | — | 继承 | — | settings 的**破坏性操作也用它**（重置演示档/重置全新档） |
| `.ghost` | **仅 `result.css:269-276`** | hero（3 处）、result（2 处） | — | — | — | 继承 | — | **跨文件作用域陷阱**，见下文 |
| `.chip` / `.chip.hot` / `.chip.gold` | `style.css:456-470` | map 日常条 | — | ≈ 仅换 `border-color`/`color` | — | — | — | 三枚同形不同义（说明 / 批量结算 / 跳转，见 `01-map.md` M-9） |
| `.team-tab` | `screens.css:90-143` + **重复 :627-651** | team | — | — | — | ✔ | — | `.on` 与 `.active` 两个态叠加，4 种组合 |
| `.filter-tab` | `screens.css:395,720` | team | — | ≈ `border:1px solid transparent` | — | — | — | 未选中态描边透明 → 不像可点 |
| `.filter-chip` | `troop.css:144,181` | troop | — | ✔ 20px 药丸 | — | — | — | 与 `.filter-tab` 语义相同、外形完全不同 |
| `.ev-tab` / `.ev-tab.page` | `live.css:123-127` | events / invasion | — | ✔ `999px` 药丸 | — | — | — | 第三种 tab 外形 |
| `.chest-btn`（+`.featured`/`.gem`/`.gem.featured`/`.is-unaffordable`） | `screens.css:856-884` | chests | ✔ ×4 种渐变 | — | — | ≈ `filter:saturate(.5)` | — | 4 个实底渐变按钮同屏并列，主次不可判 |
| `.class-btn` | `screens.css:1780-1801,2284-2296` + `.class-current .class-btn`(:2344) + `.class-grid-full .class-btn`(:2361) + **未加载的 `effect-panels.css:150`** | hero | — | ✔ | — | ✔ `.lock` | — | 1 个类 5 处定义 |
| `.perk-unlock` | `screens.css:2424` / `:2126 .perk-board` / `:2690 .class-vault>` / `:2790`（同选择器二次） | hero | — | ✔ | — | — | — | **4 套定义**；`:2126` 注释原文「v5 补：解锁/已生效状态样式，**替代 UA 白块**」= 历史事故的现场记录 |
| `.class-expand` | `screens.css:2270`（金）与 `:2758-2771`（蓝） | hero | — | ✔ | — | — | — | **两套冲突**；运行时胜出的是蓝色 `1px solid rgb(109,174,202)`（`u6-btn-digest` #42），金色那份是死代码 |
| `.inspect-act` / `.inspect-act.primary` | `screens.css:560-575` | team | ≈ | ✔ | — | — | — | 第二套「primary」，与 `style.css:631` 不同源 |
| `.claim-btn` / `.claim-btn.claimed` | `result.css:243-253` | result | ✔ | — | — | — | ✔（`claimed` 绿态） | 全系统唯一有「完成态」的按钮 |
| `.inv-attack` | `live.css` | invasion | ✔ 紫底金框 | — | — | — | — | 第三套「主 CTA」外形 |
| `.ev-fight` | `live.css` | events | ✔ 紫渐变 + `12px` 圆角 | — | — | — | — | 第四套「主 CTA」外形 |
| `.danger` | `screens.css:189` `#984d43` / **:661** `#dc9488` | team 菜单 | — | — | ≈ **仅字色**，两个红值 | — | — | 全系统唯一的「危险」表达，且只在一个下拉菜单里 |
| `.money` / `.orb` / `.knode` / `.talent-node` / `.collection-card` / `.slot` / `.mini` / `.step` / `.odds-link` / `.compass` / `.add-team` / `.banner-chip` / `.save-team` / `.set-active` / `.sheet-close` / `.vault-close` / `.cancel` | 散落 | 各屏 | — | — | — | 部分 | — | 这些是「其实是按钮但不长得像按钮」的一类，占 335 实例中的多数 |

**六态覆盖结论**：
- **主态**：存在 5 套互不相干的实底 CTA（`.primary` 绿、`.chest-btn` 金、`.chest-btn.gem` 紫、`.inv-attack` 紫、`.ev-fight` 紫 + 12px 圆角）。
- **次态**：3 套（`.secondary`、`.inspect-act`、`.wspell-head .secondary` 的 4px 圆角小号版）。
- **幽灵态**：1 套且**不在全局文件里**（见下）。
- **危险态**：**只有字色**，且两个红值；破坏性操作（设置页两个「重置」）用的是普通 `.secondary`（`ds-crop-settings-danger.png`、`ds-crop-settings-secondary.png`）。
- **禁用态**：全系统只有 `button:disabled{opacity:.42}` 一条；`.chest-btn.is-unaffordable` 另用 `filter:saturate(.5) brightness(.72)`；`.save-team:disabled`（`screens.css:713`）另给近黑 `#191720`（`03-team.md` TM-4 实测「几乎隐形」）。
- **加载态**：**全系统零覆盖**，没有任何 `.is-loading` / `aria-busy` 样式。所有网关写操作（保存编队、开箱、锻造、导入存档）按下后按钮外观不变。

**作用域陷阱（历史事故的复发面）**：`u6-token-scan` 列出 **17 条**被父选择器限定的按钮类：

```
arena.css:132    .signup-copy .primary        arena.css:531   .battle-actions .primary
result.css:267   .result-actions .secondary   screens.css:1471 .wspell-head .secondary
screens.css:1669 .section-title .ghost        screens.css:1680 .talent-board .section-title .ghost
screens.css:1987 .vault-detail .primary       screens.css:2344 .class-current .class-btn
screens.css:2361 .class-grid-full .class-btn  screens.css:2435 .class-current .class-btn b
troop.css:12     .collection-heading .secondary [data-icon]
troop.css:128    .growth .primary             troop.css:131   .decompose-row .secondary
```

其中**最严重的一条是 `.ghost`**：它的基类定义**只存在于 `result.css:269-276`**，而 `result.css` 由 `pageCss.ts:24` 只在 `#result` 屏注入。英雄屏用了 3 个 `.ghost`（`heroScreen.ts:147` 查看完整天赋树、`:162` 选择职业、`:520` 解锁），它们在 `#hero` 屏上**完全拿不到 `.ghost` 的底色/描边/字号**，只能靠各自的父作用域规则兜住：
- `:147` 恰好在 `.talent-board .section-title` 里 → 命中 `screens.css:1680`，渲染成 23px 高、`rgba(255,255,255,.02)` 底的小框（`u6-btn-digest` #41）。
- `:162` 在 `.class-vault-actions` 里，**不在 `.section-title` 下** → 只能靠 `.class-expand` 自己的规则活着（`screens.css:2758`）。
- `:520` 靠 `.perk-unlock` 的 4 套规则之一活着（`screens.css:2126` 的注释明写它是为「替代 UA 白块」补的）。

也就是说：**当前在任何屏新写一个 `<button class="ghost">`，只要不落在 `.section-title` 或 `.perk-board` 之类的特定父节点下，就会渲染成浏览器默认白色方块。** 这正是历史事故的机制，且机制仍在。

### 1.4 面板 / 卡片体系现状

**L0/L1/L2 实测明度**（`u6-runtime-probe.json` 主表面 HSL，面积 > 8000px²）：

| 屏 | 主表面数 | L 范围 | L 中位 | S 中位 | 最大表面 |
|---|---|---|---|---|---|
| `#map` | 1 | 6~6 | 6 | 55 | `.map-frame` `rgb(7,16,24)` 899,600px² |
| `#team` | 17 | 6~10 | 6 | 24 | `.panel.roster` `rgb(12,12,20)` 552,336px² |
| `#troop` | 85 | **6~6** | 6 | 24 | 85 张 `.collection-card` 全部 `rgb(11,11,18)` |
| `#hero` | 9 | 6~14 | 10 | 12 | `.hero-screen` `rgb(12,13,18)` |
| `#chests` | 2 | 11~11 | 11 | 18 | `.chest-panel` `rgb(33,26,23)` |
| `#arena` | 3 | 9~13 | 9 | 21 | `.step` `rgb(20,19,29)` |
| `#events/worldEvent` | 1 | 6~6 | 6 | 25 | `.ev-panel` `rgb(12,12,20)` 1,068,448px² |
| `#invasion` | 1 | 6~6 | 6 | 25 | `.inv-panel` `rgb(12,12,20)` 1,068,448px² |
| `#settings` | 4 | 5~6 | 6 | 25 | `.panel` `rgb(12,12,20)` |

**9 屏里 6 屏的主表面明度跨度 ≤1 个 L 点**（map/troop/events/invasion 是 0，settings 是 1，team 是 4 但不单调）。

`.panel` 是唯一的共享面板基类（`screens.css:8-33`）：`#0c0c14` 底 + `border-radius:10px` + **三层 box-shadow 框**（`0 0 0 1px rgba(38,31,22,.96)` / `0 0 0 2px rgba(216,194,144,.42)` / `0 18px 40px #0008`）+ `:after` 的四角 L 形金线（8 个 `linear-gradient` 拼的 28px/24px 角饰）。这套框在 `style.css:170`（`.map-frame`）与 `screens.css:665`（`.team-screen .panel`）各复制了一份——是全系统**唯一被复用 3 次**的 box-shadow。

层级断裂的实证（`03-team.md` TM-4 已量化）：`panel rgb(12,12,20)` L6 → `slot rgb(16,16,24)` L8 → `mini rgb(11,11,18)` **L6**。**卡片比它所在的面板更暗**，明度阶梯非单调。

**会裁内容的规则**（`overflow:hidden` 共 **25 条**），已造成问题的：

| 规则 | 位置 | 后果 | 已有编号 |
|---|---|---|---|
| `.panel { overflow:hidden }` | `screens.css:8-12` | 面板内任何超高内容直接消失，且不给滚动 | `16-settings.md` 的按钮裁切 |
| `.vault-sheet { height:646px; overflow:hidden }` + `.vault-body`/`.vault-rack` 无 `overflow-y` | `screens.css:1821-1830,1863-1874` | 武器库 20 把里 8 把点不着、12 把被裁一半，滚轮无效；「装备」按钮永久在弹层外（`margin-top:auto` 推到 y=1416，可见底沿 y=772） | `05-hero.md` H-1 / H-2 |
| `.detail-art { height:148px }` + `.detail-art .tile-img { width:100%; aspect-ratio:1 }` | `screens.css:1935-1938` + `:2823` | 图实渲 337px，上下各溢出 ~94px，把稀有度/名称/来源/消耗四行文字全盖住（命中测试 `coveredBy IMG.tile-img`） | `06-forge.md` F-1 |
| `.talent-cell .talent-desc { overflow:hidden }` | `screens.css:2158` | 天赋描述截断无省略号 | — |
| `.class-grid { overflow:hidden }` | `screens.css:2270` | 职业格超行被吞 | — |
| `.collection-info h2` / `>span:last-child` | `troop.css:175,177` | 长名截断 | — |
| `#collection { overflow:hidden }` | `troop.css:107` | 与内层 `#collectionBands` 的滚动职责重叠 | `04-troop.md` T-4/T-9 |

**Z 轴现状**（30 个取值，1~90，无语义分层）：

```
1,2,3,4,5,6,7,8   → 屏内局部堆叠（散落 60+ 处）
10  .team-switcher / .team-menu-pop     12  .topbar / .bottom-bar（chrome）
16,20,22,30       → 吸顶条 / legend-slam / summon-stage
36  .modal-veil   38  .tip-veil         40  .toast（style.css:484）
44  .vault-veil   46  .tree-veil        48  .perk-veil   50  .summon-modal
50  .toast（troop.css:11，仅 troop 屏）  90  #matVeil（extras.css:91，position:fixed 挂 body）
```

### 1.5 稀有度色板现状（4 套并存）

| 体系 | 位置 | 档数 | 值 |
|---|---|---|---|
| `--rc`（图鉴卡 3px 顶线） | `troop.css:170-171` | 6 | `#79828e / #63a86b / #5493cf / #9d6bdc / #dd8f45 / #e9c258` |
| `--r-*`（武器槽/英雄页，注释写「低饱和矿物珠宝质感」） | `screens.css:1271-1276` | 6 | `#485260 / #33694f / #2d6391 / #694499 / #946222 / #963535`（+ glow + text + sub 各一套） |
| `--rarity-*`（抽卡演出） | `screens.css:1068-1071` + `arena.css:252-254` | 4 + 4 | `#7c8292 / #3b88c4 / #9c60e6 / #eeb548`；arena 那份 legend 档换成 `#f4e2b4` |
| `RARITY_COLOR`（独立页武器图鉴） | `WeaponCodexPage.ts:47-50` | 8 | `#9aa0a6 / #57c84d / #3d7bff / #35c3dd / #b04df0 / #ff9d2e / #ff4d5e / #c83434` |

同一个「稀有」档在四套里分别是 `#5493cf`（图鉴）、`#33694f`（英雄页，**绿色**）、`#3b88c4`（抽卡）、`#3d7bff`（codex，**高饱和蓝**）。`07-weapons-codex.md` C-6 已实测到冲突可见实例：「阴毒匕首/神话」= 红框 + 青绿底图。

### 1.6 跨屏对比：「沉闷单调」的成因分解

对 `ds-*.png` 九张跨屏图与运行时取样做归因，用户那句话可以拆成五个独立的技术成因，**每一条都可单独修**：

| 成因 | 量化 | 证据 |
|---|---|---|
| ① **明度分布过窄** | 9 屏主表面 L 中位数全在 **5~11**；6 屏内部跨度 ≤1 L 点；层级非单调（卡片 L6 < 面板 L6~8） | `ds-crop-team-surface-ladder.png`；`03-team.md` TM-4 |
| ② **饱和度整体偏低且无强调色** | UI 面板 S 18~25（map 的 S55 是底图不是 UI）；唯一高饱和元素是 team 的绿徽章 `#1d3029/#bce0c1`，而它**不可点** | `ds-team.png`；TM-4「全页唯一饱和色抢了 CTA 的位」 |
| ③ **卡片无材质** | 52 种按钮写法里只有 **22 种**带渐变或内高光，其余 30 种是纯色或完全透明；`.slot` 明确 `box-shadow:none`（`screens.css:677-681`）；147 条 box-shadow 里 14 条是 `none` | `ds-crop-troop-cards.png`（85 张卡同底同框同阴影）、`ds-crop-team-buttons.png` |
| ④ **信息密度均匀、无节奏** | `#troop` 一屏 85 张 `32,830px²` 的等大卡片、底色全等 `rgb(11,11,18)`；`#events`/`#invasion` 整屏只有 **1 个**主表面（1,068,448px² 单块） | `ds-troop.png`、`ds-events-world.png`、`ds-invasion.png` |
| ⑤ **主次按钮权重差不足** | 「其实是按钮但不长得像按钮」的写法占多数：**45 个** `.money`、**40 个**底部导航、**32+10 个** `.knode`、7 个 `.talent-node` 全部 `border:0px none` + 透明底；而真正的 CTA 与它们同屏时高度只差 1.9×~8.5× 且外形无系统差 | `ds-crop-team-savebar.png`、`ds-crop-hero-ghosts.png`、`ds-crop-events-tabs.png` |

⑤ 的极端例：`#team` 43 个按钮 / **19 种形状** / 11 种高度（28~238px），而这一屏的真 CTA「保存更改」在未改动时是 `rgb(25,23,32)` 实底 + `1px solid rgb(99,82,59)`（`u6-btn-digest` #33），与背景对比度 **1.08**。

---

## 2. 诊断：把「沉闷单调 + 方框按钮不美观」翻译成技术判断

共 **14 条**。级别口径同 TASK-UX §2.3（P0=不可用/强误导/用户已点名，P1=明显别扭不阻塞，P2=打磨）。

| # | 级别 | 诊断 | 成因 | 证据 |
|---|---|---|---|---|
| **DS-1** | **P0** | **没有色板，只有 1343 个一次性色值**——「沉闷单调」的根因不是颜色太少，而是**颜色太多且互不成体系**：1343 个去重色值只出现 2106 次，平均复用 1.57 次，所以任何两个相邻元素都不共享同一个底色/描边，整屏读起来是一片"差不多但都不一样"的深灰紫 | 全局 token 只有 8 个（`style.css:1-9`），而设计需要的表面/描边/文字/语义四类色**一个都没有 token 化**；开发者每写一个新组件就现调一个十六进制值 | `u6-token-scan.txt`「颜色字面量：去重 1343 个（出现 2106 次）」；最高频的 `#000`×30、`#ffd77a`×19；描边金色至少有 **9 个近邻色值**：`#e6d09d / #e1c891 / #ddbf73 / #d8c290 / #c4b28f / #aa8b57 / #a38b56 / #8e7347 / #67563e`，肉眼不可区分但分属 9 条独立规则 |
| **DS-2** | **P0** | **面板/卡片明度阶梯非单调，"谁在谁上面"读不出来**——卡片比它所在的面板更暗，选中态只换一个 `border-color` | `.panel #0c0c14`(L6) → `.slot #101018`(L8) → `.mini #0b0b12`(**L6**)；`.slot.on` 相对 `.slot` 只改 `border-color #67563e → #e1c891` 并加一层 18px 微光，不改底色、不改高度、不抬起 | `screens.css:663-668,677-689,730`；运行时 `panel rgb(12,12,20)` / `slot rgb(16,16,24)` / `mini rgb(11,11,18)`；`ds-crop-team-surface-ladder.png`；引 `03-team.md` **TM-4**（七类容器明度差 <2%，选中态看不出来导致玩家反复编错槽） |
| **DS-3** | **P0** | **`.ghost` 的基类只存在于按屏注入的 `result.css` 里——在其它 8 屏写 `class="ghost"` 会得到 UA 白色方块**。历史事故的机制**至今未拆**，并且已经在 `screens.css:2126` 留下了"事后打补丁"的现场记录 | `.ghost` 唯一基类定义 `result.css:269-276`，而 `pageCss.ts:24` 只在 `#result` 屏注入 `result.css`；`screens.css` 里 `.ghost` 只有两条**带父作用域**的规则（`:1669 .section-title .ghost`、`:1680 .talent-board .section-title .ghost`） | `heroScreen.ts:147/162/520` 三处 `.ghost`：`:147` 靠 `.talent-board .section-title` 兜住（实测 h=23、底 `rgba(255,255,255,.02)`）、`:162` 靠 `.class-expand` 自有规则兜住、`:520` 靠 `.perk-unlock` 兜住；`screens.css:2126` 注释原文「v5 补：解锁/已生效状态样式，**替代 UA 白块**」。另有 16 条同型作用域限定（`u6-token-scan.txt`「作用域陷阱候选：17」）。截图 `ds-crop-hero-ghosts.png`、`ds-crop-hero-classexpand.png` |
| **DS-4** | **P0** | **同一语义的按钮有 5 套外形，玩家学不到"哪个是主行动"**：全系统有 5 种互不相干的实底 CTA，形状/圆角/色相/高度全不同 | `.primary` 绿渐变 + 金框 + 菱钉 h=51（`style.css:631`）、`.chest-btn` 金渐变 h=45（`screens.css:857`）、`.chest-btn.gem` 紫渐变 h=45、`.inv-attack` 紫底金框 `9px` 圆角 h=33（`live.css`）、`.ev-fight` 紫渐变 **`12px` 圆角** h=67（`live.css`）。同时 `.primary` 自己被 4 个父选择器改写（`arena.css:132,531`、`screens.css:1987`、`troop.css:128`） | `u6-btn-digest.txt` 写法 #24/#44/#46/#15/#51；截图 `ds-crop-chests-dock.png`（一屏并列 4 个实底渐变按钮）、`ds-crop-events-fight.png`、`ds-crop-invasion-attack.png` |
| **DS-5** | **P0** | **危险操作没有危险态**：设置页两个「重置」用的是和「导出存档 JSON」**完全相同**的 `.secondary`（同渐变、同金框、同 41px 高） | 全系统 `.danger` 只在 team 的下拉菜单里、**只改字色**，且两个红值（`screens.css:189 #984d43` / `:661 #dc9488`）；`extras.css:32-33 .settings-row .secondary, .settings-row .primary` 把所有设置页按钮拉平 | `u6-btn-digest.txt` #16（4 个 `.secondary`：导出存档 JSON / 复制到剪贴板 / 重置为演示档 / 重置为全新档，**四者外形逐像素相同**）；截图 `ds-crop-settings-danger.png`、`ds-crop-settings-secondary.png` |
| **DS-6** | **P0** | **加载态全系统零覆盖**：所有网关写操作（保存编队、开箱、锻造、导入存档、报名竞技场）按下后按钮外观完全不变，没有 `aria-busy`、没有 spinner、没有禁用 | 16 条 `transition` 里没有一条服务于 pending 态；无 `.is-loading` / `[aria-busy]` 选择器 | `u6-token-scan.txt`「transition：去重 16」全表；`u6-btn-digest.txt` 52 种写法里零 loading 变体 |
| **DS-7** | **P0** | **弹层 z-index 盖住 toast，"操作成功"这句反馈在最需要它的场合看不见**：`.toast` z=40，而武器库 44 / 天赋树 46 / 特质槽 48 / 抽卡 50 / 材料库 90 都在它之上 | `style.css:484 .toast{z-index:40}`；`screens.css:1820 .vault-veil{44}`、`:2116 .tree-veil{46}`、`:2709 .perk-veil{48}`、`:923 .summon-modal{50}`；`extras.css:91 #matVeil{90}`。`troop.css:11` 又把 `.toast` 提到 50，**只在 troop 屏生效** | toast 挂载点是屏骨架内的 `#toast`（`chrome.ts:182`），被弹层遮罩遮住；引 `05-hero.md` H-2（装备按钮点不到）与 `06-forge.md` F-6（锻造成功「只有一句 toast」）——那句 toast 在熔炉弹层里是**看不见的** |
| **DS-8** | **P0** | **材料库弹层 `position:fixed` 挂 body，逃出 `.stage` 的缩放变换**——在非 1600×900 视口下弹层与它下面的游戏画面不同比例 | `extras.css:91 #matVeil{position:fixed; inset:0; z-index:90}`；而 `.stage`（`style.css:38-47`）是 `width:1600px; height:900px` + `transform-origin:center` 由外壳缩放，其它所有弹层（`.modal-veil` z36 / `.vault-veil` z44）都是 `position:absolute` 挂在 stage 内 | `ds-overlay-matveil-1200x700.png`（1200×700 视口实拍：遮罩铺满真实窗口而非舞台，弹层内文字与舞台内文字字号不同比例）；引 `UX-7`（用户：「简陋的要死根本不像是个背包」） |
| **DS-9** | P1 | **稀有度被编码 4 次、4 套色板互相冲突**，同一档在不同屏是不同颜色，其中一套还是绿色 | 见 §1.5 表。「稀有」档：图鉴 `#5493cf` / 英雄页 `#33694f`（绿）/ 抽卡 `#3b88c4` / codex `#3d7bff`。命名也是三种（`--rc` / `--r-*` / `--rarity-*`） | `troop.css:170-171`、`screens.css:1271-1276`、`screens.css:1068-1071`、`arena.css:252-254`、`WeaponCodexPage.ts:47-50`；引 `07-weapons-codex.md` **C-6**（红框 + 青绿底图的实拍冲突）与 `04-troop.md` **T-7**（3px 稀有度线 6 档全页无图例） |
| **DS-10** | P1 | **223 个选择器被重复定义（占全部规则块的 56%），同一个类的最终外观取决于行号**——这让"改一个按钮"变成"猜哪一份在生效" | `screens.css` 148/629 重复、`troop.css` 62/361 重复。最重的：`.class-grid` 5 次、`.perk-slot` 5 次、`.perk-unlock` 4 套、`.class-expand` 2 套**且颜色相反**（`:2270` 金 vs `:2758` 蓝，运行时蓝色胜出 → 金色那份是死代码）；`.team-tab` 整块在 `:90-143` 与 `:627-651` 各存一份 | `u6-dup-scan.txt` 全表；`u6-btn-digest.txt` #42 实测 `选择职业(ghost class-expand)` border = `1px solid rgb(109,174,202)` |
| **DS-11** | P1 | **两条同选择器规则打架导致吸顶条半透明、穿透第一行卡片**——DS-10 的已发生后果实例 | `troop.css:161 .kingdom-band{background:#1d1724}`（不透明）被 `troop.css:181` 同选择器的 `.kingdom-band{background:linear-gradient(90deg,#201a25,transparent)}` 覆盖成右侧全透明 | 运行时 `background "linear-gradient(90deg, rgb(32,26,37), rgba(0,0,0,0))"`；引 `04-troop.md` **T-6** |
| **DS-12** | P1 | **`overflow:hidden` 是默认容器策略而非例外，25 处规则里已知 4 处正在吞掉玩家必须看到的内容** | `.panel{overflow:hidden}`（`screens.css:8`）是**所有屏的面板基类**，超高内容既不滚也不提示；`.vault-sheet` 固定 646px + hidden 且内层无 `overflow-y`；`.detail-art{height:148px}` 装 337px 图 | 引 `05-hero.md` **H-1**（8 把点不着 / 12 把裁一半 / 滚轮无效）、**H-2**（装备按钮 y=1416 vs 可见底沿 y=772，功能 0% 可用）、`06-forge.md` **F-1**（四行文字全被图盖住）、**F-7**（配方列表超出 34px 被裁） |
| **DS-13** | P1 | **字号阶梯在 9~14px 之间挤了 6 个档（9/10/11/12/13/14），而 14px 以上断层**——注脚和正文没有明确分工，于是"什么都不响，也什么都不弱" | 73 个字号取值；`11px`×61、`10px`×58、`13px`×38、`12px`×37 = 194 次集中在 4px 区间内；同时 73 个取值里有 `10.5px` / `12.5px` 小数与 7/8/19/21/23/25/29/31/34/38/44px 单次值。字体族还有 **72 处裸写 `Georgia`** 绕过 `var(--display)` | `u6-token-scan.txt`「字号：去重 73」「字体族：去重 23」；`03-team.md` TM-4「整屏读起来像一张没有排版过的表格」 |
| **DS-14** | P2 | **211 行死样式仍在仓库里，且它定义了 `.class-btn` / `.talent-board` 的第三套写法与 `--effect-*` 第二套纸面 token**——任何人照它改都不会生效 | `effect-panels.css` 零引用（`gameMain.ts:7-9` 只 import `style/screens/extras`，`pageCss.ts:20-26` 不含它），`TASK-META` 2026-09-18 第二批①已写明「effect-panels.css 无页面引用，弃载」，但文件仍在且被 token 扫描统计进来 | `u6-token-scan.txt` 文件头列出 `effect-panels.css(211行)`；`u6-dup-scan.txt`「`.talent-board` 3×（行 25, 48, 97）」；`effect-panels.css:2-6` 的 `--effect-text/-muted/-faint/-gold/-accent`、`:150 .class-btn`、`:106 .talent-board .section-title .ghost` |

**辅助诊断（与「不美观」直接相关，不单列为条目但需在提案里处理）**：
- 圆角 34 个取值，含 9 条四角分写的畸形值（`troop.css:8` 的 `8px 0 12px 0`、`0 9px 0 16px` 等），同屏并列的按钮圆角从 `0px` 到 `999px` 全有（`ds-crop-events-tabs.png`）。
- box-shadow 147 条里 **145 条只用一次**，最高复用仅 3 次 → 光影语言不存在。
- 描边 261 处 `1px solid` + 14 处 `2px solid`，**没有第三级**，所以"强调"只能靠换颜色而不能靠加粗。
- `letter-spacing` px 与 em 两套单位混用（`2px`×39 vs `.28em`×5），中文字距在不同字号下不一致。
- 引 `01-map.md` **M-11**（左右 rail 基线错开 58px，根因 `.rail{top:50%; transform:translateY(-58%)}` 对不同条目数产生不同基线）、**M-12**（右下角用**锁图标**配「Lv.12 · 42 王国」，图标与文案无关，纯噪声）——这两条说明"排版秩序"与"图标语义"也需要进设计系统的约束范围。

---

## 3. 提案：设计系统 v2

> **读本章前先看页头的目标口径**：下面所有具体色值都是**沿用现有色板的保守版（下限）**，标着「v5 原值不动」的条目是"至少不比现在差"的兜底，
> **不是终点**。阶段 B 的第一步是风格定稿（`TASK-DS.md` 批次 0：2~3 套样稿 → 用户拍板），拍板后本章的**色值表整表替换、色相可换**；
> 保持不变的是**结构**：4 层表面阶梯 / 六态按钮 / 5 档圆角 / 6 档间距 / 8 档字号 / 7 条阴影 / 3 档动效 / 7 档 Z 轴 / 单一稀有度表 / 滚动容器三禁则。

### 3.0 落点与命名约定

所有 token 放**一个新文件** `src/meta/shell/styles/tokens.css`，在 `gameMain.ts` 里**第一个** import（先于 `style.css`），只包含 `:root{}` 变量声明，**零选择器规则**。这样：

- `troop.css` 仍由 `pageCss.ts` 插到 head 首（先于全局），它读得到 `:root` 变量（CSS 变量与级联顺序无关，只与"声明是否在作用域内"有关），**不破坏小样级联顺序**；
- `arena.css` / `result.css` / `live.css` 仍追加 head 尾覆盖全局，行为不变；
- 变量只声明不产生规则 → 不参与选择器权重竞争，**不可能压坏任何一屏的皮肤**（这是 `TASK-META` 2026-09-18 第二批①那次事故的根因，本方案从机制上避开）。

命名前缀统一 `--ds-`，与现有 `--gold/--light/--ink/--display/--body`（保留，作为 v2 的别名）和局部 `--r-*/--rc/--rarity-*`（合并，见 §3.4）不冲突。

### 3.1 Token 表

#### 表面（L 阶梯，4 档 + 背板）

现状问题见 DS-2。规则：**相邻档 HSL-L 差 ≥3.5 个点、L0↔L3 差 ≥10 个点，且严格单调递增（越上层越亮）**。

| Token | 建议值 | HSL-L | 用途 | 替换现值 |
|---|---|---|---|---|
| `--ds-l0` | `#0a0a11` | 5.3 | 屏背板（纯色兜底） | `#080910`(body) |
| `--ds-l0-field` | `radial-gradient(ellipse at 50% 42%, #1a1824 0%, #0e0e18 62%)` | — | 屏背板（保留 v5 原渐变，零改动） | `screens.css:1-6`、`:47-53`、`style.css:158-162` 三处同值 → 收敛为一个 token |
| `--ds-l1` | `#12121b` | 8.8 | **面板** `.panel` | `#0c0c14`（抬亮 +2.8 L） |
| `--ds-l2` | `#1b1a25` | 12.4 | **卡片 / 槽位 / 小卡** | `.slot #101018`(8) / `.mini #0b0b12`(6) → 统一抬到 12.4，修掉非单调 |
| `--ds-l2-raise` | `linear-gradient(#20202c, #16161f)` | 14→11 | 卡片材质（上亮下暗，给"面"的厚度） | `.slot` 现为 `box-shadow:none` 纯色 |
| `--ds-l3` | `#24222f` | 15.9 | **弹层 / 选中卡 / 吸顶条** | `.kingdom-sheet` 现为 `linear-gradient(160deg,#1b1722,#0e0d14)` → 作为 `--ds-l3-sheet` 保留 |
| `--ds-l3-sheet` | `linear-gradient(160deg, #24222f, #14131d 55%)` | — | 大弹层（保留 v5 斜向渐变语言） | `style.css:513-517` |
| `--ds-paper` | `#17181c` | 11.0 | 纸面（英雄页法术/词条区，现有第二套体系，保留） | `screens.css:1498` 原值不动 |
| `--ds-paper-soft` | `#24252a` | 14.5 | 纸面次级 | `screens.css:1499` 原值不动 |

> 注：`--ds-l1` 从 `#0c0c14` 抬到 `#12121b` 是**全局连带改动**，9 屏都会变亮一档；必须逐屏回归截图（见 §3.6 批次 1 的验收）。

#### 描边（3 级亮度 × 3 级粗细，全部取自现有高频值）

| Token | 建议值 | 来源（现有出现次数） | 用途 |
|---|---|---|---|
| `--ds-edge-faint` | `rgba(186,164,139,.18)` | 现 9 次（`screens.css:1162,1231,1364,…`） | L2 卡片常态描边、分割线 |
| `--ds-edge` | `#67563e` | 现 6 次（`screens.css:643,651,674,…`） | L1 面板内分区、次级按钮 |
| `--ds-edge-strong` | `#a1895c` | 现 team `.slot.on` 实测 `rgb(161,137,92)` | 选中态、hover |
| `--ds-edge-hot` | `#e1c891` | 现 4 次（`screens.css:636,683`、`style.css:69`、`troop.css:4`） | 主 CTA、当前项、焦点 |
| `--ds-edge-danger` | `#c45454` | 现 3 次（`screens.css:1216`、`troop.css:94,97`） | 危险态描边（统一两个红值） |
| `--ds-bw-1` | `1px` | 现 261 次 | 常态 |
| `--ds-bw-2` | `2px` | 现 14 次 | 强调 / 选中 |
| `--ds-bw-3` | `3.5px` | 现 2 次（`screens.css:1562`、`troop.css:65`） | 稀有度框（唯一用途） |

**删除**：`1.5px`（2 处）、`3px solid`（2 处）、4 条 `1px 0 0 1px` 式分边写法（`screens.css:1386-1389`）、`1px dotted`（`troop.css:64`）。`1px dashed` 只保留**空槽位**一个语义（`screens.css` `.add-team`）。

9 个金色描边近邻值（DS-1）全部映射到上面 4 个：`#e6d09d/#e1c891` → `--ds-edge-hot`；`#ddbf73/#d8c290/#c4b28f` → `--ds-gold` 家族（文字/图标用，不作描边）；`#aa8b57/#a38b56` → `--ds-edge-strong`；`#8e7347/#67563e` → `--ds-edge`。

#### 文字与语义色

| Token | 建议值 | 来源 | 用途 |
|---|---|---|---|
| `--ds-ink` | `#f2ead8` | 现 `--ink` | 标题、主要数值 |
| `--ds-ink-soft` | `#c4b6a3` | 现 6 次 | 正文 |
| `--ds-ink-faint` | `#91887a` | 现 7 次 | 注脚、单位、eyebrow |
| `--ds-gold` | `#d8c290` | 现 `--gold` | 图标、次级强调 |
| `--ds-gold-bright` | `#f4e2b4` | 现 `--light` | 大标题、仪式感文字 |
| `--ds-gold-deep` | `#8e7347` | 现 7 次 | 金色的暗端（分割线、压暗描边） |
| `--ds-ok` | `#65be91` | 现 `.r-rare --r-text` | 成功 / 已完成（**唯一绿色出口**） |
| `--ds-warn` | `#e8a84c` | 现 `.r-legend --r-text` | 警告 / 限时 |
| `--ds-danger` | `#c45454` | 现 3 次 | 危险 |
| `--ds-danger-soft` | `#dc9488` | 现 `screens.css:661` | 危险态文字（统一掉 `#984d43`） |

**强调色预算（破"沉闷"的关键约束，不是加新颜色）**：每屏**最多 1 个饱和实底 CTA + 最多 1 个饱和状态徽章**。现在 team 屏违反了这条（绿徽章是唯一饱和色却不可点，CTA 对比度 1.08）；chests 屏也违反（4 个实底渐变并列）。修法见 §3.3。

#### 圆角（34 → 5 档）

| Token | 值 | 来源次数 | 用途 |
|---|---|---|---|
| `--ds-rad-xs` | `4px` | 16 | chip、小按钮、图标按钮、稀有度角标 |
| `--ds-rad-sm` | `6px` | 16 | 卡片、常规按钮 |
| `--ds-rad-md` | `10px` | 7 | 面板、弹层 |
| `--ds-rad-pill` | `999px` | 3 | tab 药丸（`live.css` 的 `.ev-tab` 语言，保留） |
| `--ds-rad-circle` | `50%` | 32 | 头像、orb |

**删除**：`0/2/3/5/7/8/9/11/12/14/16/20px` 与 9 条四角分写值（`troop.css:8,12,38,42`、`arena.css:296`、`screens.css:282,474,537,2401`）。其中 `troop.css` 的斜切角（`8px 0 12px 0`）若是卡面设计语言的一部分，**保留为专用 token** `--ds-rad-cardcut: 8px 0 12px 0`（单一出口，不再各处现写）。

#### 间距（43 gap + 169 padding → 6 档）

| Token | 值 | 吸收现值 |
|---|---|---|
| `--ds-sp-1` | `4px` | 2/3/4/5px |
| `--ds-sp-2` | `8px` | 6/7/8/9px（gap 现 6px×15、7px×8、9px×9 全归此档） |
| `--ds-sp-3` | `12px` | 10/11/12/13px（gap 现 10px×33、12px×31 两大头） |
| `--ds-sp-4` | `16px` | 14/16/17/18px |
| `--ds-sp-5` | `24px` | 20/22/24/26px |
| `--ds-sp-6` | `40px` | 28px+ 与页边距（`padding:0 44px` 的 chrome 保持原值，不动） |

#### 字号与行高（73 → 8 档）

阶梯按 1.2~1.25 倍率，砍掉 9~14px 区间的挤压（DS-13）：

| Token | 值 / 行高 | 字族 | 用途 | 吸收现值 |
|---|---|---|---|---|
| `--ds-fs-label` | `10px / 1.4` | `var(--display)`，`letter-spacing:.3em` | eyebrow、全大写小标 | 7/8/9/10px（现 9px×16、8px×7、7px×2 全归此档） |
| `--ds-fs-foot` | `11px / 1.5` | `var(--body)` | 注脚、单位、辅助说明 | 11px（现 61 次，最高频，保留） |
| `--ds-fs-body` | `13px / 1.7` | `var(--body)` | 正文 | 12/12.5/13px（现 12px×37 + 13px×38 合并） |
| `--ds-fs-strong` | `16px / 1.5` | `var(--body)` 或 `var(--display)` | 按钮文字、卡片名、强调数值 | 14/15/16/17px |
| `--ds-fs-h3` | `19px / 1.35` | `var(--display)`，`ls:2px` | 区块标题、主 CTA | 18/19/20/21px |
| `--ds-fs-h2` | `22px / 1.3` | `var(--display)`，`ls:4px` | 面板标题 | 22/23/24/25px |
| `--ds-fs-h1` | `27px / 1.25` | `var(--display)`，`ls:5px` | 页标题 | 26/27/28/29/30/31/32px |
| `--ds-fs-hero` | `36px / 1.1` | `var(--display)`，`ls:6px` | 卡面大字、仪式感数字 | 34/36/38/40/44px |

配套**字族硬规则**：72 处裸写 `Georgia` 全部改 `var(--ds-font-num)`，并新增：

```
--ds-font-display: "Palatino Linotype", "STZhongsong", "SimSun", serif;   /* = 现 --display（style.css:5 的完整回退链为准） */
--ds-font-body:    "Segoe UI", "Microsoft YaHei", sans-serif;              /* = 现 --body */
--ds-font-num:     Georgia, "Palatino Linotype", serif;                    /* 衬线数字，见 §3.5 */
```

`troop.css:1` 里那份重复声明删除（它的 `--display` 回退链与 `style.css:5` 不同源，是潜在的跨屏字体跳动源）。

#### 阴影（147 → 7 条）

| Token | 值 | 用途 |
|---|---|---|
| `--ds-sh-hair` | `inset 0 1px rgba(240,218,183,.12)` | 内高光顶边（现 `.orb`/`.secondary`/`.chip` 已用同族值） |
| `--ds-sh-card` | `0 3px 9px rgba(0,0,0,.28)` | L2 卡片（现 `effect-panels.css:32` 有同值，搬进主体系） |
| `--ds-sh-raise` | `0 8px 18px #0006` | hover / 选中抬起（现 `arena.css:426`） |
| `--ds-sh-panel` | `0 0 0 1px rgba(38,31,22,.96), 0 0 0 2px rgba(216,194,144,.42), 0 18px 40px #0008` | **L1 面板唯一框**（现已在 3 处复用，是唯一有体系感的阴影，升级为 token） |
| `--ds-sh-sheet` | `0 24px 80px #000c, inset 0 1px #f0dab718` | L3 弹层（现 `style.css:518`） |
| `--ds-sh-focus` | `0 0 0 2px #e8cc86` | 焦点环（现 `screens.css:445`） |
| `--ds-glow-rarity` | `0 0 12px var(--r-glow)` | 稀有度微光（唯一出口，见 §3.4） |

145 条一次性阴影按上表归并；`box-shadow:none` 的 14 处逐条复核——`.slot{box-shadow:none}`（`screens.css:677-681`）是 DS-2 的直接成因，必须改成 `--ds-sh-card`。

#### 动效（16 条 / 7 个时长 → 3 档 + 2 条曲线）

| Token | 值 | 用途 |
|---|---|---|
| `--ds-dur-1` | `.12s` | 颜色/描边/亮度变化（hover、态切） |
| `--ds-dur-2` | `.2s` | 形变、淡入淡出、抬起 |
| `--ds-dur-3` | `.45s` | 演出（抽卡、结算上账） |
| `--ds-ease` | `cubic-bezier(.2,.7,.2,1)` | 通用（现 `screens.css:1026`） |
| `--ds-ease-out` | `cubic-bezier(.2,.85,.25,1)` | 入场（现 `screens.css:1001`） |

`prefers-reduced-motion` 的兜底（`style.css:678-680`）保留不动。

#### Z 轴（30 个取值 → 7 档语义）

修 DS-7 的关键是**把 toast 提到所有弹层之上**：

| Token | 值 | 用途 | 替换现值 |
|---|---|---|---|
| `--ds-z-base` | `1` | 屏内基础层 | 0/1 |
| `--ds-z-raise` | `2` | 抬起元素、卡面装饰 | 2/3/4/5 |
| `--ds-z-sticky` | `8` | 吸顶条、分组头 | 3/5/6/7/16 |
| `--ds-z-chrome` | `12` | 顶栏 / 底部导航（**原值不动**） | 10/12 |
| `--ds-z-veil` | `36` | 所有遮罩（统一） | 36/38/44/46/48/50/**90** |
| `--ds-z-sheet` | `40` | 所有弹层内容 | 20/22/30/50 |
| `--ds-z-toast` | `60` | toast（**必须最高**） | 40（style.css:484）/ 50（troop.css:11） |

同时：`#matVeil` 从 `position:fixed` 挂 body 改为 `position:absolute` 挂 `.stage` 内（修 DS-8），并使用 `--ds-z-veil`。

### 3.2 与 `pageCss.ts` 按屏注入机制的共存

`TASK-META` 2026-09-18 第二批①的裁定不动：`troop.css` 插 head 首、`arena/result/live.css` 追加 head 尾，与小样逐字节同序。本提案的兼容做法：

| 改动 | 落点 | 为什么不破坏级联 |
|---|---|---|
| 新增 `tokens.css`（纯 `:root` 变量） | `gameMain.ts` 第一个 import | 只有变量声明、**零选择器规则** → 不参与权重竞争；CSS 变量沿 DOM 继承，`troop.css` 即便排在它之前也读得到 `:root` 上的值 |
| 新增按钮基类 `.btn` 家族 | 追加进 `style.css`（全局常驻） | 与 `.primary/.secondary` 同文件同层，权重关系可预测；`troop.css` 插 head 首 → 仍被 `style.css` 压回，与小样行为一致 |
| 新增面板层级类 `.surface-l1/l2/l3` | 追加进 `screens.css` | 同上 |
| `troop.css` 只做**删减**（删重复声明、删与基类冲突的按钮写法） | `troop.css` 原位 | 删减不改变它的注入位置与顺序 |
| `arena/result/live.css` 的按钮写法改为**引用基类 + 只留差异** | 各自原位，仍追加 head 尾 | 它们本来就是"最后覆盖"，覆盖内容变少只会更安全 |
| **不做**：把 `troop.css` 合并进 `screens.css` | — | 会直接复现 2026-09-18 那次「troop 的 chrome 皮肤压坏所有屏」的事故 |
| **不做**：给 token 用 `!important` 或提高选择器权重 | — | token 是变量，不需要权重；用 `!important` 会让按屏覆盖失效 |

**回归护栏**：任何一批改完后，用 `u6-shots.mjs` 重跑 9 屏截图与 `u6-crops.mjs` 重跑 15 张特写，与本轮基线逐张对比；`u6-token-scan.mjs` / `u6-btn-digest.mjs` 重跑，验收「去重取值数」是否降到目标值（见 §3.6）。

### 3.3 按钮体系（六态 + 三尺寸 + 图标按钮）

#### 基类结构

```
.btn                    ← 一切按钮的基类（布局 + 字体 + 过渡 + 焦点环 + disabled）
.btn--primary           ← 主行动：绿宝石实底 + 金框 + 菱钉（沿用 v5 的 .primary 语言）
.btn--secondary         ← 次行动：紫灰渐变 + 金框 + 内高光
.btn--ghost             ← 幽灵：透明底 + 1px faint 描边（**定义进 style.css，不再靠 result.css**）
.btn--danger            ← 危险：透明底 + danger 描边 + danger 文字 + hover 才上淡红底
.btn--quiet             ← 无框文字按钮（现在的 .odds-link / .cancel / 「重命名」这类）
[disabled] / .is-disabled  ← 禁用
[aria-busy="true"]      ← 加载（新增）
.btn--sm / .btn--md / .btn--lg   ← 尺寸档
.btn--icon              ← 图标按钮（正方形）
```

#### 六态规格

| 态 | 底 | 描边 | 文字 | 阴影 | hover | active |
|---|---|---|---|---|---|---|
| **primary** | `linear-gradient(#477454, #294b38 49%, #213b2d 50%, #2f4e37)`（**v5 原值不动**） | `--ds-bw-1` `#baa674` | `#f2e5bc` | `inset 0 0 0 3px #1d302944, inset 0 1px #d1eab94d, 0 3px 7px #0004`（原值） | `brightness(1.14)` + `--ds-sh-raise` | `translateY(1px)` |
| **secondary** | `linear-gradient(#302838, #1b1823)`（原值） | `--ds-bw-1` `--ds-edge` | `#d8c191` | `--ds-sh-hair` | `border-color: --ds-edge-strong` + `brightness(1.1)` | `translateY(1px)` |
| **ghost** | `transparent` | `--ds-bw-1` `--ds-edge-faint` | `--ds-ink-soft` | 无 | 底 `rgba(255,255,255,.04)` + `border-color: --ds-edge` | `translateY(1px)` |
| **danger** | `transparent` | `--ds-bw-1` `--ds-edge-danger` | `--ds-danger-soft` | 无 | 底 `rgba(196,84,84,.14)` + 文字 `#f0c1b7` | `translateY(1px)` |
| **disabled** | 保持本变体底但 `filter: saturate(.35) brightness(.7)` | `--ds-edge` | `--ds-ink-faint` | 无 | 无 | 无 |
| **loading** | 保持本变体外观 + `cursor:progress` + 文字前插 12px 旋转菱形（复用 `.primary:before` 的菱钉几何，`animation: dsSpin .8s linear infinite`） | 同变体 | 同变体 | 同变体 | 锁定 | 锁定 |

**disabled 不用 `opacity:.42`**（现行做法，`style.css:29`）：`opacity` 会把描边一起吃掉导致按钮"消失"（`.save-team:disabled` 的 `#191720` 近黑就是为了绕开这点又更糟，TM-4 实测「几乎隐形」）。改用 `filter: saturate(.35) brightness(.7)` + 描边降一级，保证轮廓始终可见。

#### 尺寸档（现 11 种高度 → 3 档 + 图标档）

| 档 | 高 | 内边距 | 字号 | 用途 |
|---|---|---|---|---|
| `.btn--sm` | `28px` | `0 var(--ds-sp-3)` | `--ds-fs-foot` | chip、tab、行内操作 |
| `.btn--md` | `40px` | `0 var(--ds-sp-4)` | `--ds-fs-strong` | 默认（次级操作、弹层动作） |
| `.btn--lg` | `51px` | `0 var(--ds-sp-5)` | `--ds-fs-h3` | 屏级主 CTA（**沿用 v5 `.primary` 的 51px**） |
| `.btn--icon` | `32px` × `32px` | `0` | — | 关闭、翻页、⇅ 换位 |

**一屏最多一个 `.btn--lg .btn--primary`**（强调色预算，见 §3.1）。chests 屏 4 个实底并列的处置：主池按钮保 `--primary`，其余 3 个降为 `--secondary` + 货币角标区分（`ds-crop-chests-dock.png`）。

#### 现有类 → 新类 迁移映射表（33 行）

| # | 现有类 | 定义位置 | 出现屏 | → 新类 | 迁移动作 | 风险 |
|---|---|---|---|---|---|---|
| 1 | `button`（裸） | `style.css:17-29` | 全部 | `.btn` 基类 | 把 `filter/transform/focus-visible/disabled` 搬进 `.btn`，裸 `button` 只留 `font:inherit; color:inherit; border:0; cursor:pointer` | **全局连带** |
| 2 | `.primary` | `style.css:631-652` | map 弹层/arena/settings/vault | `.btn .btn--primary .btn--lg` | 类名并存过渡：`.primary` 保留为 `.btn--primary` 的别名选择器 | 中 |
| 3 | `.signup-copy .primary` | `arena.css:132` | arena | `.btn--primary .btn--lg` | 删父作用域，差异（宽度）用 `.btn--block` | 低 |
| 4 | `.battle-actions .primary` | `arena.css:531` | arena | 同上 | 同上 | 低 |
| 5 | `.vault-detail .primary` | `screens.css:1987-2002` | hero | `.btn--primary .btn--md` | **同时修 H-2**：删 `margin-top:auto`，改弹层底部固定动作条 | **高**（H-2 功能性） |
| 6 | `.growth .primary` | `troop.css:128` | troop | `.btn--primary .btn--md` | 删父作用域 | 低 |
| 7 | `.inspect-act.primary` | `screens.css:570-575` | team | `.btn--primary .btn--sm` | 第二套 primary 退役 | 低 |
| 8 | `.claim-btn` / `.claim-btn.claimed` | `result.css:243-253` | result | `.btn--primary .btn--md` + `.is-done` | `claimed` 绿态升级为通用 `.is-done`（`--ds-ok`），给所有按钮可用 | 低 |
| 9 | `.chest-btn` | `screens.css:856-868` | chests | `.btn--primary .btn--md` | 保留金渐变作 `.btn--primary.is-gold` 皮肤变体 | 中 |
| 10 | `.chest-btn.gem` / `.gem.featured` | `screens.css:870-872` | chests | `.btn--secondary.is-gem` | 紫渐变降级为次级（一屏一主 CTA） | 中 |
| 11 | `.chest-btn.featured` | `screens.css:869` | chests | `.btn--primary.is-featured` | 保留 | 低 |
| 12 | `.chest-btn.is-unaffordable` | `screens.css:879-882` | chests | `[disabled]` + `.is-unaffordable`（只加缺口文案） | `filter:saturate(.5) brightness(.72)` 归并到统一 disabled 配方 | 低 |
| 13 | `.inv-attack` | `live.css` | invasion | `.btn--primary .btn--sm` | 紫底改绿宝石底（统一 CTA 色相）；紫色改留给"势力"语义 | 中 |
| 14 | `.ev-fight` | `live.css` | events | `.btn--primary .btn--lg` | **`12px` 圆角改 `--ds-rad-sm`**（现全系统唯一的 12px 圆角按钮） | 中 |
| 15 | `.secondary` | `style.css:654-662` | team/troop/hero/settings/result | `.btn .btn--secondary .btn--md` | 别名过渡 | 中 |
| 16 | `.result-actions .secondary` | `result.css:269` | result | `.btn--secondary .btn--md` | 删父作用域 | 低 |
| 17 | `.wspell-head .secondary` | `screens.css:1472-1494` | hero | `.btn--secondary .btn--sm` | 删父作用域；`4px` 圆角 → `--ds-rad-xs` | 低 |
| 18 | `.decompose-row .secondary` | `troop.css:131` | troop | `.btn--secondary .btn--md` | 删父作用域 | 低 |
| 19 | `.collection-heading .secondary` | `troop.css:12` | troop | `.btn--secondary .btn--sm` | 删父作用域（图标翻转保留为 `.btn--icon-flip`） | 低 |
| 20 | `.ghost` | **`result.css:269-276`** | hero/result | `.btn .btn--ghost` | **基类搬进 `style.css`（修 DS-3）** | **高**（8 屏行为变化） |
| 21 | `.section-title .ghost` | `screens.css:1669` | hero | `.btn--ghost .btn--sm` | 删父作用域 | 中 |
| 22 | `.talent-board .section-title .ghost` | `screens.css:1680-1688` | hero | `.btn--ghost .btn--sm` | 删父作用域（`3px` 圆角 → `--ds-rad-xs`） | 中 |
| 23 | `.class-expand`（**两套**） | `screens.css:2270` 金 / `:2758-2771` 蓝 | hero | `.btn--ghost .btn--sm` | **删掉死代码那份**（`:2270` 金色不生效）；蓝色 `#6daeca` 若是职业色语义则保留为 `.btn--ghost.is-class` | 中 |
| 24 | `.perk-unlock`（**4 套**） | `screens.css:2424` / `:2126` / `:2690` / `:2790` | hero | `.btn--ghost .btn--sm` | 四套合一 | 中 |
| 25 | `.class-btn`（**5 处**，含死文件） | `screens.css:1780-1801,2284-2296,2344,2361` + `effect-panels.css:150` | hero | `.btn--secondary` + `.is-selectable`/`.on`/`.lock` | 合并；`.lock` 走统一 disabled | **高**（职业圣殿整区） |
| 26 | `.danger`（**两个红值**） | `screens.css:189 #984d43` / `:661 #dc9488` | team | `.btn--danger .btn--sm` | 统一 `--ds-danger-soft` | 低 |
| 27 | settings 两个「重置」 | 现用 `.secondary`（`extras.css:32-33`） | settings | `.btn--danger .btn--md` | **修 DS-5**：破坏性操作必须是 danger 态 | 中（功能性改善） |
| 28 | `.chip` / `.chip.hot` / `.chip.gold` | `style.css:456-470` | map | `.btn--secondary .btn--sm` + `.is-hot` | 三枚同形不同义的问题由 `01-map.md` M-9 处理（本表只统一外形 token） | 低 |
| 29 | `.filter-tab` / `.filter-tab.on` | `screens.css:395,720` | team | `.btn--ghost .btn--sm` + `.on` | **修「未选中态描边透明」**：常态给 `--ds-edge-faint` | 低 |
| 30 | `.filter-chip` / `.selected` | `troop.css:144,181` | troop | `.btn--ghost .btn--sm .btn--pill` | `20px` 圆角 → `--ds-rad-pill`，与 `.ev-tab` 统一 | 低 |
| 31 | `.ev-tab` / `.ev-tab.page` | `live.css:123-127` | events/invasion | `.btn--ghost .btn--sm .btn--pill` | 三种 tab 外形收敛为一种 | 中 |
| 32 | `.team-tab`（**整块重复两份**） | `screens.css:90-143` + `:627-651` | team | `.btn--ghost .btn--lg` + `.on`/`.active` | 先删重复块（DS-10），再迁移 | 中 |
| 33 | `.odds-link` / `.cancel` / `.sheet-close` / `.vault-close` / 「重命名」「清空成员」 | 散落 | 多屏 | `.btn--quiet` / `.btn--icon` | 无框文字按钮与图标按钮各一个出口 | 低 |

**不迁移**（它们本质是"可点的内容对象"，不是按钮控件，只继承 `.btn` 的焦点环与 disabled）：`.money`(45)、底部导航(40)、`.knode`(42)、`.talent-node`(7)、`.collection-card`(85)、`.slot`(4)、`.mini`(8)、`.step`(3)、`.compass`(1)。它们共 235/335 个实例——**这也解释了为什么"方框按钮不美观"：真正的控件只有 100 个，另外 235 个是长得像按钮的内容块。** 处置办法是给它们统一的「可点内容」语言（见 §3.4 L2 卡片规则），而不是按钮语言。

### 3.4 面板 / 卡片体系

#### 四层结构

| 层 | 类 | 底 | 描边 | 阴影 | 圆角 | 规则 |
|---|---|---|---|---|---|---|
| **L0 底** | `.screen` | `--ds-l0-field`（径向渐变，v5 原值） | 无 | 无 | 0 | 屏背板，**不承载描边**。L0 上不允许直接放文字块，必须落在 L1 内 |
| **L1 面板** | `.panel` / `.surface-l1` | `--ds-l1` `#12121b` | 由 `--ds-sh-panel` 的双层 ring 代替（现行做法，保留） | `--ds-sh-panel` | `--ds-rad-md` | 四角 L 形金线 `:after` 保留（v5 标志性语言）。**`overflow` 改 `clip` 只用于圆角裁剪，内容超高必须由内层滚动容器接管**（见下） |
| **L2 卡片** | `.surface-l2`（`.slot`/`.mini`/`.collection-card`/`.perk-slot`/`.step`/`.entry`） | `--ds-l2-raise`（渐变，给"面"的厚度） | `--ds-bw-1` `--ds-edge-faint` | `--ds-sh-card` + `--ds-sh-hair` | `--ds-rad-sm` | **可点的 L2 必须有 hover 与选中两态，且选中态要形变**（见下） |
| **L3 弹层** | `.modal-veil > *`（`.kingdom-sheet`/`.vault-sheet`/`.summon-sheet`/`#matVeil` 内容） | `--ds-l3-sheet` | `--ds-bw-1` `--ds-edge-strong` | `--ds-sh-sheet` | `--ds-rad-md` | 遮罩统一 `--ds-z-veil`、内容 `--ds-z-sheet`；**必须 `position:absolute` 挂 `.stage` 内**（修 DS-8） |

#### 选中态规则（修 DS-2 / TM-4 的支点）

**禁止「只换 border-color」**。可点 L2 的三态：

```
常态   底 --ds-l2-raise        描边 1px --ds-edge-faint     无位移
hover  底 亮 +2 L（filter: brightness(1.12)）  描边 1px --ds-edge-strong   translateY(-1px)
选中   底 --ds-l3（抬一整档）  描边 2px --ds-edge-hot        translateY(-2px) + --ds-sh-raise
                              + 左侧 3px --ds-edge-hot 竖条（或顶部 3px，随卡型）
```

即：**选中 = 明度抬一档 + 描边加粗一级 + 位移 + 方向性标记**，四个信号同时给。`03-team.md` 的 TM-4 配套提案（`translateY(-2px)` + 左侧 3px 金条 + 底色抬亮一档）与此一致，本文把它升级为全局规则。

#### 稀有度体系（4 套 → 1 套）

统一命名为 `--r-*`（沿用 `screens.css:1271-1276` 的命名与「低饱和矿物珠宝质感」口径，这是四套里唯一有设计意图注释的一套），**6 档 + 2 个别名**：

| 档 | 类 | `--r-line` | `--r-text` | `--r-glow` | 取自 | 替换 |
|---|---|---|---|---|---|---|
| 普通 | `.r-common` / `.r-0` | `#485260` | `#b6c0cc` | `rgba(182,192,204,.20)` | `screens.css:1271` 原值 | `troop.css --rc #79828e`、`screens.css:1068 #7c8292`、`codex #9aa0a6` |
| 非普 | `.r-uncommon` / `.r-1` | `#33694f` | `#65be91` | `rgba(101,190,145,.25)` | `screens.css:1272`（**现名 `.r-rare`，需改名**） | `troop.css #63a86b`、`codex #57c84d` |
| 稀有 | `.r-rare` / `.r-2` | `#2d6391` | `#5ea8e8` | `rgba(94,168,232,.26)` | `screens.css:1273`（**现名 `.r-epicplus`，需改名**） | `troop.css #5493cf`、`screens.css:1069 #3b88c4`、`codex #3d7bff` |
| 史诗 | `.r-epic` / `.r-3` | `#694499` | `#b987f2` | `rgba(185,135,242,.28)` | `screens.css:1274` | `troop.css #9d6bdc`、`screens.css:1070 #9c60e6`、`codex #b04df0` |
| 传说 | `.r-legend` / `.r-4` | `#946222` | `#e8a84c` | `rgba(232,168,76,.30)` | `screens.css:1275` | `troop.css #dd8f45`、`screens.css:1071 #eeb548`、`arena.css:254 #f4e2b4`、`codex #ff9d2e` |
| 神话 | `.r-mythic` / `.r-5` | `#963535` | `#ea6c6c` | `rgba(234,108,108,.32)` | `screens.css:1276` | `troop.css #e9c258`、`codex #ff4d5e` |
| 别名 | `.r-ultrarare` → `.r-rare` 的 `--r-sub` 变体；`.r-doomed` → `.r-mythic` + `.is-doomed`（额外 `--r-line` 压暗 `#7a2a2a`） | — | — | — | `heroScreen.ts:644-654` 现已把 Doomed 归 `r-mythic`，与 codex 的独立档冲突（C-6） | `codex #35c3dd` / `#c83434` |

> **改名风险提示**：`screens.css:1271-1276` 现有的 6 个类名与档位**错位一档**（现 `.r-rare` 实为"非普"的绿、现 `.r-epicplus` 实为"稀有"的蓝），而 TS 侧是按类名挂 class 的（`heroScreen.ts:59-66 RARITY` + `:644-654`）。因此这一步**必须 CSS 与 TS 同批改**，否则会出现"稀有武器显示成绿色"的错档。建议用数字别名 `.r-0`~`.r-5` 作为迁移期的稳定锚点，语义名后补。

配套硬规则：

1. **稀有度只允许通过 `--r-line` / `--r-text` / `--r-glow` / `--r-sub` 四个变量表达**，禁止在 TS 里写 `style.borderColor = RARITY_COLOR[...]`（`WeaponCodexPage.ts:150,156,193` 三处内联样式全删，改挂 `.r-*` class）。
2. **稀有度框统一 `--ds-bw-3`（3.5px）**，只出现在卡片的一条边或整框，**同一张卡上不允许两个稀有度信号**（修 C-6 的"官方卡面自带光晕底 + 外框又套一层"：卡面 webp 自带底光时，外框改用 `--ds-edge-faint` 中性描边，稀有度只由角标文字承担）。
3. **必须有图例**（修 T-7）：任何用色线表达稀有度的列表，筛选器区必须常驻 6 色图例；`troop.css:169` 的 3px 顶线保留但加图例。
4. 中文档名与 6 档映射**单源**：把 `WeaponCodexPage.ts:43-46 RARITY_ZH` 与 `heroScreen.ts:644-654` 的重复表提到共享模块（`07-weapons-codex.md` 的「复用并提取」结论一致）。

#### 滚动容器规则（避免 `overflow:hidden` 裁切复发，修 DS-12）

强制模式——**任何固定高度的容器必须显式指定内容策略，三选一**：

```
① 内容滚动：外层 overflow:clip（仅圆角裁剪）+ 内层 .scroll-y { overflow-y:auto; min-height:0 }
                                              ↑ min-height:0 是 flex/grid 子项能滚的前提
② 内容截断：必须配 text-overflow:ellipsis 或 mask 渐隐，不允许硬切
③ 内容自适应：容器 height:auto + max-height + ①
```

并配三条禁则：

- **禁止** `height: <固定值>` + `overflow:hidden` 且内层无滚动容器（这是 H-1/F-7 的配方）。
- **禁止** `margin-top:auto` 把动作按钮推到高度由兄弟内容撑出的列底（这是 H-2 的配方：按钮落到 y=1416，可见底沿 y=772）。动作区一律改**弹层底部固定条**（`position:sticky; bottom:0` 或 grid 的独立行）。
- **禁止**在固定高容器内放 `aspect-ratio` 图（这是 F-1 的配方：`.detail-art{height:148px}` 装 `aspect-ratio:1` 的 337px 图）。图容器改 `aspect-ratio` 或给 `img{max-height:100%; object-fit:contain}`。

现存 25 条 `overflow:hidden` 的处置分类：

| 处置 | 规则 |
|---|---|
| 改 `overflow:clip`（纯圆角裁剪，保留） | `.panel`、`.stage`、`.map-frame`、`.map-viewport`、`html/body`、`.slot-art`、`.summary-art`、`.kingdom-art` 等图/框容器 |
| 改模式 ①（加内层滚动） | `.vault-sheet` + `.vault-body` + `.vault-rack`（H-1）、`#collection` / `#collectionBands`（T-4/T-9）、`.class-grid`、`.summon-sheet` |
| 改模式 ②（加省略号） | `.team-tab-copy b`、`.talent-cell .talent-desc`、`.class-current-copy small`、`.collection-info h2`、`.perk-head b` |
| 改模式 ③ | `.detail-art`（F-1）、`.drop-card`、`.picked-slot`、`.run-slot` |

### 3.5 排版与数字

#### 阶梯（对应 §3.1 的 8 档字号）

| 角色 | Token | 字族 | 字距 | 颜色 |
|---|---|---|---|---|
| 页标题 | `--ds-fs-h1` | display | `5px` | `--ds-gold-bright` |
| 面板标题 | `--ds-fs-h2` | display | `4px` | `#e7d2a3`（现值，映射 `--ds-gold`） |
| 区块标题 | `--ds-fs-h3` | display | `2px` | `--ds-ink` |
| eyebrow / 全大写小标 | `--ds-fs-label` | display | `.3em` | `--ds-ink-faint` |
| 正文 | `--ds-fs-body` | body | `0` | `--ds-ink-soft` |
| 注脚 / 单位 | `--ds-fs-foot` | body | `0` | `--ds-ink-faint` |
| 按钮文字 | `--ds-fs-strong`（`--lg` 用 `--ds-fs-h3`） | display | `2px` | 随变体 |

**字距单位统一为 px**（43 个取值里的 `.12em~.5em` 共 14 处改 px 等效值）。中文标题字距 > 4px 时必须配 `text-indent` 补偿右侧空白（现行 `letter-spacing:5px/6px` 的标题右边都多出一个字距的空隙，见 `ds-map.png` 顶栏标题）。

#### 衬线数字（`--ds-font-num`）的适用边界

现状：72 处裸写 `Georgia`，用法混乱（既用于大数值也用于普通标签）。规则：

| 用 `--ds-font-num`（Georgia 衬线） | 用 `--ds-font-body`（无衬线） |
|---|---|
| 钱包数值（黄金/灵魂/宝石/钥匙） | 按钮文字 |
| 卡面战斗数值（攻/护/生/魔、耗蓝、等级） | 说明文案、toast、提示 |
| 价格 / 消耗 / 缺口（`.price`、`.unlock-cost`） | 筛选器标签、tab 文字 |
| 进度分数（`已获得 5 / 730`、`收藏进度 2 / 49`） | 时间倒计时（等宽更重要，用 `tabular-nums` + body） |
| 排名 / 段位 / 场次 | 正文内联数字 |
| eyebrow 的全大写英文小标（v5 语言） | — |

配套：`b { font-variant-numeric: tabular-nums }` 已在 `style.css:35` 全局生效，**保留**；新增 `.num { font: var(--ds-fs-strong)/1 var(--ds-font-num); font-variant-numeric: tabular-nums }` 作为数值的统一出口。

### 3.6 落地路径（5 批，按依赖排序）

风险口径：**全局连带** = 改动影响 9 屏，必须逐屏回归截图；**单屏** = 只影响 1~2 屏。

#### 批次 1 · Token 底座（无视觉改动的纯机械批）

| 项 | 文件 | 风险 |
|---|---|---|
| 新建 `tokens.css`（§3.1 全表），`gameMain.ts` 第一个 import | 新文件 + `gameMain.ts:7` 前插一行 | 低（纯声明） |
| 删 `troop.css:1` 的重复 token 声明（`--gold/--light/--ink/--display/--body`） | `troop.css:1` | 低（值同源，但 `--display` 回退链不同 → **此项本身就是修 bug**） |
| 删除死文件 `effect-panels.css`（211 行，零引用，DS-14） | 删文件 | 低 |
| 拆重复选择器：`.class-grid`(5)/`.perk-slot`(5)/`.perk-unlock`(4)/`.class-expand`(2)/`.team-tab`(2 整块)/`.kingdom-band`(2) | `screens.css`、`troop.css` | 中（DS-11 的吸顶条会**变好**，其余应零视觉变化） |
| Z 轴归入 7 档语义 + `.toast` 提到 `--ds-z-toast:60` + `#matVeil` 改 `absolute` 挂 stage | `style.css:484`、`screens.css:1820,2116,2709,923`、`extras.css:91`、`troop.css:11` | 中（修 DS-7/DS-8，**行为改善**） |

**验收**：① `u6-token-scan.mjs` 重跑：CSS 变量声明数从 82 → ≥120（token 化）、重复选择器从 223 → ≤170；② `u6-shots.mjs` 9 屏截图与本轮基线**逐像素比对应几乎无差**（除吸顶条与 toast 层级两处已知改善）；③ 手测：打开武器库 / 天赋树 / 材料库 / 抽卡演出，各触发一次 toast，**四处都要看得见**；④ 1200×700 视口开材料库，遮罩必须跟着舞台缩放（对比 `ds-overlay-matveil-1200x700.png`）。

#### 批次 2 · 按钮基类（`.btn` 家族 + 六态）

| 项 | 文件 | 风险 |
|---|---|---|
| `.btn` 基类 + 6 变体 + 3 尺寸 + `.btn--icon` 写进 `style.css`（**`.btn--ghost` 基类必须在这里，修 DS-3**） | `style.css` 追加 | **全局连带** |
| `.primary` / `.secondary` / `.ghost` 保留为新类的别名选择器（过渡期不改 TS） | `style.css` | 低 |
| disabled 配方从 `opacity:.42` 改 `filter: saturate(.35) brightness(.7)` + 描边降级 | `style.css:29` | **全局连带** |
| 新增 loading 态（`[aria-busy="true"]` + 旋转菱钉动画），修 DS-6 | `style.css` | 低（新增） |
| 拆掉 17 条按钮作用域限定中风险最低的 12 条（映射表 #3/4/6/16/17/18/19/21/22/26/29/33） | `arena.css`、`result.css`、`screens.css`、`troop.css` | 中 |

**验收**：① `u6-btn-digest.mjs` 重跑：去重写法 **52 → ≤14**（6 变体 × 尺寸组合 + 内容型对象）、每屏 `distinctButtonShapes` ≤6；② 每屏至少各截一张 `ds-crop-*`，人工确认主 CTA 是该屏最强视觉；③ **新写一个裸 `<button class="btn btn--ghost">` 分别塞进 9 屏任意容器，9 处外观必须一致**（这是 DS-3 的回归断言）；④ 键盘 Tab 遍历每屏，焦点环（`--ds-sh-focus`）必须可见。

#### 批次 3 · 面板层级与滚动容器

| 项 | 文件 | 风险 |
|---|---|---|
| `.panel` 底 `#0c0c14` → `--ds-l1 #12121b`；L2 系列统一 `--ds-l2-raise` + `--ds-sh-card`（删 `.slot{box-shadow:none}`） | `screens.css:8,663-731,1157+` | **全局连带**（9 屏都变亮一档） |
| 可点 L2 的三态规格（hover 抬 1px / 选中抬 2px + 2px 金框 + 侧条） | `screens.css`、`troop.css` | **全局连带** |
| 25 条 `overflow:hidden` 按 §3.4 四类处置；三条禁则的存量违例逐条修（H-1 / H-2 / F-1 / F-7 / T-4 / T-9） | `screens.css:8,1821-1874,1935-1938,2823`、`troop.css:107,175,177` | **高**（功能性，但都是已确认的 P0） |
| 圆角 34 → 5 档；描边宽度 11 → 3 档 | 全部 CSS | 全局连带 |

**验收**：① `u6-runtime-probe.mjs` 重跑：每屏主表面 L 阶梯**严格单调**且相邻档差 ≥3.5；② `u6-token-scan.mjs`：`border-radius` 取值 34 → ≤7（含 `--ds-rad-cardcut`）、描边宽度 11 → ≤4、`box-shadow` 147 → ≤20；③ 逐屏滚到底 + 逐弹层滚到底截图，确认无内容不可达（对照 H-1 的 `fullyUnreachable 8` 要归零）；④ team 屏重跑 `u2-team.mjs`，「选中槽位」在截图上一眼可辨（TM-4 的验收点）。

#### 批次 4 · 稀有度与排版统一

| 项 | 文件 | 风险 |
|---|---|---|
| 4 套稀有度色板 → 1 套 `--r-*` 6 档 + 2 别名；`--rc` / `--rarity-*` 退役 | `troop.css:170-171`、`screens.css:1068-1071,1271-1276`、`arena.css:252-254` | 中（跨 4 屏） |
| `WeaponCodexPage.ts` 的 `RARITY_COLOR` 内联样式 3 处改挂 `.r-*` class | `src/render/WeaponCodexPage.ts:150,156,193` | 中（与 UX-3 并页同批做，见 `07-weapons-codex.md`） |
| 稀有度图例常驻（修 T-7）；同卡双信号去重（修 C-6） | `troopScreen.ts`、`WeaponCodexPage.ts` | 中 |
| 字号 73 → 8 档；72 处裸写 `Georgia` → `--ds-font-num`；字距 em → px | 全部 CSS | **全局连带** |
| `.num` 数值出口 + 衬线数字适用边界（§3.5 表） | 全部 CSS | 中 |

**验收**：① `u6-token-scan.mjs`：字号取值 73 → ≤12（8 档 + 少量图形用尺寸）、字体族写法 23 → ≤5、`letter-spacing` 43 → ≤8；② 稀有度：同一档在 troop / hero / chests / arena / codex 五处截图取色**必须一致**；③ 6 档图例在图鉴与武器图鉴两处都在屏。

#### 批次 5 · 逐页迁移（阶段 B 各页任务的一部分，不单独立批）

各页任务在自己的批次里把 TS 模板的类名从旧类换成 `.btn --*` / `.surface-l*`，并删掉 `style.css` 里的别名选择器。顺序建议按"按钮密度 × 已确认 P0 数"排：`#team`(19 形状) → `#troop`(11) → `#hero`(9) → `#chests`(10，与 UX-9 拆页同批) → `#map`(10) → `#events`/`#invasion`(与 UX-4/5/6 同批) → `#arena` → `#settings` → `#result`。

**验收**：每页改完照 §4 清单逐条自查，并重跑该页的窗口脚本（`u1-*` / `u2-*` / `u3-*` / `u4-*` / `u5-*`）做回归。

#### 风险汇总（需要逐页回归截图的全局连带改动，共 8 项）

1. `.panel` 底色抬亮（批 3）
2. L2 卡片统一渐变 + 阴影（批 3）
3. `button` 基类职责搬进 `.btn`（批 2）
4. disabled 配方变更（批 2）
5. `.ghost` 基类进全局（批 2，8 屏行为变化）
6. 圆角 / 描边宽度收敛（批 3）
7. 字号阶梯收敛（批 4）
8. Z 轴重排 + toast 提层（批 1，行为改善但影响所有弹层）

---

## 4. 视觉语言一致性检查清单

阶段 B 每页改完照此自查，逐条勾。**前 6 条是硬门槛，任一不过则该页不算改完。**

**硬门槛**

- [ ] **1. 层级单调**：本页每个可见表面都能归到 L0/L1/L2/L3 之一，且实测 HSL-L 严格递增、相邻档差 ≥3.5 个 L 点（用 `u6-runtime-probe.mjs` 取样，不靠肉眼）。
- [ ] **2. 一屏一主 CTA**：全页只有一个 `.btn--lg .btn--primary`；它是本页视觉最强的元素，强于任何状态徽章（TASK-UX §2.2 第 1 问）。
- [ ] **3. 零 UA 白块**：本页所有 `<button>` 都带 `.btn` + 一个变体类；把任一按钮的父容器换掉后外观不变（作用域陷阱回归断言，DS-3）。
- [ ] **4. 选中态四信号**：所有可选中的 L2 元素，选中时同时改变 ① 底色明度 ② 描边粗细 ③ 位移 ④ 方向标记；**不允许只换 `border-color`**（DS-2 / TM-4）。
- [ ] **5. 零裁切**：本页每个固定高度容器都显式落在 §3.4 的三种内容策略之一；滚到底截图与滚到顶截图**字节不同**（若相同说明容器不可滚，即 H-1 的病症）。
- [ ] **6. 破坏性操作可辨**：删除 / 重置 / 清空 / 覆盖导入一律 `.btn--danger`，且与相邻安全操作**不相邻或有分隔**（DS-5 / TM-9）。

**Token 合规**

- [ ] 7. 本页 CSS 新增/改动的颜色**全部来自 `--ds-*` 或 `--r-*`**，零新增十六进制字面量。
- [ ] 8. 圆角只用 5 档 token（`--ds-rad-xs/sm/md/pill/circle` 或 `--ds-rad-cardcut`）。
- [ ] 9. 字号只用 8 档 token；字距用 px；字族只用 `--ds-font-display/body/num`（零裸写 `Georgia`）。
- [ ] 10. 间距只用 6 档 token（`--ds-sp-1..6`）；`gap` 与 `padding` 不再出现 5/7/9/11/13px 之类的中间值。
- [ ] 11. 阴影只用 7 条 token；不新写一次性 `box-shadow`。
- [ ] 12. 过渡只用 3 档时长 + 2 条曲线 token。
- [ ] 13. `z-index` 只用 7 档语义 token；本页新增的弹层遮罩用 `--ds-z-veil`、内容用 `--ds-z-sheet`，**toast 始终在最上**。

**体系一致**

- [ ] 14. 按钮尺寸只用 3 档 + 图标档；本页按钮高度取值 ≤4 种（现状最差的 team 是 11 种）。
- [ ] 15. 六态齐备：本页每个会触发网关写操作的按钮都有 `[aria-busy]` 加载态；每个可能不可用的按钮都有 disabled 态且**轮廓仍可见**（不用 `opacity`）。
- [ ] 16. 稀有度只由 `.r-*` class 表达；同一张卡上**只有一处**稀有度信号；本页若用色线表达稀有度则同屏有 6 色图例（DS-9 / T-7 / C-6）。
- [ ] 17. 饱和色预算：本页最多 1 个饱和实底 + 1 个饱和徽章；`--ds-ok` 绿只用于"已完成/成功"，不用于装饰（TM-4 的绿徽章抢 CTA 位）。
- [ ] 18. 衬线数字按 §3.5 的边界表使用；进度分数/价格/战斗数值用 `.num`，说明文案不用衬线数字。
- [ ] 19. 图标与文案语义一致（M-12 的「锁图标配 42 王国」类噪声零容忍）；同一语义在全局只用一个图标。
- [ ] 20. 对称与基线：同屏并列的两组元素基线对齐（M-11 的 rail 错开 58px 类问题零容忍）；卡片网格的行高一致。

**回归**

- [ ] 21. 该页窗口脚本（`u1-*`~`u5-*`）重跑通过；`u6-shots.mjs` + `u6-crops.mjs` 重跑并与本轮基线附图对比；console 错误 0 条。
- [ ] 22. 键盘 Tab 全页遍历，焦点环可见且顺序合理；`prefers-reduced-motion` 下无动画残留。

---

## 附：本文与其它窗口报告的引用关系

| 本文诊断 | 引用/被引用 |
|---|---|
| DS-2（层级非单调） | 量化样本来自 `03-team.md` **TM-4**；本文把 TM-4 的「三档」提案升级为全局 4 层 + 四信号选中态 |
| DS-3（`.ghost` 作用域陷阱） | 现场证据 `heroScreen.ts:147/162/520` + `screens.css:2126` 的补丁注释；`05-hero.md` 的按钮观感问题同根因 |
| DS-7（toast 被弹层盖住） | 使 `06-forge.md` **F-6**「成功只有一句 toast」在熔炉弹层里实际为零反馈 |
| DS-8（`#matVeil` 逃出舞台） | `UX-7` 材料库背包化的必要条件 |
| DS-9（稀有度 4 套） | `07-weapons-codex.md` **C-6**（红框+青绿底图）、`04-troop.md` **T-7**（无图例） |
| DS-11（同选择器打架） | `04-troop.md` **T-6**（吸顶条半透明穿透） |
| DS-12（裁切） | `05-hero.md` **H-1/H-2**、`06-forge.md` **F-1/F-7**、`04-troop.md` **T-4/T-9** |
| 辅助诊断（排版秩序/图标语义） | `01-map.md` **M-11/M-12** |
| §3.4 稀有度中文表单源 | `07-weapons-codex.md` 的「`RARITY_ZH`/`TYPE_ZH`/`COLOR_ZH` 复用并提取」结论 |
