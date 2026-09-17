# Gems of War 主角武器（Hero Weapons）调研汇总

> 调研日期：2026-09-17。目的：为本项目元游戏层 M5（主角武器系统，约 20 把）提供官方数值与句式基准。
> **逐把设计卡（全量中文，含解锁条件）：[GOW-WEAPONS-CATALOG.md](./GOW-WEAPONS-CATALOG.md)**。
> 结构化数据：[artifacts/gow-weapons.json](../artifacts/gow-weapons.json)（脚本 `scripts/_parse_gow_weapons.mjs` / `_augment_gow_weapons.mjs` 可重跑）。

## 0. 结论速览

1. **武器 = 主角的技能载体**：主角同时只装备一把武器；武器决定主角的施法法术与法力颜色组（像部队一样靠消对应色宝石充能）。
2. 可验证的经典目录共 **123 把**（官方站 game-guide 全量抓取入库），费用 4~20，均值 **11.87**；单色 88 把 / 双色 33 把 / 全六色 2 把。
3. 获取渠道分三代：**精通解锁（legacy）→ 王国 $4.99 武器包 / 活动 → 灵魂熔炉（Soulforge）与职业专属神话武器（现代）**；现代另有武器淬炼（Weapon Tempering，钢锭升级武器）。
4. **职业系统与武器强绑定**：37 职业（2023 快照），每职业 250 胜解锁唯一一把**单色神话武器**；装备本职业指定色武器才有职业 Magic 加成。已验证 11 把职业武器名。
5. 武器法术的招牌机制是**增幅比（Ratio / Boost）**：按消除/摧毁的宝石数或某属性放大效果——与本项目 SKILL_LIBRARY 的 SecondaryModifier（[xN] 随局面变动）直接同构，M5 可低成本复用。

## 1. 调研范围、方法与覆盖度（诚实声明）

| 来源 | 通路 | 拿到什么 | 可信度 |
|---|---|---|---|
| gemsofwar.com/game-guide-weapon-list（官方站） | curl 直抓 HTML → 脚本解析 | 123 把全字段（名称/稀有度/费用/颜色/解锁/法术/图 ID） | 高（官方原文，逐把入库） |
| community.gemsofwar.com（官方论坛，Discourse） | curl 抓 `.json` API → 落盘解析 | 职业清单、职业武器名、$4.99 武器包全清单、熔炉规则、现代解锁等级表 | 高（官方人员帖子原文） |
| gems-of-war.fandom.com（wiki） | web_reader 预览（~300 字符，正文被 Cloudflare + 截断挡住） | 系统机制描述句、快照版本号 | 中（仅描述级信息） |
| gowdb.com（社区全量数据库） | DNS A 记录已消失 | ——（站已死，2024-25 攻略引用为陈旧引用） | —— |

**未覆盖**（需要逐页抓取，本次因 fandom 访问受限未做，不影响 M5 设计基准）：
- 37 把职业神话武器的完整名录（已验证 11 把；其余在 `/wiki/{Class}_(Hero_Class)` 逐页）。
- 各职业的满级属性/特质逐条数值（wiki Classes 页正文未入库；机制条目已验证，见 [gow-classes-raw.md](../artifacts/gow-classes-raw.md)）。
- 2019 年后新增的现代武器（熔炉/活动/地下城奖励等）逐把数据。
- wiki Weapons 页的旧版清单（86 把，与官方 123 高度重叠；差异条目如 Apprentice's Blade、Crescendo——后者已经由论坛官方帖验证存在，为 Pan's Vale $4.99 包武器）。

## 2. 武器系统机制

### 2.1 基础规则（wiki Weapons 页描述原文要点）

