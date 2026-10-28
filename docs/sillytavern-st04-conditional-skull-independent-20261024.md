# ST-04 条件骷髅批次既有 33 份行为收据独立续签（2026-10-24）

当前完整行为签收 **33/33**；本次续签 33，新增完整签收 0，failed/stale/pending 均为 0。范围为既有 registry 的逐源 13 项 enemy-behavior 义务。6341、7038 继续无登记、无 run、无完整 review，不计入这 33 份或新增完整来源。

审查者为 `codex-independent-conditional-skull-renewal-20261024`，执行者为 `codex-main-conditional-skull-20261024`，身份不同。审查者执行测试、acceptance、构建及浏览器批次均为 0；生产、测试、registry、runs 和 STATUS 编辑均为 0。主 agent 可并行维护其他 docs、STATUS 与分类审计，本报告只将冻结的 src/scripts/tests、根配置、来源资料和本轮运行证据作为字节稳定性核对对象。

快照于香港时间 2026-10-24 01:40:36（UTC 2026-10-23T17:40:36.027630Z）建立，目录为 `.tmp/st-conditional-skull-review/baseline-20261023T174036027630Z/`。33 份旧 review、33 份对应旧 run 和 registry 共 67 文件均按原始字节保存；manifest SHA-256 为 `42d2ebeae209826b3a0e83b6420c33ebf8248ed8c8b96db68ea618a60841ff1f`。旧共享报告另保存在 `.tmp/st-conditional-skull-review/baseline-evidence/`。原始旧收据的 SHA-256 与路径逐源追加到 renewalHistory，历史条目和原有 evidence 字段逐项保留。

本次绑定的摘要为 `.tmp/st-conditional-skull-acceptance-summary.json`，SHA-256 为 `6684792702a2bc8f898ec085b4ed56559f4263b4d21cbdf3520556a07c8a42aa`；registry SHA-256 为 `0cb30fda41e4e1a40be7d67352450530d574dc2f9dc46689ba26e15cb658fe63`。原始共享报告为 `data/audit/st-enemy-runs/reports/batch-1704-bdec022c-43eb-4f54-887e-3a06ce3e7021.json`，SHA-256 为 `545aaa75d6593cde80cac812667c8c7d3f2e560988e3696d2e4980e43ad2db34`。本报告直接读取这些文件，并根据真实报告内容计算结果，未执行旧目录中带有旧摘要、旧人数或旧哈希的脚本。

直接解析共享原始报告：13 个实际测试文件、1945 passed、0 failed、0 pending，todo/跳过/运行错误均为 0；断言非空、文件集合完整、文件内 fullName 唯一，测试汇总与每条状态一致。Vitest 的 131 个 suite 包含嵌套 describe，不等于文件数。自写解析器结果也与 readAssertions 对照一致。

逐源完整核对所有 run 断言与登记文件在共享报告中的投影，校验命令、author、严格数字 exitCode=0、文件集合、计数和摘要绑定。429 项当前义务下 2741 次断言引用均唯一命中真实 passing；进一步递归核对旧 evidence 和嵌套历史中 9906 次 obligationAssertions 引用，仍全部唯一命中 passing。以上为允许重复的引用次数，不是额外测试数；逐源投影也不累加为批次执行数。

重新从正式 inventoryEntry/TROOPS 加载每个当前 subject，调用新鲜 fingerprintEnemies，并用独立实现重新生成按路径及字节长度分帧的目录哈希和规范 JSON 哈希，四项结果逐源相同。run 与摘要均绑定该结果；subject、portrait 和完整 registry contract 与旧 review 全部一致，源文件及图片字节也与旧收据最近一次独立审查哈希相同。test/implementation 指纹由本轮真实新执行重新绑定，不沿用旧树的执行摘要。

全部候选先经 validateEnemyEvidence 通过才落盘。落盘后再次重新加载正式 subject、重新计算两套指纹、重新解析报告与完整 run 投影，再对实际 JSON 运行 validateEnemyEvidence：33 passed，0 issues。1424 个受保护输入在本次审查写入前后字节哈希相同；142 个原引擎文件与本批 before/after 清单和初始快照均相同。最终机器回读为 `.tmp/st-conditional-skull-review/readback.json`。

