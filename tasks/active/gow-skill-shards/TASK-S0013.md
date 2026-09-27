# 技能验收分片 S0013（5 项）

> 本页分工固定，不随每次验收队列重排；状态与签收实时读取账本及本片记录。本页的“核对完成”不等于整项签收。
> 总任务：[技能核对任务书](../TASK-GOW-SKILL-REVIEW.md) · [操作指南](../../../docs/gow-skill-review-operator-guide.md) · [分片状态](STATUS.md)。

| 实体 | 技能 ID | 参考名称 |
|---|---:|---|
| `weapon:1056` 山脉粉碎者 | 7122 | MountainCrusher |
| `weapon:1064` 粗糙棍棒 | 7071 | CrudeClub |
| `weapon:1070` 吼板 | 7183 | Bullroarer |
| `weapon:1076` 虚空法球 | 7189 | NullSphere |
| `weapon:1082` 杀戮之箭 | 7195 | ArrowOfSlaying |

## 交付要求

1. 每项原版英文子句／原始步骤／分支与最终原型逐条对照，复用同构测试但保留独立 ID／预期／真实施法证据。
2. 差异先记录复现和影响范围；共享引擎／生成器的修复交协调窗口串行合并。
3. 单独更新本片状态；汇总窗口合并到 `data/audit/gow-skill-reviews.json` 后运行同指纹全量验证，只有账本 `acceptance.accepted` 才计入签收。

## 本轮静态核验（worker-fast-03，2026-09-27）

仅核本片 5 项：逐实体交叉保存的 `artifacts/gowhead-weapons/weapons.json` 英文、`data/raw/spells.gow.en.json` 的 SpellSteps、`src/data/weapons.json` 中文/实体费用颜色、`artifacts/gow-skill-audit/ledger.json` 的 `runtime.prototype`，并按需读对应执行原语。每项均核对原生步骤数量、目标/颜色、公式/概率/状态/顺序；以下只代表**静态核验，不等于正式签收**，未跑测试或实际施法，未用现有审计状态作为判据。

| 实体 / 技能 ID | verdict | 逐项定位依据 |
|---|---|---|
| `weapon:1056` / **7122** | **静态相符** | 英文 `Explode [Magic] Brown Gems.`；原生唯一 `ExplodeColor(Color1=Brown,SpellPowerMultiplier=1)`；原型唯一 `gem clear/explode randomGems(count=M,include=color,color=Brown)`，中文“随机爆破 [魔法] 颗棕色宝石”具体化随机抽取；费用 **11**、**棕**与原实体一致；无其他状态/概率/先后段。 |
| `weapon:1064` / **7071** | **明确差异** | 英文 `Explode a random Gem.`、原生唯一 `ExplodeGems(Amount=1)` 与原型 `gem clear/explode randomGems(count=1,include=all)` 的目标/数量相符；但本地 `src/data/weapons.json` 的中文技能文案和 ledger `runtime.description` **逐字为 `?????????`**，`src/engine/skills/curated/batch-w05.ts` 对应 desc 也如此，完全未显示“随机爆破一颗宝石”。费用 **3**、**红**相符；差异为展示内容，不是已经确认的爆破执行差异。 |
| `weapon:1070` / **7183** | **静态相符** | 英文 `Give [Magic + 1] Life to all Allies.`；原生唯一 `IncreaseHealth(Target=AllAllies,Amount=1,SpellPowerMultiplier=1)`；原型唯一 `buff(target=allyAll,stat=hp,scaling=1+M,lifeMode=gain)` 对应增加生命而非攻击伤害，中文“为所有盟友提供……生命值”；费用 **12**、**绿**一致；无其他条件/状态/先后。 |
| `weapon:1076` / **7189** | **静态相符** | 英文 `Eliminate all Magic from an Enemy.`；原生唯一 `DecreaseSpellPower(Target=FromTarget,Amount=1000)`；原型唯一 `reduce(enemyChosen,stat=magic,drainAll=true)`，`src/engine/skills/effects/debuff.ts` 的 `drainAll` 基数为无穷大，表达清零当前魔法；中文“减除……全部魔力值”，费用 **18**、**紫/棕**相符；无其他步骤或概率。 |
| `weapon:1082` / **7195** | **静态相符** | 英文 `Deal [Magic + 10] damage to an Enemy.`；原生唯一 `Damage(Target=FromTarget,Amount=10,SpellPowerMultiplier=1)` 对应原型唯一 `damage(enemyChosen,base=10,mult=1)`，中文选一敌人伤害一致；费用 **18**、**蓝/绿**相符；无状态/额外分支。 |

本片计数：**静态相符 4**（7122、7183、7189、7195）；**明确差异 1**（7071，中文显示）；**证据不足 0**。待修显示差异不影响本轮其余技能的逐项结论；本报告不构成正式签收。
