# GoW 主角武器 · 全量逐把设计卡（中文）

> 生成于 2026-09-17，数据管线：`node scripts/_gen_gow_weapons_catalog.mjs`（源：artifacts/gow-weapons.json + scripts/_gow_zh.mjs）。
> 每张卡字段：**稀有度 ｜ 法力费用 ｜ 颜色 ｜ 素材编号** → **解锁条件** → **效果（中文）** → **原文** → **类型标签**。
> 术语约定：`[2+魔力]` = 基数 2 + 主角魔力值（随主角成长缩放，武器本身无独立等级）；`增幅比 3:1` = 每满足一个条件单位（如每消除 1 颗对应色宝石）效果 +3；`真实伤害` = 无视护甲与减伤；`素材 #7068` = 官方原图床 gameguide/images/7068.jpg，可作本项目美术参考。
> 数据可信度：§1~§4 = 官方目录逐把解析（已考证）；§5~§7 = 名称与获取渠道已考证（官方论坛/官方帖），效果数值待逐页补全。

**目录**：单精通线 65 把 ｜ 双精通线 21 把 ｜ 全精通 2 把 ｜ 活动/武器包 35 把 ｜ 包独有 6 把 ｜ 职业神话 10 把（已验证） ｜ 直购神话 1 把


## §1 单精通解锁线（65 把 · 六色成长阶梯）

### 火之精通（红色武器，11 把）

#### 粗制木棒 Crude Club
- 普通 ｜ 法力 4 ｜ 红色 ｜ 素材 #7068
- 解锁：火之精通 0 级
- 效果：对首个敌人造成 [2+魔力] 点伤害。
- 原文：Deal [2+Magic] damage to the first enemy.
- 类型：直伤

#### 战士之斧 Warrior’s Axe
- 普通 ｜ 法力 9 ｜ 红色 ｜ 素材 #7069
- 解锁：火之精通 1 级
- 效果：对首个敌人造成 [3+魔力] 点伤害。
- 原文：Deal [3+Magic] damage to the first enemy.
- 类型：直伤

#### 卫戍长戟 Guardian Halberd
- 稀有 ｜ 法力 8 ｜ 红色 ｜ 素材 #7078
- 解锁：火之精通 3 级
- 效果：对随机一名敌人造成 3 ~ [6+魔力] 点伤害（区间内随机）。
- 原文：Deals between 3 – [6+Magic] damage to a random enemy.
- 类型：直伤

#### 血斧 Bloody Axe
- 稀有 ｜ 法力 10 ｜ 红色 ｜ 素材 #7077
- 解锁：火之精通 6 级
- 效果：对首个敌人造成 [4+魔力] 点伤害。
- 原文：Deal [4+Magic] damage to the first enemy.
- 类型：直伤

#### 力量长戟 Halberd of Might
- 超稀有 ｜ 法力 10 ｜ 红色 ｜ 素材 #7093
- 解锁：火之精通 10 级
- 效果：对首个敌人造成 3 ~ [7+魔力] 点伤害（区间内随机）。
- 原文：Deals between 3 – [7+Magic] damage to the first enemy.
- 类型：直伤

#### 混沌之斧 Axe of Chaos
- 超稀有 ｜ 法力 12 ｜ 红色 ｜ 素材 #7091
- 解锁：火之精通 15 级
- 效果：对首个敌人造成 [5+魔力] 点伤害。
- 原文：Deal [5+Magic] damage to the first enemy.
- 类型：直伤

#### 扭曲恶意 Twisted Malice
- 史诗 ｜ 法力 11 ｜ 红色 ｜ 素材 #7116
- 解锁：火之精通 20 级
- 效果：对一名敌人造成 3 ~ [10+魔力] 点伤害（区间内随机）。
- 原文：Deals between 3 – [10+Magic] damage to an enemy.
- 类型：直伤

#### 劈颅斧 Head Cleaver
- 史诗 ｜ 法力 11 ｜ 红色 ｜ 素材 #7105
- 解锁：火之精通 25 级
- 效果：对首个敌人造成 [6+魔力] 点伤害。
- 原文：Deal [6+Magic] damage to the first enemy.
- 类型：直伤

#### 盛夏之怒 Summer’s Fury
- 传说 ｜ 法力 15 ｜ 红色 ｜ 素材 #7126
- 解锁：火之精通 30 级
- 效果：对全体敌人造成 [2+魔力] 点伤害，并创造 6 颗红色宝石。
- 原文：Deal [2+Magic] damage to all enemies. Create 6 Red Gems.
- 类型：直伤·创造宝石

#### 屠猪刃 Pigsticker
- 传说 ｜ 法力 12 ｜ 红色 ｜ 素材 #7125
- 解锁：火之精通 33 级
- 效果：对末位敌人造成 [6+魔力] 点伤害；若该敌人死亡，引爆 1 颗随机宝石。
- 原文：Deal [6+Magic] damage to the last enemy. Explode a random gem if the enemy dies.
- 类型：直伤·摧毁/引爆·条件/概率

#### 加德之墙 Gard’s Wall
- 传说 ｜ 法力 12 ｜ 红色 ｜ 素材 #7129
- 解锁：火之精通 35 级
- 效果：获得 [1+魔力] 点护甲，并移除全部紫色宝石以增幅效果（增幅比 1:1）。
- 原文：Gain [1+Magic] Armor, and remove all Purple Gems to boost the effect. (Boost Ratio 1:1)
- 类型：护甲增益·增幅比

### 水之精通（蓝色武器，12 把）

#### 骑士之剑 Knight’s Sword
- 普通 ｜ 法力 6 ｜ 蓝色 ｜ 素材 #7070
- 解锁：水之精通 1 级
- 效果：对首个敌人造成 [2+魔力] 点伤害。
- 原文：Deal [2+Magic] damage to the first enemy.
- 类型：直伤

#### 黑匕首 Black Dagger
- 稀有 ｜ 法力 8 ｜ 蓝色 ｜ 素材 #7079
- 解锁：水之精通 3 级
- 效果：对末位敌人造成 [4+魔力] 点伤害。
- 原文：Deal [4+Magic] damage to the last enemy.
- 类型：直伤

#### 复仇弯刀 Avenging Falchion
- 稀有 ｜ 法力 9 ｜ 蓝色 ｜ 素材 #7074
- 解锁：水之精通 5 级
- 效果：对生命值最高的敌人造成 [5+魔力] 点伤害。
- 原文：Deal [5+Magic] damage to the healthiest enemy
- 类型：直伤

#### 恶魔弯钩刀 Daemonic Khopesh
- 稀有 ｜ 法力 7 ｜ 蓝色 ｜ 素材 #7085
- 解锁：水之精通 7 级
- 效果：对生命值最低的敌人造成 [3+魔力] 点伤害。
- 原文：Deal [3+Magic] damage to the weakest enemy.
- 类型：直伤

#### 虚空匕首 Dagger of the Void
- 超稀有 ｜ 法力 9 ｜ 蓝色 ｜ 素材 #7096
- 解锁：水之精通 10 级
- 效果：对末位敌人造成 [5+魔力] 点伤害。
- 原文：Deal [5+Magic] damage to the last enemy.
- 类型：直伤

