# GoW 技能逐项核对与差异处理：操作指南

> 2026-09-27；任务书：`tasks/active/TASK-GOW-SKILL-REVIEW.md`。作用域：仓库保存的 GoW 英文／原始步骤资料快照，**不是最新线上游戏的自动认证**。本指南描述怎样高效率找错、修复、逐实体签收；同构检查与整项签收严格分开。

## 1. 开工前定位：资料源、执行源、证据源

| 用途 | 路径／入口 | 核对要点 |
|---|---|---|
| 英文原文与实体属性 | `data/raw/troops.gow.en.json`、`artifacts/gowhead-weapons/weapons.json` | 身份、法术 ID、费用、颜色、英文条款；不要单凭中文译文下结论 |
| 原版执行步骤 | `data/raw/spells.gow.en.json` 中按 SpellId 找到非空 `RawData` 的 `SpellSteps` | 有序 `Type`、`Target`、`Amount`、倍率、概率、条件、`Randomize`、先后、延时及分支；`SpellId` 不等于部队／武器实体 ID |
| 当前内容／最终执行 | `src/data/troops.json`、`src/data/weapons.json`、`src/engine/skills/curated/`、`src/engine/skills/library.ts` 的 `registerSkillLibrary` | 看**最终注册的原型**，不能只读池文件；武器数字技能 ID 和 `gw_<referenceName>` 出战键都要验 |
| 共用机制 | `src/engine/skills/builders.ts`、`prototypes.ts`、`targeting.ts`、`effects/`、`src/engine/TurnEngine.ts` | 区分组装器、运行时目标解析、受伤／死亡结算、棋盘演出事件 |
| 规则与已记录裁定 | `scripts/spell-rules.md`、`.kiro/specs/combat-mechanics/DECISIONS.md`、`artifacts/gow-skill-audit/gold-primary-sources/` | 规则有来源和作用域；不靠猜测改随机分配、掉率或用户既有裁定 |
| 实体总账／验证凭证 | `artifacts/gow-skill-audit/ledger.json`、`verification-receipt.json` | 看 `fingerprint`、`rows[].confirmedDifferences`、`wholeSkillReview.failures`、`summary.accepted`；账本由脚本生成，勿直接手改 |
| 核查排期与签收记录 | `artifacts/gow-skill-audit/{acceptance-queue,review-cohorts,assembler-families}.json`、`data/audit/gow-skill-reviews.json` | 队列／分组只负责安排；签收源是逐实体 review 记录 |

## 2. 推荐按这个顺序跑（PowerShell，项目根目录）

```powershell
node scripts/verify-gow-snapshot.mjs                  # 先生成同源码指纹全量测试 + 类型检查凭证；脚本会重建账本
node scripts/build-gow-acceptance-queue.mjs            # 同指纹逐实体待核队列
node scripts/build-gow-review-cohorts.mjs              # 按原始步骤形态分同构组
node scripts/build-gow-assembler-families.mjs           # 按最终组装器分 30 个重叠机制族
node scripts/check-gow-damage-family.mjs               # 溅射／散射仅基础形态筛查
```

快速定位某项（本例同时提示来源／注册原型，不能代替人工判定）：

```powershell
node -e "const a=require('./artifacts/gow-skill-audit/ledger.json'); const r=a.rows.find(x=>x.key==='troop:7468'); console.log(JSON.stringify({spellId:r.spellId,english:r.source.englishDescription,steps:r.source.native?.SpellSteps,prototype:r.runtime.prototype,discrepancies:r.confirmedDifferences,review:r.wholeSkillReview},null,2))"
```

批次编辑时先用 `npx vitest run tests/unit/<定向测试>.test.ts` 和 `npx tsc --noEmit` 找局部回归；**源码／测试／review 证据每次变动后重新跑上面的全量验证及索引生成**。要核对已有索引是否过期，运行相应脚本 `--check`，例如 `node scripts/build-gow-assembler-families.mjs --check`；不能将旧索引结果当作当前代码结论。

## 3. 分组做法：共享语义验证一次，变量逐实体审一次

