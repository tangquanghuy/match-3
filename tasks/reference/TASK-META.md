> **归档于 2026-09-27**：本任务书退出 active，未完成事项保留供后续重新立项；本页的旧窗口分派、执行指令和状态不再代表当前任务。

# 任务书 · Meta 主线（窗口 J）

> **目标**：按 `META-GAME-PLAN.md` 的 M0–M8 里程碑搭起游戏外壳的**逻辑核心**（存档/经济/养成/出敌/战斗桥接/结算），
> 与视觉屏解耦推进——屏未做好之前，一切逻辑以无前端形态（纯函数 + vitest）落地并验收。
> 视觉小样（`design/meta-mockups-v4` 养成页已完成，其余屏用户制作中）是未来 `meta/screens` 的消费方，本窗口不碰、不改其验收标准。
>
> 必读：`PARALLEL-WORK.md`（窗口所有权与台账）、`META-GAME-PLAN.md`（系统设计与八条裁定）、`TASK-MASTER-PLAN.md`（共同约定）。

## 1. 所有权（已登记 PARALLEL-WORK.md，2026-09-17）

| 范围 | 文件 |
|---|---|
| J 独占 | `src/meta/**`、`tests/unit/meta*`、`tests/e2e/meta*`、`game.html`（入口已建 + `src/meta/shell`/`src/meta/screens`/`src/meta/gateway`）、本任务书 |
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
| M9 素材经济+每周活动+入侵 PvP | 素材三族（钢锭/符卷/特质石）库存与产出、特质解锁改特质石口径（裁定②修订）、淬炼接线（F2）、**六活动常驻全部开放**（主题参数按周轮换）、入侵排位（官方联赛/VP/荣耀/镜像）、荣耀箱、活动商店+活动代币+材料库面板、**六活动独立玩法**（防线/血池/爬塔/克制/收集/连胜）+**六独立页面**、探索掉落、放弃登塔 | 活动与入侵全流程 headless 可玩；素材产出→消耗闭环（淬炼/特质）；官方 VP 表与升降级名次表对表；D1 镜像形状定型；浏览器实测截图验证 | ✅ 已落（2026-09-19~20，逐批见工作记录；完整设计见本文 §8） |
| M10 王国主线战斗界面 | `#quest/<王国>` 页（任务链 8 关轨道+敌人预览+探索档位中枢），替换地图弹层「直接开战」 | 8 关状态渲染正确、预览确定性复现、未解锁/已通关各态可见、探索档位切换即时持久化、出战走既有结算闭环 | ✅ 已落（2026-09-19；见 PARALLEL-WORK Q-B3 记录） |
| M0 存档与账本 | MetaSave v1、迁移链、双槽防损、导入导出、货币账本（原子扣费） | 往返一致；主槽损坏回退备份；双槽皆损重建新档；账本原子性 | ✅ 已落（2026-09-17） |
| M1 养成与编队（逻辑部分） | 灵魂升级、升阶 5/10/25、特质解锁（裁定②）、分解保护、入册 grantTroop、编队 3~4 校验 | 官方口径对表（上限 15..20、升阶不耗本体、特质顺序前置）；非法队伍存档不动 | ✅ 已落（2026-09-17） |
| M2 战斗闭环（逻辑部分） | 王国元数据（kingdoms.ts）、encounter 出敌（任务 8 关/探索 5 档）、battleBridge（存档→BattleRequest+注册表兜底）、settlement（击杀/胜利/首胜/任务推进/战败保底入账） | 请求过会话校验；headless 真实对局整环跑通；结算逐行可解释（明细行供结算屏）；同 seed 可复现 | ✅ 已落（2026-09-17） |
| M3 地图与王国（逻辑部分） | 进贡离线结算、探索解锁/档位、地图节点状态、42 王国元数据、任务链（M2 已落） | 进贡按小时概率+离线结算正确（确定性可复算）；节点状态含解锁门槛/任务/气泡/探索 | ✅ 已落（2026-09-17）。王国黄金升级与 10 级加成**提前至此**（进贡依赖等级，拆开不成环）；加成已接线战斗快照 |
| M4 抽卡（逻辑部分） | gacha 权重+种子化+十连保底 Epic+、金钥匙宝箱、gachaLog 对账 | 权重表万分比单源；3000 次固定种子审计频率与权重一致；40 种子保底无一漏发；重复卡进 copies | ✅ 已落（2026-09-17） |
| M5 主角系统（逻辑部分） | 等级曲线落地、8 职业（天赋=既有特质 code）、20 武器（builders DSL，注册进 meta 桥接注册表）、主角入队出战 | 武器技能过校验可施放；主角可编入队伍出战；任务 8 关解锁职业 | ✅ 已落（2026-09-17） |
| M6 王国经营与旗帜 | 旗帜法力加成、金钥匙经济收口（金宝箱已于 M4 落地） | 旗帜加成有单测；引擎内可见 | ✅ 已落（2026-09-18）。42 王国官方旗帜表（gowhead `kingdoms.en.json` BannerColors，2=++/1=+/−1=−，每匹配事件 ±N 平展）+ 解锁=任务链 8/8 + BAD_BANNER 装备校验 + contract `playerBanner` 契约 + TurnEngine 玩家侧结算口注入；金钥匙收口=任务 8/8 全通 +1（来源=进贡/任务/竞技场闭环）。王国升级/10 级加成此前已提前至 M3 |
| M7 竞技场 draft | 报名/三轮 3 选 1/限定编队/3 连战/按胜场发奖；draft 卡不进收藏 | 全流程 headless 可玩；中途退出可恢复 activeDraft | ✅ 已落（2026-09-17）。免费票=本地周历 weekStart 判定；「中途退出可恢复」按保守口径简化为弃赛按已得胜场结算（activeDraft 存续期间可续打，崩溃后 draft 作废——hydrate 不恢复半成品） |
| M8 打磨 | 数值平衡、结屏明细对齐视觉稿、截图审查 | 与视觉窗口联合验收 | 🔄 持续（2026-09-18：meta/screens 外壳已接 v5 小样 + mock 网关落地，浏览器冒烟通过；待联合截图审查） |

## 4. 工作记录（新记录追加在顶部）

