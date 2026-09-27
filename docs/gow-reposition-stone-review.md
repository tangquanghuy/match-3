# 舞动匕首与石块记忆限定复核

日期：2026-09-26。两个武器按存储英文与native快照逐步骤修复；整项保持draft。

## 8074 / Dancing Daggers

原实现只有M+5群体伤害，遗漏完整击退子句。native定义：群伤 → 等待结算 → 当前第一名敌人移到末位 → 等待 → ResetTargets → 50%再次把当前第一名敌人移到末位。现恢复这些语义；不是随机均匀抽一个数量，也不是一次选择两名原目标再批量移位。

真实入口测试覆盖双方、M=0/1/11/20、第二次掷签0/0.499999/0.5/0.999999，以及前1～4名死亡、已阵亡首位、只剩一名敌人。源码DelayUntilEffectsComplete在同步逻辑中对应前段伤害/阵亡结算完成；动画队列顺序由原事件管线处理。

## 8400 / Memories of Stone

中文快照误译“石墩激活”，并丢失摧毁数量。native是CountGems(Block,100)→DecreaseMana(2,UseCounter)→DestroyColor(M+1,FromTarget)。现为全体敌人耗蓝2+当前石块数，随后最多摧毁M+1颗所选颜色宝石；不再摧毁整色，也不把石块增幅挂在摧毁数上。

先读石块计数、再清除；实际耗蓝以目标余额为限。共享技能耗蓝/窃取入口同时修正Blessed与Invulnerable保护、Curse/Stun绕过ManaShield；Impervious单独不防Mana Drain（Mana Burn仍走自身免疫规则）。本批不声称特质触发路径的所有耗蓝操作已验收。

## 证据与边界

- `tests/unit/gowRepositionStoneAudit.test.ts`：182项，含双方真实出战武器入口和隔离原型矩阵。
- 武器数字ID与gw装备别名一致，缺蓝不执行，metadata与说明核对。
- 生成器/数据/中文pool已同时修正，再生成保护现为114把，124项测试。
- 编译分类full=710/partial=8，不是710把原版签收。
- 新增火枪手与上述两把武器的逐实体draft，12维度保留明确verified、not-applicable和pending；不批量签收。
- 施法回合交接已按2026-09-27裁定修复；完整宝石结算、状态恢复概率和原版分数取整仍有待项。当前文件指纹下的全量回归另见verification-receipt.json。
