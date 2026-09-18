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
| 裸散射句式（「造成…点(真实)散射伤害」无任何目标词；2026-09-18 官方 SpellSteps 重裁，推翻 09-17 旧裁定） | `enemyAll` + `range:'all'`（**全体散射**。官方实锤：ScatterDamage/TrueScatterDamage@AllEnemies 16/16、无一带 FromTarget——8459/8586/8678/8827/8934/9175/9493/9673/9710/8841/8027/8860/8651/9865/9222/9807；伤害覆盖面按全体算，不再走 enemyChosen 溅射链） |
| 裸伤害句式·非散射（「造成…点伤害」无任何目标词；2026-09-17 用户裁定回收批，维持） | `enemyChosen`（单敌；「对 1 名敌人…散射/溅射」才是溅射链） |

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
  下移一位，4 回合）、妖火 faerie-fire（所受**法术**伤害 +50%，AUTO_RECOVER 累计 10% 自愈）。
  ~~赐福/附魔/反射/激怒~~ → **2026-09-17 R10 正面状态批落地**（官方帮助中心「All status effects」
  + wiki 状态表交叉核实，STATUS_WHITELIST 同步放行）：
  **赐福 blessed**（施加时净化全部负面状态；存续期间免疫一切状态施加；与诅咒互相抵消；
  纯时限到期——官方无「施法/骷髅后结束」条款；中文「赐福/祝福」同义；gowhead 步骤 `CauseBlessed`）/
  **附魔 enchanted**（持有者每回合开始 +2 法力，直到其施放法术——TurnEngine 施法口在效果执行
  前移除，turns 仅兜底；沉默期间不可获得；gowhead 步骤 `CauseEnchanted`）/
  **反射 reflect**（所受伤害 50% 反弹给来源、至少 1 点，原伤害照常，**受一次伤害后消失**；
  屏障整发吸收=没被打中不触发；gowhead 官方步骤名 `CauseMirror`、中文数据译「反射」，
  组装侧一律写 `reflect`——与 traits.json mirrorimage/reflectivesurface 既有拼写一致）/
  **激怒 enraged**（= 狂怒 rage 同族别名：骷髅 1.5x·无视特质·攻击后逝；gowhead 步骤
  `CauseEnraged`，组装侧按官方步骤写 `enraged`）。
  仍 blocked：狼化（缺变形/形态切换机制）、法力燃烧（官方非持续状态，耗蓝句式走 reduce 族）、
  石化等未实现状态。~~风暴（技能侧无创造风暴原语）~~ → **2026-09-16 引擎原语批落地**，
  createStorm 效果段可组装（见 §9）。
- 「净化」= 移除己方全部状态（cleanse）；「驱散某单一状态」（「驱散其流血效果」）=
  `dispelStatus`（只移除该 id 状态，发 status-expire，见 §9）；「消除敌方正面增益」=
  按状态逐一驱散可表达（dispel 挂目标相对条件），泛指「驱散全部增益」仍不做（blocked）。

## 7. 「不做」清单（直接 blocked，对齐 DECISIONS.md ⏸️）

- 元经济：黄金/灵魂/英里/赏金相关子句（73 条）。
- 晋升度/魔头/高塔条件（101 条，其中 39 条与种族翻倍复合——复合条只译种族翻倍部分若其余可译）。
- 仍未实现的状态家族：狼化（缺变形机制）、石化等（引擎无语义）。
  ~~诅咒/死亡标记/猎人标记/疾病/魅惑/狂怒~~ → **2026-09-16 特殊状态批落地，移出不做清单**（词表见 §6，技能侧可组装）。
  ~~赐福/附魔/反射/激怒~~ → **2026-09-17 R10 正面状态批落地，移出不做清单**（词表见 §6；注意
  「激怒宝石」是特殊宝石≠激怒状态，后者 enrageGem 已在波A 落地）。
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

## 11. 回收原语五件套（2026-09-17 用户裁定：献祭/兵种转化/随机状态/藏宝图/特定兵种在场）

1. **献祭**：「献祭一名盟友」= 随机**其他**盟友（不含施法者，官方手感）→ `sacrifice('allyOthers')`。
   即杀走 execute 管线（defeat/阵亡钩子照常，含死亡召唤）；「因献祭军队的攻击力而增强」→
   modifier 来源 `sacrificedStat{stat}`（跨段追踪被献祭者属性快照）。
