/**
 * 末日之塔（肉鸽爬塔）词表：区段、节点、遗物、词缀、符文、奇遇、开局祝福。全部为设计值。
 *
 * 玩法见 systems/eventModes/tower.ts：25 层分三区（8/8/9），每区一张分叉地图，
 * 玩家自己选路；战斗/精英/首领/营地/宝库/商人/奇遇七种节点；遗物改变之后每一场战斗。
 *
 * 2026-09-29 深化批：遗物改为**效果数据**驱动（RelicEffect），战斗内效果全部复用引擎
 * 已实现的机制——旗帜法力加成（banner）、法力精通（mastery）、以及经
 * registerDynamicTraits 注册的动态特质（开局风暴 / 开局转换宝石 / 回合开始把宝石
 * 变成燃烧·冻结·织网·末日骷髅·沙漏·闪电 / 匹配触发 / 闪避 / 反弹 / 屏障…），
 * 特质定义见 data/towerTraits.ts。
 */
import { BaseColor } from '../../engine/types';

export type TowerNodeKind = 'battle' | 'elite' | 'boss' | 'camp' | 'treasure' | 'merchant' | 'event';

export const TOWER_ZONES = [
  { name: '沉没回廊', rows: 8, blurb: '塔基被潮水吞没的回廊，守卫尚且松散。' },
  { name: '裂隙钟楼', rows: 8, blurb: '钟声撕开时空裂隙，精英成群巡逻。' },
  { name: '末日尖顶', rows: 9, blurb: '风暴之眼下的尖顶，末日之主在王座上等待。' },
] as const;

/** 地图横向车道数（节点最多 7 列） */
export const TOWER_LANES = 7;

export const TOWER_NODE_INFO: Record<TowerNodeKind, { name: string; hint: string }> = {
  battle: { name: '战斗', hint: '普通守卫。胜利获得塔金，并从三枚符文中挑一枚。' },
  elite: { name: '精英', hint: '带词缀的强敌。胜利获得更多塔金，并从三件遗物中挑一件。' },
  boss: { name: '首领', hint: '区域守关者。击败后全队回复 40% 生命，挑一件首领遗物，进入下一区。' },
  camp: { name: '营地', hint: '四选一：休整回血、磨砺攻击、冥想魔法，或为阵亡者招魂。' },
  treasure: { name: '宝库', hint: '必得一件遗物与一袋塔金。' },
  merchant: { name: '商人', hint: '用塔金购买遗物、治疗、驱除诅咒，或让商人换一批货。' },
  event: { name: '奇遇', hint: '未知的遭遇：风险与收益并存。' },
};

// ---------------------------------------------------------------------------
// 遗物
// ---------------------------------------------------------------------------

export type RelicRarity = 'common' | 'rare' | 'boss' | 'curse';

/** 遗物标签：卡面与清单上的小字分类，方便玩家一眼看出它在什么时候起作用 */
export type RelicTag = '属性' | '法力' | '开局' | '回合' | '匹配' | '风暴' | '宝石' | '防御' | '塔金' | '续航' | '敌人';

/**
 * 动态特质挂载方式：
 *  - lead：挂在第一名存活成员身上（开局一次性效果：风暴 / 开局转换 / 开局状态 / 开局法力光环）；
 *  - all ：挂在每名存活成员身上（「每名队员」类效果，随存活人数自然缩放）。
 */
export interface RelicTraitRef {
  code: string;
  on: 'lead' | 'all';
}

export interface RelicEffect {
  attack?: number;
  armor?: number;
  magic?: number;
  attackPct?: number;
  armorPct?: number;
  hpPct?: number;
  /** 仅精英/首领战生效的攻击加成 */
  bigFightAttackPct?: number;
  /** 旗帜法力加成（匹配该色宝石时每次 ±N，引擎 bannerBoosts 语义） */
  banner?: Partial<Record<BaseColor, number>>;
  /** 全色法力精通（涌动概率 m/(m+100)） */
  mastery?: number;
  /** 注入我方快照的动态特质 */
  traits?: readonly RelicTraitRef[];
  enemyAttackPct?: number;
  /** 注入敌方快照的动态特质（诅咒/代价） */
  enemyTraits?: readonly RelicTraitRef[];
  /** 敌人以该比例生命开战 */
  enemyStartHp?: number;
}

