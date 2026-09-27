# 交接文档 · 技能系统（skill-authoring）

> 用途：新对话接手时先读本文件 + 对应 spec，再动手。所有关键信息已落盘，换对话不丢东西。
> 最后更新：完成"选行/列改为复用'选一枚宝石'选择器（以选定宝石为起点取整行/列）"之后。

## 一、当前状态（一句话）

技能系统的**引擎 + 表现层 + 测试台**已打通并全绿：短按角色卡释放技能、瞄准式选目标/选色/选宝石（摧毁·爆破指定行列也复用同一"选一枚宝石"选择器，以选定宝石为起点取整行/整列）、伤害/宝石/增益/状态/召唤/额外回合都能演出。**验证基线：`npx vitest run` 241 passed、`npx playwright test` 11 passed、`npx tsc --noEmit` 通过、`npx vite build` 通过。** 改完任何东西都要让这四项保持绿。

## 二、怎么跑 / 怎么测

- `npm run dev` → 
  - `http://localhost:5173/`（端口占用会自动换 5174）主游戏本体
  - `.../skills-test.html` 技能测试页（拖技能标签到我方卡换技能 → 短按卡释放；有法力上限=3/充满法力/推进回合/事件日志）
- `npx vitest run` 单元 + 属性测试（node 环境，纯逻辑）
- `npx playwright test` 端到端（自动起 dev server，直接测主游戏页面的释放流程）
- `npx tsc --noEmit` 类型检查；`npm run lint` ESLint

## 三、架构铁律（务必遵守，之前踩过坑）

1. **技能是手写数据配置，不是文本翻译**：`src/engine/skills/library.ts` 里 `skillId → SkillPrototype`，逐条手写，中文描述只作注释。**禁止**做"中文→技能"的正则/编译/翻译引擎。
2. **释放玩法只在主游戏 App 实现一次**：`App.castPlayerSkill` 是唯一的释放流程（选择器收集 → castSkill → 演出）。测试页 `SkillTestPage` 是 **App 的薄壳**，只加配置面板，**不得重写**引擎装配/释放/选择/演出。
3. **逻辑层纯净**：`src/engine/**` 禁止 import pixi/gsap/dom；随机一律走注入的 `SeededRNG`；确定性（同状态+种子+选择 → 同事件流）。
4. **引擎只产事件，表现层只消费**：新效果加事件类型（`events.ts`）→ 引擎发 → `EventStreamPlayer` 演出。

## 四、关键模块地图

**引擎（src/engine/skills/）**
- `scaling.ts` 数值缩放 `[魔法×mult+base]`
- `targeting.ts` 目标模式 + `selectTargets`（含 enemyChosen/allyChosen 手动选）
- `builders.ts` 技能配置简写（dmg/heal/createGems/transform/destroy*/explode*/inflict/summon*/extraTurn；`CHOSEN` 选色占位、`CELL` 选格占位）
- `library.ts` 手写技能表（当前仅 5 条样例：7004/7155/7132/7062/7063）
- `prototypes.ts` `SkillPrototype`=有序 `EffectSegment[]`，`executePrototype` 逐段执行、未知段安全跳过
- `colorChooser.ts` / `targetChooser.ts` / `cellChooser.ts` 选色/选目标/选格的 AI 与 Fixed 实现 + `prototypeNeeds*` 判定。**选行/列不再有独立选择器**：`prototypeNeedsCell` 同时覆盖 `cell='CELL'` 与 `chosenLine` 两类目标，都由一次"选一枚宝石"（CellChooser → ctx.chosenCell）驱动
- `effects/` 各效果原语：`damage.ts`/`buff.ts`/`gems.ts`/`status.ts`/`summon.ts`/`context.ts`
  - `gems.ts` 是重点：`clear` 段 = 目标集(ClearTarget) × 模式(destroy|explode)。**destroy 只清目标；explode 目标∪每颗8邻格(辐射一圈)**。目标集：lines/chosenLine/randomLines/color/allColors/skulls/randomGems/cell。**`chosenLine` 以 `ctx.chosenCell` 为起点**：取该宝石所在整行(`orientation='row'`)或整列(`'col'`)
- `traits.ts` 特质被动钩子

**引擎核心**
- `TurnEngine.ts` `castSkill` 接入选色/选目标/选格/选行列（`set*Chooser` 注入）；`passTurn()` 供测试推进回合；`resolveBoardChange` 宝石操作后的法力/骷髅结算+重力+连锁
- `events.ts` 事件类型（gem-create/transform/destroy/explode、skill-damage、buff、status-*、summon 等）

**表现层（src/render/）**
- `App.ts` 主游戏；`castPlayerSkill` 释放流程；`cellAimCoords()` 坐标适配器；`onBattleEvent` 分发事件到卡片
- `EventStreamPlayer.ts` 事件→GSAP 时间线演出（含 gem-destroy 碎裂 / gem-explode 冲击波 两套；法力流 `computeManaSources` 已把技能清除的宝石纳入来源）
- `TeamView.ts` 角色卡（短按=释放 长按=详情 `bindPress`；状态图标栏；floatText/hitFlash；瞄准高亮 class）
- `TargetPicker.ts` 选目标瞄准器（暖金光束+准星，敌红/友绿锁定）
- `CellPicker.ts` 选宝石格瞄准器（**已去高光**，只留光束+准星）—— 引爆某格 / 摧毁其所在行列**共用此选择器**（`LinePicker` 已删除）
- `BoardColorPicker.ts` 选色（GOW 标准：扫过棋盘同色宝石全高亮，点选确认）—— 选色的同色高亮**保留**
- `FXLayer.ts` 程序化特效（burst 粒子、shockwave 冲击环、comboText）
- `statusBadges.ts` 状态图标 SVG
- `SkillTestPage.ts` 测试页薄壳
- `CharacterDetailPanel.ts` 详情面板