- 武器改变主角的施法法术；编队界面 HERO 页签装备；**同时只能装备一把**。
- 每把武器有自身法术与法力颜色（1~2 色，个别全色）；主角消除对应色宝石为武器充能，充满即施放。
- 法术数值按主角属性缩放：伤害公式 `[X+Magic]`、治疗/增益 `[X+Magic]`、部分固定值或 `[0+Magic]` 纯增幅型；武器本身**无独立等级**（经典时代），威力随主角面板成长。
- **增幅比（Boost / Ratio）**：法术标注 `(Ratio = 3:1)` 等——每满足一个条件单位（如每颗被消除的某色宝石）效果按比例放大。这是 GoW 主角武器的核心深度来源（123 把目录中记载了该标注的条目见 §4 表）。

### 2.2 现代补全（2017 重做后；来源论坛官方帖）

- **武器淬炼（Weapon Tempering）**：玩家 3 级解锁，用钢锭（Ingots：Rare / Ultra-Rare / …）升级武器（论坛帖 89373 官方等级表）。即现代武器获得了成长线。
- **职业神话武器**：玩家 20 级解锁职业系统；每职业带该职业出战 250 胜解锁唯一神话武器（兼容主角法力色）；官方裁定职业武器一律单色（Flame Soul 由红/绿改回红，帖 46611）。
- **灵魂熔炉（Soulforge）**：玩家 38 级解锁 Tier 1-10，45 级 Tier 11-20（Cursed Runes 入场）。可铸造入侵/突袭首领/末日之塔等活动武器；**精通/任务线武器与 $4.99 包武器永不进熔炉**（官方帖 55952 原文规则）。

## 3. 获取渠道全景

| 渠道 | 时代 | 规则 | 目录内条目 |
|---|---|---|---|
| 王国精通解锁 | legacy（2017 前） | 六色精通（火红/水蓝/地棕/自然绿/空气黄/魔法紫）等级 0~50；高级武器要求**双精通**或**全精通** | 88 把（官方目录 unlock 列） |
| $4.99 王国武器包 | 2017~ | 每王国一包一武器；随该王国活动返场；**永不进熔炉** | 33 把（官方帖 55952 全清单，含 6 把官方目录未收的新名：Fey Wand、Merchant's Blade、Festival Staff、Daemon's Leash、Undine's Trident、Tome of Sin） |
| 特殊活动 | legacy~今 | 活动商店/限时赠送 | 目录内 35 把 "Special Events"（部分与武器包重合） |
| 任务线 | legacy | 王国任务链奖励；War & Peace 出自 Khazial 后续战役，2019 年移入熔炉（特例） | 1~2 把 |
| 灵魂熔炉 | 2019.4~ | 灵魂+资源铸造活动系武器 | 活动系（入侵/突袭/末日之塔等） |
| 职业神话武器 | 2017~ | 每职业 250 胜解锁，单色神话 | 37 把（已验证 11 把名录，见 §5） |
| 直购神话 | 2018~ | 高价灵魂直购，如 Dawnbringer（三色，130 万灵魂） | 少量 |

## 4. 经典全量武器目录（123 把，官方站逐把解析）

> 字段：稀有度（Common/Uncommon/Rare/Epic/Legendary）· 费用 · 颜色 · 解锁 · 法术原文（`[X+Magic]` 为缩放公式）。
> 图片：`http://www.gemsofwar.com/gameguide/images/{imageId}.jpg`（官方原图床，可作美术参考）。

<!--TABLE:CATALOG:START-->
**单精通解锁（成长线，按精通色与等级排序）（65 把）**

