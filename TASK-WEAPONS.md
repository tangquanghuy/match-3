# 任务书 · 窗口 K · 武器接入（gowhead 718 把 → 引擎可用的主角武器）

> 2026-09-17 开工。窗口 K 分两个子包并行：**K-A 数据管线**、**K-B 法术组装**。
> 必读：`PARALLEL-WORK.md`（协议与台账）、本文件、各子包的「必读」清单。
> 数据快照已就绪：`artifacts/gowhead-weapons/`（718 把，中英双语，README 有字段速查）。

## 0. 背景与总目标

gowhead.com 是项目兵种数据的原始来源（`data/raw/troops.gow.zh.json` 即其 dump，`scripts/build_troops.mjs` 消费）。现已抓取**武器全量快照**：

- `artifacts/gowhead-weapons/raw/weapons.gow.zh.json` / `.en.json` —— 双语原始 dump（结构与 troops dump 同构，718 条）
- `artifacts/gowhead-weapons/weapons.json` —— 合并视图（英文字段 + `_zh{name,spellName,spellDesc,status}`；**716/718 法术全中文**，2 把新武器半翻译）
- `artifacts/gowhead-weapons/icons/cards/{Id}_{ReferenceName}.webp` —— 718 张卡面图标（本地，不入库）
- `artifacts/gowhead-weapons/README.md` —— 字段速查（法术文本/淬炼词缀 affixes/稀有度成长数组/发布日期）

总目标：**每把武器 = 主角的一个技能载体**。数据层产出干净的 `src/data/weapons.json`（对齐 troops.json 风格），技能层把 718 条法术文本编译成引擎可执行的 curated batch（与部队技能同一管线）。主角战斗装配（装备栏/编队 UI）归 J 窗口 meta 主线，不在本任务书范围。

## 1. 子包 K-A · 数据管线

**职责**：gowhead 快照 → `src/data/weapons.json`（生成器唯一入口，产物勿手改）。

| 项 | 约定 |
|---|---|
| 生成器 | `scripts/build_weapons.mjs`（新）。输入 raw/weapons.gow.zh.json（主）+ .en.json（对照），输出 `src/data/weapons.json` |
| Schema | 对齐 troops.json：`id`(gowhead Id)、`name`(中文显示名，无中文回退英文)、`nameEn`、`referenceName`、`rarity`(Common/Uncommon/Rare/UltraRare/Epic/Mythic/Doomed)、`rarityIdx`、`kingdom`(中文)、`weaponType`(Sword/Bow/…14 类)、`attack/armor/health/magic`(主角装备加成)、`manaColors[]`、`manaCost`、`spell{id,name,description(中文),meta{scalings,raw,parsed}}`、`affixes[{name,description,rarity}]`(淬炼词缀，有中文用中文)、`masteryRequirement`、`releaseDate`、`immortal`、`imageFile`(icons/cards 文件名，供表现层引用) |
| 缩放预解析 | **逐字复用 build_troops.mjs 的内联解析器**（[魔法 + 4] / [(魔法 / 2) + 3] / [x3] / [3:1] → SkillMetadata；文件头注释同样注明「必须与 src/engine/skills/scaling.ts 等价」）。zh 法术文本已验证与该解析器句式吻合 |
| 测试 | `tests/unit/weaponData.test.ts`：718 条不缺不重（id/referenceName 唯一）、rarity 值域、manaColors⊆6 色、每条 spell.description 非空且 meta.parsed=true（法术含括号公式时 scalings 非空）、抽 5 把已知武器做快照断言（骑士之剑/雅思敏的弓/野性匕首等，锁定中文名/费用/公式解析值）、affixes 结构 |
| 报告 | `artifacts/weapons-build-report.txt`：总数、按稀有度/类型/颜色分布、中文名覆盖率、scalings 解析统计、与 troops.json 的 kingdom 中文名差异清单（武器王国应全部命中 troops.json 已有 42 王国中文名——用 build_troops 同款映射，报差异不许自造译名） |

## 2. 子包 K-B · 法术组装（curated 批次）

**职责**：718 条中文法术文本 → 引擎可执行技能（同部队管线），产出台账式分诊报告。

