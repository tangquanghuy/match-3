import huijiuPortrait from '@assets/community/huijiu.webp?url';
import { HUIJIU_SPELL_NAME } from './spellPresentation';
import erochikaPortrait from '@assets/community/erochika.webp?url';
import pingPortrait from '@assets/community/ping.webp?url';
import zhuwangPortrait from '@assets/community/zhuwang.webp?url';
import guanliObserverPortrait from '@assets/community/guanli-observer.webp?url';
import hongdiePortrait from '@assets/community/hongdie.webp?url';
import wangfengPortrait from '@assets/community/wangfeng.webp?url';
import yinshiluoPortrait from '@assets/community/yinshiluo.webp?url';
import linkongluoPortrait from '@assets/community/linkongluo.webp?url';
import annaPortrait from '@assets/community/shirakyusu-anna.webp?url';
import suPortrait from '@assets/community/su.webp?url';
import renoirPortrait from '@assets/community/renoir-sidef.webp?url';
import yeluoPortrait from '@assets/community/yeluo.webp?url';
import bailuPortrait from '@assets/community/bailu-yixi.webp?url';
import douglasPortrait from '@assets/community/douglas.webp?url';
import cialloPortrait from '@assets/community/ciallo.webp?url';
import chikoritaPortrait from '@assets/community/chikorita.webp?url';
import xingaiPortrait from '@assets/community/haoxiang-xingai.webp?url';
import liankaPortrait from '@assets/community/lianka.webp?url';
import cuixiangPortrait from '@assets/community/cuixiang-chixigua.webp?url';
import { BaseColor } from '../engine/types';
import { buildSkillMetadata } from '../engine/skills/scaling';
import type { TroopData } from './troops';
import traitsJson from './traits.json';
import { COMMUNITY_TRAITS } from './communityTraits';

export const COMMUNITY_KINGDOM = '时空裂隙';
export const COMMUNITY_RACE = 'OtherworldVisitor';
export const BAILU_YIXI_ID = 10001;
export const BAILU_YIXI_SPELL_ID = 20001;
export const DOUGLAS_ID = 10002;
export const DOUGLAS_SPELL_ID = 20002;
export const CIALLO_ID = 10003;
export const CIALLO_SPELL_ID = 20003;
export const CHIKORITA_ID = 10004;
export const CHIKORITA_SPELL_ID = 20004;
export const XINGAI_ID = 10005;
export const XINGAI_SPELL_ID = 20005;
export const LIANKA_ID = 10006;
export const LIANKA_SPELL_ID = 20006;
export const YELUO_ID = 10007;
export const YELUO_SPELL_ID = 20007;
export const RENOIR_ID = 10008;
export const RENOIR_SPELL_ID = 20008;
export const SU_ID = 10009;
export const SU_SPELL_ID = 20009;
export const SHIRAKYUSU_ANNA_ID = 10010;
export const SHIRAKYUSU_ANNA_SPELL_ID = 20010;
export const LINKONGLUO_ID = 10011;
export const LINKONGLUO_SPELL_ID = 20011;
export const YINSHILUO_ID = 10012;
export const YINSHILUO_SPELL_ID = 20012;
export const WANGFENG_ID = 10013;
export const WANGFENG_SPELL_ID = 20013;
export const GUANLI_OBSERVER_ID = 10014;
export const GUANLI_OBSERVER_SPELL_ID = 20014;
export const HONGDIE_ID = 10015;
export const HONGDIE_SPELL_ID = 20015;
export const PING_ID = 10016;
export const PING_SPELL_ID = 20016;
export const ZHUWANG_ID = 10017;
export const ZHUWANG_SPELL_ID = 20017;
export const EROCHIKA_ID = 10018;
export const EROCHIKA_SPELL_ID = 20018;
export const HUIJIU_ID = 10019;
export const HUIJIU_SPELL_ID = 20019;
export const CUIXIANG_CHIXIGUA_ID = 10020;
export const CUIXIANG_CHIXIGUA_SPELL_ID = 20020;

const huijiuDescription = '创造 3 颗混合的元素星和暗影星，数量因异界来客盟友数和蓝色宝石数而增强。至少创造 1 颗元素星和 1 颗暗影星。 [3:1]';
const cuixiangDescription = '除自身外，当前生命值最低的两名盟友各增加 [魔法 + 4] 点生命值。首位盟友再获得 [魔法] 点护甲值和屏障。';

