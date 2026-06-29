import { BoardModel } from './BoardModel';
import { MatchResolver, grantsExtraTurn } from './MatchResolver';
import type { MatchGroup } from './MatchResolver';
import { GravitySystem } from './GravitySystem';
import { ManaDistributor } from './ManaDistributor';
import { CombatResolver } from './CombatResolver';
import { ExtensionRegistry } from './registry';
import { SeededRNG } from './rng';
import { reshuffle, hasLegalSwap } from './boardUtils';
import { MatchState, PlayerSide, opponentOf } from './types';
import type { CellPos } from './types';
import type { GameState } from './GameState';
import type {
  GameEvent,
  EliminationEvent,
  SpecialGemHookEvent,
} from './events';

/**
 * 回合解析引擎（需求 7, 8, 9, 17, 18）。
 * 接收一个交换请求，同步完成全部连锁解析，产出完整事件流。
 * 纯逻辑：输入相同则输出相同（需求 17.3）。
 */
export class TurnEngine {
  private resolver = new MatchResolver();
  private gravity: GravitySystem;
  private mana = new ManaDistributor();
  private combat = new CombatResolver();

  /** 补充时生成骷髅的概率；战斗模式 > 0，纯三消模式 = 0 */
  skullChance = 0;

  constructor(
    private state: GameState,
    private rng: SeededRNG,
    nextGemId: () => number,
    private registry: ExtensionRegistry = new ExtensionRegistry(),
  ) {
    this.gravity = new GravitySystem(rng, nextGemId);
  }

  getState(): GameState {
    return this.state;
  }

  /**
   * 处理一次交换请求，返回完整事件流（需求 4, 5）。
   */
  resolveSwap(a: CellPos, b: CellPos): GameEvent[] {
    // 状态校验：仅等待输入时受理（需求 4.3, 9.4）
    if (this.state.state !== MatchState.AwaitingInput) return [];
    // 越界或非相邻：拒绝且不变更（需求 4.2）
    if (!BoardModel.inBounds(a) || !BoardModel.inBounds(b)) return [];
    if (!this.state.board.isAdjacent(a, b)) return [];

    // 读取交换前两格的宝石 id（供表现层按稳定 id 做动画）
    const gemA = this.state.board.get(a);
    const gemB = this.state.board.get(b);
    const gemIdA = gemA ? gemA.id : -1;
    const gemIdB = gemB ? gemB.id : -1;

    // 在真实棋盘上试交换，检测是否产生匹配
    this.state.board.swap(a, b);
    if (!this.resolver.hasAnyMatch(this.state.board)) {
      // 非法交换：还原并发出拒绝事件（需求 5.2）
      this.state.board.swap(a, b);
      return [{ type: 'swap-rejected', a, b, gemIdA, gemIdB }];
    }

    // 合法交换：提交，进入解析（需求 5.1）
    this.state.state = MatchState.Resolving;
    const events: GameEvent[] = [{ type: 'swap', a, b, gemIdA, gemIdB }];
    this.runCascades(events);
    this.finishTurn(events);
    return events;
  }

  /** 连锁主循环（需求 8.5-8.9, 18.2, 18.3） */
  private runCascades(events: GameEvent[]): void {
    this.state.chainCount = 0;
    let grantedExtra = false;

    for (;;) {
      const matches = this.resolver.findMatches(this.state.board);
      if (matches.length === 0) break;

      this.state.chainCount += 1;
      const chain = this.state.chainCount;

      // 1. 消除：发出 elimination 事件，并按组结算效果
      for (const group of matches) {
        events.push(this.makeEliminationEvent(group, chain));
        if (grantsExtraTurn(group.shape)) grantedExtra = true;

        // 特殊宝石钩子（需求 7.4, 7.5）—— 仅标记不生成
        if (group.shape === 'T' || group.shape === 'L' || group.cells.length >= 5) {
          const hook: SpecialGemHookEvent = {
            type: 'special-gem-hook',
            pos: group.cells[0],
            reason: group.cells.length >= 5 ? 'match5' : group.shape === 'L' ? 'L' : 'T',
          };
          events.push(hook);
        }

        // 结算法力 / 骷髅伤害
        this.applyGroupEffects(group, events);
      }

      // 2. 从棋盘移除被消除的宝石
      for (const group of matches) {
        for (const cell of group.cells) {
          this.state.board.set(cell, null);
        }
      }

      // 3. 胜负检查：某队全灭即结束（需求 15.3）
      if (this.checkVictory(events)) return;

      // 4. 重力 + 补充（需求 8.1-8.4）
      const result = this.gravity.apply(this.state.board, this.skullChance);
      events.push({ type: 'gravity', chainCount: chain, moves: result.moves });
      events.push({ type: 'refill', chainCount: chain, spawns: result.spawns });
      // 循环：再次检测匹配（需求 8.5, 8.6）
    }

    // 记录本回合是否获得额外回合，供 finishTurn 使用
    this.pendingExtraTurn = grantedExtra;
  }

