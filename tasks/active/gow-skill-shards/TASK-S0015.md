# 技能验收分片 S0015（5 项）

> 本页分工固定，不随每次验收队列重排；状态与签收实时读取账本及本片记录。本页的“核对完成”不等于整项签收。
> 总任务：[技能核对任务书](../TASK-GOW-SKILL-REVIEW.md) · [操作指南](../../../docs/gow-skill-review-operator-guide.md) · [分片状态](STATUS.md)。

| 实体 | 技能 ID | 参考名称 |
|---|---:|---|
| `troop:6030` 执政官雕像 | 7030 | ArchonStatue |
| `troop:6057` 狼骑士 | 7057 | WolfKnight |
| `troop:6101` 角鹰兽 | 7003 | Hippogryph |
| `troop:6117` 斯嘉丽 | 7209 | Scarlett |
| `troop:6189` 雪怪 | 7330 | Yeti |

## 交付要求

1. 每项原版英文子句／原始步骤／分支与最终原型逐条对照，复用同构测试但保留独立 ID／预期／真实施法证据。
2. 差异先记录复现和影响范围；共享引擎／生成器的修复交协调窗口串行合并。
3. 单独更新本片状态；汇总窗口合并到 `data/audit/gow-skill-reviews.json` 后运行同指纹全量验证，只有账本 `acceptance.accepted` 才计入签收。
## 本轮静态核验（worker-fast-04，2026-09-27）

只读逐项核对：`data/raw/troops.gow.en.json` 的 `stats.spell.desc`、`SpellId/ManaCost/_ManaColors_parsed`；`data/raw/spells.gow.en.json` 按技能 Id 解析 `data.Cost/Target/SpellSteps`；`artifacts/gow-skill-audit/ledger.json` 的最终 `runtime.prototype/manaCost/manaColors/description`，以及 `src/data/troops.json` 中文。以下不引用既有审计结论，**不是正式验收**；未运行测试/实战/审计生成器。以下各项均为**唯一原生伤害步骤**，不存在原生后续步骤；通常倍率基础为 `Magic+Amount`，有条件时在目标判定后加算或倍乘。费用/颜色按实体独立核对。

- **troop:6030 / 7030 — 证据不足（最强目标定义）**。EN: “Deal [Magic + 3] damage to the strongest Enemy. If I am wounded, deal 8 more damage.” 原生 `Damage/StrongestEnemy/Amount:3/SpellPowerMultiplier:1/StatusModifier:AddForCasterDamaged/StatusAmount:8`，Cost 10，绿/棕。最终 `damage(enemyHealthiest,{base:3,mult:1},condBonus:+8 if selfHpDamaged)`；中文“对最健康的敌人造成 [魔法 + 3] 点伤害。若自身的生命值受损，则可多造成 8 点伤害。”，费用10、绿/棕。加法、施法者受损条件与单步顺序对齐；运行时 `enemyHealthiest` 以当前 hp 最大选取，但英文 strongest／原生 StrongestEnemy 没有定义比较的是 hp/攻击/护甲，排序等价性待证。
- **troop:6057 / 7057 — 静态相符**。EN: “Deal [Magic + 1] true damage to an Enemy. If the Enemy is wounded, deal 6 more damage.” 原生 `TrueDamage/FromTarget`、外层 `Target:Enemy`、`Amount:1/SpellPowerMultiplier:1/StatusModifier:AddForDamaged/StatusAmount:6`，Cost 8，黄/棕。最终 `damage(enemyChosen,{base:1,mult:1},trueDamage:true,condBonus:+6 if targetHpDamaged)`；中文“造成 [魔法 + 1] 点真实伤害。如果敌人受伤，则增加 6 点伤害。”，费用8、黄/棕。中文首句省略“对一名敌人”，但本句的“敌人受伤”与单选原生目标及原型一致；目标、伤害种类、加法条件静态对齐。
- **troop:6101 / 7003 — 静态相符**。EN: “Deal [Magic + 3] damage to an Enemy. If the Enemy has Hunter's Mark, deal triple damage.” 原生 `Damage/FromTarget`、外层 `Target:Enemy`、`Amount:3/SpellPowerMultiplier:1/StatusModifier:MultiplyForHuntersMark/StatusAmount:3`，Cost 9，绿/黄。最终 `damage(enemyChosen,{base:3,mult:1},condMult:3 if targetStatus marked)`；中文“对 1 名敌人造成 [魔法 + 3] 点伤害。如果敌人已陷入猎人标记状态，则造成三倍伤害。”，费用9、绿/黄。猎人标记 `marked`、单目标及倍率字段吻合。
- **troop:6117 / 7209 — 明确差异（野兽倍率及中文展示）**。EN: “Deal [Magic + 7] damage to an Enemy. If the Enemy is a Beast, deal triple damage.” 原生 `Damage/FromTarget`、`Target:Enemy`、`Amount:7/SpellPowerMultiplier:1/StatusModifier:MultiplyForBeast/StatusAmount:3`，Cost 11，绿/红。最终 `damage(enemyChosen,{base:7,mult:1},raceDouble:Beast)` **无 `raceTimes:3`**；`src/engine/skills/effects/secondary.ts` 的 `DEFAULT_RACE_DOUBLE=2` 且 `effects/damage.ts` 对缺省 `raceTimes` 使用该值，因此野兽实为 ×2（例如 Magic=10，无防御减免时基础17，原生/英文应51、当前34）；中文“如果对方是野兽，则造成双倍伤害”同样与英文/原生 ×3 冲突。非野兽基础伤害、费用与绿/红相符；差异限定野兽分支和展示。
- **troop:6189 / 7330 — 明确差异（中文展示笔误；效果字段相符）**。EN: “Deal [Magic + 4] damage to an enemy. Deal double damage if the enemy is Frozen.” 原生 `Damage/FromTarget`、`Target:Enemy`、`Amount:4/SpellPowerMultiplier:1/StatusModifier:MultiplyForFrozen/StatusAmount:2`，Cost 11，蓝/棕。最终 `damage(enemyChosen,{base:4,mult:1},condMult:2 if targetStatus frozen)`，效果字段吻合；**展示文字**为“如果敌人已被冻结，则造成双倍倍伤害。”，重复“倍”，不是对应英文的自然中文表达。费用11、蓝/棕及目标相符；此项差异仅中文显示，不推断效果差异。

本片：静态相符 2（troop:6057/7057、troop:6101/7003），明确差异 2（troop:6117/7209、troop:6189/7330），证据不足 1（troop:6030/7030）。待协调窗口复核/修复，本轮不改技能代码、测试、总账或签收记录。
