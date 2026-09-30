/**
 * 一场战斗的会话对象（设计 §2 的 BattleSession 层）。
 *
 * 职责边界：
 *  - 对上：持有本场 `BattleRequest` 与 id 映射，战斗结束后产出 `BattleResult`。
 *  - 对下：把行动转交 `TurnEngine`，并顺手累积事件流。
 *  - 不做：表现、动画、宿主通信。表现层通过它提交行动，而不是直接调引擎，
 *    否则事件流会漏记，结果里的摘要和 digest 就不完整。
 */
import type { TurnEngine } from '@engine/TurnEngine';
import { PlayerSide, type BattleAction } from '@engine/types';
import type { GameEvent } from '@engine/events';
import type { GameState } from '@engine/GameState';
import { buildBattleResult } from './battleResult';
import type { BattleRequest, BattleResult } from './contract';
import type { CombatantIdMap } from './combatantMapping';
import { engineRulesOf } from './rules';

export interface BattleSessionInit {
  request: BattleRequest;
  idMap: CombatantIdMap;
  engine: TurnEngine;
}

export class BattleSession {
  readonly request: BattleRequest;
  readonly idMap: CombatantIdMap;
  private readonly engine: TurnEngine;
  private readonly events: GameEvent[] = [];
  private cachedResult: BattleResult | null = null;

  constructor(init: BattleSessionInit) {
    this.request = init.request;
    this.idMap = init.idMap;
    this.engine = init.engine;
    // Apply both banners here so rendered and headless sessions share the request.
    this.engine.bannerBoosts = init.request.playerBanner ? { ...init.request.playerBanner.boosts } : null;
    this.engine.enemyBannerBoosts = init.request.enemyBanner ? { ...init.request.enemyBanner.boosts } : null;
    // 战斗规则（活动深化批）：棋盘预置已在建盘时落地，这里注入掉落/回合/胜负规则
    this.engine.applyRules(engineRulesOf(init.request, init.idMap));
    this.record(this.engine.takeInitialEvents());
  }

  getState(): GameState {
    return this.engine.getState();
  }

  /**
   * 提交一次行动（交换或施法）。返回事件流供表现层播放，同时记入本场累计。
   * 被引擎拒绝的行动返回空数组，不记入。
   */
  surrender(): GameEvent[] {
    return this.record(this.engine.surrender(PlayerSide.Left));
  }

  resolve(action: BattleAction): GameEvent[] {
    return this.record(this.engine.resolveAction(action));
  }

  /** 空过一回合（调试/测试用）。不是 `BattleAction`，但事件同样要记入摘要。 */
  passTurn(): GameEvent[] {
    return this.record(this.engine.passTurn());
  }

  private record(events: GameEvent[]): GameEvent[] {
    if (events.length > 0) this.events.push(...events);
    return events;
  }

  /** 本场累计的全部事件，按产生顺序。 */
  recordedEvents(): readonly GameEvent[] {
    return this.events;
  }

  /** 战斗是否已判出胜负。 */
  isFinished(): boolean {
    return this.engine.getState().winner !== null;
  }

  /**
   * 导出可回传宿主的结果。战斗未结束时抛错。
   * 结果只算一次并缓存：同一场战斗多次询问必须得到同一份数据。
   */
  buildResult(): BattleResult {
    if (this.cachedResult !== null) return this.cachedResult;
    this.cachedResult = buildBattleResult({
      request: this.request,
      state: this.engine.getState(),
      idMap: this.idMap,
      events: this.events,
    });
    return this.cachedResult;
  }
}
