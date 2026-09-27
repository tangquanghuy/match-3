# 技能验收分片 S0004（5 项）

> 本页分工固定，不随每次验收队列重排；状态与签收实时读取账本及本片记录。本页的“核对完成”不等于整项签收。
> 总任务：[技能核对任务书](../TASK-GOW-SKILL-REVIEW.md) · [操作指南](../../../docs/gow-skill-review-operator-guide.md) · [分片状态](STATUS.md)。

| 实体 | 技能 ID | 参考名称 |
|---|---:|---|
| `troop:7163` 游戏管理员 | 8738 | GameWarden |
| `troop:7164` 月亮法师 | 8739 | MoonMage |
| `troop:7276` 末日石像鬼 | 8901 | DoomedGargoyle |
| `troop:7306` 伏見稻荷 | 8918 | Inari |
| `troop:7328` 蜘蛛皇座 | 8940 | TheSpiderThrone |

## 交付要求

1. 每项原版英文子句／原始步骤／分支与最终原型逐条对照，复用同构测试但保留独立 ID／预期／真实施法证据。
2. 差异先记录复现和影响范围；共享引擎／生成器的修复交协调窗口串行合并。
3. 单独更新本片状态；汇总窗口合并到 `data/audit/gow-skill-reviews.json` 后运行同指纹全量验证，只有账本 `acceptance.accepted` 才计入签收。

## 本轮静态核验（worker-fast-02；2026-09-27；非正式验收）

取证：分别读 `data/raw/troops.gow.en.json` 的 `stats.spell.desc`／SpellId／费用／颜色、`data/raw/spells.gow.en.json` 的 `RawData.SpellSteps`、`src/data/troops.json` 的费用颜色中文，逐字段比对账本 `artifacts/gow-skill-audit/ledger.json` 中 `runtime.prototype`；另核 `src/engine/skills/curated/index.ts` 的批次覆盖顺序及下述有效组装条目与 `src/engine/skills/effects/gems.ts` 的实际转化目标选择。未以账本差异状态推定结论。本片全为 troop，不涉及武器额外 `gw_` 出战键；五条均只有一个原生步骤、无条件分支和后续步骤，因而无跨步骤先后问题。以下仅为字段静态核验，**没有运行测试／实战／正式验收**。

- **troop:7163 / spell 8738，verdict=明确差异（中文展示；执行原型相符）**。英文短句：“Convert all Green Gems to Skulls.”；原生 `SpellSteps[0]={Type:ConvertGems,Color1:Green,Color2:Skull,Amount:100}`；当前 `runtime.prototype.segments[0]={kind:gem,params:{op:transform,from:Green,to:SKULL}}`，有效组装 `batch-03.ts` 8738，缺省无 `count` 即全盘匹配；原始／现费用 10／10、Brown／Brown。当前中文 `src/data/troops.json spell.description` 为“ 将绿色宝石转换成骷髅头。”：首字符多空格，且原文 **all Green Gems** 的“所有”未显式表达。建议处理层级：**实体中文描述／对应批次 desc**，去空格并明确“所有绿色宝石”；无需仅凭此改原型。是否构成玩法实效差异尚未实测。
- **troop:7164 / spell 8739，verdict=一致（静态字段）**。英文：“Deal [(Magic / 2) + 4] damage to all Enemies.”；原生 `SpellSteps[0]={Type:Damage,Target:AllEnemies,Amount:4,SpellPowerMultiplier:0.5,Primarypower:true}`；当前 `segments[0]={kind:damage,target:enemyAll,scaling:{base:4,mult:0.5},range:all}`，有效组装 `batch-03.ts` 8739；源／现费用 9／9，颜色 Blue+Purple／Blue+Purple；中文“对所有敌人造成 [(魔法 / 2) + 4] 点伤害。”吻合。半魔法舍入／真实施法未测。
- **troop:7276 / spell 8901，verdict=明确差异（棋盘选格和数量）**。英文短句：“Convert a chosen Mana Gem to an Uber Doomskull.”；原生 `SpellSteps[0]={Type:ConvertGems,Color1:FromTarget,Color2:UberDoomskull,Amount:1,BoardTarget:SingleGem}`；当前 `runtime.prototype.segments[0]={kind:gem,params:{op:transform,from:CHOSEN,to:SKULL,toSpecial:uberDoomSkull}}`，有效组装 `batch-r4.ts` 8901 写 `transformToSpecial(CHOSEN,'uberDoomSkull')`。`effects/gems.ts doTransform` 在缺少 `params.count` 时会转化**全盘**所选颜色而非单格，`CHOSEN` 是选色而非 `CELL` 的 chosenCell；`BoardTarget=SingleGem`／`Amount=1` 都未落到当前原型。源／现费用 12／12，颜色 Red+Brown／Red+Brown；中文“将一个选定的法力颜色宝石转换成一颗超级末日骷髅头。”描述是单颗，与当前行为不符。建议处理层级：**实体组装 `batch-r4.ts` 8901 + 目标解析／原语适配核对**（单格 `CELL` 并确认仅允许法力颜色格；只加 `count:1` 会在全盘同色随机选一颗，仍非选中那一格）。无需猜测多步时序；建议协调窗口修复并定向实测。
- **troop:7306 / spell 8918，verdict=一致（静态字段）**。英文：“Convert Green Gems to Spirit Gems.”；原生 `SpellSteps[0]={Type:ConvertGems,Color1:Green,Color2:Spirit,Amount:100}`；当前 `segments[0]={kind:gem,params:{op:transform,from:Green,to:SKULL,spiritColorFromSource:true,toSpecial:spiritGem}}`，有效组装 `batch-r14.ts` 8918，`effects/gems.ts` 将 Spirit 的颜色绑定到来源 Green，缺省全部转化；源／现费用 12／12，Yellow+Purple／Yellow+Purple；中文“将所有绿色宝石转换成灵力宝石。”相符。Spirit 结算／实际棋盘变化未测。
- **troop:7328 / spell 8940，verdict=一致（静态字段）**。英文：“Convert all Brown Gems to Web Gems.”；原生 `SpellSteps[0]={Type:ConvertGems,Color1:Brown,Color2:Web,Amount:100}`；当前 `segments[0]={kind:gem,params:{op:transform,from:Brown,to:SKULL,toSpecial:web}}`，有效组装 `batch-34.ts` 8940，全盘匹配；源／现费用 12／12、Green+Red／Green+Red；中文“将所有棕色宝石转换成织网宝石。”吻合。Web 宝石实战细节未测。

本片明确差异 ID：troop:7163（仅展示）、troop:7276（原型行为）；静态字段未决 ID：无。五项的实战／测试／签收仍需后续窗口独立复核。
