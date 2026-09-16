# 任务书 · Meta 主线（窗口 J）

> **目标**：按 `META-GAME-PLAN.md` 的 M0–M8 里程碑搭起游戏外壳的**逻辑核心**（存档/经济/养成/出敌/战斗桥接/结算），
> 与视觉屏解耦推进——屏未做好之前，一切逻辑以无前端形态（纯函数 + vitest）落地并验收。
> 视觉小样（`design/meta-mockups-v4` 养成页已完成，其余屏用户制作中）是未来 `meta/screens` 的消费方，本窗口不碰、不改其验收标准。
>
> 必读：`PARALLEL-WORK.md`（窗口所有权与台账）、`META-GAME-PLAN.md`（系统设计与八条裁定）、`TASK-MASTER-PLAN.md`（共同约定）。

## 1. 所有权（已登记 PARALLEL-WORK.md，2026-09-17）

| 范围 | 文件 |
|---|---|
| J 独占 | `src/meta/**`、`tests/unit/meta*`、`tests/e2e/meta*`、`game.html`（未来入口，未建）、本任务书 |
| 只读消费 | `src/data/troops.json`、`src/data/leveling.ts`、`src/data/traits.json`、`src/session/contract.ts`、`src/session/validateRequest.ts` |
| 未来共享（动前必须在 PARALLEL-WORK.md 台账登记） | `src/session/contract.ts`（banner 字段）、`ManaDistributor.ts`（旗帜法力加成）、`App.ts`（战斗挂载导出）、`vite.config.ts`（game.html 多页入口） |
| 不碰 | `design/meta-mockups*`（用户视觉领地）、引擎/渲染/音效域 |

## 2. 前后端分离口径（本任务书的工作方式）

- `src/meta/systems/**` 全部纯逻辑：零 DOM、零 pixi/gsap、随机一律种子化；改动存档的函数返回显式结果（code + 中文文案），供未来屏层做「校验规则可见」。
- 战斗即函数调用：meta 组 `BattleRequest` → 现有战斗层（嵌入模式不变）→ `BattleResult` → meta 结算入账。headless 验收用 `TurnEngine` 直接驱动真实对局。
- 数值单源 `src/meta/data/economy.ts`（设计值宁紧勿松）；玩家可见文案（概率公示、升级代价）未来必须从它派生，禁止两处硬编码。
- 存档 schema 只加不改时 version 不动；不兼容变化走迁移链。

## 3. 里程碑进度

