# 需求文档 · 技能编写与演出（skill-authoring）

## 引言

`battle-skill-system` 已交付技能系统的**引擎底座**：目标选择、伤害/宝石/增益/状态/召唤/额外回合效果原语、技能原型组合器（`SkillPrototype` = 有序 `EffectSegment` 数组、`executePrototype` 逐段执行）、状态生命周期结算（中毒/燃烧每回合扣血、沉默/眩晕限制行动、到期移除）、以及按 `skillId` 查原型执行、无原型时回退「仅扣法力」的注册表。

但存在三个断层，本 spec 补齐：

1. **没有技能内容**：1798 个兵种的技能没有任何一个被配置成可执行原型，放技能只扣法力、无效果。
2. **表现层不演出技能**：引擎已发出 `skill-damage`、`gem-create/transform/destroy`、`buff`、`status-apply/tick/expire`、`summon` 等事件，但 `EventStreamPlayer` 完全未消费——技能效果在页面上不可见，中毒等状态也没有任何视觉呈现。
3. **无法在页面上系统验证**：缺一个能一键切换、逐类释放并肉眼确认「引擎效果 + 动画演出」都正确的测试场景。

**核心方法（已与产品确认）**：技能是**数据驱动的手写配置**——每个技能 = 若干效果积木（effect segment）的有序组合，逐条人工编写、配一条准一条。中文技能描述仅作注释参考，**不参与运行逻辑**；**不做**任何「中文文本→技能」的正则/翻译/自动编译。

**架构铁律（本次修订核心）**：技能释放的完整玩法流程（触发释放 → 选目标/选色/选宝石 → 执行 → 演出）**只在主游戏（App）中实现一次**，是唯一的真实实现。测试页**不得**重写引擎装配、释放流程、事件派发或演出逻辑；它只是"主游戏 + 一层配置面板"——复用主游戏的全部运行时，额外提供"指定某角色技能原型、重置到指定局面、看事件日志"等**配置**能力。任何"测试页专属逻辑"都视为架构缺陷。

**玩家交互（已确认）**：短按己方角色卡 = 释放其技能（若法力已满）；长按角色卡 = 打开详情面板。

本 spec 范围（已修订）：
- **引擎层**：手写技能库 + 简写 builder；运行时选择机制三类——选定颜色（Chosen_Color）、选定目标角色（Chosen_Target）、选定棋盘宝石格（Chosen_Cell）；军队颜色不做。
- **主游戏（App）**：承载技能释放全流程——短按释放、玩家/ AI 选择器接入、演出；这是释放玩法的唯一实现。
- **表现层**：为所有技能效果事件补动画演出；角色卡状态图标栏；选色条 / 选目标高亮 / 选宝石高亮 三种运行时选择 UI；全部代码特效/SVG，不依赖美术素材。
- **测试页**：基于主游戏的薄配置外壳——复用 App 的场景与释放流程，只加配置面板（指定技能原型、重置局面、事件日志）。**不重写任何释放/演出逻辑**。
- **验证**：引擎逻辑单元/属性测试；端到端 Playwright **直接测主游戏页面**的技能释放（含选目标/选色/选宝石）。
- **不做**：净化/消除敌方增益等新原语；中文自动编译。

本 spec 延续引擎约束：逻辑层纯净（`src/engine` 禁止依赖 pixi/gsap/dom）、确定性（种子化 RNG）、事件驱动（引擎只产事件、表现层只消费）、可测试。

## 术语表

