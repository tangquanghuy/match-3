/**
 * 玩家 Durable Object：一个玩家一个实例（名字 = player_id），全球唯一写入者。
 *
 * 存档按记录存在本实例自带的 SQLite 里（records 表，一条记录一行）。
 * DO 的 SQLite 是本地磁盘写，每条命令提交后直接落盘（flushDelayMs = 0），
 * 只写改动的行；同一事件里的多次写由运行时合并提交。
 */
import { DurableObject } from 'cloudflare:workers';
import { MetaHost, type RecordBatch, type SaveRepository } from '../../src/meta/server/host';
import { defaultEnv } from '../../src/meta/server/env';
import type { SaveRecords } from '../../src/meta/state/records';
import type { CommandReply, LoadReply, MetaCommand } from '../../src/meta/server/protocol';
import type { Env } from './env';
import { D1MirrorPool } from './mirrorPool';

class SqlRepository implements SaveRepository {
  constructor(private readonly storage: DurableObjectStorage) {}

  async load(): Promise<{ records: SaveRecords | null; warning: string | null }> {
    const rows = this.storage.sql.exec<{ key: string; value: string }>('SELECT key, value FROM records').toArray();
    if (rows.length === 0) return { records: null, warning: null };
    return { records: new Map(rows.map((row) => [row.key, row.value])), warning: null };
  }

  async write(batch: RecordBatch): Promise<void> {
    const sql = this.storage.sql;
    this.storage.transactionSync(() => {
      for (const key of batch.del) sql.exec('DELETE FROM records WHERE key = ?', key);
      for (const [key, value] of batch.set) {
        sql.exec('INSERT INTO records (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', key, value);
      }
    });
  }
}

/** 每秒命令上限（令牌桶）：正常操作远低于此，挡住脚本刷接口 */
const RATE_PER_SEC = 20;
const RATE_BURST = 60;

export class PlayerActor extends DurableObject<Env> {
  private readonly host: MetaHost;
  private tokens = RATE_BURST;
  private refilledAt = Date.now();
  /** 本实例对应的玩家 id（Worker 鉴权后随命令传入；DO 名字即它） */
  private playerId: string | null = null;
  private accountName: string | null = null;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.storage.sql.exec('CREATE TABLE IF NOT EXISTS records (key TEXT PRIMARY KEY, value TEXT NOT NULL)');
    this.host = new MetaHost(
      new SqlRepository(ctx.storage),
      defaultEnv({ allowDev: env.DEV_LOGIN === '1', requireCharacter: true, accountName: () => this.accountName }),
      {
        fresh: 'new',
        flushDelayMs: 0,
        schedule: (delayMs) => { void ctx.storage.setAlarm(Date.now() + delayMs); },
        mirrorPool: new D1MirrorPool(env.DB, () => this.playerId),
        onMirrorPoolError: (error) => console.error('invasion mirror pool failed', error),
      },
    );
  }

  private async bindPlayer(playerId?: string): Promise<void> {
    if (this.playerId) return;
    this.playerId = playerId ?? await this.ctx.storage.get<string>('invasionActorIdentity') ?? null;
    if (playerId) await this.ctx.storage.put('invasionActorIdentity', playerId);
  }

  async load(preservePendingBattle = false, playerId?: string): Promise<LoadReply> {
    await this.bindPlayer(playerId);
    return this.host.load({ preservePendingBattle });
  }

  override async alarm(): Promise<void> {
    await this.bindPlayer();
    await this.host.load({ preservePendingBattle: true });
    await this.host.flush();
  }

  async execute(command: MetaCommand, playerId?: string, accountName?: string): Promise<CommandReply | { rateLimited: true }> {
    await this.bindPlayer(playerId);
    if (accountName) this.accountName = accountName;
    const now = Date.now();
    this.tokens = Math.min(RATE_BURST, this.tokens + ((now - this.refilledAt) / 1000) * RATE_PER_SEC);
    this.refilledAt = now;
    if (this.tokens < 1) return { rateLimited: true };
    this.tokens -= 1;
    return this.host.execute(command);
  }
}