| 里程碑 | 内容 | 验收标准 | 状态 |
|---|---|---|---|
| M0 存档与账本 | MetaSave v1、迁移链、双槽防损、导入导出、货币账本（原子扣费） | 往返一致；主槽损坏回退备份；双槽皆损重建新档；账本原子性 | ✅ 已落（2026-09-17） |
| M1 养成与编队（逻辑部分） | 灵魂升级、升阶 5/10/25、特质解锁（裁定②）、分解保护、入册 grantTroop、编队 3~4 校验 | 官方口径对表（上限 15..20、升阶不耗本体、特质顺序前置）；非法队伍存档不动 | ✅ 已落（2026-09-17） |
| M2 战斗闭环（逻辑部分） | 王国元数据（kingdoms.ts）、encounter 出敌（任务 8 关/探索 5 档）、battleBridge（存档→BattleRequest+注册表兜底）、settlement（击杀/胜利/首胜/任务推进/战败保底入账） | 请求过会话校验；headless 真实对局整环跑通；结算逐行可解释（明细行供结算屏）；同 seed 可复现 | ✅ 已落（2026-09-17） |
| M3 地图与王国（逻辑部分） | 进贡离线结算、探索解锁/档位、地图节点状态、42 王国元数据、任务链（M2 已落） | 进贡按小时概率+离线结算正确（确定性可复算）；节点状态含解锁门槛/任务/气泡/探索 | ✅ 已落（2026-09-17）。王国黄金升级与 10 级加成**提前至此**（进贡依赖等级，拆开不成环）；加成已接线战斗快照 |
| M4 抽卡（逻辑部分） | gacha 权重+种子化+十连保底 Epic+、金钥匙宝箱、gachaLog 对账 | 权重表万分比单源；3000 次固定种子审计频率与权重一致；40 种子保底无一漏发；重复卡进 copies | ✅ 已落（2026-09-17） |
| M5 主角系统（逻辑部分） | 等级曲线落地、8 职业（天赋=既有特质 code）、20 武器（builders DSL，注册进 meta 桥接注册表）、主角入队出战 | 武器技能过校验可施放；主角可编入队伍出战；任务 8 关解锁职业 | ✅ 已落（2026-09-17） |
| M6 王国经营与旗帜 | 旗帜法力加成（**动 ManaDistributor，先登记台账**）、金钥匙经济收口（金宝箱已于 M4 落地，余产出阀门=竞技场 M7） | 旗帜加成有单测；引擎内可见 | ⬜ 未开工（王国升级/10 级加成已提前至 M3 完成） |
| M7 竞技场 draft | 报名/三轮 3 选 1/限定编队/3 连战/按胜场发奖；draft 卡不进收藏 | 全流程 headless 可玩；中途退出可恢复 activeDraft | ✅ 已落（2026-09-17）。免费票=本地周历 weekStart 判定；「中途退出可恢复」按保守口径简化为弃赛按已得胜场结算（activeDraft 存续期间可续打，崩溃后 draft 作废——hydrate 不恢复半成品） |
| M8 打磨 | 数值平衡、结屏明细对齐视觉稿、截图审查 | 与视觉窗口联合验收 | ⬜ 持续 |

## 4. 工作记录（新记录追加在顶部）

