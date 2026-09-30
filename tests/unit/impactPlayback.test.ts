import { describe, expect, it } from 'vitest';
import ironhawkOpening from '../fixtures/ironhawk-opening-events.json';
import type { GameEvent, SkillDamageEvent } from '@engine/events';
import { BaseColor, PlayerSide, colorGem } from '@engine/types';
import { EventStreamPlayer } from '@render/EventStreamPlayer';
import { AnimConfig } from '@render/AnimationConfig';
import { computeClearEventBatches } from '@render/clearEventBatches';
import { computeImpactWindows } from '@render/impactPlayback';
import { planPresentation } from '../helpers/presentationBudget';

const damage = (targetId: number, hp = 90): SkillDamageEvent => ({
  type: 'skill-damage', casterId: 0, targetId, range: 'single', damage: 10,
  resultingHp: hp, resultingArmor: 0,
});
const clear: GameEvent = { type: 'gem-explode', cells: [{ gemId: 1,
  pos: { row: 0, col: 0 }, gemType: colorGem(BaseColor.Red) }] };
const mana: GameEvent = { type: 'mana-gain', color: BaseColor.Red,
  amount: 1, characterId: 0, player: PlayerSide.Left };
function playback(events: GameEvent[]) {
  const log: { event: GameEvent; time: number; projectileDurationMs?: number }[] = [];
  const board = { cellSize: 88, gridPixels: 704, cellCenter: () => ({ x: 44, y: 44 }),
    getSprite: () => undefined, removeGem: () => {} };
  const player = new EventStreamPlayer(board as never, { burst: () => {} } as never,
    {} as never, { play: () => {}, playChain: () => {} } as never);
  player.onBattleEvent = (event, presentation) => log.push({ event, time: timeline.time(), projectileDurationMs: presentation?.projectileDurationMs });
  player.onGroupAttack = events => { for (const event of events) log.push({ event, time: timeline.time() }); };
  void player.play(events);
  const timeline = (player as unknown as { timeline: gsap.core.Timeline }).timeline;
  timeline.pause();
  return { player, timeline, log };
}

describe('cascade skull attack timing', () => {
  it('第二轮连锁凑成的骷髅：冲撞不早于该轮骷髅消除开始（不与首轮紫色消除同时出手）', () => {
    const cells = (ids: number[], gemType: BaseColor | 'skull') =>
      ids.map((gemId, col) => ({ gemId, pos: { row: 7, col }, gemType: gemType === 'skull' ? { kind: 'skull' as const } : colorGem(gemType) }));
    const events: GameEvent[] = [
      { type: 'elimination', chainCount: 1, shape: 'line3', cells: cells([1, 2, 3], BaseColor.Purple) },
      { type: 'mana-gain', color: BaseColor.Purple, amount: 3, characterId: 0, player: PlayerSide.Left },
      { type: 'gravity', chainCount: 1, moves: [] },
      { type: 'refill', chainCount: 1, spawns: [] },
      { type: 'elimination', chainCount: 2, shape: 'line3', cells: cells([4, 5, 6], 'skull') },
      { type: 'skull-damage', attackerId: 0, targetId: 4, damage: 5, resultingHp: 10, resultingArmor: 0 },
    ] as GameEvent[];
    const noop = new Proxy({}, { get: () => () => {} });
    const board = { cellSize: 88, gridPixels: 704, cellCenter: () => ({ x: 44, y: 44 }),
      getSprite: () => undefined, removeGem: () => {} };
    const player = new EventStreamPlayer(board as never, noop as never, {} as never, noop as never);
    const log: { event: GameEvent; time: number }[] = [];
    player.onBattleEvent = (event) => log.push({ event, time: timeline.time() });
    void player.play(events);
    const timeline = (player as unknown as { timeline: gsap.core.Timeline }).timeline;
    timeline.pause();
    try {
      timeline.totalTime(timeline.duration(), false);
      const skullAt = log.find(row => row.event.type === 'skull-damage')!.time;
      const clearStarts = (player as unknown as { clearStartTimes: Map<number, number> }).clearStartTimes;
      expect(clearStarts.get(4)!).toBeGreaterThan(clearStarts.get(0)!);
      expect(skullAt).toBeGreaterThanOrEqual(clearStarts.get(4)! - 1e-6);
    } finally { player.cancel(); }
  });
});

