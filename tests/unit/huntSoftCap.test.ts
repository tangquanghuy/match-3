import { describe, expect, it } from 'vitest';
import { SeededRNG } from '../../src/engine/rng';
import { newSave, type TreasureHuntState } from '../../src/meta/state/schema';
import { parseSaveJson, serializeSave } from '../../src/meta/state/save';
import { applyMove, beginHunt, commitMove, createOpeningBoard, hasMatch } from '../../src/meta/systems/treasureHunt';
import { createHuntSoftCap, hydrateHuntSoftCap, huntComboBias, huntRewardProgress, observeHuntProgress } from '../../src/meta/systems/huntPacing';

const checker = () => Array.from({ length: 64 }, (_, i) => (Math.floor(i / 8) + i % 8) % 2);
function firstMove(cells: number[]): [number, number] {
  for (let a = 0; a < 64; a++) for (const b of [a % 8 < 7 ? a + 1 : -1, a + 8 < 64 ? a + 8 : -1]) {
    if (b < 0 || cells[a] === 7 || cells[b] === 7) continue;
    const copy = cells.slice(); [copy[a], copy[b]] = [copy[b]!, copy[a]!];
    if (hasMatch(copy)) return [a, b];
  }
  throw new Error('No move');
}

describe('藏宝图单一区间随机软上限', () => {
  it('每局只抽一个3~9的等价值目标，固定种子可复现，覆盖整个区间', () => {
    const targets = new Set<number>();
    for (let seed = 1; seed <= 200; seed++) {
      const cap = createHuntSoftCap(seed);
      expect(cap).toEqual(createHuntSoftCap(seed));
      expect(Object.keys(cap).sort()).toEqual(['activeMoves', 'peak', 'target']);
      expect(cap.target).toBeGreaterThanOrEqual(3);
      expect(cap.target).toBeLessThanOrEqual(9);
      expect(cap.peak).toBe(0);
      expect(huntComboBias(cap)).toBe(0);
      targets.add(cap.target);
    }
    expect([...targets].sort()).toEqual([3, 4, 5, 6, 7, 8, 9]);
  });

  it('红箱1、宝库3：混合计入同一进度，3红箱升级1宝库不重复累计', () => {
    const cap = { target: 7, peak: 0, activeMoves: 0 };
    expect(huntRewardProgress([0, 1, 2, 3, 4, 5])).toBe(0);
    observeHuntProgress(cap, [6, 6, 6]);
    expect(cap.peak).toBe(3);
    observeHuntProgress(cap, [7]);
    expect(cap.peak).toBe(3);
    observeHuntProgress(cap, [7, 6, 6, 6]);
    expect(cap.peak).toBe(6);
    expect(huntComboBias(cap)).toBe(0); // Neither a vault nor several red chests is a separate trigger.
    observeHuntProgress(cap, [7, 7, 6]);
    expect(cap.peak).toBe(7);
    expect(huntComboBias(cap)).toBe(-1);
    observeHuntProgress(cap, [7]);
    expect(cap.peak).toBe(7);
    expect(huntComboBias(cap)).toBe(-1);
  });

  it('触发前始终为0，触发后平滑增强负偏置且有上界', () => {
    expect(huntComboBias({ target: 9, peak: 8, activeMoves: 900 })).toBe(0);
    expect([0, 3, 6, 9, 12, 1000].map(activeMoves => huntComboBias({ target: 6, peak: 6, activeMoves })))
      .toEqual([-1, -2, -3, -4, -5, -5]);
  });

  it('随机门槛不额外消耗开局/普通掉落随机流，续局不重新抽门槛或扣图', () => {
    const save = newSave({ now: 0 }); save.materials.treasureMaps = 2;
    const natural = new SeededRNG(42);
    const cells = createOpeningBoard(natural);
    const started = beginHunt(save, 42);
    if (!started.ok) throw new Error(started.message);
    expect(started.state.cells).toEqual(cells);
    expect(started.state.rng).toBe(natural.getState());
    const before = structuredClone(started.state);
    expect(beginHunt(save, 999)).toEqual({ ok: true, state: before });
    expect(save.materials.treasureMaps).toBe(1);
  });

  it('旧局补齐一次、损坏字段清洗、已触发状态在读档后不丢失', () => {
    const cells = checker(); cells[63] = 7;
    const save = newSave({ now: 0 });
    save.treasureHunt = { cells, turns: 20, moves: 80, rng: 42 };
    const loaded = parseSaveJson(serializeSave(save));
    expect(loaded.treasureHunt?.softCap?.peak).toBe(3);
    expect(parseSaveJson(serializeSave(loaded)).treasureHunt).toEqual(loaded.treasureHunt);
    expect(hydrateHuntSoftCap({ target: 3, peak: 9, activeMoves: 12 }, 42, cells))
      .toEqual({ target: 3, peak: 9, activeMoves: 12 });
    const invalid = hydrateHuntSoftCap({ target: Infinity, peak: -1, activeMoves: '999' }, 42, cells);
    expect(invalid).toEqual(createHuntSoftCap(42, cells));
    expect(hydrateHuntSoftCap({ target: 9, peak: 2, activeMoves: 99 }, 42, cells).activeMoves).toBe(0);
  });

  it('落盘并重载后下一步与不中断完全相同，不修改输入状态', () => {
    const save = newSave({ now: 0 });
    const cells = createOpeningBoard(new SeededRNG(42)); cells[63] = 7;
    save.treasureHunt = { cells, turns: 50, moves: 90, rng: 123, softCap: { target: 3, peak: 3, activeMoves: 6 } };
    const before = structuredClone(save.treasureHunt);
    const [from, to] = firstMove(cells);
    const expected = applyMove(before, from, to);
    expect(save.treasureHunt).toEqual(before);
    const played = commitMove(save, from, to);
    expect(played).toEqual(expected);
    expect(played.ok).toBe(true);
    if (!played.ok || !save.treasureHunt) throw new Error('Expected ongoing hunt');
    expect(played.softCap.target).toBe(3);
    expect(played.softCap.activeMoves).toBe(7);
    const restored = parseSaveJson(serializeSave(save));
    expect(restored.treasureHunt).toEqual(save.treasureHunt);
    const next = firstMove(save.treasureHunt.cells);
    expect(applyMove(restored.treasureHunt!, ...next)).toEqual(applyMove(save.treasureHunt, ...next));
  });

  it('有效的四/五连仍原样奖励步数；不会强行削减存量步数', () => {
    for (const [best, expected] of [[4, 50], [5, 51]]) {
      const cells = checker(); cells[3] = 0; if (best === 4) cells[4] = 1;
      const state: TreasureHuntState = { cells, turns: 50, moves: 100, rng: 2, softCap: { target: 3, peak: 9, activeMoves: 50 } };
      const result = applyMove(state, 1, 9);
      if (!result.ok) throw new Error(result.message);
      expect(result.best).toBe(best);
      expect(result.turns).toBe(expected);
      expect(result.over).toBe(false);
    }
  });

  it('红箱合成宝库不重复计进度，实际升级结果与降温状态一起返回', () => {
    const cells = checker();
    cells[0] = 6; cells[1] = 5; cells[2] = 6; cells[9] = 6;
    const state: TreasureHuntState = { cells, turns: 20, moves: 100, rng: 42, softCap: { target: 3, peak: 3, activeMoves: 0 } };
    const played = applyMove(state, 1, 9);
    if (!played.ok) throw new Error(played.message);
    expect(played.cells).toContain(7);
    expect(played.softCap.peak).toBe(3);
    expect(played.softCap.activeMoves).toBe(1);
    expect(played.softCap.target).toBe(3);
    expect(state.softCap?.activeMoves).toBe(0);
  });

  it('无效操作不累计降温、不推进随机流或覆盖软上限', () => {
    const save = newSave({ now: 0 });
    save.treasureHunt = { cells: checker(), turns: 20, moves: 100, rng: 42, softCap: { target: 6, peak: 6, activeMoves: 3 } };
    const before = structuredClone(save.treasureHunt);
    expect(commitMove(save, 0, 63).ok).toBe(false);
    expect(save.treasureHunt).toEqual(before);
  });
});
