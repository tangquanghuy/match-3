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

### 战斗外模式/经济（用户裁定不做 → **2026-09-16 用户裁定翻案：转做**）

> **翻案记录（2026-09-16）**：用户明确「灵魂相关要做，加个数值维度就行」「位置操作要做进引擎」，
> 并询问晋升度含义后认可其可行性。三族从不做清单移除，实施设计如下（并入下一个引擎小批，
> 与「技能侧新引擎缺口建议」的 createStorm/stormPresent 打包）：
>
> 1. **战斗结算货币（灵魂/黄金/赏金同一形状）**：GameState 挂战斗内 `souls`/`gold` 计数器，
>    新增 `gainSouls(n)/gainGold(n)` 效果段 + 结算事件；BattleSession 结果上报总额给 AIRP 作战后奖励。
>    「伤害因本战斗收集的灵魂数而增强」→ 加一个 `battleSouls` 来源 kind。解锁技能元经济 73 条 + 特质侧
>    soul/gold 类钩子（necromancy 30 等）。
> 2. **位置操作**：新增 `position` 效果段（toFirst/toLast/shuffle/swap，作用于某方队伍数组——
>    队首即吃骷髅伤害的坦位）+ 队伍重排事件（表现层卡面重排动画）。解锁「拉至首位/击退至末位/
>    打乱敌方队伍」族 ~28-30 条技能。
> 3. **晋升度**：Character 加静态 `rarity`（稀有度档位数值）字段（敌人由数据侧给定），
>    「基于我已晋升的稀有度 N 倍」= 条件倍率读该字段；「魔头/高塔」建模为目标标记（troopTypes 同形）。
>    解锁 godslayer 69/siegebreaker 61/pathfinder 35 等 4 code / 258 次 + 技能侧 101 条中非复合部分。
> - 淘宝模式四件套（deepvitality 等，纯战斗外）仍不做；英里等无对应系统的维持不做。

- 特质：淘宝模式四件套（deepvitality 73/deepmagic 57/deepshield 48/deepstrength 16）、灵魂/黄金/赏金/英里/金币加成，合计约 300 次出场
- 技能：元经济 73 条（"获得 [魔法+3] 黄金/灵魂"）
- 晋升度/魔头/高塔条件：技能 101 条（其中 39 条与种族翻倍复合——只做种族翻倍部分）、特质 4 code/258 次（bountyhunter 93/godslayer 69/siegebreaker 61/pathfinder 35）
- 处理：~~技能保持 mana-only 兜底并计入报告；特质直接归入"不做"桶~~（已被上方翻案取代）

## ✅ 已落地 · 特殊宝石（2026-09-15 更新，原「等美术素材」裁定作废）

> 本节原为落地前的待定裁定（等美术/等规则核实）。窗口 C 已交付，现状如下；
> 逐颗语义依据见 **[GEMS-SEMANTICS.md](./GEMS-SEMANTICS.md)**（实现前已逐个对照官方 wiki 核实）。

**已落地**：

- **美术**：11 张 256×256 贴图（`src/assets/gems/special/`，`scripts/split_special_gems.mjs` 可重切，软边白晕已修）——不再等素材
- **行为**：9 种完整实现 + 45 用例——末日骷髅/至尊末日（匹配引爆 +5/+10 伤）、炸弹（摧毁引爆，连环）、织网（施加 web 状态）、闪电行/列（匹配或被摧毁皆触发）、通配 ×2/×4（任意色匹配+倍率）、许愿（回蓝）、沙漏（额外回合）
- **表现**：GemSprite/gemTextures 接入、批次爆炸演出、测试台调试投放区；验收浏览器走查通过（见 ACCEPTANCE.md 窗口 C 节）

**剩余待定（真正的开口，都很小）**：

| 项 | 说明 |
|---|---|
| 幽魂 ghost | 素材已出、**无行为**——官方语义是战斗外灵魂货币，是否做战斗内幽灵表现待裁定 |
| 技能创造接线（B 侧） | 「创造 N 颗炸弹/织网…」类技能约 166 条被放弃，等 `createGems` 支持 SpecialGemSpec——**这是放弃桶里最大的单块回收空间** |
| 自然掉率默认值 | `specialSpawnChance` 当前默认 0（已验证运行时可开）；是否默认开启待裁定 |
| 消除高亮态/飘字 | 原需求单里的「可消除高亮态、结算飘字」未做单独特效，现为通用消除表现——打磨项，非阻塞 |



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
4. 特殊宝石特质（15 code）——C 的宝石行为已落地，**已可回填**（特质触发钩子挂 special-gem-trigger/gem 事件即可）

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
   | 骸骨风暴 | Bonestorm | Brown（主色） | 9007 | **官方语义已回填（2026-09-16）**：dropKind 'skull' 提升骷髅头掉率，Brown 仅作指示器主色 |
   | 末日风暴 | Doomstorm | Purple（主色） | 9008 | **官方语义已回填**：dropKind 'doomSkull'，末日骷髅开始从顶部掉落，Purple 仅作主色 |
   | 超级末日风暴 | UberDoomstorm | Purple（主色） | 9009 | **官方语义已回填**：dropKind 'uberDoomSkull'，至尊末日骷髅开始掉落 |

   **回填（2026-09-16）**：原「假设标注」预言的契约扩展已落地——`Team.storm.dropKind`
   （'skull' / 'doomSkull' / 'uberDoomSkull'），这三个风暴改回官方语义，原色系近似降级为
   指示器主色。详见下方「骷髅系风暴回填 + 骷髅爆炸规则」。
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

