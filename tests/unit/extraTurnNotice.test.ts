import { afterEach, describe, expect, it, vi } from 'vitest';
import { ExtraTurnNotice } from '@render/ExtraTurnNotice';
import { FiniteVisuals } from '@render/FiniteVisuals';
import { AnimConfig } from '@render/AnimationConfig';
import { PlayerSide } from '@engine/types';
import type { GameEvent } from '@engine/events';
import { EventStreamPlayer } from '@render/EventStreamPlayer';
import { planPresentation } from '../helpers/presentationBudget';

function fixture(reduced = false, waapi = true) {
  vi.useFakeTimers();
  const nodes: ReturnType<typeof createNode>[] = [];
  const children = new Set<unknown>();
  function createNode() {
        const animation = { onfinish: null as null | (() => void), oncancel: null as null | (() => void), cancel: vi.fn() };
        const node = { className: '', dataset: {} as Record<string, string>, style: { cssText: '' }, textContent: '',
          setAttribute: vi.fn(), remove: vi.fn(() => children.delete(node)), animation,
          animate: waapi ? vi.fn((_frames: Keyframe[], _options: KeyframeAnimationOptions) => animation) : undefined };
        return node;
      }
  const host = {
    ownerDocument: {
      defaultView: { matchMedia: () => ({ matches: reduced }) },
      createElement: () => { const node = createNode(); nodes.push(node); return node; },
    },
    appendChild: (node: unknown) => children.add(node),
  } as unknown as HTMLElement;
  const visuals = new FiniteVisuals();
  const notice = new ExtraTurnNotice(visuals);
  return { host, nodes, children, visuals, notice };
}
afterEach(() => vi.useRealTimers());

describe('lightweight extra turn notice', () => {
  it.each([PlayerSide.Left, PlayerSide.Right])('labels %s without covering input or loading a strip', side => {
    const x = fixture(); x.notice.show(x.host, side);
    const el = x.nodes[0];
    expect(el.dataset.side).toBe(side);
    expect(el.textContent).toBe(side === PlayerSide.Left ? '我方额外回合' : '敌方额外回合');
    expect(el.style.cssText).toContain('pointer-events:none');
    expect(el.style.cssText).not.toMatch(/url\(|filter:|box-shadow:/);
    expect(el.setAttribute).toHaveBeenCalledWith('role', 'status');
    expect(el.animate!.mock.calls[0][1].duration).toBe(720);
    x.visuals.cancel();
  });
  it('coalesces repeated grants per action without queueing or restarting the lifetime', () => {
    const x = fixture(); x.notice.beginAction();
    for (let i = 0; i < 8; i++) x.notice.show(x.host, PlayerSide.Left);
    expect(x.nodes).toHaveLength(1); expect(x.visuals.size).toBe(1);
    x.nodes[0].animation.onfinish!();
    x.notice.show(x.host, PlayerSide.Left);
    expect(x.nodes).toHaveLength(1);
    x.notice.beginAction(); x.notice.show(x.host, PlayerSide.Left);
    expect(x.nodes).toHaveLength(2); expect(x.children.size).toBe(1);
    x.visuals.cancel();
  });
  it('includes its finite tail in action completion and removes itself on finish', async () => {
    const x = fixture(); x.notice.show(x.host, PlayerSide.Left);
    const done = vi.fn(); const pending = x.visuals.waitForIdle().then(done);
    await Promise.resolve(); expect(done).not.toHaveBeenCalled();
    x.nodes[0].animation.onfinish!(); await pending;
    expect(done).toHaveBeenCalledTimes(1); expect(x.children.size).toBe(0);
    expect(x.visuals.size).toBe(0); expect(vi.getTimerCount()).toBe(0);
  });
  it('replaces the opposite side without stale cleanup touching the current notice', () => {
    const x = fixture(); x.notice.show(x.host, PlayerSide.Left);
    const oldFinish = x.nodes[0].animation.onfinish;
    x.notice.show(x.host, PlayerSide.Right); oldFinish!();
    expect(x.children.size).toBe(1); expect(x.visuals.size).toBe(1);
    expect(x.nodes[1].dataset.side).toBe(PlayerSide.Right);
    x.visuals.cancel();
    expect(x.children.size).toBe(0); expect(vi.getTimerCount()).toBe(0);
  });
  it('has a timer fallback and respects reduced motion', () => {
    const x = fixture(true); x.notice.show(x.host, PlayerSide.Left);
    const frames = x.nodes[0].animate!.mock.calls[0][0];
    expect(new Set(frames.map((frame: Keyframe) => frame.transform)).size).toBe(1);
    vi.advanceTimersByTime(AnimConfig.extraTurnNotice.durationMs + 50);
    expect(x.visuals.size).toBe(0); expect(x.children.size).toBe(0);
    const y = fixture(false, false); y.notice.show(y.host, PlayerSide.Right);
    vi.advanceTimersByTime(AnimConfig.extraTurnNotice.durationMs + 50);
    expect(y.visuals.size).toBe(0); expect(y.children.size).toBe(0);
  });
});

describe('extra-turn event playback', () => {
  it.each(['skill', 'match'] as const)('%s grant adds no serial hold or combo pulse and retains event/narration dispatch', async source => {
    const grant: GameEvent = { type: 'extra-turn', source, player: PlayerSide.Left };
    const buff: GameEvent = { type: 'buff', targetId: 0, stat: 'attack', amount: 1 };
    expect(planPresentation([grant, buff]).timelineMs).toBe(planPresentation([buff]).timelineMs);
    const audio = { play: vi.fn(), playChain: vi.fn() };
    const player = new EventStreamPlayer({} as never, {} as never, {} as never, audio as never);
    const notify = vi.fn(), pulse = vi.fn(), narrate = vi.fn();
    player.setPaused(true); player.onBattleEvent = notify; player.onComboPulse = pulse;
    player.onNarrationBatch = () => ({ eventIndex: 0, play: narrate }) as never;
    const pending = player.play([grant]);
    try {
      player.skip(); await pending;
      expect(notify).toHaveBeenCalledTimes(1); expect(notify).toHaveBeenCalledWith(grant);
      expect(narrate).toHaveBeenCalledTimes(1);
      expect(pulse).not.toHaveBeenCalled(); expect(audio.playChain).not.toHaveBeenCalled();
      expect(player.isPlaying()).toBe(false);
    } finally { player.cancel(); }
  });
});
