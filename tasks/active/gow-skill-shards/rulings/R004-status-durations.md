# R004 状态持续规则（协调裁定，2026-09-28）

取代 R002 未覆盖的部分，并取代规格 9.5（负面状态固定 3 回合倒计时）。依据：已入库 `official-status-effects.html`（诅咒、狼化、恐惧条目描述累积自愈概率；狼化例子 3 回合后 30%、再 40%，与 3 回合硬上限矛盾），以及社区一致说法（下列链接，入库由 sa-L5 负责，文件名 `community-2026-09-28-status-durations.json`）。

负面状态：
- 无固定回合上限。每个持有者回合开始时有累积自愈概率：第 1 次 10%，此后每回合 +10%（诅咒状态下每次 +5%）。自愈一次移除全部可自愈负面状态。
- 身上再获得任何新的负面状态，累积概率重置为 10%。
- 毒（Poison）不自愈，只能被净化等效果移除。死亡印记按官方条目每回合 10% 即死判定，不受本条改变。

正面状态：
- 屏障、反射：受到一次伤害后移除；附魔：施放技能后移除（R002）。
- 狂怒（Enraged）：造成一次骷髅伤害后移除，无时限。
- 潜水（Submerged）、祝福（Blessed）：持有者采取行动（施放技能，或作为首位兵种用骷髅造成伤害）后移除，无时限。

原生 `Cause*` 步骤的 `Amount`（例如 `CauseStun Amount 4`、`CauseBurning Amount 3`）：快照内没有任何资料说明其含义；按本规则忽略，这一项作为约定登记在 R006。

实现修复属于公共原语。需同步改掉断言旧 3 回合倒计时的核心单测（`statusEffect.test.ts`、`webStatus.test.ts`、`passTurn.test.ts`、`castTurnLifecycle.test.ts` 等），并更新 `.kiro/specs/combat-mechanics` 中对应规格条目的说明。

社区来源（旁证）：
- https://community.gemsofwar.com/t/negative-status-effects-refresh-renewal-stacking-issue/53381
- https://community.gemsofwar.com/t/not-a-bug-cumulative-chance/53153
- https://community.gemsofwar.com/t/perma-silenced-in-battle/50233
- https://community.gemsofwar.com/t/not-a-bug-why-does-submerged-blessed-etc-vanish-after-spell-cast/80861/40
- https://community.gemsofwar.com/t/aggrevated-layored-status-effects/51110

来源问题：L5-004、L5-005、L5-014、L4b-6340。
