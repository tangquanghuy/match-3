/**
 * 馈赠：一次性成长里程碑（按系统分组，达成后手动领取宝石）。
 *
 * 设计值：新手礼 1000（刚好一次新手十连）+ 各系统里程碑，合计 11,600 宝石。
 * 进度全部读存档里「只增不减」的字段；周活动账本每周清零，另用 gifts.eventWins / towerBest 累计。
 */
export type GiftGroupId = 'starter' | 'hero' | 'kingdom' | 'arena' | 'invasion' | 'events' | 'collection';
export type GiftMetric =
  | 'always' | 'heroLevel' | 'questChains' | 'kingdomsMaxed' | 'arenaWins' | 'arenaBestRun'
  | 'invasionLeague' | 'eventWins' | 'towerBest' | 'troopsOwned';

export interface GiftDef {
  id: string;
  group: GiftGroupId;
  metric: GiftMetric;
  target: number;
  label: string;
  gems: number;
}

export interface GiftGroupDef {
  id: GiftGroupId;
  name: string;
  icon: string;
}

export const GIFT_GROUPS: readonly GiftGroupDef[] = [
  { id: 'starter', name: '新手礼', icon: 'crystal' },
  { id: 'hero', name: '主角成长', icon: 'crown' },
  { id: 'kingdom', name: '王国', icon: 'flag' },
  { id: 'arena', name: '竞技场', icon: 'swords' },
  { id: 'invasion', name: '入侵', icon: 'skull' },
  { id: 'events', name: '周活动', icon: 'time' },
  { id: 'collection', name: '收藏', icon: 'book' },
];

/** 新手礼 id（新手引导第二步领取它） */
export const GIFT_STARTER_ID = 'starter';

const LEAGUES = ['青铜', '白银', '黄金', '白金', '翡翠', '蓝宝石', '紫水晶', '黄玉', '红宝石', '钻石'];

export const GIFTS: readonly GiftDef[] = [
  { id: GIFT_STARTER_ID, group: 'starter', metric: 'always', target: 1, label: '冒险者见面礼', gems: 1000 },

  ...([[5, 100], [10, 150], [15, 200], [20, 300], [30, 400], [40, 500], [50, 600], [70, 700], [100, 1000]] as const)
    .map(([lv, gems]): GiftDef => ({ id: `hero-${lv}`, group: 'hero', metric: 'heroLevel', target: lv, label: `主角达到 Lv.${lv}`, gems })),

  ...([[1, 100], [5, 200], [15, 400]] as const)
    .map(([n, gems]): GiftDef => ({ id: `quest-${n}`, group: 'kingdom', metric: 'questChains', target: n, label: `通关 ${n} 个王国主线`, gems })),
  ...([[1, 150], [5, 300], [15, 600]] as const)
    .map(([n, gems]): GiftDef => ({ id: `kingdom10-${n}`, group: 'kingdom', metric: 'kingdomsMaxed', target: n, label: `${n} 个王国升到 10 级`, gems })),

  ...([[1, 100], [10, 200], [30, 400]] as const)
    .map(([n, gems]): GiftDef => ({ id: `arena-${n}`, group: 'arena', metric: 'arenaWins', target: n, label: `竞技场累计 ${n} 胜`, gems })),
  { id: 'arena-perfect', group: 'arena', metric: 'arenaBestRun', target: 6, label: '竞技场一轮 6 连胜', gems: 300 },

  ...([[1, 150], [3, 250], [5, 400], [8, 600]] as const)
    .map(([league, gems]): GiftDef => ({ id: `invasion-${league}`, group: 'invasion', metric: 'invasionLeague', target: league, label: `入侵晋升${LEAGUES[league]}`, gems })),

  ...([[1, 100], [10, 200], [30, 300], [60, 500]] as const)
    .map(([n, gems]): GiftDef => ({ id: `event-${n}`, group: 'events', metric: 'eventWins', target: n, label: `周活动累计 ${n} 胜`, gems })),
  ...([[5, 150], [15, 250], [25, 400]] as const)
    .map(([floor, gems]): GiftDef => ({ id: `tower-${floor}`, group: 'events', metric: 'towerBest', target: floor, label: `末日之塔登上第 ${floor} 层`, gems })),

  ...([[30, 100], [60, 200], [120, 300]] as const)
    .map(([n, gems]): GiftDef => ({ id: `troops-${n}`, group: 'collection', metric: 'troopsOwned', target: n, label: `收集 ${n} 名部队`, gems })),
];

export const GIFT_TOTAL_GEMS = GIFTS.reduce((sum, g) => sum + g.gems, 0);
