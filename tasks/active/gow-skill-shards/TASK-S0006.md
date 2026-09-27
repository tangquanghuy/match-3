# 技能验收分片 S0006（5 项）

> 本页分工固定，不随每次验收队列重排；状态与签收实时读取账本及本片记录。本页的“核对完成”不等于整项签收。
> 总任务：[技能核对任务书](../TASK-GOW-SKILL-REVIEW.md) · [操作指南](../../../docs/gow-skill-review-operator-guide.md) · [分片状态](STATUS.md)。

| 实体 | 技能 ID | 参考名称 |
|---|---:|---|
| `weapon:1000` 骑士之剑 | 7066 | KnightsSword |
| `weapon:1001` 侦察兵之弓 | 7067 | ScoutsBow |
| `weapon:1002` 战士之斧 | 7064 | WarriorsAxe |
| `weapon:1003` 猎人之矛 | 7068 | HuntersSpear |
| `weapon:1004` 巫师的魔杖 | 7069 | WizardsWand |

## 交付要求

1. 每项原版英文子句／原始步骤／分支与最终原型逐条对照，复用同构测试但保留独立 ID／预期／真实施法证据。
2. 差异先记录复现和影响范围；共享引擎／生成器的修复交协调窗口串行合并。
3. 单独更新本片状态；汇总窗口合并到 `data/audit/gow-skill-reviews.json` 后运行同指纹全量验证，只有账本 `acceptance.accepted` 才计入签收。

## 本轮静态核验（worker-fast-03，2026-09-27）

范围：仅本片 5 项；独立逐项对照 `artifacts/gowhead-weapons/weapons.json` 英文快照/原版武器实体参数、`data/raw/spells.gow.en.json` 的 `SpellSteps`、`src/data/weapons.json` 的中文文案/实体配置、`artifacts/gow-skill-audit/ledger.json` 的 `runtime.prototype`，必要时读取 `src/engine/skills/curated/batch-w01.ts`。**仅为保存快照的静态核验，不等于正式签收；未运行测试及实际施法。**

| 实体 / 技能 ID | verdict | 独立定位依据 |
|---|---|---|
| `weapon:1000` / **7066** | **明确差异** | 英文 `Deal [(Magic / 2) + 3] damage to the strongest Enemy.`，原生唯一 `Damage(Target=StrongestEnemy,Amount=3,SpellPowerMultiplier=0.5)`；但原型唯一 `damage(enemyFront,base=3,mult=0.5)`，`batch-w01.ts` 及中文均写“第 1 名敌人”，将最强敌人换成队首。队首非最强时错误命中目标。费用 **3**、**蓝**在英文实体/本地/ledger 中一致；无其他原生步骤/状态/概率。 |
| `weapon:1001` / **7067** | **静态相符** | 英文 `Deal [(Magic / 2) + 4] damage to an Enemy.`；原生唯一 `Damage(Target=FromTarget,Amount=4,SpellPowerMultiplier=0.5)` 与原型唯一 `damage(enemyChosen,base=4,mult=0.5)` 一致，中文“1 名敌人”；费用 **5**、**绿**一致；无条件、状态或顺序分支。 |
| `weapon:1002` / **7064** | **静态相符** | 英文 `Deal [(Magic / 2) + 5] damage to the first Enemy.`；原生唯一 `Damage(Target=FrontEnemy,Amount=5,SpellPowerMultiplier=0.5)` 对应 `damage(enemyFront,base=5,mult=0.5)`，中文“第一名敌人”；费用 **5**、**红**一致；单段无额外概率/状态。 |
| `weapon:1003` / **7068** | **静态相符** | 英文 `Deal [(Magic / 2) + 6] damage to a random Enemy.`；原生唯一 `Damage(Target=RandomEnemy,Amount=6,SpellPowerMultiplier=0.5)` 对应 `damage(enemyRandom,base=6,mult=0.5)`，中文“随机的敌人”；费用 **5**、**黄**一致；单段无额外状态或分支。 |
| `weapon:1004` / **7069** | **静态相符** | 英文 `Deal [(Magic / 2) + 6] scatter damage.`；原生唯一 `ScatterDamage(Target=AllEnemies,Amount=6,SpellPowerMultiplier=0.5)` 对应 `damage(enemyAll,base=6,mult=0.5,range=scatter)`，中文“对所有敌人……散射伤害”；`src/engine/skills/effects/damage.ts` 的 scatter 路径将总伤害池随机分配，而非逐敌全额；费用 **5**、**紫**一致，单步无概率/状态。 |

本片汇总：静态相符 **4**（7067、7064、7068、7069）；明确差异 **1**（7066）；证据不足 **0**。差异影响 `weapon:1000` 目标选择及中文展示。以上不是账本审计状态的转述，也不是正式签收。
