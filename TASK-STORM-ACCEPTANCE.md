# 窗口 D 任务书 · 风暴全局掉落修正 + 三窗口验收 + 缺口复核

> 你是新开的执行窗口。开工前按顺序读完（都是仓库根目录/规格目录的文件）：
> 1. `PARALLEL-WORK.md` —— 三窗口并行边界与共享文件台账协议，**必须遵守**
> 2. `.kiro/specs/combat-mechanics/DECISIONS.md` —— 内容范围裁定与批次记录
> 3. 本文 —— 你的四阶段计划
>
> 你是窗口 D（新窗口），名下文件见阶段内标注；共享文件动前必须先在 `PARALLEL-WORK.md` 文末台账登记。

---

## 背景（自包含，不需要读会话记录）

本仓库是模仿 Gems of War 的三消战斗游戏（TypeScript + PixiJS + GSAP + Vitest），最终通过 postMessage 嵌入酒馆 AIRP（AI 文字跑团）作为战斗页。三个窗口已完成大量工作：

- **窗口 A（被动特质）**：250 个特质 code 已实现（覆盖 3703 次兵种出场），死亡召唤特质已落地 17 code；**剩余 14 个 code / 33 次出场被"风暴系列"卡住**（见阶段 1）
- **窗口 B（技能编译）**：五机制（二次缩放/概率/削弱/死亡条件/种族翻倍）已落地，人工组装路线已核对 509/1798 条技能（`artifacts/spell-build.txt`），734 条有理由放弃，555 条待核对
- **窗口 C（特殊宝石）**：10 种特殊宝石 9 种完整（45 用例），末日骷髅/炸弹/闪电/织网/沙漏/许愿/通配全部可玩

当前全量测试 52 文件 / 564 用例全绿；工作区有约 83 条未提交改动（阶段 0 解决）。

---

## 阶段 0 · 基线提交（必做，第一个动作）

工作区改动量大且三窗口混合，验收必须可锚定：

```bash
git add -A && git commit -m "chore: 三窗口并行阶段基线（B 技能 509 条编译 + C 特殊宝石 9 种 + A 死亡召唤 17 code）"
```

之后**每个阶段完成即独立提交**，提交信息注明阶段号。

---

## 阶段 1 · 风暴引擎机制（核心新增机制）

### 1.0 已查证的官方语义（不要重新发明，来源在此）

风暴（Storm / Mana Storm）在 GoW 中**不是队伍里的兵种**——不占编队位、无血量、不可被攻击，是挂在战斗上的**全局掉落修正器**：

- 官方术语表（Infinity Plus 2 support）："When a Mana Storm is active in battle, Gems of the Storm's color are more likely to drop onto the board."
- Steam 社区实测：Firestorm 激活时新宝石约 **27.1%** 为对应色（正常 14.3% = 1/7），约 **×1.9**
- TrueTrophies：掉率提升**持续到计数器归零**（有持续回合数）
- 官方允许"双色双风暴"（不同色可共存）；**本项目用户裁定：全场同时只能有一个风暴，后召顶替先召**（实现上 `Team.storm` 每方各留字段天然支持将来放开为每方一个，但 TurnEngine 层执行全场唯一）

**来源链接**（写决策记录时引用）：
- https://infinityplus2.freshdesk.com/support/solutions/articles/150000208267-gems-of-war-glossary-of-terms
- https://steamcommunity.com/app/329110/discussions/0/3201496371571406154/
- https://www.truetrophies.com/game/Gems-of-War/walkthrough/4

### 1.1 查证收尾（产出写入 `.kiro/specs/combat-mechanics/DECISIONS.md` 新小节）

三个待定项，查官方 Wiki/gowhead，查不到按括号内默认值实现并在决策记录里标注假设：

1. **持续回合数**（默认 5 回合）——官方计数器具体几回合
2. **9 种风暴的颜色映射**：暗风暴=Purple、火风暴=Red、冰风暴=Blue、光风暴=Yellow、叶风暴=Green 已可按语义定；**骸骨风暴/尘风暴（可能都是 Brown，查证区分）、末日风暴/超级末日风暴（特殊，查证；若官方末日风暴即 doom 色系挂 Black/Purple 处理）**
3. **掉落加成**：按官方实测 ×1.9，做成引擎常量（如 `STORM_DROP_WEIGHT = 1.9`）可调

### 1.2 数据结构（窗口 D 名下：`types.ts` 的 Team 区段 + `events.ts`）

