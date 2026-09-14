# 决策记录 · 内容覆盖范围（2026-09-14）

依据：`artifacts/gap-analysis.txt`（生成脚本 `scripts/_gap_analysis.mjs`，可重跑）。
本文件记录内容覆盖范围的范围裁定，后续批次按此执行；变更需在此补记。

## ✅ 决定做（引擎机制类，按性价比排序）

| 机制 | 卡住技能数 | 只缺它一项 | 备注 |
|---|---|---|---|
| 二次缩放效果（[xN]/[N:M] 随局面数量变动） | 840 | 428 | 性价比之王：`scaling.ts` 已解析存好 `SecondaryModifier`，只差接进效果段。做一次可直配技能 439 → 约 900 |
| 概率子句（"有 20% 几率燃烧"） | 206 | 38 | 效果段加 chance 字段，走种子化 RNG |
| 敌方削弱家族（减攻/减甲/减魔/耗蓝/窃取/法力燃烧） | ~185 | ~45 | 一个"削减敌方数值"原语族；窃取=削减+自增，法力燃烧(20条)并入本族 |
| 死亡/阵亡条件（"如果该敌人身亡，获得…"） | 82 | 29 | 段间条件依赖：前段结果触发后段 |
| 种族条件翻倍（"若盟友是矮人，效果翻倍"） | 137 | 14 | 条件修饰器，读 troopTypes |

**预期**：五项做完后，第一波可直配技能从 439（24%）升到约 990（55%）。

## ⏸️ 暂不做（记录在案，解析器继续归类、不静默降级）

### 特殊状态家族（用户裁定先不做）
疾病、狼化、死亡标记、出血、猎人标记、诅咒、风暴、魅惑、石化、下潮、吞噬等。
- 技能侧影响：272 条被卡（其中 96 条只缺状态本身）
- 特质侧影响：124 code / 491 次出场（其中近半是"对 X 免疫"，X 做出来后自动解锁）
- 后续若做，建议按出场次数排序：诅咒(79条技能/特质) → 死亡标记(warded 29+deathtouch 20+技能侧) → 出血 → 疾病 → 猎人标记

### 战斗外模式/经济（用户裁定不做）
- 特质：淘宝模式四件套（deepvitality 73/deepmagic 57/deepshield 48/deepstrength 16）、灵魂/黄金/赏金/英里/金币加成，合计约 300 次出场
- 技能：元经济 73 条（"获得 [魔法+3] 黄金/灵魂"）
- 晋升度/魔头/高塔条件：技能 101 条（其中 39 条与种族翻倍复合——只做种族翻倍部分）、特质 4 code/258 次（bountyhunter 93/godslayer 69/siegebreaker 61/pathfinder 35）
- 处理：技能保持 mana-only 兜底并计入报告；特质直接归入"不做"桶

## 🔶 待定 · 特殊宝石（等美术素材决策）

逐颗语义（已核对官方）与外观需求单见 **[GEMS-SEMANTICS.md](./GEMS-SEMANTICS.md)**。

排名按战斗内引用热度（技能提及数 + 特质出场次数）：

| 排名 | 宝石 | 技能提及 | 特质引用 | 说明 |
|---|---|---|---|---|
| 1 | 末日/厄运骷髅 | 42 条 | 5 code/5 次 | 变体多（极度末日骷髅等），GoW 核心特殊宝石 |
| 2 | 炸弹宝石 | 16 条 | 3 code/28 次 | unstablecore(26次)"身亡时造 3 颗炸弹"是最高频特质引用 |
| 3 | 织网宝石 | 8 条 | 2 code/15 次 | 另有大量"织网状态"引用（现由 entangle 承接），宝石做出来后语义可统一 |
| 4 | 幽魂宝石 | 8 条 | 2 code/11 次 | |
| 5 | 通配宝石(x2/x4) | 5 条 | 2 code/13 次 | wildtribe/wildmagic，匹配任意色+倍率 |
| 6 | 许愿宝石 | 2 条 | 3 code/8 次 | |
| 7 | 闪电宝石 | 9 条 | 1 code/1 次 | 技能引用不少但几乎全是塔罗牌系列（「抽到XX」） |
| 8 | 沙漏宝石 | 5 条 | 2 code/3 次 | 塔罗牌系列+2 个特质 |

