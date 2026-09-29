/**
 * 职业解锁判定（用户裁定 2026-09-29：分五批，不再一律「主线 8 关」）。
 *
 * 门槛表单一事实源在 data/classes.ts 的 CLASS_UNLOCK：
 *   default → 新档即有（破碎尖塔／督军，见 schema 初始存档）
 *   quest N → 通关该王国主线第 N 关（4 或 8）
 *   hard / veryHard → 通关该王国对应难度的全部 3 关
 * 结算（systems/settlement）在推进主线与首通探索关时各调一次；已解锁则返回 null。
 */
import { CLASSES, classByKingdom, classUnlockRule } from '../data/classes';
import { HARD_NODE_COUNT, VERY_HARD_NODE_COUNT } from '../data/kingdoms';
import type { KingdomState, MetaSave } from '../state/schema';

function unlock(save: MetaSave, classId: string): string | null {
  if (save.hero.unlockedClasses.includes(classId)) return null;
  save.hero.unlockedClasses.push(classId);
  return classId;
}

/** 主线推进到第 node 关后的解锁判定（quest 批次）。返回本次新解锁的 classId。 */
export function tryUnlockClassOnQuest(save: MetaSave, kingdom: string, node: number): string | null {
  const cls = classByKingdom(kingdom);
  if (!cls) return null;
  const rule = classUnlockRule(cls.id);
  if (rule.kind !== 'quest' || node < rule.nodes) return null;
  return unlock(save, cls.id);
}

/** 该王国某难度是否全 3 关通关（探索档位 1~3 = 困难，4~6 = 非常困难）。 */
function difficultyCleared(entry: KingdomState | undefined, mode: 'hard' | 'veryHard'): boolean {
  const cleared = new Set(entry?.clearedExploreTiers ?? []);
  const offset = mode === 'hard' ? 0 : HARD_NODE_COUNT;
  const count = mode === 'hard' ? HARD_NODE_COUNT : VERY_HARD_NODE_COUNT;
  for (let node = 1; node <= count; node++) if (!cleared.has(offset + node)) return false;
  return true;
}

/** 首通一个探索关后的解锁判定（hard / veryHard 批次）。返回本次新解锁的 classId。 */
export function tryUnlockClassOnExplore(save: MetaSave, kingdom: string): string | null {
  const cls = classByKingdom(kingdom);
  if (!cls) return null;
  const rule = classUnlockRule(cls.id);
  if (rule.kind !== 'hard' && rule.kind !== 'veryHard') return null;
  if (!difficultyCleared(save.kingdoms[kingdom], rule.kind)) return null;
  return unlock(save, cls.id);
}

/** 该存档当前「本该已解锁」的全部职业（旧档补发与 demo 存档共用）。 */
export function eligibleClassIds(save: MetaSave): string[] {
  const out: string[] = [];
  for (const cls of CLASSES) {
    const rule = classUnlockRule(cls.id);
    const entry = save.kingdoms[cls.kingdom];
    const ok = rule.kind === 'default'
      ? true
      : rule.kind === 'quest'
        ? (entry?.questsDone ?? 0) >= rule.nodes
        : difficultyCleared(entry, rule.kind);
    if (ok) out.push(cls.id);
  }
  return out;
}
