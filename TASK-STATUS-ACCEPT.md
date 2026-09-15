# 任务书 · 特殊状态批验收与提交（阶段 0，最先执行）

> 必读：`TASK-MASTER-PLAN.md`（总纲+共同约定）、`PARALLEL-WORK.md`。
> 你是本任务唯一窗口；完成后在 `PARALLEL-WORK.md` 台账登记，并在文末验收记录节填结果。

## 背景

另一窗口已实现「特殊状态批次」（死亡标记/诅咒等 GoW 状态研究落地），**改动完整在工作区但零提交**。窗口 D 已做过初验：lint 0 错、57 文件/613 用例全绿、build 通过。你的任务：深审 → 分逻辑块提交 → 更新文档口径 → 解冻主树。

在途改动清单（`git status`）：
- 引擎：`CombatResolver/GravitySystem/ManaDistributor/TurnEngine/events/skills/effects/{damage,status}/traits/types`
- 渲染：`App/EventStreamPlayer/SkillTestPage/StormIndicator/TeamView/statusBadges`
- 数据与生成器：`scripts/build_traits.mjs`、`src/data/traits.json`（268 code，含 battleStartStorm 5 code）
- 会话：`BattleSession.ts`
- 测试：7 个既有文件修改 + `tests/unit/combatSpecialStatus.test.ts`（新）
- 新增：`.kiro/specs/combat-mechanics/GOW-STATUS-RESEARCH.md`（状态研究）、`ASSET-GENERATION-PROMPTS.md`、`assets/音效/`（未盘点的新音效资产）、`assets/prompt/`（立绘提示词，**不归你管，不提交**）

## 阶段 1 · 内容深审（只读）

1. 读 `GOW-STATUS-RESEARCH.md` 与 `DECISIONS.md` 的状态相关小节，梳理本批实现了哪些状态（预期含死亡标记/诅咒族；`traits.ts` 里已有 `MARK_STATUS_ID='marked'` 纯标记态先例）。
2. 逐状态核对实现三件套：引擎语义（施加/结算/到期）、`statusBadges` 图标、测试覆盖（`combatSpecialStatus.test.ts` + controlStatus/ManaDistributor 等改动）。
3. 检查我方窗口 D 的既有资产是否被误伤：风暴（stormEngine/stormIndicator 测试也改了——diff 看改了什么、为何）；TURN HUD 横幅几何（`createTurnBanner`）与 refill 生成线（`setRefillSpawnTopPx`）是否仍在。
4. `assets/音效/` 盘点：文件清单、命名、是否已被 AudioManager 引用；产出 `artifacts/audio-inventory.txt`（给 TASK-AUDIO 用）。
5. 发现问题分级：必须修（阻塞提交）/ 可顺延（记录进验收记录节）。

## 阶段 2 · 提交（分逻辑块，不要一锅端）

建议切分（按实际内容调整，禁止把 `assets/prompt/` 混入）：
1. 引擎+数据：状态引擎 + build_traits + traits.json（+268 code 口径）
2. 渲染+音效资产：statusBadges/演出 + `assets/音效/`
3. 测试与文档：测试改动 + GOW-STATUS-RESEARCH.md + DECISIONS 增补
每块提交前跑一次门槛；全部提交后主树解冻，在 `TASK-MASTER-PLAN.md` 现状快照里把「主树冻结令」改为已解除。

## 阶段 3 · 口径修正（小改动，顺手做）

- `ASSET-GAPS.md` / `DECISIONS.md` 里「songoflight 开局风暴未实现」「死亡标记/诅咒待做」的表述按实际更新（battleStartStorm 已落地；死亡标记/诅咒以本批实际实现为准）。
- 缺口脚本 `scripts/_gap_analysis.mjs` 重跑一次，把新数字写进 DECISIONS 覆盖率小节。

## 验收标准

- 全部门槛绿；工作区只剩 `assets/prompt/`（立绘，归 TASK-PORTRAITS）。
- 台账登记完成；验收记录节列出：实现了哪些状态（含各自测试数）、必须修/可顺延清单、audio-inventory 路径。

## 验收记录（窗口 E · 2026-09-16）

### 结论

**通过，主树已解冻。** 三块提交：`6b1079a`（引擎+数据）→ `2cd8e3e`(渲染+音效资产) → `5ced37c`（测试+研究文档+任务书）；阶段3口径修正随后一笔 docs 提交。门槛提交前复跑全绿：lint 0 错、57 文件 / 613 用例、build 通过。

### 实际落地内容（比任务书清单多两族，均已深审）