2. **兵种转化**：「将一名(随机)敌人转化为怨灵」→ `transformTroop(target, 'Banshee')`（ref=referenceName）。
   目标**就地替换**（保留 id/编队位），数值/技能/特质取模板，血量满、法力清零；不触发阵亡/召唤钩子
   （官方「转化不是死亡」）。发 `troop-transform` 事件（表现层刷新卡面）。
3. **随机状态**：「造成随机状态效果」→ `inflictRandom(target)`，每目标独立掷签负面池
   （poison/burning/bleed/silence/frozen/stun/entangle/web/disease/curse/death-mark/charm）。
   **引擎缺口**：randomStatus 段不支持 `n`/`nRange`（段类型只有 turns/times），「对最后 2 名各一个
   随机状态」类多目标无法单段表达（8572，官方 RandomStatusEffect@LastTwoEnemies）——组装侧
   暂以单目标近似并注明，待引擎扩 RandomStatusSegment 后回收。
4. **藏宝图**：战场经济第四币种。`gainMaps(n)`（「有 20% 几率获得一张」= `gainMaps(1,0,{chance:0.2})`）；
   来源 `battleMaps`（「每收集到一张藏宝图，额外创造 4 颗 [x4]」= createSkulls 挂 modifier）。
5. **特定兵种在场**：「若自身队伍有梁帝」→ `ifCond: { kind: 'troopPresent', side: 'ally', name: '梁帝' }`
   （**中文名**匹配存活者，与召唤引用的 referenceName 体系区分；side 缺省=己方，全局条件整段判定）。

### §11 补充（2026-09-17 第二次裁定）

- **随机状态阵营分池**：赋予盟友 = 正面池（barrier/rage/submerged，引擎已实现施加管线者）、
  赋予敌人 = 负面池（12 种）。`inflictRandom(target, { times: N })` 支持「陷入 N 个随机状态效果」
  （逐次独立掷签，同状态走 applyStatus 合并口径）。
- **敌方颜色动态取色**：ColorSpec 新增 `'ENEMY'`（随机存活敌人的一种法力色，多色 rng 掷选）
  与 `'LAST_TARGET'`（跨段追踪目标的一种法力色）。「创造指定敌人的法力颜色宝石」= `createGems('ENEMY', N)`；
  「将该敌人的一种法力颜色的所有宝石转化为X」= `transformToSpecial('LAST_TARGET', X)`。

### §11 追加（R4 批，2026-09-17）

- **selfStatus 条件**：「若自身身处狂怒状态」→ `{ kind: 'selfStatus', statusId: 'rage' }`（全局条件）。
- **并列数值段共用 scaling**：「获得 [M+1] 点护甲值和攻击力」单方括号管两段 → 两段同值
  （meta.scalings 仅 1 条时的固定口径）。
- **裸单颗宝石操作**：「爆破/摧毁一颗宝石」无 随机/选定 修饰词 = 随机一颗
  （与裸伤害句式同理，汉化省略修饰词）。
- **「有 N% 几率自毁」** = `sacrifice('allySelf', { chance: N })`。
- **「有等同于自身魔法值的几率摧毁敌人」** = execute 段 `chance: 0` +
  `chanceBoost { multiplier 1, selfStat magic }`（概率 = chance + boost）。
- **50/50 二选一伤害**：「有 50% 的几率造成三倍伤害」= `oneOf([三倍段], [一倍段])`（两支必走一支）。

## §12 位置/分摊/跨段绑定/召唤区间/once-per-battle/否定（2026-09-17 用户裁定）

1. **位置**：`reposition(target, 'front'|'back')`（「击回末位/拉至首位/移至队伍首位」）改编队顺序；
   `shuffleTeam('enemy')`（「打乱敌方队伍」）整队种子化重排。发 troop-reposition / team-shuffle 事件。
2. **分摊**：「造成 [A]–[B] 点伤害 到 {N}」= `dmg(target, …, { rangeSpec, split: N })`——
   掷一次总额，均分给前 N 名存活敌人（余数给靠前者）。
3. **跨段绑定**：目标模式 `'lastTarget'`（「对随机敌人伤害，再使他陷入X」的「他」）——
   指向最近产目标段的主目标，不重抽 rng。
4. **召唤数量区间**：`summonRef(ref, undefined, { countRange: { min, max } })`（超额进队列）。
5. **once-per-battle**：`skillOnce(...段)`——本场重复释放被引擎拒绝（不占号）。
6. **否定条件**：`{ kind: 'not', cond: … }`（「板面上没有一颗紫色宝石」）。
7. **重获消耗法力**：mana 段挂 `modifier { multiplier 1, selfStat manaCost }`。

