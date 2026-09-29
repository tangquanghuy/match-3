import { INVASION_RANKS, invasionRankAt } from '../data/invasionRanks';
import { getTroopById } from '../../data/troops';
import { ARENA } from '../data/economy';
import { hydrateWishlist, hydrateGachaAudit } from '../systems/wishlist';
/**
 * Meta 存档读写（M0 · 壳与存档的逻辑部分）。
 *
 *  - 存储介质抽象为 StorageLike：浏览器 localStorage 与测试内存实现通用，逻辑零 DOM；
 *  - 双槽防损：每次写盘前把主槽旧内容滚入 `.bak`，主槽损坏自动回退备份（计划 §3.3）；
 *  - 版本迁移链：schema 不兼容变化时在 MIGRATIONS 追加 `v→v+1` 步骤；
 *  - 节级降级重建：单节损坏只丢该节、其余保留（hydrateSave），彻底损坏才回退新档。
 */
import { META_SAVE_VERSION, newSave, type EventShopState, type EventWeekState, type GachaLogEntry, type InvasionState, type KingdomState, type MetaSave, type TeamMember, type TeamPreset, type TroopRecord } from './schema';
import { EVENT_MILESTONES, EVENT_SHOP, EVENT_TYPES, EVENT_WEEKLY_PLAY_REWARD_CAP, WEEK_MS, type EventTypeId } from '../data/events';
import { EXPLORE_MAX_TIER, KINGDOM_ORDER } from '../data/kingdoms';
import { STARTER_CLASS_ID } from '../data/classes';
import { GACHA_LOG_CAP } from './schema';
import { STARTING_KINGDOM, starterTroopIds } from '../data/economy';
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

type Migration = (raw: Record<string, unknown>) => Record<string, unknown>;

/**
 * v1 的 8 职业是设计虚构（早期 M5 蓝本），v2 换官方 38 职业后把进度重映射过去：
 * 有官方同名的直接保留（knight/necromancer/sorcerer），其余按定位就近映射，
 * 对应武器 id 同步改名；映射表外的前向兼容字段一律丢 给 hydrate 重建。
 */
const V2_CLASS_REMAP: Record<string, string> = {
  knight: 'knight',
  necromancer: 'necromancer',
  sorcerer: 'sorcerer',
  berserker: 'warrior',
  cleric: 'priest',
  rogue: 'thief',
  druid: 'warden',
  ranger: 'archer',
};
const V2_WEAPON_REMAP: Record<string, string> = {
  w_berserker_10: 'w_warlord_10',
  w_berserker_20: 'w_warlord_20',
  w_cleric_10: 'w_priest_10',
  w_cleric_20: 'w_priest_20',
  w_rogue_10: 'w_thief_10',
  w_rogue_20: 'w_thief_20',
  w_druid_10: 'w_warden_10',
  w_druid_20: 'w_warden_20',
  w_ranger_10: 'w_archer_10',
  w_ranger_20: 'w_archer_20',
  w_necro_10: 'w_necromancer_10',
  w_necro_20: 'w_necromancer_20',
  w_sorc_10: 'w_sorcerer_10',
  w_sorc_20: 'w_sorcerer_20',
};

/** MIGRATIONS[v] 把 version v 的存档升到 v+1（v1 是首个版本：下标 0 恒空） */
const MIGRATIONS: Migration[] = [];
MIGRATIONS[1] = (raw) => {
  const hero = raw.hero;
  if (isObject(hero)) {
    const remapId = (id: unknown): unknown =>
      typeof id === 'string' ? (V2_CLASS_REMAP[id] ?? null) : null;
    if (isObject(hero.classLevels)) hero.classLevels = remapKeys(hero.classLevels, V2_CLASS_REMAP);
    if (isObject(hero.classXp)) hero.classXp = remapKeys(hero.classXp, V2_CLASS_REMAP);
    if (isObject(hero.classWins)) hero.classWins = remapKeys(hero.classWins, V2_CLASS_REMAP);
    if (Array.isArray(hero.unlockedClasses)) {
      hero.unlockedClasses = [
        ...new Set(hero.unlockedClasses.map(remapId).filter((v): v is string => typeof v === 'string')),
      ];
    }
    if (Array.isArray(hero.unlockedWeapons)) {
      hero.unlockedWeapons = [
        ...new Set(
          hero.unlockedWeapons.map((w) =>
            typeof w === 'string' ? (V2_WEAPON_REMAP[w] ?? w) : null,
          ).filter((w): w is string => typeof w === 'string'),
        ),
      ];
    }
    if (typeof hero.equippedWeapon === 'string') {
      hero.equippedWeapon = V2_WEAPON_REMAP[hero.equippedWeapon] ?? hero.equippedWeapon;
    }
    if (typeof hero.classId === 'string') hero.classId = remapId(hero.classId);
    delete hero.talentSpent;
  }
  return raw;
};

