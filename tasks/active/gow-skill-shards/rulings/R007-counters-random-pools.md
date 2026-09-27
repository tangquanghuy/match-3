# R007 计数分步取整、随机属性池、避开上一目标（协调裁定，2026-09-28）

1. **多个 Count 步骤分别取整**：原生每个 `Count*` 步骤独立计数，计数 = floor(该来源总量 × Amount / 100)，再相加。不在合并后统一取整。已按合并取整签收的项（如 troop:6320）修复后需复核。来源：L3-014。
2. **随机属性（DecreaseRandom / StealRandom / IncreaseRandom）**：池为四项技能 Attack、Armor、Life、Magic，等概率。减少 Life 时直接减当前生命（不经护甲／屏障），与现有“减少属性”一致。依据：英文 “random Skill”、游戏的四项 Skill 定义、已入库 `community-2017-11-28-quasit-random-skill-life.json`。来源：L2-decrease-random-pool。
3. **`RandomPrefNotPrev*`**：只避开紧挨着的上一个目标；只剩该目标时可以重复命中。R006-C3 仅用于没有该原生步骤的情况。来源：L5-015、L1-7793、L1-6305。