## §13 长尾清尾（R6 批，2026-09-17）

1. **'&&' 子句切分**：'&&' 本就是 §0.1 的合法切分符——纯 '&&' 拼接的描述按段顺序直接组装，不再 SKIP。
2. **属性比较**：`{ kind: 'casterStatBeatsTarget', stat: 'attack'|'armor'|'magic'|'hp' }`——
   施法者该属性 > 跨段追踪目标该属性（全局条件；「若自身攻击力较高」「若敌人的魔法值高于自身」
   反向用 targetHpDamaged 思路取反或对调双方，当前仅支持施法者>目标的正向比较）。
3. **聚合存在（超集口径）**：「若其中一个使用X法力」→ `{ kind: 'anyEnemyColor', color: X }`
   （任一存活敌人带该法力色；对「首位和末位之一」是超集，已标注）。

## §14 武器法术解析器冲刺（K-B3，2026-09-18；分布 320/382/16 → 418/288/12）

> 以下裁定均锚定 `artifacts/gowhead-weapons/raw/weapons.gow.en.json` 英文原文消歧（zh 为锚、
> EN 为译名/语义判据）；生成器 `scripts/_weapon_pools.mjs`，条目号 = SpellId。

1. **「boosted by」修饰句大族归一**：「因X而增强/加强」「由X激发/增强/加成」「受到X盟友的加成」
   「X盟友(和Y盟友)可提升伤害」「X的敌人伤害加成」「数二增强」（机翻 而→二）——一律读 §1 修饰段：
   挂最近数值段；来源经 parseModifierSource（盟友族→alliesOfRace、色盟友→alliesOfColor、
   骷髅头→boardSkulls、状态→statusCount、战场经济→battleGold/battleSouls、特殊宝石→boardSpecial）。
   双来源「A色盟友和B族盟友(的数量)」（9510/9833/9690/8811 族）→ `sources: [alliesOfColor, alliesOfRace]`。
2. **王国盟友计数诚实拒绝**：「伤害值因玉银林地盟友数而增强」曾被泛化回退 `盟友→teamSize(ally)`
   （= 数全体盟友，语义错误）。修正为拒绝并归 kingdom-count 特征；9302/9354 随之诚实降级
   full→partial，待王国批 alliesOfKingdom 来源接线后自动回收（引擎 Condition/来源 kind 已备）。
3. **「魔头=Boss」重裁（推翻 §5 旧读法）**：「若敌人是个魔头/若敌方有魔头」EN "If enemy is a Boss"
   —— troops.json troopTypes 含 `Boss`，引擎 targetRace/enemyRacePresent 按族判定即可表达
   （与「基于晋升稀有度 N 倍」的晋升度条件无关，后者仍 blocked）。§5 的「魔头条件不做」限定撤销。
4. **机翻定点归一（EN 逐句核实）**：「结果 [魔法+N] 给予一名敌人(超级)重击」= (严重的)溅射伤害
   （8512/8521，mana-only → 回收）；「摧毁N枚宝石的法力颜色之一」= 爆破N颗其法力颜色宝石
   （LAST_TARGET）；「从所有敌人中清空两个玛那」= 耗掉所有敌人 2 点法力（8400）；「在使其中毒」
   （7194）；「还/额外」句首连接词；「， 则」逗号后空格；条件子句缺「则」自动补齐（7294 族）。
5. **「全部技能值增加 N 点」** = 四项技能（攻/甲/血/魔）各 +N，逐项落段（§6 状态池展开同款）；
   「获得 N to all Skills」（7294/7864）。
6. **独立掷签 ≠ oneOf**：「有 N% 个别几率获得 A 和 B」（8283，EN independent chances）→
   A、B 各自挂段级 `chance`；「几率因X而增强」无量化倍率时按模糊增幅记省略。
7. **「每有一名X盟友，则消耗 N 点法力」**（9579）= reduce(目标, mana, N) + alliesOfRace 修饰。
8. **up-to 数值口径**：「耗尽一名敌人最高 12 点法力值」（7866）= reduce(mana, 12)——引擎 mana
   夹零下限即 up-to 语义，诚实等价；创造数量 = drainedMana 修饰（尾部 [N:M] 即每点法力 +N 颗）。
