import { describe, expect, it } from 'vitest';
import type { GameEvent } from '@engine/events';
import { computeStatusPlaybackBatches, statusFeedbackFX, statusFeedbackLabel } from '@render/statusPlayback';
import { EventStreamPlayer } from '@render/EventStreamPlayer';
import { planPresentation } from '../helpers/presentationBudget';
const apply = (targetId: number, statusId = 'poison'): GameEvent => ({ type: 'status-apply', targetId, statusId, turns: 3 });
const tick = (targetId: number, statusId = 'poison', damage = 1): GameEvent => ({ type: 'status-tick', targetId, statusId, damage });

function dispatch(events: GameEvent[], time = .001) {
  const received: { event: GameEvent; feedback?: unknown }[] = [];
  const player = new EventStreamPlayer({ cellSize: 88, cellCenter: () => ({ x: 0, y: 0 }), getSprite: () => undefined } as never,
    { burst: () => {} } as never, {} as never, { play: () => {} } as never);
  player.onBattleEvent = (event, presentation) => received.push({ event, feedback: presentation?.statusFeedback });
  void player.play(events);
  const tl = (player as unknown as { timeline: gsap.core.Timeline }).timeline;
  tl.pause(); tl.totalTime(time, false);
  return { player, received, tl };
}

describe('batched status presentation without mechanism event loss', () => {
  it('applies four-target states in one .32s window with one audio cue', () => {
    const events = [4, 5, 6, 7].map(id => apply(id));
    const batch = computeStatusPlaybackBatches(events).leaders.get(0)!;
    expect(batch.targetIds).toEqual([4, 5, 6, 7]);
    expect(batch.events.filter(row => row.feedback?.playAudio)).toHaveLength(1);
    expect(planPresentation(events).timelineMs).toBeCloseTo(320);
    const { player, received } = dispatch(events);
    try { expect(received.map(row => row.event)).toEqual(events); } finally { player.cancel(); }
  });
  it('merges multiple states on one target, preserving original per-state dispatch', () => {
    const events = ['poison', 'burning', 'stun', 'silence', 'entangle'].map(id => apply(4, id));
    const batch = computeStatusPlaybackBatches(events).leaders.get(0)!;
    expect(batch.events.filter(row => row.feedback?.show)).toHaveLength(1);
    expect(batch.events[0].feedback?.statusIds).toEqual(['poison', 'burning', 'stun', 'silence', 'entangle']);
    expect(statusFeedbackFX(batch.events[0].feedback!.statusIds)).toBe('burning_flash');
    const { player, received } = dispatch(events);
    try { expect(received.map(row => row.event)).toEqual(events); } finally { player.cancel(); }
  });
  it('shortens overcrowded combined state feedback without dropping any state badges', () => {
    const label = (id: string) => ({ poison: '中毒', burning: '燃烧', stun: '眩晕' })[id as 'poison' | 'burning' | 'stun'];
    expect(statusFeedbackLabel(['poison', 'burning'], label)).toBe('中毒 / 燃烧');
    expect(statusFeedbackLabel(['poison', 'burning', 'stun'], label)).toBe('中毒等3种状态');
  });
  it('merges DOT damage per target and never emits DOT audio', () => {
    const events = [4, 5, 6, 7].flatMap(id => [tick(id), tick(id, 'burning', 3), tick(id, 'bleed', 5)]);
    const batch = computeStatusPlaybackBatches(events).leaders.get(0)!;
    expect(batch.events.filter(row => row.feedback?.show)).toHaveLength(4);
    expect(batch.events.filter(row => row.feedback?.show).map(row => row.feedback?.damage)).toEqual([9, 9, 9, 9]);
    expect(batch.events.some(row => row.feedback?.playAudio)).toBe(false);
    expect(planPresentation(events).timelineMs).toBeCloseTo(320);
  });
  it('retains expiration order between DOTs without another heavyweight wait', () => {
    const events: GameEvent[] = [tick(4), { type: 'status-expire', targetId: 4, statusId: 'poison' }, tick(4, 'burning', 3), tick(5)];
    const { player, received } = dispatch(events);
    try {
      expect(received.map(row => row.event)).toEqual(events);
      expect(computeStatusPlaybackBatches(events).leaders.get(0)?.events[0].feedback?.damage).toBe(4);
    } finally { player.cancel(); }
  });
  it.each(['defeat', 'summon', 'status-cleanse', 'skill-damage', 'buff', 'skill-cast'] as const)(
    'never merges status batches across %s', type => {
      const events = [tick(4), { type } as GameEvent, tick(4, 'burning', 3)];
      const batches = computeStatusPlaybackBatches(events);
      expect([...batches.leaders.keys()]).toEqual([0, 2]);
      expect(batches.leaders.get(0)?.events[0].feedback?.damage).toBe(1);
    });
  it('keeps same-target apply after the preceding single damage', () => {
    const damage: GameEvent = { type: 'skill-damage', casterId: 0, targetId: 4, range: 'single', damage: 10, resultingHp: 90, resultingArmor: 0 };
    const events = [damage, apply(4), apply(5)];
    const { player, received, tl } = dispatch(events);
    try {
      expect(received.map(row => row.event)).toEqual([damage]);
      tl.totalTime(tl.duration(), false);
      expect(received.map(row => row.event)).toEqual(events);
      expect(planPresentation(events).timelineMs).toBeCloseTo(planPresentation([damage]).timelineMs + 320);
    } finally { player.cancel(); }
  });
  it('does not turn zero-damage ticks into damage or large flashes', () => {
    const batch = computeStatusPlaybackBatches([tick(4, 'burning', 0), tick(4, 'poison', -1)]).leaders.get(0)!;
    expect(batch.duration).toBe(.12);
    expect(batch.events[0].feedback?.damage).toBe(0);
  });
  it('cancellation releases playback and no late state application dispatches', async () => {
    const events: GameEvent[] = [{ type: 'skill-cast', characterId: 0, skillId: 'fixture' }, apply(4)];
    const player = new EventStreamPlayer({} as never, {} as never, {} as never, {} as never);
    const received: GameEvent[] = [];
    player.onBattleEvent = event => received.push(event);
    const done = player.play(events); player.cancel(); await done;
    expect(received).toEqual([]);
  });
});
