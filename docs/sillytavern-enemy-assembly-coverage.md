# 敌人机制自动组装覆盖报告

由 `node scripts/st-enemy-assembly-coverage.mjs` 自动生成；`--check` 检查各原始 rarity 和五 rank 的结构组装阈值（默认 90%，只允许提高）。

遍历完整 TROOPS：1821 条；等级 20，难度 1。结构检查：达标。

- **mapped**：真实肖像、适配主动与全部有效原生特质均有结构映射；专属省略有记录。
- **compiled**：显式 assembly 编译成功、模块与输入一致且 JSON restore 完整一致。
- **structurallyCovered**：mapped + compiled + 规则检查完整且无共享未知规则 + 主动和全部保留特质描述审计完整。
- **behaviorAcceptance**：not-assessed；本报告没有执行行为验收，签名仅是编译元数据。
- **denominator**：完整 TROOPS；按 SOURCE_TROOPS 原始 rarity 与 rarityIdx 映射五 rank；专属省略、缺肖像、编译失败和未知规则均保留分母。

**此报告不声称机制全部通过行为测试。结构映射覆盖、编译覆盖与行为验收是三项不同结论；没有执行行为测试，也没有使用逐来源签名或历史签收推断通过。**

完整逐条 assembly、专属省略、描述审计、目标、依赖与缺口见 `data/st-enemy-assembly-coverage.json`。所有失败均保留在分母中；空档位覆盖率为 —。

## 总计

| 档位 | total | mapped | compiled（含 restore） | 未知规则影响条目 | 未知规则数 | 描述完整 | 结构组装覆盖 | 缺口 | 达标需覆盖 | 覆盖率 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| all | 1821 | 1800 | 1800 | 0 | 0 | 1800 | 1800 | 21 | 1639 | 98.8% |

## 原始 rarity

| 档位 | total | mapped | compiled（含 restore） | 未知规则影响条目 | 未知规则数 | 描述完整 | 结构组装覆盖 | 缺口 | 达标需覆盖 | 覆盖率 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Common | 120 | 120 | 120 | 0 | 0 | 120 | 120 | 0 | 108 | 100.0% |
| Uncommon | 242 | 242 | 242 | 0 | 0 | 242 | 242 | 0 | 218 | 100.0% |
| Rare | 357 | 357 | 357 | 0 | 0 | 357 | 357 | 0 | 322 | 100.0% |
| UltraRare | 608 | 596 | 596 | 0 | 0 | 596 | 596 | 12 | 548 | 98.0% |
| Epic | 258 | 252 | 252 | 0 | 0 | 252 | 252 | 6 | 233 | 97.7% |
| Legendary | 236 | 233 | 233 | 0 | 0 | 233 | 233 | 3 | 213 | 98.7% |

## 五 rank

| 档位 | total | mapped | compiled（含 restore） | 未知规则影响条目 | 未知规则数 | 描述完整 | 结构组装覆盖 | 缺口 | 达标需覆盖 | 覆盖率 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 杂兵 | 362 | 362 | 362 | 0 | 0 | 362 | 362 | 0 | 326 | 100.0% |
| 精锐 | 357 | 357 | 357 | 0 | 0 | 357 | 357 | 0 | 322 | 100.0% |
| 首领 | 608 | 596 | 596 | 0 | 0 | 596 | 596 | 12 | 548 | 98.0% |
| 领主 | 258 | 252 | 252 | 0 | 0 | 252 | 252 | 6 | 233 | 97.7% |
| 传奇 | 236 | 233 | 233 | 0 | 0 | 233 | 233 | 3 | 213 | 98.7% |

## 共享机制 family → 受影响条目数

