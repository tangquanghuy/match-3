# 三窗口并行工作边界（先读我）

> 2026-09-14 起生效。三个窗口同时改这个仓库，靠本文档划界：
> **每个窗口只改自己名下的文件；共享文件动之前必须在文末台账登记。**
> 开新窗口时把本文件路径发给它：`PARALLEL-WORK.md`（仓库根目录）。

## 各窗口任务书（新窗口从这里开始）

| 窗口 | 任务书 | 一句话目标 |
|---|---|---|
| A · 被动特质（当前窗口） | 本文 + `.kiro/specs/combat-mechanics/DECISIONS.md` | 补齐 566 个未实现特质 code 中已裁定的部分 |
| B · 技能批量配置 | **`TASK-SKILLS.md`** | 技能编译管线 + 五机制，第一波 ~990 条技能生效 |
| C · 特殊宝石 | **`TASK-GEMS.md`** | 按 GEMS-SEMANTICS.md 实现八颗宝石的棋盘行为 |

## 分工与文件所有权（硬边界）

### 窗口 A · 被动特质（当前窗口）
| 范围 | 文件 |
|---|---|
| 生成器与数据 | `scripts/build_traits.mjs`、`src/data/traits.json`（重生成产物，勿手改） |
| 引擎 | `src/engine/traits.ts`（编译 + 触发钩子）、`src/engine/types.ts` 中的 `PassiveModifiers`/`StatGains`/`TraitDefinition` 区段 |
| 战斗接入 | `CombatResolver.ts` 的特质触发点、`TurnEngine.ts` 的特质钩子调用（见台账） |
| 测试 | `tests/unit/traits.test.ts`、新增一律 `tests/unit/trait*` |

### 窗口 B · 技能编译与批量配置
| 范围 | 文件 |
|---|---|
| 技能域全部 | `src/engine/skills/**`（library / builders / scaling / targeting / prototypes / choosers / effects） |
| 生成器与数据 | 新增 `scripts/build_spells.mjs`、`src/data/spells.json`；`library.ts` 改为消费端 |
| 测试 | 既有 `tests/unit/skill*`、`builders*`、`scaling*`、`targeting*`、`castSkill*`，新增一律 `tests/unit/spell*` |
| 说明 | 「决定做」五机制（二次缩放/概率子句/敌方削弱/死亡条件/种族翻倍）的执行都应收敛在 effects 原语内，**不要为它们动 TurnEngine**——效果段经 `EffectPrimitive.apply` 自包含执行 |

### 窗口 C · 特殊宝石
| 范围 | 文件 |
|---|---|
| 类型 | `src/engine/types.ts` 中的 `GemType`/`SpecialGemSpec` 区段（注意：与 A 同文件不同区段，见下） |
| 棋盘行为 | `BoardModel.ts`、`MatchResolver.ts`、`GravitySystem.ts`、`boardUtils.ts`、`boardGen.ts` |
| 表现层 | `src/render/gemTextures.ts`、`GemSprite.ts`、`src/assets/**` |
| 测试 | 既有 `tests/unit/GravitySystem*`、`MatchResolver*`，新增一律 `tests/unit/gem*` |
| 语义依据 | `.kiro/specs/combat-mechanics/GEMS-SEMANTICS.md`（已核对官方，按它实现） |

## 共享文件（NO-TOUCH 清单，动前必须登记台账）

| 文件 | A 需要它 | B 需要它 | C 需要它 |
|---|---|---|---|
| `TurnEngine.ts` | 阵亡召唤钩子（下一批） | 一般不需要（见上） | 末日骷髅匹配爆炸的结算位置 |
| `events.ts` | 少量 | 新效果段尽量复用既有事件 | 宝石爆炸/触发事件 |
| `CombatResolver.ts` | 受击附状态（✅ 本批已改） | 一般不需要 | 末日骷髅 +5 伤害与爆炸 |
| `data/troops.json` | ❌ 只读 | build_troops 重生成唯一入口 | ❌ 只读 |
| `src/engine/skills/effects/status.ts` | 已由 A 完成 web 语义 | 施加状态走既有接口 | ❌ |
| `package.json` / 构建配置 | ❌ | ❌ | ❌ |

