import { describe, expect, it } from 'vitest';
import { FramePlaybackClock } from '@render/FramePlaybackClock';
import { EventStreamPlayer } from '@render/EventStreamPlayer';
import { AnimConfig } from '@render/AnimationConfig';
import { BaseColor, colorGem } from '@engine/types';
import type { GameEvent } from '@engine/events';
import { planPresentation } from '../helpers/presentationBudget';

const clear: GameEvent = { type: 'gem-explode', cells: [{ gemId: 1, pos: { row: 7, col: 0 }, gemType: colorGem(BaseColor.Red) }] };
const gravity: GameEvent = { type: 'gravity', chainCount: 0, moves: [{ gemId: 2, from: { row: 6, col: 0 }, to: { row: 7, col: 0 } }] };
const refill: GameEvent = { type: 'refill', chainCount: 0, spawns: [{ gemId: 3, gemType: colorGem(BaseColor.Blue), to: { row: 6, col: 0 } }] };
function fixture() {
  const clocks: FramePlaybackClock[] = [];
  const removals: number[] = [];
  const sprites = new Map([1, 2].map(id => [id, { x: 44, y: id === 1 ? 660 : 572, scale: { x: 1, y: 1 }, alpha: 1 }]));
  const board = { cellSize: 88, gridPixels: 704,
    cellCenter: (p: { row: number; col: number }) => ({ x: (p.col + .5) * 88, y: (p.row + .5) * 88 }),
    getSprite: (id: number) => sprites.get(id),
    removeGem: (id: number) => { removals.push(id); sprites.delete(id); },
    addGem: ({ id }: { id: number }) => {
      expect(clocks.every(clock => clock.done)).toBe(true);
      const sprite = { x: 44, y: 0, scale: { x: 1, y: 1 }, alpha: 1 }; sprites.set(id, sprite); return sprite;
    },
  };
  const player = new EventStreamPlayer(board as never, {} as never, {} as never, { play: () => {} } as never);
  player.setPaused(true);
  player.onBattleEvent = (event, presentation) => { if (event.type === 'gem-explode') clocks.push(presentation!.explosionClock!); };
  const promise = player.play([clear, gravity, refill]);
  const timeline = (player as unknown as { timeline: gsap.core.Timeline }).timeline;
  return { player, timeline, clocks, sprites, removals, promise };
}

describe('explosion completes before falling', () => {
  it('shortens the strip and empty handoff, not the causal boundary', () => {
    expect(AnimConfig.frameFX.energy_burst.duration).toBe(320);
    expect(planPresentation([clear]).timelineMs).toBeCloseTo(340, 5);
    expect(AnimConfig.postExplodePause).toBe(.02);
  });
  it('does not move or spawn any falling gem until the strip is finished', () => {
    const x = fixture();
    try {
      x.timeline.totalTime(.16, false);
      expect(x.clocks[0].progress).toBeCloseTo(.5);
      expect(x.sprites.get(2)?.y).toBe(572); expect(x.sprites.has(3)).toBe(false);
      x.timeline.totalTime(.319, false);
      expect(x.clocks[0].done).toBe(false); expect(x.sprites.get(2)?.y).toBe(572);
      x.timeline.totalTime(.321, false);
      expect(x.clocks[0].done).toBe(true); expect(x.sprites.get(2)?.y).toBe(572);
      x.timeline.totalTime(.35, false);
      expect(x.removals).toEqual([1]); expect(x.sprites.get(2)!.y).toBeGreaterThan(572);
      expect(x.sprites.has(3)).toBe(true);
    } finally { x.player.cancel(); }
  });
  it('keeps strip and board on the same clock under speed changes and large frame jumps', async () => {
    const x = fixture(); const oldScale = AnimConfig.globalScale;
    try {
      x.player.setSpeed(4); x.timeline.totalTime(.08, false);
      expect(x.clocks[0].progress).toBeCloseTo(.25);
      expect(x.sprites.get(2)?.y).toBe(572);
      x.player.skip(); await x.promise;
      expect(x.clocks[0].done).toBe(true); expect(x.sprites.get(2)?.y).toBe(660);
      expect(x.sprites.has(3)).toBe(true);
    } finally { x.player.setSpeed(oldScale); x.player.cancel(); }
  });
  it('cancels an in-progress strip and never performs queued falling', () => {
    const x = fixture(); x.timeline.totalTime(.1, false);
    x.player.cancel(); expect(x.clocks[0].done).toBe(true);
    expect(x.sprites.get(2)?.y).toBe(572); expect(x.sprites.has(3)).toBe(false);
  });
  it('a completed strip never replays when an asset or callback arrives late', () => {
    const clock = new FramePlaybackClock(); const updates: number[] = [];
    const unsubscribe = clock.subscribe(p => updates.push(p));
    clock.advance(.5); unsubscribe(); clock.finish();
    expect(updates).toEqual([0, .5]);
    const late: number[] = []; clock.subscribe(p => late.push(p)); clock.advance(.1); clock.finish();
    expect(late).toEqual([1]); expect(clock.done).toBe(true);
  });
});
