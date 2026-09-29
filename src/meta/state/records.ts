/**
 * 存档记录化：MetaSave ⇄ 记录表（key → JSON 字符串）。
 *
 * 成熟服务端的做法是「玩家数据按模块分行存、只回写改动的行」。这里的拆法：
 *  - `meta`：版本 / 创建时刻 / 最近命令时刻 / revision（每条命令都会变，体积几十字节）；
 *  - 其余顶层字段各一条（currencies、hero、teams、kingdoms、invasion …）；
 *  - `collection` 是存档里最大、条目最多的一块，按部队拆成 `collection:<troopId>` 一条一行，
 *    升一次级只改一行。
 *
 * 存储层（D1 / Durable Object SQLite / 本地 localStorage）只认记录；
 * 线协议的增量回执（SavePatch）也按记录粒度下发。
 */
import type { MetaSave, TroopRecord } from './schema';
import { migrateSave } from './save';

export const META_RECORD = 'meta';
export const COLLECTION_PREFIX = 'collection:';

/** 合进 `meta` 记录的头字段 */
const HEADER_FIELDS = ['version', 'createdAt', 'savedAt', 'revision'] as const;
const HEADER_SET: ReadonlySet<string> = new Set(HEADER_FIELDS);

/** 记录表：key → 该记录的 JSON 文本 */
export type SaveRecords = Map<string, string>;

/** 两份记录表之间的变更：set = 新增或内容变化，del = 被删除（如分解掉的部队） */
export interface RecordChanges {
  set: Map<string, string>;
  del: string[];
}

export function saveToRecords(save: MetaSave): SaveRecords {
  const out: SaveRecords = new Map();
  out.set(META_RECORD, JSON.stringify({
    version: save.version,
    createdAt: save.createdAt,
    savedAt: save.savedAt,
    revision: save.revision,
  }));
  for (const [key, value] of Object.entries(save)) {
    if (HEADER_SET.has(key) || value === undefined) continue;
    if (key === 'collection') {
      for (const [id, rec] of Object.entries(value as Record<string, TroopRecord>)) {
        out.set(COLLECTION_PREFIX + id, JSON.stringify(rec));
      }
      continue;
    }
    out.set(key, JSON.stringify(value));
  }
  return out;
}

/** 记录表 → 未清洗的存档对象（存储层直接拼回去落盘用；读档请走 recordsToSave） */
export function assembleRaw(records: SaveRecords): Record<string, unknown> {
  const raw: Record<string, unknown> = { collection: {} };
  const collection = raw.collection as Record<string, unknown>;
  for (const [key, text] of records) {
    const value = JSON.parse(text) as unknown;
    if (key === META_RECORD) Object.assign(raw, value);
    else if (key.startsWith(COLLECTION_PREFIX)) collection[key.slice(COLLECTION_PREFIX.length)] = value;
    else raw[key] = value;
  }
  return raw;
}

/** 记录表 → 经过迁移与节级清洗的存档（结构问题抛 MetaSaveError） */
export function recordsToSave(records: SaveRecords, now = 0): MetaSave {
  return migrateSave(assembleRaw(records), now);
}

export function diffRecords(prev: SaveRecords, next: SaveRecords): RecordChanges {
  const set = new Map<string, string>();
  const del: string[] = [];
  for (const [key, text] of next) if (prev.get(key) !== text) set.set(key, text);
  for (const key of prev.keys()) if (!next.has(key)) del.push(key);
  return { set, del };
}

// ---------------------------------------------------------------------------
// 增量回执
// ---------------------------------------------------------------------------

/**
 * 命令回执里的存档增量：把客户端副本从 revision `from` 推到 `to`。
 * 客户端副本的 revision ≠ from（多标签页 / 丢包）时应整份重同步，而不是硬套。
 */
export interface SavePatch {
  from: number;
  to: number;
  set: Record<string, unknown>;
  del: string[];
}

export function buildPatch(from: number, to: number, changes: RecordChanges): SavePatch {
  const set: Record<string, unknown> = {};
  for (const [key, text] of changes.set) set[key] = JSON.parse(text) as unknown;
  return { from, to, set, del: [...changes.del] };
}

/** 就地应用增量（客户端副本用；不做清洗——数据来自权威核心） */
export function applyPatch(save: MetaSave, patch: SavePatch): void {
  const target = save as unknown as Record<string, unknown>;
  for (const key of patch.del) {
    if (key.startsWith(COLLECTION_PREFIX)) delete save.collection[key.slice(COLLECTION_PREFIX.length)];
    else delete target[key];
  }
  for (const [key, value] of Object.entries(patch.set)) {
    if (key === META_RECORD) Object.assign(target, value);
    else if (key.startsWith(COLLECTION_PREFIX)) save.collection[key.slice(COLLECTION_PREFIX.length)] = value as TroopRecord;
    else target[key] = value;
  }
}
