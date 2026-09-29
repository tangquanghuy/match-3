/**
 * 网关传输层：把命令送到权威核心。
 *
 *  - LocalTransport：浏览器内 MetaHost + localStorage（开发/离线）；
 *  - HttpTransport：POST 到 Worker（`/api/meta/*`，Discord 登录会话 cookie 鉴权）。
 *
 * 两者都走 JSON 往返：本地后端也序列化一次，保证「本地能跑 = 线上能跑」
 * （Map、类实例、undefined 语义差异会在本地就暴露）。
 */
import type { StorageLike } from '../state/save';
import { MetaHost, type MetaHostOptions } from '../server/host';
import { LocalSaveRepository } from '../server/localRepository';
import { defaultEnv, type ServerEnv } from '../server/env';
import type { FreshSaveKind } from '../server/core';
import type { CommandReply, CommandType, LoadReply, MetaCommand } from '../server/protocol';

export interface MetaTransport {
  readonly kind: 'local' | 'remote';
  /** 是否提供开发者命令 */
  readonly allowDev: boolean;
  load(): Promise<LoadReply>;
  send<K extends CommandType>(command: MetaCommand<K>): Promise<CommandReply<K>>;
}

function wire<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/** 无 localStorage 环境（测试/SSR 兜底）的内存 StorageLike */
export function memoryStorage(): StorageLike {
  const map = new Map<string, string>();
  return {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
  };
}

export interface LocalTransportOptions extends Partial<ServerEnv> {
  /** 无存档时建什么档（默认 'demo'：开发时首次进入就有完整进度） */
  fresh?: FreshSaveKind;
  /** 非关键命令合并落盘延迟（默认 0 = 本地每条命令直写，便于调试直接看 localStorage） */
  flushDelayMs?: number;
  schedule?: MetaHostOptions['schedule'];
}

export class LocalTransport implements MetaTransport {
  readonly kind = 'local' as const;
  readonly allowDev: boolean;
  private readonly host: MetaHost;

  constructor(
    storage: StorageLike = typeof localStorage !== 'undefined' ? localStorage : memoryStorage(),
    options: LocalTransportOptions = {},
  ) {
    const env = defaultEnv({ allowDev: true, ...options });
    this.allowDev = env.allowDev;
    this.host = new MetaHost(new LocalSaveRepository(storage, env.now), env, {
      fresh: options.fresh ?? 'demo',
      flushDelayMs: options.flushDelayMs ?? 0,
      schedule: options.schedule,
    });
    // 合并落盘时，页面隐藏/关闭前把尾巴写掉
    if ((options.flushDelayMs ?? 0) > 0 && typeof addEventListener === 'function') {
      addEventListener('pagehide', () => void this.host.flush());
    }
  }

  /** 立即落盘（测试/页面关闭前） */
  flush(): Promise<void> {
    return this.host.flush();
  }

  async load(): Promise<LoadReply> {
    return wire(await this.host.load());
  }

  async send<K extends CommandType>(command: MetaCommand<K>): Promise<CommandReply<K>> {
    return wire(await this.host.execute(wire(command)));
  }
}

/** 远端 HTTP 错误（网络 / 未登录 / 服务端异常） */
export class MetaHttpError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
    this.name = 'MetaHttpError';
  }
}

/**
 * Worker 端点约定：
 *  - GET  {base}/save     → LoadReply
 *  - POST {base}/command  → CommandReply（body = MetaCommand）
 * 401 = 未登录（屏层应跳 Discord 登录）。
 */
export class HttpTransport implements MetaTransport {
  readonly kind = 'remote' as const;
  readonly allowDev = false;

  constructor(
    private readonly base = '/api/meta',
    private readonly fetchImpl: typeof fetch = (...args) => fetch(...args),
  ) {}

  load(): Promise<LoadReply> {
    return this.request<LoadReply>('GET', '/save');
  }

  send<K extends CommandType>(command: MetaCommand<K>): Promise<CommandReply<K>> {
    return this.request<CommandReply<K>>('POST', '/command', command);
  }

  private async request<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
    const response = await this.fetchImpl(`${this.base}${path}`, {
      method,
      credentials: 'include',
      headers: body === undefined ? undefined : { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new MetaHttpError(response.status, text || `HTTP ${response.status}`);
    }
    return (await response.json()) as T;
  }
}
