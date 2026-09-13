import type { GameEvent } from '@engine/events';

/** TURN advances only when control actually passes to the other side. */
export function hasTurnSwitch(events: GameEvent[]): boolean {
  return events.some((event) => event.type === 'turn-end');
}

/** An awarded extra action contributes one additional combo pulse level. */
export function extraActionComboLevel(events: GameEvent[]): number {
  const highestChain = events.reduce((max, event) =>
    event.type === 'elimination' ? Math.max(max, event.chainCount) : max, 0);
  return Math.max(2, highestChain + 1);
}
