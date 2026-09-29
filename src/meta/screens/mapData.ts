/**
 * 世界地图的表现层数据（节点坐标 / 纹章 / 立绘 / 徽记），自视觉小样 v5 原样转入。
 * 运行时状态（等级/任务进度/进贡/解锁）一律以 kingdoms.ts + 存档为准——本文件
 * 只回答「这个王国画在哪里、长什么样」。
 */
import { allKingdoms } from '../data/kingdoms';

export const SHAPES: Record<string, string> = {
  heater: 'M50 7 L88 20 V54 C88 76 68 91 50 97 C32 91 12 76 12 54 V20 Z',
  kite: 'M50 6 L90 30 L74 94 L50 99 L26 94 L10 30 Z',
  round: 'M50 8 C78 8 90 28 90 52 C90 76 68 92 50 98 C32 92 10 76 10 52 C10 28 22 8 50 8 Z',
  hex: 'M50 7 L86 26 V70 L50 93 L14 70 V26 Z',
  tower: 'M20 16 H36 V10 H64 V16 H80 V40 L88 50 V90 H12 V50 L20 40 Z',
};

export const EMBLEMS: Record<string, string> = {
  spire: 'M9 20V8l3-4 3 4v12M7 20h10M12 8v12',
  gear: 'M12 8a4 4 0 100 8 4 4 0 000-8zm0-5v3m0 12v3M4 12h3m10 0h3M6 6l2 2m8 8 2 2M6 18l2-2m8-8 2-2',
  horn: 'M6 19c2-8 4-12 10-14 1 6-2 10-6 12m8-12c4 3 5 9 2 14',
  spider: 'M12 10a3 3 0 100 6 3 3 0 000-6zM4 8l5 4m11-4-5 4M3 14h6m6 0h6M6 20l4-4m4 0 4 4',
  eye: 'M3 12s3-6 9-6 9 6 9 6-3 6-9 6-9-6-9-6zm9-3a3 3 0 100 6 3 3 0 000-6z',
  serpent: 'M5 16c4-8 10-2 14-8M8 18c2-2 6 1 9-3',
  thorn: 'M12 3v18M8 8l4 4 4-4M7 14l5 5 5-5',
  helm: 'M5 14c0-5 3-9 7-9s7 4 7 9v4H5zm3 4h8M9 14h.01M15 14h.01',
  goat: 'M4 8l5 4h6l5-4-2 8-7 6-7-6zM8 8V4m8 4V4',
  hammer: 'M4 8h10l2-3 4 4-3 2v9H13V11H4z',
  worm: 'M4 14c3-6 7-2 8 2 1 4 5 4 8-1',
  frog: 'M5 14c0-4 3-7 7-7s7 3 7 7v4H5zm3-1h.01M16 13h.01M8 18h8',
  sun: 'M12 8a4 4 0 100 8 4 4 0 000-8zm0-5v2m0 14v2M4 12h2m12 0h2M6 6l1.5 1.5M16.5 16.5 18 18M6 18l1.5-1.5M16.5 7.5 18 6',
  bat: 'M3 12c4-2 5 2 9 2s5-4 9-2c-2 5-6 8-9 8s-7-3-9-8zM10 8l2 2 2-2',
  sword: 'M12 3l2 8-2 11-2-11zM8 11h8',
  bolt: 'M13 3L6 13h6l-1 8 8-12h-6z',
  oak: 'M12 21V11M7 12c-3-2-2-7 3-7 0-3 6-3 6 0 4 0 5 5 2 7',
  tusk: 'M7 8c0-3 10-3 10 2 0 6-4 10-5 11M6 14c-3 1-3 5 0 6',
  chaos: 'M12 3v18M5 7l14 10M19 7L5 17',
  beast: 'M4 7l4 3h8l4-3-1 8-7 7-7-7z',
  mountain: 'M3 18l6-10 3 5 4-7 5 12H3z',
  dune: 'M3 16c4-6 8-4 10 0 3-5 6-3 8 0v3H3z',
  skull: 'M8 19h8M9 16v3m6-3v3M8 9a4 4 0 018 0c0 3-2 5-2 6H10c0-1-2-3-2-6z',
  ice: 'M12 3v18M6 8l6 3 6-3M6 16l6-3 6 3',
  apocalypse: 'M12 4l8 14H4zM12 10v4m0 3h.01',
  lion: 'M6 10c0-4 12-4 12 1 0 4-3 6-6 7v3M8 12h.01M16 12h.01',
  dragon: 'M4 16c3-8 8-9 14-6-2 3-5 4-8 4m4-4 4-4M8 16c1 3 4 4 8 3',
  wing: 'M4 18c8-2 10-10 8-14 6 4 8 10 6 14-4-2-8-2-14 0z',
  eagle: 'M4 14c5-8 11-8 16 0M8 14l4 6 4-6',
  tree: 'M12 21V12M6 13c-2-5 4-9 6-9s8 4 6 9',
  sunburst: 'M12 7v10M7 12h10M8 8l8 8M16 8l-8 8',
  mammoth: 'M5 16c1-6 5-8 9-6 3 1 5 4 5 7H5zm2 0v4m10-4 3 4',
  chest: 'M4 10V8a6 4 0 0116 0v2M3 10h18v10H3zM10 10v4h4v-4',
  wave: 'M3 14c3-4 5 0 8 0s5-4 8 0M3 18c3-4 5 0 8 0s5-4 8 0',
  bird: 'M5 14c6-8 12-6 15 2-5 1-8 3-10 7-1-3-3-4-5-5z',
  flower: 'M12 12a3 3 0 100.01M12 5v3m0 8v3M5 12h3m8 0h3M7 7l2 2m6 6 2 2M7 17l2-2m6-6 2-2',
  rock: 'M6 18l3-10 5-3 5 6 1 7H6z',
  invert: 'M12 21V8M6 12l6-8 6 8',
  wolf: 'M4 6l6 4h4l6-4-1 8-7 8-7-8zM9 12h.01M15 12h.01',
  spirit: 'M12 4c4 6-2 6 0 10 4 0 6 4 0 8-6-4-4-8 0-8 2-4-4-4 0-10z',
  flame: 'M12 3c1 5 6 6 4 11 4 0 5 6-4 8-8-2-8-8-3-9 0-4 2-7 3-10z',
  moon: 'M14 4a8 8 0 100 16 8 8 0 01-1-16z',
};

