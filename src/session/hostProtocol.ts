/**
 * 宿主 ↔ 客户端的版本化消息协议（需求 3.3、3.4；设计 §5）。
 *
 * 六种消息构成一次战斗的完整生命周期：
 *   客户端 → 宿主：battle:ready（我已就绪）
 *   宿主 → 客户端：battle:start（这是快照，开打）
 *   客户端 → 宿主：battle:started（已受理，session 已建）
 *   客户端 → 宿主：battle:result（结果，需要确认）
 *   宿主 → 客户端：battle:result-ack（收到了）
 *   客户端 → 宿主：battle:error（出错了，附错误码）
 *
 * 每条消息都带 `schemaVersion` 与 `type`；除 `battle:ready` 外都带 `battleId`/`requestId`，
 * 便于宿主在同时存在多场战斗时对号入座，也便于幂等去重。
 */
import { BATTLE_SCHEMA_VERSION } from './contract';
import type { BattleRequest, BattleResult } from './contract';

export const HOST_MESSAGE_TYPES = {
  ready: 'battle:ready',
  start: 'battle:start',
  started: 'battle:started',
  result: 'battle:result',
  resultAck: 'battle:result-ack',
  error: 'battle:error',
} as const;

/** 错误码。宿主可据此决定是重试、换参数还是放弃。 */
export type BattleErrorCode =
  /** 消息本身不合协议：版本不符、字段缺失、type 未知 */
  | 'bad-message'
  /** request 内容不合法（队伍、属性、技能等），错误详情在 details */
  | 'invalid-request'
  /** 来源 origin 不在白名单 */
  | 'origin-rejected'
  /** 已有战斗在进行中，且 battleId 不同 */
  | 'battle-busy'
  /** 结果多次投递仍未收到 ack */
  | 'result-unacknowledged'
  /** 客户端内部异常 */
  | 'internal';

export interface BattleError {
  code: BattleErrorCode;
  message: string;
  /** 结构化补充信息，如校验问题列表 */
  details?: unknown;
}

/** 战斗已受理的元信息（设计只给了名字，这里定义为最小可用集合）。 */
export interface BattleStarted {
  battleId: string;
  requestId: string;
  /** 实际执行本场的客户端规则版本 */
  rulesetVersion: string;
  /** 客户端受理时刻（ISO 8601），便于宿主排查超时 */
  startedAt: string;
}

/** 客户端发往宿主的消息。 */
export type OutboundMessage =
  | { schemaVersion: number; type: typeof HOST_MESSAGE_TYPES.ready }
  | ({ schemaVersion: number; type: typeof HOST_MESSAGE_TYPES.started } & BattleStarted)
  | {
    schemaVersion: number;
    type: typeof HOST_MESSAGE_TYPES.result;
    battleId: string;
    requestId: string;
    /** 第几次投递，从 1 开始；宿主可据此识别重试 */
    attempt: number;
    result: BattleResult;
  }
  | {
    schemaVersion: number;
    type: typeof HOST_MESSAGE_TYPES.error;
    battleId: string | null;
    requestId: string | null;
    error: BattleError;
  };

/** 宿主发往客户端的消息。 */
export type InboundStartMessage = {
  schemaVersion: number;
  type: typeof HOST_MESSAGE_TYPES.start;
  battleId: string;
  requestId: string;
  request: unknown;
};

export type InboundAckMessage = {
  schemaVersion: number;
  type: typeof HOST_MESSAGE_TYPES.resultAck;
  battleId: string;
  requestId: string;
};

export type InboundMessage = InboundStartMessage | InboundAckMessage;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== '';
}

export type ParsedInbound =
  | { ok: true; message: InboundMessage }
  | { ok: false; error: BattleError };

/**
 * 解析宿主消息信封。只做协议层校验（版本、type、battleId/requestId），
 * `request` 内容的合法性交给 `validateBattleRequest`——两层职责不混。
 */
export function parseInboundMessage(raw: unknown): ParsedInbound {
  if (!isRecord(raw)) {
    return { ok: false, error: { code: 'bad-message', message: '消息必须是对象' } };
  }
  const { schemaVersion, type, battleId, requestId } = raw;

  if (schemaVersion !== BATTLE_SCHEMA_VERSION) {
    return {
      ok: false,
      error: {
        code: 'bad-message',
        message: `仅支持 schemaVersion ${BATTLE_SCHEMA_VERSION}，收到 ${String(schemaVersion)}`,
      },
    };
  }
  if (type !== HOST_MESSAGE_TYPES.start && type !== HOST_MESSAGE_TYPES.resultAck) {
    return { ok: false, error: { code: 'bad-message', message: `未知消息类型「${String(type)}」` } };
  }
  if (!isNonEmptyString(battleId) || !isNonEmptyString(requestId)) {
    return {
      ok: false,
      error: { code: 'bad-message', message: 'battleId 与 requestId 必须是非空字符串' },
    };
  }

  if (type === HOST_MESSAGE_TYPES.start) {
    if (!isRecord(raw.request)) {
      return { ok: false, error: { code: 'bad-message', message: 'battle:start 缺少 request 对象' } };
    }
    return {
      ok: true,
      message: { schemaVersion, type, battleId, requestId, request: raw.request },
    };
  }
  return { ok: true, message: { schemaVersion, type, battleId, requestId } };
}

/** 组装各类出站消息，统一补上 schemaVersion，避免各处手写漏字段。 */
export const outbound = {
  ready(): OutboundMessage {
    return { schemaVersion: BATTLE_SCHEMA_VERSION, type: HOST_MESSAGE_TYPES.ready };
  },
  started(meta: BattleStarted): OutboundMessage {
    return { schemaVersion: BATTLE_SCHEMA_VERSION, type: HOST_MESSAGE_TYPES.started, ...meta };
  },
  result(result: BattleResult, attempt: number): OutboundMessage {
    return {
      schemaVersion: BATTLE_SCHEMA_VERSION,
      type: HOST_MESSAGE_TYPES.result,
      battleId: result.battleId,
      requestId: result.requestId,
      attempt,
      result,
    };
  },
  error(error: BattleError, battleId: string | null, requestId: string | null): OutboundMessage {
    return {
      schemaVersion: BATTLE_SCHEMA_VERSION,
      type: HOST_MESSAGE_TYPES.error,
      battleId,
      requestId,
      error,
    };
  },
};

/** `battle:start` 携带的 request 已通过内容校验后的结果。 */
export interface AcceptedStart {
  battleId: string;
  requestId: string;
  request: BattleRequest;
}