const erochikaDescription = '对一名敌人造成 [魔法 + 2] 点真实伤害，并窃取其 2 点魔力值。将所有蓝色宝石转换为黄色宝石。';

const bailuDescription = '对一名选定敌人造成 [魔法 + 7] 点法术伤害，并使其陷入织网状态。生命值最低的盟友获得屏障。';
const douglasDescription = '对所有敌人造成 [魔法 + 3] 点法术伤害。然后爆破 3 颗随机宝石。';
const cialloDescription = '给予首位盟友 [魔法 + 1] 点攻击力和护甲值。对首位敌人造成等同于首位盟友攻击力的伤害。创造 8 颗骷髅头。';
const chikoritaDescription = '首位盟友获得 [魔法 + 3] 点攻击力。创造 23 颗混合绿色宝石和骷髅头。';

const xingaiDescription = '使一名选定敌人失去最多 6 点法力，给予法力最高的其他盟友 4 点法力，然后将所有黄色宝石转换为蓝色宝石。';

const liankaDescription = '对所有敌人造成 [魔法 + 4] 点法术伤害。棋盘上每有 4 颗红色或黄色普通宝石，对每个敌人的伤害增加 1 点。';

const yeluoDescription = '对一名选定敌人造成 [魔法 + 4] 点溅射伤害。棋盘上每有 2 颗红色或绿色普通宝石，伤害增加 1 点。若本次技能伤害击杀任意敌人，创造 10 颗随机混合的红色和绿色宝石。';

const renoirDescription = '给予所有盟友 8 点攻击力，并赋予首两位盟友反射效果。';

const suDescription = '有 50% 的几率献祭除自身外的末位盟友。对一名敌人造成 [魔法 + 5] 点伤害。若成功献祭，则造成三倍伤害，并在击杀目标后吞噬另一名随机敌人。';

const annaDescription = '消除一名敌人的所有正面增益效果，并将其击晕和冻结。然后将所有红色宝石转换成蓝色宝石。';

const linkongluoDescription = '对一名敌人造成 [魔法 + 6] 点伤害。如果敌人的生命值全满，则造成双倍伤害。创造 3 颗红色龙宝石。';

const yinshiluoDescription = '净化一名盟友，并给予其 [魔法 + 2] 点生命值。创造 1 颗绿色法力药水宝石和 1 颗紫色法力药水宝石。魅惑首位敌人。';

const wangfengDescription = '将所有红色宝石转换为紫色宝石，并将所有黄色宝石转换为棕色宝石。召唤一名触手之墙，并将其推至队首。';

const guanliObserverDescription = '创造 1 颗蓝色法力药水宝石和 1 颗紫色法力药水宝石。再爆破 4 颗随机宝石。';
const hongdieDescription = '对最后两名敌人造成 [魔法 + 3] 点伤害，并使其陷入沉默状态。耗掉其各 3 点法力值，再打乱敌方队伍顺序。';

const pingDescription = '摧毁所有选定颜色的宝石。对所有使用该颜色的敌人造成 [魔法 + 4] 点伤害，并耗掉其各 4 点法力值。若摧毁了至少 10 颗该色宝石，则获得一个额外回合。';
const zhuwangDescription = '创造 6 颗红色宝石。选择一名其他盟友，有 25% 的几率将其转化为装甲小野猪，再给予其 [魔法 + 3] 点攻击力。若施法时棋盘上有 13 颗或更多红色宝石，则有等同于自身攻击力的几率将一名随机敌人转化为装甲小野猪，最高 50%。[1:1]';

function communityTraits(codes: readonly string[]) {
  return codes.map((code) => {
    const trait = [...traitsJson, ...COMMUNITY_TRAITS].find((entry) => entry.code === code);
    if (!trait) throw new Error(`缺少异界部队特质：${code}`);
    return { code: trait.code, name: trait.name, description: trait.description };
  });
}

