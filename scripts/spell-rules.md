# 技能编译规则手册（spell-rules.md）

> 技能组装管线的**唯一语义依据**。组装产物（`src/engine/skills/curated/batch-*.ts`，按
> [`spell-assembler.md`](./spell-assembler.md) SOP 逐条人工核对组装，无独立生成器——
> `build_spells.mjs`/`spells.json` 方案已废弃）与运行时（`src/engine/skills/**`）都以本文件为准；
> 多义句式在这里定死一个答案，不允许实现各自发挥。修订时先改这里，再改代码。
>
> 依据：`.kiro/specs/combat-mechanics/DECISIONS.md`（范围裁定）+
> `artifacts/gap-analysis.txt`（句式统计）+ 全库 840 条带 modifier 技能的抽样核对。

## 0. 总原则

1. **描述顺序 = 段顺序**。中文描述按 `。` / `；` / `&&` / 换行切成子句，子句按出现顺序编译为效果段，执行按序结算。
2. **数值分配**：子句内出现方括号标记 `[魔法 + N]` 等 → 依序消耗 `meta.scalings` 中的下一项；无方括号的常数（"创造 9 颗"）→ 从子句文本抽数为常数缩放（mult=0）。
3. **安全跳过**：任何子句识别不出已裁定的机制 → 整条技能归入 blocked（带原因），**不静默降级**、不硬编。手写 override（`SKILL_OVERRIDES`）优先级高于生成数据。
4. **确定性**：所有随机（随机目标/随机宝石/概率子句/伤害区间）经 `ctx.rng`，同种子同事件流。
5. **目标措辞表**（己方同构，enemy→ally）：

| 官方措辞 | TargetMode |
|---|---|
| 「1 名/一名/一个敌人」「指定的敌人」 | `enemyChosen`（GoW 官方：施法方指定目标） |
| 「随机(的)敌人」 | `enemyRandom` |
| 「第一个/第一名/首名/首位敌人」 | `enemyFront`（前 N 名从**队伍顶部**数，`enemyFirstN`） |
| 「最后一名敌人」 | `enemyLast` |
| 「最虚弱的敌人」「最弱的敌人」 | `enemyWeakest`（按当前 hp，不含护甲） |
| 「最健康的敌人」「最强的敌人」 | `enemyHealthiest` |
| 「所有敌人」 | `enemyAll`（伤害段需配 `range:'all'`） |
| 「所有盟友」含施法者自身；「其他盟友」同理（引擎按存活剔除自身——当前以 allyAll 近似） | `allyAll` |

## 1. 二次缩放（[xN] / [N:M]）

**裁定语义**：加成**叠加**在基础数值上（`final = base_value + bonus`），不是乘法：

- `[xN]`（multiplier）：每 **1** 个来源 **+N**。`bonus = N × 来源数`。
- `[N:M]`（ratio）：每 **N** 个来源 **+M**。`bonus = M × floor(来源数 / N)`。

核对样例：双头怪「每摧毁一颗紫色宝石，则创造 4 颗骷髅头 [x4]」→ 4×紫色数 ✓；
泽菲罗斯「[M+8] 散射伤害，因摧毁的黄色宝石数而增强 [x10]」→ [M+8] + 10×黄色数 ✓；
亡魂「[M+5]，因骷髅头数而增强 [3:1]」→ [M+5] + floor(骷髅/3) ✓。

**边界**：来源数 0 → bonus 0，数值退化为普通一次缩放（"0 加成/1 倍"）。

**来源计数表**（执行时刻现场读，波形确定）：

