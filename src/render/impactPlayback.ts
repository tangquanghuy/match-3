import type { GameEvent } from '@engine/events';
import type { ClearEventBatches } from './clearEventBatches';

/** Spatially independent board/card lanes share a region; lifecycle events are
 * barriers. Board operations remain ordered by the player's board lane. */
export function isBoardPlaybackEvent(event: GameEvent): boolean {
  return ['elimination', 'gem-explode', 'gem-destroy', 'gem-create', 'gem-transform',
    'gravity', 'refill'].includes(event.type);
}
export function isCardPlaybackEvent(event: GameEvent): boolean {
  return ['skill-damage', 'skull-damage', 'buff', 'status-apply', 'status-tick',
    'status-expire', 'status-cleanse', 'status-blocked'].includes(event.type);
}
export function computeImpactWindows(events: GameEvent[], _clear: ClearEventBatches): Map<number, number> {
  const windows = new Map<number, number>();
  let leader: number | undefined;
  for (let i = 0; i < events.length; i++) {
    const event = events[i];
    if (!isBoardPlaybackEvent(event) && !isCardPlaybackEvent(event) && event.type !== 'mana-gain' && event.type !== 'special-gem-trigger') {
      leader = undefined; continue;
    }
    leader ??= i;
    windows.set(i, leader);
  }
  return windows;
}

export interface ImpactPresentation {
  explosionClock?: import('./FramePlaybackClock').FramePlaybackClock;
  projectileDurationMs?: number;
  splashSwordDurationMs?: number;
  buffFeedback?: import('./presentationBatches').BuffFeedback;
  defeatBatch?: import('./presentationBatches').DefeatPlaybackBatch;
  statusFeedback?: import('./statusPlayback').StatusFeedback;
}

/** Independent single hits retain their own colored hit FX but arrive together. */
export function computeSynchronizedSingles(events: GameEvent[]): Set<number> {
  const result = new Set<number>();
  for (let i = 0; i < events.length;) {
    const first = events[i];
    if (first.type !== 'skill-damage' || first.range !== 'single' || first.skullBurst) { i++; continue; }
    const targets = new Set<number>();
    let j = i;
    while (j < events.length) {
      const hit = events[j];
      if (hit.type !== 'skill-damage' || hit.range !== 'single' || hit.skullBurst
        || hit.casterId !== first.casterId || targets.has(hit.targetId)) break;
      targets.add(hit.targetId); j++;
    }
    if (j - i > 1) for (let k = i; k < j; k++) result.add(k);
    i = j;
  }
  return result;
}