| 日期 | 提交 | 内容 | 验证 |
|---|---|---|---|
| 2026-09-19（UX 审查阶段 A · 零代码） | （本次） | **全页面 UX 审查阶段 A 交付**（TASK-UX §5，零 `src/**`/`tests/**` 改动）：16/16 页逐页报告 `design/ux-audit/pages/01..16-*.md` + 总报告 `UX-AUDIT.md` + 设计系统 `DESIGN-SYSTEM.md`，**166 条问题（P0 57 / P1 79 / P2 30）**、262 张截图、56 个可复跑探针脚本（`artifacts/ux-audit-scripts/`）、截图规程 helper `scripts/ux_shots.mjs`。**四条资源损失/功能 0% 可用（建议插队修）**：①宝箱金钥匙十连部分扣费（钥匙 7 把点十连→全扣+卡静默入账+零演出+toast 反报"不足"，`chestsScreen.ts:265-270` 循环单抽第 8 次失败丢弃前 7 次已持久化结果）②竞技场站位 0% 可用（`arena.css:463-472` `pointer-events:none`，而页面写着「▲▼ 调整站位」）③英雄页武器库「装备」按钮永在弹层外（`margin-top:auto` 推到 y=1416 / 可见底沿 772，换武器 0% 可用）④武器库 20 把里 8 把不可达+滚轮无效。另查出**全开放两颗定时炸弹**（`battleLauncher.ts:175` returnHash 只回根页、六活动共用一份周实例致积分/代币/claimed 串号）与**入侵两处错误文案**（青铜被告知"顶端联赛"、公示合同层不可得的「4 消加分」）。跨页五大根因：系统层算好屏层没消费 / 按钮永远亮着 / 固定高容器吞内容 / 开发口径外泄 / 周期变化静默。阶段 B 批次顺序 B0~B8 与 M10 并入建议见 `UX-AUDIT.md` §5 | 无代码变更；各页 console 错误实测 0 条；取证缺口如实记录（真实明细结算屏未拍到——自动交换 345 次/22 分钟成交 22 步打不完一局） |
| 2026-09-19（文档批：TASK-UX 增补） | （本次） | **纯文档**：TASK-UX.md 增补用户第二轮实测反馈为 P0——**UX-9 宝箱拆双页（已裁定：金钥匙+荣耀一页 / 宝石独立页，二游卡池式切换；两张新主视觉素材已归档 `design/ux-audit/assets/`，旧 chest-vault.png 保留不删，gem 源图 5.9MB 需压缩进 public）**、UX-10 图鉴（用户：问题最多非常难用，升级为走查重点）、UX-11 编队/UX-12 英雄页阅读体验、**UX-13 全局视觉语言（沉闷单调/方框按钮不美观——设计系统级重做，逐页连带）**；走查表 3/4/5/8 行同步指向新编号，§3A 写明素材源/目标路径与落位要求 | 无代码变更 |
| 2026-09-19（文档批：TASK-UX 重写） | （本次） | **纯文档**：TASK-UX.md 整体重写为「全页面 UX 视觉审查与重设计」任务书（旧 SkillTestPage 测试台任务降级为附录 A）——用户点名 7 项 P0（熔炉锻造无武器属性/武器库贴图混排/武器图鉴独立网页+过滤器不可用/世界事件页文字堆砌/活动商店拆独立页/**活动废除轮换改全开放**/材料库背包化）+ 全页面 16 项走查清单（每页五问维度+截图规程+数量硬门槛）+ 两阶段流程（阶段 A 零代码只出报告→用户逐项裁定→阶段 B 实施）；活动全开放的系统层提案（per-event 周实例/独立代币/产出节奏×6 校准）列待确认项。TASK-META §8 加裁定指针 | 无代码变更 |
| 2026-09-19（文档批：任务书补全） | （本次） | **纯文档，未动代码**：①里程碑表 M9 合并当日五批（素材经济/商店材料库/玩法差异化/自查修差/战斗显示批），新增 **M10 王国主线战斗界面（待实施）**；②新增 **§8 每周活动+入侵完整设计**（已落地口径：素材三族产出消耗闭环表、特质解锁三槽消耗表、淬炼接线、六活动玩法机制与状态键详表、积分/代币/里程碑/商店/探索掉落、入侵联赛与晋级降级名次表/首次定级/VP 官方计分表/荣耀规则/镜像 D1 形状/周结奖励、页面路由与网关端点清单、文件地图）——数值单源指针齐全，后续调数值只进数据文件；③新增 **§9 任务书草案（M10 王国主线战斗界面）**：现状缺口（弹层直接开战、无任务链可视化）、`#quest/<kingdom>` 页面线框、读模型清单（全现有纯函数+预览 seed 约定）、写路径（零新网关方法）、六条验收标准、归属与规模（≤半天）；④§5 补素材/卡面特质口径备注 | 无代码变更；全量维持 1603 例绿 |
| 2026-09-19（战斗显示批·用户实测反馈修差） | （本次） | **用户贴实测截图指出四问题，全部修差并浏览器截图验证**：①部队/敌人卡无立绘（黑卡）——根因=桥接快照不传 `portraitUrl`，App 按中文名回落 CDN 无部队图；修=快照补 `/meta/assets/portraits/{portrait}.webp`（1828 张立绘目录联接到 public，图鉴/战斗共用），主角=`hero.webp`；②详情「暂无技能数据」——主角武器技能无文本源；修=快照加性携带 `spellName/spellDescription`（兵种=spells 文本、主角=武器名/描述），详情面板显示链路「快照优先→池回落」；③特质裸码——天赋/专属特质 code 不在特质库；修=快照携带 `traitNames`（CLASSES nameZh 表+兵种特质名）面板兜底，未实现项保留诚实「未生效」标记；④卡面 `??` 乱码+主角特质溢出——TeamView 乱码字面量改「法力」；**用户裁定：卡面特质=3 条职业专属特质（displayTraitIds），7 天赋不上卡面只在详情**。涉及共享文件 contract/engine Character/combatantMapping/TeamView 均加性、已登记台账 | 浏览器实测：活动页/战斗八卡立绘/主角详情三项截图验证；1603 例绿、lint 零 error |
| 2026-09-19（玩法差异化批·自查修差） | （本次） | **用户质疑「入口/流程/机制是否完善自洽」，逐类型走查全链路后修 3 缺口**：①结算屏此前只渲染带货币/素材的行——`event-points`/`event-progress`（防线推进/首领伤害/塔层通过/物资 +X/守土成功）全是纯文本行**完全不显示**，主反馈链路断裂 → resultScreen 增「活动玩法推进」信息行渲染；②活动战结算后只有「返回地图」，循环断半路 → ShellCtx.showResult meta 增 `returnHash?`（launcher 事件战传 '#events'），结算屏出现「回到活动页」直达按钮；③末日之塔无主动结束手段（只能故意败北）→ `abandonTowerRun`（败北同口径收尾发奖）+ 网关方法 + 塔页「放弃登塔」按钮；④顺带验证：塔减员至 1 人不撞校验（TEAM_SIZE_LIMITS.min=1）、引擎 1~4 人上限内合法。残红 curated/index.ts BATCH_R24=K 窗口在途 | metaEvents +1（放弃收尾/重复放弃拒绝）=23 例；全量 1603 例绿、lint 零 error、tsc 除 K 在途零错、e2e 过 |
| 2026-09-19（玩法差异化批：六活动独立玩法+六独立页面） | （本次） | **用户裁定「六种真玩法全做+六个独立页面」**：①**玩法状态**——`eventWeek.eventData`（键约定 EVENT_STATE_KEYS）+ `eventWeek.runTeam`（塔层冻结队伍），hydrate 清洗补齐；②**六机制**（全部 meta 层实现、零引擎改动）：入侵周=防线波次（3 线等级 +0/+3/+6、破全线守土重赏、败退回）；突袭首领=首领血池（≈8 场满伤×1.15^tier、胜败都计伤害、见底讨伐成功并刷新更强）；末日之塔=爬塔 run（每 5 层首领、等级 +1/层、队伍 HP/阵亡跨层冻结——applyEventBattleModifiers 剔除阵亡/残血延续、减员继续、全灭或败北收尾按层数发符卷/荣耀）；阵营突袭=阵营克制（目标王国部队每 1 名全队攻 +2/血 +10，出战请求期注入）；世界事件=收集玩法（胜场掉 2~4 物资、加成种族每名 +2【周种子轮换】、里程碑按物资结算——阈值表改 15~300）；职业试炼=连胜试炼（×1.0/1.3/1.6/2.0、败场清零、试炼积分上限 240）；③**六独立页面**——#events/<typeId> 路由族 + #events 回退轮值；页签互切、轮值高亮、非轮值预告态（N 周后开启、不可出战无商店）；每页=横幅（出战按钮按类型命名）+规则卡（EVENT_ROTATION.howto）+专属状态区（防线图/血池条/塔层/物资/克制预览/连胜倍率）+里程碑轨（进度按类型：物资/积分）+商店；④结算重构：事件分支胜负都推进（eventBattleProgress 逐类型状态机）、试炼积分在积分段处理、里程碑进度 eventMetricOf 按类型取值，新 SettlementLineKey 'event-progress' | metaEvents 22 例（新增 7：防线推进/血池累计+讨伐+刷新/塔 run 全流程含减员残血/物资收集/连胜计分清零/阵营 buff 叠加/倍率值表；改造 2：入侵等级改按防线、里程碑测试类型自适应）；全量 120 文件 1602 例绿、lint 零 error、tsc 零 error、e2e 冒烟含六页路由+预告态断言 |
| 2026-09-19（素材批·追补：活动商店+材料库） | （本次） | **活动商店 + 材料库面板**（用户追问两项缺口：官方活动的活动币商店未做、新素材无处看库存）：①**活动代币**——胜场 `max(3, floor(points/10))` 枚（30~120 分→3~12 币），落 `eventWeek.tokens`、跨周作废；结算行备注同步显示；②**活动商店**——`data/events.ts` 增 `EVENT_SHOP`（六类型各 4~5 件：基础包不限量、高档货周限量 1~4；素材侧重与里程碑轨一致），`systems/events` 增 `eventShopOf`（带剩余库存的读模型）/`buyEventGoods`（代币原子扣账+素材入账+已购计数，新错误码 SOLD_OUT），`gateway.buyEventGoods`（D1 端点）；活动屏加货架区（代币余额/剩余数/购买即刷）；③**材料库**——顶栏背包按钮全局弹层（挂 body 不随切屏销毁）：钢锭七档/符卷/特质石 3 档×6 色+圣辉石全库存，颜色点+空槽灰显，附来源/去向提示（`gameMain.openMaterialsVeil` + extras.css） | metaEvents +5 例（货架数据合法性/代币下限/购买扣账与售罄/不足整笔不动/周切重置/胜场发币）=15 例全绿；e2e 冒烟补商店货架/代币余额/材料库弹层开关断言；lint 零 error；全量 120 文件 1595 例绿 |
| 2026-09-19（素材批：每周活动+入侵+淬炼经济） | （本次） | **官方素材三族接入 + 每周活动 + 入侵 PvP**（先上网调研官方口径再落地，考据全录 `design/EVENTS-INVASION-DESIGN.md`）：①**素材**——schema 加性节 `materials`（钢锭六档按武器稀有度、熔铸符卷、特质石 minor/major/runic×6 色+celestial；官方 Arcane 双色档不引入，差异记录）+ `weaponTempering` + 第五货币**荣耀**；wallet 增 earnMaterials/spendMaterials（原子、与货币同纪律）；②**特质解锁改官方口径（裁定②修订，用户 09-19 提出「特质材料未接入」直接裁定）**：黄金+本卡主色特质石（槽1 minor×8+2k 金 / 槽2 +major+runic / 槽3 +celestial×2+12k 金），同名卡零消耗（升阶线保留竞争）；职业特质槽金+魂独立小表（无颜色归属不吃石）；③**淬炼接线（FORGE-DESIGN F2）**：`systems/forgeOps`（校验→扣账→写回，素材回滚）、稀有度统一走 K 窗口 `weaponCatalog.anyWeaponById`（首批 w_* 推导 / 目录 gw_* 原文）、主角快照带 `temperingLevel`（引擎 tempering 来源就绪）+ 每 2 级+1 攻/甲/血/魔轮转面板加成；**共享文件台账登记**：contract `CombatantSnapshot.temperingLevel?` + combatantMapping 透传（均加性，与 kingdom 同款模式）；④**每周活动**（官方 Live Event 单机适配）：6 周大轮换（入侵/突袭首领/末日之塔/阵营突袭/世界事件/职业试炼）、周种子确定性主题（入侵势力王国等）、胜利积分 Σ(稀有度+1)×10+Σ等级 封顶 120、6 档里程碑**达标自动入账**（素材侧重按官方对应：Invasion=特质石、RaidBoss=钢锭、ToD=符卷、FactionAssault=钢锭+石、WorldEvent=钱钥、ClassTrials=荣耀+职业经验×2）、活动吃养成（主角/旗帜/王国加成，与竞技场 draft 对照）、探索胜利掉落钢锭（档位随王国基数）+minor 石（敌方主色）；⑤**入侵 PvP**（官方排位的单机适配，世界观名沿用「入侵」）：官方 10 联赛官阶（青铜→白银→黄金→白金→翡翠→蓝宝石→紫水晶→黄玉→红宝石→钻石）+30 人小组+每周 VP+**官方晋级/降级名次表**（青铜前 20…红宝石前 3；白银末 5…钻石末 7；**不打不降**）、首次按主角等级定级（官方 Path 段映射 20/40/60/80）、29 镜像种子化（**InvasionMirror 数据形状=未来 D1 一行真人数据**：id/name/rating/vp/frenzy/defense，屏层结算零返工）、每日 5 候选（VP 最近+日轮转）、**VP=官方基础分表（10/20/30/40/50，min/max 夹紧）+速胜/存活/extra-turn 加分每类取最高**（4/5 消与一击必杀不可得，eventSummary 只有类型计数——开放问题登记）、血怒对手 ×2、荣耀（胜 +10、宿敌 +5、每日入侵首胜 +15；**20 荣耀=1 荣耀箱**，宝箱屏第三箱：特质石为主+概率卡/钥匙）、跨周 lazy 周结（晋级=荣耀150+宝石100+材料包；守级=75+30；降级=25）；⑥**屏/壳**：地图 rail「世界事件」「入侵（主角 10 级解锁）」接通、新活动屏（横幅/积分进度/里程碑轨/6 周轮换预告）、新入侵屏（官阶徽章/VP/名次/今日对手带防守队预览/本周榜单晋级降级区着色）、结算屏素材行、宝箱屏荣耀箱、顶栏荣耀格；⑦**网关新方法**：temperWeapon/planEventBattle/planInvasionBattle/settleInvasionBattle（async 签名=未来 D1 端点，读模型仍纯函数）。**并发协调**：K 窗口同日在途（weaponCatalog/soulforge gw_ 前缀），本批复用其统一解析口径、heroScreen 淬炼 UI 留 K 接（gateway API 已就绪）；metaForge.test 残红为其在途状态 | 新增 tests/unit/metaEvents.test.ts 10 例（轮换确定性/主题参数/里程碑表键合法性/建档周切/出敌复现/入侵周同王国/积分封顶/里程碑入账/败场不计）；metaInvasion.test.ts 14 例（榜单确定性/血怒恰 2/VP 爬坡/首次定级/晋级发奖/不打不降/垫底降级/VP 官方表/加分每类取最高/胜场夹紧/每日首胜一次/败场不透支/请求过校验+门槛拒绝/**headless 真实对局**）；metaForgeOps.test.ts 5 例（稀有度解析/扣账写回/素材回滚/满级）；metaTroopProgress/Wallet/Schema/BattleBridge 期望更新（特质石口径+glory 字段）；e2e metaLiveScreens.spec.ts 冒烟（活动屏/入侵屏 5 候选/荣耀箱开箱入账）；meta 域新增 29 例全绿、全量 120 文件 1590 例仅 1 红（K 在途）、lint 零 error、tsc 本批路径零错 |
| 2026-09-18（M6 旗帜 + M7 竞技场对照官方批） | （本次） | **M6 收尾 + M7 规则修正，全部先上网调研官方口径再落地**：①**旗帜**——gowhead 原始数据 `data/raw/gow-2026-09-18/kingdoms.en.json` 的 `BannerColors`（6 元数组，色序蓝绿红黄紫棕，2=++/1=+/−1=−）生成全 42 王国旗帜表 `data/banners.ts`（fandom「Banners」页同源记法交叉验证；色序经风暴峡湾=蓝++/卡其尔=棕++/白盔国=黄++/卡拉考斯=紫++ 等王国主题逐一对号；天启=Sin of Maraj 同旗（FileBase K34 实锤），仅混沌/藏宝库两个 gowhead 事件伪王国用设计值补齐）。官方语义：匹配加成色时该色法力**按每次匹配事件平展 ±N**（配 3 颗 5 颗都 ±N，不逐宝石）。解锁=任务链 8/8（派生 questsDone 零新字段）；`setTeamPreset` 增 BAD_BANNER；`buildBattleRequest` 挂 `playerBanner`（未解锁静默降级）；契约/引擎/渲染三处加性接线（台账）：contract 可选 `playerBanner`、TurnEngine 公开字段 `bannerBoosts` 在 `distributeGemMana` 玩家侧单点应用（`max(0, amount+boost)`，无旗帜逐字节不变）、App.init 注入。②**竞技场对照官方**——draft 从「加权随机+每轮保底 UR+」改为官方旧版 Arena 的固定稀有度阶梯（3 普通/3 稀有/3 超稀各选 1 → 六档适配：第 1/2/3 轮分别在 常规/稀有/史诗 带内 3 选 1，末轮 Epic+ 结构自保证）；奖励表维持官方改版数字；官方「现开赛不吃王国加成/旗帜」→ 竞技场请求不带 playerBanner（测试锁定）。③**金钥匙经济收口**——任务链 8/8 全通 +1 金钥匙（进贡/任务/竞技场三来源闭环）。④屏：编队页旗帜选择器（全部 42 旗+色签+未解锁置灰「任务 8/8 解锁」）、竞技场屏改阶梯文案 | 新增 tests/unit/metaBanner.test.ts 10 用例（表完整性/官方数据逐条抽查/解锁/装备校验/契约注入/引擎红+2、棕−1、重惩罚保底 0、敌方与非加成色事件流逐字节不变）；metaArena 更新为阶梯口径（20 种子确定性+档位断言+无旗帜断言）；metaSettlement 增 8/8 钥匙用例；metaTeamRules 增 BAD_BANNER 用例。meta 域 14 文件 108 用例绿、lint 零 error、tsc 本批路径零错（残余红=职业 v2/特质/武器窗口在途，与本次无交集） |
| 2026-09-18（第五批·稀有度质感分档） | （本次） | **特质图标按稀有度三档质感**（用户创意）：生成器重写为结构化候选表——每族 { simple/normal/ornate } 三档候选（simple=白绿卡朴素剪影、normal=稀有~超稀有标准、ornate=史诗/传说华丽，缺档回落 normal），43 族 × 3 档 = 129 个内联图标（如 攻击：匕首→阔剑→挥剑、骷髅：骷髅→交叉骨→死亡颅、召唤：传送门→召唤符→邪教徒）。traitIcon 新增 styleOfTier(tier)（0-1 simple / 2-3 normal / 4-5 ornate），traitGlyph/traitGlyphsFor 增 tier 参数，图鉴屏传入 rarityTierOf(本卡)——稀有度越高的卡特质图标越精致。细分族落地（承接第四批）：转化 26（宝石颜色互转系列）、光环 22（灵气/全状态值系列）、召唤 28（配对宝石召唤系列）、魅惑/流血/法力燃烧/赐福等 | metaTraitIcon 6/6 绿（新增三档质感回归：同特质 tier0/2/5 三图互异且语义族不变）；全量分布 45 族最大族攻击 67（8.5%）、兜底 2（0.25%）；lint 零 error、meta tsc 零错；浏览器实测白卡朴素档与史诗卡华丽档 |
| 2026-09-18（第四批·特质族扩容） | （本次） | **图形族 21→39 扩容**（全量分布实测驱动）：新增 18 个效果族——眩晕/缠绕/织网/屏障/沉默/下潜/妖火/死亡标记(含猎杀吞噬)/狂怒/法印/风暴/爆破/净化/窃取/削弱/重生/贪财/状态，全部 game-icons.net 图源（生成器候选表同步扩展）。效果优先序细化：状态词族全部置于「配对宝石」触发载体族之前——此前「配对X宝石时获得生命/攻击/减益」类被误归宝石族（234 个，占 30%），现按各自效果归族；兜底 37→3（0.4%，仅全属性提升/玩家对战/旅程三类异形特质走星堆）。分布实测：宝石 94、盟约 78、法力 69、攻击 67…最长尾消失 | 全量 785 code 覆盖扫描零落空；metaTraitIcon+metaGateway 14/14 绿（含庞然→生命/食人魔之怒→攻击/狂暴→反伤/披甲→减伤 回归断言）；lint 零 error、meta tsc 零错；浏览器实拍人马斥候（法力/闪避/先攻）与食人魔（反伤/生命/攻击）零重复 |
| 2026-09-18（第三批·用户反馈修差） | （本次） | **特质图标全面换血 + 语义修正**：①弃用手绘 SVG，图源改 **game-icons.net 现成剪影**——新增生成器 `scripts/build_meta_trait_icons.mjs`（浅克隆 github game-icons/icons 全库 4239 图，按族候选表挑选→洗掉全屏黑底与 #fff 填充→生成 `shell/traitIconsGameIcons.ts`，作者署名内联备档，CC BY 3.0），21 个图形族（剧毒=毒瓶/燃烧=火苗/冻结=雪花/骷髅=交叉骨/宝石=切割钻/护甲=胸甲/先攻=冲刺/盟约=连环…）+ 星堆兜底；②**语义口径=看效果不看触发条件**：效果词（获得生命/攻击/护甲/法力、治疗、造成伤害）优先于触发词（宝石/骷髅/战斗开始）——修掉「庞然(配对宝石+生命)被画成钻石」「食人魔之怒(配对宝石+攻击)被画成钻石」的错归；③**同屏去重**：traitGlyphsFor 保证同一部队多个特质不重图（狂暴=盾牌反弹/庞然=心翼/食人魔之怒=阔剑各不相同）；④图鉴屏改用 traitGlyphsFor，拆除最后的「未实现」挂牌与暗色叉块——UI 面不再向人工测试暴露实现缺口（引擎侧快照过滤口径不变）。单测 4 例：全量 785 code 产出合法 SVG、语义回归（庞然→生命/食人魔之怒→攻击/狂暴→反伤/披甲→减伤）、三特质去重、空描述兜底 | metaTraitIcon+metaGateway 14/14 绿；浏览器实拍食人魔特质列表三族三色零重复；lint 零 error、meta 路径 tsc 零错、全量 vitest 除 A/G 在途基线护栏（traitMatchDamageDrain 事件数基线漂移，与本次改动导入图无交集）外全绿 |
| 2026-09-18（第二批·用户反馈修差） | （本次） | **外壳评审修差**：①**CSS 级联修复**——小样各页样式级联顺序不同（troop.html 先 link troop.css 再被 style.css 压回；arena/result 在全局之后覆盖），首批实现把全部页面 CSS 全局一次性 import 导致 troop 的 chrome 皮肤（.viewport/.topbar/.wallet 等 27 个类）压坏所有屏。改为 `shell/pageCss.ts` 按屏注入（?raw + <style>，troop 插 head 首、arena/result 追加 tail），与小样级联逐字节同序；effect-panels.css 无页面引用，弃载。②**共享法术文本组件** `shell/spellText.ts`——[魔法±N]/[魔法/N]/[(魔法×x)+N] 全式求值高亮 + 点击弹计算过程（ troop 详情/主角武器库/编队详情三处统一，编队用非交互粗体变体）；显示层清洗数据管道病句（PHRASE_FIXES：『随机爆破 一颗的宝石』→『随机选择一颗宝石爆破』+ CJK 间空格收紧，数据修正后条目可删）。③**特质图标映射**——复用 A 窗口 `render/traitBadges`（按效果族推导 SVG：隐匿→眼/免疫→盾叉/减伤→盾/反伤→回旋…，同族共图、title 区分），图鉴特质列表全部有图标，未实现 code 暗色叉块占位。④**语义确认**（问题 2 回执）：泰山压顶(7131)引擎已实现（curated/batch-05：explodeRandomGems(1)=随机一颗宝石+周围 8 邻格爆破，非指定目标），文案病句属 troops.json 生成管道（B 域），已在显示层兜底。⑤底部导航 world-mark 固定『破晓之誓』，页级 hint 归位右侧 | 与小样逐屏截图比对（双服务 5199 应用/5200 小样原版）：地图/图鉴详情/竞技场逐像素对齐（差异均来自真实数据：等级门槛剪影、真实奖表），主角/编队高亮与 tooltip 生效；meta 路径 tsc 零错、lint 零错、全量 vitest 绿、build 通过（K 窗口 batch-w* 在途文件红为已知在途状态，未触碰） |
| 2026-09-18 | （本次） | **M8 · 视觉小样接入落地（meta/screens 外壳 + 数据网关）**：①**数据层** `src/meta/gateway/`——MetaGateway 接口（load/current/nextSeed + 各域写方法，全部 async，方法形状=未来 D1 RPC 端点；读模型仍走纯函数，时钟/周历由调用方传入），MockGateway 实现（SaveStore localStorage 双槽 + 纯 systems，写后落盘），buildDemoSave 演示档（全走 grantTroop/levelUp/earn/addClassXp 等正式系统铺数据，除 now 外确定性），clock 工具（todayStart/weekStart 本地日历）；②**外壳** `game.html`（vite 第三入口，台账已登记）+ `src/meta/shell/`——gameMain（hash 路由 + 共享 chrome：顶栏钱包/玩家徽章/底部导航/图标/toast/1600×900 舞台缩放）、BattleLauncher（plan→App 全屏接管→onBattleDismissed→destroy→结算分派：任务/探索走结算屏、竞技场走 arena 收官）、screen 接口（html/mount/dispose，切屏解绑防泄漏）；③**七屏 + 设置屏** `src/meta/screens/`——地图（42 王国真实等级/解锁门槛/进贡气泡/任务入口，升级·收贡·一键收取走网关）、编队（真实收藏名册+主角，保存/出战/校验 issues）、图鉴+详情（升阶/特质/分解/保护全接网关，法术公式求值器）、主角（职业圣殿/天赋路径/武器库装备）、宝箱（真实 gacha 种子化开箱，十连保底，FX 条带+音效沿用小样资产，概率公示从 economy 权重派生）、竞技场（报名→三轮三选一→站位→连战→弃赛，奖表从 economy 派生）、结算（SettlementDetail 逐行明细）、设置（导出/导入/重置/调试开关，补齐小样缺失的一屏）；④**共享改动（台账）**：vite.config.ts 加 game 入口；App.ts 追加幂等 destroy()（停 ticker/销毁舞台/移除 wrapper，零改既有路径）；⑤**顺修存量 bug**：hydrateSave 漏水合 hero.classLevels/unlockedClasses/unlockedWeapons/talentSpent——刷新后职业等级与解锁回退（M5 缺口，冒烟发现），已补齐+回归断言。**D1 预留**：网关方法即端点，服务器跑同一套纯 systems 返回同形状结果，切后端屏层零返工 | 新增 tests/unit/metaGateway.test.ts 10 用例（演示档确定性/持久化/养成/宝箱保底/进贡幂等/竞技场整环/任务结算闭环/导入导出/重置）；浏览器冒烟（IAB）：地图/弹层/图鉴/主角/编队/竞技场/宝箱/设置全屏渲染真实数据，卡拉考斯第 6 关从地图开战 → App 全屏接管 TURN 01 正常；全量 94 文件/1107 用例绿、lint 零错、tsc 零错、build 通过 |
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
- 素材/活动/入侵口径（2026-09-19）：完整设计见 §8；特质石键格式 = `data/materials.stoneKey`；钢锭库存七档（common..mythic，含 uncommon）。
- 卡面特质口径（2026-09-19 用户裁定）：主角卡面 = `displayTraitIds`（3 条已解锁职业专属特质），7 天赋不上卡面、只在详情面板；兵种卡 = 原 3 特质。

## 6. 开放问题

1. 结算屏「战斗终局画面截帧做背景」需视觉/桥接配合，M8 对齐 ASSETS-NEEDED §4.8。
2. 入侵 VP 的「4/5 消加分（+2/+3…）与一击必杀 +3」暂不可得：`BattleResult.eventSummary` 只有事件类型计数、不含消除规模——合同加性扩展（如 elimination 按 shape 分型计数）后补齐（DESIGN §4 G5）。
3. 锻造所页面（FORGE-DESIGN F3）与熔炉锻造（soulforge 配方→gw_ 武器入包）归 K 窗口衔接：淬炼的网关 API（`gateway.temperWeapon`）与存档字段已就绪，UI 只差消费。
2. ~~`BattleRequest.banner` 字段（旗帜）未进契约~~ 已落地（2026-09-18，M6 旗帜批）：`playerBanner: { boosts }`，台账登记后接线 contract/TurnEngine/App。
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

## 8. 每周活动 + 入侵 PvP · 完整设计（2026-09-19 已落地口径）

> 考据来源与差异记录见 `design/EVENTS-INVASION-DESIGN.md`；本节记录**已实现的最终设计**。
> **2026-09-19 用户裁定**：废除 6 周轮换，六活动改**常驻全部开放**；每周只轮换主题参数并统一重置各活动独立周实例。本节以下内容按该最终口径记录。
> 数值单源：`data/economy.ts`（INVASION*/GLORY_CHEST/EXPLORE_DROPS/traitUnlockCost）+ `data/events.ts`
> （EVENT_ROTATION/EVENT_MILESTONES/EVENT_SHOP）；词表 `data/materials.ts`；系统实现
> `systems/events.ts`（活动）与 `systems/invasion.ts`（入侵）。调数值只改数据文件。