- **技能库 (Skill_Library)**：`skillId → SkillPrototype` 的手写配置表，是技能内容的唯一来源。
- **效果积木构造器 (Effect_Builder)**：把冗长的 `EffectSegment` 对象简化为短函数调用的一组构造器（如 `dmg`、`heal`、`createGems`、`inflict`）。
- **技能原型 (Skill_Prototype)**：`battle-skill-system` 定义的 `SkillPrototype`，有序效果段数组。
- **效果段 (Effect_Segment)**：一个最小效果单元（damage/buff/gem/status/extraTurn/summon）。
- **选定颜色 (Chosen_Color)**：技能文本中「指定颜色/选定的颜色」对应的运行时颜色，由施法方（玩家或 AI）在释放时从棋盘现存颜色中选定，而非配置期固定。
- **选定目标 (Chosen_Target)**：需玩家手动指定的单体目标角色（如指定单体伤害/治疗/净化/缠绕），由施法方在释放时选定（玩家点选角色卡 / AI 策略）。
- **选定宝石格 (Chosen_Cell)**：需玩家手动指定的棋盘格/宝石（如"引爆你点选的宝石"），由施法方在释放时选定（玩家点棋盘格 / AI 策略）。
- **选择器 (Chooser)**：运行时把上述"选定"解析为具体值的接口族——ColorChooser / TargetChooser / CellChooser；均为玩家交互实现 + AI 确定性实现两套，注入引擎释放流程。
- **释放流程 (Cast_Flow)**：主游戏中一次技能释放的完整过程：触发 → 需要时依次解析选色/选目标/选宝石 → castSkill → 播放事件流演出。唯一实现于 App。
- **技能测试页 (Skill_Test_Page)**：主游戏之上的薄配置外壳，复用 Cast_Flow 与演出，仅提供配置与观测面板。
- **颜色选择器 (Color_Chooser)**：提供 Chosen_Color 的运行时接口；玩家方可交互选择，AI 方按确定性策略选择。
- **效果事件 (Effect_Event)**：引擎产出的技能效果事件：`skill-damage`、`gem-create`、`gem-transform`、`gem-destroy`、`buff`、`status-apply`、`status-tick`、`status-expire`、`summon`。
- **状态图标栏 (Status_Badge_Strip)**：角色卡上展示其当前所挂状态（中毒/燃烧/沉默等）的小图标区域。
- **技能测试台 (Skill_Test_Harness)**：独立页面，用于逐类技能的一键释放与效果/演出验证。
- **事件流日志 (Event_Log)**：测试台上按序展示本次释放所产出事件的可读列表。
- **回退 (Fallback)**：技能未在 Skill_Library 配置时的既有行为——仅扣法力、无战斗效果、不崩溃。

## 需求

### 需求 1：手写技能库与构造器

**用户故事：** 作为开发者，我希望用简洁的数据组合逐条手写技能，这样能配一条准一条、可读可维护，且不依赖任何文本翻译。

#### 验收标准

1. THE Skill_Library SHALL 以 `skillId` 为键、`SkillPrototype` 为值提供技能配置。
2. THE Effect_Builder SHALL 为每类受支持效果段（伤害、增益、宝石、状态、额外回合、召唤）提供简写构造器，其产物 SHALL 为合法的 `EffectSegment`。
3. WHEN 通过构造器组装一个技能，THE 组装结果 SHALL 是一个效果段顺序与书写顺序一致的 `SkillPrototype`。
4. WHEN 引擎按 `skillId` 查询 Skill_Library 中已配置的技能，THE 引擎 SHALL 执行其配置的原型。
5. IF 一个 `skillId` 未在 Skill_Library 中配置，THEN THE 引擎 SHALL 回退为仅扣法力、无战斗效果且不崩溃。
6. THE Effect_Builder 与 Skill_Library SHALL 位于逻辑层且 SHALL NOT 依赖 pixi、gsap 或 dom。

### 需求 2：选定颜色运行时机制

**用户故事：** 作为玩家，我希望「转化/摧毁指定颜色」这类技能能真正让施法方选一个颜色作用，而不是被跳过或写死。

#### 验收标准

1. THE Color_Chooser SHALL 提供一个在技能释放时返回一个 Chosen_Color 的接口。
2. WHERE 一个技能效果段需要选定颜色，THE 效果段 SHALL 引用 Chosen_Color 而非配置期固定颜色。
3. WHEN 施法方为 AI，THE Color_Chooser SHALL 以确定性策略（在 design 中固定，如棋盘现存最多的颜色、平局取固定序）选定颜色，并使用种子化 RNG。
4. WHEN 施法方为玩家，THE 表现层 SHALL 允许玩家从棋盘现存颜色中选择一个颜色作为 Chosen_Color。
5. WHEN Chosen_Color 被确定，依赖它的宝石效果段（转化/摧毁指定色/创造指定色）SHALL 按该颜色执行。
6. IF 棋盘上不存在任何可选颜色，THEN 依赖 Chosen_Color 的效果段 SHALL 安全地不产生效果且不崩溃。
7. THE Color_Chooser 的选择过程 SHALL 保持引擎确定性：相同状态 + 相同种子 + 相同选择输入产出相同结果。

