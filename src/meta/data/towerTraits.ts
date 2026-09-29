/**
 * 末日之塔遗物 / 精英词缀 / 诅咒 → 引擎动态特质定义。
 *
 * 与职业天赋同一套机制（talentDefs.ts）：每条定义与 traits.json 同构，经
 * registerDynamicTraits 注册后，引擎既有钩子零改动生效；tower.ts 的 applyRun 把 code
 * 塞进快照 traitIds 即可。本表只**复用已实现的键**，不新增任何引擎语义：
 *
 *  - battleStartStorm         开局风暴（songof* 同形，含骸骨/末日骷髅掉落）
 *  - battleStartConvertGems   开局把某色宝石变成特殊宝石（冬/夏之宫廷恩赐同形）
 *  - turnStartColorToSpecial  回合开始把某色/骷髅变成特殊宝石（embers/daemonsmark/temporal 同形）
 *  - turnStartColorToSkull    回合开始把某色变成骷髅
 *  - turnStartCreateSpecialGem 回合开始创造特殊宝石
 *  - onBigMatchCreateGem      4+ 连创造通配宝石（wildmagic 同形）
 *  - onColorMatchGain         配色（含骷髅）自身获得
 *  - battleStartStatus / battleStartManaRatio / allyStartMana / dodgeChance /
 *    reflectSkullRatio / inflictOnSkullHit
 *
 * 模块导入即注册（副作用），tower.ts 导入本模块；code 统一 `tw_` 前缀避免与兵种特质撞名。
 */
import { registerDynamicTraits, type TraitDefinition } from '../../engine/traits';
import { BaseColor } from '../../engine/types';

const STORM = {
  fire: { color: BaseColor.Red, turns: 8, troopId: 9002, referenceName: 'Firestorm', displayName: '火焰风暴' },
  ice: { color: BaseColor.Blue, turns: 8, troopId: 9003, referenceName: 'Icestorm', displayName: '寒冰风暴' },
  leaf: { color: BaseColor.Green, turns: 8, troopId: 9005, referenceName: 'Leafstorm', displayName: '叶风暴' },
  bones: { color: BaseColor.Brown, turns: 8, troopId: 9007, referenceName: 'Bonestorm', displayName: '骸骨风暴', dropKind: 'skull' as const },
  doom: { color: BaseColor.Purple, turns: 8, troopId: 9008, referenceName: 'Doomstorm', displayName: '末日风暴', dropKind: 'doomSkull' as const },
};

