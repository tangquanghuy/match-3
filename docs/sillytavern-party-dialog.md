# 酒馆当前队伍准备弹窗

`src/sillytavern/partyDialog.ts` 提供独立宿主弹窗，使用现有 `prepareCurrentParty` 转换人物与羁绊数据。

```ts
import { preparePartyDialog } from './partyDialog';

const prepared = await preparePartyDialog({
  hostWindow, // 酒馆宿主 Window，DOM 与 IndexedDB 均属于此窗口
  service,    // StHostService
  mode: 'replay', // 'story' 使用当前生命；'replay' 使用独立满生命
  signal: controller.signal, // 可选
});
if (prepared) {
  // prepared.party: CombatantSnapshot[]；顺序就是玩家选择的出场顺序。
  // prepared.source: HostSnapshot; structuredClone(final.snapshot).
  // 调用方继续创建剧情/再现战斗。
}
// 取消、Escape、AbortSignal 或宿主 pagehide 返回 undefined。
```

模块导出 `PreparePartyDialogOptions`、`PreparedDialogParty` 和 `preparePartyDialog`。调用方负责启动战斗；此模块负责准备、确认和保存。读取/写入失败显示在弹窗中，可重新读取或取消。打开时就已中止的调用直接返回 `undefined`，不挂载 DOM。

## 操作与持久化

- 选择主角和当前同行同伴，队伍保持 1–4 人，主角必选，可调整出场顺序。候选、来源问题、宿主生命/等级/AC/攻击次数、转换后的战斗数值、当前装备、武器、颜色、技能和法力消耗均可查看。
- 主角无主手武器时使用真实 `gw_KnightsSword`（source 1000、spell 7066、蓝色、法力 3）。已有主手装备需手动登记对应目录武器，不按叙事名称猜测。
- 同伴缺少 `三消.颜色` 时，从转换模块提供的一色/双色候选选择，再调用 `service.initializeCompanions`。颜色经宿主确认后重读显示；此操作立即写回，取消弹窗也会保留已确认的颜色。
- 同伴基础主动从真实适配配方候选中登记。已学能力只列出当前存档已学且存在真实映射的能力，可恢复基础主动。缺少技能映射的已学能力显示必要提示，不编造可用配方。
- 无当前存档时显示“创建当前聊天存档”，玩家显式创建后继续准备。队伍草稿在最终确认前仅留在弹窗中。
- 确认时以仓库最新 revision 保存 `partyPreparation` 和现有 `equippedAbilities`，保留其他字段及同期战果/余额。并发修改队伍或已学能力会载入新设置并要求重新核对；存档事务的版本冲突显示错误，可重新读取后重试。
- 成员更名/删除造成的失效选择与能力引用需显式移除，不静默迁移到其他人物。主角的误装已学能力可显式清除。

可选存档字段（保存版本维持 1）：

```ts
partyPreparation?: {
  memberRefs: string[]; // JSON pointer，含 /人物，一至四个且不重复
  baseAbilities: Record<string, string>; // 同伴 memberRef -> 已注册适配 abilityId
  weaponBindings: Record<string, string>; // equipmentRef -> 真实目录 gw_* ID
}
```

`validateSave` 严格检查该字段的完整形状、未知字段、成员数量/唯一性、主角存在、JSON pointer 转义、基础能力配方和目录武器 ID。成员及装备是否存在由准备时的宿主快照验证，便携存档校验不假设当前宿主角色。配置映射可以保留尚未选入队伍的角色和旧装备登记；只有当前实际装备影响出战。旧档没有此字段时正常读取，不隐式补写。已学装配继续只存 `equippedAbilities`，并沿用已有“必须已学”的校验。

## 确认与生命周期

确认前重读宿主快照和存档，比较聊天、存档、消息、swipe、指纹以及实际 `statData`。变量改变会刷新面板并要求再次确认，避免按旧面板直接进入。保存事务完成后还会再次读取并验证，覆盖 IndexedDB 提交期间的宿主变化。聊天/存档切换阻止确认和颜色初始化；返回前再次执行真实队伍转换。

弹窗使用宿主文档的原生 modal dialog 和 Shadow DOM 隔离样式，支持键盘取消、焦点恢复、窄屏滚动及中止清理。读取中取消后忽略迟到的异步结果。已发起的宿主写入或已提交事务保持其真实结果；取消不回滚已确认颜色，也不撤销已经完成的存档事务。

## 测试与覆盖边界

- `tests/unit/stPartyDialog.test.ts`：旧档兼容、配置往返、严格错误输入、真实配方/武器和现有已学装配校验。
- `tests/e2e/stPartyDialog.spec.ts`：真实浏览器 DOM、宿主适配器和 IndexedDB；默认入口不传 `prepareReplay`、默认骑士之剑、1–4 人、排序、颜色写回、基础/已学装配、重新打开、取消/中止、无存档创建、陈旧来源、切聊天、失效引用、同期更新与窄屏布局。

本弹窗沿用 `partyPreparation.ts` 的转换边界：尚未接入 ST 原生技能/效果文本执行、临时生命吸收池、族群身份、武器淬炼及词缀；剧情存在临时生命等选定角色来源问题时阻止确认。数值转换的平衡标定状态保留在底层与转换文档中，操作界面不重复展示实现元数据。装备展示不会将尚未支持的词缀/品质效果推定为战斗增益。现有颜色字段格式本身有错时，宿主服务会在读取阶段报错，弹窗显示该来源错误，需先修正宿主数据。

读取、写回与创建入口均使用现有服务，本模块没有修改 `hostEntry`、`hostService`、adapter，也不修改战斗结算或奖励。

`PreparedDialogParty` 保留 `party: CombatantSnapshot[]`，新增 `source: HostSnapshot`：它是确认前最后一次重读并验证通过的宿主快照的独立深拷贝，供调用方传入 `expectedSnapshot` 做启动前一致性校验。能力候选显示真实 `troop.spell.name`（空名回退到“能力 + 技能编号”），同机械配方、颜色和消耗的多来源保留一项，保持现有 `abilityId` 与已学装配兼容。
