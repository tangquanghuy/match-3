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
import { INVASION } from '../data/economy';
import { commandPoolNeeds, createFreshSave, runCommand, type CommandEffects, type CommandIo, type FreshSaveKind } from './core';
import type { ServerEnv } from './env';
import type { InvasionMirrorPool } from './mirrorPool';
import { weekStartOf } from '../gateway/clock';
import { ensureInvasionSeason, invasionPlayerPower } from '../systems/invasion';
import { invasionPoolQuery } from '../systems/invasionMirrors';
import { isCriticalCommand, PLAN_COMMANDS, type CommandReply, type CommandType, type LoadReply, type MetaCommand } from './protocol';

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
  /** 入侵真人镜像共享池（已绑定本玩家身份）；缺省 = 对手全走人机 */
  mirrorPool?: InvasionMirrorPool;
  /** 池读写失败的日志出口（失败不影响命令本身） */
  onMirrorPoolError?: (error: unknown) => void;
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
  /** 已提交、待写共享池的副作用 */
  private readonly effects: CommandEffects[] = [];
  private createdFresh = false;

  constructor(
    private readonly repo: SaveRepository,
    private readonly env: ServerEnv,
    private readonly options: MetaHostOptions,
  ) {}

  /**
   * 整份快照（登录/刷新页面/重同步时下发）。首次调用会载入或建档。
   * 防刷新重来：此时还挂着未结算的出战票 = 玩家在战斗中刷新了，先判负/作废再下发。
   */
  load(): Promise<LoadReply> {
    return this.serial(async () => {
      await this.ensureLoaded();
      if (this.save?.pendingBattle) {
        this.commit({ type: 'forfeitPendingBattle', args: {} } as MetaCommand);
        await this.flushNow();
        await this.drainEffects();
      }
      const reply: LoadReply = { save: this.save!, fresh: this.createdFresh, warning: this.loadWarning, serverNow: this.env.now() };
      this.createdFresh = false;
      this.loadWarning = null;
      return reply;
    });
  }

  execute<K extends CommandType>(command: MetaCommand<K>): Promise<CommandReply<K>> {
    return this.serial(async () => {
      const start = await this.ensureLoaded();
      const startRecords = this.records;
      // 未结算就开新战斗（多标签页 / 跳过结算）：旧票先判负/作废，与刷新同口径
      const forfeited = PLAN_COMMANDS.has(command.type) && start.pendingBattle
        ? this.commit({ type: 'forfeitPendingBattle', args: {} } as MetaCommand)
        : false;
      const io = await this.prefetch(command);
      const outcome = runCommand(this.save!, command, this.env, io);
      const committed = outcome.commit ? this.apply(outcome.save) : false;
      if (committed && outcome.effects) this.effects.push(outcome.effects);
      if (!committed && !forfeited) return { result: outcome.result, patch: null, serverNow: this.env.now() };

      if (forfeited || isCriticalCommand(command.type) || (this.options.flushDelayMs ?? 0) <= 0) await this.flushNow();
      else this.scheduleFlush();
      await this.drainEffects();

      return {
        result: outcome.result,
        patch: buildPatch(start.revision, this.save!.revision, diffRecords(startRecords, this.records)),
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

  /** 需要时向共享池取样（只在入侵同步/刷新/结算时查） */
  private async prefetch(command: MetaCommand): Promise<CommandIo> {
    const pool = this.options.mirrorPool;
    const save = this.save!;
    const now = this.env.now();
    if (!pool) return {};
    const needs = commandPoolNeeds(save, command, now);
    if (!needs.mirrors && !needs.standings) return {};
    // 跨周时核心会先周结（联赛可能重算），在只含入侵字段的副本上预演一遍取联赛
    const probe = { invasion: { ...save.invasion, claimedRanks: [...save.invasion.claimedRanks] } } as MetaSave;
    const week = weekStartOf(now);
    ensureInvasionSeason(probe, now, week);
    const league = probe.invasion.league;
    const guard = <T>(p: Promise<T>): Promise<T | undefined> => p.catch((error) => {
      this.options.onMirrorPoolError?.(error);
      return undefined;
    });
    const power = needs.mirrors ? invasionPlayerPower(save) : 0;
    const slack = command.type === 'settleBattle' ? 1 : 0; // 结算后可能升一个联赛
    const [mirrorPool, standings] = await Promise.all([
      !needs.mirrors ? undefined : power <= 0 ? [] : guard(pool.sample(invasionPoolQuery(league, power, now, slack))),
      needs.standings ? guard(pool.standings({ weekStart: week, league, limit: INVASION.bracketSize })) : undefined,
    ]);
    return {
      ...(mirrorPool ? { mirrorPool } : {}),
      ...(standings ? { standings } : {}),
    };
  }

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

  /** 执行并（成功时）提交一条内部命令；返回是否提交 */
  private commit(command: MetaCommand): boolean {
    const outcome = runCommand(this.save!, command, this.env);
    if (!outcome.commit) return false;
    if (outcome.effects) this.effects.push(outcome.effects);
    return this.apply(outcome.save);
  }

  /**
   * 存档落定后再写共享池（镜像录制 / 周榜 VP）：池写失败只丢这一份，不回滚命令。
   * 同一批里多次 VP 上报只写最后一次。
   */
  private async drainEffects(): Promise<void> {
    const queued = this.effects.splice(0);
    const pool = this.options.mirrorPool;
    if (!pool || queued.length === 0) return;
    const onError = (error: unknown) => this.options.onMirrorPoolError?.(error);
    const lastVp = [...queued].reverse().find(e => e.reportVp)?.reportVp;
    await Promise.all([
      ...queued.filter(e => e.publishMirror).map(e => pool.publish(e.publishMirror!).catch(onError)),
      lastVp ? pool.reportVp(lastVp).catch(onError) : undefined,
    ]);
  }

  /** 把新存档设为已提交状态并标脏 */
  private apply(next: MetaSave): true {
    const records = saveToRecords(next);
    this.markDirty(diffRecords(this.records, records));
    this.save = next;
    this.records = records;
    return true;
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
