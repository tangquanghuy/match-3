/**
 * 玩家 Actor：一个玩家一个实例，在线期间存档常驻内存。
 *
 * 成熟服务端的标准做法：
 *  - 读：首次请求时从存储整份载入，之后所有命令只改内存；
 *  - 写：命令提交后按记录做脏标记（state/records.ts），只回写改动的记录；
 *    关键命令（开箱/结算/入账，见 isCriticalCommand）提交即落盘，其余在
 *    flushDelayMs 内合并成一批落盘；每批原子写入，磁盘上永远是某个完整 revision；
 *  - 回：回执只带增量（SavePatch），不回传整份存档；
 *  - 同一玩家的命令严格串行（Durable Object 天然单线程；这里再加一层队列兜底）。
 *
 * 前提：**同一玩家同一时刻只有一个 Actor**（Durable Object 按玩家 id 路由即可保证；
 * 自建 Node 服务则需按玩家 id 粘滞到单进程）。多个 Actor 写同一份存储会互相覆盖。
 */
import type { MetaSave } from '../state/schema';
import { MetaSaveError } from '../state/save';
import { buildPatch, diffRecords, recordsToSave, saveToRecords, type RecordChanges, type SaveRecords } from '../state/records';
import { createFreshSave, runCommand, type FreshSaveKind } from './core';
import type { ServerEnv } from './env';
import { isCriticalCommand, type CommandReply, type CommandType, type LoadReply, type MetaCommand } from './protocol';

/** 一批原子写入：把存储从 fromRevision 推到 toRevision（null = 首次建档） */
export interface RecordBatch {
  fromRevision: number | null;
  toRevision: number;
  set: Map<string, string>;
  del: string[];
}

export interface SaveRepository {
  /** 读该玩家全部记录；null = 还没有存档 */
  load(): Promise<{ records: SaveRecords | null; warning: string | null }>;
  /** 原子写入一批记录（全成或全不成）。D1：batch；DO：transactionSync；本地：单次 setItem */
  write(batch: RecordBatch): Promise<void>;
}

export interface MetaHostOptions {
  /** 新玩家拿到的存档（远端恒为 'new'；本地开发默认 'demo'） */
  fresh: FreshSaveKind;
  /** 非关键命令的合并落盘延迟（ms）；0 = 每条命令提交后立即落盘 */
  flushDelayMs?: number;
  /** 延迟调度器（Worker/DO 可换成 alarm；测试注入手动时钟） */
  schedule?: (delayMs: number, run: () => void) => void;
}

export class MetaHost {
  private save: MetaSave | null = null;
  /** 内存中已提交状态的记录表（与 save 同步） */
  private records: SaveRecords = new Map();
  /** 已提交未落盘：key → 新内容（null = 删除） */
  private readonly dirty = new Map<string, string | null>();
  private persistedRevision: number | null = null;
  private flushScheduled = false;
  private queue: Promise<unknown> = Promise.resolve();
  private loadWarning: string | null = null;
  private createdFresh = false;

  constructor(
    private readonly repo: SaveRepository,
    private readonly env: ServerEnv,
    private readonly options: MetaHostOptions,
  ) {}

  /** 整份快照（仅登录/重同步时下发）。首次调用会载入或建档。 */
  load(): Promise<LoadReply> {
    return this.serial(async () => {
      const save = await this.ensureLoaded();
      const reply: LoadReply = { save, fresh: this.createdFresh, warning: this.loadWarning, serverNow: this.env.now() };
      this.createdFresh = false;
      this.loadWarning = null;
      return reply;
    });
  }

  execute<K extends CommandType>(command: MetaCommand<K>): Promise<CommandReply<K>> {
    return this.serial(async () => {
      const current = await this.ensureLoaded();
      const outcome = runCommand(current, command, this.env);
      if (!outcome.commit) return { result: outcome.result, patch: null, serverNow: this.env.now() };

      const next = saveToRecords(outcome.save);
      const changes = diffRecords(this.records, next);
      this.save = outcome.save;
      this.records = next;
      this.markDirty(changes);

      if (isCriticalCommand(command.type) || (this.options.flushDelayMs ?? 0) <= 0) await this.flushNow();
      else this.scheduleFlush();

      return {
        result: outcome.result,
        patch: buildPatch(current.revision, outcome.save.revision, changes),
        serverNow: this.env.now(),
      };
    });
  }

  /** 立即落盘所有脏记录（下线 / 实例回收前调用） */
  flush(): Promise<void> {
    return this.serial(() => this.flushNow());
  }

  /** 已提交未落盘的记录数（监控/测试用） */
  get pendingRecords(): number {
    return this.dirty.size;
  }

  // —— 内部 ——

  private serial<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.queue.then(fn, fn);
    this.queue = run.catch(() => undefined);
    return run;
  }

  private async ensureLoaded(): Promise<MetaSave> {
    if (this.save) return this.save;
    const now = this.env.now();
    const { records, warning } = await this.repo.load();
    this.loadWarning = warning;
    if (records) {
      try {
        const save = recordsToSave(records, now);
        const normalized = saveToRecords(save);
        // 清洗改写过的记录（字段补默认等）随下一批落盘
        this.markDirty(diffRecords(records, normalized));
        this.records = normalized;
        this.persistedRevision = save.revision;
        this.save = save;
        return save;
      } catch (error) {
        if (!(error instanceof MetaSaveError)) throw error;
        this.loadWarning = warning ? `${warning}；存档无法读取，已重建` : '存档无法读取，已重建';
      }
    }
    const created = createFreshSave(this.options.fresh, now);
    this.records = saveToRecords(created);
    this.markDirty(diffRecords(records ?? new Map(), this.records));
    this.save = created;
    this.createdFresh = true;
    await this.flushNow();
    return created;
  }

  private markDirty(changes: RecordChanges): void {
    for (const [key, text] of changes.set) this.dirty.set(key, text);
    for (const key of changes.del) this.dirty.set(key, null);
  }

  private scheduleFlush(): void {
    if (this.flushScheduled) return;
    this.flushScheduled = true;
    const schedule = this.options.schedule ?? ((ms, run) => void setTimeout(run, ms));
    schedule(this.options.flushDelayMs ?? 0, () => {
      this.flushScheduled = false;
      void this.flush().catch(() => this.scheduleFlush());
    });
  }

  private async flushNow(): Promise<void> {
    if (this.dirty.size === 0 || !this.save) return;
    const batch: RecordBatch = {
      fromRevision: this.persistedRevision,
      toRevision: this.save.revision,
      set: new Map(),
      del: [],
    };
    const snapshot = new Map(this.dirty);
    for (const [key, text] of snapshot) {
      if (text === null) batch.del.push(key);
      else batch.set.set(key, text);
    }
    this.dirty.clear();
    try {
      await this.repo.write(batch);
      this.persistedRevision = batch.toRevision;
    } catch (error) {
      // 写失败：放回脏表（期间更新的记录以新值为准），等下一次落盘重试
      for (const [key, text] of snapshot) if (!this.dirty.has(key)) this.dirty.set(key, text);
      throw error;
    }
  }
}
