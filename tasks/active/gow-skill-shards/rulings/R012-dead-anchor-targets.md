# R012 以目标为锚的相对位置按目标被杀前计算（用户裁定，2026-09-28）

取代此前 sa-P 的提议。

- 原生 `BelowTarget`、`AboveTarget`、`NextDownFromTarget`、`NextUpFromTarget` 等以选中目标为锚的相对目标，**一律按施法时（目标被杀之前）的队伍位置解析**。前一步把锚目标打死，不影响后续步骤命中“它下方／上方”的敌人。
- 实现：在 `castTracking` 记录锚目标在施法开始时的编队位置，相对目标模式在锚已离场时按该位置找下一名存活单位。
- 统一处理两族：troop:6926（8414）改为按此规则，击杀后 BelowTarget 吸取仍生效；troop:6843（8248）现有写法与之等价，可保留或改回原生顺序。同类问题 P-R3-below-dead-target（weapon:1605、troop:7818）一并按此修复。
