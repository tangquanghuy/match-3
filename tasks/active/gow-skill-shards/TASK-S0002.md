# 技能验收分片 S0002（5 项）

> 本页分工固定，不随每次验收队列重排；状态与签收实时读取账本及本片记录。本页的“核对完成”不等于整项签收。
> 总任务：[技能核对任务书](../TASK-GOW-SKILL-REVIEW.md) · [操作指南](../../../docs/gow-skill-review-operator-guide.md) · [分片状态](STATUS.md)。

| 实体 | 技能 ID | 参考名称 |
|---|---:|---|
| `troop:6617` 皇冠 | 7946 | KingsCrown |
| `troop:6618` 神灯 | 7946 | GeniesLamp |
| `troop:6619` 神圣瑰宝 | 7946 | SacredTreasure |
| `troop:7030` 维纳图斯 | 8557 | Veneratus |
| `troop:7092` 纱雅乐 | 8627 | Shayle |

## 交付要求

1. 每项原版英文子句／原始步骤／分支与最终原型逐条对照，复用同构测试但保留独立 ID／预期／真实施法证据。
2. 差异先记录复现和影响范围；共享引擎／生成器的修复交协调窗口串行合并。
3. 单独更新本片状态；汇总窗口合并到 `data/audit/gow-skill-reviews.json` 后运行同指纹全量验证，只有账本 `acceptance.accepted` 才计入签收。

## 本轮静态核验（worker-fast-01，2026-09-27；非正式签收）

范围与 S0001 相同：原始 troop 英文/SpellId/费用颜色 → 对应原生 SpellSteps → 成品实体与账本 `runtime.prototype` → curated/effects 语义抽查。下列结论均非测试或正式签收。

- `troop:6617` / SpellId **7946** / **verdict=一致（静态范围）**。英文“Gain 20 Gold.”；原生 `SpellSteps[0]={Type:GiveGold,Target:Self,Amount:20}`、`Cost:7`；原型 `segments[0]={kind:gainEconomy,currency:gold,scaling:{base:20,mult:0}}`，`effects/economy.ts` 给施法方入账。原始与成品 spell.id=7946、费用 7、**紫**一致；中文“给予 20 黄金。”表意相符；未核本实体真施法。
- `troop:6618` / SpellId **7946** / **verdict=一致（静态范围）**。英文“Gain 20 Gold.”；原生 `SpellSteps[0].Type=GiveGold,Target=Self,Amount=20`；原型 `gainEconomy/gold/scaling:{base:20,mult:0}`；原始与成品 spell.id=7946、费用 7、**黄**一致；中文“给予 20 黄金。”相符。共享原型但颜色/绑定独立核对；未核真施法。
- `troop:6619` / SpellId **7946** / **verdict=一致（静态范围）**。英文“Gain 20 Gold.”；原生 `SpellSteps[0].Type=GiveGold,Target=Self,Amount=20`；原型 `gainEconomy/gold/scaling:{base:20,mult:0}`；原始与成品 spell.id=7946、费用 7、**红**一致；中文“给予 20 黄金。”相符。共享原型但颜色/绑定独立核对；未核真施法。
- `troop:7030` / SpellId **8557** / **verdict=明确差异**。英文“Convert all Red Gems into Yellow Dragon Gems.”；原生 `SpellSteps[0]={Type:ConvertGems,Color1:Red,Color2:DragonYellow,Amount:100}`。原型 `segments[0]={kind:gem,params:{op:transform,from:Red,to:Yellow}}`，`batch-r8.ts` 使用 `transform(BaseColor.Red,BaseColor.Yellow)`；`effects/gems.ts` 的 `toSpecial` 才解析特殊宝石。**实际输出普通黄色而非黄色龙宝石**，丢失龙宝石的匹配/破坏语义；中文“将所有红色宝石转换成黄龙宝石。”仍声称龙宝石。源/成品 spell.id=8557、费用 13、蓝/绿一致；差异仅特殊终点类型。建议处理层级：共享技能 8557 的 curated 组装端点映射（使用带 Yellow 色的 dragonGem 特殊端点），再核共用 gem 转换/战斗结算及单实体回归；影响绑定该 SpellId 的实体需汇总排查。
- `troop:7092` / SpellId **8627** / **verdict=明确差异**。英文“Convert a Mana Gem into an Elemental Star.”；原生 `Target:ManaGemsOnly, SpellSteps[0]={Type:CreateGems,Color1:ElementalStar,Amount:1,BoardTarget:SingleGem}`。原型 `segments[0]={kind:gem,params:{op:transform,from:ANY,to:SKULL,toSpecial:elementalStar,count:{base:1,mult:0}}}`；`batch-r14.ts` 的 `transformToSpecial('ANY',...)`、`effects/gems.ts` 的 `from=ANY` 收集全部非目标宝石并随机 `pickN`，**可消耗骷髅/其他特殊宝石而非仅 Mana Gem，且未保留 SingleGem 选格约束**；目标 elementalStar 与数量 1 正确。中文“将一颗法力宝石转换成一颗元素星。”与原型来源范围不符。源/成品 spell.id=8627、费用 10、黄/棕一致。建议处理层级：8557 之外的技能 8627 curated 来源选择/目标约束，若现有 gem 原语缺少“选中法力宝石”过滤需协调共用选格原语，再补选中有色/选中骷髅/不选格等真实施法边界。

两项明确差异均来自原生端点/目标与执行代码的语义对照；其余 3 项只完成静态核字段，尚待测试、签收复核。