#### 帝王弯刀 Falchion of Kings
- 超稀有 ｜ 法力 11 ｜ 蓝色 ｜ 素材 #7089
- 解锁：水之精通 14 级
- 效果：对生命值最高的敌人造成 [6+魔力] 点伤害。
- 原文：Deal [6+Magic] damage to the healthiest enemy.
- 类型：直伤

#### 苦难弯钩刀 Khopesh of Misery
- 超稀有 ｜ 法力 9 ｜ 蓝色 ｜ 素材 #7100
- 解锁：水之精通 17 级
- 效果：对生命值最低的敌人造成 [4+魔力] 点伤害。
- 原文：Deal [4+Magic] damage to the weakest enemy.
- 类型：直伤

#### 暗影降临 Shadowbringer
- 史诗 ｜ 法力 11 ｜ 蓝色 ｜ 素材 #7107
- 解锁：水之精通 20 级
- 效果：对末位敌人造成 [3+魔力] 点伤害，并移除全部紫色宝石以增幅伤害（增幅比 3:1）。
- 原文：Deal [3+Magic] damage to the last enemy, and remove all Purple Gems to Boost damage. (Boost Ratio 3:1)
- 类型：直伤·增幅比

#### 幽魂克星 Ghost’s Bane
- 史诗 ｜ 法力 12 ｜ 蓝色 ｜ 素材 #7115
- 解锁：水之精通 24 级
- 效果：对生命值最高的敌人造成 [4+魔力] 点伤害，并移除全部蓝色宝石以增幅伤害（增幅比 2:1）。
- 原文：Deal [4+Magic] damage to the healthiest enemy, and remove all Blue Gems to Boost damage. (Boost Ratio 2:1)
- 类型：直伤·增幅比

#### 狮爪 Lion’s Claw
- 史诗 ｜ 法力 10 ｜ 蓝色 ｜ 素材 #7128
- 解锁：水之精通 27 级
- 效果：对生命值最低的敌人造成 [2+魔力] 点伤害，并移除全部棕色宝石以增幅伤害（增幅比 3:1）。
- 原文：Deal [2+Magic] damage to the weakest enemy, and remove all Brown Gems to Boost damage. (Boost Ratio 3:1)
- 类型：直伤·增幅比

#### 凛冬之殇 Winter’s Woe
- 传说 ｜ 法力 13 ｜ 蓝色 ｜ 素材 #7119
- 解锁：水之精通 30 级
- 效果：对首个敌人造成 [6+魔力] 点伤害，并使其缠绕。
- 原文：Deal [6+Magic] damage to the first enemy, and Entangle them.
- 类型：直伤·缠绕

#### 安努权杖 Anu’s Sceptre
- 传说 ｜ 法力 9 ｜ 蓝色 ｜ 素材 #7124
- 解锁：水之精通 35 级
- 效果：摧毁全部所选颜色的宝石。
- 原文：Destroy all Gems of a chosen color.
- 类型：摧毁/引爆

### 地之精通（棕色武器，10 把）

#### 牧师战锤 Priest’s Hammer
- 普通 ｜ 法力 9 ｜ 棕色 ｜ 素材 #7067
- 解锁：地之精通 1 级
- 效果：对首个敌人造成 [2+魔力] 点伤害，并对任意相邻敌人造成 1 点伤害。
- 原文：Deal [2+Magic] damage to the first enemy, and 1 damage to any adjacent enemy.
- 类型：直伤

#### 巨人重锤 Giant’s Mace
- 稀有 ｜ 法力 10 ｜ 棕色 ｜ 素材 #7081
- 解锁：地之精通 3 级
- 效果：对一名敌人造成 [2+魔力] 点伤害，并对相邻敌人各造成 1 点伤害。
- 原文：Deal [2+Magic] damage to an enemy, and 1 damage to adjacent enemies.
- 类型：直伤

#### 白银之剑 Silver Sword
- 稀有 ｜ 法力 7 ｜ 棕色 ｜ 素材 #7075
- 解锁：地之精通 6 级
- 效果：对首个敌人造成 [3+魔力] 点伤害。
- 原文：Deal [3+Magic] damage to the first enemy.
- 类型：直伤

#### 恶意重锤 Mace of Malice
- 超稀有 ｜ 法力 12 ｜ 棕色 ｜ 素材 #7094
- 解锁：地之精通 10 级
- 效果：对一名敌人造成 [3+魔力] 点伤害，并对相邻敌人各造成 1 点伤害。
- 原文：Deal [3+Magic] damage to an enemy, and 1 damage to adjacent enemies.
- 类型：直伤

#### 正义之刃 Blade of Justice
- 超稀有 ｜ 法力 9 ｜ 棕色 ｜ 素材 #7092
- 解锁：地之精通 15 级
- 效果：对首个敌人造成 [4+魔力] 点伤害。
- 原文：Deal [4+Magic] damage to the first enemy.
- 类型：直伤

#### 碎拳重锤 Knuckle Smasher
- 史诗 ｜ 法力 12 ｜ 棕色 ｜ 素材 #7108
- 解锁：地之精通 20 级
- 效果：对一名敌人造成 [4+魔力] 点伤害，并对相邻敌人各造成 1 点伤害。
- 原文：Deal [4+Magic] damage to an enemy, and 1 damage to adjacent enemies.
- 类型：直伤

#### 神圣复仇者 Holy Avenger
- 史诗 ｜ 法力 11 ｜ 棕色 ｜ 素材 #7204
- 解锁：地之精通 25 级
- 效果：对首个敌人造成 [4+魔力] 点伤害，并移除全部黄色宝石以增幅伤害（增幅比 3:1）。
- 原文：Deal [4+Magic] damage to the first enemy, and remove all Yellow Gems to Boost damage. (Boost Ratio 3:1)
- 类型：直伤·增幅比

#### 碎山锤 Mountain Crusher
- 传说 ｜ 法力 11 ｜ 棕色 ｜ 素材 #7127
- 解锁：地之精通 30 级
- 效果：引爆 [0+魔力] 颗随机棕色宝石。
- 原文：Explode [0+Magic] random Brown Gems.
- 类型：摧毁/引爆

#### 原始狂怒 Primal Rage
- 传说 ｜ 法力 13 ｜ 棕色 ｜ 素材 #7118
- 解锁：地之精通 33 级
- 效果：对首个敌人造成 [7+魔力] 点伤害；若该敌人死亡，获得 1 点攻击。
- 原文：Deal [7+Magic] damage to the first enemy. Gain 1 Attack if the enemy dies.
- 类型：直伤·攻击增益·条件/概率

#### 石裂锤 The Stonehammer
- 传说 ｜ 法力 13 ｜ 棕色 ｜ 素材 #7120
- 解锁：地之精通 35 级
- 效果：对一名敌人造成 [6+魔力] 点伤害、对相邻敌人各造成 1 点伤害，随后打乱棋盘。
- 原文：Deal [6+Magic] damage to an enemy, and 1 damage to adjacent enemies. Jumble the Board.
- 类型：直伤

### 自然之精通（绿色武器，9 把）

#### 侦察短弓 Scout’s Bow
- 普通 ｜ 法力 9 ｜ 绿色 ｜ 素材 #7064
- 解锁：自然之精通 1 级
- 效果：对一名敌人造成 [2+魔力] 点伤害。
- 原文：Deal [2+Magic] damage to an enemy.
- 类型：直伤

