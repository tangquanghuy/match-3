# R011 提议：祝福是否挡住正面状态（sa-P 提议，待协调裁定，2026-09-28）

来源问题：P-F3-blessed-blocks-enchant（sa-F3，troop:7700 Gormungandr，spell 9661）。原生 `CauseSpecificStatusEffectConditional Blessed` 后接 `Enchanted`，均作用于自身（英文 “Bless and Enchant myself”）。

现行实现：`status.ts applyStatus` 在目标带祝福时拒绝除祝福、诅咒以外的**一切**状态，包括屏障、附魔等正面状态。因此 9661 只留下祝福。

资料：已入库 `official-status-effects.html` 写的是 Blessed “makes it temporarily immune to all status effects, Devour and Mana Burn”，没有区分正负；快照与已入库社区资料都没有“祝福单位能否再获得正面状态”的明确说法。另一方面，同一技能原生就在祝福之后施加附魔，说明设计意图是两者共存（否则第二步永远无效）。

提议（二选一，请协调窗口裁定）：
1. **祝福只挡负面状态**：正面状态（屏障、附魔、反射、狂怒、潜水）照常施加。依据：9661 原生步骤顺序；祝福“免疫”在游戏术语里针对的是负面效果（同段文字把 Devour、Mana Burn 并列）。改动面：`applyStatus` 的祝福拦截改为只拦 `RESETTING_NEGATIVE_STATUS_IDS`；需反查所有“祝福 + 正面状态”的技能与特性。
2. **维持现行**（祝福挡一切状态），登记为 R006 约定新编号，9661 的附魔步骤按约定视为无效。

sa-P 本轮未改实现，等待裁定。
