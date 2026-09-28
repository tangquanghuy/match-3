/**
 * 权威核心的宿主：按玩家读档 → runCommand → 乐观锁写回。
 *
 * 本地后端与 Worker 共用这一层，只有 SaveRepository 的实现不同：
 *  - 本地：LocalSaveRepository（localStorage 双槽）；
 *  - 远端：D1 行 `players(save_json, revision)`，put = `UPDATE … WHERE revision = ?`。
 */
import type { MetaSave } from '../state/schema';
import { fail } from '../types';
import { createFreshSave, runCommand, type FreshSaveKind } from './core';
import type { ServerEnv } from './env';
import type { CommandReply, CommandType, LoadReply, MetaCommand } from './protocol';

export interface SaveRepository {
  /** 读当前玩家存档；null = 该玩家还没有存档 */
  get(): Promise<{ save: MetaSave | null; warning: string | null }>;
  /**
   * 写回。expectedRevision = 读到时的 revision（null = 首次建档）。
   * 返回 false = 期间被别的会话写过（乐观锁冲突），调用方重读重跑。
   */
  put(save: MetaSave, expectedRevision: number | null): Promise<boolean>;
}

export interface MetaHostOptions {
  /** 新玩家拿到的存档（远端恒为 'new'；本地开发默认 'demo'） */
  fresh: FreshSaveKind;
  /** 乐观锁冲突时的重跑次数 */
  retries?: number;
}

export class MetaHost {
  constructor(
    private readonly repo: SaveRepository,
    private readonly env: ServerEnv,
    private readonly options: MetaHostOptions,
  ) {}

  async load(): Promise<LoadReply> {
    const { save, warning } = await this.repo.get();
    if (save) return { save, fresh: false, warning, serverNow: this.env.now() };
    const created = createFreshSave(this.options.fresh, this.env.now());
    await this.repo.put(created, null);
    return { save: created, fresh: true, warning, serverNow: this.env.now() };
  }

  async execute<K extends CommandType>(command: MetaCommand<K>): Promise<CommandReply<K>> {
    const attempts = 1 + (this.options.retries ?? 2);
    for (let i = 0; i < attempts; i++) {
      const current = (await this.repo.get()).save ?? (await this.load()).save;
      const outcome = runCommand(current, command, this.env);
      if (!outcome.commit) return { result: outcome.result, save: current, serverNow: this.env.now() };
      if (await this.repo.put(outcome.save, current.revision)) {
        return { result: outcome.result, save: outcome.save, serverNow: this.env.now() };
      }
    }
    const latest = (await this.repo.get()).save ?? (await this.load()).save;
    return {
      result: fail('CONFLICT', '存档正被其他设备更新，请稍后重试') as CommandReply<K>['result'],
      save: latest,
      serverNow: this.env.now(),
    };
  }
}
