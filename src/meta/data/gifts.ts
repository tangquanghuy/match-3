/**
 * 馈赠：一次性成长里程碑（按系统分组，达成后手动领取）。
 *
 * 奖励 = 宝石 + 可选的随机部队卡（按稀有度档：3 传说 / 4 史诗 / 5 神话，与宝石宝箱同池）。
 * 阶梯刻意拉长：前期密、后期疏，覆盖从新手到满级的整个成长期。
 * 进度全部读存档里「只增不减」的字段；周活动账本每周清零，另用 gifts.eventWins / towerBest 累计。
 */
export type GiftGroupId = 'starter' | 'hero' | 'battles' | 'kingdom' | 'arena' | 'invasion' | 'events' | 'collection';
export type GiftMetric =
  | 'always' | 'heroLevel' | 'battlesWon' | 'questChains' | 'kingdomsMaxed' | 'arenaWins' | 'arenaBestRun'
  | 'invasionLeague' | 'eventWins' | 'towerBest' | 'troopsOwned';

export interface GiftDef {
  id: string;
  group: GiftGroupId;
  metric: GiftMetric;
  target: number;
  label: string;
  gems: number;
  /** 随机部队卡的稀有度档（3 传说 / 4 史诗 / 5 神话） */
  troop?: 3 | 4 | 5;
}

export interface GiftGroupDef {
  id: GiftGroupId;
  name: string;
  icon: string;
}

export const GIFT_GROUPS: readonly GiftGroupDef[] = [
  { id: 'starter', name: '新手礼', icon: 'crystal' },
  { id: 'hero', name: '主角成长', icon: 'crown' },
  { id: 'battles', name: '征战', icon: 'swords' },
  { id: 'kingdom', name: '王国', icon: 'flag' },
  { id: 'arena', name: '竞技场', icon: 'swords' },
  { id: 'invasion', name: '入侵', icon: 'skull' },
  { id: 'events', name: '周活动', icon: 'time' },
  { id: 'collection', name: '收藏', icon: 'book' },
];

/** 新手礼 id（新手引导第二步领取它） */
export const GIFT_STARTER_ID = 'starter';

const LEAGUES = ['青铜', '白银', '黄金', '白金', '翡翠', '蓝宝石', '紫水晶', '黄玉', '红宝石', '钻石'];

type Step = readonly [target: number, gems: number, troop?: 3 | 4 | 5];

/** 阶梯表里写的是相对权重，统一乘这个系数落到宝石（全部馈赠合计约 1.4 万宝石），就近取 10 */
const GEM_SCALE = 0.6;

function ladder(group: GiftGroupId, metric: GiftMetric, prefix: string, label: (n: number) => string, steps: readonly Step[]): GiftDef[] {
  return steps.map(([target, weight, troop]) => ({
    id: `${prefix}-${target}`, group, metric, target, label: label(target),
    gems: Math.max(30, Math.round((weight * GEM_SCALE) / 10) * 10),
    ...(troop ? { troop } : {}),
  }));
}

export const GIFTS: readonly GiftDef[] = [
  { id: GIFT_STARTER_ID, group: 'starter', metric: 'always', target: 1, label: '冒险者见面礼', gems: 1000 },
  { id: 'starter-troop', group: 'starter', metric: 'always', target: 1, label: '新兵补给', gems: 0, troop: 3 },

  ...ladder('hero', 'heroLevel', 'hero', (n) => `主角达到 Lv.${n}`, [
    [3, 50], [5, 60], [8, 80], [10, 100, 3], [12, 100], [15, 120], [18, 120], [20, 150, 4], [25, 150], [30, 200],
    [35, 200], [40, 250, 4], [45, 250], [50, 300], [55, 300], [60, 350, 5], [65, 350], [70, 400], [75, 400],
    [80, 450, 4], [85, 450], [90, 500], [95, 500], [100, 800, 5],
  ]),

  ...ladder('battles', 'battlesWon', 'wins', (n) => `累计赢得 ${n} 场战斗`, [
    [5, 50], [10, 60], [25, 80], [50, 100, 3], [100, 150], [200, 200], [300, 250, 4], [500, 300],
    [750, 400], [1000, 500, 5],
  ]),

  ...ladder('kingdom', 'questChains', 'quest', (n) => `通关 ${n} 个王国主线`, [
    [1, 60], [2, 60], [3, 80], [5, 100, 3], [8, 120], [10, 150], [15, 180], [20, 220, 4], [25, 250], [30, 300],
    [35, 350], [42, 500, 5],
  ]),
  ...ladder('kingdom', 'kingdomsMaxed', 'kingdom10', (n) => `${n} 个王国升到 10 级`, [
    [1, 100], [3, 120], [5, 150], [8, 180], [10, 220, 4], [15, 260], [20, 300], [25, 350], [30, 400], [42, 600, 5],
  ]),

  ...ladder('arena', 'arenaWins', 'arena', (n) => `竞技场累计 ${n} 胜`, [
    [1, 50], [5, 60], [10, 80], [20, 100], [30, 120, 3], [50, 150], [75, 200], [100, 250, 4], [150, 300], [200, 400],
  ]),
  ...ladder('arena', 'arenaBestRun', 'arena-run', (n) => `竞技场一轮 ${n} 连胜`, [
    [3, 60], [4, 80], [5, 100], [6, 200, 4],
  ]),

  ...ladder('invasion', 'invasionLeague', 'invasion', (n) => `入侵晋升${LEAGUES[n]}`, [
    [1, 100], [2, 120], [3, 150], [4, 200, 4], [5, 220], [6, 250], [7, 300], [8, 350], [9, 500, 5],
  ]),

  ...ladder('events', 'eventWins', 'event', (n) => `周活动累计 ${n} 胜`, [
    [1, 50], [5, 60], [10, 80], [20, 100], [30, 120, 3], [50, 150], [75, 200], [100, 250, 4], [150, 300],
    [200, 350], [300, 500, 5],
  ]),
  ...ladder('events', 'towerBest', 'tower', (n) => `末日之塔登上第 ${n} 层`, [
    [3, 60], [5, 80], [10, 120], [15, 160, 4], [20, 200], [25, 300, 5],
  ]),

  ...ladder('collection', 'troopsOwned', 'troops', (n) => `收集 ${n} 名部队`, [
    [20, 50], [30, 60], [50, 80], [75, 100, 3], [100, 120], [150, 150], [200, 200, 4], [300, 250], [400, 300],
    [500, 400, 5],
  ]),
];

export const GIFT_TOTAL_GEMS = GIFTS.reduce((sum, g) => sum + g.gems, 0);
/** 部队卡奖励张数（按稀有度档） */
export const GIFT_TROOP_COUNTS: Readonly<Record<3 | 4 | 5, number>> = {
  3: GIFTS.filter((g) => g.troop === 3).length,
  4: GIFTS.filter((g) => g.troop === 4).length,
  5: GIFTS.filter((g) => g.troop === 5).length,
};