#### 长者之弓 Elder Bow
- 稀有 ｜ 法力 8 ｜ 绿色 ｜ 素材 #7082
- 解锁：自然之精通 3 级
- 效果：对一名敌人造成 [3+魔力] 点伤害。
- 原文：Deal [3+Magic] damage to an enemy.
- 类型：直伤

#### 凤凰弩 Phoenix Crossbow
- 稀有 ｜ 法力 10 ｜ 绿色 ｜ 素材 #7076
- 解锁：自然之精通 6 级
- 效果：对一名敌人造成 [1+魔力] 点真实伤害。
- 原文：Deal [1+Magic] true damage to an enemy.
- 类型：真实伤害·直伤

#### 背叛之弓 Bow of Betrayal
- 超稀有 ｜ 法力 10 ｜ 绿色 ｜ 素材 #7087
- 解锁：自然之精通 10 级
- 效果：对一名敌人造成 [4+魔力] 点伤害。
- 原文：Deal [4+Magic] damage to an enemy.
- 类型：直伤

#### 放逐之弩 Crossbow of Exile
- 超稀有 ｜ 法力 12 ｜ 绿色 ｜ 素材 #7090
- 解锁：自然之精通 15 级
- 效果：对一名敌人造成 [2+魔力] 点真实伤害。
- 原文：Deal [2+Magic] true damage to an enemy.
- 类型：真实伤害·直伤

#### 鹰眼 Eagle Eye
- 史诗 ｜ 法力 11 ｜ 绿色 ｜ 素材 #7111
- 解锁：自然之精通 20 级
- 效果：对一名敌人造成 [2+魔力] 点伤害，并移除全部绿色宝石以增幅伤害（增幅比 2:1）。
- 原文：Deal [2+Magic] damage to an enemy, and remove all Green Gems to Boost damage. (Boost Ratio 2:1)
- 类型：直伤·增幅比

#### 正中红心 Bullseye
- 史诗 ｜ 法力 14 ｜ 绿色 ｜ 素材 #7112
- 解锁：自然之精通 25 级
- 效果：对一名敌人造成 [3+魔力] 点真实伤害。
- 原文：Deal [3+Magic] true damage to an enemy.
- 类型：真实伤害·直伤

#### 蛇怪之牙 Basilisk Fang
- 传说 ｜ 法力 13 ｜ 绿色 ｜ 素材 #7117
- 解锁：自然之精通 30 级
- 效果：对末位敌人造成 [4+魔力] 点伤害，并使其中毒。
- 原文：Deal [4+Magic] damage to the last enemy, and Poison them.
- 类型：直伤·中毒

#### 雅斯敏之弓 Yasmine’s Bow
- 传说 ｜ 法力 13 ｜ 绿色 ｜ 素材 #7294
- 解锁：自然之精通 35 级
- 效果：对一名敌人造成 [5+魔力] 点伤害，并创造 6 颗绿色宝石。
- 原文：Deal [5+Magic] damage to an enemy. Create 6 Green Gems.
- 类型：直伤·创造宝石

### 空气之精通（黄色武器，11 把）

#### 猎人长矛 Hunter’s Spear
- 普通 ｜ 法力 6 ｜ 黄色 ｜ 素材 #7066
- 解锁：空气之精通 1 级
- 效果：对随机一名敌人造成 [3+魔力] 点伤害。
- 原文：Deal [3+Magic] damage to a random enemy.
- 类型：直伤

#### 阳光掷枪 Sunbolt Javelin
- 稀有 ｜ 法力 9 ｜ 黄色 ｜ 素材 #7073
- 解锁：空气之精通 3 级
- 效果：对随机一名敌人造成 [2+魔力] 点真实伤害。
- 原文：Deal [2+Magic] true damage to a random enemy.
- 类型：真实伤害·直伤

#### 寒冰长镰 Icy Glaive
- 稀有 ｜ 法力 10 ｜ 黄色 ｜ 素材 #7086
- 解锁：空气之精通 5 级
- 效果：对随机一名敌人造成 2 点伤害，并移除全部红色宝石以增幅伤害（增幅比 3:1，即每颗 +3）。
- 原文：Deal [2] damage to a random enemy, and remove all Red Gems to Boost damage. (Boost Ratio 3:1)
- 类型：直伤·增幅比

#### 破甲长枪 Piercing Lance
- 稀有 ｜ 法力 7 ｜ 黄色 ｜ 素材 #7084
- 解锁：空气之精通 7 级
- 效果：对随机一名敌人造成 [4+魔力] 点伤害。
- 原文：Deal [4+Magic] damage to a random enemy.
- 类型：直伤

#### 战争投枪 Javelin of War
- 超稀有 ｜ 法力 11 ｜ 黄色 ｜ 素材 #7097
- 解锁：空气之精通 10 级
- 效果：对随机一名敌人造成 [3+魔力] 点真实伤害。
- 原文：Deal [3+Magic] true damage to a random enemy.
- 类型：真实伤害·直伤

#### 风暴长镰 Glaive of Storms
- 超稀有 ｜ 法力 12 ｜ 黄色 ｜ 素材 #7101
- 解锁：空气之精通 14 级
- 效果：对首个敌人造成 3 点伤害，并移除全部红色宝石以增幅伤害（增幅比 3:1）。
- 原文：Deal [3] damage to the first enemy, and remove all Red Gems to Boost damage. (Boost Ratio 3:1)
- 类型：直伤·增幅比

#### 神圣长枪 Lance of the Divine
- 超稀有 ｜ 法力 9 ｜ 黄色 ｜ 素材 #7099
- 解锁：空气之精通 17 级
- 效果：对随机一名敌人造成 [5+魔力] 点伤害。
- 原文：Deal [5+Magic] damage to a random enemy.
- 类型：直伤

#### 霹雳 Thunderbolt
- 史诗 ｜ 法力 12 ｜ 黄色 ｜ 素材 #7110
- 解锁：空气之精通 20 级
- 效果：对随机一名敌人造成 [4+魔力] 点真实伤害。
- 原文：Deal [4+Magic] true damage to a random enemy.
- 类型：真实伤害·直伤

#### 冰冻之魂 Frozen Soul
- 史诗 ｜ 法力 12 ｜ 黄色 ｜ 素材 #7103
- 解锁：空气之精通 24 级
- 效果：对一名敌人造成 4 点伤害，并移除全部红色宝石以增幅伤害（增幅比 3:1）。
- 原文：Deal [4] damage to an enemy, and remove all Red Gems to Boost damage. (Boost Ratio 3:1)
- 类型：直伤·增幅比

#### 屠龙者 Dragon Slayer
- 史诗 ｜ 法力 10 ｜ 黄色 ｜ 素材 #7104
- 解锁：空气之精通 27 级
- 效果：对随机一名敌人造成 [5+魔力] 点伤害；若目标为龙族，额外造成 8 点伤害。
- 原文：Deal [5+Magic] damage to a random enemy. Deal 8 bonus damage if the enemy is a Dragon.
- 类型：直伤·条件/概率