1. **状态五件**（研究文档 `GOW-STATUS-RESEARCH.md` 六行，风暴单列）：
   - 疾病 disease —— 获得法力减半（ManaDistributor 取整），1 测试（ManaDistributor.test）。
   - 诅咒 curse —— 剥正面状态、自动解除基准/步长减半（5%）、穿普通免疫留 Invulnerable；**引擎语义无直接单测（可顺延①）**。
   - 死亡标记 death-mark —— tickStatuses 内 10%/回合即死（status-tick + defeat）；**该 tick 无直接单测（可顺延②）**。
   - 狂怒 rage/enraged —— 骷髅 1.5x、无视受击方特质（减伤/受击增益/附状态/反弹全跳过）、攻击后逐实例发 status-expire，1 测试（combatSpecialStatus）。
   - 魅惑 charm —— 骷髅改打己方下一名存活（无己方目标回退敌方队首），1 测试（combatSpecialStatus）。
   - 附带：自动解除循环从织网泛化为全状态 `recoveryChance` 累计（首 10%、每败 +10%、100% 封顶）；web 语义不变（webStatus 既有用例未动仍绿）。
2. **开局风暴**：`battleStartStorm`（songoflight/darkness/bones/fire/ice 五 code，traits.json 重生成 268 code），TurnEngine 构造期结算 + `takeInitialEvents()` 一次性消费；2 测试（stormEngine）。
3. **骷髅系风暴回填**：`dropKind` 契约（skull/doomSkull/uberDoomSkull）+ GravitySystem 骷髅掉落加成 + 指示器三贴图三光晕 + 测试台按钮；11 测试（skullStorm 新文件）+ 3 测试（stormIndicator 扩展）。
4. **炸毁骷髅官方口径**：法术伤害 1/5/10 打敌方队首（`settleExplodedSkulls` 复用 damageOne），与三消骷髅（攻击力/可闪避）分流；gemEffect 用例改写 + skullStorm 内含。
5. **演出**：七种状态 CSS 持续光晕、新徽记 5 枚（+别名归一）、特殊宝石触发反馈（环/标签/闪电扫光）、骷髅爆炸专用弹体 + skullHit 音。

### 窗口 D 资产核查（任务书阶段1.3）

- `createTurnBanner` 完好（App.ts，签名改为返回几何供指示器对位，行为增强）。
- `setRefillSpawnTopPx` **被有意替换**为 `pendingFallMaxCells`（整列刚体同落）：旧钳制会让补充堆压到还在下落的幸存宝石；配套 `scripts/verify-fall.mjs` 逐帧验证（已随块2入库）。非误伤。
- stormEngine/stormIndicator 测试改动 = 骷髅系风暴新增用例 + 风暴 set 演出时机迁移（不占时间线，plan 的 summonSfx/burstFx/holdSeconds 归零）；风暴指示器重设计为全域天色。演出取舍，非遗漏。
- `assets/音效/` 盘点 → **`artifacts/audio-inventory.txt`**：目录仅 `中毒.wav`（PCM 16bit/48kHz，113KB），未被 AudioManager 引用，命名不合既有英文约定；既有库 src/assets/audio/ 31 wav 完好。
- `tests/unit/controlStatus.test.ts` 经查为**幻影改动**（无内容 diff，行尾/统计脏标记），已随批归一，无实质变化。

### 问题分级

**必须修（阻塞提交）**：无。

**可顺延（记录在案，内容批消化）**：
1. 诅咒引擎语义缺直接单测（剥正面/解除减半/穿免疫边界）——建议 TASK-CONTENT 阶段5 接线特质时补。
2. 死亡标记 10% 即死 tick 缺直接单测（同上）。
3. Explode 类摧毁只给一半法力的官方规则未对齐（DECISIONS「骷髅爆炸」节已记录在案，需另开小项）。
4. 狼化/法力燃烧为半成品：状态生命周期/施加入口/图标/光晕已有，狼化缺 transform 事件+兵种模板解析；法力燃烧官方非持续状态（drainMana 可表达）。
5. 既有语义偏差清单不变（燃烧先扣甲/下潮/击晕/冰冻/屏障，DECISIONS 已列）。

### 口径修正（阶段3）

- ASSET-GAPS.md：已实现 11→16 状态 + 风暴全套；缺失表改「待接线」表；P1 打勾并新增 P1′（特质钩子接线，归 TASK-CONTENT）。
- DECISIONS.md：新增「覆盖率对账更新（窗口E）」快照（268/785、缺状态机制 106/397、风暴族 18 code=13 死亡召唤+5 开局）；「不做清单」中特殊状态家族条目作废移除。
- 总纲：主树冻结令标记已解除；基线快照改为已提交三块；音效行更新盘点结论。

### 工作区遗留（按防撞规则不归 E）

`assets/prompt/` + `scripts/build_portrait_prompts.mjs`（F 名下立绘脚手架，随 F 首次波次提交入库）。
