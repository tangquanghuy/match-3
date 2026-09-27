# 技能验收分片 S0012（5 项）

> 本页分工固定，不随每次验收队列重排；状态与签收实时读取账本及本片记录。本页的“核对完成”不等于整项签收。
> 总任务：[技能核对任务书](../TASK-GOW-SKILL-REVIEW.md) · [操作指南](../../../docs/gow-skill-review-operator-guide.md) · [分片状态](STATUS.md)。

| 实体 | 技能 ID | 参考名称 |
|---|---:|---|
| `weapon:1046` 拳头粉碎棒 | 7111 | KnuckleSmasher |
| `weapon:1047` 砍头劈刀 | 7112 | HeadCleaver |
| `weapon:1048` 死亡的拥抱 | 7113 | DeathsGrasp |
| `weapon:1050` 魔焰 | 7115 | Spellfire |
| `weapon:1052` 安努神的权杖 | 7118 | AnusSceptre |

## 交付要求

1. 每项原版英文子句／原始步骤／分支与最终原型逐条对照，复用同构测试但保留独立 ID／预期／真实施法证据。
2. 差异先记录复现和影响范围；共享引擎／生成器的修复交协调窗口串行合并。
3. 单独更新本片状态；汇总窗口合并到 `data/audit/gow-skill-reviews.json` 后运行同指纹全量验证，只有账本 `acceptance.accepted` 才计入签收。

## 本轮静态核验（worker-fast-02；2026-09-27；非正式验收）

对照来源同 S0011：`artifacts/gowhead-weapons/weapons.json` 英文／原始费用颜色；`data/raw/spells.gow.en.json` 对应 `RawData.SpellSteps`；`src/data/weapons.json` 当前费用颜色中文；`artifacts/gow-skill-audit/ledger.json` 的 `runtime.prototype`；核 `src/engine/skills/curated/batch-w01.ts` 最终组装、`index.ts` W01-W05 覆盖与 `src/engine/skills/library.ts` 中数字法术／出战 `gw_` 双注册（目录 ID 由 `src/meta/data/weaponCatalog.ts` 生成），7111／7115 另读 `src/data/gowDamageRules.json`、`src/engine/skills/gowDamageRules.ts` 的最终修正及伤害效果分支。本片全部单一原生步骤、无条件分支／多步骤先后；仅静态核对，未跑测试或真实施法、不构成签收。

- **weapon:1046 / 7111，verdict=一致（静态字段）**。英文 “Deal [Magic + 4] light splash damage to an enemy.”；`SpellSteps[0]={Type:SplashDamage,Target:FromTarget,Amount:4,SpellPowerMultiplier:1,Primarypower:true}`；最终 `runtime.prototype.segments[0]={kind:damage,target:enemyChosen,scaling:{base:4,mult:1},range:splash,splashRatio:0.25}`，W01 7111 与 `gowDamageRules[7111].splash=[0.25]` 一致；源／当前费用 12／12，Brown／Brown；中文“对一名敌人造成 [魔法 + 4] 点轻度溅射伤害。”相符。法术数值 `7111`／出战 `gw_KnuckleSmasher` 双注册。溅射相邻格及比例实际结算未测。
- **weapon:1047 / 7112，verdict=一致（静态字段）**。英文 “Deal [Magic + 6] damage to the first Enemy.”；`SpellSteps[0]={Type:Damage,Target:FrontEnemy,Amount:6,SpellPowerMultiplier:1,Primarypower:true}`；`segments[0]={kind:damage,target:enemyFront,scaling:{base:6,mult:1}}`，W01 7112 同形；源／当前费用 11／11、Red／Red；中文“对第一名敌人造成 [魔法 + 6] 点伤害。”相符；数值 `7112`／出战 `gw_HeadCleaver` 双注册，第一名敌人实际选取未测。
- **weapon:1048 / 7113，verdict=一致（静态字段）**。英文 “Deal [Magic + 2] damage to all Enemies.”；`SpellSteps[0]={Type:Damage,Target:AllEnemies,Amount:2,SpellPowerMultiplier:1,Primarypower:true}`；`segments[0]={kind:damage,target:enemyAll,scaling:{base:2,mult:1},range:all}`，W01 7113 同形；源／当前费用 14／14，Purple／Purple；中文“对所有敌人造成 [魔法 + 2] 点伤害。”相符；数值 `7113`／出战 `gw_DeathsGrasp` 双注册，全体目标实际受击未测。
- **weapon:1050 / 7115，verdict=一致（静态字段）**。英文 “Deal [Magic + 8] scatter damage.”；`SpellSteps[0]={Type:ScatterDamage,Target:AllEnemies,Amount:8,SpellPowerMultiplier:1,Primarypower:true}`；W01 7115 初组装 `range:all`，但**最终**经 `gowDamageRules[7115].scatter=true` 与 `applyGowDamageRule` 修正为 `runtime.prototype.segments[0]={kind:damage,target:enemyAll,scaling:{base:8,mult:1},range:scatter}`；`effects/damage.ts` 散射分支分配共享伤害池。源／当前费用 10／10，Purple／Purple；中文“对所有敌人造成 [魔法 + 8] 点散射伤害。”相符；数值 `7115`／出战 `gw_Spellfire` 双注册；随机分配实战未测，不能只以 W01 中间态 `all` 判断差异。
- **weapon:1052 / 7118，verdict=一致（静态字段）**。英文 “Destroy all Gems of a chosen Color.”；`SpellSteps[0]={Type:DestroyColor,Color1:FromTarget,Amount:100}`；`runtime.prototype.segments[0]={kind:gem,params:{op:clear,mode:destroy,target:{kind:color,color:CHOSEN}}}`，W01 7118 用 `destroyColor(CHOSEN)`，`effects/gems.ts` `CHOSEN` 取 chosenColor、color 目标遍历全盘该色。源／当前费用 9／9，Blue／Blue；中文“摧毁选定颜色的所有宝石。”相符；数值 `7118`／出战 `gw_AnusSceptre` 双注册；选色与实际棋盘变化未测。

本片静态相符 ID：1046、1047、1048、1050、1052；明确差异 ID：无；静态证据不足 ID：无。上述十项的实际出战绑定／目标抽样／伤害与棋盘结算尚需测试和正式签收复核。