| 名称 | 稀有度 | 费用 | 颜色 | 法术 |
|---|---|---|---|---|
| Hunter’s Spear | Common | 6 | 黄 | Deal [3+Magic] damage to a random enemy. |
| Javelin of War | Ultra Rare | 11 | 黄 | Deal [3+Magic] true damage to a random enemy. |
| Glaive of Storms | Ultra Rare | 12 | 黄 | Deal [3] damage to the first enemy, and remove all Red Gems to Boost damage. (Boost Ratio 3:1) |
| Lance of the Divine | Ultra Rare | 9 | 黄 | Deal [5+Magic] damage to a random enemy. |
| Thunderbolt | Epic | 12 | 黄 | Deal [4+Magic] true damage to a random enemy. |
| Frozen Soul | Epic | 12 | 黄 | Deal [4] damage to an enemy, and remove all Red Gems to Boost damage. (Boost Ratio 3:1) |
| Dragon Slayer | Epic | 10 | 黄 | Deal [5+Magic] damage to a random enemy. Deal 8 bonus damage if the enemy is a Dragon. |
| Sunbolt Javelin | Rare | 9 | 黄 | Deal [2+Magic] true damage to a random enemy. |
| Orpheus’ Dischord | Legendary | 12 | 黄 | Deal [6+Magic] damage to a random enemy, and Silence them. |
| Icy Glaive | Rare | 10 | 黄 | Deal [2] damage to a random enemy, and remove all Red Gems to Boost damage. (Boost Ratio 3:1) |
| Piercing Lance | Rare | 7 | 黄 | Deal [4+Magic] damage to a random enemy. |
| Priest’s Hammer | Common | 9 | 棕 | Deal [2+Magic] damage to the first enemy, and 1 damage to any adjacent enemy. |
| Mace of Malice | Ultra Rare | 12 | 棕 | Deal [3+Magic] damage to an enemy, and 1 damage to adjacent enemies. |
| Blade of Justice | Ultra Rare | 9 | 棕 | Deal [4+Magic] damage to the first enemy. |
| Knuckle Smasher | Epic | 12 | 棕 | Deal [4+Magic] damage to an enemy, and 1 damage to adjacent enemies. |
| Holy Avenger | Epic | 11 | 棕 | Deal [4+Magic] damage to the first enemy, and remove all Yellow Gems to Boost damage. (Boost Ratio 3:1) |
| Giant’s Mace | Rare | 10 | 棕 | Deal [2+Magic] damage to an enemy, and 1 damage to adjacent enemies. |
| Mountain Crusher | Legendary | 11 | 棕 | Explode [0+Magic] random Brown Gems. |
| Primal Rage | Legendary | 13 | 棕 | Deal [7+Magic] damage to the first enemy. Gain 1 Attack if the enemy dies. |
| The Stonehammer | Legendary | 13 | 棕 | Deal [6+Magic] damage to an enemy, and 1 damage to adjacent enemies. Jumble the Board. |
| Silver Sword | Rare | 7 | 棕 | Deal [3+Magic] damage to the first enemy. |
| Crude Club | Common | 4 | 红 | Deal [2+Magic] damage to the first enemy. |
| Warrior’s Axe | Common | 9 | 红 | Deal [3+Magic] damage to the first enemy. |
| Halberd of Might | Ultra Rare | 10 | 红 | Deals between 3 – [7+Magic] damage to the first enemy. |
| Axe of Chaos | Ultra Rare | 12 | 红 | Deal [5+Magic] damage to the first enemy. |
| Twisted Malice | Epic | 11 | 红 | Deals between 3 – [10+Magic] damage to an enemy. |
| Head Cleaver | Epic | 11 | 红 | Deal [6+Magic] damage to the first enemy. |
| Guardian Halberd | Rare | 8 | 红 | Deals between 3 – [6+Magic] damage to a random enemy. |
| Summer’s Fury | Legendary | 15 | 红 | Deal [2+Magic] damage to all enemies. Create 6 Red Gems. |
| Pigsticker | Legendary | 12 | 红 | Deal [6+Magic] damage to the last enemy. Explode a random gem if the enemy dies. |
| Gard’s Wall | Legendary | 12 | 红 | Gain [1+Magic] Armor, and remove all Purple Gems to boost the effect. (Boost Ratio 1:1) |
| Bloody Axe | Rare | 10 | 红 | Deal [4+Magic] damage to the first enemy. |
| Wizard’s Wand | Common | 7 | 紫 | Deal [3+Magic] damage randomly split among enemies. |
| Tome of Wizardry | Ultra Rare | 7 | 紫 | Explode a Gem. |
| Staff of the Magus | Ultra Rare | 10 | 紫 | Deal [6+Magic] damage randomly split among enemies. |
| Scythe of Corruption | Ultra Rare | 15 | 紫 | Deal [1+Magic] damage to all enemies. |
| Lost Grimoire | Epic | 10 | 紫 | Destroy a Row and Column. |
| Spellfire | Epic | 10 | 紫 | Deal [8+Magic] damage randomly split among enemies. |
| Death’s Grasp | Epic | 14 | 紫 | Deal [2+Magic] damage to all enemies. |
| Dusty Tome | Rare | 6 | 紫 | Destroy a Gem. |
| Morthani’s Scythe | Legendary | 16 | 紫 | Deal [2+Magic] damage to all enemies. Create 6 Skulls if an enemy dies. |
| Nysha’s Skull | Legendary | 15 | 紫 | Create [2+Magic] random Skulls. Gain an extra turn. |
| Spirit Staff | Rare | 8 | 紫 | Deal [5+Magic] damage randomly split among enemies. |
| Wicked Scythe | Rare | 12 | 紫 | Deal [0+Magic] damage to all enemies. |
| Scout’s Bow | Common | 9 | 绿 | Deal [2+Magic] damage to an enemy. |
| Bow of Betrayal | Ultra Rare | 10 | 绿 | Deal [4+Magic] damage to an enemy. |
| Crossbow of Exile | Ultra Rare | 12 | 绿 | Deal [2+Magic] true damage to an enemy. |
| Eagle Eye | Epic | 11 | 绿 | Deal [2+Magic] damage to an enemy, and remove all Green Gems to Boost damage. (Boost Ratio 2:1) |
| Bullseye | Epic | 14 | 绿 | Deal [3+Magic] true damage to an enemy. |
| Elder Bow | Rare | 8 | 绿 | Deal [3+Magic] damage to an enemy. |
| Basilisk Fang | Legendary | 13 | 绿 | Deal [4+Magic] damage to the last enemy, and Poison them. |
| Yasmine’s Bow | Legendary | 13 | 绿 | Deal [5+Magic] damage to an enemy. Create 6 Green Gems. |
| Phoenix Crossbow | Rare | 10 | 绿 | Deal [1+Magic] true damage to an enemy. |
| Knight’s Sword | Common | 6 | 蓝 | Deal [2+Magic] damage to the first enemy. |
| Dagger of the Void | Ultra Rare | 9 | 蓝 | Deal [5+Magic] damage to the last enemy. |
| Falchion of Kings | Ultra Rare | 11 | 蓝 | Deal [6+Magic] damage to the healthiest enemy. |
| Khopesh of Misery | Ultra Rare | 9 | 蓝 | Deal [4+Magic] damage to the weakest enemy. |
| Shadowbringer | Epic | 11 | 蓝 | Deal [3+Magic] damage to the last enemy, and remove all Purple Gems to Boost damage. (Boost Ratio 3:1) |
| Ghost’s Bane | Epic | 12 | 蓝 | Deal [4+Magic] damage to the healthiest enemy, and remove all Blue Gems to Boost damage. (Boost Ratio 2:1) |
| Lion’s Claw | Epic | 10 | 蓝 | Deal [2+Magic] damage to the weakest enemy, and remove all Brown Gems to Boost damage. (Boost Ratio 3:1) |
| Black Dagger | Rare | 8 | 蓝 | Deal [4+Magic] damage to the last enemy. |
| Winter’s Woe | Legendary | 13 | 蓝 | Deal [6+Magic] damage to the first enemy, and Entangle them. |
| Anu’s Sceptre | Legendary | 9 | 蓝 | Destroy all Gems of a chosen color. |
| Avenging Falchion | Rare | 9 | 蓝 | Deal [5+Magic] damage to the healthiest enemy |
| Daemonic Khopesh | Rare | 7 | 蓝 | Deal [3+Magic] damage to the weakest enemy. |

