/**
 * iframe / WebView 生产环境的宿主桥（需求 3.3～3.5；设计 §5）。
 *
 * 安全与可靠性要点：
 *  - 只接受白名单 origin 的消息，且不允许配置 `'*'`——那等于任何页面都能塞战斗数据进来。
 *  - 每条消息先过协议层信封校验，`battle:start` 的 request 再过内容校验，两层分开报错。
 *  - 同一 `battleId` 只创建一次 session；重复 start 只补发 `battle:started`，不重开战斗。
 *  - 结果重投直到收到 `battle:result-ack`，超过上限报 `result-unacknowledged`。
 *
 * 通信底层抽象成 `MessagePort`，因此这层逻辑不依赖 `window`，可在测试里用假端口驱动。
 */
import { validateBattleRequest, formatValidationIssues } from './validateRequest';
import type { ValidateOptions } from './validateRequest';
import { HOST_MESSAGE_TYPES, outbound, parseInboundMessage } from './hostProtocol';
import type { BattleError, BattleStarted, OutboundMessage } from './hostProtocol';
import type { BattleRequest, BattleResult } from './contract';
import type { HostBridge, ResultDeliveryState } from './HostBridge';

/** 收到的一条宿主消息。 */
export interface IncomingEnvelope {
  data: unknown;
  origin: string;
}

/** 通信端口抽象：生产用 window.postMessage，测试用假实现。 */
export interface MessagePortLike {
  post(message: OutboundMessage, targetOrigin: string): void;
  subscribe(handler: (envelope: IncomingEnvelope) => void): () => void;
}

export interface PostMessageBridgeOptions extends ValidateOptions {
  /** 允许的宿主 origin 白名单，必须显式列出，不接受 '*' */
  allowedOrigins: readonly string[];
  port: MessagePortLike;
  /** 结果重投间隔，默认 2000ms */
  retryIntervalMs?: number;
  /** 结果最大投递次数（含首次），默认 5 */
  maxResultAttempts?: number;
}

export class PostMessageHostBridge implements HostBridge {
  private readonly allowedOrigins: readonly string[];
  private readonly port: MessagePortLike;
  private readonly validateOptions: ValidateOptions;
  private readonly retryIntervalMs: number;
  private readonly maxResultAttempts: number;

  private unsubscribe: (() => void) | null = null;
  private readonly listeners = new Set<(state: ResultDeliveryState) => void>();
  private deliveryState: ResultDeliveryState = { phase: 'idle' };

  /** 已受理的战斗；用于幂等判断 */
  private acceptedBattleId: string | null = null;
  private startedMeta: BattleStarted | null = null;
  /** 宿主 origin：由 battle:start 那条消息确定，后续只发回同一个 origin */
  private hostOrigin: string | null = null;

  private resolveRequest: ((request: BattleRequest) => void) | null = null;
  /** 早于 waitForBattle() 到达的已受理 request。宿主抢跑时不能把它丢掉 */
  private bufferedRequest: BattleRequest | null = null;
  /** 正在等待 ack 的结果；同一份结果的多次 submit 共享同一条重试链 */
  private pendingAck: {
    battleId: string;
    requestId: string;
    waiters: { resolve: () => void; reject: (e: Error) => void }[];
  } | null = null;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private attempt = 0;
  private pendingResult: BattleResult | null = null;

