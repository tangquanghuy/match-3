> **归档于 2026-09-27**：本任务书退出 active，未完成事项保留供后续重新立项；本页的旧窗口分派、执行指令和状态不再代表当前任务。

# 任务书 · 窗口 M：武器域（官方贴图统一 + 新屏 `#weapons`）

> 必读：`TASK-UX-PHASE-B.md`（总纲）、`design/ux-audit/pages/05-hero.md`（H-1~H-12）、`06-forge.md`（F-1~F-7）、`07-weapons-codex.md`（C-1~C-10）、`design/ux-audit/DESIGN-SYSTEM.md`（§3 token/按钮/面板 + §4 检查清单）、`PARALLEL-WORK.md`（台账）。
> 背景：`design/WEAPON-FORGE-DESIGN.md`（淬炼/熔炉设计，F3 页面未落地）、`TASK-META.md` §8.3（淬炼已接线口径）。
> **前置**：窗口 L 的批次 1~2（token + `.btn` + 面板四层）。L 交付前你可以先做批次 1（美术资产与数据迁移，纯数据/逻辑，不碰样式）。
> **当前状态（2026-09-20）**：批次 0~2 已落地；批次 3 已退役旧独立 Codex 入口。运行时武器页面唯一入口为 `game.html#weapons`（含 `owned` / `all` / `forge` / `temper` 子路由）。`design/ux-audit/**` 与 `tasks/reference/**` 中保留的旧路径仅是审计/历史证据，不属于活动代码残留。

## 0. 目标

一次建屏解决四项 P0：**UX-1**（熔炉配方看不到武器属性）、**UX-2**（贴图混排）、**UX-3**（武器图鉴是独立网页 + 过滤器不可用）、**F-3**（淬炼全链路已接线但零界面入口）。
终局形态：**新屏 `#weapons`，四个 tab = 我的武器 / 全部 / 熔炉 / 淬炼**，共用一份武器详情组件。

## 1. 所有权

| 范围 | 文件 |
|---|---|
| M 独占 | `src/meta/screens/heroScreen.ts`、**新** `src/meta/screens/weaponsScreen.ts`、`src/meta/data/weaponCatalog.ts`、`src/meta/data/weapons.ts`、`src/meta/data/soulforge.ts`、`src/meta/systems/forge.ts`、`systems/forgeOps.ts`、`src/meta/shell/weaponIcons.ts`（退役）、`src/render/WeaponCodexPage.ts`（已删除）、`weapons-codex.html` + `src/codex-main.ts`（已删除）、`vite.config.ts`（旧多页入口已删除）、`tests/unit/metaForge*.test.ts`、本任务书 |
| 共享（台账登记） | `src/meta/shell/gameMain.ts`（注册 `#weapons` 屏 + PAGE_TITLES）、`src/meta/shell/screen.ts`（`ScreenName` 加 `'weapons'`）、`src/meta/state/schema.ts` + `state/save.ts`（**武器 id 迁移，顺序在窗口 N 之后**）、`src/meta/gateway/**`（端点）、`src/meta/systems/battleBridge.ts`（武器快照字段） |
| 只读 | `design/ux-audit/**`、`public/gowhead-icons/**`、`src/data/weapons.json` |
| 不碰 | `src/meta/shell/styles/**`（L 独占——需要样式向 L 提需求）、其它窗口的屏 |

## 2. 批次

### 批次 0 · 热修（可在 L 之前做，只改可达性，不改视觉）

