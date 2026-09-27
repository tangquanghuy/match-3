import { describe, expect, it } from 'vitest';
import type { GameEvent, BuffEvent, SkillDamageEvent } from '@engine/events';
import { BaseColor, PlayerSide, colorGem } from '@engine/types';
import { EventStreamPlayer } from '@render/EventStreamPlayer';
import { AnimConfig } from '@render/AnimationConfig';
import { computeBuffPlaybackBatches, computeDefeatPlaybackBatches, computeEliminationWaves, computeSplashPlaybackSlots } from '@render/presentationBatches';
import { computeManaSources } from '@render/manaPlayback';
import type { ImpactPresentation } from '@render/impactPlayback';
import { planPresentation } from '../helpers/presentationBudget';

const match = (gemId: number, chainCount = 1, color = BaseColor.Red): Extract<GameEvent, { type: 'elimination' }> => ({
  type: 'elimination', chainCount, shape: 'line3', cells: [{ gemId, pos: { row: 7, col: gemId % 8 }, gemType: colorGem(color) }],
});
const buff = (targetId: number, stat: BuffEvent['stat'] = 'armor', amount = 5): BuffEvent => ({ type: 'buff', targetId, stat, amount });
const mana = (color = BaseColor.Red, amount = 1): GameEvent => ({ type: 'mana-gain', characterId: 0, player: PlayerSide.Left, color, amount });
const hit = (targetId = 4): SkillDamageEvent => ({ type: 'skill-damage', casterId: 0, targetId, range: 'single', damage: 10, resultingHp: 90, resultingArmor: 0 });
const marker = (gemId: number): GameEvent => ({ type: 'special-gem-trigger', kind: 'lightningRow', gemId, pos: { row: 7, col: gemId % 8 }, line: 7 } as GameEvent);
function playback(events: GameEvent[]) {
  const log: { event: GameEvent; presentation?: ImpactPresentation; time: number }[] = [];
  const clears: number[] = [];
  const board = { cellSize: 88, gridPixels: 704, cellCenter: () => ({ x: 44, y: 44 }), getSprite: () => undefined,
    removeGem: (id: number) => clears.push(id) };
  const player = new EventStreamPlayer(board as never, { burst: () => {} } as never, {} as never,
    { play: () => {}, playChain: () => {} } as never);
  player.setPaused(true);
  let timeline: gsap.core.Timeline;
  player.onBattleEvent = (event, presentation) => log.push({ event, presentation, time: timeline.time() });
  void player.play(events);
  timeline = (player as unknown as { timeline: gsap.core.Timeline }).timeline;
  return { player, timeline, log, clears };
}

