# 每周活动（素材产出）+ 入侵 PvP · 机制设计与考据

> 2026-09-19。考据来源见文末；除注明「官方原文/官方口径」外数值均为**本项目设计值**
> （与 WEAPON-FORGE-DESIGN.md 同一口径：结构对齐官方，数字自定、单源可调）。

## 0. 要解决的问题

1. 武器淬炼（钢锭/熔铸符卷）与部队特质解锁的材料在 meta 层**没有库存、没有产出**：
   `systems/forge.ts`（K 窗口 F1）的淬炼逻辑已经按「对应稀有度钢锭 + 黄金（Doomed 系耗符卷）」计价，
   但存档没有这些字段，游戏里也没有任何渠道能获得它们。
2. 特质解锁当前是裁定②的简化口径（黄金+灵魂+同名卡），没有官方的**特质石**体系。
3. 地图侧栏的「入侵」（PvP）与「世界事件」（限时活动）两个入口是占位。

## 1. 官方考据结论

### 1.1 素材三族（官方词表）

| 素材 | 官方规则 | 我们的对应 |
|---|---|---|
| **钢锭 Ingots** | 武器淬炼材料（玩家 3 级解锁淬炼），按武器稀有度分档；官方可见 Common/Rare/Ultra-Rare/Epic/Legendary（+Mythic 系）；低档向高档的转换是社区**未兑现**的功能请求（论坛 Ingot Conversion 帖在 Feature Requests 版） | `materials.ingots` 六档库存；不引入跨档转换（记录差异） |
| **熔铸符卷 Forge Scrolls** | Doomed/Cursebreaker 武器淬炼专用；与 Raid Boss（Headstart 含 Orb of Forging + Forge Scrolls）/Tower of Doom 强相关 | `materials.forgeScrolls` 单计数（沿用 forge.ts F1 口径） |
| **特质石 Traitstones** | 六元素色（蓝水/绿自然/红火/黄风/紫魔法/棕土）× Minor/Major/Runic 三档 + Arcane（双色混血 21 种）+ Celestial（彩虹）；产出=宝箱、PvP、小游戏、王国任务/挑战、探索（按王国颜色）、灵魂熔炉合成、**荣耀商店**、每周活动（Raid Boss/Invasion 等） | 本作引入 Minor/Major/Runic×6 色 + Celestial 万能石（19 种）；官方 Arcane 档（双色 21 种）不引入，高档消耗由 Celestial 承接（记录差异） |

### 1.2 每周活动轮换（官方结构）

- 活动周历：每周一个主题 Live Event，2023 新日历后**周一起算 7 天**（旧口径周三→下周二）。
- 类型池（官方活动名）：**Invasion（入侵）、Raid Boss（突袭首领）、Tower of Doom（末日之塔）、
  Faction Assault（阵营突袭/delve）、World Event（世界事件）、Journey（旅程）**；
  4.8 改版（2020-03）后 Invasion 缩为周末 3 天、约 5-6 周一次，ToD/Raid Boss 月度轮换。
- 奖励结构：**积分轨里程碑**（战斗胜利得分→阶梯奖励）+ **活动商店**（活动币购买特质石包/钢锭等，
  高档货限量）；现代版另有限量 Sigils（体力）——本作**不引入体力**（单机友好，记录差异）。
- 素材对应（官方支持文档原文锚点）：
  - Faction Assault 奖励含 **Chaos Shards、Ingots、Orbs**；
  - 特质石「可在 Raid Boss、Invasion 等 Live Events 中赢得/用宝石购买」；
  - 公会任务给特质石+钢锭（Runic Earth Traitstones / Epic Ingots 级别）——本作无公会，
    该渠道映射到**探索掉落**与**荣耀箱**。

### 1.3 PvP =「入侵」（官方口径，本作的世界观包装）

官方排位 PvP 打的就是**其他玩家防守队的 AI 镜像**；本作沿用「入侵」作为玩法名。

- **联赛 10 级（官阶）**：Bronze→Silver→Gold→Platinum→Emerald→Sapphire→Amethyst→Topaz→Ruby→Diamond。
- **分组 30 人**（你+29 名玩家），按每周 **VP（Victory Points）** 排名；
  每周重置后 VP 归零重打，按最终名次**晋级/降级**：
  晋级区=青铜前 20 / 白银前 15 / 黄金前 10 / 白金~紫水晶前 7 / 黄玉前 5 / 红宝石前 3；
  降级区=白银末 5 / 黄金末 6 / 白金~钻石末 7；青铜是底、不打不满周不降。