| 编号 | 问题 | 修法 |
|---|---|---|
| **H-2** | 武器库「装备」按钮永远在弹层外（`margin-top:auto` 推到 y=1416 / 可见底沿 772，**换武器 0% 可用**） | 动作区改弹层底部固定条（`position:sticky; bottom:0` 或 grid 独立行）。样式在 L 的领地 → 与 L 协调：这条属于 `DESIGN-SYSTEM.md` §3.4「滚动三禁则②」，**由 L 在批次 2 一并修**，你负责 TS 侧结构配合与回归断言 |
| **H-1** | 20 把里 8 把完全点不着、12 把裁一半、滚轮无效 | 同上，属禁则①，L 批次 2 修；你负责断言：复跑 `artifacts/ux-audit-scripts/u3-probe.mjs`，`fullyUnreachable` 必须为 **0** |
| **H-3 局部** | `WEAPON_ICONS` 缺 `mace/tome/shield/ring` 四键 → 7/20 把兜底成长剑（盾锤/法典/宝珠/圣印长同一个样） | 如果批次 1 的官方资产迁移能在同一天落地，**跳过这条**（剪影整体退役）；否则先补四键止血 |

### 批次 1 · 官方美术资产统一（用户已裁定，`05-hero.md` H-3 方向 C）

**裁定口径**：部队与武器贴图**统一使用已拉到本地的 GoW 官方资产**；程序化剪影 `shell/weaponIcons.ts` 退役。

| 步 | 内容 | 关键约束 |
|---|---|---|
| 1 | 盘点映射：20 把 `w_*` → 718 目录武器（`gw_*`）的一对一指认表，落 `src/meta/data/weaponMigration.ts`（或 json） | ① **`weaponType` 必须不变**（天赋条件 `selfStatIfWeapon` 依赖它，`data/weapons.ts:33-37` 注释已点明）；② 稀有度档与"通用 4 把 / 每职业 10 级·20 级毕业各 2 把"的解锁节奏对齐；③ 职业专属武器要保住"毕业武器"的手感（用目标职业所属王国的同类型官方武器） |
| 2 | 存档迁移：`unlockedWeapons` / `equippedWeapon` / `weaponTempering` 三处的 `w_*` → `gw_*` | schema 版本 +1，迁移链；**顺序在窗口 N 的 per-event 迁移之后**（台账协调）；`STARTER_WEAPON_ID` 与 `demo.ts:106` 的淬炼种子同步 |
| 3 | 20 个手写 `SkillPrototype`（`data/weapons.ts:49+`）作废，改用目录 `spellId` 的已编译原型 | `buildMetaRegistry` 已注册目录原型（`TASK-META §8.3`）；注意 12 把 `mana-only` 武器无原型不可进装备池 |
| 4 | `shell/weaponIcons.ts` 退役；所有武器取图统一走 `weaponCatalog.catalogIconUrl(w)` | 并检查 `teamScreen`/`arenaScreen`/`resultScreen` 等处的武器/部队取图是否同源（部队走 `portraitUrl`） |
| 5 | 测试：`metaForge` 系列更新 + 新增迁移用例（旧档 `w_*` 读入后装备关系不丢、淬炼等级跟随、天赋 `weaponType` 条件不变） | — |

**验收**：武器库/熔炉/图鉴三处列表**不再出现两种美术**；`u3-catalog-audit.mjs` 重跑，"剪影兜底"计数为 0。

### 批次 2 · 新屏 `#weapons` 四 tab（UX-3 主体）

线框见 `05-hero.md` 的武器库提案 + `07-weapons-codex.md` C-1 提案。要点：

| tab | 内容 | 对应编号 |
|---|---|---|
| 我的武器 | 已拥有（`unlockedWeapons`），可装备/可淬炼；分母诚实（不再是假的 `5 / 730`） | H-4 |
| 全部 | 718 把目录（图鉴），**筛选器重做**：六枚带计数下拉 + 已选汇总条（可单条 ✕）+ 清除全部 + 空态；顶部占高从 240px（26.7% 视口）压到 ~76px；搜索**纳入法术文本与词缀**（现在搜「中毒」0 命中而数据侧有 9 把）；新增「拥有状态」「获取途径」两维；删「绑定/保真度」维度（开发口径） | C-2、C-3、C-4、C-5 |
| 熔炉 | 9 条配方，tile 分四态（可造/材料差 N/等级未达/已拥有），显真稀有度而不是「Tier 1」 | F-2、F-5 |
| 淬炼 | 已拥有且未满级的武器（进度条 `▮▮▮▯▯ 8/20`），本级消耗 + 词缀解锁预告 | **F-3（当前零入口）** |

