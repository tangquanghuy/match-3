import { BoardModel } from './BoardModel';
import { MatchState, PlayerSide } from './types';
import type { Team } from './types';

/** 全局对局状态（需求） */
export interface GameState {
  board: BoardModel;
  teams: Record<PlayerSide, Team>;
  activePlayer: PlayerSide;
  state: MatchState;
  chainCount: number;
  winner: PlayerSide | null;
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
  };
}
