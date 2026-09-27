# GoW 全量技能验收执行队列

目标：逐个核对 **1,800 个原版部队技能 + 718 个武器技能 = 2,518 项**，修复差异后整项签收。13 个自设部队单列。

依据为仓库保存的原版英文/native快照及逐项共享规则证据，不声称已核对官方实时最新版。

当前整项签收：**19 / 2,518（0.75%）**；已有复核记录：**34**。队列建立不增加签收数。

## 执行顺序

1. Evidence-blocked drafts and source conflicts stay queued separately; review independent entities one by one with source and real-cast evidence.
2. 修复已确认差异，核对来源冲突与partial武器。
3. 剩余实体按固定顺序逐条核对；共享技能仍分别确认实体费用、颜色、绑定、特质与实际施法。
4. 每批修复后重跑全量测试/类型检查，生成同指纹凭证，再通过整项门槛；全部2,518项通过才结束目标。

## 当前下一项

**troop:6169 德拉古力斯 / 技能 7302**

待核对维度：identity-cost-colors、target-count-range、base-formula-rounding、boost-source-ratio-cap、conditions-probabilities-branches、status-duration-immunity、gems-types-selection-resolution、summon-transform-pools、order-death-retargeting、mana-economy-extra-turn、display-description、battle-pipeline。

火枪手重点：法术减伤/妖火/反射分数取整、隐匿选敌与取消施法、反射和死亡/复活顺序。先找原版依据，再编写边界预期；以当前实现行为作为预期不构成独立核对。

## 每项的验收流程

- 阅读原版英文所有子句和native所有有效步骤/分支，明确费用、颜色、对象、公式、倍率、概率及执行顺序。
- 核对实际注册原型、编译结果、执行器和用户可见描述；相关特质、状态、宝石与回合规则一起检查。
- 为每条行为和边界记录来源、结论与测试；真实战斗入口必须覆盖。
- 未实装模式/晋升度只逐条排除并写理由，普通技能部分继续验收。
- 明确剩余问题，逐一处理后提交accept；脚本验证凭证和结构，语义由助手逐项阅读核实。

## 文件和命令

- 完整逐实体队列：`artifacts/gow-skill-audit/acceptance-queue.json`（含顺序、来源、未决维度/子句/步骤/分支、门槛失败原因）。
- 语义复核记录：`data/audit/gow-skill-reviews.json`。
- 刷新队列：`node scripts/build-gow-acceptance-queue.mjs`。
- 一致性检查：`node scripts/build-gow-acceptance-queue.mjs --check`。
- 修复后先运行`node scripts/verify-gow-snapshot.mjs`，再运行`node scripts/audit-gow-skills.mjs --check`，最后刷新队列。

## 优先项摘要

| 顺序 | 实体 | 技能ID | 状态 | 待核对维度数 |
|---:|---|---:|---|---:|
| 1 | troop:6169 德拉古力斯 | 7302 | queued | 12 |
| 2 | troop:6178 夸赛魔 | 7319 | queued | 12 |
| 3 | troop:6614 钱袋 | 7946 | queued | 12 |
| 4 | troop:6615 金戒指 | 7946 | queued | 12 |
| 5 | troop:6616 祭司圣杯 | 7946 | queued | 12 |
| 6 | troop:6617 皇冠 | 7946 | queued | 12 |
| 7 | troop:6618 神灯 | 7946 | queued | 12 |
| 8 | troop:6619 神圣瑰宝 | 7946 | queued | 12 |
| 9 | troop:7030 维纳图斯 | 8557 | queued | 12 |
| 10 | troop:7092 纱雅乐 | 8627 | queued | 12 |
| 11 | troop:7135 小咕咕布莱恩 | 8684 | queued | 12 |
| 12 | troop:7151 火灵 | 8710 | queued | 12 |
| 13 | troop:7159 狐狸精 | 8734 | queued | 12 |
| 14 | troop:7160 南森德 | 8735 | queued | 12 |
| 15 | troop:7161 剑姬 | 8736 | queued | 12 |
| 16 | troop:7163 游戏管理员 | 8738 | queued | 12 |
| 17 | troop:7164 月亮法师 | 8739 | queued | 12 |
| 18 | troop:7276 末日石像鬼 | 8901 | queued | 12 |
| 19 | troop:7306 伏見稻荷 | 8918 | queued | 12 |
| 20 | troop:7328 蜘蛛皇座 | 8940 | queued | 12 |
