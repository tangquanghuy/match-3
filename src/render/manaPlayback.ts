import type { GameEvent } from '@engine/events';
import type { BaseColor, CellPos } from '@engine/types';
import { computeClearEventBatches, mergeClearBatch, type ClearEventBatches } from './clearEventBatches';
import { isCardPlaybackEvent } from './impactPlayback';
import { computeEliminationWaves } from './presentationBatches';
import { AnimConfig } from './AnimationConfig';

export type ManaOriginRef = { gemId: number; pos: CellPos; color: BaseColor };
export type ManaEvent = Extract<GameEvent, { type: 'mana-gain' }>;
export interface ManaPlaybackBatch {
  events: { index: number; event: ManaEvent }[];
  /** The same impact window may overlap clear and damage; death/refill remain barriers. */
  clearIndex?: number;
}

/** Consecutive recipients share one visual window, never one window per recipient. */
export function computeManaPlaybackBatches(events: GameEvent[], clear: ClearEventBatches) {
  const leaders = new Map<number, ManaPlaybackBatch>();
  const members = new Set<number>();
  const clearLeader = new Map<number, number>();
  for (const [index, batch] of clear.leaders) {
    // Clear batching admits special-gem-trigger markers but no other event types.
    let remaining = batch.length - 1;
    for (let j = index + 1; remaining > 0 && j < events.length; j++) {
      if (clear.members.has(j)) { clearLeader.set(j, index); remaining--; }
    }
  }
  for (let i = 0; i < events.length; i++) {
    const event = events[i];
    if (event.type !== 'mana-gain') continue;
    const batch: ManaPlaybackBatch = { events: [{ index: i, event }] };
    let previousIndex = i - 1;
    while (previousIndex >= 0 && (isCardPlaybackEvent(events[previousIndex])
      || events[previousIndex].type === 'special-gem-trigger')) previousIndex--;
    const previous = events[previousIndex];
    if (previous && (previous.type === 'elimination' || previous.type === 'gem-explode' || previous.type === 'gem-destroy')) {
      batch.clearIndex = clearLeader.get(previousIndex) ?? previousIndex;
    }
    let j = i + 1;
    while (j < events.length && events[j].type === 'mana-gain') {
      batch.events.push({ index: j, event: events[j] as ManaEvent });
      members.add(j++);
    }
    leaders.set(i, batch);
    i = j - 1;
  }
  return { leaders, members };
}

/** Use the whole merged clear and the matching color, including doubled surge gains. */
export function computeManaSources(events: GameEvent[], clear = computeClearEventBatches(events)) {
  const result = new Map<number, ManaOriginRef[]>();
  let available: ManaOriginRef[] = [];
  const waves = computeEliminationWaves(events);
  let lastWave: number | undefined;
  events.forEach((event, index) => {
    if (clear.members.has(index)) return;
    if (event.type === 'elimination' || event.type === 'gem-destroy' || event.type === 'gem-explode') {
      const batch = clear.leaders.get(index);
      const cells = batch ? mergeClearBatch(batch).cells : event.cells;
      const origins = cells.flatMap(cell => cell.gemType.kind === 'color'
        ? [{ gemId: cell.gemId, pos: { ...cell.pos }, color: cell.gemType.color }] : []);
      const wave = event.type === 'elimination' ? waves.get(index) : undefined;
      available = wave !== undefined && wave === lastWave ? [...available, ...origins] : origins;
      lastWave = wave;
    } else if (event.type === 'mana-gain') {
      const limit = Math.max(0, Math.ceil(event.amount / (event.surge ? 2 : 1)));
      const taken: ManaOriginRef[] = [];
      available = available.filter(origin => {
        if (origin.color === event.color && taken.length < limit) {
          taken.push(origin);
          return false;
        }
        return true;
      });
      result.set(index, taken);
    } else if (event.type === 'gravity' || event.type === 'refill' || event.type === 'swap' || event.type === 'reshuffle') {
      available = [];
    }
  });
  return result;
}

/** Bound the launch spread of a large explosion without shortening the flight itself. */
export function manaMoteDelay(index: number, moteCount: number): number {
  const step = moteCount > 1
    ? Math.min(AnimConfig.manaFlow.stagger, AnimConfig.manaFlow.maxStagger / (moteCount - 1)) : 0;
  return index * step;
}

/** Same envelope as App's actual DOM motes (surge renders two motes per source). */
export function manaFlowDuration(originCount: number, surge = false): number {
  const moteCount = originCount * (surge ? 2 : 1);
  return AnimConfig.manaFlow.duration + manaMoteDelay(Math.max(0, moteCount - 1), moteCount)
    + (surge && originCount > 0 ? AnimConfig.manaFlow.surgeHold : 0);
}