#### 俄耳甫斯魔音 Orpheus’ Dischord
- 传说 ｜ 法力 12 ｜ 黄色 ｜ 素材 #7121
- 解锁：空气之精通 32 级
- 效果：对随机一名敌人造成 [6+魔力] 点伤害，并使其沉默。
- 原文：Deal [6+Magic] damage to a random enemy, and Silence them.
- 类型：直伤·沉默

### 魔法之精通（紫色武器，12 把）

#### 法师魔杖 Wizard’s Wand
- 普通 ｜ 法力 7 ｜ 紫色 ｜ 素材 #7072
- 解锁：魔法之精通 1 级
- 效果：对敌人们随机分摊 [3+魔力] 点伤害。
- 原文：Deal [3+Magic] damage randomly split among enemies.
- 类型：直伤·随机分摊

#### 尘封魔典 Dusty Tome
- 稀有 ｜ 法力 6 ｜ 紫色 ｜ 素材 #7080
- 解锁：魔法之精通 3 级
- 效果：摧毁 1 颗宝石。
- 原文：Destroy a Gem.
- 类型：摧毁/引爆

#### 灵魂法杖 Spirit Staff
- 稀有 ｜ 法力 8 ｜ 紫色 ｜ 素材 #7083
- 解锁：魔法之精通 5 级
- 效果：对敌人们随机分摊 [5+魔力] 点伤害。
- 原文：Deal [5+Magic] damage randomly split among enemies.
- 类型：直伤·随机分摊

#### 邪恶镰刀 Wicked Scythe
- 稀有 ｜ 法力 12 ｜ 紫色 ｜ 素材 #7095
- 解锁：魔法之精通 7 级
- 效果：对全体敌人造成 [0+魔力] 点伤害。
- 原文：Deal [0+Magic] damage to all enemies.
- 类型：直伤

#### 巫术魔典 Tome of Wizardry
- 超稀有 ｜ 法力 7 ｜ 紫色 ｜ 素材 #7088
- 解锁：魔法之精通 10 级
- 效果：引爆 1 颗宝石。
- 原文：Explode a Gem.
- 类型：摧毁/引爆

#### 贤者法杖 Staff of the Magus
- 超稀有 ｜ 法力 10 ｜ 紫色 ｜ 素材 #7098
- 解锁：魔法之精通 14 级
- 效果：对敌人们随机分摊 [6+魔力] 点伤害。
- 原文：Deal [6+Magic] damage randomly split among enemies.
- 类型：直伤·随机分摊

#### 腐化之镰 Scythe of Corruption
- 超稀有 ｜ 法力 15 ｜ 紫色 ｜ 素材 #7109
- 解锁：魔法之精通 17 级
- 效果：对全体敌人造成 [1+魔力] 点伤害。
- 原文：Deal [1+Magic] damage to all enemies.
- 类型：直伤

#### 失落魔典 Lost Grimoire
- 史诗 ｜ 法力 10 ｜ 紫色 ｜ 素材 #7102
- 解锁：魔法之精通 20 级
- 效果：摧毁一行与一列宝石。
- 原文：Destroy a Row and Column.
- 类型：摧毁/引爆

#### 咒火 Spellfire
- 史诗 ｜ 法力 10 ｜ 紫色 ｜ 素材 #7106
- 解锁：魔法之精通 24 级
- 效果：对敌人们随机分摊 [8+魔力] 点伤害。
- 原文：Deal [8+Magic] damage randomly split among enemies.
- 类型：直伤·随机分摊

#### 死亡之握 Death’s Grasp
- 史诗 ｜ 法力 14 ｜ 紫色 ｜ 素材 #7114
- 解锁：魔法之精通 27 级
- 效果：对全体敌人造成 [2+魔力] 点伤害。
- 原文：Deal [2+Magic] damage to all enemies.
- 类型：直伤

#### 莫尔萨尼之镰 Morthani’s Scythe
- 传说 ｜ 法力 16 ｜ 紫色 ｜ 素材 #7122
- 解锁：魔法之精通 30 级
- 效果：对全体敌人造成 [2+魔力] 点伤害；若有敌人死亡，创造 6 颗骷髅头。
- 原文：Deal [2+Magic] damage to all enemies. Create 6 Skulls if an enemy dies.
- 类型：直伤·创造宝石·条件/概率

#### 妮莎颅骨 Nysha’s Skull
- 传说 ｜ 法力 15 ｜ 紫色 ｜ 素材 #7123
- 解锁：魔法之精通 35 级
- 效果：创造 [2+魔力] 颗随机骷髅头，并获得额外回合。
- 原文：Create [2+Magic] random Skulls. Gain an extra turn.
- 类型：创造宝石·额外回合

## §2 双精通解锁线（21 把 · 进阶顶端）

#### 符文之刃 Runic Blade
- 传说 ｜ 法力 12 ｜ 绿/黄色 ｜ 素材 #7197
- 解锁：自然·空气 双精通 37 级
- 效果：对一名敌人造成 [6+魔力] 点伤害；若该敌人死亡，获得 2 点攻击、生命与魔力。
- 原文：Deal [6+Magic] damage to an enemy. Gain 2 Attack, Life and Magic if the enemy dies.
- 类型：直伤·生命回复·攻击增益·魔力增益

#### 诅咒之刃 Cursed Blade
- 传说 ｜ 法力 12 ｜ 绿/紫色 ｜ 素材 #7200
- 解锁：自然·魔法 双精通 40 级
- 效果：对一名敌人造成等同于其攻击力的伤害（增幅比 1:1）。
- 原文：Deal damage to an enemy equal to his Attack. (Boost Ratio 1:1)
- 类型：直伤·攻击增益·增幅比

#### 灵魂之刃 Soul Blade
- 传说 ｜ 法力 12 ｜ 蓝/黄色 ｜ 素材 #7194
- 解锁：水·空气 双精通 40 级
- 效果：对一名敌人造成 [6+魔力] 点伤害，并获得 1 枚灵魂。
- 原文：Deal [6+Magic] damage to an enemy. Gain 1 Soul.
- 类型：直伤

#### 公牛利刃 Bull’s Edge
- 传说 ｜ 法力 13 ｜ 红/绿色 ｜ 素材 #7199
- 解锁：火·自然 双精通 40 级
- 效果：对一名敌人造成 [4+魔力] 点伤害；若我受到过伤害，获得 6 点攻击。
- 原文：Deal [4+Magic] damage to an enemy. If I am damaged, gain 6 Attack.
- 类型：直伤·攻击增益·条件/概率

#### 丧钟 Death Knell
- 传说 ｜ 法力 14 ｜ 红/紫色 ｜ 素材 #7191
- 解锁：火·魔法 双精通 40 级
- 效果：对生命值最低的敌人造成 [5+魔力] 点伤害，并获得额外回合。
- 原文：Deal [5+Magic] damage to the weakest enemy. Gain an extra turn.
- 类型：直伤·额外回合

#### 烈焰之爪 Fiery Claw
- 传说 ｜ 法力 14 ｜ 红/绿色 ｜ 素材 #7192
- 解锁：火·自然 双精通 40 级
- 效果：对一名敌人造成 [3+魔力] 点伤害；若目标使用蓝色法力，伤害翻倍。
- 原文：Deal [3+Magic] damage to an enemy. Deal double damage if they use Blue Mana.
- 类型：直伤·法力操作·条件/概率