- 引擎侧 `GemType` 已预留 `{kind:'special'}`，新增宝石不需要重构
- **每种宝石需要美术**：本体贴图（普通态/可消除高亮态）、消除特效、（部分）结算飘字；末日骷髅还有稀有度变体
- **实现前必做**：各宝石"被消除时触发什么"的官方规则不在现有 dump 里，需逐个对照官方 wiki 确认后再写引擎行为（上面的排名只代表引用热度，不代表机制已核实）

## 未分配小项（待后续裁定）

伤害区间(32条)、动态颜色/混合色(31)、随机属性获得(29)、隐匿/位置操作(9)、驱散敌方增益(7)、比例法力(4)、识别不出效果的 20 条（需人工判读，含"随机发生任何情况"这类混沌技能，建议永久排除）。
前三项是纯逻辑小活，建议跟随"决定做"批次顺路处理。

## 执行入口

下一批次 = 「决定做」五项机制 + 解析快速赢面（stealthy 92 次、反射新句式、种族映射补漏），然后开第一波技能批量配置（目标池约 990 条）。

## 特质批次执行记录（窗口 A）

### 2026-09-14 · 快速赢面批（219 → 233 code，覆盖 3525 → 3657 次）

生成器新规则（`build_traits.mjs`）：

1. **隐匿 stealthy**（92 次）：「无法成为法术指定攻击目标（除非场上已无任何其他目标）」→ `untargetable`（引擎字段早已支持，只缺解析）
2. **反射变体**（9 code）：「反弹/反射 N% 的骷髅（头）伤害」统一收口 → `reflectSkullRatio`
3. **承受骷髅附状态**（6 code，毒孢子族）：新字段 `inflictOnSkullDamaged`，挂在 `CombatResolver` 受击路径（闪避/屏障/挣扎不触发）；DoT 带 `magnitude:1`，其余不带
4. **4/5 连给予盟友光环**（8 code）：新字段 `bigMatchTypeAura`（键 = 种族或 `'all'`），支持「N 点 X 和 Y」**共享数值**双属性句式；`applyBigMatchTriggers` 扩展结算
5. **种族映射补漏**：厄什卡 → Urska、罗格 → Rogue（urskabond 10 次等）

连带：`types.ts` PassiveModifiers 扩展两字段（窗口 A 区段）；测试 `tests/unit/traitQuickWins.test.ts` 10 用例。全量 44 files / 406 tests、lint、build 通过。

### 特质窗口 · 下一批（按解锁量排序）

1. ~~**召唤钩子**（31 code / 79 次）~~ → **2026-09-15 已落地 17 code / 46 次**（见下节执行记录）；风暴系列（暗风暴/火风暴/冰风暴等 14 个 code / 33 次）召唤名在兵种数据中不存在，留在未实现桶——需要先决定：为它们造召唤物模板（内容设计），或官方数据补齐后重跑生成器
2. **条件光环长尾**（缺条件光环桶剩余 ~60 code）：「当我的回合开始时所有 X 盟友…」「消除 4 个宝石时…」等其它触发时机
3. **aquatic（24 次）**：「受到伤害时自身下潜」——新字段 `submergeOnDamaged`
4. 特殊宝石特质（15 code）——**等窗口 C 的宝石行为落地**后回填

### 2026-09-15 · 死亡召唤批（233 → 250 code，覆盖 3657 → 3703 次）

**机制**：`TraitDefinition` 与 `PassiveModifiers` 新增 summonOnDeath / summonOnAllyDeath / summonOnEnemyDeath 三字段（chance + 预解析的 troopId/referenceName/displayName），经 `resolvePassives` 编译（同字段取概率最高）。`TurnEngine.processDeathTriggers` 在行动末尾统一扫 defeat 时结算（与阵亡响应同点，**未动 resolveDefeatEvents 的 4 处调用**）；阵亡者从行动开始的角色引用快照取回。召唤物**跟随持有者所在方**入队（summonOnEnemyDeath 的召唤物进持有者队，非死者队），容量满进 FIFO 队列，与召唤技能同语义。模板装配 `setSummonTemplateResolver` 由 App 注入（复用 troopToSummonTemplate），解析失败安全跳过。

**数据**：生成器三条规则 + 兵种名→troopId 索引；17 个 code 的召唤名全部解析到真实兵种（远古恐惧/暗夜惊魂/恐狼/幽魂/瓦格…）。