- `Team` 新增可选字段：`storm?: { color: BaseColor; turns: number; troopId: number }`——**不是 Character**，不进 characters/summonQueue
- `events.ts` 新增事件：`storm-change`，载荷 `{ player: PlayerSide; color: BaseColor | null; reason: 'set' | 'replaced' | 'expired'; prevColor?: BaseColor }`（color=null 表示到期清除）
- **注意**：`types.ts` 同文件有窗口 C 的 GemType 区段和窗口 A 的 PassiveModifiers 区段，编辑前重读文件，只动 Team 区段

### 1.3 引擎逻辑（`TurnEngine.ts` / `GravitySystem.ts` / `traits.ts`，共享文件，动前台账登记）

1. **设置风暴**：`TurnEngine.resolveDeathSummons` 现在把死亡召唤 spec 交给 `applyDeathSummons` → `enqueueSummon`（入队为 Character）。扩展：spec 带风暴标记时**不入队**，改为设置持有者一方 `team.storm`：
   - 若己方已有风暴 → 替换（发 reason:'replaced'）
   - 若**对方**有风暴 → 也替换（全场唯一裁定；被顶掉的对方风暴发 storm-change 让表现层撤指示器）
   - 同回合多次触发按 specs 顺序结算，后者顶前者
2. **回合递减**：`finishTurn` 回合尾（DoT 结算附近）对双方 `storm.turns` 递减，归零清除并发 reason:'expired'
3. **掉落权重**：`GravitySystem` 的 refill 颜色分布处读取双方 `team.storm`，对应色权重 ×`STORM_DROP_WEIGHT`。**先读 `GravitySystem.ts` 最新代码**——窗口 C 在此实现了 `specialSpawnChance` 与 `SPAWNABLE_SPECIALS` 白名单，不要破坏；无风暴时行为必须与现状完全一致（既有测试零改动通过）
4. **特质定义**（`traits.ts` + `types.ts`）：`DeathSummonSpec` 增加风暴变体字段 `storm?: { color: BaseColor; turns: number }`（带 storm 时 referenceName/troopId 忽略）；`resolvePassives` 照常编译（同字段取概率最高，与现行为一致）
5. **生成器**（`scripts/build_traits.mjs`，窗口 A 名下）：`resolveSummonedTroop` 改为两段式——先查兵种数据（现状），未命中查**风暴映射表**（脚本内常量：9 个风暴名 → { color, troopId 虚拟号段 9001~9009 }）；命中风暴产出 `storm` 变体 spec。重生成 `traits.json`，**预期 250 → 264 code（+14：fromdark/fromashes/frombones/darkdeath/icydeath/rockydeath/fierydeath/naturesdeath/brightdeath/skulldeath/dwarvendoom/doomofarachnaea/herdspirit? 等以实际句式命中为准）**

### 1.4 测试（窗口 D 名下：`tests/unit/storm*`）

- 风暴设置/替换（己方替换、顶掉对方）/到期的事件序列与字段
- 掉落权重：同 seed 大样本（≥2000 次 refill）统计对应色出现率，断言显著高于基线（统计断言，允许 ±3% 浮动）；无风暴时分布与主分支一致
- 回合递减与全场唯一
- 审计套件 `tests/unit/traitsAudit.test.ts` 同步：storm spec 的 color 合法 / turns ∈ [1,20]，14 个新 code 的文本对账（"召唤一个暗风暴"→ storm 变体）
- 集成：持有 fromdark 的角色阵亡 → 己方风暴出现 → 之后 refill 中紫色占比上升

### 1.5 验证门槛（每阶段结束跑）

```bash
npm run lint && npm test -- --run && npm run build   # 全绿才算阶段完成
```

---

## 阶段 2 · 风暴演出（用户明确要求的形态）

**用户设想的演出**：棋盘顶部有对应风暴颜色的宝石常驻，棋盘顶部有特效。照此实现：

1. **顶部风暴指示器**（新组件 `src/render/StormIndicator.ts`，窗口 D 名下）：棋盘顶部 HUD 通道（现有 44px，TURN HUD 占一侧，风暴指示器放另一侧）——对应颜色宝石贴图（复用 `src/render/gemTextures.ts`）+ 底衬色系光晕；出现在施放风暴的一方侧
2. **事件演出**（`EventStreamPlayer.ts` + `App.ts` 消费 `storm-change`，共享文件，台账登记）：
   - `set`：指示器弹入 + 色系一次性爆发 FX（可选征用闲置的 `src/assets/fx/boom_strip.png` 或对应色 `group_hit_*_strip`）+ 复用 summon 音效
   - `replaced`：旧指示器淡出 + 新指示器弹入
   - `expired`：指示器淡出
   - **顺带修掉** `EventStreamPlayer.ts` L335 附近 `summon_rune.duration` 硬编码——占位时长按事件/召唤物查表
