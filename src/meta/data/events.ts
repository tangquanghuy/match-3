/**
 * 每周活动词表（每周活动批；UX 阶段 B 窗口 N 改 per-event 常驻）——官方 Live Event 六类型的单机适配。
 *
 * 结构对齐官方（考据见 design/EVENTS-INVASION-DESIGN.md §1.2/§2.4）：
 *  - **六活动常驻全部开放**（UX-6 用户裁定；原 6 周大轮换废除）。每活动一份独立周实例，
 *    周一起算 7 天（本地周历 weekStartOf），**周一 0:00 六活动统一重置**
 *    （错峰重置会让「本周还剩几天」变成六个答案，总览页倒计时无法表达）；
 *  - 「每周上新」只剩**主题参数**这一个变量：入侵/阵营突袭的目标王国、世界事件的加成种族
 *    仍按周种子确定性派生（`eventThemeOf`），且六活动各自独立派生（同周不同目标）；
 *  - 奖励 = 积分轨里程碑（官方结构），素材侧重按官方对应映射（Invasion 给特质石、
 *    Raid Boss 给钢锭、ToD 给符卷、Faction Assault 给钢锭+特质石、World Event 给钱钥、
 *    Class 系给荣耀与特质石）；
 *  - 周奖励 revision 3：每活动1200宝石，任意活动累计胜场共享3600宝石；
 *    前三档承载75%的单活动宝石，降低重复刷取负担；素材沿用独立预算。
 *  - 每活动印记周产出上限360；重复玩法奖励另设周额，塔按本周新高楼层结算。
 *  - 现代版的 Sigils 体力不引入（单机友好，差异已记录）。
 *
 * 全部数值为设计值。
 */
import { allKingdoms } from './kingdoms';
import { TROOPS } from '../../data/troops';
import { fnv1a32 } from './hash';
import { isRaceType } from './races';
import { STONE_COLORS, type MaterialDelta } from './materials';
import { doubleWeeklyMaterials } from './weeklyRewards';

/** 一周毫秒数（活动周历刻度） */
export const WEEK_MS = 7 * 24 * 3_600_000;

/** 商店按连续本地日历周期补货，与活动周结独立。 */
export const EVENT_SHOP_REFRESH_DAYS = 2;

/** 活动类型 id（轮换表词表） */
export type EventTypeId = 'invasion' | 'raidBoss' | 'towerOfDoom' | 'factionAssault' | 'worldEvent' | 'classTrials';

export interface EventTypeDef {
  id: EventTypeId;
  name: string;
  /** 页签/卡片用短名（六字以内，不含「周」字冗余） */
  shortName: string;
  tagline: string;
  /** 战斗主题一句话（屏层横幅直接显示） */
  brief: string;
  /** 玩法说明页：按小节分组的规则（各活动独立玩法，见 systems/eventModes） */
  howto: readonly { title: string; items: readonly string[] }[];
  /** 出战按钮文案 */
  fightLabel: string;
  /**
   * 活动主题色（六色固定、互不复用）——代币归属的第一层视觉表达：
   * 商店页的代币图标底色 / 价格标签 / 页签描边都取它，让「换店 = 换钱包」可见
   * （`11-event-shop.md` §D 三层冗余的第二、三层）。
   */
  accent: string;
  /** 印记名（带活动前缀，六池互不通兑；底层仍沿用 tokens 字段） */
  tokenName: string;
}