- **首次定级**按官方 Path 等级段：1-100→青铜、101-250→白银、251-500→黄金、501-1000→白金、1001+→翡翠。
- **VP 计分（官方数值表）**：基础 VP 按对手等级段 10/20/30/40/50，区间下限/上限
  5/25、10/45、15/60、20/75、25/90（对手等级越高越多）；加分项**每类取最高**：
  4 消+2 / 5 消+3 / 6 消+4 / 7 消+5 / 8 消+6；额外回合 2/4/6/8 次→+1/+2/+3/+4；
  速胜 ≤10/+2 ≤8/+4 ≤6/+6 ≤4/+9 ≤2/+12 回合；终局存活 2/3/4 人→+3/+5/+10；
  一击必杀+3（每场一次）。血怒区对手强化、VP×2。
- **荣耀 Glory**：主产自排位 PvP（也来自进贡/冒险板/寻宝/宝箱）；**20 荣耀=1 荣耀箱**；
  复仇战+2、宿敌战+3；每周荣耀礼包给 Arcane+Minor 特质石；荣耀商店可直接买特质石。

## 2. 本作设计（全部设计值，单源 `data/economy.ts` + `data/events.ts`）

### 2.1 素材库存（save v2 加性字段，version 不动）

```ts
materials: {
  ingots: { common, rare, ultraRare, epic, legendary, mythic };  // 钢锭（按武器稀有度档）
  forgeScrolls: number;                                          // 熔铸符卷（Doomed 系淬炼）
  traitstones: Record<string, number>;                           // 'minor:fire' | 'major:water' | 'runic:earth' | 'celestial'
}
weaponTempering: Record<weaponId, level>                         // 淬炼等级（WEAPON-FORGE-DESIGN §1 的 F2 接线）
```

- 特质石键 = `{tier}:{color}`，tier ∈ minor/major/runic；color 用六色小写英文键（fire/water/nature/wind/magic/earth，
  对齐 BaseColor）；`celestial` 无色万能。词表/键格式/显示名单源 `data/materials.ts`。
- 荣耀升格为第五货币：`currencies.glory`（CurrencyKey 加 'glory'）。

### 2.2 特质解锁改官方口径（**裁定②修订**）

- 槽 1：minor×8（本卡主色）+ 黄金 2,000
- 槽 2：minor×12 + major×6 + runic×2（主色）+ 黄金 5,000
- 槽 3：major×10 + runic×4（主色）+ celestial×2 + 黄金 12,000
- **同名卡不再消耗**（官方特质线只吃特质石；同名卡竞争保留在升阶线 5/10/25）。
- 主色 = `troop.manaColors[0]`（数据兜底棕）。黄金保留作钳制（防特质石通胀直通）。

### 2.3 淬炼接线（WEAPON-FORGE-DESIGN F2）

- `gateway.temperWeapon(weaponId)`：forge.temperWeapon 校验 → wallet 扣（钢锭/符卷/黄金，原子）→ 写回。
- meta 首批 20 把武器补 `rarity` 字段（通用 4 把=Common/Rare，职业 10 级=UltraRare，20 级=Epic；
  718 目录武器稀有度取 weapons.json，K 窗口目录导入 meta 后自动互通）。
- 桥接：主角快照带 `temperingLevel`（引擎 `Character.temperingLevel` 已就绪），
  面板加成 = 每 2 级 +1 按 攻/甲/血/魔 轮转（`floor(level/2)` 分配，FORGE-DESIGN §2 口径）。
- 熔炉锻造（Soulforge craft）**本批不接**：配方武器属 718 目录，目录导入 meta 解锁体系是 K 窗口
  的既有界碑（soulforge.ts 头注），不越界。

### 2.4 每周活动（`data/events.ts` + `systems/events.ts`）

- **6 周大轮换**，`weekIndex = floor(weekStart / WEEK) % 6`；活动实例 seed = fnv1a(weekStart)（确定性）：

| 轮 | 活动名 | 战斗主题 | 里程碑素材侧重（对齐 §1.2 官方对应） |
|---|---|---|---|
| 1 | 入侵周 Invasion | 指定「入侵势力」王国部队，等级随积分递增 | 特质石包（minor/major 为主） |
| 2 | 突袭首领 Raid Boss | 首领压阵的高难队 | 钢锭（大）+ 符卷（小） |
| 3 | 末日之塔 Tower of Doom | 楼层=本周胜场数，等级递增 | 符卷（大）+ runic/celestial |
| 4 | 阵营突袭 Faction Assault | 指定王国混编队 | 钢锭 + major |
| 5 | 世界事件 World Event | 全图随机王国 | 金/魂/钥匙 + 少量全素材 |
| 6 | 职业试炼 Class Trials | **主角必须编入**，职业经验×2 | 荣耀 + minor/major |

