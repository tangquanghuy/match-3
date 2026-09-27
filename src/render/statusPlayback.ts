import type { GameEvent } from '@engine/events';

export type StatusEvent = Extract<GameEvent, { type: 'status-apply' | 'status-tick' | 'status-expire' }>;
export interface StatusFeedback {
  /** Original events still dispatch individually; only transient feedback is merged. */
  show: boolean;
  statusIds: string[];
  damage?: number;
  playAudio: boolean;
}
export interface StatusPlaybackBatch {
  events: { index: number; event: StatusEvent; feedback?: StatusFeedback }[];
  targetIds: number[];
  duration: number;
}

/** Never cross damage, cleanse, death or another mechanism event. Expirations
 * within a tick run retain their engine order, including zero-damage ticks. */
export function computeStatusPlaybackBatches(events: GameEvent[]) {
  const leaders = new Map<number, StatusPlaybackBatch>();
  const members = new Set<number>();
  for (let i = 0; i < events.length; i++) {
    const first = events[i];
    if (first.type !== 'status-apply' && first.type !== 'status-tick' && first.type !== 'status-expire') continue;
    const kind = first.type === 'status-apply' ? 'apply' : 'tick';
    let j = i;
    const rows: StatusPlaybackBatch['events'] = [];
    while (j < events.length) {
      const event = events[j];
      if (kind === 'apply' ? event.type !== 'status-apply'
        : event.type !== 'status-tick' && event.type !== 'status-expire') break;
      rows.push({ index: j, event: event as StatusEvent });
      if (j !== i) members.add(j);
      j++;
    }
    const targets = new Map<number, typeof rows>();
    for (const row of rows) {
      const group = targets.get(row.event.targetId) ?? [];
      group.push(row); targets.set(row.event.targetId, group);
    }
    let audioUsed = false;
    let duration = .12;
    for (const group of targets.values()) {
      const feedbackRows = group.filter(row => row.event.type !== 'status-expire');
      const ids = [...new Set(feedbackRows.map(row => row.event.statusId))];
      const damage = feedbackRows.reduce((sum, row) => sum + (row.event.type === 'status-tick' ? Math.max(0, (row.event.damage ?? 0) + (row.event.armorDamage ?? 0)) : 0), 0);
      for (let k = 0; k < feedbackRows.length; k++) {
        const playAudio: boolean = kind === 'apply' && k === 0 && !audioUsed;
        feedbackRows[k].feedback = { show: k === 0, statusIds: ids, damage, playAudio };
        audioUsed ||= playAudio;
      }
      if (kind === 'apply' ? ids.some(id => ['poison', 'burning', 'frozen', 'stun'].includes(id)) : damage > 0) duration = .32;
    }
    leaders.set(i, { events: rows, targetIds: [...targets.keys()], duration });
    i = j - 1;
  }
  return { leaders, members };
}

/** One short flash per card, not one heavyweight strip per state. */
export function statusFeedbackFX(ids: string[]): 'poison_flash' | 'burning_flash' | 'frozen_flash' | undefined {
  if (ids.includes('burning')) return 'burning_flash';
  if (ids.includes('poison')) return 'poison_flash';
  if (ids.includes('frozen') || ids.includes('stun')) return 'frozen_flash';
  return undefined;
}

/** Keep simultaneous state feedback legible on a narrow card; every badge remains individual. */
export function statusFeedbackLabel(ids: string[], labelOf: (id: string) => string): string {
  if (ids.length <= 2) return ids.map(labelOf).join(' / ');
  return `${labelOf(ids[0])}等${ids.length}种状态`;
}