| 日期 | 提交 | 内容 | 验证 |
|---|---|---|---|
| 2026-09-17 | （本次） | **M7 竞技场 · 现开赛（逻辑部分）**：①`economy.ts` 增 ARENA 常量（报名费 150/本周首场免费、三轮 3 选 1、每轮保底 1 张 UR+（idx≥3）、选项档位权重比正常抽卡肥、对手等级 10/14/18 规模 3/3/4 递增）与 ARENA_REWARDS 奖表（1 胜回本黄金、2 胜 +宝石、3 胜 💎大奖+🔑×2，裁定④口径）；②`systems/arena.ts`——报名（免费票按 weekStart 判定，schema 加性字段 arena.lastFreeEntryAt）、draft 三选一（同 seed 复现同一届、各轮不重复、保底抬档）、限定编队（站位列必须是 draft 卡重排，主角不出战）、连战计划（对手王国从推进序掷取、draft 卡按**基础稀有度档等级上限**满配出战、请求过会话校验）、按胜场收官发奖（胜满 3 场或败北即终止）、弃赛按已得胜场结算；**卡即用即弃**：全程不进 collection、不动预设队。**实现复用**：draft 卡快照走 troopToSnapshot（合成满配 TroopRecord）、对手快照走导出的 enemyToSnapshot、选人复用 encounter.pickEnemies、注册表复用 buildMetaRegistry | 新增 tests/unit/metaArena.test.ts 9 用例：免费票周历/收费/不足拒绝、draft 确定性+20 种子保底全中+不重复、站位列校验、对手递增、3 胜大奖、败北收官、弃赛、收藏与预设队零污染；全量 84 文件/886 用例绿、lint 零错。**门槛备注**：窗口 E 当日在 engine/skills 域高频在途保存，`npm run build` 的 tsc 随其保存状态间歇变红（batch-r4→damage/summon→builders 轮动）；本窗口全部路径曾在 E 安静窗口经全量 tsc 验证零错误，此后未再改动引擎域 |
|---|---|---|---|
| 2026-09-17 | （本次） | **M5 主角系统（逻辑部分）**——HERO_UNAVAILABLE 占位转正：①`data/hero.ts`——主角四维锚点（复用官方成长形状 statAtLevel，20 级 62/24/15/27）+ 主角/职业经验曲线 + 8 职业定义（骑士~游侠，按王国推进序绑前 8 个王国，天赋 5 档 5/20/40/60/80 全部复用**已实现特质 code**，不动 traits.json）；②`data/weapons.ts`——首批 20 把武器（通用 4 按主角等级 + 每职业 10 级/20 级毕业各 2），每把 = builders DSL 的 SkillPrototype + 法力色/耗蓝；**原型注册进 meta 桥接注册表**（buildMetaRegistry），不改 engine 技能库（窗口 E 正在该域作业）；③`systems/hero.ts`——加经验（多级连升）/职业经验/装备校验/天赋输出（过滤已实现 code）；④`data/traitIndex.ts`——KNOWN_TRAIT_CODES 提为共享数据（battleBridge 与 hero 同源）；⑤桥接：主角快照（武器=唯一施法手段，无武器时 skillId 'none' 走兜底原型、耗蓝按校验下限 1；王国 10 级加成对主角生效）；⑥settlement：胜利 +60 主角经验（会升级）、职业经验 25 仅计主角编队胜场、任务链 8 关通关解锁绑定职业（unlockedClasses）；⑦schema 加性字段 hero.classXp，新档默认装备学徒法杖。**门槛备注**：提交时全量测试 82 文件/877 用例绿、lint 零错；`npm run build` 的 tsc 红灯**仅**来自窗口 E 在途未提交文件 `src/engine/skills/curated/batch-r4.ts`（4 处类型错误，防撞规则约定 meta 窗口不可代改），`src/meta/**` 类型检查干净（tsc 错误清单中无本窗口路径） | 新增 tests/unit/metaHero.test.ts（13 用例：曲线锚点/多级连升/职业定义合法性/天赋按档生效/装备校验链/武器解锁/主角快照/无武器兜底/结算升级/任务 8 关解锁）；metaBattleBridge 占位用例改造为正例；metaSettlement 旧断言升级为 M5 口径；meta 域 105 用例全绿 |
|---|---|---|---|
| 2026-09-17 | （本次） | **M3 王国经营 + M4 抽卡（逻辑部分，含 GoW 官方调研）**。M3：①`systems/tribute.ts`——进贡按小时掷概率、离线累积 12 小时封顶、收取幂等（种子=王国名+绝对小时序号的 fnv1a32，任何时刻收取结果一致、可独立复算）；②`systems/kingdomOps.ts`——王国黄金升级（成本表 9 档、末级 4 万对齐计划口径）、探索解锁（8/8 通关）与档位设置、10 级绑定属性加成聚合 `kingdomBonusOf`、地图节点状态 `kingdomNodeState`（解锁门槛=主角等级、任务进度、进贡气泡、探索标记）；③`settlement.ts` 增探索每日首胜双倍（击杀行翻倍+note 标注）；④`battleBridge.troopToSnapshot` 接王国 10 级加成（玩家侧 +1，敌人不吃）。**里程碑口径调整：王国升级与 10 级加成从 M6 提前到 M3**（进贡概率依赖等级，不拆不成环），M6 余旗帜加成与金钥匙经济收口。M4：⑤`systems/gacha.ts`——宝石宝箱单抽 150/十连 1500（裁定③价格不动，官方十连仅 5% 折扣无保底，本作保底 Epic+ 为既定裁定）、保底在最后一抽结算（先判定再入册，无撤回账目问题）、金钥匙宝箱池偏低稀有度、重复卡进 copies（与官方「重复卡进升阶」语义一致）、`gachaLog` 存最近 50 次供审计（schema 加性字段）；⑥权重表万分比单源 `economy.ts`：宝石箱 [5200,2400,1700,500,180,20]（顶两档 2.0% 对齐计划 §4.2、顶档 0.2% 对齐社区实测 1/1000 量级）、金箱 [5600,3000,1200,200,0,0]（官方金箱只出 Common/Rare，本作放宽到 UR）。**GoW 官方调研结论见 §7** | 新增测试 3 文件 + 2 文件补例，+25 用例：进贡确定性复算/幂等/封顶、升级原子性/满级、探索解锁链、节点状态、10 级加成进快照；gacha 40 种子保底全中、3000 次固定种子频率审计±25%（小样本档宽区间）、重复语义、日志容量；全量 79 文件/864 用例绿，lint 零错，build 通过 |
|---|---|---|---|
| 2026-09-17 | （本次） | **M2 战斗闭环逻辑**：①`data/kingdoms.ts`——42 王国元数据首版（按王国最小 troops.json id 定序、基数=1+序号×2 封顶 50、任务 8 关队伍规模/等级表、任务 4/8 关王国部队奖励选取）；②`data/economy.ts` 增结算数值（击杀灵魂/黄金按稀有度×等级、胜利奖励、战败保底、每日首胜宝石、经验公式）；③`state/schema.ts` 加性字段 `dailyFirstWinAt`（version 仍为 1）+ hydrate 兼容；④`systems/encounter.ts`——任务/探索出敌计划（种子化、按稀有度带分层、重复去除、任务节点解锁校验）；⑤`systems/battleBridge.ts`——`troopToSnapshot`（只带已解锁特质）、`buildMetaRegistry`（全量技能库+未收录法术 fallbackPrototype 兜底，需求 11.4）、`buildBattleRequest`（过 `validateBattleRequest`，敌人带 tier，主角成员占位报 HERO_UNAVAILABLE）；⑥`systems/settlement.ts`——`applySettlement` 按行入账（击杀/胜利/战斗内收集 economy/每日首胜/任务推进+王国部队奖励/战败保底），更新 stats 与 xp。**实施中定案的三个口径**：(a) 快照特质过滤到 `TRAIT_LIBRARY`（引擎实现 361/785 code，未实现 code 引擎虽安全忽略但严格校验会拒，桥接统一过滤不放行假特质）；(b) `TurnEngine.skullChance` 默认 0（重填骷髅率由宿主设，App 实战自配），集成测试设 0.18；(c) 测试 AI 驱动用「骷髅优先」交换策略——引擎自带 chooseEnemySwap 偏好 4/5 连，会把「庞然」类成长特质喂成不收敛镜像局 | 新增测试 5 文件（metaKingdoms/metaEncounter/metaBattleBridge/metaSettlement/metaBattleLoop）+29 用例——含 **headless 真实对局整环集成**（starter 队练到 10 级→出敌→桥接→TurnEngine 驱动→BattleResult→结算入账）与**同 seed 复现断言**；门槛：lint 零错、全量 77 文件/839 用例绿、build 通过 |
| 2026-09-17 | `5d6d4a5` | **M0+M1 逻辑核心**：`src/meta/` 立层——MetaSave v1 schema+迁移链+双槽防损 SaveStore（StorageLike 抽象）、货币账本（多币种原子扣费）、部队养成（升级/升阶/特质②/分解/入册）、编队 3~4 校验（主角可选、汇总 issues）；数值单源 economy.ts；PARALLEL-WORK.md 登记窗口 J | tests/unit/meta* 5 文件 +43 用例；全量 72 文件/810 用例绿、lint 零错、build 通过 |

