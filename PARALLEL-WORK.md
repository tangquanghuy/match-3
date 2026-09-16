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
| 09-17 | G（回收批，用户直接裁定） | `src/engine/skills/curated/batch-r1.ts`(新) + `curated/index.ts`(追加注册) + 旧批次 skipped 剪除 23 行 + `spell-rules.md`§0 / `spell-assembler.md`§3（新裁定） | **放弃桶回收波1（23 条）**：用户裁定「能做的都要做」，散射/几率/区间/状态宝石理由作废。新裁定：裸伤害句式（无目标词）= enemyChosen，散射=类型词走溅射链（数据证据：散射族凡全体必明写「所有敌人」40/40）。批次号用 R 系（batch-r1.ts）与 E 的数字批次错开，E 继续用 batch-40+ 即可零冲突。分拣脚本 `scripts/recycle_triage.mjs`（716 条→族分布）+ 生成器 `scripts/gen_recycle_batch_r1.mjs`（desc 从 troops.json 逐字拉取）。剩余 backlog 见 `artifacts/recycle/worklist.md` | ✅ 已落 |
| 09-17 | G（回收批·R2 五件套） | `skills/prototypes.ts`+`builders.ts`+`effects/{context,secondary,status,summon,economy}.ts`+`engine/events.ts`+`GameState.ts`（均按台账协议登记）+ `curated/batch-r2.ts`(新)+旧批次 skipped 剪除 20 行 + `tests/unit/spellRecyclePrimitives.test.ts`(新)+`economyEngine.test.ts`（适配第四币种） | **五原语落地 + 回收波2（20 条）**：①献祭 sacrifice（=随机其他盟友，走 execute 管线，属性快照入跨段追踪供 sacrificedStat 来源）②随机状态 inflictRandom（负面池逐目标掷签）③兵种转化 transformTroop(+randomOf)（就地替换保留 id/编队位，不触发阵亡钩子，新事件 troop-transform，表现层 default 容忍）④藏宝图 = 经济第四币种 maps（gainMaps + battleMaps 来源）⑤特定兵种在场 ifCond troopPresent（中文名匹配存活者）。R2 收 20 条（五族 13 + 状态宝石族 7）。仍弃清单更新见 batch-r2 头注 | ✅ 已落 |
| 09-17 | G（回收批·R3） | `effects/{gems,status}.ts`+`prototypes.ts`+`builders.ts`+`curated/batch-r3.ts`(新)+旧 skipped 剪除 5 行 | **随机状态阵营分池**（盟友=正面 barrier/rage/submerged、敌方=负面12种；inflictRandom 新增 times=「陷入 N 个随机状态」）+ **敌方颜色动态占位符** ColorSpec 'ENEMY'（随机存活敌色）/`'LAST_TARGET'`（跨段该敌色）。R3 收 5 条（7521/7994/8428/7425/9957）。裁定补进 spell-rules §11 | ✅ 已落 |
| （待登记） | | | | |
| 09-16 | E（验收提交状态批；实现为前窗口在途改动） | `status.ts`/`ManaDistributor.ts`/`CombatResolver.ts`/`TurnEngine.ts`/`GravitySystem.ts`/`traits.ts`/`types.ts`/`events.ts`/`skills/effects/damage.ts`/`session/BattleSession.ts` + `scripts/build_traits.mjs`/`data/traits.json` | **特殊状态批·引擎+数据**：①疾病（获得法力减半）/诅咒（剥正面状态、解除概率减半、穿普通免疫留 Invulnerable）/死亡标记（10%/回合即死）/狂怒（骷髅 1.5x+无视受击方特质+攻击后过期）/魅惑（骷髅改打己方下一名存活）；自动解除从织网泛化为全状态 `recoveryChance` 累计（10%→+10%，诅咒基准与步长减半），web 语义不变（webStatus 用例未动仍绿）。②开局风暴 `battleStartStorm`（songoflight/darkness/bones/fire/ice 五 code）：TurnEngine 构造期按队伍/特质顺序走 setStormFromSummon（全场唯一顶替裁定），`takeInitialEvents()` 一次性交给 BattleSession 记录、首屏补放。③骷髅系风暴回填：`storm.dropKind: 'skull'\|'doomSkull'\|'uberDoomSkull'`，GravitySystem 第 4 参 `SkullDropBoost`（骸骨=骷髅阈值×1.9；末日/至尊=0.04/0.02 设计值前置判定），无骷髅风暴时随机序列逐字节不变。④炸毁骷髅官方口径：`settleExplodedSkulls` 按法术伤害 1/5/10 打敌方队首（复用 damageOne，不吃攻击力/不可闪避），skill-damage 事件带 `originCell`/`skullBurst` 演出元数据 | ✅ 已提交 6b1079a |
| 09-16 | E（同批·渲染+音效） | `render/statusBadges.ts`/`TeamView.ts`/`StormIndicator.ts`/`EventStreamPlayer.ts`/`App.ts`/`SkillTestPage.ts` | **特殊状态批·演出**：新状态徽记 5 枚（死亡标记/狼化/狂怒/法力燃烧/魅惑，连字符别名归一）+ 七种 CSS 状态持续光晕（status-accent）；StormIndicator 重设计（全域天色+横幅冠饰星位、dropKind 三贴图三光晕），**风暴 set 演出不占时间线**（plan 的 summonSfx/burstFx/holdSeconds 归零，stormIndicator 用例同步改——D 原实现的演出时机迁移而非删除）；refill 生成线机制替换 `setRefillSpawnTopPx`→`pendingFallMaxCells` 整列刚体同落（修补充堆压幸存宝石，verify-fall.mjs 逐帧验证）；special-gem-trigger 反馈（触发环/标签/闪电行列扫光）；炸毁骷髅专用骨白弹体+skullHit 音。资产 `assets/音效/中毒.wav`（未接线，盘点见 artifacts/audio-inventory.txt） | ✅ 已提交 2cd8e3e |
| 09-16 | E-原语批子agent | `TurnEngine.ts`（仅 setStormFromSummon 一处：委托给新 `skills/effects/storm.ts` 的共用 `applyStormToTeam`，事件形态/裁定逐字节不变）+ `skills/effects/storm.ts`(新)/`secondary.ts`/`prototypes.ts`/`builders.ts`/`gems.ts`/`status.ts`/`debuff.ts`/`buff.ts` + `skills/targeting.ts`/`targetChooser.ts` | **引擎原语批（DECISIONS 翻案记录②）**：①createStorm 效果段（`{kind:'storm',color,turns?,dropKind?}`，复用 setStormFromSummon 全场唯一/顶替裁定与 storm-change 事件，默认 8 回合）；②条件域新增 `stormPresent{color?,dropKind?}`、`anyEnemyStatus/anyAllyStatus{statusId}`（全局条件整段判定）；③oneOf 随机多选一段（`{kind:'oneOf',options:EffectSegment[][]}`，rng 掷选、未选分支零执行零事件）；④定量转换（transform 增 `count`/`from:'ANY'`，端点可特殊宝石）；⑤dispel 定向驱散单一状态（复用 status-expire）；⑥reduce/buff `halve`（按当前值 50% 下取整；buff 侧仅 mana=半条法力 floor(manaCost/2)）；⑦目标 `nRange`/创造与随机爆破 `countRange`（min..max，rng 掷选）；⑧shuffleBoard 打乱板面（复用 boardUtils.reshuffle + 既有 reshuffle 事件，满盘才执行）；⑨目标模式 `enemyChosenAndBelow`（chosen 及其纵队下方全部存活敌人，targetChooser/candidatesFor 同步扩 union，App.ts 无需改）。**events.ts/types.ts 零改动**（全部复用既有事件与契约）；不携带新原语的既有对局事件流与随机序列不变（turnStart/colorMatch 等路径未触碰） | ✅ 已落 |
| 09-16 | E-特质子agent | `types.ts`（PassiveModifiers 区段）+ `TurnEngine.ts`（特质触发调用点）+ `traits.ts` + `build_traits.mjs`/`data/traits.json`（重生成） | **条件光环批（缺条件光环桶 65 code/132 次 → 剩 4/71，余为黄金/灵魂经济待经济原语批；连带收编缺状态桶 13 code、其它桶 14 code、特殊宝石桶 1 code，已实现 268→357 code / 3797→3886 次）**：①`PassiveModifiers` 新增 5 键：`onBigMatchStatus?`（4/5 连施加状态：scope self/randomAlly/allAllies/allEnemies/randomEnemy + statuses + turns + chance? + randomPositive? + minSize?；状态本体经 ctx 注入 applyStatus，traits.ts 不反向 import status）、`gainOnBigMatchSized`（minSize→gains，insanegrowth「配对 5 或 5 颗」只认 5 连）、`colorMatchTypeAura`（色→scope→gains 双层表；色键含 'skull'，scope 为 'all'/种族/颜色——celestial/powerof/各色 aura 28 code 族）、`cleanseOnColorMatch`/`cleanseOnBigMatch`（净化=移除负面状态，正面清单与 status.ts 诅咒剥正面一致）、`gainOnEnemyColorMatch`（敌方配对骷髅/某色时自身获得，rancor）；`TraitDefinition.onColorMatchGain` 增可选 `alsoStats`（ragingbull 共享值三属性）。②`applyBigMatchTriggers` 增第 2 参 ctx `{ size?, rng?, applyStatus?, enemyTeam? }`，`applyColorMatchTriggers` 色参数放宽为 `BaseColor\|'skull'`、增 `{ enemyTeam? }`——**无新键特质时零事件零随机消耗（改前基线 3 种子 rng 终态逐字节锁定在 traitBigMatch.test.ts）**。③TurnEngine 新增骷髅组结算后的 'skull' 触发点（2 处，伤害结算之后、炸毁骷髅不触发），既有 2 处配色触发点补 enemyTeam 实参。events.ts 零改动（复用 buff/status-apply/status-cleanse）。生成器侧护栏：含未知状态本体（恐怖/法印…）的条件光环句子整体不收，「创造 N 颗X宝石」「第一名敌人」不硬猜 | ✅ 已落 |
| 09-16 | I | `render/AudioManager.ts` + `render/App.ts`（仅 status-apply 分支）+ `render/StatusSynth.ts`(新) + `assets/audio/status/**` + `tests/unit/audio*` | **状态施加音批（用户裁定缩围：只做状态施加音；黄色技能音已有、宝石触发音/风暴环境音不做）**：①AudioManager 新增公开 `playStatusApply(statusId)`——状态别名归一（-/_ 互转、cursed/enraged/charmed/lycanthropy 收敛，同 statusBadges 规则）后查映射：poison→存量 `中毒.wav` 归一为 `status/poison_dot.wav` 接线（status-tick 既有 'poison' 不动）、burning/frozen→复用既有采样，其余 15 状态（bleed/silence/stun/entangle/web/barrier/submerged/marked/disease/curse/death_mark/rage/charm/mana_burn/wolf）→ `StatusSynth.ts` 程序合成（Web Audio 振荡器/噪声+包络，零素材，参考 archive 合成先例）；未知状态静默；同键 0.18s 节流（全队施加只响一次）。②App.ts status-apply 分支：per-case 的 play('poison'/'burning'/'frozen') 三行收敛为一行 `playStatusApply(ev.statusId)`，视觉 FX/持续层不动；status-tick 路径零改动。③映射表以引擎 status.ts 各 id 集合为快照锁（tests/unit/audioStatusSynth.test.ts，mock AudioContext）。签名形态：`playStatusApply(statusId: string): void`，不改既有 SfxName/既有方法 | ✅ 已落 |
| 09-16 | I | `render/AudioManager.ts` + `assets/音效/` + 文档 | **撤回中毒换音**（用户裁定：中毒原本就有音效，不要改）：playStatusApply 的 poison 路由回既有 `poisonSpell()`（poison_spell_short.wav，行为与接线前一致）；`中毒.wav` 撤回 `assets/音效/` 原位、维持未接线；ATTRIBUTION/README/ASSET-GAPS 同步修正。其余 15 状态合成音不变 | ✅ 已落 |
| 09-16 | I | `render/StatusSynth.ts` + `render/App.ts`（调试钩子区）+ `render/SkillTestPage.ts`（测试台音效区） | **状态音 8bit 重做 + 试听区**（用户反馈：原合成无像素游戏感，要泰拉瑞亚/MC/地牢式 8bit）：①15 个状态音全部按 NES 芯片音配方重写——方波主体 + 噪声通道（高通/带通短爆）+ 量化音高步进（chipNote/chipArp  helpers，MIDI 音号）+ 急起速包络，弃用正弦/三角的"有机"音色；映射表/归一化/导出签名零改动。②App 新增调试钩子 `previewDebugStatusApply(statusId)`（与既有 previewDebugGemChain* 同区同模式）；SkillTestPage 测试台在宝石音效区后新增「状态施加音效」18 键试听网格（15 合成 + poison/burning/frozen 采样），复用既有按钮样式与 this.log。不改测试台其它区块 | ✅ 已落 |
| 09-16 | I | `render/StatusSynth.ts` | **响度/时长对齐采样**（用户反馈：音量、持续时间与燃烧/冰冻采样差距大）：目标时长 0.9~1.4s（原 0.3~0.5s），音符峰值 0.2~0.45（原 0.05~0.15，对齐采样播放增益 0.62~0.72 的听感量级）；chipNote 内建低八度副振荡器加厚（note≥40 时启用，0.45×峰值），跑句步长放慢、尾音拉长。映射/签名零改动 | ✅ 已落 |
| 09-16 | I | `render/AudioManager.ts` + `render/SkillTestPage.ts`（仅状态音区标签/说明）+ `assets/音效/提示词/**`(新) | **状态音转 AI 素材管线**（用户裁定：弃用 8bit 合成，改生成 AI 音效）：①英文提示词文档 `assets/音效/提示词/状态施加音效-AI生成提示词.md`——15 状态各一段自包含英文 prompt（共用风格行 + 逐状态音源描述）+ 输出文件命名约定 `status_<canonical>.wav`；②AudioManager 用 `import.meta.glob('../assets/audio/status/status_*.wav')` 惰性解码自动接线——文件放入即生效、零代码改动，采样优先，缺文件回退既有合成占位（合成保留为占位，不再作为交付方向）；③测试台状态音区标题/说明去 8bit 字样改「AI 素材接入中」口径，按钮不变（有采样播采样、无采样播占位） | ✅ 已落 |
| 09-16 | E-状态宝石子agent | `src/engine/types.ts`（GemType/SpecialGemSpec 区段）+ `TurnEngine.ts`（collectMatchTriggers/expandSpecialDestruction 扩分支）+ `MatchResolver.ts`（resolveSettle 特殊宝石归属色泛化为 matchJoinKey 查询，织网/沙漏/闪电行为逐字节不变）+ `GravitySystem.ts`（仅注释：SPAWNABLE_SPECIALS 不扩）+ `skills/effects/status.ts`（faerie-fire/terror 状态 + 恐怖位次 tick）+ `skills/effects/damage.ts`（damageOne 妖火法术增伤 hook）+ `render/GemSprite.ts` + `render/gemTextures.ts`（SPECIAL_URL 状态族映射归属色贴图，类型级扩展）+ `render/statusGemOverlays.ts`(新) + `render/App.ts`（SPECIAL_GEM_FEEDBACK 13 项）+ `render/SkillTestPage.ts`（特殊宝石测试区扩 13） | **状态搬运宝石批·波A（GEMS-SEMANTICS-2 A/B 组 13 颗 + 前置状态 2）**：①SpecialGemKind 扩 13 值（burningGem/freezeGem/curseGem/bleedGem/poisonGem/deathMarkGem/terrorGem/entangleGem/enrageGem/submergeGem/faerieFireGem/stunGem/barrierGem），STATUS_GEM_EFFECTS 规格表（statusId/turns/magnitude/side/scope 按 A1~B1 各节考证），MATCH_STATUS_GEMS（燃烧/冻结/诅咒/毒/恐怖=被匹配即时施加，仿 web）与 DESTROY_STATUS_GEMS（流血/缠绕/打昏/屏障/激怒/沉没/精灵火/死亡标记=被摧毁施加；被匹配视为被摧毁双路径），isSameMatchType 归基色（deathMark 不可匹配），MatchResolver 归属色泛化；随机目标经既有 rng 且仅触发时消耗。②新状态：faerie-fire（damageOne 法术伤害 ×1.5，骷髅/DoT 不吃；AUTO_RECOVER 累计 10% 自愈）+ terror（完整官方语义：每回合 10% 与后一位交换编队位次，tickTeamStatuses 落地，事件复用 status-tick；无后位/后位阵亡空过不掷签）。③渲染：基色贴图打底（gemTextures）+ statusGemOverlays.ts 程序化叠层（13 套 Graphics 矢量 + gsap 待机补间，prefers-reduced-motion 静态化，无逐帧滤镜）；App 触发反馈 13 项；测试台投放区扩 13。SPAWNABLE_SPECIALS 不扩（只由技能创造），无新宝石对局随机序列逐字节不变（statusGems.test.ts 黄金序列锁）。**验证**：新增 statusGems/statusFaerieFire/statusTerror 三文件 41 例，全量 700 绿；lint/build 过；截图 artifacts/verify-status-gems.mjs → artifacts/status-shots/gems/（13 特写+overview）。附带：curated/batch-38 回收 13 条（8360/8882/8975/9012/9050/9124/9165/9221/9548/9637/9641/9677/9950），8 条留桶理由修正（8683/8815/8827/9312/9658/9717/9841/9933） | ✅ 已落 |
| 09-16 | E-缺陷修复子agent | `render/EventStreamPlayer.ts`（仅 appendReshuffle）+ `render/reshufflePlan.ts`(新) + `render/statusBadges.ts` + `render/TeamView.ts`（状态徽记/accent 域）+ `src/engine/skills/effects/status.ts`（仅 AUTO_RECOVER 集合）+ `tests/unit/reshufflePlan.test.ts`(新) + `tests/unit/statusBadges.test.ts`/`statusGems.test.ts`（追加用例） | **UX 审查缺陷修复批（E 域 3 条）**：①P0 重排卡死——appendReshuffle 的「聚拢」是脱离时间线的 gsap 补间（0.3s 墙钟），「瞬移到新位」是时间线回调（+0.32s），20ms 边距 < 1 帧，同帧时瞬移被未结束的聚拢补间 onUpdate 覆写回聚集点 → 全场宝石永久悬停棋盘中央（SP5/B14 实证；事件形态正确，三条产生路径同源，纯表现层缺陷）；修法：抽出纯逻辑 reshufflePlan.ts（确定性插值，聚拢/散开全部时间线 proxy tween 驱动 + 终态强制归位保底），EventStreamPlayer 消费；回归 tests/unit/reshufflePlan.test.ts（计划覆盖/端点精确/散开窗口无截断/确定性 + 引擎死局 passTurn 事件流含 moves、布局合法）。②诅咒宝石匹配未上靶——引擎施加/目标/事件链路全部正常（表现层也正常消费），真因是 `curse/cursed` 被误入 AUTO_RECOVER 自愈集合：三连换边的首个回合尾 5% 自愈骰在该复现场景确定性命中 → 上靶即蒸发；按 GOW-STATUS-RESEARCH 诅咒行（只「他状态减半/剥正面/穿普通免疫」，无自愈通道）移出集合；回归：statusGems.test.ts 诅咒存续（引擎 8 种子 + tickStatuses 确定性种子 1/3/6）。③织网上靶零演出——web 徽记本就有，缺 accent：TeamView 补蛛网主题 status-accent-web（含 clearStatusAccents 清理表）；同法核对全状态补齐：新增 bleed/barrier/submerged/marked/faerie-fire/terror 六枚 accent + faerie_fire/terror 两枚徽记（此前落灰?占位，即 P1#7 的妖火半边）；reduced-motion 块同步。**验证**：全量 735 绿（64 文件）、lint 零 error、build 过；复验截图 artifacts/ux-review/fix-verify/（fix1-reshuffle-400/800/1600/2600：0.9s 内聚拢→散开→精确归位不再悬停；fix2-curse-card-enemy：紫骷髅徽记+X 虚线与组合器同款；fix3-web-card-enemy：卡面蛛网罩+织网徽记）；复现脚本 fix-probe-*.mjs / fix-shoot-verify.mjs 同目录留存 | ✅ 已落 |
| 09-16 | E-经济对齐逃跑子agent | `src/engine/types.ts`（SpecialGemKind 加 'bootyGem'、Character 加 `fled?`、PassiveModifiers 加 `battleEconomyGain?`）+ `src/engine/MatchResolver.ts`（resolveSettle 通配倍率**乘改加**：multiplier 初值 0、逐颗 += tier，无通配组=1，[2,4,R] 官方口径 ×6）+ `src/engine/TurnEngine.ts`（expandSpecialDestruction 增 web 摧毁路径分支=匹配/被摧毁双路径对齐官方、bootyGem 摧毁分支=+10 金币给行动方；checkVictory 判负分支顺路结算玩家侧经济倍率，仅 GameOver 首次进入时执行一次） | **②织网/通配对齐（DECISIONS 四项拍板②）**：web 双路径去重由管线天然保证（匹配路径 gem 不入摧毁队列）；bootyGem 不可匹配（不入 SPECIAL_MATCH_COLOR，与炸弹/许愿/死亡标记同族）。**既有对局行为变更**：通配倍率乘→加为官方口径拍板项，gemSpecial.test.ts ×8 断言改 ×6；无通配/无织网摧毁的对局事件流逐字节不变 | ✅ 已落 |
| 09-16 | E-经济对齐逃跑子agent | `src/engine/events.ts`（新增 `flee`{characterId,player,hp,armor} 与 `economy-gain`{currency,amount,side} 两事件）+ `src/engine/teamRoster.ts`（resolveDefeatEvents 增 flee 分支：与 defeat 同一 splice+补位管线，但不置 defeated、不进 processDeathTriggers 的 death 扫描——死亡召唤/阵亡响应天然不触发）+ `src/engine/GameState.ts`（挂 `economy: {gold,souls,gems}` 共用战场经济池，createGameState 初始化全 0）+ `src/session/contract.ts`+`battleResult.ts`（BattleResult 增可选 `economy` 三币总额与 `fledExternalIds`；fled 者不进 defeatedExternalIds、按 flee 事件带的 hp/armor 照实回传） | **③逃跑 + ①经济三币种（DECISIONS 四项拍板①③）**：逃跑=escape 效果段（effects/escape.ts 新原语，rng 判定，标 fled+发 flee，移出复用 defeat 管线）；经济=gainGold/gainSouls/gainGems 效果段（builders+prototypes gainEconomy，数值走 scaling+modifier）+ secondary 来源 kind `battleGold/battleSouls/battleGems` 读 state.economy；事件均为新增类型、旧对局零产出，事件流逐字节不变 | ✅ 已落 |
| 09-16 | E-经济对齐逃跑子agent | `src/engine/traits.ts`（仅 resolvePassives 编译一个新键 `battleEconomyGain`→passive 聚合，本批唯一特质钩子点）+ `scripts/build_traits.mjs`+`src/data/traits.json`（重生成：新解析「从战斗中获得 N% 额外灵魂/黄金」「在战斗中获得 N% 黄金加成」= merchant/necromancy/necromaster/moneybags 四 code；晋升度族 bountyhunter/godslayer 不做）+ `render/gemTextures.ts`/`GemSprite.ts`/`statusGemOverlays.ts`（bootyGem 黄贴图+钱袋金币程序化叠层、wildcard tier3 贴图 key 与程序化兜底）+ `render/App.ts`（SPECIAL_GEM_FEEDBACK 增赃物；flee 事件消费=阵亡退场管线的轻量淡出版）+ `render/SkillTestPage.ts`（投放清单增通配×3/赃物） | **①特质战后经济钩子 + Booty 表现（DECISIONS 四项拍板①）**：TurnEngine 构造期汇总玩家侧（Left）开局编队的 battleEconomyGain 比率，GameOver 时对共用池 gold/souls 一次性乘 (1+Σratio)（gems 不放大）；中性特质不出现在 passive，无经济对局零分支零事件 | ✅ 已落 |
| 09-17 | I | `scripts/trim_status_sfx.mjs`(新) + `render/AudioManager.ts` + `render/StatusSynth.ts`（仅导出 normalizeStatusKey）+ `src/assets/audio/status/**` + `assets/音效/**` + `tests/unit/audio*` | **AI 采样裁剪接线 + 多状态并发整治**（用户提供 17 个 AI 生成 wav 于 `assets/音效/`，尾部大量静音；含 E 新落地状态妖火/恐怖共 17 键）：①新脚本 `trim_status_sfx.mjs`（ffmpeg 双端 silenceremove 保留头 0.03s/尾 0.09s + 5ms 淡入 + 80ms 指数淡出 + 峰值归一 -1.5dB；`assets/音效/` 源文件不动），17 个状态输出 `src/assets/audio/status/status_<键>.wav` 自动接线（妖火=faerie_fire、恐怖=terror）；②AudioManager：状态键解析改为「normalizeStatusKey 命中 glob 采样键优先，其次 canonicalStatusSoundId」——glob 目录即状态全集事实源，新状态丢文件即通；多状态防混响=新增全局 0.12s 最小间隔（间隔内任何状态音丢弃，AoE 批量施加只响一声）+ 采样单声道源 newest-wins（新采样起播时旧采样 70ms 快速淡出停止；synth 占位不可停只靠间隔）；③单测同步：快照集补 faerie-fire/terror（经 glob 键覆盖）、「异键同刻」预期改全局间隔丢弃并补用例（本窗音频用例 13/13 绿；全量中 statusBadges 5 例红为 E 在途未提交改动所致，非本批文件） | ✅ 已落 |
| 09-17 | E | `render/statusTooltip.ts`(新) + `render/App.ts`（仅 init 一行安装调用） | **状态徽记点击说明（用户需求：点击徽记向下浮现效果文本）**：零侵入设计——不动设计窗口在途重构的 statusBadges/TeamView，新建独立模块：①STATUS_DESCRIPTIONS 按 BADGES 中文名给全 21 状态官方语义一句话；②document 级点击委托（.status-badge 命中即开、再点/点外关闭），tooltip 挂 body 固定定位（徽记 getBoundingClientRect 下方、视口夹取），样式自注入 style 标签（暗底/主题色边框取 --sb/reduced-motion 适配），徽记加 pointer 光标 | ✅ 已落 |