export const COMMUNITY_TROOPS: readonly TroopData[] = [
  {
    id: BAILU_YIXI_ID,
    name: '白鹭依晞',
    referenceName: 'BaiLuYiXi',
    rarity: 'UltraRare',
    rarityIdx: 3,
    kingdom: COMMUNITY_KINGDOM,
    troopTypes: [COMMUNITY_RACE],
    role: 'Warlock',
    attack: 16,
    armor: 22,
    health: 28,
    magic: 9,
    base: { attack: 4, armor: 6, health: 10, magic: 1 },
    manaColors: [BaseColor.Blue, BaseColor.Purple],
    manaCost: 13,
    spell: {
      id: BAILU_YIXI_SPELL_ID,
      name: '离岸封函',
      description: bailuDescription,
      meta: buildSkillMetadata(bailuDescription),
    },
    traits: communityTraits(['waterlink', 'stealthy', 'bailu_tide_suppression']),
    portrait: null,
    artUrl: bailuPortrait,
  },
  {
    id: DOUGLAS_ID,
    name: 'Douglas',
    referenceName: 'Douglas',
    rarity: 'Epic',
    rarityIdx: 4,
    kingdom: COMMUNITY_KINGDOM,
    troopTypes: [COMMUNITY_RACE],
    role: 'Mage',
    attack: 16,
    armor: 17,
    health: 30,
    magic: 10,
    base: { attack: 4, armor: 3, health: 7, magic: 1 },
    manaColors: [BaseColor.Green, BaseColor.Blue, BaseColor.Purple],
    manaCost: 16,
    spell: {
      id: DOUGLAS_SPELL_ID,
      name: '拿铁涟漪',
      description: douglasDescription,
      meta: buildSkillMetadata(douglasDescription),
    },
    traits: communityTraits(['naturelink', 'insulated', 'douglas_blue_lightning']),
    portrait: null,
    artUrl: douglasPortrait,
  },
  {
    id: CIALLO_ID,
    name: 'ciallo',
    referenceName: 'ciallo',
    rarity: 'Epic',
    rarityIdx: 4,
    kingdom: COMMUNITY_KINGDOM,
    troopTypes: [COMMUNITY_RACE],
    role: 'Warmaster',
    attack: 18,
    armor: 17,
    health: 29,
    magic: 10,
    base: { attack: 5, armor: 3, health: 7, magic: 1 },
    manaColors: [BaseColor.Blue, BaseColor.Yellow],
    manaCost: 15,
    spell: {
      id: CIALLO_SPELL_ID,
      name: '双龙助阵',
      description: cialloDescription,
      meta: buildSkillMetadata(cialloDescription),
    },
    traits: communityTraits(['dragonbond', 'toughscales', 'songoflight']),
    portrait: null,
    artUrl: cialloPortrait,
  },
  {
    id: CHIKORITA_ID,
    name: '四脚萝卜怪',
    referenceName: 'Chikorita',
    rarity: 'Legendary',
    rarityIdx: 5,
    kingdom: COMMUNITY_KINGDOM,
    troopTypes: [COMMUNITY_RACE],
    role: 'Warmaster',
    attack: 19,
    armor: 16,
    health: 31,
    magic: 9,
    base: { attack: 6, armor: 4, health: 9, magic: 1 },
    manaColors: [BaseColor.Green, BaseColor.Blue, BaseColor.Red],
    manaCost: 21,
    spell: {
      id: CHIKORITA_SPELL_ID,
      name: '青草场地',
      description: chikoritaDescription,
      meta: buildSkillMetadata(chikoritaDescription),
    },
    traits: communityTraits(['firelink', 'armored', 'counterflame']),
    portrait: null,
    artUrl: chikoritaPortrait,
  },
  {
    id: XINGAI_ID,
    name: '好想星艾',
    referenceName: 'HaoXiangXingAi',
    rarity: 'UltraRare',
    rarityIdx: 3,
    kingdom: COMMUNITY_KINGDOM,
    troopTypes: [COMMUNITY_RACE],
    role: null,
    attack: 15,
    armor: 13,
    health: 29,
    magic: 0,
    base: { attack: 4, armor: 3, health: 8, magic: 0 },
    manaColors: [BaseColor.Yellow, BaseColor.Red],
    manaCost: 13,
    spell: {
      id: XINGAI_SPELL_ID,
      name: '法力征调',
      description: xingaiDescription,
      meta: buildSkillMetadata(xingaiDescription),
    },
    traits: communityTraits(['xingai_star_charge', 'manashield', 'empowered']),
    portrait: null,
    artUrl: xingaiPortrait,
  },
  {
    id: LIANKA_ID,
    name: 'Lianka',
    referenceName: 'Lianka',
    rarity: 'Epic',
    rarityIdx: 4,
    kingdom: COMMUNITY_KINGDOM,
    troopTypes: [COMMUNITY_RACE],
    role: 'Mage',
    attack: 16,
    armor: 17,
    health: 30,
    magic: 10,
    base: { attack: 4, armor: 3, health: 7, magic: 1 },
    manaColors: [BaseColor.Red, BaseColor.Yellow],
    manaCost: 15,
    spell: {
      id: LIANKA_SPELL_ID,
      name: '日轮坠灭',
      description: liankaDescription,
      meta: buildSkillMetadata(liankaDescription),
    },
    traits: communityTraits(['lianka_unquenched', 'lianka_obsidian_robes', 'lianka_eclipse_flame']),
    portrait: null,
    artUrl: liankaPortrait,
  },
  {
    id: YELUO_ID,
    name: '叶落',
    referenceName: 'YeLuo',
    rarity: 'Epic',
    rarityIdx: 4,
    kingdom: COMMUNITY_KINGDOM,
    troopTypes: [COMMUNITY_RACE],
    role: 'Assassin',
    attack: 17,
    armor: 18,
    health: 26,
    magic: 11,
    base: { attack: 4, armor: 4, health: 6, magic: 1 },
    manaColors: [BaseColor.Red, BaseColor.Green],
    manaCost: 12,
    spell: {
      id: YELUO_SPELL_ID,
      name: '猩红谢幕',
      description: yeluoDescription,
      meta: buildSkillMetadata(yeluoDescription),
    },
    traits: communityTraits(['yeluo_blood_vitality', 'yeluo_night_armor', 'yeluo_crimson_moon']),
    portrait: null,
    artUrl: yeluoPortrait,
  },
  {
    id: RENOIR_ID,
    name: "ℛℯ𝓃ℴ𝒾𝓇 [→ sideF →]",
    referenceName: 'RenoirSideF',
    rarity: 'Epic',
    rarityIdx: 4,
    kingdom: COMMUNITY_KINGDOM,
    troopTypes: [COMMUNITY_RACE],
    role: 'Support',
    attack: 15,
    armor: 17,
    health: 31,
    magic: 10,
    base: { attack: 4, armor: 3, health: 8, magic: 1 },
    manaColors: [BaseColor.Blue, BaseColor.Yellow, BaseColor.Purple],
    manaCost: 14,
    spell: {
      id: RENOIR_SPELL_ID,
      name: '镜月蝶影',
      description: renoirDescription,
      meta: buildSkillMetadata(renoirDescription),
    },
    traits: communityTraits(['waterlink', 'spellarmor', 'renoir_butterfly_dance']),
    portrait: null,
    artUrl: renoirPortrait,
  },
  {
    id: SU_ID,
    name: '苏',
    referenceName: 'Su',
    rarity: 'UltraRare',
    rarityIdx: 3,
    kingdom: COMMUNITY_KINGDOM,
    troopTypes: [COMMUNITY_RACE],
    role: 'Mage',
    attack: 17,
    armor: 13,
    health: 24,
    magic: 10,
    base: { attack: 4, armor: 3, health: 5, magic: 1 },
    manaColors: [BaseColor.Purple, BaseColor.Brown],
    manaCost: 12,
    spell: {
      id: SU_SPELL_ID,
      name: '狂乱献礼',
      description: suDescription,
      meta: buildSkillMetadata(suDescription),
    },
    traits: communityTraits(['stonelink', 'arcane', 'cursedaura']),
    portrait: null,
    artUrl: suPortrait,
  },
  {
    id: SHIRAKYUSU_ANNA_ID,
    name: 'Shirakyusu Anna',
    referenceName: 'Shirakyusu Anna',
    rarity: 'UltraRare',
    rarityIdx: 3,
    kingdom: COMMUNITY_KINGDOM,
    troopTypes: [COMMUNITY_RACE],
    role: 'Generator',
    attack: 15,
    armor: 11,
    health: 28,
    magic: 0,
    base: { attack: 3, armor: 2, health: 7, magic: 0 },
    manaColors: [BaseColor.Blue, BaseColor.Purple],
    manaCost: 11,
    spell: {
      id: SHIRAKYUSU_ANNA_SPELL_ID,
      name: '静海结界',
      description: annaDescription,
      meta: buildSkillMetadata(annaDescription),
    },
    traits: communityTraits(['waterheart', 'waterlink', 'songofice']),
    portrait: null,
    artUrl: annaPortrait,
  },
  {
    id: LINKONGLUO_ID,
    name: '霖空洛',
    referenceName: 'LinKongLuo',
    rarity: 'UltraRare',
    rarityIdx: 3,
    kingdom: COMMUNITY_KINGDOM,
    troopTypes: [COMMUNITY_RACE, 'Dragon'],
    role: 'Assassin',
    attack: 19,
    armor: 13,
    health: 22,
    magic: 10,
    base: { attack: 5, armor: 3, health: 4, magic: 1 },
    manaColors: [BaseColor.Purple, BaseColor.Red],
    manaCost: 11,
    spell: {
      id: LINKONGLUO_SPELL_ID,
      name: '绯翼突袭',
      description: linkongluoDescription,
      meta: buildSkillMetadata(linkongluoDescription),
    },
    traits: communityTraits(['agile', 'fast', 'bloodlust']),
    portrait: null,
    artUrl: linkongluoPortrait,
  },
  {
    id: YINSHILUO_ID,
    name: '銀蒔蘿',
    referenceName: 'YinShiLuo',
    rarity: 'UltraRare',
    rarityIdx: 3,
    kingdom: COMMUNITY_KINGDOM,
    troopTypes: [COMMUNITY_RACE, 'Elf'],
    role: 'Support',
    attack: 13,
    armor: 15,
    health: 28,
    magic: 10,
    base: { attack: 3, armor: 3, health: 7, magic: 1 },
    manaColors: [BaseColor.Green, BaseColor.Purple],
    manaCost: 12,
    spell: {
      id: YINSHILUO_SPELL_ID,
      name: '花露秘酿',
      description: yinshiluoDescription,
      meta: buildSkillMetadata(yinshiluoDescription),
    },
    traits: communityTraits(['naturespirit', 'spellarmor', 'magiclink']),
    portrait: null,
    artUrl: yinshiluoPortrait,
  },
  {
    id: WANGFENG_ID,
    name: 'WangFeng',
    referenceName: 'WangFeng',
    rarity: 'Epic',
    rarityIdx: 4,
    kingdom: COMMUNITY_KINGDOM,
    troopTypes: [COMMUNITY_RACE],
    role: 'Generator',
    attack: 15,
    armor: 17,
    health: 30,
    magic: 10,
    base: { attack: 4, armor: 4, health: 6, magic: 1 },
    manaColors: [BaseColor.Purple, BaseColor.Brown],
    manaCost: 16,
    spell: {
      id: WANGFENG_SPELL_ID,
      name: '禁典开扉',
      description: wangfengDescription,
      meta: buildSkillMetadata(wangfengDescription),
    },
    traits: communityTraits(['inscribed', 'darkancestry', 'songofdarkness']),
    portrait: null,
    artUrl: wangfengPortrait,
  },
  {
    id: GUANLI_OBSERVER_ID,
    name: '管理组重点观察对象',
    referenceName: 'GuanliObserver',
    rarity: 'Legendary',
    rarityIdx: 5,
    kingdom: COMMUNITY_KINGDOM,
    troopTypes: [COMMUNITY_RACE],
    role: 'Generator',
    attack: 18,
    armor: 20,
    health: 34,
    magic: 8,
    base: { attack: 4, armor: 4, health: 8, magic: 1 },
    manaColors: [BaseColor.Green, BaseColor.Blue, BaseColor.Purple],
    manaCost: 26,
    spell: {
      id: GUANLI_OBSERVER_SPELL_ID,
      name: '灵泉凝露',
      description: guanliObserverDescription,
      meta: buildSkillMetadata(guanliObserverDescription),
    },
    traits: communityTraits(['waterheart', 'manashield', 'guanli_hidden_scale_surge']),
    portrait: null,
    artUrl: guanliObserverPortrait,
  },
  {
    id: HONGDIE_ID,
    name: '虹蝶',
    referenceName: 'HongDie',
    rarity: 'UltraRare',
    rarityIdx: 3,
    kingdom: COMMUNITY_KINGDOM,
    troopTypes: [COMMUNITY_RACE],
    role: 'Warlock',
    attack: 15,
    armor: 14,
    health: 25,
    magic: 10,
    base: { attack: 3, armor: 3, health: 6, magic: 1 },
    manaColors: [BaseColor.Red, BaseColor.Blue, BaseColor.Purple],
    manaCost: 12,
    spell: {
      id: HONGDIE_SPELL_ID,
      name: '夜蝶迷踪',
      description: hongdieDescription,
      meta: buildSkillMetadata(hongdieDescription),
    },
    traits: communityTraits(['magiclink', 'alert', 'arcane']),
    portrait: null,
    artUrl: hongdiePortrait,
  },
  {
    id: PING_ID,
    name: '苹',
    referenceName: 'Ping',
    rarity: 'Legendary',
    rarityIdx: 5,
    kingdom: COMMUNITY_KINGDOM,
    troopTypes: [COMMUNITY_RACE],
    role: 'Support',
    attack: 18,
    armor: 20,
    health: 34,
    magic: 8,
    base: { attack: 4, armor: 4, health: 8, magic: 1 },
    manaColors: [BaseColor.Red, BaseColor.Purple, BaseColor.Brown],
    manaCost: 22,
    spell: { id: PING_SPELL_ID, name: '夜色流转', description: pingDescription, meta: buildSkillMetadata(pingDescription) },
    traits: communityTraits(['firelink', 'ping_evernight', 'ping_nightsong']),
    portrait: null,
    artUrl: pingPortrait,
  },
  {
    id: ZHUWANG_ID,
    name: 'zhuwang',
    referenceName: 'Zhuwang',
    rarity: 'UltraRare',
    rarityIdx: 3,
    kingdom: COMMUNITY_KINGDOM,
    troopTypes: [COMMUNITY_RACE],
    role: 'Support',
    attack: 15,
    armor: 13,
    health: 26,
    magic: 10,
    base: { attack: 3, armor: 3, health: 6, magic: 1 },
    manaColors: [BaseColor.Green, BaseColor.Yellow, BaseColor.Brown],
    manaCost: 15,
    spell: { id: ZHUWANG_SPELL_ID, name: '猪猪变身术', description: zhuwangDescription, meta: buildSkillMetadata(zhuwangDescription) },
    traits: communityTraits(['stonelink', 'frenzy', 'armored']),
    portrait: null,
    artUrl: zhuwangPortrait,
  },
  {
    id: EROCHIKA_ID,
    name: 'Erochika',
    referenceName: 'Erochika',
    rarity: 'UltraRare',
    rarityIdx: 3,
    kingdom: COMMUNITY_KINGDOM,
    troopTypes: [COMMUNITY_RACE],
    role: 'Mage',
    attack: 13,
    armor: 14,
    health: 27,
    magic: 10,
    base: { attack: 3, armor: 3, health: 6, magic: 1 },
    manaColors: [BaseColor.Purple, BaseColor.Yellow],
    manaCost: 12,
    spell: {
      id: EROCHIKA_SPELL_ID,
      name: '秋庭扫叶',
      description: erochikaDescription,
      meta: buildSkillMetadata(erochikaDescription),
    },
    traits: communityTraits(['airlink', 'invigorated', 'bornoflight']),
    portrait: null,
    artUrl: erochikaPortrait,
  },
  {
    id: HUIJIU_ID,
    name: '灰鸠',
    referenceName: 'Huijiu',
    rarity: 'UltraRare',
    rarityIdx: 3,
    kingdom: COMMUNITY_KINGDOM,
    troopTypes: [COMMUNITY_RACE],
    role: 'Generator',
    attack: 12,
    armor: 14,
    health: 29,
    magic: 5,
    base: { attack: 3, armor: 3, health: 7, magic: 1 },
    manaColors: [BaseColor.Blue, BaseColor.Purple],
    manaCost: 14,
    spell: {
      id: HUIJIU_SPELL_ID,
      name: HUIJIU_SPELL_NAME,
      description: huijiuDescription,
      meta: buildSkillMetadata(huijiuDescription),
    },
    traits: communityTraits(['huijiu_listen_rain', 'huijiu_refill_cup', 'huijiu_farewell']),
    portrait: null,
    artUrl: huijiuPortrait,
  },
  {
    id: CUIXIANG_CHIXIGUA_ID,
    name: '翠香吃西瓜',
    referenceName: 'CuixiangChixigua',
    rarity: 'UltraRare',
    rarityIdx: 3,
    kingdom: COMMUNITY_KINGDOM,
    troopTypes: [COMMUNITY_RACE],
    role: 'Support',
    attack: 13,
    armor: 15,
    health: 28,
    magic: 8,
    base: { attack: 3, armor: 3, health: 7, magic: 1 },
    manaColors: [BaseColor.Green, BaseColor.Yellow],
    manaCost: 13,
    spell: {
      id: CUIXIANG_CHIXIGUA_SPELL_ID,
      name: '史莱姆抱枕',
      description: cuixiangDescription,
      meta: buildSkillMetadata(cuixiangDescription),
    },
    traits: communityTraits(['cuixiang_slime_care', 'cuixiang_vine_dream', 'cuixiang_green_nap']),
    portrait: null,
    artUrl: cuixiangPortrait,
  },
];
