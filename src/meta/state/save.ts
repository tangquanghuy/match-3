import { hydrateRegionalState } from './regional';
import { hydrateHuntSoftCap } from '../systems/huntPacing';
import { hydrateDefenseProgress, hydrateDefenseTeam, hydrateDefenseLog, hydrateDefenseReports } from '../systems/invasionDefense';
import { INVASION_RANKS, invasionRankAt } from '../data/invasionRanks';
import { INVASION_MATCHMAKING } from '../data/invasionMatchmaking';
import { getTroopById } from '../../data/troops';
import { ARENA, INVASION } from '../data/economy';
import { hydrateWishlist, hydrateGachaAudit } from '../systems/wishlist';
/**
 * Meta 存档读写（M0 · 壳与存档的逻辑部分）。
 *
 *  - 存储介质抽象为 StorageLike：浏览器 localStorage 与测试内存实现通用，逻辑零 DOM；
 *  - 双槽防损：每次写盘前把主槽旧内容滚入 `.bak`，主槽损坏自动回退备份（计划 §3.3）；
 *  - 版本迁移链：schema 不兼容变化时在 MIGRATIONS 追加 `v→v+1` 步骤；
 *  - 节级降级重建：单节损坏只丢该节、其余保留（hydrateSave），彻底损坏才回退新档；
 *  - 本文件与 localStorage 无关的部分（migrate/hydrate/parse/serialize）同样被
 *    服务端复用：D1 里存的就是 serializeSave 的产物。
 */
import { hydrateCharacter } from './character';
import { META_SAVE_VERSION, newSave, type EventShopState, type EventWeekState, type GachaLogEntry, type InvasionState, type KingdomState, type MetaSave, type PendingBattle, type TeamMember, type TeamPreset, type TroopRecord } from './schema';
import { EVENT_MILESTONES, EVENT_MILESTONE_CURRENCY_BONUS, EVENT_SHARED_GOALS, EVENT_SHOP, EVENT_TYPES, EVENT_WEEKLY_PLAY_REWARD_CAP, type EventTypeId } from '../data/events';
import { GIFTS, GIFT_STARTER_ID } from '../data/gifts';
import { EXPLORE_MAX_TIER, KINGDOM_ORDER } from '../data/kingdoms';
import { STARTER_CLASS_ID } from '../data/classes';
import { GACHA_LOG_CAP } from './schema';
import { STARTING_KINGDOM } from '../data/economy';
import { todayStartOf } from '../gateway/clock';
import { hydrateManaMastery } from '../systems/manaMastery';

export interface StorageLike {
  getItem(key: string): string | null | undefined;
  setItem(key: string, value: string): void;
}

/** 存档结构问题（版本过高 / 不是对象 / JSON 解析失败） */
export class MetaSaveError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MetaSaveError';
  }
}

/**
 * 迁移链：MIGRATIONS[v] 把 version v 的存档升到 v+1。
 * 上线前基线为 v4（历史 v1~v3 迁移已删除）；上线后的不兼容变化在这里追加步骤。
 */
type Migration = (raw: Record<string, unknown>) => Record<string, unknown>;
const MIGRATIONS: Migration[] = [];
/** 最早仍可读取的版本；更旧的存档视为损坏（上线前不背历史包袱） */
const OLDEST_READABLE_VERSION = META_SAVE_VERSION;
const FIRST_WIN_REWARD_RESET_DAY = Date.UTC(2026, 9, 1, 16); // 2026-10-02 00:00 UTC+8

function isObject(v: unknown): v is Record<string, unknown> {
  return v != null && typeof v === 'object' && !Array.isArray(v);
}

function num(v: unknown, fallback: number, min: number, max = Number.MAX_SAFE_INTEGER): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) return fallback;
  return Math.min(Math.max(Math.floor(v), min), max);
}

function huntState(raw: unknown): MetaSave['treasureHunt'] {
  if (!isObject(raw) || !Array.isArray(raw.cells) || raw.cells.length !== 64) return null;
  const cells: number[] = [];
  for (const value of raw.cells) {
    if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > 7) return null;
    cells.push(value);
  }
  const turns = num(raw.turns, 0, 0);
  if (turns <= 0) return null;
  const rng = num(raw.rng, 1, 0, 0xffffffff);
  return { cells, turns, moves: num(raw.moves, 0, 0), rng, softCap: hydrateHuntSoftCap(raw.softCap, rng, cells) };
}

function bool(v: unknown, fallback: boolean): boolean {
  return typeof v === 'boolean' ? v : fallback;
}