### 8.1 素材三族与货币（schema.materials + currencies.glory）

| 素材 | 键 | 产出 | 消耗 |
|---|---|---|---|
| 钢锭（七档） | `materials.ingots.common/uncommon/rare/ultraRare/epic/legendary/mythic` | 突袭首领/阵营突袭周里程碑与商店、探索掉落、入侵晋级材料包、荣耀赛季 | 武器淬炼（按武器稀有度档） |
| 熔铸符卷 | `materials.forgeScrolls` | 末日之塔周（主）、突袭首领里程碑、入侵晋级材料包 | Doomed 系武器淬炼（每级 1 卷） |
| 特质石 | `materials.traitstones['{minor\|major\|runic}:{color}']` + `'celestial'` | 入侵周（主）、探索掉落、荣耀箱、各活动里程碑/商店 | 部队特质解锁（按本卡主色） |
| 荣耀（第五货币） | `currencies.glory` | 入侵 PvP（主）、职业试炼周、守土成功 | 荣耀宝箱（20/开，特质石为主+概率卡/金钥匙） |

- 颜色词表（data/materials.STONE_COLORS）：blue=水 / green=自然 / red=火 / yellow=风 / purple=魔法 / brown=土（对齐 GoW 元素口径）。
- 官方 Arcane 双色档（21 种）不引入，高档消耗由 celestial 万能石承接（差异已记录）。
- 查看入口：顶栏「材料库」弹层（全库存+来源/去向提示）；消耗点：图鉴页特质解锁、英雄页武器淬炼。

