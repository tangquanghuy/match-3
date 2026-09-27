import { describe, expect, it } from 'vitest';
import type { GameEvent } from '@engine/events';
import { BaseColor, PlayerSide, colorGem } from '@engine/types';
import { AnimConfig } from '@render/AnimationConfig';
import { computeClearEventBatches } from '@render/clearEventBatches';
import { computeManaPlaybackBatches, computeManaSources, manaFlowDuration, manaMoteDelay } from '@render/manaPlayback';
import { EventStreamPlayer } from '@render/EventStreamPlayer';
import { planPresentation } from '../helpers/presentationBudget';

const cells = (colors: BaseColor[]) => colors.map((color, i) => ({
  gemId: i + 1, pos: { row: 0, col: i }, gemType: colorGem(color),
}));
const clear: GameEvent = { type: 'gem-explode', cells: cells([BaseColor.Red, BaseColor.Blue, BaseColor.Red, BaseColor.Green]) };
const gain = (color: BaseColor, characterId: number, amount = 1, surge = false): GameEvent => ({
  type: 'mana-gain', color, characterId, amount, surge, player: PlayerSide.Left,
});
const recipients = [gain(BaseColor.Red, 0, 2), gain(BaseColor.Blue, 1), gain(BaseColor.Green, 2)];

function playback(events: GameEvent[]) {
  const log: { type: string; time: number; event?: GameEvent; origins?: { x: number; y: number }[] }[] = [];
  const board = { cellSize: 88, gridPixels: 704,
    cellCenter: (pos: { row: number; col: number }) => ({ x: (pos.col + .5) * 88, y: (pos.row + .5) * 88 }),
    getSprite: () => undefined,
    removeGem: () => log.push({ type: 'remove', time: timeline.time() }),
  };
  const player = new EventStreamPlayer(
    board as unknown as ConstructorParameters<typeof EventStreamPlayer>[0],
    { burst: () => {} } as unknown as ConstructorParameters<typeof EventStreamPlayer>[1],
    {} as ConstructorParameters<typeof EventStreamPlayer>[2],
    { play: () => {}, playChain: () => {} } as unknown as ConstructorParameters<typeof EventStreamPlayer>[3],
  );
  let timeline: gsap.core.Timeline;
  player.onBattleEvent = event => log.push({ type: event.type, time: timeline.time(), event });
  player.onManaFlow = (event, origins) => log.push({ type: 'flow', time: timeline.time(), event, origins });
  void player.play(events);
  timeline = (player as unknown as { timeline: gsap.core.Timeline }).timeline;
  timeline.pause();
  return { player, timeline, log };
}