export interface RelicDef {
  id: string;
  name: string;
  desc: string;
  rarity: RelicRarity;
  /** 图标：eventArt 名（relic-*）、`gem:<路径>`（棋盘宝石贴图）或 `status:<状态>`（状态图标） */
  icon: string;
  tags: readonly RelicTag[];
  effect?: RelicEffect;
  /** 可重复获得（诅咒「虚弱之面」） */
  stackable?: boolean;
}

const ALL_COLORS = Object.values(BaseColor) as BaseColor[];
const allBanner = (n: number): Partial<Record<BaseColor, number>> => Object.fromEntries(ALL_COLORS.map((c) => [c, n]));

/** 遗物（战斗内效果由 systems/eventModes/tower.ts applyRun 按 effect 统一注入；战后效果按 id 在 progress 结算） */
export const TOWER_RELICS: readonly RelicDef[] = [
  // —— 普通 ——
  { id: 'ember_sigil', name: '余烬徽记', desc: '全队攻击 +4', rarity: 'common', icon: 'relic-ember_sigil', tags: ['属性'], effect: { attack: 4 } },
  { id: 'iron_bulwark', name: '铁壁护符', desc: '全队护甲 +6', rarity: 'common', icon: 'relic-iron_bulwark', tags: ['属性'], effect: { armor: 6 } },
  { id: 'vital_chalice', name: '生命圣杯', desc: '全队生命上限 +12%', rarity: 'common', icon: 'relic-vital_chalice', tags: ['属性'], effect: { hpPct: 0.12 } },
  { id: 'sage_quill', name: '贤者羽笔', desc: '全队魔法 +3', rarity: 'common', icon: 'relic-sage_quill', tags: ['属性'], effect: { magic: 3 } },
  { id: 'prism_flame', name: '焰阳棱镜', desc: '匹配红色、黄色宝石时法力 +1', rarity: 'common', icon: 'relic-prism_flame', tags: ['法力'], effect: { banner: { [BaseColor.Red]: 1, [BaseColor.Yellow]: 1 } } },
  { id: 'prism_tide', name: '潮木棱镜', desc: '匹配蓝色、绿色宝石时法力 +1', rarity: 'common', icon: 'relic-prism_tide', tags: ['法力'], effect: { banner: { [BaseColor.Blue]: 1, [BaseColor.Green]: 1 } } },
  { id: 'prism_dusk', name: '暮土棱镜', desc: '匹配紫色、棕色宝石时法力 +1', rarity: 'common', icon: 'relic-prism_dusk', tags: ['法力'], effect: { banner: { [BaseColor.Purple]: 1, [BaseColor.Brown]: 1 } } },
  { id: 'gold_idol', name: '贪婪金像', desc: '战斗获得的塔金 +50%', rarity: 'common', icon: 'relic-gold_idol', tags: ['塔金'] },
  { id: 'bone_totem', name: '骸骨图腾', desc: '每名队员在回合开始时有 15% 几率把 1 颗棕色宝石变成骷髅', rarity: 'common', icon: 'gem:skull', tags: ['回合', '宝石'], effect: { traits: [{ code: 'tw_bone_totem', on: 'all' }] } },
  { id: 'ember_seed', name: '余烬火种', desc: '每名队员在回合开始时有 20% 几率把 1 颗红色宝石变成燃烧宝石（匹配时点燃一名敌人）', rarity: 'common', icon: 'gem:status/burningGem', tags: ['回合', '宝石'], effect: { traits: [{ code: 'tw_ember_seed', on: 'all' }] } },
  { id: 'frost_heart', name: '霜之心', desc: '每名队员在回合开始时有 20% 几率把 1 颗蓝色宝石变成冻结宝石（匹配时冻结一名敌人）', rarity: 'common', icon: 'gem:status/freezeGem', tags: ['回合', '宝石'], effect: { traits: [{ code: 'tw_frost_heart', on: 'all' }] } },
  { id: 'spider_spool', name: '蛛丝线轴', desc: '每名队员在回合开始时有 20% 几率把 1 颗紫色宝石变成织网宝石（匹配时织网一名敌人）', rarity: 'common', icon: 'gem:special/web', tags: ['回合', '宝石'], effect: { traits: [{ code: 'tw_spider_spool', on: 'all' }] } },
  { id: 'flame_totem', name: '焰之图腾', desc: '战斗开始时召唤火焰风暴：8 回合内红色宝石更常掉落（场上只存在一场风暴）', rarity: 'common', icon: 'gem:red', tags: ['开局', '风暴'], effect: { traits: [{ code: 'tw_flame_totem', on: 'lead' }] } },
  { id: 'tide_totem', name: '潮之图腾', desc: '战斗开始时召唤寒冰风暴：8 回合内蓝色宝石更常掉落（场上只存在一场风暴）', rarity: 'common', icon: 'gem:blue', tags: ['开局', '风暴'], effect: { traits: [{ code: 'tw_tide_totem', on: 'lead' }] } },
  { id: 'leaf_totem', name: '叶之图腾', desc: '战斗开始时召唤叶风暴：8 回合内绿色宝石更常掉落（场上只存在一场风暴）', rarity: 'common', icon: 'gem:green', tags: ['开局', '风暴'], effect: { traits: [{ code: 'tw_leaf_totem', on: 'lead' }] } },
  { id: 'inspiration_ink', name: '灵感墨水', desc: '全队以 25% 法力开始战斗', rarity: 'common', icon: 'status:enchanted', tags: ['开局', '法力'], effect: { traits: [{ code: 'tw_inspiration_ink', on: 'lead' }] } },
  { id: 'herb_pouch', name: '草药袋', desc: '匹配绿色宝石时，每名队员获得 1 点生命', rarity: 'common', icon: 'gem:green', tags: ['匹配', '续航'], effect: { traits: [{ code: 'tw_herb_pouch', on: 'all' }] } },
  { id: 'war_drum', name: '战鼓', desc: '匹配骷髅时，每名队员获得 1 点攻击', rarity: 'common', icon: 'gem:skull', tags: ['匹配', '属性'], effect: { traits: [{ code: 'tw_war_drum', on: 'all' }] } },
  { id: 'shadow_cloak', name: '暗影斗篷', desc: '每名队员有 12% 几率闪避骷髅伤害', rarity: 'common', icon: 'status:submerged', tags: ['防御'], effect: { traits: [{ code: 'tw_shadow_cloak', on: 'all' }] } },
  { id: 'powder_keg', name: '火药桶', desc: '战斗开始时把 2 颗红色宝石变成炸弹（被消除时引爆周围一圈）', rarity: 'common', icon: 'gem:special/bomb', tags: ['开局', '宝石'], effect: { traits: [{ code: 'tw_powder_keg', on: 'lead' }] } },
  { id: 'root_seed', name: '缠根种子', desc: '战斗开始时缠绕第一名敌人 3 回合', rarity: 'common', icon: 'status:entangle', tags: ['开局', '敌人'], effect: { traits: [{ code: 'tw_root_seed', on: 'lead' }] } },

  // —— 稀有 ——
  { id: 'surge_orb', name: '涌动宝珠', desc: '全色法力精通 +25（3 消也可能涌动翻倍）', rarity: 'rare', icon: 'relic-surge_orb', tags: ['法力'], effect: { mastery: 25 } },
  { id: 'mending_moss', name: '愈合苔藓', desc: '每场胜利后，存活成员回复 12% 生命', rarity: 'rare', icon: 'relic-mending_moss', tags: ['续航'] },
  { id: 'hunter_mark', name: '猎首印', desc: '与精英、首领交战时全队攻击 +25%', rarity: 'rare', icon: 'relic-hunter_mark', tags: ['属性'], effect: { bigFightAttackPct: 0.25 } },
  { id: 'ambush_horn', name: '伏击号角', desc: '敌人以 88% 生命开战', rarity: 'rare', icon: 'relic-ambush_horn', tags: ['开局', '敌人'], effect: { enemyStartHp: 0.88 } },
  { id: 'curse_doll', name: '衰弱人偶', desc: '敌人攻击 -15%', rarity: 'rare', icon: 'relic-curse_doll', tags: ['敌人'], effect: { enemyAttackPct: -0.15 } },
  { id: 'phoenix_feather', name: '不死鸟之羽', desc: '首次有成员阵亡的胜利后，阵亡者以 30% 生命复活（一次）', rarity: 'rare', icon: 'relic-phoenix_feather', tags: ['续航'] },
  { id: 'doom_skull_idol', name: '末日头骨', desc: '每名队员在回合开始时有 12% 几率把 1 颗骷髅变成末日骷髅（匹配时额外 +5 伤害并引爆周围）', rarity: 'rare', icon: 'gem:special/doomSkull', tags: ['回合', '宝石'], effect: { traits: [{ code: 'tw_doom_skull_idol', on: 'all' }] } },
  { id: 'bone_horn', name: '骸骨号角', desc: '战斗开始时召唤骸骨风暴：8 回合内骷髅掉落率大幅提高（场上只存在一场风暴）', rarity: 'rare', icon: 'gem:skull', tags: ['开局', '风暴'], effect: { traits: [{ code: 'tw_bone_horn', on: 'lead' }] } },
  { id: 'sand_glass', name: '时之沙漏', desc: '每名队员在回合开始时有 8% 几率把 1 颗黄色宝石变成沙漏宝石（匹配时获得额外回合）', rarity: 'rare', icon: 'gem:special/hourglass', tags: ['回合', '宝石'], effect: { traits: [{ code: 'tw_sand_glass', on: 'all' }] } },
  { id: 'wild_prism', name: '狂野棱晶', desc: '匹配 4 颗以上时，每名队员有 25% 几率创造 1 颗 ×2 通配宝石', rarity: 'rare', icon: 'gem:special/wildcard2', tags: ['匹配', '宝石'], effect: { traits: [{ code: 'tw_wild_prism', on: 'all' }] } },
  { id: 'lightning_rod', name: '引雷针', desc: '每名队员在回合开始时有 10% 几率把 1 颗黄色宝石变成闪电宝石（匹配时清除整行）', rarity: 'rare', icon: 'gem:special/lightningRow', tags: ['回合', '宝石'], effect: { traits: [{ code: 'tw_lightning_rod', on: 'all' }] } },
  { id: 'aegis_sigil', name: '屏障圣徽', desc: '每名队员在战斗开始时获得屏障（抵挡下一次伤害）', rarity: 'rare', icon: 'status:barrier', tags: ['开局', '防御'], effect: { traits: [{ code: 'tw_aegis_sigil', on: 'all' }] } },
  { id: 'thorn_mail', name: '荆棘甲', desc: '每名队员反弹 20% 受到的骷髅伤害', rarity: 'rare', icon: 'status:bleed', tags: ['防御'], effect: { traits: [{ code: 'tw_thorn_mail', on: 'all' }] } },
  { id: 'frost_kiss', name: '寒霜之吻', desc: '战斗开始时冻结一名随机敌人 3 回合', rarity: 'rare', icon: 'status:frozen', tags: ['开局', '敌人'], effect: { traits: [{ code: 'tw_frost_kiss', on: 'lead' }] } },

  // —— 首领 ——
  { id: 'glass_blade', name: '玻璃之刃', desc: '全队攻击 +40%，但生命上限 -20%', rarity: 'boss', icon: 'relic-glass_blade', tags: ['属性'], effect: { attackPct: 0.4, hpPct: -0.2 } },
  { id: 'titan_heart', name: '巨人之心', desc: '全队生命上限 +30%，但攻击 -10%', rarity: 'boss', icon: 'relic-titan_heart', tags: ['属性'], effect: { hpPct: 0.3, attackPct: -0.1 } },
  { id: 'storm_crown', name: '风暴王冠', desc: '全色法力精通 +50、法力 +1，但敌人攻击 +10%', rarity: 'boss', icon: 'relic-storm_crown', tags: ['法力'], effect: { mastery: 50, banner: allBanner(1), enemyAttackPct: 0.1 } },
  { id: 'leech_fang', name: '吸血獠牙', desc: '每场胜利后存活成员回复 25% 生命，但战斗塔金减半', rarity: 'boss', icon: 'relic-leech_fang', tags: ['续航', '塔金'] },
  { id: 'doom_crown', name: '末日王冠', desc: '战斗开始时召唤末日风暴（末日骷髅开始掉落）；每名队员回合开始 10% 几率把 1 颗骷髅变成末日骷髅；但敌人攻击 +15%', rarity: 'boss', icon: 'gem:special/uberDoomSkull', tags: ['开局', '风暴', '宝石'], effect: { traits: [{ code: 'tw_doom_crown_storm', on: 'lead' }, { code: 'tw_doom_crown', on: 'all' }], enemyAttackPct: 0.15 } },
  { id: 'eternal_heart', name: '永恒之心', desc: '每名队员在回合开始时有 12% 几率创造 1 颗沙漏宝石；但生命上限 -15%', rarity: 'boss', icon: 'gem:special/hourglass', tags: ['回合', '宝石'], effect: { traits: [{ code: 'tw_eternal_heart', on: 'all' }], hpPct: -0.15 } },
  { id: 'gem_forge', name: '宝石熔炉', desc: '匹配任意颜色宝石时法力 +1；但每名敌人以 25% 法力开战', rarity: 'boss', icon: 'gem:special/elementalStar', tags: ['法力', '敌人'], effect: { banner: allBanner(1), enemyTraits: [{ code: 'tw_gem_forge_curse', on: 'all' }] } },

  // —— 诅咒 ——
  { id: 'curse_frailty', name: '虚弱之面', desc: '诅咒：敌人攻击 +12%（可叠加）。可在商人处驱除', rarity: 'curse', icon: 'relic-curse_frailty', tags: ['敌人'], effect: { enemyAttackPct: 0.12 }, stackable: true },
  { id: 'curse_haste', name: '急躁之咒', desc: '诅咒：每名敌人以 30% 法力开战。可在商人处驱除', rarity: 'curse', icon: 'status:curse', tags: ['敌人'], effect: { enemyTraits: [{ code: 'tw_curse_haste', on: 'all' }] } },
  { id: 'curse_brittle', name: '碎骨之咒', desc: '诅咒：全队护甲 -20%。可在商人处驱除', rarity: 'curse', icon: 'status:disease', tags: ['属性'], effect: { armorPct: -0.2 } },
];