9. **编队上下方**：「使其上方所有敌人…」（9162）→ enemyAboveTarget / enemyBelowTarget（R13 原语）；
   「对一名敌人和其下方的敌人」（8154）→ enemyChosenAndBelow。无 enemyOthers/「另一名敌人」
   目标模式 → 诚实略去（7754/7285）。
10. **盟友随机状态无「正面」修饰**：「赋予所有X盟友一个(随机的)状态效果」EN "Grant a random
    Status Effect to all X Allies"（8384/8437/8449/8490/8509/8576/8621/8622/8706/8771/9033/9754/
    9916 族）→ 按 §11 补充「赋予盟友=正面池」口径，与「随机正面增益」同读。
11. **具名特殊宝石定量/全体爆破**：「引爆3颗激怒宝石」（9747）→ explodeRandomSpecialGems；
    「引爆所有恶魔传送门宝石」（9486）→ explodeSpecialGems（无 opts 形参，禁止挂条件——
    条件用法归 conditional-clear，9486/9809/9983/9381）。
12. **modifier-tag 孤儿治理**：138 → 110。尾部 [xN] 在其归属子句可编译时随规则挂载
    （「可提升伤害」「由X激发」族 → tag 即乘数）；归属子句因引擎缺口被略去时
    （doom/王国/exotic 计数）维持不挂载、不硬凑——「无可靠挂载段」记录保留。
13. **新特征键（PRIM 请求）**：boss-condition（如未来需晋升口径再议）、random-status-nrange
    （「陷入 1 到 4 个状态」inflictRandom 无 times 区间）、destroyed-gem-status-trigger
    （「每摧毁一颗X宝石则燃烧」触发式状态）、reposition-nrange（「将 1-2 位敌人由首位打到末位」）、
    all-status-grant（「赋予一名盟友所有状态效果」全池口径未考证）、stone-block-count
    （8400 石墩计数，无对应 SpecialGemKind）。
14. **诚实降级/维持 mana-only 余量**：7071（{1} 占位符）、7188/7199（stat 翻倍）、7190（基数取
    目标属性）、7217（行绑定清除）、8529（敌方最常用色）/8577（多档通配）/8578（五色药水池）/
    8965（X 形清除+逐摧毁触发祝福）、8966（x3 通配转换）、10045/10063/10065（EN-only 快照）——
    均为引擎/数据缺口，不硬凑。

## §14.5 K-E 引擎原语批接线（第五轮，2026-09-18；分布 418/288/12 → 610/96/12）

> 四族原语（builders.ts K-E 批：temperingBoost/boostPer/enemyHasDoom/kingdomPresent/
> kingdomOf/targetKingdom/alliesOfKingdomBoost/enemiesOfKingdomBoost/enemiesOfRaceBoost/
> summonRandomOfKingdom + R12 mana.fraction）接入生成器，全部按本节裁定消费：

1. **tempering 完整编译**（推翻 §14 的「参数化省略」）：「每锻炼 1 个武器段位则 +N 点伤害值 /
   +N 颗宝石 / 每级回火 +N 点 / 每提升一级强化等级额外增加 N 点」→ `modifier temperingBoost(N)`
   挂本子句数值段（无则挂最近数值段；仍无 → 记省略）。「(每个)回火等级有 N% 的几率杀死敌人」→
   前置处决段 chanceBoost（无前置 → 新建 execute 段 chance 0 + boost——level 0 恒不触发，8726-8728）。
2. **劫数条件**：「如果敌方/他们(拥有|带有|有)劫数/末日/厄运/毁灭之力」→ enemyHasDoom()，结论三形态：
   「再增加/再给予 N 点」= condBonus 挂前段；「可造成双倍/三倍伤害」= condMult 挂前伤害段；
   其余（「再创造 N 颗」lastCreate 复用、「恢复我四分之一的法力」mana fraction 0.25、
   「先破坏其护甲」reduce drainAll）= parseSub + ifCond。
3. **王国族**（王国名一律用 zh 原文名，与 troops.json/CombatantSnapshot kingdom 同口径；
   王国判定先于种族表——「龙爪盟友」是王国 ≠ 龙族）：
   - 「若敌人来自X，或战斗发生在/位于X，则 N 倍伤害」→ anyOf(kingdomOf enemy, kingdomPresent) condMult；
   - 「如果盟友来自X，则为他们提供屏障」→ payload 段挂 `targetKingdom:'X'`（8971）；
   - 「伤害值因X王国盟友(敌人)数而增强」→ alliesOfKingdom/enemiesOfKingdom 来源
     （修正第四轮 teamSize(ally) 误读，9302/9354 回收）；
   - 「每有一名X王国盟友，则创造 N 颗宝石」→ 同上修饰；「召唤一名/1 到 3 名X王国军队」→
     summonRandomOfKingdom（countRange 支持，7816）；「赋予所有X王国盟友随机正面」→
     inflictRandom targetKingdom；「使所有X王国盟友获得…」→ 增益段 targetKingdom（9914/10050）。
