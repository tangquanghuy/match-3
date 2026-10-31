# 当前酒馆队伍准备模块

实现位于 `src/sillytavern/partyPreparation.ts`，只读 `HostSnapshot.statData` 和显式传入的准备配置，不访问 DOM、宿主 API、IndexedDB、发奖或 outbox。主线程负责 UI、持久化、重新读取和冻结战斗请求。

## 导出 API 与接线

```ts
import {
  prepareCurrentParty, HERO_MEMBER_REF, companionMemberRef, equipmentRef,
  partyAbilityChoices, damageDiceExpectation,
  PARTY_CONVERSION_VERSION, DEFAULT_PARTY_CONVERSION,
} from './partyPreparation';

const allyRef = companionMemberRef('同行者姓名');
const prepared = prepareCurrentParty(snapshot, {
  memberRefs: [HERO_MEMBER_REF, allyRef], // 1–4 人，主角必选，可调整顺序
  save, // 可选；读取当前聊天的 learnedAbilityIds / equippedAbilities
  baseAbilities: registeredCompanionBaseAbilities, // memberRef -> active:v1:...
  weaponBindings: registeredWeaponBindings, // equipmentRef -> gw_...
  equippedAbilities: pendingUiLoadout, // memberRef -> 已学 active:v1:...；null 恢复基础能力
  mode: 'story', // replay 使用本场独立满血快照
});

// UI 直接读取：
// prepared.candidates: 人物、同行状态、当前穿戴装备、错误、有效角色快照、来源面板
// prepared.initializationChoices: 缺颜色 / 基础能力 / 武器绑定时的真实候选
// prepared.issues: 当前选择或全局配置中阻止开战的问题
// prepared.conversion: 版本、classic/new 模式、本次系数、uncalibrated 状态
if (prepared.ready) {
  const playerTeam = prepared.party;
  // 主线程组成 BattleRequest，并继续调用现有 prepareStBattle(request)。
}
```

未传 `memberRefs` 时只选主角。所有羁绊条目均返回卡片候选；只有 `同行誓约 === true` 的同伴可出战。未选角色的字段问题留在该候选自己的 `issues`，不会阻止主角单独出战。有效选择中出现一个问题，整体 `party` 就为空，防止部分队伍被误用。

成员引用采用 statData JSON Pointer：主角 `/人物`；同伴 `companionMemberRef(name)`，其中 `/`、`~` 分别转义为 `~1`、`~0`。装备引用为 `equipmentRef(memberRef, 装备列表的键)`。羁绊列表目前以名字作为键，改名后视为新引用；旧能力装配引用会报错，宿主应显式迁移。

### 缺省初始化

同伴已存在 `三消.颜色` 时逐项严格校验并原样沿用，包括颜色顺序。缺省时返回 `kind: 'colors'`、目标路径和完整 21 个单色/双色集合；模块不选择、不随机、不写入，也不读取本地存档里的镜像颜色代替真实宿主值。UI 把选择交给宿主现有颜色写入接口，读取新的 HostSnapshot 后再调用准备。

同伴基础能力通过 `baseAbilities` 显式登记。缺省时返回 `kind: 'baseAbility'` 和已有适配目录的候选。`partyAbilityChoices()` 也可单独用于下拉列表；其中 `abilityId` 用于保存，`skillId` 用于战斗。候选为真实 `adaptedPrototype + abilityIdentity` 配方，不推测叙事技能文本对应哪项三消能力。当前尚未提供职责/身份登记，因此候选未按角色职责自动缩小。

已学能力只接受当前聊天存档 `learnedAbilityIds` 已拥有的 `active:v1:*`，并解析到真实 `st:<spellId>`。UI 的 `equippedAbilities` 覆盖已保存装配；显式 `null` 恢复基础能力。装配改变主动效果与法力成本，同伴颜色始终取宿主。`sourceManaColors` 是原配方身份的一部分，仅用于追溯，不覆盖人物颜色。原生 ST 技能树、资源技能、羁绊技能文字不会被当成战斗注册 ID。

### 当前装备和主角武器

当前装备优先使用严格布尔 `装备箱 === false`；旧数据仅在缺少该字段时接受 `穿戴状态: 已装备/未装备`。候选返回所有实际穿戴装备的独立副本。主手武器按 `类型: 武器`、`部位: 主手` 识别，多件主手报错。

无主手武器时固定使用现有目录骑士之剑：`gw_KnightsSword`、source ID `1000`、spell `7066`、`Blue`、法力成本 `3`；没有把目录四维加进 ST 人物面板。有主手武器时要求以装备引用传入稳定 `weaponBindings`；缺省返回真实已注册目录代码候选，不从装备中文名猜测绑定。主角主动能力跟随武器，不接受同伴魂片装配来覆盖它。武器绑定的持久化与品质适配仍由后续宿主登记流程处理。

技能合法性检查基于现有 `registerSkillLibrary` 和与 `registerAdaptedCatalog` 相同的适配原型/ID 生成规则；模块不修改注册表实现。回归测试既检查整队通过 `prepareStBattle`，也实际施放默认武器，检查产生伤害事件。

## 字段读取与转换版本