3. **持续感**：指示器用 CSS 脉冲动画（零素材），不循环播序列帧（性能）
4. 表现走查标准：召唤风暴 → 顶部出现色宝石指示器；随后棋盘对应色宝石肉眼可辨地变多；替换与到期指示器正确消失

---

## 阶段 3 · 三窗口测试与验收（自动化 + 抽样走查）

### 3.1 自动化基线

- `npm run lint` / `npm test -- --run` / `npm run build` 全绿
- 覆盖率对账（数字写进验收报告）：
  - B：`artifacts/spell-build.txt` 头部三项相加 = 1798（509 已核对 + 734 放弃 + 555 待核对）
  - A：`tests/unit/traitsAudit.test.ts` 全绿（本阶段后应 ≥264 code）
  - C：`tests/unit/gemSpecial.test.ts` 45 用例全绿

### 3.2 抽样人工核对（结果记进验收报告）

- **B（技能）**：按稀有度×王国分层抽 **10 条已编译技能**，从 `src/engine/skills/curated/batch-*.ts` 找到对应条目，对照 `src/data/troops.json` 官方描述逐句核对语义（优先抽带二次缩放 [xN]/[N:M]、概率、削弱复合段的）；另抽 **5 条"已核对放弃"** 确认放弃理由成立（不白弃）
- **C（宝石）**：`npm run dev` 起服务，浏览器（或 Playwright 截图）走查 9 种宝石——技能创造路径生成、匹配/摧毁触发、贴图显示、特效演出；把 `GravitySystem` 的 `specialSpawnChance` 临时调高做自然掉落冒烟（**验完改回 0**）
- **A（特质 + AIRP）**：审计套件跑通；起两个不同 origin 的服务（如 `npm run dev` + `npx http-server dist -p 8090`），用 `tests/e2e/host-harness.html` 做**真实跨域**完整闭环——`battle:ready` → `battle:start` 下发带 `tier` 的快照 → 战斗 → `battle:result` 回传 → `battle:result-ack`。这是项目一直欠着的验收项（跨域此前只有单测覆盖）。注意 `VITE_HOST_ORIGINS` 环境变量配置白名单，见 `src/main.ts` hostOrigins()

### 3.3 验收报告

写入 `.kiro/specs/combat-mechanics/ACCEPTANCE.md`：每窗口一节，pass/fail/遗留问题，问题分"必须修 / 可顺延"两级。**只记录不代修**——问题归各窗口按 `PARALLEL-WORK.md` 边界自行处理。

---

## 阶段 4 · 缺口复核与方向建议

1. 重跑 `node scripts/_gap_analysis.mjs`（先更新脚本内"已实现"口径来源——它读 `src/data/traits.json`，重生成后自动是 264 的新基线），产出新快照覆盖 `artifacts/gap-analysis.txt`
2. 更新 `DECISIONS.md` 的覆盖率数字与"不做清单"状态（B 的 734 条放弃是否合理、特殊状态家族是否维持不做）
3. 结合验收报告，写下一阶段优先级建议（供用户拍板，不擅自定）：
   - B：555 条待核对技能继续组装 vs 调整放弃清单收敛范围
   - A：条件光环长尾（~60 code）/ aquatic 下潜（24 次）
   - C：ghost 宝石语义改造裁定、specialSpawnChance 是否默认开启
   - 横向：真机适配（iOS/Android WebView）、AIRP 实际部署接入、`special-gem-hook`（match5/L/T 生成钩子，当前仅标记）

---

## 边界与约定（重申）

- 你（窗口 D）名下：`src/data/summons` 风暴相关新文件、`tests/unit/storm*`、`src/render/StormIndicator.ts`、验收报告与决策记录
- 共享文件（`TurnEngine.ts`/`GravitySystem.ts`/`events.ts`/`types.ts`/`CombatResolver.ts`/`EventStreamPlayer.ts`）：**动前在 `PARALLEL-WORK.md` 台账登记**；`types.ts` 与 `traits.json` 等多窗口共用文件编辑前重读最新内容
- `src/data/troops.json`、`src/data/spells`（B 的产物）：只读
- 逻辑层（`src/engine/**`）禁 DOM/pixi/gsap；所有随机走种子化 RNG
- 若 B/C 窗口仍在活动，开工前先跑一次全量测试记录基线状态；发现既有失败先在验收报告记录，不擅自修别人的