export const ENAMEL: Record<string, [string, string]> = {
  spire: ['#3d4458', '#1c2230'],
  ice: ['#6f8698', '#2a3c4c'],
  forest: ['#35563d', '#1a2c20'],
  desert: ['#8a6236', '#3d2814'],
  gothic: ['#4a2c44', '#1c1018'],
  swamp: ['#3b5440', '#1a261c'],
};

export const METAL: Record<string, [string, string, string]> = {
  gold: ['#8f6c37', '#f0d99c', '#9d763e'],
  silver: ['#6d7480', '#e4e8ec', '#8b9198'],
  copper: ['#7a4a28', '#e2b07a', '#8d5a32'],
};

export const ART: Record<string, string> = {
  spire: '/static/kingdoms/spire.webp',
  ice: '/static/kingdoms/ice.webp',
  forest: '/static/kingdoms/forest.webp',
  desert: '/static/kingdoms/desert.webp',
  gothic: '/static/kingdoms/gothic.webp',
  swamp: '/static/kingdoms/forest.webp',
};

/** 王国立绘分类（未知王国按推进序轮转取一个 biome） */
const BIOMES = ['spire', 'forest', 'ice', 'desert', 'gothic', 'swamp'] as const;

export interface KingdomView {
  /** 王国名（= troops.json kingdom 字段 = 存档键） */
  name: string;
  en: string;
  x: number;
  y: number;
  biome: string;
  emblem: string;
  shape: string;
  metal: string;
  blurb: string;
  /** 纹章贴图（无则程序化画盾徽） */
  crest: string | null;
  /** 是否带「主场」标记（重定位到 HOME 坐标的王国） */
  hero: boolean;
}

