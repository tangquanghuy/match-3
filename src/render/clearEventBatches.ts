/**
 * 特殊宝石清除事件的批次聚合（纯逻辑，无 DOM/pixi 依赖，供 EventStreamPlayer 与单测共用）。
 *
 * 一次行动里末日骷髅环、至尊环、炸弹连环会产出多个连续的 gem-explode / gem-destroy 事件；
 * 逐个播会"一颗颗慢慢爆"。本模块把连续的同类清除事件聚合成一批，播放时首事件承接整批、
 * 一次引爆。中间允许夹 special-gem-trigger——它是零时长元事件，正是特殊宝石链的触发标记；
 * 其余任何事件（gravity/defeat 等）都会打断批次。gem-explode 与 gem-destroy 各自成批，不混批。
 */
import type { GameEvent } from '@engine/events';

/** 清除类事件（gem-explode / gem-destroy 的公共结构） */
export type ClearEvent = Extract<GameEvent, { type: 'gem-explode' | 'gem-destroy' }>;

export interface ClearEventBatches {
  /** 批首事件下标 → 该批全部同类清除事件（长度 ≥2 才成批；单事件走原路径） */
  leaders: Map<number, ClearEvent[]>;
  /** 批内**非首**事件下标：播放时跳过（已随批首合并）。批首不在其中（它负责播放整批）。 */
  members: Set<number>;
}

export function isClearEvent(ev: GameEvent): ev is ClearEvent {
  return ev.type === 'gem-explode' || ev.type === 'gem-destroy';
}

export function computeClearEventBatches(events: GameEvent[]): ClearEventBatches {
  const leaders = new Map<number, ClearEvent[]>();
  const members = new Set<number>();
  let i = 0;
  while (i < events.length) {
    const ev = events[i];
    if (!isClearEvent(ev)) {
      i += 1;
      continue;
    }
    const kind = ev.type;
    const group: ClearEvent[] = [ev];
    const memberIdx: number[] = [];
    let j = i + 1;
    while (j < events.length) {
      const e = events[j];
      if (e.type === kind) {
        group.push(e as ClearEvent);
        memberIdx.push(j);
        j += 1;
      } else if (e.type === 'special-gem-trigger') {
        j += 1; // 零时长元事件不打断批次
      } else {
        break;
      }
    }
    if (group.length >= 2) {
      leaders.set(i, group);
      for (const m of memberIdx) members.add(m);
    }
    i = j;
  }
  return { leaders, members };
}

/** 把一批同类清除事件合并为单个事件（按 gemId 去重；链上格子本就互不重复，防御性去重） */
export function mergeClearBatch<T extends ClearEvent>(batch: T[]): T {
  if (batch.length === 1) return batch[0];
  const seen = new Set<number>();
  const cells: ClearEvent['cells'] = [];
  for (const b of batch) {
    for (const c of b.cells) {
      if (!seen.has(c.gemId)) {
        seen.add(c.gemId);
        cells.push(c);
      }
    }
  }
  return { type: batch[0].type, cells } as T;
}