### 需求 2A：选定目标运行时机制

**用户故事：** 作为玩家，我希望「指定单体伤害/治疗/净化/缠绕」这类技能能让我手动点选作用对象，而不是只能自动打队首或随机。

#### 验收标准

1. THE TargetChooser SHALL 提供一个在技能释放时返回一个 Chosen_Target 角色 id 的接口。
2. WHERE 一个技能效果段需要选定目标，THE 效果段 SHALL 引用 Chosen_Target 而非固定/随机目标模式。
3. WHEN 施法方为玩家，THE 表现层 SHALL 高亮候选角色卡并允许玩家点选一个作为 Chosen_Target。
4. WHEN 施法方为 AI，THE TargetChooser SHALL 以确定性策略选定目标（在 design 中固定，如敌方取最弱、己方取最低血、平局取索引更前者），并使用种子化 RNG。
5. WHEN Chosen_Target 被确定，依赖它的效果段 SHALL 作用于该目标。
6. IF 无任何合法候选目标，THEN 依赖 Chosen_Target 的效果段 SHALL 安全地不产生效果且不崩溃。
7. THE TargetChooser 的选择过程 SHALL 保持引擎确定性。

### 需求 2B：选定宝石格运行时机制

**用户故事：** 作为玩家，我希望「引爆你选定的宝石」这类技能能让我点棋盘上某颗宝石来指定作用格。

#### 验收标准

1. THE CellChooser SHALL 提供一个在技能释放时返回一个 Chosen_Cell 棋盘坐标的接口。
2. WHERE 一个宝石效果段需要选定格子，THE 效果段 SHALL 引用 Chosen_Cell 而非固定坐标。
3. WHEN 施法方为玩家，THE 表现层 SHALL 高亮可选棋盘格并允许玩家点选一格作为 Chosen_Cell。
4. WHEN 施法方为 AI，THE CellChooser SHALL 以确定性策略选定格子，并使用种子化 RNG。
5. WHEN Chosen_Cell 被确定，依赖它的宝石效果段（如以该格为中心引爆/摧毁）SHALL 作用于该格。
6. IF 棋盘无可选格，THEN 依赖 Chosen_Cell 的效果段 SHALL 安全地不产生效果且不崩溃。
7. THE CellChooser 的选择过程 SHALL 保持引擎确定性。

### 需求 2C：主游戏技能释放流程（唯一实现）

**用户故事：** 作为开发者，我希望技能释放的完整玩法只在主游戏里实现一次，这样测试与实际游戏跑的是同一套代码。

#### 验收标准

1. WHILE 对局等待输入且为玩家回合，WHEN 玩家短按一名法力已满的己方角色卡，THE 主游戏 SHALL 发起该角色的技能释放流程。
2. WHEN 玩家长按一名己方角色卡，THE 主游戏 SHALL 打开该角色的详情面板（而非释放）。
3. WHERE 被释放技能需要选色/选目标/选宝石，THE 主游戏释放流程 SHALL 依次用对应玩家 Chooser 收集选择，再调用 castSkill。
4. WHEN 敌方 AI 释放技能，THE 释放流程 SHALL 复用同一 castSkill 路径，仅以 AI Chooser 替代玩家 Chooser。
5. THE 主游戏释放流程 SHALL 通过既有 EventStreamPlayer 播放释放产出的事件流。
6. IF 玩家在需要选择时取消（点空白/未选），THEN THE 主游戏 SHALL 取消本次释放且不消耗法力、不改变对局状态。
7. THE Skill_Test_Page SHALL 复用主游戏的释放流程与演出，SHALL NOT 另行实现释放、选择或演出逻辑。

### 需求 3：伤害效果演出

**用户故事：** 作为玩家，我希望技能造成伤害时能看到命中反馈和伤害数字，这样我知道打中了谁、掉了多少血。

#### 验收标准