/**
 * v2 时代的 6 周轮换顺序（**冻结快照，勿改**）。
 * 迁移步骤必须自带历史口径：v3 之后 `EVENT_TYPES` 是「常驻词表」，
 * 它的下标不再有「第 N 周轮值」的含义，拿它反推旧档会解释错。
 */
const V3_LEGACY_ROTATION: readonly EventTypeId[] = [
  'invasion', 'raidBoss', 'towerOfDoom', 'factionAssault', 'worldEvent', 'classTrials',
];

/**
 * v2 → v3：`eventWeek`（六活动共用的单实例）→ `eventWeeks`（每活动一份）。
 * 旧实例按它自己的 weekStart 还原出「当时的轮值活动」归档到该活动名下，
 * 其余五个活动无历史、从零开始（全开放是新功能，不伪造进度）。
 */
MIGRATIONS[2] = (raw) => {
  const legacy = raw.eventWeek;
  const eventWeeks: Record<string, unknown> = {};
  if (isObject(legacy)) {
    const weekStart = typeof legacy.weekStart === 'number' && Number.isFinite(legacy.weekStart) ? legacy.weekStart : 0;
    const idx = Math.floor(weekStart / WEEK_MS);
    const typeId = V3_LEGACY_ROTATION[
      ((idx % V3_LEGACY_ROTATION.length) + V3_LEGACY_ROTATION.length) % V3_LEGACY_ROTATION.length
    ]!;
    eventWeeks[typeId] = legacy;
  }
  raw.eventWeeks = eventWeeks;
  delete raw.eventWeek;
  return raw;
};

function remapKeys(
  record: Record<string, unknown>,
  map: Record<string, string>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(record)) {
    out[map[key] ?? key] = value;
  }
  return out;
}

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
  return { cells, turns, moves: num(raw.moves, 0, 0), rng: num(raw.rng, 1, 0) };
}

function bool(v: unknown, fallback: boolean): boolean {
  return typeof v === 'boolean' ? v : fallback;
}