---

## 窗口 J · Meta 主线（2026-09-17 开工）

任务书：`META-GAME-PLAN.md`（里程碑 M0–M8）。前后端分离口径：meta 数值逻辑全部在 `src/meta/systems`（纯逻辑、零 DOM、vitest 全覆盖），视觉屏（用户手上的 `design/meta-mockups-v4/v5` 等）只做消费方，后续经 `meta/screens` 接逻辑核心。

| 范围 | 文件 |
|---|---|
| J 独占 | `src/meta/**`、`tests/unit/meta*`、`tests/e2e/meta*`、`game.html`（未来入口，未建） |
| 只读消费 | `src/data/troops.json`（只读）、`src/data/leveling.ts`、`src/data/traits.json`、`src/session/contract.ts` |
| 未来共享（动前必须登记台账） | `src/session/contract.ts`（banner 字段）、`ManaDistributor.ts`（旗帜法力加成）、`App.ts`（战斗挂载导出）、`vite.config.ts`（game.html 多页入口） |
| 不碰 | `design/meta-mockups*`（用户的视觉小样，J 只读参考）、引擎/渲染域 |

### 台账登记

| 日期 | 窗口 | 文件 | 动机与形态 | 状态 |
|---|---|---|---|---|
| 09-17 | G（回收批·R4） | `effects/secondary.ts`（selfStatus 条件叶子）+ `curated/batch-r4.ts`(新，59 条)+旧 skipped 剪除（24 文件） | **三大族二次过筛**：几率/状态/经典宝石族按现有词汇全量回收。新裁定：selfStatus 条件叶子；并列数值段共用单一 scaling；裸单颗宝石操作=随机；「N%几率自毁」=sacrifice allySelf；「等同自身魔法值的几率」=chanceBoost selfStat magic；50/50 二选一伤害=oneOf 双支。状态白名单扩 terror/faerie-fire | ✅ 已落 |
| 09-17 | J | `src/meta/**`（新增）、`tests/unit/meta*`（新增） | M0/M1 逻辑核心无前端落地：MetaSave v1 schema + 迁移链 + 双槽防损存档（StorageLike 抽象，浏览器 localStorage/测试内存通用）、货币账本（原子扣费）、部队养成（灵魂升级/升阶 5-10-25 不耗本体/特质裁定②/分解保护）、编队 3~4 校验（主角可选、汇总 issues 供 UI 可视化）。数值单源 `src/meta/data/economy.ts`。零 DOM、零引擎反向依赖 | ✅ 已落 |
