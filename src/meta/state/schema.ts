/**
 * Meta 层存档 schema（v2）——对齐 META-GAME-PLAN.md §3.3 草案。
 *
 * 本文件只有类型与默认值工厂：禁 DOM、禁引擎/会话依赖（方向：meta → data 单向）。
 * 字段语义要点：
 *  - collection 以 troopId 十进制字符串为键（JSON 对象键只能是字符串），**每卡一条**，
 *    升级/升阶/特质对同卡全副本生效（官方语义）；`copies` 是本体之外的同名卡数。
 *  - teams 的数组顺序 = 站位：队首吃骷髅伤害；主角可编入也可不编入（裁定①，3~4 人）。
 *  - kingdoms 缺条目 = 1 级 / 0 任务进度（首次交互时才写入条目）。
 */

import { STARTING_CURRENCIES } from '../data/economy';
import { STARTER_WEAPON_ID } from '../data/weapons';
import type { EventTypeId } from '../data/events';

export const META_SAVE_VERSION = 3;

/**
 * v1 → v2（主角系统 v2：官方 38 职业 + 天赋树）：
 *  - 旧 8 职业为设计虚构（berserker/cleric/rogue/druid/ranger 无官方对应），
 *    迁移时重映射到官方职业 id（见 MIGRATIONS）；
 *  - talentSpent（按等级自动生效的旧天赋点）废弃，改 talentPicks（7 档三树选一）；
 *  - 新增 classTraits（职业专属特质三槽解锁状态）。
 *
 * v2 → v3（UX 阶段 B 窗口 N：活动全开放）：
 *  - 六活动从「6 周轮换、一周只有一个在跑」改为**常驻全开放**，
 *    因此 `eventWeek`（全局单实例）拆成 `eventWeeks`（每活动一份周实例）——
 *    不拆的后果实测可见：六个类型页共用同一串积分/代币/已购/里程碑 claimed，
 *    在 A 活动攒的分会把 B 活动的里程碑一起领掉（`10-events.md` §4 附加 2）；
 *  - 迁移：旧单实例按它自己的 weekStart 还原出「当时的轮值类型」，归到该活动名下，
 *    其余五个活动从零开始（见 MIGRATIONS[2]）。
 */

// ---------------------------------------------------------------------------
// 基础节
// ---------------------------------------------------------------------------

export interface Currencies {
  gold: number;
  souls: number;
  gems: number;
  goldKeys: number;
  /** 荣耀（官方 Glory：排位 PvP 主产，20 荣耀=1 荣耀箱；2026-09-19 素材批加性字段） */
  glory: number;
}

/** 素材库存（2026-09-19 素材批：淬炼钢锭 / 熔铸符卷 / 特质石；词表见 data/materials.ts） */
export interface Materials {
  /** 钢锭按档位（键 = data/materials IngotKey） */
  ingots: Record<string, number>;
  /** 熔铸符卷（Doomed 系武器淬炼专用） */
  forgeScrolls: number;
  /** 特质石：键 = '{tier}:{color}' 或 'celestial'（见 data/materials.stoneKey） */
  traitstones: Record<string, number>;
}

/** 武器淬炼等级：weaponId → level（0 起步，上限 20；WEAPON-FORGE-DESIGN §1 F2 接线） */
export type WeaponTempering = Record<string, number>;

/** 单张卡（按 troopId 计）的养成记录 */
export interface TroopRecord {
  /** 未入队的同名卡数量（升阶/特质解锁消耗它；本体不计入） */
  copies: number;
  /** 当前等级（1 起，上限按稀有度档 15..20） */
  level: number;
  /** 升阶数（0~3），+1 = 稀有度档 +1 */
  ascension: number;
  /** 三个特质槽的解锁状态（顺序同 troops.json traits 数组） */
  traits: [boolean, boolean, boolean];
  /** 分解保护 */
  locked: boolean;
}

/** 编队成员：主角是特殊成员（无 troopId），部队用数值 id */
export type TeamMember = { kind: 'hero' } | { kind: 'troop'; troopId: number };

export interface TeamPreset {
  name: string;
  /** 3~4 人；数组顺序 = 站位，队首吃骷髅伤害 */
  members: TeamMember[];
  /** 旗帜王国（null = 未选；两主色匹配给 +1 法力，M6 接引擎） */
  bannerKingdomId: string | null;
}

// ---------------------------------------------------------------------------
// 主角 / 竞技场 / 王国（系统逻辑后续里程碑落地，schema 先占位定版）
// ---------------------------------------------------------------------------

