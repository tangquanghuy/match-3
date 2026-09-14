# 窗口 B 任务书 · 技能编译与批量配置

> 你负责本仓库的**技能内容批量生产**。开工前按顺序读完：
> 1. `PARALLEL-WORK.md`（三窗口并发边界，**必须遵守**，特别是文件所有权和共享文件台账）
> 2. `.kiro/specs/combat-mechanics/DECISIONS.md`（范围裁定：哪些做哪些不做，别越界）
> 3. `artifacts/gap-analysis.txt` + `scripts/_gap_analysis.mjs`（缺口统计，你的目标池在里面）

## 目标一句话

把技能库从现在的 **5 条手写**扩到**全量可编译**：写一个「技能中文描述 → builder 效果段组合」的批量编译管线，配合五个已裁定的引擎机制，让第一波 **~990 条（55%）** 技能真正生效。

## 现状（已核实，直接用）

- 全库 1798 条技能，`src/data/troops.json` 里每条都带 `spell.description` 和 `spell.meta`（缩放标记已预解析：`meta.scalings` 86% 覆盖、`meta.modifier` 存着 `[xN]`/`[N:M]` 二次缩放）。
- builder DSL 在 `src/engine/skills/builders.ts`：`skill(dmg(...), createGems(...), inflict(...), extraTurn())` 这种组合式，词汇表覆盖伤害/增益/宝石清除创造转化/状态/召唤/额外回合/净化。
- 目标选择器齐全（`targeting.ts`：单体/随机/最弱/最健康/前N/最后/全体/手动指定，己方敌方两套）。
- 手写技能库 `src/engine/skills/library.ts`（key = spell.id，现有 5 条），理念是"逐条手写"——**你要把它升级成生成数据为主、手写 override 兜底**。
- 缩放求值 `src/engine/skills/scaling.ts`（`evaluateScaling`：round(base + magic × mult)）。

## 任务清单（按序执行）

### 阶段 0 · 规则手册（半天）

写 `scripts/spell-rules.md`：多义句式的标准答案，编译器和测试都以它为准。已知要定的：
- 目标措辞归一（「最虚弱的敌人」「最弱的敌人」→ enemyWeakest；「前 2 名」从队伍顶部数；见 `artifacts/_simple_skills_report.txt` 的措辞统计）
- 数值口径：「获得 X 点生命」= 治疗自己；「给予盟友」= 治疗他人；「随机技能值」按 magic 处理（与特质生成器同口径）
- 概率子句、死亡条件、种族翻倍的段结构约定（见阶段 1）
- 「不做」清单里的句式（元经济/晋升度/缺失状态）直接归入 blocked，不硬编

### 阶段 1 · 五个引擎机制（DECISIONS.md ✅ 决定做，先机制后批量）

按解锁量排序做，每个都要带单测：

1. **二次缩放效果**（解锁 428 条，最大单项）：`meta.modifier` 两类——`multiplier [xN]`（数值 ×N，N 随来源数量）、`ratio [N:M]`（每 N 个来源 +M）。执行时来源=棋盘实际资源数（被摧毁宝石数/骷髅数/某色宝石数，`ctx.state.board` 可数）。接入点在 `effects/damage.ts`、`effects/buff.ts` 等效果段执行处，加可选 `modifier` 字段到段定义（`prototypes.ts`）。`scaling.ts` 的解析已存好，别重写。
2. **概率子句**（38 条直解 + 更多多段复合）：段上加 `chance?: number`（0~1），效果执行时 `ctx.rng.next() < chance` 才生效。种子化保证确定性。
3. **敌方削弱家族**（~45 条直解）：新效果原语 reduce/drain——减攻击/护甲/魔法（`Math.max(0, …)` 夹零）、耗蓝（清减目标 mana）、窃取（削减目标同时自身等量获得）。builders 加对应构造函数。注意与织网（web）状态交互：被织网者仍可被偷魔力（web 锁的是 magic 属性增益，不是 mana 充能）。
4. **死亡/阵亡条件**（29 条直解）：段间条件依赖——「如果该敌人身亡，获得…」。段结构建议：效果段加 `ifTargetDied?: boolean`（指前一段的主目标死亡才生效）或独立条件段，写进规则手册定死一种。
5. **种族条件翻倍**（14 条直解）：段级 `raceDouble?: string`（troopType），执行时目标/受益者 `troopTypes` 含该族则数值 ×2。

### 阶段 2 · 编译器与批量生成

- `scripts/build_spells.mjs`：读 `troops.json` → 逐条编译 → 写 `src/data/spells.json`（spellId → 序列化 segments；segments 本身是纯数据对象，可直接 JSON 化）。`library.ts` 改为：生成的为主 + `SKILL_OVERRIDES` 手写表兜底（现有 5 条可迁入 override）。
- 输出覆盖率报告 `artifacts/spell-build.txt`：已编译条数、blocked 按机制分布（对齐 DECISIONS.md 不做清单）、failed 样例。
- 数值护栏：构建期断言（如单技能最大伤害 < 全库最高血量 × 系数、治疗 ≤ maxHp），断言失败即构建失败。
- **第一波验收：~990 条可编译**（已配 5 + 阶段 1 机制解锁的直配池，口径见 DECISIONS.md）。

### 阶段 3 · 质量闭环

- 属性测试：全库编译产物「相同 seed → 相同事件流」+ 事件顺序契约（技能事件在其触发的 mana/damage/defeat 之前）。fast-check 基建已有（`tests/property/`）。
- 分层抽样 20 条（按稀有度×王国），人工对照官方描述核对语义。

## 边界与约定（详见 PARALLEL-WORK.md）

- **只改**：`src/engine/skills/**`（整个技能域归你，含 `context.ts`——里面有窗口 A 落的织网 `isWebbed` 钩子，**别删**）、新增 `scripts/build_spells.mjs`、`src/data/spells.json`、`tests/unit/spell*`。
- **不碰**：`TurnEngine.ts`、`events.ts`、`CombatResolver.ts`、`data/troops.json`（只读）、`src/data/traits.json`（窗口 A 的）。
- 五个机制全部收敛在 `EffectPrimitive.apply` 自包含执行，不动行动生命周期。
- 确定性铁律：所有随机经 `ctx.rng`；逻辑层禁 DOM/pixi。

## DoD

1. 五机制各有单测（含边界：无资源时 [N:M] 退化为 0/1 倍、chance 0/1）
2. `artifacts/spell-build.txt` 覆盖率报告 ≥990 条 compiled
3. 全量 `npm run lint` / `npm test -- --run` / `npm run build` 绿（基线：43 文件 / 396 用例）
4. 共享文件台账有登记则已按协议 rebase