#### 神圣徽记 Holy Symbol
- 传说 ｜ 法力 14 ｜ 黄/棕色 ｜ 素材 #7193
- 解锁：地·空气 双精通 40 级
- 效果：对一名敌人造成 [3+魔力] 点伤害；若目标使用紫色法力，伤害翻倍。
- 原文：Deal [3+Magic] damage to an enemy. Deal double damage if they use Purple Mana.
- 类型：直伤·法力操作·条件/概率

#### 冰霜之箭 Ice Arrow
- 传说 ｜ 法力 14 ｜ 蓝/绿色 ｜ 素材 #7247
- 解锁：水·自然 双精通 40 级
- 效果：对一名敌人造成 [3+魔力] 点伤害；若目标使用红色法力，伤害翻倍。
- 原文：Deal [3+Magic] damage to an enemy. Deal double damage if they use Red Mana.
- 类型：直伤·法力操作·条件/概率

#### 生命护匣 Phylactery
- 传说 ｜ 法力 14 ｜ 蓝/紫色 ｜ 素材 #7187
- 解锁：水·魔法 双精通 40 级
- 效果：将主角生命回满，并获得额外回合。
- 原文：Restore your Life to full. Gain an extra turn.
- 类型：生命回复·额外回合

#### 谢格拉之心 Sheggra’s Heart
- 传说 ｜ 法力 14 ｜ 蓝/棕色 ｜ 素材 #7202
- 解锁：水·地 双精通 40 级
- 效果：创造 [6+魔力] 颗红色宝石，并净化全体盟友。
- 原文：Create [6+Magic] Red Gems and Cleanse all allies.
- 类型：创造宝石·净化

#### 黑暗镣铐 Black Manacles
- 传说 ｜ 法力 15 ｜ 紫/棕色 ｜ 素材 #7268
- 解锁：魔法·地 双精通 40 级
- 效果：对全体敌人造成 [0+魔力] 点伤害；20% 几率吞噬一名随机敌人。
- 原文：Deal [0+Magic] damage to all enemies. 20% chance to devour a random enemy.
- 类型：直伤·吞噬·条件/概率

#### 捕梦网 Dream Catcher
- 传说 ｜ 法力 15 ｜ 黄/紫色 ｜ 素材 #7201
- 解锁：魔法·空气 双精通 40 级
- 效果：对敌人们随机分摊 [4+魔力] 点伤害；若目标队伍含妖精族，额外造成 10 点伤害。
- 原文：Deal [4+Magic] damage randomly split among enemies. Deal 10 more damage if the enemy has a Fey troop.
- 类型：直伤·随机分摊·条件/概率

#### 屠巨者 Giantslayer
- 传说 ｜ 法力 15 ｜ 红/蓝色 ｜ 素材 #7188
- 解锁：火·水 双精通 40 级
- 效果：对一名敌人造成 [4+魔力] 点伤害；若目标攻击 ≥10，额外造成 7 点伤害。
- 原文：Deal [4+Magic] damage to an enemy. Deal 7 more damage if they have 10 Attack or more.
- 类型：直伤·攻击增益·条件/概率

#### 黄金齿轮 Golden Cog
- 传说 ｜ 法力 15 ｜ 红/黄色 ｜ 素材 #7196
- 解锁：火·空气 双精通 40 级
- 效果：使一名盟友的护甲翻倍（增幅比 1:1）。
- 原文：Double an ally’s Armor. (Boost Ratio 1:1)
- 类型：护甲增益·增幅比

#### 曼格 Mang
- 传说 ｜ 法力 15 ｜ 红/棕色 ｜ 素材 #7189
- 解锁：火·地 双精通 40 级
- 效果：摧毁一名敌人的护甲并造成 [1+魔力] 点伤害；我的攻击提升等同于摧毁的护甲值（增幅比 1:1）。
- 原文：Destroy an enemy’s Armor. Deal [1+Magic] Damage. Increase my Attack by the amount of Armor destroyed. (Boost Ratio 1:1)
- 类型：直伤·护甲增益·攻击增益·摧毁/引爆

#### 潘神鲁特琴 Pan’s Lute
- 传说 ｜ 法力 15 ｜ 绿/黄色 ｜ 素材 #7203
- 解锁：自然·空气 双精通 40 级
- 效果：抽走首个与末位敌人的全部法力，并给予全体盟友 1 点魔力。
- 原文：Drain the Mana of the first and last enemies. Give all allies 1 Magic.
- 类型：魔力增益·法力操作

#### 力量铁砧 Anvil of Might
- 传说 ｜ 法力 16 ｜ 红/棕色 ｜ 素材 #7195
- 解锁：火·地 双精通 40 级
- 效果：使一名盟友获得 [1+魔力] 点攻击与护甲。
- 原文：Give an ally [1+Magic] Attack and Armor.
- 类型：护甲增益·攻击增益

#### 邪毒瓶 Vile Flask
- 传说 ｜ 法力 16 ｜ 红/蓝色 ｜ 素材 #7292
- 解锁：火·水 双精通 40 级
- 效果：使一名敌人中毒并摧毁其护甲，再创造 [0+魔力] 颗绿色宝石。
- 原文：Poison an enemy and destroy the enemy’s Armor. Create [0+Magic] Green Gems.
- 类型：护甲增益·创造宝石·摧毁/引爆·中毒

#### 屠戮之箭 Arrow of Slaying
- 传说 ｜ 法力 18 ｜ 蓝/绿色 ｜ 素材 #7293
- 解锁：水·自然 双精通 40 级
- 效果：对一名敌人造成 [10+魔力] 点伤害。
- 原文：Deal [10+Magic] damage to an enemy.
- 类型：直伤

#### 归零宝珠 Null Sphere
- 传说 ｜ 法力 18 ｜ 紫/棕色 ｜ 素材 #7198
- 解锁：魔法·地 双精通 40 级
- 效果：将一名敌人的魔力降为 0。
- 原文：Reduce an enemy’s Magic to 0.
- 类型：魔力增益

#### 魔锅 Cauldron
- 传说 ｜ 法力 20 ｜ 绿/棕色 ｜ 素材 #7190
- 解锁：自然·地 双精通 40 级
- 效果：使一名盟友的攻击翻倍，并给予其 [1+魔力] 点生命（增幅比 1:1）。
- 原文：Double an ally’s Attack and give them [1+Magic] Life. (Boost Ratio 1:1)
- 类型：生命回复·攻击增益·增幅比

## §3 全精通解锁（2 把 · 战略级）

#### 棱光宝珠 Prismatic Orb
- 传说 ｜ 法力 18 ｜ 红/蓝/绿/黄/紫/棕色 ｜ 素材 #7113
- 解锁：六系全精通 25 级
- 效果：创造 8 颗所选盟友法力色的宝石；该盟友获得 [0+魔力] 点护甲。
- 原文：Create 8 Gems of a chosen ally’s Mana Color. Ally gains [0+Magic] Armor.
- 类型：护甲增益·创造宝石·法力操作

#### 帝国珠宝 Imperial Jewel
- 传说 ｜ 法力 20 ｜ 红/蓝/绿/黄/紫/棕色 ｜ 素材 #7230
- 解锁：六系全精通 50 级
- 效果：对敌人们随机分摊 [7+魔力] 点伤害，并获得 2 点魔力。
- 原文：Deal [7+Magic] damage randomly split among enemies. Gain 2 Magic.
- 类型：直伤·随机分摊·魔力增益