/** 解析 + 迁移 + 节级补默认。任何一步失败抛 MetaSaveError，由调用方决定回退策略。 */
export function migrateSave(raw: unknown): MetaSave {
  if (!isObject(raw)) throw new MetaSaveError('存档根不是对象');
  const version = typeof raw.version === 'number' ? Math.floor(raw.version) : -1;
  if (version > META_SAVE_VERSION) {
    throw new MetaSaveError(`存档版本 ${version} 高于当前支持的 ${META_SAVE_VERSION}`);
  }
  let cur = raw;
  for (let v = version; v < META_SAVE_VERSION; v++) {
    const step = MIGRATIONS[v];
    if (!step) break; // 缺失迁移步骤按 v1 口径尽力水合
    cur = step(cur);
  }
  return hydrateSave(cur);
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

function sanitizeKingdom(v: unknown): KingdomState | null {
  if (!isObject(v)) return null;
  return {
    level: num(v.level, 1, 1, 10),
    questsDone: num(v.questsDone, 0, 0, 8),
    exploreTier: num(v.exploreTier, 0, 0, 6),
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
export function hydrateSave(raw: Record<string, unknown>): MetaSave {
  const now = Date.now();
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
  }

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

  return {
    version: META_SAVE_VERSION,
    createdAt: num(raw.createdAt, now, 0),
    savedAt: num(raw.savedAt, now, 0),
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
    dailyFirstWinAt: num(raw.dailyFirstWinAt, 0, 0),
    gachaLog,
    gachaWishlist: hydrateWishlist(raw.gachaWishlist),
    materials,
    materialsUnread: typeof raw.materialsUnread === 'boolean' ? raw.materialsUnread : false,
    weaponTempering,
    invasion,
    eventWeeks,
    eventShops,
    settings: { ...base.settings },
    treasureHunt,
    onboarding: hydrateOnboarding(raw.onboarding, gachaLog),
    gifts: hydrateGifts(raw.gifts, eventWeeks),
  };
}

const ONBOARDING_STEPS = ['battle', 'gift', 'summon', 'done'] as const;

/** 旧档没有引导字段：视为已完成；没抽过宝石箱的旧档仍可用一次新手十连。 */
function hydrateOnboarding(raw: unknown, gachaLog: MetaSave['gachaLog']): MetaSave['onboarding'] {
  const pulledGem = gachaLog.some((entry) => entry.kind === 'gem');
  if (!isObject(raw)) return { step: 'done', noviceSummonUsed: pulledGem };
  const step = ONBOARDING_STEPS.includes(raw.step as MetaSave['onboarding']['step']) ? raw.step as MetaSave['onboarding']['step'] : 'done';
  return { step, noviceSummonUsed: typeof raw.noviceSummonUsed === 'boolean' ? raw.noviceSummonUsed : pulledGem };
}

function hydrateGifts(raw: unknown, eventWeeks: MetaSave['eventWeeks']): MetaSave['gifts'] {
  const weekWins = Object.values(eventWeeks).reduce((sum, w) => sum + (w?.wins ?? 0), 0);
  const weekTower = eventWeeks.towerOfDoom?.eventData.floorBest ?? 0;
  if (!isObject(raw)) return { claimed: [], eventWins: weekWins, towerBest: weekTower };
  const claimed = Array.isArray(raw.claimed) ? [...new Set(raw.claimed.filter((id): id is string => typeof id === 'string'))] : [];
  return {
    claimed,
    eventWins: Math.max(num(raw.eventWins, 0, 0), weekWins),
    towerBest: Math.max(num(raw.towerBest, 0, 0), weekTower),
  };
}

export interface LoadResult {
  save: MetaSave;
  /** true = 存储为空或完全损坏，给的是新档 */
  fresh: boolean;
  /** 非 null = 发生了降级（主槽损坏回退备份 / 双槽皆损重建），UI 应告知玩家 */
  warning: string | null;
}

/**
 * 存档门面。key 默认 `gems.meta.save`；`.bak` 后缀是自动维护的备份槽。
 * 浏览器侧用法：`new SaveStore(window.localStorage)`。
 */
export class SaveStore {
  constructor(
    private readonly storage: StorageLike,
    private readonly key = 'gems.meta.save',
  ) {}

  /** 新档给起始内容（起始王国普通卡队 + 初始货币），保证「新档即可出战」。 */
  private freshSave(): MetaSave {
    return newSave({ now: Date.now(), starterTroopIds: starterTroopIds() });
  }

  load(): LoadResult {
    let warning: string | null = null;
    for (const [slot, label] of [
      [this.key, '主槽'],
      [`${this.key}.bak`, '备份槽'],
    ] as const) {
      const text = this.storage.getItem(slot);
      if (!text) continue;
      try {
        const save = migrateSave(JSON.parse(text) as unknown);
        if (warning) warning = `${warning}；已回退${label}`;
        return { save, fresh: false, warning };
      } catch {
        warning = warning ? `${warning}；${label}损坏` : `${label}损坏`;
      }
    }
    return {
      save: this.freshSave(),
      fresh: true,
      warning: warning === null ? null : `${warning}，已重建新档`,
    };
  }

  /** 落盘并刷新 savedAt；写前把主槽旧内容滚入备份槽 */
  persist(save: MetaSave): void {
    save.savedAt = Date.now();
    const prev = this.storage.getItem(this.key);
    if (prev != null) this.storage.setItem(`${this.key}.bak`, prev);
    this.storage.setItem(this.key, this.exportJson(save));
  }

  exportJson(save: MetaSave): string {
    return JSON.stringify(save);
  }

  /** 导入导出口径一致；结构问题抛 MetaSaveError 由设置屏展示 */
  importJson(text: string): MetaSave {
    let parsed: unknown;
    try {
      parsed = JSON.parse(text) as unknown;
    } catch {
      throw new MetaSaveError('不是合法 JSON');
    }
    return migrateSave(parsed);
  }
}
