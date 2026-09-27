# 技能验收分片 S0011（5 项）

> 本页分工固定，不随每次验收队列重排；状态与签收实时读取账本及本片记录。本页的“核对完成”不等于整项签收。
> 总任务：[技能核对任务书](../TASK-GOW-SKILL-REVIEW.md) · [操作指南](../../../docs/gow-skill-review-operator-guide.md) · [分片状态](STATUS.md)。

| 实体 | 技能 ID | 参考名称 |
|---|---:|---|
| `weapon:1033` 腐朽镰刀 | 7099 | ScytheOfCorruption |
| `weapon:1034` 神性长枪 | 7100 | LanceOfTheDivine |
| `weapon:1041` 正中靶心 | 7106 | Bullseye |
| `weapon:1042` 霹雳雷火 | 7107 | Thunderbolt |
| `weapon:1045` 恶意扭曲 | 7110 | TwistedMalice |

## 交付要求

1. 每项原版英文子句／原始步骤／分支与最终原型逐条对照，复用同构测试但保留独立 ID／预期／真实施法证据。
2. 差异先记录复现和影响范围；共享引擎／生成器的修复交协调窗口串行合并。
3. 单独更新本片状态；汇总窗口合并到 `data/audit/gow-skill-reviews.json` 后运行同指纹全量验证，只有账本 `acceptance.accepted` 才计入签收。

## 本轮静态核验（worker-fast-02；2026-09-27；非正式验收）

独立来源：`artifacts/gowhead-weapons/weapons.json` 的 `weapons[].stats.spell.desc`、SpellId、ManaCost、`_ManaColors_parsed`；`data/raw/spells.gow.en.json` 同 Id 原生 `RawData.SpellSteps`；`src/data/weapons.json` 的最终中文、费用颜色；逐项对照账本 `artifacts/gow-skill-audit/ledger.json` 的 `runtime.prototype`，并复核 `src/engine/skills/curated/batch-w01.ts`、`index.ts` 的武器最终批次和 `src/engine/skills/library.ts` 数字法术 ID／`gw_<referenceName>` 双注册、`src/meta/data/weaponCatalog.ts` 出战键来源。本片均只有单个原生步骤，无条件分支／多步骤先后。每项 verdict **仅覆盖所写的静态字段**；未跑测试、真实施法、正式签收。

- **weapon:1033 / 7099，verdict=一致（静态字段）**。英文 “Deal [Magic + 2] damage to all Enemies.”；`SpellSteps[0]={Type:Damage,Target:AllEnemies,Amount:2,SpellPowerMultiplier:1,Primarypower:true}`；`runtime.prototype.segments[0]={kind:damage,target:enemyAll,scaling:{base:2,mult:1},range:all}`，W01 7099 组装同形；源／当前费用 12／12，Purple／Purple；中文“对所有敌人造成 [魔法 + 2] 点伤害。”相符。源码武器目录 referenceName=`ScytheOfCorruption`，注册数值 `7099` 与出战 `gw_ScytheOfCorruption` 指向同一组装原型；真实命中未测。
- **weapon:1034 / 7100，verdict=一致（静态字段）**。英文 “Deal [Magic + 9] damage to a random Enemy.”；`SpellSteps[0]={Type:Damage,Target:RandomEnemy,Amount:9,SpellPowerMultiplier:1,Primarypower:true}`；`segments[0]={kind:damage,target:enemyRandom,scaling:{base:9,mult:1}}`，W01 7100 同形；源／当前费用 8／8，Yellow／Yellow；中文“对 1 名随机的敌人造成 [魔法 + 9] 点伤害。”相符；对应数值 `7100` 与 `gw_LanceOfTheDivine` 双绑定，随机目标实战未测。
- **weapon:1041 / 7106，verdict=一致（静态字段）**。英文 “Deal [Magic + 3] true damage to an Enemy.”；`SpellSteps[0]={Type:TrueDamage,Target:FromTarget,Amount:3,SpellPowerMultiplier:1,Primarypower:true}`；`segments[0]={kind:damage,target:enemyChosen,scaling:{base:3,mult:1},trueDamage:true}`，W01 7106 使用 `trueDmg`；源／当前费用 14／14，Green／Green；中文“对 1 名敌人造成 [魔法 + 3] 点真实伤害。”相符；数值 `7106` 与出战 `gw_Bullseye` 双绑定，绕甲效果未实测。
- **weapon:1042 / 7107，verdict=一致（静态字段）**。英文 “Deal [Magic + 4] true damage to a random Enemy.”；`SpellSteps[0]={Type:TrueDamage,Target:RandomEnemy,Amount:4,SpellPowerMultiplier:1,Primarypower:true}`；`segments[0]={kind:damage,target:enemyRandom,scaling:{base:4,mult:1},trueDamage:true}`，W01 7107 同形；源／当前费用 12／12，Yellow／Yellow；中文“对 1 名随机的敌人造成 [魔法 + 4] 点真实伤害。”相符；数值 `7107` 与出战 `gw_Thunderbolt` 双绑定，随机/绕甲实战未测。
- **weapon:1045 / 7110，verdict=一致（静态字段）**。英文 “Deal 3 - [Magic + 10] damage to an Enemy.”；`SpellSteps[0]={Type:RandomDamage,Target:FromTarget,Amount:10,SpellPowerMultiplier:1,Primarypower:true}`；`segments[0]={kind:damage,target:enemyChosen,scaling:{base:0,mult:0},rangeSpec:{min:{base:3,mult:0},max:{base:10,mult:1}}}`，W01 7110 同形；源／当前费用 11／11，Red／Red；中文“对 1 名敌人造成 3 到 [魔法 + 10] 点伤害。”相符；数值 `7110` 与出战 `gw_TwistedMalice` 双绑定，区间抽样未实测。

本片静态相符 ID：1033、1034、1041、1042、1045；明确差异 ID：无；静态证据不足 ID：无。全部条目的真实战斗与签收证据未核，静态相符不等于整项验收。