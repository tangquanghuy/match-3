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
| M3 地图与王国（逻辑部分） | 世界地图节点状态、进贡离线结算、探索入口、任务链收口 | 进贡按小时概率+离线结算正确；锁定王国门槛=主角等级 | ⬜ 未开工 |
| M4 抽卡（逻辑部分） | gacha 权重+种子化+十连保底 Epic+、金钥匙宝箱、概率对账脚本 | 抽卡频率统计与权重表一致（对账脚本） | ⬜ 未开工 |
| M5 主角系统（逻辑部分） | 等级曲线落地（目前 xp 只累积不升级）、8 职业、20 武器（SkillPrototype）、天赋、hero 入编队桥接 | 武器技能过校验可施放；主角可编入队伍出战 | ⬜ 未开工（M2 桥接遇主角成员返回 HERO_UNAVAILABLE 占位） |
| M6 王国经营与旗帜 | 王国黄金升级、10 级全局 +1、旗帜法力加成（**动 ManaDistributor，先登记台账**） | 加成在战斗四维/法力可见并有单测 | ⬜ 未开工 |
| M7 竞技场 draft | 报名/三轮 3 选 1/限定编队/3 连战/按胜场发奖；draft 卡不进收藏 | 全流程 headless 可玩；中途退出可恢复 activeDraft | ⬜ 未开工 |
| M8 打磨 | 数值平衡、结屏明细对齐视觉稿、截图审查 | 与视觉窗口联合验收 | ⬜ 持续 |

## 4. 工作记录（新记录追加在顶部）

| 日期 | 提交 | 内容 | 验证 |
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
3. 十连保底 Epic+ 的「Epic 及以上权重再分配」细则在 M4 写 gacha 时与用户对一次数值。