describe('parallel clear / mana playback', () => {
  it('uses max(clear, mana) rather than adding the clear and every recipient flight', () => {
    const onlyClear = planPresentation([clear]).timelineMs;
    const concurrent = planPresentation([clear, ...recipients]);
    expect(concurrent.timelineMs).toBeCloseTo(Math.max(onlyClear,
      (AnimConfig.manaFlow.overlapDelay + manaFlowDuration(2)) * 1000), 4);
    expect(concurrent.timelineMs).toBeLessThan(onlyClear + 3 * AnimConfig.manaFlow.duration * 1000);
    expect(Object.values(concurrent.stageMs).reduce((sum, ms) => sum + ms, 0)).toBeCloseTo(concurrent.timelineMs, 4);
  });

  it('starts all recipient flows during the explosion, commits once in order, and keeps later events behind the window', () => {
    const after: GameEvent = { type: 'skill-cast', characterId: 0, skillId: 'after' };
    const { player, timeline, log } = playback([clear, ...recipients, after]);
    try {
      timeline.totalTime(AnimConfig.manaFlow.overlapDelay + .001, false);
      expect(log.filter(e => e.type === 'flow').map(e => e.event)).toEqual(recipients);
      expect(log.some(e => e.type === 'remove')).toBe(false);
      expect(log.some(e => e.type === 'mana-gain')).toBe(false);
      expect(log.some(e => e.type === 'skill-cast')).toBe(false);
      timeline.totalTime(timeline.duration(), false);
      expect(log.filter(e => e.type === 'mana-gain').map(e => e.event)).toEqual(recipients);
      expect(log.filter(e => e.type === 'remove')).toHaveLength(4);
      expect(log.findIndex(e => e.type === 'skill-cast')).toBeGreaterThan(log.map(e => e.type).lastIndexOf('mana-gain'));
      expect(log.filter(e => e.type === 'flow').map(e => e.origins?.length)).toEqual([2, 1, 1]);
    } finally { player.cancel(); }
  });

  it.each(['gravity', 'refill', 'defeat', 'gem-transform', 'gem-create'] as const)('does not overlap across a %s barrier', type => {
    const barrier = { type } as GameEvent;
    const events = [clear, barrier, ...recipients];
    const batches = computeManaPlaybackBatches(events, computeClearEventBatches(events));
    expect(batches.leaders.get(2)?.clearIndex).toBeUndefined();
    expect(batches.leaders.get(2)?.events).toHaveLength(3);
  });

  it('keeps board clears ordered with cascade anticipation, without waiting for mana', () => {
    const match: GameEvent = { type: 'elimination', chainCount: 2, shape: 'line3', cells: (clear as Extract<GameEvent, { type: 'gem-explode' }>).cells };
    const one = planPresentation([clear, ...recipients]).timelineMs;
    const matchWindow = planPresentation([match, ...recipients]).timelineMs;
    expect(matchWindow).toBeCloseTo(one + AnimConfig.chainGap * 1000, 4);
    const boardClearMs = planPresentation([clear]).timelineMs;
    const total = planPresentation([clear, ...recipients, match, ...recipients]).timelineMs;
    expect(total).toBeCloseTo(boardClearMs + matchWindow, 4);
    expect(total).toBeLessThan(one + matchWindow);
  });

  it('merges origins across special-gem clear batches and selects the actual mana color', () => {
    const first: GameEvent = { type: 'gem-explode', cells: cells([BaseColor.Red, BaseColor.Blue]) };
    const second: GameEvent = { type: 'gem-explode', cells: [{ gemId: 3, pos: { row: 1, col: 0 }, gemType: colorGem(BaseColor.Red) }] };
    const trigger: GameEvent = { type: 'special-gem-trigger', kind: 'bomb', pos: { row: 1, col: 0 } };
    const events = [first, trigger, second, gain(BaseColor.Blue, 1), gain(BaseColor.Red, 0, 2)];
    const batches = computeClearEventBatches(events);
    const origins = computeManaSources(events, batches);
    expect(origins.get(3)?.map(o => o.gemId)).toEqual([2]);
    expect(origins.get(4)?.map(o => o.gemId)).toEqual([1, 3]);
    expect(computeManaPlaybackBatches(events, batches).leaders.get(3)?.clearIndex).toBe(0);
  });

  it('does not reuse a physical source for multiple recipients or across refill', () => {
    const events = [clear, gain(BaseColor.Red, 0), gain(BaseColor.Red, 1), gain(BaseColor.Red, 2),
      { type: 'refill', chainCount: 1, spawns: [] } as GameEvent, gain(BaseColor.Blue, 1)];
    const origins = computeManaSources(events);
    expect(origins.get(1)?.map(o => o.gemId)).toEqual([1]);
    expect(origins.get(2)?.map(o => o.gemId)).toEqual([3]);
    expect(origins.get(3)).toEqual([]);
    expect(origins.get(5)).toEqual([]);
  });

  it('allocates surge sources as physical gems, while reserving both motes and bounded launch spread', () => {
    const events = [clear, gain(BaseColor.Red, 0, 4, true)];
    expect(computeManaSources(events).get(1)).toHaveLength(2);
    expect(manaFlowDuration(2, true)).toBeCloseTo(AnimConfig.manaFlow.duration + 3 * AnimConfig.manaFlow.stagger + AnimConfig.manaFlow.surgeHold);
    expect(manaMoteDelay(127, 128)).toBeCloseTo(AnimConfig.manaFlow.maxStagger);
    expect(manaFlowDuration(64, true)).toBeCloseTo(AnimConfig.manaFlow.duration + AnimConfig.manaFlow.maxStagger + AnimConfig.manaFlow.surgeHold);
  });

  it('supports skip-to-end without dropped or duplicate mana commits', () => {
    const { player, timeline, log } = playback([clear, ...recipients]);
    try {
      timeline.totalTime(.001, false);
      player.skip();
      expect(log.filter(e => e.type === 'mana-gain').map(e => e.event)).toEqual(recipients);
      expect(log.filter(e => e.type === 'remove')).toHaveLength(4);
      expect(player.isPlaying()).toBe(false);
    } finally { player.cancel(); }
  });

  it('cancel releases playback and prevents remaining mana callbacks', () => {
    const { player, log } = playback([clear, ...recipients]);
    player.cancel();
    expect(player.isPlaying()).toBe(false);
    expect(log.filter(e => e.type === 'mana-gain')).toHaveLength(0);
  });
});