- 积分：胜利 = Σ(稀有度档+1)×10 + Σ(等级)，单场封顶 120（防无脑刷）；战败 0 分不计次。
- **活动代币**（2026-09-19 追补，官方活动币商店的单机适配）：每场胜局
  `tokens = max(3, floor(points/10))`（30~120 分 → 3~12 币），跨周作废。
- 里程碑（6 档）：100/300/600/1000/1500/2200 分，达标**自动入账**（结算行可解释，无领取 UI）。
- **活动商店**（活动屏货架区，`data/events.ts` 的 `EVENT_SHOP` 单源）：按活动类型各 4~5 件商品——
  基础包（minor 石/低档钢锭/钱）不限量，高档货（圣辉石/传说钢锭/符卷等）周限量 1~4 件；
  周限量按存档 `eventWeek.bought` 计数、跨周随活动实例重置；购买走 `gateway.buyEventGoods`
  （代币原子扣账，错误码含 SOLD_OUT）。
- 出敌复用 `pickEnemies`；请求走 `buildBattleRequest`（source kind 'event'，带旗帜/主角/王国加成——活动吃养成，
  与竞技场 draft 的「不吃加成」形成对照，对齐官方活动语义）。
- **材料库面板**（同批追补）：顶栏背包按钮全局弹层，钢锭七档/符卷/特质石（3 档×6 色+圣辉石）
  全库存一览，附来源/去向提示。

### 2.4.1 六种活动的独立玩法（玩法差异化批，2026-09-19）

六类活动各有独立玩法机制与独立页面（路由 `#events/<typeId>`；`#events` 回退本周轮值；
非轮值页为预告态）。玩法状态存 `eventWeek.eventData`（键约定 `EVENT_STATE_KEYS`）+ `eventWeek.runTeam`：

| 活动 | 核心机制 | 状态 |
|---|---|---|
| 入侵周 | **防线波次**：3 条防线逐条推进（等级 +0/+3/+6），破全线=守土成功（荣耀 40+宝石 20+符文石×4）后重整；败退回第 1 条 | invLine / invRepelled |
| 突袭首领 | **首领血池**：血池≈8 场满伤害×1.15^tier，跨战斗持久、胜败都计伤害；见底=讨伐成功（荣耀 30+20×tier、史诗锭×2、tier3+ 传说锭）并刷新更强首领 | bossTier / bossHp / bossMax / bossesSlain |
| 末日之塔 | **爬塔 run**：一层一战（每 5 层首领把守、等级 +1/层封顶 +19），队伍 HP/阵亡跨层冻结延续——减员继续、全灭或败北即结束；按到达层数结算（符卷=层数/5、荣耀=层数×2），历史最高层单独记录 | floor / floorBest / runActive / runTeam |
| 阵营突袭 | **阵营克制**：编入目标王国的部队每 1 名全队攻击 +2/生命 +10（可叠加，出战请求期注入） | assaultWins |
| 世界事件 | **收集玩法**：里程碑按累计「事件物资」结算（不再按积分）；胜场掉 2~4 件，加成种族（周种子轮换）每 1 名 +2 | supplies |
| 职业试炼 | **连胜试炼**：连胜 1/2/3/≥4 场积分 ×1.0/×1.3/×1.6/×2.0，败场清零；主角强制编入、职业经验 ×2 | trialStreak |

页面组织：单一路由族 + 每活动独立页面（页签互切、轮值高亮、预告页带倒计时）；
每页 = 横幅（出战按钮按类型命名：迎击/讨伐/攀爬/进攻/参战/出战）+ 玩法规则卡 + 专属状态区
（防线图/血池条/塔层/物资收集/克制预览/连胜倍率）+ 里程碑轨 + 商店（仅轮值周）。
- **探索掉落**（公会任务渠道映射）：探索胜利 30% 掉 1 钢锭（档位随王国基数）、25% 掉 1 minor 石（敌方主色）。

### 2.5 入侵 PvP（`systems/invasion.ts`）

- **官阶=联赛 10 级**（青铜→…→钻石），30 人小组、周 VP 排名，晋级/降级区照抄官方名次表（§1.3）。
- **首次定级**按主角等级映射官方 Path 段（主角 100 封顶）：1-20→青铜 / 21-40→白银 / 41-60→黄金 / 61-80→白金 / 81+→翡翠。
- **对手镜像（D1 口子的核心形状）**：`InvasionMirror` = { id, name, rating, vp, frenzy, defense[] }
  —— 未来 D1 里就是一行真实玩家数据（id 换玩家 id、vp 由服务端同步）；本作 29 个由
  `fnv1a(weekStart, league)` 种子化生成：名字音节拼装、队伍强度围绕联赛带分布、
  VP 按「周进度 × 终值曲线」确定性推演（同周同刻必复现同一榜单）。
