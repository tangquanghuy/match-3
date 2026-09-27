# R003 计数阈值与比例标签（协调裁定，2026-09-28）

1. `AddFor10<Color>Gems` / `MultiplyFor10<Color>Gems`：修饰名里的 10 是遗留命名，快照中所有同族英文均写 “13 or more”，以 13 为阈值（英文快照为冻结证据；社区帖 https://community.gemsofwar.com/t/if-there-are-13-or-more-gems-on-the/29347 为旁证）。
2. `Count*` 步骤的 `Amount` 为百分比：计数 = floor(总量 × Amount / 100)。`Amount 100` = [1:1]，`25` = [4:1]，`400` = [x4]，`34` 为英文 [3:1] 的原生取值，按 34% 计算（护甲 50 → 17）。英文 [a:b] 是原生百分比的显示标签，执行以原生为准（与 R001 同理）。实现若按 floor(n/3) 计算，属公共原语差异，修复后反查所有 Amount 34/33/67 等非整比例的技能。

来源：第 1 轮 L4b-6196、L6 weapon:1194/1199/1200/1201/1204、L7 troop:6320/6595（两项已按 floor(n/3) 签收，修复后需复核）。
