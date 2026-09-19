## 6. 熔炉锻造（英雄页内 · `#hero` → 武器库 → 熔炉锻造）
> 计数：P0 3 / P1 3 / P2 1

走查方式：Playwright 无头 chromium，视口 1600×900。熔炉不是独立路由，**唯一入口**是
`#hero` → slab 上的「武器库 N」→ 弹层右上角 `secondary` 按钮「熔炉锻造」（一个 toggle）。
两档存档各跑一遍：演示档（主角 Lv.12、灵魂 21,880、黄金 38,800 → 全部配方门槛不足）与
注入档（Lv.45、灵魂 200 万、黄金 50 万 → Tier1 可造、Tier2 神话仍不足）。
脚本：`artifacts/ux-audit-scripts/u3-hero-shots{,2}.mjs`、`u3-probe.mjs`（配方列表可达性）、
`u3-probe3.mjs`（详情文本可见性与遮挡命中测试）、`u3-catalog-audit.mjs`（9 配方的数据层可取字段）。
console 错误 **0 条**。本章的问题不是"数据没接"——数据全在，是**没有一个能承载它的页面**：
`design/WEAPON-FORGE-DESIGN.md §4` 设计的「武器锻造所」页面（里程碑 F3）从未落地，
熔炉被塞进了武器库弹层的一个 toggle 里。

### 截图

| 截图 | 状态 | 说明 |
|---|---|---|
| `shots/forge-recipes-locked.png` | 配方列表（Lv.12） | 9 个 tile **全部**挂同一个黑标「材料/等级不足」；稀有度位被「Tier 1 / Tier 2」占用 |
| `shots/forge-recipes-unlocked.png` | 配方列表（Lv.45 · 灵魂 200 万） | 4 个仍挂「材料/等级不足」，5 个无标——两种状态的视觉差只有那枚小黑标 |
| `shots/forge-recipe-detail-locked.png` | 选中 Tier1 配方（不可造） | 右侧详情：一张图 + 一个灰按钮，**零文字** |
| `shots/forge-recipe-detail-mythic.png` | 选中黎明使者（神话 · 130 万魂） | 同上。稀有度「神话 · Tier 2」、名称「黎明使者」、来源、消耗四行**全部被卡面图盖住** |
| `shots/forge-recipe-detail-ready.png` | 可锻造态（屠戮铃铛） | 仍是一张图 + 一个只露出上半截的「锻 造」按钮；没有任何"你将得到什么"的信息 |

### 问题清单

