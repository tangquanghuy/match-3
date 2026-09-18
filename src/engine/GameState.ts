import { BoardModel } from './BoardModel';
import { MatchState, PlayerSide } from './types';
import type { ActionLogEntry, Team } from './types';

/**
 * 战场经济池（DECISIONS 四项拍板①）：金币 / 灵魂 / 宝石（钻石）三种战斗内计数。
 *
 * 归属裁定：GoW 的战斗奖励归玩家——敌我双方的获得（施法效果、赃物宝石摧毁等）
 * 都进**同一个共用池**，战斗结束经 BattleSession 结果整体上报给 AIRP。
 * 事件 `economy-gain` 的 side 字段记录获得发生时的行动方，供表现层/宿主按需归因。
 */
export interface BattleEconomy {
  gold: number;
  souls: number;
  gems: number;
  /** 藏宝图（「有 20% 几率获得一张藏宝图」「每张藏宝图额外…」） */
  maps: number;
}

/** 全局对局状态（需求） */
export interface GameState {
  board: BoardModel;
  teams: Record<PlayerSide, Team>;
  activePlayer: PlayerSide;
  state: MatchState;
  chainCount: number;
  winner: PlayerSide | null;
  /** 已受理行动的结构化日志，按提交顺序追加（需求 1.5、3.6） */
  actionLog: ActionLogEntry[];
  /** 战场经济池（金币/灵魂/宝石），全场共用，见 BattleEconomy 注释 */
  economy: BattleEconomy;
  /**
   * 战斗上下文·发生王国（武器原语批 K-E，用户裁定口径）：探索/入侵模式 = 当前王国名，
   * 竞技场 = null；字段缺省（undefined）= 旧请求兼容口径，与 null 同效。
   * 唯一消费点：条件 `{ kind: 'kingdomPresent', kingdom }`（「战斗发生在X王国」）——
   * 本字段为 null/undefined 或与条件 kingdom 不相等时恒为假。经 BattleRequest.kingdom
   * → createGameState opts 注入（宿主/表现层接线，引擎不做隐式推断）。
   */
  kingdom?: string | null;
}

/** createGameState 的可选战斗上下文（武器原语批 K-E）。 */
export interface GameStateOptions {
  /** 战斗发生王国；语义见 GameState.kingdom 注释。缺省不写键（undefined = 恒假口径）。 */
  kingdom?: string | null;
}

/** 创建初始对局状态 */
export function createGameState(
  board: BoardModel,
  leftTeam: Team,
  rightTeam: Team,
  startingPlayer: PlayerSide = PlayerSide.Left,
  opts?: GameStateOptions,
): GameState {
  return {
    board,
    teams: {
      [PlayerSide.Left]: leftTeam,
      [PlayerSide.Right]: rightTeam,
    },
    activePlayer: startingPlayer,
    state: MatchState.AwaitingInput,
    chainCount: 0,
    winner: null,
    actionLog: [],
    economy: { gold: 0, souls: 0, gems: 0, maps: 0 },
    ...(opts && opts.kingdom !== undefined ? { kingdom: opts.kingdom } : {}),
  };
}
