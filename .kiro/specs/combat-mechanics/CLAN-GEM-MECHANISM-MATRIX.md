# 族系 × 机制 × 特殊宝石批量审查索引

生成方式：`node scripts/audit-clan-gems.mjs`。数据：`src/data/troops.json`（1800）、`src/data/weapons.json`（718）。

**档位说明：**本项目的 `rarityIdx === 5` 共 233 名，JSON 的 rarity 字段写的是 `Legendary`；此档按 src/meta/data/rarity.ts 展示为“神话”（区别于武器的 Mythic 键）。186 名属于多个族系，同一部队可出现在多行，各行不可求和。

**验收界限：**脚本断言 41 种类型都有测试台投放与贴图映射（不代表已进行浏览器目视检验）；机制列只做中文描述关键词索引；“测试提及”只指测试文件出现对应 kind，既不是测试断言逐分支覆盖，更不是原版语义签收。机制核查不会自动增加逐项签收数。

## 族系：31 种（按神话档数量排序）

| 族系 | 全档人数 | 神话档人数 | 神话档法术机制（命中人数） | 神话档明确提及的特殊宝石 |
|---|---:|---:|---|---|
| Dragon | 122 | 44 | 群体/散射 41、溅射 1、真实伤害/生命窃取 2、法力/额外回合 25、造石/转色 27、爆破/摧毁 1、召唤 1、治疗/增益 1、异常状态 12、风暴 1 | 末日骷髅 2、通配 2、燃烧 1、冻结 1、诅咒 1、精灵火 1、屏障 1、龙 15、巨人 6、附魔 1 |
| Divine | 98 | 40 | 群体/散射 15、溅射 3、斩杀/击杀奖励 2、真实伤害/生命窃取 9、法力/额外回合 7、造石/转色 8、爆破/摧毁 3、召唤 4、治疗/增益 5、异常状态 11 | 末日骷髅 2、诅咒 1、死亡标记 1、屏障 1、天使 2 |
| Daemon | 179 | 35 | 群体/散射 15、溅射 2、斩杀/击杀奖励 3、真实伤害/生命窃取 6、法力/额外回合 7、造石/转色 8、爆破/摧毁 5、召唤 10、异常状态 9、风暴 2 | 末日骷髅 3、燃烧 1、诅咒 1、沉没 1、恶魔传送门 1、石像鬼 2 |
| Elemental | 240 | 35 | 群体/散射 18、溅射 5、斩杀/击杀奖励 1、真实伤害/生命窃取 4、法力/额外回合 7、造石/转色 13、爆破/摧毁 5、召唤 1、治疗/增益 2、异常状态 13、风暴 1 | 末日骷髅 2、通配 1、燃烧 2、冻结 1、缠绕 2、精灵火 1、屏障 1、法力药水 1、元素星 1、狼化 1、附魔 1 |
| Immortal | 31 | 31 | 群体/散射 11、溅射 8、斩杀/击杀奖励 1、真实伤害/生命窃取 15、法力/额外回合 1、造石/转色 1、爆破/摧毁 3、治疗/增益 2、异常状态 6 | 末日骷髅 1、炸弹 1、许愿 1、沙漏 1、燃烧 1、冻结 1、缠绕 1、激怒 1、沉没 1、屏障 2、龙 2、巨人 1、法力药水 1、天使 2 |
| Mystic | 228 | 28 | 群体/散射 13、溅射 1、斩杀/击杀奖励 1、真实伤害/生命窃取 6、法力/额外回合 4、造石/转色 5、爆破/摧毁 4、召唤 5、治疗/增益 1、异常状态 7、风暴 1 | 末日骷髅 1、沙漏 1、流血 1、毒 1、恐怖 1、缠绕 1、龙 1、法力药水 1、元素星 1、天使 2 |
| Fey | 145 | 23 | 群体/散射 8、溅射 2、斩杀/击杀奖励 1、真实伤害/生命窃取 4、法力/额外回合 7、造石/转色 5、爆破/摧毁 1、召唤 1、治疗/增益 2、异常状态 8 | 末日骷髅 1、通配 1、许愿 1、冻结 2、毒 1、恐怖 1、灵力 1 |
| Undead | 163 | 23 | 群体/散射 8、斩杀/击杀奖励 1、真实伤害/生命窃取 10、法力/额外回合 1、造石/转色 5、爆破/摧毁 2、召唤 4、异常状态 10、风暴 1 | 末日骷髅 6、赃物 1、冻结 1、诅咒 1、流血 1、死亡标记 1、法力药水 1 |
| Beast | 262 | 17 | 群体/散射 5、斩杀/击杀奖励 2、真实伤害/生命窃取 3、法力/额外回合 1、造石/转色 7、爆破/摧毁 1、召唤 3、治疗/增益 2、异常状态 9、风暴 1 | 末日骷髅 2、冻结 1、狼化 2 |
| Boss | 13 | 13 | 群体/散射 8、斩杀/击杀奖励 3、法力/额外回合 8、造石/转色 10、召唤 3、异常状态 3、风暴 1 | 末日骷髅 3、诅咒 1、巨人 7、法力药水 1、狼化 1 |
| Construct | 182 | 13 | 群体/散射 3、溅射 1、法力/额外回合 2、造石/转色 4、爆破/摧毁 3、召唤 1、治疗/增益 4、异常状态 2 | 末日骷髅 1、炸弹 1、石像鬼 2 |
| Knight | 156 | 12 | 群体/散射 9、溅射 1、真实伤害/生命窃取 3、法力/额外回合 4、造石/转色 2、治疗/增益 2、异常状态 7 | 燃烧 1、龙 1、天使 1、石像鬼 1 |
| Monster | 148 | 10 | 群体/散射 4、斩杀/击杀奖励 2、真实伤害/生命窃取 4、法力/额外回合 3、爆破/摧毁 1、治疗/增益 1、异常状态 5 | 诅咒 1、石块 1 |
| Wildfolk | 70 | 9 | 群体/散射 1、溅射 3、真实伤害/生命窃取 2、法力/额外回合 1、造石/转色 1、爆破/摧毁 2、召唤 1、治疗/增益 2、异常状态 2 | 死亡标记 1 |
| Wargare | 62 | 8 | 群体/散射 1、溅射 2、斩杀/击杀奖励 2、真实伤害/生命窃取 1、法力/额外回合 4、造石/转色 1、召唤 1、治疗/增益 1、异常状态 2 | 末日骷髅 1 |
| Human | 125 | 7 | 群体/散射 3、溅射 1、法力/额外回合 3、造石/转色 1、治疗/增益 2、异常状态 1 | 沙漏 1、龙 1 |
| Elf | 85 | 6 | 群体/散射 4、斩杀/击杀奖励 2、真实伤害/生命窃取 2、法力/额外回合 1、造石/转色 1、爆破/摧毁 2、异常状态 2 | 末日骷髅 1、屏障 1 |
| Merfolk | 46 | 6 | 群体/散射 1、溅射 1、斩杀/击杀奖励 1、法力/额外回合 1、造石/转色 1、爆破/摧毁 1、异常状态 2 | 沉没 2、法力药水 1 |
| Naga | 42 | 6 | 群体/散射 1、斩杀/击杀奖励 1、真实伤害/生命窃取 4、法力/额外回合 1、造石/转色 1、爆破/摧毁 1、召唤 1、异常状态 2 | 燃烧 1、石块 1 |
| Centaur | 42 | 5 | 群体/散射 3、真实伤害/生命窃取 1、爆破/摧毁 2 | 恶魔传送门 1 |
| Dwarf | 54 | 5 | 群体/散射 1、溅射 1、真实伤害/生命窃取 1、造石/转色 1、爆破/摧毁 1、召唤 1、治疗/增益 1、异常状态 2 | 末日骷髅 1、炸弹 1、诅咒 1 |
| Giant | 75 | 5 | 群体/散射 3、溅射 1、斩杀/击杀奖励 1、真实伤害/生命窃取 2、异常状态 1 | 末日骷髅 1、巨人 1 |
| Goblin | 45 | 5 | 群体/散射 2、真实伤害/生命窃取 1、法力/额外回合 5、造石/转色 1、爆破/摧毁 2、召唤 1、治疗/增益 1 | 许愿 2、燃烧 1 |
| Mech | 43 | 5 | 群体/散射 2、真实伤害/生命窃取 1、造石/转色 2、爆破/摧毁 1、召唤 1、治疗/增益 1 | 炸弹 5 |
| Orc | 34 | 5 | 溅射 1、斩杀/击杀奖励 1、真实伤害/生命窃取 1、爆破/摧毁 1、召唤 1 | 末日骷髅 1、激怒 2 |
| Raksha | 44 | 5 | 群体/散射 2、斩杀/击杀奖励 1、真实伤害/生命窃取 1、治疗/增益 2、异常状态 1 | 天使 1 |
| Stryx | 37 | 5 | 群体/散射 3、造石/转色 3、爆破/摧毁 1、异常状态 2、风暴 3 | 冻结 1、灵力 1 |
| Tauros | 31 | 5 | 群体/散射 1、溅射 2、法力/额外回合 1、爆破/摧毁 1 | 黄闪电 1 |
| Rogue | 74 | 4 | 群体/散射 1、斩杀/击杀奖励 1、真实伤害/生命窃取 2、造石/转色 3、召唤 1 | 赃物 1 |
| Urska | 37 | 3 | 溅射 2、召唤 1、风暴 1 | — |
| Castle | 1 | 1 | — | — |

