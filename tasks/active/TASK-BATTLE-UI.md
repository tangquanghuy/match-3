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
| **B-1** | **八张卡一个名字都不显示**（`TeamView.ts:478 .gcard .name{display:none}`，元素与内容都在） | 名字压在立绘底缘暗带（一行 + 省略号）；移动横屏（卡 110×129）放不下时降级为"首回合浮现 0.8s + 长按" |
| **B-2** | **法力进度卡面无数字**（`.mana-num` 三处样式是死样式、模板里没有元素），真实值只在 hover/点宝石的浮窗里（移动端无 hover） | 宝石书签旁常驻 `N/M`（死样式正好复用）或宝石做环形进度 |
| **B-3** | **法力未满短按零反馈**（代码注释自己写着"可留作提示"） | 未满给「还差 N 点法力」浮窗 + 卡片摇一下；非我方回合给「等待对手行动」 |
| **B-4** | **施法无确认、无预览、无效果摘要**——释放后整个战斗层的文字只有六组数字 + `TURN 01` | **三段式**（线框见 `15-battle.md`）：①可释放提示 ②确认层（技能名 + **求值后**全文 + 目标预览 + 释放/取消，设置里可关但**默认开**）③效果摘要条（逐条列伤害/治疗/状态/召唤，数据就是 `session.resolve` 返回的事件流，已在手） |
| **B-5** | 短按=施法 / 长按=详情，**页面零说明**，两者只差 475ms，误触代价不对称 | 首战一次性引导 + 长按按压进度反馈 |
| **B-6** | 可释放态只有卡框亮度 +18% + 宝石呼吸，无显式信号；与"沉默放不出"共用一套视觉 | 加显式标记（宝石打「!」或卡框流光）；与 `pulseManaReady` 合并口径 |
| **B-7** | 状态徽记在移动横屏缩到 **17×17px**（桌面 37×37），而它是本页唯一"可点内容"，点偏就是**误放技能** | 徽记设最小 24px 下限；不足时改"状态条折叠 → 一次点开全部状态" |
| **B-8** | 状态说明**双轨**：原生 `title`（名字 + 回合）与自绘浮层（机制 + 当前数值）内容不一致，且徽记可点没有任何暗示 | 自绘可用时移除 `title`（`TeamView.ts:769`）；徽记加"可点"暗示；**同一套浮层扩到特质图标与法力宝石**；`STATUS_DESCRIPTIONS` 提共享模块（与图鉴/编队同源） |
| **B-9** | 胜负面板**零战果**（只有大标题 + 英文 + 继续），且要等 900ms 静默才弹 | 面板内给回合数 / 存活人数 / 战斗内收集（数据在 `exportResult()`）；900ms 期间给过渡而不是静默黑屏；组件仍不做导航 |
| **B-10/B-11** | 详情面板不列**当前状态**、无"释放"出口、`未生效` 开发口径外泄；选择层无文案、Esc 可用但不告知 | 面板加"当前状态"区（`char.statuses`）；`未生效` 改玩家口径；选择层加一行「选择一枚宝石以决定法术颜色 · Esc 取消」 |

### 批次 2 · 结算屏（等 L 批次 2，视觉迁移随之）

| 编号 | 问题 | 修法 |
|---|---|---|
| **R-1** | **空态谎报胜利**：`paint()` 在 `detail == null` 时 return，HTML 默认值「胜 利 / VICTORY / +0 XP」裸奔（刷新后停在 `#result` 就会撞上） | null 分支画空态「暂无战报 · 去世界地图打一场」，四块整体隐藏；模板默认值改中性占位 |
| **R-2** | **两张立绘框 `src` 永远是 null**（`#sumArt` 侧栏王国图、`#dropArt` 任务部队奖励卡） | `#dropArt` 走部队立绘（与图鉴/战斗卡同源 `portraitUrl`）；`#sumArt` 一期用王国纹章，二期换战斗终局截帧（`TASK-META §6` 开放问题 1） |
| **R-3** | 主行动位被**禁用的假按钮**「已入账」占着（还给 disabled 按钮绑了 click） | 改状态章「奖励已自动入账 ✓」；主行动位交给「再来一场」 |
| **R-4** | 「返回地图再战」与「返回地图」**是同一个动作**（都 `navigate('#map')`），而"再战"没实现 | 「再来一场」按来源重放：`source.kind` 已在 `plan.plan.source`（`battleLauncher.ts:167-173` 就在用它拼 label），连 kingdom/node/tier 一起传进 `ResultMeta` |
| **R-5** | **竞技场与入侵不走结算屏**，战果只有一条 toast；入侵的 `bonuses`（注释写着"结算展示"）没人读 | 两条路径接入结算屏（`sourceLabel` = `ARENA RUN` / `INVASION · 青铜`），入侵逐项列 base + 速胜 + 存活 + 额外回合 + 血怒 ×2 |
| **R-6~R-9** | 素材行全用同一个 `orb` 图标、特质石不显色 / 任务部队奖励用 `note` 当名字且稀有度硬编码 `r-rare` / 「结算说明」写 `BattleResult.economy` / 职业经验只是一行小字里的英文 id | 逐条见 `14-result.md` 修法指针 |

### 批次 3 · 竞技场（A-2~A-9）

- **A-2**：3 选 1 卡面补四维 + 技能名（选中态展开技能全文，复用 `shell/spellText.ts`），并**警告与已锁定卡的法力色重合**（3 人队同色是最常见的自杀式构筑）。数据全现成（`getTroopById` 已在手、`troopStatsAtLevel`、`troop.spell`）。
- **A-3**：本届战报（走结算屏或页内战报卡）——打满 3 胜要有配得上 12,000 金的画面。
- **A-4**：三战之路给对手阵容预览（种子化确定，出战前可算）。
- **A-5**：弃赛的原生 `confirm()` 改自绘 + 写明"当前 N 胜 → 黄金 X"；两个入口收敛为一个。
- **A-6~A-9**：奖表 tag 重复两遍 / 免费票周重置无倒计时 / 三步指示器可点却无绑定 / 「已锁定」空槽无进度语义 + 两套卡片语言。