### 8.2 特质解锁（裁定②修订，同名卡零消耗）

| 槽位 | 消耗（主色石 + 黄金） |
|---|---|
| 特质 Ⅰ | minor×8 + 金 2,000 |
| 特质 Ⅱ | minor×12 + major×6 + runic×2 + 金 5,000 |
| 特质 Ⅲ | major×10 + runic×4 + celestial×2 + 金 12,000 |

职业专属特质槽（主角）维持金+魂独立小表（无颜色归属不吃石）。升阶同名卡 5/10/25 不变。

### 8.3 武器淬炼（WEAPON-FORGE-DESIGN F2，已接线）

- 存档 `weaponTempering: Record<weaponId, level>`（0~20）；消耗 = 对应稀有度钢锭 ×ceil(next/2) + 黄金 200×next（Doomed 系改符卷 1/级）。
- 稀有度解析统一走 `weaponCatalog.anyWeaponById`（首批 w_* 按解锁档推导 / 718 目录 gw_* 用 weapons.json 原文）。
- 战斗接线：主角快照带 `temperingLevel`（引擎 tempering 来源按级 +N）+ 每 2 级 +1 按 攻/甲/血/魔 轮转进面板。
- 熔炉锻造（soulforge 配方→gw_ 武器入包）与锻造所页面归 K 窗口衔接（网关 API 已就绪）。