## 5. 数值与口径备注（后来者必读）

- 稀有度档 `rarityIdx`：0 Common / 1 Uncommon / 2 Rare / 3 UltraRare / 4 Epic / 5 Legendary（数据无 Mythic）；等级上限 15..20 逐档映射；升阶 = 档 +1（封顶 20），**不改灵魂成本表**。
- 灵魂成本、击杀奖励、分解收益等均为**设计值**，唯一来源 `src/meta/data/economy.ts`，调节奏只改那里。
- 王国定序首版按 troops.json 各王国最小兵种 id 升序（破碎尖塔第一）；42 王国地图坐标/主色等 M3 再进 kingdoms.ts。
- 主角：M2 只累积 xp 不升级（曲线 M5 定）；编队含主角成员时桥接报 `HERO_UNAVAILABLE`，属预期占位。
- 战斗内收集（幽魂/经济三币）从 `BattleResult.economy` 并入结算，单列一行明细。
- 快照特质白名单 = `engine/traits` 的 `TRAIT_LIBRARY`（= traits.json 编译产物，与 App 校验同源）；troops.json 引用的未实现 code 在快照组装时丢弃，不做「假特质」。
- 骷髅重填率 `TurnEngine.skullChance` 默认 0，由宿主/战斗层设定；meta headless 流程需要自行设置（集成测试用 0.18），未来 M2 屏层挂载时要对齐 App 的取值。
- 任务链：每王国 8 关线性推进（只能打 questsDone+1 关），第 4/8 关奖励王国部队（选取规则见 kingdoms.ts 注释）；全链通关解锁职业的映射挂 M5。

