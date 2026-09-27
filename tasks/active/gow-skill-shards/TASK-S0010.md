# 技能验收分片 S0010（5 项）

> 本页分工固定，不随每次验收队列重排；状态与签收实时读取账本及本片记录。本页的“核对完成”不等于整项签收。
> 总任务：[技能核对任务书](../TASK-GOW-SKILL-REVIEW.md) · [操作指南](../../../docs/gow-skill-review-operator-guide.md) · [分片状态](STATUS.md)。

| 实体 | 技能 ID | 参考名称 |
|---|---:|---|
| `weapon:1027` 战之标枪 | 7093 | JavelinOfWar |
| `weapon:1029` 背叛之弓 | 7095 | BowOfBetrayal |
| `weapon:1030` 强力之戟 | 7096 | HalberdOfMight |
| `weapon:1031` 恶之狼牙棒 | 7097 | MaceOfMalice |
| `weapon:1032` 混乱之斧 | 7098 | AxeOfChaos |

## 交付要求

1. 每项原版英文子句／原始步骤／分支与最终原型逐条对照，复用同构测试但保留独立 ID／预期／真实施法证据。
2. 差异先记录复现和影响范围；共享引擎／生成器的修复交协调窗口串行合并。
3. 单独更新本片状态；汇总窗口合并到 `data/audit/gow-skill-reviews.json` 后运行同指纹全量验证，只有账本 `acceptance.accepted` 才计入签收。

## 本轮静态核验（worker-fast-01，2026-09-27；非正式签收）

依据：`artifacts/gowhead-weapons/weapons.json` 的实体 SpellId、英文 spell.desc、ManaCost、_ManaColors_parsed；该 SpellId 在 `data/raw/spells.gow.en.json` 的原生 `data/RawData.SpellSteps`；`src/data/weapons.json` 的 spell.id/费用/颜色/中文文案；账本 `runtime.prototype`，并与 `src/engine/skills/curated/batch-w01.ts`、`src/engine/skills/curated/index.ts`、`src/engine/skills/library.ts` 的最终注册路径及相关 targeting/effects 代码相互核对。`collectWeaponCurated` 按技能 ID 注册，`weaponSkillEntries` 为每项挂载数字 ID 和独立的 `gw_<referenceName>`；以下每项均检查源/成品 ID、费用、颜色与该实体别名。仅为快照静态核验，未执行测试/真实施法/签收。