### 8.4 每周活动（六类型常驻 · 主题按周轮换 · 六独立页面）

- 常驻：六活动始终可进入、可出战、各自拥有独立周实例；周一 0 点统一重置积分/代币/商店限量/里程碑。主题参数（入侵/阵营突袭的目标王国、世界事件加成种族）仍由 `fnv1a32(weekStart)` 确定性派生。
- 页面：`#events/<typeId>` 六页独立路由 + 页签互切 + `#events` 回退轮值页；非轮值页=预告态（N 周后开启、无出战/商店）；每页=横幅+规则卡（默认收起）+专属状态区+里程碑轨+商店。

| 轮 | 活动 | 玩法机制（状态键） | 里程碑素材侧重 |
|---|---|---|---|
| 1 | 入侵周 | 防线波次：3 条防线（等级 +0/+3/+6）逐条推进；破全线=守土成功（荣耀40+宝石20+符文石×4）后重整；败退回第 1 条（invLine/invRepelled） | 特质石 |
| 2 | 突袭首领周 | 首领血池：血池≈8 场满伤害×1.15^tier、跨战斗持久（胜/败都计伤害）；见底=讨伐成功（荣耀 30+20×tier、史诗锭×2、tier3+ 传说锭）并刷新更强首领（bossTier/bossHp/bossMax/bossesSlain） | 钢锭 |
| 3 | 末日之塔 | 爬塔 run：一层一战（每 5 层首领、等级 +1/层封顶+19），队伍 HP/阵亡**跨层冻结**（runTeam）——减员继续、全灭或败北即收尾；按到达层数发符卷（层数/5）+荣耀（层数×2）；可主动放弃同口径结算（floor/floorBest/runActive） | 符卷/圣辉石 |
| 4 | 阵营突袭 | 阵营克制：编入目标王国部队每 1 名全队攻击+2/生命+10（可叠加，出战请求期注入）（assaultWins） | 钢锭+特质石 |
| 5 | 世界事件 | 收集玩法：胜场掉 2~4 物资、加成种族每 1 名 +2；**里程碑按物资结算**（15/40/80/130/200/300）（supplies） | 钱/钥/宝石 |
| 6 | 职业试炼 | 连胜试炼：连胜 1/2/3/≥4 场积分 ×1.0/×1.3/×1.6/×2.0（试炼分上限 240），败场清零；主角强制编入、职业经验 ×2（trialStreak） | 荣耀+特质石 |

