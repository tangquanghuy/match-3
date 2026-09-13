/**
 * 独立调试模式的宿主桥（需求 2.5、3.7；设计 §5）。
 *
 * 没有真实宿主时用它：战斗快照来自 `fixtures/standalone-battle.json`，
 * 结果不发往任何地方，只留在内存里并打日志，方便本地查看与端到端断言。
 */
import { loadStandaloneRequest, resizeRequestTeams } from './standaloneRequest';
import type { BattleRequest, BattleResult } from './contract';
import type { HostBridge, ResultDeliveryState } from './HostBridge';
import type { BattleError, BattleStarted } from './hostProtocol';

export interface StandaloneBridgeOptions {
  /** 已注册技能 id，用于校验本地配置 */
  knownSkillIds: ReadonlySet<string>;
  /** 已注册特质 id */
  knownTraitIds?: ReadonlySet<string>;
  /** 客户端认识的种族/类型 */
  knownTroopTypes?: ReadonlySet<string>;
  /** 调试用队伍人数（3/4）；省略则用配置原始人数 */
  teamSize?: number;
}

export class StandaloneHostBridge implements HostBridge {
  private readonly options: StandaloneBridgeOptions;
  private readonly listeners = new Set<(state: ResultDeliveryState) => void>();
  private deliveryState: ResultDeliveryState = { phase: 'idle' };
  /** 最近一次导出的结果，供本地查看与自动化断言 */
  lastResult: BattleResult | null = null;
  lastError: BattleError | null = null;
  lastStarted: BattleStarted | null = null;

  constructor(options: StandaloneBridgeOptions) {
    this.options = options;
  }

  waitForBattle(): Promise<BattleRequest> {
    const request = loadStandaloneRequest({
      knownSkillIds: this.options.knownSkillIds,
      ...(this.options.knownTraitIds ? { knownTraitIds: this.options.knownTraitIds } : {}),
      ...(this.options.knownTroopTypes ? { knownTroopTypes: this.options.knownTroopTypes } : {}),
    });
    return Promise.resolve(
      this.options.teamSize === undefined
        ? request
        : resizeRequestTeams(request, this.options.teamSize),
    );
  }

  notifyStarted(meta: BattleStarted): void {
    this.lastStarted = meta;
  }

  submitResult(result: BattleResult): Promise<void> {
    this.lastResult = result;
    // 本地模式没有宿主可确认，直接视为已确认
    this.setState({ phase: 'acknowledged' });
    console.info('[standalone] 战斗结果', result);
    return Promise.resolve();
  }

  reportError(error: BattleError): void {
    this.lastError = error;
    console.error(`[standalone] 战斗错误 ${error.code}: ${error.message}`, error.details ?? '');
  }

  onDeliveryStateChange(listener: (state: ResultDeliveryState) => void): () => void {
    this.listeners.add(listener);
    listener(this.deliveryState);
    return () => this.listeners.delete(listener);
  }

  dispose(): void {
    this.listeners.clear();
  }

  private setState(state: ResultDeliveryState): void {
    this.deliveryState = state;
    for (const listener of this.listeners) listener(state);
  }
}
