# 运行时 AI 提示词盲测与现有组装器模拟（2026-10-25）

> 此文保留修复前基线。2026-10-25 后续解绑、原样复跑与新盲测结果见 [立绘颜色解绑修复记录](sillytavern-portrait-mana-decoupling.md)。

结论：6 个原始战斗块均符合现有解析器要求，但完整遭遇组装为 **0/6**，18 次固定种子整队尝试全部失败。16 名敌人仅 1 名能独立组装。15 名敌人均在四维立绘严格相交阶段触发 `no_exact_match`，尚未进入主动与特质选择。

这次证据表明当前提示词与组装器之间存在入口阻断。既有 1800/1821 结构覆盖与本结果的分母不同：前者从库内已知来源出发，本轮从 AI 按提示词自由生成的合法参数出发。结构覆盖和定向回归通过没有证明实际运行时 AI 的自由出块可用性。

## 方法与原始材料

- 两个全新子 agent，不继承主线程上下文，各生成三份独立回复，共 16 名敌人，人数为 1/2/4 与 2/3/4。每个 agent 唯一获准阅读的项目文件为本地留存的公开下载提示词。未提供源码、候选目录或有效字段组合；原始回复保持原样。
- 测试的是 [冻结提示词](../.tmp/st-prompt-blind-simulation/runtime-ai.md)，与测试时 `runtimeAiPrompt()` 逐字一致。没有混用用户手工编辑的 `docs/sillytavern-runtime-ai-prompt.md`。
- SHA-256：`3a613e697479894c4653373ea4cd47f81fed97f5e0455c023877a540f97d9221`。
- 事先固定种子 `1、17、6817`，每份消息原样经 `parseRuntimeEncounter → compileEnemyEncounterPlan`。只有完整队伍成功才记为整队通过；单体排查单独统计。
- 解析器补入的 `difficulty:1 / effects:[] / assembly:classified` 是程序内部规范化结果，原始 AI JSON 未填写这些字段。
- 成功单体通过 `prepareStBattle → BoardGenerator → TurnEngine → BattleSession`，双方使用现有 `chooseAiAction` 自动行动，每场至多 300 个有效行动。固定调试主角（HP 1000、护甲 20、攻击 5、魔力 4、Blue、费用 12、现有骑士剑），用于验证执行与恢复，不用于评估平衡。
- 未强制充满法力、未改敌人属性、未强制投降。每场从相同初态重复运行，对比完整行动、事件、结果与 RNG；另外核对生成快照 JSON 保存恢复。
- 本轮验证运行于 Node 中的现有引擎，没有将它记作浏览器或真实酒馆联调通过。

## 完整遭遇结果

| 原始回复 | 敌人数 | 解析 | 整队组装成功种子 | 可独立组装敌人数 |
|---|---:|---|---:|---:|
| [agent-a-1.txt](../.tmp/st-prompt-blind-simulation/agent-a-1.txt) | 1 | 通过 | 0/3 | 0/1 |
| [agent-a-2.txt](../.tmp/st-prompt-blind-simulation/agent-a-2.txt) | 2 | 通过 | 0/3 | 0/2 |
| [agent-a-3.txt](../.tmp/st-prompt-blind-simulation/agent-a-3.txt) | 4 | 通过 | 0/3 | 0/4 |
| [agent-b-1.txt](../.tmp/st-prompt-blind-simulation/agent-b-1.txt) | 2 | 通过 | 0/3 | 1/2 |
| [agent-b-2.txt](../.tmp/st-prompt-blind-simulation/agent-b-2.txt) | 3 | 通过 | 0/3 | 0/3 |
| [agent-b-3.txt](../.tmp/st-prompt-blind-simulation/agent-b-3.txt) | 4 | 通过 | 0/3 | 0/4 |

六份回复均只有一个战斗块、顶层仅 `enemyDesigns`、在结束标记后停笔，且没有要求 AI 设计 effects。提示词要求的出块格式在这六份样本中正常执行。

## 原始敌人参数与组装结果

