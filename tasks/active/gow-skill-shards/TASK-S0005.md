# 技能验收分片 S0005（5 项）

> 本页分工固定，不随每次验收队列重排；状态与签收实时读取账本及本片记录。本页的“核对完成”不等于整项签收。
> 总任务：[技能核对任务书](../TASK-GOW-SKILL-REVIEW.md) · [操作指南](../../../docs/gow-skill-review-operator-guide.md) · [分片状态](STATUS.md)。

| 实体 | 技能 ID | 参考名称 |
|---|---:|---|
| `troop:7335` 神秘英雄 | 8958 | MysteriousHero |
| `troop:7337` 小兵 | 8960 | Militiaman |
| `troop:7386` 鼠群 | 9028 | RatSwarm |
| `troop:7505` 獾亲 | 9250 | Badgerkin |
| `troop:7606` 奥眼能 | 8389 | OcularenEgg |

## 交付要求

1. 每项原版英文子句／原始步骤／分支与最终原型逐条对照，复用同构测试但保留独立 ID／预期／真实施法证据。
2. 差异先记录复现和影响范围；共享引擎／生成器的修复交协调窗口串行合并。
3. 单独更新本片状态；汇总窗口合并到 `data/audit/gow-skill-reviews.json` 后运行同指纹全量验证，只有账本 `acceptance.accepted` 才计入签收。

## 本轮静态核验（worker-fast-03，2026-09-27）

范围：仅本片 5 项；独立逐项对照 `data/raw/troops.gow.en.json` 的实体英文、费用及颜色，`data/raw/spells.gow.en.json` 的相应 `SpellSteps`，`src/data/troops.json` 的中文文案/实体配置，以及 `artifacts/gow-skill-audit/ledger.json` 的 `runtime.prototype`；遇到疑点另读相关运行原语。**仅为保存快照的静态核验，不等于正式签收；未运行测试及实际施法。**

| 实体 / 技能 ID | verdict | 独立定位依据 |
|---|---|---|
| `troop:7335` / **8958** | **静态相符** | 英文 `Deal [Magic + 5] damage to a random Enemy.`；原生唯一 `Damage(Target=RandomEnemy, Amount=5, SpellPowerMultiplier=1)` 对应原型唯一 `damage(enemyRandom, base=5, mult=1)`；中文“随机敌人”一致。实体原快照/本地/ledger 均为费用 **6**、**红/紫**；单步无附加概率、状态或先后分支。 |
| `troop:7337` / **8960** | **明确差异** | 英文对 **an Enemy** 造成 `[(Magic/2)+1]–[Magic+3] -{2}`；原生唯一 `RandomHighDamage(Target=FromTarget, Amount=3, SpellPowerMultiplier=1)`；原型 `damage(target=enemyFront, rangeSpec={min:1+0.5M,max:3+M}, split=2)`。上下界及中文数值吻合，但原生 `FromTarget` 与强制前排不同；`src/engine/skills/effects/damage.ts` 的 `split` 路径还直接取前 **2** 名存活敌人并均分，一次原生目标/英文“an Enemy”与此目标数及顺序不符。费用 **7**、**棕**一致；`-{2}` 是否有额外原生特殊语义仍需测试/进一步证据，不影响已定位的目标差异。 |
| `troop:7386` / **9028** | **静态相符** | 英文 `Deal [(Magic / 2) + 2] scatter damage.`；原生唯一 `ScatterDamage(Target=AllEnemies, Amount=2, SpellPowerMultiplier=0.5)` 对应原型 `damage(enemyAll, base=2,mult=0.5,range=scatter)`；中文明确“散射”；`effects/damage.ts` 的 scatter 分支按一次总伤害池分配而非对每敌独立全额。费用 **7**、**绿**一致；无附加状态/概率/先后段。 |
| `troop:7505` / **9250** | **静态相符** | 英文 `Destroy 3 random columns.`；原生唯一 `DestroyColumn(Amount=3,Delay=0)`；原型唯一 `gem(clear,destroy,randomLines,orientation=col,count=3)`，`effects/gems.ts` 对随机列抽取并清除，中文“随机摧毁 3 个列”一致；费用 **12**、**红/棕**一致；无附加条件/状态。 |
| `troop:7606` / **8389** | **证据不足** | 英文 `Summon a random Ocularen.`，中文同义；原生唯一 `SummoningKingdom(Data=3039)`；原型唯一 `summon(randomOf=[OcularenLeech,Ocularen,BurningOcularen,GloomOcularen])`；费用 **9**、**绿/紫**相符。但 `data/raw/troops.gow.en.json` 中 `KingdomId=3039` 还有 `Xerodar`、`WatchMother`，若原生为全王国池则原型缺这两种；若英文“Ocularen”限定为名称族则目前四项吻合。缺少原生召唤池过滤规则，暂不把该来源冲突当成已确诊差异，待复核召唤资格/实际抽样。 |

本片汇总：静态相符 **3**（8958、9028、9250）；明确差异 **1**（8960）；证据不足 **1**（8389）。差异影响 `troop:7337` 的选敌/伤害分配；`troop:7606` 的王国抽样资格未决。以上不是账本审计状态的转述，也不是正式签收。
