# 技能验收分片 S0016（5 项）

> 本页分工固定，不随每次验收队列重排；状态与签收实时读取账本及本片记录。本页的“核对完成”不等于整项签收。
> 总任务：[技能核对任务书](../TASK-GOW-SKILL-REVIEW.md) · [操作指南](../../../docs/gow-skill-review-operator-guide.md) · [分片状态](STATUS.md)。

| 实体 | 技能 ID | 参考名称 |
|---|---:|---|
| `troop:6255` 铁须领主 | 7398 | LordIronbeard |
| `troop:6306` 暗黑巨像 | 7456 | DarkMonolith |
| `troop:6370` 弗帝亚诺伊 | 7522 | Vodyanoi |
| `troop:6373` 雅嘎的小屋 | 7525 | YagasHut |
| `troop:6548` 龙舌兰 | 7742 | Agave |

## 交付要求

1. 每项原版英文子句／原始步骤／分支与最终原型逐条对照，复用同构测试但保留独立 ID／预期／真实施法证据。
2. 差异先记录复现和影响范围；共享引擎／生成器的修复交协调窗口串行合并。
3. 单独更新本片状态；汇总窗口合并到 `data/audit/gow-skill-reviews.json` 后运行同指纹全量验证，只有账本 `acceptance.accepted` 才计入签收。
## 本轮静态核验（worker-fast-04，2026-09-27）

只读对照 `data/raw/troops.gow.en.json` 的英文 `stats.spell.desc`、`SpellId/ManaCost/_ManaColors_parsed`，`data/raw/spells.gow.en.json` 各技能 Id 的 `data.Cost/Target/SpellSteps`，与 `artifacts/gow-skill-audit/ledger.json` 的最终 `runtime.prototype/manaCost/manaColors/description` 及 `src/data/troops.json` 中文。逐项自行检查，不直接采用既有审计结论。以下均为**单一原生伤害步骤**、无后续步骤；本记录**不是正式验收**，未执行测试/实战/全量审计。

- **troop:6255 / 7398 — 静态相符**。EN: “Deal [Magic + 6] damage to an enemy. Deal triple damage if they use Red Mana.” 原生 `Damage/FromTarget`、外层 `Target:Enemy`、`Amount:6/SpellPowerMultiplier:1/StatusModifier:MultiplyForRedTarget/StatusAmount:3`，Cost 12，蓝/黄。最终 `damage(enemyChosen,{base:6,mult:1},condMult:3 if targetColor Red)`；中文“对 1 名敌人造成 [魔法 + 6] 点伤害。如果对方使用红色法力值，则造成三倍伤害。”，费用12、蓝/黄。倍率条件按目标使用的颜色，非施法费用颜色；字段与顺序吻合。
- **troop:6306 / 7456 — 证据不足（最弱两名的比较口径）**。EN: “Deal [Magic + 2] damage to the two weakest  enemies. Deal double damage if I am damaged.” 原生 `Damage/TwoWeakestEnemies/Amount:2/SpellPowerMultiplier:1/StatusModifier:MultiplyForCasterDamaged/StatusAmount:2`，Cost 15，红/棕。最终 `damage(enemyWeakestN,n:2,{base:2,mult:1},condMult:2 if selfHpDamaged)`；中文“对两名最虚弱的敌人造成 [魔法 + 2] 点伤害。若自身的生命值受损，则造成两倍伤害。”，费用15、红/棕。数量2、倍率2、施法者条件吻合；`src/engine/skills/targeting.ts` 的 `enemyWeakestN` 按当前 hp 升序取两名，英文/原生没有解释 weakest 按 hp/战力或平手排序，暂不认证排序等价性。
- **troop:6370 / 7522 — 静态相符**。EN: “Deal [Magic + 1] damage to an enemy. Deal triple damage if the enemy uses Blue Mana.” 原生 `Damage/FromTarget`、`Target:Enemy`、`Amount:1/SpellPowerMultiplier:1/StatusModifier:MultiplyForBlueTarget/StatusAmount:3`，Cost 10，蓝/紫。最终 `damage(enemyChosen,{base:1,mult:1},condMult:3 if targetColor Blue)`；中文“对 1 名敌人造成 [魔法 + 1] 点伤害。如果敌人使用蓝色法力值，则造成三倍伤害。”，费用10、蓝/紫；颜色条件、乘法、目标均对齐。
- **troop:6373 / 7525 — 静态相符**。EN: “Deal [Magic + 4] damage to an enemy. Deal triple damage if the enemy is Silenced.” 原生 `Damage/FromTarget`、`Target:Enemy`、`Amount:4/SpellPowerMultiplier:1/StatusModifier:MultiplyForSilence/StatusAmount:3`，Cost 12，紫/棕。最终 `damage(enemyChosen,{base:4,mult:1},condMult:3 if targetStatus silence)`；中文“对 1 名敌人造成 [魔法 + 4] 点伤害。如果敌人已陷入沉默状态，则造成三倍伤害。”，费用12、紫/棕；条件、倍率和展示对齐。
- **troop:6548 / 7742 — 明确差异（狂怒状态别名漏判）**。EN: “Deal [Magic + 4] damage to an enemy. Deal double damage if the enemy is Enraged.” 原生 `Damage/FromTarget`、`Target:Enemy`、`Amount:4/SpellPowerMultiplier:1/StatusModifier:MultiplyForEnraged/StatusAmount:2`，Cost 10，绿/紫。最终 `damage(enemyChosen,{base:4,mult:1},condMult:2 if targetStatus rage)`；中文“对一名敌人造成 [魔法 + 4] 点伤害。若敌人身处狂怒状态，则造成双倍伤害。”，费用10、绿/紫。引擎 `src/engine/skills/effects/status.ts` 的 `RAGE_STATUS_IDS` 同时收纳 `rage` 与 `enraged`，且 `src/engine/types.ts` 的 `enrageGem` 赋予 `enraged`；但 `src/engine/skills/effects/secondary.ts` 的 `targetStatus` **严格比对 `s.id===cond.statusId`**，只接受 `rage`。复现条件：敌人仅有仍生效的 `enraged`（无 `rage`），Magic=10 时名义基础14，原生/英文应 ×2=28，最终分支仅14（实际 HP/护甲结算另计）；敌人有 `rage` 时可翻倍。差异限定 `enraged` 状态目标。

本片：静态相符 3（troop:6255/7398、troop:6370/7522、troop:6373/7525），明确差异 1（troop:6548/7742），证据不足 1（troop:6306/7456）。待协调窗口复核/修复，本轮不改技能代码、测试、总账或签收记录。