**验证**：`tests/unit/traitDeathSummon.test.ts` 7 用例（纯函数层 4 + 引擎集成 3，集成用例多种子扫描锁定 25%/50% 概率召唤与召唤名不可解析的安全路径）；审计套件三键归入编译族并新增召唤字段合法性检查（chance∈(0,1]、displayName 必须真实存在于兵种数据）。全量 52 files / 564 tests、lint、build 通过。

**调试中抓到并修掉的三个自身 bug**（都有用例锁定）：① resolvePassives 漏拷贝三字段（编译结果 undefined）；② 模板对象被当工厂函数调用；③ 召唤物错误地入队到死者一方而非持有者一方（daemonicpact 掩盖了它——持有者=死者本人）。

## 风暴（Storm）全局掉落修正（窗口 D，2026-09-15）

### 官方语义（查证结论）

风暴**不是兵种**：不占编队位、无血量、不可被攻击，是挂在战斗上的全局掉落修正器——
"When a Mana Storm is active in battle, Gems of the Storm's color are more likely to drop onto the board."
（官方术语表，Infinity Plus 2 support）。TrueTrophies：掉率提升持续到计数器归零（有持续回合数）。

三个待定项查证结果（原任务书括号内默认值仅在此标注，被查证结论取代/修正之处注明）：

1. **持续回合数 = 8 回合（双方各 4）**。官方 3.0 补丁说明原文：
   "a board affect that lasts 8 Turns (4 for each side)"。任务书默认值 5 查证后弃用。
   引擎按「每行动回合尾递减 1」实现：8 次行动（双方交替即各 4 次）后到期。
2. **9 种风暴颜色映射**。官方 3.0 补丁说明给出七行对照（Blue: Icestorm / Green: Leafstorm /
   Red: Firestorm / Yellow: Lightstorm / Purple: Darkstorm / Brown: Duststorm / Skulls: Bonestorm，
   社区帖同口径复核）；骸骨风暴与尘风暴**不是**同色——骸骨风暴官方提升的是**骷髅头**掉率、
   尘风暴提升棕色宝石掉率；末日风暴/超级末日风暴官方提升**（至尊）末日骷髅**掉率
   （4.0 补丁说明曾专门下调 Doomstorm 的末日骷髅掉率以平衡）：

   | 风暴 | referenceName | 颜色（引擎） | 虚拟 troopId | 与官方差异 |
   |---|---|---|---|---|
   | 暗风暴 | Darkstorm | Purple | 9001 | 一致 |
   | 火风暴 | Firestorm | Red | 9002 | 一致 |
   | 冰风暴 | Icestorm | Blue | 9003 | 一致 |
   | 光风暴 | Lightstorm | Yellow | 9004 | 一致 |
   | 叶风暴 | Leafstorm | Green | 9005 | 一致 |
   | 尘风暴 | Duststorm | Brown | 9006 | 一致 |
   | 骸骨风暴 | Bonestorm | **Brown（近似）** | 9007 | 官方提升骷髅头掉率；引擎风暴契约只支持 BaseColor 加权，按骷髅头棕色系近似 |
   | 末日风暴 | Doomstorm | **Purple（近似）** | 9008 | 官方提升末日骷髅掉率；按 doom 黑紫色系近似（BaseColor 无 Black） |
   | 超级末日风暴 | UberDoomstorm | **Purple（近似）** | 9009 | 官方提升至尊末日骷髅掉率；同上近似 |

   **假设标注**：后三行的色系近似是引擎契约（`Team.storm.color: BaseColor`，阶段 1.2 已定）
   下的折衷——若将来把契约扩展为「风暴可指向骷髅/末日骷髅掉率」（如 `dropKind` 字段），
   这三个风暴应改回官方语义。生成器映射表 `STORM_MAP`（scripts/build_traits.mjs）已按此注释。
3. **掉落加成 ×1.9**。引擎常量 `STORM_DROP_WEIGHT = 1.9`（GravitySystem.ts，可调）。
   加权实现下风暴色新宝石概率 = 1.9/(5+1.9) ≈ 27.5%，与 Steam 社区实测的 ~27.1%（基线 14.3% = 1/7）吻合。

