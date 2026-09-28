# R009 巨人宝石、龙宝石已存在（用户确认，2026-09-28）

引擎已有六色族特殊宝石 `giantGem`、`dragonGem`（`src/engine/types.ts`，携带归属基色 `color`），可用 `transformToSpecial(<色>, 'giantGem' | 'dragonGem', { color: <色>, count })` / `createSpecialGems` 表达。

- 原生 `ConvertGems <Color> > Giant<Color>` / `Dragon<Color>`、`CreateGems Giant<Color>` / `Dragon<Color>` 必须产出对应特殊宝石，不能是同色普通宝石。
- 队列项 `P-F1-giant-dragon-gems` 不是公共原语问题，撤回；troop:7245–7250、7440–7445 属技能定义修复，由对应车道处理（参照 L4b 已修的 7030/7270/7499 写法）。
