import { BaseColor } from '../engine/types';
import type { TraitDefinition } from '../engine/traits';

/** 自定义单位特质独立维护，避免被官方图鉴生成脚本覆盖。 */
export const COMMUNITY_TRAITS: readonly TraitDefinition[] = [
  {
    code: 'cuixiang_slime_care',
    name: '软泥照护',
    description: '当一名盟友施放法术时，所有盟友获得 1 点生命值。',
    onAllyCastTypeAura: { troopType: 'all', gains: { hp: 1 } },
  },
  {
    code: 'cuixiang_vine_dream',
    name: '藤梦',
    description: '在我的回合开始时，创造 1 颗缠绕宝石。',
    turnStartCreateSpecialGem: { gem: 'entangleGem', count: 1 },
  },
  {
    code: 'cuixiang_green_nap',
    name: '绿意小憩',
    description: '在配对绿色宝石时获得法印效果。',
    onColorMatchStatus: { color: BaseColor.Green, scope: 'self', statuses: [{ id: 'enchanted' }], turns: 3 },
  },
  {
    code: 'bailu_tide_suppression',
    name: '潮汐压制',
    description: '配对 4 或 5 颗宝石时，所有敌人损失 2 点攻击力。',
    onBigMatchEnemyDrain: { stat: 'attack', amount: 2, scope: 'allEnemies' },
  },
  {
    code: 'douglas_blue_lightning',
    name: '蓝电回响',
    description: '在我的回合开始时，创造 1 颗蓝色闪电宝石。',
    turnStartCreateSpecialGem: { gem: 'lightningRow', count: 1 },
  },
  {
    code: 'xingai_star_charge',
    name: '星跃后援',
    description: '如果处于末位，所有盟友获得 2 点全部技能值。',
    positionAura: { position: 'last', scope: 'allAllies', gains: { hp: 2, armor: 2, attack: 2, magic: 2 } },
  },
  {
    code: 'ping_nightsong',
    name: '夜曲',
    description: '所有紫色盟友在我的回合开始时获得 2 点生命值和魔力值。',
    turnStartTypeAura: { scope: 'Purple', gains: { hp: 2, magic: 2 } },
  },
  {
    code: 'huijiu_listen_rain',
    name: '听雨',
    description: '受到敌人造成的骷髅头伤害时，使对方陷入沉默状态。',
    inflictOnSkullDamaged: { id: 'silence', turns: 3 },
  },
  {
    code: 'huijiu_refill_cup',
    name: '续盏',
    description: '配对 4 颗或更多宝石时，给予所有盟友 1 点生命值。',
    onBigMatchTypeAura: { troopType: 'all', gains: { hp: 1 } },
  },
  {
    code: 'huijiu_farewell',
    name: '辞旧',
    description: '自身身亡时，使一名随机盟友获得其法力上限一半的法力值。',
    onSelfDeathFillAllyMana: true,
  },
  {
    code: 'ping_evernight',
    name: '永夜',
    description: '我的回合开始时，召唤暗风暴。',
    turnStartStorm: { referenceName: 'Darkstorm', displayName: '暗风暴', colors: [BaseColor.Purple] },
  },
  {
    code: 'counterflame',
    name: '逆焰之力',
    description: '在配对红色宝石时，自身获得 2 点攻击力和 1 点护甲值。',
    onColorMatchGains: [
      { color: 'Red', stat: 'attack', amount: 2 },
      { color: 'Red', stat: 'armor', amount: 1 },
    ],
  },
  {
    code: 'lianka_unquenched',
    name: '不熄之躯',
    description: '免疫燃烧和妖火。',
    statusImmunities: ['burning', 'faerie-fire'],
  },
  {
    code: 'lianka_obsidian_robes',
    name: '黑曜法衣',
    description: '受到的法术伤害降低 25%。',
    spellDamageReduction: 0.25,
  },
  {
    code: 'lianka_eclipse_flame',
    name: '蚀日魔焰',
    description: '匹配 4 颗或更多宝石时，使一名随机敌人陷入妖火状态，持续 3 回合。',
    onBigMatchStatus: {
      scope: 'randomEnemy',
      statuses: [{ id: 'faerie-fire' }],
      turns: 3,
    },
  },
  {
    code: 'yeluo_blood_vitality',
    name: '血色生机',
    description: '配对 4 颗或更多宝石时，自身获得 2 点生命值。',
    onBigMatchGain: { stat: 'hp', amount: 2 },
  },
  {
    code: 'yeluo_night_armor',
    name: '夜铸轻甲',
    description: '受到的骷髅伤害降低 25%。',
    skullDamageReduction: 0.25,
  },
  {
    code: 'yeluo_crimson_moon',
    name: '赤月留痕',
    description: '配对红色宝石时，使一名随机敌人获得 1 层流血。',
    onColorMatchStatus: {
      color: BaseColor.Red,
      scope: 'randomEnemy',
      statuses: [{ id: 'bleed', magnitude: 1 }],
      turns: 3,
    },
  },
  {
    code: 'renoir_butterfly_dance',
    name: '蝶舞',
    description: '在配对 4 或更多宝石时，给予所有盟友 2 点攻击力。',
    onBigMatchTypeAura: { troopType: 'all', gains: { attack: 2 } },
  },
  {
    code: 'guanli_hidden_scale_surge',
    name: '潜鳞惊澜',
    description: '配对 4 颗或更多宝石时，爆破 2 颗随机宝石。',
    onBigMatchExplodeGem: { kind: 'random', count: 2, minSize: 4 },
  },
];
