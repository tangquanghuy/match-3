# 技能验收分片 S0008（5 项）

> 本页分工固定，不随每次验收队列重排；状态与签收实时读取账本及本片记录。本页的“核对完成”不等于整项签收。
> 总任务：[技能核对任务书](../TASK-GOW-SKILL-REVIEW.md) · [操作指南](../../../docs/gow-skill-review-operator-guide.md) · [分片状态](STATUS.md)。

| 实体 | 技能 ID | 参考名称 |
|---|---:|---|
| `weapon:1016` 巨人的狼牙棒 | 7082 | GiantsMace |
| `weapon:1017` 血腥斧头 | 7083 | BloodyAxe |
| `weapon:1018` 邪恶镰刀 | 7084 | WickedScythe |
| `weapon:1019` 穿心长枪 | 7085 | PiercingLance |
| `weapon:1020` 灵体法杖 | 7086 | SpiritStaff |

## 交付要求

1. 每项原版英文子句／原始步骤／分支与最终原型逐条对照，复用同构测试但保留独立 ID／预期／真实施法证据。
2. 差异先记录复现和影响范围；共享引擎／生成器的修复交协调窗口串行合并。
3. 单独更新本片状态；汇总窗口合并到 `data/audit/gow-skill-reviews.json` 后运行同指纹全量验证，只有账本 `acceptance.accepted` 才计入签收。
## 本轮静态核验（worker-fast-04，2026-09-27）

逐实体只读对照 `artifacts/gowhead-weapons/weapons.json` 英文、费用/颜色，`data/raw/spells.gow.en.json` 中按技能 Id 解析 `data.SpellSteps/Cost/Target`，`artifacts/gow-skill-audit/ledger.json` 各 `key` 的最终 `runtime.prototype/manaCost/manaColors/description` 和 `src/data/weapons.json` 中文。下列仅为字段静态判断，**不是正式验收**；未运行施法、测试或审计生成器。

- **weapon:1016 / 7082 — 证据不足（轻度溅射的原生比例）**。EN: “Deal [Magic + 4] light splash damage to an Enemy.” 原生单步 `SplashDamage/FromTarget/Amount:4/SpellPowerMultiplier:1`，外层 `Target:Enemy`，Cost=8；武器棕色。最终 `damage(enemyChosen,base=4,mult=1,range=splash,splashRatio=0.25)`；中文“对一名敌人造成 [魔法 + 4] 点轻度溅射伤害。”，费用8/棕色；选择目标、主伤害匹配。原生/英文未量化 light splash 的比例/邻位取整，25% 仅可由项目 `scripts/spell-rules.md` 的内部约定支持；不能独立认证原版比例。
- **weapon:1017 / 7083 — 静态相符**。EN: “Deal [Magic + 6] damage to the first Enemy.” 原生单步 `Damage/FrontEnemy/Amount:6/SpellPowerMultiplier:1`、Cost=7；武器红色。最终 `damage(enemyFront,base=6,mult=1)`；中文“对第一名敌人造成 [魔法 + 6] 点伤害。”，费用7/红色；目标、公式、顺序和展示对齐。
- **weapon:1018 / 7084 — 静态相符**。EN: “Deal [Magic + 1] damage to all Enemies.” 原生单步 `Damage/AllEnemies/Amount:1/SpellPowerMultiplier:1`、Cost=10；武器紫色。最终 `damage(enemyAll,base=1,mult=1,range=all)`；中文“对所有敌人造成 [魔法 + 1] 点伤害。”，费用10/紫色；全体各受该段伤害，非总池散射；字段对齐。
- **weapon:1019 / 7085 — 静态相符**。EN: “Deal [Magic + 7] damage to a random Enemy.” 原生单步 `Damage/RandomEnemy/Amount:7/SpellPowerMultiplier:1`、Cost=7；武器黄色。最终 `damage(enemyRandom,base=7,mult=1)`；中文“对 1 名随机的敌人造成 [魔法 + 7] 点伤害。”，费用7/黄色；目标、公式和展示对齐。
- **weapon:1020 / 7086 — 静态相符（限散射总池字段）**。EN: “Deal [Magic + 6] scatter damage.” 原生单步 `ScatterDamage/AllEnemies/Amount:6/SpellPowerMultiplier:1`、Cost=7；武器紫色。最终 `damage(enemyAll,base=6,mult=1,range=scatter)`；中文“对所有敌人造成 [魔法 + 6] 点散射伤害。”，费用7/紫色；字段表明全敌散射而非每敌全额，随机份额/抗性结算未实测。

本片：静态相符 4、明确差异 0、证据不足 1；未决 7082。无代码／测试／账本／签收记录修改；留待测试与签收窗口复核。