/** 解析 + 迁移 + 节级补默认。任何一步失败抛 MetaSaveError，由调用方决定回退策略。 */
/** 解析 + 迁移 + 节级补默认。任何一步失败抛 MetaSaveError，由调用方决定回退策略。 */
export function migrateSave(raw: unknown, now = 0): MetaSave {
  if (!isObject(raw)) throw new MetaSaveError('存档根不是对象');
  const version = typeof raw.version === 'number' ? Math.floor(raw.version) : -1;
  if (version > META_SAVE_VERSION) {
    throw new MetaSaveError(`存档版本 ${version} 高于当前支持的 ${META_SAVE_VERSION}`);
  }
  if (version < OLDEST_READABLE_VERSION) {
    throw new MetaSaveError(`存档版本 ${version} 过旧（最低支持 ${OLDEST_READABLE_VERSION}）`);
  }
  let cur = raw;
  for (let v = version; v < META_SAVE_VERSION; v++) {
    const step = MIGRATIONS[v];
    if (!step) throw new MetaSaveError(`缺少 v${v} → v${v + 1} 迁移步骤`);
    cur = step(cur);
  }
  return hydrateSave(cur, now);
}

function sanitizeTroopRecord(v: unknown): TroopRecord | null {
  if (!isObject(v)) return null;
  const traits = Array.isArray(v.traits)
    ? ([bool(v.traits[0], false), bool(v.traits[1], false), bool(v.traits[2], false)] as [
        boolean,
        boolean,
        boolean,
      ])
    : ([false, false, false] as [boolean, boolean, boolean]);
  return {
    copies: num(v.copies, 0, 0),
    level: num(v.level, 1, 1),
    ascension: num(v.ascension, 0, 0, 3),
    traits,
    locked: bool(v.locked, false),
  };
}

function sanitizeTeam(v: unknown): TeamPreset | null {
  if (!isObject(v) || !Array.isArray(v.members)) return null;
  const members = v.members.flatMap((m): TeamMember[] => {
    if (!isObject(m)) return [];
    if (m.kind === 'hero') return [{ kind: 'hero' }];
    if (m.kind === 'troop' && typeof m.troopId === 'number' && Number.isFinite(m.troopId)) {
      return [{ kind: 'troop', troopId: Math.floor(m.troopId) }];
    }
    return [];
  });
  return {
    name: typeof v.name === 'string' ? v.name : '未命名队伍',
    members,
    bannerKingdomId: typeof v.bannerKingdomId === 'string' ? v.bannerKingdomId : null,
  };
}

/** 单个活动的周实例清洗（结构不合法 → null，该活动本周从零开始） */
function sanitizeEventWeek(v: unknown, typeId: EventTypeId): EventWeekState | null {
  if (!isObject(v)) return null;
  const claimed = Array.isArray(v.claimed)
    ? [...new Set(v.claimed.filter((n): n is number => typeof n === 'number' && Number.isInteger(n) && n >= 0 && n < EVENT_MILESTONES[typeId].length))]
    : [];
  const bought: Record<string, number> = {};
  if (isObject(v.bought)) {
    for (const [key, value] of Object.entries(v.bought)) {
      if (!EVENT_SHOP[typeId].some((goods) => goods.id === key)) continue;
      const n = num(value, 0, 0);
      if (n > 0) bought[key] = n;
    }
  }
  const eventData: Record<string, number> = {};
  if (isObject(v.eventData)) {
    for (const [key, value] of Object.entries(v.eventData)) {
      const n = num(value, 0, 0);
      if (n > 0) eventData[key] = n;
    }
  }
  const runTeam = Array.isArray(v.runTeam)
    ? v.runTeam.flatMap((entry) => {
        if (!isObject(entry) || typeof entry.externalId !== 'string') return [];
        const hp = num(entry.hp, 0, 0);
        return [{
          externalId: entry.externalId,
          hp,
          // 旧档无 maxHp：拿 hp 兜底（血格会显示满格而不是崩，下一场结算即自愈）
          maxHp: Math.max(num(entry.maxHp, 0, 0), hp, 1),
          defeated: bool(entry.defeated, false),
        }];
      })
    : null;
  const tokens = num(v.tokens, 0, 0);
  return {
    weekStart: num(v.weekStart, 0, 0),
    points: num(v.points, 0, 0),
    claimed,
    wins: num(v.wins, 0, 0),
    tokens,
    // 旧档无 tokensEarned：按「至少不少于当前余额」兜底，避免商店页显示「已赚 0 · 余额 72」自相矛盾
    tokensEarned: Math.max(num(v.tokensEarned, 0, 0), tokens),
    playRewards: num(v.playRewards, 0, 0, EVENT_WEEKLY_PLAY_REWARD_CAP[typeId]),
    bought,
    eventData,
    runTeam: runTeam && runTeam.length > 0 ? runTeam : null,
    // 玩法状态：此处只保证是 JSON 对象，细粒度校验在 systems/eventModes 各自的 sanitize
    ...(isObject(v.mode) ? { mode: JSON.parse(JSON.stringify(v.mode)) as unknown } : {}),
  };
}

