/**
 * 主角武器域的基础形状 + 起始池 + 退役映射（UX 阶段 B · 窗口 M 批次 1）。
 *
 * **2026-09-19 用户裁定**：首批 20 把 `w_*`（`学徒法杖`/`训练长剑`/8 职业 × 2 把毕业武器…）
 * 是早期随便造的假数据，**整表抛弃**。主角武器此后只有一个来源——官方目录
 * （`src/data/weapons.json` 718 把 → `data/weaponCatalog.ts`，`gw_<referenceName>` 命名空间），
 * 起始池改为「低档目录武器、零解锁条件、新档即拥有」。
 *
 * 随假数据一同退役的东西（以及为什么可以退）：
 *  - **20 个手写 `SkillPrototype`**（builders DSL）→ 目录武器的 `spellId` 已由 curated W 系批次
 *    编译成原型（`collectWeaponCurated()`，战斗可用 718/718），不需要 meta 层再自造法术；
 *  - **职业专属武器体系**（`classId` + 冠军等级 10/20 解锁）→ 官方口径本就是「每职业 1 把专属武器、
 *    250 胜解锁」，我们那套 8 职业 × 2 把是虚构的；真要做专属武器应从目录里挑，不是自造；
 *  - **`weaponRarity()` 按解锁档推导稀有度** → 目录武器自带官方 `rarity`，推导函数没有存在意义。
 *
 * 本文件因此只剩三件事：统一的武器形状 `WeaponDef`、起始池 id 清单、旧存档的 `w_* → gw_*` 退役映射。
 */
import type { BaseColor } from '../../engine/types';
import type { SkillPrototype } from '../../engine/skills/prototypes';

/** 武器词缀（`weapons.json` 的 affixes；710/718 把有，随淬炼等级解锁——见 systems/forge.ts） */
export interface WeaponAffix {
  name: string;
  description: string;
  rarity: string;
}

/**
 * 主角武器（**唯一形状**，统一自官方目录）。
 *
 * 此前存在两套形状（自造 `WeaponDef` + `CatalogWeaponDef extends WeaponDef`），
 * 假数据退役后合并成一份——`CatalogWeaponDef` 保留为本类型的别名（见 weaponCatalog.ts）。
 */
export interface WeaponDef {
  /** `gw_<referenceName>` */
  id: string;
  name: string;
  nameEn: string;
  /**
   * 归一后的武器类型小写键（`weaponCatalog.normalizeWeaponType`）。
   * 天赋「使用 X 时获得 N 点属性」（`selfStatIfWeapon`）按它判定——
   * 官方 `Artifact` 在天赋侧的词是 `relic`，归一在 weaponCatalog 做，本字段已是归一结果。
   */
  weaponType: string | null;
  /** 武器稀有度（本作 Uncommon 武器按 Common 钢锭档淬炼） */
  rarity: string;
  /** 稀有度序（0=Common … 6=Doomed），排序用 */
  rarityIdx: number;
  kingdom: string;
  /** 官方角色（Striker/Generator/…）与中文名 */
  role: string | null;
  roleName: string | null;
  /** 主角属性加成（718/718 把都有；一期展示口径，战斗生效需另立数值裁定） */
  attack: number;
  armor: number;
  health: number;
  magic: number;
  manaColors: BaseColor[];
  manaCost: number;
  /** 法术描述（= `weapons.json` 的 `spell.description`，中文化全量） */
  description: string;
  /** 法术中文名 */
  spellName: string;
  spellId: number;
  /**
   * 已编译法术原型（curated W 系批次）。
   * `null` = 保真度 `mana-only` 的占位武器——无真实法术，装上只会「仅扣法力」，
   * 按诚实口径不可装备（`equippable: false`），但**仍进图鉴可浏览**（武器图鉴审计 C-4：
   * 图鉴要如实告诉玩家「永远不可装备」，而不是把它们悄悄藏掉）。W05 收官后目录 718 把均有原型。
   */
  skill: SkillPrototype | null;
  /** 是否可装备（= 有编译原型）。图鉴展示全部 718，装备池只收这一档 */
  equippable: boolean;
  /** 卡面文件名（`public/static/weapons/{imageFile}`；718/718 零缺失） */
  imageFile: string;
  /** 官方精通要求（低档武器 2~10，活动/任务武器 100+） */
  masteryRequirement: number;
  releaseDate: string | null;
  immortal: boolean;
  affixes: WeaponAffix[];
  /** 起始池成员：零解锁条件、每份存档隐式拥有（见 STARTER_WEAPON_IDS） */
  starter: boolean;
}

