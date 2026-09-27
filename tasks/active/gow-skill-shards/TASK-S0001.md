# 技能验收分片 S0001（5 项）

> 本页分工固定，不随每次验收队列重排；状态与签收实时读取账本及本片记录。本页的“核对完成”不等于整项签收。
> 总任务：[技能核对任务书](../TASK-GOW-SKILL-REVIEW.md) · [操作指南](../../../docs/gow-skill-review-operator-guide.md) · [分片状态](STATUS.md)。

| 实体 | 技能 ID | 参考名称 |
|---|---:|---|
| `troop:6169` 德拉古力斯 | 7302 | Draakulis |
| `troop:6178` 夸赛魔 | 7319 | Quasit |
| `troop:6614` 钱袋 | 7946 | CoinPurse |
| `troop:6615` 金戒指 | 7946 | GoldRing |
| `troop:6616` 祭司圣杯 | 7946 | PriestsChalice |

## 交付要求

1. 每项原版英文子句／原始步骤／分支与最终原型逐条对照，复用同构测试但保留独立 ID／预期／真实施法证据。
2. 差异先记录复现和影响范围；共享引擎／生成器的修复交协调窗口串行合并。
3. 单独更新本片状态；汇总窗口合并到 `data/audit/gow-skill-reviews.json` 后运行同指纹全量验证，只有账本 `acceptance.accepted` 才计入签收。

## 本轮静态核验（worker-fast-01，2026-09-27；非正式签收）

范围：逐实体读取 `data/raw/troops.gow.en.json` 的 `SpellId`、英文 spell.desc、ManaCost、_ManaColors_parsed；按 SpellId 查 `data/raw/spells.gow.en.json` 的 `data/RawData`；核对 `src/data/troops.json` 的 spell.id／manaCost／manaColors／中文描述、账本 `runtime.prototype`，再查看相关 curated 与 effects 代码。下列“一致”只表示这些已核字段静态语义相符；未运行战斗、测试或全量验证。

- `troop:6169` / SpellId **7302** / **verdict=一致（静态范围）**。英文“Steal [Magic + 5] Life from all Enemies.”；原生 `SpellSteps[0]={Type:StealLife,Target:AllEnemies,Amount:5,SpellPowerMultiplier:1,Primarypower:true}`、`Target:None`。原型 `segments[0]={kind:damage,target:enemyAll,scaling:{base:5,mult:1},range:all,drain:true}`；`batch-01.ts` 登记同一 ID，`effects/damage.ts` 的 drain 取实际失血并绕甲。原始 SpellId=成品 spell.id=7302，费用 20、蓝/绿/红一致；中文“窃取所有敌人 [魔法 + 5] 点生命值。”与原文相符。未核真施法中的屏障/死亡边界。
- `troop:6178` / SpellId **7319** / **verdict=一致（静态范围）**。英文“Eliminate [Magic + 1] points of a random Skill from an Enemy.”；原生 `SpellSteps[0]={Type:DecreaseRandom,Target:FromTarget,Amount:1,SpellPowerMultiplier:1,Primarypower:true}`、`Target:Enemy`。原型 `segments[0]={kind:reduce,target:enemyChosen,stat:random,scaling:{base:1,mult:1}}`；`batch-r12.ts` 和 `effects/debuff.ts` 显示每步随机攻/甲/魔之一；与敌人单体、随机属性、数值相符。原始 SpellId=成品 spell.id=7319；费用 9、紫一致，中文“减除一名敌人 [魔法 + 1] 点随机技能值。”相符。未核 RNG/免疫/最低值边界。
- `troop:6614` / SpellId **7946** / **verdict=一致（静态范围）**。英文“Gain 20 Gold.”；原生 `SpellSteps[0]={Type:GiveGold,Target:Self,Amount:20}`、`Target:None`、`Cost:7`；原型 `segments[0]={kind:gainEconomy,currency:gold,scaling:{base:20,mult:0}}`，`batch-r18.ts` 调 `gainGold(20)`，`effects/economy.ts` 给施法方记账。原始及成品 spell.id 均 7946、费用 7、**棕**一致；中文“给予 20 黄金。”表意一致。未核单实体真施法。
- `troop:6615` / SpellId **7946** / **verdict=一致（静态范围）**。英文“Gain 20 Gold.”；原生 `SpellSteps[0].Type=GiveGold,Target=Self,Amount=20`；原型 `gainEconomy/gold/scaling:{base:20,mult:0}`；原始及成品 spell.id=7946、费用 7、**绿**一致；中文“给予 20 黄金。”相符。与 6614 共享法术原型但该实体绑定/颜色独立核对；未核真施法。
- `troop:6616` / SpellId **7946** / **verdict=一致（静态范围）**。英文“Gain 20 Gold.”；原生 `SpellSteps[0].Type=GiveGold,Target=Self,Amount=20`；原型 `gainEconomy/gold/scaling:{base:20,mult:0}`；原始及成品 spell.id=7946、费用 7、**蓝**一致；中文“给予 20 黄金。”相符。共享同一 SpellId 不代表可跳过本实体绑定；未核真施法。

待协调窗口对各实体单独补真实施法、逆向边界与签收证据；此处不引用账本旧状态充当验收。