4. **敌侧计数**：「每有一名X色(族/王国)敌人则创造/给予…」→ enemiesOfColor/enemiesOfRace/
   enemiesOfKingdom 来源（7655 混合骷髅端点仍卡 createMix-special；8872/8873 巨人宝石回收）；
   「几率因恶魔敌人数而增强」→ enemiesOfRace（8391/8392）；「因敌我双方的X色军队/巨人军队/妖仙
   数量」→ [alliesOf*, enemiesOf*] 双来源（7250/7445/8075）；「敌我双方的黄金数」→ battleGold
   （黄金共用池 §10.2，8073）。
5. **配套小裁定**：「如果他们使用X法力，则…」主语补 他们；「若敌人陷入出血状态，则伤害翻倍」
   （省「造成…伤害」）；「战斗位于X」＝「战斗发生在X」；「伤害只因X而增强」「伤害力由X而增强」
   机翻词序；「获得一个随机正面状态效果」＝自身随机正面（inflictRandom pool positive，9211）；
   「每有一名X敌人则给予所有盟友 N 点属性」＝计数增幅全体增益（7982/8047）；
   classify 的 doom 特征排除「末日骷髅头」子串误配。

## §14.6 K-B 收官轮（第六轮，2026-09-19；分布 610/96/12 → 683/27/8）

> 窗口 K 授权动 src/engine（台账 K-B 六轮行）：builders.ts（anyEnemyDied / transformToSpecial
> spec 形态 + opts.tier / 六个清除构造器补 opts）、effects/gems.ts（toSpecial spec 形态）、
> prototypes.ts 零改动（ifCond/anyTrackedDied 既有管线通用）。生成器接线 + 解析长尾，
> 零降级（无一带既 full 降 partial）：

1. **anyEnemyDied 条件（6 把）**：EN 考证「If an Enemy dies, …」（7117/7861/8075/8076/9629/9903）
   ＝**本咒语执行中任一敌人被击杀**（即时死亡判定），非「本战斗曾有敌人阵亡」——与 R22 已落地的
   `anyTrackedDied`（9986/9812/7747「若有敌人死亡」先例，读跨段追踪 allTargets）完全同口径。
   故**不新增 Condition kind**：builders.anyEnemyDied() = `{ kind: 'anyTrackedDied' }` 专名形态，
   配 opts.ifCond 消费。无量词裸形「如果敌人身亡，则X」仍走 ifTargetDied（追踪主目标）。
2. **createMix 特殊宝石端点（9 把）**：引擎 createGemsMixAny（R22 mixAny）本已支持
   色/'SKULL'/SpecialGemSpec 三类端点——本轮生成器接线：混合句端点逐个解析（色优先，骷髅头
   →'SKULL'，matchSpecialGem→spec；纯色并集仍走既有 createMix 形态，旧批次产物不变）。
   7655-7660「每有一名X色敌人则创造 N 颗混合X色和骷髅头的宝石」＝**base 0 × enemiesOfColor**
   倍率（官方「N per Enemy」总数口径；尾部 [xN] 即 gowhead 对每名 N 颗的编码，与句内 N 同值）。
3. **TransformOpts tier 通道（8966）**：TransformGemParams.toSpecial 扩为
   `SpecialGemKind | SpecialGemSpec`（对齐 createSpecialGems spec 形态）；transformToSpecial
   增 opts.tier、TransformOpts.tier。「将选定的法力宝石转换为 x3 通配符」＝
   `transformToSpecial('CELL', { kind: 'wildcard', tier: 3 })`——「选定的法力宝石」＝玩家点选
   单格（CELL，9638 先例）；「选定(敌人一个法力)颜色」＝运行时选色（CHOSEN），两种「选定」
   选择器不同。**护栏**：不带 tier 的既有调用序列化为 kind 字符串形态，rng 序列逐字节不变
   （weaponPrimitives 护栏测试：builder 产物 vs 裸段字面量同 seed 事件流一致）。
