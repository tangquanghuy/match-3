# 寒冰阔剑／风暴阔剑：逐项限定复核（2026-09-26）

> Review update (2026-09-27): weapon:1008 and weapon:1023 now have explicit complete-snapshot reviews in `data/audit/gow-skill-reviews.json`. The historical draft notes below describe the earlier partial state, not their current acceptance. Evidence: official 9.4 patch, stored English/native records, official status guide, firsthand player report for fixed-slot Stealthy (not a developer ruling), `tests/unit/gowFirstTwoWeaponsWholeReview.test.ts` (130 cases), and full fingerprint-bound verification receipt. Neither weapon is certified against all future live GoW versions.


## 来源与差异

- 官方 9.4 补丁发布于 **2026-09-09**，明确 Icy Glaive 和 Glaive of Storms 改为伤害前两名敌人，移除红宝石清除和相应伤害增强。风暴阔剑费用改为9、基础伤害改为5。
- 官方 HTML 原件：`artifacts/gow-skill-audit/gold-primary-sources/update-9-4-patch-notes.html`；来源 `https://gemsofwar.com/update-9-4-patch-notes/`，抓取2026-09-26。正文日期及改动列表原样保存。
- 英文快照：`artifacts/gowhead-weapons/weapons.json`，1008 / spell7074 与1023 / spell7089。
- native 快照：`data/raw/spells.gow.en.json`，两项均仅一段 `Damage@FirstTwoEnemies`，倍率1、基础分别3/5、费用分别8/9。
- 旧中文快照落后于上述更改，导致两项编译登记虽为full，却实装了清红宝石＋单体伤害。full不是原版保真判定。

## 已修复

1. 实际技能只执行前两名存活敌人各 `魔法+3` / `魔法+5` 普通伤害，不清宝石、不读红宝石加成。
2. 修改最终批次、派生武器文案、项目显示覆盖与派生pool；原始英文/中文/native快照保持原样。
3. 描述纠正模块由池编译器与武器构建器共用。内存重建覆盖技能原型、武器描述，不执行全量重写。
4. 差异检测器新增两项旧原型反例，避免此类差异再被full登记漏过。

## 行为证据

`tests/unit/gowFirstTwoWeaponAudit.test.ts` 150项：真实出战别名、数值别名、费用/颜色、左右双方、魔法0/1/11/20、护甲0/10、1–4敌人、不调用选择器、不清红宝石、不新增状态/资源/召唤/额外回合信号、死位跳过、前敌阵亡不追加第三目标、屏障、织网、法力不足。

`gowRegenerationAudit` 另证生成器原型与当前注册一致，派生武器文案保持修复。

## 整项签收仍待补齐

- 普通施法的回合消耗已按2026-09-27用户新裁定修复；本实体双方真实施法测试检查换手，另有42项行动生命周期专项。此项阻塞已解除，其余维度继续独立验收。
- 共享 Submerged/Stealthy、法术抗性及妖火的目标筛选/取整与死亡响应完整规则，仍需独立来源逐项验证。测试没有把现有错误行为当成原版预期。
- 7074 native 有 `UseCounterForAmount:true` 但无Count步骤；明确来源字段，未凭该字段额外猜出增幅。
- 官方补丁在别的武器（如Sword of Heroes）所写费用与仓库native快照存在潜在版本差异，需独立逐项比较，不能把本页变成全部2518项最新版认证。

本复核的两项登记为draft。局部条款已修复，不等于全部12维度最终通过。