- 积分：胜场 = Σ(稀有度档+1)×10 + Σ(敌人等级)，封顶 120（试炼乘后 240）；**里程碑进度按类型取值**（世界事件=物资，其余=积分），达标自动入账（结算行 event-milestone）。
- 活动代币：胜场 `max(3, points/10)`（3~12/场），跨周作废；商店每类型 4~5 件（基础不限量、高档周限 1~4），购买走 `gateway.buyEventGoods`（SOLD_OUT 错误码）。
- 战斗吃养成（主角/旗帜/王国加成全生效）——与竞技场 draft「不吃养成」分工对齐官方 Arena vs Live Event。
- 探索掉落（公会任务渠道的单机映射）：探索胜利 30% 掉钢锭（档随王国基数 10/20/30/40 分档）+ 25% 掉初级特质石（敌方队首主色）。

### 8.5 入侵 PvP（官方排位的单机适配，世界观名沿用「入侵」）

- **官阶=联赛 10 级**：青铜→白银→黄金→白金→翡翠→蓝宝石→紫水晶→黄玉→红宝石→钻石（官方 30 人小组、每周 VP 排名）。
- **晋级/降级区（官方名次表）**：晋级=青铜前20/白银前15/黄金前10/白金~紫水晶前7/黄玉前5/红宝石前3；降级=白银末5/黄金末6/白金~钻石末7；青铜是底；**0 场跨周不降不发**。
- **首次定级**（主角等级映射官方 Path 段）：1-20→青铜 / 21-40→白银 / 41-60→黄金 / 61-80→白金 / 81+→翡翠。
- **镜像对手**：29 个/组，`fnv1a32(weekStart:league)` 种子化（同周同刻必复现同一榜单）；`InvasionMirror{id,name,rating,vp,frenzy,defense}` **= 未来 D1 一行真人玩家数据**（id 换玩家 id、vp 服务端同步，屏层结算零返工）；血怒=终值 VP 最高 2 人（战胜 VP×2）；每日候选=VP 最近 8 人按日轮换取 5。
- **VP 计分（官方数值表）**：基础分按对手平均等级段 10/20/30/40/50，区间夹紧 5/25、10/45、15/60、20/75、25/90；加分每类取最高：速胜 ≤10/+2 ≤8/+4 ≤6/+6 ≤4/+9 ≤2/+12、存活 2/3/4 人→+3/+5/+10、额外回合 2/4/6/8 次→+1/+2/+3/+4；**4/5 消加分与一击必杀暂不可得**（eventSummary 只有类型计数，开放问题 G5）。
- **荣耀**：胜 +10、宿敌（当前榜单前 5）+5、每日入侵首胜 +15；败 VP−5（不透支）。
- **周结（lazy，进入/出战斗时触发）**：按最终 VP 对 29 镜像终值排名 → 晋级（荣耀150+宝石100+钢锭/符卷/符文石材料包）/ 守级（75+30）/ 降级（25）；VP 清零、seed 重掷。
- 解锁：主角 10 级（地图 rail 锁标）。