**共用详情组件**（三份报告的 P0 在这里收口）：目录采用固定分页，不使用瀑布长滚动；武器详情是外壳顶栏/底栏之间的次级视图，左侧只放大立绘、稀有度描边与图鉴同色的**攻甲血魔**，右侧突出法力消耗、技能全文（复用 `shell/spellText.ts`）和词缀。锻造/淬炼的等级门槛、消耗、持有量与缺口不得挤在详情页，统一进入独立的准备页，并保留固定操作栏。
逐项数据可取性已在 `06-forge.md` 的表里核过：**9 项现成、2 项一行级补搬（`weaponCatalog.ts:83` 的 `affixes: []` 与四维字段没搬进 `CatalogWeaponDef`）、真缺源 2 项**（w_* 四维——批次 1 迁移后消失；词缀战斗语义是 F4 未做，面板要如实标注）。

**入口改造**：`heroScreen.ts` 的旧 `window.open('/weapons-codex.html','_blank')` 已改为壳内路由（H-10/C-1）；英雄页 slab 的「武器库」「武器图鉴」按钮均进入 `#weapons/owned` 或 `#weapons/all`，不再打开独立网页。

### 批次 3 · 英雄页收拾（UX-12 的武器侧）

| 编号 | 问题 | 修法 |
|---|---|---|
| H-5 | 武器详情不给任何属性 | 随批次 2 的共用详情组件解决 |
| H-6 | 左侧四维不含淬炼加成，换武器后数字不动，**与战斗里的数字不一致** | `systems/hero.ts` 的 `heroStatsOf` 纳入淬炼面板加成，`battleBridge.ts` 直接复用同一口径；武器目录的攻/甲/生/魔目前是**详情展示字段**，不擅自接入战斗平衡，待单独数值裁定后再接线 |
| H-7 | 「职业圣殿」标题下装的是「职业特质」；38 职业首屏无身影；DOM 里还躺着两份 `display:none` 的同名面板 | ✅ `heroScreen.ts` 三份特质板收敛为一份；圣殿分区显示当前职业与已解锁职业预览 |
| H-8 | 一屏三种「Lv.」互相打架（主角/冠军/解锁档位，无一处标注） | ✅ 主角等级、职业等级、天赋解锁档位统一使用「主角等级 / 冠军 Lv.X」口径 |
| H-9 | 武器来源印三次且自相矛盾（目录武器同屏既写「熔炉锻造获得」又写「主角 Lv.1 解锁」） | 来源口径收口到一处（`heroScreen.ts:638-643,923`） |
| H-12 | 天赋树把「未实现」徽标直接示于玩家 | ✅ 改「暂未开放」并锁掉不可用档位；玩家视图不泄露「未实现」或裸 `PvP` |
| F-4 | 同一把武器在熔炉与武器库叫两个名字（9 配方里 6 个不一致） | `data/soulforge.ts` 删 `name` 字段，改由 `weaponCatalog.anyWeaponById(id).name` 单源 |
| F-6 | 锻造按钮不给余额对比/缺口/二次确认，且被裁一截 | 消耗三段式（消耗/持有/缺口）+ 高价配方二次确认（自绘，不用 `confirm()`） |

## 3. 验收标准

