# 任务书 · 窗口 P：战斗层 + 结算屏 + 竞技场 + 入侵

> 必读：`TASK-UX-PHASE-B.md`（总纲）、`design/ux-audit/pages/15-battle.md`（B-1~B-11 + 施法三段式线框 + tooltip 体系表）、`14-result.md`（R-1~R-9 + 上账动线线框）、`09-arena.md`（A-1~A-9 + 决策信息表）、`12-invasion.md`（I-1~I-9 + 对手卡线框）、`design/ux-audit/DESIGN-SYSTEM.md`、`PARALLEL-WORK.md`（台账）。
> **前置**：`src/render/**` 与 meta 域零交集，**批次 1（战斗层）可与窗口 L 完全并行**；`arena.css`/`result.css` 的视觉迁移等 L 批次 2。

## 0. 目标

- **战斗层**：补上"看得懂 / 敢下手 / 知道发生了什么"三件事（附录 A 阶段 2/3 的遗留项在这里收口）。
- **结算屏**：空态谎报胜利、两张空立绘框、假的主行动按钮、"再战"不再战。
- **竞技场 / 入侵**：站位 0% 可用（A-1）、决策信息为零、两处错误文案、PvP 结算只有一条 toast。

## 1. 所有权

| 范围 | 文件 |
|---|---|
| P 独占 | `src/render/**`（`TeamView.ts`/`App.ts`/`CharacterDetailPanel.ts`/`GameOverPanel.ts`/`statusTooltip.ts`/`CellPicker.ts`/`TargetPicker.ts`）、`src/meta/screens/resultScreen.ts`、`arenaScreen.ts`、`invasionScreen.ts`、`src/meta/shell/battleLauncher.ts`、本任务书 |
| 共享（台账登记） | `src/meta/shell/styles/arena.css`/`result.css`（**L 独占** → 你提需求、L 改，或 L 交付后经登记改）、`src/meta/systems/invasion.ts`/`arena.ts`（导出读模型）、`src/meta/gateway/**` |
| 只读 | `design/ux-audit/**`、`src/engine/**`、`src/session/**`（本阶段不动引擎与契约；确需扩展先在台账提案） |
| 不碰 | 其它窗口的屏；`src/meta/shell/styles/**` 里非 arena/result 的文件 |

## 2. 批次

### 批次 0 · 热修（三条，独立提交）

| 编号 | 问题 | 修法 |
|---|---|---|
| **A-1** | **竞技场站位 0% 可用**：`.run-slot .shift{pointer-events:none}` + 容器 `aria-hidden="true"`，逻辑全好、点击到不了；而页面写着「▲▼ 调整站位」 | `arena.css:463-472` 删 `pointer-events:none`（L 领地 → 登记协调）；`arenaScreen.ts:289` 删 `aria-hidden`；按钮尺寸 22×16 → 32×32 图标钮 + 光标手型 + hover 态。**断言**：复跑 `u5-arena-invasion.mjs`，`▲▼ 命中测试` 的 `topElement` 必须是按钮本身（现在是 `slot-body`）、`站位 before → after` 必须变化 |
| **I-1** | 青铜玩家被告知"你在**顶端联赛**只升不降"（`relegate:0` 的两种含义被写成一句） | `invasionScreen.ts:107` 按 `league === 9` 判顶端、`relegate === 0` 判底层，两句分开 |
| **I-2** | 规则条公示**合同层拿不到**的「4 消加分」（`TASK-META §6` 开放问题 2 已登记） | 删「4 消」整词，改写实际三项（速胜/存活/额外回合）的真实数值表 |

### 批次 1 · 战斗层（与 L 并行，这批是本窗口的主体）