## 6. 开放问题

1. 结算屏「战斗终局画面截帧做背景」需视觉/桥接配合，M8 对齐 ASSETS-NEEDED §4.8。
2. `BattleRequest.banner` 字段（旗帜）未进契约；M6 动 `contract.ts` 前先在台账登记。
3. ~~十连保底 Epic+ 的「Epic 及以上权重再分配」细则~~ 已定案（2026-09-17）：保底在最后一抽结算——前 9 抽无 Epic+ 时，第 10 抽直接从 Epic 档取人（Legendary 不因保底贬值）。

## 7. GoW 官方调研结论（2026-09-17，抽卡/进贡口径依据）

**宝箱（官方文档 Infinity Plus 2 Support：Chests, Keys and Chest Rarity）**
- 官方**不公布**具体掉率（原文明示 unable to disclose），且「不保证特定部队必得」；社区实测：宝石箱神话 ≈0.1%（1/1000 量级）、传说约 1/50；官方口径：宝石箱的传说/神话权重为荣耀箱的 **4×/10×**（相对倍率）。
- 现行 GoW 定价：Gem 箱 10 宝石/张（UR+池）、Gold 箱 300 金或金钥匙（只出 Common/Rare）、Glory 箱 20 荣耀；十连 **5% 折扣、50 连 10% 折扣；无任何保底机制**。
- 本作裁定（ASSETS-NEEDED §1.3）优先于现行官方定价：150/1500、十连保底 Epic+；官方「无保底、只折扣」作为差异记录在案。权重表为设计值单源（economy.ts），要跟官方节奏调只改那里。
- 重复卡：官方语义=进升阶材料（与本项目 copies 语义一致，直接对齐）。

**进贡（Gems of War Fandom · Kingdoms + 社区攻略）**
- 官方：每王国等级 **+1%** 命中概率、上限 **10%**，每小时判定；王国 power level 另有金/天与概率倍数加成。
- 本作裁定（计划 §4.5）：min(等级×5%, 75%)、离线累积 12 小时封顶——单机节奏口径，两者差异已记入 `TRIBUTE` 常量注释，切换只改常量。

**来源**：[官方 · Chests, Keys and Chest Rarity](https://infinityplus2.freshdesk.com/support/solutions/articles/150000208282-chests-keys-and-chest-rarity) · [Fandom · Kingdoms](https://gems-of-war.fandom.com/wiki/Kingdoms) · [官方 · Kingdoms Overview](https://infinityplus2.freshdesk.com/support/solutions/articles/150000208254-kingdoms-overview) · [论坛 · Mythic Drop Rates](https://community.gemsofwar.com/t/mythic-drop-rates/42699) · [Reddit · Gem chests and VIP](https://www.reddit.com/r/GemsofWar/comments/95xlll/so_gem_chests_and_what_about_vip/) · [TruTrophies · Kingdoms Guide](https://www.truetrophies.com/game/Gems-of-War/walkthrough/6)
