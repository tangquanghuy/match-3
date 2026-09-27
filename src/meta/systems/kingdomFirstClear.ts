import { exploreTierForNode, KINGDOM_STAGE_COUNTS, KINGDOM_ORDER, type KingdomStageMode } from '../data/kingdoms';
import type { KingdomState, MetaSave } from '../state/schema';

/** 普通沿用线性任务进度，高难度按实际打赢的关卡独立记录，跳打不代领前关。 */
export function kingdomStageCleared(entry: KingdomState | undefined, mode: KingdomStageMode, node: number): boolean {
  if (!Number.isInteger(node) || node < 1 || node > KINGDOM_STAGE_COUNTS[mode]) return false;
  return mode === 'normal' ? node <= (entry?.questsDone ?? 0)
    : (entry?.clearedExploreTiers ?? []).includes(exploreTierForNode(mode, node));
}

/** 从真实进度导出模型的剩余首通数量；历史普通通关不再次计入。 */
export function remainingKingdomFirstClears(save: Pick<MetaSave, 'kingdoms'>): Record<KingdomStageMode, number> {
  const counts = { normal: 0, hard: 0, veryHard: 0 };
  for (const kingdom of KINGDOM_ORDER) {
    for (const mode of ['normal', 'hard', 'veryHard'] as const) {
      for (let node = 1; node <= KINGDOM_STAGE_COUNTS[mode]; node++) {
        if (!kingdomStageCleared(save.kingdoms[kingdom], mode, node)) counts[mode]++;
      }
    }
  }
  return counts;
}