1. WHEN 表现层消费一个 `skill-damage` 事件，THE 表现层 SHALL 在目标角色卡处播放命中反馈并显示所受伤害数值。
2. WHEN 一次技能对多个目标造成伤害，THE 表现层 SHALL 为每个 `skill-damage` 事件各自呈现反馈。
3. WHEN 一个 `skill-damage` 事件使目标血量降至导致阵亡，THE 表现层 SHALL 呈现该目标的阵亡表现（沿用既有 `defeat` 演出）。
4. THE 伤害演出 SHALL 使用代码特效，SHALL NOT 依赖外部美术序列帧素材。

### 需求 4：宝石操作演出

**用户故事：** 作为玩家，我希望技能改变棋盘时能看到宝石被创造/变色/摧毁的过程，这样棋盘变化清晰可读。

#### 验收标准

1. WHEN 表现层消费一个 `gem-create` 事件，THE 表现层 SHALL 在对应格子呈现新宝石的出现。
2. WHEN 表现层消费一个 `gem-transform` 事件，THE 表现层 SHALL 呈现相关宝石从原类型变为新类型。
3. WHEN 表现层消费一个 `gem-destroy` 事件，THE 表现层 SHALL 呈现被摧毁宝石的消失。
4. WHEN 一次宝石操作触发后续重力与补充（既有 `gravity`/`refill` 事件），THE 表现层 SHALL 在宝石操作演出之后接续播放重力与补充演出。
5. THE 表现层 SHALL 使演出后的棋盘精灵与引擎棋盘终态一致（无残留/无错位）。

### 需求 5：增益效果演出

**用户故事：** 作为玩家，我希望治疗、加护甲、加攻击等增益能在受益角色身上看到反馈。

#### 验收标准

1. WHEN 表现层消费一个 `buff` 事件，THE 表现层 SHALL 在目标角色卡处呈现与该属性（生命/护甲/攻击/魔法/法力）对应的增益反馈与数值。
2. WHEN 表现层消费一个 `buff` 事件后，THE 目标角色卡的相应属性显示 SHALL 更新为增益后的值。
3. THE 增益演出 SHALL 使用代码特效，SHALL NOT 依赖外部美术序列帧素材。

### 需求 6：状态呈现与状态图标栏

**用户故事：** 作为玩家，我希望能清楚看到哪个角色处于中毒、燃烧、沉默等状态，以及状态每回合的效果和何时消失。

#### 验收标准

1. THE 角色卡 SHALL 提供一个 Status_Badge_Strip，显示该角色当前所挂的全部状态各自的图标。
2. WHEN 表现层消费一个 `status-apply` 事件，THE 表现层 SHALL 在目标角色卡的 Status_Badge_Strip 上出现对应状态图标。
3. WHEN 表现层消费一个 `status-tick` 事件且该状态为持续伤害（中毒/燃烧），THE 表现层 SHALL 在目标角色卡处呈现该回合的扣血反馈与数值。
4. WHEN 表现层消费一个 `status-expire` 事件，THE 表现层 SHALL 从目标角色卡的 Status_Badge_Strip 移除对应状态图标。
5. THE Status_Badge_Strip SHALL 为不同状态类型（中毒/燃烧/沉默/冰冻/眩晕/诅咒）使用可区分的图标。
6. THE 状态图标 SHALL 使用代码/SVG 绘制，SHALL NOT 依赖外部美术序列帧素材。

### 需求 7：召唤物设计与召唤演出

**用户故事：** 作为开发者，我希望每个召唤技能都明确指定它召唤出的具体兵种（及其属性），而不是笼统占位，这样召唤物与原作一致、强度可控。

#### 验收标准

1. THE Skill_Library 中每个召唤类技能 SHALL 显式指定其召唤物的来源：或引用一个已有兵种（按其数据映射为召唤物属性），或提供一份手写的召唤物属性模板。
2. WHEN 一个召唤技能被释放，IF 施法方场上不足 4 人，THEN THE 引擎 SHALL 将该技能指定的召唤物追加到场上队尾。
3. THE 被召唤角色的属性（生命/攻击/护甲/魔法/法力颜色/技能）SHALL 来自该技能指定的召唤物定义。
4. WHERE 一个召唤技能声明「随机某族/某类」，THE 该技能的召唤物定义 SHALL 提供一个候选兵种集合，且 THE 引擎 SHALL 使用种子化 RNG 从中确定性地选定一个。
5. WHEN 表现层消费一个入场 `summon` 事件，THE 表现层 SHALL 将新角色追加到队列最下方；从 3 人增加到 4 人时 SHALL 切换为 4 人卡列布局。
6. IF 施法方场上已有 4 人，THEN THE 召唤 SHALL 进入 FIFO 等待队列；WHEN 一名场上友方阵亡，THE 最早入队的召唤物 SHALL 移到场上队尾。
7. THE 入场召唤演出 SHALL 播放 0011 号召唤符印序列帧；仅进入等待队列时 SHALL NOT 创建场上角色卡。