只读查看了条件骷髅分类分支及专用回归文件：有效原生状态和有限数值 multiplier>1 才产生 skullOffense，语义保留“目标已有状态”“不施加该状态”“不保证条件成立或即时伤害”。原引擎使用当前目标状态取最强倍率；本次保留原生机制。before/after 结构记录的 59 个来源只新增 Warrior，无角色删除或公共战术效果增加，新增可达来源仅 6341/7038；这是分类与入口结构信息，不授予完整来源行为签收。视图中确认图例为“战术效果（可不选，勾选后全部必需）”。本轮 13 个登记文件的真实执行报告是这 33 份续签的运行依据。

主 agent 通报 Socrates 已通过生产切片只读独立验收并关闭 P1；该项按外部审查结论记录。本审查自行核对旧收据的当前绑定，不代签其 219 用例执行。两项 P2 保留：候选池变化可使旧语义预览失效，保留原蓝图且不静默替换；保守全树指纹使无关改动也触发续签，影响效率。

原有边界全文按序保留，只追加本轮说明。character-target 取消在 commit 前保持原子性，cell/color chooser 取消沿用付费施法和后续独立段继续；Frenzy 原生骷髅触发与较宽源文本差异、Treant remove 不直接取 mana、destroy/explode mana 条件及原生取整等历史边界继续有效。本次未把这些既有差异签为修复。6074 历史部分证据保持历史边界；本轮额外排除 6341/7038。

验收不扩展为结算入账或 HUD、全目录行为、稀有度 90% 门槛或 ST-04 产品整体完成。旧 evidence 中的报告、计数和作者仍表示各自历史；本轮有效绑定单独记录在 evidence.independentConditionalSkull20261024。

共享报告文件分布：

| 测试文件 | passing 断言 |
| --- | ---: |
| tests/unit/gowRhynaxWholeSkillAudit.test.ts | 39 |
| tests/unit/stEnemyDirectDamageAcceptance.test.ts | 813 |
| tests/unit/stEnemyMusketeerAcceptance.test.ts | 18 |
| tests/unit/stEnemySupportAcceptance.test.ts | 543 |
| tests/unit/gowCentaurScoutChargeAudit.test.ts | 19 |
| tests/unit/stEnemyBoardManaDesign.test.ts | 86 |
| tests/unit/stEnemyMappedAcceptance.test.ts | 220 |
| tests/unit/stEnemyMappedTraits.test.ts | 104 |
| tests/unit/gowOwlbearScreechAudit.test.ts | 27 |
| tests/unit/gowTreantBarkskinAudit.test.ts | 16 |
| tests/unit/gowPaladinJusticeAudit.test.ts | 24 |
| tests/unit/gowPeasantWholeSkillAudit.test.ts | 15 |
| tests/unit/gowRagnagordWholeSkillAudit.test.ts | 21 |

逐源续签结果（引用次数允许重复）：

