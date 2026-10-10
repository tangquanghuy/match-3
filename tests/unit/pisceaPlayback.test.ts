import { expect, it } from 'vitest';
import type { GameEvent } from '@engine/events';
import { BaseColor, colorGem } from '@engine/types';
import { EventStreamPlayer } from '@render/EventStreamPlayer';

it('Piscea plays the green clear, blue creation and devour before board matches', () => {
  const times: Record<string, number> = {};
  const green = colorGem(BaseColor.Green);
  const blue = colorGem(BaseColor.Blue);
  const cell = (gemId: number, gemType: typeof green) => ({
    gemId, gemType, pos: { row: 0, col: 0 },
  });
  const events: GameEvent[] = [
    { type: 'gem-destroy', cells: [cell(1, green)] },
    { type: 'gem-create', spawns: [cell(2, blue)] },
    { type: 'skill-phase-boundary' },
    { type: 'skill-damage', casterId: 0, targetId: 10, range: 'single', damage: 100,
      resultingHp: 0, resultingArmor: 0, devoured: true },
    { type: 'skill-phase-boundary' },
    { type: 'elimination', chainCount: 1, shape: 'line3', cells: [cell(2, blue)] },
  ];
  const board = {
    cellSize: 88, gridPixels: 704, cellCenter: () => ({ x: 44, y: 44 }),
    getSprite: () => undefined, removeGem: (id: number) => {
      if (id === 1) times.green = timeline.time();
    },
    addGem: () => { times.blue = timeline.time(); return { scale: { set: () => {}, x: 1, y: 1 }, alpha: 1 }; },
  };
  const audio = { play: () => {}, playChain: () => { times.cascade = timeline.time(); } };
  const player = new EventStreamPlayer(board as never, { burst: () => {} } as never,
    {} as never, audio as never);
  player.onBattleEvent = event => {
    if (event.type === 'skill-damage' && event.devoured) times.devour = timeline.time();
  };
  void player.play(events);
  const timeline = (player as unknown as { timeline: gsap.core.Timeline }).timeline;
  timeline.pause();
  try {
    for (let t = 0.01; t <= timeline.duration() + 0.01; t += 0.01)
      timeline.totalTime(Math.min(t, timeline.duration()), false);
    expect(times.green).toBeGreaterThanOrEqual(0);
    expect(times.blue).toBeGreaterThanOrEqual(times.green);
    expect(times.devour).toBeGreaterThan(times.blue);
    expect(times.cascade).toBeGreaterThan(times.devour);
  } finally {
    player.cancel();
  }
});