/** 六活动常驻词表（顺序 = 页签与总览卡的固定排序；下标语义见 eventTypeIndexOf） */
export const EVENT_TYPES: readonly EventTypeDef[] = [
  {
    id: 'invasion', name: '入侵', shortName: '入侵', tagline: 'INVASION',
    accent: '#c2506a', tokenName: '入侵印记',
    brief: '选敌军出战，胜利消灭目标；其余敌军战后继续前进。清除一波守住王都。',
    howto: [
      { title: '核心玩法 · 三路兵线', items: [
        '敌军兵团沿山道、河谷、平原三路向王都推进，地图上可以看到每支兵团的种类、所在路线和距王都的步数。',
        '先点地图上的一支敌军，再点截击出战。胜利消灭目标；失败则目标留在原地。每打完一场，其他兵团仍会向王都推进（攻城锤每两场推进一次）。',
        '敌军抵达王都会减少王都城防（普通兵团 -1，攻城锤、督军 -2）。城防从 3 降到 0 时，本波重来；已建的工事和城防点不会因此清零。',
      ] },
      { title: '兵团种类', items: [
        '掠袭骑：推进最快（每场 1 步），兵力最弱。',
        '攻城锤：每两场才推进 1 步，但由精英组成、破城伤害高。',
        '督军：首领带队；只要督军还在，同一路的其他兵团攻击 +15%。',
      ] },
      { title: '截击时机', items: [
        '先机：截击距王都 3 步以上的兵团，敌人以 85% 生命开战，积分 +20。',
        '背水：在城下（距王都 1 步）决战，全队护甲 +8。',
        '消灭全部威胁即守土成功：城防回满，下一波更强；守土奖励每周前 4 次发放。每次截击获胜得 1 城防点，守住整波再得 2 点；去城防建设页建永久工事、修城或购买下一场战斗的补给。',
      ] },
    ],
    fightLabel: '截 击',
  },
  {
    id: 'raidBoss', name: '突袭首领', shortName: '突袭首领', tagline: 'RAID BOSS',
    accent: '#d08a3a', tokenName: '突袭印记',
    brief: '主要产出：钢锭。其他奖励：特质石、熔铸符卷等。',
    howto: [
      { title: '核心玩法 · 讨伐血池', items: [
        '每阶首领与护卫固定，首领生命跨战斗保留——胜负都计入造成的伤害，血池见底即讨伐成功。',
        '按伤害计分：打空一条血池约 400 分，败场同样得分。讨伐成功发放钢锭与荣耀（每周 4 次），并刷新更强的下一阶首领。',
      ] },
      { title: '首领锻材挑战', items: ['自选 1～12 档难度；胜利保底普通或稀有钢锭，传说、史诗、神话钢锭按难度额外抽取。', '可反复挑战，不消耗常规讨伐血池、战损、补给或每周讨伐奖励次数。'] },
      { title: '三个阶段', items: [
        '傲慢（血量 66% 以上）：首领护甲 +40%。',
        '狂怒（33%~66%）：首领攻击 +30%。',
        '绝境（33% 以下）：首领攻击 +50%，护卫全属性 +20%，并增派一名精英。',
      ] },
      { title: '疲惫与破绽', items: [
        '参战过的部队在当前阶段内陷入疲惫，再次出战攻击 -40%；首领进入新阶段或被讨伐后全员恢复。主角不会疲惫。',
        '每周首领有一个破绽色：法力颜色包含破绽色的部队攻击 +30%。',
        '轮换不同的队伍、优先派出破绽色部队，是最快的讨伐方式。',
      ] },
    ],
    fightLabel: '讨 伐',
  },
  {
    id: 'towerOfDoom', name: '末日之塔', shortName: '末日之塔', tagline: 'TOWER OF DOOM',
    accent: '#3f9fb0', tokenName: '塔层印记',
    brief: '肉鸽式爬塔：自己选路，收集遗物，带着残血一路登上第 25 层。',
    howto: [
      { title: '核心玩法 · 选路登塔', items: [
        '一轮登塔共 25 层，分三个区域（8 / 8 / 9 层），每区一张随机分叉地图，区末是守关首领。',
        '从下往上爬：每一步只能走向当前节点连出的上一层节点，路线由你决定。',
        '开始登塔时队伍锁定；生命与阵亡跨层延续。战败或主动放弃即本轮结束。',
      ] },
      { title: '七种节点', items: [
        '战斗：普通守卫，胜利得塔金并三选一符文或灵纹（灵纹 = 某色宝石法力 +1）。精英：带词缀（狂暴 / 铁壁 / 荆棘 / 剧毒 / 迅捷 / 护盾 / 末日…）的强敌，胜利三选一遗物；第 2、3 区各有一名双词缀的强化精英，只出稀有遗物。',
        '营地：休整、磨砺、冥想或招魂。宝库：必得遗物与塔金。商人：买遗物、治疗、驱除诅咒，可付费换一批货。',
        '奇遇：宝石熔炉、风暴祭坛、骷髅王座、许愿井等十余种遭遇，风险与收益并存。首领：击败后回复 40% 生命，三选一首领遗物，进入下一区。',
      ] },
      { title: '遗物与奖励', items: [
        '遗物在本轮内永久生效，直接改写棋盘：开局召唤风暴、把宝石变成燃烧 / 冻结 / 织网 / 末日骷髅 / 沙漏 / 闪电、匹配时叠攻击或回血、闪避与反弹……首领遗物更强但带代价。',
        '地图上任意节点都能点开查看敌人等级、词缀与奖励；遗物效果与法力加成在右栏随时可查。',
        '周奖励按本周新到达的最高层补差发放（每层荣耀 2、每 5 层熔铸符卷 1），重复低层不重复产出。',
        '第 8 / 16 / 25 层首领每周首次击败，额外保底掉落钢锭与特质石，越高区材料越高级；战斗胜利时自动入账，具体数量见奖励页。',
        '通关材料与积分里程碑、高层特质奖励独立；重复登塔不重复领取，跨周重置。',
        '战斗节点计积分：普通 100，精英与首领 120。',
      ] },
    ],
    fightLabel: '出 战',
  },
  {
    id: 'factionAssault', name: '阵营突袭', shortName: '阵营突袭', tagline: 'FACTION ASSAULT',
    accent: '#b99230', tokenName: '阵营印记',
    brief: '一块一块吃下目标王国的领土，占领地会成为之后每一场战斗的加成。',
    howto: [
      { title: '核心玩法 · 领地征服', items: [
        '本周目标王国的领土是一张 4×3 地块图。只能进攻西侧边境，或与己方已占领地块相邻的地块。',
        '攻陷东侧的王城即完成一轮征服，发放征服奖励（每周 3 次），领地重整、守军更强。',
        '王城只向内应开门：出战队伍中至少 2 名目标王国的部队才能进攻王城。',
      ] },
      { title: '战区加成（占领后对之后所有战斗生效，可叠加）', items: [
        '军营：全队攻击 +3　城塞：全队护甲 +5　粮仓：全队生命 +12%',
        '圣坛：全色法力精通 +20　瞭望塔：敌人以 90% 生命开战　村落：全队生命 +4%',
        '另外，编入目标王国的部队每 1 名，全队攻击 +2、生命 +10。',
      ] },
      { title: '敌军反扑', items: [
        '每进行 4 场战斗，敌军反扑一次，夺回一块与敌占区接壤的己方地块（优先抢军营、城塞等高价值地块）。',
        '绕路多吃加成会给反扑更多机会；直取王城则要顶着守军硬打。',
      ] },
    ],
    fightLabel: '进 攻',
  },
  {
    id: 'worldEvent', name: '世界事件', shortName: '世界事件', tagline: 'WORLD EVENT',
    accent: '#4f9e63', tokenName: '庆典印记',
    brief: '庆典棋盘：打赢战斗换骰子，在环形棋盘上掷骰收集物资。',
    howto: [
      { title: '核心玩法 · 庆典棋盘', items: [
        '战斗不直接掉物资，而是给庆典骰子：每场胜利 +1；护送商队（敌人 +5 级）再 +1；队伍中有 2 名以上本周加成种族部队再 +1。',
        '在 20 格环形棋盘上掷骰前进，按落点领取奖励；每经过一次起点，物资 +6。',
        '里程碑按累计物资结算。',
      ] },
      { title: '格子', items: [
        '物资 +3 / 大丰收 +6 / 金币 黄金 +300 / 宝箱 随机灵魂、黄金或骰子。',
        '灯会：下一次落点奖励翻倍。陷阱：物资 -2。传送门：直达前方最近的大丰收。',
        '商队：获得一枚定向骰，可以自己选 1~6 点——留着去踩大丰收、接灯会、躲陷阱。',
      ] },
    ],
    fightLabel: '参 战',
  },
  {
    id: 'classTrials', name: '职业试炼', shortName: '职业试炼', tagline: 'CLASS TRIALS',
    accent: '#6f7fd0', tokenName: '试炼印记',
    brief: '主要产出：职业等级经验。挑战试炼可获得额外奖励。',
    howto: [
      { title: '核心玩法 · 规则挑战', items: [
        '每周从挑战池抽出 8 道试炼，每道都改写战斗规则：孤身出战、玻璃大炮、巨人猎手、车轮战、法力潮汐……',
        '每道试炼有 3 个星级目标（获胜、主角存活、回合数、无人阵亡等），星级只增不减。',
        '试炼按顺序变难：第 1 道敌人 Lv.20，每往后一道 +4 级。',
      ] },
      { title: '奖励', items: [
        '胜利和新达成的星级可获得试炼积分。',
        '胜利额外获得 200–300 职业经验，三星还有加成。',
      ] },
    ],
    fightLabel: '挑 战',
  },
] as const;