| 来源 | 回读 | 义务 | 当前引用 | 当前唯一引用 | 历史引用 | 历史条目数 |
| --- | --- | ---: | ---: | ---: | ---: | --- |
| 6001 | passed | 13 | 82 | 33 | 328 | 6 → 7 |
| 6004 | passed | 13 | 38 | 18 | 152 | 6 → 7 |
| 6028 | passed | 13 | 69 | 25 | 276 | 6 → 7 |
| 6030 | passed | 13 | 81 | 30 | 324 | 6 → 7 |
| 6057 | passed | 13 | 86 | 33 | 344 | 6 → 7 |
| 6081 | passed | 13 | 50 | 20 | 200 | 6 → 7 |
| 6082 | passed | 13 | 117 | 46 | 468 | 6 → 7 |
| 6085 | passed | 13 | 74 | 27 | 296 | 6 → 7 |
| 6091 | passed | 13 | 76 | 28 | 304 | 6 → 7 |
| 6097 | passed | 13 | 96 | 44 | 384 | 6 → 7 |
| 6117 | passed | 13 | 85 | 32 | 340 | 6 → 7 |
| 6142 | passed | 13 | 84 | 37 | 336 | 6 → 7 |
| 6162 | passed | 13 | 105 | 34 | 420 | 6 → 7 |
| 6193 | passed | 13 | 85 | 38 | 340 | 6 → 7 |
| 6257 | passed | 13 | 86 | 33 | 344 | 6 → 7 |
| 6258 | passed | 13 | 45 | 17 | 180 | 6 → 7 |
| 6306 | passed | 13 | 80 | 30 | 320 | 6 → 7 |
| 6315 | passed | 13 | 137 | 48 | 548 | 6 → 7 |
| 6323 | passed | 13 | 78 | 31 | 312 | 6 → 7 |
| 6325 | passed | 13 | 72 | 26 | 288 | 6 → 7 |
| 6351 | passed | 13 | 103 | 33 | 412 | 6 → 7 |
| 6486 | passed | 13 | 52 | 24 | 208 | 4 → 5 |
| 6690 | passed | 13 | 73 | 27 | 292 | 6 → 7 |
| 6740 | passed | 13 | 103 | 33 | 412 | 6 → 7 |
| 6932 | passed | 13 | 78 | 29 | 312 | 6 → 7 |
| 7164 | passed | 13 | 103 | 54 | 412 | 6 → 7 |
| 7386 | passed | 13 | 74 | 28 | 296 | 6 → 7 |
| 6016 | passed | 13 | 92 | 43 | 184 | 0 → 1 |
| 6026 | passed | 13 | 78 | 38 | 156 | 0 → 1 |
| 6027 | passed | 13 | 91 | 51 | 182 | 0 → 1 |
| 6029 | passed | 13 | 94 | 50 | 188 | 0 → 1 |
| 6098 | passed | 13 | 96 | 51 | 192 | 0 → 1 |
| 6105 | passed | 13 | 78 | 35 | 156 | 0 → 1 |

本次实际修改的非临时文件为以下既有 33 review 及本文档：

- `data/audit/st-enemy-reviews/6001.json`
- `data/audit/st-enemy-reviews/6004.json`
- `data/audit/st-enemy-reviews/6028.json`
- `data/audit/st-enemy-reviews/6030.json`
- `data/audit/st-enemy-reviews/6057.json`
- `data/audit/st-enemy-reviews/6081.json`
- `data/audit/st-enemy-reviews/6082.json`
- `data/audit/st-enemy-reviews/6085.json`
- `data/audit/st-enemy-reviews/6091.json`
- `data/audit/st-enemy-reviews/6097.json`
- `data/audit/st-enemy-reviews/6117.json`
- `data/audit/st-enemy-reviews/6142.json`
- `data/audit/st-enemy-reviews/6162.json`
- `data/audit/st-enemy-reviews/6193.json`
- `data/audit/st-enemy-reviews/6257.json`
- `data/audit/st-enemy-reviews/6258.json`
- `data/audit/st-enemy-reviews/6306.json`
- `data/audit/st-enemy-reviews/6315.json`
- `data/audit/st-enemy-reviews/6323.json`
- `data/audit/st-enemy-reviews/6325.json`
- `data/audit/st-enemy-reviews/6351.json`
- `data/audit/st-enemy-reviews/6486.json`
- `data/audit/st-enemy-reviews/6690.json`
- `data/audit/st-enemy-reviews/6740.json`
- `data/audit/st-enemy-reviews/6932.json`
- `data/audit/st-enemy-reviews/7164.json`
- `data/audit/st-enemy-reviews/7386.json`
- `data/audit/st-enemy-reviews/6016.json`
- `data/audit/st-enemy-reviews/6026.json`
- `data/audit/st-enemy-reviews/6027.json`
- `data/audit/st-enemy-reviews/6029.json`
- `data/audit/st-enemy-reviews/6098.json`
- `data/audit/st-enemy-reviews/6105.json`
- `docs/sillytavern-st04-conditional-skull-independent-20261024.md`

其余本审查输出均在 `.tmp/st-conditional-skull-review/`：快照与 manifest、baseline-check、preflight、候选、写入清单、独立核对脚本和 readback；未写其他审查范围文件。最终回读时间：2026-10-23T17:50:27.481Z（UTC）。