  private pendingExtraTurn = false;

  private makeEliminationEvent(group: MatchGroup, chain: number): EliminationEvent {
    return {
      type: 'elimination',
      chainCount: chain,
      shape: group.shape,
      cells: group.cells.map((pos) => {
        const gem = this.state.board.get(pos)!;
        return { pos, gemId: gem.id, gemType: gem.type };
      }),
    };
  }

  /** 结算一个消除组的法力或骷髅伤害（需求 11, 12, 14） */
  private applyGroupEffects(group: MatchGroup, events: GameEvent[]): void {
    const activeTeam = this.state.teams[this.state.activePlayer];

    if (group.gemType.kind === 'color') {
      // 颜色匹配 → 产生法力，数量 = 消除宝石数（需求 11.1）
      const manaEvents = this.mana.distribute(
        activeTeam,
        this.state.activePlayer,
        group.gemType.color,
        group.cells.length,
      );
      events.push(...manaEvents);
    } else if (group.gemType.kind === 'skull') {
      // 骷髅匹配 → 物理伤害（需求 14），不产生法力（需求 11.2）
      const enemyTeam = this.state.teams[opponentOf(this.state.activePlayer)];
      const outcome = this.combat.resolveSkullDamage(
        activeTeam,
        enemyTeam,
        group.cells.length,
      );
      events.push(...outcome.events);
    }
  }

  /** 检查胜负，若结束则发出 game-over 并置状态（需求 15.3, 15.4） */
  private checkVictory(events: GameEvent[]): boolean {
    for (const side of [PlayerSide.Left, PlayerSide.Right]) {
      if (CombatResolver.isWipedOut(this.state.teams[side])) {
        const winner = opponentOf(side);
        this.state.state = MatchState.GameOver;
        this.state.winner = winner;
        events.push({ type: 'game-over', winner });
        return true;
      }
    }
    return false;
  }

  /** 结算回合归属（需求 9.1, 9.2, 9.3） */
  private finishTurn(events: GameEvent[]): void {
    if (this.state.state === MatchState.GameOver) return;

    if (this.pendingExtraTurn) {
      // 额外回合：保持当前玩家（需求 9.2, 9.3 多次只保留一次）
      events.push({ type: 'extra-turn', player: this.state.activePlayer });
    } else {
      // 交给对手（需求 9.1）
      const next = opponentOf(this.state.activePlayer);
      this.state.activePlayer = next;
      events.push({ type: 'turn-end', nextPlayer: next });
    }
    this.pendingExtraTurn = false;

    // 死局检测：无任何合法交换则洗牌重排，保证棋盘始终可玩
    if (!hasLegalSwap(this.state.board)) {
      const moves = reshuffle(this.state.board, this.rng);
      events.push({ type: 'reshuffle', moves });
    }

    this.state.state = MatchState.AwaitingInput;
  }

  /** 释放技能（需求 16） */
  castSkill(characterId: number): GameEvent[] {
    if (this.state.state !== MatchState.AwaitingInput) return [];

    const team = this.state.teams[this.state.activePlayer];
    const ch = team.characters.find((c) => c.id === characterId);
    if (!ch || ch.defeated) return [];

    if (!ManaDistributor.isSkillCastable(ch.manaRequirement, ch.manaPool)) {
      return []; // 法力不足，拒绝（需求 16.2）
    }

    // 扣除法力需求（需求 16.3）
    for (const key of Object.keys(ch.manaRequirement)) {
      const color = key as keyof typeof ch.manaPool;
      const required = ch.manaRequirement[color] ?? 0;
      ch.manaPool[color] = (ch.manaPool[color] ?? 0) - required;
    }

    const events: GameEvent[] = [
      { type: 'skill-cast', characterId: ch.id, skillId: ch.skillId },
    ];

    // 具体技能效果经注册表提供，本阶段通常无实现（需求 16.4, 20.2）
    const effect = this.registry.skills.get(ch.skillId);
    if (effect) {
      events.push(...effect.apply(this.state, ch.id));
      this.checkVictory(events);
    }

    return events;
  }
}
