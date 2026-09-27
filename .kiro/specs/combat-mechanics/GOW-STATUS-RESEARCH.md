# GoW 状态规则核对

更新时间：2026-09-15

本页只记录已联网核对过的 Gems of War 规则，不把缺少引擎表达能力的部分伪装成已完成。

## 来源

- 官方术语表（Mana Storm、Doomskull、Mana 等）：
  https://infinityplus2.freshdesk.com/support/solutions/articles/150000208267-gems-of-war-glossary-of-terms
- Gems of War Wiki 状态效果表（逐项状态语义）：
  https://gems-of-war.fandom.com/wiki/Status_Effect
- Gems of War Wiki 免疫特质表（Blessed、Impervious、Invulnerable、Mana Shield 等）：
  https://gems-of-war.fandom.com/wiki/Immunity_Traits
- 官方 3.0 补丁说明（风暴颜色和 8 回合）：
  https://gemsofwar.com/3-0-patch-notes/

## 持续规则（2026-09-28 起以 R004 为准）

> **已被 R004 取代**：此前“负面状态统一 3 回合倒计时 + 各状态独立累计自愈”“诅咒下 5% 基准”“潜水计入自动解除”的实现口径（battle-skill-system 需求 9.5）作废。现行规则见 `tasks/active/gow-skill-shards/rulings/R004-status-durations.md`：
> - 负面状态无回合上限；持有者回合开始共用一个累积自愈概率：首次 10%，此后每回合 +10%（诅咒在身 +5%），掷中一次移除全部可自愈负面；获得（新施加或再次施加）任何负面状态重置为 10%（出血按官方条目只在第 4 层之后再叠才重置）；中毒不自愈；死亡印记即死判定不变。
> - 屏障、反射受一次伤害后移除；附魔施法后移除；狂怒造成一次骷髅伤害后移除；潜水、祝福在持有者行动（施法，或作为首位兵种造成骷髅伤害）后移除；均无时限。
> - 原生 `Cause*` 的 `Amount` 忽略（R006-C2）。社区旁证入库：`artifacts/gow-skill-audit/gold-primary-sources/community-2026-09-28-status-durations.json`。

## 已接入引擎

| 状态 | 核对到的 GoW 规则 | 当前实现 |
|---|---|---|
| 疾病 Disease | 获得的法力减半；累计 10% 自动解除 | `ManaDistributor` 对实际获得量取整减半；状态回合结算复用 `recoveryChance` |
| 诅咒 Cursed | 所有状态（包括诅咒自身）自动解除概率减半；移除正面状态；可穿透普通免疫，但不能穿透 Invulnerable | `applyStatus` 清正面状态；~~解除概率按 5% 基准累计~~（已被 R004 取代：10% 起步、每回合 +5%）；免疫判断保留 `invulnerable` 例外 |
| 死亡标记 Death Mark | 首次己方回合不判即死，此后每回合 10% 立即死亡；累计 10% 自动解除 | `tickStatuses` 使用种子 RNG 产生 `status-tick` + `defeat` |
| 狂怒 Enraged | 骷髅伤害 1.5 倍、忽略敌方特质、攻击后结束 | `CombatResolver` 计算 1.5 倍并跳过受击方特质触发，攻击后发 `status-expire` |
| 魅惑 Charm | 受影响单位攻击己方单位 | `CombatResolver` 将有魅惑的队首目标改为己方下一名存活单位；无己方目标时回退敌方队首 |
| 风暴 Mana Storm | 风暴颜色宝石更容易掉落；是全局战场修正，不是兵种 | `Team.storm` + `storm-change`；测试控制台可设置颜色/持有方/回合，真实影响 refill |

## 需要显式回调的规则

### 狼化 Lycanthropy

补充核对：`src/data/troops.json` 中的 `lycanthropy` 特质描述为“回合开始时有 50% 几率把紫色宝石转换为狼化宝石”。这和施加到敌人身上的 Lycanthropy 状态是两个不同层次的机制。当前引擎已支持状态施加、免疫、自动解除和测试入口，但尚未接入把角色替换成随机 Beast 所需的完整 `transform` 事件、兵种模板与表现层协议，因此暂不伪造临时 Character。

官方规则是“每回合 15% 变成随机 Beast；累计 10% 自动解除”。当前状态生命周期、解除概率和调试施加入口已具备，但“随机 Beast”需要运行时兵种模板解析器才能真正替换角色。引擎不应复制一个临时 Character 冒充 Beast；接入点应使用现有 `summonResolver`/兵种数据索引，并产出独立的 `transform` 事件。

### 法力燃烧 Mana Burn

GoW 资料将其作为法力耗尽/免疫体系中的效果，而不是 `Status Effect` 表中的持续状态。当前技能原语 `drainMana` 已表达“清空目标当前法力”；测试控制台仍可施加 `mana-burn` 标签用于表现层走查，但不应把它误当成每回合 DoT。

## 测试控制台入口

`skills-test.html` 的“风暴测试”区支持：

- 我方/敌方持有方；
- 火、冰、叶、光、暗、尘六种颜色；
- 1、2、4、8 回合；
- 后设置风暴顶替先设置风暴；
- 设置 1 回合后点击“推进回合”验证到期事件。

所有按钮都调用 `TurnEngine.debugSetStorm`，不直接改 DOM 或绕过事件流。