| 编号 | 问题 | 修法要点 |
|---|---|---|
| **B-1** | **2026-09-21 用户最终裁定覆盖此前所有卡面重排方案**：战斗卡无需重新设计，恢复第一次 B 阶段改动前的原卡面 | 以 `60e7cbc` / `shots/before-battle-card.png` 为视觉基准；不显示角色名、首回合浮名或常驻 `N/M`，不得再重排原有常驻信息 |
| **B-2** | 此前纠偏误删右上角魔力与左侧特质，并擅自把攻/护/生改为三色纵排 | 恢复原信息组合与位置：左上为施法充能宝石，右上为**技能强度魔力值**，左侧为三枚特质，底部为原攻/护/生同排样式；不得把右上魔力误当施法消耗，也不得删除特质 |
| **B-3** | **法力未满短按零反馈**（代码注释自己写着"可留作提示"） | 未满给「还差 N 点法力」浮窗 + 卡片摇一下；非我方回合给「等待对手行动」 |
| **B-4** | **施法无确认、无预览、无效果摘要**——释放后整个战斗层的文字只有六组数字 + `TURN 01` | **三段式**（线框见 `15-battle.md`）：①可释放提示 ②确认层（技能名 + **求值后**全文 + 目标预览 + 释放/取消，设置里可关但**默认开**）③效果摘要条（逐条列伤害/治疗/状态/召唤，数据就是 `session.resolve` 返回的事件流，已在手） |
| **B-5** | 短按=施法 / 长按=详情，**页面零说明**，两者只差 475ms，误触代价不对称 | 首战一次性引导 + 长按按压进度反馈 |
| **B-6** | 可释放态只有卡框亮度 +18% + 宝石呼吸，无显式信号；与"沉默放不出"共用一套视觉 | 加显式标记（宝石打「!」或卡框流光）；与 `pulseManaReady` 合并口径 |
| **B-7** | 状态徽记在移动横屏缩到 **17×17px**（桌面 37×37），而它是本页唯一"可点内容"，点偏就是**误放技能** | 徽记设最小 24px 下限；不足时改"状态条折叠 → 一次点开全部状态" |
| **B-8** | 状态说明**双轨**：原生 `title`（名字 + 回合）与自绘浮层（机制 + 当前数值）内容不一致，且徽记可点没有任何暗示 | 自绘可用时移除 `title`；状态、法力角标与卡面特质共用统一浮层；`STATUS_DESCRIPTIONS` 提共享模块（与图鉴/编队同源） |
| **B-9** | 胜负面板**零战果**（只有大标题 + 英文 + 继续），且要等 900ms 静默才弹 | 面板内给回合数 / 存活人数 / 战斗内收集（数据在 `exportResult()`）；900ms 期间给过渡而不是静默黑屏；组件仍不做导航 |
| **B-10/B-11** | 详情面板不列**当前状态**、无"释放"出口、`未生效` 开发口径外泄；选择层无文案、Esc 可用但不告知 | 面板加"当前状态"区（`char.statuses`）；`未生效` 改玩家口径；选择层加一行「选择一枚宝石以决定法术颜色 · Esc 取消」 |

### 批次 2 · 结算屏（等 L 批次 2，视觉迁移随之）

| 编号 | 问题 | 修法 |
|---|---|---|
| **R-1** | **空态谎报胜利**：`paint()` 在 `detail == null` 时 return，HTML 默认值「胜 利 / VICTORY / +0 XP」裸奔（刷新后停在 `#result` 就会撞上） | null 分支画空态「暂无战报 · 去世界地图打一场」，四块整体隐藏；模板默认值改中性占位 |
| **R-2** | **两张立绘框 `src` 永远是 null**（`#sumArt` 侧栏王国图、`#dropArt` 任务部队奖励卡） | `#dropArt` 走部队立绘（与图鉴/战斗卡同源 `portraitUrl`）；`#sumArt` 一期用王国纹章，二期换战斗终局截帧（`TASK-META §6` 开放问题 1） |
| **R-3** | 主行动位被**禁用的假按钮**「已入账」占着（还给 disabled 按钮绑了 click） | 改状态章「奖励已自动入账 ✓」；主行动位交给真实来源返回 |
| **R-4** | 「返回地图再战」与「返回地图」**是同一个动作**（都 `navigate('#map')`），而"再战"没实现 | 当前批次先把主行动位改成诚实的来源返回文案（地图/活动/竞技场/入侵），不再宣称重放；真正按 `source.kind` 携带 kingdom/node/tier 重放仍待 `battleLauncher` 接入 `ResultMeta` |
| **R-5** | **竞技场与入侵不走结算屏**，战果只有一条 toast；入侵的 `bonuses`（注释写着"结算展示"）没人读 | 两条路径接入结算屏（`sourceLabel` = `ARENA RUN` / `INVASION · 青铜`），入侵逐项列 base + 速胜 + 存活 + 额外回合 + 血怒 ×2 |
| **R-6~R-9** | 素材行全用同一个 `orb` 图标、特质石不显色 / 任务部队奖励用 `note` 当名字且稀有度硬编码 `r-rare` / 「结算说明」写 `BattleResult.economy` / 职业经验只是一行小字里的英文 id | 逐条见 `14-result.md` 修法指针 |