// Backwards-compatible names used by the event system and existing saves/tests.
// The event screen still consumes the shared ordered list for its tabs, while
// newer code can use EVENT_TYPES to make the "all activities open" policy clear.
export const EVENT_ROTATION = EVENT_TYPES;

/** 活动类型定义查表（未知 id 抛——调用方路由已做白名单过滤） */
export function eventTypeById(id: EventTypeId): EventTypeDef {
  const def = EVENT_TYPES.find((t) => t.id === id);
  if (!def) throw new Error(`未知活动类型：${id}`);
  return def;
}

/** 活动类型在常驻词表中的下标（页签/总览卡固定排序用） */
export function eventTypeIndexOf(id: EventTypeId): number {
  return EVENT_TYPES.findIndex((t) => t.id === id);
}

/** Legacy weekly selector retained for callers that still use the old API. */
export function eventTypeOfWeek(weekStart: number): EventTypeDef {
  const weekIndex = Math.floor(weekStart / WEEK_MS);
  const index = ((weekIndex % EVENT_ROTATION.length) + EVENT_ROTATION.length) % EVENT_ROTATION.length;
  return EVENT_ROTATION[index]!;
}

/**
 * 里程碑之外的周额：守土成功与首领讨伐各4次。
 * 塔的 towerOfDoom=6 仅保留旧存档诊断计数，实际奖励以本周新高楼层结算，
 * 25层合计最多50荣耀和5符卷；其余活动无额外重复性素材奖励。
 */
/** 活动整体解锁等级（主角）：未达等级时活动页与活动商店显示独立拦截页，网关拒绝出战与兑换。 */
export const EVENT_UNLOCK_HERO_LEVEL = 20;

