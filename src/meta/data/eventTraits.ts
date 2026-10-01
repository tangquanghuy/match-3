/**
 * 活动通用动态特质（活动深化批 2026-09-30）：特殊遭遇 / 突袭首领原型 / 入侵兵团与城防 /
 * 阵营地块词缀 / 世界事件庆典祝福 / 突袭战术补给。
 *
 * 与 towerTraits.ts 同一套机制：定义与 traits.json 同构，registerDynamicTraits 注册后
 * 引擎既有钩子零改动生效；各玩法经 common.injectTraits 把 code 塞进快照。只复用已实现键。
 * code 统一 `ev_` 前缀，模块导入即注册（副作用）。
 */
import { registerDynamicTraits, type TraitDefinition } from '../../engine/traits';
import { BaseColor } from '../../engine/types';

const STORM = {
  fire: { color: BaseColor.Red, turns: 6, troopId: 9002, referenceName: 'Firestorm', displayName: '火焰风暴' },
  ice: { color: BaseColor.Blue, turns: 6, troopId: 9003, referenceName: 'Icestorm', displayName: '寒冰风暴' },
  lightning: { color: BaseColor.Yellow, turns: 6, troopId: 9004, referenceName: 'Lightningstorm', displayName: '雷电风暴' },
  leaf: { color: BaseColor.Green, turns: 6, troopId: 9005, referenceName: 'Leafstorm', displayName: '叶风暴' },
  bones: { color: BaseColor.Brown, turns: 6, troopId: 9007, referenceName: 'Bonestorm', displayName: '骸骨风暴', dropKind: 'skull' as const },
  doom: { color: BaseColor.Purple, turns: 6, troopId: 9008, referenceName: 'Doomstorm', displayName: '末日风暴', dropKind: 'doomSkull' as const },
};

const COLOR_ZH: Record<BaseColor, string> = {
  [BaseColor.Red]: '红', [BaseColor.Blue]: '蓝', [BaseColor.Green]: '绿',
  [BaseColor.Yellow]: '黄', [BaseColor.Purple]: '紫', [BaseColor.Brown]: '棕',
};
const COLORS = Object.values(BaseColor) as BaseColor[];

/** 突袭首领「破绽」：受骷髅伤害时掉落 1 颗破绽色巨人宝石（每色一条） */
export const weakGiantCode = (c: BaseColor): string => `ev_boss_weak_${c}`;
/** 庆典糖果：回合开始 35% 把 1 颗主题色宝石变成糖果宝石（每色一条） */
export const festCandyCode = (c: BaseColor): string => `ev_fest_candy_${c}`;

