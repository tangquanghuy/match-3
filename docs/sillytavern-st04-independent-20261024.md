# ST-04 2026-10-24 独立复核收据说明

本说明对应新增 6 源和续签旧 27 源，共 33 份 enemy-behavior review JSON。签署范围为各 registry record 的 13 项义务；6074 明确排除。主线程维护共享 review、manual、STATUS、TASK 与最终 inventory，本复核只写 33 份 JSON 及本文档。本文档和 review JSON 不进入 source fingerprint。

复核时间：2026-10-23T16:59:40.300Z。复核者：codex-independent-mapped-six-renewal-20261024。本批 ST 新增实现、classifier、fixtures 和测试均非本复核者所写。此前本复核者写过的基础引擎试验已按自身四处 hunk 精确撤回，专属测试已移除；保留此前已有脏树改动。当前 TurnEngine.ts SHA-256 为 `4e429203d3e67a40f742a1b189187324f681d877c4bb343d4a083969ebc66d6d`，`tests/unit/stCastChoiceCommit.test.ts` 不存在。本轮未改生产、测试、registry、run 或共享 review.md。

本复核者没有执行测试、build、验收批次或浏览器。1945/1945 是 codex-main 执行的最终共享报告结果；独立工作包括源码与原始字段审查、原始报告解析、完整 run 投影比较、义务引用解析、当前 subject 构造与指纹重算、候选收据校验及落盘后回读。

最终报告：`data/audit/st-enemy-runs/reports/batch-32364-f8c2dad6-b49e-4692-a000-aaa6fc22fea4.json`；SHA-256：`94da41c77626f5176318ea4ef01f8c01a11bf7dbb43e9679531dae3ae16192fb`。Registry SHA-256：`0cb30fda41e4e1a40be7d67352450530d574dc2f9dc46689ba26e15cb658fe63`；摘要 `.tmp/st-mapped-final-summary.json` SHA-256：`630b9ef6eba1402c626f925bbe30f6fd6b627790b91b2c026137329e9df46330`。严格解析确认 13 文件共 1945 passed，0 failed/pending/todo，无重复 fullName、缺失文件或运行错误；boardMana 参数标题的唯一编号已反映在最终报告。逐源 run 为共享文件投影，禁止将投影计数相加解释为实际测试总数。

已核对 33/33 run 的完整断言投影、作者、退出码、报告/registry/contract/run digest 以及四项当前指纹；429 项义务下共 2741 条引用均唯一命中 passing 断言（这是重复引用次数，并非独立测试数）。旧 27 的 subject、portrait、contract 未变，原有审查证据和边界完整保留，旧收据原始哈希及历史追加在 renewalHistory，本次绑定另列 independentMappedFinal20261024。6486 历史引擎原始哈希仅有 CRLF/LF 差异，历史字段保留，本次绑定实际当前字节。

独立原始字段核对覆盖 7 源完整 troop、全部普通 traits、progression、portrait 条目和实际图片字节；比对 raw 英文 spell、native spell 各冻结字段及完整 SpellSteps、native traits RawData 与英文 trait 子句。按原始 base+growth 后 difficulty 四舍五入独立复算 28 组 panel（1@1、20@1、20@1.5、7@1.3），无差异。6074 的这些结果只是部分证据。

三个此前 P2 缺口已在冻结测试中补齐并在最终 passing 引用中确认：skillId-only 与 recipeSignature-only 分别篡改；7 源四档缩放及 JSON 后的 source/learning identity；6074/6105 live/restored ST prototype 精确 manaGemsOnly。完整 prototype 使用 toEqual 冻结。未发现未关闭的新增 P1/P2。

新增 6 源：6016、6026、6027、6029、6098、6105。主动技能、三普通特性、四档缩放、真实 BattleRequest→prepare/map→TurnEngine/BattleSession、自然充能与双方行动、JSON 延续和非法操作的证据分别列在每源 JSON；12 条精确 native 映射引用均在最终报告 passing，映射文件自身不授予验收。harness 的假敌探针只替换对方 gw_KnightsSword，主体保留完整技能与特性；手动构造引擎不扩大为浏览器端到端证明。

公开入口以 compileEnemyDesign 的实际语义输入、四维图片交集、精确 recipe、完整保留能力、save/restore 为准。六源固定 seed 分别为 6016=1、6026=1、6027=0、6029=3、6098=18、6105=5；完整输入以 boardMana 测试与 main manual 为准。source/artwork 职责不是实际能力证明；旧 6117 的 source Assassin 仍不构成 semantic Assassin，实际识别 Defender/Striker/Mage。classifier 变化不重写原生技能或 trait 语义，旧 27 的本次续签依据当前证据绑定，不凭旧报告签新树。