export function relicById(id: string): RelicDef | undefined {
  return TOWER_RELICS.find((r) => r.id === id);
}

export const isCurse = (id: string): boolean => relicById(id)?.rarity === 'curse';

/** 风暴类遗物（奇遇「风暴祭坛」与开局祝福从这里抽） */
export const TOWER_STORM_RELICS = ['flame_totem', 'tide_totem', 'leaf_totem', 'bone_horn'] as const;

// ---------------------------------------------------------------------------
// 精英词缀（节点生成时固定，地图上可提前查看）
// ---------------------------------------------------------------------------

export interface TowerAffixDef {
  name: string;
  desc: string;
  icon: string;
  attackPct?: number;
  armorPct?: number;
  hpPct?: number;
  magicPct?: number;
  /** 注入敌方快照的动态特质 */
  traits?: readonly RelicTraitRef[];
  /** 从第几区（0 起）开始出现 */
  minZone?: number;
}

export const TOWER_AFFIXES = {
  fury: { name: '狂暴', desc: '敌方攻击 +25%', icon: 'status:rage', attackPct: 0.25 },
  bulwark: { name: '铁壁', desc: '敌方护甲 +60%', icon: 'relic-iron_bulwark', armorPct: 0.6 },
  giant: { name: '巨化', desc: '敌方生命 +30%', icon: 'relic-titan_heart', hpPct: 0.3 },
  arcane: { name: '奥术', desc: '敌方魔法 +40%', icon: 'relic-sage_quill', magicPct: 0.4 },
  thorns: { name: '荆棘', desc: '每名敌人反弹 25% 受到的骷髅伤害', icon: 'status:bleed', traits: [{ code: 'tw_af_thorns', on: 'all' }] },
  venom: { name: '剧毒', desc: '敌人的骷髅攻击使目标中毒 3 回合', icon: 'status:poison', traits: [{ code: 'tw_af_venom', on: 'all' }] },
  swift: { name: '迅捷', desc: '每名敌人以 40% 法力开战', icon: 'status:enchanted', traits: [{ code: 'tw_af_swift', on: 'all' }], minZone: 1 },
  warded: { name: '护盾', desc: '每名敌人开战时获得屏障', icon: 'status:barrier', traits: [{ code: 'tw_af_warded', on: 'all' }], minZone: 1 },
  doomed: { name: '末日', desc: '开战时召唤末日风暴：末日骷髅开始掉落（双方都能匹配）', icon: 'gem:special/doomSkull', traits: [{ code: 'tw_af_doomed', on: 'lead' }], minZone: 1 },
} as const satisfies Record<string, TowerAffixDef>;
export type TowerAffix = keyof typeof TOWER_AFFIXES;