| 来源 kind | 文本句式 | 计数口径 |
|---|---|---|
| `destroyedGems(color?)` | 「因被摧毁的X色宝石(数)而增强」「移除所有X宝石以增强」「每摧毁一颗X宝石」 | **本技能前序段直接摧毁**的宝石（不含连锁补充）；无色=任意 |
| `transformedGems` | 「因转换的宝石数而增强」「将X转换成Y以增强」 | 本技能前序段直接转化的宝石数（第一波不细分颜色） |
| `boardSkulls` | 「因骷髅头数而增强」 | 该段执行时棋盘上骷髅数 |
| `boardGems(color)` | 「因蓝色宝石数量而增强」 | 该段执行时棋盘上某色宝石数 |
| `selfStat` | 「因自身的护甲值/攻击力/生命值而增强」；「因自身损失的生命值」 | 施法者 attack/armor/hp(当前)/maxHp−hp/magic |
| `teamSize(side)` | 「因存活的敌军数量」「因盟友数而增强」 | 敌方/己方（含自身）存活人数 |
| `alliesOfRace(race)` | 「因野兽盟友数而增强」 | 己方该种族存活人数 |
| `enemyStatusCount(status)` | 「因被冻结的敌人数而增强」 | 敌方处于该状态的存活人数 |
| `drainedMana` | 「因所耗尽的法力值而增强」 | 本技能前序段经**削减族**（耗蓝/耗尽法力/窃取法力，reduce 族 `stat:'mana'`）实际削去的法力总量——**双方都计**，含己方耗蓝（7807 先例：「耗尽所有盟友和敌军的法力值」按总量回血） |
| `enemyStatSum/allyStatSum` | 「因所有敌人的护甲值而增强」 | 对方/己方全体的属性总和 |
| `targetStat` | 「因敌人现有生命值而增强」 | 最近目标段主目标的当前属性 |

**修饰段归属**：来源子句点名「伤害（值/效果）」→ 挂伤害段；点名属性 → 挂对应增益/削减段；
点名「创造/宝石数」→ 挂创造段；「几率因…而增强」→ 挂该段的概率加成；
否则挂**最近的数值段**。一条技能至多一个 `meta.modifier`（数据已核）。

**多同类段辖域（2026-09-16 裁定，修 7059/9344/8181「首段吃不到加成」）**：
来源子句**点名段类别**（「伤害值/伤害效果」→ 伤害段；「创造/宝石数」→ 创造段；点名属性 → 该属性段）时，
辖**其所在子句（`。`/`；`分隔）内该类的全部段**，不是只挂最近一段；跨子句不辖。
每段各自持有一份相同的 modifier 数据（执行时各自读源计数，同源同值），数据模型不变。
- 7059「对第一名和最后一名敌人造成 [魔法+1] 点伤害，并移除所有紫色宝石以增强伤害效果。」
  → 点名「伤害效果」：同一子句的两段伤害（front+last）**都**挂 modifier；
- 9344「对首位和末位敌人造成 [魔法+2] 点伤害，伤害值因紫色宝石数而增强。」→ 同上；
- 8181 的修饰子句只包着溅射段；后续「窃取所有敌人 10 点生命值。」是独立子句 → **不辖**（窃取不吃 [x8]）。
- 修饰子句**未点名**类别（「数值因…增强」「以增强效果」泛指）→ 维持既有口径挂最近数值段
  （7027/7334/8614/8297 等已验收条目不变；官方复核若判定泛指也应辖全段，另开批统一改）。

**明确 blocked**：来源为黄金/灵魂/藏宝图/赏金（元经济）、炸弹/厄运等特殊宝石、
献祭军队属性、被减除的护甲值、造成的伤害等 exotic 句式 → 该条归 blocked。

## 2. 概率子句（chance）

- 「有 N% 的几率 <效果>」→ `<效果>段.chance = N/100`。
- 掷签在段执行前统一做：`ctx.rng.next() < chance`，不通过 → 整段跳过
  （不发事件、不更新跨段追踪、不占用死亡条件的「主目标」）。
- 边界：chance=0 恒不发；chance=1 必发（`next() ∈ [0,1)`）。
- 「几率因X而增强 [xN]」→ `chance = base + N×来源数/100`，夹在 [0,1]（少量召唤技能）。
- 连带子句的归属：概率只辖其所在子句描述的效果，不辖整条技能。

## 3. 敌方削弱家族（reduce）

一个 `reduce` 段覆盖全家族，复用 `buff` 事件（削减=负数，获得=正数）：