function sanitizeExploreRun(v: unknown): KingdomState['exploreRun'] {
  if (!isObject(v) || typeof v.id !== 'string' || !v.id || v.id.length > 100) return null;
  if (typeof v.tier !== 'number' || !Number.isInteger(v.tier) || v.tier < 1 || v.tier > EXPLORE_MAX_TIER) return null;
  if (typeof v.stage !== 'number' || !Number.isInteger(v.stage) || v.stage < 0 || v.stage > 5) return null;
  if (typeof v.seed !== 'number' || !Number.isInteger(v.seed) || v.seed < 0 || v.seed > 0xffffffff) return null;
  return { id: v.id, tier: v.tier, stage: v.stage, seed: v.seed };
}

function sanitizeKingdom(v: unknown): KingdomState | null {
  if (!isObject(v)) return null;
  return {
    level: num(v.level, 1, 1, 10),
    questsDone: num(v.questsDone, 0, 0, 8),
    exploreTier: num(v.exploreTier, 0, 0, EXPLORE_MAX_TIER),
    ...(v.exploreUnlockedTier === undefined ? {} : { exploreUnlockedTier: num(v.exploreUnlockedTier, 2, 2, EXPLORE_MAX_TIER) }),
    ...(v.exploreRun === undefined ? {} : { exploreRun: sanitizeExploreRun(v.exploreRun) }),
    clearedExploreTiers: Array.isArray(v.clearedExploreTiers)
      ? [...new Set(v.clearedExploreTiers.filter((tier): tier is number =>
        typeof tier === 'number' && Number.isInteger(tier) && tier >= 1 && tier <= EXPLORE_MAX_TIER))].sort((a, b) => a - b)
      : [],
    lastTributeAt: num(v.lastTributeAt, 0, 0),
  };
}

/**
 * 节级水合：顶层每节用模板兜底，结构合法的数据原样保留，损坏的条目丢弃。
 * 存档总体可读但局部损坏时，玩家只丢损坏节，不至于整档报废。
 */
