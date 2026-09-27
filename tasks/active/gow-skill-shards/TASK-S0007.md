# 技能验收分片 S0007（5 项）

> 本页分工固定，不随每次验收队列重排；状态与签收实时读取账本及本片记录。本页的“核对完成”不等于整项签收。
> 总任务：[技能核对任务书](../TASK-GOW-SKILL-REVIEW.md) · [操作指南](../../../docs/gow-skill-review-operator-guide.md) · [分片状态](STATUS.md)。

| 实体 | 技能 ID | 参考名称 |
|---|---:|---|
| `weapon:1005` 祭司之锤 | 7070 | PriestsHammer |
| `weapon:1006` 暗黑匕首 | 7072 | BlackDagger |
| `weapon:1007` 复仇偃月刀 | 7073 | AvengingFalchion |
| `weapon:1009` 恶魔镰剑 | 7075 | DaemonicKhopesh |
| `weapon:1015` 守护者之戟 | 7081 | GuardianHalberd |

## 交付要求

1. 每项原版英文子句／原始步骤／分支与最终原型逐条对照，复用同构测试但保留独立 ID／预期／真实施法证据。
2. 差异先记录复现和影响范围；共享引擎／生成器的修复交协调窗口串行合并。
3. 单独更新本片状态；汇总窗口合并到 `data/audit/gow-skill-reviews.json` 后运行同指纹全量验证，只有账本 `acceptance.accepted` 才计入签收。
## 本轮静态核验（worker-fast-04，2026-09-27）

只读逐实体重查：英文 `artifacts/gowhead-weapons/weapons.json` 的 `stats.spell.desc`、`ManaCost/_ManaColors_parsed`；原生 `data/raw/spells.gow.en.json` 按技能 Id 解析 `data.SpellSteps/Cost/Target`；与 `artifacts/gow-skill-audit/ledger.json` 对应 `key` 的**最终** `runtime.prototype/manaCost/manaColors/description` 和 `src/data/weapons.json` 中文逐项比较。以下是字段静态判断，**不是正式验收**，未运行施法／测试；原始步骤不自带取整及特殊目标定义，不能从相同字段推出所有实战语义。

- **weapon:1005 / 7070 — 证据不足（伤害取整／轻度比例的原生定量依据）**。EN: “Deal [(Magic / 2) + 4] light splash damage to the first enemy.” 原生 `SpellSteps[0]={Type:SplashDamage,Target:FrontEnemy,Amount:4,SpellPowerMultiplier:0.5,Primarypower:true}`，Cost=5；武器棕色。最终 `damage(enemyFront,base=4,mult=0.5,range=splash,splashRatio=0.25)`；中文“对第一名敌人造成 [(魔法 / 2) + 4] 点轻度溅射伤害”，费用5/棕色，字段对齐。`src/engine/skills/scaling.ts` 实施 `Math.round`，`effects/damage.ts` 邻位 `floor(primary*0.25)`；英文和原生没有声明奇数魔法的取整规则或轻度=25%，仅能按项目 `scripts/spell-rules.md` 约定验证，原版定量结论待外证。
- **weapon:1006 / 7072 — 静态相符**。EN: “Deal [Magic + 6] damage to the last Enemy.” 原生单步 `Damage/LastEnemy/Amount:6/SpellPowerMultiplier:1`，Cost=7；武器蓝色。最终 `damage(enemyLast,base=6,mult=1)`，中文“对最后一名敌人造成 [魔法 + 6] 点伤害。”，费用7/蓝色；单步顺序、目标、公式和展示吻合。
- **weapon:1007 / 7073 — 证据不足（StrongestEnemy 的实际排序口径）**。EN: “Deal [Magic + 6] damage to the strongest Enemy.” 原生单步 `Damage/StrongestEnemy/Amount:6/SpellPowerMultiplier:1`，Cost=7；武器蓝色。最终 `damage(enemyHealthiest,base=6,mult=1)`；中文“对最健康的敌人造成 [魔法 + 6] 点伤害。”，费用7/蓝色。项目 `src/engine/skills/targeting.ts` 的 `enemyHealthiest` 按当前 hp 最大选取；原生 `StrongestEnemy` 与英文 strongest 未给出生命/护甲/攻击的排序定义，不能独立证明此目标等价，亦暂不判为明确差异。
- **weapon:1009 / 7075 — 证据不足（WeakestEnemy 的实际排序口径）**。EN: “Deal [Magic + 6] damage to the weakest Enemy.” 原生单步 `Damage/WeakestEnemy/Amount:6/SpellPowerMultiplier:1`，Cost=7；武器蓝色。最终 `damage(enemyWeakest,base=6,mult=1)`；中文“对最虚弱的敌人造成 [魔法 + 6] 点伤害。”，费用7/蓝色。运行时按当前 hp 最小选择；原生/英文未明示是否按当前 hp、不含护甲、以及并列处理，目标等价性待证。
- **weapon:1015 / 7081 — 静态相符（限边界字段）**。EN: “Deal 3 - [Magic + 10] damage to a random Enemy.” 原生单步 `RandomDamage/RandomEnemy/Amount:10/SpellPowerMultiplier:1`，Cost=7；武器红色。最终 `damage(enemyRandom,rangeSpec.min={base:3,mult:0},max={base:10,mult:1})`；中文“对 1 个随机的敌人造成 3 到 [魔法 + 10] 点伤害。”，费用7/红色。原生单步未列下界，英文提供 3；引擎 `effects/damage.ts` 以含两端整数随机抽取，随机分布本轮未实测、原生亦未指定。

本片：静态相符 2、明确差异 0、证据不足 3；未决 7070、7073、7075。无代码／测试／账本／签收记录修改；留待测试与签收窗口复核。