| 句式 | 段参数 |
|---|---|
| 「减除(所有)敌人 X 点护甲/攻击/魔法」 | `stat='armor'|'attack'|'magic'` |
| 「耗尽(一名)敌人的法力值」「法力燃烧」清蓝语义 | `stat='mana', drainAll=true`；「耗掉 X 点法力」= `stat:'mana'` 带数值 |
| 「窃取 X 点护甲值并将之转为魔法值」 | `stat='armor', gainStat='magic'`（gainRatio 默认 1） |
| 「耗尽其法力值并获得其中半数」 | `stat='mana', drainAll=true, gainStat='mana', gainRatio=0.5` |
| 「将敌方攻击力减半」 | `stat='attack', halve=true`（按当前值 50% 下取整，原语批 §9.6） |

- 夹零：属性 `Math.max(0, …)`，mana 至多清到 0；实际变化 0 → 不发事件。
- **织网交互**（任务书明示）：web 锁的是 magic **属性增益**、不是 mana 充能——
  被织网者照常被耗蓝/偷蓝；施法者被织网时「窃取转 magic」的自身获得被拦截为 0。
- 窃取所得走 `buffOne` 口径（hp 上限/mana 上限/治疗修正一致）。

## 4. 死亡/阵亡条件（ifTargetDied）

- 句式：「如果该敌人身亡，…」「如敌人身亡，则…」「如果敌方死亡，…」。
- **定死一种段结构**：后段挂 `ifTargetDied: true`，判定 =
  **最近一个解析出目标的效果段的主目标**（其首个目标）在该段执行前存活、
  执行后阵亡（阵亡者被移出队伍同样算）。
- 前面没有产目标的段、或主目标未死 → 条件段整体跳过。
- 可挂任何段（创造/增益/额外回合/召唤…）。

## 5. 种族条件翻倍（raceDouble）

- 句式：「如果盟友是一名机械军队，则效果翻倍」「若盟友是X族，效果翻倍」。
- 前置效果段挂 `raceDouble: '<TroopType>'`；执行时**逐目标**判定：
  目标/受益者 `troopTypes` 含该族 → 其数值 ×N，否则原值（群体段中只有该族目标翻倍）。
- **倍率参数 `raceTimes`**：「翻 3 倍」「×3」类句式挂 `raceTimes: 3`（缺省 2 = 翻倍）；
  伤害/增益/削减三族段都支持（damage.ts / buff.ts / debuff.ts 同名参数）。
- 例外：溅射伤害是共享伤害池，简化为「主目标属该族 → 整池 ×N」（当前数据该组合为零）。
- 注意与「若敌人是个魔头/基于晋升稀有度 3-5 倍」区分：那是晋升度条件，**不做**（blocked）。

## 6. 目标口径与数值口径细则

- 「获得 X 点生命」= 治疗自己（`heal('allySelf')`）；「给予盟友 X 点生命」= 治疗他人（`allyChosen`/`allyAll`）。
- 「获得 X 点随机技能值」= 随机属性获得（GoW：每点随机分给攻/甲/血/魔之一），种子化逐点投。
- 「随机技能值」按 magic 处理缩放（与特质生成器同口径）。
- 治疗不超过 maxHp；法力不超过 manaCost；增益对织网者的 magic 获得为 0（窗口 A 已落）。
- 「前 2 名敌人」从队伍顶部数（索引 0 = 顶）。
- DoT（中毒/燃烧）默认 3 回合、每回合 3 点（官方数值来自技能文本的以文本为准）；
  施加状态的回合数/伤害量若文本明示则覆盖默认；「N 层」→ `opts.stacks`（最终 magnitude = 每层值 × 层数）。