## §4 特殊活动 / 王国武器包（35 把）

#### 熊图腾 Bear Totem
- 传说 ｜ 法力 9 ｜ 蓝/棕色 ｜ 素材 #7251
- 解锁：特殊活动 · $4.99 王国武器包（厄什卡亚）
- 效果：对一名敌人造成 [0+魔力] 点伤害；获得 1 点魔力，并移除全部绿色宝石以增幅效果（增幅比 3:1）。
- 原文：Deal [0+Magic] damage to an enemy. Gain 1 Magic and remove all Green Gems to Boost the effect. (Boost Ratio 3:1)
- 类型：直伤·魔力增益·增幅比

#### 砰砰 Boom-Boom
- 史诗 ｜ 法力 13 ｜ 棕色 ｜ 素材 #7183
- 解锁：特殊活动 · $4.99 王国武器包（齐埃金）
- 效果：引爆 3 颗随机宝石，并对敌人们随机分摊 [5+魔力] 点伤害。
- 原文：Explode 3 random Gems. Deal [5+Magic] damage randomly split among enemies.
- 类型：直伤·随机分摊·摧毁/引爆

#### 牛吼棒 Bullroarer
- 史诗 ｜ 法力 12 ｜ 绿色 ｜ 素材 #7186
- 解锁：特殊活动 · $4.99 王国武器包（狂野平原）
- 效果：给予全体盟友 [1+魔力] 点生命。
- 原文：Give all allies [1+Magic] Life.
- 类型：生命回复

#### 天界法杖 Celestial Staff
- 超稀有 ｜ 法力 10 ｜ 黄色 ｜ 素材 #7271
- 解锁：特殊活动 · $4.99 王国武器包（白盔国）
- 效果：对敌人们随机分摊 [4+魔力] 点伤害，并使自身回复 10 点生命。
- 原文：Deal [4+Magic] damage randomly split among enemies. Restore 10 Life to self.
- 类型：直伤·随机分摊·生命回复

#### 链锤 Chain Flail
- 史诗 ｜ 法力 11 ｜ 棕色 ｜ 素材 #7270
- 解锁：特殊活动 · $4.99 王国武器包（加尔凡尼亚）
- 效果：对一名敌人造成 [4+魔力] 点伤害；若其队伍含亡灵族，对另一名随机敌人造成 9 点伤害。
- 原文：Deal [4+Magic] damage to an enemy. If the enemy has an Undead troop, deal 9 damage to another random enemy.
- 类型：直伤·条件/概率

#### 混沌之刃 Chaos Blade
- 史诗 ｜ 法力 11 ｜ 紫色 ｜ 素材 #7246
- 解锁：特殊活动 · $4.99 王国武器包（荒芜之地）
- 效果：对一名敌人造成 [2+魔力] 点真实伤害；若目标为神圣族，额外造成 5 点真实伤害。
- 原文：Deal [2+Magic] true damage to an enemy. Deal 5 bonus true damage if the enemy is Divine.
- 类型：真实伤害·直伤·条件/概率

#### 绯红徽记 Crimson Insignia
- 史诗 ｜ 法力 12 ｜ 红色 ｜ 素材 #7217
- 解锁：特殊活动 · $4.99 王国武器包（毛格瑞姆森林）
- 效果：对一名敌人造成 [4+魔力] 点伤害；若棋盘上红色宝石 ≥10 颗，额外造成 8 点伤害。
- 原文：Deal [4+Magic] damage to an enemy. If there are 10 or more Red Gems on the board, deal 8 Bonus damage.
- 类型：直伤·条件/概率

#### 深渊岩 Deepstone
- 史诗 ｜ 法力 9 ｜ 蓝色 ｜ 素材 #7223
- 解锁：特殊活动 · $4.99 王国武器包（卡其尔）
- 效果：引爆 1 颗宝石，并摧毁该行。
- 原文：Explode a gem, and destroy that row.
- 类型：摧毁/引爆

#### 蛋爆 Eggsplosion
- 传说 ｜ 法力 15 ｜ 绿色 ｜ 素材 #7174
- 解锁：特殊活动（活动商店 / 限时礼包）
- 效果：引爆 4 颗所选颜色的随机宝石，并回复 [4+魔力] 点生命。
- 原文：Explode 4 random Gems of a chosen color. Restore [4+Magic] Life.
- 类型：生命回复·摧毁/引爆

#### 永恒之焰 Eternal Flame
- 史诗 ｜ 法力 6 ｜ 黄色 ｜ 素材 #7240
- 解锁：特殊活动 · $4.99 王国武器包（卜筮之原）
- 效果：将 1 颗宝石转换为红色，再创造 [2+魔力] 颗红色宝石。
- 原文：Convert a Gem to Red, then create [2+Magic] more Red Gems.
- 类型：创造宝石·转换宝石

#### 克萨诺斯之眼 Eye of Xathenos
- 传说 ｜ 法力 16 ｜ 蓝/紫色 ｜ 素材 #7219
- 解锁：特殊活动（活动商店 / 限时礼包）
- 效果：对一名敌人造成 [6+魔力] 点伤害并窃取其 3 点随机属性；若目标为妖精族，伤害翻倍。
- 原文：Deal [6+Magic] damage to an enemy, and steal 3 from a random stat. Deal double damage if the target is Fey.
- 类型：直伤·窃取属性·条件/概率

#### 远视宝珠 Farsight Orb
- 史诗 ｜ 法力 9 ｜ 棕色 ｜ 素材 #7226
- 解锁：特殊活动 · $4.99 王国武器包（日冕）
- 效果：创造 [3+魔力] 颗随机蓝色宝石，并使随机一项属性 +5。
- 原文：Create [3+Magic] random Blue Gems. Increase a random Skill by 5.
- 类型：创造宝石

#### 冰与火 Fire and Ice
- 传说 ｜ 法力 16 ｜ 红/蓝色 ｜ 素材 #7178
- 解锁：特殊活动（活动商店 / 限时礼包）
- 效果：对全体敌人造成 [0+魔力] 点伤害，并给予全体盟友 2 点生命。
- 原文：Deal [0+Magic] damage to all enemies and give 2 Life to all allies.
- 类型：直伤·生命回复

#### 寒霜掠夺者 Frost Reaver
- 史诗 ｜ 法力 11 ｜ 红色 ｜ 素材 #7291
- 解锁：特殊活动 · $4.99 王国武器包（风暴峡湾）
- 效果：摧毁一列；对首个敌人造成 [2+魔力] 点伤害，每颗被摧毁的蓝色宝石额外 +2 伤害（增幅比 ×2）。
- 原文：Destroy a Column. Deal [2+Magic] damage to the first enemy, and 2 more for every Blue Gem destroyed. (Boost Ratio x2)
- 类型：直伤·摧毁/引爆·增幅比

#### 碎地精之锤 Goblin Crusher
- 传说 ｜ 法力 12 ｜ 红/棕色 ｜ 素材 #7221
- 解锁：特殊活动 · $4.99 王国武器包（破碎尖塔）
- 效果：对一名敌人造成 [3+魔力] 点伤害；若目标为掠夺者族，伤害三倍。
- 原文：Deal [3+Magic] damage to an enemy. Deal triple damage if the enemy is a Marauder.
- 类型：直伤·条件/概率

