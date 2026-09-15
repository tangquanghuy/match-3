# 特殊宝石 · 语义考证与设计 第二批（2026-09-16）

## ⭐ 官方数据核验（2026-09-16 窗口E 追加 · 决定性证据，凌驾于下文推断）

**背景**：用户质疑「这些宝石是不是把技能效果误看成宝石」。为此从中文库的同源上游
gowhead.com 拉取**英文版游戏结构化数据**（`data/raw/spells.gow.en.json`，3207 条技能的
SpellSteps——游戏本体数据，非文本翻译），提取全部宝石操作步骤
（ConvertGems/CreateGems/ExplodeGems/DestroyGems…）的 `Color1/Color2` 枚举值。
**官方数据里「宝石类型」与颜色共用同一枚举字段**（实例：`{"Color1":"Brown","Color2":"Stun","Type":"ConvertGems"}`），
非六色基色的取值即官方承认的宝石类型全集——机翻无法造出这些枚举值。

**结论**：
1. 下文绝大多数宝石**确为官方类型，非误读**：Burning×29、Cursed×24、Freeze×27、DeathMark×8、
   Bleed×24、Poison×23、Terror×13、Dragon{Blue/Green/Purple/Red/Yellow/Brown}、
   GoodGargoyle×29/BadGargoyle×29、ElementalStar×21、Angel×20、**Spirit×19（灵力宝石官方名
   =Spirit，非 Mana）**、**Booty×14（赃物宝石官方数据确有）**、Giant 六色、DaemonicPortal×27、
   Decay×16、Submerge×9、Entangle×12、Enrage×12、Lycanthropy×20、Block×21、LightDarkStar×9。
   它们「看着像技能效果」是因为**本来就只由技能创造**（无其它来源）。
2. **修正**：闪电宝石官方为 **LightningYellow×13 / LightningBlue×10 两色变体**，非本引擎的
   lightningRow/lightningCol 行列建模——行为是否等价（黄=列/蓝=行？）待核对，列入窗口C对齐修正；
   通配官方有 WildCard2/3/4 三档倍率（C 只实现 2/4）。
3. **考证漏收，需补设计**：Volcano 火山宝石×15、Trap 陷阱宝石×16、ManaPotion 法力药水六色×19、
   Candy 糖果六色×6、Enchant 附魔×3、Mimic×1。
4. **用户裁定不做（2026-09-16）**：精灵火/打昏/屏障。注：三者「查无官方语义文档」属实，
   但**官方数据类型确实存在**（FaerieFire×15 / Stun×4 / Barrier×9）——若日后想恢复，语义可从
   SpellSteps 的伴随字段反推。

---

本文是 `GEMS-SEMANTICS.md`（窗口 C 十种：bomb/doomSkull/uberDoomSkull/web/lightningRow/lightningCol/wildcard/wish/hourglass/ghost）的**续篇**，覆盖技能放弃桶反复出现的其余特殊宝石。

**用户已裁定（2026-09）**：本批宝石**不制作独立贴图**——一律用既有普通宝石贴图（六色 `src/assets/gems/{color}.png` / `skull.png`）加**程序化动画/滤镜**表达（色调、边缘辉光、符环叠层、脉冲）。视觉方案按此口径编写；窗口 C 十种的既有贴图不动。

**考证口径**：每颗宝石标注三级确认度——
- **官方原文**：官方帮助中心/官网公告/官方论坛 Dev 发言的直引；
- **官方数据**：游戏数据文本（gowhead 英文 dump，含全部兵种/武器法术原文）中的使用证据，无官方规则句；
- **未证实**：查不到官方语义，给出建议默认行为及依据。

**考证日期**：2026-09-16。主要来源见文末。

---

## 0. 引擎落点（全部宝石共用）

新宝石落在既有接口上，不新发明机制管线：

| 挂点 | 文件 | 需要做什么 |
|---|---|---|
| `SpecialGemKind` 联合类型 | `src/engine/types.ts` | 每颗新增一个 kind 字面量 |
| 匹配归属 `SPECIAL_MATCH_COLOR` | `src/engine/types.ts` | 可匹配宝石登记归属色 → `matchJoinKey`/`isSameMatchType` 自动生效（`MatchResolver.scanLines` 的 run 连接键也随之工作） |
| "被匹配"触发 | `TurnEngine.collectMatchTriggers` | 状态类宝石在此即时施加状态（仿 `applyWebGem`） |
| "被摧毁"触发 | `TurnEngine.expandSpecialDestruction` | 引爆/清行/召唤类在此入 FIFO 队列（仿 bomb/lightning/wish 分支）；被清宝石照常进 `settleDestroyed` 结算法力 |
| 事件载荷 | `events.ts` `SpecialGemTriggerEvent` | 按 kind 扩展可选字段（statusId/targetIds/summon/mana 等），表现层据此演出 |
| 技能原语 | `src/engine/skills/builders.ts` | `createSpecialGems / transformToSpecial / destroySpecialGems / explode(Random)SpecialGems / boardSpecialCount` 均以 `SpecialGemKind` 为域——**新增 kind 即自动扩大技能词表**，这就是"解锁放弃桶技能"的机制 |
| 渲染 | `src/render/GemSprite.ts` | `SPECIAL_HEX` 加条目；`drawSpecial` 加分支（程序化叠层）；无贴图时 `textureFor` 返回归属色宝石贴图，叠层画在其上 |
| 触发反馈 | `src/render/App.ts` `SPECIAL_GEM_FEEDBACK` | 每颗加 `{label, color}`，复用现有触发环+标签 CSS 动画（440ms） |
| 自然掉落 | `src/engine/GravitySystem.ts` `SPAWNABLE_SPECIALS` | **白名单默认不扩**（见 §护栏） |

**通用性能预算（适用于本批全部视觉方案）**：
- 叠层一律用一次性 `Graphics` 矢量绘制，只在 `setType()` 时重绘一次；**禁止逐帧重绘 Graphics、禁止逐宝石挂 Pixi ColorMatrixFilter/BlurFilter**（全屏宝石数最多 49，滤镜逐帧开销不可接受）。
- 待机动画复用既有呼吸系统（`App.ts` idle 呼吸，scale 弦动，相位错开）；特殊宝石只需调大幅度或叠加一个 2s 级别的 tint 闪烁 tween，不引入新 ticker。
- 每格叠层数 ≤2（静态叠层 + 可选辉光层）；触发特效走既有 `playFrameFX` 序列帧（`src/assets/fx/`）与 CSS 触发环，时长 ≤450ms。

---

## A 组 · 可匹配·状态类（基图 = 归属色宝石贴图）

共性：宝石本身等同归属色宝石参与三消与法力结算（`SPECIAL_MATCH_COLOR`），触发时机分"被匹配"（`collectMatchTriggers` 即时施加）与"被摧毁"（`expandSpecialDestruction`，被匹配也视为被摧毁，两种路径都触发）。施加的状态走 `applyStatus`，与特质/技能状态同一套状态表。

### A1. 冻结宝石（Freeze Gem）✅ 官方原文 ｜ 解锁 10 技能