/**
 * **起始池 22 把**：低档官方武器，零解锁条件，每份存档隐式拥有（不写进 `unlockedWeapons`，
 * 由 `weaponCatalog.ownedWeaponIds()` 并入——存档不膨胀，老档也自动获得）。
 *
 * 选取口径：
 *  - **Common 7 把**（`weapons.json` 里 Common 共 8 把，`gw_CrudeClub` 精通 6、不是官方开局六把，故排除）。前六把 1000–1005 正是官方开局武器：
 *    **六法力色 × 六武器类型一一对应**（蓝剑/绿弓/红斧/黄矛/紫杖/棕锤），精通要求 2；
 *  - **Uncommon 15 把**（全部战斗可用），把类型覆盖从 6 种扩到 11 种，让天赋
 *    `selfStatIfWeapon` 在新档就有得打（匕首/巨著/镰刀/标枪/狼牙棒…）。
 *
 * **不含 Rare 及以上**：Rare 28 把与其余 667 把按官方 MasteryRequirement 领取
 * （主角等级 / 职业 / 王国 8 关 / 熔炉 / 宝石商店直购），这样「全部 718」tab 的「拥有状态」
 * 与「获取途径」才有真实分母。
 */
export const STARTER_WEAPON_IDS: readonly string[] = [
  // —— Common（官方开局六把：六法力色 × 六类型）——
  'gw_KnightsSword', // 骑士之剑 · 剑 · 蓝
  'gw_ScoutsBow', // 侦察兵之弓 · 弓 · 绿
  'gw_WarriorsAxe', // 战士之斧 · 斧 · 红
  'gw_HuntersSpear', // 猎人之矛 · 长柄 · 黄
  'gw_WizardsWand', // 巫师的魔杖 · 法杖 · 紫
  'gw_PriestsHammer', // 祭司之锤 · 锤 · 棕
  'gw_SwordOfHeroes', // 英雄之剑 · 剑 · 蓝
  // —— Uncommon（扩类型覆盖：匕首/巨著/镰刀/标枪/狼牙棒/戟）——
  'gw_BlackDagger', // 暗黑匕首 · 匕首 · 蓝
  'gw_AvengingFalchion', // 复仇偃月刀 · 剑 · 蓝
  'gw_IcyGlaive', // 寒冰阔剑 · 长柄 · 黄
  'gw_DaemonicKhopesh', // 恶魔镰剑 · 剑 · 蓝
  'gw_SilverSword', // 白银剑 · 剑 · 棕
  'gw_PhoenixCrossbow', // 凤凰弩 · 弓 · 绿
  'gw_SunboltJavelin', // 日光矢标枪 · 投掷 · 黄
  'gw_DustyTome', // 积尘巨著 · 巨著 · 紫
  'gw_ElderBow', // 接骨木弓 · 弓 · 绿
  'gw_GuardianHalberd', // 守护者之戟 · 长柄 · 红
  'gw_GiantsMace', // 巨人的狼牙棒 · 狼牙棒 · 棕
  'gw_BloodyAxe', // 血腥斧头 · 斧 · 红
  'gw_WickedScythe', // 邪恶镰刀 · 镰刀 · 紫
  'gw_PiercingLance', // 穿心长枪 · 长柄 · 黄
  'gw_SpiritStaff', // 灵体法杖 · 法杖 · 紫
] as const;

const STARTER_SET: ReadonlySet<string> = new Set(STARTER_WEAPON_IDS);

/** 是否起始池成员（零解锁条件、隐式拥有） */
export function isStarterWeapon(id: string): boolean {
  return STARTER_SET.has(id);
}

/**
 * 新档默认装备：官方开局武器「骑士之剑」（蓝、耗蓝 3，全目录最低耗蓝档，
 * 保证主角一开始就有一个几乎必然充能得起的施法手段）。
 */
