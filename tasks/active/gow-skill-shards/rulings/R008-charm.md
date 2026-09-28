# R008 魅惑 Charm（提议，sa-P 2026-09-28；待协调窗口裁定，未实现）

状态：**提议**。来源在「魅惑不是持续状态」上一致，但在即时效果本身（打谁、打多少、护甲／屏障）上互相矛盾，按 FIX-ROUND-A 规则不实现，P-charm-instant 跳过。

## 已一致的部分

- 魅惑是施放时的一次性效果，不是持续状态：官方状态条目明确把 “Charmed” 这类施放时一次性作用的法术排除在状态效果之外（已入库 `official-status-effects.html`）；社区 Lyya（TL4，2017，t/30981/10）称其为即时机制、没有持续性。
- 祝福（Blessed）目标不能被魅惑：t/85177（2024）报告对祝福目标施放显示 “No Target Available”，不造成魅惑伤害。

## 互相矛盾的部分（需裁定）

| 问题 | 说法 A | 说法 B | 说法 C |
|---|---|---|---|
| 伤害落在谁身上 | 被魅惑者**上下相邻**的队友（t/45847，2018：只有 1、3 号位存活时魅惑 3 号位不造成伤害） | **被魅惑者自己**受到等于其攻击力的特殊伤害，“打自己”只是演出（t/81136，2023） | 相邻一名或两名（sa-L1 旧记录：“potentially target two troops”） |
| 伤害值 | 被魅惑者的攻击力（各来源唯一给出的数值） | — | — |
| 护甲／屏障 | 未知（t/30443 “Charm vs Barrier” 无结论） | — | — |
| 魅惑免疫 | 免疫者不被魅惑，但其相邻者被随机魅惑时它仍会受伤（t/88967，2025，功能建议帖，间接说明目标会改选相邻者） | — | — |

## 提议（若协调窗口采纳）

1. 原型不再施加 `charm` 状态；新增一次性原语 `charmStrike`：施放时对目标立即结算，不留状态，不进随机负面状态池（L2 已移除）。
2. 伤害值 = 被魅惑者当前攻击力，普通（非真实）伤害，走护甲与屏障——这一项需要资料确认，否则登记为 R006 约定。
3. 伤害对象二选一，由裁定决定：(A) 上下相邻存活队友各受一次；(B) 被魅惑者自身。
4. 祝福、隐匿等“不可被选中”规则沿用现有目标过滤；魅惑免疫者改选相邻者的行为（t/88967）暂不实现。
5. 实现后反查 16 个原生 Charm 技能：troop:6023, 6177, 6305, 6363, 6498, 6534, 6605, 6647, 6657, 6769, 6885, 7515, 7677, 7793, 7803, weapon:1310；同时解除 L1-7803-order、L1-7793-prefnotprev、L1-6305-repeat、L1-7515-summon-dist、L1-6605-pairs 的阻塞；`tests/unit/gowLaneL1B02Repro.test.ts` 的 L1-charm-instant `it.fails` 改为 `it`。

## 现状（未改）

`status.ts` / `CombatResolver`：魅惑作为持续状态，持有者的骷髅攻击改打己方下一名存活单位（`GOW-STATUS-RESEARCH.md` 第 33 行、`scripts/spell-rules.md` 第 152 行）。

来源：
- 已入库 `artifacts/gow-skill-audit/gold-primary-sources/official-status-effects.html`、`community-2026-09-28-charm-instant.json`
- https://community.gemsofwar.com/t/impervious-vs-charmed/30981
- https://community.gemsofwar.com/t/lusts-third-trait-doesnt-work/45847
- https://community.gemsofwar.com/t/bug-or-intended-charm-reflect/81136
- https://community.gemsofwar.com/t/bless-blocks-charm/85177
- https://community.gemsofwar.com/t/the-special-privilege-of-random-charm/88967
- https://community.gemsofwar.com/t/charm-vs-barrier/30443