/**
 * 活动难度曲线（设计值；2026-09-28 实测后重定）。
 *  - 普通段：从解锁等级起，每推进一阶段敌人 +3 级，共 10 阶段（Lv.20~47），不看玩家强度——
 *    养成越好打得越深，不惩罚升级；
 *  - 最高档：第 10 阶段起进入，从 Lv.50 开始按本档战绩浮动（胜 +3 / 败 -3，不低于 50）；
 *  - 末日之塔为固定 25 层（每层 +1.5，顶层 Lv.56），首领突袭按阶层推进（每阶 +3，血池按等级定额）。
 */
export const EVENT_DIFFICULTY = {
  base: EVENT_UNLOCK_HERO_LEVEL,
  step: 3,
  topStages: 10,
  topBase: 50,
  topStep: 3,
  towerStep: 1.5,
  /** 首领血池 = 敌人等级 × 本系数 × 1.08^(阶层-1) */
  raidPoolPerLevel: 14,
  raidPoolGrowth: 1.08,
} as const;

/**
 * 首领突袭按伤害计分（胜败都算）：打空一整条血池折合 400 分，单场仍受单场积分上限约束。
 * 血池首领单场几乎不可能被一场打死，按胜场计分会让突袭里程碑形同虚设。
 */
export const EVENT_RAID_POOL_POINTS = 400;

/** 守土成功每次奖励，与经济模型共用。 */
export const EVENT_DEFENSE_REWARD = { glory: 80, gems: 40 } as const;

export const EVENT_WEEKLY_PLAY_REWARD_CAP: Record<EventTypeId, number> = {
  invasion: 4,
  raidBoss: 4,
  towerOfDoom: 6,
  /** 攻陷王城的征服奖励（荣耀 + 素材，不含宝石） */
  factionAssault: 3,
  worldEvent: 0,
  classTrials: 0,
};

/** 活动里程碑：积分阈值 → 奖励（达标自动入账） */
export interface EventMilestone {
  points: number;
  label: string;
  gold?: number;
  souls?: number;
  gems?: number;
  goldKeys?: number;
  glory?: number;
  mats?: MaterialDelta;
}

// ---------------------------------------------------------------------------
// 活动商店（2026-09-19 追补：官方 Live Event 的活动币商店单机适配）
// ---------------------------------------------------------------------------

/**
 * 活动代币产出节奏（设计值）：每场活动胜场 `tokens = max(3, floor(points/10))`——
 * 常规胜场100/120分 → 10/12印记；营地50分 → 5印记，试炼至多240分 → 24印记。
 * 每活动本周累计产出封顶360，消费不恢复赚取额度；素材货架另有两天库存。
 */
export const EVENT_TOKEN_MIN_PER_WIN = 3;
export const EVENT_TOKEN_DIVISOR = 10;

export interface EventGoods {
  /** 稳定 id（每期限量的已购计数按它记存档，勿改动已有 id） */
  id: string;
  /**
   * 货名 = **包名**，不复读内容（S-2 根因收口）。数量与构成一律由屏层的结构化
   * 奖励摘要（图标 + ×N）出——`name` 里再写一遍「×10」会让每件货占两行说同一件事。
   */
  name: string;
  /** 一句话卖点（招牌位与 tooltip 用；可缺省） */
  blurb?: string;
  /** 活动印记售价（使用原有活动 tokens 余额） */
  cost: number;
  /** 每期限量（null = 无限量）；每两天独立补货 */
  stock: number | null;
  gold?: number;
  souls?: number;
  gems?: number;
  goldKeys?: number;
  glory?: number;
  mats?: MaterialDelta;
  troopRole?: 'siegebreaker' | 'godslayer' | 'faction' | 'race';
  troopId?: number;
  classXp?: number;
}

/** 活动专属兵种 / 符卷 / 成长补给的单机适配；印记沿用原活动代币，不另设货币。 */
/** 普通活动补给翻倍；保留钢锭、符卷及已有圣辉数量。 */
function boostBasicStones(mats: MaterialDelta): MaterialDelta {
  return { ...mats, ...(mats.traitstones ? { traitstones: Object.fromEntries(
    Object.entries(mats.traitstones).map(([key, amount]) => [key, /^(minor|major|runic):/.test(key) ? (amount ?? 0) * 2 : amount]),
  ) } : {}) };
}

/** 真正高难挑战独立周限额，低难积分和旧 playRewards 不消耗此额度。 */
export const EVENT_HIGH_TIER_REWARDS = {
  tower: [{ floor: 16, amount: 1, celestial: 0 }, { floor: 20, amount: 2, celestial: 0 }, { floor: 25, amount: 3, celestial: 1 }],
  raid: { minLevel: 50, amount: 2, weeklyKills: 4, celestialMinLevel: 80, celestialWeeklyKills: 2 },
} as const;