1. **换武器可用**：任选一把武器 → 装备成功；`u3-probe.mjs` 的 `btnVisibleInSheet` 为 true、`hitTest` 命中按钮。
2. **列表可达**：`fullyUnreachable = 0`；我的武器与全部图鉴每页最多 12 项，以页码和上一页/下一页切换，不使用瀑布长滚动。
3. **美术统一**：三处列表零剪影、零兜底长剑；`u3-catalog-audit.mjs` 剪影计数 0。
4. **配方详情信息完整**：11 项信息层级逐项在屏（缺源两项要如实标注），且**没有一项被图盖住**（复跑 `u3-probe3.mjs`，`coveredBy` 必须为空）。
5. **筛选器可用**：组合筛选 + 计数 + 清除 + 空态 + 搜法术文本命中（搜「中毒」应得 9 把）。
6. **淬炼有入口**：从材料库的「去向：英雄页武器淬炼」能走到淬炼 tab 并真的淬一级。
7. `weapons-codex.html` / `codex-main.ts` 已删除且 `vite.config.ts` 入口同步清理；排除 `design/ux-audit/**`、`tasks/reference/**` 等历史证据后，活动代码 grep 无残留引用。
8. 门槛全绿 + `DESIGN-SYSTEM.md` §4 的 22 条清单逐条通过 + 改前/改后对照截图。

## 4. 工作记录（新记录追加在顶部）

