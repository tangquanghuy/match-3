# 下潜 Submerged：GoW 官方规则专项复核（2026-09-26）

## 独立依据
- GoW 官方支持中心《All status effects and immunity Traits》：Submerged 回避**针对整队的法术伤害**，官方示例包括「all troops」和「split randomly amongst」。单体法术指定不是其免疫对象。
  原文地址：https://infinityplus2.freshdesk.com/support/solutions/articles/150000208274-all-status-effects-and-immunity-traits
- 官方历史补丁：https://gemsofwar.com/3-2-5-patch-notes/ 说明下潜防 Mana Burn 与群体伤害特质；https://gemsofwar.com/4-3-update/ 表示下潜回避 AoE 伤害会显示为 0。群体**特质**和 Mana Burn 实现仍需另立逐项审计。
- 本地保存官方支持页原始 HTML：`artifacts/gow-skill-audit/gold-primary-sources/official-status-effects.html`。仅规则证据，不能视作对 2,518 个技能的直接签收。

## 已更正
- 目标选择：下潜不再仿照隐匿特质排除单体指定；整队目标模式仍包含下潜者，防护由伤害结算判断。
- 当伤害段目标是 `enemyAll`/`allyAll`、且伤害作用于整队时，下潜者不受到该段的伤害。不会消耗屏障、不会反弹或触发受伤/阵亡；非下潜者如常命中。
- 散射随机分配维持完整原目标池并先掷出份额；下潜者的份额回避，不转嫁队友。其他状态段和增益段不因下潜被屏蔽。
- 单体、位置切片、多个独立随机单体、溅射等非整队伤害维持可命中；其中宽范围事件标签不能当作免疫判定。
- 技能提示已更新；`tests/unit/gowSubmergedSpellDamageAudit.test.ts` 提供单体、整队、散射、位置／多波、屏障／反射和隐匿回归验证。

## 保留问题
- 官方对「整队伤害」中的 Mana Burn、群体特质，以及特殊法术的优先顺序，需要另立证据／真实战斗入口测试。当前专项测试不是 2,518 项逐技能最终验收。
- 原先 `enemyBelowTarget` 用下潜目标作位置切片免疫的测试已经改按官方适用范围断言；只覆盖部分编队的法术不是「全队」法术。
