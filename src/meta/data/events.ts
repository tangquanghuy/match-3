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
 *  - 六活动全开放后总产出是原来的 6 倍，按 `10-events.md` §4 推荐「独立周额 + 不上调阈值」
 *    收口：里程碑阈值一律不动，玩法推进类奖励（守土大赏/讨伐战利品/登塔结算）按
 *    `EVENT_WEEKLY_PLAY_REWARD_CAP` 封每活动周额，到顶后继续打只给积分与代币；
 *  - 现代版的 Sigils 体力不引入（单机友好，差异已记录）。
 *
 * 全部数值为设计值。
 */
import { allKingdoms } from './kingdoms';
import { TROOPS } from '../../data/troops';
import { fnv1a32 } from './hash';
import { isRaceType } from './races';
import type { MaterialDelta } from './materials';

/** 一周毫秒数（活动周历刻度） */
export const WEEK_MS = 7 * 24 * 3_600_000;

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
  /** 玩法规则卡（各活动独立机制的 2~3 条说明） */
  howto: string[];
  /** 出战按钮文案 */
  fightLabel: string;
  /**
   * 活动主题色（六色固定、互不复用）——代币归属的第一层视觉表达：
   * 商店页的代币图标底色 / 价格标签 / 页签描边都取它，让「换店 = 换钱包」可见
   * （`11-event-shop.md` §D 三层冗余的第二、三层）。
   */
  accent: string;
  /** 代币名（带活动前缀，不叫「活动代币」——六池互不通兑的第二层表达） */
  tokenName: string;
}