export const TOWER_TRAIT_DEFS: readonly TraitDefinition[] = [
  // —— 遗物：开局风暴 ——
  { code: 'tw_flame_totem', name: '遗物·焰之图腾', description: '战斗开始时召唤火焰风暴。', battleStartStorm: STORM.fire },
  { code: 'tw_tide_totem', name: '遗物·潮之图腾', description: '战斗开始时召唤寒冰风暴。', battleStartStorm: STORM.ice },
  { code: 'tw_leaf_totem', name: '遗物·叶之图腾', description: '战斗开始时召唤叶风暴。', battleStartStorm: STORM.leaf },
  { code: 'tw_bone_horn', name: '遗物·骸骨号角', description: '战斗开始时召唤骸骨风暴。', battleStartStorm: STORM.bones },
  { code: 'tw_doom_crown_storm', name: '遗物·末日王冠', description: '战斗开始时召唤末日风暴。', battleStartStorm: STORM.doom },
  // —— 遗物：开局 ——
  { code: 'tw_powder_keg', name: '遗物·火药桶', description: '战斗开始时把 2 颗红色宝石变成炸弹。', battleStartConvertGems: { color: BaseColor.Red, gem: 'bomb', count: 2, chance: 1 } },
  { code: 'tw_inspiration_ink', name: '遗物·灵感墨水', description: '全队以 25% 法力开始战斗。', allyStartMana: { scope: 'all', ratio: 0.25 } },
  { code: 'tw_root_seed', name: '遗物·缠根种子', description: '战斗开始时缠绕第一名敌人。', battleStartStatus: { target: 'firstEnemy', statuses: [{ id: 'entangle' }], turns: 3 } },
  { code: 'tw_frost_kiss', name: '遗物·寒霜之吻', description: '战斗开始时冻结一名随机敌人。', battleStartStatus: { target: 'randomEnemy', statuses: [{ id: 'frozen' }], turns: 3 } },
  { code: 'tw_aegis_sigil', name: '遗物·屏障圣徽', description: '战斗开始时获得屏障。', battleStartStatus: { target: 'self', statuses: [{ id: 'barrier' }], turns: 3 } },
  // —— 遗物：回合开始改写棋盘（每名队员各掷一次）——
  { code: 'tw_bone_totem', name: '遗物·骸骨图腾', description: '回合开始时有 15% 几率把 1 颗棕色宝石变成骷髅。', turnStartColorToSkull: { color: BaseColor.Brown, chance: 0.15 } },
  { code: 'tw_ember_seed', name: '遗物·余烬火种', description: '回合开始时有 20% 几率把 1 颗红色宝石变成燃烧宝石。', turnStartColorToSpecial: { color: BaseColor.Red, gem: 'burningGem', count: 1, chance: 0.2 } },
  { code: 'tw_frost_heart', name: '遗物·霜之心', description: '回合开始时有 20% 几率把 1 颗蓝色宝石变成冻结宝石。', turnStartColorToSpecial: { color: BaseColor.Blue, gem: 'freezeGem', count: 1, chance: 0.2 } },
  { code: 'tw_spider_spool', name: '遗物·蛛丝线轴', description: '回合开始时有 20% 几率把 1 颗紫色宝石变成织网宝石。', turnStartColorToSpecial: { color: BaseColor.Purple, gem: 'web', count: 1, chance: 0.2 } },
  { code: 'tw_doom_skull_idol', name: '遗物·末日头骨', description: '回合开始时有 12% 几率把 1 颗骷髅变成末日骷髅。', turnStartColorToSpecial: { color: 'skull', gem: 'doomSkull', count: 1, chance: 0.12 } },
  { code: 'tw_doom_crown', name: '遗物·末日王冠', description: '回合开始时有 10% 几率把 1 颗骷髅变成末日骷髅。', turnStartColorToSpecial: { color: 'skull', gem: 'doomSkull', count: 1, chance: 0.1 } },
  { code: 'tw_sand_glass', name: '遗物·时之沙漏', description: '回合开始时有 8% 几率把 1 颗黄色宝石变成沙漏宝石。', turnStartColorToSpecial: { color: BaseColor.Yellow, gem: 'hourglass', count: 1, chance: 0.08 } },
  { code: 'tw_lightning_rod', name: '遗物·引雷针', description: '回合开始时有 10% 几率把 1 颗黄色宝石变成闪电宝石。', turnStartColorToSpecial: { color: BaseColor.Yellow, gem: 'lightningRow', count: 1, chance: 0.1 } },
  { code: 'tw_eternal_heart', name: '遗物·永恒之心', description: '回合开始时有 12% 几率创造 1 颗沙漏宝石。', turnStartCreateSpecialGem: { gem: 'hourglass', count: 1, chance: 0.12 } },
  // —— 遗物：匹配 / 防御 ——
  { code: 'tw_wild_prism', name: '遗物·狂野棱晶', description: '匹配 4 颗以上时有 25% 几率创造 1 颗 ×2 通配宝石。', onBigMatchCreateGem: { gem: 'wildcard', tier: 2, count: 1, chance: 0.25 } },
  { code: 'tw_herb_pouch', name: '遗物·草药袋', description: '匹配绿色宝石时获得 1 点生命。', onColorMatchGain: { color: BaseColor.Green, stat: 'hp', amount: 1 } },
  { code: 'tw_war_drum', name: '遗物·战鼓', description: '匹配骷髅时获得 1 点攻击。', onColorMatchGain: { color: 'skull', stat: 'attack', amount: 1 } },
  { code: 'tw_shadow_cloak', name: '遗物·暗影斗篷', description: '有 12% 几率闪避骷髅伤害。', dodgeChance: 0.12 },
  { code: 'tw_thorn_mail', name: '遗物·荆棘甲', description: '反弹 20% 受到的骷髅伤害。', reflectSkullRatio: 0.2 },
  // —— 敌方：诅咒与代价 ——
  { code: 'tw_curse_haste', name: '诅咒·急躁之咒', description: '以 30% 法力开始战斗。', battleStartManaRatio: 0.3 },
  { code: 'tw_gem_forge_curse', name: '代价·宝石熔炉', description: '以 25% 法力开始战斗。', battleStartManaRatio: 0.25 },
  // —— 敌方：精英词缀 ——
  { code: 'tw_af_thorns', name: '词缀·荆棘', description: '反弹 25% 受到的骷髅伤害。', reflectSkullRatio: 0.25 },
  { code: 'tw_af_venom', name: '词缀·剧毒', description: '造成骷髅伤害时使目标中毒。', inflictOnSkullHit: { id: 'poison', turns: 3, magnitude: 2 } },
  { code: 'tw_af_swift', name: '词缀·迅捷', description: '以 40% 法力开始战斗。', battleStartManaRatio: 0.4 },
  { code: 'tw_af_warded', name: '词缀·护盾', description: '战斗开始时获得屏障。', battleStartStatus: { target: 'self', statuses: [{ id: 'barrier' }], turns: 3 } },
  { code: 'tw_af_doomed', name: '词缀·末日', description: '战斗开始时召唤末日风暴。', battleStartStorm: STORM.doom },
];

export const TOWER_TRAIT_CODES: ReadonlySet<string> = new Set(TOWER_TRAIT_DEFS.map((d) => d.code));

export function towerTraitName(code: string): string | undefined {
  return TOWER_TRAIT_DEFS.find((d) => d.code === code)?.name;
}

registerDynamicTraits(TOWER_TRAIT_DEFS);
