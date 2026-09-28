# R014 用户裁定（2026-09-28）

1. **troop:7000 Baihu（8503）按原版顺序**：原生 `CountSet 1 → CountGems Yellow → CreateGems 3 Yellow → Damage`。黄宝石在创造前计数，新造的 3 颗不计；开头 `CountSet 1` 的 1 **不加进计数**。实现：新计数源 `castStartBoardGems {color}`（施法开始时的该色宝石数）。例：魔法 10、场上原有 9 颗黄 → 13 + floor(9/2) = 17。
2. **签收失效规则放宽**：只有直接改动该技能的记录（`kind` 为 assembler / data / test）才让已有签收失效。公共原语改动（`kind: primitive`）会列出所有「可能受影响」的技能，不再逐个作废签收；这类改动的行为影响由 golden 回放（gowCastGolden）和全量测试回执把关——golden 有变化时测试会失败，必须重新 approve。