### 骷髅系风暴回填 + 骷髅爆炸规则（2026-09-16）

**风暴契约扩展（兑现上节假设标注）**：
- `Team.storm` / `StormSummon` / `StormChangeEvent` 新增可选
  `dropKind: 'skull' | 'doomSkull' | 'uberDoomSkull'`：设置后掉落加权作用于骷髅系宝石，
  color 降级为表现层主色（事件仍带 color，表现层按 dropKind 换贴图/光晕）。
- `GravitySystem.apply` 新增第 4 参 `skullDrop?: SkullDropBoost`：骸骨风暴把骷髅判定阈值
  抬到 `skullChance × STORM_DROP_WEIGHT`（与颜色风暴同 ×1.9 口径）；末日/超级末日风暴在
  骷髅判定前多掷一次掉落（常量 `STORM_DOOMSKULL_DROP = 0.04` /
  `STORM_UBER_DOOMSKULL_DROP = 0.02`，官方未公开数值，设计值可调）。
  无骷髅系风暴时不进该分支，随机数消耗序列与旧版逐字节一致（回归护栏）。
- 数据：`STORM_MAP`（build_traits.mjs）与开局风暴 songofbones 带 dropKind，traits.json 重生成。
- 表现：StormIndicator 增 `STORM_SKULL_GEM_URL` / `STORM_SKULL_GLOW`（骨白 #e6ddc8 /
  血红 #ff2f68 / 熔岩橙 #ff8a2a；贴图复用 skull.png 与 special/ 末日系素材）；
  技能测试台风暴区新增骸骨/末日/超级末日三个按钮（debugSetStorm 第 4 参）。
- 验证：`tests/unit/skullStorm.test.ts`（11 用例：炸毁骷髅 1/5/10 + 三种风暴掉落统计 +
  契约）与 `stormIndicator.test.ts` 扩展（16 用例）。

**骷髅爆炸规则（用户查证请求：炸毁骷髅 ≠ 三消骷髅）**：
- 官方规则（TrueTrophies 官方攻略 Heroic Gems 节 + Steam 社区专家帖交叉复核）：
  法术/爆炸**炸毁**的骷髅宝石不算骷髅伤害，改为对**敌方队首**结算**法术伤害**——
  普通骷髅 **1 点**/颗、末日骷髅 **5 点**/颗、至尊末日骷髅 **10 点**/颗；
  不吃攻击力、不可被闪避/骷髅减伤。三消连线的骷髅（队首攻击力、可闪避、末日骷髅 +5 并
  引爆邻格）维持原实现不变。
- 引擎修正：`settleDestroyed` 原把炸毁骷髅并进三消管线（resolveSkullDamage，攻击力口径
  可被闪避），且末日/至尊被炸时静默移除（0 伤害）——均改为官方口径
  （`TurnEngine.settleExplodedSkulls`，复用 `skills/effects/damage.damageOne`：
  法术铠甲/屏障/护甲照常减免，阵亡走既有事件流）。
- 记录在案（未改）：官方 Explode 类摧毁只给**一半法力**（Destroy 类给全量）；
  本引擎被摧毁宝石统一给全量法力，如需对齐另开小项。

**来源**：TrueTrophies（炸毁骷髅 1/5/10）：https://www.truetrophies.com/game/Gems-of-War/walkthrough/4 ·
Steam 社区专家帖（炸毁骷髅=法术伤害打队首）：https://steamcommunity.com/app/329110/discussions/0/1741090666216344226/

## 语义对齐记录


### ✅ 织网/缠绕拆分（2026-09-14，已完成）

此前引擎把"织网"并入"纠缠"处理。已按官方语义拆分为两个状态（官方定义来源见 [GEMS-SEMANTICS.md](./GEMS-SEMANTICS.md) 文末链接）：

| 状态 | 官方语义 | 实现 |
|---|---|---|
| 缠绕 entangle | **攻击力归零**（骷髅匹配无伤害，仍可行动/施法/充能） | `canAttack=false`（攻击落空），净效果一致 |
| 织网 web | **魔力归零** + 无法获得魔法值增益 + 每回合累计 10% 挣脱 | 新增 `WEB_STATUS_ID`：`casterMagic()` 归零、`buffOne()`/`grantStat()` 拦截魔法增益、`tickStatuses()` 挣脱判定 |