  constructor(options: PostMessageBridgeOptions) {
    const invalid = options.allowedOrigins.filter((o) => o === '*' || o.trim() === '');
    if (invalid.length > 0) {
      throw new Error('allowedOrigins 不接受 "*" 或空字符串：必须显式列出宿主 origin');
    }
    if (options.allowedOrigins.length === 0) {
      throw new Error('allowedOrigins 不能为空：没有白名单就无法安全接收宿主消息');
    }
    this.allowedOrigins = [...options.allowedOrigins];
    this.port = options.port;
    this.validateOptions = {
      knownSkillIds: options.knownSkillIds,
      ...(options.knownTraitIds ? { knownTraitIds: options.knownTraitIds } : {}),
      ...(options.knownTroopTypes ? { knownTroopTypes: options.knownTroopTypes } : {}),
    };
    this.retryIntervalMs = options.retryIntervalMs ?? 2000;
    this.maxResultAttempts = Math.max(1, options.maxResultAttempts ?? 5);
    // 构造即订阅：宿主可能在我们调用 waitForBattle() 之前就发来 battle:start，
    // 只在 waitForBattle 里订阅会永久丢掉那条消息。
    this.unsubscribe = this.port.subscribe((envelope) => this.onEnvelope(envelope));
  }

  /**
   * 广播 `battle:ready` 并等待 `battle:start`。
   * ready 需要发给所有白名单 origin：此时还不知道真正的宿主是哪一个。
   */
  waitForBattle(): Promise<BattleRequest> {
    // 宿主已抢先送来快照，无需再宣告 ready
    if (this.bufferedRequest !== null) {
      const buffered = this.bufferedRequest;
      this.bufferedRequest = null;
      return Promise.resolve(buffered);
    }
    const promise = new Promise<BattleRequest>((resolve) => {
      this.resolveRequest = resolve;
    });
    for (const origin of this.allowedOrigins) this.port.post(outbound.ready(), origin);
    return promise;
  }

  notifyStarted(meta: BattleStarted): void {
    this.startedMeta = meta;
    this.send(outbound.started(meta));
  }

  submitResult(result: BattleResult): Promise<void> {
    // 同一份结果重复提交：挂到既有重试链上，不另起一条
    const pending = this.pendingAck;
    if (pending !== null
      && pending.battleId === result.battleId
      && pending.requestId === result.requestId) {
      return new Promise<void>((resolve, reject) => {
        pending.waiters.push({ resolve, reject });
      });
    }
    // 已确认过的同一份结果直接放行，避免重复投递
    if (this.deliveryState.phase === 'acknowledged' && this.pendingResult === result) {
      return Promise.resolve();
    }

    this.pendingResult = result;
    this.attempt = 0;
    return new Promise<void>((resolve, reject) => {
      this.pendingAck = {
        battleId: result.battleId,
        requestId: result.requestId,
        waiters: [{ resolve, reject }],
      };
      this.postResultAttempt();
    });
  }

  reportError(error: BattleError): void {
    this.send(outbound.error(
      error,
      this.acceptedBattleId,
      this.startedMeta?.requestId ?? null,
    ));
  }

  onDeliveryStateChange(listener: (state: ResultDeliveryState) => void): () => void {
    this.listeners.add(listener);
    listener(this.deliveryState);
    return () => this.listeners.delete(listener);
  }

  dispose(): void {
    if (this.retryTimer !== null) clearTimeout(this.retryTimer);
    this.retryTimer = null;
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.listeners.clear();
  }

  /** 当前是否还有结果未被宿主确认——页面关闭前的提示依据。 */
  hasUnacknowledgedResult(): boolean {
    return this.deliveryState.phase === 'pending';
  }

