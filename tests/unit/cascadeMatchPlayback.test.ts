import { describe, expect, it } from 'vitest';
import { EventStreamPlayer } from '@render/EventStreamPlayer';
import { BaseColor, PlayerSide, colorGem, skullGem, specialGem } from '@engine/types';
import type { GameEvent } from '@engine/events';
import type { CellPos } from '@engine/types';

function play(events: GameEvent[]) {
  const noop = new Proxy({}, { get: () => () => {} });
  const board = { cellSize: 64, gridPixels: 512, cellCenter: (pos: CellPos) => ({ x: pos.col * 64 + 32, y: pos.row * 64 + 32 }),
    getSprite: () => undefined, removeGem: () => {} };
  const player = new EventStreamPlayer(board as never, noop as never, {} as never, noop as never);
  const grants: { side: PlayerSide; time: number }[] = [];
  const bonuses: { pos: CellPos; bonus: number; time: number }[] = [];
  player.onMatchExtraTurn = side => grants.push({ side, time: timeline.time() });
  player.onSkullMatchBonus = (pos, bonus) => bonuses.push({ pos, bonus, time: timeline.time() });
  void player.play(events);
  const timeline = (player as unknown as { timeline: gsap.core.Timeline }).timeline;
  timeline.pause();
  return { player, timeline, grants, bonuses };
}
const first: GameEvent = { type: 'elimination', chainCount: 1, shape: 'line3',
  cells: [0, 1, 2].map(col => ({ pos: { row: 7, col }, gemId: col, gemType: colorGem(BaseColor.Red) })) };

describe('匹配当轮提示', () => {
  it('下落四连在第二轮消除就提示，不等待整段连锁结束', () => {
    const second: GameEvent = { type: 'elimination', chainCount: 2, shape: 'line4plus', extraTurnPlayer: PlayerSide.Left,
      cells: [0, 1, 2, 3].map(col => ({ pos: { row: 7, col }, gemId: col + 10, gemType: colorGem(BaseColor.Green) })) };
    const x = play([first, { type: 'gravity', chainCount: 1, moves: [] }, { type: 'refill', chainCount: 1, spawns: [] }, second,
      { type: 'gravity', chainCount: 2, moves: [] }, { type: 'refill', chainCount: 2, spawns: [] },
      { type: 'extra-turn', player: PlayerSide.Left, source: 'match' }]);
    try {
      x.timeline.totalTime(.001, false);
      expect(x.grants).toEqual([]);
      for (let time = .01; time < x.timeline.duration(); time += .01) x.timeline.totalTime(time, false);
      x.timeline.totalTime(x.timeline.duration(), false);
      expect(x.grants).toHaveLength(1);
      expect(x.grants[0].side).toBe(PlayerSide.Left);
      expect(x.grants[0].time).toBeLessThan(x.timeline.duration());
    } finally { x.player.cancel(); }
  });
  it('每颗被匹配的末日/至尊骷髅分别在自己的格子显示 +5/+10，普通骷髅和爆炸波及不显示', () => {
    const cells = [skullGem(), specialGem('doomSkull'), specialGem('uberDoomSkull'), specialGem('doomSkull')]
      .map((gemType, col) => ({ pos: { row: 4, col }, gemId: col + 20, gemType }));
    const x = play([{ type: 'elimination', chainCount: 1, shape: 'line4plus', cells },
      { type: 'gem-explode', cells: [{ pos: { row: 3, col: 2 }, gemId: 30, gemType: specialGem('doomSkull') }] }]);
    try {
      x.timeline.totalTime(x.timeline.duration(), false);
      expect(x.bonuses.map(({ pos, bonus }) => ({ pos, bonus }))).toEqual([
        { pos: { row: 4, col: 1 }, bonus: 5 }, { pos: { row: 4, col: 2 }, bonus: 10 }, { pos: { row: 4, col: 3 }, bonus: 5 },
      ]);
      expect(new Set(x.bonuses.map(b => b.time)).size).toBe(1);
      expect(x.grants).toEqual([]);
    } finally { x.player.cancel(); }
  });
});