/** 六活动固定分配全部 21 种秘法石，不依赖队首、愿望单或每周随机主题。 */
export const EVENT_ARCANE_STONES: Record<EventTypeId, readonly string[]> = {
  invasion: ['arcane:blue:blue', 'arcane:blue:red', 'arcane:red:red'],
  raidBoss: ['arcane:red:brown', 'arcane:yellow:brown', 'arcane:brown:brown'],
  towerOfDoom: ['arcane:blue:purple', 'arcane:green:purple', 'arcane:purple:purple', 'arcane:purple:brown'],
  factionAssault: ['arcane:blue:brown', 'arcane:green:brown', 'arcane:green:green', 'arcane:green:red'],
  worldEvent: ['arcane:blue:green', 'arcane:green:yellow', 'arcane:red:yellow', 'arcane:yellow:yellow'],
  classTrials: ['arcane:blue:yellow', 'arcane:red:purple', 'arcane:yellow:purple'],
};

export function eventArcaneBundle(type: EventTypeId, amount: number): Record<string, number> {
  return Object.fromEntries(EVENT_ARCANE_STONES[type].map(key => [key, amount]));
}

/** 三区首领额外保底材料：8 / 16 / 25 层各每周一次，与积分、符卷及高层特质奖励独立。 */
export interface TowerBossReward {
  floor: number;
  zone: number;
  mats: MaterialDelta;
}
const towerColorStones = (tier: 'major' | 'runic', amount: number): Record<string, number> =>
  Object.fromEntries(STONE_COLORS.map(({ key }) => [`${tier}:${key}`, amount]));

export const TOWER_BOSS_REWARDS: readonly TowerBossReward[] = [
  { floor: 8, zone: 1, mats: {
    ingots: { rare: 6, ultraRare: 4 },
    traitstones: { ...towerColorStones('major', 3), ...towerColorStones('runic', 1) },
  } },
  { floor: 16, zone: 2, mats: {
    ingots: { epic: 6 },
    traitstones: { ...towerColorStones('runic', 2), ...eventArcaneBundle('towerOfDoom', 1) },
  } },
  { floor: 25, zone: 3, mats: {
    ingots: { epic: 4, mythic: 2 },
    traitstones: { ...towerColorStones('runic', 3), ...eventArcaneBundle('towerOfDoom', 2), celestial: 1 },
  } },
];

/** 独立周账本键；保留旧档已有的 arcaneTower / towerPaidFloors 记录。 */
export const towerBossRewardKey = (floor: number): string => `towerBoss${floor}`;

