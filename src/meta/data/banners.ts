/**
 * 王国旗帜表（M6）——官方口径：每面旗帜给「匹配某色宝石时该色额外 ±N 法力」。
 *
 * 数据来源（2026-09-18 调研）：
 *  - gowhead 原始游戏数据 `data/raw/gow-2026-09-18/kingdoms.en.json` 的 `BannerColors`
 *    字段（6 元数组，色序 [蓝,绿,红,黄,紫,棕]；2=++ 主升 +2、1=+ 副升 +1、-1=惩罚 -1），
 *    与 fandom Wiki「Banners」页 ++/+/- 记法一致；色序已用王国主题逐一交叉验证
 *    （风暴峡湾=蓝++ 冰霜、卡其尔=棕++ 矮人、白盔国=黄++ 圣骑、卡拉考斯=紫++ 亡灵…）。
 *  - 官方语义：加成按**每次匹配事件**平展生效（配 3 颗或 5 颗都 ±N），不是逐宝石；
 *    额外法力与匹配产出的法力走同一条分配管线（吃该色的未满员吸收）。
 *    官方在线版的旗帜加成还随 Kingdom Power 等级增长；本作旗帜不随等级增长。
 *  - 「天启」（天启四骑士等 5 张神话）在 gowhead 属 Sin of Maraj 同一 Kingdom 系
 *    （FileBase K34）；本作另设紫 +2、蓝 +1、黄 -1 的旗帜以区分「迈纳杰之罪」。
 *  - 「混沌」「藏宝库」是 gowhead 的事件伪王国（季节小鬼 / 宝库地精族），官方无旗帜；
 *    为让 42 王国任务链都有通关奖励，按主题补设计值（下表已标 注）。
 *
 * 解锁口径：冒险者达到对应王国的开放等级后，
 * 其旗帜可在编队页装备（见 systems/banners.ts）。
 */
import { BaseColor } from '../../engine/types';

/** 旗帜加成：色 → ±法力（键省略 = 0；值域 {-1, 1, 2}） */
export type BannerBoosts = Partial<Record<BaseColor, number>>;

export interface BannerDef {
  /** 官方英文名（gowhead kingdoms.en.json），展示与对账用 */
  en: string;
  boosts: BannerBoosts;
  /** true = gowhead 收录的王国；false = 本作补设的事件王国 */
  official: boolean;
}

