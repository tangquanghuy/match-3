# R015 无颜色的随机摧毁／爆破宝石包含骷髅（2026-09-29，sa-P，R013-5 延伸）

1. **原生 DestroyGems / ExplodeGems 步骤没有颜色字段（无 Color1 / 选色 / 目标色）时，随机池 = 棋盘上任意宝石**，普通骷髅、末日骷髅等变体和特殊宝石都在池内：`destroyRandomGems / explodeRandomGems(..., 'all')`。依据 R013-5：骷髅也是宝石。英文「Destroy 6 Gems」「Explode [Magic + 1] Gems」「Explode 2 random Gems」都按这一条处理。
   - 摧毁到的骷髅照常造成骷髅伤害、给法力（destroy 不是 remove，R010 不适用）。
   - 计数型（UseCounterForAmount / AddForKill / AddIfEnemyHasDoom / AddForStun）只改变数量，池子不变。
2. **只有原生或英文指明颜色时才保留 `'color'`**：指定颜色、CHOSEN、LAST_TARGET、ENEMY_MOST_USED、ALLY_MOST_USED、目标颜色这几类，按颜色过滤后本来就不含骷髅。
3. 各批次头注里「「宝石」不含骷髅 → include:'color'」的旧口径以本条为准，已作废。
4. 武器生成器 `scripts/_weapon_pools.mjs` 中无颜色的随机宝石模板一律输出 `'all'`；`src/data/gowWeaponReviewedOverrides.json` 中对应原型同步修改。

本轮改动了 39 个技能：troop 6064 6075 6146 6153 6202 6366 6471 6487 6536 6555 6561 6607 6622 6758 6878 6891 6991 7165 7167 7206 7254 7359；weapon 1114 1150 1157 1274 1297–1302 1413 1440 1472 1484 1529 1600 1656。改动前 sa-A 已按此口径修过 7147 9120 9464 8134 7001 8957 7462 8823 8022 9020 7594。
