/**
 * 每周活动轮换表（每周活动批）——官方 Live Event 六类型的单机适配。
 *
 * 结构对齐官方（考据见 design/EVENTS-INVASION-DESIGN.md §1.2/§2.4）：
 *  - 每周一个主题 Live Event，周一起算 7 天（本地周历 weekStartOf）；
 *  - 类型池：入侵 / 突袭首领 / 末日之塔 / 阵营突袭 / 世界事件 / 职业试炼，
 *    官方为「日历周排布」，本作用 6 周大轮换（weekIndex = floor(weekStart / WEEK) % 6）；
 *  - 奖励 = 积分轨里程碑（官方结构），素材侧重按官方对应映射（Invasion 给特质石、
 *    Raid Boss 给钢锭、ToD 给符卷、Faction Assault 给钢锭+特质石、World Event 给钱钥、
 *    Class 系给荣耀与特质石）；
 *  - 现代版的 Sigils 体力与活动商店不引入（单机友好，差异已记录）。
 *
 * 全部数值为设计值；主题参数（入侵势力/突袭王国等）由周种子确定性派生。
 */
import { allKingdoms } from './kingdoms';
import { TROOPS } from '../../data/troops';
import { fnv1a32 } from './hash';
import type { MaterialDelta } from './materials';

/** 一周毫秒数（活动周历刻度） */
export const WEEK_MS = 7 * 24 * 3_600_000;

/** 活动类型 id（轮换表词表） */
export type EventTypeId = 'invasion' | 'raidBoss' | 'towerOfDoom' | 'factionAssault' | 'worldEvent' | 'classTrials';

export interface EventTypeDef {
  id: EventTypeId;
  name: string;
  tagline: string;
  /** 战斗主题一句话（屏层横幅直接显示） */
  brief: string;
  /** 玩法规则卡（各活动独立机制的 2~3 条说明） */
  howto: string[];
  /** 出战按钮文案 */
  fightLabel: string;
}

/** 6 周大轮换（顺序勿动——weekIndex % 6 依赖下标） */
export const EVENT_ROTATION: readonly EventTypeDef[] = [
  {
    id: 'invasion', name: '入侵周', tagline: 'INVASION',
    brief: '敌军压境：击败入侵势力的部队，赢取特质石包。',
    howto: [
      '入侵势力共布下 3 条防线，逐条推进：第 1/2/3 条防线的敌人一节比一节强。',
      '战胜推进到下一条防线；攻破第 3 条防线 = 守土成功，额外领取守土大赏，防线重整再来（难度缓升）。',
      '战败则防线被打回第 1 条，重新推进。',
    ],
    fightLabel: '迎 击',
  },
  {
    id: 'raidBoss', name: '突袭首领周', tagline: 'RAID BOSS',
    brief: '首领压阵的高难战斗，钢锭的主要产出周。',
    howto: [
      '本周盘踞一只突袭首领，血池跨战斗持久：每场打掉的血都会累计，战败也计伤害。',
      '血池见底 = 讨伐成功，领取丰厚战利品并刷新更强（血更厚）的下一只首领。',
      '钢锭的主要产地：里程碑与商店都有钢锭出售。',
    ],
    fightLabel: '讨 伐',
  },
  {
    id: 'towerOfDoom', name: '末日之塔', tagline: 'TOWER OF DOOM',
    brief: '楼层随胜场爬升，符卷与圣辉石的产地。',
    howto: [
      '点击「攀爬」开启一次登塔：一层一战、层数越高敌人越强，每 5 层有首领把守。',
      '队伍状态跨层延续：伤血与阵亡不恢复，减员继续、全灭或战败即登塔结束。',
      '登塔结束按到达层数结算符卷与荣耀；历史最高层单独记录。',
    ],
    fightLabel: '攀 爬',
  },
  {
    id: 'factionAssault', name: '阵营突袭', tagline: 'FACTION ASSAULT',
    brief: '攻打指定阵营的领地，钢锭与特质石双收。',
    howto: [
      '本周攻打目标阵营的领地；编入该王国的部队每 1 名，全队攻击 +2、生命 +10（可叠加）。',
      '配队越贴近目标阵营，攻势越猛——按阵营构筑是本周的题目。',
    ],
    fightLabel: '进 攻',
  },
  {
    id: 'worldEvent', name: '世界事件', tagline: 'WORLD EVENT',
    brief: '全境混战，黄金与钥匙的盛宴。',
    howto: [
      '战斗胜利掉落「事件物资」（每场 2~4 件）；队伍中每有 1 名本周加成种族的部队，掉落再 +2。',
      '里程碑按累计物资结算（不再按积分）：6 档目标逐档发放黄金/钥匙/宝石/特质石。',
      '加成种族每周轮换——按种族配队能明显加速收集。',
    ],
    fightLabel: '参 战',
  },
  {
    id: 'classTrials', name: '职业试炼', tagline: 'CLASS TRIALS',
    brief: '主角必须出战，职业经验翻倍，荣耀加发。',
    howto: [
      '主角必须编入出战队伍；职业经验 ×2，荣耀可从里程碑与商店大量兑换。',
      '连胜试炼：连续胜利第 2/3/4 场起积分 ×1.3/×1.6/×2.0（封顶 ×2），战败连击清零。',
      '要高分就去挑战连胜——稳扎稳打还是乘胜追击由你决定。',
    ],
    fightLabel: '出 战',
  },
] as const;

