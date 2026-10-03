import { freshRegionalState, type RegionalState, type RegionalBattleContext } from './regional';
import { emptyGachaWishlist, type GachaWishlist, type GachaAudit } from '../data/gachaRules';
/**
 * Meta 层存档 schema（v2）——对齐 META-GAME-PLAN.md §3.3 草案。
 *
 * 本文件只有类型与默认值工厂：禁 DOM、禁引擎/会话依赖（方向：meta → data 单向）。
 * 字段语义要点：
 *  - collection 以 troopId 十进制字符串为键（JSON 对象键只能是字符串），**每卡一条**，
 *    升级/升阶/特质对同卡全副本生效（官方语义）；`copies` 是本体之外的同名卡数。
 *  - teams 的数组顺序 = 站位：队首吃骷髅伤害；主角可编入也可不编入（裁定①，4 人）。
 *  - kingdoms 缺条目 = 1 级 / 0 任务进度（首次交互时才写入条目）。
 */

import { STARTING_CURRENCIES, STARTING_KINGDOM } from '../data/economy';
import { STARTER_WEAPON_ID } from '../data/weapons';
import { STARTER_CLASS_ID } from '../data/classes';
import type { EventTypeId } from '../data/events';
import type { MaterialDelta } from '../data/materials';
import type { EncounterEnemy, EncounterPlan } from '../systems/encounter';
import type { InvasionMirror } from '../systems/invasion';
import type { InvasionRoster, InvasionStandingsCache, MirrorRecord } from '../systems/invasionMirrors';

/**
 * 存档版本。上线前基线（2026-09-29 服务端化重整）：历史 v1~v3 迁移链已删除，
 * 结构不兼容的旧档按「损坏」处理并重建。上线后结构不兼容变化在 save.ts MIGRATIONS 追加步骤。
 */
export const META_SAVE_VERSION = 4;

// ---------------------------------------------------------------------------
// 基础节
// ---------------------------------------------------------------------------

export interface Currencies {
  gold: number;
  souls: number;
  gems: number;
  goldKeys: number;
  gloryKeys: number;
  trophies: number;
  /** 荣耀（官方 Glory：排位 PvP 主产，20 荣耀=1 荣耀箱；2026-09-19 素材批加性字段） */
  glory: number;
}

export interface MailItem {
  id: string;
  title: string;
  body: string;
  sentAt: number;
  readAt: number | null;
  claimedAt: number | null;
  currencies: Partial<Currencies>;
  materials: MaterialDelta;
  classXp?: number;
}

export interface MailboxState {
  weeklyDoubleVersion: number;
  classTrialXpVersion: number;
  items: MailItem[];
}

/** 素材库存（钢锭 / 熔铸符卷 / 特质石 / 藏宝图） */
export interface Materials {
  /** 钢锭按档位（键 = data/materials IngotKey） */
  ingots: Record<string, number>;
  /** 熔铸符卷（Doomed 系武器淬炼专用） */
  forgeScrolls: number;
  /** 特质石：键 = '{tier}:{color}' 或 'celestial'（见 data/materials.stoneKey） */
  traitstones: Record<string, number>;
  /** 藏宝图。战斗内获得后入包；技能读的是本场数量，不把库存带进下一场。 */
  treasureMaps: number;
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
  /** 4 人；数组顺序 = 站位，队首吃骷髅伤害 */
  members: TeamMember[];
  /** 旗帜王国（null = 未选；两主色匹配给 +1 法力，M6 接引擎） */
  bannerKingdomId: string | null;
}

// ---------------------------------------------------------------------------
// 主角 / 竞技场 / 王国（系统逻辑后续里程碑落地，schema 先占位定版）
// ---------------------------------------------------------------------------

/** 六色法力精通的色键（与引擎 BaseColor 字符串值对齐） */
export type ManaColor = 'Red' | 'Green' | 'Blue' | 'Yellow' | 'Purple' | 'Brown';

export interface HeroState {
  level: number;
  xp: number;
  classId: string | null;
  classLevels: Record<string, number>;
  /** 职业当前经验（冠军等级 1~100） */
  classXp: Record<string, number>;
  /** 职业胜场（携带主角并以该职业出战的胜利次数，专属武器 250 胜门槛） */
  classWins: Record<string, number>;
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
  /** 升级分配的个人法力精通；武器解锁与涌动还会叠加王国精通。 */
  manaMastery: Record<ManaColor, number>;
  /** 升级候选；两色相同时是落后颜色的补齐机会。 */
  masteryOffers: Array<[ManaColor, ManaColor]>;
}