**双精通解锁（进阶顶端，按等级排序）（21 把）**

| 名称 | 稀有度 | 费用 | 颜色 | 法术 |
|---|---|---|---|---|
| Runic Blade | Legendary | 12 | 绿/黄 | Deal [6+Magic] damage to an enemy. Gain 2 Attack, Life and Magic if the enemy dies. |
| Anvil of Might | Legendary | 16 | 红/棕 | Give an ally [1+Magic] Attack and Armor. |
| Arrow of Slaying | Legendary | 18 | 蓝/绿 | Deal [10+Magic] damage to an enemy. |
| Black Manacles | Legendary | 15 | 紫/棕 | Deal [0+Magic] damage to all enemies. 20% chance to devour a random enemy. |
| Bull’s Edge | Legendary | 13 | 红/绿 | Deal [4+Magic] damage to an enemy. If I am damaged, gain 6 Attack. |
| Cauldron | Legendary | 20 | 绿/棕 | Double an ally’s Attack and give them [1+Magic] Life. (Boost Ratio 1:1) |
| Cursed Blade | Legendary | 12 | 绿/紫 | Deal damage to an enemy equal to his Attack. (Boost Ratio 1:1) |
| Death Knell | Legendary | 14 | 红/紫 | Deal [5+Magic] damage to the weakest enemy. Gain an extra turn. |
| Dream Catcher | Legendary | 15 | 黄/紫 | Deal [4+Magic] damage randomly split among enemies. Deal 10 more damage if the enemy has a Fey troop. |
| Fiery Claw | Legendary | 14 | 红/绿 | Deal [3+Magic] damage to an enemy. Deal double damage if they use Blue Mana. |
| Giantslayer | Legendary | 15 | 红/蓝 | Deal [4+Magic] damage to an enemy. Deal 7 more damage if they have 10 Attack or more. |
| Golden Cog | Legendary | 15 | 红/黄 | Double an ally’s Armor. (Boost Ratio 1:1) |
| Holy Symbol | Legendary | 14 | 黄/棕 | Deal [3+Magic] damage to an enemy. Deal double damage if they use Purple Mana. |
| Ice Arrow | Legendary | 14 | 蓝/绿 | Deal [3+Magic] damage to an enemy. Deal double damage if they use Red Mana. |
| Mang | Legendary | 15 | 红/棕 | Destroy an enemy’s Armor. Deal [1+Magic] Damage. Increase my Attack by the amount of Armor destroyed. (Boost Ratio 1:1) |
| Null Sphere | Legendary | 18 | 紫/棕 | Reduce an enemy’s Magic to 0. |
| Pan’s Lute | Legendary | 15 | 绿/黄 | Drain the Mana of the first and last enemies. Give all allies 1 Magic. |
| Phylactery | Legendary | 14 | 蓝/紫 | Restore your Life to full. Gain an extra turn. |
| Sheggra’s Heart | Legendary | 14 | 蓝/棕 | Create [6+Magic] Red Gems and Cleanse all allies. |
| Soul Blade | Legendary | 12 | 蓝/黄 | Deal [6+Magic] damage to an enemy. Gain 1 Soul. |
| Vile Flask | Legendary | 16 | 红/蓝 | Poison an enemy and destroy the enemy’s Armor. Create [0+Magic] Green Gems. |