export const STARTER_WEAPON_ID = 'gw_KnightsSword';

/**
 * **退役映射**：旧存档里的 20 把 `w_*` → 起始池里同 `weaponType` 的目录武器。
 *
 * 口径说明：这里刻意**只映射到起始池内**（而不是去目录里挑同稀有度的"等价物"）——
 * 因为起始池本身零条件、人人都有，所以这张表实际只影响两处：
 *  ① `equippedWeapon` 指向的那把（不映射会变成「未装备武器」）；
 *  ② `weaponTempering` 的等级归属（不映射会丢掉玩家已投入的钢锭）。
 * 假数据不该换来 Rare+ 的真武器，所以不做跨档补偿。
 *
 * 三把没有同类型起始池对应物的（`守誓盾锤` shield / `祈愿圣印` jewellery /
 * `魂引铃`·`秘法宝珠` relic——起始池里没有盾/首饰/宝器档）回落到 `STARTER_WEAPON_ID`。
 */
export const LEGACY_WEAPON_REMAP: Readonly<Record<string, string>> = {
  // 通用四把
  w_univ_apprentice: 'gw_WizardsWand', // 学徒法杖 staff → 巫师的魔杖
  w_univ_sword: 'gw_KnightsSword', // 训练长剑 sword → 骑士之剑
  w_univ_bow: 'gw_ScoutsBow', // 猎手短弓 bow → 侦察兵之弓
  w_univ_tome: 'gw_DustyTome', // 学者之书 tome → 积尘巨著
  // 骑士
  w_knight_10: 'gw_KnightsSword', // 守誓盾锤 shield → 起始池无盾，回落
  w_knight_20: 'gw_SwordOfHeroes', // 王国誓约 sword → 英雄之剑
  // 狂战士（warrior）
  w_warlord_10: 'gw_WarriorsAxe', // 狂战斧 axe → 战士之斧
  w_warlord_20: 'gw_BloodyAxe', // 血怒战刃 axe → 血腥斧头
  // 牧师
  w_priest_10: 'gw_KnightsSword', // 祈愿圣印 jewellery → 起始池无首饰，回落
  w_priest_20: 'gw_SpiritStaff', // 晨曦权杖 staff → 灵体法杖
  // 死灵法师
  w_necromancer_10: 'gw_KnightsSword', // 魂引铃 relic → 起始池无宝器，回落
  w_necromancer_20: 'gw_DustyTome', // 亡者之书 tome → 积尘巨著
  // 盗贼
  w_thief_10: 'gw_BlackDagger', // 影匕 dagger → 暗黑匕首
  w_thief_20: 'gw_BlackDagger', // 暗杀者之牙 dagger → 暗黑匕首（起始池仅一把匕首）
  // 德鲁伊（warden）
  w_warden_10: 'gw_WizardsWand', // 荆棘杖 staff → 巫师的魔杖
  w_warden_20: 'gw_SpiritStaff', // 世界树枝 staff → 灵体法杖
  // 法师
  w_sorcerer_10: 'gw_KnightsSword', // 秘法宝珠 relic → 起始池无宝器，回落
  w_sorcerer_20: 'gw_DustyTome', // 星陨法典 tome → 积尘巨著
  // 游侠（archer）
  w_archer_10: 'gw_ScoutsBow', // 游侠长弓 bow → 侦察兵之弓
  w_archer_20: 'gw_ElderBow', // 鹰眼战弓 bow → 接骨木弓
};

/**
 * 武器 id 归一：旧 `w_*` 经退役映射换成 `gw_*`，其余原样返回。
 *
 * 存档迁移（schema v4）落地前后都要用它：
 *  - 迁移前：运行时读到老档的 `w_*` 也能正确解析与去重（不会在武器库里出现
 *    「训练长剑」与「骑士之剑」两张指向同一把武器的卡）；
 *  - 迁移后：`w_*` 已不在存档里，本函数对新档是恒等映射，零成本。
 */
export function resolveWeaponId(id: string | null): string | null {
  if (!id) return null;
  return LEGACY_WEAPON_REMAP[id] ?? id;
}
