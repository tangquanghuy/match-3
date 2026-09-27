/**
 * 目标选择机制（技能编写与演出 · 玩家手动选目标）。
 *
 * 与 ColorChooser 同一套路：技能里"指定单体/加血/净化/缠绕某个目标"用手动选定模式
 * （enemyChosen / allyChosen），释放时由施法方决定具体目标：
 *   - 玩家方：点选一张角色卡（表现层注入 FixedTargetChooser）；
 *   - AI 方：按确定性策略自动选（敌方取最弱、己方取最低血），用种子化 RNG 打破平局。
 *
 * 纯逻辑：无 pixi/gsap/dom 依赖；确定性（需求 10.3）。
 */
import type { GameState } from '../GameState';
import type { SeededRNG } from '../rng';
import { candidatesFor } from './targeting';
import type { ChosenTargetMode } from './targeting';
import type { SkillPrototype } from './prototypes';

/** 目标选择器：为一次手动选定技能返回目标角色 id；无候选返回 null */
export interface TargetChooser {
  choose(mode: ChosenTargetMode, state: GameState, casterId: number, rng: SeededRNG): number | null;
}

/**
 * AI 目标策略（确定性）：
 *   - enemyChosen / enemyChosenAndBelow：选存活敌人中 hp 最低者（平局取队伍索引更前者）；
 *   - allyChosen：选存活己方中 hp 最低者（治疗/净化倾向救最危者）。
 * 无候选返回 null。
 */
export class AiTargetChooser implements TargetChooser {
  choose(
    mode: ChosenTargetMode,
    state: GameState,
    casterId: number,
    _rng: SeededRNG,
  ): number | null {
    const cands = candidatesFor(mode, state, casterId);
    if (cands.length === 0) return null;
    // hp 最低者；candidatesFor 已按队伍索引顺序，故严格小于才替换 → 平局取更前者
    let best = cands[0];
    for (let i = 1; i < cands.length; i++) {
      if (cands[i].hp < best.hp) best = cands[i];
    }
    return best.id;
  }
}

/** 固定目标：玩家已点选某角色时用（表现层注入） */
export class FixedTargetChooser implements TargetChooser {
  constructor(private targetId: number) {}
  choose(): number | null {
    return this.targetId;
  }
}

/**
 * 判断一个技能原型是否含手动选目标段，返回其模式或 null。
 * 供 TurnEngine 决定是否调用 TargetChooser；取首个手动选目标段的模式。
 */
export function prototypeChosenTargetMode(proto: SkillPrototype): ChosenTargetMode | null {
  if (proto.inputTarget) return proto.inputTarget;
  for (const seg of proto.segments) {
    // 溅射仅当主目标本身就是手动指定时才需要选目标（enemyFront/enemyRandomN 等自带模式）
    if (seg.kind === 'damage' && seg.range === 'splash' && seg.target === 'enemyChosen') return 'enemyChosen';
    if ('target' in seg && seg.target === 'enemyChosen') return 'enemyChosen';
    if ('target' in seg && seg.target === 'allyChosen') return 'allyChosen';
    if ('target' in seg && seg.target === 'enemyChosenAndNextDown') return 'enemyChosenAndNextDown';
    if ('target' in seg && seg.target === 'enemyChosenAndBelow') return 'enemyChosenAndBelow';
    if ('target' in seg && seg.target === 'enemyChosenAndAdjacent') return 'enemyChosenAndAdjacent';
    // 创造段驱动（batch-r28，8737「选择一个盟友。创造10颗盟友对应法力颜色的宝石」官方
    // CreateGems FromTarget@Ally 实锤）：全咒语只有创造段、无任何带 target 字段的段时，
    // 'CHOSEN_TARGET' 占位色（读 ctx.chosenTargetId）也要有候选集——创造段的
    // 「其法力颜色」是己方（盟友）色源，故报 'allyChosen' 让引擎先走盟友选目标。
    if (
      seg.kind === 'gem' && seg.params.op === 'create'
      && seg.params.gem.kind === 'color' && seg.params.gem.color === 'CHOSEN_TARGET'
    ) {
      return 'allyChosen';
    }
  }
  return null;
}