export function hydrateSave(raw: Record<string, unknown>, now = 0): MetaSave {
  const base = newSave({ now, currencies: {}, starterTeamName: null });

  const currencies = { ...base.currencies };
  if (isObject(raw.currencies)) {
    currencies.gold = num(raw.currencies.gold, currencies.gold, 0);
    currencies.souls = num(raw.currencies.souls, currencies.souls, 0);
    currencies.gems = num(raw.currencies.gems, currencies.gems, 0);
    currencies.goldKeys = num(raw.currencies.goldKeys, currencies.goldKeys, 0);
    currencies.glory = num(raw.currencies.glory, currencies.glory, 0);
    currencies.gloryKeys = num(raw.currencies.gloryKeys, 0, 0);
    currencies.trophies = num(raw.currencies.trophies, 0, 0);
  }

  // —— 素材库存（2026-09-19 素材批）：逐键清洗，非负整数兜底 ——
  const materials = { ...base.materials, ingots: {}, traitstones: {} } as typeof base.materials;
  if (isObject(raw.materials)) {
    if (isObject(raw.materials.ingots)) {
      for (const [key, value] of Object.entries(raw.materials.ingots)) {
        const n = num(value, 0, 0);
        if (n > 0) materials.ingots[key] = n;
      }
    }
    if (isObject(raw.materials.traitstones)) {
      for (const [key, value] of Object.entries(raw.materials.traitstones)) {
        const n = num(value, 0, 0);
        if (n > 0) materials.traitstones[key] = n;
      }
    }
    materials.forgeScrolls = num(raw.materials.forgeScrolls, 0, 0);
    materials.treasureMaps = num(raw.materials.treasureMaps, 0, 0);
  }

  const treasureHunt = huntState(raw.treasureHunt);

  // —— 武器淬炼等级（WEAPON-FORGE-DESIGN F2）：weaponId → 0..20 ——
  const weaponTempering: Record<string, number> = {};
  if (isObject(raw.weaponTempering)) {
    for (const [key, value] of Object.entries(raw.weaponTempering)) {
      const n = num(value, 0, 0, 20);
      if (n > 0) weaponTempering[key] = n;
    }
  }

  // —— 入侵 PvP 赛季（联赛夹紧 0..9）——
  const invasion: InvasionState = { ...base.invasion };
  if (isObject(raw.invasion)) {
    invasion.league = num(raw.invasion.league, 0, 0, 9);
    invasion.vp = num(raw.invasion.vp, 0, 0);
    invasion.weekStart = num(raw.invasion.weekStart, 0, 0);
    invasion.seed = num(raw.invasion.seed, 0, 0);
    invasion.lastWinDay = num(raw.invasion.lastWinDay, 0, 0);
    invasion.battles = num(raw.invasion.battles, 0, 0);
    invasion.bestLeague = num(raw.invasion.bestLeague, 0, 0, 9);
    invasion.seasonsPlayed = num(raw.invasion.seasonsPlayed, 0, 0);
    // Legacy league progress is preserved once, but no fictional historic VP is added.
    const legacyFloor = INVASION_RANKS[Math.max(invasion.league, invasion.bestLeague) * 3]!.vp;
    invasion.progressionVp = num(raw.invasion.progressionVp, Math.max(invasion.vp, legacyFloor), 0);
    invasion.refreshCount = num(raw.invasion.refreshCount, 0, 0, Number.MAX_SAFE_INTEGER - 1);
    invasion.claimedRanks = Array.isArray(raw.invasion.claimedRanks)
      ? [...new Set(raw.invasion.claimedRanks.filter((id): id is string => typeof id === 'string' && INVASION_RANKS.some(rank => rank.id === id)))] : [];
    invasion.league = invasionRankAt(invasion.progressionVp).league;
    invasion.bestLeague = Math.max(invasion.bestLeague, invasion.league);
    invasion.roster = hydrateInvasionRoster(raw.invasion.roster);
    invasion.recentOpponents = Array.isArray(raw.invasion.recentOpponents)
      ? [...new Set(raw.invasion.recentOpponents.filter((k): k is string => typeof k === 'string' && k.length > 0 && k.length <= 64))]
        .slice(0, INVASION_MATCHMAKING.recentCap)
      : [];
    const lp = raw.invasion.lastPublish;
    invasion.lastPublish = isObject(lp) && typeof lp.teamHash === 'string'
      ? { league: num(lp.league, 0, 0, 9), teamHash: lp.teamHash, at: num(lp.at, 0, 0) }
      : null;
    invasion.standings = hydrateInvasionStandings(raw.invasion.standings);
    invasion.defenseProgress = hydrateDefenseProgress(raw.invasion.defenseProgress);
    invasion.defenseTeam = hydrateDefenseTeam(raw.invasion.defenseTeam);
    invasion.defensePublishPending = raw.invasion.defensePublishPending === true;
    const defensePublication = raw.invasion.lastDefensePublish;
    invasion.lastDefensePublish = isObject(defensePublication)
      && typeof defensePublication.fingerprint === 'string'
      && /^[0-9a-f]{8}$/.test(defensePublication.fingerprint)
      && Number.isSafeInteger(defensePublication.at) && Number(defensePublication.at) >= 0
      ? { fingerprint: defensePublication.fingerprint, at: Number(defensePublication.at) }
      : null;
    invasion.defenseLog = hydrateDefenseLog(raw.invasion.defenseLog);
    invasion.defenseOutbox = hydrateDefenseReports(raw.invasion.defenseOutbox);
  }
  invasion.recentOpponents = [...invasion.recentOpponents];

  // —— 每周活动周实例 · per-event（缺键 = 该活动本周还没打过）——
  const eventWeeks: Partial<Record<EventTypeId, EventWeekState>> = {};
  if (isObject(raw.eventWeeks)) {
    for (const def of EVENT_TYPES) {
      const parsed = sanitizeEventWeek((raw.eventWeeks as Record<string, unknown>)[def.id], def.id);
      if (parsed) eventWeeks[def.id] = parsed;
    }
  }

  // Independent stock ledger: retain even when its window spans two activity weeks.
  const eventShops: Partial<Record<EventTypeId, EventShopState>> = {};
  if (isObject(raw.eventShops)) {
    for (const { id } of EVENT_TYPES) {
      const entry = raw.eventShops[id];
      if (!isObject(entry) || typeof entry.periodStart !== 'number' || !Number.isFinite(entry.periodStart)) continue;
      const bought: Record<string, number> = {};
      if (isObject(entry.bought)) {
        for (const goods of EVENT_SHOP[id]) {
          const count = num(entry.bought[goods.id], 0, 0);
          if (count > 0) bought[goods.id] = count;
        }
      }
      eventShops[id] = { periodStart: entry.periodStart, bought };
    }
  }

  const collection: Record<string, TroopRecord> = {};
  if (isObject(raw.collection)) {
    for (const [key, value] of Object.entries(raw.collection)) {
      const rec = sanitizeTroopRecord(value);
      if (rec) collection[key] = rec;
    }
  }

  // 缺字段 = 还没用过修改器，当前收藏就是真实收集。已有备份时原样保留，不用当前收藏覆盖。
  let collectionTruth: Record<string, TroopRecord> | null = null;
  if (isObject(raw.collectionTruth)) {
    collectionTruth = {};
    for (const [key, value] of Object.entries(raw.collectionTruth)) {
      const rec = sanitizeTroopRecord(value);
      if (rec) collectionTruth[key] = rec;
    }
  }

  const teams: TeamPreset[] = Array.isArray(raw.teams)
    ? raw.teams.flatMap((t) => {
        const team = sanitizeTeam(t);
        return team ? [team] : [];
      })
    : [];

  // Upgrade legacy three-member presets in place; preserve all existing members/order.
  // Never replace the fourth unit or silently grant unowned troops.
  for (const team of teams) {
    if (team.members.length !== 3) continue;
    if (!team.members.some(member => member.kind === 'hero')) team.members.push({ kind: 'hero' });
    else {
      const owned = Object.keys(collection).map(Number).find(id => getTroopById(id)
        && !team.members.some(member => member.kind === 'troop' && member.troopId === id));
      if (owned !== undefined) team.members.push({ kind: 'troop', troopId: owned });
    }
  }

  const kingdoms: Record<string, KingdomState> = {};
  if (isObject(raw.kingdoms)) {
    for (const [key, value] of Object.entries(raw.kingdoms)) {
      const kd = sanitizeKingdom(value);
      if (kd) kingdoms[key] = kd;
    }
  }

  const hero = { ...base.hero, classXp: { ...(base.hero.classXp ?? {}) } };
  if (isObject(raw.hero)) {
    hero.level = num(raw.hero.level, hero.level, 1);
    hero.xp = num(raw.hero.xp, hero.xp, 0);
    hero.classId = typeof raw.hero.classId === 'string' ? raw.hero.classId : null;
    hero.equippedWeapon =
      typeof raw.hero.equippedWeapon === 'string' ? raw.hero.equippedWeapon : null;
    if (isObject(raw.hero.classXp)) {
      for (const [key, value] of Object.entries(raw.hero.classXp)) {
        if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
          hero.classXp[key] = Math.floor(value);
        }
      }
    }
    if (isObject(raw.hero.classWins)) {
      for (const [key, value] of Object.entries(raw.hero.classWins)) {
        if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
          hero.classWins[key] = Math.floor(value);
        }
      }
    }
    // 职业等级 / 解锁集 / 天赋点（M5 加性字段；缺漏会导致刷新后职业进度回退）
    if (isObject(raw.hero.classLevels)) {
      for (const [key, value] of Object.entries(raw.hero.classLevels)) {
        if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
          hero.classLevels[key] = Math.floor(value);
        }
      }
    }
    if (Array.isArray(raw.hero.unlockedClasses)) {
      // 起始职业始终保底在列（2026-09-29 起破碎尖塔默认解锁，旧档载入时补发）
      hero.unlockedClasses = [...new Set([
        STARTER_CLASS_ID,
        ...raw.hero.unlockedClasses.filter((c): c is string => typeof c === 'string'),
      ])];
    }
    if (Array.isArray(raw.hero.unlockedWeapons)) {
      hero.unlockedWeapons = [
        ...new Set([...hero.unlockedWeapons, ...raw.hero.unlockedWeapons.filter((w): w is string => typeof w === 'string')]),
      ];
    }
    // 天赋选取（v2）：classId → 长度 7 的档位数组，code 白名单在选取时校验，
    // 水合只保形状——未知 code 由 battleBridge 过滤（引擎安全忽略）
    if (isObject(raw.hero.talentPicks)) {
      for (const [key, value] of Object.entries(raw.hero.talentPicks)) {
        if (!Array.isArray(value)) continue;
        hero.talentPicks[key] = value
          .slice(0, 7)
          .map((v) => (typeof v === 'string' && v ? v : null));
        while (hero.talentPicks[key]!.length < 7) hero.talentPicks[key]!.push(null);
      }
    }
    if (isObject(raw.hero.classTraits)) {
      for (const [key, value] of Object.entries(raw.hero.classTraits)) {
        if (!Array.isArray(value)) continue;
        hero.classTraits[key] = [bool(value[0], false), bool(value[1], false), bool(value[2], false)];
      }
    }
    hydrateManaMastery(hero, raw.hero, num(raw.createdAt, now, 0));
  }

  const arena = { ...base.arena };
  if (isObject(raw.arena)) {
    arena.seasonWins = num(raw.arena.seasonWins, 0, 0);
    arena.bestRun = num(raw.arena.bestRun, 0, 0);
    arena.lastFreeEntryAt = num(raw.arena.lastFreeEntryAt, 0, 0);
    // Paid runs survive reloads. Legacy three-card runs restart the draft for free,
    // preserving earned wins (temporary picks are not collection cards).
    const draft = raw.arena.activeDraft;
    if (isObject(draft) && typeof draft.seed === 'number' && Number.isFinite(draft.seed)) {
      const picked = Array.isArray(draft.picked) ? draft.picked.filter((id): id is number => typeof id === 'number' && !!getTroopById(id)) : [];
      const rarities = picked.map(id => getTroopById(id)!.rarityIdx);
      const full = picked.length === ARENA.rounds && [...rarities].sort().join(',') === '0,1,2,3';
      const partial = picked.length < ARENA.rounds && rarities.every((r, i) => r === i);
      const valid = new Set(picked).size === picked.length && (full || partial);
      const current = draft.rulesVersion === 2 && valid;
      arena.activeDraft = {
        seed: draft.seed >>> 0, rulesVersion: 2,
        picked: current ? picked : [],
        stage: current && full ? (draft.stage === 'fighting' ? 'fighting' : 'building') : 'picking',
        wins: num(draft.wins, 0, 0, ARENA.winsToFinish - 1),
        losses: current ? num(draft.losses, 0, 0, ARENA.lossesToFinish - 1) : 0,
      };
    }
  }

  const stats = { ...base.stats };
  if (isObject(raw.stats)) {
    stats.battlesWon = num(raw.stats.battlesWon, 0, 0);
    stats.battlesLost = num(raw.stats.battlesLost, 0, 0);
    stats.soulsEarned = num(raw.stats.soulsEarned, 0, 0);
    stats.goldEarned = num(raw.stats.goldEarned, 0, 0);
  }

  const gachaLog: GachaLogEntry[] = [];
  if (Array.isArray(raw.gachaLog)) {
    for (const entry of raw.gachaLog) {
      if (!isObject(entry) || typeof entry.seed !== 'number') continue;
      if (entry.kind !== 'gem' && entry.kind !== 'gold' && entry.kind !== 'glory') continue;
      if (!Array.isArray(entry.troops)) continue;
      gachaLog.push({
        at: num(entry.at, 0, 0),
        kind: entry.kind,
        seed: entry.seed,
        troops: entry.troops.filter((t): t is number => typeof t === 'number'),
        ...(entry.kind === 'gem' && hydrateGachaAudit(entry.audit, entry.troops.length) ? { audit: hydrateGachaAudit(entry.audit, entry.troops.length) } : {}),
      });
      if (gachaLog.length >= GACHA_LOG_CAP) break;
    }
  }

  const gifts = hydrateGifts(raw.gifts, eventWeeks, invasion);
  if (gifts.currencyBonusVersion < 2) {
    const claimed = new Set(gifts.claimed);
    for (const gift of GIFTS) {
      if (!claimed.has(gift.id)) continue;
      let previous = { gold: 0, souls: 0 };
      if (gifts.currencyBonusVersion === 1) {
        if (gift.id === GIFT_STARTER_ID) previous = { gold: 2000, souls: 500 };
        else if (gift.id === 'invasion-first') previous = { gold: 500, souls: 200 };
        else previous = { gold: Math.round(gift.gems * 8 / 50) * 50, souls: Math.round(gift.gems * 3 / 25) * 25 };
      }
      currencies.gold += gift.gold - previous.gold;
      currencies.souls += gift.souls - previous.souls;
    }
    gifts.currencyBonusVersion = 2;
  }
  for (const week of Object.values(eventWeeks)) {
    if (!week) continue;
    for (const index of week.claimed) {
      const key = `currencyBonusPaid${index}`;
      if (week.eventData[key] === 1) continue;
      currencies.gold += EVENT_MILESTONE_CURRENCY_BONUS.gold[index]!;
      currencies.souls += EVENT_MILESTONE_CURRENCY_BONUS.souls[index]!;
      week.eventData[key] = 1;
    }
  }
  const shared = eventWeeks.invasion?.eventData;
  if (shared) EVENT_SHARED_GOALS.forEach((goal, index) => {
    if (shared[`sharedClaim${index}`] !== 1 || shared[`sharedCurrencyPaid${index}`] === 1) return;
    currencies.gold += goal.gold;
    currencies.souls += goal.souls;
    shared[`sharedCurrencyPaid${index}`] = 1;
  });

  const claimedFirstWinAt = num(raw.dailyFirstWinAt, 0, 0);
  const resetFirstWin = num(raw.dailyFirstWinRewardVersion, 0, 0) < 1
    && todayStartOf(now) === FIRST_WIN_REWARD_RESET_DAY
    && claimedFirstWinAt === FIRST_WIN_REWARD_RESET_DAY;

  return {
    version: META_SAVE_VERSION,
    createdAt: num(raw.createdAt, now, 0),
    savedAt: num(raw.savedAt, now, 0),
    revision: num(raw.revision, 0, 0),
    pendingBattle: hydratePendingBattle(raw.pendingBattle),
    mapSeenLevel: typeof raw.mapSeenLevel === 'number' && Number.isFinite(raw.mapSeenLevel) ? Math.max(0, Math.floor(raw.mapSeenLevel)) : null,
    currencies,
    hero,
    collection,
    collectionTruth,
    teams,
    activeTeamIndex: num(raw.activeTeamIndex, 0, 0, Math.max(teams.length - 1, 0)),
    arena,
    kingdoms,
    // 主城：只接受推进序里的王国名；null 表示玩家主动取消；缺省（旧档）回落起始王国
    homeKingdom: raw.homeKingdom === null
      ? null
      : typeof raw.homeKingdom === 'string' && KINGDOM_ORDER.includes(raw.homeKingdom)
        ? raw.homeKingdom
        : STARTING_KINGDOM,
    stats,
    dailyFirstWinAt: resetFirstWin ? 0 : claimedFirstWinAt,
    dailyFirstWinRewardVersion: 1,
    gachaLog,
    gachaWishlist: hydrateWishlist(raw.gachaWishlist),
    materials,
    materialsUnread: typeof raw.materialsUnread === 'boolean' ? raw.materialsUnread : false,
    materialShop: {
      arcaneIntroPurchased: isObject(raw.materialShop)
        ? num(raw.materialShop.arcaneIntroPurchased, 0, 0, Number.MAX_SAFE_INTEGER) : 0,
      gemBundlesPurchased: isObject(raw.materialShop)
        ? num(raw.materialShop.gemBundlesPurchased, 0, 0, Number.MAX_SAFE_INTEGER) : 0,
    },
    weaponTempering,
    invasion,
    regional: hydrateRegionalState(raw.regional),
    eventWeeks,
    eventShops,
    settings: { ...base.settings },
    treasureHunt,
    character: hydrateCharacter(raw.character),
    onboarding: hydrateOnboarding(raw.onboarding, gachaLog),
    gifts,
  };
}

