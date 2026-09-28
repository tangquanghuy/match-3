import { describe, expect, it } from 'vitest';
import type { GameEvent } from '@engine/events';
import { EventStreamPlayer } from '@render/EventStreamPlayer';
import { AnimConfig } from '@render/AnimationConfig';

// 连续骷髅攻击打死队首后：下一次冲撞必须等阵亡演出（粒子 + 退场）结束，
// 否则冲撞对着原位消散中的死卡，看起来像「鞭尸」。
describe('skull attack after a defeat', () => {
  it('the next skull lunge waits for the defeated card to leave', () => {
    const skull = { kind: 'skull' as const };
    const cells = (ids: number[]) => ids.map((gemId, col) => ({ gemId, pos: { row: 7, col }, gemType: skull }));
    const events = [
      { type: 'elimination', chainCount: 1, shape: 'line3', cells: cells([1, 2, 3]) },
      { type: 'skull-damage', attackerId: 0, targetId: 10, damage: 30, resultingHp: 0, resultingArmor: 0 },
      { type: 'defeat', characterId: 10 },
      { type: 'gravity', chainCount: 1, moves: [] },
      { type: 'refill', chainCount: 1, spawns: [] },
      { type: 'elimination', chainCount: 2, shape: 'line3', cells: cells([4, 5, 6]) },
      { type: 'skull-damage', attackerId: 0, targetId: 11, damage: 30, resultingHp: 20, resultingArmor: 0 },
    ] as GameEvent[];
    const noop = new Proxy({}, { get: () => () => {} });
    const board = { cellSize: 88, gridPixels: 704, cellCenter: () => ({ x: 44, y: 44 }),
      getSprite: () => undefined, removeGem: () => {} };
    const player = new EventStreamPlayer(board as never, noop as never, {} as never, noop as never);
    const log: { event: GameEvent; time: number }[] = [];
    let timeline: gsap.core.Timeline;
    player.onBattleEvent = (event) => log.push({ event, time: timeline.time() });
    void player.play(events);
    timeline = (player as unknown as { timeline: gsap.core.Timeline }).timeline;
    timeline.pause();
    try {
      for (let t = 0; t <= timeline.duration() + 0.01; t += 0.01) timeline.totalTime(t, false);
      const defeatAt = log.find(row => row.event.type === 'defeat')!.time;
      const secondHit = log.filter(row => row.event.type === 'skull-damage')[1].time;
      const deathSeconds = (AnimConfig.frameFX.death_drift.duration + 40 + AnimConfig.defeat.cardExitDuration) / 1000;
      expect(secondHit).toBeGreaterThanOrEqual(defeatAt + deathSeconds - 1e-6);
      // 死亡演出本身已提速：不超过 0.75s
      expect(deathSeconds).toBeLessThanOrEqual(0.75);
    } finally { player.cancel(); }
  });
});