#### 克利斯短刀 Kris Knife
- 史诗 ｜ 法力 10 ｜ 红色 ｜ 素材 #7222
- 解锁：特殊活动 · $4.99 王国武器包（鳞雾沼泽）
- 效果：对末位敌人造成 [4+魔力] 点伤害，并窃取 2 点魔力。
- 原文：Deal [4+Magic] damage to the last enemy, and steal 2 Magic.
- 类型：直伤·魔力增益·窃取属性

#### 自然之怒 Nature’s Wrath
- 史诗 ｜ 法力 12 ｜ 绿色 ｜ 素材 #7239
- 解锁：特殊活动 · $4.99 王国武器包（冰峰之巅）
- 效果：对一名敌人造成 [4+魔力] 点伤害、对相邻敌人各造成 1 点伤害；若目标已缠绕，额外造成 5 点伤害。
- 原文：Deal [4+Magic] damage to an enemy, and 1 damage to adjacent enemies. Deal 5 bonus damage if they are Entangled.
- 类型：直伤·缠绕·条件/概率

#### 秩序与混沌 Order and Chaos
- 传说 ｜ 法力 14 ｜ 红/绿色 ｜ 素材 #7267
- 解锁：特殊活动 · $4.99 王国武器包（剑锋崖）
- 效果：对末 2 名敌人各造成 [2+魔力] 点伤害；若目标为龙族，伤害翻倍。
- 原文：Deal [2+Magic] damage to the last 2 enemies. Deal double damage if the target is a dragon.
- 类型：直伤·条件/概率

#### 猎物追寻者 Prey Seeker
- 史诗 ｜ 法力 14 ｜ 棕色 ｜ 素材 #7284
- 解锁：特殊活动 · $4.99 王国武器包（龙爪）
- 效果：对一名敌人造成 [1+魔力] 点真实伤害；若目标带有猎人标记，伤害翻倍。
- 原文：Deal [1+Magic] true damage to an enemy. Deal double damage if the enemy has Hunter’s Mark.
- 类型：真实伤害·直伤·条件/概率

#### 时光之沙 Sands of Time
- 传说 ｜ 法力 12 ｜ 红/紫色 ｜ 素材 #7172
- 解锁：特殊活动 · $4.99 王国武器包（聚沙之地）
- 效果：使全体盟友回复 [5+魔力] 点生命，并获得额外回合。
- 原文：Restore [5+Magic] Life to all allies. Gain an Extra Turn.
- 类型：生命回复·额外回合

#### 寂静之夜 Silent Night
- 史诗 ｜ 法力 12 ｜ 紫色 ｜ 素材 #7272
- 解锁：特殊活动（活动商店 / 限时礼包）
- 效果：对末位敌人造成 [4+魔力] 点伤害，并使其沉默。
- 原文：Deal [4+Magic] damage to the last enemy, and Silence them.
- 类型：直伤·沉默

#### 碎颅斧 Skull Cleaver
- 史诗 ｜ 法力 13 ｜ 紫色 ｜ 素材 #7184
- 解锁：特殊活动 · $4.99 王国武器包（葛洛什奈克）
- 效果：摧毁一列；对随机一名敌人造成 [5+魔力] 点伤害，按摧毁的骷髅头数增幅（增幅比 1:1）。
- 原文：Destroy a column. Deal [5+Magic] damage to a random enemy, Boosted by Skulls destroyed. (Boost Ratio 1:1)
- 类型：直伤·摧毁/引爆·增幅比

#### 骷髅之刃 Skullblade
- 史诗 ｜ 法力 12 ｜ 棕色 ｜ 素材 #7299
- 解锁：特殊活动 · $4.99 王国武器包（黑鹰）
- 效果：对前 2 名敌人造成 [0+魔力] 点伤害，并移除全部骷髅头以增幅效果（增幅比 2:1）。
- 原文：Deal [0+Magic] damage to the first 2 enemies, and remove all Skulls to boost the effect. (Boost Ratio 2:1)
- 类型：直伤·增幅比

#### 屠戮铃铛 Slay Bells
- 传说 ｜ 法力 13 ｜ 红/绿色 ｜ 素材 #7220
- 解锁：特殊活动（活动商店 / 限时礼包）
- 效果：对一名敌人和另一名随机敌人各造成 [2+魔力] 点伤害，并窃取 1 点魔力。
- 原文：Deal [2+Magic] damage to an enemy and a random enemy. Steal 1 Magic from the enemy.
- 类型：直伤·魔力增益·窃取属性

#### 捕魂器 Soultrap
- 史诗 ｜ 法力 13 ｜ 红色 ｜ 素材 #7306
- 解锁：特殊活动 · $4.99 王国武器包（黑石）
- 效果：对一名敌人造成 [2+魔力] 点伤害并抽干其法力；若该敌人死亡，获得 5 点生命。
- 原文：Deal [2+Magic] damage to an enemy and drain their Mana. Gain 5 Life if the enemy dies.
- 类型：直伤·生命回复·法力操作·条件/概率

#### 火花火箭 2.0.16 Spark Rocket 2.0.16
- 传说 ｜ 法力 11 ｜ 红/黄色 ｜ 素材 #7185
- 解锁：特殊活动（活动商店 / 限时礼包）
- 效果：引爆 1 颗宝石；对随机一名敌人造成 [5+魔力] 点伤害并使其燃烧。
- 原文：Explode a gem. Deal [5+Magic] damage to a random enemy and Burn them.
- 类型：直伤·摧毁/引爆·燃烧

#### 蜘蛛之吻 Spider’s Kiss
- 传说 ｜ 法力 14 ｜ 紫色 ｜ 素材 #7244
- 解锁：特殊活动 · $4.99 王国武器包（蛛尔卡里）
- 效果：缠绕首个敌人，并对其造成 [2+魔力] 点真实伤害。
- 原文：Entangle the first enemy, and deal [2+Magic] true damage.
- 类型：真实伤害·直伤·缠绕

#### 疯狂法杖 Staff of Madness
- 传说 ｜ 法力 16 ｜ 红/紫色 ｜ 素材 #7227
- 解锁：特殊活动 · $4.99 王国武器包（卡拉考斯）
- 效果：对全体敌人造成 [1+魔力] 点伤害，并从每名敌人处各窃取 1 点随机属性。
- 原文：Deal [1+Magic] damage to all enemies. Steal 1 from a random skill from each enemy.
- 类型：直伤·窃取属性

#### 日与月 Sun and Moon
- 传说 ｜ 法力 16 ｜ 黄/紫色 ｜ 素材 #7242
- 解锁：特殊活动 · $4.99 王国武器包（玉银林地）
- 效果：对全体敌人造成 [0+魔力] 点伤害，并给予全体盟友 1 点魔力。
- 原文：Deal [0+Magic] damage to all enemies and give 1 Magic to all allies.
- 类型：直伤·魔力增益