export function affixDef(id: TowerAffix): TowerAffixDef {
  return TOWER_AFFIXES[id];
}

// ---------------------------------------------------------------------------
// 符文 / 祝福 / 奇遇
// ---------------------------------------------------------------------------

export interface TowerRuneDef {
  name: string;
  desc: string;
  icon: string;
  /** 灵纹：本轮该色旗帜法力 +1 */
  color?: BaseColor;
}

/** 普通战斗后的三选一小奖励 */
export const TOWER_RUNES = {
  rune_atk: { name: '锋锐符文', desc: '全队攻击 +2（本轮永久）', icon: 'relic-ember_sigil' },
  rune_arm: { name: '坚守符文', desc: '全队护甲 +3（本轮永久）', icon: 'relic-iron_bulwark' },
  rune_hp: { name: '活力符文', desc: '全队生命上限 +6%（本轮永久）', icon: 'relic-vital_chalice' },
  rune_mag: { name: '灵思符文', desc: '全队魔法 +2（本轮永久）', icon: 'relic-sage_quill' },
  rune_heal: { name: '疗伤药剂', desc: '存活成员立即回复 20% 生命', icon: 'relic-mending_moss' },
  rune_gold: { name: '塔金钱袋', desc: '塔金 +30', icon: 'tile-gold' },
  rune_red: { name: '赤焰灵纹', desc: '匹配红色宝石时法力 +1（本轮永久）', icon: 'gem:red', color: BaseColor.Red },
  rune_blue: { name: '碧潮灵纹', desc: '匹配蓝色宝石时法力 +1（本轮永久）', icon: 'gem:blue', color: BaseColor.Blue },
  rune_green: { name: '翠叶灵纹', desc: '匹配绿色宝石时法力 +1（本轮永久）', icon: 'gem:green', color: BaseColor.Green },
  rune_yellow: { name: '金辉灵纹', desc: '匹配黄色宝石时法力 +1（本轮永久）', icon: 'gem:yellow', color: BaseColor.Yellow },
  rune_purple: { name: '紫晶灵纹', desc: '匹配紫色宝石时法力 +1（本轮永久）', icon: 'gem:purple', color: BaseColor.Purple },
  rune_brown: { name: '岩土灵纹', desc: '匹配棕色宝石时法力 +1（本轮永久）', icon: 'gem:brown', color: BaseColor.Brown },
} as const satisfies Record<string, TowerRuneDef>;
export type TowerRuneId = keyof typeof TOWER_RUNES;

