/**
 * 宿主桥接口（设计 §5）。
 *
 * iframe 生产环境与本地独立调试共用同一套 `BattleSession`，差别只在这一层：
 * 战斗快照从哪来、结果往哪送。表现层只依赖这个接口，不关心底下是 postMessage 还是本地配置。
 */
import type { BattleRequest, BattleResult } from './contract';
import type { BattleError, BattleStarted } from './hostProtocol';

/** 结果投递状态，供 UI 展示「等待宿主确认 / 重试中 / 已确认」。 */
export type ResultDeliveryState =
  | { phase: 'idle' }
  | { phase: 'pending'; attempt: number; maxAttempts: number }
  | { phase: 'acknowledged' }
  | { phase: 'failed'; error: BattleError };

export interface HostBridge {
  /**
   * 等待一场可执行的战斗快照。
   * postMessage 实现会先广播 `battle:ready` 再等 `battle:start`；
   * 独立实现直接返回本地配置。
   */
  waitForBattle(): Promise<BattleRequest>;

  /** 通知宿主已受理并开打。 */
  notifyStarted(meta: BattleStarted): void;

  /**
   * 提交战斗结果。postMessage 实现会重投直到收到 `battle:result-ack`，
   * 超过上限则以 `result-unacknowledged` 拒绝。
   */
  submitResult(result: BattleResult): Promise<void>;

  /** 上报错误。不抛异常，尽力送达。 */
  reportError(error: BattleError): void;

  /** 订阅结果投递状态变化，用于驱动等待/重试提示。返回取消订阅函数。 */
  onDeliveryStateChange(listener: (state: ResultDeliveryState) => void): () => void;

  /** 释放监听与定时器。 */
  dispose(): void;
}