  private onEnvelope(envelope: IncomingEnvelope): void {
    if (!this.allowedOrigins.includes(envelope.origin)) {
      // 不回消息：对方不在白名单，连错误都不该发给它
      console.warn(`[host-bridge] 丢弃非白名单 origin 的消息：${envelope.origin}`);
      return;
    }

    const parsed = parseInboundMessage(envelope.data);
    if (!parsed.ok) {
      this.hostOrigin ??= envelope.origin;
      this.send(outbound.error(parsed.error, this.acceptedBattleId, null));
      return;
    }

    const message = parsed.message;
    if (message.type === HOST_MESSAGE_TYPES.resultAck) {
      this.onAck(message.battleId, message.requestId);
      return;
    }

    this.hostOrigin = envelope.origin;

    // 幂等：同一 battleId 重复 start 不重开战斗，只补发 started（宿主可能丢了上一条）
    if (this.acceptedBattleId === message.battleId) {
      if (this.startedMeta !== null) this.send(outbound.started(this.startedMeta));
      return;
    }
    if (this.acceptedBattleId !== null) {
      this.send(outbound.error(
        {
          code: 'battle-busy',
          message: `已在进行 battleId「${this.acceptedBattleId}」，无法同时开始「${message.battleId}」`,
        },
        this.acceptedBattleId,
        message.requestId,
      ));
      return;
    }

    const validated = validateBattleRequest(message.request, this.validateOptions);
    if (!validated.ok) {
      this.send(outbound.error(
        {
          code: 'invalid-request',
          message: `战斗快照不合法：${formatValidationIssues(validated.issues)}`,
          details: validated.issues,
        },
        message.battleId,
        message.requestId,
      ));
      return;
    }

    // 信封与内容的 id 必须一致，否则结果回传会对不上号
    if (validated.request.battleId !== message.battleId
      || validated.request.requestId !== message.requestId) {
      this.send(outbound.error(
        {
          code: 'bad-message',
          message: '信封与 request 内的 battleId/requestId 不一致',
        },
        message.battleId,
        message.requestId,
      ));
      return;
    }

    this.acceptedBattleId = message.battleId;
    if (this.resolveRequest !== null) {
      this.resolveRequest(validated.request);
      this.resolveRequest = null;
    } else {
      this.bufferedRequest = validated.request;
    }
  }

  private onAck(battleId: string, requestId: string): void {
    const pending = this.pendingAck;
    if (pending === null) return;
    if (pending.battleId !== battleId || pending.requestId !== requestId) return;

    if (this.retryTimer !== null) clearTimeout(this.retryTimer);
    this.retryTimer = null;
    this.pendingAck = null;
    this.setState({ phase: 'acknowledged' });
    for (const waiter of pending.waiters) waiter.resolve();
  }

  private postResultAttempt(): void {
    const result = this.pendingResult;
    const pending = this.pendingAck;
    if (result === null || pending === null) return;

    this.attempt += 1;
    this.send(outbound.result(result, this.attempt));
    this.setState({ phase: 'pending', attempt: this.attempt, maxAttempts: this.maxResultAttempts });

    if (this.attempt >= this.maxResultAttempts) {
      const error: BattleError = {
        code: 'result-unacknowledged',
        message: `结果已投递 ${this.attempt} 次仍未收到 battle:result-ack`,
      };
      this.pendingAck = null;
      this.setState({ phase: 'failed', error });
      this.send(outbound.error(error, result.battleId, result.requestId));
      for (const waiter of pending.waiters) waiter.reject(new Error(error.message));
      return;
    }

    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      this.postResultAttempt();
    }, this.retryIntervalMs);
  }

  private send(message: OutboundMessage): void {
    // 未确定宿主 origin 前只能广播给白名单，不能用 '*'
    const targets = this.hostOrigin === null ? this.allowedOrigins : [this.hostOrigin];
    for (const origin of targets) this.port.post(message, origin);
  }

  private setState(state: ResultDeliveryState): void {
    this.deliveryState = state;
    for (const listener of this.listeners) listener(state);
  }
}

/** 生产用端口：向父窗口发消息，监听 window 的 message 事件。 */
export function windowMessagePort(
  target: Pick<Window, 'postMessage'> = window.parent,
  listener: Pick<Window, 'addEventListener' | 'removeEventListener'> = window,
): MessagePortLike {
  return {
    post(message, targetOrigin) {
      target.postMessage(message, targetOrigin);
    },
    subscribe(handler) {
      const onMessage = (event: MessageEvent) => handler({ data: event.data, origin: event.origin });
      listener.addEventListener('message', onMessage as EventListener);
      return () => listener.removeEventListener('message', onMessage as EventListener);
    },
  };
}