/** 六活动常驻词表（顺序 = 页签与总览卡的固定排序；下标语义见 eventTypeIndexOf） */
export const EVENT_TYPES: readonly EventTypeDef[] = [
  {
    id: 'invasion', name: '入侵周', shortName: '入侵', tagline: 'INVASION',
    accent: '#c2506a', tokenName: '入侵代币',
    brief: '敌军压境：击败入侵势力的部队，赢取特质石包。',
    howto: [
      '入侵势力共布下 3 条防线，逐条推进：第 1/2/3 条防线的敌人一节比一节强。',
      '战胜推进到下一条防线；攻破第 3 条防线 = 守土成功，额外领取守土大赏，防线重整再来（难度缓升）。',
      '战败则防线被打回第 1 条，重新推进。',
    ],
    fightLabel: '迎 击',
  },
  {
    id: 'raidBoss', name: '突袭首领周', shortName: '突袭首领', tagline: 'RAID BOSS',
    accent: '#d08a3a', tokenName: '突袭代币',
    brief: '首领压阵的高难战斗，钢锭的主要产出周。',
    howto: [
      '本周盘踞一只突袭首领，血池跨战斗持久：每场打掉的血都会累计，战败也计伤害。',
      '血池见底 = 讨伐成功，领取丰厚战利品并刷新更强（血更厚）的下一只首领。',
      '钢锭的主要产地：里程碑与商店都有钢锭出售。',
    ],
    fightLabel: '讨 伐',
  },
  {
    id: 'towerOfDoom', name: '末日之塔', shortName: '末日之塔', tagline: 'TOWER OF DOOM',
    accent: '#3f9fb0', tokenName: '塔层代币',
    brief: '楼层随胜场爬升，符卷与圣辉石的产地。',
    howto: [
      '点击「攀爬」开启一次登塔：一层一战、层数越高敌人越强，每 5 层有首领把守。',
      '队伍状态跨层延续：伤血与阵亡不恢复，减员继续、全灭或战败即登塔结束。',
      '登塔结束按到达层数结算符卷与荣耀；历史最高层单独记录。',
    ],
    fightLabel: '攀 爬',
  },
  {
    id: 'factionAssault', name: '阵营突袭', shortName: '阵营突袭', tagline: 'FACTION ASSAULT',
    accent: '#b99230', tokenName: '阵营代币',
    brief: '攻打指定阵营的领地，钢锭与特质石双收。',
    howto: [
      '本周攻打目标阵营的领地；编入该王国的部队每 1 名，全队攻击 +2、生命 +10（可叠加）。',
      '配队越贴近目标阵营，攻势越猛——按阵营构筑是本周的题目。',
    ],
    fightLabel: '进 攻',
  },
  {
    id: 'worldEvent', name: '世界事件', shortName: '世界事件', tagline: 'WORLD EVENT',
    accent: '#4f9e63', tokenName: '庆典代币',
    brief: '全境混战，黄金与钥匙的盛宴。',
    howto: [
      '战斗胜利掉落「事件物资」（每场 2~4 件）；队伍中每有 1 名本周加成种族的部队，掉落再 +2。',
      '里程碑按累计物资结算（不再按积分）：6 档目标逐档发放黄金/钥匙/宝石/特质石。',
      '加成种族每周轮换——按种族配队能明显加速收集。',
    ],
    fightLabel: '参 战',
  },
  {
    id: 'classTrials', name: '职业试炼', shortName: '职业试炼', tagline: 'CLASS TRIALS',
    accent: '#6f7fd0', tokenName: '试炼代币',
    brief: '主角必须出战，职业经验翻倍，荣耀加发。',
    howto: [
      '主角必须编入出战队伍；职业经验 ×2，荣耀可从里程碑与商店大量兑换。',
      '连胜试炼：连续胜利第 2/3/4 场起积分 ×1.3/×1.6/×2.0（封顶 ×2），战败连击清零。',
      '要高分就去挑战连胜——稳扎稳打还是乘胜追击由你决定。',
    ],
    fightLabel: '出 战',
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
 * 每活动每周的「玩法推进奖励」周额（产出节奏 ×6 校准的单源，`10-events.md` §4 推荐值）。
 *
 * 只封**里程碑轨之外**的重复性玩法产出（里程碑本身天然一次性、商店天然限量）：
 *  - invasion  守土成功大赏（荣耀/宝石/符文石）每周最多 4 次；
 *  - raidBoss  讨伐战利品（史诗/传说钢锭）每周最多 4 只；
 *  - towerOfDoom 登塔结算（符卷/荣耀）每周最多 6 程；
 *  - 其余三个活动没有里程碑之外的产出，周额为 0（不计数）。
 * 到顶后继续打**只给积分与代币**（不停活动、不停里程碑追赶，只停素材），
 * 这样「只玩一个活动」的玩家手感不变，而六活动全打满的总产出被封住。
 */
export const EVENT_WEEKLY_PLAY_REWARD_CAP: Record<EventTypeId, number> = {
  invasion: 4,
  raidBoss: 4,
  towerOfDoom: 6,
  factionAssault: 0,
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
 * 单场 30~120 分 → 3~12 代币；打满 2200 分全程约产 220+ 代币，商店高档货的
 * 周限量合计约 150~200 代币（肝满可清店，挂机不满）。
 */
export const EVENT_TOKEN_MIN_PER_WIN = 3;
export const EVENT_TOKEN_DIVISOR = 10;

export interface EventGoods {
  /** 稳定 id（周限量的已购计数按它记存档，勿改动已有 id） */
  id: string;
  /**
   * 货名 = **包名**，不复读内容（S-2 根因收口）。数量与构成一律由屏层的结构化
   * 奖励摘要（图标 + ×N）出——`name` 里再写一遍「×10」会让每件货占两行说同一件事。
   */
  name: string;
  /** 一句话卖点（招牌位与 tooltip 用；可缺省） */
  blurb?: string;
  /** 活动代币售价 */
  cost: number;
  /** 周限量（null = 无限量）；每周随活动实例重置 */
  stock: number | null;
  gold?: number;
  souls?: number;
  gems?: number;
  goldKeys?: number;
  glory?: number;
  mats?: MaterialDelta;
}

/** 各活动类型的商店货架（设计值；素材侧重与里程碑轨一致，高档货限量） */
export const EVENT_SHOP: Record<EventTypeId, readonly EventGoods[]> = {
  invasion: [
    { id: 'invasion_minor', name: '初级石包', blurb: '三色初级石各 2 颗', cost: 8, stock: null, mats: { traitstones: { 'minor:red': 2, 'minor:blue': 2, 'minor:green': 2 } } },
    { id: 'invasion_major', name: '高级石包', blurb: '三色高级石各 1 颗', cost: 15, stock: 4, mats: { traitstones: { 'major:yellow': 1, 'major:purple': 1, 'major:brown': 1 } } },
    { id: 'invasion_runic', name: '符文石包', blurb: '第三档特质槽的门槛石', cost: 25, stock: 3, mats: { traitstones: { 'runic:red': 1, 'runic:blue': 1 } } },
    { id: 'invasion_celestial', name: '圣辉石', blurb: '无色万能：任意颜色特质通用', cost: 60, stock: 1, mats: { traitstones: { celestial: 1 } } },
  ],
  raidBoss: [
    { id: 'raid_common', name: '普通钢锭袋', blurb: '低级淬炼的口粮', cost: 6, stock: null, mats: { ingots: { common: 10 } } },
    { id: 'raid_rare', name: '稀有钢锭袋', cost: 10, stock: null, mats: { ingots: { rare: 6 } } },
    { id: 'raid_ultra', name: '超稀钢锭匣', cost: 16, stock: 4, mats: { ingots: { ultraRare: 4 } } },
    { id: 'raid_epic', name: '史诗钢锭匣', cost: 28, stock: 3, mats: { ingots: { epic: 3 } } },
    { id: 'raid_legend', name: '传说钢锭', blurb: '高阶淬炼唯一来源', cost: 35, stock: 2, mats: { ingots: { legendary: 1 } } },
  ],
  towerOfDoom: [
    { id: 'tod_gold', name: '塔层酬金', cost: 8, stock: null, gold: 2500 },
    { id: 'tod_runic', name: '符文石包', cost: 25, stock: 2, mats: { traitstones: { 'runic:purple': 1, 'runic:green': 1 } } },
    { id: 'tod_scroll', name: '熔铸符卷', blurb: 'Doomed 系武器淬炼专用', cost: 30, stock: 4, mats: { forgeScrolls: 1 } },
    { id: 'tod_celestial', name: '圣辉石', blurb: '无色万能：任意颜色特质通用', cost: 60, stock: 1, mats: { traitstones: { celestial: 1 } } },
  ],
  factionAssault: [
    { id: 'fa_rare', name: '稀有钢锭袋', cost: 10, stock: null, mats: { ingots: { rare: 4 } } },
    { id: 'fa_major', name: '高级石包', blurb: '三色高级石各 1 颗', cost: 15, stock: 4, mats: { traitstones: { 'major:red': 1, 'major:blue': 1, 'major:green': 1 } } },
    { id: 'fa_ultra', name: '超稀钢锭匣', cost: 16, stock: 4, mats: { ingots: { ultraRare: 3 } } },
    { id: 'fa_epic', name: '史诗钢锭匣', cost: 28, stock: 2, mats: { ingots: { epic: 2 } } },
  ],
  worldEvent: [
    { id: 'we_gold', name: '庆典资金', cost: 8, stock: null, gold: 3000 },
    { id: 'we_souls', name: '灵魂潮汐', cost: 8, stock: null, souls: 2000 },
    { id: 'we_gems', name: '宝石袋', cost: 18, stock: 3, gems: 40 },
    { id: 'we_key', name: '金钥匙', blurb: '金宝箱的唯一门票', cost: 20, stock: 2, goldKeys: 1 },
  ],
  classTrials: [
    { id: 'ct_glory', name: '荣耀赏金', cost: 10, stock: null, glory: 30 },
    { id: 'ct_minor', name: '初级石包', blurb: '三色初级石各 2 颗', cost: 8, stock: null, mats: { traitstones: { 'minor:yellow': 2, 'minor:purple': 2, 'minor:brown': 2 } } },
    { id: 'ct_major', name: '高级石包', cost: 15, stock: 4, mats: { traitstones: { 'major:purple': 1, 'major:green': 1 } } },
    { id: 'ct_runic', name: '符文石包', cost: 25, stock: 2, mats: { traitstones: { 'runic:yellow': 1, 'runic:brown': 1 } } },
  ],
};

/**
 * 各活动类型的里程碑轨（设计值：六档递进；总投入约「一周日均 8 场胜局」的节奏）。
 * 钢锭档位随里程碑递进（低档铺垫、高档收尾），对齐「活动后期奖励更好」的官方手感。
 */
export const EVENT_MILESTONES: Record<EventTypeId, readonly EventMilestone[]> = {
  invasion: [
    { points: 100, label: '特质石包 Ⅰ', mats: { traitstones: { 'minor:red': 4, 'minor:blue': 4, 'minor:green': 4 } } },
    { points: 300, label: '特质石包 Ⅱ', mats: { traitstones: { 'minor:brown': 5, 'minor:yellow': 5, 'major:red': 2 } } },
    { points: 600, label: '特质石包 Ⅲ', mats: { traitstones: { 'minor:purple': 6, 'major:blue': 3, 'major:green': 3 } }, gold: 2000 },
    { points: 1000, label: '精英石包', mats: { traitstones: { 'major:brown': 4, 'major:yellow': 4, 'runic:red': 2 } }, souls: 1500 },
    { points: 1500, label: '符文石包', mats: { traitstones: { 'runic:blue': 2, 'runic:green': 2, 'runic:purple': 2 } }, gems: 60 },
    { points: 2200, label: '入侵大捷', mats: { traitstones: { 'runic:brown': 3, 'runic:yellow': 3, celestial: 1 } }, goldKeys: 1, glory: 40 },
  ],
  raidBoss: [
    { points: 100, label: '钢锭口粮', mats: { ingots: { common: 6 } } },
    { points: 300, label: '钢锭袋', mats: { ingots: { rare: 4 } }, gold: 1500 },
    { points: 600, label: '钢锭匣', mats: { ingots: { ultraRare: 4 } }, souls: 1200 },
    { points: 1000, label: '史诗锻材', mats: { ingots: { epic: 3 } }, gems: 40 },
    { points: 1500, label: '传说锻材', mats: { ingots: { legendary: 2 } }, gold: 3000 },
    { points: 2200, label: '屠神锦囊', mats: { ingots: { epic: 4, mythic: 1 }, forgeScrolls: 1 } },
  ],
  towerOfDoom: [
    { points: 100, label: '初登酬卷', mats: { forgeScrolls: 1 } },
    { points: 300, label: '中层酬卷', mats: { forgeScrolls: 2 } },
    { points: 600, label: '符文石包', mats: { traitstones: { 'runic:red': 2, 'runic:blue': 2 } }, souls: 1500 },
    { points: 1000, label: '高层酬卷', mats: { forgeScrolls: 3 } },
    { points: 1500, label: '塔顶宝箱', mats: { traitstones: { 'runic:purple': 3, celestial: 1 } }, gems: 60 },
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
    { points: 2200, label: '宗师大典', mats: { traitstones: { celestial: 1, 'runic:yellow': 2, 'runic:brown': 2 } } },
  ],
};

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