- 出血 bleed 默认**每层 1 点**/回合（官方语义，builders 对 DoT 与 bleed 区分默认值；2026-09-15 起启用）。
- 状态词表（引擎已实现，技能侧可组装）：
  中毒 poison / 燃烧 burning / 出血 bleed / 沉默 silence / 冰冻·冻结 frozen / 眩晕·击晕 stun /
  纠缠·缠绕 entangle / 织网 web / 屏障 barrier / 下潜 submerged / 猎人标记 marked（纯标记态）/
  疾病 disease（获得法力减半）/ 诅咒 curse（剥正面状态·自动解除减半·穿普通免疫）/
  死亡标记 death-mark（每回合 10% 即死）/ 狂怒 rage（骷髅 1.5x·无视特质·攻击后逝）/
  魅惑 charm（骷髅改打己方下一名存活）。连字符/下划线别名（death_mark/cursed/charmed 等）同义，
  组装统一用上表规范拼写。
  ~~恐怖/妖火~~ → **2026-09-16 状态宝石批·波A 状态本体落地**：恐怖 terror（每回合 10% 队伍位次
  下移一位，4 回合）、妖火 faerie-fire（所受**法术**伤害 +50%，AUTO_RECOVER 累计 10% 自愈）——
  引擎已可施加，但 spellData STATUS_WHITELIST 尚未放行技能侧组装（下次回收批随用随扩）。
  仍 blocked：狼化（缺变形/形态切换机制）、法力燃烧（官方非持续状态，耗蓝句式走 reduce 族）、
  石化/附魔等未实现状态。~~风暴（技能侧无创造风暴原语）~~ → **2026-09-16 引擎原语批落地**，
  createStorm 效果段可组装（见 §9）。
- 「净化」= 移除己方全部状态（cleanse）；「驱散某单一状态」（「驱散其流血效果」）=
  `dispelStatus`（只移除该 id 状态，发 status-expire，见 §9）；「消除敌方正面增益」=
  按状态逐一驱散可表达（dispel 挂目标相对条件），泛指「驱散全部增益」仍不做（blocked）。

## 7. 「不做」清单（直接 blocked，对齐 DECISIONS.md ⏸️）

- 元经济：黄金/灵魂/英里/赏金相关子句（73 条）。
- 晋升度/魔头/高塔条件（101 条，其中 39 条与种族翻倍复合——复合条只译种族翻倍部分若其余可译）。
- 仍未实现的状态家族：狼化（缺变形机制）、石化/恐怖/附魔等（引擎无语义）。
  ~~诅咒/死亡标记/猎人标记/疾病/魅惑/狂怒~~ → **2026-09-16 特殊状态批落地，移出不做清单**（词表见 §6，技能侧可组装）。
  ~~风暴（技能侧无创造风暴原语）~~ → **2026-09-16 引擎原语批落地**（§9）。
- 特殊宝石创造/引用：~~炸弹/厄运/织网宝石/幽魂/沙漏/通配/许愿/闪电~~（窗口 C 已落地可组装）；
  ~~燃烧/冻结/诅咒/流血/毒/死亡标记/恐怖/缠绕/激怒/沉没/精灵火/打昏/屏障~~（**2026-09-16 状态宝石批·
  波A 落地**，GEMS-SEMANTICS-2 A/B 组 13 颗，createSpecialGems/transformToSpecial/destroy(explode)
  Random/引爆/boardSpecial 全链可组装；「妖仙宝石」= 精灵火宝石 faerieFireGem，官方 SpellSteps
  Color1=FaerieFire 实锤）；
  龙/巨人/天使/元素星/暗影之星/灵力/法力药水/恶魔传送门/石像鬼/石块/赃物/腐朽/狼人宝石等
  其余家族仍 blocked（等 GEMS-SEMANTICS-2 后续波，DECISIONS 翻案记录②）。
- 隐匿/位置操作（~~打乱板面~~ → 原语批已落地；「上下相邻敌人」等其余位置措辞仍 blocked）、
  驱散敌方全部增益（7 条）、伤害区间（32 条，待「顺路」批次）、动态颜色/混合色（31 条，待「顺路」批次）。
- 「随机发生任何情况」类混沌技能、识别不出效果的 20 条 → 永久排除。
- ~~「有 N% 的几率跑掉」逃跑机制~~ → **2026-09-16 四项拍板③落地**（§10.1 escapeChance 效果段，fled 方案），批次 39 起可组装。

## 8. 构建期护栏（断言失败 = 构建失败）