describe('parallel independent impacts', () => {
  it('four single-target hits occupy one hit window, not four', () => {
    const hits = [4, 5, 6, 7].map(target => damage(target));
    expect(planPresentation(hits).timelineMs).toBeCloseTo(planPresentation(hits.slice(0, 1)).timelineMs, 4);
    const { player, timeline, log } = playback(hits);
    try {
      timeline.totalTime(.001, false);
      expect(log.map(row => row.event)).toEqual(hits);
      expect(new Set(log.map(row => row.time)).size).toBe(1);
      expect(log.map(row => row.projectileDurationMs)).toEqual(hits.map(() => AnimConfig.projectile.maxDuration));
      player.skip();
      expect(log.map(row => row.event)).toEqual(hits);
    } finally { player.cancel(); }
  });

  it.each([[damage(4), clear, mana], [clear, mana, damage(4)], [clear, damage(4), mana]])('overlaps board clear, mana and damage in either event order', (...events) => {
    const expected = Math.max(...events.map(event => planPresentation([event]).timelineMs),
      (AnimConfig.manaFlow.overlapDelay + AnimConfig.manaFlow.duration) * 1000);
    expect(planPresentation(events).timelineMs).toBeCloseTo(expected, 4);
    const { player, timeline, log } = playback(events);
    try {
      timeline.totalTime(.001, false);
      expect(log.filter(row => row.event.type === 'skill-damage')).toHaveLength(1);
      expect(log.filter(row => row.event.type === 'gem-explode')).toHaveLength(1);
      player.skip();
      expect(log.filter(row => row.event.type === 'mana-gain')).toHaveLength(1);
    } finally { player.cancel(); }
  });

  it('keeps repeated-target snapshots ordered while independent targets overlap', () => {
    const hits = [damage(4, 90), damage(5, 90), damage(4, 80)];
    const { player, timeline, log } = playback(hits);
    try {
      timeline.totalTime(.001, false);
      expect(log.map(row => row.event)).toEqual(hits.slice(0, 2));
      timeline.totalTime(timeline.duration(), false);
      expect(log.map(row => row.event)).toEqual(hits);
      expect(planPresentation(hits).timelineMs).toBeCloseTo(2 * planPresentation([hits[0]]).timelineMs, 4);
    } finally { player.cancel(); }
  });

  it('keeps primary impact first and staggers splash victims by just 60ms', () => {
    const hits = [4, 5, 6, 7].map((target, chainIndex) => ({ ...damage(target), range: 'splash' as const, chainIndex }));
    const expected = AnimConfig.splashChain.firstImpactDelay + 3 * AnimConfig.splashChain.victimStagger
      + AnimConfig.splashChain.impactFeedbackDuration;
    expect(planPresentation(hits).timelineMs).toBeCloseTo(expected, 4);
    expect(planPresentation([...hits, ...hits]).timelineMs).toBeCloseTo(2 * expected, 4);
  });

  it.each(['defeat', 'summon', 'reshuffle', 'skill-cast', 'turn-end'] as const)(
    'keeps %s as a boundary', type => {
      const events = [damage(4), { type } as GameEvent, damage(5)];
      const windows = computeImpactWindows(events, computeClearEventBatches(events));
      expect(windows.get(0)).not.toBe(windows.get(2));
      expect(windows.has(1)).toBe(false);
    });

  it('keeps board clears in the same region but serializes them on the board lane', () => {
    const events: GameEvent[] = [clear, mana, { type: 'elimination', chainCount: 2, shape: 'line3', cells: clear.cells }];
    const windows = computeImpactWindows(events, computeClearEventBatches(events));
    expect(windows.get(0)).toBe(windows.get(2));
    const one = planPresentation(events.slice(0, 2)).timelineMs;
    expect(planPresentation(events).timelineMs).toBeGreaterThan(one);
  });

  it('keeps a following lifecycle event after the whole concurrent envelope', () => {
    const next: GameEvent = { type: 'skill-cast', characterId: 0, skillId: 'next' };
    const { player, timeline, log } = playback([damage(4), clear, mana, next]);
    try {
      timeline.totalTime(.001, false);
      expect(log.some(row => row.event === next)).toBe(false);
      player.skip();
      expect(log.at(-1)?.event).toEqual(next);
    } finally { player.cancel(); }
  });

  it('cancels pending damage callbacks', () => {
    const { player, timeline, log } = playback([damage(4), damage(4, 80)]);
    timeline.totalTime(.001, false);
    player.cancel();
    expect(log).toHaveLength(1);
    expect(player.isPlaying()).toBe(false);
  });

  it('Ironhawk real event stream starts all four opening hits before the first hold', () => {
    const opening = ironhawkOpening as GameEvent[];
    const { player, timeline, log } = playback(opening);
    try {
      timeline.totalTime(.001, false);
      expect(log.filter(row => row.event.type === 'skill-damage').map(row => (row.event as SkillDamageEvent).targetId)).toEqual([4, 5, 6, 7]);
      player.skip();
      expect(log.filter(row => row.event.type === 'skill-damage')).toHaveLength(4);
    } finally { player.cancel(); }
  });
});