### 批次 3 · 竞技场（A-2~A-9）

- **A-2**：3 选 1 卡面补四维 + 技能名（选中态展开技能全文，复用 `shell/spellText.ts`），并**警告与已锁定卡的法力色重合**（3 人队同色是最常见的自杀式构筑）。数据全现成（`getTroopById` 已在手、`troopStatsAtLevel`、`troop.spell`）。
- **A-3**：本届战报（走结算屏或页内战报卡）——打满 3 胜要有配得上 12,000 金的画面。
- **A-4**：三战之路给对手阵容预览（种子化确定，出战前可算）。
- **A-5**：弃赛的原生 `confirm()` 改自绘 + 写明"当前 N 胜 → 黄金 X"；两个入口收敛为一个。
- **A-6~A-9**：奖表 tag 重复两遍 / 免费票周重置无倒计时 / 三步指示器可点却无绑定 / 「已锁定」空槽无进度语义 + 两套卡片语言。✅ 已落：奖表改为单一档位标签并按 3→0 胜展示；票区显示周一 0:00 重置及剩余时间；三步条改为非交互进度语义；锁定槽显示 `x/3`、序号、待选态与六档稀有度边框，连战槽复用同一稀有度色阶。

### 批次 4 · 入侵（I-3~I-9）

- **I-3**（核心，09-20 用户新指令覆盖旧五候选方案）：主屏固定三选一；每张卡以四张防守立绘为主体，姓名/阵级/等级在立绘下方，预计 VP 和出击在卡底。浏览卡不出现攻/护/生/魔小数值；我方队只留名称/人数/平均等级和调整入口。
- **I-4**：玩家进前 10 时**榜单画两遍玩家行**（`invasionScreen.ts:116` 末尾追加改条件渲染）。
- **I-5**：完整 30 人榜单独立到 `#invasion/standings`，用晋级/降级横线标出分界，玩家行只出现一次。主屏不显示榜单；官阶总览、VP 规则分别在 `#invasion/ranks`、`#invasion/rules`。
- **I-6**：三名今日候选每天 00:00 更新；`save.invasion.battles` 是赛季累计而非每日限次，不得错误写成“今日已战 x/3”。
- **I-7**：结算加分构成（已随 R-5 一起落地；保留真实结算截图作为最终验收证据）。
- **I-8**：锁态保留等级进度、经验来源和 `#map` CTA；原十级数字阶梯已按用户意见撤下，页面只预告一枚青铜官阶徽记，完整官阶留给解锁后的次级页。
- **I-9**：主屏三张等宽候选卡、唯一推荐实底 CTA、其余描边 CTA；当前官阶有独立徽记及名次/VP 摘要。手机和平板按真实像素布局，推荐候选排在轮播首张，前后按钮与页码、手势滚动同步；1024~1399px 窄桌面不整体缩放。

## 3. 验收标准

1. **战斗层**：法力未满短按有反馈；施法有确认层与效果摘要；卡面严格保持 `before-battle-card.png` 的原始信息布局（左上充能宝石、右上技能强度魔力、左侧特质、底部原攻/护/生），不显示姓名或常驻 `N/M`；移动横屏状态入口 ≥24px 且点入口不会误放技能；胜负面板有战果。
2. **结算屏**：直链 `#result` 不再谎报胜利；两张立绘有图；「再来一场」真的重打同一来源；竞技场/入侵的战果进结算屏且入侵列出加分构成。
3. **竞技场**：站位能调（A-1 断言）；draft 卡能横向比较（四维 + 技能名 + 同色警告）。
4. **入侵**：首屏只呈现三名对手、当前官阶和当前队伍，立绘不被攻/护/生遮挡；30 人榜单与十级官阶只在次级页；锁态只有起始徽记；390px 三候选可翻页、320px 短屏可滚动到出击、768px 平板和 1280px 窄桌面不整屏缩小；文案不再出现错误的“顶端联赛”和“4 消”。
5. **一个遗留的诚实记录**：阶段 A **没拍到带真实明细的结算屏**（自动交换打不完一局：345 次尝试 / 22 分钟成交 22 步）。本窗口开工后**请补一张真机结算截图**（可用调试钩子直接结束对局），并顺手把 `shots/result-05-gameover-panel.png` 这个名不副实的文件改名或重拍。
6. 门槛全绿 + 22 条清单通过 + 四页改前/改后对照截图。回归断言复跑 `u5-arena-invasion.mjs`、`u5x-probe.mjs`、`u5-battle-standalone.mjs`、`u5x-card.mjs`。