const BASE_EVENT_SHOP: Record<EventTypeId, readonly EventGoods[]> = {
  invasion: [
    { id: 'invasion_minor', name: '先锋补给', cost: 10, stock: 12, mats: { traitstones: { 'minor:red': 2, 'minor:blue': 2 } } },
    { id: 'invasion_major', name: '攻城史诗锭', cost: 24, stock: 4, mats: { ingots: { epic: 2 } } },
    { id: 'invasion_runic', name: '破城特质', cost: 28, stock: 3, mats: { traitstones: { 'runic:red': 1, 'runic:blue': 1 } } },
    { id: 'invasion_celestial', name: '本期攻城手', cost: 60, stock: 1, troopRole: 'siegebreaker' },
    { id: 'invasion_scroll', name: '攻城精锻锭', cost: 22, stock: 6, mats: { ingots: { ultraRare: 4 } } },
    { id: 'invasion_traits', name: '进阶特质', cost: 18, stock: 4, mats: { traitstones: { 'major:red': 2, 'major:blue': 1 } } },
  ],
  raidBoss: [
    { id: 'raid_common', name: '首领稀有锭', cost: 12, stock: 8, mats: { ingots: { rare: 6 } } },
    { id: 'raid_rare', name: '首领传说锭', cost: 22, stock: 5, mats: { ingots: { ultraRare: 2 } } },
    { id: 'raid_ultra', name: '首领史诗锭', cost: 38, stock: 3, mats: { ingots: { epic: 2 } } },
    { id: 'raid_epic', name: '首领神话锭', cost: 60, stock: 1, mats: { ingots: { mythic: 1 } } },
    { id: 'raid_legend', name: '本期神祇杀手', cost: 60, stock: 1, troopRole: 'godslayer' },
    { id: 'raid_traits', name: '讨伐特质', cost: 28, stock: 2, mats: { traitstones: { 'runic:brown': 1, 'runic:yellow': 1 } } },
    { id: 'raid_scroll', name: '熔铸符卷', cost: 36, stock: 1, mats: { forgeScrolls: 1 } },
  ],
  towerOfDoom: [
    { id: 'tod_gold', name: '登塔锻材', cost: 12, stock: 10, mats: { ingots: { epic: 1 } } },
    { id: 'tod_runic', name: '塔顶特质', cost: 24, stock: 2, mats: { traitstones: { 'runic:purple': 1, 'runic:green': 1 } } },
    { id: 'tod_scroll', name: '熔铸符卷', blurb: '末日武器淬炼', cost: 28, stock: 4, mats: { forgeScrolls: 1 } },
    { id: 'tod_celestial', name: '符卷匣', blurb: '末日武器淬炼补给', cost: 60, stock: 1, mats: { forgeScrolls: 3 } },
    { id: 'tod_rare', name: '基础锻材', cost: 10, stock: 6, mats: { ingots: { rare: 4 } } },
    { id: 'tod_traits', name: '登塔特质', cost: 18, stock: 4, mats: { traitstones: { 'major:purple': 2, 'major:green': 1 } } },
  ],
  factionAssault: [
    { id: 'fa_rare', name: '阵营稀有锭', cost: 10, stock: 12, mats: { ingots: { rare: 6 } } },
    { id: 'fa_major', name: '阵营特质', cost: 18, stock: 4, mats: { traitstones: { 'major:red': 1, 'major:blue': 1, 'major:green': 1 } } },
    { id: 'fa_ultra', name: '阵营精锻锭', cost: 20, stock: 5, mats: { ingots: { ultraRare: 3 } } },
    { id: 'fa_epic', name: '本期阵营成员', cost: 55, stock: 1, troopRole: 'faction' },
    { id: 'fa_runic', name: '阵营符文', cost: 28, stock: 3, mats: { traitstones: { 'runic:red': 1, 'runic:blue': 1 } } },
    { id: 'fa_scroll', name: '阵营普通锭', cost: 12, stock: 8, mats: { ingots: { common: 8 } } },
  ],
  worldEvent: [
    { id: 'we_gold', name: '庆典特质', cost: 12, stock: 12, mats: { traitstones: { 'major:green': 2, 'major:yellow': 2 } } },
    { id: 'we_key', name: '本期种族精选', cost: 55, stock: 1, troopRole: 'race' },
    { id: 'we_ingots', name: '庆典普通锭', cost: 8, stock: 10, mats: { ingots: { common: 10 } } },
    { id: 'we_runic', name: '庆典符文', cost: 28, stock: 3, mats: { traitstones: { 'runic:green': 1, 'runic:yellow': 1 } } },
    { id: 'we_scroll', name: '庆典普通锭', cost: 10, stock: 8, mats: { ingots: { common: 7 } } },
  ],
  classTrials: [
    { id: 'ct_minor', name: '入门特质', cost: 12, stock: 4, mats: { traitstones: { 'minor:yellow': 3, 'minor:purple': 3 } } },
    { id: 'ct_major', name: '进阶特质', cost: 26, stock: 2, mats: { traitstones: { 'runic:yellow': 1, 'runic:brown': 1 } } },
    { id: 'ct_runic', name: '职业研习', blurb: '当前装备职业获得经验', cost: 55, stock: 3, classXp: 5000 },
    { id: 'ct_ingots', name: '职业进阶特质', cost: 16, stock: 6, mats: { traitstones: { 'major:yellow': 3, 'major:purple': 3 } } },
    { id: 'ct_scroll', name: '职业天界特质', cost: 48, stock: 1, mats: { traitstones: { celestial: 1 } } },
  ],
};

/** 每两天补货；不改变活动币周产出上限。 */
export const EVENT_SHOP: Record<EventTypeId, readonly EventGoods[]> = Object.fromEntries(
  EVENT_TYPES.map(({ id }) => [id, [...BASE_EVENT_SHOP[id].map(goods => ({ ...goods, ...(goods.mats ? { mats: boostBasicStones(goods.mats) } : {}) })), {
    id: `${id}_arcane`, name: '秘法属性石礼包', cost: 48, stock: 2,
    mats: { traitstones: eventArcaneBundle(id, 2) },
  }]]),
) as unknown as Record<EventTypeId, readonly EventGoods[]>;


/**
 * 各活动类型的里程碑轨（设计值：六档递进；材料轨保留，阈值与宝石由 EVENT_WEEKLY_RULES 覆盖）。
 * 钢锭档位随里程碑递进（低档铺垫、高档收尾），对齐「活动后期奖励更好」的官方手感。
 */
