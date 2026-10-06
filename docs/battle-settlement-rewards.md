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

During battle, gold is capped at the **current balance** of 500 per side, not lifetime gold earned: spending or losing gold frees room to collect it again. In-battle souls are capped at 200. Matches, skills, traits and special gems credit only the amount that fits; economy-gain events report that actual credited amount. At the first victory/defeat determination, gold/soul traits multiply only the capped battle balance. Separate PvP, invasion, kill and event settlement grants bypass these collection caps and do not receive the battle-trait multipliers. Battle HUD counters show the in-battle balance against these base caps; the settlement lines and visible currency cards must include all actually credited battle and extra grants, including on defeat, and avoid double-granting on replay.
