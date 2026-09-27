# 技能验收分片 S0009（5 项）

> 本页分工固定，不随每次验收队列重排；状态与签收实时读取账本及本片记录。本页的“核对完成”不等于整项签收。
> 总任务：[技能核对任务书](../TASK-GOW-SKILL-REVIEW.md) · [操作指南](../../../docs/gow-skill-review-operator-guide.md) · [分片状态](STATUS.md)。

| 实体 | 技能 ID | 参考名称 |
|---|---:|---|
| `weapon:1021` 虚空匕首 | 7087 | DaggerOfTheVoid |
| `weapon:1022` 王者偃月刀 | 7088 | FalchionOfKings |
| `weapon:1024` 痛苦镰剑 | 7090 | KhopeshOfMisery |
| `weapon:1025` 正义之刃 | 7091 | BladeOfJustice |
| `weapon:1026` 流亡之弩 | 7092 | CrossbowOfExile |

## 交付要求

1. 每项原版英文子句／原始步骤／分支与最终原型逐条对照，复用同构测试但保留独立 ID／预期／真实施法证据。
2. 差异先记录复现和影响范围；共享引擎／生成器的修复交协调窗口串行合并。
3. 单独更新本片状态；汇总窗口合并到 `data/audit/gow-skill-reviews.json` 后运行同指纹全量验证，只有账本 `acceptance.accepted` 才计入签收。

## 本轮静态核验（worker-fast-01，2026-09-27；非正式签收）

依据：`artifacts/gowhead-weapons/weapons.json` 的实体 SpellId、英文 spell.desc、ManaCost、_ManaColors_parsed；该 SpellId 在 `data/raw/spells.gow.en.json` 的原生 `data/RawData.SpellSteps`；`src/data/weapons.json` 的 spell.id/费用/颜色/中文文案；账本 `runtime.prototype`，并与 `src/engine/skills/curated/batch-w01.ts`、`src/engine/skills/curated/index.ts`、`src/engine/skills/library.ts` 的最终注册路径及相关 targeting/effects 代码相互核对。`collectWeaponCurated` 按技能 ID 注册，`weaponSkillEntries` 为每项挂载数字 ID 和独立的 `gw_<referenceName>`；以下每项均检查源/成品 ID、费用、颜色与该实体别名。仅为快照静态核验，未执行测试/真实施法/签收。

- `weapon:1021` / SpellId **7087** / **verdict=一致（静态范围）**。英文“Deal [Magic + 8] damage to the last Enemy.”；原生 `Target:None; SpellSteps:[{"SpellPowerMultiplier":1,"Target":"LastEnemy","Amount":8,"Primarypower":true,"Type":"Damage"}]; Cost:8`；账本最终原型 `segments:[{"kind":"damage","target":"enemyLast","scaling":{"base":8,"mult":1}}]`。语义：LastEnemy 对 enemyLast（存活敌方末位）；普通伤害 [Magic+8]。 源 SpellId=成品 spell.id=7087，数值 ID `7087` 与出战别名 `gw_DaggerOfTheVoid` 对应此原型；源/成品费用 8、颜色 Blue 一致；展示文案“对最后一名敌人造成 [魔法 + 8] 点伤害。”与英文动作、对象和数值一致。未核此实体的真实施法与边界。
- `weapon:1022` / SpellId **7088** / **verdict=一致（静态范围）**。英文“Deal [Magic + 8] damage to the strongest Enemy.”；原生 `Target:None; SpellSteps:[{"SpellPowerMultiplier":1,"Target":"StrongestEnemy","Amount":8,"Primarypower":true,"Type":"Damage"}]; Cost:8`；账本最终原型 `segments:[{"kind":"damage","target":"enemyHealthiest","scaling":{"base":8,"mult":1}}]`。语义：StrongestEnemy 对 enemyHealthiest（当前 hp 最大）；仓库 scripts/spell-rules.md 已规定“最强”按生命，中文“最健康”与该口径相符；最强是否采用其他原版属性尚无独立官方逐实体证据。 源 SpellId=成品 spell.id=7088，数值 ID `7088` 与出战别名 `gw_FalchionOfKings` 对应此原型；源/成品费用 8、颜色 Blue 一致；展示文案“对最健康的敌人造成 [魔法 + 8] 点伤害。”与英文动作、对象和数值一致。未核此实体的真实施法与边界。
- `weapon:1024` / SpellId **7090** / **verdict=一致（静态范围）**。英文“Deal [Magic + 8] damage to the weakest Enemy.”；原生 `Target:None; SpellSteps:[{"SpellPowerMultiplier":1,"Target":"WeakestEnemy","Amount":8,"Primarypower":true,"Type":"Damage"}]; Cost:8`；账本最终原型 `segments:[{"kind":"damage","target":"enemyWeakest","scaling":{"base":8,"mult":1}}]`。语义：WeakestEnemy 对 enemyWeakest（当前 hp 最小）；同一仓库目标规则按当前生命而非护甲解释。 源 SpellId=成品 spell.id=7090，数值 ID `7090` 与出战别名 `gw_KhopeshOfMisery` 对应此原型；源/成品费用 8、颜色 Blue 一致；展示文案“对最虚弱的敌人造成 [魔法 + 8] 点伤害。”与英文动作、对象和数值一致。未核此实体的真实施法与边界。
- `weapon:1025` / SpellId **7091** / **verdict=一致（静态范围）**。英文“Deal [Magic + 8] damage to the first Enemy.”；原生 `Target:None; SpellSteps:[{"SpellPowerMultiplier":1,"Target":"FrontEnemy","Amount":8,"Primarypower":true,"Type":"Damage"}]; Cost:8`；账本最终原型 `segments:[{"kind":"damage","target":"enemyFront","scaling":{"base":8,"mult":1}}]`。语义：FrontEnemy 对 enemyFront（队列首名）；普通伤害 [Magic+8]。 源 SpellId=成品 spell.id=7091，数值 ID `7091` 与出战别名 `gw_BladeOfJustice` 对应此原型；源/成品费用 8、颜色 Brown 一致；展示文案“对第一名敌人造成 [魔法 + 8] 点伤害。”与英文动作、对象和数值一致。未核此实体的真实施法与边界。
- `weapon:1026` / SpellId **7092** / **verdict=一致（静态范围）**。英文“Deal [Magic + 5] true damage to an Enemy.”；原生 `Target:Enemy; SpellSteps:[{"SpellPowerMultiplier":1,"Target":"FromTarget","Amount":5,"Primarypower":true,"Type":"TrueDamage"}]; Cost:10`；账本最终原型 `segments:[{"kind":"damage","target":"enemyChosen","scaling":{"base":5,"mult":1},"trueDamage":true}]`。语义：FromTarget + Target:Enemy 对 enemyChosen；TrueDamage/trueDamage:true 保留绕甲语义。 源 SpellId=成品 spell.id=7092，数值 ID `7092` 与出战别名 `gw_CrossbowOfExile` 对应此原型；源/成品费用 10、颜色 Green 一致；展示文案“对 1 名敌人造成 [魔法 + 5] 点真实伤害。”与英文动作、对象和数值一致。未核此实体的真实施法与边界。

本片静态相符 5／明确差异 0／证据不足 0；一致只涵盖上述字段和本仓库现行规则，不代表原版线上官方验证、全量边界行为或正式验收。
