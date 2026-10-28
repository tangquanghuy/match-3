# 战斗结算发奖规范

**硬性约束：战斗结束实际入账的物品，必须在该场战斗的结算页面展示具体名称和实际数量；禁止只修改背包而没有可见的奖励卡。** 包括活动进度、首领挑战、里程碑等由这场战斗触发的素材奖励；保底和概率掉落都以本次真实抽取、实际入账的结果为准。未掉落、失败未发奖、重试防重放的奖励不得展示。

实现要点：

1. 发奖时使用 `earnMaterials` 返回的实际入账 `mats` 写入本场 `SettlementLine`，不要在 UI 重新掷骰或用奖励预览代替本场结果。
2. `resultScreen.ts` 的素材奖励卡从 **本次结算全部 `lines[].mats`** 汇总展示，不按 `event-progress` / `event-milestone` 等进度行类型过滤；同名素材可合并数量，不能遗漏任何来源。
3. 新增战斗结束直接入账的物品类型时，必须同步完善结算行、结算页对应的可见卡片和回归测试。核对实际背包增量、结算明细、页面卡片三者一致；同时测胜利、未掉落、战败和重放。
4. 活动积分、周商店代币或尚未领取的预览奖励不是已经进入背包的物品，不得伪装成掉落。

回归用例：`tests/unit/raidIngotChallenge.test.ts`、`tests/unit/metaResult.test.ts`、`tests/e2e/raidIngotResult.spec.ts`。

Currency rule: sum all actual `SettlementDetail.lines[].deltas` in the battle result, including gems, first-win, milestone and weekly-event payouts. Do not limit currency cards to base-battle lines. The result and actual wallet increment must agree; replay/defeat must not fabricate rewards.

## Battle economy collection caps

During battle, Gold and Souls are capped at the **current balance**, with base caps of 500 Gold per side and 200 Souls in the shared player reward pool. The battle-start team's unlocked gold/soul trait ratios increase both per-gain credits and the corresponding in-battle cap: `floor(base cap * (1 + sum of ratios))`. Per-gain Gold and Souls are `floor(raw gain * (1 + sum of ratios))`, clipped to remaining capacity; spending/losing Gold frees capacity. Gold ratios are side-specific; Soul ratios use the Left team's traits because Souls are a shared player reward pool. The HUD displays the effective cap; gain events report only the amount actually credited. No gold/soul trait multiplication occurs on victory or defeat. Separate PvP, invasion, kill and event settlement grants bypass collection caps and trait multipliers. Battle-collect settlement lines and visible currency cards use the actual in-battle balances, including on defeat; replay must not grant rewards twice.

## ST battle resource audit

ST results may include an optional versioned `economyAudit`, enabled before opening effects. It records battle resource changes and reconciles to the actual battle balances; it is independent of persistent grants. The audit remains in the persisted receipt for verification; the player-facing settlement does not render an audit section or an HP/resource report. “本场实际获得” displays committed `receipt.grants`, with learned abilities shown from the same receipt. Import, restore and story writeback validate the audit and final balances; legacy results without an audit remain valid. The ledger itself does not credit any wallet or change the ST economy availability gate.

Regression coverage: `tests/unit/battleEconomyLedger.test.ts`, `tests/unit/stEconomyEngineAudit.test.ts`, `tests/unit/stEconomyReceipt.test.ts`, `tests/unit/stStoryWriteback.test.ts` and `tests/e2e/stEconomyReceipt.spec.ts`.

## ST 原生结算界面与恢复验收

剧情战斗、往昔再现、消息原结算和待保存战果恢复均由 `settlementView` 薄适配调用原生 `ResultScreen.mountCommitted`。复用原生 HTML、CSS、奖励卡、粒子和奖励滚动；适配层通过内部 shadow 隔离酒馆样式。页面以 `main.result-screen` 为主体，一级标题为“战斗胜利”或“战斗失败”。结算页只呈现玩家需要的真实奖励，不展示 HP、资源流水等技术大报表。完整战果、HP 和 `economyAudit` 仍保存在 receipt，并继续参与导入、恢复、去重和写回校验。

