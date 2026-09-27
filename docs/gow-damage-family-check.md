# 溅射／散射机制族：原始步骤与组装段核对

来源：仓库保存的原始步骤快照及账本所记录的技能原型（已排除自设部队）；非实时重新编译工作树；账本指纹 `40b01f972eaecffaf9afcf60a47fbe4fd4fa6da384e54e82d4fd5834deb93ac4`。这不是 GoW 实时版本核验。

涉及 204 项：单段基础形状相符 171；多段待复核 32；来源步骤形态待解释 1；直接冲突 0。

基础形状仅核范围、邻位比率、真实伤害与简单目标，不涵盖数值、施法实战和整项签收。多段须对照原文逐段检查重复选敌、顺序、展开段数。

| 类型 | 实体 | 技能 ID | 待核点 |
|---|---|---:|---|
| complex-needs-review | troop:6116 | 7208 | 原始 2 段、组装 1 段；需复核多段、重复抽签与顺序 |
| complex-needs-review | troop:6177 | 7316 | 原始 2 段、组装 1 段；需复核多段、重复抽签与顺序 |
| complex-needs-review | troop:6268 | 7413 | 原始 2 段、组装 1 段；需复核多段、重复抽签与顺序 |
| complex-needs-review | troop:6366 | 7518 | 原始 2 段、组装 1 段；需复核多段、重复抽签与顺序 |
| complex-needs-review | troop:6574 | 7778 | 原始 2 段、组装 2 段；需复核多段、重复抽签与顺序 |
| complex-needs-review | troop:6627 | 7945 | 原始 2 段、组装 1 段；需复核多段、重复抽签与顺序 |
| complex-needs-review | troop:6746 | 8116 | 原始 2 段、组装 2 段；需复核多段、重复抽签与顺序 |
| complex-needs-review | troop:6770 | 8160 | 原始 3 段、组装 1 段；需复核多段、重复抽签与顺序 |
| complex-needs-review | troop:6816 | 8220 | 原始 2 段、组装 2 段；需复核多段、重复抽签与顺序 |
| complex-needs-review | troop:6870 | 8294 | 原始 4 段、组装 1 段；需复核多段、重复抽签与顺序 |
| complex-needs-review | troop:7006 | 8534 | 原始 2 段、组装 2 段；需复核多段、重复抽签与顺序 |
| complex-needs-review | troop:7113 | 8656 | 原始 2 段、组装 1 段；需复核多段、重复抽签与顺序 |
| complex-needs-review | troop:7259 | 8854 | 原始 2 段、组装 1 段；需复核多段、重复抽签与顺序 |
| complex-needs-review | troop:7262 | 8881 | 原始 3 段、组装 1 段；需复核多段、重复抽签与顺序 |
| complex-needs-review | troop:7516 | 9280 | 原始 3 段、组装 1 段；需复核多段、重复抽签与顺序 |
| complex-needs-review | troop:7571 | 9367 | 原始 3 段、组装 1 段；需复核多段、重复抽签与顺序 |
| complex-needs-review | troop:7574 | 9370 | 原始 3 段、组装 1 段；需复核多段、重复抽签与顺序 |
| complex-needs-review | troop:7576 | 9372 | 原始 4 段、组装 1 段；需复核多段、重复抽签与顺序 |
| complex-needs-review | troop:7604 | 9483 | 原始 3 段、组装 1 段；需复核多段、重复抽签与顺序 |
| complex-needs-review | troop:7610 | 9493 | 原始 2 段、组装 2 段；需复核多段、重复抽签与顺序 |
| complex-needs-review | troop:7690 | 9659 | 原始 3 段、组装 1 段；需复核多段、重复抽签与顺序 |
| complex-needs-review | troop:7726 | 9719 | 原始 3 段、组装 1 段；需复核多段、重复抽签与顺序 |
| complex-needs-review | troop:7742 | 9727 | 原始 2 段、组装 2 段；需复核多段、重复抽签与顺序 |
| complex-needs-review | troop:7802 | 9843 | 原始 2 段、组装 2 段；需复核多段、重复抽签与顺序 |
| complex-needs-review | troop:7860 | 9933 | 原始 4 段、组装 1 段；需复核多段、重复抽签与顺序 |
| complex-needs-review | troop:7861 | 9935 | 原始 3 段、组装 1 段；需复核多段、重复抽签与顺序 |
| complex-needs-review | troop:7862 | 9937 | 原始 3 段、组装 1 段；需复核多段、重复抽签与顺序 |
| complex-needs-review | troop:7932 | 9880 | 原始 3 段、组装 1 段；需复核多段、重复抽签与顺序 |
| source-shape-needs-review | weapon:1156 | 7563 | 原始步骤无专用溅射／散射类型，组装结果有；需结合原文及相邻伤害步骤核对 |
| complex-needs-review | weapon:1278 | 8154 | 原始 2 段、组装 1 段；需复核多段、重复抽签与顺序 |
| complex-needs-review | weapon:1461 | 8762 | 原始 2 段、组装 2 段；需复核多段、重复抽签与顺序 |
| complex-needs-review | weapon:1552 | 9204 | 原始 2 段、组装 2 段；需复核多段、重复抽签与顺序 |
| complex-needs-review | weapon:1561 | 9112 | 原始 2 段、组装 2 段；需复核多段、重复抽签与顺序 |

逐实体对照：`artifacts/gow-skill-audit/damage-family-check.json`。复跑：`node scripts/check-gow-damage-family.mjs`；检查是否过期：`node scripts/check-gow-damage-family.mjs --check`。