### 8.6 页面与网关（D1 预留口径）

- 新端点（签名即契约）：`temperWeapon` / `planEventBattle` / `buyEventGoods` / `abandonTowerRun` / `planInvasionBattle` / `settleInvasionBattle` / `openChest('glory')`；读模型（活动页/入侵榜/材料库）全部纯函数，屏层直算。
- 结算屏：素材行（钢锭/符卷/特质石中文名）+ 活动玩法推进行（防线/血池/塔层/物资）+「回到活动页」直达。

### 8.7 文件地图

| 层 | 文件 |
|---|---|
| 数据 | `data/materials.ts`（词表/显示名）、`data/events.ts`（轮换/里程碑/商店/主题）、`data/economy.ts`（INVASION*/GLORY_CHEST/EXPLORE_DROPS/特质消耗）、`data/hash.ts`（fnv1a32） |
| 系统 | `systems/events.ts`（活动状态机/商店/页面读模型）、`systems/invasion.ts`（镜像/赛季/VP/结算）、`systems/forgeOps.ts`（淬炼集成）、`systems/settlement.ts`（事件分支/探索掉落）、`systems/wallet.ts`（素材账本） |
| 屏 | `screens/eventsScreen.ts`（六页）、`screens/invasionScreen.ts`、`screens/chestsScreen.ts`（荣耀箱）、`shell/gameMain.ts`（材料库弹层）、`shell/styles/live.css` |
| 测试 | `tests/unit/metaEvents.test.ts`（23 例）、`metaInvasion.test.ts`（14 例）、`metaForgeOps.test.ts`（5 例）、`tests/e2e/metaLiveScreens.spec.ts` |