先研究再动手，顺序建议：
1. `scripts/spell-rules.md`（句式→效果段规则，§0 语义裁定必读）
2. `src/engine/skills/builders.ts`（可用组合器清单）+ `src/engine/skills/curated/index.ts` + 任一 `curated/batch-*.ts`（格式样板）+ `curated/batch-r1.ts` 头注（散射/裸伤害等新裁定）
3. **自动组装先例**：`scripts/gen_recycle_batch_r1.mjs`（R 系批次就是规则化批量生成 desc↔build 的生成器）+ `scripts/_analyze_simple_skills.mjs` / `_simple_skills_report.txt`（句式家族分诊先例）
4. `make_spell_pools.mjs`（池提取格式参考）

产出：
| 项 | 约定 |
|---|---|
| 池提取 | `scripts/_weapon_pools.mjs`（新）：从 weapons 快照抽 {spellId, weaponRef, weaponName(zh), desc(中文), scalings, manaCost, colors} → `scripts/curated-pools/pool-w01.json`（W 系命名，与部队池错开） |
| 组装批次 | `src/engine/skills/curated/batch-w01.ts` 起（W 系）：格式与部队批次完全一致（`SPELLS: {id: SpellId, desc, build: skill(...)}[]` + `SKIPPED: {id, reason}[]`），在 `curated/index.ts` 追加注册（**共享文件，动前已按台账登记**；只加一行 import + 一行注册，不重排他人行） |
| 分诊策略 | 规则可判 → 组装；同一法术族（如「对第 1 名敌人造成 [魔法+X] 点伤害」变体）做参数化模板批量收；规则外 → SKIPPED 注明原因（对齐部队放弃桶格式）；**需要新引擎原语的** → 记入报告「原语请求」节，不实现（builders/prototypes/effects 归 G 窗口所有，K 不得改） |
| 测试 | `tests/unit/weaponSpell*.test.ts`：①编译审计——pool 里每条 spellId 要么进批次 build、要么在 SKIPPED 带原因、要么在报告原语请求清单，三类并集=718，无遗漏无重复；②语义冒烟——抽 8~10 条代表性技能（直伤/真伤/增幅比/状态/宝石操作/增益/额外回合/复合），经引擎管线执行断言事件形态（参照既有 curated 批次的测试写法） |
| 报告 | `artifacts/weapon-spell-triage.md`：编译数/放弃数/原语请求数、句式家族分布表、放弃清单摘要、原语请求清单（句式样例 + 期望的原语形态，供 G 评估） |

**注意**：武器法术 id（SpellId，样本 10065 等 1 万段）与部队法术 id（7xxx 段）不同段，但**动工前先核对** curated 既有 id/`SKILL_OVERRIDES` 无冲突（脚本扫一遍），冲突处理方式写进报告。

## 3. 共同防撞条款（硬性）

1. **禁止 `git add -A` / 禁止 commit**——两子包 + 其他窗口共享工作树，完成后由协调者按路径分批提交。你只改文件、跑测试。
2. **不碰**：`src/engine/skills/{builders,prototypes,scaling,targeting,targetChooser}.ts`、`src/engine/skills/effects/**`、`TurnEngine.ts`、`types.ts`、`events.ts`、`troops.json`、`build_troops.mjs`、`build_traits.mjs`、`traits.json`、他人批次（batch-数字/batch-r/pool-数字）、`design/**`。
3. K-B 唯一允许的既有文件写入：`src/engine/skills/curated/index.ts`（一行注册，已登记台账）。
4. 测试前缀：K-A `weaponData*`、K-B `weaponSpell*`。
5. 验证门槛：完工前 `npm run lint` 零 error + `npx vitest --run` 全量绿（全量是共享护栏，挂了先修自己的）。**不跑 `npm run build`**（协调者合并后统一跑，避免并发写 dist）。
6. 动工前把「窗口 K」登记行核对一遍（本文档 + PARALLEL-WORK.md 台账），发现与在途工作冲突立即停手并在最终报告里说明。

## 4. 验收标准

- K-A：`src/data/weapons.json` 生成器可重跑幂等；审计测试绿；报告产出；零共享文件改动。
- K-B：pool-w01 全量 718 条进池；批次编译数 + SKIPPED 数 + 原语请求数 = 718（三类并集完整）；审计测试与冒烟测试绿；triage 报告产出；index.ts 仅追加注册。
- 协调者合并门槛：`npm run lint && npm test -- --run && npm run build` 全绿，按路径分两笔提交（K-A 一笔、K-B 一笔）。
