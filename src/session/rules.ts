/**
 * 宿主战斗规则 → 引擎规则（externalId → 内部 id、player/enemy → Left/Right）。
 * 只接受校验通过的 request（validateBattleRequest 已核对目标 id 与数值范围）。
 */
import { applyBoardPreset, type EngineBattleRules } from '@engine/battleRules';
import type { BoardModel } from '@engine/BoardModel';
import type { SeededRNG } from '@engine/rng';
import type { SpecialGemSpec } from '@engine/types';
import type { BattleRequest, RuleGem } from './contract';
import { SIDE_OF_NAME, type CombatantIdMap } from './combatantMapping';

const gemOf = (g: RuleGem): SpecialGemSpec => ({
  kind: g.kind,
  ...(g.tier !== undefined ? { tier: g.tier } : {}),
  ...(g.color !== undefined ? { color: g.color } : {}),
});

/** 建盘后、createGameState 前：按 request.rules.board.preset 预置特殊宝石 */
export function applyRequestBoardPreset(board: BoardModel, request: BattleRequest, rng: SeededRNG): void {
  const preset = request.rules?.board?.preset;
  if (!preset || preset.length === 0) return;
  applyBoardPreset(board, preset.map((p) => ({ gem: gemOf(p.gem), count: p.count, ...(p.onColor ? { onColor: p.onColor } : {}) })), rng);
}

export function engineRulesOf(request: BattleRequest, idMap: CombatantIdMap): EngineBattleRules | null {
  const r = request.rules;
  if (!r) return null;
  const ids = (list: readonly string[] | undefined): number[] =>
    (list ?? []).map((id) => idMap.internalIdOf(id)).filter((n): n is number => n !== undefined);
  const out: EngineBattleRules = {};
  if (r.board?.skullChance !== undefined) out.skullChance = r.board.skullChance;
  if (r.board?.colorWeights) out.colorWeights = { ...r.board.colorWeights };
  if (r.board?.specialDrops) {
    out.specialDrops = { chance: r.board.specialDrops.chance, pool: r.board.specialDrops.pool.map((p) => ({ gem: gemOf(p.gem), weight: p.weight })) };
  }
  if (r.board?.preset) out.preset = r.board.preset.map((p) => ({ gem: gemOf(p.gem), count: p.count, ...(p.onColor ? { onColor: p.onColor } : {}) }));
  if (r.turnLimit) out.turnLimit = { ...r.turnLimit };
  if (r.objective) out.killTargets = ids(r.objective.killTargets);
  if (r.turnStart) {
    out.turnStart = r.turnStart.map((t) => ({
      side: SIDE_OF_NAME[t.side],
      ...(t.every !== undefined ? { every: t.every } : {}),
      ...(t.mana ? { mana: { amount: t.mana.amount, ...(t.mana.targets ? { targets: ids(t.mana.targets) } : {}), ...(t.mana.colors ? { colors: [...t.mana.colors] } : {}) } } : {}),
      ...(t.createGems ? { createGems: t.createGems.map((g) => ({ gem: gemOf(g.gem), count: g.count, ...(g.chance !== undefined ? { chance: g.chance } : {}) })) } : {}),
    }));
  }
  return out;
}
