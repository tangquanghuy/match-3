# GoW 共用机制审查台账（2026-09-27）

本台账审查的是 **技能与特质共同复用的引擎路径**，不是 2,518 项部队／武器技能的逐项原版签收。审查结果分为：独立资料已证明的规则与测试、只证明实现自洽的测试、确认存在的代理或未实现规则。原版资料为本地快照，不视作 2026 年官方实时版本。

## 本轮审查结论

已对技能、特质复用的 14 类公共路径逐类检查入口、测试和原版依据。**路径覆盖审查已完成；原版一致性并未全部签收。**其中“有实现回归”只证明本项目内部行为，“原版独立依据缺口”仍单列。此台账与 2,518 项部队／武器技能的逐项验收分开统计。

## 共用路径审查矩阵

| 路径 | 实施位置与测试 | 本次结论 |
| --- | --- | --- |
| 行动、施法、交换、额外回合与冰冻 | `TurnEngine`，`castTurnLifecycle.test.ts`、`extraTurnSkipsTurnStart.test.ts` | 普通施法消耗回合，非法施法不推进；当前项目回合约定有专项回归；并非每个技能额外回合条款已经签收。 |
| 基色法力、队列、沉默／疾病、链接 | `ManaDistributor`，`ManaDistributor.test.ts`、`manaSurge.test.ts` | 逐色与上下顺位实现有测试；疾病向上取整有保存的官方补丁说明；不能用这组单测代替所有颜色特质原版验收。 |
| 普通、真实、溅射、散射、骷髅与炸毁骷髅 | `damage.ts`、`CombatResolver`、`TurnEngine.settleDestroyed`，`gowNativeDamageSharedAudit.test.ts`、`gowDamageRules.test.ts` | 已分离四档溅射／散射池与法术伤害管线；散射「先按未减伤容量分配、满额后在原目标重分剩余伤害」已找到开发人员说明并回归；逐点随机分布形状仍缺证明；见 `gow-common-damage-rules-audit.md`。 |
| 屏障／法术抗性／妖火／反射、治疗／生命增长 | `damage.ts`、`buff.ts`、`healing.ts`，`gowCommonStatusRules.test.ts`、`gowLifeSemanticsAudit.test.ts` | 常规伤害、屏障、增长口已回归；反射与部分生命窃取特质的所有交互仍待独立查证。 |
| 吞噬、缠绕、赐福、诅咒、无敌 | `devour.ts`、`buff.ts`、`traits.ts`、`TurnEngine`，`traitDevour*.test.ts`、`gowCommonStatusRules.test.ts` | 修复吞噬取受害者**当前**攻击／护甲／生命，魔法不增加；屏障挡吞噬、减伤不挡吞噬；缠绕阻止攻击成长，赐福／无敌保护。旧固定 +2/+2/+2/+5 断言已清理。 |
| 状态施加、自然解除、到期、死亡标记、DoT | `status.ts`、`TurnEngine.finishTurn`，`gowCommonStatusRules.test.ts`、`statusEffect.test.ts` | 诅咒自身解除概率按减半累计，死亡标记首回合豁免已修；狼化状态已接入每回合 15% 随机 Beast 转化，前置累计自然净化；命中后保留编队位与战斗 id，并更换技能、属性、种族和特质，清除旧状态。净化与转化两次掷签的先后顺序仍缺逐帧独立证明。 |
| 选敌、位次、目标快照、跨段绑定 | `targeting.ts`、`prototypes.ts`、`context.ts`，`targeting.test.ts`、`gowTrackedTargetFiltersAudit.test.ts` | 目标继承、最近实际受害者、局部目标过滤有测试；逐实体文案与目标映射尚待签收。 |
| 宝石创造、转化、爆破、摧毁、补盘与连锁 | `gems.ts`、`TurnEngine.resolveBoardChange`，`gemEffect.test.ts`、`gemClearBatch.test.ts`、`specialGemsWaveB.test.ts` | 区分爆破半额法力与后续连锁全额法力（官方 4.0 存档）；特殊宝石／随机落点／每种 BoardTarget 的原版精确规则不由现有测试全部证明。 |
| 风暴／特殊骷髅 | `TurnEngine`、`storm.ts`，`stormEngine.test.ts`、`skullStorm.test.ts` | 基色和骷髅系掉落已有独立路径与测试；早期验收记录称「仅颜色近似」已经过时，当前 dropKind 表示已接入；各风暴权重仍待逐项比对。 |
| 召唤、复制、死亡复活、变形、队列 | `summon.ts`、`teamRoster.ts`，`summonEffect.test.ts`、`traitDevourHooks.test.ts` | 原位自复活及编队进出已测试；满编 FIFO 等候队列是项目机制，不作为原版规则签收；狼化变形由装配层注入 Beast 族兵册与已有模板解析器；该路径已有专项测试。 |
| 攻防魔、资源／窃取、触发特质 | `buff.ts`、`debuff.ts`、`economy.ts`、`traits.ts`，`buffEffect.test.ts`、`traitDeathHooks.test.ts` | 特质攻击增长同样受缠绕限制；其他资源段有单测，不意味着每一条持有者特质已经核实。 |
| 全战斗阵亡来源与本次施法追踪 | `GameState.battleDeaths`、`TurnEngine.recordBattleDeaths`、`secondary.ts`、`prototypes.ts`，`gowBattleDeathsSharedRule.test.ts`、`primitivesWave3.test.ts` | 修正旧「只计算本次施法」代理：先前行动（含回合伤害）累计，本次施法段内增量另计且不重复记账。 |
| 逃跑、队伍重排、经济与资源、二次缩放 | `escape.ts`、`economy.ts`、`secondary.ts`、`prototypes.ts`，`spellPrimitives.test.ts`、`gowGoldOwnershipAudit.test.ts`、`primitivesWave4.test.ts` | 逃跑不计阵亡；资源归属、段间累加／条件解析有自动回归；各模式独有规则与每条原生修正系数须按原版源逐项核对。 |
| 队伍最常用法力色 | `gems.ts`、`secondary.ts`，`spellPrimitivesR11.test.ts` | **未签收**：已修掉按施法日志／法力费用均摊的代理：按在场单位法力颜色计数，无施法历史也能识别，平局使用种子化随机并在同次施法内复用；依据玩家亲自实测与同帖答复，非官方明确公开的完整算法。阵亡、召唤后计数时点及平局底层随机算法尚待原版逐帧证据；不得据此整项签收。 |