const BASE_EVENT_MILESTONES: Record<EventTypeId, readonly EventMilestone[]> = {
  invasion: [
    { points: 100, label: '特质石包 Ⅰ', mats: { traitstones: { 'minor:red': 4, 'minor:blue': 4, 'minor:green': 4 } } },
    { points: 300, label: '特质石包 Ⅱ', mats: { traitstones: { 'minor:brown': 5, 'minor:yellow': 5, 'major:red': 2 } } },
    { points: 600, label: '特质石包 Ⅲ', mats: { traitstones: { 'minor:purple': 6, 'major:blue': 3, 'major:green': 3 } }, gold: 2000 },
    { points: 1000, label: '精英石包', mats: { traitstones: { 'major:brown': 4, 'major:yellow': 4, 'runic:red': 2 } }, souls: 1500 },
    { points: 1500, label: '符文石包', mats: { traitstones: { 'runic:blue': 2, 'runic:green': 2, 'runic:purple': 2 } }, gems: 60 },
    { points: 2200, label: '入侵大捷', mats: { traitstones: { 'runic:brown': 3, 'runic:yellow': 3 } }, goldKeys: 1, glory: 40 },
  ],
  raidBoss: [
    { points: 100, label: '钢锭口粮', mats: { ingots: { common: 6 } } },
    { points: 300, label: '钢锭袋', mats: { ingots: { rare: 4 } }, gold: 1500 },
    { points: 600, label: '钢锭匣', mats: { ingots: { ultraRare: 4 } }, souls: 1200 },
    { points: 1000, label: '史诗锻材', mats: { ingots: { epic: 3 } }, gems: 40 },
    { points: 1500, label: '神话锻材', mats: { ingots: { mythic: 1 } }, gold: 3000 },
    { points: 2200, label: '屠神锦囊', mats: { ingots: { epic: 4, mythic: 1 }, forgeScrolls: 1 } },
  ],
  towerOfDoom: [
    { points: 100, label: '初登酬卷', mats: { forgeScrolls: 1 } },
    { points: 300, label: '中层酬卷', mats: { forgeScrolls: 2 } },
    { points: 600, label: '符文石包', mats: { traitstones: { 'runic:red': 2, 'runic:blue': 2 } }, souls: 1500 },
    { points: 1000, label: '高层酬卷', mats: { forgeScrolls: 3 } },
    { points: 1500, label: '塔顶宝箱', mats: { traitstones: { 'runic:purple': 3 } }, gems: 60 },
    { points: 2200, label: '末日清剿', mats: { forgeScrolls: 4 } },
  ],
  factionAssault: [
    { points: 100, label: '钢锭先驱包', mats: { ingots: { common: 4, rare: 2 } } },
    { points: 300, label: '特质石包', mats: { traitstones: { 'major:red': 2, 'minor:red': 4 } }, gold: 1500 },
    { points: 600, label: '钢锭精炼包', mats: { ingots: { rare: 3, ultraRare: 2 } }, souls: 1200 },
    { points: 1000, label: '高级石包', mats: { traitstones: { 'major:blue': 3, 'major:brown': 3 } }, gems: 40 },
    { points: 1500, label: '阵营重锤', mats: { ingots: { ultraRare: 3, epic: 2 } }, gold: 2500 },
    { points: 2200, label: '攻城大赏', mats: { ingots: { epic: 2 }, traitstones: { 'runic:green': 2 } } },
  ],
  // 世界事件：points 字段此处 = 累计「事件物资」数（玩法见 systems/events.ts）
  worldEvent: [
    { points: 15, label: '首批物资', gold: 2500 },
    { points: 40, label: '灵魂潮汐', souls: 2000 },
    { points: 80, label: '钥匙包', goldKeys: 1, gold: 1500 },
    { points: 130, label: '世界补给', mats: { ingots: { rare: 2 }, traitstones: { 'minor:yellow': 4 } }, gems: 30 },
    { points: 200, label: '庆典盛装', gems: 80, souls: 2500 },
    { points: 300, label: '世界共荣', gold: 5000, goldKeys: 1, mats: { traitstones: { 'major:yellow': 2, 'major:purple': 2 } } },
  ],
  classTrials: [
    { points: 100, label: '荣耀赏金', glory: 30 },
    { points: 300, label: '试炼石包', mats: { traitstones: { 'minor:red': 4, 'minor:yellow': 4 } }, gold: 1500 },
    { points: 600, label: '荣耀大包', glory: 50, souls: 1200 },
    { points: 1000, label: '进阶石包', mats: { traitstones: { 'major:purple': 2, 'major:green': 2 } }, gems: 40 },
    { points: 1500, label: '冠军礼遇', glory: 80, gold: 2500 },
    { points: 2200, label: '宗师大典', mats: { traitstones: { 'runic:yellow': 2, 'runic:brown': 2 } } },
  ],
};

