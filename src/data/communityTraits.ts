import { BaseColor } from '../engine/types';
import type { TraitDefinition } from '../engine/traits';

/** 自定义单位特质独立维护，避免被官方图鉴生成脚本覆盖。 */
export const COMMUNITY_TRAITS: readonly TraitDefinition[] = [
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
];