**来源链接**：
- 官方 3.0 补丁说明（风暴→颜色表 + 持续 8 回合）：https://gemsofwar.com/3-0-patch-notes/
- 官方术语表（Mana Storm 定义）：https://infinityplus2.freshdesk.com/support/solutions/articles/150000208267-gems-of-war-glossary-of-terms
- Steam 社区实测（×1.9 / 27.1%）：https://steamcommunity.com/app/329110/discussions/0/3201496371571406154/
- TrueTrophies（持续到计数器归零）：https://www.truetrophies.com/game/Gems-of-War/walkthrough/4
- 官方 4.0 补丁说明（Doomstorm 掉末日骷髅 + 平衡性下调）：https://gemsofwar.com/4-0-patch-notes/
- 官方社区帖（颜色表复核）：https://community.gemsofwar.com/t/timer-countdown/22802

### 实现落点（阶段 1.3）

- **数据**：`DeathSummonSpec`（summonOnDeath/AllyDeath/EnemyDeath 三字段）新增可选
  `storm: { color: BaseColor; turns: number }`（types.ts `StormSummon` + traits.ts 定义区段）。
  spec 带 storm 时**不产出兵种**（referenceName/displayName 仅展示、troopId 为虚拟号段 9001~9009），
  改设持有者一方 `team.storm`。`resolvePassives` 编译行为不变（同字段取概率最高，storm 随对象拷贝）。
- **生成器**：`resolveSummonedTroop` 两段式——先查兵种数据（现状），未命中查 `STORM_MAP`
  （9 风暴名映射表）。traits.json 重生成：250 → **263** code（+13 风暴变体：
  fierydeath/fromdark/fromashes/icydeath/rockydeath/naturesdeath/darkdeath/brightdeath/
  skulldeath/frombones/dwarvendoom/fromlight/doomofarachnaea，覆盖 3703 → 3737 次）。
  herdspirit（召唤「半人马侦察兵」）**未**被风暴批解锁——它不是风暴，是兵种召唤，
  且该兵种名不在当前 1798 条精简兵种表内，仍留未实现桶（兵种数据缺口，另案处理）。
- **TurnEngine**：spec 带风暴时不入队，`setStormFromSummon` 执行**全场唯一**裁定
  （用户裁定：后召顶替先召，不分敌我；己方已有→replaced；对方有→先给对方发 color=null 的
  replaced 撤指示器再设己方；同回合多 spec 按 specs 顺序结算，后者顶前者）。
  `finishTurn` 回合尾（DoT 结算后）双方 `storm.turns` 递减，归零清除发
  `storm-change`（color=null, reason:'expired', prevColor=旧色）。
- **GravitySystem**：refill 颜色分布读双方 `team.storm`，对应色权重 ×`STORM_DROP_WEIGHT`。
  无风暴时走旧均匀 pick 分支，随机数消耗序列与现状逐字节一致（既有测试零改动通过）。
  窗口 C 的 `specialSpawnChance`/`SPAWNABLE_SPECIALS` 白名单未动。
- **验证**：`tests/unit/stormEngine.test.ts`（8 用例：设置/己方替换/顶掉对方/到期/无风暴静默 +
  applyDeathSummons 风暴分支 4 例）、`tests/unit/stormDrop.test.ts`（5 用例：权重常量 +
  2000 次 refill 统计断言 ±3% + 无风暴均匀性/序列一致性 + fromdark 集成紫色占比上升）、
  `tests/unit/traitsAudit.test.ts` 扩展（storm spec color/turns/号段校验 + 描述↔风暴变体双向对账 +
  接线完整性两条）、`tests/unit/traitDeathSummon.test.ts` darkdeath 用例按新行为更新
  （原「召唤名不可解析安全跳过」→「设风暴不召唤兵种」，预期变化非回归）。

## 语义对齐记录


### ✅ 织网/缠绕拆分（2026-09-14，已完成）

此前引擎把"织网"并入"纠缠"处理。已按官方语义拆分为两个状态（官方定义来源见 [GEMS-SEMANTICS.md](./GEMS-SEMANTICS.md) 文末链接）：

| 状态 | 官方语义 | 实现 |
|---|---|---|
| 缠绕 entangle | **攻击力归零**（骷髅匹配无伤害，仍可行动/施法/充能） | `canAttack=false`（攻击落空），净效果一致 |
| 织网 web | **魔力归零** + 无法获得魔法值增益 + 每回合累计 10% 挣脱 | 新增 `WEB_STATUS_ID`：`casterMagic()` 归零、`buffOne()`/`grantStat()` 拦截魔法增益、`tickStatuses()` 挣脱判定 |