- **官方语义**："Freeze Gems are Blue Gems… These are matched with Blue Gems for Blue Mana. When matched, Freeze Gems will Freeze a random Enemy."（蓝色；与蓝色同类匹配得蓝法力；**被匹配时**冻结一名随机敌人。）来源：[官方 Heroic Gems](https://gemsofwar.zendesk.com/hc/en-us/articles/360004543635-Heroic-Gems)。
- 冻结状态官方定义："prevents any Troop with the Mana colors frozen from having extra turns … and from any Spells cast"（禁施法/禁额外回合）。引擎已有 `frozen` 状态（`CONTROL_STATUS_IDS`、`isFrozen` 拦行动）。
- **引擎行为设计**：kind `freezeGem`；`SPECIAL_MATCH_COLOR: Blue`；`collectMatchTriggers` 分支：随机存活敌人 `applyStatus({id:'frozen', turns:3})`（回合数对齐官方"临时"，取 web 同款 3，可调）。事件 `special-gem-trigger` 带 `statusId:'frozen'`。
- 生成来源（官方数据）：Daughter of Time「创造 5 沙漏 + 5 冻结」、Vulpine Watcher、Kolfrysti（耗蓝转化）、Fionnuala、Helilya、Glaycia's Lattice、Frostbound、Midwinter Lycan（混合诅咒+冻结）等。
- **程序化视觉**：基图 `blue.png`。叠层：六片冰晶（Graphics 等边三角，白 `#e8f6ff` α0.75，绕中心呈放射状，尖长 0.45r）+ 外圈霜环（描边 1.5px `#a6d4ff` α0.6）。待机：呼吸幅度 ×1.5（scaleAmp 0.20），叠层 alpha 在 0.55~0.85 间 1.6s 正弦摆动。触发反馈：label「冻结」color `#8fd0ff`，触发环之后播既有 `frozen_apply_strip`。
- **开放问题**：冻结回合数定值（3？）需拍板。

### A2. 燃烧宝石（Burning Gem）✅ 官方原文 ｜ 解锁 9 技能

- **官方语义**："Burning Gems are Red Gems… matched with Red Gems for Red Mana. When matched, Burning Gems will Burn **all** Enemies."（红色；被匹配时燃烧**敌方全体**——注意是全体，与 A1 的随机单体不同。）来源：[Heroic Gems]；"对全队生效"另见[社区机制帖](https://community.gemsofwar.com/t/some-thoughts-and-suggestions-for-the-devs-about-special-gems/76601)。
- 燃烧状态官方定义：每回合 3 点伤害，先扣甲，可致死（官方[状态表](https://infinityplus2.freshdesk.com/support/solutions/articles/150000208274-all-status-effects-and-immunity-traits)）。引擎已有 `burning` DoT。
- **引擎行为设计**：kind `burningGem`；Red；`collectMatchTriggers`：敌方全部存活角色 `applyStatus({id:'burning', turns:3, magnitude:3})`。
- 生成来源：Fire Spirit「全选色转换」、Flame Rhynax / Flaming Skeleton / Cinderhand Goblin / MapleGoldbark（创造）等 19 兵种。
- **程序化视觉**：基图 `red.png`。叠层：底部一圈跳动的火舌（Graphics 3~4 个圆角三角，色 `#ff8c3a`→`#ffd24a` 渐变用两段 alpha 模拟，α0.8），右上角一粒火星（`#ffd24a` r=0.08r）。待机：火舌层整体 y 微颤 ±0.02 格、0.7s 周期（模拟摇曳），叠层 tint 在 `#ff6a3a` 与 `#ffb03a` 间 1.2s 摆动。触发反馈：label「燃烧」color `#ff9c5c`，播既有 `burning_apply_strip`。
- **开放问题**：无。

### A3. 诅咒宝石（Cursed Gem）✅ 官方原文 ｜ 解锁 6 技能（另有诅咒状态类技能 3 条联动）

- **官方语义**："Cursed Gems are Brown Gems… matched with Brown Gems for Brown Mana. When matched, Cursed Gems will Curse a random Enemy."（棕色；被匹配时诅咒一名随机敌人。）来源：[Heroic Gems]。
- 诅咒状态官方定义：驱散目标全部正面状态 + 之后无视免疫施加负面状态。引擎已有 `CURSE_STATUS_IDS`（curse/cursed）与诅咒恢复减半逻辑。
- **引擎行为设计**：kind `curseGem`；Brown；被匹配 → 随机敌人 `applyStatus({id:'curse', turns:4})`（时长可调；先 cleanse 正面再挂 curse，与官方"驱散+破免"语义一致）。
- 生成来源：CursedGnome、SeaHag「全蓝转诅咒」、TheElderDragon、PharaohKhafru「全选色转换」、Midwinter Lycan（混合）。
- **程序化视觉**：基图 `brown.png`。叠层：暗紫符文圆环（半径 0.62r，描边 2px `#9a5cff` α0.85）+ 环上 3 个小骷髅点（`#c77dff` r=0.06r 均布）+ 中心倒十字（2px `#b46cff` α0.7）。待机：符环绕中心自转 8s/圈（tween 旋转，非逐帧重绘）。触发反馈：label「诅咒」color `#b46cff`。
- **开放问题**：无。

### A4. 恐怖宝石（Terror Gem）✅ 官方原文 ｜ 解锁 6 技能（另恐怖状态类 9 条联动）

- **官方语义**："Terror Gems… matched with Purple Gems… give 1 Mana when matched, destroyed, or exploded. When matched, Terror Gems will inflict Terror Status on a random Enemy. Terror Gems appear in battles against the Nightmare Circus Faction."（紫色；被匹配时恐怖一名随机敌人；来源战役=夜魇马戏团。）来源：[Heroic Gems]。
- 恐怖状态官方定义：每回合开始 10% 几率使目标在队伍列表中**下移一位**（官方状态表）。
- **引擎行为设计**：kind `terrorGem`；Purple；被匹配 → 随机敌人施加**新状态 `terror`**。状态系统需新增 tick：每回合 10% 概率把目标在 `characters[]` 中与后一位交换（`teamRoster` 已有位次概念；无后位则空过）。
- 生成来源：Ringmaster/Mydnight Innovator（夜魇马戏团系）、Jezebel、Sinister Reaper、Bone Whip、Watchers Cleaver、Crom Cruach 等 12 处。
- **程序化视觉**：基图 `purple.png`。叠层：一只抽象眼（Graphics：外椭圆描边 `#e0b6ff` 2px，瞳孔圆 `#ff4d8f` r=0.16r，瞳孔高光白点）+ 眼外三道短促"惊悚线"（顶部放射短线 `#d9b6ff` α0.7）。待机：瞳孔在椭圆内左右缓移 ±0.1r、2.4s 周期（tween x）。触发反馈：label「恐怖」color `#e07bff`。
- **开放问题**：terror 状态需要新的回合 tick（队伍位次交换）——实现量比普通状态大，是否本期做完整位次移动，还是先做"状态挂上+图标"空壳（技能计数来源可用），**需拍板**。

### A5. 流血宝石（Bleed Gem）✅ 官方原文（2025-12 战役公告）｜ 解锁 9 技能

- **官方语义**："**Bleed Gems are Purple Gems that when destroyed, will inflict Bleed on a random Enemy.**"（紫色；**被摧毁时**（含被匹配）流血一名随机敌人。）来源：[官方战役公告 Wilhelmina's Rose](https://gemsofwar.com/campaign-begins-wilhelminas-rose/)（官方论坛镜像：[topic 88966](https://community.gemsofwar.com/t/campaign-begins-wilhelminas-rose/88966)）；战役期间"偶尔（低概率）像普通宝石一样掉落"。
- 流血状态（Wiki 状态页，社区）：每回合损生命，叠层 1/2/3/4 = 每回合 1/3/6/10 点，累计 10% 恢复。引擎已有 `bleed`（`DOT_STATUS_IDS`）。
- **引擎行为设计**：kind `bleedGem`；Purple；`expandSpecialDestruction` 分支（而非 matched 分支——语义相同但走摧毁管线，便于炸弹波及触发）→ 随机敌人 `applyStatus({id:'bleed', turns:3, magnitude:1})`。
- 生成来源：Merneith「5 流血+5 衰败」、Sinister Reaper、Hollioke、Sanguine Devotion「全选色转换」、Lord Harker、Vinepyre 等。
- **程序化视觉**：基图 `purple.png`。叠层：两道交叉的"抓痕"（Graphics 弧线 3px `#ff4d6e` α0.85，从左上到右下与右上到左下，端点渐细用三段递减线宽模拟）+ 中心一滴血（`#c22040` r=0.1r）。待机：血滴 1.8s 周期轻微下坠-回弹（tween y ±0.04 格）。触发反馈：label「流血」color `#ff6b8a`。
- **开放问题**：引擎 bleed 的 magnitude 表是否采用官方叠层梯度（1/3/6/10）——现状 DoT magnitude 单值，先取单值 1，叠层梯度列入后续。

### A6. 毒宝石（Poison Gem）✅ 官方原文（2026-02 战役公告）｜ 解锁 6 技能

- **官方语义**："**Poison Gems are Green Gem that when matched will inflict Poison on all enemies.**"（绿色；被匹配时毒**敌方全体**。）来源：[官方战役公告 Campaign 27 / Altar of Malice](https://gemsofwar.com/campaign-begins-campaign-27/)（镜像 [topic 89254](https://community.gemsofwar.com/t/campaign-begins-campaign-27/89254)）。
- 毒状态官方定义：每回合 50% 几率 -1 生命，无视护甲（官方状态表）。引擎已有 `poison`。
- **引擎行为设计**：kind `poisonGem`；Green；被匹配 → 敌方全体 `applyStatus({id:'poison', turns:3})`。
- 生成来源：GreenHag「全选色转换」、PoisonedUrsidae、Manasa、ToxAndSion、Skarn（剧毒）、Sinister Reaper 等 12 处。
- **程序化视觉**：基图 `green.png`。叠层：三颗气泡（`#b8ffd9` 描边圆 α0.7，r=0.10/0.07/0.05r，错位分布）+ 一滴垂落的粘液（`#7dffa8` 水滴形 α0.85）。待机：气泡依次上浮循环（各自 2s/2.6s/3.2s 相位错开，tween y -0.08 格后复位 alpha 渐隐）。触发反馈：label「中毒」color `#7dffa8`。
- **开放问题**：无。

### A7. 精灵火宝石（Faerie Fire Gem）⚠️ 语义未证实（触发句缺失）｜ 解锁 6 技能

- **考证**：宝石本体确凿存在（官方数据 22 处法术引用：Muireann「创造 3 冻结+3 精灵火」、Ctharrasque、MapleGoldbark、Virago's Branch「全绿转换」、Hollioke、Forest Gremlin、Firenza 等；中文本地化作"精灵火/妖火/妖精之火宝石"）。但**官方公告/帮助中心未给出它的触发规则句**（未检索到对应战役公告；社区亦只在机制讨论中顺带提及）。同名的 **Faerie Fire 状态**官方有定义：受术者受到的法术伤害 +50%，每回合累计 10% 恢复（Wiki 状态页）。
- **建议默认行为**（按 A 组家族模式推断）：kind `faerieFireGem`；**Green**（生成证据一致：所有转换均以绿色宝石为源）；被摧毁时对随机敌人 `applyStatus({id:'faerie-fire', turns:3})`；状态效果 = 受法术伤害 ×1.5（挂到 `spellDamageTaken` 乘数口径，与特质同通道）。
- **程序化视觉**：基图 `green.png`。叠层：一团蝶形光晕（Graphics 4 片花瓣椭圆，`#d6ff8a` α0.55，绕中心成十字花）+ 中心亮点（`#fbffe0` r=0.09r）+ 2 粒环绕光尘（r=0.04r）。待机：光尘绕环公转 3s/圈（tween 旋转容器），光晕 alpha 0.4~0.7 / 1.5s 呼吸。触发反馈：label「妖火」color `#d6ff8a`。
- **开放问题**：触发时机（matched vs destroyed）与归属色需用户裁定；建议照 A 组默认（destroyed + Green）。

### A8. 激怒宝石（Enrage Gem）✅ 官方原文（2025-09 战役公告）｜ 解锁 4 技能

- **官方语义**："**Enrage Gems are Red Gems that when destroyed, will Enrage a random Ally.**"（红色；**被摧毁时激怒一名随机己方**——正面效果，目标是自己人。）来源：[官方战役公告 Axe of the Horde](https://gemsofwar.com/campaign-begins-axe-of-the-horde/)（镜像 [topic 88623](https://community.gemsofwar.com/t/campaign-begins-axe-of-the-horde/88623)，含"战役期间偶尔掉落"条款）。注意：中文数据里"激怒宝石/愤怒宝石"是同一 Enrage Gem 的两个译名。
- 激怒状态官方定义：骷髅攻击伤害 ×1.5 且无视特质（官方状态表）；引擎已有 `RAGE_STATUS_IDS`（rage/enraged）。
- **引擎行为设计**：kind `enrageGem`；Red；`expandSpecialDestruction` → 随机己方 `applyStatus({id:'enraged', turns:2})`（回合数可调）。
- 生成来源：Krag'Rax Bloodskull、Ang'Rak's Edge、Axe of Krag'Rax（引爆）、Dragonhawk、Mor'Zarn、Veles Stormborn、Elven Noble（摧毁）等。
- **程序化视觉**：基图 `red.png`。叠层：两道怒气斜杠（Graphics 粗折线 3px `#ff5c3a` α0.9，位于宝石上半部，如"//"）+ 下缘一圈红色余焰（α0.4）。待机：斜杠组整体 0.9s 周期 x 抖动 ±0.03 格。触发反馈：label「激怒」color `#ff7a5c`。
- **开放问题**：无。

### A9. 沉没宝石（Submerge Gem）✅ 官方原文（2025-04 战役公告）｜ 解锁 3 技能

- **官方语义**："**Submerge Gems are Blue Gems that when destroyed, will Submerge a random Ally.**"（蓝色；被摧毁时使一名随机己方下潜。）来源：[官方战役公告 Trident of Dago'Nath](https://gemsofwar.com/campaign-begins-trident-of-dagonath/)（镜像 [topic 87530](https://community.gemsofwar.com/t/campaign-begins-trident-of-dagonath/87530)）。
- 下潜状态（Wiki 状态页）：下潜者回避所有指定全队的伤害/效果；其施法或受到骷髅伤害后结束。引擎已有 `UNTARGETABLE_STATUS_IDS = {'submerged'}`（隐匿同通道）。
- **引擎行为设计**：kind `submergeGem`；Blue；`expandSpecialDestruction` → 随机己方 `applyStatus({id:'submerged', turns:2})`。
- 生成来源：Deep Trident、Caspian、Dago'Nath、Tidal Dancer「绿转沉没」、Bloom Manatee「红转沉没」。
- **程序化视觉**：基图 `blue.png`。叠层：三条横贯波浪线（Graphics 正弦短线 2px `#9adfff` α0.8，分上中下三段）+ 右下角一串上升气泡（3 粒 r=0.05r）。待机：波浪线相位横移（tween x ±0.06 格，1.8s 周期）。触发反馈：label「下潜」color `#9adfff`。
- **开放问题**：无。

### A10. 缠绕宝石（Entangle Gem）✅ 官方原文（2024-08 战役公告；考证新增，清单外发现）

- **官方语义**："**Entangle Gems are Green Gems that when destroyed, will Entangle a random Enemy.**"（绿色；被摧毁时缠绕一名随机敌人。）来源：[官方战役公告 The Primeval Tome]（镜像 [topic 84999](https://community.gemsofwar.com/t/campaign-begins-the-primeval-tome/84999)，含掉落条款全文）。
- 缠绕状态官方定义：攻击归零（官方状态表）；引擎已有 `entangle`。放弃桶未点名，但与恐怖宝石同批出现（trait 表 entangle/web 拆分直接相关），一并收录。
- **引擎行为设计**：kind `entangleGem`；Green；`expandSpecialDestruction` → 随机敌人 `applyStatus({id:'entangle', turns:3})`。
- 生成来源：Treekin「4 棕转缠绕」、Charbark、Blackwood's Staff、Wisterina「全棕转换」。
- **程序化视觉**：基图 `green.png`。叠层：两圈藤蔓弧（Graphics 贝塞尔弧线 2.5px `#4bd66a` α0.85，交叉缠绕感）+ 3 片小叶（椭圆 `#a6f0b4` α0.8）。待机：藤蔓弧端点生长-回缩循环（scale 0.96~1.04，2.2s）。触发反馈：label「缠绕」color `#7de08f`。
- **开放问题**：无。

### A11. 打昏宝石（Stun Gem）⚠️ 语义未证实（触发句缺失）｜ 解锁 0~2 技能

- **考证**：宝石本体存在（官方数据：Orchidius「5 棕转打昏」、Terra's Jewel「引爆所有打昏宝石」；官方论坛确认 in-game 英雄宝石指南已收录 Entangle/Stun/Barrier 一批：[topic 84398](https://community.gemsofwar.com/t/now-you-can-use-the-in-battle-chat-and-see-the-heroic-gems-guide/84398)），但无官方触发规则句。
- **建议默认行为**：kind `stunGem`；Brown（唯一转换证据为棕色源）；被摧毁 → 随机敌人 `applyStatus({id:'stun', turns:1})`（打昏在 GoW 里通常 1 回合）。引擎已有 `stun`（`isStunned` 拒绝行动）。
- **程序化视觉**：基图 `brown.png`。叠层：星星眩晕环（Graphics 3 颗四角星 `#ffe9a6` r=0.09r 绕顶排布）+ 一条"8"字形虚线轨迹。待机：三星绕环公转 2.5s/圈。触发反馈：label「打昏」color `#ffd98a`。
- **开放问题**：归属色与回合数；优先级最低（仅 2 处法术引用，放弃桶 0 条硬卡）。

### A12. 屏障宝石（Barrier Gem）⚠️ 语义未证实（触发句缺失）｜ 解锁 0~2 技能

- **考证**：宝石本体存在（官方数据：Maned Wolf「4 紫转屏障」、Narcithus「5 黄转屏障」、Raquel「创造 5」、The Soul Knight；Xbox 成就"matching … Barrier gems"证明**可匹配**：[topic 88154](https://community.gemsofwar.com/t/are-the-3-new-achievements-for-matching-burning-barrier-and-freeze-gems/88154)）。无官方触发规则句。
- **建议默认行为**：kind `barrierGem`；Yellow（正面效果贴金色系；转换证据紫/黄混合，存疑）；被摧毁 → 随机己方 `applyStatus({id:'barrier', turns:3})`。引擎已有 `BARRIER_STATUS_ID`。
- **程序化视觉**：基图 `yellow.png`。叠层：半透明穹顶弧（Graphics 上半圆弧面 `#fff3c4` α0.45 + 描边 `#ffd24a` 2px α0.9）+ 顶部小菱形徽记。待机：穹顶 alpha 0.35~0.6 / 2s 呼吸。触发反馈：label「屏障」color `#ffe06b`。
- **开放问题**：归属色；放弃桶 0 条硬卡，随 A 组顺带做。

### A13. 腐朽宝石（Decaying Gem）✅ 官方原文（2025-01 战役公告）｜ 解锁 2 技能

- **官方语义**："**Decaying Gems are Brown Gems. While they appear on the board, at the start of each turn, the team with the most troops will suffer -1 Armor per Decay Gem for all its troops** (if both teams have the same number of troops, it will affect all troops)."（棕色；**在盘存在期间的全局光环**：每回合开始，兵员更多的一队全员 -1 甲/颗；同数则双方都扣。）来源：[官方战役公告 Crown of the Decaying Queen]（镜像 [topic 87004](https://community.gemsofwar.com/t/campaign-begins-crown-of-the-decaying-queen/87004)）。**本批唯一"面板光环"型宝石**，无匹配/摧毁触发。中文数据"腐朽宝石/衰败宝石"同物。
- **引擎行为设计**：kind `decayGem`；Brown；无触发效果；新增回合开始钩子（TurnEngine 回合尾扫描棋盘 decayGem 数 → 兵多一方全员扣甲）。匹配它照常给棕法力（棕色宝石语义）。
- 生成来源：Merneith「5 流血+5 衰败」、Sir GeoffreyTheFallen「5 毒+5 腐朽」。
- **程序化视觉**：基图 `brown.png`。叠层：干裂纹（Graphics 3 条从中心放射的折线 2px `#6e5638` α0.9）+ 边缘一圈锈色蚀斑（`#8a6b4a` α0.4 环）。待机：不动画（光环宝石表现"死寂"，与其他宝石的呼吸形成反差；仅蚀斑 alpha 0.3~0.5 / 4s 极慢摆动）。触发反馈：无触发环；改为**回合开始全场 n>0 时**在己方 HUD 显示一次"-n 甲"飘字（label「腐朽」color `#9c8462`）。
- **开放问题**：光环每回合结算一次的成本口径（当前实现建议：回合尾一次扫描，避免逐帧监听）。

---

## B 组 · 不可匹配类（`matchJoinKey` 返回 null，同 bomb/wish；基图 = skull 或专属化色宝石）

共性：不参与三消、不进 `SPECIAL_MATCH_COLOR`；只能被技能/爆破摧毁（`expandSpecialDestruction` / `settleDestroyed` 已天然支持——同 wish）。官方 Dev 发言确认此族集合："non-matching gem types (Stone Blocks, Wish, Bomb, Gargoyle, and Death Mark Gems) can only be selected by spells that explicitly select for them"（[官方论坛 topic 79832](https://community.gemsofwar.com/t/bug-with-the-new-weapons-of-grimnir-and-fomor-the-vinthian/79832)）。

### B1. 死亡标记宝石（Death Mark Gem）✅ 官方原文 ｜ 解锁 1 技能（另死亡标记状态类 4 条联动）

- **官方语义**："Death Mark Gems are Colorless. When destroyed, Death Mark Gems will inflict Death Mark on a random Enemy."（无色不可匹配；被摧毁时死亡标记一名随机敌人。）来源：[Heroic Gems] + 上 Dev 发言（不可匹配清单成员）。
- 死亡标记状态官方定义：每回合开始 10% 直接死亡（官方状态表）。引擎已有 `DEATH_MARK_STATUS_IDS` + 10% 处决 tick（`status.ts` 305 行）。
- **引擎行为设计**：kind `deathMarkGem`；无归属色；`expandSpecialDestruction` → 随机敌人 `applyStatus({id:'death-mark', turns:3})`。
- 生成来源：The Grave Giant、Aravatar/Aravatar's Tusk（爆破联动）、Assessor of Mahat「2 紫转换」、Death Tarot、Death Rites、PharaohKhafru「3 骷髅转换」。
- **程序化视觉**：基图 `skull.png`（缩小至 0.8）+ 底层紫色宝石暗影垫底。叠层：鲜红"×"叉（Graphics 两笔 3px `#ff3348` α0.95，覆盖骷髅额头）+ 外圈红环虚线。待机：红 × 0.9s 周期 alpha 0.7~1 闪烁（危险感）。触发反馈：label「死亡标记」color `#ff5c6e`。
- **开放问题**：无。

### B2. 天使宝石（Angel Gem）✅ 官方原文 ｜ 解锁 12 技能（放弃桶第四名）

- **官方语义**："Angel Gems can not be matched. They have no mana color. When destroyed, Angel Gems will give a random Ally the Bless Status Effect."（不可匹配；被摧毁时使一名随机己方获得祝福。）来源：[Heroic Gems] + [官方战役公告 Amatiel's Prison（镜像 topic 83679）](https://community.gemsofwar.com/t/campaign-begins-amatiels-prison/83679)："Angel Gems are colorless Gems that when destroyed, will give Bless to…"。
- 祝福状态官方定义：净化目标并使其临时免疫一切状态效果、Devour 与法力燃烧（官方状态表）。引擎 `POSITIVE_STATUS_IDS` 已含 `blessed`（净化/驱散口径），但**尚无施加入口**——需在 `applyStatus` 落一个 `blessed` 实例并在免疫判定处接通（复用 `statusImmunities:'*'` 口径）。
- **引擎行为设计**：kind `angelGem`；无归属色；`expandSpecialDestruction` → 随机己方 `applyStatus({id:'blessed', turns:3})`（先 cleanse）。
- 生成来源（12 技能的燃料）：Sacred Guardian、War Cleric、Ascendance、High Cleric、Lady Sapphira「引爆所有天使宝石」、Grand Inquisitor（二次缩放来源）、Witchfinder 等 Whitehelm 系 17 处法术。
- **程序化视觉**：基图 `skull.png` 换为 `yellow.png` 打底 + 白色羽翼叠层。叠层：左右两片翅膀（Graphics 三层递减弧羽，白 `#ffffff` α0.9 → `#e8ecff` α0.6）+ 顶部光环（椭圆描边 `#ffd24a` 2.5px）。待机：翅膀 scale x 0.95~1.05 / 1.4s 交替（扑翼感），光环 y ±0.02 格浮动。触发反馈：label「祝福」color `#ffe9a6`。
- **开放问题**：blessed 的免疫拦截范围（是否含 Devour/法力燃烧——引擎目前无这两机制，免疫先接状态施加即可）。

### B3. 恶魔传送门宝石（Daemonic Portal Gem）✅ 官方原文 ｜ 解锁 7 技能

- **官方语义**："Daemonic Portal Gems… can not be matched. They have no mana color. When destroyed, Daemonic Portal Gems explode all Gems around them **and summon a random Daemon to the team of the gem destroyer** (if a free Team slot is available)."（不可匹配无色；被摧毁时**爆炸相邻一圈 + 为摧毁者一方召唤一名随机恶魔**。）来源：[Heroic Gems] + [官方战役公告 The Unholy Flame（镜像 topic 86384）](https://community.gemsofwar.com/t/campaign-begins-the-unholy-flame/86384)。
- **引擎行为设计**：kind `daemonPortalGem`；无归属色；`expandSpecialDestruction` 分支：`clearCellsForSpecial(ringCells(pos))`（仿炸弹）+ 召唤——`summonQueue` 机制已备（Team.summonQueue FIFO），"随机恶魔"从 troops.json 按 `TroopType 含 Daemon` 随机取一个模板（战力缩放：对齐召唤物现有口径，open question 见尾）。
- 生成来源：DaeDrak、Sting Bat、Doomed Guardian、Discordia、The Bane of Valor、Blackflame Spear、Infernal Trickster、Abaddon's Shard（引爆）。
- **程序化视觉**：基图 `purple.png` 打暗（tint ×0.6）。叠层：椭圆传送门漩涡（Graphics 三层同心椭圆描边 `#ff6a3a`/`#c77dff`/`#4a2d5e`，各 α0.8/0.7/0.9，长轴 0.8r）+ 4 道内向旋臂。待机：旋臂整体绕长轴翻转（scaleY 1→-1→1 循环 3s，模拟漩涡转动）。触发反馈：label「恶魔传送门」color `#ff8a5c`；召唤走既有 `summon_rune` 帧特效。
- **开放问题**： summoned 恶魔的等级/属性模板口径（Explore 里官方出 1 级小兵——本作建议按施法者等级缩放或固定模板，**需拍板**）。

### B4. 石像鬼宝石（Good / Evil Gargoyle Gem）✅ 官方原文 ｜ 解锁 19 技能（放弃桶并列第一）

- **官方语义**："Gargoyle Gems can not be matched. They are destroyed when destroyed by Spells or exploded by Doomskulls and Uber Doomskulls. When destroyed, **Good Gargoyle Gems give all Allies a random Positive Status Effect; Evil/Bad Gargoyle Gems inflict all Enemies a random Negative Status Effect.**"（不可匹配；善=蓝眼/恶=红眼两版；被摧毁时给己方全体随机正面 / 敌方全体随机负面。）来源：[Heroic Gems] + 社区复核（蓝眼=增益/红眼=减益：[Reddit](https://www.reddit.com/r/GemsofWar/comments/vozeme/question_about_new_gems/)；末日骷髅可引爆它们：[官方论坛](https://community.gemsofwar.com/t/gargoyle-gems-are-the-worst-gems-ever/75919)）。放弃桶里"善/恶/随机石像鬼"三种写法都是它。
- **引擎行为设计**：kind `gargoyleGem`，`tier: 1=善 / 2=恶`（复用 SpecialGemSpec.tier 通道，同 wildcard 先例）。`expandSpecialDestruction`：善 → 己方每个存活角色各随机 1 条正面状态；恶 → 敌方每个存活角色各随机 1 条负面状态。**随机状态池**（引擎已有状态）：正面 `['barrier','blessed','enchanted','enraged','reflect','submerged']`（= traits.ts POSITIVE_STATUS_IDS）；负面 `['poison','burning','bleed','silence','frozen','entangle','web','stun','curse']`。本作不做"石块转换成石像鬼"的位置操作技能（放弃桶已裁定），转换句式落到 `transformToSpecial` 即可。
- 生成来源（19 条的燃料）：Chromite Sphinx、Onyx Gargoyle（随机 1-2）、Stone Panther、Craghound（恶）、Dragonstone Guardian（善恶混合）、StoneZombie、Skarn（恶+毒）、Groevanga、Tears of the Sisters 等 K72 石像鬼王国 28 处。
- **程序化视觉**：基图 `skull.png`（石像感加灰化 tint ×0.85）。叠层：**眼睛即语义**——善版双眼圆点 `#57c8ff`（α0.95，r=0.09r）+ 头顶光圈细线；恶版双眼 `#ff4d4d` + 头顶双角（两笔三角 `#3a3f4b`）。待机：眼睛 2.8s 周期发光（外圈同色辉光 alpha 0.3~0.8 摆动）。触发反馈：善 label「石像鬼·善」color `#57c8ff`；恶 label「石像鬼·恶」color `#ff6b6b`。
- **开放问题**：随机负面池是否纳入未实现状态（terror/faerie-fire）——池子应引用"已实现集合"，随批次联动。

### B5. 石块（Stone Block）✅ 官方 Dev 发言（不可匹配）+ 官方数据 ｜ 解锁 7 技能

- **考证**：官方 Dev 发言将其列入不可匹配集合（"non-matching gem types (Stone Blocks, Wish, Bomb, Gargoyle, and Death Mark Gems)"，[topic 79832]）；无独立触发效果——是**惰性障碍物**：占格、挡三消、只能被爆破/摧毁，无任何被摧毁收益。生成证据：Medusa「敌方 8 颗转石块」（削法力手段）、Chromite Sphinx「创造 2」、Dark Smith、Maze Guardian、Nyar'Mel「引爆所有石块」、Obsidiaxas（计数来源）。
- **引擎行为设计**：kind `stoneBlock`；无归属色、无触发；`settleDestroyed` 中不计法力不计骷髅（与"其余特殊宝石自身不参与"同分支）。
- **程序化视觉**：基图 `brown.png` 去饱和（tint `#8a8f9c`，即引擎防御灰）。叠层：岩块棱线（Graphics 不规则五边形描边 2.5px `#5c6068` α0.9）+ 两道凿痕短线。**无任何待机动画**（惰性物）；高亮态用描边变白表达。触发反馈：label「石块」color `#a8adb8`（仅摧毁时）。
- **开放问题**：无。

### B6. 赃物宝石（Booty Gem）✅ 官方原文，但语义需重定 ｜ 解锁 5 技能

- **官方语义**："Booty Gems can not be matched. They have no mana color and will not give mana when destroyed. Booty Gems are destroyed when targeted by a Spell, or exploded by a Doomskull or Uber Doomskull. When destroyed, Booty Gems will give **10 Gold**."（不可匹配；被摧毁给 10 金币——**战斗外货币**。）来源：[Heroic Gems]。放弃桶里"赃物宝石/战利品宝石"是同一物两个译名（官方数据均为 Booty Gems：Dread Captain Grim、The Hanged Man、Boatswain Bart、Commodore Maryka、Lodestar、The Ruby Macaque 等）。
- **语义冲突**：同幽魂宝石的先例——金币是元经济，本作战斗内无效果。建议**重定语义**为「被摧毁时随机一名己方 +5 法力」（对齐 Giant Gem 的数值档），或最低优先级仅做计数燃料（Grim 的"因赃物宝石数而增强"用 boardSpecialCount 即可表达）。
- **引擎行为设计**：kind `bootyGem`；无归属色；`expandSpecialDestruction` →（若采纳重定语义）随机己方 +5 法力，事件带 `mana:{targetId, amount}`。
- **程序化视觉**：基图 `yellow.png`。叠层：麻布袋口扎绳（Graphics 顶部交叉两笔 2px `#b8860b`）+ 一枚金币探出（圆 `#ffd24a` 描边 `#8a6b1a`，r=0.14r，中央方孔）。待机：金币 1.6s 周期轻微弹跳（y ±0.03 格）。触发反馈：label「赃物」color `#ffd24a`。
- **开放问题**：语义重定方案（+5 法力 or 纯计数）**需拍板**。

---

## C 组 · 全色功能族（基图 = 归属色宝石贴图；tier/颜色随生成源）

### C1. 巨人宝石（Giant Gem）✅ 官方原文 ｜ 解锁 8 技能

- **官方语义**："Giant Gems are the Mana Gem version of Doomskulls… come in all 6 mana colors, there is no skull version. When matched with their color or destroyed, Giant Gems give **+5 Mana of their color** AND **explode all Gems around them**."（六色；"法力版末日骷髅"：被匹配或被摧毁时，+5 点该色法力并引爆相邻一圈。）来源：[Heroic Gems]。放弃桶六色巨人宝石（蓝/绿/红/黄/紫/棕）全部是它。
- **引擎行为设计**：kind `giantGem` + `spec.tier = BaseColor 序号`（或扩 `SPECIAL_MATCH_COLOR` 为按实例记录——**推荐**：给 `SpecialGemSpec` 加可选 `color?: BaseColor`，six-color 族共用，wildcard tier 先例）。`matchJoinKey` 返回该色 → 与同色宝石互连。被匹配：`collectMatchTriggers` 登记引爆环；被摧毁：`expandSpecialDestruction` 引爆相邻一圈（`ringCells`，末日骷髅同款）；法力 +5 在 `settleDestroyed`/组结算加发（`MANA_BONUS_GIANT = 5`）。
- 生成来源：The Sapphire/Emerald/Ruby/Topaz/Amethyst Giant（五巨人）、三条宝石龙 Sapphirax/Emeraldrin/Rubirath/Topasarth「5 色转巨人」、Ctharrasque「6 黄巨人」。
- **程序化视觉**：基图 = 对应色贴图放大至 1.08 格 + 体型描边。叠层：外圈粗金环（3px `#ffd24a` α0.9）+ 四角切面高光线（白色 α0.5）。待机：金环亮度 1.2s 周期脉动（alpha 0.6~1），体感"更大的宝石"。触发反馈：label「巨人」color 按归属色（复用 `COLOR_HEX`），播 `boom_strip`。
- **开放问题**：六色实例的存储方案（`spec.color` 字段 vs 六个 kind）——影响 `boardSpecialCount` 计数 API，**需拍板**（推荐 `spec.color`）。

### C2. 龙宝石（Dragon Gem）✅ 官方原文 ｜ 解锁 20 技能（放弃桶第一）

- **官方语义**："Dragon Gems… come in all 6 mana colors, there is no skull version… When matched or destroyed, Dragon Gems will **explode all Gems in the column below them**."（六色；被匹配或被摧毁时，爆炸**其所在列下方的所有宝石**。）来源：[Heroic Gems]。
- **引擎行为设计**：kind `dragonGem`（颜色存储同 C1 方案）；`matchJoinKey` = 该色；触发走摧毁管线：清空 `{row..ROWS-1} × col`（`cellsOfCol` 的下半段），被清宝石照常结算。清理方向是"下方"，与 lightning 的整行/列区分。
- 生成来源（20 条的燃料）：Crystal Eggs「7 蓝龙+召唤龙」、Veneratus「全红转黄龙」、Herald of Krystenax「全蓝转绿龙」、Setauri Gladius、Morganite、Vrawk Daemon、Eldritch Disciple、邪老门徒等 28 处法术（龙族兵种全家桶）。
- **程序化视觉**：基图 = 对应色贴图。叠层：龙鳞纹（Graphics 三排交错半圆弧 2px `#1a1a28` α0.35 压暗）+ 顶部一枚龙角剪影（同色加深 ×0.7）+ 边缘龙瞳竖线（2px 黑）。待机：鳞纹层 tint 沿归属色亮度 0.9~1.1 / 1.8s 缓慢摆动（呼吸龙息感）。触发反馈：label「巨龙」color 按归属色；触发时从宝石向下播一条竖向扫光（复用 lightningCol 的列扫光方向取反，见 `showSpecialGemTrigger`）。
- **开放问题**：同 C1 六色存储方案。

### C3. 灵力宝石（Spirit Gem）✅ 官方原文（颜色细节存疑）｜ 解锁 7 技能

- **官方语义**："Spirit Gems… When matched with their color or destroyed, Spirit Gems will **drain 2 Mana from Enemies**."（按其颜色参与匹配；被匹配或被摧毁时从敌人处汲取 2 点法力。）来源：[Heroic Gems]。中文"灵力宝石"= Spirit Gem（狐/幽灵系：Inari、ShadowFox、Spirittooth、King of Ravens、The High Priestess、Chiron、Zhuque）；**注意与"法力药水宝石"（Mana Potion）是两种宝石**（见 C4）。
- **引擎行为设计**：kind `spiritGem`；归属色：官方原文未明示颜色集合——生成证据显示多色转换都能产出（黄→Spirit、绿→Spirit），**建议同 C1 六色方案**，缺省 Purple。被匹配/被摧毁 → 敌方每个存活角色 `mana = max(0, mana-2)`（汲取的法力消散，官方"drain"无转移语义；见开放问题）。
- 生成来源：Relic Knight、Spirittooth、Doomed Guardian「全黄转灵力」、Inari「全绿转灵力」、KingOfRavens「爆破所有灵力宝石」等 15 处。
- **程序化视觉**：基图 = 归属色贴图。叠层：半透明"魂火"外焰（Graphics 火焰轮廓但用冷色 `#b7e5ff` α0.6，倒置火舌朝上）+ 两只椭圆鬼眼（白 α0.9）。待机：外焰 alpha 0.4~0.75 / 1.1s 摇曳 + 整体 y 漂浮 ±0.03 格。触发反馈：label「摄魂」color `#b7e5ff`。
- **开放问题**：被汲取的 2 点法力是否转移给触发方（官方文本只说 drain；社区实测感受是"清空对面"，建议不转移）。

### C4. 法力药水宝石（Mana Potion Gem）✅ 官方原文 ｜ 解锁 1 技能

- **官方语义**："Mana Potion Gems… come in all 6 mana colors, there is no skull version. When matched with their color or destroyed, Mana Potion Gems will **create 7-11 Mana Gems of that color randomly across the board**."（六色；被匹配或被摧毁时在全盘随机撒 7-11 颗该色法力宝石。）来源：[Heroic Gems]。生成来源：六守卫者（Aransi/Helgor/Jakal/Moshu/Rok'Gar/Urielle，各色 1-3 瓶）、Maelstrom Dago'Nath「12 随机药水」。
- **引擎行为设计**：kind `manaPotionGem`（颜色存储同 C1）；被摧毁（含匹配）→ 在当前空格随机落 7-11 颗该色普通宝石（`rng.nextInt` 定数量，空格随机采样；落进重力前棋盘，随后自然下落）。注意与已有 `gem-create` 事件复用。
- **程序化视觉**：基图 = 归属色贴图缩小至 0.86。叠层：小圆药瓶轮廓（Graphics 瓶身圆 + 瓶颈矩形描边 2px `#ffffff` α0.85）+ 瓶内液面横线（同色加深）。待机：液面线 y ±0.03 格晃动（1.5s）。触发反馈：label「法力药水」color 按归属色。
- **开放问题**：7-11 颗落在"空格"还是"随机格覆盖"（覆盖会顶掉特殊宝石，建议只落空格）。

---

## D 组 · 星（多色法力 + 形状清除；基图 = 专属色宝石 + 星形叠层）

### D1. 元素星（Elemental Star）✅ 官方原文 ｜ 解锁 14 技能（放弃桶第三）

- **官方语义**："Elemental Star Gems… are matched with **Brown, Blue, Green, or Red** Gems and will give **1 Mana for ALL of those colors**. Then **destroys diagonal Gems** from where it is matched."（与棕/蓝/绿/红四色同类匹配；一次匹配给**全部四色**各 1 点法力；并摧毁匹配点对角线的宝石。）来源：[Heroic Gems]。生成来源：Stellarix、Nexus Portal「4-6 颗」、Shayle「1 法力宝石转换」、Natureborn 系、Prince Basalt、Queen Ash、Wand of Stars 等 19 处。
- **引擎行为设计**：kind `elementalStar`；匹配归属：四色——现接口 `matchJoinKey` 只支持单键。**方案**：`isSameMatchType` 加特判（`'star4'` 特殊键与 Brown/Blue/Green/Red 四键互连，实现量小且不动通配逻辑）；法力结算：`resolveSettle` 特判——组归属色按其余宝石的颜色计，另给四色各 +1（`ManaDistributor` 逐色发 4 条）。摧毁对角线：`expandSpecialDestruction` 清 `{±1,±1}` 四格（非 8 邻环）。
- **程序化视觉**：基图 `brown.png` 打底（四色中最中性）。叠层：**四色四角星**（Graphics 4 角星，四支角分别 `#c8864b`/`#4aa8ff`/`#4bd66a`/`#ff4d5e`，中心交叠白核 r=0.12r）。待机：星体自转 10s/圈 + 白核 alpha 0.5~1 / 1.3s 闪烁。触发反馈：label「元素星」color `#f2f2ff`；触发时四角各飞一粒对应色光点（CSS 触发环 ×4 简化为环+四点 offset）。
- **开放问题**：`'star4'` 特殊连接键进 `isSameMatchType` 的侵入点需写回归测试（通配/骷髅排除规则同样适用——星不与骷髅连）。

### D2. 暗影之星 / 临界星（Umbral Star）✅ 官方原文 ｜ 解锁 4 技能

- **官方语义**："Umbral Star Gems… are matched with **Yellow or Purple** Gems and will give **1 Mana for ALL of those colors**. Then **destroys Gems in the row and column** from where it is matched."（与黄/紫同类匹配；给两色各 1 法力；摧毁匹配点所在整行+整列。）来源：[Heroic Gems]。生成来源：Umbral Portal「5-7 颗」、Lightborn Enchantress「3 颗转换」、Wand of Stars、Stellarix、Leio's Claws 等。中文数据"暗影之星/临界星/元素星河"三写法中，前两个都是 Umbral Star 的译名差异，"元素星河"是机翻断句错误（Stellarix 原文 "Create 3 Elemental Stars and 3 Umbral Stars"）。
- **引擎行为设计**：kind `umbralStar`；`'star2'` 特殊键与 Yellow/Purple 互连（方案同 D1）；触发：清空所在整行+整列（lightning 行+列合并，但**只触发一次**，行/列交叉点即自身）。
- **程序化视觉**：基图 `purple.png` 打底。叠层：**五角暗星**（Graphics 5 角星，`#2d1b4e` 填充 α0.9 + `#c77dff` 描边 2px）+ 星周暗雾圈（`#1a1030` α0.35 环）。待机：星体自转 12s/圈（与 D1 反向），描边辉光 1.6s 呼吸。触发反馈：label「暗影星」color `#c77dff`；行+列双扫光（lightningRow+lightningCol 扫光叠加，透明度各 ×0.7）。
- **开放问题**：同 D1。

---

## 考证纠错（放弃桶里的假宝石 / 译名陷阱）

| 放弃桶写法 | 考证结论 |
|---|---|
| 「X形宝石」（9721） | **不是宝石**。Immortal Leio 法术原文 "Destroy Gems in an X shape"（X 形清除），机翻把动作读成了宝石名。该技能真正卡点是地点条件，与宝石无关。 |
| 「元素星河」（9138） | 机翻断句错误，原文 "Elemental Stars and (3) Umbral Stars"，即 D1+D2 两种星。 |
| 「临界星 / 暗影之星」 | 同为 Umbral Star 的两个中文译名，实现按一种处理（同"末日骷髅/厄运头骨"先例）。 |
| 「激怒宝石 / 愤怒宝石」 | 同为 Enrage Gem 的译名差异。 |
| 「赃物宝石 / 战利品宝石」 | 同为 Booty Gem 的译名差异。 |
| 「冻结宝石 / 冰冻宝石」 | 同为 Freeze Gem 的译名差异（官方数据 1 处亦作 Frozen Gems）。 |
| 「腐朽宝石 / 衰败宝石」 | 同为 Decaying Gem 的译名差异。 |
| 「诅咒状态 vs 诅咒宝石」 | 两者并存：8065/8756/8743 等放弃项卡的是诅咒**状态**（引擎已支持），与诅咒宝石（A3）无关，解锁技能数不要重复计。 |

---

## 汇总表（按放弃桶解锁技能数排序）

| # | 宝石 | kind | 确认度 | 匹配归属 | 触发 | 解锁技能数 | 视觉一句话 |
|---|---|---|---|---|---|---|---|
| 1 | 龙宝石 Dragon Gem | `dragonGem` | 官方原文 | 六色（spec.color） | 匹配/摧毁→炸其列下方 | **20** | 色贴图+鳞纹+向下扫光 |
| 2 | 石像鬼 Gargoyle（善/恶） | `gargoyleGem` tier1/2 | 官方原文 | 不可匹配 | 摧毁→己方全体随机正面/敌方全体随机负面 | **19** | 骷髅灰化+蓝眼/红眼 |
| 3 | 元素星 Elemental Star | `elementalStar` | 官方原文 | 棕蓝绿红（star4 键） | 匹配→四色各+1 法力+炸对角 | **14** | 棕底四色四角星 |
| 4 | 天使宝石 Angel Gem | `angelGem` | 官方原文 | 不可匹配 | 摧毁→随机己方祝福 | **12** | 黄底白翼+光环 |
| 5 | 冻结宝石 Freeze Gem | `freezeGem` | 官方原文 | 蓝 | 匹配→冻结随机敌人 | **10** | 蓝贴图+冰晶放射 |
| 6 | 燃烧宝石 Burning Gem | `burningGem` | 官方原文 | 红 | 匹配→燃烧敌方全体 | **9** | 红贴图+火舌摇曳 |
| 7 | 流血宝石 Bleed Gem | `bleedGem` | 官方原文 | 紫 | 摧毁→流血随机敌人 | **9** | 紫贴图+抓痕血滴 |
| 8 | 巨人宝石 Giant Gem | `giantGem` | 官方原文 | 六色 | 匹配/摧毁→+5 法力+炸一圈 | **8** | 放大 1.08+金环脉动 |
| 9 | 灵力宝石 Spirit Gem | `spiritGem` | 官方原文（颜色存疑） | 多色（建议六色，缺省紫） | 匹配/摧毁→敌方全体 -2 法力 | **7** | 冷色魂火+鬼眼 |
| 10 | 恶魔传送门 Daemonic Portal | `daemonPortalGem` | 官方原文 | 不可匹配 | 摧毁→炸一圈+召唤随机恶魔 | **7** | 暗紫漩涡椭圆 |
| 11 | 石块 Stone Block | `stoneBlock` | 官方 Dev 发言 | 不可匹配 | 无（惰性障碍） | **7** | 去饱和岩块，无动画 |
| 12 | 诅咒宝石 Cursed Gem | `curseGem` | 官方原文 | 棕 | 匹配→诅咒随机敌人 | **6** | 棕贴图+紫符环自转 |
| 13 | 毒宝石 Poison Gem | `poisonGem` | 官方原文 | 绿 | 匹配→毒敌方全体 | **6** | 绿贴图+气泡上浮 |
| 14 | 恐怖宝石 Terror Gem | `terrorGem` | 官方原文 | 紫 | 匹配→恐怖随机敌人 | **6** | 紫贴图+魔眼游移 |
| 15 | 精灵火 Faerie Fire Gem | `faerieFireGem` | **未证实**（建议默认） | 绿（建议） | 摧毁→法伤 +50% 状态（建议） | **6** | 绿贴图+蝶形光晕 |
| 16 | 赃物宝石 Booty Gem | `bootyGem` | 官方原文（需重定语义） | 不可匹配 | 摧毁→10 金币（战斗外） | **5** | 黄贴图+钱袋金币 |
| 17 | 激怒宝石 Enrage Gem | `enrageGem` | 官方原文 | 红 | 摧毁→激怒随机己方 | **4** | 红贴图+怒气斜杠 |
| 18 | 暗影之星 Umbral Star | `umbralStar` | 官方原文 | 黄紫（star2 键） | 匹配→两色法力+炸行列 | **4** | 紫底暗色五角星 |
| 19 | 沉没宝石 Submerge Gem | `submergeGem` | 官方原文 | 蓝 | 摧毁→下潜随机己方 | **3** | 蓝贴图+波浪气泡 |
| 20 | 腐朽宝石 Decaying Gem | `decayGem` | 官方原文 | 棕 | 无触发；盘上光环（兵多一方全员 -甲） | **2** | 棕贴图+裂纹，静止 |
| 21 | 打昏宝石 Stun Gem | `stunGem` | **未证实**（建议默认） | 棕（建议） | 摧毁→打昏随机敌人（建议） | 0~2 | 棕贴图+眩晕星环 |
| 22 | 屏障宝石 Barrier Gem | `barrierGem` | **未证实**（建议默认） | 黄（建议） | 摧毁→屏障随机己方（建议） | 0~2 | 黄贴图+穹顶弧 |
| 23 | 缠绕宝石 Entangle Gem | `entangleGem` | 官方原文 | 绿 | 摧毁→缠绕随机敌人 | —（新发现） | 绿贴图+藤蔓弧 |
| 24 | 法力药水 Mana Potion Gem | `manaPotionGem` | 官方原文 | 六色 | 匹配/摧毁→撒 7-11 颗该色宝石 | **1** | 色贴图+药瓶轮廓 |

放弃桶合计约 **171 条**技能 id 被特殊宝石缺席卡住（treasureMap 元经济类另计 4 条）。

---

## 实现顺序建议

按「解锁技能数 ÷ 实现成本」排，同管线的一批做：

1. **第一批（摧毁管线复用 + 状态复用，性价比最高）**：A1 冻结、A2 燃烧、A3 诅咒、A6 毒、A13 腐朽 —— 解锁 33 条。全部复用已有状态（frozen/burning/curse/poison）与既有管线；腐朽需要一个新的回合钩子但无状态。
2. **第二批（六色族基建）**：C1 巨人 + C2 龙 + C3 灵力 —— 解锁 **35** 条。先落 `spec.color` 六色存储方案（C1/C2/C4 共用），龙解锁放弃桶第一名；灵力顺带。
3. **第三批（不可匹配族）**：B4 石像鬼（善恶）+ B1 死亡标记 + B2 天使 —— 解锁 **32** 条。石像鬼需要随机状态池（引用已实现集合）；天使需要 blessed 施加入口；B3 恶魔传送门（7 条）随本批或下一批（召唤口径要拍板）。
4. **第四批（星与杂项）**：D1 元素星 + D2 暗影之星（特殊连接键，需回归测试）—— 解锁 **18** 条；再带 A5 流血、A8 激怒、A9 沉没、A10 缠绕（状态已备，各是单分支）。
5. **收尾**：A4 恐怖（新状态 tick，量最大）、A7 精灵火、A11 打昏、A12 屏障（未证实默认行为）、B6 赃物（等语义裁定）、C4 法力药水。

> 注：doomSkull 相关的 11 条放弃记录**不是**本批解锁对象（doomskull 已实现，那些技能卡在定量转换等其它原语上）。

## 风险与护栏

- **SPAWNABLE_SPECIALS 白名单默认不扩**：官方先例是"战役期间偶尔掉落、战役结束停止"，本作无战役系统；自然掉落一旦开启会稀释骷髅/颜色分布并改变既有对局随机数序列。若要开启，只允许加入 A 组可匹配类，且 `specialSpawnChance` 建议上限 0.02（官方口径"rarely"）。不可匹配类（B 组）**禁止**入白名单——会淤积棋盘（同 bomb/wish当初的设计理由）。
- **随机数序列**：新触发分支若引入 `rng.next()`（随机目标、随机状态池、药水数量），只在"对应宝石实际在场"时消耗——保证无新宝石的存量对局逐字节可复现（GravitySystem 骷髅风暴的同款护栏）。
- **`settleDestroyed` 记账**：巨人 +5 法力、灵力 -2 法力都发生在摧毁结算之后；星的多色法力在组结算处加发。三处都要走 `ManaDistributor`/`canGainMana`（沉默拦截）同口径，别直接改 `mana` 字段（`applyWish` 的 buff 事件先例）。
- **对齐修正（窗口 C 遗留，顺路修）**：① web 官方是"matched **or destroyed**"都触发，引擎现仅匹配路径（`collectMatchTriggers`），应把 web 移入摧毁管线双路径；② 通配倍率官方是**相加**（x2+x3=x5），引擎 `resolveSettle` 是相乘——官方口径见 [Heroic Gems]；③ 闪电/沙漏官方有"matched/destroyed/exploded 均给 1 法力"，引擎靠宝石数天然结算、无差额，无需改但文档要记。①② 属行为变更，会动已过验收的对局结果，**需用户点头后单独做**。
- **`boardSpecialCount` 计数 API**：技能二次缩放"因 X 宝石数而增强"依赖它；六色族按 kind 计数即可（不细分颜色，除非技能文本要求"蓝色巨人宝石数"——放弃桶暂无此句式）。
- **性能**：24 种新宝石全部免贴图；每格叠层 ≤2、无逐帧滤镜、触发反馈 ≤450ms——见 §0 预算。GemSpritePool 复用不受影响（叠层随 `setType` 重绘）。

## 开放问题（需用户/引擎侧拍板）

1. **六色族存储**：`SpecialGemSpec` 加 `color?: BaseColor`（推荐） vs 每色一个 kind（dragonRed/dragonBlue… 共 12 个 kind，词表爆炸）。
2. **灵力宝石的归属色集合**与"汲取法力是否转移给触发方"（建议：六色、不转移）。
3. **赃物宝石重定语义**（建议：摧毁 → 随机己方 +5 法力；或降级为纯计数燃料）。
4. **恐怖状态的完整度**：做完整"队伍位次下移 10%/回合"还是先做状态挂载空壳（技能计数可用）。
5. **恶魔传送门的召唤模板**：随机恶魔的等级/属性缩放口径。
6. **窗口 C 对齐修正**（web 双路径、通配倍率相加）是否随本批一并做——涉及既有对局回归。
7. **未证实三宝石**（精灵火/打昏/屏障）的建议默认行为是否照单全收。
8. **腐朽光环的结算频率**（建议回合尾一次扫描）与同数兵员时"双方都扣"的确认。

## 语义来源

**官方规则句（确认度：官方原文）**
- Heroic Gems 总表（Uber Doomskull/Lycanthropy/Mana Potion/Burning/Wildcard/Cursed/Wish/Spirit/Gargoyle/Bomb/Giant/Web/Dragon/Freeze/Elemental Star/Umbral Star/Death Mark/Booty/Hourglass/Lightning/Terror/Angel/Ghost/Daemonic Portal 全部条目）：[Infinity Plus 2 官方帮助中心 Heroic Gems](https://gemsofwar.zendesk.com/hc/en-us/articles/360004543635-Heroic-Gems)
- 状态效果定义（Frozen/Cursed/Death Mark/Terror/Blessed/Burning/Poison/Enrage/Entangle/Web）：[官方 All status effects and immunity Traits](https://infinityplus2.freshdesk.com/support/solutions/articles/150000208274-all-status-effects-and-immunity-traits)
- 不可匹配宝石集合（Stone Blocks/Wish/Bomb/Gargoyle/Death Mark）：[官方论坛 Dev 发言 topic 79832](https://community.gemsofwar.com/t/bug-with-the-new-weapons-of-grimnir-and-fomor-the-vinthian/79832)
- Bleed Gem：[官方战役公告 Wilhelmina's Rose](https://gemsofwar.com/campaign-begins-wilhelminas-rose/)（[镜像](https://community.gemsofwar.com/t/campaign-begins-wilhelminas-rose/88966)）
- Poison Gem：[官方战役公告 Campaign 27 / Altar of Malice](https://gemsofwar.com/campaign-begins-campaign-27/)（[镜像](https://community.gemsofwar.com/t/campaign-begins-campaign-27/89254)）
- Volcano Gem：[官方战役公告 The Ruby Heptagon](https://gemsofwar.com/campaign-begins-the-ruby-heptagon/)（[镜像](https://community.gemsofwar.com/t/campaign-begins-the-ruby-heptagon/89991)；"红色，被摧毁时向上方直/斜三列清除"另见 in-game 指南引述 [topic 69968](https://community.gemsofwar.com/t/spoiler-alert-any-details-provided-are-subject-to-change/69968)）
- Enrage Gem：[官方战役公告 Axe of the Horde]（[镜像](https://community.gemsofwar.com/t/campaign-begins-axe-of-the-horde/88623)）
- Submerge Gem：[官方战役公告 Trident of Dago'Nath]（[镜像](https://community.gemsofwar.com/t/campaign-begins-trident-of-dagonath/87530)）
- Entangle Gem：[官方战役公告 The Primeval Tome]（[镜像](https://community.gemsofwar.com/t/campaign-begins-the-primeval-tome/84999)）
- Decaying Gem：[官方战役公告 Crown of the Decaying Queen]（[镜像](https://community.gemsofwar.com/t/campaign-begins-crown-of-the-decaying-queen/87004)）
- Angel Gem：[官方战役公告 Amatiel's Prison]（[镜像](https://community.gemsofwar.com/t/campaign-begins-amatiels-prison/83679)）
- Daemonic Portal Gem：[官方战役公告 The Unholy Flame]（[镜像](https://community.gemsofwar.com/t/campaign-begins-the-unholy-flame/86384)）
- 石像鬼善/恶眼色与末日骷髅引爆：[Reddit r/GemsofWar](https://www.reddit.com/r/GemsofWar/comments/vozeme/question_about_new_gems/)、[官方论坛](https://community.gemsofwar.com/t/gargoyle-gems-are-the-worst-gems-ever/75919)

**官方数据文本（确认度：官方数据，用法证据）**
- 全部兵种/武器法术英文原文：gowhead.com 实体 API dump（本仓库 `data/raw/troops.gow.zh.json` 的同源英文版，2026-09-16 拉取）；生成来源清单即出自该 dump。

**未证实（确认度：未证实，建议默认）**
- Faerie Fire Gem / Stun Gem / Barrier Gem 的触发规则句（本体存在性有官方数据与成就佐证，规则句待官方文档补齐；Faerie Fire **状态**本身有官方定义）。
- Bleed/Faerie Fire/下潜等状态的数值细节引自 [官方 Wiki 状态页](https://gems-of-war.fandom.com/wiki/Status_Effect)（社区维护，非官方）。