## 4. 工作记录（新记录追加在顶部）

| 日期 | 批次 | 内容 | 验证 |
|---|---|---|---|
| 2026-09-21 | **批次 11 竞技场 / 结算英文复读清理** | 按最新全局文案口径删除竞技场与结算页中只复读中文标题或状态的英文眉题：`WEEKLY DRAFT ARENA`、`ENTER THE ARENA`、`DRAFTED TEAM`、`ARENA RUN`、`CURRENT OPPONENT`、`BATTLE REPORT`、`VICTORY/DEFEAT`、`BATTLE SUMMARY`、`MATCH RESULT`、`INVASION REPORT` 等。选牌轮次改为有效中文信息「第 x / 3 轮」，胜负、当前战次和连战状态继续由既有中文主标题 / 状态栏表达；同步删除结算响应式网格为英文眉题预留的空行。 | `tests/e2e/arenaUx.spec.ts` **6/6**、`tests/e2e/resultUx.spec.ts` **5/5**，覆盖桌面 / 768 / 390 响应式与禁用词断言；截图 `artifacts/ux-phase-b/shots/pvp-arena-*-{desktop,responsive}.png`、`artifacts/ux-phase-b/result-rich-{desktop,mobile}.png`；定向 ESLint、`metaResult.test.ts` **3/3**、`git diff --check` 通过。 |
| 2026-09-21 | **批次 10 战斗卡原样恢复（最终裁定）** | 用户明确要求回到第一次改战斗信息之前；以 `60e7cbc` 和 `shots/before-battle-card.png` 为基准恢复右上技能强度魔力、左侧三特质及底部原攻/护/生。保留左上充能宝石、状态说明、施法确认等独立交互；不恢复角色名、浮名或常驻 `N/M`。**本条覆盖批次 9 的卡面信息与视觉结论。** | `battleUx.spec.ts` **3/3**（667×375 3v3/4v4、1600×900）；`statusTooltip.test.ts` + `battlePrefs.test.ts` **4/4**；截图 `shots/restored-battle-{card,full,mobile-740x400}.png` 与原基准一致。全局 `tsc` 当前仅余武器页在途的 `detailMode` 未读取，与本回退无关。 |
| 2026-09-21 | **批次 9 战斗卡视觉纠偏（已被批次 10 覆盖）** | 曾删除角色名、常驻 `N/M`、魔力面板值与特质并重排三围；用户否决该方案，代码与验收口径均已回退，不再作为当前实现依据。 | 历史截图 `shots/battle-card-clean-*` 仅作反例，不作为验收证据。 |
| 2026-09-21 | **批次 8 结算页真响应式** | `#result` 注册独立 `result-responsive` 舞台策略；768/390px 不再缩放 1600×900 桌面画布，改为原生视口单列滚动。胜负与奖励保持首屏优先，王国摘要后置；手机长奖励列表使用页面滚动。R-4 同来源真正重放仍未实现。 | `tests/e2e/resultUx.spec.ts` **5/5**，并断言舞台宽度等于视口且 `transform:none`。 |
| 2026-09-21 | **批次 7 战斗本体复审收口** | 复审修正首轮“B-1~B-11 全条完成”的过早结论：**B-1** 紧凑卡名字浮现改到布局完成后触发；**B-4** 确认层在遮罩上方描出手选候选和自动目标，列目标姓名/范围，Enter 遵循实际焦点，跳过确认改为持久偏好并在设置页提供恢复入口；**B-5** 指针越过容差立即撤掉按压环；**B-7** 极限尺寸无论 1~3 个状态都收成单一“状态 N”入口，普通紧凑卡在徽记过密遮立绘时也汇总；**B-8** 状态/特质/法力统一为同一自绘浮层，首次状态入口有一次发现动效，机制文案抽到 `src/data/statusDescriptions.ts` 作为纯数据共享源；**B-9** 零掉落仍固定显示第三行“本场无额外收集”；**B-11** 选色点到骷髅等无效格时给反馈并保持选择态。补 3v3/4v4 横屏、运行时切桌面、设置偏好、胜负面板和无效选色回归。**诚实遗留**：B-10 的“当前状态”与玩家口径已落，但详情面板直接释放入口尚未定稿；B-6 真实 `status-apply` 截图仍待替换合成沉默态证据。 | 静态构建快照 `skills.spec.ts` **23/23**；`battleUx.spec.ts` + `settingsBattlePrefs.spec.ts` **3/3**；全量 Vitest **130 文件 / 1689 例**；全量 ESLint、`tsc --noEmit`、生产构建、范围 `git diff --check` 通过。667×375 截图：`shots/battle-3v3-667x375-tooltip.png`、`shots/battle-4v4-667x375-status-summary.png`。 |
| 2026-09-20 | **批次 6b 入侵布局精修** | 推荐对手移到移动候选首位；手机增加上一/下一按钮与 `1 / 3` 位置反馈，同步触控滑动；移除主屏重复荣耀数据，手机榜单/官阶/规则收成一行。拉高官方部队立绘、卡名最多两行且离开立绘；入侵路由在小于 1400px 的手机、平板和窄桌面都按真实像素布局，竖屏平板用空余高度放大立绘。完整榜单/十级官阶仍只在次级页，未改战斗规则和其它 Meta 页缩放。 | `invasionUx.spec.ts` **5/5**、竞技场/结算/综合浏览器回归合计 **14/14**；全量 Vitest **127 文件/1682 例**、ESLint、`tsc --noEmit`、构建通过；320/390/768/1024/1280/1600px 截图见 `artifacts/ux-phase-b/invasion-choice-*.png`，`git diff --check`。 |
| 2026-09-20 | **批次 6 入侵三选一视觉重构** | 用户新指令覆盖原五候选同屏/十级阶梯设计：候选池改为 3，首屏仅显示当前官阶徽记、进度、三张立绘对手卡与出战队；移除浏览卡攻/生；完整榜单、官阶、规则进入三个次级路由。锁态仅预告青铜徽记；入侵手机路由跳出固定舞台缩放，采用真实宽度与横向卡片浏览。 | `tests/e2e/invasionUx.spec.ts` 2/2 + `metaLiveScreens.spec.ts` 1/1；`metaInvasion.test.ts` 14/14；桌面/390px 主屏、榜单、官阶、锁态截图在 `artifacts/ux-phase-b/`，最终全量门禁见本批收尾记录。 |
| 2026-09-20 | **批次 5c 结算视觉收口** | 明细与 124×172 官方部队奖励立绘并列，稀有度以卡框表达、卡外仅姓名/稀有度；王国图提亮放大，移除重复的来源/地图按钮。实际重放 R-4 尚未实现，移动端全局缩放仍需单独解决。 | `tests/e2e/resultUx.spec.ts` **5/5**，`metaResult.test.ts` 3/3、ESLint、tsc、`git diff --check` 通过；截图 `artifacts/ux-phase-b/result-rich-{desktop,mobile}.png`。 |
| 2026-09-20 | **批次 5b R-4 文案止血与空明细布局** | 结算主行动位按 `returnHash` 显示真实来源（`返回地图` / `返回活动页` / `返回竞技场` / `返回入侵页`）；后续 5c 已移除重复来源按钮。在真正重放接入前不再显示「再战」。胜利无明细显示「本场暂无额外奖励」，战败才显示「战败保底」；空明细行跨满奖励区。 | 当批 `resultUx.spec.ts` 4/4；5c 更新后 5/5，详见上行。 |
| 2026-09-20 | **批次 5 R-1/R-2/R-3/R-7 结算屏诚实与奖励卡** | **R-1**：`#result` 直链/刷新进入中性空态，隐藏经验、奖励、任务与 PvP 明细，不再沿用「胜利 / VICTORY / +0 XP」模板默认值。**R-2**：结算侧栏按王国主题图显示本地素材，任务奖励卡使用官方部队立绘。**R-3**：移除禁用的「已入账」按钮，改为非交互状态章，主行动位保留给去地图/来源。**R-7**：奖励卡从 `troopId` 解析真实部队名、六档稀有度与边框色（普通无色、精良绿色、稀有紫色、传说亮黄色、史诗暗橙色、神话钻石蓝色），卡面不堆攻/护/生。顺手把结算说明里的 `BattleResult.economy` 改为玩家语言。 | `tests/unit/metaResult.test.ts` 3/3；`npx playwright test tests/e2e/resultUx.spec.ts` 3/3（直链空态、390px 无横溢、真实奖励卡官方立绘/神话边框/无攻护生）；`npx eslint src/meta/screens/resultScreen.ts`、`npx tsc --noEmit --pretty false`、`git diff --check` 通过；console 0。 |
| 2026-09-20 | **批次 3 A-6~A-9 竞技场可读性收口** | 奖表每档只保留一次档位标签并将 3 胜完胜置于首行；免费票区显示「周一 0:00 重置 · 剩余」并在屏幕存活期间每 60 秒刷新；三步指示器由无行为的 `<button>` 改为 `role=listitem` 的进度标记，避免误导为可点击导航；draft 底部锁定牌组显示 `已锁定 x/3`，空槽带待选择序号，已选槽显示姓名/稀有度；竞技场卡边框统一六档映射（普通无色、精良绿色、稀有紫色、传说亮黄色、史诗暗橙色、神话钻石蓝色），连战槽沿用同一色阶。 | `npx eslint src/meta/screens/arenaScreen.ts`、`npx tsc --noEmit --pretty false`、`git diff --check`；`npx playwright test tests/e2e/arenaUx.spec.ts` **3/3**（奖表/周票/进度语义、锁定槽、390px 无溢出） |
| 2026-09-20 | **批次 4 I-9 信息层级** | 候选卡不再让 5 个整行「出击」平权：按预估 VP / 防守评分稳定选出 1 个推荐目标，推荐目标使用唯一实底 CTA 并标注「推荐目标」，其余 4 个为紧凑描边按钮；官阶区将「晋级进度」设为主数字（第 N / 30 + 晋级区/差距/最高官阶说明），本周 VP 与荣耀降为辅助统计；补桌面/390px 探针，保持候选卡和统计区无横向溢出。 | `node artifacts/ux-phase-b/p-i9-hierarchy.mjs`：桌面/移动 `recommended=1`、`secondary=4`、按钮紧凑、进度字号 28px > 辅助 18px、无溢出、console 0；`npx eslint src/meta/screens/invasionScreen.ts`、`npx tsc --noEmit`、`git diff --check` 通过。 |
| 2026-09-20 | **批次 4 I-8 锁态引导** | 入侵未解锁页不再是死路：增加锁态徽记、当前 Lv → Lv.10 解锁进度、明确说明主角经验来自王国任务/探索胜利、`去世界地图打任务` CTA（导航 `#map`），并用 `LEAGUE_COLORS` 展示十级官阶预告；窄屏改为 5×2 阶梯，信息保持单层可读。未触碰战斗/结算与图鉴编队卡面。 | `npx eslint src/meta/screens/invasionScreen.ts`、`git diff --check`、`node artifacts/ux-phase-b/p-i8-lock.mjs` 均通过；桌面/390px 锁态无溢出，CTA 路由 `#map`，console 0 错误。 |
| 2026-09-20 | **批次 3/4 R-5 结算收口** | 竞技场与入侵成功结算统一进入 `#result`。竞技场结算展示当前胜场、本场回合、我方存活、连战收官状态与奖励；入侵结算展示 VP 变化/当前 VP/排名，并逐项列出基础 VP、速胜、存活、额外回合、血怒倍率与加分合计，同时展示荣耀/黄金/每日首胜。保留返回竞技场/入侵来源按钮；失败结算仍回原页并保留错误提示。 | `metaArena` 10 例 + `metaInvasion` 14 例通过；R-5 相关 ESLint 通过；本轮全局 `tsc --noEmit`、全量 Vitest、`npm run build` 和 `metaLiveScreens` e2e 均通过。真实结算截图仍待补。 |
| 2026-09-20 | **批次 3/4 回归收口** | 入侵榜单邻居区过滤玩家本人，避免玩家行在主榜与邻居卡重复；同步活动/收藏综合 e2e 将顶栏材料入口断言迁移到新的 `#bag` 独立页。 | `tests/e2e/metaLiveScreens.spec.ts` 1/1 通过；竞技场/入侵单测 24/24；targeted ESLint 通过 |
| 09-20 | **批次 3/4 信息层重构** | **A-2**：竞技场 draft 卡接入官方满配等级四维（攻/护/生/魔）与技能名；选中态展开技能描述；与已锁定卡共享法力颜色时显示同色提示。**A-4**：连战页按与 `systems/arena` 相同的 seed/RNG 顺序生成每场王国、等级、规模和立绘阵容预览。**A-5**：弃赛改为屏内确认层，显示当前胜场和实际奖表，不再调用原生 `confirm()`。奖表去掉重复 tag。**I-3/I-4/I-5/I-6**：入侵候选改为防守立绘卡，补稀有度/阵级/等级/攻生摘要、预计 VP 区间、我方队伍攻/生/平均等级、今日候选与刷新提示；榜单避免前十内重复玩家行，显示晋级/降级线与邻居。 | `npx eslint src/meta/screens/arenaScreen.ts src/meta/screens/invasionScreen.ts` 通过（0 error）；全局 `tsc` 仍受共享 `gameMain.ts` 未完成材料背包改动影响，错误与本窗口无关。竞技场/入侵结算仍受共享 `battleLauncher.ts` 限制，未在本窗口越权修改。 |
| 09-19 | **批次 0 热修** | **A-1**：`arena.css` 删 `.run-slot .shift{pointer-events:none}`、按钮 22×16 → 32×32 图标钮（hover/active/focus-visible/disabled 五态 + 手型光标）；`arenaScreen.ts` 去 `aria-hidden="true"` 改 `role="group"` + 逐钮 `aria-label`/`title`，首槽 ▲、末槽 ▼ 置 `disabled`。**A-1 关闭**。<br>**I-1**：抽出 `zoneText(league, name)`——`league === 9` 判顶端、`league === 0` 判底层，「顶端联赛只升不降」不再套在青铜头上。**I-1 关闭**。<br>**I-2**：删「4 消」整词；新增 `VP_BONUS_TEXT`/`vpBaseRangeText()` 从 `INVASION.speedBonuses/survivorBonuses/extraTurnBonuses` + `INVASION_VP_TABLE` 派生真实数值（不手抄），补「战败 −5 VP」。**I-2 关闭**。<br>`live.css` 零改动（第二段规则条复用 `.inv-zone-hint`）；`arena.css` 已在 `PARALLEL-WORK.md` 登记台账。 | `artifacts/ux-phase-b/p-b0-regress.mjs` **18/18 绿**（断言化阶段 A 坏数值）：`▲▼` 命中 `topElement` `slot-body` → `BUTTON`、32×32、`cursor:pointer`、`aria-hidden=null`、真实点击（非 force）站位顺序变化（投弹手/枪圣/考马尼 → 枪圣/投弹手/考马尼）、端点禁用、按钮不溢出槽体；规则条无「顶端联赛」「4 消」且三项数值齐全；console 0 错误。<br>改前/改后截图 `artifacts/ux-phase-b/shots/{before,after}-{arena-lineup,arena-slot,invasion-full,invasion-head}.png`。<br>`npx tsc --noEmit` 本批路径零错（残红全为窗口 G 在途测试文件）；`eslint` 两文件零 error；`metaArena` 10 例 + `metaInvasion` 14 例全绿。<br>⚠ 共享工作树当时被窗口 N 在途 `events.ts` 打挂（`EVENT_ROTATION` 导出缺失，全 app 起不来），浏览器验证在隔离 worktree `../match-3-p-verify` + 端口 5191 完成。 |
# 当前状态（2026-09-21）

战斗本体复审已补齐紧凑布局、确认目标预览、持久设置入口、状态聚合/统一浮层、零收集战果和无效选色恢复，相关浏览器回归与全量门禁通过；不能再用 09-19 的“B-1~B-11 全条完成 / 28 条自定义断言”代替当前验收。B-10 详情面板直接释放入口仍待产品裁定，B-6 还需补真实状态事件证据。入侵主屏已按最新裁定重做为三选一，榜单/官阶/规则为次级页面；旧五候选、十级数字阶梯和小卡攻生统计均已退役。结算页现已支持 768/390px 原生视口单列滚动，但 R-4 真正再战重放、A-3 真实战报截图和 16 页总 UX 的 22 条逐屏终验仍未完成。