连带变更：`build_traits.mjs` 状态映射拆分并重生成 `traits.json`（219 个 code 数量不变；slippery/darkancestry 免疫、snare 命中附网、stalker 屠戮 4 个 code 由 entangle 翻正为 web；"命中附带状态"只给 DoT 带 magnitude，避免污染 web 的挣脱几率语义）。新增 `tests/unit/webStatus.test.ts` 11 个用例，全量 43 files / 396 tests 通过。织网宝石本体（棋盘行为）仍待美术素材，属特殊宝石批次。

### ⏳ 已知语义偏差（对齐 GOW 本体的后续清单）

核对官方状态总表（Infinity Plus 2 support）时发现的既有偏差，按影响排序，后续批次顺路修：

1. **燃烧**：官方每回合 3 点伤害**先扣护甲**；引擎 DoT 直接扣血跳过护甲（中毒同理，官方中毒是 50% 几率扣 1 血，引擎是固定值 DoT——数值来自技能文本，行为差异需逐技能核对）
2. **下潮 submerged**：官方=免疫**全体目标类法术**的伤害（单体指定仍可命中）；引擎实现成反的（不可被指定、群体照常命中）
3. **击晕 stun**：官方=禁用全部特质；引擎暂无效果（等被动系统加"禁用"分支）
4. **冰冻 frozen**：官方=不可施法+法力色被冻结时 4/5 连不给额外回合；引擎从紧（另加不可攻击），充能语义不同
5. **屏障 barrier**：官方**不挡致死伤害**；引擎整发全挡

以上不阻塞当前内容批次，逐个修时需同步更新受影响的用例与 `RULESET_VERSION`。

## 阶段 3/4 · 验收与缺口复核（窗口 D，2026-09-15）

### 覆盖率对账（263 code 基线）

- **特质**：263 / 785 code（69% 出场覆盖，3737 / 5394 次）。剩余 522 code 分布：缺状态机制 111、其它未归类 293、条件光环 65、战斗外经济 15、特殊宝石创造 21、召唤钩子 15、晋升度 2。
- **技能**：521 已核对 + 722 放弃 + 555 待核对 = 1798 行（唯一 spell 1793：spell 7946 六兵种共用）。批间零重复、池↔批次双向零孤儿（B 抽样报告独立复账）。
- **风暴**：13 code 解锁（预期 14，herdspirit 非风暴、属兵种数据缺口）；`songoflight` 等**战斗开始时召唤风暴**类仍未覆盖——死亡召唤之外还需开局触发点，列入后续。

### 裁定更新

- **释放技能不消耗回合**（用户裁定，对齐 GoW）：cast 不换边、不做回合尾结算；`ActionOutcome` 新增 `held`；「额外回合」技能的标记保留到下一次交换行动尾生效。
- **722 条放弃维持**（抽样 5/5 复核成立）；约 8%（56 条）明文「现可表达」+ 双来源复合族可回收，估 100~200 条可在现有原语下重新 triage，无需动引擎。
- **不做清单维持**：特殊状态家族（狂怒/疾病/猎人标记等）、位置操作、元经济、晋升度。

### 下一阶段优先级建议（供拍板）

1. **B · 回收批**：spell-rules.md 文档对齐（半小时）→ 56 条「现可表达」回收 + 双来源复合（`sources:[]`）批量复核，预估解锁 100~200 条。
2. **B · 555 待核对**：继续组装，吞吐风险中等，管线质量闭环健全。
3. **A · 条件光环长尾**（65 code / 132 次）性价比最高；**aquatic 下潜**（24 次）次之；开局风暴触发点随批顺路。
4. **C · 裁定**：ghost 宝石语义改造（战斗外灵魂货币 vs 战斗内幽灵）、specialSpawnChance 是否默认开启（当前 0，已验证运行时可开）。
5. **横向**：AIRP 真机部署接入（跨域握手已验收，战斗需真人打完才能 result）；`special-gem-hook`（match5/L/T 生成钩子，当前仅标记）；技能/敌人规模化人工验收（放映厅 + 千场烟雾方案，见 ACCEPTANCE.md）。