export interface HeroState {
  level: number;
  xp: number;
  classId: string | null;
  classLevels: Record<string, number>;
  /** 职业当前经验（冠军等级 1~100） */
  classXp: Record<string, number>;
  unlockedClasses: string[];
  unlockedWeapons: string[];
  equippedWeapon: string | null;
  /**
   * classId → 已选天赋（长度 7 的稀疏数组，下标 = 档位 0..6，值 = 天赋 code 或 null）。
   * 每档至多选 1 条（三树七档选一），可随时改配（官方口径）。
   */
  talentPicks: Record<string, (string | null)[]>;
  /** classId → 职业专属特质三槽解锁状态（顺序同 classes.json perks） */
  classTraits: Record<string, [boolean, boolean, boolean]>;
}

/** 进行中的一轮现开赛（draft 卡即用即弃，不进 collection——裁定④） */
export interface ActiveDraft {
  seed: number;
  picked: number[];
  stage: 'picking' | 'building' | 'fighting';
  wins: number;
}

export interface ArenaState {
  activeDraft: ActiveDraft | null;
  seasonWins: number;
  bestRun: number;
  /** 最近一次使用本周免费票的时刻（epoch ms）；< weekStart 即本周免费可用。加性字段 */
  lastFreeEntryAt: number;
}

/** 入侵 PvP（2026-09-19）：联赛官阶 + 每周 VP 赛季（系统逻辑见 systems/invasion.ts） */
export interface InvasionState {
  /** 联赛 idx 0..9（0=青铜；INVASION_LEAGUES 词表） */
  league: number;
  /** 本周 VP */
  vp: number;
  /** 当前赛季周锚点（weekStart；0 = 从未进入过入侵） */
  weekStart: number;
  /** 本周对手池种子（同周复现同一份 30 人榜单） */
  seed: number;
  /** 最近一次入侵胜利的「当日零点」（每日首胜荣耀判定）；0 = 今天还没赢过 */
  lastWinDay: number;
  /** 本周已打的入侵场数（0 场跨周 = 不降不发，官方「不打不降」口径） */
  battles: number;
  /** 历史最高联赛 */
  bestLeague: number;
  /** 已完成的赛季数 */
  seasonsPlayed: number;
}

/**
 * **单个活动**的周实例（系统逻辑见 systems/events.ts；里程碑达标自动入账）。
 * 六活动各持一份（`MetaSave.eventWeeks`）：积分/代币/已购/里程碑/玩法状态全部独立，
 * 互不通兑、互不串号。周一 0:00 六份统一重置。
 */
export interface EventWeekState {
  /** 本活动周锚点（weekStart） */
  weekStart: number;
  /** 已得积分 */
  points: number;
  /** 已自动入账的里程碑下标（EVENT_MILESTONES 序） */
  claimed: number[];
  /** 本周活动胜场 */
  wins: number;
  /** 本活动代币（只能在本活动的商店花；胜场获得，跨周作废；六池互不通兑） */
  tokens: number;
  /** 本周累计已赚代币（商店页「本周已赚 N」用；只增不减，购买不扣它） */
  tokensEarned: number;
  /**
   * 本周已发放的「玩法推进奖励」次数（守土成功/讨伐成功/登塔结算）。
   * 达到 `EVENT_WEEKLY_PLAY_REWARD_CAP[typeId]` 后继续打只给积分与代币——
   * 这是六活动全开放后的产出封口（`data/events.ts` 单源）。
   */
  playRewards: number;
  /** 活动商店已购计数：goodsId → 次数（限量货架按它判库存） */
  bought: Record<string, number>;
  /**
   * 六种活动的玩法状态（键约定见 systems/events.ts EVENT_STATE_KEYS）：
   * invasion 防线 invLine/invRepelled；raidBoss 血池 bossTier/bossHp/bossMax/bossesSlain；
   * towerOfDoom 楼层 floor/floorBest/runActive；worldEvent 物资 supplies；
   * classTrials 连胜 trialStreak；factionAssault 进攻次数 assaultWins。
   */
  eventData: Record<string, number>;
  /**
   * 末日之塔爬塔 run 的冻结队伍（跨场延续 HP/阵亡）；仅爬塔期间非 null。
   * `maxHp` 是画残血格必需的分母（`10-events.md` E-4 ③：玩家决定「继续爬还是收手」
   * 的唯一依据是四个成员各自还剩多少血，只报「存活 3 人」等于没报）。
   */
  runTeam: { externalId: string; hp: number; maxHp: number; defeated: boolean }[] | null;
}

export interface KingdomState {
  /** 1~10 */
  level: number;
  questsDone: number;
  exploreTier: number;
  /** 进贡离线结算锚点（epoch ms） */
  lastTributeAt: number;
}

export interface MetaStats {
  battlesWon: number;
  battlesLost: number;
  soulsEarned: number;
  goldEarned: number;
}

export interface MetaSettings {
  language: 'zh';
  battleDebug: boolean;
}

/** 一次开箱记录（计划 §4.7：存最近 N 次供对账审计；上限由 gacha 系统维护） */
export interface GachaLogEntry {
  /** 开箱时刻 epoch ms（调用方传入） */
  at: number;
  kind: 'gem' | 'gold' | 'glory';
  seed: number;
  troops: number[];
}