**全精通解锁（ALL Mastery）（2 把）**

| 名称 | 稀有度 | 费用 | 颜色 | 法术 |
|---|---|---|---|---|
| Prismatic Orb | Legendary | 18 | **全六色** | Create 8 Gems of a chosen ally’s Mana Color. Ally gains [0+Magic] Armor. |
| Imperial Jewel | Legendary | 20 | **全六色** | Deal [7+Magic] damage randomly split among enemies. Gain 2 Magic. |

**特殊活动 / 武器包（35 把）**

| 名称 | 稀有度 | 费用 | 颜色 | 法术 |
|---|---|---|---|---|
| Bear Totem | Legendary | 9 | 蓝/棕 | Deal [0+Magic] damage to an enemy. Gain 1 Magic and remove all Green Gems to Boost the effect. (Boost Ratio 3:1) |
| Boom-Boom | Epic | 13 | 棕 | Explode 3 random Gems. Deal [5+Magic] damage randomly split among enemies. |
| Bullroarer | Epic | 12 | 绿 | Give all allies [1+Magic] Life. |
| Celestial Staff | Ultra Rare | 10 | 黄 | Deal [4+Magic] damage randomly split among enemies. Restore 10 Life to self. |
| Chain Flail | Epic | 11 | 棕 | Deal [4+Magic] damage to an enemy. If the enemy has an Undead troop, deal 9 damage to another random enemy. |
| Chaos Blade | Epic | 11 | 紫 | Deal [2+Magic] true damage to an enemy. Deal 5 bonus true damage if the enemy is Divine. |
| Crimson Insignia | Epic | 12 | 红 | Deal [4+Magic] damage to an enemy. If there are 10 or more Red Gems on the board, deal 8 Bonus damage. |
| Deepstone | Epic | 9 | 蓝 | Explode a gem, and destroy that row. |
| Eggsplosion | Legendary | 15 | 绿 | Explode 4 random Gems of a chosen color. Restore [4+Magic] Life. |
| Eternal Flame | Epic | 6 | 黄 | Convert a Gem to Red, then create [2+Magic] more Red Gems. |
| Eye of Xathenos | Legendary | 16 | 蓝/紫 | Deal [6+Magic] damage to an enemy, and steal 3 from a random stat. Deal double damage if the target is Fey. |
| Farsight Orb | Epic | 9 | 棕 | Create [3+Magic] random Blue Gems. Increase a random Skill by 5. |
| Fire and Ice | Legendary | 16 | 红/蓝 | Deal [0+Magic] damage to all enemies and give 2 Life to all allies. |
| Frost Reaver | Epic | 11 | 红 | Destroy a Column. Deal [2+Magic] damage to the first enemy, and 2 more for every Blue Gem destroyed. (Boost Ratio x2) |
| Goblin Crusher | Legendary | 12 | 红/棕 | Deal [3+Magic] damage to an enemy. Deal triple damage if the enemy is a Marauder. |
| Kris Knife | Epic | 10 | 红 | Deal [4+Magic] damage to the last enemy, and steal 2 Magic. |
| Nature’s Wrath | Epic | 12 | 绿 | Deal [4+Magic] damage to an enemy, and 1 damage to adjacent enemies. Deal 5 bonus damage if they are Entangled. |
| Order and Chaos | Legendary | 14 | 红/绿 | Deal [2+Magic] damage to the last 2 enemies. Deal double damage if the target is a dragon. |
| Prey Seeker | Epic | 14 | 棕 | Deal [1+Magic] true damage to an enemy. Deal double damage if the enemy has Hunter’s Mark. |
| Sands of Time | Legendary | 12 | 红/紫 | Restore [5+Magic] Life to all allies. Gain an Extra Turn. |
| Silent Night | Epic | 12 | 紫 | Deal [4+Magic] damage to the last enemy, and Silence them. |
| Skull Cleaver | Epic | 13 | 紫 | Destroy a column. Deal [5+Magic] damage to a random enemy, Boosted by Skulls destroyed. (Boost Ratio 1:1) |
| Skullblade | Epic | 12 | 棕 | Deal [0+Magic] damage to the first 2 enemies, and remove all Skulls to boost the effect. (Boost Ratio 2:1) |
| Slay Bells | Legendary | 13 | 红/绿 | Deal [2+Magic] damage to an enemy and a random enemy. Steal 1 Magic from the enemy. |
| Soultrap | Epic | 13 | 红 | Deal [2+Magic] damage to an enemy and drain their Mana. Gain 5 Life if the enemy dies. |
| Spark Rocket 2.0.16 | Legendary | 11 | 红/黄 | Explode a gem. Deal [5+Magic] damage to a random enemy and Burn them. |
| Spider’s Kiss | Legendary | 14 | 紫 | Entangle the first enemy, and deal [2+Magic] true damage. |
| Staff of Madness | Legendary | 16 | 红/紫 | Deal [1+Magic] damage to all enemies. Steal 1 from a random skill from each enemy. |
| Sun and Moon | Legendary | 16 | 黄/紫 | Deal [0+Magic] damage to all enemies and give 1 Magic to all allies. |
| Sun Chakram | Epic | 10 | 黄 | Deal [7+Magic] damage randomly split among enemies. Deal 8 more damage if the enemy has a Daemon troop. |
| Sylvasi’s Blades | Epic | 14 | 绿 | Deal [5+Magic] damage to an enemy. Steal 2 Attack. |
| War and Peace | Legendary | 16 | 绿/棕 | Deal [0+Magic] damage to all enemies and give 2 Attack to all allies. |
| Withering Touch | Legendary | 14 | 蓝 | Deal 4 True Damage to the first enemy. Gain [1+Magic] Life and drain the enemy’s Mana. |
| Wrenchmaster 5000 | Epic | 12 | 黄 | Give all allies [1+Magic] Armor. |
| Yasmine’s Chalice | Legendary | 16 | 绿/黄 | Give all allies [0+Magic] Life and Armor. If there are 10 or more Green Gems on the board, gain an extra turn. |
<!--TABLE:CATALOG:END-->
### 4.1 数值与句式统计（由目录数据计算）

