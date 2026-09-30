import { BoardModel } from './BoardModel';
import { MatchState, PlayerSide } from './types';
import type { ActionLogEntry, Team } from './types';

/**
 * Player reward counters. Gold is owned by Left; Right has its independent enemyGold counter.
 * Souls/gems/maps keep their existing reward model and are outside the Gold repair scope.
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
  /** Per-side defeats since battle start, including summoned units and non-spell kills. */
  battleDeaths?: Record<PlayerSide, number>;
  /**
   * P-R5-summon-id-reuse: highest character id ever removed from a roster (defeat splice / defeated filter).
   * teamRoster.allocateCharId never hands out an id <= this, so a summon cannot reuse a dead unit's id.
   */
  charIdHighWater?: number;
  /** 玩家奖励计数；黄金按双方独立持有，见 BattleEconomy 注释 */
  economy: BattleEconomy;
  /** Right-side battle Gold; optional only for legacy state fixtures (defaults to zero). */
  enemyGold?: number;
  /**
   * 战斗上下文·发生王国（武器原语批 K-E，用户裁定口径）：探索/入侵模式 = 当前王国名，
   * 竞技场 = null；字段缺省（undefined）= 旧请求兼容口径，与 null 同效。
   * 唯一消费点：条件 `{ kind: 'kingdomPresent', kingdom }`（「战斗发生在X王国」）——
   * 本字段为 null/undefined 或与条件 kingdom 不相等时恒为假。经 BattleRequest.kingdom
   * → createGameState opts 注入（宿主/表现层接线，引擎不做隐式推断）。
   */
  kingdom?: string | null;
  /**
   * 各方已完成的回合数（额外回合不计；活动深化批战斗规则）。只在注入规则后维护，
   * 缺省 = 无规则对局（回合数另由 actionLog 推导）。
   */
  turnCount?: Record<PlayerSide, number>;
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
    battleDeaths: { [PlayerSide.Left]: 0, [PlayerSide.Right]: 0 },
    economy: { gold: 0, souls: 0, gems: 0, maps: 0 },
    enemyGold: 0,
    ...(opts && opts.kingdom !== undefined ? { kingdom: opts.kingdom } : {}),
  };
}
