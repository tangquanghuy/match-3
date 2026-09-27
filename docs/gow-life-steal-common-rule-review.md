# GoW 生命窃取公共规则核查（2026-09-27）

## 验收边界

仓库存档 `data/raw/spells.gow.en.json` 中，已接入的原生 `StealLife` 步骤共对应 34 个技能 ID；其原型均走 `damage + drain`。这是**原生步骤与本项目实现的结构核对**，不是 34 项技能的整项签收，也不是 GoW 2026 年线上版本逐项确认。

## 原版线索及其限度

- [官方论坛：Life Steal versus Barrier（2017）](https://community.gemsofwar.com/t/life-steal-versus-barrier/25643)：用户记录了窃取量受目标现存生命限制，并报告当年的屏障交互。历史表现不等于现行通则。
- [官方论坛：Draakulis gain Life（2018）](https://community.gemsofwar.com/t/draakulis-gain-life-for-troops-behind-a-shield/35284)：关于「增加生命」而非「恢复到生命上限」的历史实测；具体角色、版本语境须保留。
- [官方论坛：Wight 的屏障异常（2019）](https://community.gemsofwar.com/t/fixed-wight-stealing-life-even-with-barr/57637)：工作人员明确将该角色当年的屏障互动归于遗留代码并回复已修复；仅可确证这起历史缺陷，不能泛化为所有特质、所有版本。
- [官方论坛：Deathknight 实战（2018）](https://community.gemsofwar.com/t/death-by-emperor-mid-game-deathknight-team/44160)：玩家记述 Life Siphon 在敌方护甲仍在时也可窃取生命，提供特质绕过护甲的直接历史观察；当前线上效果仍需单独核验。

本项目对「窃取生命」采用：绕过护甲；屏障吸收则不转移；转移量不超过本次目标实际损失生命；持有者当前生命与最大生命同步增加。施法伤害仍进入现有法术减伤、妖火与反射管线；这些与**所有窃取特质**交互的最新原版口径尚未独立取证，暂不作为已验收的官方一致性结论。

## 当前改动与测试

- `src/engine/skills/effects/damage.ts`：原生 `StealLife` 技能走真实伤害，按施加后、复活前的实际失血结算；多目标及散射按实际各次命中累加。
- `src/engine/skills/effects/buff.ts`：`gain` 增加当前生命和生命上限，`heal` 保持治疗行为。
- 纠正原生 `StealLife` 原型 ID `9565`、`9282`、`8566`、`7751` 的旧属性削减路径；`tests/unit/gowLifeStealRules.test.ts` 锁定 34 个已接入原型的双向结构约束与 7302 的对局。
- `src/engine/TurnEngine.ts`：特质生命窃取独立使用绕甲命中；在自复活前记录目标实际失血，结算后对持有者增长生命和上限；普通特质伤害口 `traitDamage` 不受影响。
- `tests/unit/traitFinalBatch.test.ts` 与 `tests/unit/traitMatchDamageDrain.test.ts`：覆盖回合开始、红色匹配、职业天赋 Life Siphon 的大连触发、满血增长、护甲、屏障、溢伤、敌方持有者和目标自复活后的转移量。

**签收边界：**以上属于公共规则与仓库存档路径检验，不能由测试通过自动把任何一个技能计入 2,518 项整项签收。仍需按技能分别核对目标、倍率、条件、分支、特质与线上原版来源。


