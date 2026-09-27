# 技能验收分片 S0003（5 项）

> 本页分工固定，不随每次验收队列重排；状态与签收实时读取账本及本片记录。本页的“核对完成”不等于整项签收。
> 总任务：[技能核对任务书](../TASK-GOW-SKILL-REVIEW.md) · [操作指南](../../../docs/gow-skill-review-operator-guide.md) · [分片状态](STATUS.md)。

| 实体 | 技能 ID | 参考名称 |
|---|---:|---|
| `troop:7135` 小咕咕布莱恩 | 8684 | BrianTheClucky |
| `troop:7151` 火灵 | 8710 | FireSpirit |
| `troop:7159` 狐狸精 | 8734 | Kitsune |
| `troop:7160` 南森德 | 8735 | Southrender |
| `troop:7161` 剑姬 | 8736 | SwordMaiden |

## 交付要求

1. 每项原版英文子句／原始步骤／分支与最终原型逐条对照，复用同构测试但保留独立 ID／预期／真实施法证据。
2. 差异先记录复现和影响范围；共享引擎／生成器的修复交协调窗口串行合并。
3. 单独更新本片状态；汇总窗口合并到 `data/audit/gow-skill-reviews.json` 后运行同指纹全量验证，只有账本 `acceptance.accepted` 才计入签收。

## 本轮静态核验（worker-fast-02；2026-09-27；非正式验收）

取证：独立读取 `data/raw/troops.gow.en.json` 中实体 `stats.spell.desc`／`SpellId`／`ManaCost`／`_ManaColors_parsed`、`data/raw/spells.gow.en.json` 对应 `Id` 的 `RawData.SpellSteps`，与 `src/data/troops.json` 的费用、颜色、中文以及 `artifacts/gow-skill-audit/ledger.json` 的 `runtime.prototype` 逐条对照；并读 `src/engine/skills/curated/index.ts` 的批次后覆盖顺序与下列有效组装条目（账本状态不作为结论）。本片均为 troop，无武器 `gw_` 出战绑定；下列原生步骤均为**单步骤**，没有条件分支／后续步骤。`一致` 只表示所列字段静态相符；未运行测试、未做真实施法和正式签收。

- **troop:7135 / spell 8684，verdict=一致（静态字段）**。英文：“Eliminate [Magic + 1] points of a random skill from all Enemies.”；原生步骤 `Type=DecreaseRandom, Target=AllEnemies, Amount=1, SpellPowerMultiplier=1, Primarypower=true`；当前 `runtime.prototype.segments[0]={kind:reduce,target:enemyAll,stat:random,scaling:{base:1,mult:1}}`，有效组装 `batch-r12.ts` 8684；`debuff.ts` 随目标分别抽取 attack/armor/magic。源／现费用 12／12，颜色 Green+Red／Green+Red；中文“消除所有敌人 [魔法 + 1] 点随机技能值。”吻合。随机分布及实战效果未测，留待复核。
- **troop:7151 / spell 8710，verdict=一致（静态字段）**。英文：“Convert all Gems of a Chosen Color to Burning Gems.”；原生 `Type=ConvertGems, Color1=FromTarget, Color2=Burning, Amount=100`；当前 `segments[0]={kind:gem,params:{op:transform,from:CHOSEN,to:SKULL,toSpecial:burningGem}}`，`batch-r4.ts` 8710；`effects/gems.ts` 缺省 `count` 取全盘该色。源／现费用 12／12，颜色 Yellow+Brown／Yellow+Brown；中文“将所有选定颜色的宝石转换成燃烧宝石。”吻合。选色交互及特殊宝石结算未实测。
- **troop:7159 / spell 8734，verdict=一致（静态字段）**。英文：“Deal [Magic + 2] damage to a random Enemy.”；原生 `Type=Damage, Target=RandomEnemy, Amount=2, SpellPowerMultiplier=1, Primarypower=true`；当前 `segments[0]={kind:damage,target:enemyRandom,scaling:{base:2,mult:1}}`。源／现费用 7／7，颜色 Green+Purple／Green+Purple；中文“对 1 名随机的敌人造成 [魔法 + 2] 点伤害。”吻合。有效随机选敌／实战扣血未实测。
- **troop:7160 / spell 8735，verdict=一致（静态字段）**。英文：“Deal [(Magic / 2) + 1] – [Magic + 2] damage to the first Enemy.”；原生 `Type=RandomHighDamage, Target=FrontEnemy, Amount=2, SpellPowerMultiplier=1, Primarypower=true`；当前 `segments[0]={kind:damage,target:enemyFront,rangeSpec:{min:{base:1,mult:0.5},max:{base:2,mult:1}}}`，有效组装 `batch-r1.ts` 8735；`effects/damage.ts` 在上下限间掷整数。源／现费用 7／7，颜色 Blue+Yellow／Blue+Yellow；中文上下限及“第一名敌人”吻合。具体半魔法舍入及抽样未实测。
- **troop:7161 / spell 8736，verdict=一致（静态字段）**。英文：“Deal 3-[Magic + 2] damage to an Enemy.”；原生 `Type=RandomDamage, Target=FromTarget, Amount=2, SpellPowerMultiplier=1, Primarypower=true`；当前 `segments[0]={kind:damage,target:enemyChosen,rangeSpec:{min:{base:3,mult:0},max:{base:2,mult:1}}}`，有效组装 `batch-r7.ts` 8736。源／现费用 7／7，颜色 Red+Purple／Red+Purple；中文“对一名敌人造成 3-[魔法 + 2] 点伤害。”吻合。选敌与伤害抽样未实测。

本片明确差异 ID：无；静态字段未决 ID：无；所有五项的真实施法／测试／签收证据尚未核，以上 verdict 不涵盖这些维度。