/** 进行中的一轮现开赛（draft 卡即用即弃，不进 collection——裁定④） */
export interface ActiveDraft {
  seed: number;
  picked: number[];
  stage: 'picking' | 'building' | 'fighting';
  wins: number;
  losses?: number;
  rulesVersion?: number;
}

export interface ArenaState {
  activeDraft: ActiveDraft | null;
  seasonWins: number;
  bestRun: number;
  /** 旧版免费票时间戳，仅保留读档兼容；现开赛每届支付黄金 */
  lastFreeEntryAt: number;
}

/** 入侵 PvP（2026-09-19）：联赛官阶 + 每周 VP 赛季（系统逻辑见 systems/invasion.ts） */
export interface InvasionState {
  defenseProgress: import('../systems/invasionDefense').DefenseProgress;
  defenseTeam: TeamPreset | null;
  defensePublishPending: boolean;
  /** Last acknowledged defense snapshot; separate from legacy attacking-team publication. */
  lastDefensePublish: { fingerprint: string; at: number } | null;
  defenseLog: import('../systems/invasionDefense').DefenseLog | null;
  /** Durable delivery queue; acknowledged only after shared storage accepts the result. */
  defenseOutbox: import('../systems/invasionDefense').DefenseReport[];
  /** This week's earned VP; losses do not reduce it, weekly reset clears it. */
  progressionVp: number;
  /** Reward IDs claimed this week; cleared on weekly reset. */
  claimedRanks: string[];
  /** Persistent, free opponent reroll sequence. */
  refreshCount: number;
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
  /**
   * 当前对手批次（含真人镜像，服务端组好落档；键 weekStart/league/refresh 对不上即视为过期，
   * 回落纯人机推演）。null = 尚未组过。
   */
  roster: InvasionRoster | null;
  /** 最近交手过的真人镜像 ownerKey（新的在前，封顶见 INVASION_MATCHMAKING.recentCap） */
  recentOpponents: string[];
  /** 最近一次入池录制（节流用） */
  lastPublish: { league: number; teamHash: string; at: number } | null;
  /**
   * 周榜真人快照（服务端按周+联赛取样后落档；不足 29 人由人机补位）。
   * 键对不上或过期（INVASION_MATCHMAKING.standingsTtlMs）时下次同步重取。null = 未取过。
   */
  standings: InvasionStandingsCache | null;
}

/**
 * **单个活动**的周实例（系统逻辑见 systems/events.ts；里程碑达标自动入账）。
 * 六活动各持一份（`MetaSave.eventWeeks`）：积分/代币/已购/里程碑/玩法状态全部独立，
 * 互不通兑、互不串号。周一 0:00 六份统一重置。
 */
export interface EventShopState {
  periodStart: number;
  bought: Record<string, number>;
}

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
   * 本周已发放的玩法推进奖励次数：守土成功/讨伐成功受独立周额限制。
   * 塔仅保留兼容诊断计数；实际按 eventData.towerPaidFloors 记录本周已奖励的新高楼层。
   */
  playRewards: number;
  /** 本周累计购买记录；兼容旧档迁移，现行限购由 eventShops 独立记录。 */
  bought: Record<string, number>;
  /**
   * 平台账本的数值键：revision、gemPaid<i>、sharedClaim<i>、settled:<battleId>，
   * 以及末日之塔的 floorBest / towerPaidFloors（馈赠与周奖励补差用）。玩法状态在 `mode`。
   */
  eventData: Record<string, number>;
  /**
   * 末日之塔爬塔 run 的冻结队伍（跨场延续 HP/阵亡）；仅爬塔期间非 null。
   * `maxHp` 是画残血格必需的分母（`10-events.md` E-4 ③：玩家决定「继续爬还是收手」
   * 的唯一依据是四个成员各自还剩多少血，只报「存活 3 人」等于没报）。
   */
  runTeam: { externalId: string; hp: number; maxHp: number; defeated: boolean }[] | null;
  /**
   * 玩法状态机（2026-09-29 活动玩法重做）：每个活动一份结构化 JSON（爬塔地图/遗物、
   * 首领阶段与疲劳、入侵兵线、阵营地块、庆典棋盘、试炼星级）。形态由
   * `systems/eventModes/<活动>.ts` 各自定义并在 ensureEventWeek 时校验——
   * 结构不合法即丢弃重建，不影响积分/代币/里程碑等平台账本。
   */
  mode?: unknown;
}