**协议**：
1. 需要改共享文件时，先在文末台账登记（窗口、文件、动机、期望的签名/事件形态），登记在先者先改，后改者 rebase 后适配。
2. 能用「只读调用 + 自己域内实现」解决的就别动共享文件（例：B 的新效果段全部走 `EffectPrimitive.apply` 自包含）。
3. `types.ts` A 与 C 同文件不同区段：A 只碰 `PassiveModifiers`/`StatGains`，C 只碰 `GemType`/`SpecialGemSpec`，编辑前重读文件、避免整文件覆盖。

## 每窗口的验证门槛

```bash
npm run lint          # 必须零 error
npm test -- --run     # 全量（约 2 秒，396+ 用例），必须全绿
npm run build         # 必须通过
```
全量测试是共享的回归护栏：**任何窗口跑挂了全量，先修自己的**，不许跳过或注释既有用例。

## Git 建议（强烈推荐照做）

当前工作区改动全部未提交（历史上只有两个提交）。同目录三窗口并发等于互相踩，建议：

```bash
# 1. 基线提交（需要你确认；我按规矩没有擅自 commit，说一声我来跑）
git add -A && git commit -m "chore: 并行开发基线（web 语义对齐 + 缺口统计 + 决策记录）"

# 2. 另两个窗口各自用独立目录（worktree），互不干扰：
git worktree add ../match-3-skills -b skills-compiler
git worktree add ../match-3-gems -b special-gems
```

- 窗口 A（特质）留在当前目录的 main 上工作。
- 合并顺序：**A 特质 → B 技能 → C 宝石**（引擎钩子最深的先合；后合的先 `git rebase main` 再合并）。B、C 之间文件边界不相交，顺序可对调。
- 若不建 worktree 而是三个窗口同目录硬并发：可行性取决于三方都严守本文件边界，风险自担。

## 冲突高发点（特别注意）

1. **`CombatResolver.ts`**：A 本批刚改（受击附状态）；C 的末日骷髅也要动它——C 开工前先看台账与最新代码。
2. **`TurnEngine.ts`**：A 的阵亡召唤（下一批）、C 的宝石爆炸结算都会进来。
3. **`data/troops.json`**：只有 B 的 `build_troops.mjs` 可重生成；A/C 只读。C 做宝石表现需要素材命名约定，与 B 的技能文本无关。
4. **测试文件名前缀**（trait* / spell* / gem*）是防止新测试撞名的约定，新文件请遵守。

---

## 共享文件改动台账（动共享文件前在此登记）