interface ViewSeed {
  name: string;
  en: string;
  x: number;
  y: number;
  biome: string;
  emblem: string;
  shape: string;
  metal: string;
  blurb: string;
  crest?: string;
}

/** 小样里的 42 王国布局种子（按 name 与真实数据对表） */
const SEEDS: ViewSeed[] = [
  { name: '破碎尖塔', en: 'BROKEN SPIRE', x: 48.2, y: 46.4, biome: 'spire', emblem: 'spire', shape: 'heater', metal: 'gold', crest: '/static/crests/spire.webp', blurb: '古尖塔自裂隙中重生。王国的风暴为全体部队预备生命加护。' },
  { name: '阿达纳', en: 'ADANA', x: 35.6, y: 49.8, biome: 'spire', emblem: 'gear', shape: 'hex', metal: 'silver', crest: '/static/crests/adana.webp', blurb: '齿轮与蒸汽的边境城邦，旗帜双色偏红与棕。' },
  { name: '卡拉考斯', en: 'KARAKOTH', x: 37.4, y: 79.5, biome: 'gothic', emblem: 'horn', shape: 'kite', metal: 'gold', crest: '/static/crests/karakoth.webp', blurb: '魔典与魔像沉睡的南境。' },
  { name: '蛛尔卡里', en: "ZHUL'KARI", x: 33.8, y: 61.2, biome: 'swamp', emblem: 'spider', shape: 'round', metal: 'gold', crest: '/static/crests/zhul.webp', blurb: '蛛网覆盖的暗林。任务链通关后解锁对应职业。' },
  { name: '卜筮之原', en: "DIVINER'S LANDS", x: 26.4, y: 42.0, biome: 'forest', emblem: 'eye', shape: 'heater', metal: 'gold', crest: '/static/crests/diviner.webp', blurb: '神谕原野。旗帜偏向黄与紫。' },
  { name: '鳞雾沼泽', en: 'SCALEFEN', x: 27.8, y: 68.4, biome: 'swamp', emblem: 'serpent', shape: 'kite', metal: 'gold', crest: '/static/crests/swamp.webp', blurb: '雾气终年不散的鳞类栖地。' },
  { name: '荆棘森林', en: 'THORNWOOD', x: 16.6, y: 56.5, biome: 'forest', emblem: 'thorn', shape: 'heater', metal: 'gold', crest: '/static/crests/thorn.webp', blurb: '带刺的密林，护甲加成绑定于此。' },
  { name: '白盔国', en: 'WHITEHELM', x: 40.4, y: 27.2, biome: 'ice', emblem: 'helm', shape: 'tower', metal: 'silver', crest: '/static/crests/helm.webp', blurb: '北境骑士团的雪原要塞。' },
  { name: '潘神之谷', en: "PAN'S VALE", x: 14.2, y: 44.6, biome: 'forest', emblem: 'goat', shape: 'round', metal: 'gold', crest: '/static/crests/pan.webp', blurb: '牧神仍在谷中吹笛。' },
  { name: '盖塔尔', en: 'GHANTAL', x: 71.6, y: 31.8, biome: 'desert', emblem: 'hammer', shape: 'hex', metal: 'copper', crest: '/static/crests/gautal.webp', blurb: '山脊上的锻造氏族。' },
  { name: '卡其尔', en: 'KHAIRAL', x: 85.8, y: 41.6, biome: 'desert', emblem: 'worm', shape: 'kite', metal: 'copper', crest: '/static/crests/khirel.webp', blurb: '岩虫穿行的峡谷王国。' },
  { name: '齐埃金', en: 'ZAEJIN', x: 66.2, y: 33.0, biome: 'swamp', emblem: 'frog', shape: 'round', metal: 'gold', crest: '/static/crests/zaejin.webp', blurb: '泽地蛙裔的王庭。' },
  { name: '荣耀之地', en: 'GLORYVALE', x: 54.6, y: 39.5, biome: 'forest', emblem: 'sun', shape: 'heater', metal: 'gold', crest: '/static/crests/glory.webp', blurb: '阳光草原。10 级加成为攻击。' },
  { name: '加尔凡尼亚', en: 'GARVANIA', x: 47.4, y: 76.8, biome: 'gothic', emblem: 'bat', shape: 'kite', metal: 'gold', crest: '/static/crests/gar.webp', blurb: '月下的血族公国。' },
  { name: '剑锋崖', en: 'SWORDCLIFF', x: 50.4, y: 56.8, biome: 'spire', emblem: 'sword', shape: 'heater', metal: 'gold', crest: '/static/crests/sword.webp', blurb: '骑士与龙骑驻守的断崖。' },
  { name: '风暴峡湾', en: 'STORMHEIM', x: 61.8, y: 19.6, biome: 'ice', emblem: 'bolt', shape: 'kite', metal: 'silver', crest: '/static/crests/storm.webp', blurb: '雷暴不停的北峡。' },
  { name: '毛格瑞姆森林', en: 'MAWGRIM', x: 21.8, y: 48.4, biome: 'forest', emblem: 'oak', shape: 'heater', metal: 'gold', crest: '/static/crests/mawgrim.webp', blurb: '古树比城堡更老。' },
  { name: '葛洛什奈克', en: 'GROSH-NAK', x: 67.6, y: 25.8, biome: 'desert', emblem: 'tusk', shape: 'tower', metal: 'copper', crest: '/static/crests/grosh.webp', blurb: '兽人高地。旗帜偏棕与红。' },
  { name: '混沌', en: 'CHAOS ISLE', x: 8.4, y: 61.5, biome: 'gothic', emblem: 'chaos', shape: 'hex', metal: 'gold', crest: '/static/crests/chaos.webp', blurb: '西海孤岛。需更高冒险者等级。' },
  { name: '狂野平原', en: 'WILDPLAINS', x: 69.8, y: 42.6, biome: 'desert', emblem: 'beast', shape: 'heater', metal: 'copper', crest: '/static/crests/wilds.webp', blurb: '土狼与牛头族的猎场。' },
  { name: '黑石', en: 'BLACKSTONE', x: 62.4, y: 40.6, biome: 'spire', emblem: 'mountain', shape: 'hex', metal: 'silver', crest: '/static/crests/blackstone.webp', blurb: '矿脉与穴居者的山脉。' },
  { name: '聚沙之地', en: 'GATHERING SANDS', x: 78.2, y: 48.4, biome: 'desert', emblem: 'dune', shape: 'round', metal: 'copper', crest: '/static/crests/sands.webp', blurb: '沙丘下埋着旧日皇城。' },
  { name: '荒芜之地', en: 'THE WASTES', x: 82.4, y: 58.6, biome: 'desert', emblem: 'skull', shape: 'kite', metal: 'copper', crest: '/static/crests/waste.webp', blurb: '焦土与爬虫魔。' },
  { name: '冰峰之巅', en: 'FROSTSPIRE', x: 46.2, y: 17.8, biome: 'ice', emblem: 'ice', shape: 'heater', metal: 'silver', crest: '/static/crests/icepeak.webp', blurb: '永冻的峰顶。10 级加成为护甲。' },
  { name: '天启', en: 'APOCALYPSE', x: 84.6, y: 78.2, biome: 'gothic', emblem: 'apocalypse', shape: 'hex', metal: 'gold', crest: '/static/crests/doom.webp', blurb: '尚未对冒险者开放的终末岛。' },
  { name: '狮心帝国', en: 'PRIDELANDS', x: 74.4, y: 54.8, biome: 'desert', emblem: 'lion', shape: 'heater', metal: 'gold', crest: '/static/crests/lion.webp', blurb: '草原帝国。旗帜偏黄与红。' },
  { name: '龙爪', en: 'DRAGONCLAW', x: 57.6, y: 28.4, biome: 'spire', emblem: 'dragon', shape: 'kite', metal: 'gold', crest: '/static/crests/dragonclaw.webp', blurb: '幼龙与龙蛋的山巢。' },
  { name: '守护者', en: 'THE GUARDIANS', x: 42.2, y: 39.6, biome: 'spire', emblem: 'wing', shape: 'round', metal: 'gold', crest: '/static/crests/guardians.webp', blurb: '美德化身驻守的圣所。' },
  { name: '黑鹰', en: 'BLACKHAWK', x: 60.2, y: 66.4, biome: 'gothic', emblem: 'eagle', shape: 'heater', metal: 'gold', crest: '/static/crests/blackhawk.webp', blurb: '鼠群与黑羽的南丘。' },
  { name: '玉银林地', en: 'SILVERWOOD', x: 28.4, y: 31.6, biome: 'forest', emblem: 'tree', shape: 'heater', metal: 'silver', crest: '/static/crests/silverwood.webp', blurb: '银叶永远不落。' },
  { name: '日冕', en: 'SUNCREST', x: 80.2, y: 33.8, biome: 'desert', emblem: 'sunburst', shape: 'round', metal: 'gold', crest: '/static/crests/suncrest.webp', blurb: '烈日直射的东岸。' },
  { name: '厄什卡亚', en: 'URSKAYA', x: 32.4, y: 16.2, biome: 'ice', emblem: 'mammoth', shape: 'tower', metal: 'silver', crest: '/static/crests/urskaya.webp', blurb: '长毛象踏过的冻土。' },
  { name: '藏宝库', en: 'THE VAULT', x: 92.2, y: 62.4, biome: 'desert', emblem: 'chest', shape: 'hex', metal: 'gold', crest: '/static/crests/vault.webp', blurb: '地精金库漂在东海上。' },
  { name: '梅兰堤斯', en: 'MERLANTIS', x: 90.4, y: 47.6, biome: 'ice', emblem: 'wave', shape: 'round', metal: 'silver', crest: '/static/crests/merlantis.webp', blurb: '潮汐下的珍珠王庭。' },
  { name: '圣唐', en: 'SHENGTANG', x: 88.2, y: 27.6, biome: 'forest', emblem: 'bird', shape: 'kite', metal: 'gold', crest: '/static/crests/shengt.webp', blurb: '鸩鸟飞过的远东。' },
  { name: '皓彩森林', en: 'BRIGHTWOOD', x: 18.2, y: 37.8, biome: 'forest', emblem: 'flower', shape: 'heater', metal: 'gold', crest: '/static/crests/brightwood.webp', blurb: '西岸最明亮的林带。' },
  { name: '卓克祖', en: 'DROKZU', x: 54.8, y: 54.2, biome: 'spire', emblem: 'rock', shape: 'hex', metal: 'copper', crest: '/static/crests/drok.webp', blurb: '岩石劫数苏醒的中央山脉。' },
  { name: '迈纳杰之罪', en: 'SIN OF MARAJ', x: 64.6, y: 74.2, biome: 'gothic', emblem: 'invert', shape: 'kite', metal: 'gold', crest: '/static/crests/sin.webp', blurb: '罪与契约的红土。' },
  { name: '沃尔帕克', en: 'VORPACK', x: 40.6, y: 71.8, biome: 'gothic', emblem: 'wolf', shape: 'heater', metal: 'gold', crest: '/static/crests/vorp.webp', blurb: '狼群巡游的暮色丘陵。' },
  { name: '诺斯', en: 'NOSS', x: 10.6, y: 35.8, biome: 'forest', emblem: 'spirit', shape: 'round', metal: 'gold', crest: '/static/crests/noss.webp', blurb: '自然生看守者的西林。' },
  { name: '地狱悬崖', en: 'HELLCLIFF', x: 52.2, y: 88.4, biome: 'gothic', emblem: 'flame', shape: 'tower', metal: 'gold', crest: '/static/crests/hellcliff.webp', blurb: '南端的焦黑断崖。' },
  { name: '午夜城市', en: 'MIDNIGHT CITY', x: 56.2, y: 83.0, biome: 'gothic', emblem: 'moon', shape: 'hex', metal: 'silver', crest: '/static/crests/midnight.webp', blurb: '湾上永不熄灯的夜城。' },
];