/**
 * 待结算战斗票：只由权威核心写入，这里只保形状（形状不对 = 丢票，玩家重开一场即可）。
 * 票内的出敌计划/镜像是核心自己算出来的，不做逐字段清洗。
 */
function hydratePendingBattle(raw: unknown): PendingBattle | null {
  if (!isObject(raw) || typeof raw.requestId !== 'string' || typeof raw.issuedAt !== 'number') return null;
  if (raw.mode === 'regional' && isObject(raw.context) && isObject(raw.context.opponent)) return raw as unknown as PendingBattle;
  if (raw.mode === 'arena') return { mode: 'arena', requestId: raw.requestId, issuedAt: raw.issuedAt };
  if (raw.mode === 'encounter' && isObject(raw.plan) && isObject(raw.enemies)) {
    return raw as unknown as PendingBattle;
  }
  if (raw.mode === 'invasion' && isObject(raw.mirror)) return raw as unknown as PendingBattle;
  return null;
}

const ONBOARDING_STEPS = ['battle', 'gift', 'summon', 'done'] as const;

/** 旧档没有引导字段：视为已完成；没抽过宝石箱的旧档仍可用一次新手十连。 */
function hydrateOnboarding(raw: unknown, gachaLog: MetaSave['gachaLog']): MetaSave['onboarding'] {
  const pulledGem = gachaLog.some((entry) => entry.kind === 'gem');
  if (!isObject(raw)) return { step: 'done', noviceSummonUsed: pulledGem };
  const step = ONBOARDING_STEPS.includes(raw.step as MetaSave['onboarding']['step']) ? raw.step as MetaSave['onboarding']['step'] : 'done';
  return { step, noviceSummonUsed: typeof raw.noviceSummonUsed === 'boolean' ? raw.noviceSummonUsed : pulledGem };
}