<!--TABLE:STATS:START-->
| 维度 | 分布 |
|---|---|
| 稀有度（数量/费用均值(区间)） | Common：7（6%），7.1（4~9）；Rare：15（12%），8.6（6~12）；Ultra Rare：16（13%），10.5（7~15）；Epic：34（28%），11.4（6~14）；Legendary：51（41%），14.2（9~20） |
| 颜色组合 | 单色 88（72%）；双色 33（27%）；全六色 2（2%） |
| 主色分布 | 蓝 21；棕 15；绿 19；紫 18；红 32；黄 18 |
| 解锁渠道 | 单精通 65；双精通 21；全精通 2；活动/武器包 35 |
| 费用 | 全体 11.9（4~20）；最低 4（低费档 4~9 共 27 把）；高费 18~20 共 5 把 |
| 效果家族（一法术可跨族，计数为出现次数） | 伤害（Deal/damage） 99；真实伤害 10；随机分摊伤害 9；治疗/回复（Life） 11；护甲增益 8；攻击增益 10；魔力增益 8；创造宝石 9；转换/变形 1；摧毁/引爆 14；状态（毒/燃/冻/沉默/缠绕/眩晕/吞噬等） 9；法力操作（偷取/燃尽/驱蓝） 7；额外回合 5；净化 Cleanse 1；窃取属性 5；增幅比（Ratio/Boost） 17；条件倍率（double/triple/bonus） 16 |
<!--TABLE:STATS:END-->
**对设计的直接读数**：

