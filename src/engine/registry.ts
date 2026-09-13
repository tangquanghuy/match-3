import type { GameState } from './GameState';
import type { GameEvent } from './events';
import { PlayerSide, opponentOf } from './types';
import { CombatResolver } from './CombatResolver';
import type { SkillPrototype } from './skills/prototypes';

/**
 * 扩展点接口与注册表（需求 20）。
 * 技能行为由「技能原型」提供（skills/prototypes.ts），经本注册表按 skillId 查表。
 */

/** 技能效果接口（需求 20.2）—— 低层自定义技能可直接实现该接口 */
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
  /** 低层自定义技能效果（可选，优先级高于原型） */
  skills = new Map<string, SkillEffect>();
  /** 技能原型：skillId → 原型（目标 + 效果段），由 castSkill 执行（需求 11.2） */
  prototypes = new Map<string, SkillPrototype>();
  statuses = new Map<string, StatusEffectHandler>();
  targetSelector: TargetSelector = new DefaultFrontTargetSelector();
}
