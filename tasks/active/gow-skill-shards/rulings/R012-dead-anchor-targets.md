# R012 提议：以已阵亡目标为锚的相对目标（sa-P 提议，待协调裁定，2026-09-28）

来源问题：P-F1-dead-anchor-targets（sa-F1，troop:6926 Smashedmouth spell 8414、troop:6843 Mother of Darkness spell 8248）。

原生写法：上一步 `Damage@FromTarget` 之后接 `BelowTarget` / `NextDownFromTarget` 等以该目标为锚的步骤。上一步把锚目标打死时，引擎 `targeting.ts`（enemyBelowTarget / enemyNextDown）在存活编队里找不到锚，解析为空，后续步骤无效。

资料：快照、官方状态表、已入库社区资料都没有说明游戏是否在整个施法期间保留阵亡单位的位置作为锚。两个家族目前处理不一致：
- 6926 保持原生顺序：击杀后 BelowTarget 吸取不生效；
- 6843 改为施法开始时一次解析两个目标（enemyChosenAndNextDown），击杀不影响第二目标。

提议（请协调窗口二选一，裁定后两族统一）：
1. **锚按施法开始时的位置解析**（推荐）：相对目标在锚阵亡后仍指向锚原来位置的下一名存活单位。依据：英文描述通常把两个目标写成同一句（“the target and the enemy below it”），玩家期望第二目标不因第一目标阵亡而消失；实现上在 `castTracking` 记录锚的原队伍位置即可，6843 的现有写法与之等价。
2. **锚阵亡则相对步骤无效**：维持 6926 现状，6843 改回原生顺序。

sa-P 本轮未改实现，等待裁定。
