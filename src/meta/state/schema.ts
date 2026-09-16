/**
 * Meta 层存档 schema（v1）——对齐 META-GAME-PLAN.md §3.3 草案。
 *
 * 本文件只有类型与默认值工厂：禁 DOM、禁引擎/会话依赖（方向：meta → data 单向）。
 * 字段语义要点：
 *  - collection 以 troopId 十进制字符串为键（JSON 对象键只能是字符串），**每卡一条**，
 *    升级/升阶/特质对同卡全副本生效（官方语义）；`copies` 是本体之外的同名卡数。
 *  - teams 的数组顺序 = 站位：队首吃骷髅伤害；主角可编入也可不编入（裁定①，3~4 人）。
 *  - kingdoms 缺条目 = 1 级 / 0 任务进度（首次交互时才写入条目）。
 */

import { STARTING_CURRENCIES } from '../data/economy';

export const META_SAVE_VERSION = 1;

// ---------------------------------------------------------------------------
// 基础节
// ---------------------------------------------------------------------------

export interface Currencies {
  gold: number;
  souls: number;
  gems: number;
  goldKeys: number;
}

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
  unlockedClasses: string[];
  unlockedWeapons: string[];
  equippedWeapon: string | null;
  /** classId → 已用天赋点 */
  talentSpent: Record<string, number>;
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
    unlockedClasses: [],
    unlockedWeapons: [],
    equippedWeapon: null,
    talentSpent: {},
  };
}

function newTroopRecord(): TroopRecord {
  return { copies: 0, level: 1, ascension: 0, traits: [false, false, false], locked: false };
}

/** 组一个全新存档。starter 部队按 troops.json 的 id 引用（对账脚本能校验悬空引用）。 */
export function newSave(options: NewSaveOptions = {}): MetaSave {
  const now = options.now ?? Date.now();
  const currencies: Currencies = {
    ...STARTING_CURRENCIES,
    ...options.currencies,
  };
  const save: MetaSave = {
    version: META_SAVE_VERSION,
    createdAt: now,
    savedAt: now,
    currencies,
    hero: newHero(),
    collection: {},
    teams: [],
    activeTeamIndex: 0,
    arena: { activeDraft: null, seasonWins: 0, bestRun: 0 },
    kingdoms: {},
    stats: { battlesWon: 0, battlesLost: 0, soulsEarned: 0, goldEarned: 0 },
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
