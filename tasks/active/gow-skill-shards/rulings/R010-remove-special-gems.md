# R010 提议：Remove 是否触发特殊宝石（sa-P 提议，待协调裁定，2026-09-28）

背景：P-F1-remove-gems 已实现原生 `RemoveColor` / `RemoveGems` 的 `remove` 清除模式（`src/engine/skills/gowRemoveRules.ts` 列出 85 个原生只有 Remove* 清除步骤的技能）。有资料的部分：移除不给法力、骷髅不造成伤害、不产生资源（community.gemsofwar.com t/1807、t/82191、t/16857）；被移除的宝石照常计入“因被移除的宝石数而增强”，棋盘照常补充和连锁。

没有资料的部分：被移除的**特殊宝石**（炸弹、末日骷髅、法力药水、宝箱等）是否触发各自的摧毁效果。快照、官方状态表和上述社区帖都没有提到。

现行实现（提议口径）：`remove` 不触发特殊宝石摧毁链（`TurnEngine.resolveBoardChange` 对 `remove` 跳过 `expandSpecialDestruction` 与 `settleDestroyed`），理由是“移除”在游戏措辞里与“摧毁”对立，特殊宝石的效果写作 “when destroyed / when matched”。

待裁：
1. 采纳上面的口径（登记为 R006 约定新编号），或
2. 改为 Remove 也触发特殊宝石效果（只去掉法力与骷髅伤害）。

影响面：85 个技能里目标可能含特殊宝石的只有全盘/整色移除（如 7137、8861 RemoveGems 全部颜色，Skull 系 7052/7184/7352/8598/8976 可能碰到末日骷髅）。默认审核棋盘没有特殊宝石，golden 不受此项影响。