/** 周常预算唯一来源：单活动1200，共享周目标3600，守土额外160；合计10960。 */
export const EVENT_WEEKLY_RULES = {
  revision: 3, points: [100, 240, 420, 650, 900, 1200],
  supplies: [6, 15, 27, 42, 60, 84], gems: [150, 150, 150, 75, 75, 0],
  tokenCap: 360, towerFloors: 25,
} as const;
/** Older weekly saves predate the gem payment ledger. */
export const EVENT_LEGACY_GEMS_PAID: Record<EventTypeId, readonly number[]> = {
  invasion: [0, 0, 0, 0, 60, 0], raidBoss: [0, 0, 0, 40, 0, 0],
  towerOfDoom: [0, 0, 0, 0, 60, 0], factionAssault: [0, 0, 0, 40, 0, 0],
  worldEvent: [0, 0, 0, 30, 80, 0], classTrials: [0, 0, 0, 40, 0, 0],
};
/** 每条活动轨旧版六档成长货币；当前里程碑在组装时统一翻倍。 */
export const EVENT_MILESTONE_CURRENCY_BONUS = {
  gold: [200, 300, 500, 700, 900, 1300],
  souls: [100, 150, 200, 300, 400, 600],
} as const;
/** 六种活动共享的周胜场：30 胜共 26 史诗锭；成长馈赠 46 枚，共可淬满两把史诗 +8。 */
export const EVENT_SHARED_GOALS = [
  { wins: 6, gems: 600, gold: 800, souls: 400, epicIngots: 3 }, { wins: 12, gems: 800, gold: 1200, souls: 600, epicIngots: 5 },
  { wins: 20, gems: 1000, gold: 1600, souls: 800, epicIngots: 8 }, { wins: 30, gems: 1200, gold: 2400, souls: 1200, epicIngots: 10 },
] as const;
export const EVENT_MILESTONES: Record<EventTypeId, readonly EventMilestone[]> = Object.fromEntries(
  Object.entries(BASE_EVENT_MILESTONES).map(([id, rows]) => [id, rows.map((row, index) => ({
    ...row, points: (id === 'worldEvent' ? EVENT_WEEKLY_RULES.supplies : EVENT_WEEKLY_RULES.points)[index]!,
    gems: EVENT_WEEKLY_RULES.gems[index]! * 2,
    gold: ((row.gold ?? 0) + EVENT_MILESTONE_CURRENCY_BONUS.gold[index]!) * 2,
    souls: ((row.souls ?? 0) + EVENT_MILESTONE_CURRENCY_BONUS.souls[index]!) * 2,
    ...(row.goldKeys ? { goldKeys: row.goldKeys * 2 } : {}),
    ...(row.glory ? { glory: row.glory * 2 } : {}),
    // 普通积分只增加基础材料；高阶挑战奖励按实际关卡单独结算。
    ...(row.mats ? { mats: doubleWeeklyMaterials(boostBasicStones(row.mats)) } : {}),
  }))]),
) as unknown as Record<EventTypeId, readonly EventMilestone[]>;

/** 直接宝石预算从奖励表推导，页面与测试无需另存魔法数字。 */
export const EVENT_WEEKLY_GEM_CAP = Object.values(EVENT_MILESTONES).flat().reduce((sum, row) => sum + (row.gems ?? 0), 0)
  + EVENT_SHARED_GOALS.reduce((sum, goal) => sum + goal.gems, 0)
  + EVENT_WEEKLY_PLAY_REWARD_CAP.invasion * EVENT_DEFENSE_REWARD.gems;


// ---------------------------------------------------------------------------
// 主题参数（每活动 × 每周，周种子确定性派生）——全开放后「每周上新」的唯一变量
// ---------------------------------------------------------------------------

export interface EventTheme {
  type: EventTypeDef;
  /** 入侵/阵营突袭的本周目标王国（null = 非定点王国活动） */
  kingdom: string | null;
  /** 世界事件的本周掉落加成种族（null = 非世界事件） */
  bonusRace: string | null;
}

/**
 * 某活动本周的主题参数（seed = fnv1a(`event-<typeId>-<weekStart>`)；同周必同参数）。
 *
 * **每活动独立派生**：全开放后入侵与阵营突袭同时在跑，共用一个种子会让两者
 * 每周永远打同一个王国（「每周上新」这唯一的变量会退化成一个）。
 */
export function eventThemeOf(typeId: EventTypeId, weekStart: number): EventTheme {
  const type = eventTypeById(typeId);
  const rngSeed = fnv1a32(`event-${typeId}-${weekStart >>> 0}`);
  const kingdoms = allKingdoms();
  const kingdom = kingdoms[rngSeed % kingdoms.length]!;
  let bonusRace: string | null = null;
  if (type.id === 'worldEvent') {
    const races = worldEventRacePool();
    bonusRace = races[rngSeed % races.length] ?? 'Human';
  }
  return {
    type,
    kingdom: type.id === 'invasion' || type.id === 'factionAssault' ? kingdom : null,
    bonusRace,
  };
}

/** Legacy helper: derive the rotating week's theme for older system callers. */
export function eventThemeOfWeek(weekStart: number): EventTheme {
  return eventThemeOf(eventTypeOfWeek(weekStart).id, weekStart);
}

/** Activity index in the fixed tab/rotation order. */
export function rotationIndexOf(id: EventTypeId): number {
  return EVENT_ROTATION.findIndex((t) => t.id === id);
}

/**
 * 世界事件加成种族候选池（取自 troops.json 实际存在的词表，取常见 8 族）。
 * 剔除机制标记（Boss/Castle/Doom）——它们混在 troopTypes 里但不是种族，
 * 派成「本周加成种族」会让玩家无从按种族配队（`data/races.ts` NON_RACE_TYPES）。
 */
function worldEventRacePool(): readonly string[] {
  const counts = new Map<string, number>();
  for (const troop of TROOPS) {
    for (const type of troop.troopTypes) {
      if (!isRaceType(type)) continue;
      counts.set(type, (counts.get(type) ?? 0) + 1);
    }
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([t]) => t);
}