### 需求 8：演出编排与既有管线一致

**用户故事：** 作为开发者，我希望新效果事件的演出遵循既有事件流播放机制，这样技能演出与三消/骷髅演出风格一致、时序正确。

#### 验收标准

1. THE 表现层 SHALL 通过既有 `EventStreamPlayer` 事件流机制编排全部 Effect_Event 的演出。
2. THE 表现层 SHALL 按事件在流中的先后顺序播放各效果演出（`skill-cast` 先于其效果事件）。
3. WHEN 一条事件流同时包含技能效果事件与三消/重力/骷髅事件，THE 表现层 SHALL 按统一时间线顺序播放而不冲突。
4. WHEN 玩家使用既有加速/跳过控制，THE 技能效果演出 SHALL 同样响应加速/跳过。
5. IF 一个 Effect_Event 的目标角色卡或格子不存在于当前视图，THEN THE 表现层 SHALL 安全跳过其演出且不崩溃。

### 需求 9：技能测试页（主游戏的薄配置外壳）

**用户故事：** 作为开发者，我希望测试页只是在主游戏之上加一层配置，让我能把任意角色的技能设成任意原型、重置到可复现局面、逐类验证——但跑的完全是主游戏那套释放与演出逻辑。

#### 验收标准

1. THE Skill_Test_Page SHALL 复用主游戏的场景装配、Cast_Flow 与演出，SHALL NOT 重写引擎装配、释放流程、选择器接入或演出逻辑。
2. THE Skill_Test_Page SHALL 提供一个配置面板，允许把当前一名己方施法者的技能设为一组预置原型之一（至少含：单体伤害、群体伤害、溅射、真实伤害、创造宝石、摧毁行/列、摧毁指定色、转化颜色、治疗、加护甲、加攻击、中毒、燃烧、沉默、冰冻、额外回合、召唤、选定目标伤害、选定目标治疗、选定宝石引爆）。
3. WHEN 用户在测试页选定一个预置原型并触发释放，THE Skill_Test_Page SHALL 经由主游戏 Cast_Flow 释放并播放完整演出（含必要的选色/选目标/选宝石交互）。
4. THE Skill_Test_Page SHALL 提供重置控件，使角色与棋盘回到固定种子的可复现初始态。
5. THE Skill_Test_Page SHALL 展示本次释放产出的 Event_Log（有序、可读）。
6. THE Skill_Test_Page SHALL 能推进回合，以便观察状态（中毒/燃烧）的逐回合结算与到期。
7. THE Skill_Test_Page 中触发释放后需要选色/选目标/选宝石时，SHALL 使用与主游戏相同的玩家选择 UI。

### 需求 10：确定性与可测试

**用户故事：** 作为开发者，我希望新增内容延续确定性与可测试约束，这样引擎依旧可靠、演出可回归验证。

#### 验收标准

1. THE Skill_Library、Effect_Builder、以及各 Chooser 的逻辑部分（Color/Target/Cell）SHALL 位于 `src/engine` 且 SHALL NOT 依赖 pixi/gsap/dom。
2. THE 表现层演出代码 SHALL NOT 改变任何引擎状态（只读事件与角色数据）。
3. FOR 已配置技能，在相同对局状态 + 相同种子 + 相同选择（色/目标/宝石）下释放 SHALL 产出完全相同的事件流。
4. THE 引擎逻辑（技能库产物执行、三类选择机制的 AI 策略）SHALL 可脱离表现层由单元测试驱动。
5. THE 关键技能释放路径 SHALL 由端到端页面测试（Playwright）**直接在主游戏页面**验证（含短按释放、选目标/选色/选宝石），而非在独立测试逻辑上验证。