/** 开局祝福（三选一） */
export const TOWER_BLESSINGS = {
  bless_gold: { name: '旅费', desc: '塔金 +70', icon: 'tile-gold' },
  bless_relic: { name: '古老馈赠', desc: '获得一件随机普通遗物', icon: 'node-treasure' },
  bless_hp: { name: '坚韧之躯', desc: '全队生命上限 +10%（本轮永久）', icon: 'relic-vital_chalice' },
  bless_atk: { name: '战意', desc: '全队攻击 +3（本轮永久）', icon: 'relic-ember_sigil' },
  bless_rare: { name: '魔鬼交易', desc: '获得一件随机稀有遗物，并背上诅咒「虚弱之面」', icon: 'relic-curse_frailty' },
  bless_color: { name: '双色共鸣', desc: '随机两种颜色：匹配时法力 +1（本轮永久）', icon: 'relic-prism_flame' },
  bless_storm: { name: '风暴印记', desc: '获得一件随机风暴遗物（开局召唤风暴）', icon: 'relic-storm_crown' },
  bless_ink: { name: '灵光乍现', desc: '获得遗物「灵感墨水」：全队以 25% 法力开战', icon: 'status:enchanted' },
} as const;
export type TowerBlessingId = keyof typeof TOWER_BLESSINGS;