- 费用带三峰：低费 4~9（成长线/低稀有）、中费 10~16（主力带）、高费 18~20（战略/全色）。稀有度越高费用越高、公式基数 `[X+Magic]` 的 X 越大（Common 典型 X=1~2，Legendary X=5~8）。
- 双色武器集中于双精通解锁的高端条目（40 级双精通），是"精通培养目标"的阶梯顶端。
- 状态系（毒/燃烧/沉默/缠绕/死亡标记/吞噬）在武器上以低比例出现（约十分之一量级），主力仍是伤害/增益/宝石操作三族。
- Ratio 增幅多数绑"消除某色宝石"或"某属性点数"，天然把武器强度与队伍颜色配置耦合——主角武器是"队伍构筑的第二半张答卷"。

## 5. 职业专属武器（37 把神话）

系统：每职业唯一、250 胜解锁、单色、与主角法力色兼容；装备本职业指定色武器才有职业 Magic 加成（因此职业武器的颜色=该职业的武器绑定色）。

已验证名录（11 把）与其余 26 把的查证路径、职业-种族-王国对照（27 职业逐条验证 + 10 职业快照推定）见 **[artifacts/gow-classes-raw.md](../artifacts/gow-classes-raw.md)**。

## 6. 对本项目 M5（主角武器系统）的落地建议