- `weapon:1027` / SpellId **7093** / **verdict=一致（静态范围）**。英文“Deal [Magic + 7] true damage to a random Enemy.”；原生 `Target:None; SpellSteps:[{"SpellPowerMultiplier":1,"Target":"RandomEnemy","Amount":7,"Primarypower":true,"Type":"TrueDamage"}]; Cost:10`；账本最终原型 `segments:[{"kind":"damage","target":"enemyRandom","scaling":{"base":7,"mult":1},"trueDamage":true}]`。语义：RandomEnemy 对 enemyRandom；TrueDamage/trueDamage:true 与随机单敌对应。 源 SpellId=成品 spell.id=7093，数值 ID `7093` 与出战别名 `gw_JavelinOfWar` 对应此原型；源/成品费用 10、颜色 Yellow 一致；展示文案“对 1 名随机的敌人造成 [魔法 + 7] 点真实伤害。”与英文动作、对象和数值一致。未核此实体的真实施法与边界。
- `weapon:1029` / SpellId **7095** / **verdict=一致（静态范围）**。英文“Deal [Magic + 7] damage to an Enemy.”；原生 `Target:Enemy; SpellSteps:[{"SpellPowerMultiplier":1,"Target":"FromTarget","Amount":7,"Primarypower":true,"Type":"Damage"}]; Cost:9`；账本最终原型 `segments:[{"kind":"damage","target":"enemyChosen","scaling":{"base":7,"mult":1}}]`。语义：FromTarget + Target:Enemy 对 enemyChosen；普通伤害 [Magic+7]，非真实伤害。 源 SpellId=成品 spell.id=7095，数值 ID `7095` 与出战别名 `gw_BowOfBetrayal` 对应此原型；源/成品费用 9、颜色 Green 一致；展示文案“对 1 名敌人造成 [魔法 + 7] 点伤害。”与英文动作、对象和数值一致。未核此实体的真实施法与边界。
- `weapon:1030` / SpellId **7096** / **verdict=一致（静态范围）**。英文“Deal 3 - [Magic + 12] damage to the first Enemy.”；原生 `Target:None; SpellSteps:[{"SpellPowerMultiplier":1,"Target":"FrontEnemy","Amount":12,"Primarypower":true,"Type":"RandomDamage"}]; Cost:9`；账本最终原型 `segments:[{"kind":"damage","target":"enemyFront","scaling":{"base":0,"mult":0},"rangeSpec":{"min":{"base":3,"mult":0},"max":{"base":12,"mult":1}}}]`。语义：RandomDamage 对区间 rangeSpec.min={base:3,mult:0}、max={base:12,mult:1}；effects/damage.ts 在闭区间按 ctx.rng.nextInt 取一次，FrontEnemy 对 enemyFront。原生步骤本身仅给 Amount=12；下界 3 由英文原句确认。 源 SpellId=成品 spell.id=7096，数值 ID `7096` 与出战别名 `gw_HalberdOfMight` 对应此原型；源/成品费用 9、颜色 Red 一致；展示文案“对第一名敌人造成 3 到 [魔法 + 12] 点伤害。”与英文动作、对象和数值一致。未核此实体的真实施法与边界。
- `weapon:1031` / SpellId **7097** / **verdict=一致（静态范围）**。英文“Deal [Magic + 6] light splash damage to an Enemy.”；原生 `Target:Enemy; SpellSteps:[{"SpellPowerMultiplier":1,"Target":"FromTarget","Amount":6,"Primarypower":true,"Type":"SplashDamage"}]; Cost:9`；账本最终原型 `segments:[{"kind":"damage","target":"enemyChosen","scaling":{"base":6,"mult":1},"range":"splash","splashRatio":0.25}]`。语义：FromTarget + Target:Enemy 对 enemyChosen；SplashDamage 对 range:splash、splashRatio:0.25，scripts/spell-rules.md 轻度溅射=相邻目标各主伤害 25%（向下取整），effects/damage.ts 使用该倍率。 源 SpellId=成品 spell.id=7097，数值 ID `7097` 与出战别名 `gw_MaceOfMalice` 对应此原型；源/成品费用 9、颜色 Brown 一致；展示文案“对一名敌人造成 [魔法 + 6] 点轻度溅射伤害。”与英文动作、对象和数值一致。未核此实体的真实施法与边界。
- `weapon:1032` / SpellId **7098** / **verdict=一致（静态范围）**。英文“Deal [Magic + 8] damage to the first Enemy.”；原生 `Target:None; SpellSteps:[{"SpellPowerMultiplier":1,"Target":"FrontEnemy","Amount":8,"Primarypower":true,"Type":"Damage"}]; Cost:8`；账本最终原型 `segments:[{"kind":"damage","target":"enemyFront","scaling":{"base":8,"mult":1}}]`。语义：FrontEnemy 对 enemyFront（队列首名）；普通伤害 [Magic+8]。 源 SpellId=成品 spell.id=7098，数值 ID `7098` 与出战别名 `gw_AxeOfChaos` 对应此原型；源/成品费用 8、颜色 Red 一致；展示文案“对第一名敌人造成 [魔法 + 8] 点伤害。”与英文动作、对象和数值一致。未核此实体的真实施法与边界。

本片静态相符 5／明确差异 0／证据不足 0；一致只涵盖上述字段和本仓库现行规则，不代表原版线上官方验证、全量边界行为或正式验收。