/**
 * 奇遇选项。desc/label 中的 `{c0}` `{c1}` 由视图替换为本次奇遇掷出的颜色名
 * （pending.colors），cost 为塔金花费（不足时按钮置灰）。
 */
export interface TowerEventOption { label: string; desc: string; cost?: number }
export interface TowerEventDef {
  id: string;
  title: string;
  text: string;
  options: readonly TowerEventOption[];
  /** 进入时掷两种颜色（宝石熔炉） */
  colors?: 2;
  /** 最早出现的区（0 起） */
  minZone?: number;
}

export const TOWER_EVENTS: readonly TowerEventDef[] = [
  { id: 'altar', title: '被遗忘的祭坛', text: '黑曜石祭坛上刻着饥渴的符文，只要献上鲜血，它就会回赠力量。',
    options: [{ label: '献血', desc: '全队失去 15% 当前生命，获得一件稀有遗物' }, { label: '离开', desc: '什么也不发生' }] },
  { id: 'spring', title: '疗愈之泉', text: '裂隙中渗出一汪泛着银光的泉水。',
    options: [{ label: '饮下', desc: '存活成员回复 30% 生命' }, { label: '汲取精华', desc: '全队生命上限 +8%（本轮永久）' }] },
  { id: 'gambler', title: '骰子幽灵', text: '一个戴高帽的幽灵晃着骰盅：「押 40 塔金，赢了翻倍还多。」',
    options: [{ label: '下注 40 塔金', desc: '一半几率赢得 100 塔金', cost: 40 }, { label: '离开', desc: '什么也不发生' }] },
  { id: 'cursed_chest', title: '诅咒宝箱', text: '宝箱缠满黑色锁链，缝隙里透出诱人的光。',
    options: [{ label: '强行打开', desc: '获得一件稀有遗物，并背上诅咒「虚弱之面」' }, { label: '离开', desc: '什么也不发生' }] },
  { id: 'dummy', title: '训练假人', text: '一排被砍得伤痕累累的木人，仍在等待下一次挥砍。',
    options: [{ label: '苦练', desc: '全队攻击 +3（本轮永久），失去 10% 当前生命' }, { label: '小憩', desc: '存活成员回复 10% 生命' }] },
  { id: 'remains', title: '冒险者遗骸', text: '前一支登塔队伍倒在这里，行囊还没被翻动过。',
    options: [{ label: '搜刮', desc: '塔金 +45' }, { label: '安葬', desc: '全队魔法 +2（本轮永久）' }] },
  { id: 'echo', title: '裂隙回响', text: '裂隙里传来熟悉的呼唤——是倒下同伴的声音。',
    options: [{ label: '伸手召回', desc: '复活一名阵亡成员（40% 生命）；无人阵亡则全队回复 15%' }, { label: '离开', desc: '什么也不发生' }] },
  { id: 'mirror', title: '命运之镜', text: '镜中的你手握一件从未见过的宝物，身上却没了盔甲。',
    options: [{ label: '凝视', desc: '获得一件随机普通遗物，全队护甲 -2（本轮永久）' }, { label: '砸碎', desc: '塔金 +20' }] },
  { id: 'forge', title: '宝石熔炉', text: '一座仍在燃烧的宝石熔炉，炉口吞吐着两种颜色的火焰。投入塔金，它会把那股颜色熔进你的血脉。', colors: 2,
    options: [{ label: '熔炼{c0}', desc: '花费 30 塔金：匹配{c0}宝石时法力 +1（本轮永久）', cost: 30 }, { label: '熔炼{c1}', desc: '花费 30 塔金：匹配{c1}宝石时法力 +1（本轮永久）', cost: 30 }, { label: '离开', desc: '什么也不发生' }] },
  { id: 'skull_throne', title: '骷髅王座', text: '由无数头骨垒成的王座，扶手上嵌着一颗仍在跳动的末日骷髅。', minZone: 1,
    options: [{ label: '坐上王座', desc: '获得遗物「末日头骨」，并背上诅咒「急躁之咒」' }, { label: '撬下宝石', desc: '塔金 +35' }] },
  { id: 'storm_altar', title: '风暴祭坛', text: '祭坛上方悬着一团缩小的风暴，雷声在你耳边低语。',
    options: [{ label: '献上鲜血', desc: '全队失去 10% 当前生命，获得一件随机风暴遗物' }, { label: '离开', desc: '什么也不发生' }] },
  { id: 'wishing_well', title: '许愿井', text: '井底堆满了前人抛下的硬币，偶尔会有东西浮上来。',
    options: [{ label: '投入 25 塔金', desc: '50% 获得普通遗物，20% 获得稀有遗物，30% 什么也没有', cost: 25 }, { label: '离开', desc: '什么也不发生' }] },
  { id: 'spider_nest', title: '蛛巢', text: '墙角结着一张比人还高的蛛网，网心缠着一只发光的线轴。',
    options: [{ label: '伸手去拿', desc: '获得遗物「蛛丝线轴」，全队失去 10% 当前生命' }, { label: '放火烧掉', desc: '全队攻击 +2（本轮永久）' }] },
  { id: 'stopped_clock', title: '停摆的时钟', text: '一座巨大的钟停在午夜前一刻，钟摆里夹着一枚沙漏。', minZone: 1,
    options: [{ label: '拨动指针', desc: '获得遗物「时之沙漏」，全队生命上限 -6%（本轮永久）' }, { label: '拆下齿轮', desc: '塔金 +30' }] },
];