| family | 使用条目数 | 受未知规则影响条目数 | 缺失规则 |
| --- | ---: | ---: | --- |
| active:damage | 1099 | 0 | — |
| active:gem | 921 | 0 | — |
| trait:aura | 882 | 0 | — |
| trait:immunity | 819 | 0 | — |
| trait:damageReduction | 650 | 0 | — |
| active:status | 496 | 0 | — |
| active:gemCreate | 413 | 0 | — |
| trait:buff | 412 | 0 | — |
| active:buff | 397 | 0 | — |
| trait:status | 348 | 0 | — |
| active:gemTransform | 219 | 0 | — |
| active:gemExplode | 190 | 0 | — |
| trait:gemCreate | 190 | 0 | — |
| trait:mana | 188 | 0 | — |
| trait:manaLink | 186 | 0 | — |
| active:reduce | 176 | 0 | — |
| active:extraTurn | 170 | 0 | — |
| active:lifeGain | 168 | 0 | — |
| active:gemDestroy | 144 | 0 | — |
| trait:skullMultiplier | 140 | 0 | — |
| active:trueDamage | 126 | 0 | — |
| active:summon | 118 | 0 | — |
| trait:summon | 114 | 0 | — |
| trait:dodge | 113 | 0 | — |
| trait:economy | 112 | 0 | — |
| active:branch | 107 | 0 | — |
| trait:storm | 96 | 0 | — |
| trait:untargetable | 93 | 0 | — |
| trait:regen | 85 | 0 | — |
| active:oneOf | 77 | 0 | — |
| active:manaDrain | 75 | 0 | — |
| active:splash | 65 | 0 | — |
| active:gainEconomy | 59 | 0 | — |
| active:manaGain | 57 | 0 | — |
| trait:gemTransform | 54 | 0 | — |
| active:devour | 51 | 0 | — |
| trait:reflect | 49 | 0 | — |
| active:steal | 47 | 0 | — |
| active:reposition | 45 | 0 | — |
| active:storm | 39 | 0 | — |
| active:gemRemove | 32 | 0 | — |
| active:cleanse | 31 | 0 | — |
| active:choose | 30 | 0 | — |
| active:execute | 30 | 0 | — |
| active:drain | 29 | 0 | — |
| trait:mastery | 25 | 0 | — |
| active:transformTroop | 24 | 0 | — |
| trait:armorPierce | 24 | 0 | — |
| trait:gemDestroy | 24 | 0 | — |
| active:dispel | 23 | 0 | — |
| trait:randomStatus | 23 | 0 | — |
| active:randomStatus | 22 | 0 | — |
| trait:damage | 22 | 0 | — |
| active:randomStat | 18 | 0 | — |
| active:escapeChance | 15 | 0 | — |
| active:sacrifice | 14 | 0 | — |
| trait:manaDrain | 13 | 0 | — |
| trait:reduce | 12 | 0 | — |
| trait:mode | 10 | 0 | — |
| active:shuffleTeam | 9 | 0 | — |
| active:heal | 8 | 0 | — |
| active:shuffleBoard | 8 | 0 | — |
| active:stealGold | 8 | 0 | — |
| trait:gemExplode | 8 | 0 | — |
| active:manaBurn | 5 | 0 | — |
| active:summonCopy | 4 | 0 | — |
| trait:statConvert | 4 | 0 | — |
| trait:devour | 3 | 0 | — |
| active:spendEconomy | 2 | 0 | — |
| active:swapPositions | 2 | 0 | — |
| trait:cleanse | 2 | 0 | — |
| trait:manaSteal | 2 | 0 | — |
| trait:skullFromArmor | 2 | 0 | — |
| trait:execute | 1 | 0 | — |
| trait:lifeSteal | 1 | 0 | — |

## 未知规则传播

同一 family 中任一条目报告缺失规则，会传播到该 family 的全部消费者。reportedBy 与受影响 enemyIds 分开保存；没有 family 的未知规则仅按实际报告条目统计。

| 规则 | family | 直接报告数 | 受影响条目数 |
| --- | --- | ---: | ---: |
| — | — | 0 | 0 |

## 阈值结果

各原始 rarity 与五 rank 的结构组装覆盖均达到阈值。
