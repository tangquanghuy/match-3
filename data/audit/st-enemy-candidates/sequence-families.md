# 下一批 ST 来源候选（修正版，2026-10-24）

**27 名完整候选映射：21 名优先 + 6 名选择器扩展。** 原有 scan51 范围保持，24 名排除项继续保留。本次只修复编码与稀有度；JSON 说明字段采用清晰英文，完整原始 SpellSteps、英文条款、全部普通特质和 amountOracle witness 保持原值。

六档统一为 `[Common, Uncommon, Rare, UltraRare, Epic, Legendary]`。27 名均核对 raw RarityIdx、原生 TroopRarity、imported rarity/rarityIdx 与 sourceTroop.rarity。

正确合计：Common **9**，Uncommon **0**，Rare **10**，UltraRare **4**，Epic **4**，Legendary **0**。**完整候选 Legendary 为 0**；筛选条件保持原样。

| 可复用家族 | 优先 | 扩展 | 合计 | Epic ID | Legendary 数量 |
|---|---:|---:|---:|---|---:|
| 线性 Damage/TrueDamage + 顺序状态/简单 stat | 16 | 6 | **22** | 6078, 6192, 6547 | 0 |
| 顺序状态链 / self、ally 简单 stat | 5 | 0 | **5** | 6924 | 0 |

建议一个有边界的独立 raw 解释器按来源参数表复用两族。现有测试是复用脚手架；每名仍需完整独立预期、主动顺序与全部普通特质组合证据。

| ID | 名称 | Spell | 正确稀有度 | 批次 | 全部普通特质 |
|---:|---|---:|---|---|---|
| 6043 | Blast Cannon | 7043 | Rare | 优先 | mechslayer, stonelink, impervious |
| 6048 | Pride Hunter | 7048 | Common | 优先 | rakshabond, stealthy, firespirit |
| 6078 | Crimson Bat | 7148 | Epic | 优先 | divineslayer, undying, bloodsucking |
| 6164 | Salamander | 7290 | UltraRare | 优先 | elementalbond, pyromania, fireproof |
| 6186 | Snow Sprite | 7327 | Common | 优先 | feybond, insulated, shatter |
| 6209 | Spider Knight | 7351 | Common | 优先 | darkancestry, armored, venomous |
| 6217 | Creeper | 7359 | Common | 优先 | monsterbond, immune, plaguetouch |
| 6219 | Moa | 7361 | Common | 优先 | airheart, fast, knockout |
| 6229 | Sand Cobra | 7371 | Common | 优先 | beastbond, agile, stonelink |
| 6272 | Ship Cannon | 7418 | Common | 优先 | constructbond, reinforced, armored |
| 6286 | Mummified King | 7432 | Rare | 优先 | undying, necromancy, arcane |
| 6324 | Enchantress | 7474 | Rare | 优先 | mysticbond, highancestry, magicspirit |
| 6393 | Dragon Turtle | 7548 | Rare | 优先 | dragonshield, huge, stoneskin |
| 6450 | Ser Cygnea | 7628 | UltraRare | 优先 | knightshield, warded, holyarmor |
| 6742 | Scarabi | 8112 | Rare | 优先 | toxic, fast, agile |
| 6785 | Guardian of the Fields | 8175 | Rare | 优先 | magicshield, armored, fast |
| 6866 | Lasher | 8288 | Rare | 优先 | thickhead, stoneskin, stonelink |
| 6924 | Heart of Rage | 8393 | Epic | 优先 | firebrand, grudge, stoneskin |
| 7203 | Hellstone Gate | 8790 | Common | 优先 | daemonshield, impervious, stoneskin |
| 7484 | Undead Lion | 9217 | Rare | 优先 | grudge, manashield, undying |
| 7703 | Xuanwu | 9664 | UltraRare | 优先 | divineshield, revered, stoneskin |
| 6051 | Chimera | 7051 | Rare | 选择器扩展 | firebrand, sturdy, arcane |
| 6174 | Wyvern | 7313 | Rare | 选择器扩展 | dragonbond, sturdy, fast |
| 6192 | Borealis | 7333 | Epic | 选择器扩展 | insulated, icearmor, icycloak |
| 6546 | Senita | 7740 | UltraRare | 选择器扩展 | indigestible, spiny, stealthy |
| 6547 | Saguaro | 7741 | Epic | 选择器扩展 | indigestible, infernalarmor, spiky |
| 6646 | Skulk Fang | 7978 | Common | 选择器扩展 | venomous, sturdy, stealthy |

排除项 **6997、7015、7375** 均保留项目原始 **Legendary（RarityIdx=5）**，完整英文条款保留，另列 `unsupportedTraitClauses`。三者 native payload 的字面标签为 `Mythic`，已如实保留并注明与项目六档索引的区别。

- **6997**：Invulnerable 的 Mana Drain、Transform、Lethal Damage 免疫边界；Lions Roar 黄宝石匹配后随机敌人 Stun。
- **7015**：前二、最弱二、最强二友军的并列/重叠规则；Enchanted Vines 绿色匹配后对随机敌人同时 Entangle 与 Faerie Fire。
- **7375**：Celestial Harvest 绿色匹配时给全部绿色友军 4 Life 的颜色筛选、触发顺序与资格边界。

具体复用文件逐名列于 JSON，入口包括 `tests/unit/stEnemyDirectDamageAcceptance.test.ts`、`tests/unit/stEnemyStatusDamageAcceptance.test.ts`、`tests/helpers/stStatusDamageHarness.ts`、`tests/unit/stEnemyRandomTargetAcceptance.test.ts`、`tests/unit/stEnemySupportAcceptance.test.ts` 与各自 fixtures。特质形状引用 `.tmp/st-next-trait-family-shapes.json`（94 codes / 39 shapes）。

静态回读通过：27 名稀有度一致，原始主动、amountOracle witness 与立绘资料未变；保留此前 27/27 立绘文件、WebP 头与目录哈希检查记录。registry 原快照为 40 条，仅为观察值，本研究未重新验收。

**新增满签 0；未运行测试。此次只写这两个 .tmp 文件，扫描范围未扩大。**