/** 数值设计（塔金/治疗/价格） */
export const TOWER_TUNING = {
  goldBattle: [15, 25],
  goldElite: [35, 45],
  goldBoss: 80,
  treasureGold: [25, 40],
  bossHealPct: 0.4,
  campRestPct: 0.35,
  campTrainAttack: 3,
  campMeditateMagic: 2,
  campRevivePct: 0.25,
  price: { common: 70, rare: 110 },
  healPrice: 45,
  healPct: 0.35,
  purgePrice: 60,
  rerollPrice: 25,
  /** 灵纹 / 熔炉给单色叠加的上限（本轮永久 banner） */
  runeBannerCap: 2,
  /** 单色旗帜法力加成的总上限（遗物 + 灵纹 + 编队旗帜） */
  bannerCap: 3,
  /** 精英「强化」：第 2、3 区各有一名精英带两个词缀，奖励只出稀有遗物、塔金 ×1.5 */
  starGoldMult: 1.5,
  /** 节点权重（首行固定战斗、倒数第二行固定营地），按区递进 */
  weights: [
    { battle: 46, event: 22, elite: 12, merchant: 8, camp: 6, treasure: 6 },
    { battle: 42, event: 22, elite: 16, merchant: 8, camp: 6, treasure: 6 },
    { battle: 40, event: 20, elite: 19, merchant: 8, camp: 7, treasure: 6 },
  ],
} as const;