## 五、交互现状（截图/实测确认过）

- 短按己方满法力卡 = 释放；长按 = 详情
- 需选目标：施法者金色浮起 → 拉暖金光束跟随鼠标 → 候选卡呼吸高亮 → 悬停锁定（敌红/友绿）→ 点选确认 / 点空白·Esc·右键取消
- 需选色：扫过棋盘，光标所在宝石的同色全部高亮 → 点选确认
- 需选宝石格（含摧毁/爆破整行列）：光束+准星，准星吸附到宝石 → 点选确认。选定后引擎按技能语义处理（引爆该格 3x3 / 取该格整行/整列）
- **选择期间棋盘交换被禁用**（`input.enabled=false`），取消后恢复
- 摧毁=就地碎裂、爆破=向外冲击环，两者都走法力飞入水晶动画

## 六、下一步：细化动画（本次交接的目标）

**在做动画细化前，先自查交互合理性**——列出需要走查/可能不合理的点，逐一确认或修：

1. **多选择段技能的顺序体验**：一个技能若同时需要"选色+选目标"（或多次选择），现在是串行弹窗式收集，走查是否顺畅、能否中途取消干净。
2. **敌方 AI 释放的演出**：AI 释放走同一 castSkill，但不弹选择 UI；确认 AI 回合的技能演出、法力流、卡面刷新是否正确、节奏是否 OK。
3. **额外回合 + 技能**：技能给额外回合后，回合归属/HUD/待机恢复是否正确。
4. **满法力但被沉默/眩晕**：短按应有明确反馈（当前可能是静默无响应），考虑加提示。
5. **法力未满短按**：当前静默返回，是否要加"法力不足"提示。
6. **选择流程中的边界**：无合法目标/无可选色/棋盘无可选格时，是直接跳过还是给反馈。
7. **召唤登场（已落实）**：场上小于 4 人时追加到最下方，3 人列动态切换为 4 人布局并播放 0011 号符印动画；满 4 人时召唤失效；有空位时追加到场上队尾。
8. **移动端/触摸**：短按长按阈值(350ms)、瞄准拖拽在触摸下的手感。
9. **加速/跳过(空格)**：技能演出是否响应既有的加速与跳过。
10. **演出与胜负**：技能击杀致 game-over 时，末尾演出与事件顺序。

建议：**先用测试页逐个技能类型走查上面 10 点，把"不合理交互"列成清单**，修完交互再进入纯动画打磨（粒子/时序/音效/镜头）。

## 七、已知取舍 / 未做

- 技能库只配了 5 条样例，**尚未批量手工配置真实兵种技能**（1798 条大部分是 `skillId='none'` 回退仅扣法力）。
- 选色的"同色高亮"保留（GOW 标准）；选宝石的高光已按要求去掉。选行/列已统一为"选一枚宝石"的选择器（不再有独立的整行/列高亮选择器）。
- 净化/消除敌方增益等原语未做（属后续范围）。
- 动画已接入多套正式序列帧与技能音效，不再是纯程序化占位；现有映射、接入步骤和待办见 `ANIMATION_HANDOFF.md` 第 16～19 节。
- PBT 8.1（演出不改引擎状态）未做——EventStreamPlayer 依赖 pixi 无法在 node 跑，靠"播放器不接收 GameState"结构性保证 + e2e 覆盖。

## 八、新对话开场建议

给一句定位即可，例如：
- "读 skill-authoring 的 HANDOFF.md 和 App.ts，我要先走查交互合理性" 
- 或 "继续细化技能动画，先按 HANDOFF 第六节自查"
我会先读 HANDOFF + 相关 spec/代码再动手。

## 九、技能动画专项交接

给技能新增或替换动画前，先阅读：

- [`ANIMATION_HANDOFF.md`](./ANIMATION_HANDOFF.md) —— 事件链路、序列帧 strip、时间线同步、坐标转换、代码模板与验收清单。
- 第 16 节：动画和技能音效的实际接入流程。
- 第 18 节：多段技能（伤害 + 冰冻/中毒/燃烧）的组合规则。
- 第 19 节：群体攻击 0241、额外回合 0082、基础组件审计、测试控制台组合器待办。



## 十、宝石消除 / 连击音效已定稿

- 正式链路：`EventStreamPlayer.appendElimination()` → `AudioManager.playChain(chainLevel)`。
- 只使用新采样整套：`src/assets/audio/gems/chains/gem_chain_1.wav` ~ `gem_chain_5.wav`。
- 等级 1 是普通消除，2~5 是连击递进；4 连击增益为 `1.45`。
- 额外回合脉冲也继续这套阶梯，不再有旧 `sweep`。
- 同一连锁等级只播放一次，不按同屏消除组数重复叠加。
- 旧版程序化方波已从运行时移除，备份：`src/assets/audio/archive/legacy_gem_chain_synth.ts.txt`。
- 测试台只保留「试听新版整套」和各级单独试听。
- 音频素材来源和切片顺序见 `src/assets/audio/README.md` 与 `ATTRIBUTION.md`。


