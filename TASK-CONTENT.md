# 任务书 · 特质与技能内容收口（阶段 1，最高优先级）

> 必读：`TASK-MASTER-PLAN.md`、`PARALLEL-WORK.md`、`.kiro/specs/combat-mechanics/DECISIONS.md`（裁定记录）、`scripts/spell-rules.md` + `scripts/spell-assembler.md`（技能管线规则）。
> 前置：TASK-STATUS-ACCEPT 已提交（主树解冻；其实现的状态会直接扩大你的可做集）。

## 背景（现状数字）

- 特质：268/785 code（70% 出场）。剩余大头：未归类 293、缺状态机制 ~111（死亡标记/诅咒批落地后此桶会缩小）、条件光环 65、特殊宝石创造 21、召唤钩子 15。
- 技能：521 编译 / 722 放弃 / 555 待核对 = 1798 行（唯一 1793）。核对进度在 `artifacts/spell-build.txt`；批次产物 `src/engine/skills/curated/batch-*.ts`。
- 已知两处「必须修」（B 抽样验收产出）：① spell-rules.md 滞后实现（bleed 已启用、build_spells.mjs/spells.json 不存在、drainedMana 来源表错、raceTimes ×N 未写）；② 多伤害段 modifier 挂载未裁定（7059/9344/8181 三条，首段吃不到加成）。

## 阶段 1 · 规则与文档对齐（半天，先做——后面所有核对都依赖它）

1. 修 spell-rules.md 四处滞后（上述①的四个点），以引擎/测试现状为准绳。
2. 裁定并文档化「一个 modifier 覆盖多个数值段」语义（建议：来源子句辖全技能同类伤害段），回改 3 条批次条目 + 对应用例。
3. `npm test` 确认零回归后提交。

## 阶段 2 · 回收批（估解锁 100~200 条技能，不动引擎）

数据源：放弃桶里 ① 明文标注「现可表达」的 56 条；② 「二次缩放来源不支持」族 ~93 条中可用多来源 `sources:[]` 表达的部分（curated 已有 24 处先例）；③ `reduce stat:'hp'` 等表述过时的（逐条复核，如 7507 卡「削减所得归目标」变体则维持放弃）。
做法：逐条重新 triage → 组装进新 batch 文件（沿用 desc 逐字锚/白名单/数值护栏/固定种子烟雾执行四件套）→ 更新 spell-build.txt 记账。**放弃桶改动必须留理由，不许静默降级。**

## 阶段 3 · 特殊宝石创造接线（一次性解锁 ~166 条）

`skills/effects/gems.ts` 的 createGems 管线支持 `SpecialGemSpec`（C 窗口的宝石行为全部现成：`specialGem(kind, tier?)` 构造器、`SPAWNABLE_SPECIALS` 白名单、debugSetGems 演出管线）。
- 先写引擎级单测（创造炸弹/织网/闪电/通配/许愿各一），再批量回收放弃桶里「创造 N 颗特殊宝石」类技能。
- 与台账协调：`gems.ts` 是共享文件，动前登记。
- 表现核对：创造的宝石要走既有 gem-create 演出（GemSprite 已支持特殊宝石贴图）。

## 阶段 4 · 555 待核对消化（吞吐任务，可分多波）

按 `scripts/curated-pools/` 池文件顺序核对组装。质量四件套不放松；每完成 100 条提交一次并更新 spell-build.txt 头部三项数字（保持三项和恒 = 1798）。

## 阶段 5 · 特质长尾（按出场次数降序）

1. 条件光环 65 code / 132 次（「配对 4/5 时全族获得 X」）：需要 onBigMatch 家族触发点扩展，引擎改动收敛在 traits.ts 编译 + CombatResolver/TurnEngine 触发点。
2. 特殊宝石特质 21 code（`_authoring-guidelines` 无关，见 gap-analysis 清单）：宝石行为已落地，挂事件钩子即可。
3. 剩余「未归类 293」按批判读：能归入既有机制的表达之；真不做的进 DECISIONS 不做清单（带理由）。
4. 每批重跑 `node scripts/_gap_analysis.mjs` 更新覆盖率数字进 DECISIONS。

## 边界与验收

- 你的文件：`src/engine/skills/**`（新 batch 文件、builders/effects 按需）、`src/engine/traits.ts`、`scripts/build_traits.mjs` + `src/data/traits.json`、`tests/unit/{trait*,spell*}`、spell-rules/assembler 文档。
- 共享文件（TurnEngine/CombatResolver/events/types/gems.ts）：动前台账登记，编辑前重读最新内容。
- 每阶段门槛全绿 + 提交。最终验收指标：特质 code ≥ 400（或未实现桶仅剩「不做清单」）、技能三项数字此消彼长且和恒 1798、gap-analysis 新快照入库。
- 产物：每阶段结束在 `artifacts/content-progress.md` 追加一行进度（日期/阶段/数字变化），供总纲汇总。
