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