连带变更：`build_traits.mjs` 状态映射拆分并重生成 `traits.json`（219 个 code 数量不变；slippery/darkancestry 免疫、snare 命中附网、stalker 屠戮 4 个 code 由 entangle 翻正为 web；"命中附带状态"只给 DoT 带 magnitude，避免污染 web 的挣脱几率语义）。新增 `tests/unit/webStatus.test.ts` 11 个用例，全量 43 files / 396 tests 通过。（历史注：当时织网宝石本体未落地，现已随特殊宝石批次完成——见上方「✅ 已落地 · 特殊宝石」。）

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

### 覆盖率对账更新（窗口 E · 2026-09-16，特殊状态批提交后快照）

- **特质**：268 / 785 code（70% 出场覆盖，3797 / 5394 次）。剩余 517 code 分布：缺状态机制 106（状态本体已落地，**等特质编译钩子接线后此桶才会缩小**）、其它未归类 293、条件光环 65、战斗外经济 15、特殊宝石创造 21、召唤钩子 15、晋升度 2。（`node scripts/_gap_analysis.mjs` 实测）
- **开局风暴**：`songoflight/darkness/bones/fire/ice` 五 code 经 `battleStartStorm` 落地——上节「songoflight 等仍未覆盖」的表述就此作废；风暴族合计 18 code（13 死亡召唤变体 + 5 开局）。
- **状态**：疾病/诅咒/死亡标记/狂怒/魅惑状态本体 + 自动解除泛化（10%→累计，诅咒减半）落地；狼化/法力燃烧为半成品（见 ASSET-GAPS「待接线」表）。
- **测试基线**：57 文件 / 613 用例全绿（批前 396+ → 613；新增 combatSpecialStatus / skullStorm / stormEngine 开局 2 例 / stormIndicator 骷髅系 3 例等）。

### 裁定更新

- **释放技能不消耗回合**（用户裁定，对齐 GoW）：cast 不换边、不做回合尾结算；`ActionOutcome` 新增 `held`；「额外回合」技能的标记保留到下一次交换行动尾生效。
- **722 条放弃维持**（抽样 5/5 复核成立）；约 8%（56 条）明文「现可表达」+ 双来源复合族可回收，估 100~200 条可在现有原语下重新 triage，无需动引擎。
- **不做清单修订（2026-09-16）**：~~特殊状态家族（狂怒/疾病/猎人标记等）~~ **已从不做清单移除**——特殊状态批把疾病/诅咒/死亡标记/狂怒/魅惑状态本体全部落地（见上「骷髅系风暴回填」节与 `GOW-STATUS-RESEARCH.md`），特质/技能侧接线归内容批。不做清单余项维持：位置操作、元经济、晋升度。

### 下一阶段优先级建议（供拍板）

1. **B · 回收批**：spell-rules.md 文档对齐（半小时）→ 56 条「现可表达」回收 + 双来源复合（`sources:[]`）批量复核，预估解锁 100~200 条。
2. **B · 555 待核对**：继续组装，吞吐风险中等，管线质量闭环健全。
3. **A · 条件光环长尾**（65 code / 132 次）性价比最高；**aquatic 下潜**（24 次）次之；开局风暴触发点随批顺路。
4. **C · 裁定**：ghost 宝石语义改造（战斗外灵魂货币 vs 战斗内幽灵）、specialSpawnChance 是否默认开启（当前 0，已验证运行时可开）。
5. **横向**：AIRP 真机部署接入（跨域握手已验收，战斗需真人打完才能 result）；`special-gem-hook`（match5/L/T 生成钩子，当前仅标记）；技能/敌人规模化人工验收（放映厅 + 千场烟雾方案，见 ACCEPTANCE.md）。

### 技能侧新引擎缺口建议（窗口 E · 2026-09-16，阶段4 两波 triage 产出）

放弃桶反复卡在以下三个缺失的引擎原语上，各卡 6~9 条技能，建议打包成一个小引擎批：
1. **`createStorm` 效果段**：「创造/发起/召唤一场X风暴」——引擎 `storm-change`/`setStormFromSummon` 基建全在
   （TurnEngine.debugSetStorm 已走通同一路径），缺的只是技能效果段 + 事件接线。卡 7494-7499 六色风暴族、
   7530、8718、7482 等 9 条。
2. **`stormPresent` 条件 kind**（并入 condMult/ifCond 条件域，可选具体色/dropKind）：「若存在/正在进行(冰)风暴」。
   卡 8934、9726、7788、8094、8131、8132、8134、7530 等 8 条（与上一条常复合出现）。
3. **被摧毁特殊宝石计数**：destroyedGems 仅按色筛、特殊宝石无色不可计（7014 等）——
   可加 `destroyedSpecial { gem }` 来源 kind。
另：目标相对条件挂无目标段（条件化额外回合 7541）与状态性目标跨段绑定（8752）维持 SKIP，暂不建议开。