1. 从 `acceptance-queue.json` 选未签收项；交叉 `review-cohorts.json` 的**原版有序步骤形态**、`assembler-families.json` 的执行原语和种族标签。标签会重叠，不按标签人数累加；选择既同构又有共同运行路径的组作为批次。
2. 为该组写「映射表」：原始每一步 ↔ 最终组装段 ↔ 英文具体子句。机械比较步骤类型／数量／顺序／目标模式／公式／取整／概率／范围比率／状态时长／创造颜色和特殊宝石类型／触发条件。单段相符只是**预筛通过**。
3. 先写共享原语的行为测试：双方阵营、施法耗回合／额外回合、0／1／2／4 敌目标边界、队首／末、隐匿／免疫／净化／死亡后重选、低／满法力、空／满棋盘、固定 RNG、失败分支。检验特殊宝石**匹配与摧毁均触发**（本身不可匹配者例外）；需要产生颜色的效果必须具体选色。
4. 再对组内**每一项**复核英文描述与实际实体参数、原始每步的 `Amount`／修饰系数／Target／条件分支，并对该项至少留一条真实 `TurnEngine.castSkill` 证据，特别覆盖该项区别于同构组的参数和负例。可以复用参数化测试及夹具，但必须有独立实体 ID、独立预期值，不能用“所有实体执行未崩溃”代替逐项检查。
5. 收集反例自动化：高风险组合（多目标 + 死亡、两次随机中心、施加状态的上一目标、净化后状态判定、爆破后重力／法力结算）优先；发现共用原语问题时先修引擎并检索所有调用，再补受影响实体测试。

**首批顺序**：204 项溅射／散射中的 32 个多段、1 个来源形态异例；以及账本仍记差异的 `troop:7468` 和 `weapon:1498`。轻／普通／重度溅射邻位比率分别为 `0.25/0.5/0.75`（依据已核原始步骤）；散射另按总伤害分配语义核查，不能把“每人一发”混为散射。后续按风险与出现频率选择状态／条件、造宝石、法力、身份变换等族。

## 4. 发现差异时的修复闭环

- **先定来源**：英文、原始步骤是否一致？若两者冲突，登记 `draft` 和争议证据；不凭某一份译文直接修改引擎。若是原版算法资料不足或用户已有裁定，保留现行实现并在记录中标注作用域与未决点。
- **区分缺陷层级**：数据（中文文案、费用、颜色、池）→ `src/data`／生成器；组装映射（漏步骤、错误参数、错分支）→ 对应 curated batch 或 `builders.ts`；公共语义（目标筛选、比例、死亡结算、特殊宝石）→ `src/engine/skills/`／战斗引擎。修改生成物前定位生成器，避免下次构建回滚。
- **先复现再修复**：新建聚焦测试，同时断言原始步骤／最终原型／实际战斗事件、HP／护甲／法力／状态／棋盘变化；至少一项负例。随机效果用固定种子或受控掷签，明确边界和统计口径。
- **反向搜索**：对受影响 builder／target／`ifCond` 查所有引用；批量报告标记可疑的实体重新进队列，而不是默默沿用先前签收。回归运行定向测试 → 全量验证 → 账本 → 排期索引，复检差异计数和源码指纹。
- **已知裁定冲突**：延续现行裁定，保留具体来源和差异状态；新官方证据／用户裁定后再改。未验证条款不能藏在“忽略整个技能”的标记下。

## 5. 怎样给一项技能签收（门槛不能降）

`data/audit/gow-skill-reviews.json` 的记录使用 `key = troop:<实体 ID>` 或 `weapon:<实体 ID>`；先作为 `decision: "draft"`。填写并复核：