- **匹配**：从 29 人取 VP 最接近玩家的 5 人为当日候选（daySeed 轮转），血怒×2 标记 2 人。
- **战斗**：我方=当前预设队快照（主角/旗帜/王国加成全生效），敌方=镜像防守队快照
  （等级/特质过滤已实现 code），mode 'pvp'，请求过会话校验。
- **VP 结算**：官方基础分表（对手平均等级段）+ min/max 夹紧 + 加分项：
  速胜（turns）、存活数（combatants）、额外回合（eventSummary 'extra-turn' 计数），每类取最高；
  **4/5 消计数与一击必杀加分不可得**（BattleResult.eventSummary 只有类型计数，不含消除规模——
  已在开放问题登记，未来合同加性扩展后补）。血怒对手 VP×2。
- **荣耀**：胜 +10 基础，打榜单前 5「宿敌」+5，每日入侵首胜 +15；败 VP−5（≥0）无荣耀。
  荣耀箱（宝箱屏第三箱）：20 荣耀/开 → 特质石为主 + 概率同名卡/金钥匙/celestial（官方荣耀箱语义）。
- **周结**：lazy 触发（进入入侵屏/出战斗时），按最终 VP 对 29 人排名 → 晋级/守级/降级发奖
  （晋级=荣耀 150+宝石 100+材料包；守级=荣耀 75+宝石 30；降级=荣耀 25），VP 清零、seed 重掷。
- 解锁门槛：主角 10 级（地图 rail 显示锁）。

### 2.6 网关新方法（= 未来 D1 端点，签名即契约）

`temperWeapon(weaponId)` · `planEventBattle(now, weekStart)` · `planInvasionBattle(mirrorId, now, weekStart)` ·
`settleInvasionBattle(result, mirrorId, now, weekStart, todayStart)` · `openChest('glory', 1)`。
读模型（本周活动是什么/榜单/候选）= 纯函数，屏层直接算（网关只管写与熵源——既有口径）。

## 3. 与既有裁定的关系

- **裁定②修订**（本批）：特质解锁从「黄金+灵魂+同名卡」改为「特质石+黄金」，对齐官方素材体系；
  这是用户 2026-09-19 提出「升级特质的材料没有接入」的直接裁定，记录进 META-GAME-PLAN §9。
- 竞技场（裁定④）不动：draft 是公平卡组玩法，不吃养成；入侵 PvP 吃养成——两条 PvP 线分工对齐
  官方（Arena vs Ranked PvP）。
- D1 预留口径不变：网关方法=端点、读模型=纯函数、时钟调用方传入、网关只管写与熵源。

## 4. 里程碑

| 阶段 | 内容 | 状态 |
|---|---|---|
| G1 | materials/schema/wallet/特质石口径/淬炼接线（§2.1-2.3） | 本批 |
| G2 | 每周活动系统 + 活动屏 + 探索掉落（§2.4） | 本批 |
| G3 | 入侵 PvP 系统 + 入侵屏 + 荣耀箱（§2.5） | 本批 |
| G4 | 熔炉锻造接目录武器（依赖 K 窗口目录导入 meta） | 延后 |
| G5 | VP 4/5 消加分（依赖合同 eventSummary 扩展） | 延后 |

## 5. 来源

- 官方支持 · PvP Leaderboards & Scoring（联赛/VP/升降级/加分表）：
  https://infinityplus2.freshdesk.com/support/solutions/articles/150000208175-pvp-leaderboards-scoring
- 官方支持 · PvP Regions（赛区/血怒）：…/150000208174 · 官方支持 · Gold, Gems, Souls and Glory（荣耀/荣耀箱）：
  …/150000208295 · 官方支持 · Event Headstarts（活动类型与符卷）：…/150000208176
- GoW Wiki · Traitstones（特质石词表/产出）：https://gems-of-war.fandom.com/wiki/Traitstones
  · Weekly Events（周历）：…/wiki/Weekly_Events · PvP（VP 拆解）：…/wiki/PvP
- 官方论坛 · Ingot Conversion（钢锭转换=未兑现请求）：community.gemsofwar.com · 4.8 Update（Invasion 改周末）：
  gemsofwar.com · TrueTrophies Gems of War（淬炼 3 级解锁/初始消耗 3 Rare+3 UR Ingots）
- 项目内既有考据：design/WEAPON-FORGE-DESIGN.md（淬炼/熔炉）、TASK-META.md §7（宝箱/进贡）