/** 抽卡日志容量：超出即丢最旧的 */
export const GACHA_LOG_CAP = 50;

// ---------------------------------------------------------------------------
// 存档根对象
// ---------------------------------------------------------------------------

export interface MetaSave {
  version: typeof META_SAVE_VERSION;
  createdAt: number;
  savedAt: number;
  currencies: Currencies;
  hero: HeroState;
  /** key = troopId 十进制字符串 */
  collection: Record<string, TroopRecord>;
  teams: TeamPreset[];
  activeTeamIndex: number;
  arena: ArenaState;
  /** key = 王国名（troops.json 的 kingdom 字段口径） */
  kingdoms: Record<string, KingdomState>;
  stats: MetaStats;
  /** 最近一次领取每日首胜的「当日零点」epoch ms；0 = 从未领取。加性字段，version 仍为 1 */
  dailyFirstWinAt: number;
  /** 最近开箱记录（新的在前，最多 GACHA_LOG_CAP 条）。加性字段，version 仍为 1 */
  gachaLog: GachaLogEntry[];
  /** 素材库存（加性字段，version 仍为 2） */
  materials: Materials;
  /** 有新素材入账且尚未进入材料库查看；加性 UI 状态，旧档默认为 false */
  materialsUnread: boolean;
  /** 武器淬炼等级（加性字段，version 仍为 2） */
  weaponTempering: WeaponTempering;
  /** 入侵 PvP 赛季（加性字段，version 仍为 2） */
  invasion: InvasionState;
  /**
   * 每周活动周实例 · **per-event**（schema v3）：键 = EventTypeId，缺键 = 该活动本周还没打过。
   * 六活动常驻全开放，进度/代币/已购/里程碑各自独立（不拆会串号，见 v3 迁移说明）。
   */
  eventWeeks: Partial<Record<EventTypeId, EventWeekState>>;
  settings: MetaSettings;
}

export interface NewSaveOptions {
  /** epoch ms；测试传 0 保证确定性 */
  now?: number;
  /** 初始拥有的部队（默认不给）；给 starter 队需要 ≥3 张 */
  starterTroopIds?: readonly number[];
  /** 初始货币（默认 STARTING_CURRENCIES；显式传空对象可从零开始） */
  currencies?: Partial<Currencies>;
  /** 初始预设队名（默认用起始王国名组装；仅当给了 ≥3 张 starter 时创建） */
  starterTeamName?: string | null;
}

function newHero(): HeroState {
  return {
    level: 1,
    xp: 0,
    classId: null,
    classLevels: {},
    classXp: {},
    unlockedClasses: [],
    unlockedWeapons: [STARTER_WEAPON_ID],
    equippedWeapon: STARTER_WEAPON_ID,
    talentPicks: {},
    classTraits: {},
  };
}

function newTroopRecord(): TroopRecord {
  return { copies: 0, level: 1, ascension: 0, traits: [false, false, false], locked: false };
}

/** 组一个全新存档。starter 部队按 troops.json 的 id 引用（对账脚本能校验悬空引用）。 */
export function newSave(options: NewSaveOptions = {}): MetaSave {
  const now = options.now ?? Date.now();
  const currencies: Currencies = Object.assign(
    { gold: 0, souls: 0, gems: 0, goldKeys: 0, glory: 0 },
    STARTING_CURRENCIES,
    options.currencies,
  );
  const save: MetaSave = {
    version: META_SAVE_VERSION,
    createdAt: now,
    savedAt: now,
    currencies,
    hero: newHero(),
    collection: {},
    teams: [],
    activeTeamIndex: 0,
    arena: { activeDraft: null, seasonWins: 0, bestRun: 0, lastFreeEntryAt: 0 },
    kingdoms: {},
    stats: { battlesWon: 0, battlesLost: 0, soulsEarned: 0, goldEarned: 0 },
    dailyFirstWinAt: 0,
    gachaLog: [],
    materials: { ingots: {}, forgeScrolls: 0, traitstones: {} },
    materialsUnread: false,
    weaponTempering: {},
    invasion: { league: 0, vp: 0, weekStart: 0, seed: 0, lastWinDay: 0, battles: 0, bestLeague: 0, seasonsPlayed: 0 },
    eventWeeks: {},
    settings: { language: 'zh', battleDebug: false },
  };
  const starters = options.starterTroopIds ?? [];
  for (const id of starters) {
    save.collection[String(id)] = newTroopRecord();
  }
  if (starters.length >= 3 && options.starterTeamName !== null) {
    save.teams.push({
      name: options.starterTeamName ?? '先锋队',
      members: starters.slice(0, 4).map((troopId) => ({ kind: 'troop' as const, troopId })),
      bannerKingdomId: null,
    });
  }
  return save;
}
