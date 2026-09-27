# 并行技能验收批次报告（2026-09-27）

## 本批实际签收

四个子窗口先逐项对照 S0001—S0016（共 80 个部队／武器实体），再对其中 18 项分工制作完整逐实体签收记录。协调窗口补实战用例、合并记录并完成同指纹全量验证；最终总账**19 → 26 / 2518，新增正式签收 7 项**：

| 子窗口 | 新签收的实体 | 状态 |
|---|---|---|
| worker-fast-01 | `troop:6614`、`troop:6615`、`troop:6616` | 3 项账本 `acceptance.accepted=true` |
| worker-fast-03 | `weapon:1001`、`weapon:1002`、`weapon:1004` | 3 项账本 `acceptance.accepted=true` |
| worker-fast-04 | `weapon:1017` | 1 项账本 `acceptance.accepted=true` |

这七项分别有已核来源、12 维、原版子句／步骤／分支与真实 `TurnEngine.castSkill` 测试的独立记录，`wholeSkillReview.failures=[]`；worker-fast-02 的本轮五项仍为 draft。**其余 11 条暂存签收记录为 draft，不计入 26**。子窗口负责逐项判断并写记录，未运行测试或全量回归；测试由协调窗口集中执行。

全量验证凭证：`artifacts/gow-skill-audit/verification-receipt.json`，指纹 `fdfdf8e0b23dbd9d61966385f1c9482341c69f0bddb4d0f671e5f8df7ad2ed5d`；**8,560 个测试通过，0 失败，类型检查通过**。本批新增 `tests/unit/gowParallelSignoffTroops.test.ts` 与 `tests/unit/gowParallelSignoffWeapons.test.ts` 的逐实体来源核验、双阵营真实施法、异常／低蓝／沉默／击杀边界等用例；没有修改技能实现。

## 先导排查及未签收原因

80 项初步对照结论：60 项仅静态字段相符、12 项发现明确差异、8 项原版口径/召唤池证据不足。初步一致**不是**自动签收：只有上表七项经过逐实体证据与同指纹全量验证落账。所有 16 片工单均有五项逐项依据，当前 8 片 `reviewed`、8 片 `needs-repair`、0 片占用；详情见 `TASK-S0001.md`—`TASK-S0016.md`。

**明确差异 12 项**（此处为本轮静态报告新发现，尚未进入账本原有 2 项 `confirmedDifferenceEntities` 的修复闭环）：`troop:7030`/8557（黄龙宝石变普通黄宝石）、`troop:7092`/8627（法力宝石选格范围）、`troop:7163`/8738（中文展示）、`troop:7276`/8901（单格变全色）、`troop:7337`/8960（选敌/分伤）、`weapon:1000`/7066（最强敌人被换成队首）、`weapon:1064`/7071（中文问号）、`weapon:1526`/8966（未约束法力宝石输入）、`weapon:1625`/9573（应选色却用 ANY）、`troop:6117`/7209（对野兽应三倍，当前两倍）、`troop:6189`/7330（中文笔误）、`troop:6548`/7742（漏识别 enraged）。

**原版规则/资格缺证 8 项**：`troop:7606`/8389、`troop:6030`/7030、`troop:6306`/7456、`weapon:1005`/7070、`weapon:1007`/7073、`weapon:1009`/7075、`weapon:1016`/7082、`weapon:1139`/7309。未对这批擅自作效果裁定。

验收原始记录与分片看板：`data/audit/gow-skill-reviews.json`、`tasks/active/gow-skill-shards/STATUS.json`；每个子窗口的独立记录：`signoff-worker-01.json`—`signoff-worker-04.json`。并行过程中修正了分片认领器跳过已标记 `needs-repair` 分片，恢复受误认领影响的 S0002、S0004 状态。