`PARTY_CONVERSION_VERSION = st-party-v2`（2026-10-31 起，替换 st-party-v1）。三消数值使用三消自己的等级曲线，AIRP 数值只做小幅修正；结果仍返回 `status: uncalibrated`，表示尚未在真实酒馆里做体验标定。宿主冻结快照时应一并保留 `conversion` 元数据。已冻结的待完成剧情战斗沿用当时的快照，不重新换算。

- 主角来自 `人物`，名字来自 `人物.名称`；同伴来自 `羁绊列表`，名字来自条目键。
- 严格读取等级 1–100 整数、生命上限、当前生命、临时生命、六维整数；数值字符串、NaN、Infinity、负数和越界报错。
- **基础值由等级决定**：`partyBaseStats(等级)` 取原游戏稀有度 2（`PARTY_REFERENCE_RARITY`，普通难度阵容中最常见的稀有度）全部非不朽兵种在该等级的 `troopStatsAtLevel`，四项各取中位数。敌人用同一条兵种曲线，所以同等级的我方和敌人起点相当。参考值（生命/攻击/护甲/法强）：Lv1 5/3/1/1，Lv20 23/15/9/9，Lv50 43/21/24/12，Lv95 73/30/46/18。
- **AIRP 属性只做小幅修正**：六维和 AC 超过 30 按 30 计（`PARTY_ATTRIBUTE_CAP`）。调整值 = `floor((min(属性,30) - 10) / 2)`，范围 −5～+10。
  - 生命 × (1 + 1% × 体质调整值)
  - 攻击 × (1 + 1% × max(力量, 敏捷) 的调整值)
  - 法强 × (1 + 1% × max(智力, 感知, 魅力) 的调整值)
  - 护甲 × (1 + 0.5% × (min(AC,30) - 10))
  - 每项系数范围 0.95～1.10。模拟中全部 30 的效果约等于高 5 级，±10 级约为 ±12～22 个百分点的掉血差，等级是主导因素。
- AC 优先读取现值。羁绊 schema 没有 AC 字段时复用辅助脚本规则：10 + 已穿戴普通至神话防具/盾牌的最高品质加值 1–7，龙精种缺省 18；特殊槽不参与。
- AIRP 的生命上限、武器面板、攻击次数、物理/魔法减伤和装备属性加成不再决定三消数值。`系统配置.战斗数值模式` 仍校验取值（classic/经典、new/新版），但不影响换算。
- `conversion` 的 `hpScale/attackScale/armorScale/magicScale` 仍是整体倍率，默认 1，用于后续标定。
- 最终输出遵守现有契约 HP 1–9999、攻击/护甲/法强 0–999、法力成本 1–100；越界报错，无逐角色截断。
- 剧情入场生命 `initialHp = storyInitialHp(三消HP上限, ST当前HP, ST最大HP)`：按比例取整，存活角色至少 1（`src/sillytavern/storyHp.ts`，剧情回写校验用同一规则）。三消 HP 上限较小（20 级约 23），只有比例跨越边界，战后按比例写回 `当前生命值`。原生当前生命为 0 阻止入场。replay 使用独立满血快照，不处理或扣除 ST 当前/临时生命。
- 来源字段 `candidate.source` 记录等级、AIRP 生命、AC、六维原值、`base`（等级基础值）和 `factors`（四项系数）。

## 本轮具体未覆盖字段和流程

- `临时生命值 > 0` 的剧情战斗：返回 `temporary-hp`，待独立吸收池接入；没有伪装成普通护甲。
- ST 的 `技能树`、`主动技能槽`、`觉醒技能槽`、`组合技能状态`、`资源技能`、羁绊 `技能/连携奥义`、`道途`：没有自动编译成三消技能。
- ST 的 `特质`、`状态效果/属性影响/特殊影响`、装备 `效果/描述/标签`：没有从自由文本解析额外伤害、免疫、控制、护盾或条件倍率。
- `暴击率/暴击伤害/暴击阈值`：没有参与三消数值换算。
- 武器 `强化等级/品级/等级/属性加成`：不参与三消数值换算；三消 `temperingLevel`、+6 词缀、永久面板加成、武器品质绑定约束尚未接入。
- 角色 `种族/职业/外貌/着装`：除已存在的 AC 兜底规则，不用于猜 GoW 兵种、王国、族群、职责或立绘；没有传伪造的 `troopTypes/kingdom/templateId/role/traitIds/portraitUrl`。
- 角色/装备实例目前只有变量路径引用；羁绊改名、装备键改名或删除重建后的永久实例身份，仍需宿主显式登记/迁移。
- 基础能力、武器绑定的持久化格式与品质/职责筛选仍需主线程后续接入；当前 `StSave` 没有这些字段，故通过显式 options 承接。
- HP 结果写回、临时 HP 写回、修订冲突检查、战斗锁、保存冻结配置、结果 outbox、奖励结算和 UI 都由现有宿主流程承接；本轮仅修改限定准备模块、测试与本文档。

## 验证

运行 `npx vitest run tests/unit/stPartyPreparation.test.ts` 验证当前转换、候选、初始化、真实注册和实际武器施法；运行 `npx tsc --noEmit --pretty false` 检查全仓类型兼容。本轮新增模块 28 项测试通过；连同 battleRuntime、storySession、hostAdapter、save、battleReport、blueprint、catalog 共 8 个文件 108 项测试通过，全仓类型检查通过。

