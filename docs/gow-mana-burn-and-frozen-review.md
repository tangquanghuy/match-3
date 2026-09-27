# Mana Burn、Frozen 与状态交互限定复核

日期：2026-09-26。本文记录修复与限定测试，不是全部技能或全局共享规则的签收。

## 来源

- 原始技能执行步骤与英文快照：`data/raw/spells.gow.en.json`、`data/raw/troops.gow.en.json`、`artifacts/gowhead-weapons/weapons.json`。这些是项目保存的资料，不标作官方实时版本。
- 官方 2.0 公告：`artifacts/gow-skill-audit/gold-primary-sources/official-mana-burn-2-0.html`。Mana Burn 的额外伤害根据目标当前 Mana 计算，不耗尽目标 Mana。
- 官方 3.2 讨论：`official-3-2-mana-burn-submerge.json`。全体 Mana Burn 遵循 Submerge 的群体伤害保护。
- 官方状态帮助页：`official-status-effects.html`。Curse 可以施加于 Impervious，Invulnerable 保留保护；Blessed/Curse 互消；Stun 禁用特质；Frozen 限制额外回合而非禁止行动。
- 官方 Sirrian 的 Frozen 公告：`official-frozen-1-0-9.json`，帖子 3612 第一楼。分别规定匹配颜色、首位骷髅匹配和施法者被冻结时的额外回合抑制；历史公告不充当当前全部战斗规则认证。

## 实际修复

| 技能ID | 修复范围 |
|---|---|
| 7328、7332、7652、8897、9745、7412 | 每目标普通伤害增加其当前 Mana，不清空 Mana；后两部队保持玩家选择分支。 |
| 7652 / Skadi | 冻结前两名敌人、Mana Burn、原目标反序移至队尾、召唤；阵亡目标不替换成未受伤者。 |
| 7412 / Dragon Fire | 击杀后转化施法者而非阵亡敌人；保留既有 Dragon 池，池排除与等级尚待独立规则核实。 |
| 7800 / Deathspire | 全敌伤害采用项目现有 Math.round(Magic/2+2)，每个存活敌方 Castle 类型高塔增加 8。Leonis Tower 属 Castle，名为 The Tower 的单位属 Construct；按类型而非名称计数。 |

共用规则修复：首次 Curse 可对 Impervious 生效；Stun 抑制普通状态免疫及法术减伤，Invulnerable 仍保护；Blessed 与 Curse 双向互消；Frozen 单独存在时仍允许施法与骷髅攻击。状态说明与旧错误测试同步修正。

## 测试与再生成

- `tests/unit/gowManaBurnTowerAudit.test.ts`：216 项。包含真实施放、双方阵营、多目标、Mana 保留、Submerge、免疫、Curse/Stun/Blessed、Skadi 原目标队序、施法者转化与 Castle 计数。
- 玩家选择分支、武器原型及 metadata、状态测试另有专项覆盖。
- 武器 metadata full=710 / partial=8，是编译完整性分类，不是原版验收结果。
- `scripts/check-gow-regeneration.mjs` 保护 114 把武器，`gowRegenerationAudit` 共 124 项，防止生成器覆盖本批与既有修复。

## 未决边界

1. 奇数 Magic 的半魔法取整沿用项目 Math.round；native 的 0.5 不独立证明原版取整方式，仍待核实。
2. Dragon Fire 转化池、等级、变形免疫以及 Skadi 召唤池等未完成整项签收。
3. Stun 本批只验证状态免疫与法术减伤，不声称所有特质被完整抑制。
4. Frozen 匹配色、首位存活部队骷髅匹配、被冻结施法者的法术额外回合抑制已接入；双方真实行动生命周期由 `tests/unit/castTurnLifecycle.test.ts` 验证。
5. 2026-09-27 用户新裁定覆盖免费施法：普通施法交接行动权，复用交换的完整回合开始状态、风暴与日志流程；额外回合当次生效、不积存。旧约定已更新，详见 `docs/gow-cast-turn-lifecycle-review.md`。
6. 火枪手 7004 新增 120 项逐目标真实施放测试；施法回合消耗已修复；分数减伤取整边界仍待原版独立核实，因此仅作为 draft 复核，不签收整项。

全量回归凭证由 `node scripts/verify-gow-snapshot.mjs` 在当前文件指纹下生成；历史回归数字不自动沿用。