| # | 级别 | 问题 | 证据（截图/代码 file:line/盘点数据） | 用户在哪一步会卡或误解 | 修法指针（文件） |
|---|---|---|---|---|---|
| F-1 | **P0** | **配方详情面板里的全部文字都被卡面图压住，面板等于「一张图 + 一个按钮」**（用户原话「都看不到武器的具体属性」字面命中）：`.detail-art` 容器高 148px，里面的 `img` 是 `width:100%; aspect-ratio:1` → 实渲 337px，上下各溢出 ~94px，而 `.vault-detail` 是 `overflow:visible` | `u3-probe3.log` 命中测试逐行实测：`稀有度「神话 · Tier 2」coveredBy IMG.tile-img / isSelfOrChild false`、`名称「黎明使者」coveredBy IMG.tile-img`、`来源「熔炉锻造 · 官方直购位（三色神话）」coveredBy IMG.tile-img`、`消耗「灵魂 1,300,000（持有 21,880）· 黄金 200,000（持有 38,800）· 需主角 Lv.40」coveredBy IMG.tile-img`；`artBox.cssH 148px` vs `imgBox.h 337`。根因 `screens.css:1935-1937`（`.detail-art { height:148px }`）+ `:2823`（`.detail-art .tile-img { width:100%; aspect-ratio:1 }`）+ `:1925-1933`（`.vault-detail { overflow:visible }`）。截图 `forge-recipe-detail-mythic.png` / `-ready.png` / `-locked.png` 三态一致 | 玩家点开一个配方想知道"这把值不值 130 万灵魂"：他看到一张好看的图，和一个灰掉的按钮。**连武器名字和价格都读不到**，更不用说法力色、耗蓝、技能、词缀。他唯一能做的是回到左边列表读那行小字（20,000 魂 + 15,000 金），然后在完全不知道自己买的是什么的情况下决定要不要按下去 | `src/meta/shell/styles/screens.css:1935-1946,2823,1925-1933`（立即可修的一行级遮挡）；结构性重做见下文《UX-1 配方详情线框》：`src/meta/screens/heroScreen.ts:870-912` |
| F-2 | **P0** | **熔炉没有页面、没有路由、没有标题**：它是武器库弹层里的一个 toggle（`forgeMode` 布尔），切进去后弹层标题仍写「武 器 库 · 武器是主角唯一的施法手段」，右上角按钮文案也仍是「熔炉锻造」（不变成"返回武器库"），头部计数仍是「已获得 5 / 730」——**整屏没有任何地方写着"你现在在熔炉里"** | `heroScreen.ts:235`（`<button class="secondary" id="vaultForge">熔炉锻造</button>`）、`:250-256`（`this.forgeMode = !this.forgeMode` 只重画 rack 与 detail，不改标题/计数/按钮文案）、`:793-797`（renderRack 首行 `if (this.forgeMode) return this.renderRecipes()`）。设计文档 `design/WEAPON-FORGE-DESIGN.md §4` 规划的是带 `[淬炼][熔炉][图鉴]` 三 tab 的独立「武器锻造所」页，§5 里程碑 F3 未交付。截图 `forge-recipes-locked.png` 头部 | 玩家在武器库里点了「熔炉锻造」，列表整个变了一批东西（名字他没见过、价签变成"魂+金"），但标题还写着武器库。他不确定自己是进了新界面还是列表出了 bug；想退回去只能再点一次同一个按钮（那个按钮文案没变，看不出是开关）。**"我在哪 / 怎么回去"两个问题同时失效** | `src/meta/screens/heroScreen.ts:228-244,250-256`（至少改成受控 tab + 标题/计数随态切换）；终局：独立屏 `#weapons` 的第三个 tab，见 `05-hero.md` 的武器库线框 |
| F-3 | **P0** | **淬炼系统全链路已接线，但界面上一个入口都没有**：存档字段、网关端点、扣账闭环、战斗加成、demo 档种子数据全部就绪，材料库弹层还明写「去向：英雄页武器淬炼」——而 `src/meta/screens/**` 里 grep「淬炼/temper」**零命中** | 已就绪的一侧：`gateway/types.ts:158 temperWeapon(weaponId)`、`mockGateway.ts:346-350`、`systems/forgeOps.ts:34-67`（校验→扣钢锭/符卷/黄金→写回等级）、`systems/forge.ts:60-70`（消耗公式）、`battleBridge.ts:176-180`（每 2 级 +1 轮转进战斗面板）、`demo.ts:106`（演示档起始武器已淬炼 **3 级**）、`gameMain.ts:165,170`（材料库文案「去向：英雄页武器淬炼」「Doomed 系武器淬炼每级消耗 1 卷」）。缺失的一侧：`grep 淬炼\|temper src/meta/screens/*.ts` → **No matches**。`TASK-META §8.3` 标注为「已接线」 | 玩家在材料库看到自己攒了一堆钢锭，说明文字告诉他「去向：英雄页武器淬炼」。他去英雄页，翻遍主角卡/武器 slab/武器库/熔炉，**找不到"淬炼"两个字**。钢锭、熔铸符卷、以及活动里为它们打的所有工，全部是死库存；他甚至不会知道自己的起始武器已经被淬炼到 3 级 | `src/meta/screens/heroScreen.ts`（新增淬炼区，数据与网关全现成）；`design/WEAPON-FORGE-DESIGN.md §4` 的淬炼 tab 线框可直接用 |
| F-4 | P1 | **同一把武器在熔炉和武器库里叫两个不同的名字**：9 个配方里 **6 个**的 `recipe.name` 与目录官方中文名不一致（熔炉名是另一套翻译），锻造成功后武器进包按目录名显示 | 逐条对照（左＝熔炉 `soulforge.ts:22-33`，右＝目录 `weapons.json`，见 `u3-catalog-audit.txt` 熔炉 9 配方表）：蛋爆/**爆蛋**、克萨诺斯之眼/**萨瑟诺斯之眼**、冰与火/**火与冰**、屠戮铃铛/**杀戮钟响**、凋零之触/**凋萎之触**、火花火箭 2.0.16/**闪光火箭 2.0.16**；一致的只有 黎明使者、劫数之卷、劫数之书。双名同时可见：`forge-recipe-detail-mythic.png` 列表里是「蛋爆 / 冰与火」，`hero-vault-mixed-injected-scroll.png` 武器库里是「爆蛋 / 火与冰」 | 玩家花 20,000 灵魂造了「冰与火」，回武器库找它——列表里没有这把，只有一把叫「火与冰」的。他第一反应是"我造错了"或"东西没进包"，甚至可能再造一次（好在 `ALREADY_OWNED` 会拦）。**锻造这个高成本、低频、强仪式感的操作，结果确认环节直接失灵** | `src/meta/data/soulforge.ts:22-40`（`name` 字段删掉、改由 `weaponCatalog.anyWeaponById(weaponId).name` 单源取名） |
| F-5 | P1 | **档位门槛与材料缺口合并成一句「材料/等级不足」，不说差什么、差多少**；且这枚黑标是不可造态的**唯一**视觉差别（tile 底色/描边/稀有度位完全不变） | `heroScreen.ts:847`（`can = souls >= r.souls && gold >= r.gold && hero.level >= forgeTierUnlockLevel(tier) && !owned` 四个条件压成一个布尔）、`:854`（`<em class="tile-flag lock">材料/等级不足</em>`）、`:849`（稀有度位被 `Tier 1/Tier 2` 占用）；`u3-probe.log` 实测 Lv.12 档 **9/9** 全挂同一枚标签。而系统层其实逐条分好了：`forge.ts:176-190` 会产出 `TIER_LOCKED「熔炉 Tier 2 需要主角 40 级（当前 12）」`、`MISSING_SOULS「灵魂不足（需要 1300000，持有 21880）」` 等具体 issue，UI 一条都没用。截图 `forge-recipes-locked.png`（全灰）vs `forge-recipes-unlocked.png` | 玩家看到 9 个配方全写「材料/等级不足」，他得出的结论是"熔炉现在整个用不了"，于是关掉再也不来。实际上他差的只是主角等级（20 级），灵魂 21,880 已经超过 20,000 的门槛——**一句含糊的合并文案，把"再练 8 级就能造 6 把"这个明确目标藏掉了** | `src/meta/screens/heroScreen.ts:840-868`（tile 分「等级未达/材料差 N/可造/已拥有」四态，文案取 `forge.ts` 的 issue message）；`src/meta/systems/forge.ts:176-195`（issues 已现成） |
| F-6 | P1 | **「锻造」按钮不给余额对比、不给缺口、不做二次确认，而且被裁一截**：按钮 `bottom 788` 超出弹层可见区 `772`；按下去就直接扣 130 万灵魂级别的资源 | `u3-probe3.log` `forgeBtn { top:744, bottom:788, insideSheet:true }` vs `bodyBottom 772`（下沿被裁 16px）；`heroScreen.ts:897-911` `doForge.onclick` 直连 `gateway.forgeCatalogWeapon`，成功只有一句 toast，无确认弹层；消耗与持有的对比只存在于那行**被图盖住**的 `detail-source` 文本里（F-1） | 可造态下玩家看到一张图和一个金色按钮，不知道会扣多少（文字被图盖了）、不知道扣完还剩多少、按下去没有"确认吗"。神话档一次 130 万灵魂 + 20 万黄金——**这是整个 meta 层最贵的一次单击，却是确认信息最少的一次** | `src/meta/screens/heroScreen.ts:870-912`（消耗/余额/缺口三段式 + 高价配方二次确认）；`src/meta/shell/styles/screens.css:1988-1992`（按钮落位与裁切） |
| F-7 | P2 | **配方列表最后一行被弹层底沿裁掉**（第 9 个配方「劫数之书」的消耗行贴在裁切线上）；同一个弹层里武器库是彻底滚不动（`05-hero.md` H-1），熔炉是"差一点点"，两处同源 | `u3-probe.log` 熔炉段 `recipeCount 9 / rackScrollHeight 591 / rackClientHeight 591 / unreachable 0`，而 `.vault-body` 可见高 557 → 超出 34px。截图 `forge-recipes-locked.png` 底部 | 玩家不确定"是不是还有更多配方在下面"，试着滚一下——没反应。他无法判断 9 个就是全部，还是列表坏了 | `src/meta/shell/styles/screens.css:1863-1874`（同 H-1 的滚动容器修法） |

### 重设计提案

#### P0 · UX-1：熔炉配方详情重做（线框 + 逐项数据可取性）

面板宽度沿用 376px（`screens.css:1863` 的右列），**改为可纵向滚动的信息列 + 常驻底部操作条**。
信息层级自上而下，主角是"这把武器是什么"，注脚是"怎么付钱"——当前实现正好相反（唯一可见的是图，唯一可读的是价签）：

```
┌ 配方详情（376px · overflow-y:auto） ──────────────────┐
│ ┌───────────────────────────────────────────────┐    │ ①卡面立绘
│ │   [官方卡面 webp · 1:1 · 稀有度描边 + 外发光]   │    │  容器与图同尺寸，不再溢出
│ │                              ◆ 神话            │    │ ②稀有度（描边色 + 角标文字）
│ └───────────────────────────────────────────────┘    │
│  黎 明 使 者            Dawnbringer                  │ ③名称（中/英）
│  神话 · 剑 · 皓彩森林 · 击杀者                       │ ④稀有度/类型/王国/角色
│ ─────────────────────────────────────────────────    │
│  法力  ●蓝 ●红 ●黄   耗蓝 20                         │ ⑤法力色三宝石 + 耗蓝（大号衬线数字）
│  攻+3   甲+4   血+4   魔+1                           │ ⑥主角属性加成（四维同图标语言）
│ ─── 法术 · 黎明使者 ─────────────────────────────    │
│  对所有敌人造成 [32 点伤害]，伤害值因敌我双方的       │ ⑦技能全文 + 公式高亮
│  黄色军队数量而增强。赋予所有盟友屏障效果。          │  （[32 点伤害] 可点开算式：
│  如果有 13 颗或更多红色宝石，则获得 2 点魔法值。     │   魔力 30 → +2 → 32，沿用现有交互）
│  ⓘ [x2] 增强比                                       │
│ ─── 淬炼词缀（5 条 · 4·8·12·16·20 级解锁）───────    │ ⑧词缀（Doomed 5 档 / 普通 4 档）
│  🔒 Lv.4   险恶 · 对最后一名敌人造成 5 点伤害        │
│  🔒 Lv.8   …                                         │
│ ─── 淬炼加成预览 ───────────────────────────────     │ ⑨淬炼加成预览
│  每 2 级 +1，按 攻→甲→血→魔 轮转                     │
│  Lv.0 现在 │ Lv.10 攻+3甲+2血+2魔+2 │ Lv.20 各+5     │
│ ─── 消耗 ───────────────────────────────────────     │ ⑩消耗与余额对比
│  灵魂  1,300,000   持有 21,880   ⚠ 差 1,278,120      │  （红=缺口，绿=够）
│  黄金    200,000   持有 38,800   ⚠ 差 161,200        │
├───────────────────────────────────────────────────┤
│ 🔒 熔炉 Tier 2 需要主角 40 级（当前 12）            │ ⑪Tier 门槛遮罩（独立一行，不与材料混说）
│ [        锻  造（不可用）        ]                   │
└───────────────────────────────────────────────────┘
```

**逐项数据可取性**（这是阶段 B 能不能一次做完的关键，逐项核过）：

| # | 字段 | 数据现成？ | 取法 |
|---|---|---|---|
| ① | 卡面立绘 | ✅ 现成 | `weaponCatalog.catalogIconUrl(w)` → `/gowhead-icons/{imageFile}`；9 配方 `图=OK` 全覆盖（`u3-catalog-audit.txt`） |
| ② | 稀有度描边 | ✅ 现成 | `anyWeaponById(id).rarity`（Epic 6 / Mythic 1 / Doomed 2）→ 现有 `heroScreen.rarityClsOfRarity()`（`:644-654`）。**注意**：该函数把 Doomed 映射到 `r-mythic`（`:647`）、Legendary 映射到 `r-legend`，与 `WeaponCodexPage.RARITY_COLOR`（`:55-58`）是两套色板，并入时需统一为一张表 |
| ③ | 名称（中/英） | ✅ 现成 | `anyWeaponById(id).name` / `.nameEn`。**必须改成从这里取**，不要用 `soulforge.recipe.name`（F-4 的双名根因） |
| ④ | 类型/王国/角色 | ⚠ 部分 | `rarity`/`kingdom` 在 `CatalogWeaponDef` 里有；`weaponType` 有但是小写英文键（`weaponCatalog.ts:71`），中文名要借 `WeaponCodexPage.TYPE_ZH`（`:59-62`）——建议把 TYPE_ZH/RARITY_ZH 提到共享模块；`role/roleName` **没搬进** `CatalogWeaponDef`（`weapons.json` 里有，9 类角色共 718 把） |
| ⑤ | 法力色 + 耗蓝 | ✅ 现成 | `manaColors` / `manaCost` 已在 `CatalogWeaponDef`（`:73-74`）；渲染直接用 `chrome.gemSvg()`（英雄页已在用，`heroScreen.ts:679,823`）。9 配方实测：mana 11~20，单色 3 把/双色 5 把/三色 1 把 |
| ⑥ | 主角属性加成（攻甲血魔） | ⚠ 源有 · 适配层缺 | `weapons.json` **718/718 把都有** `attack/armor/health/magic`（`u3-catalog-audit.txt`「有主角属性加成的武器：718 把」），但 `weaponCatalog.ts:62-85` 建 `CatalogWeaponDef` 时**没搬这四个字段**，`battleBridge.ts:168-200` 也没消费它们 → **展示只需补搬字段（一行级）；要真的生效需另立数值裁定**（这是平衡问题，不该混在 UI 批里）。首批 20 把 `w_*` 是**真缺源**：`WeaponDef`（`weapons.ts:28-44`）里根本没有这四个字段 |
| ⑦ | 技能全文 + 公式高亮 | ✅ 现成 | 文案 `anyWeaponById(id).description`（= `weapons.json` 的 `spell.description`，9 配方 33~103 字，`u3-catalog-audit.txt` 有全文样例）；渲染**直接复用** `shell/spellText.ts` 的 `renderSpell(desc, magic)` + `formulaParts/formulaRule/formulaKind`，英雄页 `spellSheet()`（`heroScreen.ts:668-690`）与 `bindSheetTips()`（`:692-736`）已是成品，配方详情照抄即可 |
| ⑧ | 词缀 + 解锁档 | ⚠ 源有 · 适配层丢弃 | 解锁档位**逻辑现成**：`forge.ts:16-19` `AFFIX_UNLOCK_LEVELS = [5,10,15,20]`、`DOOMED_AFFIX_UNLOCK_LEVELS = [4,8,12,16,20]`，`forge.ts:75-81 affixUnlockedCount(rarity, level)` 直接可调。词缀**文本**在 `weapons.json` 里（710/718 把有 affixes；9 配方全部 4~5 条），但 `weaponCatalog.ts:83` 写死 `affixes: []` **把数据扔了** → 需一行级补搬。`WeaponCodexPage.ts:176-181` 已有一份词缀渲染可参考 |
| ⑨ | 淬炼加成预览 | ✅ 现成（公式） | `forge.ts:52-60 temperingCost(rarity, level)`（钢锭 = 基数×ceil(next/2)，基数表 `:29-38`；黄金 200×next；Doomed 改符卷 1/级）+ `battleBridge.ts:176-180` 的「每 2 级 +1、攻→甲→血→魔 轮转」= 预览表可纯算，无需新数据 |
| ⑩ | 消耗与余额对比 | ✅ 现成 | 消耗 `SOULFORGE_RECIPES[].recipe.{souls,gold,ingots?,scrolls?}`；余额 `save.currencies.souls/gold`、`save.materials.ingots/forgeScrolls`；**缺口文案不用自己写**——`forge.forgeWeapon()`（`:176-195`）已返回 `MISSING_SOULS「灵魂不足（需要 X，持有 Y）」` 等 issue，照搬 message 即可 |
| ⑪ | Tier 门槛遮罩 | ✅ 现成 | `forge.forgeTierUnlockLevel(tier)`（`:170-172`，Tier1=20 / Tier2=40）+ `save.hero.level`；`TIER_LOCKED` issue 文案已带「当前 N」 |
| — | 来源说明 | ✅ 现成 | `SOULFORGE_RECIPES[].source`（「复活节活动」「官方直购位（三色神话）」等 9 条） |

**确实缺源的只有两项**：
1. **首批 20 把 `w_*` 的攻甲血魔**（`WeaponDef` 无此字段）——若走 `05-hero.md` 方向 C（w_* 换成目录武器）则自动消失；
2. **词缀的战斗语义**（`WEAPON-FORGE-DESIGN §5` 里程碑 F4 未做，一期只解锁展示）——面板上应如实标注「词缀效果二期生效」，不要让玩家以为已经在打。

#### P0 · F-2 + F-3：熔炉与淬炼各自有落点（结构线框）

熔炉和淬炼是两个动作（**造新的** vs **练手上的**），当前一个藏在 toggle 里、一个完全没有。
按 `WEAPON-FORGE-DESIGN §4` 的原方案落到 `#weapons` 屏的 tab 上（与 `05-hero.md` 的武器库线框同一个屏）：

```
[ 我的武器 12 ]  [ 全部 730 ]  [ 熔 炉 6/9 可造 ]  [ 淬 炼 3 把可练 ]
                                     ↑                    ↑
              tab 上就带"现在有几件事能做"          钢锭/符卷的唯一去向
                                                    （材料库文案已指向这里）
```
- **熔炉 tab**：左列配方（按 Tier 分组吸顶，tile 显真稀有度而非「Tier 1」，四态区分：可造/材料差 N/等级未达/已拥有）+ 右列上面那份详情面板。
- **淬炼 tab**：左列「已拥有且未满级」的武器（进度条 `▮▮▮▯▯ 8/20`）+ 右列复用同一份详情面板，差异只在底部操作条换成 `[淬炼 +1]` 并显示本级消耗与词缀解锁预告（`WEAPON-FORGE-DESIGN §4` 的线框就是这个）。
- **两个 tab 共用一份详情组件**，这是这套方案最大的实施收益：UX-1 的信息层级只需实现一次。

### 五问自查

1. **3 秒问题**：不过关，且是最糟的一类不过关——**三秒内玩家不知道自己在哪个界面**（标题仍写"武器库"，F-2）。进来后视觉最强的是九张漂亮卡面和右侧那张大图，主行动「锻 造」按钮在最右下角、灰的、被裁掉一截（F-6）。玩家读不到任何一句告诉他"这里是用灵魂换武器的地方"的话。
2. **信息主次**：彻底倒置。玩家此刻要决策的是「这把武器强不强 / 我的资源够不够 / 不够还差多少」。现在面板里唯一被放大的是**卡面图**（还大到把字全盖住），唯一能读到的是价签，而"强不强"（法力色/耗蓝/技能/词缀/淬炼成长）一个字都没有——这正是用户原话「都看不到武器的具体属性」。
3. **视觉语言**：卡面 + 稀有度描边 + 衬线数字这套是对的（官方立绘质感也远好过程序化剪影），问题在**排版**：`Tier 1` 这种开发档位术语占了稀有度的位置（玩家不知道 Tier 1 是史诗还是神话），「材料/等级不足」这种合并文案占了状态位，而真正的稀有度色只体现在详情面板那条被图盖住的分割线上。
4. **操作路径**：进入要 3 步（`#hero` → 武器库 → 熔炉），且第 2、3 步的入口都是灰色 `secondary` 按钮；退出只能再点同一个没变文案的按钮。淬炼**没有路径**（F-3）。最讽刺的一条：材料库弹层写着「去向：英雄页武器淬炼」，玩家照着走过去，终点不存在。
5. **极端态**：逐条实跑——
 - **全部不可造（Lv.12 演示档）**：9/9 挂同一枚「材料/等级不足」，等于"整个熔炉坏了"的观感（F-5）。
 - **可造（注入 Lv.45 + 200 万魂）**：黑标消失、按钮变金色，除此之外与不可造态没有任何差别；按钮仍被裁 16px（F-6）。
 - **神话档资源远远不足**：详情里有一行完整的「灵魂 1,300,000（持有 21,880）」——写得其实不错，**但它被卡面图完全盖住**（F-1），玩家永远读不到。
 - **已拥有**：tile 上有「已拥有」标（`heroScreen.ts:851`），系统层也有 `ALREADY_OWNED` 拦截（`forge.ts:183`）；这一态是设计过的，但锻造成功后武器换了名字（F-4）会让玩家怀疑它没成功。
 - **锻造成功后的落点**：`:904-910` 成功后留在熔炉并重新选中该配方，不跳去武器库看新武器——玩家拿到的最强正反馈（新武器入库）被留在原地，只有一句 toast（`:904`，而且 toast 里用的是熔炉那套名字，F-4）。
