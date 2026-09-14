import { describe, it, expect } from 'vitest';
import {
  computeClearEventBatches,
  mergeClearBatch,
} from '@render/clearEventBatches';
import type { GameEvent } from '@engine/events';
import { BaseColor, PlayerSide } from '@engine/types';

/** 造一颗被炸宝石（gemId 全局唯一，与引擎行为一致） */
let uid = 1;
const boom = (cells: Array<[number, number]>): GameEvent => ({
  type: 'gem-explode',
  cells: cells.map(([r, c]) => ({ pos: { row: r, col: c }, gemId: uid++, gemType: { kind: 'color', color: BaseColor.Red } })),
});
const smash = (cells: Array<[number, number]>): GameEvent => ({
  type: 'gem-destroy',
  cells: cells.map(([r, c]) => ({ pos: { row: r, col: c }, gemId: uid++, gemType: { kind: 'color', color: BaseColor.Blue } })),
});
const trig = (kind: string): GameEvent => ({
  type: 'special-gem-trigger',
  kind: kind as 'bomb',
  pos: { row: 0, col: 0 },
});

describe('clearEventBatches（特殊宝石清除批次聚合）', () => {
  it('连续 gem-explode（中间夹零时长触发事件）聚成一批：批首承接整批，批首不在 members', () => {
    const events: GameEvent[] = [
      boom([[2, 3], [2, 4], [2, 5], [3, 3], [3, 5], [4, 3], [4, 4], [4, 5]]), // 0: 末日环 8 格
      trig('doomSkull'),                                                      // 1
      boom([[2, 4], [2, 5], [2, 6], [3, 6], [4, 4], [4, 5], [4, 6]]),         // 2: 至尊环 7 格
      trig('uberDoomSkull'),                                                  // 3
      boom([[1, 3], [1, 4], [1, 5]]),                                         // 4: 炸弹连环 3 格
      { type: 'mana-gain', color: BaseColor.Red, amount: 1, characterId: 0, player: PlayerSide.Left },
    ];
    const { leaders, members } = computeClearEventBatches(events);

    expect([...leaders.keys()]).toEqual([0]); // 一批，批首是下标 0
    expect(leaders.get(0)).toHaveLength(3);
    // 回归锁：批首绝不能进 members——否则 appendSegment 开头会把整批跳过，
    // 爆炸动画/移除全不播，宝石贴图残留并与重力新落的宝石重叠
    expect(members.has(0)).toBe(false);
    expect([...members].sort((a, b) => a - b)).toEqual([2, 4]);
  });

  it('合并批保留全部格子（真实事件流 gemId 唯一，不触发去重）', () => {
    const events: GameEvent[] = [
      boom([[2, 3], [2, 4], [2, 5], [3, 3], [3, 5], [4, 3], [4, 4], [4, 5]]),
      trig('doomSkull'),
      boom([[2, 4], [2, 5], [2, 6], [3, 6], [4, 4], [4, 5], [4, 6]]),
    ];
    const { leaders } = computeClearEventBatches(events);
    const merged = mergeClearBatch(leaders.get(0)!);
    // 引擎保证链上被摧毁的宝石互不重复（炸过即空格），8 + 7 = 15 格全部保留
    expect(merged.cells).toHaveLength(15);
    expect(merged.type).toBe('gem-explode');
  });

  it('防御性去重：异常数据里同一 gemId 只保留首次出现', () => {
    // 真实事件流不会出现重复 gemId；此用例锁死去重行为本身
    const events: GameEvent[] = [
      { type: 'gem-explode', cells: [
        { pos: { row: 1, col: 1 }, gemId: 7, gemType: { kind: 'color', color: BaseColor.Red } },
        { pos: { row: 1, col: 2 }, gemId: 8, gemType: { kind: 'color', color: BaseColor.Red } },
      ] },
      { type: 'gem-explode', cells: [
        { pos: { row: 1, col: 1 }, gemId: 7, gemType: { kind: 'color', color: BaseColor.Red } },
      ] },
    ];
    const { leaders } = computeClearEventBatches(events);
    const merged = mergeClearBatch(leaders.get(0)!);
    expect(merged.cells).toHaveLength(2);
  });

  it('gravity 等实时长事件打断批次：其后爆炸单独成批或不成批', () => {
    const events: GameEvent[] = [
      boom([[0, 0], [0, 1]]),
      { type: 'gravity', chainCount: 1, moves: [] },
      boom([[5, 5], [5, 6]]),
    ];
    const { leaders, members } = computeClearEventBatches(events);
    expect(leaders.size).toBe(0); // 两处都是单事件（各自长度 1），不成批
    expect(members.size).toBe(0);
  });

  it('gem-explode 与 gem-destroy 不混批；同类连续才合并', () => {
    const events: GameEvent[] = [
      boom([[1, 1], [1, 2]]),
      smash([[2, 1], [2, 2]]),
      smash([[3, 1], [3, 2]]),
    ];
    const { leaders, members } = computeClearEventBatches(events);
    // explode 单事件不成批；destroy 两连成一批
    expect([...leaders.keys()]).toEqual([1]);
    expect(leaders.get(1)).toHaveLength(2);
    expect(members.has(0)).toBe(false);
    expect(members.has(1)).toBe(false); // 批首
    expect(members.has(2)).toBe(true);
  });

  it('批内夹多个触发事件仍不断批；单事件不成批走原路径', () => {
    const events: GameEvent[] = [
      boom([[1, 1]]),
      trig('bomb'),
      trig('wish'),
      smash([[2, 1], [2, 2]]),
      trig('bomb'),
      smash([[3, 1], [3, 2]]),
      trig('bomb'),
      smash([[4, 1], [4, 2]]),
    ];
    const { leaders, members } = computeClearEventBatches(events);
    // explode 单事件不成批；destroy 三连成一批（下标 3 为批首）
    expect([...leaders.keys()]).toEqual([3]);
    expect(members.has(0)).toBe(false);
    expect([...members].sort((a, b) => a - b)).toEqual([5, 7]);
  });
});