### 批次 4 · 入侵（I-3~I-9）

- **I-3**（核心）：对手卡重做——防守队用**立绘 + 阵级 + 等级**（现在四个文字标签、等级藏在 `title`）；**「预计 VP +36~50」是本卡最大的数字**（`vpBand` + 三类加分表可算）；我方队摘要同屏（`⚔/♥/平均等级` 三个数就够）；5 张卡只有 1 张给实底按钮。
- **I-4**：玩家进前 10 时**榜单画两遍玩家行**（`invasionScreen.ts:116` 末尾追加改条件渲染）。
- **I-5**：青铜晋级区占 20/30 → 榜单改"晋级线/降级线 + 开窗显示邻居 + 玩家行带差多少"，不给 2/3 的行上色。
- **I-6**：今日场次与刷新时刻（`save.invasion.battles` 有数据但不回显）。
- **I-7**：结算加分构成（随 R-5 一起做）。
- **I-8**：锁态 0 按钮 0 图形 → 给"主角经验从哪来 + 去世界地图"CTA + 联赛阶梯预告（`LEAGUE_COLORS` 十色已定义好但九成没用上）。
- **I-9**：5 个 781×33 等权重巨型「出击」+ 官阶区三数字无轻重 → 把"晋级进度"提为主数字。

## 3. 验收标准

1. **战斗层**：法力未满短按有反馈；施法有确认层与效果摘要；卡面有名字与法力进度；移动横屏徽记 ≥24px 且点徽记不会误放技能；胜负面板有战果。
2. **结算屏**：直链 `#result` 不再谎报胜利；两张立绘有图；「再来一场」真的重打同一来源；竞技场/入侵的战果进结算屏且入侵列出加分构成。
3. **竞技场**：站位能调（A-1 断言）；draft 卡能横向比较（四维 + 技能名 + 同色警告）。
4. **入侵**：对手可比较（预估 VP + 立绘防守队 + 我方摘要）；榜单无重复行；文案不再出现"顶端联赛"与"4 消"。
5. **一个遗留的诚实记录**：阶段 A **没拍到带真实明细的结算屏**（自动交换打不完一局：345 次尝试 / 22 分钟成交 22 步）。本窗口开工后**请补一张真机结算截图**（可用调试钩子直接结束对局），并顺手把 `shots/result-05-gameover-panel.png` 这个名不副实的文件改名或重拍。
6. 门槛全绿 + 22 条清单通过 + 四页改前/改后对照截图。回归断言复跑 `u5-arena-invasion.mjs`、`u5x-probe.mjs`、`u5-battle-standalone.mjs`、`u5x-card.mjs`。

## 4. 工作记录（新记录追加在顶部）

| 日期 | 批次 | 内容 | 验证 |
|---|---|---|---|
| 09-19 | **批次 0 热修** | **A-1**：`arena.css` 删 `.run-slot .shift{pointer-events:none}`、按钮 22×16 → 32×32 图标钮（hover/active/focus-visible/disabled 五态 + 手型光标）；`arenaScreen.ts` 去 `aria-hidden="true"` 改 `role="group"` + 逐钮 `aria-label`/`title`，首槽 ▲、末槽 ▼ 置 `disabled`。**A-1 关闭**。<br>**I-1**：抽出 `zoneText(league, name)`——`league === 9` 判顶端、`league === 0` 判底层，「顶端联赛只升不降」不再套在青铜头上。**I-1 关闭**。<br>**I-2**：删「4 消」整词；新增 `VP_BONUS_TEXT`/`vpBaseRangeText()` 从 `INVASION.speedBonuses/survivorBonuses/extraTurnBonuses` + `INVASION_VP_TABLE` 派生真实数值（不手抄），补「战败 −5 VP」。**I-2 关闭**。<br>`live.css` 零改动（第二段规则条复用 `.inv-zone-hint`）；`arena.css` 已在 `PARALLEL-WORK.md` 登记台账。 | `artifacts/ux-phase-b/p-b0-regress.mjs` **18/18 绿**（断言化阶段 A 坏数值）：`▲▼` 命中 `topElement` `slot-body` → `BUTTON`、32×32、`cursor:pointer`、`aria-hidden=null`、真实点击（非 force）站位顺序变化（投弹手/枪圣/考马尼 → 枪圣/投弹手/考马尼）、端点禁用、按钮不溢出槽体；规则条无「顶端联赛」「4 消」且三项数值齐全；console 0 错误。<br>改前/改后截图 `artifacts/ux-phase-b/shots/{before,after}-{arena-lineup,arena-slot,invasion-full,invasion-head}.png`。<br>`npx tsc --noEmit` 本批路径零错（残红全为窗口 G 在途测试文件）；`eslint` 两文件零 error；`metaArena` 10 例 + `metaInvasion` 14 例全绿。<br>⚠ 共享工作树当时被窗口 N 在途 `events.ts` 打挂（`EVENT_ROTATION` 导出缺失，全 app 起不来），浏览器验证在隔离 worktree `../match-3-p-verify` + 端口 5191 完成。 |
# 当前状态（2026-09-20 基线）

竞技场站位 P0、入侵联赛文案 P0 已完成；完整竞技场信息层、入侵对手卡、结算屏和剩余战斗层问题尚未完成。阶段 A 的真实结算截图缺口仍需补证，不得按旧记录标记为完成。
