# 技能验收分片 S0014（5 项）

> 本页分工固定，不随每次验收队列重排；状态与签收实时读取账本及本片记录。本页的“核对完成”不等于整项签收。
> 总任务：[技能核对任务书](../TASK-GOW-SKILL-REVIEW.md) · [操作指南](../../../docs/gow-skill-review-operator-guide.md) · [分片状态](STATUS.md)。

| 实体 | 技能 ID | 参考名称 |
|---|---:|---|
| `weapon:1093` 扳手行家 5000 | 7218 | Wrenchmaster5000 |
| `weapon:1139` 恶魔召唤卷 | 7309 | Daemonomicon |
| `weapon:1166` 英雄之剑 | 7585 | SwordOfHeroes |
| `weapon:1526` 北极星 | 8966 | TheNorthStar |
| `weapon:1625` 衰败圣契 | 9573 | LibramOfDecay |

## 交付要求

1. 每项原版英文子句／原始步骤／分支与最终原型逐条对照，复用同构测试但保留独立 ID／预期／真实施法证据。
2. 差异先记录复现和影响范围；共享引擎／生成器的修复交协调窗口串行合并。
3. 单独更新本片状态；汇总窗口合并到 `data/audit/gow-skill-reviews.json` 后运行同指纹全量验证，只有账本 `acceptance.accepted` 才计入签收。

## 本轮静态核验（worker-fast-03，2026-09-27）

仅核本片 5 项：逐实体交叉保存的 `artifacts/gowhead-weapons/weapons.json` 英文、`data/raw/spells.gow.en.json` 的 SpellSteps、`src/data/weapons.json` 中文/实体费用颜色与 `artifacts/gow-skill-audit/ledger.json` 的 `runtime.prototype`；特殊目标与转换另读 `src/engine/skills/effects/gems.ts`、`src/engine/skills/cellChooser.ts`。每项均查看原生步骤数、目标/颜色、公式/概率/状态/执行顺序；**静态核验不等于正式签收**，未跑测试或实际施法，未依赖既有审计状态判断。

| 实体 / 技能 ID | verdict | 逐项定位依据 |
|---|---|---|
| `weapon:1093` / **7218** | **静态相符** | 英文 `Give [Magic + 1] Armor to all Allies.`；原生唯一 `IncreaseArmor(Target=AllAllies,Amount=1,SpellPowerMultiplier=1)`；原型唯一 `buff(target=allyAll,stat=armor,scaling=1+M)`，中文“所有盟友……护甲值”；费用 **12**、**黄**一致；无条件/概率/后续状态。 |
| `weapon:1139` / **7309** | **证据不足** | 英文 `Summon a random Daemon.`，原生唯一 `SummoningType(Data=daemon)`，原型唯一 `summon(randomOf=[…])`，中文“随机恶魔”，费用 **16**、**紫**相符。直接比对原型 `randomOf` 与 `src/data/troops.json` 中 `troopTypes` 含 `Daemon` 的 **179** 项完全相同；但 `data/raw/troops.gow.en.json` 中 `TroopType/TroopType2=Daemon` 有 **182** 项，另有 `HellfireBallista`(7908)、`RubyImp`(7907)、`HellTroll`(7906) 三项未进入本地部队数据/原型池。快照未给出原生召唤是否排除这些尚未入库的兵种的规则；王国/种族池是否与原生等价仍待补证，暂不把名单差额直接当已确诊技能缺陷。 |
| `weapon:1166` / **7585** | **静态相符** | 英文 `Deal [Magic + 5] damage to a random Enemy.`；原生唯一 `Damage(Target=RandomEnemy,Amount=5,SpellPowerMultiplier=1)` 对应原型唯一 `damage(enemyRandom,base=5,mult=1)`，中文“随机敌人”相符；费用 **6**、**蓝**一致；单步无状态/概率分支。 |
| `weapon:1526` / **8966** | **明确差异** | 英文 `Convert a selected Mana Gem into a x3 Wildcard.`；原生唯一 `CreateGems(BoardTarget=SingleGem,Color1=WildCard3,Amount=1)`；原型 `gem transform(from=CELL,toSpecial={kind:wildcard,tier:3})` 对选格/目标类型/单颗数量一致，中文也指明**法力宝石**，费用 **14**、**蓝/绿**一致；但 `src/engine/skills/cellChooser.ts` 可选任意非空格，`effects/gems.ts` 的 `from=CELL` 无 `gem.type.kind==='color'` 审核，会把骷髅/特殊宝石也转成 x3 通配；英文限定的“Mana Gem”输入类型未落实。原生 `BoardTarget=SingleGem` 自身未写颜色过滤，需后续原生语义复核，但当前中文及英文限定和实际执行已有可定位的不一致。 |
| `weapon:1625` / **9573** | **明确差异** | 英文 `Convert all Gems of a chosen Color into Decaying Gems.`；原生唯一 `ConvertGems(Color1=FromTarget,Color2=Decay,Amount=100)`；中文“所选颜色的所有宝石”对应选色后同色转换；但原型 `gem transform(from=ANY,toSpecial=decayGem)`。`src/engine/skills/effects/gems.ts` 的 `ANY` 分支收集**全盘一切非目标类型宝石**（含其他颜色、骷髅），不是所选一种颜色；没有 `CHOSEN` 来源选色。费用 **14**、**绿/紫**一致；差异影响目标颜色与转换数量，单步无其他概率/状态。 |

本片计数：**静态相符 2**（7218、7585）；**明确差异 2**（8966、9573）；**证据不足 1**（7309）。本片待修转换输入/选色问题，7309 原生恶魔池资格未决；本报告不构成正式签收。
