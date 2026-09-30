import { describe, it, expect } from 'vitest';
import type { BattleResult } from '../../src/session/contract';
import { applySettlement, newSave, planExploreEncounter } from '../../src/meta';
import { bonusRoll, resolveBattleBonus, type BattleBonusSpec } from '../../src/meta/systems/battleBonus';

const DAY1 = 1726500000000;

function result(over: Partial<BattleResult> = {}): BattleResult {
  return {
    schemaVersion: 1, battleId: 'b', requestId: 'r', rulesetVersion: '1.1.0', seed: 77, winner: 'player', turns: 6,
    combatants: [], defeatedExternalIds: [], summonedCount: 0, actionLogDigest: '', eventSummary: [], ...over,
  };
}

describe('通用战斗额外奖励', () => {
  const gnome: BattleBonusSpec = { id: 'gnome', label: '地精钱袋', when: { kind: 'killed', targets: ['e0-6497'] }, deltas: { gems: 30 }, mats: { treasureMaps: 1 } };

  it('击杀目标才发放；逃跑不发', () => {
    expect(resolveBattleBonus([gnome], result({ defeatedExternalIds: ['e0-6497'] }))).toHaveLength(1);
    expect(resolveBattleBonus([gnome], result({ fledExternalIds: ['e0-6497'] }))).toHaveLength(0);
    const consolation: BattleBonusSpec = { id: 'c', label: '零钱', when: { kind: 'fledAny', targets: ['e0-6497'] }, deltas: { gold: 100 } };
    expect(resolveBattleBonus([consolation], result({ fledExternalIds: ['e0-6497'] }))).toHaveLength(1);
  });

  it('概率掷骰可复现，且约等于设定概率', () => {
    const spec: BattleBonusSpec = { id: 'p', label: '', when: { kind: 'victory' }, chance: 0.25, deltas: { gems: 30 } };
    expect(bonusRoll(spec, 123)).toBe(bonusRoll(spec, 123));
    let hits = 0;
    for (let s = 0; s < 4000; s++) if (bonusRoll(spec, s)) hits++;
    expect(hits / 4000).toBeGreaterThan(0.21);
    expect(hits / 4000).toBeLessThan(0.29);
  });

  it('回合数条件', () => {
    const fast: BattleBonusSpec = { id: 'f', label: '', when: { kind: 'turnsAtMost', n: 5 }, deltas: { gold: 1 } };
    expect(resolveBattleBonus([fast], result({ playerTurns: 5 }))).toHaveLength(1);
    expect(resolveBattleBonus([fast], result({ playerTurns: 6 }))).toHaveLength(0);
    expect(resolveBattleBonus([fast], result({ playerTurns: 3, winner: 'enemy' }))).toHaveLength(0);
  });

  it('结算统一入账，行 key 为 battle-bonus', () => {
    const save = newSave({ now: 0, starterTroopIds: [6000, 6097, 6457] });
    const plan = planExploreEncounter('破碎尖塔', 1, 9);
    plan.bonus = [{ id: 'x', label: '宝箱怪的珍藏', when: { kind: 'victory' }, deltas: { gems: 30 }, mats: { treasureMaps: 1 } }];
    const gems0 = save.currencies.gems;
    const maps0 = save.materials.treasureMaps;
    const detail = applySettlement(save, result(), { plan, enemyByExternalId: new Map(), todayStart: DAY1 });
    const line = detail.lines.find((l) => l.key === 'battle-bonus');
    expect(line?.label).toBe('宝箱怪的珍藏');
    expect(line?.deltas.gems).toBe(30);
    expect(line?.mats?.treasureMaps).toBe(1);
    expect(save.materials.treasureMaps).toBe(maps0 + 1);
    expect(save.currencies.gems).toBeGreaterThanOrEqual(gems0 + 30);
  });
});