/** 对手批次：服务端写入的数据，这里只做形状把关；不合法整批丢弃（回落人机推演） */
function hydrateInvasionRoster(raw: unknown): InvasionState['roster'] {
  if (!isObject(raw) || !Array.isArray(raw.mirrors)) return null;
  const mirrors = raw.mirrors.filter((m): m is Record<string, unknown> => isObject(m)
    && typeof m.id === 'string' && typeof m.name === 'string' && Array.isArray(m.defense)
    && typeof m.difficulty === 'string' && (m.player === undefined || (isObject(m.player) && Array.isArray(m.player.team))));
  if (mirrors.length !== raw.mirrors.length || mirrors.length === 0) return null;
  return {
    weekStart: num(raw.weekStart, 0, 0),
    league: num(raw.league, 0, 0, 9),
    refresh: num(raw.refresh, 0, 0, Number.MAX_SAFE_INTEGER - 1),
    mirrors: mirrors as unknown as NonNullable<InvasionState['roster']>['mirrors'],
  };
}

/** 周榜真人快照：逐行把关，坏行丢弃；封顶一个榜单的人数 */
function hydrateInvasionStandings(raw: unknown): InvasionState['standings'] {
  if (!isObject(raw) || !Array.isArray(raw.rows)) return null;
  const seen = new Set<string>();
  const rows: NonNullable<InvasionState['standings']>['rows'] = [];
  for (const r of raw.rows) {
    if (!isObject(r) || typeof r.ownerKey !== 'string' || !r.ownerKey || r.ownerKey.length > 64 || seen.has(r.ownerKey)) continue;
    if (typeof r.name !== 'string') continue;
    seen.add(r.ownerKey);
    rows.push({ ownerKey: r.ownerKey, name: r.name.slice(0, 24), vp: num(r.vp, 0, 0) });
  }
  return {
    weekStart: num(raw.weekStart, 0, 0),
    league: num(raw.league, 0, 0, 9),
    fetchedAt: num(raw.fetchedAt, 0, 0),
    rows: rows.slice(0, INVASION.bracketSize),
  };
}