/** 由 weekStart 求本周活动类型（weekStart 由调用方按本地周历算好传入） */
export function eventTypeOfWeek(weekStart: number): EventTypeDef {
  const weekIndex = Math.floor(weekStart / WEEK_MS);
  return EVENT_ROTATION[((weekIndex % EVENT_ROTATION.length) + EVENT_ROTATION.length) % EVENT_ROTATION.length]!;
}

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
  name: string;
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
    { id: 'invasion_minor', name: '初级石包 ×6', cost: 8, stock: null, mats: { traitstones: { 'minor:red': 2, 'minor:blue': 2, 'minor:green': 2 } } },
    { id: 'invasion_major', name: '高级石包 ×3', cost: 15, stock: 4, mats: { traitstones: { 'major:yellow': 1, 'major:purple': 1, 'major:brown': 1 } } },
    { id: 'invasion_runic', name: '符文石 ×2', cost: 25, stock: 3, mats: { traitstones: { 'runic:red': 1, 'runic:blue': 1 } } },
    { id: 'invasion_celestial', name: '圣辉石', cost: 60, stock: 1, mats: { traitstones: { celestial: 1 } } },
  ],
  raidBoss: [
    { id: 'raid_common', name: '普通钢锭 ×10', cost: 6, stock: null, mats: { ingots: { common: 10 } } },
    { id: 'raid_rare', name: '稀有钢锭 ×6', cost: 10, stock: null, mats: { ingots: { rare: 6 } } },
    { id: 'raid_ultra', name: '超稀钢锭 ×4', cost: 16, stock: 4, mats: { ingots: { ultraRare: 4 } } },
    { id: 'raid_epic', name: '史诗钢锭 ×3', cost: 28, stock: 3, mats: { ingots: { epic: 3 } } },
    { id: 'raid_legend', name: '传说钢锭', cost: 35, stock: 2, mats: { ingots: { legendary: 1 } } },
  ],
  towerOfDoom: [
    { id: 'tod_gold', name: '塔层酬金 2500', cost: 8, stock: null, gold: 2500 },
    { id: 'tod_runic', name: '符文石 ×2', cost: 25, stock: 2, mats: { traitstones: { 'runic:purple': 1, 'runic:green': 1 } } },
    { id: 'tod_scroll', name: '熔铸符卷', cost: 30, stock: 4, mats: { forgeScrolls: 1 } },
    { id: 'tod_celestial', name: '圣辉石', cost: 60, stock: 1, mats: { traitstones: { celestial: 1 } } },
  ],
  factionAssault: [
    { id: 'fa_rare', name: '稀有钢锭 ×4', cost: 10, stock: null, mats: { ingots: { rare: 4 } } },
    { id: 'fa_major', name: '高级石包 ×3', cost: 15, stock: 4, mats: { traitstones: { 'major:red': 1, 'major:blue': 1, 'major:green': 1 } } },
    { id: 'fa_ultra', name: '超稀钢锭 ×3', cost: 16, stock: 4, mats: { ingots: { ultraRare: 3 } } },
    { id: 'fa_epic', name: '史诗钢锭 ×2', cost: 28, stock: 2, mats: { ingots: { epic: 2 } } },
  ],
  worldEvent: [
    { id: 'we_gold', name: '庆典资金 3000', cost: 8, stock: null, gold: 3000 },
    { id: 'we_souls', name: '灵魂 2000', cost: 8, stock: null, souls: 2000 },
    { id: 'we_gems', name: '宝石 40', cost: 18, stock: 3, gems: 40 },
    { id: 'we_key', name: '金钥匙', cost: 20, stock: 2, goldKeys: 1 },
  ],
  classTrials: [
    { id: 'ct_glory', name: '荣耀 30', cost: 10, stock: null, glory: 30 },
    { id: 'ct_minor', name: '初级石包 ×6', cost: 8, stock: null, mats: { traitstones: { 'minor:yellow': 2, 'minor:purple': 2, 'minor:brown': 2 } } },
    { id: 'ct_major', name: '高级石包 ×2', cost: 15, stock: 4, mats: { traitstones: { 'major:purple': 1, 'major:green': 1 } } },
    { id: 'ct_runic', name: '符文石 ×2', cost: 25, stock: 2, mats: { traitstones: { 'runic:yellow': 1, 'runic:brown': 1 } } },
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
    { points: 100, label: '普通钢锭 ×6', mats: { ingots: { common: 6 } } },
    { points: 300, label: '稀有钢锭 ×4', mats: { ingots: { rare: 4 } }, gold: 1500 },
    { points: 600, label: '超稀钢锭 ×4', mats: { ingots: { ultraRare: 4 } }, souls: 1200 },
    { points: 1000, label: '史诗钢锭 ×3', mats: { ingots: { epic: 3 } }, gems: 40 },
    { points: 1500, label: '传说钢锭 ×2', mats: { ingots: { legendary: 2 } }, gold: 3000 },
    { points: 2200, label: '屠神锦囊', mats: { ingots: { epic: 4, mythic: 1 }, forgeScrolls: 1 } },
  ],
  towerOfDoom: [
    { points: 100, label: '熔铸符卷 ×1', mats: { forgeScrolls: 1 } },
    { points: 300, label: '熔铸符卷 ×2', mats: { forgeScrolls: 2 } },
    { points: 600, label: '符文石包', mats: { traitstones: { 'runic:red': 2, 'runic:blue': 2 } }, souls: 1500 },
    { points: 1000, label: '熔铸符卷 ×3', mats: { forgeScrolls: 3 } },
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
// 主题参数（周种子确定性派生）
// ---------------------------------------------------------------------------

export interface EventTheme {
  type: EventTypeDef;
  /** 入侵/阵营突袭的目标王国（null = 非定点王国活动） */
  kingdom: string | null;
  /** 世界事件周的掉落加成种族（null = 非世界事件周） */
  bonusRace: string | null;
}

/** 本周活动主题（seed = fnv1a(weekStart)；同周必同主题参数） */
export function eventThemeOfWeek(weekStart: number): EventTheme {
  const type = eventTypeOfWeek(weekStart);
  const rngSeed = fnv1a32(`event-${weekStart >>> 0}`);
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

/** 世界事件加成种族候选池（取自 troops.json 实际存在的种族词表，取常见 8 族） */
function worldEventRacePool(): readonly string[] {
  const counts = new Map<string, number>();
  for (const troop of TROOPS) {
    for (const type of troop.troopTypes) counts.set(type, (counts.get(type) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([t]) => t);
}

/** 活动类型在 6 周轮换中的下标（页面倒计时用） */
export function rotationIndexOf(id: EventTypeId): number {
  return EVENT_ROTATION.findIndex((t) => t.id === id);
}