- `scope: "stored-gow-snapshot"`、`reviewer`、`reviewedAt`、当前 `sourceDigest`；`sourceEvidence[]` 各有 `id/role/path/sha256/note`，至少含 `english-snapshot`、`native-snapshot`、`official-shared-rule` 三种来源，文件 hash 与内容必须匹配；证据需与本技能具体结论相关。
- `dimensions` 逐一覆盖 **12 维**：`identity-cost-colors`、`target-count-range`、`base-formula-rounding`、`boost-source-ratio-cap`、`conditions-probabilities-branches`、`status-duration-immunity`、`gems-types-selection-resolution`、`summon-transform-pools`、`order-death-retargeting`、`mana-economy-extra-turn`、`display-description`、`battle-pipeline`。每维注明结论、证据、适用性及实际通过的测试路径；`battle-pipeline` 必须 `verified` 且 `realBattleEntry: true`。
- `clauseReviews` 恰好覆盖全部英文子句；`nativeStepReviews` 恰好覆盖全部非 `None` 原始步骤；`branchReviews` 恰好覆盖所有原始分支。各条写对应证据、实际通过的测试套件、正反两面预期；未实现模式／晋升依赖只能依据来源限制**具体子句或步骤**，不能把基础伤害一起排除。
- 清理该实体 `confirmedDifferences`，核对身份／费用／颜色绑定检查无失败。仅此时把 `decision` 改为 `accept`；运行 `node scripts/verify-gow-snapshot.mjs`，检查同一 `fingerprint` 的 `verification-receipt.json` 有完整测试通过且类型检查为 0，并确认账本 `wholeSkillReview.eligible === true`、`acceptance.accepted === true`。任何证据缺失或指纹变化自动退回待验。

复用现有完整记录的**字段形状**而非照抄结论：例如 `data/audit/gow-skill-reviews.json` 中 `weapon:1008`。自动脚本的 `basic-shape-matched`、测试全绿、无崩溃、查到原版描述、覆盖了机制族，都**不是**单实体签收。

## 6. 每批对用户汇报什么

按固定顺序报：①本批核对实体数／所属同构组；②真实发现的差异与修改文件／已确认无需修改的口径；③定向与全量测试结果及指纹；④**整项签收前后**（例如 19 → N）和未决数；⑤剩余有具体 ID 的阻塞／来源冲突。不把「核对了 204 个形状」写成「验收了 204 个技能」，也不把按当前资料快照核对写成“官方最新版本一致”。

## 7. 多窗口分片与实时看板

名单固定在 `tasks/active/gow-skill-shards/manifest.json`，每 5 项一份 `TASK-Sxxxx.md`（末片 3 项；整片签收后更名为 `DONE-Sxxxx.md`），共 504 片。一个窗口认领 1 片或 2 片，形成 5／10 项批次；名单不会因为验收队列刷新而改动。`init` 只补缺失任务书，不覆盖窗口已写的核对记录。

```powershell
node scripts/gow-review-shards.mjs init
node scripts/gow-review-shards.mjs claim --worker window-01 --count 2
node scripts/gow-review-shards.mjs report --shard S0001 --worker window-01 --state reviewing --note "对照原始步骤"
node scripts/gow-review-shards.mjs report --shard S0001 --worker window-01 --state ready-for-merge --note "证据及测试已记入本片任务书"
node scripts/gow-review-shards.mjs release --shard S0001 --worker window-01
node scripts/gow-review-shards.mjs status
node scripts/gow-review-shards.mjs watch --interval 5
```

- 各窗口用不同的 `--worker`，`claim` 独占创建认领文件。每窗只改自己分片任务书及工单；`reviewing`／`needs-repair`／`ready-for-merge`／`reviewed` 仅代表工作进度。离开窗口时先报告再 `release`；待修片释放后可再次领取，待合并与已核对片不再自动派发。
- 并行窗口不要同时编辑共用引擎、生成器、`data/audit/gow-skill-reviews.json`、总账或生成索引。每片任务书记录每实体的原文—原始步骤—原型对照、需修复位置、独立测试、正反例。共享机制补丁交给协调窗口串行合并。若使用独立 Git 工作树，认领及工单状态必须写入同一共享任务目录；不同工作树的本地文件不会自行同步。
- 协调窗口将证据逐片合并到签收记录，按第 5 节复核，然后串行运行全量验证与索引。`STATUS.json` 记录全部 504 片、窗口与实体状态；`STATUS.md` 汇总。`watch` 每 5 秒读取磁盘上的工单及账本刷新看板；`claim`／`report`／`release` 会立即刷新。源码／review 改动后，整项签收数在新的同指纹凭证生成前不增加。