| 样本及敌人 | 档位 | 外形 | 职责 | 颜色 | 结果 |
|---|---|---|---|---|---|
| agent-a-1.txt E1 | 杂兵 | 野兽 | Warrior | Brown + Blue | no_exact_match |
| agent-a-2.txt E1 | 精锐 | 人形 | Assassin | Purple + Green | no_exact_match |
| agent-a-2.txt E2 | 首领 | 类人 | Defender | Yellow + Brown + Red | no_exact_match |
| agent-a-3.txt E1 | 领主 | 人形 | Warmaster | Yellow + Red + Blue | no_exact_match |
| agent-a-3.txt E2 | 传奇 | 异形体 | Warlock | Purple + Brown | no_exact_match |
| agent-a-3.txt E3 | 精锐 | 怪物 | Generator | Green + Yellow | no_exact_match |
| agent-a-3.txt E4 | 精锐 | 类人 | Mage | Blue + Purple + Red | no_exact_match |
| agent-b-1.txt E1 | 杂兵 | 人形 | Defender | Brown + Yellow | no_exact_match |
| agent-b-1.txt E2 | 杂兵 | 野兽 | Striker | Red | 成功 |
| agent-b-2.txt E1 | 精锐 | 类人 | Warrior | Red + Brown | no_exact_match |
| agent-b-2.txt E2 | 首领 | 人形 | Mage | Blue + Purple + Yellow | no_exact_match |
| agent-b-2.txt E3 | 杂兵 | 怪物 | Generator | Green + Yellow | no_exact_match |
| agent-b-3.txt E1 | 传奇 | 人形 | Warmaster | Red + Yellow + Brown | no_exact_match |
| agent-b-3.txt E2 | 领主 | 异形体 | Warlock | Purple + Blue | no_exact_match |
| agent-b-3.txt E3 | 精锐 | 类人 | Support | Green + Yellow + Blue | no_exact_match |
| agent-b-3.txt E4 | 精锐 | 野兽 | Assassin | Purple + Red | no_exact_match |

典型失败输入（agent-a-1 原文）：

```json
{"enemyDesigns":[{"rank":"杂兵","level":8,"form":"野兽","role":"Warrior","manaColors":["Brown","Blue"]}]}
```

这组值全部在提示词的合法选项内，解析通过；三个种子均在选图时报 `no_exact_match`。这是候选集合为空，换随机种子不会解决。

15 个失败敌人中，6 个在其余三个维度固定时存在其他外形；另 9 个连其他外形都没有。组装器未替换外形、职责、档位或颜色，本轮也未人工修正输入。

## 唯一成功单体的真实战斗

agent-b-1 的 E2：17 级、杂兵、野兽、Striker、Red。原始两人遭遇仍然失败；这里只隔离 E2 验证已有机械链路，不计作该场整队通过。

| 种子 | 主动来源 | 法力费用 | HP/护甲/攻击/魔力 | 有效行动 | 敌方施法次数 | 结束 | 保存恢复及重复战斗 |
|---:|---|---:|---|---:|---:|---|---|
| 1 | enemy:6020 | 8 | 12/10/6/7 | 9 | 0 | 自然终局 | 通过 |
| 17 | enemy:6004 | 6 | 11/6/9/8 | 22 | 1 | 自然终局 | 通过 |
| 6817 | enemy:6020 | 8 | 12/10/6/7 | 17 | 0 | 自然终局 | 通过 |

种子 17 的产物为单体伤害主动：伤害公式 `max(0,round(魔力+2))`、费用 6，特质为野兽之盾、穿透护甲、背叛之礼。该场双方各施法一次，事件流含 3 条 `skill-damage`，自然终局。其余两个种子也自然终局，但敌人尚未施法就已被击败，因此这两场只证明开战、三消、结算和确定性，不宣称主动已执行。三场胜者均为调试主角；该胜率没有平衡评估意义。

## 独立复核与证据边界

第三个子 agent 已独立读取原文、核对哈希、直接核算素材交集，并在内存中复跑当前源码；排除耗时字段后，各样本明细与本报告一致。核心统计、三场自然终局、配置保存恢复和战斗确定性均获复核。见 [独立复核记录](../.tmp/st-prompt-blind-simulation/independent-review.md)。

本次“只看提示词”以全新 agent 的任务约束和完成声明为依据：两个生成 agent 均未开启上下文继承，未向它们提供目录或代码；没有使用文件系统强制访问隔离。文件包没有附完整读取轨迹或独立的种子事前时间戳。因此可复查的是原始输出哈希、当前源码及确定性运行结果，历史访问约束另有声明边界。没有根据结果修改原始参数或挑选种子。

## 产品与任务状态

当前阻断来自提示词宣告的参数自由组合空间与程序实际候选空间不一致：提示词让 AI 分别选择颜色、档位、外形和职责，选图器却要求现有素材同时满足全部维度。技能加权组装尚未获得处理这些失败样本的机会。

应先对齐运行时输入契约与素材选择约束，再重新进行同标准盲测。后续设计须保留玩家要求的敌人身份和外形语义；本报告没有自行放宽匹配、改写样本或修改正式代码。ST-04 与 ST-06 需记录此入口阻断；整版交付状态保持进行中。

## 复查材料

- [运行脚本](../.tmp/st-prompt-blind-simulation/run.mjs)：重新运行 `node .tmp/st-prompt-blind-simulation/run.mjs`，再运行 `node .tmp/st-prompt-blind-simulation/write-report.mjs`；保留所有原始样本，脚本读取当前源码并重新生成结果。
- [完整机器结果](../.tmp/st-prompt-blind-simulation/report.json)：原始样本哈希、规范化输入、每个种子诊断、选定技能/特质/面板、完整行动和事件流。
- [agent A 任务与完成记录](../.tmp/st-prompt-blind-simulation/agent-assignments.md)。同文件也保留 agent B 的任务与完成声明。