export interface ExploreRun {
  id: string;
  tier: number;
  /** Next encounter: 0–3 regular, 4 mini-boss, 5 final boss. */
  stage: number;
  seed: number;
}

export interface KingdomState {
  /** 1~10 */
  level: number;
  questsDone: number;
  /** 探索难度1–12；0=未选。 */
  exploreTier: number;
  /** 已完成整轮的探索难度1–12；旧档首通记录保留。选中档位不代表通关。 */
  clearedExploreTiers?: number[];
  /** 在本王国解锁的最高难度；所有王国共享其最大值。 */
  exploreUnlockedTier?: number;
  /** 一轮六战；离开页面/跨日不清空。 */
  exploreRun?: ExploreRun | null;
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
  /** 新规则审计快照；旧记录可缺省。 */
  audit?: GachaAudit;
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

/**
 * 已下发、待结算的战斗（权威核心登记；结算只认这一张票，一票一结）。
 * 结算所需的全部上下文都在这里——客户端只回传 BattleResult，不再回传出敌计划。
 */
export type PendingBattle =
  | { mode: 'regional'; requestId: string; issuedAt: number; context: RegionalBattleContext }
  | {
      mode: 'encounter';
      requestId: string;
      issuedAt: number;
      plan: EncounterPlan;
      /** externalId → 出敌条目（击杀对账） */
      enemies: Record<string, EncounterEnemy>;
    }
  | { mode: 'arena'; requestId: string; issuedAt: number }
  | {
      mode: 'invasion';
      requestId: string;
      issuedAt: number;
      mirror: InvasionMirror;
      /** 本次出击队的镜像录制（正常结算后入共享池；投降/丢票不录） */
      attacker?: MirrorRecord;
      revengeKey?: string;
    };

export interface MetaSave {
  regional?: RegionalState;
  character: import('./character').CharacterProfile | null;
  version: typeof META_SAVE_VERSION;
  createdAt: number;
  /**
   * 最近一次已提交命令的权威时刻（服务器时钟）。权威核心在执行命令**前**把它设为命令时刻，
   * 因此 systems 需要「现在」时可读它（如抽卡日志），不必自取时钟。
   */
  savedAt: number;
  /** 存档数据修订序号（不是程序发布版本）：每成功提交一条命令 +1（D1 用 `UPDATE … WHERE revision = ?` 防多端互相覆盖） */
  revision: number;
  /** 待结算战斗（null = 没有进行中的战斗） */
  pendingBattle: PendingBattle | null;
  /** 地图迷雾揭幕已播到的主角等级（null = 从未进过地图） */
  mapSeenLevel: number | null;
  currencies: Currencies;
  hero: HeroState;
  /** key = troopId 十进制字符串 */
  collection: Record<string, TroopRecord>;
  /** 玩家收藏的图鉴部队；编队候选优先显示，允许收藏尚未拥有的部队。 */
  favoriteTroopIds: number[];
  /**
   * 真实收集备份。null = 当前 collection 就是真实收集。
   * 非 null = 修改器改过当前收藏，这里留着打开修改器之前的真实进度。
   * 解锁王国、还原初始都不会写这个字段。
   */
  collectionTruth: Record<string, TroopRecord> | null;
  teams: TeamPreset[];
  activeTeamIndex: number;
  arena: ArenaState;
  /** key = 王国名（troops.json 的 kingdom 字段口径） */
  kingdoms: Record<string, KingdomState>;
  /**
   * 主城（GoW Home Kingdom）：进贡翻倍。null = 未设置。
   * 加性字段（version 不变）；旧档缺省为起始王国。
   */
  homeKingdom: string | null;
  stats: MetaStats;
  /** 最近一次领取每日首胜的「当日零点」epoch ms；0 = 从未领取。加性字段，version 仍为 1 */
  dailyFirstWinAt: number;
  /** 2026-10-02 首胜奖励调整的一次性重置标记。 */
  dailyFirstWinRewardVersion: number;
  /** 最近开箱记录（新的在前，最多 GACHA_LOG_CAP 条）。加性字段，version 仍为 1 */
  gachaLog: GachaLogEntry[];
  gachaWishlist: GachaWishlist;
  /** 素材库存（加性字段，version 仍为 2） */
  materials: Materials;
  /** 有新素材入账且尚未进入材料库查看；加性 UI 状态，旧档默认为 false */
  materialsUnread: boolean;
  /** 历史总单数保留；新版折扣按材料配方档位分别累计，不按天/周重置。 */
  materialShop: { arcaneIntroPurchased: number; gemBundlesPurchased: number; gemDiscountPurchases: Record<string, number> };
  /** 武器淬炼等级（加性字段，version 仍为 2） */
  weaponTempering: WeaponTempering;
  /** 入侵 PvP 赛季（加性字段，version 仍为 2） */
  invasion: InvasionState;
  /**
   * 每周活动周实例 · **per-event**（schema v3）：键 = EventTypeId，缺键 = 该活动本周还没打过。
   * 六活动常驻全开放，进度/代币/已购/里程碑各自独立（不拆会串号，见 v3 迁移说明）。
   */
  eventWeeks: Partial<Record<EventTypeId, EventWeekState>>;
  /** 两天货架库存；周结只清活动账本，不额外补货。 */
  eventShops: Partial<Record<EventTypeId, EventShopState>>;
  settings: MetaSettings;
  /**
   * 进行中的寻宝。null = 没有未打完的一局。
   * 开局已扣掉的藏宝图记在这一局里，刷新后接着下。
   */
  treasureHunt: TreasureHuntState | null;
  /** Daily treasure hunt currency credited so far; reset at the game-time day boundary. */
  treasureHuntDaily: TreasureHuntDailyCap;
  /** 新手引导（加性字段；旧档缺省视为已完成） */
  onboarding: OnboardingState;
  /** 馈赠里程碑（加性字段） */
  gifts: GiftState;
  mailbox: MailboxState;
}

/** 新手引导步骤：试炼战 → 领取新手馈赠 → 新手十连 → 自由行动 */
export type OnboardingStep = 'battle' | 'gift' | 'summon' | 'done';

export interface OnboardingState {
  step: OnboardingStep;
  /** 新手十连（1000 宝石，必出一名异界来客）是否已用 */
  noviceSummonUsed: boolean;
}

/** 馈赠里程碑：已领 id + 跨周累计的活动统计（周活动账本每周清零，这里不清） */
export interface GiftState {
  claimed: string[];
  /** 馈赠成长货币奖励版本；读档时按已领里程碑补发差额。 */
  currencyBonusVersion: number;
  eventWins: number;
  towerBest: number;
  /** 累计入侵场数（入侵赛季每周清零 battles，这里不清） */
  invasionBattles: number;
}

/** 同一个随机软上限，单位为红箱等价值（红箱1、宝库3）。 */
export interface HuntSoftCap {
  target: number;
  /** 本局达到过的最高盘面等价值；升级不重复累计，后续也不解除软上限。 */
  peak: number;
  /** 达标后的有效操作数；仅用于渐进降温，不直接扣步数。 */
  activeMoves: number;
}

/** 寻宝棋盘。cells 为 8×8，0 铜币 … 7 金库。 */
export interface TreasureHuntState {
  cells: number[];
  turns: number;
  moves: number;
  rng: number;
  /** 加性字段，旧局在读档/下一次有效操作时补齐。 */
  softCap?: HuntSoftCap;
}

/** Maximum gold, gems and glory credited by treasure hunts in one game-time day. */
export const TREASURE_HUNT_DAILY_CAP = Object.freeze({ gold: 800_000, gems: 1_000, glory: 2_500 });

export interface TreasureHuntDailyCap {
  dayStart: number;
  gold: number;
  gems: number;
  glory: number;
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
  /** true = 真正的新玩家：从新手引导开始，新手十连可用（默认 false，供测试与工具构档） */
  tutorial?: boolean;
}

function newHero(): HeroState {
  return {
    level: 1,
    xp: 0,
    // 破碎尖塔／督军默认解锁并装备（用户裁定 2026-09-29）：开局就有职业基底与天赋树入口
    classId: STARTER_CLASS_ID,
    classLevels: { [STARTER_CLASS_ID]: 1 },
    classXp: {},
    classWins: {},
    unlockedClasses: [STARTER_CLASS_ID],
    unlockedWeapons: [STARTER_WEAPON_ID],
    equippedWeapon: STARTER_WEAPON_ID,
    talentPicks: {},
    classTraits: {},
    manaMastery: { Red: 0, Green: 0, Blue: 0, Yellow: 0, Purple: 0, Brown: 0 },
    masteryOffers: [],
  };
}

function newTroopRecord(): TroopRecord {
  return { copies: 0, level: 1, ascension: 0, traits: [false, false, false], locked: false };
}

/** 组一个全新存档。starter 部队按 troops.json 的 id 引用（对账脚本能校验悬空引用）。 */
export function newSave(options: NewSaveOptions = {}): MetaSave {
  const now = options.now ?? Date.now();
  const currencies: Currencies = Object.assign(
    { gold: 0, souls: 0, gems: 0, goldKeys: 0, glory: 0, gloryKeys: 0, trophies: 0 },
    STARTING_CURRENCIES,
    options.currencies,
  );
  const save: MetaSave = {
    character: options.tutorial ? null : { name: '影织者', gender: 'unknown', portrait: 'legacy' },
    version: META_SAVE_VERSION,
    createdAt: now,
    savedAt: now,
    revision: 0,
    pendingBattle: null,
    mapSeenLevel: null,
    currencies,
    hero: newHero(),
    collection: {},
    favoriteTroopIds: [],
    collectionTruth: null,
    teams: [],
    activeTeamIndex: 0,
    arena: { activeDraft: null, seasonWins: 0, bestRun: 0, lastFreeEntryAt: 0 },
    kingdoms: {},
    homeKingdom: STARTING_KINGDOM,
    stats: { battlesWon: 0, battlesLost: 0, soulsEarned: 0, goldEarned: 0 },
    dailyFirstWinAt: 0,
    dailyFirstWinRewardVersion: 1,
    gachaLog: [],
    gachaWishlist: emptyGachaWishlist(),
    materials: { ingots: {}, forgeScrolls: 0, traitstones: {}, treasureMaps: 0 },
    materialsUnread: false,
    materialShop: { arcaneIntroPurchased: 0, gemBundlesPurchased: 0, gemDiscountPurchases: {} },
    weaponTempering: {},
    invasion: { defenseProgress: { cursor: 0, rewards: { gold: 0, souls: 0, glory: 0 }, results: [] }, defenseTeam: null, defensePublishPending: false, lastDefensePublish: null, defenseLog: null, defenseOutbox: [], progressionVp: 0, claimedRanks: [], refreshCount: 0, league: 0, vp: 0, weekStart: 0, seed: 0, lastWinDay: 0, battles: 0, bestLeague: 0, seasonsPlayed: 0, roster: null, recentOpponents: [], lastPublish: null, standings: null },
    regional: freshRegionalState(),
    eventWeeks: {},
    eventShops: {},
    settings: { language: 'zh', battleDebug: false },
    treasureHunt: null,
    treasureHuntDaily: { dayStart: 0, gold: 0, gems: 0, glory: 0 },
    onboarding: options.tutorial
      ? { step: 'battle', noviceSummonUsed: false }
      : { step: 'done', noviceSummonUsed: true },
    gifts: { claimed: [], currencyBonusVersion: 2, eventWins: 0, towerBest: 0, invasionBattles: 0 },
    mailbox: { weeklyDoubleVersion: 1, classTrialXpVersion: 1, items: [] },
  };
  const starters = options.starterTroopIds ?? [];
  for (const id of starters) {
    save.collection[String(id)] = newTroopRecord();
  }
  if (starters.length >= 3 && options.starterTeamName !== null) {
    save.teams.push({
      name: options.starterTeamName ?? '先锋队',
      // 新手队：主角固定在第一位
      members: [{ kind: 'hero' }, ...starters.slice(0, 3).map((troopId) => ({ kind: 'troop' as const, troopId }))],
      bannerKingdomId: null,
    });
  }
  return save;
}