1. **首发规模 ~20 把**（META-GAME-PLAN §4.4 口径）：建议构成 6 单色成长线（每色 1 把低费开局武器，对应精通成长）+ 6 双色进阶（对应双精通顶端，费用 12~16）+ 4 活动机制武器（展示 Ratio/状态/宝石操作等特色句式）+ 2 全色战略（Prismatic Orb / Imperial Jewel 同位）+ 2 职业毕业神话（预留职业系统接口）。
2. **全部句式可直接用 SKILL_LIBRARY 组装**：123 把官方法术没有超出我们已实现的引擎原语（伤害/治疗/增益/创造宝石/转换/摧毁/引爆/状态/法力操作/额外回合/二次缩放）。二次缩放（[xN]）+ 概率子句两个原语正好覆盖全部 Ratio 与概率句式。
3. **数值锚点**：费用均值 11.9；伤害基数 X 与稀有度挂钩（1~8）；增益型用 `[0+Magic]`/`[1+Magic]` 低基数防滚雪球；真伤句式（true damage）用在低费精确点杀（Bullseye 14 费 [3+Magic] 真伤）。
4. **主角成长联动**：武器无独立等级（经典口径）→ 威力自然随主角等级/职业成长；若要现代口径可补钢锭淬炼线（PL3 解锁），对应我们的"黄金+灵魂"经济已有实现。
5. **颜色即构筑**：武器决定主角颜色组 → 与军旗（bannerKingdomId 已在 MetaSave）一起构成队伍颜色规划；设计时保证每色至少一把可用武器。

## 7. 数据文件与可重跑入口

| 文件 | 内容 |
|---|---|
| `artifacts/gow-weapons.json` | 123 把官方目录（全字段）+ 补充段（武器包清单/职业武器名录/现代解锁等级/职业对照） |
| `design/GOW-WEAPONS-CATALOG.md` | **逐把设计卡**：123 把中文卡（名称/费用/颜色/解锁/效果中英/类型）+ 6 包独有 + 10 职业神话 + 1 直购神话 |
| `scripts/_gow_zh.mjs` + `scripts/_gen_gow_weapons_catalog.mjs` | 中文翻译映射 + 设计卡生成器 |
| `artifacts/gow-classes-raw.md` | 职业系统验证数据（机制 + 37 职业对照 + 职业武器名录） |
| `artifacts/_gow_official_weapons.html` | 官方武器列表页原始 HTML（存证） |
| `artifacts/_gow_t*.json` 等 | 论坛原始 JSON 抓取（存证） |
| `scripts/_parse_gow_weapons.mjs` | 官方 HTML → JSON 解析器 |
| `scripts/_augment_gow_weapons.mjs` | 已验证补充数据合并器 |
| `scripts/_gen_gow_weapons_doc.mjs` | 本文档目录表/统计表生成器（改数据后重跑再生成 §4） |

### 全量数据库快照（gowhead.com，2026-09-17）

官方目录之外的全量 718 把现代武器已抓取入库：`artifacts/gowhead-weapons/`（weapons.json + 718 张卡面图标 + README 字段速查；含 Doomed 稀有度、淬炼词缀、按稀有度成长数组、发布日期）。抓取脚本 `scripts/_fetch_gowhead_weapons.mjs` 可重跑（断点续传）。artifacts/ 在 .gitignore 中，快照仅存本地。

### 主要来源

- 官方武器目录：https://gemsofwar.com/game-guide-weapon-list/
- 官方论坛职业武器清单帖：https://community.gemsofwar.com/t/66709 · 颜色裁定帖：https://community.gemsofwar.com/t/46611
- 官方 $4.99 武器包与熔炉规则帖：https://community.gemsofwar.com/t/55952
- 2026-03 官方内容解锁等级表帖：https://community.gemsofwar.com/t/89373
- 职业-种族-王国帖（2018）：https://community.gemsofwar.com/t/44520
- wiki（机制描述/快照）：https://gems-of-war.fandom.com/wiki/Weapons · https://gems-of-war.fandom.com/wiki/Classes
- Steam 讨论佐证（武器升级史）：https://steamcommunity.com/app/329110/discussions/0/1457328846182924948/