export const EVENT_TRAIT_DEFS: readonly TraitDefinition[] = [
  // —— 特殊遭遇：宝藏 ——
  { code: 'ev_loot_booty', name: '宝藏·鼓鼓的钱袋', description: '身亡时撒出 3 颗赃物宝石（摧毁得金币）。', onDeathCreateGem: { gem: 'bootyGem', count: 3 } },
  { code: 'ev_loot_hoard', name: '宝藏·藏宝箱', description: '受到骷髅伤害时掉出 1 颗赃物宝石；身亡时撒出 4 颗。', onDamagedCreateGem: { gem: 'bootyGem', count: 1 }, onDeathCreateGem: { gem: 'bootyGem', count: 4 } },
  { code: 'ev_loot_skittish', name: '宝藏·胆小', description: '有 15% 几率闪避骷髅伤害。', dodgeChance: 0.15 },
  { code: 'ev_mimic_bite', name: '宝箱怪·咬合', description: '造成骷髅伤害时使目标流血。', inflictOnSkullHit: { id: 'bleed', turns: 3, magnitude: 2 } },

  // —— 世界事件：庆典祝福（我方） ——
  { code: 'ev_bless_ink', name: '庆典·彩带', description: '全队以 30% 法力开始战斗。', allyStartMana: { scope: 'all', ratio: 0.3 } },
  { code: 'ev_bless_wild', name: '庆典·烟花', description: '回合开始时有 30% 几率创造 1 颗 ×2 通配宝石。', turnStartCreateSpecialGem: { gem: 'wildcard', tier: 2, count: 1, chance: 0.3 } },
  { code: 'ev_bless_aegis', name: '庆典·护身符', description: '战斗开始时获得屏障。', battleStartStatus: { target: 'self', statuses: [{ id: 'barrier' }], turns: 3 } },
  { code: 'ev_bless_fire', name: '庆典·篝火', description: '战斗开始时召唤火焰风暴。', battleStartStorm: STORM.fire },
  { code: 'ev_bless_hourglass', name: '庆典·沙漏', description: '战斗开始时把 2 颗黄色宝石变成沙漏宝石。', battleStartConvertGems: { color: BaseColor.Yellow, gem: 'hourglass', count: 2, chance: 1 } },
  ...COLORS.map((c): TraitDefinition => ({
    code: festCandyCode(c), name: `庆典·${COLOR_ZH[c]}色糖果`, description: `回合开始时有 35% 几率把 1 颗${COLOR_ZH[c]}色宝石变成糖果宝石。`,
    turnStartColorToSpecial: { color: c, gem: 'candyGem', gemColor: c, count: 1, chance: 0.35 },
  })),
  // 强盗（敌方）
  { code: 'ev_bandit_cutpurse', name: '强盗·顺手牵羊', description: '造成骷髅伤害时窃取目标 1 点法力。', onSkullHitStealMana: 1 },

  // —— 突袭首领原型（敌方首领/护卫） ——
  { code: 'ev_boss_lava', name: '首领·熔岩之心', description: '回合开始时有 50% 几率创造 1 颗火山宝石。', turnStartCreateSpecialGem: { gem: 'volcanoGem', count: 1, chance: 0.5 } },
  { code: 'ev_boss_magma_skin', name: '首领·熔岩外壳', description: '降低来自骷髅头的伤害 20%。', skullDamageReduction: 0.2 },
  { code: 'ev_boss_lich', name: '首领·亡者之主', description: '回合开始时有 40% 几率把 1 颗骷髅变成末日骷髅。', turnStartColorToSpecial: { color: 'skull', gem: 'doomSkull', count: 1, chance: 0.4 } },
  { code: 'ev_guard_undying', name: '护卫·不散亡魂', description: '身亡时有 35% 几率以 40% 生命复活。', selfRevive: { chance: 0.35, healPct: 0.4 } },
  { code: 'ev_guard_bonepile', name: '护卫·骨堆', description: '身亡时创造 1 颗末日骷髅。', onDeathCreateGem: { gem: 'doomSkull', count: 1 } },
  { code: 'ev_boss_tempest', name: '首领·雷霆', description: '战斗开始时召唤雷电风暴；回合开始时有 40% 几率把 1 颗黄色宝石变成闪电宝石。', battleStartStorm: STORM.lightning, turnStartColorToSpecial: { color: BaseColor.Yellow, gem: 'lightningCol', count: 1, chance: 0.4 } },
  { code: 'ev_boss_broodmother', name: '首领·蛛母', description: '回合开始时有 60% 几率把 1 颗紫色宝石变成织网宝石。', turnStartColorToSpecial: { color: BaseColor.Purple, gem: 'web', count: 1, chance: 0.6 } },
  { code: 'ev_boss_venomfang', name: '首领·毒牙', description: '造成骷髅伤害时使目标中毒。', inflictOnSkullHit: { id: 'poison', turns: 3, magnitude: 3 } },
  { code: 'ev_boss_frostwyrm', name: '首领·霜龙', description: '战斗开始时召唤寒冰风暴；回合开始时有 40% 几率把 1 颗蓝色宝石变成冻结宝石。', battleStartStorm: STORM.ice, turnStartColorToSpecial: { color: BaseColor.Blue, gem: 'freezeGem', count: 1, chance: 0.4 } },
  ...COLORS.map((c): TraitDefinition => ({
    code: weakGiantCode(c), name: `破绽·${COLOR_ZH[c]}`, description: `受到骷髅伤害时掉落 1 颗${COLOR_ZH[c]}色巨型宝石（匹配 +5 法力并引爆周围）。`,
    onDamagedCreateGem: { gem: 'giantGem', color: c, count: 1 },
  })),
  // 阶段机制
  { code: 'ev_phase_rage', name: '阶段·狂怒', description: '战斗开始时激怒。', battleStartStatus: { target: 'self', statuses: [{ id: 'enraged' }], turns: 3 } },
  { code: 'ev_phase_doom', name: '阶段·绝境', description: '战斗开始时召唤末日风暴（末日骷髅双方都能掉落）。', battleStartStorm: STORM.doom },
  // 战术补给（我方）
  { code: 'ev_sup_frost', name: '补给·冰封卷轴', description: '战斗开始时冻结第一名敌人。', battleStartStatus: { target: 'firstEnemy', statuses: [{ id: 'frozen' }], turns: 3 } },
  { code: 'ev_sup_ink', name: '补给·战前动员', description: '全队以 35% 法力开始战斗。', allyStartMana: { scope: 'all', ratio: 0.35 } },
  { code: 'ev_sup_mark', name: '补给·猎首标记', description: '战斗开始时使第一名敌人陷入猎人标记。', battleStartStatus: { target: 'firstEnemy', statuses: [{ id: 'marked' }], turns: 4 } },

  // —— 入侵：兵团特质（敌方） ——
  { code: 'ev_inv_raider', name: '兵团·掠袭', description: '有 15% 几率闪避骷髅伤害。', dodgeChance: 0.15 },
  { code: 'ev_inv_ram', name: '兵团·攻城锤', description: '降低来自骷髅头的伤害 20%；身亡时留下 2 颗炸弹。', skullDamageReduction: 0.2, onDeathCreateGem: { gem: 'bomb', count: 2 } },
  { code: 'ev_inv_warlord', name: '兵团·督军', description: '战斗开始时获得屏障；盟友身亡时获得 3 点攻击。', battleStartStatus: { target: 'self', statuses: [{ id: 'barrier' }], turns: 3 }, onAllyDeathGain: { stat: 'attack', amount: 3 } },
  { code: 'ev_inv_shaman', name: '兵团·萨满', description: '回合开始时有 35% 几率把 1 颗宝石变成诅咒宝石。', turnStartColorToSpecial: { color: BaseColor.Brown, gem: 'curseGem', count: 1, chance: 0.35 } },
  // 城防（我方）
  { code: 'ev_def_arrow', name: '城防·箭塔', description: '战斗开始时冻结第一名敌人。', battleStartStatus: { target: 'firstEnemy', statuses: [{ id: 'frozen' }], turns: 3 } },
  { code: 'ev_def_oil', name: '城防·油锅', description: '战斗开始时把 3 颗红色宝石变成燃烧宝石。', battleStartConvertGems: { color: BaseColor.Red, gem: 'burningGem', count: 3, chance: 1 } },
  { code: 'ev_def_catapult', name: '城防·投石机', description: '战斗开始时把 2 颗棕色宝石变成炸弹。', battleStartConvertGems: { color: BaseColor.Brown, gem: 'bomb', count: 2, chance: 1 } },
  { code: 'ev_def_chapel', name: '城防·圣堂', description: '回合开始时有 20% 几率创造 1 颗屏障宝石。', turnStartCreateSpecialGem: { gem: 'barrierGem', count: 1, chance: 0.2 } },

  // —— 阵营突袭：地块词缀（敌方） ——
  { code: 'ev_fac_fort', name: '地块·城塞', description: '战斗开始时获得屏障。', battleStartStatus: { target: 'self', statuses: [{ id: 'barrier' }], turns: 3 } },
  { code: 'ev_fac_shrine', name: '地块·圣坛', description: '以 35% 法力开始战斗。', battleStartManaRatio: 0.35 },
  { code: 'ev_fac_watch', name: '地块·瞭望塔', description: '有 20% 几率闪避骷髅伤害。', dodgeChance: 0.2 },
  { code: 'ev_fac_granary', name: '地块·粮仓', description: '每回合开始恢复 3 点生命。', regen: { stat: 'hp', amount: 3 } },
  { code: 'ev_fac_warden', name: '王都·守将', description: '身亡时有 50% 几率以 30% 生命复活。', selfRevive: { chance: 0.5, healPct: 0.3 } },
  // 阵营：我方地块战利品
  { code: 'ev_fac_banner', name: '战利品·军旗', description: '匹配 4 颗以上时获得 2 点攻击。', onBigMatchGain: { stat: 'attack', amount: 2 } },
];

const NAMES = new Map(EVENT_TRAIT_DEFS.map((d) => [d.code, d.name]));

export function eventTraitName(code: string): string | undefined {
  return NAMES.get(code);
}

registerDynamicTraits(EVENT_TRAIT_DEFS);
