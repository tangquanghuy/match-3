/**
 * 末日之塔（肉鸽爬塔）词表：区段、节点、遗物、符文、奇遇、开局祝福。全部为设计值。
 *
 * 玩法见 systems/eventModes/tower.ts：25 层分三区（8/8/9），每区一张分叉地图，
 * 玩家自己选路；战斗/精英/首领/营地/宝库/商人/奇遇七种节点；遗物改变之后每一场战斗。
 */

export type TowerNodeKind = 'battle' | 'elite' | 'boss' | 'camp' | 'treasure' | 'merchant' | 'event';

export const TOWER_ZONES = [
  { name: '沉没回廊', rows: 8, blurb: '塔基被潮水吞没的回廊，守卫尚且松散。' },
  { name: '裂隙钟楼', rows: 8, blurb: '钟声撕开时空裂隙，精英成群巡逻。' },
  { name: '末日尖顶', rows: 9, blurb: '风暴之眼下的尖顶，末日之主在王座上等待。' },
] as const;

/** 地图横向车道数（节点最多 5 列） */
export const TOWER_LANES = 5;

export const TOWER_NODE_INFO: Record<TowerNodeKind, { name: string; hint: string }> = {
  battle: { name: '战斗', hint: '普通守卫。胜利获得塔金，并从三枚符文中挑一枚。' },
  elite: { name: '精英', hint: '带词缀的强敌。胜利获得更多塔金，并从三件遗物中挑一件。' },
  boss: { name: '首领', hint: '区域守关者。击败后全队回复 40% 生命，挑一件首领遗物，进入下一区。' },
  camp: { name: '营地', hint: '三选一：休整回血、磨砺攻击、或为阵亡者招魂。' },
  treasure: { name: '宝库', hint: '必得一件遗物与一袋塔金。' },
  merchant: { name: '商人', hint: '用塔金购买遗物、治疗或驱除诅咒。' },
  event: { name: '奇遇', hint: '未知的遭遇：风险与收益并存。' },
};

/** 精英词缀（节点生成时固定，地图上可提前看到） */
export const TOWER_AFFIXES = {
  fury: { name: '狂暴', desc: '敌方攻击 +25%', attackPct: 0.25 },
  bulwark: { name: '铁壁', desc: '敌方护甲 +60%', armorPct: 0.6 },
  giant: { name: '巨化', desc: '敌方生命 +30%', hpPct: 0.3 },
  arcane: { name: '奥术', desc: '敌方魔法 +40%', magicPct: 0.4 },
} as const;
export type TowerAffix = keyof typeof TOWER_AFFIXES;

export type RelicRarity = 'common' | 'rare' | 'boss' | 'curse';

export interface RelicDef {
  id: string;
  name: string;
  desc: string;
  rarity: RelicRarity;
}

/** 遗物（效果实现见 systems/eventModes/tower.ts applyRelics） */
export const TOWER_RELICS: readonly RelicDef[] = [
  { id: 'ember_sigil', name: '余烬徽记', desc: '全队攻击 +4', rarity: 'common' },
  { id: 'iron_bulwark', name: '铁壁护符', desc: '全队护甲 +6', rarity: 'common' },
  { id: 'vital_chalice', name: '生命圣杯', desc: '全队生命上限 +12%', rarity: 'common' },
  { id: 'sage_quill', name: '贤者羽笔', desc: '全队魔法 +3', rarity: 'common' },
  { id: 'prism_flame', name: '焰阳棱镜', desc: '匹配红色、黄色宝石时法力 +1', rarity: 'common' },
  { id: 'prism_tide', name: '潮木棱镜', desc: '匹配蓝色、绿色宝石时法力 +1', rarity: 'common' },
  { id: 'prism_dusk', name: '暮土棱镜', desc: '匹配紫色、棕色宝石时法力 +1', rarity: 'common' },
  { id: 'gold_idol', name: '贪婪金像', desc: '战斗获得的塔金 +50%', rarity: 'common' },
  { id: 'surge_orb', name: '涌动宝珠', desc: '全色法力精通 +25（3 消也可能涌动翻倍）', rarity: 'rare' },
  { id: 'mending_moss', name: '愈合苔藓', desc: '每场胜利后，存活成员回复 12% 生命', rarity: 'rare' },
  { id: 'hunter_mark', name: '猎首印', desc: '与精英、首领交战时全队攻击 +25%', rarity: 'rare' },
  { id: 'ambush_horn', name: '伏击号角', desc: '敌人以 88% 生命开战', rarity: 'rare' },
  { id: 'curse_doll', name: '衰弱人偶', desc: '敌人攻击 -15%', rarity: 'rare' },
  { id: 'phoenix_feather', name: '不死鸟之羽', desc: '首次有成员阵亡的胜利后，阵亡者以 30% 生命复活（一次）', rarity: 'rare' },
  { id: 'glass_blade', name: '玻璃之刃', desc: '全队攻击 +40%，但生命上限 -20%', rarity: 'boss' },
  { id: 'titan_heart', name: '巨人之心', desc: '全队生命上限 +30%，但攻击 -10%', rarity: 'boss' },
  { id: 'storm_crown', name: '风暴王冠', desc: '全色法力精通 +50、法力 +1，但敌人攻击 +10%', rarity: 'boss' },
  { id: 'leech_fang', name: '吸血獠牙', desc: '每场胜利后存活成员回复 25% 生命，但战斗塔金减半', rarity: 'boss' },
  { id: 'curse_frailty', name: '虚弱之面', desc: '诅咒：敌人攻击 +12%。可在商人处驱除', rarity: 'curse' },
];