| 日期 | 窗口 | 文件 | 动机与形态 | 状态 |
|---|---|---|---|---|
| 09-14 | A | `CombatResolver.ts` | 受击附状态：目标带 `inflictOnSkullDamaged` 时给攻击者施加状态，挂在受击增益之后、反弹之前 | ✅ 已落 |
| 09-14 | A | `status.ts` / `context.ts` / `buff.ts` / `traits.ts` | 织网语义实现（WEB_STATUS_ID、casterMagic 归零、增益拦截） | ✅ 已落 |
| 09-14 | C | `src/engine/types.ts`（GemType 区段） | **给窗口 B 的接口对齐点**：`SpecialGemSpec = { kind: 'doomSkull' \| 'uberDoomSkull' \| 'bomb' \| 'web' \| 'lightningRow' \| 'lightningCol' \| 'wildcard' \| 'wish' \| 'hourglass' \| 'ghost'; tier?: number }`，`tier` 仅通配用（2/4 倍率）。构造器 `specialGem(kind, tier?)`；常量 `DOOMSKULL_BONUS_DAMAGE = 5`、`UBER_DOOMSKULL_BONUS_DAMAGE = 10`（至尊=官方更强变体，仅特定兵种/武器生成）、`WEB_GEM_TURNS = 3`；`ghost` 素材先行、无行为（灵魂=战斗外货币，语义待裁定）。`isSameMatchType`：末日族↔骷髅、web↔紫、沙漏/闪电黄↔黄、闪电蓝↔蓝、炸弹/许愿/幽魂不可匹配、通配↔任意色（transform/color 清除目标会把通配计入同色，B 侧知悉）。骷髅组 settle 已改为 `{ kind:'skull', bonusDamage }`（末日族加伤合计）。素材：`src/assets/gems/special/*.png` 11 张 256×256（`scripts/split_special_gems.mjs` 可重切） | ✅ 已落 |
| 09-14 | C | `TurnEngine.ts` | 特殊宝石两路触发：匹配路径（末日骷髅 +5 并引爆一圈、闪电清行列、织网随机敌人 applyStatus(web)、沙漏额外回合）挂在 runCascades 组结算后；摧毁路径（炸弹/闪电/许愿连锁，含炸弹连环）挂在 resolveBoardChange 开头（新增私有 expandSpecialDestruction，FIFO 队列确定性） | ✅ 已落 |
| 09-14 | C | `events.ts` | 新增 `special-gem-trigger` 事件（kind/pos，闪电带 line，许愿带 wish 载荷）；链上清除复用既有 gem-explode/gem-destroy，不新增清除事件类型 | ✅ 已落 |
| 09-14 | C | `CombatResolver.ts` | `resolveSkullDamage` 增加第 5 个可选参 `bonusDamage`（末日骷髅匹配 +5：计入攻击方倍率之后、目标减伤之前）。既有调用不传即行为不变 | ✅ 已落 |
| 09-14 | C | `skills/effects/context.ts` + `gems.ts`（仅 clear 管线） | `DestroyedGem` 增加可选 `pos: CellPos`，doClear 填充位置——炸弹/闪电/许愿的"被摧毁时"效果需要知道宝石在哪。其余 skills 域未动，createGems 支持特殊宝石留给窗口 B（引用台账里的 spec 形态） | ✅ 已落 |
| 09-14 | C | `render/SkillTestPage.ts` + `render/App.ts`（调试钩子区 + init 调用点） | 测试控制台新增「特殊宝石」区：11 种单投/全部种类各一颗/清除，经新增 `App.debugSetGems()`（就地改类型 + gem-transform 演出管线，仅 AwaitingInput 受理）。**顺修独立模式启动阻塞**（A 的会话层在途问题）：App.init 调 `loadStandaloneRequest` 只传了 knownSkillIds，validateRequest 拿空集合把所有 troopTypes/traitIds 判未知 → 整页初始化失败；已在调用点补 `knownTraitIds`（TRAIT_LIBRARY codes）与 `knownTroopTypes`（与 build_traits.mjs `TROOP_TYPE_MAP` 值集合同源）。A 如有更正式的白名单来源可替换 | ✅ 已落 |
| 09-14 | C | `render/EventStreamPlayer.ts` + `render/SkillTestPage.ts` + `App.getBaseSize()` | 人工反馈三项：① 连续 gem-explode/gem-destroy 事件合并为一批同时引爆（末日环+至尊环+炸弹连环一次轰，照 group-attack 批次模式，special-gem-trigger 零时长元事件不打断批）——修"至尊爆炸一颗颗慢慢爆"；② 测试台布局：游戏区锁基准宽 + 高度 72vh（此前高度被内容撑死、scale 封在 1.0 以下，棋盘被挤小）；③ 切图脚本软边像素做白色 unmix + 阈值收紧，消除深色宝石白晕 | ✅ 已落 |
| 09-14 | C | `render/clearEventBatches.ts`(新) + `render/EventStreamPlayer.ts` | **修人工反馈回归**：批次聚合初版把批首下标也写进了 members 集合，appendSegment 开头的 early-return 连批首一起跳过 → 整段爆炸动画/移除不播，贴图残留并与重力新宝石重叠。已抽出纯逻辑模块 clearEventBatches.ts（无 DOM 依赖）并在 `tests/unit/gemClearBatch.test.ts` 锁死"批首不在 members"等 5 条不变量；EventStreamPlayer 改为消费该模块。另：无头页签 rAF 挂起时 gsap 时钟冻结、seek 默认抑制回调，动画簿记无法在该环境做终态验证——人工请在**前台**浏览器验收 | ✅ 已落 |
| 09-14 | C | `render/App.ts`（baseCellSize 字段 + init 夹取）+ `render/SkillTestPage.ts` | **再修"棋盘过小"**：此前 550×372 是手机横屏紧凑基准（格 40px），transform 缩放再大也有限且会糊。App.init 的 cellSize 改为可配置（`baseCellSize` 字段，夹取 [40,96]，默认 40 主游戏零变化）；测试台 init 前按视口高宽自适应设置（~71-88px），棋盘原生渲染约 986×652 | ✅ 已落 |
| 09-14 | A | `session/contract.ts` + `session/validateRequest.ts` + `session/assigner.ts`(新) + `session/standaloneRequest.ts` + `session/index.ts` | **AIRP 分拣引擎**：CombatantSnapshot 新增可选 `tier`（杂兵/精英/首领/领主/传奇，中英文别名均收）；`skillId`/`traitIds` 改为可选——tier 有效时允许省略，分拣按阶级+种族确定性自动编配（显式值永远优先，traitIds 空数组=明确不要）；新增校验码 `unknown-tier`。**向后兼容，B 的显式契约语义不变** | ✅ 已落 |
| 09-14 | A | `render/TeamView.ts`（卡面特质图标行）+ `render/traitBadges.ts`(新) + `render/App.ts`（init 在映射前调用分拣）+ `render/CharacterDetailPanel.ts`（特质从 traitIds 读 + 技能文本池兜底） | 卡面底部特质小图标（对齐 GoW，代码绘制按效果族派生，未实现 code 暗色占位）；详情面板不再依赖"按名字匹配兵种"（AIRP 角色没有 TroopData 也展示特质/技能文本） | ✅ 已落 |
| 09-15 | B | `status.ts` | 叠加层数（`applyStatus` 新增 `opts.stack` 参数）：**仅**带 stacks 的技能施加走 magnitude 累加合并（「N 层流血」= magnitude = N×每层值；同 id 再施加累加）；web 等非 stacks 路径维持现行 max 合并，挣脱判定与 casterMagic 拦截不受影响。另 `bleed` 施加默认每层 1 点（官方每回合 1 伤/层，此前 0 伤为保真缺口，builders DOT 默认值区分处理） | ✅ 已落 |
| （待登记） | | | | |
| 09-15 | A | `TurnEngine.ts`（rosterCharAtActionStart 快照 + processDeathTriggers/resolveDeathSummons/nextCharId/enqueueSummon 四个私有方法）+ `traits.ts`（summonOnDeath/AllyDeath/EnemyDeath 编译 + applyDeathSummons + setSummonTemplateResolver）+ `types.ts`（PassiveModifiers 三字段）+ `render/App.ts`（装配模板解析器） | **死亡召唤特质**：31→17 code 先行落地（召唤名可解析的；风暴系列查无兵种留未实现桶）。三字段经 resolvePassives 编译进 passive（同字段取概率最高）；TurnEngine 在 processDeathTriggers 统一扫 defeat 时结算——**未改 4 处 resolveDefeatEvents 调用点**，对 C 零干扰；阵亡者经行动开始的角色引用快照取回（resolveDefeatEvents 已 splice 移出编队）。召唤物跟随**持有者**所在方入队（summonOnEnemyDeath 进对方队），容量满进 FIFO 队列，与召唤技能同一语义。模板装配走 setSummonTemplateResolver（App 注入 troopToSummonTemplate），解析失败安全跳过 | ✅ 已落 |
| （待登记） | | | | |
| 09-15 | D | `src/engine/types.ts`（Team 区段）+ `src/engine/events.ts` | **风暴契约先行（阶段 1.2）**：Team 新增可选 `storm?: { color; turns; troopId }`（非 Character，不进 characters/summonQueue）；events 新增 `storm-change`（player/color:BaseColor\|null/reason:'set'\|'replaced'\|'expired'/prevColor?）。DeathSummonSpec 的 storm 变体字段由后续引擎批次在 types.ts 补充 | ✅ 已落 |
| 09-15 | D | `TurnEngine.ts`（resolveDeathSummons 风暴分支 + finishTurn 回合尾递减） | 风暴设置/顶替/到期：死亡召唤 spec 带风暴标记时不入队，改设持有方 team.storm（己方已有→replaced；对方有→也顶替，全场唯一，被顶方收 color=null 的 storm-change）；回合尾双方 storm.turns 递减归零发 expired。**官方 3.0 补丁说明查证：持续 8 回合（每方 4）** | ✅ 已落 |
| 09-15 | D | `GravitySystem.ts` | refill 颜色权重：读取双方 team.storm，对应色 ×`STORM_DROP_WEIGHT`（1.9，引擎常量）；无风暴时不进加权分支、随机序列与现状逐字节一致；specialSpawnChance/SPAWNABLE_SPECIALS 未动。加权后风暴色 27.5%（官方实测 27.1%） | ✅ 已落 |
| 09-15 | D | `render/EventStreamPlayer.ts` + `render/App.ts` | **风暴演出（阶段 2）**：stormChangePlan 纯函数 + set 弹入/色系 group_hit 爆发/召唤音效、replaced 旧淡出新弹入、expired 淡出；StormIndicator 挂 44px 通道双方队列上沿（CSS 脉冲零素材）。顺修 summon_rune.duration 硬编码（SUMMON_HOLD_SECONDS 查表）。**另修两处人工反馈回归**：① TURN HUD 星落横幅恢复自然纵横比+与棋盘同宽（此前被压成 44px 一短截且外溢 4.5%）；② refill 生成线下移至横幅底缘（turnBannerDipPx 注入），宝石从夜幕下方开始下落不再穿模 | ✅ 已落 |
| （待登记） | | | | |
| 09-16 | E（验收提交状态批；实现为前窗口在途改动） | `status.ts`/`ManaDistributor.ts`/`CombatResolver.ts`/`TurnEngine.ts`/`GravitySystem.ts`/`traits.ts`/`types.ts`/`events.ts`/`skills/effects/damage.ts`/`session/BattleSession.ts` + `scripts/build_traits.mjs`/`data/traits.json` | **特殊状态批·引擎+数据**：①疾病（获得法力减半）/诅咒（剥正面状态、解除概率减半、穿普通免疫留 Invulnerable）/死亡标记（10%/回合即死）/狂怒（骷髅 1.5x+无视受击方特质+攻击后过期）/魅惑（骷髅改打己方下一名存活）；自动解除从织网泛化为全状态 `recoveryChance` 累计（10%→+10%，诅咒基准与步长减半），web 语义不变（webStatus 用例未动仍绿）。②开局风暴 `battleStartStorm`（songoflight/darkness/bones/fire/ice 五 code）：TurnEngine 构造期按队伍/特质顺序走 setStormFromSummon（全场唯一顶替裁定），`takeInitialEvents()` 一次性交给 BattleSession 记录、首屏补放。③骷髅系风暴回填：`storm.dropKind: 'skull'\|'doomSkull'\|'uberDoomSkull'`，GravitySystem 第 4 参 `SkullDropBoost`（骸骨=骷髅阈值×1.9；末日/至尊=0.04/0.02 设计值前置判定），无骷髅风暴时随机序列逐字节不变。④炸毁骷髅官方口径：`settleExplodedSkulls` 按法术伤害 1/5/10 打敌方队首（复用 damageOne，不吃攻击力/不可闪避），skill-damage 事件带 `originCell`/`skullBurst` 演出元数据 | ✅ 已提交 6b1079a |
| 09-16 | E（同批·渲染+音效） | `render/statusBadges.ts`/`TeamView.ts`/`StormIndicator.ts`/`EventStreamPlayer.ts`/`App.ts`/`SkillTestPage.ts` | **特殊状态批·演出**：新状态徽记 5 枚（死亡标记/狼化/狂怒/法力燃烧/魅惑，连字符别名归一）+ 七种 CSS 状态持续光晕（status-accent）；StormIndicator 重设计（全域天色+横幅冠饰星位、dropKind 三贴图三光晕），**风暴 set 演出不占时间线**（plan 的 summonSfx/burstFx/holdSeconds 归零，stormIndicator 用例同步改——D 原实现的演出时机迁移而非删除）；refill 生成线机制替换 `setRefillSpawnTopPx`→`pendingFallMaxCells` 整列刚体同落（修补充堆压幸存宝石，verify-fall.mjs 逐帧验证）；special-gem-trigger 反馈（触发环/标签/闪电行列扫光）；炸毁骷髅专用骨白弹体+skullHit 音。资产 `assets/音效/中毒.wav`（未接线，盘点见 artifacts/audio-inventory.txt） | ✅ 已提交 2cd8e3e |