main 新增真实浏览器预验收结果 `.tmp/st-mapped-ui-check.json` 已只读回阅：六源编译→保存→刷新字段相同→加入 1/4 编队通过，6074 公开入口失败保留旧保存，pageErrors=[]。执行者为 main；本复核者未执行或代签该浏览器批次。build、99 语义回归及 9 浏览器通过为 main 报告的补充结果。Raman 的 1821 源 classifier 统计亦为其独立报告，不纳入本复核者的全量签署。

原生复用边界必须随收据保留：

- character target 取消在 commit 前，保持原子性；cell/color chooser 在 commit 后，取消仍付 mana/触发 cast hook，对应棋盘段为空，其余独立段继续（6016 仍伤害）。这是本批前已有行为，未宣称修复，也未宣称所有取消均原子。
- Frenzy 原生只在骷髅受伤触发，法术受伤不触发；与更宽的原始源文本差异明确保留。ST 测试对骷髅真实触发、法术不触发、Barrier 控制均有证据，不签为源文本差异修复。
- Treant 为 remove Brown，不直接取 mana；后续 cascade 单列。destroy/explode 的 mana 为条件能力，爆破逐色折半取整、area 不加额外溅射，不保证颜色或数量。
- 6074 的真正 SKULL 机制支持 skullOffense/Warrior，既非只凭源 Warmaster 标签，也非免疫状态推 Defender；Purple/Brown 领主实际无 Warrior 图片，公开入口 no_exact_match。完整接入/召唤与手动蓝图保持部分证据，不登记、不写完整收据、不增加通过数。
- 验收不扩展为战斗奖励持久入账、HUD、完整 ST-04、全目录行为或 90% 覆盖。

逐源计数（引用次数允许重复；文件投影不等于本源独有用例）：

| 源 | 本次 | 义务引用次数 | 唯一引用数 | 注册文件投影 |
|---|---|---:|---:|---:|
| 6001 | 续签 | 82 | 33 | 852 |
| 6004 | 续签 | 38 | 18 | 18 |
| 6028 | 续签 | 69 | 25 | 543 |
| 6030 | 续签 | 81 | 30 | 813 |
| 6057 | 续签 | 86 | 33 | 813 |
| 6081 | 续签 | 50 | 20 | 543 |
| 6082 | 续签 | 117 | 46 | 543 |
| 6085 | 续签 | 74 | 27 | 813 |
| 6091 | 续签 | 76 | 28 | 543 |
| 6097 | 续签 | 96 | 44 | 543 |
| 6117 | 续签 | 85 | 32 | 813 |
| 6142 | 续签 | 84 | 37 | 543 |
| 6162 | 续签 | 105 | 34 | 543 |
| 6193 | 续签 | 85 | 38 | 543 |
| 6257 | 续签 | 86 | 33 | 813 |
| 6258 | 续签 | 45 | 17 | 543 |
| 6306 | 续签 | 80 | 30 | 813 |
| 6315 | 续签 | 137 | 48 | 543 |
| 6323 | 续签 | 78 | 31 | 543 |
| 6325 | 续签 | 72 | 26 | 543 |
| 6351 | 续签 | 103 | 33 | 543 |
| 6486 | 续签 | 52 | 24 | 543 |
| 6690 | 续签 | 73 | 27 | 543 |
| 6740 | 续签 | 103 | 33 | 543 |
| 6932 | 续签 | 78 | 29 | 813 |
| 7164 | 续签 | 103 | 54 | 813 |
| 7386 | 续签 | 74 | 28 | 813 |
| 6016 | 新增 | 92 | 43 | 429 |
| 6026 | 新增 | 78 | 38 | 437 |
| 6027 | 新增 | 91 | 51 | 426 |
| 6029 | 新增 | 94 | 50 | 434 |
| 6098 | 新增 | 96 | 51 | 425 |
| 6105 | 新增 | 78 | 35 | 431 |

实际落盘回读和第二次新鲜指纹核对结果将在完成后附记。

最终回读（2026-10-23T17:00:59.637Z）：33/33 磁盘收据 validateEnemyEvidence=passed，0 issues；新增 6、续签 27。33 源四项指纹前后全部一致，97 个受保护文件原始哈希全部未变；旧 27 所有既有 evidence 字段、历史与 boundaries 均完整保留。6074 无 registry record、无 review JSON。回撤引擎哈希一致，专属试验测试仍不存在。原始最终报告重新解析保持 13 文件 1945 passed。机器回读明细为 `.tmp/st-independent-20261024-final/readback.json`（此文件不进入指纹）。