export function relicById(id: string): RelicDef | undefined {
  return TOWER_RELICS.find((r) => r.id === id);
}

/** 普通战斗后的三选一小奖励 */
export const TOWER_RUNES = {
  rune_atk: { name: '锋锐符文', desc: '全队攻击 +2（本轮永久）' },
  rune_arm: { name: '坚守符文', desc: '全队护甲 +3（本轮永久）' },
  rune_hp: { name: '活力符文', desc: '全队生命上限 +6%（本轮永久）' },
  rune_mag: { name: '灵思符文', desc: '全队魔法 +2（本轮永久）' },
  rune_heal: { name: '疗伤药剂', desc: '存活成员立即回复 20% 生命' },
  rune_gold: { name: '塔金钱袋', desc: '塔金 +30' },
} as const;
export type TowerRuneId = keyof typeof TOWER_RUNES;

/** 开局祝福（三选一） */
export const TOWER_BLESSINGS = {
  bless_gold: { name: '旅费', desc: '塔金 +70' },
  bless_relic: { name: '古老馈赠', desc: '获得一件随机普通遗物' },
  bless_hp: { name: '坚韧之躯', desc: '全队生命上限 +10%（本轮永久）' },
  bless_atk: { name: '战意', desc: '全队攻击 +3（本轮永久）' },
  bless_rare: { name: '魔鬼交易', desc: '获得一件随机稀有遗物，并背上诅咒「虚弱之面」' },
} as const;
export type TowerBlessingId = keyof typeof TOWER_BLESSINGS;

export interface TowerEventOption { label: string; desc: string }
export interface TowerEventDef { id: string; title: string; text: string; options: readonly TowerEventOption[] }

export const TOWER_EVENTS: readonly TowerEventDef[] = [
  { id: 'altar', title: '被遗忘的祭坛', text: '黑曜石祭坛上刻着饥渴的符文，只要献上鲜血，它就会回赠力量。',
    options: [{ label: '献血', desc: '全队失去 15% 当前生命，获得一件稀有遗物' }, { label: '离开', desc: '什么也不发生' }] },
  { id: 'spring', title: '疗愈之泉', text: '裂隙中渗出一汪泛着银光的泉水。',
    options: [{ label: '饮下', desc: '存活成员回复 30% 生命' }, { label: '汲取精华', desc: '全队生命上限 +8%（本轮永久）' }] },
  { id: 'gambler', title: '骰子幽灵', text: '一个戴高帽的幽灵晃着骰盅：「押 40 塔金，赢了翻倍还多。」',
    options: [{ label: '下注 40 塔金', desc: '一半几率赢得 100 塔金' }, { label: '离开', desc: '什么也不发生' }] },
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
  campRevivePct: 0.25,
  price: { common: 70, rare: 110 },
  healPrice: 45,
  healPct: 0.35,
  purgePrice: 60,
  /** 节点权重（首行固定战斗、倒数第二行固定营地、中段一行固定宝库） */
  weights: { battle: 45, event: 22, elite: 16, merchant: 9, camp: 8 },
} as const;
