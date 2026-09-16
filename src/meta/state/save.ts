/**
 * Meta 存档读写（M0 · 壳与存档的逻辑部分）。
 *
 *  - 存储介质抽象为 StorageLike：浏览器 localStorage 与测试内存实现通用，逻辑零 DOM；
 *  - 双槽防损：每次写盘前把主槽旧内容滚入 `.bak`，主槽损坏自动回退备份（计划 §3.3）；
 *  - 版本迁移链：schema 不兼容变化时在 MIGRATIONS 追加 `v→v+1` 步骤；
 *  - 节级降级重建：单节损坏只丢该节、其余保留（hydrateSave），彻底损坏才回退新档。
 */
import { META_SAVE_VERSION, newSave, type GachaLogEntry, type KingdomState, type MetaSave, type TeamMember, type TeamPreset, type TroopRecord } from './schema';
import { GACHA_LOG_CAP } from './schema';
import { starterTroopIds } from '../data/economy';

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
/** MIGRATIONS[v] 把 version v 的存档升到 v+1；v1 为首个版本，数组暂空 */
const MIGRATIONS: Migration[] = [];

function isObject(v: unknown): v is Record<string, unknown> {
  return v != null && typeof v === 'object' && !Array.isArray(v);
}

function num(v: unknown, fallback: number, min: number, max = Number.MAX_SAFE_INTEGER): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) return fallback;
  return Math.min(Math.max(Math.floor(v), min), max);
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

function sanitizeKingdom(v: unknown): KingdomState | null {
  if (!isObject(v)) return null;
  return {
    level: num(v.level, 1, 1, 10),
    questsDone: num(v.questsDone, 0, 0, 8),
    exploreTier: num(v.exploreTier, 0, 0, 5),
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
  }

  const collection: Record<string, TroopRecord> = {};
  if (isObject(raw.collection)) {
    for (const [key, value] of Object.entries(raw.collection)) {
      const rec = sanitizeTroopRecord(value);
      if (rec) collection[key] = rec;
    }
  }

  const teams: TeamPreset[] = Array.isArray(raw.teams)
    ? raw.teams.flatMap((t) => {
        const team = sanitizeTeam(t);
        return team ? [team] : [];
      })
    : [];

  const kingdoms: Record<string, KingdomState> = {};
  if (isObject(raw.kingdoms)) {
    for (const [key, value] of Object.entries(raw.kingdoms)) {
      const kd = sanitizeKingdom(value);
      if (kd) kingdoms[key] = kd;
    }
  }

  const hero = { ...base.hero };
  if (isObject(raw.hero)) {
    hero.level = num(raw.hero.level, hero.level, 1);
    hero.xp = num(raw.hero.xp, hero.xp, 0);
    hero.classId = typeof raw.hero.classId === 'string' ? raw.hero.classId : null;
    hero.equippedWeapon =
      typeof raw.hero.equippedWeapon === 'string' ? raw.hero.equippedWeapon : null;
  }

  const arena = { ...base.arena };
  if (isObject(raw.arena)) {
    arena.seasonWins = num(raw.arena.seasonWins, 0, 0);
    arena.bestRun = num(raw.arena.bestRun, 0, 0);
    arena.activeDraft = null; // 中途崩溃不恢复 draft 半成品（计划 §4.8 的保守口径）
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
      if (entry.kind !== 'gem' && entry.kind !== 'gold') continue;
      if (!Array.isArray(entry.troops)) continue;
      gachaLog.push({
        at: num(entry.at, 0, 0),
        kind: entry.kind,
        seed: entry.seed,
        troops: entry.troops.filter((t): t is number => typeof t === 'number'),
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
    teams,
    activeTeamIndex: num(raw.activeTeamIndex, 0, 0, Math.max(teams.length - 1, 0)),
    arena,
    kingdoms,
    stats,
    dailyFirstWinAt: num(raw.dailyFirstWinAt, 0, 0),
    gachaLog,
    settings: { ...base.settings },
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