/** 全 42 王国旗帜表（键 = troops.json 的 `kingdom` 字段口径），按王国推进序排列 */
export const BANNERS: Readonly<Record<string, BannerDef>> = {
  破碎尖塔: { en: 'Broken Spire', boosts: { [BaseColor.Blue]: 1, [BaseColor.Brown]: 1 }, official: true },
  阿达纳: { en: 'Adana', boosts: { [BaseColor.Red]: 1, [BaseColor.Yellow]: 1 }, official: true },
  卡拉考斯: { en: 'Karakoth', boosts: { [BaseColor.Purple]: 2 }, official: true },
  蛛尔卡里: { en: "Zhul'Kari", boosts: { [BaseColor.Green]: 1, [BaseColor.Purple]: 1 }, official: true },
  卜筮之原: { en: 'Divinion Fields', boosts: { [BaseColor.Yellow]: 1, [BaseColor.Purple]: 1 }, official: true },
  鳞雾沼泽: { en: 'Mist of Scales', boosts: { [BaseColor.Blue]: 1, [BaseColor.Red]: 1 }, official: true },
  荆棘森林: { en: 'Forest of Thorns', boosts: { [BaseColor.Green]: 2 }, official: true },
  白盔国: { en: 'Whitehelm', boosts: { [BaseColor.Yellow]: 2 }, official: true },
  潘神之谷: { en: "Pan's Vale", boosts: { [BaseColor.Green]: 1, [BaseColor.Yellow]: 1 }, official: true },
  盖塔尔: { en: 'Khetar', boosts: { [BaseColor.Blue]: 1, [BaseColor.Purple]: 1 }, official: true },
  卡其尔: { en: 'Khaziel', boosts: { [BaseColor.Brown]: 2 }, official: true },
  齐埃金: { en: 'Zaejin', boosts: { [BaseColor.Green]: 1, [BaseColor.Brown]: 1 }, official: true },
  荣耀之地: { en: 'Pridelands', boosts: { [BaseColor.Red]: 2 }, official: true },
  加尔凡尼亚: { en: 'Ghulvania', boosts: { [BaseColor.Red]: 1, [BaseColor.Purple]: 1 }, official: true },
  剑锋崖: { en: "Sword's Edge", boosts: { [BaseColor.Blue]: 1, [BaseColor.Yellow]: 1 }, official: true },
  风暴峡湾: { en: 'Stormheim', boosts: { [BaseColor.Blue]: 2 }, official: true },
  毛格瑞姆森林: { en: 'Maugrim Woods', boosts: { [BaseColor.Blue]: 1, [BaseColor.Green]: 1 }, official: true },
  葛洛什奈克: { en: 'Grosh-Nak', boosts: { [BaseColor.Red]: 1, [BaseColor.Brown]: 1 }, official: true },
  混沌: { en: 'Chaos (Event)', boosts: { [BaseColor.Green]: 1, [BaseColor.Purple]: 2 }, official: false },
  狂野平原: { en: 'Wild Plains', boosts: { [BaseColor.Green]: 1, [BaseColor.Red]: 1 }, official: true },
  黑石: { en: 'Darkstone', boosts: { [BaseColor.Purple]: 1, [BaseColor.Brown]: 1 }, official: true },
  聚沙之地: { en: 'Drifting Sands', boosts: { [BaseColor.Yellow]: 1, [BaseColor.Brown]: 1 }, official: true },
  荒芜之地: { en: 'Blighted Lands', boosts: { [BaseColor.Red]: 1, [BaseColor.Yellow]: -1, [BaseColor.Purple]: 2 }, official: true },
  冰峰之巅: { en: 'Glacial Peaks', boosts: { [BaseColor.Blue]: 2, [BaseColor.Red]: -1, [BaseColor.Purple]: 1 }, official: true },
  天启: { en: 'Sin of Maraj (Apocalypse)', boosts: { [BaseColor.Purple]: 2, [BaseColor.Blue]: 1, [BaseColor.Yellow]: -1 }, official: true },
  狮心帝国: { en: 'Leonis Empire', boosts: { [BaseColor.Blue]: 2, [BaseColor.Green]: -1, [BaseColor.Yellow]: 1 }, official: true },
  龙爪: { en: "Dragon's Claw", boosts: { [BaseColor.Red]: 2, [BaseColor.Yellow]: 1, [BaseColor.Brown]: -1 }, official: true },
  守护者: { en: 'Hall of Guardians', boosts: { [BaseColor.Green]: -1, [BaseColor.Yellow]: 2, [BaseColor.Brown]: 1 }, official: true },
  黑鹰: { en: 'Blackhawk', boosts: { [BaseColor.Blue]: 1, [BaseColor.Purple]: -1, [BaseColor.Brown]: 2 }, official: true },
  玉银林地: { en: 'Silverglade', boosts: { [BaseColor.Red]: -1, [BaseColor.Yellow]: 1, [BaseColor.Purple]: 2 }, official: true },
  日冕: { en: 'Suncrest', boosts: { [BaseColor.Blue]: -1, [BaseColor.Green]: 1, [BaseColor.Yellow]: 2 }, official: true },
  厄什卡亚: { en: 'Urskaya', boosts: { [BaseColor.Red]: 1, [BaseColor.Purple]: -1, [BaseColor.Brown]: 2 }, official: true },
  藏宝库: { en: 'The Vault (Event)', boosts: { [BaseColor.Yellow]: 2, [BaseColor.Brown]: 1 }, official: false },
  梅兰堤斯: { en: 'Merlantis', boosts: { [BaseColor.Blue]: 2, [BaseColor.Green]: 1, [BaseColor.Yellow]: -1 }, official: true },
  圣唐: { en: 'Shentang', boosts: { [BaseColor.Green]: -1, [BaseColor.Red]: 1, [BaseColor.Yellow]: 2 }, official: true },
  皓彩森林: { en: 'Bright Forest', boosts: { [BaseColor.Blue]: -1, [BaseColor.Green]: 2, [BaseColor.Purple]: 1 }, official: true },
  卓克祖: { en: 'Dhrak-Zum', boosts: { [BaseColor.Yellow]: -1, [BaseColor.Purple]: 1, [BaseColor.Brown]: 2 }, official: true },
  迈纳杰之罪: { en: 'Sin of Maraj', boosts: { [BaseColor.Red]: 2, [BaseColor.Purple]: -1, [BaseColor.Brown]: 1 }, official: true },
  沃尔帕克: { en: 'Vulpacea', boosts: { [BaseColor.Blue]: 1, [BaseColor.Green]: 2, [BaseColor.Red]: -1 }, official: true },
  诺斯: { en: 'Nexus', boosts: { [BaseColor.Blue]: 1, [BaseColor.Yellow]: -1, [BaseColor.Brown]: 2 }, official: true },
  地狱悬崖: { en: 'Hellcrag', boosts: { [BaseColor.Blue]: -1, [BaseColor.Red]: 1, [BaseColor.Brown]: 2 }, official: true },
  午夜城市: { en: 'Mydnight', boosts: { [BaseColor.Blue]: 2, [BaseColor.Green]: -1, [BaseColor.Purple]: 1 }, official: true },
};

/** 某王国的旗帜定义（无旗帜返回 null——当前表覆盖全部 42 王国，防御性保留） */
export function bannerOf(kingdom: string): BannerDef | null {
  return BANNERS[kingdom] ?? null;
}

/** 颜色展示名（屏层旗帜色签用） */
export const BANNER_COLOR_LABELS: Readonly<Record<BaseColor, string>> = {
  [BaseColor.Red]: '红',
  [BaseColor.Green]: '绿',
  [BaseColor.Blue]: '蓝',
  [BaseColor.Yellow]: '黄',
  [BaseColor.Purple]: '紫',
  [BaseColor.Brown]: '棕',
};