## 特殊宝石：41 种（全量接口账）

触发：“摧毁”含匹配并移除；“双入口”表示两种路径均接入口，不代表每种收益完全相同。具体语义以各宝石测试和规则文档为准。

| 宝石 kind | 预期入口 | 代码位置 | 回归文件提及 | 测试台/贴图映射 | 神话档技能/特质明示 | 武器技能明示 | 原版证据状态 |
|---|---|---|---|---:|---:|---|
| `doomSkull`（末日骷髅） | 匹配 | types.matchJoinKey → TurnEngine.collectMatchTriggers / expandSpecialDestruction | gemSpecial、specialGemsWaveB、gemClearBatch、skullStorm | 已登记/有贴图 | 16 | 16 | 本地规则文档有原文/裁定；尚未逐条外部复核 |
| `uberDoomSkull`（至尊末日骷髅） | 匹配 | types.matchJoinKey → TurnEngine.collectMatchTriggers / expandSpecialDestruction | gemSpecial、gemClearBatch、skullStorm | 已登记/有贴图 | 0 | 0 | 本地规则文档有原文/裁定；尚未逐条外部复核 |
| `bomb`（炸弹） | 摧毁 | types.matchJoinKey → TurnEngine.collectMatchTriggers / expandSpecialDestruction | gemSpecial、statusGems、specialGemsWaveB、gemClearBatch | 已登记/有贴图 | 5 | 4 | 本地规则文档有原文/裁定；尚未逐条外部复核 |
| `web`（织网） | 双入口 | types.matchJoinKey → TurnEngine.collectMatchTriggers / expandSpecialDestruction | gemSpecial、specialGemsWaveB | 已登记/有贴图 | 0 | 1 | 本地规则文档有原文/裁定；尚未逐条外部复核 |
| `lightningRow`（蓝闪电） | 匹配 | types.matchJoinKey → TurnEngine.collectMatchTriggers / expandSpecialDestruction | gemSpecial | 已登记/有贴图 | 0 | 1 | 本地规则文档有原文/裁定；尚未逐条外部复核 |
| `lightningCol`（黄闪电） | 匹配 | types.matchJoinKey → TurnEngine.collectMatchTriggers / expandSpecialDestruction | gemSpecial | 已登记/有贴图 | 1 | 1 | 本地规则文档有原文/裁定；尚未逐条外部复核 |
| `wildcard`（通配） | 匹配 | types.matchJoinKey → TurnEngine.collectMatchTriggers / expandSpecialDestruction | gemSpecial、statusGems、specialGemsWaveB | 已登记/有贴图 | 2 | 2 | 本地规则文档有原文/裁定；尚未逐条外部复核 |
| `wish`（许愿） | 摧毁 | types.matchJoinKey → TurnEngine.collectMatchTriggers / expandSpecialDestruction | gemSpecial、gemClearBatch | 已登记/有贴图 | 2 | 2 | 本地规则文档有原文/裁定；尚未逐条外部复核 |
| `hourglass`（沙漏） | 匹配 | types.matchJoinKey → TurnEngine.collectMatchTriggers / expandSpecialDestruction | gemSpecial | 已登记/有贴图 | 2 | 2 | 本地规则文档有原文/裁定；尚未逐条外部复核 |
| `bootyGem`（赃物） | 摧毁 | types.matchJoinKey → TurnEngine.collectMatchTriggers / expandSpecialDestruction | gemSpecial | 已登记/有贴图 | 1 | 4 | 本地规则文档有原文/裁定；尚未逐条外部复核 |
| `ghost`（幽魂） | 待核 | types/TurnEngine（无触发或特殊规则） | gemSpecial | 已登记/有贴图 | 0 | 0 | 灵魂经济未接战场收益 |
| `burningGem`（燃烧） | 匹配 | types.matchJoinKey → TurnEngine.collectMatchTriggers / expandSpecialDestruction | statusGems | 已登记/有贴图 | 4 | 4 | 本地规则文档有原文/裁定；尚未逐条外部复核 |
| `freezeGem`（冻结） | 匹配 | types.matchJoinKey → TurnEngine.collectMatchTriggers / expandSpecialDestruction | statusGems | 已登记/有贴图 | 4 | 2 | 本地规则文档有原文/裁定；尚未逐条外部复核 |
| `curseGem`（诅咒） | 匹配 | types.matchJoinKey → TurnEngine.collectMatchTriggers / expandSpecialDestruction | statusGems | 已登记/有贴图 | 5 | 4 | 本地规则文档有原文/裁定；尚未逐条外部复核 |
| `bleedGem`（流血） | 摧毁 | types.matchJoinKey → TurnEngine.collectMatchTriggers / expandSpecialDestruction | statusGems | 已登记/有贴图 | 1 | 3 | 本地规则文档有原文/裁定；尚未逐条外部复核 |
| `poisonGem`（毒） | 匹配 | types.matchJoinKey → TurnEngine.collectMatchTriggers / expandSpecialDestruction | statusGems | 已登记/有贴图 | 1 | 2 | 本地规则文档有原文/裁定；尚未逐条外部复核 |
| `deathMarkGem`（死亡标记） | 摧毁 | types.matchJoinKey → TurnEngine.collectMatchTriggers / expandSpecialDestruction | statusGems | 已登记/有贴图 | 2 | 1 | 本地规则文档有原文/裁定；尚未逐条外部复核 |
| `terrorGem`（恐怖） | 匹配 | types.matchJoinKey → TurnEngine.collectMatchTriggers / expandSpecialDestruction | statusGems | 已登记/有贴图 | 1 | 1 | 本地规则文档有原文/裁定；尚未逐条外部复核 |
| `entangleGem`（缠绕） | 摧毁 | types.matchJoinKey → TurnEngine.collectMatchTriggers / expandSpecialDestruction | statusGems | 已登记/有贴图 | 2 | 1 | 本地规则文档有原文/裁定；尚未逐条外部复核 |
| `enrageGem`（激怒） | 摧毁 | types.matchJoinKey → TurnEngine.collectMatchTriggers / expandSpecialDestruction | statusGems | 已登记/有贴图 | 2 | 2 | 本地规则文档有原文/裁定；尚未逐条外部复核 |
| `submergeGem`（沉没） | 摧毁 | types.matchJoinKey → TurnEngine.collectMatchTriggers / expandSpecialDestruction | statusGems | 已登记/有贴图 | 2 | 1 | 本地规则文档有原文/裁定；尚未逐条外部复核 |
| `faerieFireGem`（精灵火） | 摧毁 | types.matchJoinKey → TurnEngine.collectMatchTriggers / expandSpecialDestruction | statusGems | 已登记/有贴图 | 1 | 0 | 宝石触发句待核 |
| `stunGem`（打昏） | 摧毁 | types.matchJoinKey → TurnEngine.collectMatchTriggers / expandSpecialDestruction | statusGems | 已登记/有贴图 | 0 | 0 | 宝石触发句待核 |
| `barrierGem`（屏障） | 摧毁 | types.matchJoinKey → TurnEngine.collectMatchTriggers / expandSpecialDestruction | statusGems | 已登记/有贴图 | 3 | 0 | 宝石触发句待核 |
| `dragonGem`（龙） | 双入口 | types.matchJoinKey → TurnEngine.collectMatchTriggers / expandSpecialDestruction | specialGemsWaveB | 已登记/有贴图 | 16 | 2 | 本地规则文档有原文/裁定；尚未逐条外部复核 |
| `giantGem`（巨人） | 双入口 | types.matchJoinKey → TurnEngine.collectMatchTriggers / expandSpecialDestruction | specialGemsWaveB | 已登记/有贴图 | 8 | 3 | 本地规则文档有原文/裁定；尚未逐条外部复核 |
| `spiritGem`（灵力） | 双入口 | types.matchJoinKey → TurnEngine.collectMatchTriggers / expandSpecialDestruction | specialGemsWaveB | 已登记/有贴图 | 1 | 1 | 颜色集合待核 |
| `manaPotionGem`（法力药水） | 双入口 | types.matchJoinKey → TurnEngine.collectMatchTriggers / expandSpecialDestruction | specialGemsWaveB | 已登记/有贴图 | 3 | 0 | 本地规则文档有原文/裁定；尚未逐条外部复核 |
| `candyGem`（糖果） | 匹配 | types.matchJoinKey → TurnEngine.collectMatchTriggers / expandSpecialDestruction | specialGemsWaveB | 已登记/有贴图 | 0 | 0 | 本地规则文档有原文/裁定；尚未逐条外部复核 |
| `elementalStar`（元素星） | 匹配 | types.matchJoinKey → TurnEngine.collectMatchTriggers / expandSpecialDestruction | specialGemsWaveB | 已登记/有贴图 | 1 | 1 | 本地规则文档有原文/裁定；尚未逐条外部复核 |
| `umbralStar`（暗影星） | 匹配 | types.matchJoinKey → TurnEngine.collectMatchTriggers / expandSpecialDestruction | specialGemsWaveB | 已登记/有贴图 | 0 | 1 | 本地规则文档有原文/裁定；尚未逐条外部复核 |
| `angelGem`（天使） | 摧毁 | types.matchJoinKey → TurnEngine.collectMatchTriggers / expandSpecialDestruction | specialGemsWaveB | 已登记/有贴图 | 4 | 4 | 本地规则文档有原文/裁定；尚未逐条外部复核 |
| `daemonicPortalGem`（恶魔传送门） | 摧毁 | types.matchJoinKey → TurnEngine.collectMatchTriggers / expandSpecialDestruction | specialGemsWaveB | 已登记/有贴图 | 1 | 2 | 本地规则文档有原文/裁定；尚未逐条外部复核 |
| `gargoyleGem`（石像鬼） | 摧毁 | types.matchJoinKey → TurnEngine.collectMatchTriggers / expandSpecialDestruction | specialGemsWaveB | 已登记/有贴图 | 3 | 5 | 本地规则文档有原文/裁定；尚未逐条外部复核 |
| `stoneBlock`（石块） | 被动 | types/TurnEngine（无触发或特殊规则） | specialGemsWaveB | 已登记/有贴图 | 1 | 2 | 本地规则文档有原文/裁定；尚未逐条外部复核 |
| `lycanthropyGem`（狼化） | 摧毁 | types.matchJoinKey → TurnEngine.collectMatchTriggers / expandSpecialDestruction | specialGemsWaveB | 已登记/有贴图 | 2 | 1 | 本地规则文档有原文/裁定；尚未逐条外部复核 |
| `decayGem`（腐朽） | 盘上 | TurnEngine.applyDecayGemAura | specialGemsWaveB | 已登记/有贴图 | 0 | 0 | 本地规则文档有原文/裁定；尚未逐条外部复核 |
| `volcanoGem`（火山） | 摧毁 | types.matchJoinKey → TurnEngine.collectMatchTriggers / expandSpecialDestruction | specialGemsWaveB | 已登记/有贴图 | 0 | 1 | 已核实：被摧毁（含匹配）向上清除 |
| `trapGem`（陷阱） | 摧毁 | types.matchJoinKey → TurnEngine.collectMatchTriggers / expandSpecialDestruction | specialGemsWaveB | 已登记/有贴图 | 0 | 0 | 本地规则文档有原文/裁定；尚未逐条外部复核 |
| `enchantedGem`（附魔） | 匹配 | types.matchJoinKey → TurnEngine.collectMatchTriggers / expandSpecialDestruction | specialGemsWaveB | 已登记/有贴图 | 1 | 0 | 已核实：匹配时附魔随机己方 |
| `mimicGem`（宝箱怪） | 待核 | types/TurnEngine（无触发或特殊规则） | specialGemsWaveB | 已登记/有贴图 | 0 | 0 | 触发句待官方核实 |

### 复核优先级

1. 优先核对原版证据缺口：幽魂/宝箱怪、精灵火/打昏/屏障的宝石触发句、灵力宝石颜色集合。
2. 对神话档大族系按机制批量驱动实战回放：优先 Dragon/Divine/Daemon/Elemental；不要仅按族系合计验收。
3. 对匹配、摧毁、爆破连锁、转色生成、回合起始、敌方行动分别建立断言；单测通过只证明所断言的场景。