describe('six remaining presentation optimizations', () => {
  it('starts all same-wave match groups together, clears every original gem and retains mana sources', () => {
    const events = [match(1), mana(), buff(0, 'attack'), match(2)];
    expect([...computeEliminationWaves(events).values()]).toEqual([0, 0]);
    expect(planPresentation(events).timelineMs).toBeCloseTo(planPresentation(events.slice(0, 3)).timelineMs, 4);
    const { player, clears, log } = playback(events);
    try { player.skip(); expect(clears).toEqual([1, 2]); expect(log.map(row => row.event)).toEqual([events[2], events[1]]); }
    finally { player.cancel(); }
    const sources = computeManaSources([match(1), match(2, 1, BaseColor.Blue), mana(), mana(BaseColor.Blue)]);
    expect(sources.get(2)?.map(origin => origin.gemId)).toEqual([1]);
    expect(sources.get(3)?.map(origin => origin.gemId)).toEqual([2]);
  });

  it('does not merge cascade levels, repeated gems or board/lifecycle mutations', () => {
    expect([...computeEliminationWaves([match(1), match(2, 2)]).values()]).toEqual([0, 1]);
    expect([...computeEliminationWaves([match(1), match(1)]).values()]).toEqual([0, 1]);
    for (const type of ['gravity', 'refill', 'gem-transform', 'gem-create', 'gem-explode', 'defeat', 'summon', 'skill-cast']) {
      expect([...computeEliminationWaves([match(1), { type } as GameEvent, match(2)]).values()]).toEqual([0, 2]);
    }
  });

  it('co-schedules all trigger markers with their clear and still waits for finite feedback', () => {
    const clear: GameEvent = { type: 'gem-explode', cells: match(1).cells };
    const events = [marker(1), clear, marker(2), { ...clear, cells: match(2).cells }];
    const { player, timeline, log, clears } = playback(events);
    try {
      timeline.totalTime(.001, false);
      expect(log.filter(row => row.event.type === 'special-gem-trigger').map(row => row.event)).toEqual([events[0], events[2]]);
      expect(planPresentation(events).timelineMs).toBeCloseTo(Math.max(520, planPresentation([clear]).timelineMs), 4);
      player.skip(); expect(clears).toEqual([1, 2]);
      expect(log.filter(row => row.event.type === 'special-gem-trigger')).toHaveLength(2);
    } finally { player.cancel(); }
  });

  it('merges repeated attribute numbers but preserves original dispatch, gains/losses and trait channel', () => {
    const events = [buff(0), buff(0), buff(0, 'attack'), buff(0, 'armor', -3), { ...buff(0), source: 'trait' as const }, buff(1, 'hp')];
    const batch = computeBuffPlaybackBatches(events).leaders.get(0)!;
    expect(batch.events.filter(row => row.feedback.show).map(row => row.event.targetId)).toEqual([0, 1]);
    expect(batch.events[0].feedback.text?.split('\n').map(line => line.match(/[+-]\d+$/)?.[0])).toEqual(['+10', '+5', '-3', '+5']);
    expect(batch.events.filter(row => row.feedback.heavyFx).map(row => row.event.targetId)).toEqual([0, 1]);
    const { player, timeline, log } = playback(events);
    try {
      timeline.totalTime(.001, false);
      expect(log.map(row => row.event)).toEqual(events);
      player.skip(); expect(log).toHaveLength(events.length);
    } finally { player.cancel(); }
    const negative = computeBuffPlaybackBatches([buff(0, 'hp', -5)]).leaders.get(0)!;
    expect(negative.events[0].feedback.heavyFx).toBeUndefined();
  });

  it('retains one-second-plus repeated growth and never batches across actual damage', () => {
    const growth = [buff(0), buff(0, 'attack'), buff(0), buff(0, 'attack'), buff(0), buff(0), buff(0, 'attack')];
    expect(planPresentation(growth).timelineMs).toBe(1250);
    const merged = computeBuffPlaybackBatches(growth).leaders.get(0)!;
    expect(merged.events[0].feedback.durationMs).toBe(1250);
    expect(merged.events.find(row => row.feedback.heavyFx)?.feedback.durationMs).toBe(1250);
    expect(merged.events.filter(row => row.feedback.show)).toHaveLength(1);
    expect(computeBuffPlaybackBatches([buff(0), hit(), buff(0)]).leaders.size).toBe(2);
    const four = [4, 5, 6, 7].map(id => buff(id, 'hp'));
    const batch = computeBuffPlaybackBatches(four).leaders.get(0)!;
    expect(batch.events.filter(row => row.feedback.playAudio)).toHaveLength(1);
    expect(batch.events.filter(row => row.feedback.heavyFx)).toHaveLength(4);
    expect(planPresentation(four).timelineMs).toBe(planPresentation(four.slice(0, 1)).timelineMs);
  });

  it('plays four deaths in one envelope, exactly once, before queued replacement', () => {
    const deaths: GameEvent[] = [4, 5, 6, 7].map(characterId => ({ type: 'defeat', characterId }));
    const next: GameEvent = { type: 'summon', destination: 'queue' } as GameEvent;
    expect(planPresentation(deaths).timelineMs).toBe(planPresentation(deaths.slice(0, 1)).timelineMs);
    const { player, timeline, log } = playback([...deaths, next]);
    try {
      timeline.totalTime(.001, false);
      expect(log.map(row => row.event)).toEqual(deaths);
      expect(new Set(log.map(row => row.presentation?.defeatBatch)).size).toBe(1);
      expect(log[0].presentation?.defeatBatch?.characterIds).toEqual([4, 5, 6, 7]);
      player.skip(); expect(log.map(row => row.event)).toEqual([...deaths, next]);
    } finally { player.cancel(); }
    expect(computeDefeatPlaybackBatches([deaths[0], next, deaths[1]]).leaders.size).toBe(2);
  });

  it('keeps two splash waves separate and collateral impacts 60ms apart, after primary', () => {
    const wave = [4, 5, 6, 7].map((targetId, chainIndex) => ({ ...hit(targetId), range: 'splash' as const, chainIndex }));
    const slots = computeSplashPlaybackSlots([...wave, ...wave]);
    expect(slots.get(3)?.leader).toBe(0); expect(slots.get(4)?.leader).toBe(4);
    for (let i = 1; i < wave.length; i++) {
      const impactMs = slots.get(i)!.offset * 1000 + AnimConfig.splashChain.shortSwordDuration;
      expect(impactMs).toBeCloseTo(AnimConfig.splashChain.firstImpactDelay + i * 60, 4);
    }
    const { player, timeline, log } = playback(wave);
    try {
      timeline.totalTime(.38, false); expect(log).toHaveLength(1);
      timeline.totalTime(.395, false); expect(log).toHaveLength(2);
      expect(log[1].presentation?.splashSwordDurationMs).toBe(100);
      player.skip(); expect(log.map(row => row.event)).toEqual(wave);
    } finally { player.cancel(); }
  });

  it('overlaps different-length mana flights while committing every gain in engine order', () => {
    const red = match(1);
    red.cells = [1, 2, 3, 4, 5, 6, 7, 8].map(gemId => match(gemId).cells[0]);
    const first = mana(BaseColor.Red, 8);
    const second = mana(BaseColor.Blue);
    const events = [red, first, match(9, 1, BaseColor.Blue), marker(9), second];
    const { player, log } = playback(events);
    try {
      player.skip();
      expect(log.filter(row => row.event.type === 'mana-gain').map(row => row.event)).toEqual([first, second]);
      expect(log.filter(row => row.event.type === 'mana-gain').map(row => row.time)[0])
        .toBeLessThanOrEqual(log.filter(row => row.event.type === 'mana-gain').map(row => row.time)[1]);
      expect(planPresentation(events).timelineMs).toBeCloseTo(planPresentation(events.slice(0, 2)).timelineMs, 4);
    } finally { player.cancel(); }
  });

  it('cancels pending grouped callbacks without dispatching hidden members later', () => {
    const { player, timeline, log } = playback([hit(), buff(4), buff(4), { type: 'defeat', characterId: 4 }]);
    timeline.totalTime(.001, false); player.cancel();
    expect(log.map(row => row.event.type)).toEqual(['skill-damage']);
  });
});