/** 首都节点重定位（小样 HOME 表） */
const HOME: Record<string, [number, number]> = {
  破碎尖塔: [50.0, 47.2],
  阿达纳: [40.2, 48.4],
  守护者: [44.4, 41.6],
  荣耀之地: [56.8, 40.2],
  剑锋崖: [49.2, 54.2],
  葛洛什奈克: [62.4, 39.6],
  狮心帝国: [60.8, 51.4],
  白盔国: [42.6, 38.8],
  风暴峡湾: [57.6, 37.8],
  卓克祖: [55.8, 54.6],
};

/** 非首都节点的位置微调（小样 PLACES 表） */
const PLACES: Record<string, [number, number]> = {
  卡拉考斯: [38.4, 78.6],
  蛛尔卡里: [31.2, 62.8],
  卜筮之原: [28.6, 44.2],
  鳞雾沼泽: [24.8, 68.4],
  荆棘森林: [18.6, 51.2],
  潘神之谷: [16.8, 42.6],
  盖塔尔: [69.8, 30.4],
  卡其尔: [81.4, 42.8],
  齐埃金: [64.8, 37.6],
  加尔凡尼亚: [47.6, 76.2],
  毛格瑞姆森林: [22.4, 47.8],
  混沌: [8.8, 58.6],
  狂野平原: [68.4, 44.8],
  黑石: [71.6, 44.2],
  聚沙之地: [76.2, 48.6],
  荒芜之地: [80.8, 58.4],
  冰峰之巅: [48.6, 18.4],
  天启: [84.2, 78.6],
  龙爪: [54.2, 28.6],
  黑鹰: [58.8, 66.2],
  玉银林地: [29.4, 32.6],
  日冕: [78.4, 33.2],
  厄什卡亚: [33.2, 16.8],
  藏宝库: [90.4, 61.2],
  梅兰堤斯: [88.6, 47.4],
  圣唐: [86.2, 26.8],
  皓彩森林: [19.2, 36.8],
  迈纳杰之罪: [63.4, 74.8],
  沃尔帕克: [41.2, 71.6],
  诺斯: [11.4, 34.6],
  地狱悬崖: [51.6, 88.2],
  午夜城市: [55.4, 82.4],
};

/**
 * 最终视图表：以**真实推进序**（allKingdoms）为准逐位对表小样布局；
 * 数据侧新增/改名王国时自动用轮转 biome 兜底，不会缺节点。
 */
export const KINGDOM_VIEWS: KingdomView[] = allKingdoms().map((name, idx) => {
  const seed = SEEDS.find((s) => s.name === name) ?? {
    name,
    en: name,
    x: 8 + ((idx * 7.3) % 84),
    y: 14 + ((idx * 11.7) % 74),
    biome: BIOMES[idx % BIOMES.length]!,
    emblem: 'sun',
    shape: 'heater',
    metal: 'gold',
    blurb: '',
  };
  const home = HOME[name];
  const place = PLACES[name];
  return {
    ...seed,
    crest: seed.crest ?? null,
    x: home?.[0] ?? place?.[0] ?? seed.x,
    y: home?.[1] ?? place?.[1] ?? seed.y,
    hero: home !== undefined,
  };
});

export function kingdomViewOf(name: string): KingdomView {
  return KINGDOM_VIEWS.find((k) => k.name === name) ?? KINGDOM_VIEWS[0]!;
}