## 独立核对资料与边界

- 官方状态效果指南：`https://infinityplus2.freshdesk.com/support/solutions/articles/150000208274`；官方 3.0.5：`https://gemsofwar.com/pcmobile-3-0-5-patch-notes/`（死亡标记首回合豁免、屏障阻止吞噬）。
- 开发人员对吞噬属性的具体说明：`https://community.gemsofwar.com/posts/3588.json`（取目标当前攻击、护甲、生命，不获取魔法）。注意较早帖子有关屏障的说法被 3.0.5 更新替代。
- 官方 4.2：`https://gemsofwar.com/4-2-patch-notes/`（诅咒自身也按减半概率自然解除）；官方 4.0 快照 `artifacts/gow-skill-audit/gold-primary-sources/official-4-0-patch-notes.json`（爆破法力从 70% 降为 50%，连锁仍全额）。
- 尚未证明的散射逐点随机细则、最常用法力色的阵亡/召唤时点、特殊风暴数值、狼化状态双掷签顺序等留有显式未验证标记，**不发整项验收凭证**。
- 狼化 15% 随机 Beast 转化及累计净化的规则依据：前述官方 2025-06-19 修订的状态指南。`tickStatuses` 与装配层 `setBeastPool` 已建立可复现的测试入口。
- 已有相关源码与历史大量改动，台账中的“修复”只指本轮可追踪的共用入口更改；可复现全量测试结果以同指纹 `artifacts/gow-skill-audit/verification-receipt.json` 为准。
## 缺口核对续录（2026-09-27）

- **散射阶段顺序（开发人员一手说明）**：Alpheon 在 `https://community.gemsofwar.com/t/55491/5`、`/7` 解释，先在减伤前按目标当前护甲+生命分配，全部视作已致死后，余量继续在原始所有受害者（包括预计算已致死的单位）间随机分配；法术抗性与妖火在分配后结算，分配阶段均不予考虑。`allocateScatterDamage` 当前实现满足这些可核查不变量，本轮新增余量仍覆盖原目标的回归。开发人员未给出逐点掷签的确切分布形式，现有均匀随机只是实现策略，不据此签收隐藏算法；`https://community.gemsofwar.com/t/55491/3` 的玩家实战记录显示分配近似均衡，但样本不足以推断精确采样器。
- **最常用法力色（实战观察，非开发人员明示）**：`https://community.gemsofwar.com/t/69325/10`、`/11` 为实战试验，`/12`、`/14` 为同帖玩家对「以队伍中使用该色的单位数量计数、平局随机选色」的归纳，并观察到预览时重选可改变平局。项目统一两处解析入口，开局即可识别，无重复实现；本地种子化 RNG 与同次施法缓存是可复现的代理，底层实现未由官方证明。当前只计未阵亡的在场成员；原版对阵亡／召唤中的瞬时口径仍待证据。
- **风暴概率的证据级别纠偏**：Steam 讨论 `https://steamcommunity.com/app/329110/discussions/0/3201496371571406154/` 给出的 27.1% 是参与者按「七类基础结果、15% 颜色覆盖率」计算出的模型值，不是官方实测，更不是项目代码概率的直接依据。项目六色条件分布为 `1.9/(5+1.9)≈27.54%`，若含骷髅/特殊宝石，还需乘以其余判定未命中的概率。`1.9` 与末日/超级末日的 `0.04`/`0.02` 继续标识为设计参数，暂无独立原版数值验证；不据玩家估值修改。
- **狼化掷签顺序**：官方 `https://infinityplus2.freshdesk.com/support/solutions/articles/150000208274` 证明转化和净化各自几率，但未公开同回合净化/转化优先级；现有先净化后转化的路径保留为待验证实现。