function hydrateGifts(raw: unknown, eventWeeks: MetaSave['eventWeeks'], invasion: MetaSave['invasion']): MetaSave['gifts'] {
  const weekWins = Object.values(eventWeeks).reduce((sum, w) => sum + (w?.wins ?? 0), 0);
  const weekTower = eventWeeks.towerOfDoom?.eventData.floorBest ?? 0;
  // 旧档没有累计入侵场数：本周场数或打过赛季就至少算 1 场
  const knownInvasions = Math.max(invasion.battles, invasion.seasonsPlayed > 0 ? 1 : 0);
  if (!isObject(raw)) return { claimed: [], currencyBonusVersion: 2, eventWins: weekWins, towerBest: weekTower, invasionBattles: knownInvasions };
  const claimed = Array.isArray(raw.claimed) ? [...new Set(raw.claimed.filter((id): id is string => typeof id === 'string'))] : [];
  return {
    claimed,
    currencyBonusVersion: raw.currencyBonusVersion === 2 ? 2 : raw.currencyBonusGranted === true ? 1 : 0,
    eventWins: Math.max(num(raw.eventWins, 0, 0), weekWins),
    towerBest: Math.max(num(raw.towerBest, 0, 0), weekTower),
    invasionBattles: Math.max(num(raw.invasionBattles, 0, 0), knownInvasions),
  };
}