4. **条件化清除段（6 把）**：destroyColor/explodeColor/destroySkulls/explodeSkulls/
   destroySpecialGems/explodeSpecialGems 六构造器补 opts 形参（此前 NO_OPTS_RE 拒绝）——
   段级 ifCond 经既有 attach/runSegment 全局条件管线生效。7286「如果现有尘风暴，则移除所有
   绿色的宝石」、7955「若敌方有魔头，则爆破所有红色宝石」、9381/9486/9809/9983「若队伍里有
   永生神X，则引爆所有Y宝石」全族回收。
5. **陈旧拒绝回收**（引擎原语已在、生成器口径未更——逐条核对 builders 注释后接线）：
   随机属性削减 → stealRandomStat/reduce stat=random（R12；7240/7244/8440）；「获得等同于
   减除的护甲值的攻击力」→ lastReduce 跨段来源（Wave4；7247/7752/7756-7759/7799，含
   「获得 等同于减除的X 的 属性」倒装语序）；逐摧毁宝石触发状态 → perDestroyed（Wave4；
   8518/8965）；吞噬 → devour（R22；7293）；「选择一宝石摧毁其行和列」→ destroyChosenCross
   （R22；8721——此前误记 line-of-gem 缺口）；石块计数/创造 → boardSpecial/createSpecialGems
   stoneBlock（8769）；「可摧毁所选颜色的宝石」→ destroyColor(CHOSEN)（8400）。
6. **王国改名考证**（K-B 收官重要发现）：官方 2025 改名——双语 dump（data/raw 两份按
   troop Id 配对）核实 **Zaejin→Amanithrax（zh=齐埃金）、Hellcrag→Obsidian Depths
   （zh=地狱悬崖）、Grosh-Nak→Dripping Caverns（zh=葛洛什奈克）、Divinion Fields=卜筮之原**。
   机翻译名归一：毒菇林→齐埃金、滴答洞穴→葛洛什奈克、黑曜石深渊→地狱悬崖、圣力场→卜筮之原、
   荒野平原→狂野平原（狂→荒机翻）、潘之谷→潘神之谷、银林地→玉银林地、狐狸座→沃尔帕克。
7. **具名族召唤**（batch-08 全视之眼先例）：小鬼=Imp 族（夏/秋/冬/春/万圣 5 只）、
   科博=Kobold 族（科博/骑士/法师/使者/小偷 5 只）→ NAMED_GROUP_REFS 固定清单均匀随机。
8. **其余小裁定**：电风暴=Yellow（8409 Electrostorm；GoW 元素 Yellow=风/空气，与光=Yellow
   同色系）；「使所有受影响的敌人流血」→ lastDamaged 目标模式（9566）；「对使用所选定法力
   宝石颜色的每一名敌人…」→ enemyAll + ifCond targetColor CHOSEN（7862/8152/9831）；「燃烧
   敌人，如果敌人身亡，则转化成一只随机龙族」→ lastTarget + ifTargetDied 转化（7412）；法力
   灼烧 = drainMana + dmg×drainedMana（官方 Mana Burn 主语义；zh「伤害值因自身魔法值而增强」
   与主源争用单 modifier 通道 → 诚实略去）；「使他们下潜」→ 沿用上文盟友目标（8076）；
   「-{2}」MT 残渣剥除、「对多→最多」、「使用了→使用」、孤立「色」子句噪声丢弃（7722）；
   mt-garbage 剥除后不再计特征（9524/9525 区间可解析）。
9. **诚实余量（27 partial + 8 mana-only 全清单核因）**：见 meta skippedClauses——机翻占位符
   {1}（7071/7129）、stat 翻倍（7188/7199）、基数取目标属性（7190）、随机宝石所在行（7217）、
   「另一名敌人」目标模式（7285）、「敌方高塔」来源（7800）、「其他所有敌人」（7754）、
   随机状态条数区间（7986/7996/9910）、区间调位（8074）、全状态池授予（8084）、终止风暴
   （8153）、「石墩激活」盘上触发（8400）、斜方宝石转化（8762）、列内计数（8805/8988）、
   「一颗 2」机翻垃圾（8806）、dispel-all（7753/9378）、反向属性比较（7192/7755/8450）、
   诅咒 vague（9985）、随机风暴（7492）、法力灼烧第二来源（7412）、满额幼龙（7567）、
   EN-only 快照 3（10045/10063/10065）、7815 双条件加成超单 condBonus 通道（诚实 partial）。**不为凑数硬收。**