- 所有段可 JSON 序列化（往返一致）。
- 常数数值界限（以全库数据推导）：伤害/削减 ≤ 全库最高血量 × 2；治疗 ≤ 全库最高血量；创造数量 ≤ 32。
- `meta.scalings` 消耗数 = 编译消耗数（不多不少；有剩余 → 该条 blocked，防止错位错配）。
- 批文件（`src/engine/skills/curated/batch-XX.ts`）内条目按 spellId 升序，`desc` 与 troops.json
  逐字锚定（tests/unit/spellData.test.ts 校验），保证可对账 diff。记账：`artifacts/spell-build.txt`。

## 9. 引擎原语批（2026-09-16 · DECISIONS 翻案记录②，批次 37 起可组装）

1. **创造风暴 createStorm**：「召唤/创造/发起一场X风暴」→ `createStorm(color)` 效果段。
   颜色映射同特质风暴表（暗=Purple、火=Red、冰=Blue、光=Yellow、叶=Green、尘=Brown）；
   骸骨风暴 = `createStorm(BaseColor.Brown, { dropKind: 'skull' })`、末日/超级末日风暴同理
   （dropKind 'doomSkull'/'uberDoomSkull'）。持续回合缺省 **8**（官方口径）；文本明示回合数时
   `turns` 覆盖。设置走 TurnEngine 同一份「全场唯一、后召顶替先召」裁定（applyStormToTeam），
   事件形态与死亡召唤/开局风暴逐字节一致（storm-change set/replaced/expired）。
2. **风暴在场条件 stormPresent**：`{ kind: 'stormPresent' }` = 任意风暴在场；`{ color }` 筛色；
   `{ dropKind: 'skull' }` 筛骸骨风暴（7530「如果现有骸骨风暴」）。全局条件整段判定，
   可挂 ifCond / condMult / condBonus。
3. **oneOf 随机多选一**：「X 或 Y」「或 A 或 B 或 C」→ `oneOf(分支…)`，执行时 rng 掷选一支
   （均匀、种子化）；未选中分支完全不执行、不发事件、不消耗其随机数。一支可为一至多个段
   （「造成真实伤害，再陷入燃烧。或摧毁所有炸弹宝石」= 两支，第一支两段）。
   **裁定**：「或」一律读作掷签二/三选一；若官方语义实为条件选择（「若…否则…」），文本必含
   条件词，走 ifCond 而非 oneOf。多色池（「绿色或紫色宝石」作为一个池子随机取）**不是**二选一，
   仍 blocked。
4. **定量转换**：transform 带 `count`（「将一颗宝石转换成炸弹宝石」= 随机取 N 颗转换）；
   来源可为 `'ANY'`（不限色，排除已是目标类型的宝石）；端点可特殊宝石（toSpecial）。
   「将 2 颗紫色宝石转换成X」= `transformToSpecial('Purple', X, { count: 2 })`。
5. **定向驱散单一状态 dispelStatus**：「驱散其流血效果」→ `dispelStatus('bleed', target)`——
   只移除该 id 状态，发既有 status-expire；正面/负面皆可驱（由文本点名状态决定）。
6. **比例法力/属性减半**：
   - 削减侧 `reduce(t, stat, …, { halve: true })`：「将敌方攻击力减半」——按该属性**当前值**
     50% 下取整逐目标现算（attack/armor/magic/mana/hp 通用），忽略数值缩放；
   - 获得侧 `mana('allySelf', 0, 0, { halve: true })`：「获得半数法力值」——**裁定**为获得
     半条法力 = `floor(manaCost / 2)`（GoW「gain half mana」按法力条口径），受 manaCost 上限夹取。
7. **聚合存在判定**：`{ kind: 'anyEnemyStatus', statusId }` / `{ kind: 'anyAllyStatus', statusId }`——
   任一存活敌人/盟友（含施法者）带该状态即真；全局条件整段判定（与「逐目标过滤」的
   targetStatus 明确区分，8418/8743/8138 口径）。