## 9. 任务书 · 王国主线战斗界面（M10 · 已落地）

> 背景：地图弹层（kingdom sheet）的「任务/探索」按钮当前**直接开战**（enterQuest/enterExplore →
> launchQuest/launchExplore），没有任务链可视化：玩家看不到 8 关结构、敌人阵容、奖励位置与探索档位。
> 本节契约已于 2026-09-19 落地；以下内容保留为视觉回归与后续维护依据。

### 9.1 目标与路由

- 新增 `#quest/<kingdom>` 页（kingdom = troops.json 中文王国名，hash 直拼）：
  王国主线任务链 + 探索模式的**出战中枢**。
- 地图弹层两入口改路由：`enterQuest`/`enterExplore` → `ctx.navigate('#quest/' + kingdom)`
  （锁定/未通关的 toast 提示保留在弹层）；`gameMain` 注册 screen + PAGE_TITLES；`ScreenName` 增 'quest'。

### 9.2 页面结构（线框）

```
┌ 页头：王国名(EN) + 纹章/立绘 + 任务进度 n/8 + [返回地图]
├ 任务链轨道：8 关横向节点卡
│   每关：编号 · 敌人等级 · 队伍规模 · 阵容预览（部队名×size）
│         · 状态（✓ 已通关 / ▶ 当前可战 / 🔒 未解锁）
│         · 第 4/8 关标「部队奖励：XXX」
│   当前关高亮 + 「出战」主按钮（launchQuest(kingdom, node)）
├ 探索模式（8/8 通关解锁）：
│   档位 1~5 选择器（setKingdomExploreTier 即时持久化）
│   + 当前档敌人等级/队伍规模 + 每日首胜双倍说明 + 「出战」（launchExplore(kingdom)）
└ 未通关时探索区置灰，显示解锁条件（任务链 8/8）
```

### 9.3 读模型（全部现有纯函数，零新逻辑）

| 用途 | 函数 |
|---|---|
| 关卡状态 | `questNodeUnlocked` / `nextQuestNode` / `kingdomNodeState`（questsDone、解锁门槛） |
| 关卡参数 | `QUEST_TEAM_SIZES` / `questEnemyLevel`（=王国基数+node-1） |
| 阵容预览 | `planQuestEncounter(kingdom, node, seed)`，**预览 seed = fnv1a32(`quest-${kingdom}-${node}`)**——同参可复现，与实战 seed（网关熵源）无关 |
| 奖励标记 | `kingdomQuestRewardTroop(kingdom, 4\|8)` |
| 探索 | `exploreUnlocked` / `exploreEnemyLevel` / `EXPLORE_TEAM_SIZES` / 存档 `kingdoms[k].exploreTier` |

### 9.4 写路径（现有网关，零新方法）

`planQuestBattle` / `planExploreBattle` / `setKingdomExploreTier` / `launchQuest` / `launchExplore`——
出战→结算→任务推进/首胜/探索掉落全部走既有闭环。

### 9.5 验收标准

1. 8 关状态（已通关/当前/未解锁）与 `questsDone` 严格一致，只能打下一关；
2. 阵容预览同参可复现（单测锁 preview seed）；
3. 第 4/8 关奖励部队名正确显示；
4. 探索档位切换即持久化，出战难度随档位变化；
5. 出战走既有结算闭环（任务推进/每日首胜/探索掉落明细进结算屏）；
6. 直链访问未解锁王国显示锁态不崩溃。

### 9.6 归属与规模

J（`src/meta/**`）；新 1 屏 + mapScreen 两处入口改动，系统层零改动；已落地，后续仅做截图与视觉回归。