- `#rewardRows` 是名称为“本场实际获得”的 region；每张真实奖励卡同时带 `.settlement-grant` 和原生 `.rs-reward`，保留 `data-grant-kind`、`data-grant-id`。数量使用 `+数量`，后接真实名称，例如 `+1遗迹守卫的灵魂碎片`、`+5宝石`；DOM 中允许换行和空白。学会的能力使用同一原生奖励卡，从 receipt 的 `learnedAbilityIds` 和名称读取。
- 未获得奖励时保留原生空奖励布局，不追加“本场没有获得”文案，不将战斗资源余额或审计流水伪装成持久化发奖。胜败展示均以本场实际 receipt 为准。
- 正常保存完成后，顶部 `.bar` 及其保存状态、重复继续按钮、导出按钮均隐藏。交互结算仅保留原生 `#again` 继续按钮；消息原结算等只读展示可不提供继续按钮。
- 保存失败、同步失败或 outbox 清理失败时，仍显示异常状态、重试和战果导出入口。已入账时先展示原生结算和真实奖励；重试、重载恢复与重复回传均复用原 receipt，核对钱包、碎片、结算条数和队列，确保只入账一次。
- 桌面 1440×900 与移动端 390×844 均验收 `#again` 在视口内可见且可操作；奖励较多时，名称为“结算奖励”的 `#resultScroll` 可滚动到最后一张卡，继续按钮保持可见。

测试使用 Playwright 穿透 shadow 的 locator 获取实际结算页与奖励卡，按正则容忍卡片中的换行；可启用 `contextOptions: {reducedMotion: 'reduce'}` 稳定原生 CSS 动画。恢复比较应同时覆盖实际奖励卡、完整 receipt、审计数据与保存后的真实余额；宿主 `innerHTML` 不包含内部 shadow 内容，不可单独作为渲染一致性的证据。渲染不得重新抽奖或触发入账。

定向 UI 回归：`tests/e2e/stEconomyReceipt.spec.ts`（含胜败、旧 receipt、审计留存、重开及双尺寸滚动）、`stReplay.spec.ts`、`stOutboxAcceptance.spec.ts`、`stMessageStory.spec.ts`、`stPlaytest.spec.ts`、`stSemanticStory.spec.ts`、`stSettlement.spec.ts`（胜败、去重及 receipt 内 HP 变化）。

### 2026-10-26 消息重渲染与名称展示

消息重新渲染只查询持久化状态，收起该消息已显示的旧结算，不启动新战斗或产生新胜利。战斗进行中保留原实例；已结算入口显示“查看本场战果”，显式打开原收据且保持钱包、魂片、学习进度、结算条数一致。只读结算随来源消息卸载关闭。结算展示去掉能力末尾的七位机械指纹以及碎片名称中的同一后缀，保留 receipt 的完整原名称、ID、数量与去重身份，不将名称展示处理写回奖励记录。原生奖励卡支持长名称换行；仅已提交收据模式收紧标题与奖励区间距，原生普通结算保留布局。

回归增加胜利页未关闭时重渲染、进行中战斗重挂、原收据重复查看，以及桌面／手机／短屏的长名称、真实数量、继续按钮与奖励区滚动检查。

### 2026-10-26 魂片来源名称纠正

新发魂片在 `settleSave` 入账时就使用原遭遇来源所对应的敌人姓名，格式为「敌人名的灵魂碎片」；不再把 `abilityName` 的机械效果摘要拼成奖励名称。同一来源仍每场至多 +1，已学能力、胜败、逃离、有效击败和重复结算继续沿用原规则。

历史收据通过其 `encounterId` 找到原 `sources`，再以魂片 `grant.id` → `sourceId` → `enemyExternalId` 对应到本场冻结的 `request.enemyTeam`，供消息原结算与战斗记录展示。不得按当前角色、数组位置或相同能力名配对；不同来源仍独立。展示不重写旧 grants、ID、数量、钱包或学习进度。魂片收藏复用同一来源解析，技能名称在能力信息中显示。

回归覆盖新结算真实名称、截图中的旧名称 `敌方前2名伤害〔08hzkdw〕灵魂碎片` 重开、原收据与存档不变、多来源与同源去重、胜败及停止重复获取。