| 日期 | 批次 | 内容 | 验证 |
|---|---|---|---|
| 2026-09-21 | **批次 8 · 武器详情布局 + 官方解锁接线 + 顶栏图标** | 详情右栏改为身份 / 获取途径 / 技能 / 词缀四层，技能标题改用法术星标不再误用魔力球；淬炼词缀改为单列卡片（效果图标 + 名称描述 + 淬炼档位），去掉两列叠字。官方 gowhead `MasteryRequirement` 接到可玩路径：2~50→主角等级领取，1002→38 把职业神话（王国 1:1），熔炉白名单仍走锻造，其余按王国 8 关或灵魂直购；718 把不再显示「暂无获取途径」。顶栏五枚货币与背包/设置换成文生图轻量图标，荣耀不再复用交叉剑。 | 单测 `weaponAcquire.test.ts`；`weaponsVisual.spec.ts` 增词缀不重叠与领取；截图 `weapons-detail-affix-1600.png`。 |
| 2026-09-21 | **用户更正 · 英雄页天赋路径加回主页面** | 批次 6 为「塞进一屏」把主页面底部 `.talent-board`（7 档解锁摘要）删掉，只留圣殿标题上的「天赋树 n/7」入口；完整 21 格仍在次级页。用户否决：桌面圣殿下方本来就有空位，**解锁展示必须留在主页面**，不得为不滚动而拿掉。已恢复「天赋路径」七档节点（已选 / 下一档可配 / 未解锁等级），点节点或「查看完整天赋树」仍进原 21 格次级页；桌面 1600×900 铺在圣殿下方剩余高度里、`hero-info` 不滚动。其它英雄页改动未动。 | 浏览器 1600：7 节点、`2 / 7`、无内部滚动、`overflow-y:hidden`、路径在圣殿下方且底沿不溢出；点第三档打开 21 格树。768/390 路径仍在主页面，窄屏节点条内部横滑、页面不横向溢出。截图 `artifacts/ux-phase-b/shots/hero-talent-restore-{1600,768,390}.png` 与 `hero-talent-restore-tree.png`。 |
| 2026-09-21 | **批次 7 · 用户否决后重做武器目录/详情层级（覆盖批次 5 的同屏账本方案）** | `owned/all/forge/temper` 保留固定 12 项分页；详情改为仅占外壳内容区的全幅次级视图，不再盖住顶栏/底栏。左栏放大官方立绘并在图下使用金/银/红/紫四维，右栏以大字号技能区为主体；详情页移除锻造/淬炼密集账目。锻造与淬炼分别进入独立准备页，以大资源行逐项显示需求、持有、缺口及主角等级门槛，并保留真实锻造/淬炼动作、返回与关闭。桌面默认不产生详情内滚动，窄屏只允许中间内容区单层滚动。 | `weaponsVisual.spec.ts` **5/5**：验证 22/718 条目录分页、详情不越过外壳、立绘/四维/技能层级、详情无材料账本、准备页四列资源与等级缺口、真实淬炼，以及 1600/768/390 无横向溢出和属性内容不挤出。`tsc --noEmit` 与目标 ESLint 通过；截图见 `artifacts/ux-phase-b/shots/weapons-{detail,temper,forge-requirements,upgrade}-final-*.png`。 |
| 2026-09-21 | **批次 6 · 英雄页商业级视觉终验（H-6/H-7/H-8/H-12）** | 主角立绘与身份/四维拆为独立上下区域，页面信息不再覆盖立绘；攻/护/生/魔增加可见标签，淬炼增量和“已计入淬炼 Lv.X”口径直接上屏。职业圣殿明确区分当前职业、其他已解锁职业和当前职业特质，不再重复展示当前职业；主角等级、冠军等级和天赋门槛继续使用各自限定词。不可用天赋/特质锁定并统一显示“暂未开放”，不再展示未落地效果或 `PvP` 开发口径。英雄页在 768/390 使用原生响应式舞台，主角卡、武器区、职业区和天赋区按可读尺寸重排，天赋树在手机端使用双轴次级页面。 | `heroVisual.spec.ts` **4/4**（1600/768/390、立绘/信息分离、H-6/H-7/H-8/H-12 断言）；`metaHero.test.ts` **22/22**；目标 ESLint、`tsc --noEmit`、`git diff --check` 通过。截图见 `artifacts/ux-phase-b/shots/hero-final-{1600,1600-progress,768,390,390-career}.png` 与 `hero-final-tree-{1600,390}.png`。 |
| 2026-09-21 | **批次 5 · 熔炉/淬炼工作台商业级视觉收口** | 熔炉配方按活动武器/珍藏配方组织，候选卡使用官方武器图和稀有度边框；详情以大图、身份/法术/四维和锻造账目分区，逐项显示需要、持有、剩余或缺口，等级门槛不再泄露 Tier 开发术语。淬炼展示当前等级、下一词缀、材料与黄金余额，材料不足时禁用并给出具体缺口；高价配方确认明确写消耗与所得。四 Tab 在小于 1400px 时使用原生尺寸，390/768 候选横向浏览且操作条不盖武器图。 | `weaponsVisual.spec.ts` **5/5**（熔炉/淬炼及 owned 22 / all 718 回归）；ESLint、`tsc --noEmit`、构建、`git diff --check` 通过。桌面/390/768 与淬炼详情截图见 `artifacts/ux-phase-b/shots/{forge-redesign-*,temper-redesign-*}.png`。词缀战斗语义仍按既有二期口径标“暂未开放”，本批未伪装为已接入。 |
| 09-20 | **批次 4 · 英雄页口径收口（H-6/H-7/H-8/H-12）** | `heroStatsOf()` 与 `battleBridge` 统一读取淬炼面板加成（每 2 级按攻/甲/生/魔轮转），避免战斗快照重复计算；英雄页主角/冠军等级文案统一；职业圣殿补当前职业与已解锁职业预览并删除两份旧隐藏特质板；不可用天赋/特质统一显示「暂未开放」并锁定，不向玩家泄露「未实现」或裸 `PvP`。武器目录攻/甲/生/魔仍仅作详情展示字段，战斗是否生效留待独立数值裁定。 | `tests/unit/metaHero.test.ts` 22/22；`npm run lint`；`npx tsc --noEmit`；浏览器探针待补，完成后再标视觉验收 |
| 09-20 | **批次 3（旧 Codex 退役）** | 删除独立入口 `weapons-codex.html`、`src/codex-main.ts` 与旧实现 `src/render/WeaponCodexPage.ts`；从 `vite.config.ts` 移除 `weaponsCodex` 多页构建入口。队伍主角详情的“图鉴”改进入 `#weapons/owned`；保留审计/参考文档中的旧路径作为历史证据，运行时统一走 `game.html#weapons` 四 Tab。 | 活动代码精确 grep 无 `weapons-codex` / `codex-main` / `WeaponCodexPage` / `weaponsCodex` 残留；`npx tsc --noEmit`、相关 lint、全量 Vitest（126 文件 / 1676 项）、`npm run build` 通过。Playwright 路由探针：`all=718`、`owned=22`、`forge=9`、`temper=22`；英雄页进入 `#weapons/all`、队伍主角详情进入 `#weapons/owned`，无 console/page error；`dist/` 无旧 Codex HTML/chunk。 |
| 09-20 | **批次 2（屏本体）** | 新增可接入的 `WeaponsScreen`（`src/meta/screens/weaponsScreen.ts` + `weaponsScreen.css`），以 `#weapons` 为目标路由、支持 `owned` / `all` / `forge` / `temper` 初始 tab。四 tab 共用官方卡面详情：拥有/装备状态、稀有度边框、法力与四维、法术求值文本、词缀解锁、来源、淬炼进度与材料缺口；全部 tab 的搜索覆盖名称/王国/角色/法术/词缀，筛选含稀有度/类型/法力色/拥有状态/获取途径/排序，带汇总条、清除和空态。装备、锻造、淬炼均通过 `MetaGateway` 写入并刷新顶栏；熔炉卡区分「已拥有 / 需主角 Lv.X / 精确缺 N 魂或金 / 可锻造」，详情补充消耗/持有/缺口对账，高价配方采用屏内二次确认。屏样式独立注入，不改共享 `gameMain.ts` / `screen.ts` / `vite.config.ts`。 | `eslint src/meta/screens/weaponsScreen.ts` 通过；Vite 构建通过；路由接入后 Playwright 1600×900 实测：`owned` 22 卡、`all` 718 卡、`forge` 9 配方、`temper` 22 卡，官方图无 console error，列表/详情列可独立滚动；搜「中毒」命中 27 把，去熔炉和真实淬炼按钮均可用。`npx tsc --noEmit` 全部通过；全量 Vitest 126 文件 / 1676 项通过。 |
| 09-19 | **批次 1 + 批次 0**（合并落地） | **武器 id 空间统一到 `gw_*`，并顺手修掉四条被 CSS 卡死的 P0**。<br>① **假数据整表退役**（用户裁定）：`WEAPONS` 20 条自造武器 + 20 个手写 `SkillPrototype` + `weaponRarity()` 解锁档推导 + 职业专属武器体系（`classId`/`unlockLevel` 门槛）全部删除；`WeaponDef` 收敛为**唯一形状**（原 `CatalogWeaponDef extends WeaponDef` 两套合一，后者降为别名）。<br>② **起始池 22 把**：Common 7（`gw_CrudeClub` 是 mana-only 占位，排除）+ Uncommon 15，零解锁条件、**隐式拥有**（不写存档，由 `ownedWeaponIds()` 并入 → 存档不膨胀、老档自动获得）。前六把是官方开局武器，六法力色 × 六类型一一对应；类型覆盖 11 种。`STARTER_WEAPON_ID` = `gw_KnightsSword`。<br>③ **退役映射** `LEGACY_WEAPON_REMAP`（20 条 → 起始池同类型武器，3 把无同类型的回落）+ `resolveWeaponId()`：老档在 schema 迁移落地前也能正确解析与去重，不会出现「训练长剑」与「骑士之剑」两张卡指向同一把武器。<br>④ **适配层补搬**：`attack/armor/health/magic`（718/718）、`affixes`（710/718，此前 `weaponCatalog.ts:83` 写死 `[]` 全丢）、`role/roleName/masteryRequirement`；新增 `ALL_CATALOG_WEAPONS`（全量 718，供「全部」tab 浏览）与 `CATALOG_WEAPONS`（装备池 703）。<br>⑤ **修一条真 bug**：`classes.json` 的 `selfStatIfWeapon` 用 `relic`（8 次），官方数据用 `Artifact`（65 把），旧实现只 `toLowerCase()` → 这 8 条天赋对 718 把里**任何一把都不生效**。新增 `normalizeWeaponType()` 归一。<br>⑥ **剪影退役**：删 `shell/weaponIcons.ts` + `screens.css` 的 `.wp` 系死样式，取图唯一出口 `catalogIconUrl`。<br>⑦ **CSS 四条 P0**（L 废弃后样式归 M）：**H-1** `.vault-rack` 给 `overflow-y:auto` + 自然行高（原 `grid-auto-rows:1fr` 无滚动容器）；**H-2** 装备按钮改 sticky 底部操作条（原 `margin-top:auto` 被顶到 y=1416，可见底沿 772）；**F-1** `.detail-art` 容器高 196px + 删掉 `aspect-ratio:1` 覆盖 + 显式行轨 `minmax(0,1fr)` 解开「行高由图定、图高由行定」的循环；**F-7** 同 H-1。顺修详情列改可滚后 `flex-shrink` 压扁子项导致公式条溢出盖住来源行与按钮（`.vault-detail > * { flex:none }` + 操作条 z-index 6 > 法术面板 4）。<br>⑧ 顺带 **H-4** 分母诚实（拥有 22 / 目录 718，不再是假的 5/730）、**H-9** 来源印三次且自相矛盾 → 收口到一处且按真实途径回答、**F-4** 熔炉名改目录单源、**F-5 局部** tile 稀有度位显真稀有度（不再是 Tier 1/2）、**H-5** 四维与词缀上屏（词缀如实标注「二期生效」）。 | **单测** 136/136 绿（12 文件：metaHero 重写 9 例、metaForgeOps/metaSaveV2/metaBattleBridge 适配）；**lint** 64 文件零 error。<br>**浏览器回归** `artifacts/ux-phase-b/m-b1-regress.mjs` → **31/31 通过**（结果 `m-b1-regress.json`），逐条把阶段 A 的坏数值打成断言：`fullyUnreachable 8→0`（改用「逐块 scrollIntoView 后可见且命中自己」的真可达性口径）、`rackScrollable false→true`、滚轮 `0→571`、滚到顶/底截图字节不同（阶段 A 两图字节完全相同）、`btnVisibleInSheet false→true`、`hitTest null→BUTTON`、真实点击换武器成功、配方详情四行 `coveredBy IMG→零遮挡`、卡面图 `337px→194px ≤ 容器 196px`、熔炉名 9/9 = 目录官方名、console 零错误。<br>**截图** `artifacts/ux-phase-b/shots/m-b1-*.png`（武器库常态/滚到底/详情/熔炉列表/神话配方详情）。<br>**并发说明**：共享工作树被窗口 N（events 域在途、不可编译）与 P（`render/TeamView.ts` 语法错误在途）打挂，`tsc`/全量测试在本窗口无法作为门槛；浏览器验证在隔离 worktree（HEAD + 本批文件，端口 5192）完成，不占 5180。 |
# 当前状态（2026-09-21）

官方武器数据、旧武器库可达性与 `#weapons` 四 Tab 均已接入；目录已改为固定分页，详情与锻造/淬炼准备页已按批次 7 拆层。批次 8 已把官方 `MasteryRequirement` 接到可领取/可购买路径（不再大面积「暂无」），并重排详情：技能改用法术图标、词缀单列带图标、顶栏换成文生图货币图标。批次 5 的“详情内同时展示锻造账目”视觉方案已被用户否决，不再作为当前实现依据。**英雄页主页面必须保留底部「天赋路径」七档解锁摘要**（完整 21 格仍走次级页）；批次 6 为塞进一屏删掉该展示的做法已否决，不得再拿掉。旧独立 Codex 已退役；武器目录攻/甲/生/魔当前只作详情展示，未经数值裁定不接入战斗，词缀战斗语义仍属于二期。