8. **数量区间**：
   - 目标数 `nRange: { min, max }`：「使 1 到 4 名敌人中毒」→ `enemyRandomN` + nRange（rng 掷选）；
   - 创造/随机爆破数 `countRange: { min, max }`：「创造 8-12 颗紫色宝石」「创造 1-2 颗炸弹宝石」。
   两者均种子化、每段掷一次。**注意**：数值型区间（「给予 3-8 点法力」「叠加 2-4 层出血」）
   不是数量区间，仍 blocked（数值不明）。
9. **打乱板面 shuffleBoard**：「打乱板面」→ 满盘时复用 boardUtils.reshuffle（宝石 id/类型不变），
   发既有 reshuffle 事件；洗出的三连照常结算（与死局重排同一条规则）。
10. **位置复合目标 enemyChosenAndBelow**：「对一名敌人和其下方的所有敌人」→ 指定敌人 +
    编队中更靠后（纵队下方，索引更大）的全部存活敌人。GoW 编队 0=顶；「下方」即更靠后的站位。
    「上下相邻的敌人」（前后各一名）语义另一读法，暂 blocked（8943）。

## 10. 逃跑与战场经济（2026-09-16 · DECISIONS 四项拍板①③，批次 39 起可组装）

1. **逃跑 escapeChance**：「有 N% 的几率跑掉」→ `escape(N/100)`（`{ kind: 'escapeChance', escapeChance }`）。
   恒作用于**施法者本人**（官方语义：兵种自己逃出战斗）。判定成功 → 标 `fled` 并发 `flee` 事件
   （带 hp/armor 快照），编队移出复用 defeat 的 splice+队列补位管线，但**不置 defeated、不发
   defeat**——死亡召唤/阵亡响应（挥金/灵魂类）一律不触发。全队逃光 → 编队空 → isWipedOut
   判定败北。判定失败零事件（rng 照常消耗，保证同种子同事件流）。**不**走段级 chance 管线
   （escapeChance 字段独立命名，避免"段是否执行"+"是否逃跑"双重掷签）。
2. **战场经济三币种**：金币 gold / 灵魂 souls / 宝石 gems 战斗内计数，挂在
   `GameState.economy` **共用池**（GoW 战斗奖励归玩家，敌我施法的获得都进同一池；
   `economy-gain` 事件的 side 字段记录获得发生时的行动方，仅作归因）。
   - 获得段 `gainGold(base, mult)` / `gainSouls` / `gainGems`：「获得 10 金币」「获得 [魔法+2]
     点灵魂」；数值走一次缩放 + modifier 二次缩放，照常。
   - 二次缩放来源 `battleGold` / `battleSouls` / `battleGems`：「伤害值由我的金币加成 [10:1]」=
     `{ mod: { kind: 'ratio', a: 10, b: 1 }, source: { kind: 'battleGold' } }`——读池子当前总额。
   - 结算上报：BattleSession 结果新增 `economy`（三币总额）与 `fledExternalIds`（逃跑者，
     不计入 defeatedExternalIds、不按击杀记账）。
3. **赃物宝石 Booty Gem**（「战利品宝石」为同物译名）：不可匹配、无法力色；被摧毁时给
   摧毁方（当时行动方）+10 金币（`BOOTY_GEM_GOLD`）。创造 `createSpecialGems({ kind: 'bootyGem' }, n)`；
   技能清除/爆破/末日骷髅爆炸圈摧毁均结算金币。不自然掉落。
4. **战后经济特质钩子**（traits 侧，merchant/necromancy/necromaster/moneybags 四 code）：
   「从战斗中获得 N% 额外灵魂/黄金」「在战斗中获得 N% 黄金加成」→ `battleEconomyGain`
   （traits.json 生成键）→ 编译进 `PassiveModifiers.battleEconomyGain`（同类比率累加）；
   TurnEngine 在本场**首次**判出胜负时对玩家侧（Left）开局编队的比率合计 Σratio 放大共用池
   （gold/souls 各自 `floor(总额 × (1+Σratio))`）。敌方比率不放大（奖励归玩家）。
   晋升度缩放族（bountyhunter/godslayer 等）仍 blocked，待晋升批。
5. **「藏宝图」仍 blocked**：战斗外收集物，本作无对应系统（9002/7420/7466/7279/8555 维持
   blocked，理由已按本节口径改写）。