export interface LoadResult {
  /** null = 存储为空或双槽皆损（由调用方决定建什么样的新档） */
  save: MetaSave | null;
  /** 非 null = 发生了降级（主槽损坏回退备份 / 双槽皆损），UI 应告知玩家 */
  warning: string | null;
}

/**
 * 本地存档介质（本地后端专用；远端后端的存储在 D1）。
 * key 默认 `gems.meta.save`；`.bak` 后缀是自动维护的备份槽。
 * 只管读写与防损，不改存档内容（savedAt/revision 由权威核心维护）。
 */
export class SaveStore {
  constructor(
    private readonly storage: StorageLike,
    private readonly key = 'gems.meta.save',
  ) {}

  load(now = 0): LoadResult {
    let warning: string | null = null;
    for (const [slot, label] of [
      [this.key, '主槽'],
      [`${this.key}.bak`, '备份槽'],
    ] as const) {
      const text = this.storage.getItem(slot);
      if (!text) continue;
      try {
        const save = migrateSave(JSON.parse(text) as unknown, now);
        if (warning) warning = `${warning}；已回退${label}`;
        return { save, warning };
      } catch {
        warning = warning ? `${warning}；${label}损坏` : `${label}损坏`;
      }
    }
    return { save: null, warning };
  }

  /** 落盘；写前把主槽旧内容滚入备份槽 */
  persist(save: MetaSave): void {
    const prev = this.storage.getItem(this.key);
    if (prev != null) this.storage.setItem(`${this.key}.bak`, prev);
    this.storage.setItem(this.key, serializeSave(save));
  }
}

export function serializeSave(save: MetaSave): string {
  return JSON.stringify(save);
}

/** 导入导出口径一致；结构问题抛 MetaSaveError */
export function parseSaveJson(text: string, now = 0): MetaSave {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text) as unknown;
  } catch {
    throw new MetaSaveError('不是合法 JSON');
  }
  return migrateSave(parsed, now);
}
