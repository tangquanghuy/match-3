/** Dry-run the REAL EventStreamPlayer timeline builder without starting rendering.
 * This measures authored main-timeline occupancy, not wall-clock FPS, CSS tails,
 * audio, network or visual quality. It includes the ENTIRE supplied event stream.
 */
import { EventStreamPlayer } from '../../src/render/EventStreamPlayer';
import type { GameEvent } from '@engine/events';
import type { CellPos } from '@engine/types';

type PlayerInternals = {
  timeline: gsap.core.Timeline | null;
  appendSegment: (tl: gsap.core.Timeline, event: GameEvent, index: number, origins: unknown[]) => void;
};
export function presentationStage(event: GameEvent): string {
  if (['gem-explode', 'gem-destroy', 'special-gem-trigger'].includes(event.type)) return 'gem-clear';
  if (['gravity', 'refill', 'elimination', 'reshuffle', 'gem-create', 'gem-transform'].includes(event.type)) return 'board-and-cascades';
  if (event.type === 'mana-gain') return 'mana';
  if (event.type === 'buff' && event.source === 'trait') return 'trait-buff';
  if (event.type.startsWith('status-')) return 'status';
  if (['summon', 'defeat', 'flee', 'troop-transform'].includes(event.type)) return 'roster-change';
  return 'skill-and-other';
}
export function planPresentation(events: GameEvent[]) {
  const board = { cellSize: 88, gridPixels: 704,
    cellCenter: (pos: CellPos) => ({ x: (pos.col + .5) * 88, y: (pos.row + .5) * 88 }),
    getSprite: () => undefined,
  };
  const player = new EventStreamPlayer(
    board as unknown as ConstructorParameters<typeof EventStreamPlayer>[0],
    {} as ConstructorParameters<typeof EventStreamPlayer>[1],
    {} as ConstructorParameters<typeof EventStreamPlayer>[2],
    {} as ConstructorParameters<typeof EventStreamPlayer>[3],
  );
  const internals = player as unknown as PlayerInternals;
  const append = internals.appendSegment.bind(player);
  const stageMs: Record<string, number> = {};
  internals.appendSegment = (tl, event, index, origins) => {
    const before = tl.duration();
    append(tl, event, index, origins);
    const stage = presentationStage(event);
    stageMs[stage] = (stageMs[stage] ?? 0) + (tl.duration() - before) * 1000;
  };
  try {
    // Construction is synchronous. Stop before GSAP's first ticker callback; never
    // skip()/progress(1), which would execute render callbacks against this stub.
    void player.play(events);
    internals.timeline?.pause();
    return { timelineMs: (internals.timeline?.duration() ?? 0) * 1000, stageMs };
  } finally {
    internals.timeline?.kill();
  }
}