#### 日轮环刃 Sun Chakram
- 史诗 ｜ 法力 10 ｜ 黄色 ｜ 素材 #7170
- 解锁：特殊活动 · $4.99 王国武器包（荣耀之地）
- 效果：对敌人们随机分摊 [7+魔力] 点伤害；若目标队伍含恶魔族，额外造成 8 点伤害。
- 原文：Deal [7+Magic] damage randomly split among enemies. Deal 8 more damage if the enemy has a Daemon troop.
- 类型：直伤·随机分摊·条件/概率

#### 西尔瓦茜双刃 Sylvasi’s Blades
- 史诗 ｜ 法力 14 ｜ 绿色 ｜ 素材 #7228
- 解锁：特殊活动（活动商店 / 限时礼包）
- 效果：对一名敌人造成 [5+魔力] 点伤害，并窃取 2 点攻击。
- 原文：Deal [5+Magic] damage to an enemy. Steal 2 Attack.
- 类型：直伤·攻击增益·窃取属性

#### 战争与和平 War and Peace
- 传说 ｜ 法力 16 ｜ 绿/棕色 ｜ 素材 #7176
- 解锁：Khazial 后续战役任务线（2019 年官方移入灵魂熔炉，特例）
- 效果：对全体敌人造成 [0+魔力] 点伤害，并给予全体盟友 2 点攻击。
- 原文：Deal [0+Magic] damage to all enemies and give 2 Attack to all allies.
- 类型：直伤·攻击增益

#### 凋零之触 Withering Touch
- 传说 ｜ 法力 14 ｜ 蓝色 ｜ 素材 #7218
- 解锁：特殊活动（活动商店 / 限时礼包）
- 效果：对首个敌人造成 4 点真实伤害；获得 [1+魔力] 点生命并抽干该敌人的法力。
- 原文：Deal 4 True Damage to the first enemy. Gain [1+Magic] Life and drain the enemy’s Mana.
- 类型：真实伤害·直伤·生命回复·法力操作

#### 扳手大师 5000 Wrenchmaster 5000
- 史诗 ｜ 法力 12 ｜ 黄色 ｜ 素材 #7283
- 解锁：特殊活动 · $4.99 王国武器包（阿达纳）
- 效果：给予全体盟友 [1+魔力] 点护甲。
- 原文：Give all allies [1+Magic] Armor.
- 类型：护甲增益

#### 雅斯敏圣杯 Yasmine’s Chalice
- 传说 ｜ 法力 16 ｜ 绿/黄色 ｜ 素材 #—
- 解锁：特殊活动 · $4.99 王国武器包（荆棘森林）
- 效果：给予全体盟友 [0+魔力] 点生命与护甲；若棋盘上绿色宝石 ≥10 颗，获得额外回合。
- 原文：Give all allies [0+Magic] Life and Armor. If there are 10 or more Green Gems on the board, gain an extra turn.
- 类型：生命回复·护甲增益·额外回合·条件/概率

## §5 王国武器包独有（6 把 · 官方目录未收，效果待补）

> 官方帖 55952（2019-06）确认的 $4.99 包武器中，以下 6 把不在官方 game-guide 目录里；法术数值需在游戏内/wiki 逐把页补全。

#### 妖精魔杖（Bright Forest 皓彩森林）
- 稀有度/法力/颜色：【待补】
- 解锁：$4.99 王国武器包，随该王国活动返场（永不进灵魂熔炉）
- 效果：【待补】

#### 商人之刃（Leonis Empire 狮心帝国）
- 稀有度/法力/颜色：【待补】
- 解锁：$4.99 王国武器包，随该王国活动返场（永不进灵魂熔炉）
- 效果：【待补】

#### 节庆法杖（Shentang 圣唐）
- 稀有度/法力/颜色：【待补】
- 解锁：$4.99 王国武器包，随该王国活动返场（永不进灵魂熔炉）
- 效果：【待补】

#### 恶魔锁链（Dhrak-Zum 卓克祖）
- 稀有度/法力/颜色：【待补】
- 解锁：$4.99 王国武器包，随该王国活动返场（永不进灵魂熔炉）
- 效果：【待补】

#### 温蒂妮三叉戟（Merlantis 梅兰堤斯）
- 稀有度/法力/颜色：【待补】
- 解锁：$4.99 王国武器包，随该王国活动返场（永不进灵魂熔炉）
- 效果：【待补】

#### 罪孽魔典（Sin of Maraj 迈纳杰之罪）
- 稀有度/法力/颜色：【待补】
- 解锁：$4.99 王国武器包，随该王国活动返场（永不进灵魂熔炉）
- 效果：【待补】


## §6 职业专属神话武器（10 把已验证 / 全 37 把）

> 解锁规则（已考证）：带该职业出战取得 **250 场胜利**；职业武器一律**单色**（官方 2018-09 裁定）；颜色 = 该职业的武器绑定色。以下为多来源交叉验证的名录，效果数值需逐职业页补全（/wiki/{Class}_(Hero_Class)）。

#### 邪恶精华（Plaguelord 瘟疫领主）
- 稀有度：神话 ｜ 法力/颜色：【待补】
- 解锁：装备对应职业取得 250 场胜利
- 效果：【待补】
- 备注：论坛公认最强免费职业武器

#### 厄什卡亚之盾（Sentinel 哨卫）
- 稀有度：神话 ｜ 法力/颜色：【待补】
- 解锁：装备对应职业取得 250 场胜利
- 效果：【待补】

#### 善之映照（Archmagus 大法师）
- 稀有度：神话 ｜ 法力/颜色：【待补】
- 解锁：装备对应职业取得 250 场胜利
- 效果：【待补】

#### 万能钥匙（Thief 盗贼）
- 稀有度：神话 ｜ 法力/颜色：【待补】
- 解锁：装备对应职业取得 250 场胜利
- 效果：【待补】

#### 罪孽收割（Doomsayer 末日预言者）
- 稀有度：神话 ｜ 法力/颜色：【待补】
- 解锁：装备对应职业取得 250 场胜利
- 效果：【待补】

#### 焰魂（Sunspear 日矛战士）
- 稀有度：神话 ｜ 法力/颜色：【待补】
- 解锁：装备对应职业取得 250 场胜利
- 效果：【待补】
- 备注：红色；官方 2018-09 由红/绿改回单色

#### 龙之眼（Dragonguard 龙卫）
- 稀有度：神话 ｜ 法力/颜色：【待补】
- 解锁：装备对应职业取得 250 场胜利
- 效果：【待补】
- 备注：地下城主力，后遭平衡性下调

#### 执勤守护（Knight 骑士）
- 稀有度：神话 ｜ 法力/颜色：【待补】
- 解锁：装备对应职业取得 250 场胜利
- 效果：【待补】
- 备注：蓝色

#### 圣阿斯特拉法杖（Priest 牧师）
- 稀有度：神话 ｜ 法力/颜色：【待补】
- 解锁：装备对应职业取得 250 场胜利
- 效果：【待补】
- 备注：黄色

#### 凛冬宝珠（Frostmage 冰法师）
- 稀有度：神话 ｜ 法力/颜色：【待补】
- 解锁：装备对应职业取得 250 场胜利
- 效果：【待补】


## §7 直购神话主角武器（样本）

#### 黎明使者 Dawnbringer
- 稀有度：神话 ｜ 三色（法力/数值待补）
- 解锁：130 万灵魂直购
- 备注：三色神话主角武器，130 万灵魂直购（论坛帖 46611 多人确认）
