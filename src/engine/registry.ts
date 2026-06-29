import type { GameState } from './GameState';
import type { GameEvent } from './events';
import { PlayerSide, opponentOf } from './types';
import { CombatResolver } from './CombatResolver';

/**
 * 扩展点接口与注册表（需求 20）。
 * 本阶段提供默认实现，具体技能/状态/特殊宝石行为留待后续阶段。
 */

/** 技能效果接口（需求 20.2）—— 本阶段无具体实现 */
export interface SkillEffect {
  apply(state: GameState, casterId: number): GameEvent[];
}

/** 状态效果接口（需求 20.3）—— 本阶段空壳 */
export interface StatusEffectHandler {
  id: string;
  onTurnStart?(state: GameState, charId: number): GameEvent[];
}

/** 目标选择接口（需求 20.4） */
export interface TargetSelector {
  /** 返回 attacker 方应攻击的敌方角色 id，或 null（无目标） */
  select(state: GameState, attacker: PlayerSide): number | null;
}

/** 默认目标选择：敌方队首存活角色（需求 14.2） */
export class DefaultFrontTargetSelector implements TargetSelector {
  select(state: GameState, attacker: PlayerSide): number | null {
    const enemy = state.teams[opponentOf(attacker)];
    const front = CombatResolver.frontAlive(enemy);
    return front ? front.id : null;
  }
}

/** 集中注册表 */
export class ExtensionRegistry {
  skills = new Map<string, SkillEffect>();
  statuses = new Map<string, StatusEffectHandler>();
  targetSelector: TargetSelector = new DefaultFrontTargetSelector();
}
