# 窗口 C 任务书 · 特殊宝石

> 你负责本仓库的**特殊宝石系统**。开工前按顺序读完：
> 1. `PARALLEL-WORK.md`（三窗口并发边界，**必须遵守**，特别是共享文件台账）
> 2. `.kiro/specs/combat-mechanics/GEMS-SEMANTICS.md`（**八颗宝石的官方语义 + 美术需求**，已逐颗核对官方 Wiki，按它实现，不要凭记忆）
> 3. `.kiro/specs/combat-mechanics/DECISIONS.md`（范围裁定）

## 目标一句话

让特殊宝石在棋盘上真实生效：第一批做**末日骷髅**和**炸弹**（引用热度断层领先），第二批做**闪电/通配/织网/沙漏/许愿**；幽魂暂不做（原版给灵魂=战斗外货币，已裁定不做，语义改造待定）。

美术素材还没到位——**引擎行为先行，外观用代码绘制占位**（先例：`src/render/statusBadges.ts` 的纯 SVG 方案），素材接入留接口。

## 现状（已核实）

- `src/engine/types.ts` 的 `GemType` 已预留 `{ kind: 'special'; spec: SpecialGemSpec }`，加新宝石不需要重构；目前没有任何 special 宝石有行为。
- 棋盘引擎：`BoardModel`（格子/交换）、`MatchResolver`（三消解析）、`GravitySystem`（下落补充）、`TurnEngine`（行动生命周期、连锁 `runCascades`）。
- 消除类技能效果（摧毁/爆破/爆炸）在 `src/engine/skills/effects/gems.ts` 的 clear 管线里，宝石被"摧毁"和被"匹配"是两条不同入口——**触发时机语义（matched vs destroyed）就靠这两个入口区分**。
- 织网状态（web）引擎侧已由窗口 A 实现（`status.ts` 的 `WEB_STATUS_ID`、魔力归零/累计挣脱全套），织网宝石只需 `applyStatus` 即可。
- 逻辑格 40px、渲染 DPR 封顶 2；现有宝石贴图管线在 `src/render/gemTextures.ts`。

## 关键语义速查（详见 GEMS-SEMANTICS.md）

| 宝石 | 匹配性 | 触发时机 | 效果 |
|---|---|---|---|
| 末日骷髅 | 当骷髅参与匹配 | 被匹配 | 骷髅伤害 +5，并引爆周围一圈（连锁照常） |
| 炸弹 | ❌ 不可匹配 | 被**摧毁**（爆炸类效果） | 爆炸摧毁周围一大圈 |
| 织网 | 可匹配（紫色） | 被匹配 | 随机一名敌人获得 web 状态（魔力归零） |
| 闪电·黄 | 可匹配（黄） | 被匹配**或**被摧毁 | 清空整**列** |
| 闪电·蓝 | 可匹配（蓝） | 被匹配**或**被摧毁 | 清空整**行** |
| 通配 x2/x4 | 任意色直线匹配 | 被匹配 | 该次匹配法力收益 ×2/×4 |
| 沙漏 | 可匹配（黄） | 被匹配 | 获得一次额外回合 |
| 许愿 | ❌ 不可匹配 | 被摧毁 | 5 选 1 随机回蓝（含 20% 双方全满的坑），走种子化 rng |
| 幽魂 | — | — | **本批不做**（灵魂=战斗外货币） |

## 任务清单（按序执行）

### 阶段 0 · 类型与匹配语义

- 定义 special 宝石 spec 形态（如 `{ kind: 'doomSkull' | 'bomb' | 'web' | 'lightningRow' | 'lightningCol' | 'wildcard' | 'wish' | 'hourglass', tier?: number }`，命名可自定，定了就登记到 PARALLEL-WORK.md 台账——**窗口 B 的技能编译会引用这个形态来支持"创造 N 颗炸弹宝石"类技能**，这是两窗口的接口对齐点）。
- `isSameMatchType` 扩展：末日骷髅与普通骷髅同匹配类；沙漏/织网/闪电按各自颜色参与匹配；炸弹/许愿不可被匹配（只能被消除管线触发）；通配与任意色直线匹配（匹配算法在 `MatchResolver`，通配是其中最复杂的一项，第一批可以不做通配）。

### 阶段 1 · 第一批：末日骷髅 + 炸弹

1. **末日骷髅**：匹配结算 = 该次骷髅伤害 +5；匹配后引爆相邻一圈宝石（复用 clear/explode 管线，引爆产出的法力/伤害/连锁照常走既有结算）。结算挂载点在 `CombatResolver`/`TurnEngine`——**共享文件，先在 PARALLEL-WORK.md 台账登记再动**。
2. **炸弹**：不可匹配；被 clear 管线摧毁时爆炸摧毁周围一圈。注意官方语义是"被摧毁时"而非"被匹配时"，别挂在匹配路径上。
3. 两者的创造入口：技能侧（窗口 B 的 createGems 引用你的 spec 形态）；自然掉落先不做，留配置开关。

### 阶段 2 · 第二批：闪电 / 通配 / 织网 / 沙漏 / 许愿

- 闪电黄列蓝行（清行/列复用既有 lines 清除实现）
- 通配（MatchResolver 匹配算法扩展，倍率作用于该次匹配的法力分配——与 `ManaDistributor` 的衔接点注意确定性）
- 织网：被匹配时对随机敌人 `applyStatus(web)`（状态已就绪，直接用）
- 沙漏：被匹配时额外回合（复用 `extraTurn` 的回合信号）
- 许愿：被摧毁时 5 选 1 随机（种子化 rng；"双方全满"是 20% 的坑，照官方）

### 阶段 3 · 表现与素材约定

- `gemTextures`/`GemSprite` 注册 special 宝石；素材未到位用代码绘制占位（SVG/程序化），**命名与尺寸按 GEMS-SEMANTICS.md 的美术需求单**（128×128 @2x，本体待机态+高亮态，消除特效走现有 `src/assets/fx/*_strip.png` 序列帧约定），素材到位后替换即可。
- 状态栏/飘字如需新事件（如宝石爆炸），走 `events.ts`——共享文件，先登记台账。

## 边界与约定（详见 PARALLEL-WORK.md）

- **只改**：`types.ts` 的 `GemType`/`SpecialGemSpec` 区段（同文件还有窗口 A 的 `PassiveModifiers` 区段，**编辑前重读文件，别整文件覆盖**）、棋盘五文件、`gemTextures`/`GemSprite`、`src/assets/**`、`tests/unit/gem*`。
- **共享文件**（`CombatResolver.ts`、`TurnEngine.ts`、`events.ts`、`skills/effects/gems.ts` 的 clear 管线入口）：动前在 PARALLEL-WORK.md 台账登记；其中 `skills/**` 目录主体归窗口 B，你只在 clear 管线需要宝石回调时按台账协调。
- `data/troops.json`、`src/data/traits.json`、`src/data/spells.json`（窗口 B 产物）：只读。

## DoD

1. 第一批（末日骷髅/炸弹）行为 + 单测：触发时机（匹配 vs 摧毁）正确、爆炸连锁照常、确定性（同 seed 同事件流）
2. 第二批行为 + 单测（通配可放最后）
3. 全量 `npm run lint` / `npm test -- --run` / `npm run build` 绿（基线：43 文件 / 396 用例）
4. 占位表现可见；美术素材接入点留好
5. 共享文件改动已按台账协议登记
