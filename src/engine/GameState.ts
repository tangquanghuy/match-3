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
}

/** 创建初始对局状态 */
export function createGameState(
  board: BoardModel,
  leftTeam: Team,
  rightTeam: Team,
  startingPlayer: PlayerSide = PlayerSide.Left,
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
  };
}
